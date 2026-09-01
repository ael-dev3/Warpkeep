// @vitest-environment node

import { Buffer } from 'node:buffer';

import { build as esbuild } from 'esbuild';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SOURCE = 'a'.repeat(40);
const SWAPPED_SOURCE = 'b'.repeat(40);
const PRIVATE_STATE_MODULE = '../scripts/sealed-realms-production-private-state.mjs';
const AUTH_BRIDGE_MODULE = '../scripts/sealed-realms-production-auth-bridge-state.mjs';
const RECONCILIATION_MODULE = '../scripts/sealed-realms-production-reconciliation.mjs';
const G002_PUBLISHER_MODULE = '../scripts/genesis002-production-publisher-cli.ts';
const PTR_PUBLISHER_MODULE = '../scripts/ptr-production-publisher-cli.ts';

type AnyFunction = (...arguments_: any[]) => any;
type RuntimeModule = Readonly<Record<string, unknown>>;

const ENTRIES = Object.freeze([
  Object.freeze({
    lane: 'g001',
    path: '../scripts/sealed-realms-production-g001-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionG001WorkflowRuntime',
    run: 'runSealedRealmsProductionG001Operation',
    operation: 'preflight',
    crossedOperation: 'g002-publish-inspect',
    expected: Object.freeze({ operation: 'preflight', status: 'preflight-inspected' }),
  }),
  Object.freeze({
    lane: 'g002',
    path: '../scripts/sealed-realms-production-g002-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionG002WorkflowRuntime',
    run: 'runSealedRealmsProductionG002Operation',
    operation: 'g002-publish-inspect',
    crossedOperation: 'ptr-publish-inspect',
    expected: Object.freeze({
      operation: 'g002-publish-inspect', status: 'publish-inspected', confirmation: {},
    }),
  }),
  Object.freeze({
    lane: 'ptr',
    path: '../scripts/sealed-realms-production-ptr-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionPtrWorkflowRuntime',
    run: 'runSealedRealmsProductionPtrOperation',
    operation: 'ptr-publish-inspect',
    crossedOperation: 'activation-evidence-inspect',
    expected: Object.freeze({
      operation: 'ptr-publish-inspect', status: 'publish-inspected', confirmation: {},
    }),
  }),
  Object.freeze({
    lane: 'activation',
    path: '../scripts/sealed-realms-production-activation-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionActivationWorkflowRuntime',
    run: 'runSealedRealmsProductionActivationOperation',
    operation: 'activation-evidence-inspect',
    crossedOperation: 'preflight',
    expected: Object.freeze({
      operation: 'activation-evidence-inspect',
      status: 'activation-evidence-inspected',
      confirmation: {},
    }),
  }),
] as const);

async function loadEntry(path: string): Promise<RuntimeModule> {
  return import(path).catch(() => Object.freeze({})) as Promise<RuntimeModule>;
}

function functionExport(module: RuntimeModule, name: string): AnyFunction {
  const value = module[name];
  expect(value, `${name} must be exported`).toBeTypeOf('function');
  return value as AnyFunction;
}

function sourceGit(arguments_: readonly string[]) {
  const command = arguments_.join('\0');
  if (
    command.endsWith('rev-parse\0--verify\0HEAD^{commit}')
    || command.endsWith('rev-parse\0--verify\0refs/remotes/origin/main^{commit}')
  ) return `${SOURCE}\n`;
  if (command.includes('show\0') && command.endsWith(':config/releases/0.4.0-sealed-launch.json')) {
    return `${JSON.stringify({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: SOURCE,
    })}\n`;
  }
  throw new Error(`unexpected fixed git request: ${arguments_.join(' ')}`);
}

async function installHarmlessRuntimeHarness() {
  const execFileSync = vi.fn((file: string, arguments_: readonly string[]) => {
    expect(file === 'git' || file.endsWith('/usr/bin/git')).toBe(true);
    return sourceGit(arguments_);
  });
  vi.doMock('node:child_process', async () => ({
    ...(await vi.importActual<typeof import('node:child_process')>('node:child_process')),
    execFileSync,
  }));

  const privateStates = new WeakSet<object>();
  const createPrivateState = vi.fn(() => {
    const state = Object.freeze({});
    privateStates.add(state);
    return state;
  });
  vi.doMock(PRIVATE_STATE_MODULE, async () => ({
    ...(await vi.importActual<Record<string, unknown>>(PRIVATE_STATE_MODULE)),
    createSealedRealmsProductionPrivateState: createPrivateState,
    assertSealedRealmsProductionPrivateState: (state: unknown) => {
      if (state === null || typeof state !== 'object' || !privateStates.has(state)) {
        throw Object.assign(new Error('SEALED_REALMS_PRIVATE_STATE_CAPABILITY_INVALID'), {
          code: 'SEALED_REALMS_PRIVATE_STATE_CAPABILITY_INVALID',
        });
      }
      return state;
    },
  }));

  const states = new WeakSet<object>();
  const generators = new WeakSet<object>();
  const createBridgeState = vi.fn(() => {
    const state = Object.freeze({
      inspectGate: async () => Object.freeze({ confirmation: Object.freeze({}) }),
      applyGate: async () => Object.freeze({ status: 'cross-linked' }),
      inspectOwnerProvisionEvidence: async () => Object.freeze({ confirmation: Object.freeze({}) }),
      applyOwnerProvision: async () => Object.freeze({}),
      inspectLiveEvidence: async () => Object.freeze({}),
      inspectActivationEvidence: async () => Object.freeze({ confirmation: Object.freeze({}) }),
    });
    states.add(state);
    return state;
  });
  const assertBridgeState = (state: unknown) => {
    if (state === null || typeof state !== 'object' || !states.has(state)) {
      throw Object.assign(new Error('SEALED_REALMS_AUTH_BRIDGE_STATE_CAPABILITY_INVALID'), {
        code: 'SEALED_REALMS_AUTH_BRIDGE_STATE_CAPABILITY_INVALID',
      });
    }
    return state;
  };
  vi.doMock(AUTH_BRIDGE_MODULE, async () => ({
    ...(await vi.importActual<Record<string, unknown>>(AUTH_BRIDGE_MODULE)),
    createSealedRealmsProductionAuthBridgeState: createBridgeState,
    assertSealedRealmsProductionAuthBridgeState: assertBridgeState,
    assertSealedRealmsProductionAuthBridgeStateAuthority: assertBridgeState,
    createSealedRealmsProductionActivationEvidenceGenerator: vi.fn(() => {
      const generator = Object.freeze({});
      generators.add(generator);
      return generator;
    }),
    assertSealedRealmsProductionActivationEvidenceGenerator: (generator: unknown) => {
      if (generator === null || typeof generator !== 'object' || !generators.has(generator)) {
        throw new Error('SEALED_REALMS_ACTIVATION_GENERATOR_INVALID');
      }
      return generator;
    },
    consumeSealedRealmsProductionActivationEvidenceForGenerator: async () => Object.freeze({}),
  }));

  const reconcilers = new WeakSet<object>();
  const createReconciler = vi.fn(() => {
    const reconciler = Object.freeze({
      inspect: async () => Object.freeze({ confirmation: Object.freeze({}) }),
      apply: async () => Object.freeze({ status: 'submitted' }),
      reconcile: async () => Object.freeze({ status: 'reconciled' }),
    });
    reconcilers.add(reconciler);
    return reconciler;
  });
  vi.doMock(RECONCILIATION_MODULE, async () => ({
    ...(await vi.importActual<Record<string, unknown>>(RECONCILIATION_MODULE)),
    createSealedRealmsProductionPublicationReconciler: createReconciler,
    assertSealedRealmsProductionPublicationReconciler: (reconciler: unknown) => {
      if (
        reconciler === null || typeof reconciler !== 'object'
        || !reconcilers.has(reconciler)
      ) throw new Error('SEALED_REALMS_RECONCILIATION_CAPABILITY_INVALID');
      return reconciler;
    },
  }));

  const inspectG002Publish = vi.fn(async () => Object.freeze({ marker: Object.freeze({}) }));
  const inspectPtrPublish = vi.fn(async () => Object.freeze({ marker: Object.freeze({}) }));
  vi.doMock(G002_PUBLISHER_MODULE, () => ({
    executeGenesis002ProductionPublisherCli: inspectG002Publish,
  }));
  vi.doMock(PTR_PUBLISHER_MODULE, () => ({
    executePtrProductionPublisherCli: inspectPtrPublish,
  }));
  vi.stubGlobal('WebSocket', class WebSocket {});
  return Object.freeze({
    execFileSync,
    createPrivateState,
    createBridgeState,
    createReconciler,
    inspectG002Publish,
    inspectPtrPublish,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('node:child_process');
  vi.doUnmock(PRIVATE_STATE_MODULE);
  vi.doUnmock(AUTH_BRIDGE_MODULE);
  vi.doUnmock(RECONCILIATION_MODULE);
  vi.doUnmock(G002_PUBLISHER_MODULE);
  vi.doUnmock(PTR_PUBLISHER_MODULE);
  vi.resetModules();
});

describe('sealed-realms production workflow runtime composition', () => {
  it('rejects a lane from an independently built graph at its private source brand', async () => {
    const [dispatcherBuild, laneBuild] = await Promise.all([
      esbuild({
        entryPoints: ['scripts/sealed-realms-production-dispatch.mjs'],
        absWorkingDir: process.cwd(),
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node22',
        write: false,
      }),
      esbuild({
        entryPoints: ['scripts/sealed-realms-production-g001-lane-entry.mjs'],
        absWorkingDir: process.cwd(),
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node22',
        write: false,
      }),
    ]);
    const dispatcherModule = await import(
      `data:text/javascript;base64,${Buffer.from(dispatcherBuild.outputFiles[0]!.contents).toString('base64')}`
    );
    const laneModule = await import(
      `data:text/javascript;base64,${Buffer.from(laneBuild.outputFiles[0]!.contents).toString('base64')}`
    );
    const lane = laneModule.createSealedRealmsProductionG001Lane({
      launchAuthority: laneModule.createSealedRealmsProductionG001LaunchAuthority({
        readRawGit: () => { throw new Error('unreached'); },
        resolveAdminSecretPath: () => { throw new Error('unreached'); },
        persistPolicyObservation: () => { throw new Error('unreached'); },
      }),
      attestDispatcherNode: () => { throw new Error('unreached'); },
      runEnvelopeChild: () => { throw new Error('unreached'); },
      censusAuthority: undefined,
      currentState: {
        runChild: () => { throw new Error('unreached'); },
        readFixedFile: () => { throw new Error('unreached'); },
        resolveAccountUid: () => { throw new Error('unreached'); },
        resolveAccountHome: () => { throw new Error('unreached'); },
        testOnlyAdapter: undefined,
      },
      preflight: () => Object.freeze({}),
    });
    const dispatcher = dispatcherModule.createSealedRealmsProductionDispatcher({
      readGit: (arguments_: readonly string[]) => {
        if (arguments_[0] === 'rev-parse') return `${SOURCE}\n`;
        throw new Error('unexpected git');
      },
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: SOURCE,
      }),
      verifyEvidence: (verifiedSha: string) => ({ verifiedSha }),
      testOnlyLanes: { g001: lane },
    });

    await expect(dispatcher.dispatch({ operation: 'preflight', workflowInputSha: SOURCE }))
      .rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
  });

  it.each(ENTRIES)('$lane entry exports only its fixed runtime factory/run pair', async entry => {
    await installHarmlessRuntimeHarness();
    const module = await loadEntry(entry.path);

    expect(Object.keys(module).sort()).toEqual([entry.factory, entry.run].sort());
  });

  it.each(ENTRIES)('$lane entry owns and runs one same-graph branded operation', async entry => {
    await installHarmlessRuntimeHarness();
    const module = await loadEntry(entry.path);
    const factory = functionExport(module, entry.factory);
    const run = functionExport(module, entry.run);

    const runtime = await factory({ operation: entry.operation, workflowInputSha: SOURCE });
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Reflect.ownKeys(runtime)).toEqual([]);
    expect(JSON.stringify(runtime)).toBe('{}');
    await expect(run({ runtime, operation: entry.operation, workflowInputSha: SOURCE }))
      .resolves.toEqual(entry.expected);
    await expect(run({ runtime, operation: entry.operation, workflowInputSha: SOURCE }))
      .rejects.toMatchObject({ code: expect.stringMatching(/RUNTIME_(?:INVALID|CONSUMED)$/u) });
  });

  it.each(ENTRIES)('$lane entry rejects caller adapters and cross-lane selection', async entry => {
    await installHarmlessRuntimeHarness();
    const module = await loadEntry(entry.path);
    const factory = functionExport(module, entry.factory);
    const run = functionExport(module, entry.run);

    for (const injected of [
      { readGit: () => `${SOURCE}\n` },
      { adapter: Object.freeze({}) },
      { callback: () => {} },
      { constructor: class Forged {} },
      { importPath: '../scripts/sealed-realms-production-dispatch.mjs' },
      { privateState: Object.freeze({}) },
    ]) {
      expect(() => factory({
        operation: entry.operation,
        workflowInputSha: SOURCE,
        ...injected,
      })).toThrow(expect.objectContaining({ code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u) }));
    }
    const symbolInjected = {
      operation: entry.operation,
      workflowInputSha: SOURCE,
      [Symbol('callback')]: () => {},
    };
    expect(() => factory(symbolInjected)).toThrow(expect.objectContaining({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    }));
    const hiddenInjected = { operation: entry.operation, workflowInputSha: SOURCE };
    Object.defineProperty(hiddenInjected, 'callback', { value: () => {} });
    expect(() => factory(hiddenInjected)).toThrow(expect.objectContaining({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    }));
    const accessorInjected = Object.defineProperties({}, {
      operation: { enumerable: true, get: () => entry.operation },
      workflowInputSha: { enumerable: true, get: () => SOURCE },
    });
    expect(() => factory(accessorInjected)).toThrow(expect.objectContaining({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    }));
    expect(() => factory({
      operation: entry.crossedOperation,
      workflowInputSha: SOURCE,
    })).toThrow(expect.objectContaining({ code: expect.stringMatching(/WORKFLOW_OPERATION_INVALID$/u) }));
    expect(() => factory({ operation: entry.operation, workflowInputSha: 'not-a-sha' }))
      .toThrow(expect.objectContaining({ code: expect.stringMatching(/WORKFLOW_SOURCE_INVALID$/u) }));

    const runtime = await factory({ operation: entry.operation, workflowInputSha: SOURCE });
    await expect(run({ runtime: Object.freeze({}), operation: entry.operation, workflowInputSha: SOURCE }))
      .rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_RUNTIME_INVALID$/u) });
    await expect(run({ runtime, operation: entry.crossedOperation, workflowInputSha: SOURCE }))
      .rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_OPERATION_INVALID$/u) });
    await expect(run({ runtime, operation: entry.operation, workflowInputSha: SWAPPED_SOURCE }))
      .rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_SOURCE_INVALID$/u) });
    await expect(run({
      runtime,
      operation: entry.operation,
      workflowInputSha: SOURCE,
      callback: () => {},
    })).rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u) });
    await expect(run({
      runtime,
      operation: entry.operation,
      workflowInputSha: SOURCE,
      [Symbol('callback')]: () => {},
    })).rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u) });
  });

  it('imports all four entries without constructing a runtime or invoking an adapter', async () => {
    const harness = await installHarmlessRuntimeHarness();
    for (const entry of ENTRIES) await loadEntry(entry.path);

    expect(harness.execFileSync).not.toHaveBeenCalled();
    expect(harness.createPrivateState).not.toHaveBeenCalled();
    expect(harness.createBridgeState).not.toHaveBeenCalled();
    expect(harness.createReconciler).not.toHaveBeenCalled();
    expect(harness.inspectG002Publish).not.toHaveBeenCalled();
    expect(harness.inspectPtrPublish).not.toHaveBeenCalled();
  });
});
