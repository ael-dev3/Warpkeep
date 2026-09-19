import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// A separate native process uses actual private directories, Git objects and
// cross-namespace module imports. Only the fixed Git transport is redirected to
// an owned public fixture; production never accepts a repository override.
const nativeMaterializationScript = String.raw`
import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [modulePath, scenario] = process.argv.slice(2);
assert.equal(process.platform, 'linux');
const root = mkdtempSync('/tmp/warpkeep-recovery-materialize-');
chmodSync(root, 0o700);
const repository = join(root, 'repository.git');
const destination = join(root, 'materialized');
mkdirSync(destination, { mode: 0o700 });
const actualSpawn = childProcess.default.spawnSync;
const environment = { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2001-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2001-01-01T00:00:00Z' };
function git(args, input) {
  const result = actualSpawn('/usr/bin/git', ['--no-replace-objects', '--git-dir', repository, ...args],
    { input, env: environment, encoding: null });
  assert.equal(result.status, 0, result.stderr?.toString());
  assert.equal(result.stderr.length, 0, result.stderr.toString());
  return result.stdout.toString().trim();
}
let redirectedReads = 0;
try {
  git(['init', '--bare', '--quiet']);
  const blob = body => git(['hash-object', '-w', '--stdin'], body);
  const tree = entries => git(['mktree'], entries.join('\n') + '\n');
  const mainBody = scenario === 'legacy'
    ? 'export const value = 17;\n'
    : 'import { sharedValue } from "../../gameplay04/policy.mjs"; export const value = sharedValue;\n';
  const policyBody = 'export const sharedValue = 29;\n';
  const policyBlob = blob(policyBody);
  const policyTree = tree(['100644 blob ' + policyBlob + '\tpolicy.mjs']);
  const ptrSrcTree = tree(['100644 blob ' + blob(mainBody) + '\tindex.mjs']);
  const ptrTree = tree(['040000 tree ' + ptrSrcTree + '\tsrc']);
  const names = ['040000 tree ' + ptrTree + '\tptr'];
  if (scenario === 'shared' || scenario === 'missing-object') names.push('040000 tree ' + policyTree + '\tgameplay04');
  if (scenario === 'symlink') names.push('120000 blob ' + blob('../outside') + '\tgameplay04');
  names.push('040000 tree ' + policyTree + '\tgameplay04-shadow');
  const rootTree = tree(['040000 tree ' + tree(names) + '\tspacetimedb']);
  const commit = git(['commit-tree', rootTree, '-m', 'Public materialization fixture']);
  // An untracked working file beside the object database must never become source.
  mkdirSync(join(repository, 'spacetimedb/gameplay04'), { recursive: true });
  writeFileSync(join(repository, 'spacetimedb/gameplay04/untracked.mjs'), 'throw new Error("untracked");\n');
  if (scenario === 'missing-object') unlinkSync(join(repository, 'objects', policyBlob.slice(0, 2), policyBlob.slice(2)));
  childProcess.default.spawnSync = (executable, args, options) => {
    assert.equal(executable, '/usr/bin/git');
    assert.deepEqual(args.slice(0, 3), ['--no-replace-objects', '--git-dir', '/var/lib/warpkeep/release-recovery-v1/source-caches/repository.git']);
    assert.ok(['rev-parse', 'ls-tree', 'cat-file'].includes(args[3]));
    redirectedReads++;
    return actualSpawn(executable, [...args.slice(0, 2), repository, ...args.slice(3)], options);
  };
  syncBuiltinESMExports();
  const { materializeCommit } = await import(pathToFileURL(modulePath).href);
  assert.equal(typeof materializeCommit, 'function');
  assert.throws(() => materializeCommit(commit, ptrTree, 'spacetimedb/gameplay04', destination, 'ptr'));
  assert.throws(() => materializeCommit(commit, ptrTree, null, destination, 'g001'));
  assert.throws(() => materializeCommit([commit], ptrTree, 'spacetimedb/ptr', destination, 'ptr'));
  assert.throws(() => materializeCommit(commit, [ptrTree], 'spacetimedb/ptr', destination, 'ptr'));
  assert.equal(redirectedReads, 0);
  if (scenario === 'symlink' || scenario === 'missing-object') {
    assert.throws(() => materializeCommit(commit, ptrTree, 'spacetimedb/ptr', destination, 'ptr'));
  } else {
    materializeCommit(commit, ptrTree, 'spacetimedb/ptr', destination, 'ptr');
    assert.equal(readFileSync(join(destination, 'spacetimedb/ptr/src/index.mjs'), 'utf8'), mainBody);
    assert.equal(existsSync(join(destination, 'spacetimedb/gameplay04-shadow')), false);
    assert.equal(existsSync(join(destination, 'spacetimedb/gameplay04/untracked.mjs')), false);
    const entry = pathToFileURL(join(destination, 'spacetimedb/ptr/src/index.mjs')).href;
    if (scenario === 'missing-namespace') await assert.rejects(import(entry), { code: 'ERR_MODULE_NOT_FOUND' });
    else assert.equal((await import(entry)).value, scenario === 'legacy' ? 17 : 29);
    if (scenario === 'shared') assert.equal(readFileSync(join(destination, 'spacetimedb/gameplay04/policy.mjs'), 'utf8'), policyBody);
  }
  process.stdout.write('MATERIALIZATION_VERIFIED\n');
} finally {
  childProcess.default.spawnSync = actualSpawn;
  syncBuiltinESMExports();
  assert.match(root, /^\/tmp\/warpkeep-recovery-materialize-[A-Za-z0-9]+$/);
  assert.equal(realpathSync(root), root);
  rmSync(root, { recursive: true, force: false });
}
`

describe('release recovery WSL materializer response bounds', () => {
  it('does not execute the fixed guest entrypoint when imported for validation', async () => {
    const priorExitCode = process.exitCode
    process.exitCode = undefined
    try {
      vi.resetModules()
      await import('../scripts/release-recovery-wsl-materialize.mjs')
      expect(process.exitCode).toBeUndefined()
    } finally {
      process.exitCode = priorExitCode
    }
  })

  it('cancels while streaming when the next chunk crosses the byte limit', async () => {
    const priorExitCode = process.exitCode
    process.exitCode = undefined
    const materializer = await import('../scripts/release-recovery-wsl-materialize.mjs') as any
    process.exitCode = priorExitCode

    expect(typeof materializer.readBoundedResponse).toBe('function')
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: Uint8Array.of(1, 2, 3) })
      .mockResolvedValueOnce({ done: false, value: Uint8Array.of(4, 5, 6) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(1_000_000) })
    const cancel = vi.fn().mockResolvedValue(undefined)
    const releaseLock = vi.fn()
    const arrayBuffer = vi.fn(() => {
      throw new Error('whole-body allocation must not run')
    })
    const response = {
      url: 'http://127.0.0.1:12345/v1/identity',
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
      body: { getReader: () => ({ read, cancel, releaseLock }) },
      arrayBuffer,
    }

    await expect(materializer.readBoundedResponse(
      response,
      'http://127.0.0.1:12345/v1/identity',
      5,
    )).rejects.toBeInstanceOf(Error)
    expect(read).toHaveBeenCalledTimes(2)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(releaseLock).toHaveBeenCalledTimes(1)
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('derives Keccak-256 locally without an unauthenticated cache module', async () => {
    const materializer = await import('../scripts/release-recovery-wsl-materialize.mjs') as any
    expect(Buffer.from(materializer.keccak256Bytes(new Uint8Array())).toString('hex'))
      .toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
    expect(Buffer.from(materializer.keccak256Bytes(Buffer.from('abc'))).toString('hex'))
      .toBe('4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45')
  })

  it.skipIf(process.platform !== 'linux').each([
    ['shared', 'resolves PTR imports from the exact committed shared gameplay namespace'],
    ['legacy', 'retains historical PTR source that predates the shared namespace'],
    ['missing-namespace', 'cannot substitute an alias or untracked files for omitted shared source'],
    ['symlink', 'rejects a shared namespace represented by a symbolic link'],
    ['missing-object', 'rejects shared source whose authenticated Git blob is unavailable'],
  ])('%s: %s', (scenario) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', nativeMaterializationScript, 'materialization-fixture',
      fileURLToPath(new URL('../scripts/release-recovery-wsl-materialize.mjs', import.meta.url)), scenario],
    { encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 })
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('MATERIALIZATION_VERIFIED\n')
  })
})
