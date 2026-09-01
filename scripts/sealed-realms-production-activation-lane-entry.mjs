import {
  assertSealedRealmsProductionAuthBridgeState,
  assertSealedRealmsProductionAuthBridgeStateAuthority,
  assertSealedRealmsProductionActivationEvidenceGenerator,
  consumeSealedRealmsProductionActivationEvidenceForGenerator,
} from './sealed-realms-production-auth-bridge-state.mjs';
import {
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  claimSealedRealmsProductionContinuation,
  issueSealedRealmsProductionContinuation,
} from './sealed-realms-production-continuation.mjs';

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
 * Holds the Task 6D private activation evidence boundary.  A branded Task 6E
 * generator is an initialization-time escrow capability, never caller input.
 */
export function createSealedRealmsProductionActivationLane(input = {}) {
  if (
    input === null || typeof input !== 'object' || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || Object.keys(input).some(key => !['bridgeState', 'task6EGenerator'].includes(key))
  ) fail('SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID');
  const { bridgeState, task6EGenerator } = input;
  const state = assertSealedRealmsProductionAuthBridgeState(bridgeState);
  const generator = task6EGenerator === undefined
    ? undefined
    : assertSealedRealmsProductionActivationEvidenceGenerator(task6EGenerator);
  const execute = async ({ operation, authority, input: operationInput, continuation } = {}) => {
    if (!OPERATIONS.has(operation)) fail('SEALED_REALMS_ACTIVATION_LANE_OPERATION_INVALID');
    sourceCommitFromSealedRealmsProductionAuthority(authority);
    if (authority.operation !== operation) {
      fail('SEALED_REALMS_ACTIVATION_LANE_SOURCE_OPERATION_INVALID');
    }
    assertSealedRealmsProductionAuthBridgeStateAuthority(state, authority);
    if (authority.mode !== 'S') fail('SEALED_REALMS_ACTIVATION_LANE_SOURCE_MODE_INVALID');
    if (operation === 'activation-evidence-generate') {
      if (generator === undefined) fail('SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE');
      if (continuation !== undefined) {
        const binding = await state.reopenActivationEvidenceContinuation();
        const result = await claimSealedRealmsProductionContinuation({
          ...continuationInput(continuation, authority, binding),
          effect: () => state.consumeActivationEvidenceForContinuation({ generator }),
        });
        return Object.freeze({ status: result.status });
      }
      if (
        operationInput === null || typeof operationInput !== 'object'
        || Array.isArray(operationInput)
        || Object.getPrototypeOf(operationInput) !== Object.prototype
        || JSON.stringify(Object.keys(operationInput)) !== JSON.stringify(['confirmation'])
      ) fail('SEALED_REALMS_ACTIVATION_LANE_INPUT_INVALID');
      await consumeSealedRealmsProductionActivationEvidenceForGenerator(Object.freeze({
        confirmation: operationInput.confirmation,
        generator,
      }));
      return Object.freeze({ status: 'completed' });
    }
    if (continuation !== undefined) {
      const binding = await state.inspectActivationEvidenceForContinuation();
      await issueSealedRealmsProductionContinuation(
        continuationInput(continuation, authority, binding),
      );
      return Object.freeze({ status: 'activation-evidence-inspected' });
    }
    const result = await state.inspectActivationEvidence();
    return Object.freeze({ status: 'activation-evidence-inspected', confirmation: result.confirmation });
  };
  const lane = Object.freeze({ execute });
  lanes.add(lane);
  return lane;
}

export function assertSealedRealmsProductionActivationLane(lane) {
  if (!lanes.has(lane)) fail('SEALED_REALMS_ACTIVATION_LANE_CAPABILITY_INVALID');
  return lane;
}
