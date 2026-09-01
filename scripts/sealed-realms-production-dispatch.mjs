import {
  SEALED_REALMS_OPERATIONS,
  authenticateSealedRealmsProductionSourceAuthority,
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  assertSealedRealmsProductionContinuationStore,
} from './sealed-realms-production-continuation.mjs';
import {
  assertSealedRealmsProductionWorkflowPermit,
} from './sealed-realms-production-workflow-authority.mjs';
import {
  assertSealedRealmsProductionLane,
} from './sealed-realms-production-lane-registry.mjs';

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
    || Object.keys(value).some(key => !['status', 'ready'].includes(key))
  ) fail('SEALED_REALMS_DISPATCH_RESULT_INVALID');
  const result = { operation };
  for (const key of ['status', 'ready']) {
    if (Object.hasOwn(value, key)) {
      if (
        (key === 'status' && !SAFE_STATUSES.has(value[key]))
        || (key === 'ready' && typeof value[key] !== 'boolean')
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
    'g001Lane', 'g002Lane', 'ptrLane', 'activationLane',
    'permit', 'continuationStore', 'runId', 'runAttempt', 'sourceAuthority',
  ];
  if (
    Object.keys(options).some(key => !allowed.includes(key))
    || typeof options.readGit !== 'function'
    || typeof options.readBinding !== 'function'
    || typeof options.verifyEvidence !== 'function'
    || !Object.hasOwn(options, 'permit')
    || !Object.hasOwn(options, 'continuationStore')
    || !Object.hasOwn(options, 'runId')
    || !Object.hasOwn(options, 'runAttempt')
    || !Object.hasOwn(options, 'sourceAuthority')
    || typeof options.runId !== 'string'
    || !/^[1-9][0-9]{0,19}$/u.test(options.runId)
    || !/^[1-9][0-9]{0,3}$/u.test(String(options.runAttempt))
    || Number(options.runAttempt) > 1_000
    || options.continuationStore === null
    || typeof options.continuationStore !== 'object'
    || !Object.isFrozen(options.continuationStore)
    || Reflect.ownKeys(options.continuationStore).length !== 0
  ) fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  try {
    assertSealedRealmsProductionWorkflowPermit(options.permit);
    assertSealedRealmsProductionContinuationStore(options.continuationStore);
  } catch {
    fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  }
  const continuation = Object.freeze({
    permit: options.permit,
    store: options.continuationStore,
    runId: options.runId,
    runAttempt: String(options.runAttempt),
    sourceAuthority: options.sourceAuthority,
  });
  const configured = {
    g001: options.g001Lane,
    g002: options.g002Lane,
    ptr: options.ptrLane,
    activation: options.activationLane,
  };
  plainObject(configured, 'SEALED_REALMS_DISPATCH_INPUT_INVALID');
  for (const lane of ['g001', 'g002', 'ptr', 'activation']) {
    if (configured[lane] === undefined) continue;
    try {
      assertSealedRealmsProductionLane(configured[lane], lane);
    } catch {
      fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
    }
  }

  const dispatch = async (request) => {
    const value = plainObject(request, 'SEALED_REALMS_DISPATCH_REQUEST_INVALID');
    if (JSON.stringify(Object.keys(value)) !== JSON.stringify(['operation', 'workflowInputSha'])) {
      fail('SEALED_REALMS_DISPATCH_REQUEST_INVALID');
    }
    if (
      typeof value.operation !== 'string'
      || !SEALED_REALMS_OPERATIONS.includes(value.operation)
    ) fail('SEALED_REALMS_DISPATCH_OPERATION_INVALID');
    if (
      !['preflight', 'g001-current-state'].includes(value.operation)
      && typeof globalThis.WebSocket !== 'function'
    ) fail('SEALED_REALMS_DISPATCH_WEBSOCKET_UNAVAILABLE');
    const reauthenticated = authenticateSealedRealmsProductionSourceAuthority({
      operation: value.operation,
      workflowInputSha: value.workflowInputSha,
      readGit: options.readGit,
      readBinding: options.readBinding,
      verifyEvidence: options.verifyEvidence,
    });
    const authority = continuation.sourceAuthority;
    if (
      authority?.operation !== reauthenticated.operation
      || authority?.mode !== reauthenticated.mode
      || authority?.authorityDigest !== reauthenticated.authorityDigest
      || sourceCommitFromSealedRealmsProductionAuthority(authority)
        !== sourceCommitFromSealedRealmsProductionAuthority(reauthenticated)
      || preparationSourceCommitFromSealedRealmsProductionAuthority(authority)
        !== preparationSourceCommitFromSealedRealmsProductionAuthority(reauthenticated)
    ) fail('SEALED_REALMS_DISPATCH_SOURCE_INVALID');
    if (value.operation === 'activation-evidence-generate') {
      return Object.freeze({
        operation: value.operation,
        status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
      });
    }
    const lane = laneFor(value.operation, configured);
    if (lane === undefined) {
      return Object.freeze({
        operation: value.operation,
        status: 'unavailable',
      });
    }
    let result;
    try {
      result = await lane.execute(Object.freeze({
        operation: value.operation,
        authority,
        continuation,
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
