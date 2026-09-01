import {
  assertSealedRealmsProductionAuthBridgeState,
  assertSealedRealmsProductionAuthBridgeStateAuthority,
} from './sealed-realms-production-auth-bridge-state.mjs';
import {
  assertSealedRealmsProductionPublicationReconciler,
} from './sealed-realms-production-reconciliation.mjs';
import {
  claimSealedRealmsProductionContinuation,
  issueSealedRealmsProductionContinuation,
  reconcileSealedRealmsProductionContinuation,
} from './sealed-realms-production-continuation.mjs';
import {
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';

const OPERATIONS = new Set([
  'g002-publish-inspect', 'g002-publish-apply', 'g002-import-inspect',
  'g002-import-apply', 'g002-live-inspect',
]);
const lanes = new WeakSet();

export class SealedRealmsProductionG002LaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionG002LaneError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionG002LaneError(code); }

function record(value, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail(code);
  return value;
}

function confirmationInput(value, code) {
  const request = record(value, code);
  if (
    JSON.stringify(Object.keys(request)) !== JSON.stringify(['confirmation'])
    || request.confirmation === null || typeof request.confirmation !== 'object'
    || Array.isArray(request.confirmation)
    || Object.getPrototypeOf(request.confirmation) !== Object.prototype
    || Object.keys(request.confirmation).length !== 0
  ) fail(code);
  return request;
}

function continuationInput(continuation, authority, kind, binding) {
  return Object.freeze({
    store: continuation.store,
    permit: continuation.permit,
    sourceAuthority: authority,
    kind,
    runId: continuation.runId,
    runAttempt: continuation.runAttempt,
    ...binding,
  });
}

async function claimOrReconcile({ continuation, authority, kind, binding, effect, reconcile }) {
  const common = continuationInput(continuation, authority, kind, binding);
  try {
    return await claimSealedRealmsProductionContinuation({ ...common, effect });
  } catch (error) {
    if (error?.code !== 'SEALED_REALMS_CONTINUATION_AMBIGUOUS') throw error;
    await reconcileSealedRealmsProductionContinuation({
      ...common,
      readOnlyReconcile: reconcile,
    });
    return Object.freeze({ status: 'completed' });
  }
}

/** Owns only G002's receipt-derived marker and bridge-gate seams. */
export function createSealedRealmsProductionG002Lane(input) {
  const options = record(input, 'SEALED_REALMS_G002_LANE_INPUT_INVALID');
  const allowed = [
    'reconciler', 'bridgeState', 'createPublishMarker', 'publish', 'importCore', 'liveInspect',
  ];
  if (
    Object.keys(options).some(key => !allowed.includes(key))
    || typeof options.createPublishMarker !== 'function'
    || typeof options.publish !== 'function'
    || typeof options.importCore !== 'function'
    || typeof options.liveInspect !== 'function'
  ) fail('SEALED_REALMS_G002_LANE_INPUT_INVALID');
  const reconciler = assertSealedRealmsProductionPublicationReconciler(options.reconciler);
  const bridgeState = assertSealedRealmsProductionAuthBridgeState(options.bridgeState);

  const execute = async ({ operation, authority, input, continuation } = {}) => {
    if (!OPERATIONS.has(operation)) fail('SEALED_REALMS_G002_LANE_OPERATION_INVALID');
    const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
    const bridgeSourceCommit = preparationSourceCommitFromSealedRealmsProductionAuthority(authority);
    if (authority.operation !== operation) {
      fail('SEALED_REALMS_G002_LANE_SOURCE_OPERATION_INVALID');
    }
    assertSealedRealmsProductionAuthBridgeStateAuthority(bridgeState, authority);
    if (authority.mode !== 'S' && operation !== 'g002-live-inspect') {
      fail('SEALED_REALMS_G002_LANE_SOURCE_MODE_INVALID');
    }
    if (operation === 'g002-publish-inspect') {
      const marker = await options.createPublishMarker(Object.freeze({ sourceCommit }));
      if (continuation !== undefined) {
        const binding = await reconciler.inspectForContinuation({ marker });
        await issueSealedRealmsProductionContinuation(
          continuationInput(continuation, authority, 'g002-publication', binding),
        );
        return Object.freeze({ status: 'publish-inspected' });
      }
      const inspected = await reconciler.inspect({ marker });
      return inspected.confirmation === undefined
        ? Object.freeze({ status: 'publish-inspected' })
        : Object.freeze({ status: 'publish-inspected', confirmation: inspected.confirmation });
    }
    if (operation === 'g002-publish-apply') {
      if (continuation !== undefined) {
        const binding = reconciler.reopenContinuation();
        const result = await claimOrReconcile({
          continuation,
          authority,
          kind: 'g002-publication',
          binding,
          effect: () => reconciler.consumeContinuationEntry({
            publish: ({ marker }) => options.publish(Object.freeze({ sourceCommit, marker })),
          }),
          reconcile: () => reconciler.reconcileContinuation(),
        });
        return Object.freeze({ status: result.status });
      }
      const value = confirmationInput(input, 'SEALED_REALMS_G002_LANE_REQUEST_INVALID');
      const result = await reconciler.apply({
        confirmation: value.confirmation,
        publish: ({ confirmation }) => options.publish(Object.freeze({ sourceCommit, confirmation })),
      });
      return Object.freeze({ status: result.status });
    }
    if (operation === 'g002-import-inspect') {
      if (continuation !== undefined) {
        const binding = await bridgeState.inspectGateForContinuation({ lane: 'g002' });
        await issueSealedRealmsProductionContinuation(
          continuationInput(continuation, authority, 'g002-import', binding),
        );
        return Object.freeze({ status: 'import-inspected' });
      }
      const result = await bridgeState.inspectGate({ lane: 'g002' });
      return Object.freeze({ status: 'import-inspected', confirmation: result.confirmation });
    }
    if (operation === 'g002-import-apply') {
      if (continuation !== undefined) {
        const binding = await bridgeState.reopenGateContinuation({ lane: 'g002' });
        const result = await claimOrReconcile({
          continuation,
          authority,
          kind: 'g002-import',
          binding,
          effect: () => bridgeState.applyGateForContinuation({
            lane: 'g002',
            apply: () => options.importCore(Object.freeze({ sourceCommit })),
          }),
          reconcile: () => bridgeState.reconcileGateContinuation({ lane: 'g002' }),
        });
        return Object.freeze({ status: result.status });
      }
      const value = confirmationInput(input, 'SEALED_REALMS_G002_LANE_REQUEST_INVALID');
      const result = await bridgeState.applyGate({
        confirmation: value.confirmation,
        apply: () => options.importCore(Object.freeze({ sourceCommit })),
      });
      return Object.freeze({ status: result.status });
    }
    await bridgeState.inspectLiveEvidence({
      lane: 'g002',
      inspect: () => options.liveInspect(Object.freeze({ sourceCommit: bridgeSourceCommit })),
    });
    return Object.freeze({ status: 'live-inspected' });
  };
  const lane = Object.freeze({ execute });
  lanes.add(lane);
  return lane;
}

export function assertSealedRealmsProductionG002Lane(lane) {
  if (!lanes.has(lane)) fail('SEALED_REALMS_G002_LANE_CAPABILITY_INVALID');
  return lane;
}
