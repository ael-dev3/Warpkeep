import {
  assertSealedRealmsProductionAuthBridgeState,
  assertSealedRealmsProductionAuthBridgeStateAuthority,
} from './sealed-realms-production-auth-bridge-state.mjs';
import {
  assertSealedRealmsProductionPublicationReconciler,
} from './sealed-realms-production-reconciliation.mjs';
import {
  assertSealedRealmsProductionContinuationStore,
  claimSealedRealmsProductionContinuation,
  classifySealedRealmsProductionContinuationNoEffect,
  issueSealedRealmsProductionContinuation,
  reconcileSealedRealmsProductionContinuation,
} from './sealed-realms-production-continuation.mjs';
import {
  assertSealedRealmsProductionWorkflowPermit,
} from './sealed-realms-production-workflow-authority.mjs';
import {
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  SealedRealmsProductionDispatcherError,
  assertSealedRealmsProductionDispatchContext,
  completeSealedRealmsProductionDispatch,
  earlySealedRealmsProductionDispatchResult,
  openSealedRealmsProductionPreparedDispatch,
  prepareSealedRealmsProductionDispatch,
  rejectSealedRealmsProductionLaneFailure,
} from './sealed-realms-production-dispatch.mjs';

const OPERATIONS = new Set([
  'ptr-publish-inspect', 'ptr-publish-apply', 'ptr-import-inspect',
  'ptr-import-apply', 'ptr-owner-provision-inspect', 'ptr-owner-provision',
  'ptr-live-inspect',
]);
const lanes = new WeakSet();

export class SealedRealmsProductionPtrLaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionPtrLaneError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionPtrLaneError(code); }

function record(value, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail(code);
  return value;
}

function requireContinuation(value, authority) {
  const request = record(value, 'SEALED_REALMS_PTR_LANE_REQUEST_INVALID');
  if (
    JSON.stringify(Object.keys(request))
      !== JSON.stringify(['permit', 'store', 'runId', 'runAttempt', 'sourceAuthority'])
    || !Object.isFrozen(request)
    || request.sourceAuthority !== authority
    || typeof request.runId !== 'string'
    || typeof request.runAttempt !== 'string'
  ) fail('SEALED_REALMS_PTR_LANE_REQUEST_INVALID');
  try {
    assertSealedRealmsProductionWorkflowPermit(request.permit);
    assertSealedRealmsProductionContinuationStore(request.store);
  } catch {
    fail('SEALED_REALMS_PTR_LANE_REQUEST_INVALID');
  }
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

async function classifyReconciliation(reconciliation, evidenceDigest, inspect) {
  const classification = await inspect();
  return classification.outcome === 'no-effect'
    ? classifySealedRealmsProductionContinuationNoEffect({
      reconciliation, evidenceDigest,
      observationDigest: classification.observationDigest,
    })
    : classification;
}

/** Owns PTR's publication, gate, import, and owner-provision seams. */
export function createSealedRealmsProductionPtrLane(input) {
  const options = record(input, 'SEALED_REALMS_PTR_LANE_INPUT_INVALID');
  const allowed = [
    'reconciler', 'bridgeState', 'createPublishMarker', 'publish', 'importCore',
    'inspectOwnerProvision', 'provisionOwner', 'liveInspect',
  ];
  if (
    Object.keys(options).some(key => !allowed.includes(key))
    || typeof options.createPublishMarker !== 'function'
    || typeof options.publish !== 'function'
    || typeof options.importCore !== 'function'
    || typeof options.inspectOwnerProvision !== 'function'
    || typeof options.provisionOwner !== 'function'
    || typeof options.liveInspect !== 'function'
  ) fail('SEALED_REALMS_PTR_LANE_INPUT_INVALID');
  const reconciler = assertSealedRealmsProductionPublicationReconciler(options.reconciler);
  const bridgeState = assertSealedRealmsProductionAuthBridgeState(options.bridgeState);

  const execute = async (input = {}) => {
    const request = record(input, 'SEALED_REALMS_PTR_LANE_REQUEST_INVALID');
    if (
      JSON.stringify(Object.keys(request))
        !== JSON.stringify(['operation', 'authority', 'continuation'])
    ) fail('SEALED_REALMS_PTR_LANE_REQUEST_INVALID');
    const { operation, authority } = request;
    if (!OPERATIONS.has(operation)) fail('SEALED_REALMS_PTR_LANE_OPERATION_INVALID');
    const continuation = requireContinuation(request.continuation, authority);
    const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(authority);
    const bridgeSourceCommit = preparationSourceCommitFromSealedRealmsProductionAuthority(authority);
    if (authority.operation !== operation) {
      fail('SEALED_REALMS_PTR_LANE_SOURCE_OPERATION_INVALID');
    }
    assertSealedRealmsProductionAuthBridgeStateAuthority(bridgeState, authority);
    if (authority.mode !== 'S' && operation !== 'ptr-live-inspect') {
      fail('SEALED_REALMS_PTR_LANE_SOURCE_MODE_INVALID');
    }
    if (operation === 'ptr-publish-inspect') {
      const marker = await options.createPublishMarker(Object.freeze({ sourceCommit }));
      const binding = await reconciler.inspectForContinuation({ marker });
      await issueSealedRealmsProductionContinuation(
        continuationInput(continuation, authority, 'ptr-publication', binding),
      );
      return Object.freeze({ status: 'publish-inspected' });
    }
    if (operation === 'ptr-publish-apply') {
      const binding = reconciler.reopenContinuation();
      const result = await claimOrReconcile({
        continuation,
        authority,
        kind: 'ptr-publication',
        binding,
        effect: claim => reconciler.consumeContinuationEntry({
          claim,
          store: continuation.store,
          sourceAuthority: authority,
          kind: 'ptr-publication',
          runId: continuation.runId,
          runAttempt: continuation.runAttempt,
          ...binding,
          publish: ({ marker }) => options.publish(Object.freeze({ sourceCommit, marker })),
        }),
        reconcile: reconciliation => reconciler.reconcileContinuation({
          reconciliation, selection: binding,
        }),
      });
      return Object.freeze({ status: result.status });
    }
    if (operation === 'ptr-import-inspect') {
      const binding = await bridgeState.inspectGateForContinuation({ lane: 'ptr' });
      await issueSealedRealmsProductionContinuation(
        continuationInput(continuation, authority, 'ptr-import', binding),
      );
      return Object.freeze({ status: 'import-inspected' });
    }
    if (operation === 'ptr-import-apply') {
      const binding = await bridgeState.reopenGateContinuation({ lane: 'ptr' });
      const result = await claimOrReconcile({
        continuation,
        authority,
        kind: 'ptr-import',
        binding,
        effect: claim => bridgeState.applyGateForContinuation({
          claim,
          store: continuation.store,
          sourceAuthority: authority,
          kind: 'ptr-import',
          runId: continuation.runId,
          runAttempt: continuation.runAttempt,
          ...binding,
          lane: 'ptr',
          apply: () => options.importCore(Object.freeze({ sourceCommit })),
        }),
        reconcile: reconciliation => classifyReconciliation(
          reconciliation,
          binding.evidenceDigest,
          () => bridgeState.reconcileGateContinuation({ selection: binding }),
        ),
      });
      return Object.freeze({ status: result.status });
    }
    if (operation === 'ptr-owner-provision-inspect') {
      const binding = await bridgeState.inspectOwnerProvisionEvidenceForContinuation({
        inspect: () => options.inspectOwnerProvision(Object.freeze({ sourceCommit })),
      });
      await issueSealedRealmsProductionContinuation(
        continuationInput(continuation, authority, 'ptr-owner-provision', binding),
      );
      return Object.freeze({ status: 'owner-provision-inspected' });
    }
    if (operation === 'ptr-owner-provision') {
      const binding = await bridgeState.reopenOwnerProvisionContinuation();
      const result = await claimOrReconcile({
        continuation,
        authority,
        kind: 'ptr-owner-provision',
        binding,
        effect: claim => bridgeState.applyOwnerProvisionForContinuation({
          claim,
          store: continuation.store,
          sourceAuthority: authority,
          kind: 'ptr-owner-provision',
          runId: continuation.runId,
          runAttempt: continuation.runAttempt,
          ...binding,
          provision: () => options.provisionOwner(Object.freeze({ sourceCommit })),
        }),
        reconcile: reconciliation => classifyReconciliation(
          reconciliation,
          binding.evidenceDigest,
          () => bridgeState.reconcileOwnerProvisionContinuation({ selection: binding }),
        ),
      });
      return Object.freeze({ status: result.status });
    }
    await bridgeState.inspectLiveEvidence({
      lane: 'ptr',
      inspect: () => options.liveInspect(Object.freeze({ sourceCommit: bridgeSourceCommit })),
    });
    return Object.freeze({ status: 'live-inspected' });
  };
  const lane = Object.freeze({ execute });
  lanes.add(lane);
  return lane;
}

export function assertSealedRealmsProductionPtrLane(lane) {
  if (!lanes.has(lane)) fail('SEALED_REALMS_PTR_LANE_CAPABILITY_INVALID');
  return lane;
}

/** Composes only an authentic PTR lane with an opaque fixed dispatch context. */
export function createSealedRealmsProductionPtrDispatcher(input) {
  let context;
  let lane;
  try {
    if (
      input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) throw new Error('invalid input');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      JSON.stringify(Reflect.ownKeys(descriptors)) !== JSON.stringify(['context', 'lane'])
      || !Object.hasOwn(descriptors.context, 'value') || !descriptors.context.enumerable
      || !Object.hasOwn(descriptors.lane, 'value') || !descriptors.lane.enumerable
    ) throw new Error('invalid input');
    context = descriptors.context.value;
    lane = descriptors.lane.value;
    assertSealedRealmsProductionDispatchContext(context);
    assertSealedRealmsProductionPtrLane(lane);
  } catch {
    throw new SealedRealmsProductionDispatcherError('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }
  return Object.freeze({
    dispatch: async request => {
      const prepared = prepareSealedRealmsProductionDispatch(context, request);
      const early = earlySealedRealmsProductionDispatchResult(prepared);
      if (early !== undefined) return early;
      const opened = openSealedRealmsProductionPreparedDispatch(prepared);
      if (opened.lane !== 'ptr') {
        return completeSealedRealmsProductionDispatch(prepared, { status: 'unavailable' });
      }
      let result;
      try {
        result = await lane.execute(opened.request);
      } catch (error) {
        rejectSealedRealmsProductionLaneFailure(error);
      }
      return completeSealedRealmsProductionDispatch(prepared, result);
    },
  });
}
