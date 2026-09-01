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
const contexts = new WeakMap();
const preparedDispatches = new WeakMap();

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

function laneFor(operation) {
  if (G001_OPERATIONS.has(operation) || operation === 'preflight') return 'g001';
  if (G002_OPERATIONS.has(operation)) return 'g002';
  if (PTR_OPERATIONS.has(operation)) return 'ptr';
  if (ACTIVATION_OPERATIONS.has(operation)) return 'activation';
  fail('SEALED_REALMS_DISPATCH_OPERATION_INVALID');
}

/**
 * Builds only an opaque, effect-free dispatch context. Lane enrollment and the
 * execute closure remain private to the matching lane module.
 */
export function createSealedRealmsProductionDispatchContext(input) {
  const options = plainObject(input, 'SEALED_REALMS_DISPATCH_INPUT_INVALID');
  const allowed = [
    'readGit', 'readBinding', 'verifyEvidence',
    'permit', 'continuationStore', 'runId', 'runAttempt', 'sourceAuthority',
  ];
  if (
    Object.keys(options).some(key => !allowed.includes(key))
    || allowed.some(key => !Object.hasOwn(options, key))
    || typeof options.readGit !== 'function'
    || typeof options.readBinding !== 'function'
    || typeof options.verifyEvidence !== 'function'
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
  const context = Object.freeze({});
  contexts.set(context, Object.freeze({
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

export function assertSealedRealmsProductionDispatchContext(context) {
  if (!contexts.has(context)) fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  return context;
}

/** Reauthenticates and prepares data only; it cannot select or invoke a lane. */
export function prepareSealedRealmsProductionDispatch(context, request) {
  const member = contexts.get(context);
  if (member === undefined) fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
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
    readGit: member.readGit,
    readBinding: member.readBinding,
    verifyEvidence: member.verifyEvidence,
  });
  const authority = member.continuation.sourceAuthority;
  if (
    authority?.operation !== reauthenticated.operation
    || authority?.mode !== reauthenticated.mode
    || authority?.authorityDigest !== reauthenticated.authorityDigest
    || sourceCommitFromSealedRealmsProductionAuthority(authority)
      !== sourceCommitFromSealedRealmsProductionAuthority(reauthenticated)
    || preparationSourceCommitFromSealedRealmsProductionAuthority(authority)
      !== preparationSourceCommitFromSealedRealmsProductionAuthority(reauthenticated)
  ) fail('SEALED_REALMS_DISPATCH_SOURCE_INVALID');
  const prepared = Object.freeze({});
  preparedDispatches.set(prepared, Object.freeze({
    operation: value.operation,
    lane: laneFor(value.operation),
    request: Object.freeze({
      operation: value.operation,
      authority,
      continuation: member.continuation,
    }),
  }));
  return prepared;
}

/** Returns only the fixed request for a previously authenticated dispatch. */
export function openSealedRealmsProductionPreparedDispatch(prepared) {
  const member = preparedDispatches.get(prepared);
  if (member === undefined) fail('SEALED_REALMS_DISPATCH_REQUEST_INVALID');
  return Object.freeze({ lane: member.lane, request: member.request });
}

/** Handles the one fixed pre-lane terminal outcome. */
export function earlySealedRealmsProductionDispatchResult(prepared) {
  const member = preparedDispatches.get(prepared);
  if (member === undefined) fail('SEALED_REALMS_DISPATCH_REQUEST_INVALID');
  if (member.operation !== 'activation-evidence-generate') return undefined;
  return Object.freeze({
    operation: member.operation,
    status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
  });
}

/** Bounds and redacts a lane result without invoking a lane or callback. */
export function completeSealedRealmsProductionDispatch(prepared, value) {
  const member = preparedDispatches.get(prepared);
  if (member === undefined) fail('SEALED_REALMS_DISPATCH_REQUEST_INVALID');
  plainObject(value, 'SEALED_REALMS_DISPATCH_RESULT_INVALID');
  if (Object.keys(value).some(key => !['status', 'ready'].includes(key))) {
    fail('SEALED_REALMS_DISPATCH_RESULT_INVALID');
  }
  const result = { operation: member.operation };
  for (const key of ['status', 'ready']) {
    if (!Object.hasOwn(value, key)) continue;
    if (
      (key === 'status' && !SAFE_STATUSES.has(value[key]))
      || (key === 'ready' && typeof value[key] !== 'boolean')
    ) fail('SEALED_REALMS_DISPATCH_RESULT_INVALID');
    result[key] = value[key];
  }
  return Object.freeze(result);
}

/** Normalizes only errors; it accepts no lane or executable capability. */
export function rejectSealedRealmsProductionLaneFailure(error) {
  if (error instanceof SealedRealmsProductionDispatcherError) throw error;
  fail('SEALED_REALMS_DISPATCH_LANE_FAILED');
}
