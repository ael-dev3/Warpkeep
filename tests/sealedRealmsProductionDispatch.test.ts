import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
// @vitest-environment node

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { build as esbuild } from 'esbuild';

import {
  createSealedRealmsProductionContinuationStore,
} from '../scripts/sealed-realms-production-continuation.mjs';
import {
  createSealedRealmsProductionPublicationReconciler,
} from '../scripts/sealed-realms-production-reconciliation.mjs';
import {
  createSealedRealmsProductionAuthBridgeState,
} from '../scripts/sealed-realms-production-auth-bridge-state.mjs';
import * as dispatchSurface from '../scripts/sealed-realms-production-dispatch.mjs';
import {
  createSealedRealmsProductionG001DispatchContext,
  createSealedRealmsProductionG001Dispatcher,
  createSealedRealmsProductionG001Lane,
  createSealedRealmsProductionG001LaunchAuthority,
} from '../scripts/sealed-realms-production-g001-lane-entry.mjs';
import * as g001Surface from '../scripts/sealed-realms-production-g001-lane-entry.mjs';
import * as g002Surface from '../scripts/sealed-realms-production-g002-lane-entry.mjs';
import * as ptrSurface from '../scripts/sealed-realms-production-ptr-lane-entry.mjs';
import * as activationSurface from '../scripts/sealed-realms-production-activation-lane-entry.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';
import {
  issueSealedRealmsProductionWorkflowPermit,
} from '../scripts/sealed-realms-production-workflow-authority.mjs';

const S = '1'.repeat(40);
const TOKEN = 'github-sealed-realms-owner-token';
const RUN_ID = '9001';

function sourceAuthority(operation = 'preflight') {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: S,
    readGit: () => `${S}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: commit => ({ verifiedSha: commit }),
  });
}

function githubResponse(url: string, body: unknown) {
  const encoded = JSON.stringify(body);
  const response = new Response(encoded, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(encoded)),
    },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function github(sourceCommit: string) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return githubResponse(url, {
        name: 'main', protected: true, commit: { sha: sourceCommit },
      });
    }
    return githubResponse(url, {
      id: Number(RUN_ID),
      run_attempt: 1,
      event: 'workflow_dispatch',
      status: 'in_progress',
      conclusion: null,
      head_branch: 'main',
      head_sha: sourceCommit,
      path: '.github/workflows/sealed-realms-production.yml',
      repository: { full_name: 'ael-dev3/Warpkeep' },
    });
  });
}

function privateFixture(createState = createSealedRealmsProductionPrivateState) {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-dispatch-task5-'));
  for (const root of [
    join(sealedRealmsPrivateBase(home), 'audit', 'private'),
    join(sealedRealmsPrivateBase(home), 'runtime'),
    join(sealedRealmsPrivateBase(home), 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const privateState = createState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyFsync: () => {},
    testOnlyAllowPlatformMode: true,
  });
  return Object.freeze({
    privateState,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  });
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.unstubAllGlobals();
});

async function protectedContext(operation = 'preflight') {
  const fixture = privateFixture();
  cleanups.push(fixture.cleanup);
  const source = sourceAuthority(operation);
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority: source,
    githubToken: TOKEN,
    runId: RUN_ID,
    runAttempt: '1',
    fetchImpl: github(S),
  });
  const continuationStore = createSealedRealmsProductionContinuationStore({
    privateState: fixture.privateState,
  });
  return Object.freeze({ permit, continuationStore, sourceAuthority: source });
}

function dispatcherInput(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    readGit: () => `${S}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
    ...extra,
  };
}

function g001LaneInput(preflight = vi.fn(async () => undefined)) {
  const fixture = privateFixture();
  cleanups.push(fixture.cleanup);
  return Object.freeze({
    input: {
      launchAuthority: createSealedRealmsProductionG001LaunchAuthority({
        readRawGit: () => `${S}\n`,
        resolveAdminSecretPath: () => ({ sourceCommit: S, path: '/private/unreachable' }),
        privateState: fixture.privateState,
      }),
      attestDispatcherNode: () => { throw new Error('unreachable'); },
      runEnvelopeChild: () => { throw new Error('unreachable'); },
      censusAuthority: undefined,
      currentState: {
        runChild: () => { throw new Error('unreachable'); },
        readFixedFile: () => { throw new Error('unreachable'); },
        resolveAccountUid: () => { throw new Error('unreachable'); },
        resolveAccountHome: () => { throw new Error('unreachable'); },
        testOnlyAdapter: undefined,
      },
      currentStateOperator: () => { throw new Error('unreachable'); },
      preflight,
    },
    preflight,
  });
}

function preflightLane(preflight = vi.fn(async () => undefined)) {
  const member = g001LaneInput(preflight);
  return Object.freeze({
    lane: createSealedRealmsProductionG001Lane(member.input as never),
    preflight: member.preflight,
  });
}

function unavailableCompositionAdapter() {
  throw new Error('unreachable');
}

function bridgeForLaneComposition(
  privateState: ReturnType<typeof createSealedRealmsProductionPrivateState>,
  authority: ReturnType<typeof sourceAuthority>,
) {
  return createSealedRealmsProductionAuthBridgeState({
    authority,
    privateState,
    repositoryRoot: process.cwd(),
    deploymentAttester: unavailableCompositionAdapter,
    bindingAttester: unavailableCompositionAdapter,
    fetchImpl: unavailableCompositionAdapter,
    inspectImportReceipt: unavailableCompositionAdapter,
    authenticateImportResult: unavailableCompositionAdapter,
    resolveOwnerProvisionReceipt: unavailableCompositionAdapter,
  } as never);
}

function revokedProxy<T extends object>(value: T) {
  const proxy = Proxy.revocable(value, {});
  proxy.revoke();
  return proxy.proxy;
}

describe('sealed-realms production dispatch continuation boundary', () => {
  it('keeps each workflow bundle limited to its one applicable lane graph', async () => {
    const lanes = ['g001', 'g002', 'ptr', 'activation'] as const;
    const builds = await Promise.all(lanes.map(lane => esbuild({
      entryPoints: [`scripts/sealed-realms-production-${lane}-workflow-entry.mjs`],
      absWorkingDir: process.cwd(),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      write: false,
      metafile: true,
    })));
    for (const [index, build] of builds.entries()) {
      const lane = lanes[index]!;
      const inputs = Object.keys(build.metafile!.inputs).map(input => input.replaceAll('\\', '/'));
      for (const candidate of lanes) {
        expect(inputs.some(input => input.endsWith(
          `/sealed-realms-production-${candidate}-lane-entry.mjs`,
        ))).toBe(candidate === lane);
      }
    }
  });

  it('rejects an authentic lane branded by a different bundled lane graph', async () => {
    const laneBuild = await esbuild({
      stdin: { contents: `export * from './scripts/sealed-realms-production-g001-lane-entry.mjs';
        export { createSealedRealmsProductionPrivateState } from './scripts/sealed-realms-production-private-state.mjs';`,
        resolveDir: process.cwd() },
      absWorkingDir: process.cwd(),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      write: false,
    });
    const bundledLane = await import(
      `data:text/javascript;base64,${Buffer.from(laneBuild.outputFiles[0]!.contents).toString('base64')}`
    );
    const bundledFixture = privateFixture(bundledLane.createSealedRealmsProductionPrivateState);
    cleanups.push(bundledFixture.cleanup);
    const lane = bundledLane.createSealedRealmsProductionG001Lane({
      launchAuthority: bundledLane.createSealedRealmsProductionG001LaunchAuthority({
        readRawGit: () => `${S}\n`,
        resolveAdminSecretPath: () => ({ sourceCommit: S, path: '/private/unreachable' }),
        privateState: bundledFixture.privateState,
      }),
      attestDispatcherNode: () => { throw new Error('unreachable'); },
      runEnvelopeChild: () => { throw new Error('unreachable'); },
      censusAuthority: undefined,
      currentState: {
        runChild: () => { throw new Error('unreachable'); },
        readFixedFile: () => { throw new Error('unreachable'); },
        resolveAccountUid: () => { throw new Error('unreachable'); },
        resolveAccountHome: () => { throw new Error('unreachable'); },
        testOnlyAdapter: undefined,
      },
      currentStateOperator: () => { throw new Error('unreachable'); },
      preflight: () => undefined,
    });
    const protectedMember = await protectedContext();
    const context = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...protectedMember,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    expect(() => createSealedRealmsProductionG001Dispatcher({ context, lane } as never))
      .toThrow(expect.objectContaining({
        code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
      }));
  });

  it('requires the internally branded permit/store and fixed run identity at construction', () => {
    const { lane } = preflightLane();
    expect(() => createSealedRealmsProductionG001Dispatcher({
      context: Object.freeze({}), lane,
    } as never))
      .toThrow(expect.objectContaining({ code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID' }));
  });

  it('rejects the legacy unbranded test lane bypass even with a real protected context', async () => {
    const context = await protectedContext();
    const effect = vi.fn(async () => Object.freeze({ status: 'preflight-inspected' }));
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    const { lane } = preflightLane();
    expect(() => createSealedRealmsProductionG001Dispatcher({
      context: dispatchContext,
      lane,
      testOnlyLanes: { g001: { execute: effect } },
    } as never)).toThrow(expect.objectContaining({
      code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
    }));
    expect(effect).not.toHaveBeenCalled();
  });

  it('rejects structural, unbranded, and wrong-slot lanes at construction', async () => {
    const context = await protectedContext();
    const execute = vi.fn(async () => Object.freeze({ status: 'preflight-inspected' }));
    const common = {
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    };
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(
      dispatcherInput(common) as never,
    );

    expect(() => createSealedRealmsProductionG001Dispatcher({
      context: dispatchContext,
      lane: Object.freeze({ execute }),
    } as never)).toThrow(expect.objectContaining({
      code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
    }));

    const { lane } = preflightLane();
    expect(() => g002Surface.createSealedRealmsProductionG002Dispatcher({
      context: g002Surface.createSealedRealmsProductionG002DispatchContext(
        dispatcherInput(common) as never,
      ),
      lane,
    } as never)).toThrow(expect.objectContaining({
      code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
    }));
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a structural lane even after a same-graph caller imports every minting surface', async () => {
    const context = await protectedContext();
    const execute = vi.fn(async () => Object.freeze({ status: 'preflight-inspected' }));
    const forged = Object.freeze({ execute });
    const surfaces = [
      dispatchSurface, g001Surface, g002Surface, ptrSurface, activationSurface,
    ];
    expect(surfaces.flatMap(surface => Object.keys(surface)))
      .not.toEqual(expect.arrayContaining([
        'registerSealedRealmsProductionLane',
        'createSealedRealmsProductionDispatcher',
      ]));
    expect(surfaces.flatMap(surface => Object.keys(surface)).some(
      name => /(?:register|registrar|mint).*lane/iu.test(name),
    )).toBe(false);
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);

    expect(() => createSealedRealmsProductionG001Dispatcher({
      context: dispatchContext,
      lane: forged,
    } as never)).toThrow(expect.objectContaining({
      code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
    }));
    expect(execute).not.toHaveBeenCalled();
  });

  it('exposes no prepared-request opener, invocation minter, or raw context handoff', async () => {
    const surfaces = [
      dispatchSurface, g001Surface, g002Surface, ptrSurface, activationSurface,
    ];
    const names = surfaces.flatMap(surface => Object.keys(surface));
    expect(names).not.toContain('openSealedRealmsProductionPreparedDispatch');
    expect(names.some(name => /(?:open|recover|mint|issue|create).*invocation/iu.test(name)))
      .toBe(false);

    const protectedMember = await protectedContext();
    const context = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...protectedMember,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    const { lane } = preflightLane();
    const dispatcher = createSealedRealmsProductionG001Dispatcher({ context, lane });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Reflect.ownKeys(context)).toEqual([]);
    expect(Reflect.ownKeys(dispatcher)).toEqual(['dispatch']);
    expect(JSON.stringify({ context, lane, dispatcher })).toBe(
      '{"context":{},"lane":{},"dispatcher":{}}',
    );
  });

  it('returns an opaque frozen G001 lane with no callable executor', () => {
    const { lane, preflight } = preflightLane();
    expect(Object.isFrozen(lane)).toBe(true);
    expect(Reflect.ownKeys(lane)).toEqual([]);
    expect((lane as Record<string, unknown>).execute).toBeUndefined();
    expect(preflight).not.toHaveBeenCalled();
  });

  it('rejects forged prepared and invocation handoffs before any lane callback', async () => {
    const context = await protectedContext();
    const { lane, preflight } = preflightLane();
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    const dispatcher = createSealedRealmsProductionG001Dispatcher({
      context: dispatchContext,
      lane,
    });

    for (const forged of [
      { invocation: Object.freeze({}) },
      { prepared: Object.freeze({}) },
      { lane },
      { authority: context.sourceAuthority, continuation: Object.freeze({}) },
    ]) {
      await expect(dispatcher.dispatch({
        operation: 'preflight',
        workflowInputSha: S,
        ...forged,
      } as never)).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID' });
    }
    expect(preflight).not.toHaveBeenCalled();
  });

  it('snapshots the public request and rejects accessor substitution before preparation', async () => {
    const context = await protectedContext();
    const { lane, preflight } = preflightLane();
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    const dispatcher = createSealedRealmsProductionG001Dispatcher({
      context: dispatchContext,
      lane,
    });
    let operationRead = 0;
    const request = {};
    Object.defineProperties(request, {
      operation: {
        enumerable: true,
        get: () => (++operationRead === 1 ? 'preflight' : 'g001-policy-observe'),
      },
      workflowInputSha: { enumerable: true, value: S },
    });

    await expect(dispatcher.dispatch(request as never)).rejects.toMatchObject({
      code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID',
    });
    expect(preflight).not.toHaveBeenCalled();
  });

  it('rejects transparent and revoked public request proxies before the preflight effect', async () => {
    const context = await protectedContext();
    const { lane, preflight } = preflightLane();
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    const dispatcher = createSealedRealmsProductionG001Dispatcher({ context: dispatchContext, lane });
    const request = { operation: 'preflight', workflowInputSha: S };

    await expect(dispatcher.dispatch(new Proxy(request, {}) as never)).rejects.toMatchObject({
      code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID',
    });
    await expect(dispatcher.dispatch(revokedProxy(request) as never)).rejects.toMatchObject({
      code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID',
    });
    expect(preflight).not.toHaveBeenCalled();
  });

  it.each(['transparent', 'revoked'] as const)(
    'rejects a %s nested runAttempt proxy before coercion or the preflight effect',
    async label => {
      const protectedMember = await protectedContext();
      const { lane, preflight } = preflightLane();
      const coerce = vi.fn(() => '1');
      const target = { [Symbol.toPrimitive]: coerce };
      const runAttempt = label === 'transparent'
        ? new Proxy(target, {})
        : revokedProxy(target);

      await expect((async () => {
        const context = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
          ...protectedMember,
          runId: RUN_ID,
          runAttempt,
        }) as never);
        const dispatcher = createSealedRealmsProductionG001Dispatcher({ context, lane });
        return dispatcher.dispatch({ operation: 'preflight', workflowInputSha: S });
      })()).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
      });
      expect(coerce).not.toHaveBeenCalled();
      expect(preflight).not.toHaveBeenCalled();
    },
  );

  it('rejects transparent and revoked context/composer proxies across all lane graphs', async () => {
    const fixture = privateFixture();
    cleanups.push(fixture.cleanup);
    const g001 = g001LaneInput();
    const g002Authority = sourceAuthority('g002-publish-inspect');
    const ptrAuthority = sourceAuthority('ptr-publish-inspect');
    const activationAuthority = sourceAuthority('activation-evidence-inspect');
    const g002Bridge = bridgeForLaneComposition(fixture.privateState, g002Authority);
    const ptrBridge = bridgeForLaneComposition(fixture.privateState, ptrAuthority);
    const activationBridge = bridgeForLaneComposition(fixture.privateState, activationAuthority);
    const g002Input = {
      reconciler: createSealedRealmsProductionPublicationReconciler({
        privateState: fixture.privateState,
        lane: 'g002',
        postflight: unavailableCompositionAdapter as never,
      }),
      bridgeState: g002Bridge,
      createPublishMarker: unavailableCompositionAdapter,
      publish: unavailableCompositionAdapter,
      importCore: unavailableCompositionAdapter,
      liveInspect: unavailableCompositionAdapter,
    };
    const ptrInput = {
      reconciler: createSealedRealmsProductionPublicationReconciler({
        privateState: fixture.privateState,
        lane: 'ptr',
        postflight: unavailableCompositionAdapter as never,
      }),
      bridgeState: ptrBridge,
      createPublishMarker: unavailableCompositionAdapter,
      publish: unavailableCompositionAdapter,
      importCore: unavailableCompositionAdapter,
      inspectOwnerProvision: unavailableCompositionAdapter,
      provisionOwner: unavailableCompositionAdapter,
      liveInspect: unavailableCompositionAdapter,
    };
    const activationInput = { bridgeState: activationBridge };
    const compositions = [
      {
        operation: 'preflight',
        context: createSealedRealmsProductionG001DispatchContext,
        createLane: (input: never) => createSealedRealmsProductionG001Lane(input),
        laneInput: g001.input,
        laneInputError: 'SEALED_REALMS_G001_LANE_INPUT_INVALID',
        dispatcher: createSealedRealmsProductionG001Dispatcher,
      },
      {
        operation: 'g002-publish-inspect',
        context: g002Surface.createSealedRealmsProductionG002DispatchContext,
        createLane: (input: never) => g002Surface.createSealedRealmsProductionG002Lane(input),
        laneInput: g002Input,
        laneInputError: 'SEALED_REALMS_G002_LANE_INPUT_INVALID',
        dispatcher: g002Surface.createSealedRealmsProductionG002Dispatcher,
      },
      {
        operation: 'ptr-publish-inspect',
        context: ptrSurface.createSealedRealmsProductionPtrDispatchContext,
        createLane: (input: never) => ptrSurface.createSealedRealmsProductionPtrLane(input),
        laneInput: ptrInput,
        laneInputError: 'SEALED_REALMS_PTR_LANE_INPUT_INVALID',
        dispatcher: ptrSurface.createSealedRealmsProductionPtrDispatcher,
      },
      {
        operation: 'activation-evidence-inspect',
        context: activationSurface.createSealedRealmsProductionActivationDispatchContext,
        createLane: (input: never) => activationSurface.createSealedRealmsProductionActivationLane(input),
        laneInput: activationInput,
        laneInputError: 'SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID',
        dispatcher: activationSurface.createSealedRealmsProductionActivationDispatcher,
      },
    ] as const;

    for (const composition of compositions) {
      const protectedMember = await protectedContext(composition.operation);
      const contextInput = dispatcherInput({
        ...protectedMember,
        runId: RUN_ID,
        runAttempt: '1',
      });
      expect(() => composition.context(new Proxy(contextInput, {}) as never))
        .toThrow(expect.objectContaining({ code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID' }));
      expect(() => composition.context(revokedProxy(contextInput) as never))
        .toThrow(expect.objectContaining({ code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID' }));

      const context = composition.context(contextInput as never);
      expect(() => composition.createLane(new Proxy(composition.laneInput, {}) as never))
        .toThrow(expect.objectContaining({ code: composition.laneInputError }));
      expect(() => composition.createLane(revokedProxy(composition.laneInput) as never))
        .toThrow(expect.objectContaining({ code: composition.laneInputError }));
      const lane = composition.createLane(composition.laneInput as never);
      const composerInput = { context, lane };
      expect(() => composition.dispatcher(new Proxy(composerInput, {}) as never))
        .toThrow(expect.objectContaining({ code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID' }));
      expect(() => composition.dispatcher(revokedProxy(composerInput) as never))
        .toThrow(expect.objectContaining({ code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID' }));
    }
    expect(g001.preflight).not.toHaveBeenCalled();
  });

  it('rejects a same-graph accessor that swaps an authentic lane for a structural fake', async () => {
    const context = await protectedContext();
    const execute = vi.fn(async () => Object.freeze({ status: 'preflight-inspected' }));
    const forged = Object.freeze({ execute });
    const { lane } = preflightLane();
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    let laneRead = 0;
    const swappingInput = {};
    Object.defineProperties(swappingInput, {
      context: { enumerable: true, get: () => dispatchContext },
      lane: { enumerable: true, get: () => (++laneRead === 1 ? lane : forged) },
    });

    expect(() => createSealedRealmsProductionG001Dispatcher(swappingInput as never))
      .toThrow(expect.objectContaining({
        code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
      }));
    expect(execute).not.toHaveBeenCalled();
  });

  it('accepts no operational confirmation input and emits no confirmation material', async () => {
    const context = await protectedContext();
    const { lane, preflight } = preflightLane();
    const dispatchContext = createSealedRealmsProductionG001DispatchContext(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    }) as never);
    const dispatcher = createSealedRealmsProductionG001Dispatcher({
      context: dispatchContext,
      lane,
    });

    await expect(dispatcher.dispatch({
      operation: 'preflight',
      workflowInputSha: S,
      input: { confirmation: {} },
    } as never)).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID' });
    expect(preflight).not.toHaveBeenCalled();

    const result = await dispatcher.dispatch({ operation: 'preflight', workflowInputSha: S });
    expect(result).toEqual({ operation: 'preflight', status: 'preflight-inspected' });
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/confirmation|continuation|digest|path|token/iu);
  });
});
