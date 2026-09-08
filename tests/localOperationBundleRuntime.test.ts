// @vitest-environment node

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { derivePreparedLinuxOperationBundleFiles, derivePreparedLinuxOperationBundles } from '../scripts/local-operation-bundle-runtime.mjs';
import {
  assertReproducibleOperationBundleCycles,
  parseOperationBundleLoadResult,
  parseOperationBundleWorkerResult,
  verifyOperationBundleMaterializedGraph,
} from '../scripts/local-operation-bundle-runtime-core.mjs';
import * as operationCore from '../scripts/local-operation-bundle-runtime-core.mjs';
import {
  deriveSealedRealmOperationBundleSourceClosureDigest,
  getSealedRealmOperationBundleSpecification,
} from '../scripts/sealed-realms-production-bundle-engine.mjs';

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
    await expect((derivePreparedLinuxOperationBundleFiles as unknown as (value: unknown) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'OPERATION_BUNDLE_RUNTIME_ARGUMENTS_INVALID' });
  });

  it('rejects non-Linux in-process use and inherited loader/compiler overrides', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    await expect(derivePreparedLinuxOperationBundles()).rejects.toMatchObject({
      code: 'OPERATION_BUNDLE_RUNTIME_HOST_INVALID',
    });
    await expect(derivePreparedLinuxOperationBundleFiles()).rejects.toMatchObject({
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

  it('reconstructs exact bounded CLI metadata and rejects extras at every level', () => {
    const value = {
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
      sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40),
      bundles: ['activation', 'g001', 'g002', 'ptr'].map((lane, index) => {
        const basenames = [
          'sealed-realms-production-activation-lane.bundle.mjs',
          'sealed-realms-production-g001-lane.bundle.mjs',
          'sealed-realms-production-g002-lane.bundle.mjs',
          'sealed-realms-production-ptr-lane.bundle.mjs',
        ];
        const names = lane === 'activation'
          ? ['createSealedRealmsProductionActivationWorkflowRuntime', 'runSealedRealmsProductionActivationOperation']
          : lane === 'g001'
            ? ['createSealedRealmsProductionG001WorkflowRuntime', 'runSealedRealmsProductionG001Operation']
            : lane === 'g002'
              ? ['createSealedRealmsProductionG002WorkflowRuntime', 'runSealedRealmsProductionG002Operation']
              : ['createSealedRealmsProductionPtrWorkflowRuntime', 'runSealedRealmsProductionPtrOperation'];
        return {
          lane,
          basename: basenames[index], bundleBytes: index + 1,
          byteDigest: String(index + 1).repeat(64), sourceClosureDigest: String(index + 5).repeat(64),
          graphCount: index + 1, exportCount: 2,
          load: {
            profile: 'warpkeep-linux-operation-bundle-load-v1',
            byteDigest: String(index + 1).repeat(64), exportNames: names,
            factoryFailureCode: lane === 'activation' ? 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID'
              : lane === 'g001' ? 'SEALED_REALMS_G001_WORKFLOW_INPUT_INVALID'
                : lane === 'g002' ? 'SEALED_REALMS_G002_WORKFLOW_INPUT_INVALID'
                  : 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID',
          },
        };
      }),
    };
    const parse = (operationCore as Record<string, any>).parseOperationBundleCliMetadata;
    const parsed = parse(`${JSON.stringify(value)}\n`);
    expect(parsed).toEqual(value);
    expect(parsed).not.toBe(value);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.bundles[0].load)).toBe(true);
    for (const changed of [
      { ...value, injected: true },
      { ...value, bundles: value.bundles.map((bundle, index) => index === 0 ? { ...bundle, injected: true } : bundle) },
      { ...value, bundles: value.bundles.map((bundle, index) => index === 0
        ? { ...bundle, load: { ...bundle.load, injected: true } } : bundle) },
    ]) expect(() => parse(`${JSON.stringify(changed)}\n`))
      .toThrow('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID');
  });

  it('reconstructs bounded primary and cleanup failures from a worker result', () => {
    const failure = {
      schemaVersion: 1,
      profile: 'warpkeep-local-operation-bundle-worker-failure-v1',
      nonce, sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40), lane: 'activation',
      primaryFailure: { code: 'SEALED_REALMS_BUNDLES_BUILD_FAILED' },
      cleanupFailure: { code: 'OPERATION_BUNDLE_PACKAGES_NAMESPACE_CHANGED' },
    };
    let caught: unknown;
    try {
      parseOperationBundleWorkerResult(`${JSON.stringify(failure)}\n`, {
        nonce, lane: 'activation', sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40),
        handoffPath: artifact().handoffPath as string,
      });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors.map(error => (error as { code?: string }).code)).toEqual([
      'SEALED_REALMS_BUNDLES_BUILD_FAILED', 'OPERATION_BUNDLE_PACKAGES_NAMESPACE_CHANGED',
    ]);
    expect(((caught as AggregateError).cause as { code?: string }).code)
      .toBe('SEALED_REALMS_BUNDLES_BUILD_FAILED');
    expect(() => parseOperationBundleWorkerResult(`${JSON.stringify({
      ...failure, primaryFailure: { code: '/private/source: arbitrary message' },
    })}\n`, {
      nonce, lane: 'activation', sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40),
      handoffPath: artifact().handoffPath as string,
    })).toThrow('OPERATION_BUNDLE_RUNTIME_WORKER_RESULT_INVALID');
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

  it('enforces the fixed materialized-source owner and rejects post-build mutation', () => {
    const parent = mkdtempSync(join(tmpdir(), 'warpkeep-operation-source-'));
    const root = join(parent, 'source');
    const path = join(root, 'scripts', 'entry.mjs');
    const body = Buffer.from('export const value = 1;\n');
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(path, body);
      const manifest = [{ path: 'scripts/entry.mjs', byteLength: body.length, sha256: digest(body.toString()) }];
      if (process.platform === 'win32' || statSync(path).uid === 1000) {
        expect(() => verifyOperationBundleMaterializedGraph(root, manifest)).not.toThrow();
      } else {
        // Hosted CI may not run as the fixed local production UID. The real
        // descriptor reader must reject those bytes even when their hash matches.
        expect(() => verifyOperationBundleMaterializedGraph(root, manifest))
          .toThrow('OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED');
      }
      chmodSync(path, 0o600);
      writeFileSync(path, 'export const value = 2;\n');
      expect(() => verifyOperationBundleMaterializedGraph(root, manifest))
        .toThrow('OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
});

type OrchestrationScenario = 'success' | 'early-lane' | 'load-timeout'
  | 'descendant-survival' | 'captured-source-mutation' | 'worker-primary-cleanup'
  | 'files' | 'declaration-mode' | 'declaration-empty' | 'declaration-oversize';

async function runMockedProductionOrchestration(scenario: OrchestrationScenario) {
  vi.resetModules();
  const fileMode = scenario === 'files' || scenario.startsWith('declaration-');
  const declarationBodies = new Map(['activation', 'g001', 'g002', 'ptr'].map(lane => {
    const path = `scripts/sealed-realms-production-${lane}-workflow-entry.d.mts`;
    return [path, readFileSync(path)] as const;
  }));
  const state = {
    lanes: [] as string[],
    sourceRoots: [] as string[],
    processOptions: [] as Array<Record<string, unknown>>,
    removed: false,
  };
  const laneMetadata: Record<string, { basename: string; exports: string[]; factory: string; failure: string }> = {
    activation: {
      basename: 'sealed-realms-production-activation-lane.bundle.mjs',
      exports: ['createSealedRealmsProductionActivationWorkflowRuntime', 'runSealedRealmsProductionActivationOperation'],
      factory: 'createSealedRealmsProductionActivationWorkflowRuntime',
      failure: 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID',
    },
    g001: {
      basename: 'sealed-realms-production-g001-lane.bundle.mjs',
      exports: ['createSealedRealmsProductionG001WorkflowRuntime', 'runSealedRealmsProductionG001Operation'],
      factory: 'createSealedRealmsProductionG001WorkflowRuntime',
      failure: 'SEALED_REALMS_G001_WORKFLOW_INPUT_INVALID',
    },
    g002: {
      basename: 'sealed-realms-production-g002-lane.bundle.mjs',
      exports: ['createSealedRealmsProductionG002WorkflowRuntime', 'runSealedRealmsProductionG002Operation'],
      factory: 'createSealedRealmsProductionG002WorkflowRuntime',
      failure: 'SEALED_REALMS_G002_WORKFLOW_INPUT_INVALID',
    },
    ptr: {
      basename: 'sealed-realms-production-ptr-lane.bundle.mjs',
      exports: ['createSealedRealmsProductionPtrWorkflowRuntime', 'runSealedRealmsProductionPtrOperation'],
      factory: 'createSealedRealmsProductionPtrWorkflowRuntime',
      failure: 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID',
    },
  };
  const identity = Object.freeze({
    dev: '1', ino: '2', mode: '33261', uid: '1000', nlink: '1', size: '1', mtimeNs: '3', ctimeNs: '4',
  });
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    return {
      ...actual,
      lstatSync: () => ({
        mode: 0o40700n, uid: 1000n, isDirectory: () => true, isSymbolicLink: () => false,
      }),
      realpathSync: (path: string) => path,
      mkdirSync: () => undefined,
      chmodSync: () => undefined,
      readdirSync: () => ['_cacache'],
      rmSync: () => { state.removed = true; },
    };
  });
  vi.doMock('../scripts/local-binding-bounded-file.mjs', () => ({
    readLocalBindingBoundedFile(path: string, options: Record<string, unknown>) {
      let body = Buffer.alloc(0);
      if (path.endsWith('local-binding-runtime-yaml-v1.json')) body = Buffer.from('{}');
      else if (options.expectedSha256 === digest('a')) body = Buffer.from('a');
      else if (path.endsWith('artifact.mjs')) {
        const lane = ['activation', 'g001', 'g002', 'ptr'].find(name => path.includes(`${name}-`))!;
        body = Buffer.from(`bundle:${lane}`);
      }
      if (options.discardBody !== true
          && options.expectedBytes !== undefined
          && body.length !== options.expectedBytes) {
        throw new Error('CONTROLLED_BOUNDED_BYTES_MISMATCH');
      }
      if (options.expectedSha256 !== undefined && body.length > 0
          && digest(body.toString()) !== options.expectedSha256) {
        throw new Error('CONTROLLED_BOUNDED_DIGEST_MISMATCH');
      }
      return Object.freeze({ body, identity });
    },
    copyLocalBindingBoundedFile() { return Object.freeze({ bytes: 1, sha256: 'a'.repeat(64), identity }); },
  }));
  vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
    captureFixedOperationBundleSource(input: Record<string, any>) {
      const sourceRoot = `${input.operationRoot}/source`;
      return Object.freeze({
        root: sourceRoot, commit: 'b'.repeat(40), tree: 'c'.repeat(40), bootstrap: [],
        gitBuffer(root: string, args: string[], cap: number) {
          if (state.removed || root !== sourceRoot) throw new Error('SOURCE_NOT_OWNED');
          if (args[0] === 'ls-tree' && args[1] === '-z' && args[2] === 'c'.repeat(40)
              && args[3] === '--' && declarationBodies.has(args[4]!) && cap <= 4096) {
            return Buffer.from(`${scenario === 'declaration-mode' ? '120000' : '100644'} blob ${'d'.repeat(40)}\t${args[4]}\0`);
          }
          if (args.join(' ') === `cat-file blob ${'d'.repeat(40)}` && cap === 65536) {
            if (scenario === 'declaration-empty') return Buffer.alloc(0);
            if (scenario === 'declaration-oversize') return Buffer.alloc(65537);
            const next = declarationBodies.values().next().value!;
            declarationBodies.delete(declarationBodies.keys().next().value!);
            return Buffer.from(next);
          }
          throw new Error('UNEXPECTED_GIT_READ');
        },
        materialize(destination: string) {
          state.sourceRoots.push(destination);
          return Object.freeze({ root: destination, commit: 'b'.repeat(40), tree: 'c'.repeat(40) });
        },
        verify() {},
        verifyMaterialization(destination: string) {
          if (scenario === 'captured-source-mutation' && destination.includes('g001-1')) {
            throw Object.assign(new Error('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED'), {
              code: 'LOCAL_BINDING_RUNTIME_SOURCE_CHANGED',
            });
          }
        },
      });
    },
    deriveOperationBundlePackageSourceGraph(root: string) {
      return Object.freeze({ root, entry: 'scripts/local-operation-bundle-packages.ts', modules: [{}] });
    },
    validateLocalBindingYamlManifest() { return { entry: 'dist/index.js', files: [{}] }; },
    preserveLocalBindingRuntimePrimaryAndCleanup(primary: unknown, cleanup: unknown) {
      if (primary !== undefined && cleanup !== undefined) {
        throw new AggregateError([primary, cleanup], 'LOCAL_BINDING_RUNTIME_FAILED', { cause: primary });
      }
      if (primary !== undefined) throw primary;
      if (cleanup !== undefined) throw cleanup;
    },
    async runLocalBindingBoundedProcess(_executable: string, args: string[], options: Record<string, any>) {
      state.processOptions.push(options);
      const request = JSON.parse(options.fd3);
      if (args.at(-1)!.endsWith('local-operation-bundle-worker.mjs')) {
        state.lanes.push(request.lane);
        if (scenario === 'worker-primary-cleanup') {
          return {
            stderr: '',
            stdout: `${JSON.stringify({
              schemaVersion: 1, profile: 'warpkeep-local-operation-bundle-worker-failure-v1',
              nonce: request.nonce, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
              lane: request.lane,
              primaryFailure: { code: 'SEALED_REALMS_BUNDLES_BUILD_FAILED' },
              cleanupFailure: { code: 'OPERATION_BUNDLE_PACKAGES_NAMESPACE_CHANGED' },
            })}\n`,
          };
        }
        if (scenario === 'early-lane' && request.lane === 'g001') {
          throw Object.assign(new Error('CONTROLLED_EARLY_LANE_FAILURE'), { code: 'CONTROLLED_EARLY_LANE_FAILURE' });
        }
        const spec = laneMetadata[request.lane]!;
        const body = Buffer.from(`bundle:${request.lane}`);
        const realSpec = getSealedRealmOperationBundleSpecification(request.lane);
        const graphManifest = fileMode
          ? [...realSpec.requiredGraphPaths, 'scripts/fixture-extra.mjs']
            .sort().map(path => ({ path, byteLength: 1, sha256: digest('a') }))
          : [{ path: 'scripts/a.mjs', byteLength: 1, sha256: digest('a') }];
        return {
          stderr: '',
          stdout: `${JSON.stringify({
            schemaVersion: 1, profile: 'warpkeep-local-operation-bundle-worker-result-v1',
            nonce: request.nonce, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
            lane: request.lane, basename: spec.basename, bundleBytes: body.length,
            byteDigest: digest(body.toString()), sourceClosureDigest: fileMode
              ? deriveSealedRealmOperationBundleSourceClosureDigest(request.lane, graphManifest)
              : digest(`closure:${request.lane}`),
            graphManifest,
            exportNames: spec.exports, factoryExport: spec.factory, factoryFailureCode: spec.failure,
            handoffPath: request.handoffPath,
          })}\n`,
        };
      }
      if (scenario === 'load-timeout') {
        throw Object.assign(new Error('LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT'), {
          code: 'LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT',
        });
      }
      if (scenario === 'descendant-survival') {
        throw Object.assign(new Error('LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED'), {
          code: 'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED',
        });
      }
      return {
        stderr: '',
        stdout: `${JSON.stringify({
          schemaVersion: 1, profile: 'warpkeep-linux-operation-bundle-load-v1',
          nonce: request.nonce, byteDigest: request.byteDigest,
          exportNames: [...request.exportNames].sort(), factoryFailureCode: request.factoryFailureCode,
        })}\n`,
      };
    },
  }));
  const originalGetuid = Object.getOwnPropertyDescriptor(process, 'getuid');
  const properties = [
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux'),
    vi.spyOn(process, 'arch', 'get').mockReturnValue('x64'),
    vi.spyOn(process, 'execPath', 'get').mockReturnValue(
      '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
    ),
    vi.spyOn(process, 'execArgv', 'get').mockReturnValue([]),
  ];
  Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1000 });
  const removedEnvironment = new Map<string, string>();
  for (const name of Object.keys(process.env)) {
    if (/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|API_KEY)/iu.test(name)) {
      removedEnvironment.set(name, process.env[name]!);
      delete process.env[name];
    }
  }
  let value;
  let error;
  try {
    const core = await import('../scripts/local-operation-bundle-runtime-core.mjs');
    value = fileMode
      ? await core.derivePreparedLinuxOperationBundleFilesCore()
      : await core.derivePreparedLinuxOperationBundlesCore();
  } catch (caught) { error = caught; }
  finally {
    for (const [name, environmentValue] of removedEnvironment) process.env[name] = environmentValue;
    for (const property of properties) property.mockRestore();
    if (originalGetuid === undefined) delete (process as { getuid?: unknown }).getuid;
    else Object.defineProperty(process, 'getuid', originalGetuid);
    vi.doUnmock('node:fs');
    vi.doUnmock('../scripts/local-binding-bounded-file.mjs');
    vi.doUnmock('../scripts/local-binding-runtime-core.mjs');
    vi.resetModules();
  }
  return { state, value, error };
}

describe('fixed production operation bundle orchestration', () => {
  it('returns nine validated files while the exact committed declaration source is still owned', async () => {
    const { state, value, error } = await runMockedProductionOrchestration('files');
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40) });
    if (value === undefined || !('files' in value)) throw new Error('Expected prepared files');
    const files = value.files;
    expect(files).toHaveLength(9);
    expect(Buffer.from(files.find(file => file.path.endsWith('activation-lane.bundle.mjs'))!.bytes).toString())
      .toBe('bundle:activation');
    for (const lane of ['activation', 'g001', 'g002', 'ptr']) {
      expect(Buffer.from(files.find(file => file.path.endsWith(`${lane}-lane.bundle.d.mts`))!.bytes))
        .toEqual(readFileSync(`scripts/sealed-realms-production-${lane}-workflow-entry.d.mts`));
    }
    expect(state.removed).toBe(true);
  });

  it.each(['declaration-mode', 'declaration-empty', 'declaration-oversize'] as const)(
    'rejects %s without publishing files or removing diagnostics', async scenario => {
      const { state, value, error } = await runMockedProductionOrchestration(scenario);
      expect(value).toBeUndefined();
      expect(error).toMatchObject({ code: 'OPERATION_BUNDLE_RUNTIME_DECLARATION_INVALID' });
      expect(state.removed).toBe(false);
    },
  );

  it('uses eight distinct source roots in exact lane order and 64 KiB result caps', async () => {
    const { state, value, error } = await runMockedProductionOrchestration('success');
    expect(error).toBeUndefined();
    expect((value as { bundles: readonly unknown[] }).bundles).toHaveLength(4);
    expect(new Set(state.sourceRoots).size).toBe(8);
    expect(state.lanes).toEqual(['activation', 'activation', 'g001', 'g001', 'g002', 'g002', 'ptr', 'ptr']);
    expect(state.processOptions).toHaveLength(16);
    expect(state.processOptions.every(options => options.maxOutput === 64 * 1024)).toBe(true);
    expect(state.processOptions.every(options => options.containProcessGroup === true)).toBe(true);
    expect(state.removed).toBe(true);
  });

  it('stops before later lanes after the first lane failure', async () => {
    const { state, value, error } = await runMockedProductionOrchestration('early-lane');
    expect(value).toBeUndefined();
    expect((error as { code?: string }).code).toBe('CONTROLLED_EARLY_LANE_FAILURE');
    expect(state.lanes).toEqual(['activation', 'activation', 'g001']);
    expect(state.removed).toBe(false);
  });

  it.each([
    ['load-timeout', 'LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT'],
    ['descendant-survival', 'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED'],
  ] as const)('propagates %s and retains diagnostics', async (scenario, code) => {
    const { state, value, error } = await runMockedProductionOrchestration(scenario);
    expect(value).toBeUndefined();
    expect((error as { code?: string }).code).toBe(code);
    expect(state.lanes).toEqual(['activation']);
    expect(state.removed).toBe(false);
  });

  it('rejects a changed captured materialization before advancing lanes', async () => {
    const { state, value, error } = await runMockedProductionOrchestration('captured-source-mutation');
    expect(value).toBeUndefined();
    expect((error as { code?: string }).code).toBe('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
    expect(state.lanes).toEqual(['activation', 'activation', 'g001']);
    expect(state.removed).toBe(false);
  });

  it('preserves worker primary and cleanup failures in order through orchestration', async () => {
    const { state, value, error } = await runMockedProductionOrchestration('worker-primary-cleanup');
    expect(value).toBeUndefined();
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map(item => (item as { code?: string }).code)).toEqual([
      'SEALED_REALMS_BUNDLES_BUILD_FAILED', 'OPERATION_BUNDLE_PACKAGES_NAMESPACE_CHANGED',
    ]);
    expect(((error as AggregateError).cause as { code?: string }).code)
      .toBe('SEALED_REALMS_BUNDLES_BUILD_FAILED');
    expect(state.lanes).toEqual(['activation']);
    expect(state.removed).toBe(false);
  });
});
