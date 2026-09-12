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
import { types } from 'node:util';

const isProxy = types.isProxy;

const G001_OPERATIONS = new Set([
  'g001-policy-observe',
  'g001-census-first',
  'g001-census-second-inspect',
  'g001-census-second-suspend',
  'g001-current-state',
]);
const G002_OPERATIONS = new Set([
  'g002-update-inspect', 'g002-update-apply',
  'g002-publish-inspect',
  'g002-publish-apply',
  'g002-import-inspect',
  'g002-import-apply',
  'g002-live-inspect',
]);
const PTR_OPERATIONS = new Set([
  'ptr-update-inspect', 'ptr-update-apply',
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
  'update-inspected',
  'submitted',
  'unavailable',
]);
const CONTEXT_KEYS = [
  'readGit', 'readBinding', 'verifyEvidence',
  'permit', 'continuationStore', 'runId', 'runAttempt', 'sourceAuthority',
];

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
    isProxy(value) || value === null || typeof value !== 'object' || Array.isArray(value)
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

/** Validates fixed context data without retaining or returning it. */
export function assertSealedRealmsProductionDispatchContextInput(input) {
  const options = plainObject(input, 'SEALED_REALMS_DISPATCH_INPUT_INVALID');
  if (
    JSON.stringify(Object.keys(options)) !== JSON.stringify(CONTEXT_KEYS)
    || typeof options.readGit !== 'function'
    || typeof options.readBinding !== 'function'
    || typeof options.verifyEvidence !== 'function'
    || isProxy(options.readGit)
    || isProxy(options.readBinding)
    || isProxy(options.verifyEvidence)
    || isProxy(options.permit)
    || isProxy(options.continuationStore)
    || isProxy(options.sourceAuthority)
    || typeof options.runId !== 'string'
    || !/^[1-9][0-9]{0,19}$/u.test(options.runId)
    || isProxy(options.runAttempt)
    || !['string', 'number'].includes(typeof options.runAttempt)
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
  return undefined;
}

/** Reauthenticates one request and returns only its non-sensitive fixed slot. */
export function authenticateSealedRealmsProductionDispatch(input) {
  const options = plainObject(input, 'SEALED_REALMS_DISPATCH_INPUT_INVALID');
  if (
    JSON.stringify(Object.keys(options)) !== JSON.stringify([
      'request', 'readGit', 'readBinding', 'verifyEvidence', 'sourceAuthority',
    ])
    || typeof options.readGit !== 'function'
    || typeof options.readBinding !== 'function'
    || typeof options.verifyEvidence !== 'function'
    || isProxy(options.readGit)
    || isProxy(options.readBinding)
    || isProxy(options.verifyEvidence)
    || isProxy(options.sourceAuthority)
  ) fail('SEALED_REALMS_DISPATCH_INPUT_INVALID');
  const value = plainObject(options.request, 'SEALED_REALMS_DISPATCH_REQUEST_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (
    descriptorKeys.length !== 2
    || descriptorKeys.some(key => !['operation', 'workflowInputSha'].includes(key))
    || !Object.hasOwn(descriptors.operation, 'value')
    || !descriptors.operation.enumerable
    || !Object.hasOwn(descriptors.workflowInputSha, 'value')
    || !descriptors.workflowInputSha.enumerable
  ) {
    fail('SEALED_REALMS_DISPATCH_REQUEST_INVALID');
  }
  const operation = descriptors.operation.value;
  const workflowInputSha = descriptors.workflowInputSha.value;
  if (
    typeof operation !== 'string'
    || !SEALED_REALMS_OPERATIONS.includes(operation)
  ) fail('SEALED_REALMS_DISPATCH_OPERATION_INVALID');
  if (
    !['preflight', 'g001-current-state'].includes(operation)
    && typeof globalThis.WebSocket !== 'function'
  ) fail('SEALED_REALMS_DISPATCH_WEBSOCKET_UNAVAILABLE');
  const reauthenticated = authenticateSealedRealmsProductionSourceAuthority({
    operation,
    workflowInputSha,
    readGit: options.readGit,
    readBinding: options.readBinding,
    verifyEvidence: options.verifyEvidence,
  });
  const authority = options.sourceAuthority;
  if (
    authority?.operation !== reauthenticated.operation
    || authority?.mode !== reauthenticated.mode
    || authority?.authorityDigest !== reauthenticated.authorityDigest
    || sourceCommitFromSealedRealmsProductionAuthority(authority)
      !== sourceCommitFromSealedRealmsProductionAuthority(reauthenticated)
    || preparationSourceCommitFromSealedRealmsProductionAuthority(authority)
      !== preparationSourceCommitFromSealedRealmsProductionAuthority(reauthenticated)
  ) fail('SEALED_REALMS_DISPATCH_SOURCE_INVALID');
  return Object.freeze({
    operation,
    lane: laneFor(operation),
  });
}

/** Handles the one fixed pre-lane terminal outcome. */
export function earlySealedRealmsProductionDispatchResult(operation) {
  if (operation !== 'activation-evidence-generate') return undefined;
  return Object.freeze({
    operation,
    status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
  });
}

/** Bounds and redacts a lane result without invoking a lane or callback. */
export function completeSealedRealmsProductionDispatch(operation, value) {
  if (typeof operation !== 'string' || !SEALED_REALMS_OPERATIONS.includes(operation)) {
    fail('SEALED_REALMS_DISPATCH_OPERATION_INVALID');
  }
  plainObject(value, 'SEALED_REALMS_DISPATCH_RESULT_INVALID');
  if (Object.keys(value).some(key => !['status', 'ready'].includes(key))) {
    fail('SEALED_REALMS_DISPATCH_RESULT_INVALID');
  }
  const result = { operation };
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
