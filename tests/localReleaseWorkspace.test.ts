// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const fixedNode = '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node';
const profile = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of ['node:fs', '../scripts/local-binding-bounded-file.mjs',
    '../scripts/local-binding-runtime-core.mjs', '../scripts/local-release-candidate-lock.mjs',
    '../scripts/local-release-transaction-install.mjs']) vi.doUnmock(name);
  vi.resetModules();
});

async function setup() {
  vi.resetModules();
  const state = { sourceDirty: false, rawChanged: false, sourceMode: 0o100644n, rawListing: null as Buffer | null,
    candidateDirty: false, candidateChanged: false,
    released: false, acquired: false, failAfterLock: false, cleanupFails: false, filesystem: 0xef53,
    sourceRoot: '', candidateRoot: '', changedPath: '', created: [] as string[],
    listing: '100644 blob 2e65efe2a145dda7ee51d1741299f848e5bf752e       1\tsource.txt\0' };
  const inodes = new Map<string, bigint>();
  const install = vi.fn((_input: unknown, lease: { assertActive(): void }) => {
    lease.assertActive();
    state.candidateDirty = true;
    return { status: 'installed-unverified' as const, transactionId: '1'.repeat(32) };
  });
  vi.doMock('../scripts/local-release-transaction-install.mjs', () => ({ installPreparedReleaseTransactionUnderLock: install }));
  vi.doMock('node:fs', () => ({
    mkdirSync(path: string) { state.created.push(path); },
    chmodSync() {},
    realpathSync(path: string) { return path; },
    statfsSync() { return { type: state.filesystem }; },
    lstatSync(path: string) {
      if (!inodes.has(path)) inodes.set(path, BigInt(inodes.size + 1));
      return { dev: 1n, ino: inodes.get(path)! + (state.changedPath === path ? 1000n : 0n),
        mode: 0o40700n, uid: 1000n, isDirectory: () => true, isSymbolicLink: () => false };
    },
  }));
  vi.doMock('../scripts/local-binding-bounded-file.mjs', () => ({
    readLocalBindingBoundedFile(path: string) {
      return { body: path === join(state.sourceRoot, 'source.txt') ? Buffer.from(state.rawChanged ? 'b' : 'a') : Buffer.alloc(0),
        identity: { ino: '1', mode: String(state.sourceMode) } };
    },
  }));
  vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
    captureFixedOperationBundleSource({ operationRoot }: { operationRoot: string }) {
      state.sourceRoot = join(operationRoot, 'source');
      return { root: state.sourceRoot, commit: 'a'.repeat(40), tree: 'b'.repeat(40), bootstrap: [],
        materialize(root: string) {
          state.candidateRoot = root;
          return { root, commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
        },
        verify() { if (state.acquired && state.failAfterLock) throw new Error('SOURCE_CHANGED'); },
        verifyMaterialization() { if (state.candidateChanged) throw new Error('CANDIDATE_HEAD_CHANGED'); },
        gitBuffer(root: string, args: string[]) {
          if (root !== state.sourceRoot || args.join(' ') !== `ls-tree -r -l -z ${'b'.repeat(40)}`) throw new Error('UNEXPECTED_GIT');
          return state.rawListing ?? Buffer.from(state.listing);
        },
        git(root: string, args: string[]) {
          if (root === state.sourceRoot && args.join(' ') === `ls-tree -r -l -z ${'b'.repeat(40)}`) {
            return state.listing;
          }
          if (args.join(' ') !== 'status --porcelain=v1 --untracked-files=all') throw new Error('UNEXPECTED_GIT');
          return (root === state.sourceRoot ? state.sourceDirty : state.candidateDirty) ? ' M file' : '';
        },
      };
    },
  }));
  vi.doMock('../scripts/local-release-candidate-lock.mjs', () => ({
    acquirePreparedReleaseCandidateLock() {
      state.acquired = true;
      return { assertActive() { if (state.released) throw new Error('LOCK_RELEASED'); },
        release() { state.released = true; if (state.cleanupFails) throw new Error('CLEANUP_FAILED'); } };
    },
  }));
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  vi.spyOn(process, 'arch', 'get').mockReturnValue('x64');
  vi.spyOn(process, 'execPath', 'get').mockReturnValue(fixedNode);
  vi.spyOn(process, 'execArgv', 'get').mockReturnValue([]);
  vi.stubGlobal('process', new Proxy(process, { get(target, key) {
    if (key === 'getuid') return () => 1000;
    if (key === 'env') return { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
    return Reflect.get(target, key);
  } }));
  const module = await import('../scripts/local-release-workspace.mjs');
  return { state, capture: module.capturePreparedLinuxReleaseWorkspace, install };
}

afterEach(() => vi.unstubAllGlobals());

describe('fixed native release workspace', () => {
  it('installs using captured source coordinates and keeps its lease active for post-install checking', async () => {
    const { state, capture, install } = await setup();
    const workspace = capture();
    const files = [{ path: 'scripts/genesis002_module_bindings/a.ts', bytes: Buffer.from('fixture') }];
    expect(workspace.installOutputs(files)).toEqual({ status: 'installed-unverified', transactionId: '1'.repeat(32) });
    expect(install).toHaveBeenCalledOnce();
    expect(install.mock.calls[0][0]).toEqual({ candidateRoot: workspace.candidateRoot,
      sourceCommit: workspace.sourceCommit, sourceTree: workspace.sourceTree, files });
    expect(state.released).toBe(false);
    workspace.assertActive();
    expect(() => workspace.assertCandidateClean()).toThrow('LOCAL_RELEASE_WORKSPACE_CANDIDATE_DIRTY');
    workspace.release();
    expect(() => workspace.installOutputs(files)).toThrow('LOCAL_RELEASE_WORKSPACE_RELEASED');
    expect(install).toHaveBeenCalledOnce();
  });

  it('rejects a dirty candidate before calling the installer', async () => {
    const { state, capture, install } = await setup();
    const workspace = capture(); state.candidateDirty = true;
    expect(() => workspace.installOutputs([])).toThrow('LOCAL_RELEASE_WORKSPACE_CANDIDATE_DIRTY');
    expect(install).not.toHaveBeenCalled();
    workspace.release();
  });

  it('does not return installation success if the captured source changed during installation', async () => {
    const { state, capture, install } = await setup();
    const workspace = capture();
    install.mockImplementation(() => {
      state.rawChanged = true;
      return { status: 'installed-unverified', transactionId: '1'.repeat(32) };
    });
    expect(() => workspace.installOutputs([])).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_BYTES_CHANGED');
    expect(state.released).toBe(false);
    workspace.release();
  });

  it('retains distinct source and candidate roots and releases its lock explicitly', async () => {
    const { state, capture } = await setup();
    const workspace = capture();
    expect(workspace).toMatchObject({ profile, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40) });
    expect(workspace.sourceRoot).not.toBe(workspace.candidateRoot);
    expect(state.acquired).toBe(true);
    workspace.assertActive();
    workspace.assertCandidateClean();
    workspace.release();
    expect(state.released).toBe(true);
    expect(() => workspace.assertActive()).toThrow('LOCAL_RELEASE_WORKSPACE_RELEASED');
  });

  it('distinguishes allowed candidate edits from forbidden source edits', async () => {
    const { state, capture } = await setup();
    const workspace = capture();
    state.candidateDirty = true;
    expect(() => workspace.assertActive()).not.toThrow();
    expect(() => workspace.assertCandidateClean()).toThrow('LOCAL_RELEASE_WORKSPACE_CANDIDATE_DIRTY');
    state.sourceDirty = true;
    expect(() => workspace.assertActive()).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_DIRTY');
    workspace.release();
  });

  it('rejects a replaced candidate directory even if its path stays the same', async () => {
    const { state, capture } = await setup();
    const workspace = capture();
    state.changedPath = workspace.candidateRoot;
    expect(() => workspace.assertActive()).toThrow('LOCAL_RELEASE_WORKSPACE_DIRECTORY_CHANGED');
    workspace.release();
  });

  it('rejects raw source drift even when Git status remains clean', async () => {
    const { state, capture } = await setup();
    const workspace = capture();
    state.rawChanged = true;
    expect(() => workspace.assertActive()).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_BYTES_CHANGED');
    workspace.release();
  });

  it('rejects special permission bits even when content and Git status are unchanged', async () => {
    const { state, capture } = await setup();
    const workspace = capture();
    state.sourceMode = 0o104644n;
    expect(() => workspace.assertActive()).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_MODE_CHANGED');
    workspace.release();
  });

  it('rejects invalid UTF-8 pathname bytes instead of decoding to a shadow name', async () => {
    const { state, capture } = await setup();
    state.rawListing = Buffer.concat([Buffer.from('100644 blob 2e65efe2a145dda7ee51d1741299f848e5bf752e 1\t'), Buffer.from([255, 0])]);
    expect(() => capture()).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_INVALID');
  });

  it.each([
    '',
    '120000 blob 2e65efe2a145dda7ee51d1741299f848e5bf752e 1\tsource.txt\0',
    '100644 blob 2e65efe2a145dda7ee51d1741299f848e5bf752e 1\t../source.txt\0',
    '100644 blob 2e65efe2a145dda7ee51d1741299f848e5bf752e 16777217\tsource.txt\0',
    '100644 blob 2e65efe2a145dda7ee51d1741299f848e5bf752e 1\tsource.txt',
  ])('rejects unsupported or unbounded source-tree metadata %j', async listing => {
    const { state, capture } = await setup();
    state.listing = listing;
    expect(() => capture()).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_INVALID');
    expect(state.acquired).toBe(false);
  });

  it('rejects case-colliding source paths before locking', async () => {
    const { state, capture } = await setup();
    state.listing += state.listing.replace('source.txt', 'SOURCE.txt');
    expect(() => capture()).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_INVALID');
    expect(state.acquired).toBe(false);
  });

  it.each([[4097, 1], [17, 16777216]])('rejects excessive whole-tree count/bytes (%i, %i)', async (count, size) => {
    const { state, capture } = await setup();
    state.listing = Array.from({ length: count }, (_, index) =>
      `100644 blob 2e65efe2a145dda7ee51d1741299f848e5bf752e ${size}\tsource-${index}.txt\0`).join('');
    expect(() => capture()).toThrow('LOCAL_RELEASE_WORKSPACE_SOURCE_INVALID');
    expect(state.acquired).toBe(false);
  });

  it('rejects candidate Git identity drift', async () => {
    const { state, capture } = await setup();
    const workspace = capture();
    state.candidateChanged = true;
    expect(() => workspace.assertActive()).toThrow('CANDIDATE_HEAD_CHANGED');
    workspace.release();
  });

  it('releases an acquired lock on capture failure while retaining diagnostics', async () => {
    const { state, capture } = await setup();
    state.failAfterLock = true;
    expect(() => capture()).toThrow('SOURCE_CHANGED');
    expect(state.released).toBe(true);
  });

  it('rejects a non-native filesystem before creating a workspace', async () => {
    const { state, capture } = await setup();
    state.filesystem = 0x01021994;
    expect(() => capture()).toThrow('LOCAL_RELEASE_WORKSPACE_FILESYSTEM_INVALID');
    expect(state.created).toEqual([]);
  });

  it('preserves both capture failure and lock-release failure', async () => {
    const { state, capture } = await setup();
    state.failAfterLock = true;
    state.cleanupFails = true;
    let failure;
    try { capture(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map(error => error.message)).toEqual(['SOURCE_CHANGED', 'CLEANUP_FAILED']);
  });

  it('rejects caller arguments before creating a workspace', async () => {
    const { state, capture } = await setup();
    expect(() => (capture as (...args: unknown[]) => unknown)(undefined)).toThrow('LOCAL_RELEASE_WORKSPACE_ARGUMENTS_INVALID');
    expect(state.created).toEqual([]);
  });

  it('rejects non-Linux or inherited loader settings before creating a workspace', async () => {
    const { state, capture } = await setup();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(() => capture()).toThrow('LOCAL_RELEASE_WORKSPACE_HOST_INVALID');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.spyOn(process, 'execArgv', 'get').mockReturnValue(['--import', '/untrusted.mjs']);
    expect(() => capture()).toThrow('LOCAL_RELEASE_WORKSPACE_HOST_INVALID');
    expect(state.created).toEqual([]);
  });
});
