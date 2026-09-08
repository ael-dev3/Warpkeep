// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  derivePreparedPairedLinuxBindings,
} from '../scripts/local-binding-runtime.mjs';
import {
  parseLocalBindingWorkerResult,
  validateLocalBindingWorkerRequest,
} from '../scripts/local-binding-runtime-core.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const fixedRoot = '/home/warpkeep/.warpkeep/release-preparation-v1';

function workerRequest(profile: 'ptr' | 'genesis002'): Record<string, any> {
  const operation = `${fixedRoot}/runs/binding-${'9'.repeat(32)}`;
  const genesis002 = profile === 'genesis002';
  return {
    schemaVersion: 1,
    profile: genesis002
      ? 'warpkeep-local-binding-genesis002-worker-v1'
      : 'warpkeep-local-binding-worker-v1',
    nonce: 'a'.repeat(32), sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
    repositoryRoot: `${operation}/source`,
    dependencyCacheRoot: `${fixedRoot}/cache/${genesis002 ? 'genesis002' : 'ptr'}`,
    materializationRoot: `${operation}/${profile}/cycle-1/builds`,
    nodePath: `${fixedRoot}/toolchain/node-v22.22.3-linux-x64/bin/node`,
    cliPath: join(operation, 'cli', 'spacetimedb-cli'),
    handoffPath: `${operation}/${profile}/cycle-1/handoff/bundle.js`,
    graph: {
      root: `${operation}/source`,
      entry: genesis002
        ? 'scripts/genesis002-binding-linux-locked-source-build.ts'
        : 'scripts/ptr-binding-linux-locked-source-build.ts',
      modules: [{
        path: genesis002
          ? 'scripts/genesis002-binding-linux-locked-source-build.ts'
          : 'scripts/ptr-binding-linux-locked-source-build.ts',
        format: 'typescript', imports: [], bytes: 1, sha256: '3'.repeat(64),
        identity: {
          dev: '1', ino: '2', mode: '33152', uid: '1000', nlink: '1',
          size: '1', mtimeNs: '3', ctimeNs: '4',
        },
      }],
    },
    yaml: {
      root: `${fixedRoot}/toolchain/yaml-2.9.0/package`, entry: 'dist/index.js',
      files: [{ path: 'dist/index.js', mode: 420, bytes: 1, sha256: '4'.repeat(64) }],
    },
  };
}

describe('fixed paired Linux binding runtime', () => {
  it('rejects every paired API argument before importing the runtime core', async () => {
    vi.resetModules();
    const core = vi.fn();
    vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
      deriveFixedPairedLocalBindingRuntime: core,
    }));
    const runtime = await import('../scripts/local-binding-runtime.mjs');
    await expect((runtime.derivePreparedPairedLinuxBindings as unknown as
      (value: unknown) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID' });
    expect(core).not.toHaveBeenCalled();
    vi.doUnmock('../scripts/local-binding-runtime-core.mjs');
  });

  it('returns copied nested lane bytes and never aliases retained core buffers', async () => {
    vi.resetModules();
    const genesisBytes = Uint8Array.of(1, 2);
    const ptrBytes = Uint8Array.of(3, 4);
    vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
      deriveFixedPairedLocalBindingRuntime: async () => ({
        profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
        sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
        genesis002: {
          bundleSha256: '3'.repeat(64), dependencyClosureDigest: '4'.repeat(64),
          bindings: [{ path: 'scripts/genesis002_module_bindings/index.ts', bytes: genesisBytes }],
        },
        ptr: {
          bundleSha256: '5'.repeat(64), dependencyClosureDigest: '6'.repeat(64),
          bindings: [{ path: 'spacetimedb/ptr/generated-bindings/index.ts', bytes: ptrBytes }],
        },
      }),
    }));
    const runtime = await import('../scripts/local-binding-runtime.mjs');
    const result = await runtime.derivePreparedPairedLinuxBindings();
    genesisBytes[0] = 9;
    ptrBytes[0] = 9;
    expect(result.genesis002.bindings[0]?.bytes).toEqual(Uint8Array.of(1, 2));
    expect(result.ptr.bindings[0]?.bytes).toEqual(Uint8Array.of(3, 4));
    expect(result.genesis002.bindings.every(entry =>
      entry.path.startsWith('scripts/genesis002_module_bindings/'))).toBe(true);
    expect(result.ptr.bindings.every(entry =>
      entry.path.startsWith('spacetimedb/ptr/generated-bindings/'))).toBe(true);
    vi.doUnmock('../scripts/local-binding-runtime-core.mjs');
  });

  it('accepts only the exact fixed G002 worker coordinates and rejects cross-profile substitution', () => {
    const request = workerRequest('genesis002');
    expect(validateLocalBindingWorkerRequest(request)).toEqual(request);
    for (const mutation of [
      { graph: workerRequest('ptr').graph },
      { dependencyCacheRoot: `${fixedRoot}/cache/ptr` },
      { profile: 'warpkeep-local-binding-worker-v1' },
    ]) {
      expect(() => validateLocalBindingWorkerRequest({ ...request, ...mutation }))
        .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_REQUEST_INVALID' }));
    }
  });

  it('binds a worker result profile to the expected fixed lane', () => {
    const request = workerRequest('genesis002');
    const result = {
      schemaVersion: 1, profile: 'warpkeep-local-binding-genesis002-worker-result-v1',
      nonce: request.nonce, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
      moduleTreeId: '3'.repeat(40), dependencyClosureDigest: '4'.repeat(64),
      bundleSha256: '5'.repeat(64), bundleBytes: 17, handoffPath: request.handoffPath,
    };
    expect(parseLocalBindingWorkerResult(
      `${JSON.stringify(result)}\n`, request.nonce, request.handoffPath, request.profile,
    )).toEqual(result);
    expect(() => parseLocalBindingWorkerResult(
      `${JSON.stringify({ ...result, profile: 'warpkeep-local-binding-worker-result-v1' })}\n`,
      request.nonce, request.handoffPath, request.profile,
    )).toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_RESULT_INVALID' }));
  });

  it('adds only the exact --paired CLI mode while preserving no-argument PTR default', () => {
    const script = join(repositoryRoot, 'scripts', 'local-binding-runtime.mjs');
    const invalid = spawnSync(process.execPath, [script, '--paired=yes'], { encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe('');
    expect(invalid.stderr).toBe('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID\n');
  });
});
