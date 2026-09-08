// @vitest-environment node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encodePreparedReleaseJournal } from '../scripts/local-release-recovery-journal.mjs';
import { recoverPreparedReleaseTransaction, recoverPreparedReleaseTransactionUnderLock } from '../scripts/local-release-transaction-recovery.mjs';
import { acquirePreparedReleaseCandidateLock } from '../scripts/local-release-candidate-lock.mjs';

const supported = process.platform === 'linux' && process.arch === 'x64'
  && process.getuid?.() === 1000 && process.versions.node === '22.22.3';
const transactionId = '1'.repeat(32);
const paths = ['scripts/genesis002_module_bindings/a.ts', 'scripts/genesis002_module_bindings/b.ts',
  'scripts/genesis002_module_bindings/c.ts'];
const g001 = 'scripts/genesis001_module_bindings/index.ts';
const childPath = resolve('tests/fixtures/localReleaseTransactionRecoveryChild.mjs');

it.skipIf(supported)('rejects native recovery on an unsupported host', () => {
  expect(() => recoverPreparedReleaseTransaction('/absent', transactionId)).toThrow('LOCAL_RELEASE_LOCK_HOST_INVALID');
});

describe.skipIf(!supported)('native prepared release rollback', () => {
  let root: string;
  let transactionRoot: string;
  const fact = (path: string) => {
    const status = lstatSync(path, { bigint: true });
    return { dev: String(status.dev), ino: String(status.ino), uid: 1000, mode: Number(status.mode & 0o777n),
      size: Number(status.size), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
  };
  const git = (...args: string[]) => {
    const result = spawnSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root, env: { PATH: '/usr/bin:/bin', HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      encoding: 'utf8', timeout: 8000, maxBuffer: 4096,
    });
    if (result.status !== 0) throw new Error('fixture git failed');
    return result.stdout.trim();
  };
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-native-recovery-')));
    chmodSync(root, 0o700);
    for (const path of [paths[0], paths[2], g001]) {
      mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
      writeFileSync(join(root, path), `old:${path}`, { mode: 0o644 });
    }
    git('init', '-q', '--template='); git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'baseline');
    transactionRoot = join(root, '.git', 'warpkeep-release-assembly-v1', transactionId);
    mkdirSync(transactionRoot, { recursive: true, mode: 0o700 });
    const entries = paths.map((path, index) => {
      const target = join(root, path);
      let before = null;
      if (existsSync(target)) {
        const saved = join(transactionRoot, `old-${index}`);
        copyFileSync(target, saved); chmodSync(saved, 0o644);
        before = { target: fact(target), backup: fact(saved) };
      }
      const stage = join(transactionRoot, `new-${index}`);
      writeFileSync(stage, `new:${path}`, { mode: 0o644 });
      return { path, before, after: fact(stage) };
    });
    const status = lstatSync(root, { bigint: true });
    writeFileSync(join(transactionRoot, 'journal.json'), encodePreparedReleaseJournal({ schemaVersion: 1,
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1', transactionId,
      sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'),
      candidate: { dev: String(status.dev), ino: String(status.ino), uid: 1000, mode: 448 }, entries,
    }), { mode: 0o600 });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: false }); });
  const publish = (count: number) => {
    for (let index = 0; index < count; index += 1) renameSync(join(transactionRoot, `new-${index}`), join(root, paths[index]));
  };
  const expectRestored = () => {
    expect(readFileSync(join(root, paths[0]), 'utf8')).toBe(`old:${paths[0]}`);
    expect(existsSync(join(root, paths[1]))).toBe(false);
    expect(readFileSync(join(root, paths[2]), 'utf8')).toBe(`old:${paths[2]}`);
    expect(readFileSync(join(root, g001), 'utf8')).toBe(`old:${g001}`);
    expect(readdirSync(transactionRoot).sort()).toEqual(['journal.json', 'rolled-back.json']);
  };
  it('rejects malformed transaction IDs before creating a candidate lock', () => {
    expect(() => recoverPreparedReleaseTransaction(root, '../invalid')).toThrow('LOCAL_RELEASE_TRANSACTION_RECOVERY_INVALID');
    expect(existsSync(join(root, '.git', 'warpkeep-release-assembly.lock'))).toBe(false);
  });
  it.each([0, 1, 2, 3])('restores %i published targets and converges on restart', count => {
    publish(count);
    expect(recoverPreparedReleaseTransaction(root, transactionId)).toEqual({ status: 'rolled-back', transactionId });
    expectRestored();
    recoverPreparedReleaseTransaction(root, transactionId); expectRestored();
  });
  it('keeps the genuine operating lease held through successful recovery', () => {
    publish(3);
    const lease = acquirePreparedReleaseCandidateLock(root);
    try {
      expect(recoverPreparedReleaseTransactionUnderLock(root, transactionId, lease)).toEqual({ status: 'rolled-back', transactionId });
      expectRestored();
      expect(() => acquirePreparedReleaseCandidateLock(root)).toThrow('LOCAL_RELEASE_LOCK_BUSY');
      expect(() => lease.assertActive()).not.toThrow();
    } finally { lease.release(); }
    const next = acquirePreparedReleaseCandidateLock(root); next.release();
  });
  it('keeps the operating lease held after rejection and preserves unexpected bytes', () => {
    publish(3); writeFileSync(join(root, paths[2]), 'unrelated user change');
    const lease = acquirePreparedReleaseCandidateLock(root);
    try {
      expect(() => recoverPreparedReleaseTransactionUnderLock(root, transactionId, lease)).toThrow();
      expect(() => acquirePreparedReleaseCandidateLock(root)).toThrow('LOCAL_RELEASE_LOCK_BUSY');
      expect(readFileSync(join(root, paths[2]), 'utf8')).toBe('unrelated user change');
    } finally { lease.release(); }
  });
  it('rejects a duck-typed operating lease before touching targets', () => {
    publish(3);
    expect(() => recoverPreparedReleaseTransactionUnderLock(root, transactionId,
      { assertActive() {}, release() {} })).toThrow('LOCAL_RELEASE_LOCK_CAPABILITY_INVALID');
    expect(readFileSync(join(root, paths[0]), 'utf8')).toBe(`new:${paths[0]}`);
  });
  it('leaves all targets untouched when a late target was edited', () => {
    publish(3); writeFileSync(join(root, paths[2]), 'user-edit');
    expect(() => recoverPreparedReleaseTransaction(root, transactionId)).toThrow();
    expect(readFileSync(join(root, paths[0]), 'utf8')).toBe(`new:${paths[0]}`);
    expect(readFileSync(join(root, paths[2]), 'utf8')).toBe('user-edit');
    expect(existsSync(join(transactionRoot, 'old-0'))).toBe(true);
  });
  it.each(['unknown', 'source', 'journal', 'pending'])('preserves targets on invalid %s', kind => {
    publish(3);
    if (kind === 'unknown') writeFileSync(join(transactionRoot, 'unexpected'), 'preserve');
    if (kind === 'source') git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'changed');
    if (kind === 'journal') writeFileSync(join(transactionRoot, 'journal.json'), '{}\n');
    if (kind === 'pending') writeFileSync(join(transactionRoot, 'rolled-back.pending'), 'partial', { mode: 0o600 });
    expect(() => recoverPreparedReleaseTransaction(root, transactionId)).toThrow();
    expect(readFileSync(join(root, paths[0]), 'utf8')).toBe(`new:${paths[0]}`);
  });
  it.each([['renameSync', 1], ['renameSync', 2], ['renameSync', 3], ['unlinkSync', 1]] as const)(
    'resumes after actual child death following %s #%i', (operation, occurrence) => {
      renameSync(join(transactionRoot, 'new-0'), join(root, paths[0]));
      renameSync(join(transactionRoot, 'new-2'), join(root, paths[2]));
      const result = spawnSync(process.execPath, [childPath, root, transactionId, operation, String(occurrence)], {
        encoding: 'utf8', timeout: 10000, maxBuffer: 4096,
      });
      expect(result.signal).toBe('SIGKILL');
      recoverPreparedReleaseTransaction(root, transactionId); expectRestored();
    },
  );
  it('stops cleanup if its terminal inode is replaced with identical bytes', () => {
    const result = spawnSync(process.execPath, [childPath, root, transactionId, 'replace-terminal', '1'], {
      encoding: 'utf8', timeout: 10000, maxBuffer: 4096,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('LOCAL_RELEASE_TRANSACTION_RECOVERY_INVALID\n');
    expect(existsSync(join(transactionRoot, 'new-0'))).toBe(true);
    expect(readFileSync(join(root, paths[0]), 'utf8')).toBe(`old:${paths[0]}`);
  });
  it('resumes a complete pending terminal after child death before its rename', () => {
    publish(3);
    const killed = spawnSync(process.execPath, [childPath, root, transactionId, 'kill-pending'], {
      encoding: 'utf8', timeout: 10000, maxBuffer: 4096,
    });
    expect(killed.signal).toBe('SIGKILL');
    expect(existsSync(join(transactionRoot, 'rolled-back.pending'))).toBe(true);
    expect(existsSync(join(transactionRoot, 'rolled-back.json'))).toBe(false);
    recoverPreparedReleaseTransaction(root, transactionId);
    expectRestored();
  });
  it.each([['renameSync', 3], ['unlinkSync', 1]] as const)(
    'syncs the terminal directory on restart after %s #%i before cleanup or success', (operation, occurrence) => {
      renameSync(join(transactionRoot, 'new-0'), join(root, paths[0]));
      renameSync(join(transactionRoot, 'new-2'), join(root, paths[2]));
      const killed = spawnSync(process.execPath, [childPath, root, transactionId, operation, String(occurrence)], {
        encoding: 'utf8', timeout: 10000, maxBuffer: 4096,
      });
      expect(killed.signal).toBe('SIGKILL');
      const resumed = spawnSync(process.execPath, [childPath, root, transactionId, 'audit-sync'], {
        encoding: 'utf8', timeout: 10000, maxBuffer: 4096,
      });
      expect(resumed.status).toBe(0);
      const lines = resumed.stdout.trim().split('\n');
      expect(lines[0]).toBe('TX_SYNC');
      expect(lines.at(-2)).toBe('TX_SYNC');
      expectRestored();
    },
  );
});
