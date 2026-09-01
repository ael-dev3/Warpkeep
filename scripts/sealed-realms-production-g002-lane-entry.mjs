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
  assertSealedRealmsProductionDispatchContextInput,
  authenticateSealedRealmsProductionDispatch,
  completeSealedRealmsProductionDispatch,
  earlySealedRealmsProductionDispatchResult,
  rejectSealedRealmsProductionLaneFailure,
} from './sealed-realms-production-dispatch.mjs';

const OPERATIONS = new Set([
  'g002-publish-inspect', 'g002-publish-apply', 'g002-import-inspect',
  'g002-import-apply', 'g002-live-inspect',
]);
const CONTEXT_KEYS = [
  'readGit', 'readBinding', 'verifyEvidence',
  'permit', 'continuationStore', 'runId', 'runAttempt', 'sourceAuthority',
];
const laneExecutors = new WeakMap();
const dispatchContexts = new WeakMap();
const preparedDispatches = new WeakMap();
const consumedPreparedDispatches = new WeakSet();
const invocations = new WeakMap();
const consumedInvocations = new WeakSet();

export class SealedRealmsProductionG002LaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionG002LaneError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionG002LaneError(code); }

function exactDispatchContextInput(input) {
  try {
    if (
      input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) throw new Error('invalid input');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const descriptorKeys = Reflect.ownKeys(descriptors);
    if (
      descriptorKeys.length !== CONTEXT_KEYS.length
      || descriptorKeys.some(key => typeof key !== 'string' || !CONTEXT_KEYS.includes(key))
      || CONTEXT_KEYS.some(key => (
        !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable
      ))
    ) throw new Error('invalid input');
    const options = Object.freeze(Object.fromEntries(
      CONTEXT_KEYS.map(key => [key, descriptors[key].value]),
    ));
    assertSealedRealmsProductionDispatchContextInput(options);
    return options;
  } catch {
    throw new SealedRealmsProductionDispatcherError('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }
}

export function createSealedRealmsProductionG002DispatchContext(input) {
  const options = exactDispatchContextInput(input);
  const context = Object.freeze({});
  dispatchContexts.set(context, Object.freeze({
    readGit: options.readGit,
    readBinding: options.readBinding,
    verifyEvidence: options.verifyEvidence,
    continuation: Object.freeze({
      permit: options.permit,
      store: options.continuationStore,
      runId: options.runId,
      runAttempt: String(options.runAttempt),
      sourceAuthority: options.sourceAuthority,
    }),
  }));
  return context;
}

function assertDispatchContext(context) {
  if (!dispatchContexts.has(context)) {
    throw new SealedRealmsProductionDispatcherError('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }
  return context;
}

function prepareDispatch(context, request) {
  const member = dispatchContexts.get(context);
  if (member === undefined) {
    throw new SealedRealmsProductionDispatcherError('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }
  const authenticated = authenticateSealedRealmsProductionDispatch({
    request,
    readGit: member.readGit,
    readBinding: member.readBinding,
    verifyEvidence: member.verifyEvidence,
    sourceAuthority: member.continuation.sourceAuthority,
  });
  const prepared = Object.freeze({});
  preparedDispatches.set(prepared, Object.freeze({
    operation: authenticated.operation,
    lane: authenticated.lane,
    request: Object.freeze({
      operation: authenticated.operation,
      authority: member.continuation.sourceAuthority,
      continuation: member.continuation,
    }),
  }));
  return prepared;
}

function consumePrepared(prepared) {
  const member = preparedDispatches.get(prepared);
  if (member === undefined || consumedPreparedDispatches.has(prepared)) {
    fail('SEALED_REALMS_G002_LANE_INVOCATION_INVALID');
  }
  preparedDispatches.delete(prepared);
  consumedPreparedDispatches.add(prepared);
  return member;
}

function createInvocation(prepared, lane) {
  const member = consumePrepared(prepared);
  const executor = laneExecutors.get(lane);
  if (member.lane !== 'g002' || executor === undefined) {
    fail('SEALED_REALMS_G002_LANE_INVOCATION_INVALID');
  }
  const invocation = Object.freeze({});
  invocations.set(invocation, Object.freeze({ prepared, lane, executor, request: member.request }));
  return Object.freeze({ invocation, operation: member.operation });
}

async function consumeInvocation(invocation, prepared, lane) {
  const member = invocations.get(invocation);
  if (
    member === undefined || consumedInvocations.has(invocation)
    || member.prepared !== prepared || member.lane !== lane
  ) fail('SEALED_REALMS_G002_LANE_INVOCATION_INVALID');
  invocations.delete(invocation);
  consumedInvocations.add(invocation);
  return member.executor(member.request);
}

function record(value, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail(code);
  return value;
}

function requireContinuation(value, authority) {
  const request = record(value, 'SEALED_REALMS_G002_LANE_REQUEST_INVALID');
  if (
    JSON.stringify(Object.keys(request))
      !== JSON.stringify(['permit', 'store', 'runId', 'runAttempt', 'sourceAuthority'])
    || !Object.isFrozen(request)
    || request.sourceAuthority !== authority
    || typeof request.runId !== 'string'
    || typeof request.runAttempt !== 'string'
  ) fail('SEALED_REALMS_G002_LANE_REQUEST_INVALID');
  try {
    assertSealedRealmsProductionWorkflowPermit(request.permit);
    assertSealedRealmsProductionContinuationStore(request.store);
  } catch {
    fail('SEALED_REALMS_G002_LANE_REQUEST_INVALID');
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

  const execute = async (input = {}) => {
    const request = record(input, 'SEALED_REALMS_G002_LANE_REQUEST_INVALID');
    if (
      JSON.stringify(Object.keys(request))
        !== JSON.stringify(['operation', 'authority', 'continuation'])
    ) fail('SEALED_REALMS_G002_LANE_REQUEST_INVALID');
    const { operation, authority } = request;
    if (!OPERATIONS.has(operation)) fail('SEALED_REALMS_G002_LANE_OPERATION_INVALID');
    const continuation = requireContinuation(request.continuation, authority);
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
      const binding = await reconciler.inspectForContinuation({ marker });
      await issueSealedRealmsProductionContinuation(
        continuationInput(continuation, authority, 'g002-publication', binding),
      );
      return Object.freeze({ status: 'publish-inspected' });
    }
    if (operation === 'g002-publish-apply') {
      const binding = reconciler.reopenContinuation();
      const result = await claimOrReconcile({
        continuation,
        authority,
        kind: 'g002-publication',
        binding,
          effect: claim => reconciler.consumeContinuationEntry({
            claim,
            store: continuation.store,
            sourceAuthority: authority,
            kind: 'g002-publication',
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
    if (operation === 'g002-import-inspect') {
      const binding = await bridgeState.inspectGateForContinuation({ lane: 'g002' });
      await issueSealedRealmsProductionContinuation(
        continuationInput(continuation, authority, 'g002-import', binding),
      );
      return Object.freeze({ status: 'import-inspected' });
    }
    if (operation === 'g002-import-apply') {
      const binding = await bridgeState.reopenGateContinuation({ lane: 'g002' });
      const result = await claimOrReconcile({
        continuation,
        authority,
        kind: 'g002-import',
        binding,
        effect: claim => bridgeState.applyGateForContinuation({
          claim,
          store: continuation.store,
          sourceAuthority: authority,
          kind: 'g002-import',
          runId: continuation.runId,
          runAttempt: continuation.runAttempt,
          ...binding,
          lane: 'g002',
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
    await bridgeState.inspectLiveEvidence({
      lane: 'g002',
      inspect: () => options.liveInspect(Object.freeze({ sourceCommit: bridgeSourceCommit })),
    });
    return Object.freeze({ status: 'live-inspected' });
  };
  const lane = Object.freeze({});
  laneExecutors.set(lane, execute);
  return lane;
}

export function assertSealedRealmsProductionG002Lane(lane) {
  if (!laneExecutors.has(lane)) fail('SEALED_REALMS_G002_LANE_CAPABILITY_INVALID');
  return lane;
}

/** Composes only an authentic G002 lane with an opaque fixed dispatch context. */
export function createSealedRealmsProductionG002Dispatcher(input) {
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
    assertDispatchContext(context);
    assertSealedRealmsProductionG002Lane(lane);
  } catch {
    throw new SealedRealmsProductionDispatcherError('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }
  return Object.freeze({
    dispatch: async request => {
      const prepared = prepareDispatch(context, request);
      const preparedMember = preparedDispatches.get(prepared);
      if (preparedMember === undefined) {
        throw new SealedRealmsProductionDispatcherError('SEALED_REALMS_DISPATCH_REQUEST_INVALID');
      }
      const early = earlySealedRealmsProductionDispatchResult(preparedMember.operation);
      if (early !== undefined) {
        consumePrepared(prepared);
        return early;
      }
      if (preparedMember.lane !== 'g002') {
        const { operation } = consumePrepared(prepared);
        return completeSealedRealmsProductionDispatch(operation, { status: 'unavailable' });
      }
      let result;
      let invocation;
      let operation;
      try {
        ({ invocation, operation } = createInvocation(prepared, lane));
        result = await consumeInvocation(invocation, prepared, lane);
      } catch (error) {
        rejectSealedRealmsProductionLaneFailure(error);
      }
      return completeSealedRealmsProductionDispatch(operation, result);
    },
  });
}
