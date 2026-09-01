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
  assertSealedRealmsProductionDispatchContextInput,
  authenticateSealedRealmsProductionDispatch,
  completeSealedRealmsProductionDispatch,
  earlySealedRealmsProductionDispatchResult,
  rejectSealedRealmsProductionLaneFailure,
} from './sealed-realms-production-dispatch.mjs';

const OPERATIONS = new Set([
  'activation-evidence-inspect', 'activation-evidence-generate',
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

export class SealedRealmsProductionActivationLaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionActivationLaneError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionActivationLaneError(code); }

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

export function createSealedRealmsProductionActivationDispatchContext(input) {
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
    fail('SEALED_REALMS_ACTIVATION_LANE_INVOCATION_INVALID');
  }
  preparedDispatches.delete(prepared);
  consumedPreparedDispatches.add(prepared);
  return member;
}

function createInvocation(prepared, lane) {
  const member = consumePrepared(prepared);
  const executor = laneExecutors.get(lane);
  if (member.lane !== 'activation' || executor === undefined) {
    fail('SEALED_REALMS_ACTIVATION_LANE_INVOCATION_INVALID');
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
  ) fail('SEALED_REALMS_ACTIVATION_LANE_INVOCATION_INVALID');
  invocations.delete(invocation);
  consumedInvocations.add(invocation);
  return member.executor(member.request);
}

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
  const lane = Object.freeze({});
  laneExecutors.set(lane, execute);
  return lane;
}

export function assertSealedRealmsProductionActivationLane(lane) {
  if (!laneExecutors.has(lane)) fail('SEALED_REALMS_ACTIVATION_LANE_CAPABILITY_INVALID');
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
    assertDispatchContext(context);
    assertSealedRealmsProductionActivationLane(lane);
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
      if (preparedMember.lane !== 'activation') {
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
