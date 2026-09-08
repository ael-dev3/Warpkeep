// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPreparedReleaseTransaction } from '../scripts/local-release-transaction-install.mjs';

const runtimeRoot = '/home/warpkeep/.warpkeep/release-preparation-v1';
const runs = `${runtimeRoot}/runs`;
const node = `${runtimeRoot}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const supported = process.platform === 'linux' && process.arch === 'x64'
  && process.getuid?.() === 1000 && process.versions.node === '22.22.3';
const profile = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const replaced = 'scripts/genesis002_module_bindings/a.ts';
const created = 'spacetimedb/ptr/generated-bindings/b.ts';
const g001 = 'scripts/genesis001_module_bindings/index.ts';
const markerNames = ['prepared-source.json', 'prepared-source.pending', 'prepared-source.history.json'] as const;
const cliPath = resolve('scripts/local-release-assembler.mjs');
const childPath = resolve('tests/fixtures/localReleaseAssemblerRecoveryChild.mjs');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe.skipIf(!supported)('native assembler recover command with real installer journals', () => {
  let handle: string;
  let operationRoot: string;
  let operationInode: bigint;
  let sourceRoot: string;
  let candidateRoot: string;
  let sourceCommit: string;
  let sourceTree: string;
  let transactionId: string;
  let transactionRoot: string;
  let journalBytes: Buffer;
  let markerBytes: Buffer;

  function git(root: string, ...args: string[]) {
    const result = spawnSync('/usr/bin/git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null',
      '-c', 'user.name=Recovery fixture', '-c', 'user.email=fixture@invalid.example', ...args], {
      cwd: root, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      encoding: 'utf8', timeout: 10000, maxBuffer: 4096,
    });
    if (result.status !== 0 || result.error) throw new Error(`fixture Git failed: ${result.stderr}`);
    return result.stdout.trim();
  }
  function put(root: string, path: string, body: string | Buffer) {
    mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
    writeFileSync(join(root, path), body, { mode: 0o644 });
  }
  function marker(name: typeof markerNames[number], bytes = markerBytes) {
    const path = join(operationRoot, name);
    writeFileSync(path, bytes, { mode: 0o600 });
    return path;
  }
  function run(mode?: 'audit-sync' | 'kill-history-rename') {
    // A normal pinned-Node child is necessary: Vitest's own execArgv must never
    // be allowed through the operating assembler's fixed host guard.
    return spawnSync(node, mode ? [childPath, handle, mode] : [cliPath, 'recover', handle], {
      cwd: resolve('.'), env: { PATH: `${dirname(node)}:/usr/bin:/bin`, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' },
      encoding: 'utf8', timeout: 15000, maxBuffer: 16384,
    });
  }
  function succeeded(result: ReturnType<typeof run>) {
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    const lines = result.stdout.trim().split('\n');
    expect(JSON.parse(lines.at(-1)!)).toEqual({ status: 'rolled-back', transactionId, handle,
      sourceCommit, sourceTree, finalReleasePrepared: false });
    return lines.slice(0, -1);
  }
  function restored() {
    expect(readFileSync(join(candidateRoot, replaced), 'utf8')).toBe(`old:${replaced}`);
    expect(existsSync(join(candidateRoot, created))).toBe(false);
    expect(readFileSync(join(candidateRoot, g001))).toEqual(readFileSync(join(sourceRoot, g001)));
    expect(readFileSync(join(transactionRoot, 'journal.json'))).toEqual(journalBytes);
    expect(readdirSync(transactionRoot).sort()).toEqual(['journal.json', 'rolled-back.json']);
  }
  function stillInstalled() {
    expect(readFileSync(join(candidateRoot, replaced), 'utf8')).toBe(`new:${replaced}`);
    expect(readFileSync(join(candidateRoot, created), 'utf8')).toBe(`new:${created}`);
    expect(readFileSync(join(candidateRoot, g001))).toEqual(readFileSync(join(sourceRoot, g001)));
    expect(readFileSync(join(transactionRoot, 'journal.json'))).toEqual(journalBytes);
    expect(readdirSync(transactionRoot).sort()).toEqual(['journal.json', 'old-0']);
  }

  beforeEach(() => {
    const parent = lstatSync(runs, { bigint: true });
    expect(parent.isDirectory() && !parent.isSymbolicLink()).toBe(true);
    expect(parent.uid).toBe(1000n);
    expect(parent.mode & 0o7777n).toBe(0o700n);
    expect(realpathSync(runs)).toBe(runs);
    handle = `release-workspace-${randomBytes(16).toString('hex')}`;
    operationRoot = join(runs, handle);
    mkdirSync(operationRoot, { mode: 0o700 });
    operationInode = lstatSync(operationRoot, { bigint: true }).ino;
    sourceRoot = join(operationRoot, 'source');
    candidateRoot = join(operationRoot, 'candidate');
    mkdirSync(sourceRoot, { mode: 0o700 });
    for (const path of [replaced, g001, 'spacetimedb/ptr/generated-bindings/index.ts']) put(sourceRoot, path, `old:${path}`);
    git(sourceRoot, 'init', '-q', '--template=');
    git(sourceRoot, 'add', '.');
    git(sourceRoot, 'commit', '-qm', 'Synthetic recovery baseline');
    sourceCommit = git(sourceRoot, 'rev-parse', 'HEAD');
    sourceTree = git(sourceRoot, 'rev-parse', 'HEAD^{tree}');
    git(operationRoot, 'clone', '-q', '--no-local', sourceRoot, candidateRoot);
    chmodSync(candidateRoot, 0o700);
    const files = [replaced, created].map(path => ({ path, bytes: Buffer.from(`new:${path}`) }));
    const installed = installPreparedReleaseTransaction({ candidateRoot, sourceCommit, sourceTree, files });
    expect(installed.status).toBe('installed-unverified');
    transactionId = installed.transactionId;
    transactionRoot = join(candidateRoot, '.git', 'warpkeep-release-assembly-v1', transactionId);
    journalBytes = readFileSync(join(transactionRoot, 'journal.json'));
    // This is a synthetic recovery-marker fixture bound to an actual installer
    // journal. It is not evidence that compilation or prepare/check ran.
    markerBytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, profile, status: 'prepared-source-candidate',
      sourceCommit, sourceTree, transactionId, journalSha256: hash(journalBytes), finalReleasePrepared: false })}\n`);
  });
  afterEach(() => {
    if (!operationRoot || !existsSync(operationRoot)) return;
    // Only this test's exclusively created native operation may be removed.
    expect(/^release-workspace-[a-f0-9]{32}$/u.test(handle)).toBe(true);
    expect(dirname(operationRoot)).toBe(runs);
    expect(realpathSync(operationRoot)).toBe(operationRoot);
    const current = lstatSync(operationRoot, { bigint: true });
    expect(current.ino).toBe(operationInode);
    expect(current.uid).toBe(1000n);
    expect(current.isDirectory() && !current.isSymbolicLink()).toBe(true);
    rmSync(operationRoot, { recursive: true, force: false });
    operationRoot = '';
  });

  it.each(['prepared-source.json', 'prepared-source.pending'] as const)('archives %s after rollback with the operating lease still held', name => {
    const original = marker(name);
    const before = lstatSync(original, { bigint: true });
    const audit = succeeded(run('audit-sync'));
    restored();
    expect(audit).toContain('LEASE_HELD');
    expect(audit.indexOf('HISTORY_FILE_SYNC')).toBeGreaterThan(audit.indexOf('LEASE_HELD'));
    expect(audit.indexOf('OPERATION_SYNC')).toBeGreaterThan(audit.indexOf('HISTORY_FILE_SYNC'));
    expect(existsSync(join(operationRoot, 'prepared-source.json'))).toBe(false);
    expect(existsSync(join(operationRoot, 'prepared-source.pending'))).toBe(false);
    expect(readFileSync(join(operationRoot, 'prepared-source.history.json'))).toEqual(markerBytes);
    expect(lstatSync(join(operationRoot, 'prepared-source.history.json'), { bigint: true }).ino).toBe(before.ino);
  });

  it('re-syncs existing history and converges without changing its bytes or inode', () => {
    marker('prepared-source.json');
    succeeded(run());
    const history = join(operationRoot, 'prepared-source.history.json');
    const before = lstatSync(history, { bigint: true });
    const audit = succeeded(run('audit-sync'));
    expect(audit).toEqual(['HISTORY_FILE_SYNC', 'OPERATION_SYNC']);
    restored();
    expect(readFileSync(history)).toEqual(markerBytes);
    const after = lstatSync(history, { bigint: true });
    expect([after.ino, after.mtimeNs]).toEqual([before.ino, before.mtimeNs]);
  });

  it('re-establishes history durability after actual child death between rename and fsync', () => {
    marker('prepared-source.json');
    const killed = run('kill-history-rename');
    expect(killed.signal).toBe('SIGKILL');
    restored();
    expect(readFileSync(join(operationRoot, 'prepared-source.history.json'))).toEqual(markerBytes);
    expect(succeeded(run('audit-sync'))).toEqual(['HISTORY_FILE_SYNC', 'OPERATION_SYNC']);
    restored();
  });

  it('rolls back an installed unverified transaction with no completion marker', () => {
    succeeded(run());
    restored();
    expect(markerNames.filter(name => existsSync(join(operationRoot, name)))).toEqual([]);
  });

  it.each(['partial', 'wrong-journal', 'wrong-source', 'release-claim'])('rejects an invalid %s marker before touching installed bytes', kind => {
    const value = JSON.parse(markerBytes.toString());
    if (kind === 'wrong-journal') value.journalSha256 = '0'.repeat(64);
    if (kind === 'wrong-source') value.sourceCommit = '0'.repeat(40);
    if (kind === 'release-claim') value.finalReleasePrepared = true;
    const invalid = kind === 'partial' ? Buffer.from('{"schemaVersion":') : Buffer.from(`${JSON.stringify(value)}\n`);
    const path = marker('prepared-source.pending', invalid);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^LOCAL_RELEASE_ASSEMBLER_(?:COMPLETION_INVALID|FAILED)\n$/u);
    stillInstalled();
    expect(readFileSync(path)).toEqual(invalid);
  });

  it.each([
    ['prepared-source.json', 'prepared-source.pending'],
    ['prepared-source.json', 'prepared-source.history.json'],
    ['prepared-source.pending', 'prepared-source.history.json'],
  ] as const)('rejects ambiguous markers %s and %s before rollback', (first, second) => {
    marker(first); marker(second);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('LOCAL_RELEASE_ASSEMBLER_COMPLETION_AMBIGUOUS\n');
    stillInstalled();
    expect(readFileSync(join(operationRoot, first))).toEqual(markerBytes);
    expect(readFileSync(join(operationRoot, second))).toEqual(markerBytes);
  });

  it('preserves an unexpected user edit to an output and does not archive its completion marker', () => {
    marker('prepared-source.json');
    writeFileSync(join(candidateRoot, created), 'user output must survive');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('LOCAL_RELEASE_TRANSACTION_RECOVERY_INVALID\n');
    expect(readFileSync(join(candidateRoot, replaced), 'utf8')).toBe(`new:${replaced}`);
    expect(readFileSync(join(candidateRoot, created), 'utf8')).toBe('user output must survive');
    expect(readFileSync(join(candidateRoot, g001))).toEqual(readFileSync(join(sourceRoot, g001)));
    expect(readFileSync(join(operationRoot, 'prepared-source.json'))).toEqual(markerBytes);
    expect(existsSync(join(operationRoot, 'prepared-source.history.json'))).toBe(false);
  });

  it('preserves an unrelated user file while restoring only recorded generated outputs', () => {
    const path = 'docs/user-note.txt';
    put(candidateRoot, path, 'unrelated user content');
    succeeded(run());
    restored();
    expect(readFileSync(join(candidateRoot, path), 'utf8')).toBe('unrelated user content');
  });
});
