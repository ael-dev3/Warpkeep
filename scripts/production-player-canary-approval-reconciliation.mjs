import { createHash } from 'node:crypto';

import {
  productionPlayerCanaryBaselineChallengeDigest,
  requireProductionPlayerCanaryBaselineReconciliation,
} from './production-player-canary-baseline-reconciliation.mjs';
import {
  deriveProductionPlayerCanaryCommandAuthorityV2,
} from './production-player-canary-command-authority.mjs';
import {
  productionPlayerCanaryRouteSetCommitment,
} from './production-player-canary-owner-approval.mjs';

export const PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_PROFILE =
  'warpkeep-production-player-canary-approval-reconciliation-v1';

const SERVER_PROFILE =
  'warpkeep-production-player-canary-approval-registration-v1';
const COMMAND_KEY_POLICY_VERSION =
  'warpkeep-production-player-canary-command-key-v2';
const SHA256 = /^[0-9a-f]{64}$/u;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const WORKER_ID = /^genesis-001-castle-[0-9]+-worker-0[1-4]$/u;
const LOCATION_ID = /^GRL-[A-Z2-7]{26}$/u;
const RESOURCE_KINDS = Object.freeze(['food', 'wood', 'stone', 'gold']);
const INPUT_KEYS = Object.freeze([
  'adminSecret', 'arguments', 'assertCanStartWrite',
]);
const REACQUIRE_INPUT_KEYS = Object.freeze([
  'adminSecret', 'arguments',
]);
const ARGUMENT_KEYS = Object.freeze([
  'fid', 'reviewedAdmissionPlanDigest', 'evidenceNonce',
  'serverBaselineCommitment', 'routeSetCommitment',
  'commandKeyPolicyVersion', 'commandSetCommitment',
  'ownerApprovalArtifactDigest', 'ownerApprovalCommitment',
  'approvedAtMicros', 'notAfterMicros',
]);
const STATUS_KEYS = Object.freeze([
  'profile', 'challengeDigest', 'reviewedAdmissionPlanDigest',
  'serverBaselineCommitment', 'routeSetCommitment',
  'commandKeyPolicyVersion', 'commandSetCommitment',
  'ownerApprovalArtifactDigest', 'ownerApprovalCommitment',
  'approvalRegistrationCommitment', 'approvedAtMicros', 'notAfterMicros',
  'registeredAtMicros', 'approvalRegistered', 'routePlanBound',
  'commandSetBound', 'ownerApprovalBound',
]);
const reconciliationBrand = new WeakSet();
const ROUTE_PLAN_KEYS = Object.freeze([
  'profile', 'challengeDigest', 'reviewedAdmissionPlanDigest',
  'serverBaselineCommitment', 'routeSetCommitment', 'atlasRevision',
  'equalRouteSteps', 'routes',
]);
const ROUTE_KEYS = Object.freeze([
  'ordinal', 'workerId', 'resourceKind', 'locationId',
  'atlasRevision', 'routeSteps', 'nodeCount',
]);

export class ProductionPlayerCanaryApprovalReconciliationError extends Error {
  constructor(code, disposition = 'halt', cause) {
    super(code);
    this.name = 'ProductionPlayerCanaryApprovalReconciliationError';
    this.code = code;
    this.disposition = disposition;
    if (cause !== undefined) Object.defineProperty(this, 'cause', {
      value: cause,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }
}

function fail(code, disposition = 'halt', cause) {
  throw new ProductionPlayerCanaryApprovalReconciliationError(
    code,
    disposition,
    cause,
  );
}

function exactRecord(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  ) fail(code);
  return value;
}

function framed(values) {
  return values.map((value) => {
    const content = value.toString();
    return `${Buffer.byteLength(content, 'utf8')}:${content}`;
  }).join('|');
}

function ownerApprovalCommitment(input) {
  return createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.owner-approval.v1',
    input.evidenceNonce,
    input.artifactDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
  ])}\n`, 'utf8').digest('hex');
}

function approvalRegistrationCommitment(input) {
  return createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.approval-registration.v1',
    input.challengeDigest,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
    input.commandKeyPolicyVersion,
    input.commandSetCommitment,
    input.ownerApprovalArtifactDigest,
    input.ownerApprovalCommitment,
    input.approvedAtMicros,
    input.notAfterMicros,
  ])}\n`, 'utf8').digest('hex');
}

function exactInstantMicros(value, code) {
  if (typeof value !== 'string') fail(code);
  const milliseconds = Date.parse(value);
  if (
    !Number.isSafeInteger(milliseconds)
    || new Date(milliseconds).toISOString() !== value
  ) fail(code);
  const result = BigInt(milliseconds) * 1_000n;
  if (result < 1n || result > U64_MAX) fail(code);
  return result;
}

function canonicalRoute(route, atlasAsString, expectedOrdinal, code) {
  const value = exactRecord(route, ROUTE_KEYS, code);
  const atlasRevision = atlasAsString
    ? typeof value.atlasRevision === 'string' && /^(?:0|[1-9][0-9]{0,19})$/u.test(
      value.atlasRevision,
    ) ? BigInt(value.atlasRevision) : -1n
    : value.atlasRevision;
  if (
    value.ordinal !== expectedOrdinal
    || typeof value.workerId !== 'string'
    || !WORKER_ID.test(value.workerId)
    || value.resourceKind !== RESOURCE_KINDS[expectedOrdinal - 1]
    || typeof value.locationId !== 'string'
    || !LOCATION_ID.test(value.locationId)
    || typeof atlasRevision !== 'bigint'
    || atlasRevision < 1n
    || atlasRevision > U64_MAX
    || !Number.isSafeInteger(value.routeSteps)
    || value.routeSteps < 1
    || value.routeSteps > 12
    || !Number.isSafeInteger(value.nodeCount)
    || value.nodeCount < 1
    || value.nodeCount > 32
  ) fail(code);
  return Object.freeze({
    ordinal: value.ordinal,
    workerId: value.workerId,
    resourceKind: value.resourceKind,
    locationId: value.locationId,
    atlasRevision,
    routeSteps: value.routeSteps,
    nodeCount: value.nodeCount,
  });
}

/**
 * Construct the exact register arguments from branded baseline authority, a
 * private server route-plan read, and a descriptor-verified owner artifact.
 * Raw command keys are independently derived and discarded here.
 */
export function productionPlayerCanaryApprovalRegistrationArgumentsV1(input) {
  const value = exactRecord(input, [
    'fid', 'baselineReconciliation', 'routePlan', 'inspectedApproval',
  ], 'PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_MATERIAL_INVALID');
  if (
    typeof value.fid !== 'bigint'
    || value.fid < 1n
    || value.fid > BigInt(Number.MAX_SAFE_INTEGER)
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_MATERIAL_INVALID');
  const baseline = requireProductionPlayerCanaryBaselineReconciliation(
    value.baselineReconciliation,
  );
  const routePlan = exactRecord(
    value.routePlan,
    ROUTE_PLAN_KEYS,
    'PRODUCTION_PLAYER_CANARY_APPROVAL_ROUTE_PLAN_INVALID',
  );
  const inspected = exactRecord(
    value.inspectedApproval,
    [
      'approval', 'artifactDigest', 'approvalCommitment',
      'routeSetCommitment', 'commandSetCommitment',
    ],
    'PRODUCTION_PLAYER_CANARY_APPROVAL_ARTIFACT_INVALID',
  );
  const approval = inspected.approval;
  if (
    approval === null
    || typeof approval !== 'object'
    || Array.isArray(approval)
    || typeof approval.evidenceNonce !== 'string'
    || !SHA256.test(approval.evidenceNonce)
    || !Array.isArray(approval.routes)
    || !Array.isArray(routePlan.routes)
    || approval.routes.length !== 4
    || routePlan.routes.length !== 4
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_ARTIFACT_INVALID');
  const ownerRoutes = approval.routes.map((route, index) => canonicalRoute(
    route,
    true,
    index + 1,
    'PRODUCTION_PLAYER_CANARY_APPROVAL_ARTIFACT_INVALID',
  ));
  const serverRoutes = routePlan.routes.map((route, index) => canonicalRoute(
    route,
    false,
    index + 1,
    'PRODUCTION_PLAYER_CANARY_APPROVAL_ROUTE_PLAN_INVALID',
  ));
  const expectedRouteSetCommitment = productionPlayerCanaryRouteSetCommitment({
    evidenceNonce: approval.evidenceNonce,
    reviewedAdmissionPlanDigest: baseline.reviewedAdmissionPlanDigest,
    routes: serverRoutes,
  });
  if (
    typeof routePlan.atlasRevision !== 'bigint'
    || routePlan.atlasRevision < 1n
    || routePlan.atlasRevision > U64_MAX
    || !Number.isSafeInteger(routePlan.equalRouteSteps)
    || routePlan.equalRouteSteps < 1
    || routePlan.equalRouteSteps > 12
    || new Set(serverRoutes.map(route => route.workerId)).size !== 4
    || new Set(serverRoutes.map(route => route.locationId)).size !== 4
    || serverRoutes.some(route => (
      route.atlasRevision !== routePlan.atlasRevision
      || route.routeSteps !== routePlan.equalRouteSteps
    ))
    || JSON.stringify(ownerRoutes, (_key, candidate) => (
      typeof candidate === 'bigint' ? candidate.toString() : candidate
    )) !== JSON.stringify(serverRoutes, (_key, candidate) => (
      typeof candidate === 'bigint' ? candidate.toString() : candidate
    ))
    || routePlan.profile !== 'warpkeep-production-player-canary-route-plan-v1'
    || routePlan.challengeDigest !== baseline.challengeDigest
    || routePlan.reviewedAdmissionPlanDigest !== baseline.reviewedAdmissionPlanDigest
    || routePlan.serverBaselineCommitment !== baseline.serverBaselineCommitment
    || routePlan.routeSetCommitment !== baseline.routeSetCommitment
    || routePlan.routeSetCommitment !== expectedRouteSetCommitment
    || approval.reviewedAdmissionPlanDigest !== baseline.reviewedAdmissionPlanDigest
    || approval.serverBaselineCommitment !== baseline.serverBaselineCommitment
    || approval.routeSetCommitment !== routePlan.routeSetCommitment
    || inspected.routeSetCommitment !== routePlan.routeSetCommitment
    || typeof inspected.artifactDigest !== 'string'
    || !SHA256.test(inspected.artifactDigest)
    || typeof inspected.approvalCommitment !== 'string'
    || !SHA256.test(inspected.approvalCommitment)
    || inspected.approvalCommitment !== ownerApprovalCommitment({
      evidenceNonce: approval.evidenceNonce,
      artifactDigest: inspected.artifactDigest,
      serverBaselineCommitment: baseline.serverBaselineCommitment,
      routeSetCommitment: routePlan.routeSetCommitment,
    })
    || approval.commandKeyPolicyVersion !== COMMAND_KEY_POLICY_VERSION
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_MATERIAL_MISMATCH');
  const commandAuthority = deriveProductionPlayerCanaryCommandAuthorityV2({
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: baseline.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.serverBaselineCommitment,
    routeSetCommitment: routePlan.routeSetCommitment,
  });
  if (
    approval.commandSetCommitment !== commandAuthority.commandSetCommitment
    || inspected.commandSetCommitment !== commandAuthority.commandSetCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_MATERIAL_MISMATCH');
  return Object.freeze({
    fid: value.fid,
    reviewedAdmissionPlanDigest: baseline.reviewedAdmissionPlanDigest,
    evidenceNonce: approval.evidenceNonce,
    serverBaselineCommitment: baseline.serverBaselineCommitment,
    routeSetCommitment: routePlan.routeSetCommitment,
    commandKeyPolicyVersion: commandAuthority.commandKeyPolicyVersion,
    commandSetCommitment: commandAuthority.commandSetCommitment,
    ownerApprovalArtifactDigest: inspected.artifactDigest,
    ownerApprovalCommitment: inspected.approvalCommitment,
    approvedAtMicros: exactInstantMicros(
      approval.approvedAt,
      'PRODUCTION_PLAYER_CANARY_APPROVAL_ARTIFACT_INVALID',
    ),
    notAfterMicros: exactInstantMicros(
      approval.notAfter,
      'PRODUCTION_PLAYER_CANARY_APPROVAL_ARTIFACT_INVALID',
    ),
  });
}

function validateInput(input) {
  const value = exactRecord(
    input,
    INPUT_KEYS,
    'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_INPUT_INVALID',
  );
  const arguments_ = exactRecord(
    value.arguments,
    ARGUMENT_KEYS,
    'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_INPUT_INVALID',
  );
  const secretBytes = typeof value.adminSecret === 'string'
    ? new TextEncoder().encode(value.adminSecret).byteLength
    : 0;
  if (
    secretBytes < 32
    || secretBytes > 512
    || typeof arguments_.fid !== 'bigint'
    || arguments_.fid < 1n
    || arguments_.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || typeof arguments_.approvedAtMicros !== 'bigint'
    || arguments_.approvedAtMicros < 1n
    || arguments_.approvedAtMicros > U64_MAX
    || typeof arguments_.notAfterMicros !== 'bigint'
    || arguments_.notAfterMicros <= arguments_.approvedAtMicros
    || arguments_.notAfterMicros > U64_MAX
    || arguments_.commandKeyPolicyVersion !== COMMAND_KEY_POLICY_VERSION
    || [
      arguments_.reviewedAdmissionPlanDigest,
      arguments_.evidenceNonce,
      arguments_.serverBaselineCommitment,
      arguments_.routeSetCommitment,
      arguments_.commandSetCommitment,
      arguments_.ownerApprovalArtifactDigest,
      arguments_.ownerApprovalCommitment,
    ].some(candidate => typeof candidate !== 'string' || !SHA256.test(candidate))
    || typeof value.assertCanStartWrite !== 'function'
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_INPUT_INVALID');
  return Object.freeze({
    adminSecret: value.adminSecret,
    arguments: Object.freeze(Object.fromEntries(
      ARGUMENT_KEYS.map(key => [key, arguments_[key]]),
    )),
    assertCanStartWrite: value.assertCanStartWrite,
  });
}

function validateReacquireInput(input) {
  const value = exactRecord(
    input,
    REACQUIRE_INPUT_KEYS,
    'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_INPUT_INVALID',
  );
  return validateInput({
    ...value,
    assertCanStartWrite: () => undefined,
  });
}

function isWriteNotStartedError(error) {
  return error !== null
    && typeof error === 'object'
    && error.name === 'GreaterRealmCutoverWriteNotStartedError'
    && error.writeStarted === false
    && typeof error.code === 'string';
}

function readArguments(input) {
  return Object.freeze({
    fid: input.arguments.fid,
    reviewedAdmissionPlanDigest: input.arguments.reviewedAdmissionPlanDigest,
    evidenceNonce: input.arguments.evidenceNonce,
  });
}

function projectStatus(raw, input) {
  const status = exactRecord(
    raw,
    STATUS_KEYS,
    'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_STATUS_INVALID',
  );
  for (const key of ['approvedAtMicros', 'notAfterMicros', 'registeredAtMicros']) {
    if (typeof status[key] !== 'bigint' || status[key] < 0n || status[key] > U64_MAX) {
      fail('PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_STATUS_INVALID');
    }
  }
  const expectedChallenge = productionPlayerCanaryBaselineChallengeDigest(
    input.arguments.evidenceNonce,
  );
  const expectedRegistrationCommitment = approvalRegistrationCommitment({
    challengeDigest: expectedChallenge,
    ...input.arguments,
  });
  if (status.approvalRegistered === false) {
    if (
      status.profile !== SERVER_PROFILE
      || typeof status.challengeDigest !== 'string'
      || status.challengeDigest !== expectedChallenge
      || status.reviewedAdmissionPlanDigest
        !== input.arguments.reviewedAdmissionPlanDigest
      || status.serverBaselineCommitment !== input.arguments.serverBaselineCommitment
      || status.routeSetCommitment !== input.arguments.routeSetCommitment
      || status.commandKeyPolicyVersion !== COMMAND_KEY_POLICY_VERSION
      || status.commandSetCommitment !== ''
      || status.ownerApprovalArtifactDigest !== ''
      || status.ownerApprovalCommitment !== ''
      || status.approvalRegistrationCommitment !== ''
      || status.approvedAtMicros !== 0n
      || status.notAfterMicros !== 0n
      || status.registeredAtMicros !== 0n
      || status.routePlanBound !== false
      || status.commandSetBound !== false
      || status.ownerApprovalBound !== false
    ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_STATUS_INVALID');
    return Object.freeze(Object.fromEntries(STATUS_KEYS.map(key => [key, status[key]])));
  }
  if (
    status.approvalRegistered !== true
    || status.profile !== SERVER_PROFILE
    || status.reviewedAdmissionPlanDigest !== input.arguments.reviewedAdmissionPlanDigest
    || status.serverBaselineCommitment !== input.arguments.serverBaselineCommitment
    || status.routeSetCommitment !== input.arguments.routeSetCommitment
    || status.commandKeyPolicyVersion !== input.arguments.commandKeyPolicyVersion
    || status.commandSetCommitment !== input.arguments.commandSetCommitment
    || status.ownerApprovalArtifactDigest !== input.arguments.ownerApprovalArtifactDigest
    || status.ownerApprovalCommitment !== input.arguments.ownerApprovalCommitment
    || status.approvedAtMicros !== input.arguments.approvedAtMicros
    || status.notAfterMicros !== input.arguments.notAfterMicros
    || status.registeredAtMicros < status.approvedAtMicros
    || status.registeredAtMicros >= status.notAfterMicros
    || status.routePlanBound !== true
    || status.commandSetBound !== true
    || status.ownerApprovalBound !== true
    || status.challengeDigest !== expectedChallenge
    || typeof status.approvalRegistrationCommitment !== 'string'
    || status.approvalRegistrationCommitment !== expectedRegistrationCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_STATUS_CONFLICT');
  return Object.freeze(Object.fromEntries(STATUS_KEYS.map(key => [key, status[key]])));
}

function brand(status, submissionOutcome) {
  const result = Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_PROFILE,
    submissionOutcome,
    approvalRegistrationCommitment: status.approvalRegistrationCommitment,
    routeSetCommitment: status.routeSetCommitment,
    commandSetCommitment: status.commandSetCommitment,
    registeredAtMicros: status.registeredAtMicros,
    status,
  });
  reconciliationBrand.add(result);
  return result;
}

async function closeSession(session) {
  if (session === null || typeof session !== 'object' || typeof session.close !== 'function') {
    fail('PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_SESSION_INVALID');
  }
  await session.close();
}

async function reconcileWithDependencies(rawInput, dependencies) {
  const input = validateInput(rawInput);
  let session;
  try {
    session = await dependencies.openSession(input.adminSecret);
  } catch (error) {
    fail(
      'PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTER_SESSION_UNAVAILABLE',
      'safe-pre-mutation-failure',
      error,
    );
  }
  let submissionError;
  try {
    await dependencies.register({
      session,
      arguments: input.arguments,
      assertCanStartWrite: input.assertCanStartWrite,
    });
  } catch (error) {
    submissionError = error;
  }

  let boundaryError;
  let readError;
  let closeError;
  let rawStatus;
  try {
    try { await dependencies.refresh(session); } catch (error) { boundaryError = error; }
    if (boundaryError === undefined) {
      try {
        rawStatus = await dependencies.read({
          session,
          arguments: readArguments(input),
        });
      } catch (error) { readError = error; }
    }
  } finally {
    try { await closeSession(session); } catch (error) { closeError = error; }
  }
  if (boundaryError !== undefined || readError !== undefined || closeError !== undefined) {
    fail(
      'PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_UNAVAILABLE',
      'halt',
      boundaryError ?? readError ?? closeError,
    );
  }
  const status = projectStatus(rawStatus, input);
  if (!status.approvalRegistered) {
    if (submissionError !== undefined && isWriteNotStartedError(submissionError)) {
      throw submissionError;
    }
    if (submissionError !== undefined) {
      fail(
        'PRODUCTION_PLAYER_CANARY_APPROVAL_EXPLICIT_OPERATOR_RETRY_REQUIRED',
        'explicit-operator-retry-required',
        submissionError,
      );
    }
    fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTER_ACKNOWLEDGED_BUT_ABSENT');
  }
  return brand(
    status,
    submissionError === undefined
      ? 'register-acknowledged'
      : isWriteNotStartedError(submissionError)
        ? 'existing-row-after-write-not-started'
        : 'row-reconciled-after-submission-error',
  );
}

async function reacquireWithDependencies(rawInput, dependencies) {
  const input = validateReacquireInput(rawInput);
  let session;
  try {
    session = await dependencies.openSession(input.adminSecret);
  } catch (error) {
    fail(
      'PRODUCTION_PLAYER_CANARY_APPROVAL_REACQUISITION_SESSION_UNAVAILABLE',
      'safe-pre-mutation-failure',
      error,
    );
  }
  let rawStatus;
  let readError;
  let closeError;
  try {
    try {
      rawStatus = await dependencies.read({
        session,
        arguments: readArguments(input),
      });
    } catch (error) {
      readError = error;
    }
  } finally {
    try {
      await closeSession(session);
    } catch (error) {
      closeError = error;
    }
  }
  if (readError !== undefined || closeError !== undefined) {
    fail(
      'PRODUCTION_PLAYER_CANARY_APPROVAL_REACQUISITION_UNAVAILABLE',
      'halt',
      readError ?? closeError,
    );
  }
  const status = projectStatus(rawStatus, input);
  if (!status.approvalRegistered) {
    fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REACQUISITION_ABSENT');
  }
  return brand(status, 'existing-row-reacquired');
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  async openSession(adminSecret) {
    const module = await import('./greater-realm-production-transport.ts');
    return module.createGreaterRealmAdminTransportSession({ adminSecret });
  },
  async register(input) {
    const module = await import('./production-player-canary-admin-transport.ts');
    return module.registerProductionPlayerCanaryApprovalV1(input);
  },
  refresh(session) { return session.invalidate(); },
  async read(input) {
    const module = await import('./production-player-canary-admin-transport.ts');
    return module.getProductionPlayerCanaryApprovalV1(input);
  },
});

export function registerAndReconcileProductionPlayerCanaryApprovalV1(input) {
  return reconcileWithDependencies(input, DEFAULT_DEPENDENCIES);
}

/**
 * Reacquire branded authority from an exact committed registration after a
 * process restart. This path opens a fresh session and never submits a reducer.
 */
export function reacquireProductionPlayerCanaryApprovalReconciliationV1(input) {
  return reacquireWithDependencies(input, DEFAULT_DEPENDENCIES);
}

export function requireProductionPlayerCanaryApprovalReconciliation(value) {
  if (
    value === null
    || typeof value !== 'object'
    || !reconciliationBrand.has(value)
    || value.profile !== PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_PROFILE
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_REQUIRED');
  return value;
}

export const productionPlayerCanaryApprovalReconciliationTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      reconcileWithDependencies,
      reacquireWithDependencies,
      projectStatus,
    })
    : undefined;
