// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPreparedReleaseTransaction, installPreparedReleaseTransactionUnderLock } from '../scripts/local-release-transaction-install.mjs';
import { recoverPreparedReleaseTransaction } from '../scripts/local-release-transaction-recovery.mjs';
import { decodePreparedReleaseJournal } from '../scripts/local-release-recovery-journal.mjs';
import { acquirePreparedReleaseCandidateLock } from '../scripts/local-release-candidate-lock.mjs';

const supported = process.platform === 'linux' && process.arch === 'x64'
  && process.getuid?.() === 1000 && process.versions.node === '22.22.3';
const paths = ['scripts/genesis002_module_bindings/a.ts', 'spacetimedb/ptr/generated-bindings/b.ts'];
const g001 = 'scripts/genesis001_module_bindings/index.ts';
const childPath = resolve('tests/fixtures/localReleaseTransactionInstallChild.mjs');
const files = () => paths.map(path => ({ path, bytes: Buffer.from(`new:${path}`) }));

it('rejects unknown output and G001 targets before touching a candidate', () => {
  for (const path of [g001, '../escape', '/absolute', 'scripts/arbitrary.mjs']) {
    expect(() => installPreparedReleaseTransaction({ candidateRoot: '/absent', sourceCommit: 'a'.repeat(40),
      sourceTree: 'b'.repeat(40), files: [{ path, bytes: Buffer.from('x') }] })).toThrow('LOCAL_RELEASE_TRANSACTION_INSTALL_INVALID');
  }
});
it('rejects a forged lease without invoking caller callbacks', () => {
  let calls = 0;
  const fake = { assertActive() { calls += 1; }, release() { calls += 1; } };
  expect(() => installPreparedReleaseTransactionUnderLock({ candidateRoot: '/absent', sourceCommit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40), files: files() }, fake)).toThrow('LOCAL_RELEASE_TRANSACTION_INSTALL_INVALID');
  expect(calls).toBe(0);
});

describe.skipIf(!supported)('native journaled candidate installation', () => {
  let root: string;
  let sourceCommit: string;
  let sourceTree: string;
  const git = (...args: string[]) => {
    const result = spawnSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root, env: { PATH: '/usr/bin:/bin', HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      encoding: 'utf8', timeout: 10000, maxBuffer: 4096,
    });
    if (result.status !== 0) throw new Error('test git failed');
    return result.stdout.trim();
  };
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-native-install-')));
    chmodSync(root, 0o700);
    for (const path of [paths[0], paths[1], g001]) mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
    // Keep the PTR directory in the captured source, but b.ts is newly generated.
    for (const path of [paths[0], g001, 'spacetimedb/ptr/generated-bindings/index.ts']) {
      writeFileSync(join(root, path), `old:${path}`, { mode: 0o644 }); chmodSync(join(root, path), 0o644);
    }
    git('init', '-q', '--template='); git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'baseline');
    sourceCommit = git('rev-parse', 'HEAD'); sourceTree = git('rev-parse', 'HEAD^{tree}');
  });
  afterEach(() => rmSync(root, { recursive: true, force: false }));
  const input = () => ({ candidateRoot: root, sourceCommit, sourceTree, files: files() });
  const restored = () => {
    expect(readFileSync(join(root, paths[0]), 'utf8')).toBe(`old:${paths[0]}`);
    expect(existsSync(join(root, paths[1]))).toBe(false);
    expect(readFileSync(join(root, g001), 'utf8')).toBe(`old:${g001}`);
  };
  it('installs across directories with a durable journal, then restores both replaced and created files', () => {
    const args = input();
    const result = installPreparedReleaseTransaction(args);
    expect(result.status).toBe('installed-unverified');
    const transaction = join(root, '.git', 'warpkeep-release-assembly-v1', result.transactionId);
    const journal = decodePreparedReleaseJournal(readFileSync(join(transaction, 'journal.json')));
    expect(journal.entries.map(entry => entry.path)).toEqual(paths);
    expect(journal.sourceCommit).toBe(sourceCommit);
    expect(readdirSync(transaction).sort()).toEqual(['journal.json', 'old-0']);
    for (const file of args.files) {
      expect(readFileSync(join(root, file.path))).toEqual(file.bytes);
      expect(file.bytes.toString()).toBe(`new:${file.path}`);
    }
    expect(readFileSync(join(root, g001), 'utf8')).toBe(`old:${g001}`);
    recoverPreparedReleaseTransaction(root, result.transactionId); restored();
    recoverPreparedReleaseTransaction(root, result.transactionId); restored();
  });
  it('publishes and rolls back more than the old eight-file directory limit', () => {
    const args = input();
    for (let index = 0; index < 20; index += 1) {
      args.files.push({ path: `scripts/genesis002_module_bindings/generated_${String(index).padStart(2, '0')}.ts`, bytes: Buffer.from('generated') });
    }
    args.files.sort((a, b) => a.path < b.path ? -1 : 1);
    const result = installPreparedReleaseTransaction(args);
    for (const file of args.files) expect(readFileSync(join(root, file.path))).toEqual(file.bytes);
    recoverPreparedReleaseTransaction(root, result.transactionId); restored();
    for (const file of args.files) if (file.path.includes('/generated_')) expect(existsSync(join(root, file.path))).toBe(false);
  });
  it.each(['dirty', 'assume-unchanged', 'source', 'symlink', 'mode', 'unfinished'])('preserves original data on %s', kind => {
    const args = input();
    if (kind === 'dirty' || kind === 'assume-unchanged') {
      writeFileSync(join(root, paths[0]), 'user-edit');
      if (kind === 'assume-unchanged') git('update-index', '--assume-unchanged', paths[0]);
    }
    if (kind === 'source') args.sourceCommit = 'c'.repeat(40);
    if (kind === 'symlink') symlinkSync(join(root, paths[0]), join(root, paths[1]));
    if (kind === 'mode') chmodSync(join(root, paths[0]), 0o600);
    if (kind === 'unfinished') mkdirSync(join(root, '.git', 'warpkeep-release-assembly-v1', 'prior'), { recursive: true, mode: 0o700 });
    const original = readFileSync(join(root, paths[0]));
    expect(() => installPreparedReleaseTransaction(args)).toThrow();
    expect(readFileSync(join(root, paths[0]))).toEqual(original);
    expect(readFileSync(join(root, g001), 'utf8')).toBe(`old:${g001}`);
  });
  it('refuses a concurrent candidate writer without disturbing its lock or targets', () => {
    const held = acquirePreparedReleaseCandidateLock(root);
    try {
      expect(() => installPreparedReleaseTransaction(input())).toThrow();
      held.assertActive(); restored();
      expect(existsSync(join(root, '.git', 'warpkeep-release-assembly-v1'))).toBe(false);
    } finally { held.release(); }
  });
  it('publishes under a genuine existing lease without reacquiring or releasing it', () => {
    const held = acquirePreparedReleaseCandidateLock(root);
    let transactionId: string;
    try {
      transactionId = installPreparedReleaseTransactionUnderLock(input(), held).transactionId;
      held.assertActive();
      expect(() => acquirePreparedReleaseCandidateLock(root)).toThrow('LOCAL_RELEASE_LOCK_BUSY');
      for (const file of files()) expect(readFileSync(join(root, file.path))).toEqual(file.bytes);
    } finally { held.release(); }
    recoverPreparedReleaseTransaction(root, transactionId!); restored();
  });
  it('rejects a genuine lease for a different candidate and a released lease', () => {
    const held = acquirePreparedReleaseCandidateLock(root);
    try {
      expect(() => installPreparedReleaseTransactionUnderLock({ ...input(), candidateRoot: join(root, 'other') }, held)).toThrow();
      held.assertActive(); restored();
    } finally { held.release(); }
    expect(() => installPreparedReleaseTransactionUnderLock(input(), held)).toThrow();
    restored();
  });
  it('keeps a supplied lease held when installation rejects dirty source', () => {
    const held = acquirePreparedReleaseCandidateLock(root);
    try {
      writeFileSync(join(root, paths[0]), 'user-edit');
      expect(() => installPreparedReleaseTransactionUnderLock(input(), held)).toThrow();
      held.assertActive();
      expect(() => acquirePreparedReleaseCandidateLock(root)).toThrow('LOCAL_RELEASE_LOCK_BUSY');
      expect(readFileSync(join(root, paths[0]), 'utf8')).toBe('user-edit');
    } finally { held.release(); }
  });
  it.each(['journal', 'rename-1', 'rename-2'])('recovers after real process death at %s', point => {
    const child = spawnSync(process.execPath, [childPath, root, sourceCommit, sourceTree, point], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 4096,
    });
    expect(child.signal, child.stderr + child.stdout).toBe('SIGKILL');
    const control = join(root, '.git', 'warpkeep-release-assembly-v1');
    const [transactionId] = readdirSync(control);
    expect(readdirSync(control)).toHaveLength(1);
    expect(existsSync(join(control, transactionId, 'journal.json'))).toBe(true);
    recoverPreparedReleaseTransaction(root, transactionId); restored();
  });
  it('stops before overwriting a target created after publication starts, retaining recovery evidence', () => {
    const child = spawnSync(process.execPath, [childPath, root, sourceCommit, sourceTree, 'edit-late'], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 4096,
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toBe('LOCAL_RELEASE_TRANSACTION_INSTALL_INVALID');
    expect(readFileSync(join(root, paths[0]), 'utf8')).toBe(`new:${paths[0]}`);
    expect(readFileSync(join(root, paths[1]), 'utf8')).toBe('user-edit');
    const control = join(root, '.git', 'warpkeep-release-assembly-v1');
    const [transactionId] = readdirSync(control);
    expect(() => recoverPreparedReleaseTransaction(root, transactionId)).toThrow();
    expect(readFileSync(join(root, paths[1]), 'utf8')).toBe('user-edit');
    expect(existsSync(join(control, transactionId, 'old-0'))).toBe(true);
  });
  it.each(['tamper-stage', 'replace-stage'])('rejects %s before journal publication or target replacement', point => {
    const child = spawnSync(process.execPath, [childPath, root, sourceCommit, sourceTree, point], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 4096,
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toBe('LOCAL_RELEASE_TRANSACTION_INSTALL_INVALID');
    restored();
    const control = join(root, '.git', 'warpkeep-release-assembly-v1');
    const [transactionId] = readdirSync(control);
    expect(existsSync(join(control, transactionId, 'journal.json'))).toBe(false);
    expect(() => installPreparedReleaseTransaction(input())).toThrow();
    restored();
  });
});
