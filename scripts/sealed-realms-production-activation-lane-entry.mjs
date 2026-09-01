import {
  assertSealedRealmsProductionAuthBridgeState,
  assertSealedRealmsProductionAuthBridgeStateAuthority,
} from './sealed-realms-production-auth-bridge-state.mjs';
import {
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  assertSealedRealmsProductionContinuationStore,
  issueSealedRealmsProductionContinuation,
} from './sealed-realms-production-continuation.mjs';
import {
  assertSealedRealmsProductionWorkflowPermit,
} from './sealed-realms-production-workflow-authority.mjs';
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
  'activation-evidence-inspect', 'activation-evidence-generate',
]);
const lanes = new WeakSet();

export class SealedRealmsProductionActivationLaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionActivationLaneError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionActivationLaneError(code); }

function requireContinuation(value, authority) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value))
      !== JSON.stringify(['permit', 'store', 'runId', 'runAttempt', 'sourceAuthority'])
    || !Object.isFrozen(value)
    || value.sourceAuthority !== authority
    || typeof value.runId !== 'string'
    || typeof value.runAttempt !== 'string'
  ) fail('SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID');
  try {
    assertSealedRealmsProductionWorkflowPermit(value.permit);
    assertSealedRealmsProductionContinuationStore(value.store);
  } catch {
    fail('SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID');
  }
  return value;
}

function continuationInput(continuation, authority, binding) {
  return Object.freeze({
    store: continuation.store,
    permit: continuation.permit,
    sourceAuthority: authority,
    kind: 'activation-evidence',
    runId: continuation.runId,
    runAttempt: continuation.runAttempt,
    ...binding,
  });
}

/**
 * Holds the Task 6D private activation evidence boundary. Generation remains
 * unavailable until Task 6 supplies its canonical receipt and reconciliation.
 */
export function createSealedRealmsProductionActivationLane(input = {}) {
  if (
    input === null || typeof input !== 'object' || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || JSON.stringify(Object.keys(input)) !== JSON.stringify(['bridgeState'])
  ) fail('SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID');
  const { bridgeState } = input;
  const state = assertSealedRealmsProductionAuthBridgeState(bridgeState);
  const execute = async (input = {}) => {
    if (
      input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
      || JSON.stringify(Object.keys(input))
        !== JSON.stringify(['operation', 'authority', 'continuation'])
    ) fail('SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID');
    const { operation, authority } = input;
    if (!OPERATIONS.has(operation)) fail('SEALED_REALMS_ACTIVATION_LANE_OPERATION_INVALID');
    const continuation = requireContinuation(input.continuation, authority);
    sourceCommitFromSealedRealmsProductionAuthority(authority);
    if (authority.operation !== operation) {
      fail('SEALED_REALMS_ACTIVATION_LANE_SOURCE_OPERATION_INVALID');
    }
    assertSealedRealmsProductionAuthBridgeStateAuthority(state, authority);
    if (authority.mode !== 'S') fail('SEALED_REALMS_ACTIVATION_LANE_SOURCE_MODE_INVALID');
    if (operation === 'activation-evidence-generate') {
      fail('SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE');
    }
    const binding = await state.inspectActivationEvidenceForContinuation();
    await issueSealedRealmsProductionContinuation(
      continuationInput(continuation, authority, binding),
    );
    return Object.freeze({ status: 'activation-evidence-inspected' });
  };
  const lane = Object.freeze({ execute });
  lanes.add(lane);
  return lane;
}

export function assertSealedRealmsProductionActivationLane(lane) {
  if (!lanes.has(lane)) fail('SEALED_REALMS_ACTIVATION_LANE_CAPABILITY_INVALID');
  return lane;
}

/** Composes only an authentic activation lane with an opaque fixed dispatch context. */
export function createSealedRealmsProductionActivationDispatcher(input) {
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
    assertSealedRealmsProductionActivationLane(lane);
  } catch {
    throw new SealedRealmsProductionDispatcherError('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }
  return Object.freeze({
    dispatch: async request => {
      const prepared = prepareSealedRealmsProductionDispatch(context, request);
      const early = earlySealedRealmsProductionDispatchResult(prepared);
      if (early !== undefined) return early;
      const opened = openSealedRealmsProductionPreparedDispatch(prepared);
      if (opened.lane !== 'activation') {
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
