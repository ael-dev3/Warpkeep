// @vitest-environment node

import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseLocalBindingWorkerResult,
  validateLocalBindingWorkerRequest,
} from '../scripts/local-binding-runtime-core.mjs';

const FIXED_ROOT = '/home/warpkeep/.warpkeep/release-preparation-v1';

function genesis001WorkerRequest(): Record<string, unknown> {
  const operation = `${FIXED_ROOT}/runs/binding-${'9'.repeat(32)}`;
  return {
    schemaVersion: 1,
    profile: 'warpkeep-local-binding-genesis001-worker-v1',
    nonce: 'a'.repeat(32),
    sourceCommit: '1'.repeat(40),
    sourceTree: '2'.repeat(40),
    repositoryRoot: `${operation}/source`,
    dependencyCacheRoot: `${FIXED_ROOT}/cache/genesis002`,
    materializationRoot: `${operation}/cycle-1/builds`,
    nodePath: `${FIXED_ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`,
    cliPath: join(operation, 'cli', 'spacetimedb-cli'),
    handoffPath: `${operation}/cycle-1/handoff/bundle.js`,
    graph: {
      root: `${operation}/source`,
      entry: 'scripts/genesis001-binding-linux-locked-source-build.ts',
      modules: [{
        path: 'scripts/genesis001-binding-linux-locked-source-build.ts',
        format: 'typescript',
        imports: [],
        bytes: 1,
        sha256: '3'.repeat(64),
        identity: {
          dev: '1', ino: '2', mode: '33152', uid: '1000', nlink: '1',
          size: '1', mtimeNs: '3', ctimeNs: '4',
        },
      }],
    },
    yaml: {
      root: `${FIXED_ROOT}/toolchain/yaml-2.9.0/package`,
      entry: 'dist/index.js',
      files: [{ path: 'dist/index.js', mode: 420, bytes: 1, sha256: '4'.repeat(64) }],
    },
  };
}

afterEach(() => {
  vi.doUnmock('../scripts/local-binding-runtime-core.mjs');
  vi.resetModules();
});

describe('fixed Genesis 001 local compilation', () => {
  it('rejects every public argument before importing the fixed core', async () => {
    const core = vi.fn();
    vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
      deriveFixedGenesis001LocalCompilation: core,
    }));
    const runtime = await import('../scripts/local-binding-runtime.mjs');
    await expect((runtime.derivePreparedGenesis001LinuxCompilation as unknown as
      (value: never) => Promise<unknown>)(undefined as never))
      .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID' });
    expect(core).not.toHaveBeenCalled();
  });

  it('returns relative diagnostic paths with byte copies that cannot alias the core', async () => {
    const internal = Uint8Array.of(7, 8, 9);
    vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
      deriveFixedGenesis001LocalCompilation: async () => ({
        profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
        sourceCommit: '1'.repeat(40),
        sourceTree: '2'.repeat(40),
        bundleSha256: '3'.repeat(64),
        dependencyClosureDigest: '4'.repeat(64),
        diagnosticBindings: [{ path: 'index.ts', bytes: internal }],
      }),
    }));
    const runtime = await import('../scripts/local-binding-runtime.mjs');
    const result = await runtime.derivePreparedGenesis001LinuxCompilation();
    internal[0] = 99;
    expect(result).toEqual({
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
      sourceCommit: '1'.repeat(40),
      sourceTree: '2'.repeat(40),
      bundleSha256: '3'.repeat(64),
      dependencyClosureDigest: '4'.repeat(64),
      diagnosticBindings: [{ path: 'index.ts', bytes: Uint8Array.of(7, 8, 9) }],
    });
  });

  it('binds the named G001 request to only its graph and reused verified cache', () => {
    const request = genesis001WorkerRequest();
    expect(validateLocalBindingWorkerRequest(request)).toEqual(request);
    for (const mutation of [
      { dependencyCacheRoot: `${FIXED_ROOT}/cache/ptr` },
      { dependencyCacheRoot: `${FIXED_ROOT}/cache/genesis001` },
      { graph: { ...(request.graph as Record<string, unknown>), entry: 'scripts/genesis002-binding-linux-locked-source-build.ts' } },
      { profile: 'warpkeep-local-binding-genesis002-worker-v1' },
      { compilerPath: `${FIXED_ROOT}/toolchain/node-v24.19.0-linux-x64/bin/node` },
    ]) {
      expect(() => validateLocalBindingWorkerRequest({ ...request, ...mutation }))
        .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_REQUEST_INVALID' }));
    }
    expect(Object.keys(request).sort()).toEqual([
      'cliPath', 'dependencyCacheRoot', 'graph', 'handoffPath', 'materializationRoot',
      'nodePath', 'nonce', 'profile', 'repositoryRoot', 'schemaVersion', 'sourceCommit',
      'sourceTree', 'yaml',
    ]);
  });

  it('accepts only the G001 result profile for the named request lane', () => {
    const request = genesis001WorkerRequest();
    const result = {
      schemaVersion: 1,
      profile: 'warpkeep-local-binding-genesis001-worker-result-v1',
      nonce: request.nonce,
      sourceCommit: request.sourceCommit,
      sourceTree: request.sourceTree,
      moduleTreeId: '3'.repeat(40),
      dependencyClosureDigest: '4'.repeat(64),
      bundleSha256: '5'.repeat(64),
      bundleBytes: 17,
      handoffPath: request.handoffPath,
    };
    expect(parseLocalBindingWorkerResult(
      `${JSON.stringify(result)}\n`, request.nonce as string, request.handoffPath as string,
      request.profile as 'warpkeep-local-binding-genesis001-worker-v1',
    )).toEqual(result);
    for (const profile of [
      'warpkeep-local-binding-worker-result-v1',
      'warpkeep-local-binding-genesis002-worker-result-v1',
    ]) {
      expect(() => parseLocalBindingWorkerResult(
        `${JSON.stringify({ ...result, profile })}\n`, request.nonce as string,
        request.handoffPath as string,
        request.profile as 'warpkeep-local-binding-genesis001-worker-v1',
      )).toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_RESULT_INVALID' }));
    }
  });
});
