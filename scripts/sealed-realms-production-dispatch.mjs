import {
  SEALED_REALMS_OPERATIONS,
  authenticateSealedRealmsProductionSourceAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  assertSealedRealmsProductionActivationLane,
} from './sealed-realms-production-activation-lane-entry.mjs';

const G001_OPERATIONS = new Set([
  'g001-policy-observe',
  'g001-census-first',
  'g001-census-second-inspect',
  'g001-census-second-suspend',
  'g001-current-state',
]);
const G002_OPERATIONS = new Set([
  'g002-publish-inspect',
  'g002-publish-apply',
  'g002-import-inspect',
  'g002-import-apply',
  'g002-live-inspect',
]);
const PTR_OPERATIONS = new Set([
  'ptr-publish-inspect',
  'ptr-publish-apply',
  'ptr-import-inspect',
  'ptr-import-apply',
  'ptr-owner-provision-inspect',
  'ptr-owner-provision',
  'ptr-live-inspect',
]);
const ACTIVATION_OPERATIONS = new Set([
  'activation-evidence-inspect',
  'activation-evidence-generate',
]);
const SAFE_STATUSES = new Set([
  'activation-evidence-inspected',
  'completed',
  'cross-linked',
  'current-state-inspected',
  'import-inspected',
  'live-inspected',
  'owner-provision-inspected',
  'owner-provisioned',
  'preflight-inspected',
  'publish-inspected',
  'submitted',
  'unavailable',
]);
const dispatchers = new WeakSet();

export class SealedRealmsProductionDispatcherError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionDispatcherError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionDispatcherError(code);
}

function plainObject(value, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail(code);
  return value;
}

function laneFor(operation, lanes) {
  if (G001_OPERATIONS.has(operation) || operation === 'preflight') return lanes.g001;
  if (G002_OPERATIONS.has(operation)) return lanes.g002;
  if (PTR_OPERATIONS.has(operation)) return lanes.ptr;
  if (ACTIVATION_OPERATIONS.has(operation)) return lanes.activation;
  fail('SEALED_REALMS_DISPATCH_OPERATION_INVALID');
}

function boundedResult(operation, value) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some(key => !['status', 'ready', 'confirmation'].includes(key))
  ) fail('SEALED_REALMS_DISPATCH_RESULT_INVALID');
  const result = { operation };
  for (const key of ['status', 'ready', 'confirmation']) {
    if (Object.hasOwn(value, key)) {
      if (
        (key === 'status' && !SAFE_STATUSES.has(value[key]))
        || (key === 'ready' && typeof value[key] !== 'boolean')
        || (key === 'confirmation' && (
          value[key] === null || typeof value[key] !== 'object'
          || Object.getPrototypeOf(value[key]) !== Object.prototype
          || Object.keys(value[key]).length !== 0
        ))
      ) {
        fail('SEALED_REALMS_DISPATCH_RESULT_INVALID');
      }
      result[key] = value[key];
    }
  }
  return Object.freeze(result);
}

/**
 * Maps the fixed 20-name operation table to narrow lane capabilities. The
 * authenticated source result is created here and never accepted from a caller.
 */
export function createSealedRealmsProductionDispatcher(input) {
  const options = plainObject(input, 'SEALED_REALMS_DISPATCH_INPUT_INVALID');
  const allowed = [
    'readGit', 'readBinding', 'verifyEvidence',
    'g001Lane', 'g002Lane', 'ptrLane', 'activationLane', 'testOnlyLanes',
  ];
  if (
    Object.keys(options).some(key => !allowed.includes(key))
    || typeof options.readGit !== 'function'
    || typeof options.readBinding !== 'function'
    || typeof options.verifyEvidence !== 'function'
  ) fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  const configured = options.testOnlyLanes ?? {
    g001: options.g001Lane,
    g002: options.g002Lane,
    ptr: options.ptrLane,
    activation: options.activationLane,
  };
  plainObject(configured, 'SEALED_REALMS_DISPATCH_INPUT_INVALID');
  for (const lane of ['g001', 'g002', 'ptr', 'activation']) {
    if (
      configured[lane] !== undefined
      && (configured[lane] === null || typeof configured[lane].execute !== 'function')
    ) fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }

  const dispatch = async (request) => {
    const value = plainObject(request, 'SEALED_REALMS_DISPATCH_REQUEST_INVALID');
    if (
      Object.keys(value).some(key => !['operation', 'workflowInputSha', 'input'].includes(key))
      || typeof value.operation !== 'string'
      || !SEALED_REALMS_OPERATIONS.includes(value.operation)
    ) fail('SEALED_REALMS_DISPATCH_OPERATION_INVALID');
    if (value.input !== undefined) {
      if (
        value.input === null || typeof value.input !== 'object'
        || Array.isArray(value.input)
        || Object.getPrototypeOf(value.input) !== Object.prototype
        || JSON.stringify(Object.keys(value.input)) !== JSON.stringify(['confirmation'])
        || value.input.confirmation === null || typeof value.input.confirmation !== 'object'
        || Object.getPrototypeOf(value.input.confirmation) !== Object.prototype
        || Object.keys(value.input.confirmation).length !== 0
      ) fail('SEALED_REALMS_DISPATCH_REQUEST_INVALID');
    }
    if (
      !['preflight', 'g001-current-state'].includes(value.operation)
      && typeof globalThis.WebSocket !== 'function'
    ) fail('SEALED_REALMS_DISPATCH_WEBSOCKET_UNAVAILABLE');
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: value.operation,
      workflowInputSha: value.workflowInputSha,
      readGit: options.readGit,
      readBinding: options.readBinding,
      verifyEvidence: options.verifyEvidence,
    });
    // Generation is intentionally unavailable until Task 6E provides a real,
    // branded activation lane. Test-only lane replacement can never enable it.
    const lane = value.operation === 'activation-evidence-generate'
      ? options.activationLane
      : laneFor(value.operation, configured);
    if (lane === undefined) {
      return Object.freeze({
        operation: value.operation,
        status: value.operation === 'activation-evidence-generate'
          ? 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE'
          : 'unavailable',
      });
    }
    if (value.operation === 'activation-evidence-generate') {
      try {
        assertSealedRealmsProductionActivationLane(lane);
      } catch {
        return Object.freeze({
          operation: value.operation,
          status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
        });
      }
    }
    let result;
    try {
      result = await lane.execute(Object.freeze({
        operation: value.operation,
        authority,
        input: value.input,
      }));
    } catch (error) {
      if (error instanceof SealedRealmsProductionDispatcherError) throw error;
      fail('SEALED_REALMS_DISPATCH_LANE_FAILED');
    }
    return boundedResult(value.operation, result);
  };

  const dispatcher = Object.freeze({ dispatch });
  dispatchers.add(dispatcher);
  return dispatcher;
}

export function assertSealedRealmsProductionDispatcher(dispatcher) {
  if (!dispatchers.has(dispatcher)) {
    fail('SEALED_REALMS_DISPATCH_CAPABILITY_INVALID');
  }
  return dispatcher;
}
