import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, rmSync, statfsSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquirePreparedReleaseCandidateLock } from '../scripts/local-release-candidate-lock.mjs';

const supported = process.platform === 'linux' && process.arch === 'x64'
  && process.getuid?.() === 1000 && process.versions.node === '22.22.3';
const childFile = resolve('tests/fixtures/localReleaseCandidateLockChild.mjs');
const lockName = 'warpkeep-release-assembly.lock';

it.skipIf(supported)('rejects unsupported hosts before touching a candidate', () => {
  expect(() => acquirePreparedReleaseCandidateLock('/not-a-candidate'))
    .toThrow('LOCAL_RELEASE_LOCK_HOST_INVALID');
});

describe.skipIf(!supported)('native release candidate lock', () => {
  let root: string;
  let candidate: string;
  let lockPath: string;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-release-lock-test-')));
    candidate = join(root, 'candidate');
    mkdirSync(candidate, { mode: 0o700 });
    chmodSync(candidate, 0o700);
    mkdirSync(join(candidate, '.git'), { mode: 0o700 });
    lockPath = join(candidate, '.git', lockName);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: false }); });
  const probe = (directory: string) => spawnSync(process.execPath, [childFile, directory], {
    encoding: 'utf8', timeout: 8000, maxBuffer: 4096,
  });

  it('holds the kernel lock after helper exit and releases the same permanent inode', () => {
    const lock = acquirePreparedReleaseCandidateLock(candidate);
    try {
      lock.assertActive();
      const initial = lstatSync(lockPath);
      const busy = probe(candidate);
      expect(busy.status).toBe(1);
      expect(busy.stdout).toBe('LOCAL_RELEASE_LOCK_BUSY\n');
      expect(busy.stderr).toBe('');
      lock.release();
      lock.release();
      expect(() => lock.assertActive()).toThrow('LOCAL_RELEASE_LOCK_RELEASED');
      const next = probe(candidate);
      expect(next.status).toBe(0);
      expect(next.stdout).toBe('ACQUIRED\n');
      expect(lstatSync(lockPath).ino).toBe(initial.ino);
      expect(readFileSync(lockPath)).toHaveLength(0);
    } finally { lock.release(); }
  });

  it('releases the actual kernel lock after its owning child is killed', async () => {
    const child = spawn(process.execPath, [childFile, candidate, 'hold'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let ready = '';
    try {
      await new Promise<void>((accept, reject) => {
        const timeout = setTimeout(() => reject(new Error('child readiness timeout')), 8000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.stdout.on('data', bytes => {
          ready += String(bytes);
          if (ready === 'READY\n') { clearTimeout(timeout); accept(); }
          else if (ready.includes('\n')) { clearTimeout(timeout); reject(new Error(`child failed: ${ready}`)); }
        });
      });
      expect(probe(candidate).stdout).toBe('LOCAL_RELEASE_LOCK_BUSY\n');
      const exited = new Promise<void>((accept, reject) => {
        const timeout = setTimeout(() => reject(new Error('owned child exit timeout')), 8000);
        child.once('exit', (_code, signal) => {
          clearTimeout(timeout);
          if (signal === 'SIGKILL') accept(); else reject(new Error('unexpected child exit'));
        });
      });
      child.kill('SIGKILL');
      await exited;
      expect(probe(candidate).stdout).toBe('ACQUIRED\n');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise<void>((accept, reject) => {
          const timeout = setTimeout(() => reject(new Error('owned child cleanup timeout')), 8000);
          child.once('exit', () => { clearTimeout(timeout); accept(); });
        });
        child.kill('SIGKILL');
        await closed;
      }
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
  }, 20000);

  it.each(['root-mode', 'git-mode', 'git-symlink', 'root-symlink', 'lock-symlink', 'lock-mode', 'lock-content', 'lock-hardlink'])(
    'rejects unsafe %s without changing existing evidence', kind => {
      let input = candidate;
      if (kind === 'root-mode') chmodSync(candidate, 0o755);
      if (kind === 'git-mode') chmodSync(join(candidate, '.git'), 0o777);
      if (kind === 'git-symlink') {
        renameSync(join(candidate, '.git'), join(root, 'git'));
        symlinkSync(join(root, 'git'), join(candidate, '.git'));
      }
      if (kind === 'root-symlink') { input = join(root, 'alias'); symlinkSync(candidate, input); }
      if (kind === 'lock-symlink') {
        writeFileSync(join(root, 'external'), 'preserve', { mode: 0o600 });
        symlinkSync(join(root, 'external'), lockPath);
      }
      if (kind === 'lock-mode') writeFileSync(lockPath, '', { mode: 0o644 });
      if (kind === 'lock-content') writeFileSync(lockPath, 'preserve', { mode: 0o600 });
      if (kind === 'lock-hardlink') {
        writeFileSync(join(root, 'external'), '', { mode: 0o600 });
        linkSync(join(root, 'external'), lockPath);
      }
      expect(() => acquirePreparedReleaseCandidateLock(input)).toThrow();
      if (kind === 'lock-content' || kind === 'lock-symlink') expect(readFileSync(lockPath, 'utf8')).toBe('preserve');
    },
  );

  it('detects lock substitution and closes its old descriptor without touching the replacement', () => {
    const lock = acquirePreparedReleaseCandidateLock(candidate);
    const moved = join(candidate, '.git', 'preserved-lock');
    renameSync(lockPath, moved);
    writeFileSync(lockPath, 'replacement', { mode: 0o600 });
    expect(() => lock.assertActive()).toThrow('LOCAL_RELEASE_LOCK_CHANGED');
    expect(() => lock.release()).toThrow('LOCAL_RELEASE_LOCK_CHANGED');
    expect(readFileSync(lockPath, 'utf8')).toBe('replacement');
    expect(() => lock.assertActive()).toThrow('LOCAL_RELEASE_LOCK_RELEASED');
    lock.release();
    renameSync(lockPath, join(candidate, '.git', 'preserved-replacement'));
    renameSync(moved, lockPath);
    expect(probe(candidate).stdout).toBe('ACQUIRED\n');
  });

  it('rejects caller overrides and noncanonical roots', () => {
    expect(() => Reflect.apply(acquirePreparedReleaseCandidateLock, null, [candidate, {}])).toThrow('LOCAL_RELEASE_LOCK_ROOT_INVALID');
    expect(() => acquirePreparedReleaseCandidateLock(`${candidate}/.`)).toThrow('LOCAL_RELEASE_LOCK_ROOT_INVALID');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('sets exact permissions only on its newly created inode under a restrictive umask', () => {
    const result = spawnSync(process.execPath, [childFile, candidate, 'restrictive-umask'], {
      encoding: 'utf8', timeout: 8000, maxBuffer: 4096,
    });
    expect(result.stdout).toBe('ACQUIRED\n');
    expect(result.status).toBe(0);
    expect(lstatSync(lockPath).mode & 0o777).toBe(0o600);
    expect(probe(candidate).stdout).toBe('ACQUIRED\n');
  });

  it.skipIf(!existsSync('/dev/shm'))('rejects a real non-ext4 filesystem before lock creation', () => {
    expect(statfsSync('/dev/shm').type).toBe(0x01021994);
    const memoryRoot = mkdtempSync('/dev/shm/warpkeep-release-lock-test-');
    try {
      chmodSync(memoryRoot, 0o700);
      mkdirSync(join(memoryRoot, '.git'), { mode: 0o700 });
      expect(() => acquirePreparedReleaseCandidateLock(memoryRoot)).toThrow('LOCAL_RELEASE_LOCK_FILESYSTEM_INVALID');
      expect(existsSync(join(memoryRoot, '.git', lockName))).toBe(false);
    } finally { rmSync(memoryRoot, { recursive: true, force: false }); }
  });
});
