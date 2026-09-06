// @vitest-environment node

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { derivePreparedLinuxOperationBundles } from '../scripts/local-operation-bundle-runtime.mjs';
import {
  assertReproducibleOperationBundleCycles,
  parseOperationBundleLoadResult,
  parseOperationBundleWorkerResult,
  verifyOperationBundleMaterializedGraph,
} from '../scripts/local-operation-bundle-runtime-core.mjs';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const nonce = 'a'.repeat(32);

function artifact(overrides: Record<string, unknown> = {}) {
  const bytes = Buffer.from('bundle');
  return {
    schemaVersion: 1,
    profile: 'warpkeep-local-operation-bundle-worker-result-v1',
    nonce,
    sourceCommit: 'b'.repeat(40),
    sourceTree: 'c'.repeat(40),
    lane: 'activation' as const,
    basename: 'sealed-realms-production-activation-lane.bundle.mjs',
    bundleBytes: bytes.length,
    byteDigest: digest('bundle'),
    sourceClosureDigest: digest('closure'),
    graphManifest: [{ path: 'scripts/a.mjs', byteLength: 1, sha256: digest('a') }],
    exportNames: ['createSealedRealmsProductionActivationWorkflowRuntime', 'runSealedRealmsProductionActivationOperation'],
    factoryExport: 'createSealedRealmsProductionActivationWorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID',
    handoffPath: '/home/snapmeter/.warpkeep/release-preparation-v1/runs/operation-bundle-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/activation-1/artifact.mjs',
    ...overrides,
  };
}

describe('fixed Linux operation bundle runtime boundaries', () => {
  it('rejects every public argument, including explicit undefined, before host work', async () => {
    await expect((derivePreparedLinuxOperationBundles as unknown as (value: unknown) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'OPERATION_BUNDLE_RUNTIME_ARGUMENTS_INVALID' });
  });

  it('rejects non-Linux in-process use and inherited loader/compiler overrides', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    await expect(derivePreparedLinuxOperationBundles()).rejects.toMatchObject({
      code: 'OPERATION_BUNDLE_RUNTIME_HOST_INVALID',
    });
    platform.mockRestore();

    const originalGetuid = Object.getOwnPropertyDescriptor(process, 'getuid');
    const linux = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const architecture = vi.spyOn(process, 'arch', 'get').mockReturnValue('x64');
    const executable = vi.spyOn(process, 'execPath', 'get').mockReturnValue(
      '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
    );
    const arguments_ = vi.spyOn(process, 'execArgv', 'get').mockReturnValue([]);
    Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1000 });
    const previous = process.env.ESBUILD_BINARY_PATH;
    process.env.ESBUILD_BINARY_PATH = '/caller/compiler';
    try {
      await expect(derivePreparedLinuxOperationBundles()).rejects.toMatchObject({
        code: 'OPERATION_BUNDLE_RUNTIME_HOST_INVALID',
      });
    } finally {
      if (previous === undefined) delete process.env.ESBUILD_BINARY_PATH;
      else process.env.ESBUILD_BINARY_PATH = previous;
      linux.mockRestore(); architecture.mockRestore(); executable.mockRestore(); arguments_.mockRestore();
      if (originalGetuid === undefined) delete (process as { getuid?: unknown }).getuid;
      else Object.defineProperty(process, 'getuid', originalGetuid);
    }
  });

  it('rejects worker nonce, lane and digest assertions that do not match the parent request', () => {
    const source = `${JSON.stringify(artifact())}\n`;
    expect(parseOperationBundleWorkerResult(source, {
      nonce, lane: 'activation', sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40),
      handoffPath: artifact().handoffPath as string,
    })).toMatchObject({ lane: 'activation', byteDigest: digest('bundle') });
    for (const changed of [
      { nonce: 'd'.repeat(32) }, { lane: 'g001' }, { byteDigest: digest('wrong') },
    ]) {
      expect(() => parseOperationBundleWorkerResult(`${JSON.stringify(artifact(changed))}\n`, {
        nonce, lane: 'activation', sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40),
        handoffPath: artifact().handoffPath as string, byteDigest: digest('bundle'),
      })).toThrow('OPERATION_BUNDLE_RUNTIME_WORKER_RESULT_INVALID');
    }
  });

  it('rejects wrong load exports, factory success, digest and nonce', () => {
    const expected = {
      nonce, byteDigest: digest('bundle'),
      exportNames: ['createSealedRealmsProductionActivationWorkflowRuntime', 'runSealedRealmsProductionActivationOperation'],
      factoryFailureCode: 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID',
    };
    const valid = {
      schemaVersion: 1, profile: 'warpkeep-linux-operation-bundle-load-v1', nonce,
      byteDigest: digest('bundle'), exportNames: expected.exportNames,
      factoryFailureCode: expected.factoryFailureCode,
    };
    expect(parseOperationBundleLoadResult(`${JSON.stringify(valid)}\n`, expected)).toEqual(valid);
    for (const changed of [
      { nonce: 'd'.repeat(32) }, { byteDigest: digest('wrong') }, { exportNames: ['wrong'] },
      { factoryFailureCode: null },
    ]) {
      expect(() => parseOperationBundleLoadResult(`${JSON.stringify({ ...valid, ...changed })}\n`, expected))
        .toThrow('OPERATION_BUNDLE_RUNTIME_LOAD_RESULT_INVALID');
    }
  });

  it('requires both independent builds to match complete bytes and manifests', () => {
    const first = { ...artifact(), bytes: Uint8Array.from([1, 2, 3]) };
    const second = { ...first, graphManifest: first.graphManifest.map(entry => ({ ...entry })) };
    expect(assertReproducibleOperationBundleCycles(first, second)).toBe(first);
    expect(() => assertReproducibleOperationBundleCycles(first, {
      ...second, bytes: Uint8Array.from([1, 2, 4]),
    })).toThrow('OPERATION_BUNDLE_RUNTIME_REPRODUCIBILITY_FAILED');
    expect(() => assertReproducibleOperationBundleCycles(first, {
      ...second, graphManifest: [{ ...second.graphManifest[0], byteLength: 2 }],
    })).toThrow('OPERATION_BUNDLE_RUNTIME_REPRODUCIBILITY_FAILED');
  });

  it('reattests real materialized source bytes and rejects post-build mutation', () => {
    const parent = mkdtempSync(join(tmpdir(), 'warpkeep-operation-source-'));
    const root = join(parent, 'source');
    const path = join(root, 'scripts', 'entry.mjs');
    const body = Buffer.from('export const value = 1;\n');
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(path, body);
      const manifest = [{ path: 'scripts/entry.mjs', byteLength: body.length, sha256: digest(body.toString()) }];
      expect(() => verifyOperationBundleMaterializedGraph(root, manifest)).not.toThrow();
      chmodSync(path, 0o600);
      writeFileSync(path, 'export const value = 2;\n');
      expect(() => verifyOperationBundleMaterializedGraph(root, manifest))
        .toThrow('OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
});
