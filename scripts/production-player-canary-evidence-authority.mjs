import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';

import {
  deriveProductionPlayerCanaryCommandAuthorityV1,
} from './production-player-canary-command-authority.mjs';

export const PRODUCTION_PLAYER_CANARY_EVIDENCE_AUTHORITY_PROFILE =
  'warpkeep-production-player-canary-evidence-authority-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const DECIMAL_U64 = /^(?:0|[1-9][0-9]{0,19})$/u;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const authorityBrand = new WeakSet();
const PROTECTED_RUNTIME_SOURCE_CLOSURE = Object.freeze([
  'scripts/production-player-canary-admin-transport.ts',
  'scripts/production-player-canary-approval-reconciliation.mjs',
  'scripts/production-player-canary-baseline-reconciliation.mjs',
  'scripts/production-player-canary-command-authority.mjs',
  'scripts/production-player-canary-evidence-authority.mjs',
  'scripts/production-player-canary-owner-approval.mjs',
  'scripts/greater-realm-production-transport.ts',
  'scripts/greater-realm-cutover-write-control.ts',
  'scripts/hermes-admin.ts',
  'scripts/production-admin-token-budget.mjs',
  'scripts/notification-pages-live-hermes-authority.mjs',
  'scripts/notification-pages-live-receipt.mjs',
  'scripts/notification-pages-live-release-binding.mjs',
  'scripts/auth-bridge-config-attestation.mjs',
  'scripts/alpha-activation-controls.ts',
  'scripts/alpha-v10-activation-controls.ts',
  'scripts/hermes-machine-output.ts',
  'scripts/founder-admission-authority.ts',
  'scripts/profiles',
  'scripts/access-requests',
  'scripts/admission-notifications',
  'services/auth-bridge/src',
  'spacetimedb/src',
  'src/spacetime/module_bindings',
]);
const EXECUTING_AUTHORITY_BYTES = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const EXECUTING_REPOSITORY_ROOT = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
);

function canonicalRepositoryRoot(repositoryRoot) {
  if (
    typeof repositoryRoot !== 'string'
    || !isAbsolute(repositoryRoot)
    || resolve(repositoryRoot) !== repositoryRoot
  ) fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
  try {
    if (realpathSync(repositoryRoot) !== repositoryRoot) {
      fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
    }
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
  }
  return repositoryRoot;
}

function runGit(
  repositoryRoot,
  arguments_,
  maximumOutputBytes = 4_096,
  acceptedStatuses = [0],
) {
  const root = canonicalRepositoryRoot(repositoryRoot);
  const result = spawnSync('/usr/bin/git', [
    '--no-optional-locks',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    ...arguments_,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      HOME: '/nonexistent',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      LC_ALL: 'C',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5_000,
    maxBuffer: maximumOutputBytes,
  });
  if (
    !acceptedStatuses.includes(result.status)
    || result.signal !== null
    || result.error !== undefined
    || result.stderr !== ''
  ) fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
  return Object.freeze({
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
  });
}

function exactGit(repositoryRoot, arguments_, maximumOutputBytes = 4_096) {
  return runGit(repositoryRoot, arguments_, maximumOutputBytes).stdout;
}

function exactGitLine(repositoryRoot, arguments_) {
  const value = exactGit(repositoryRoot, arguments_).trim();
  if (!COMMIT.test(value)) fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
  return value;
}

function assertProtectedSourceAtRoot(
  repositoryRoot,
  protectedCommit,
  protectedTree,
  expectedRepositoryRoot,
  executingAuthorityBytes,
) {
  const root = canonicalRepositoryRoot(repositoryRoot);
  if (root !== expectedRepositoryRoot) {
    fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
  }
  const headCommit = exactGitLine(
    root,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
  );
  if (
    !COMMIT.test(protectedCommit)
    || !COMMIT.test(protectedTree)
    || exactGitLine(root, [
      'rev-parse', '--verify', `${protectedCommit}^{tree}`,
    ]) !== protectedTree
  ) fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');

  // A successor predeploy checkout may inspect its exact protected predecessor,
  // but unrelated or rewritten source is never accepted.
  const ancestry = runGit(root, [
    'merge-base', '--is-ancestor', protectedCommit, headCommit,
  ], 4_096, [0, 1]);
  if (ancestry.status !== 0 || ancestry.stdout !== '') {
    fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
  }

  const closureDifference = runGit(root, [
    'diff', '--quiet', protectedCommit, headCommit, '--',
    ...PROTECTED_RUNTIME_SOURCE_CLOSURE,
  ], 4_096, [0, 1]);
  if (closureDifference.status !== 0 || closureDifference.stdout !== '') {
    fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_CLOSURE_MISMATCH');
  }

  // The checkout may advance from C6 to clean C7, but the security boundary
  // that performs this attestation must still be byte-identical to the exact
  // implementation approved in the protected commit.
  const protectedAuthority = exactGit(root, [
    'show', `${protectedCommit}:scripts/production-player-canary-evidence-authority.mjs`,
  ], 1_048_576);
  if (
    typeof executingAuthorityBytes !== 'string'
    || protectedAuthority !== executingAuthorityBytes
  ) fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_IMPLEMENTATION_MISMATCH');

  // Porcelain-v2 plus explicit index/worktree diffs cover staged, unstaged,
  // unmerged, submodule, and untracked changes without writing the index.
  if (exactGit(root, [
    'status', '--porcelain=v2', '-z', '--untracked-files=all',
    '--ignore-submodules=none',
  ], 1_048_576) !== '') fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_DIRTY');
  for (const arguments_ of [
    ['diff-index', '--cached', '--quiet', 'HEAD', '--'],
    ['diff-files', '--quiet', '--'],
    ['diff', '--quiet', 'HEAD', '--'],
  ]) {
    const difference = runGit(root, arguments_, 4_096, [0, 1]);
    if (difference.status !== 0 || difference.stdout !== '') {
      fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_DIRTY');
    }
  }

  // Status intentionally honors index visibility flags. Reject both flags
  // independently so neither skip-worktree nor assume-unchanged can hide drift.
  const indexed = exactGit(
    root,
    ['ls-files', '-v', '-z', '--cached'],
    4_194_304,
  ).split('\0');
  if (indexed.some(line => line !== '' && line[0] !== 'H')) {
    fail('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INDEX_FLAG_REJECTED');
  }
}

function assertProtectedSource(repositoryRoot, protectedCommit, protectedTree) {
  assertProtectedSourceAtRoot(
    repositoryRoot,
    protectedCommit,
    protectedTree,
    EXECUTING_REPOSITORY_ROOT,
    EXECUTING_AUTHORITY_BYTES,
  );
}

const AUTHORITY_KEYS = Object.freeze([
  'profile',
  'reviewedAdmissionPlanDigest',
  'reviewedAdmissionClaimDigest',
  'notificationEvidenceCommitment',
  'adminGameplayEvidenceDigest',
  'serverBaselineCommitment',
  'ownerApprovalCommitment',
  'routeSetCommitment',
  'approvedAt',
  'notAfter',
  'recordedAt',
  'protectedCommit',
  'protectedTree',
  'notificationPagesLiveReceiptDigest',
  'notificationPagesLivePagesSourceCommit',
  'notificationPagesLiveBridgeSourceCommit',
  'notificationPagesLiveRootReceiptDigest',
  'notificationPagesLiveRootPagesSourceCommit',
  'normalRequestAdmission',
  'exactlyOnceNotification',
  'sameAdmissionGeneration',
  'sameFounder',
  'directTierOneFounder',
  'workerCount',
  'dispatchReceiptCount',
  'recallReceiptCount',
  'distinctResourceKindCount',
  'naturalGatheringWindowSatisfied',
  'terminalIdleWorkerCount',
  'terminalGraphEmpty',
  'isolatedResourceKindCount',
  'resourceQuantumCount',
  'humanRouteAndTimeCutoffSatisfied',
]);

const HERMES_KEYS = Object.freeze([
  'notificationPagesLiveReceiptDigest',
  'notificationPagesLivePagesSourceCommit',
  'notificationPagesLiveBridgeSourceCommit',
  'notificationPagesLiveRootReceiptDigest',
  'notificationPagesLiveRootPagesSourceCommit',
]);

const ADMIN_EVIDENCE_KEYS = Object.freeze([
  'profile', 'challengeDigest', 'reviewedAdmissionPlanDigest',
  'serverBaselineCommitment', 'admissionProfileDigest', 'evidenceDigest',
  'routeSetCommitment', 'commandSetCommitment',
  'ownerApprovalArtifactDigest', 'ownerApprovalCommitment',
  'approvalRegistrationCommitment', 'requestCycle',
  'requestedAtMicros', 'baselineCapturedAtMicros', 'observedAtMicros',
  'earliestDispatchAtMicros',
  'latestRecallAtMicros', 'directTierOneFounder',
  'normalRequestAdmission', 'ownerBound', 'currentTermsAccepted',
  'workerCount', 'dispatchReceiptCount', 'recallReceiptCount',
  'distinctResourceKindCount', 'minimumGatheringElapsedMicros',
  'maximumGatheringElapsedMicros', 'maximumRouteSteps',
  'terminalIdleWorkerCount', 'terminalAssignmentCount',
  'terminalOccupationCount', 'terminalScheduleCount',
  'isolatedResourceKindCount', 'resourceQuantumCount',
  'foodDelta', 'woodDelta', 'stoneDelta', 'goldDelta',
]);

export class ProductionPlayerCanaryEvidenceAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryEvidenceAuthorityError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryEvidenceAuthorityError(code);
}

function record(value, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function exactKeys(value, keys, code) {
  const result = record(value, code);
  if (Object.keys(result).sort().join('\0') !== [...keys].sort().join('\0')) fail(code);
  return result;
}

function exactInstant(value) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isSafeInteger(timestamp) && new Date(timestamp).toISOString() === value;
}

function u64(value, code) {
  const text = typeof value === 'bigint' ? value.toString() : value;
  if (typeof text !== 'string' || !DECIMAL_U64.test(text)) fail(code);
  const result = BigInt(text);
  if (result > U64_MAX) fail(code);
  return result;
}

function exactInteger(value, expected) {
  return Number.isSafeInteger(value) && value === expected;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [
      key, canonical(value[key]),
    ]));
  }
  return value;
}

function digestPrivateCanonical(profile, evidenceNonce, value) {
  return createHash('sha256').update(
    `${framed([profile, evidenceNonce, JSON.stringify(canonical(value))])}\n`,
    'utf8',
  ).digest('hex');
}

function framed(values) {
  return values.map(value => {
    const text = value.toString();
    return `${text.length}:${text}`;
  }).join('|');
}

function profileField(value) {
  return value === undefined ? '-' : `+${value}`;
}

export function productionPlayerCanaryAdmissionProfileDigest(profile) {
  const value = exactKeys(
    profile,
    ['canonicalUsername', 'displayName', 'pfpUrl', 'publicBio'],
    'PRODUCTION_PLAYER_CANARY_PLAN_PROFILE_INVALID',
  );
  for (const key of ['canonicalUsername', 'displayName', 'pfpUrl', 'publicBio']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      fail('PRODUCTION_PLAYER_CANARY_PLAN_PROFILE_INVALID');
    }
  }
  return createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.admission-profile.v1',
    profileField(value.canonicalUsername),
    profileField(value.displayName),
    profileField(value.pfpUrl),
    profileField(value.publicBio),
  ])}\n`, 'utf8').digest('hex');
}

export function productionPlayerCanarySubjectCommitment(fid, evidenceNonce) {
  const privateFid = u64(fid, 'PRODUCTION_PLAYER_CANARY_SUBJECT_COMMITMENT_INVALID');
  if (privateFid < 1n || typeof evidenceNonce !== 'string' || !SHA256.test(evidenceNonce)) {
    fail('PRODUCTION_PLAYER_CANARY_SUBJECT_COMMITMENT_INVALID');
  }
  return createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.same-subject.v1',
    evidenceNonce,
    `farcaster:${privateFid.toString()}`,
  ])}\n`, 'utf8').digest('hex');
}

function parseHermesAuthority(value) {
  const authority = exactKeys(
    value, HERMES_KEYS, 'PRODUCTION_PLAYER_CANARY_HERMES_AUTHORITY_INVALID',
  );
  if (
    !SHA256.test(authority.notificationPagesLiveReceiptDigest)
    || !COMMIT.test(authority.notificationPagesLivePagesSourceCommit)
    || !COMMIT.test(authority.notificationPagesLiveBridgeSourceCommit)
    || !SHA256.test(authority.notificationPagesLiveRootReceiptDigest)
    || !COMMIT.test(authority.notificationPagesLiveRootPagesSourceCommit)
  ) fail('PRODUCTION_PLAYER_CANARY_HERMES_AUTHORITY_INVALID');
  return Object.freeze({ ...authority });
}

function parseAdminEvidence(value) {
  const evidence = exactKeys(
    value,
    ADMIN_EVIDENCE_KEYS,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  const requestedAtMicros = u64(
    evidence.requestedAtMicros,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  const observedAtMicros = u64(
    evidence.observedAtMicros,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  const baselineCapturedAtMicros = u64(
    evidence.baselineCapturedAtMicros,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  const earliestDispatchAtMicros = u64(
    evidence.earliestDispatchAtMicros,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  const latestRecallAtMicros = u64(
    evidence.latestRecallAtMicros,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  const minimumGatheringElapsedMicros = u64(
    evidence.minimumGatheringElapsedMicros,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  const maximumGatheringElapsedMicros = u64(
    evidence.maximumGatheringElapsedMicros,
    'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID',
  );
  for (const key of [
    'terminalAssignmentCount', 'terminalOccupationCount', 'terminalScheduleCount',
  ]) {
    if (u64(evidence[key], 'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID') !== 0n) {
      fail('PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID');
    }
  }
  for (const key of ['foodDelta', 'woodDelta', 'stoneDelta', 'goldDelta']) {
    if (u64(evidence[key], 'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID') !== 1n) {
      fail('PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID');
    }
  }
  if (
    evidence.profile !== 'warpkeep-production-player-canary-admin-evidence-v1'
    || !SHA256.test(evidence.challengeDigest)
    || !SHA256.test(evidence.reviewedAdmissionPlanDigest)
    || !SHA256.test(evidence.serverBaselineCommitment)
    || !SHA256.test(evidence.admissionProfileDigest)
    || !SHA256.test(evidence.evidenceDigest)
    || !SHA256.test(evidence.routeSetCommitment)
    || !SHA256.test(evidence.commandSetCommitment)
    || !SHA256.test(evidence.ownerApprovalArtifactDigest)
    || !SHA256.test(evidence.ownerApprovalCommitment)
    || !SHA256.test(evidence.approvalRegistrationCommitment)
    || u64(evidence.requestCycle, 'PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID') !== 0n
    || requestedAtMicros < 1n
    || baselineCapturedAtMicros <= requestedAtMicros
    || baselineCapturedAtMicros > earliestDispatchAtMicros
    || observedAtMicros <= requestedAtMicros
    || earliestDispatchAtMicros <= requestedAtMicros
    || latestRecallAtMicros <= earliestDispatchAtMicros
    || observedAtMicros < latestRecallAtMicros
    || evidence.directTierOneFounder !== true
    || evidence.normalRequestAdmission !== true
    || evidence.ownerBound !== true
    || evidence.currentTermsAccepted !== true
    || !exactInteger(evidence.workerCount, 4)
    || !exactInteger(evidence.dispatchReceiptCount, 4)
    || !exactInteger(evidence.recallReceiptCount, 4)
    || !exactInteger(evidence.distinctResourceKindCount, 4)
    || minimumGatheringElapsedMicros < 60_000_000n
    || minimumGatheringElapsedMicros >= 120_000_000n
    || maximumGatheringElapsedMicros < minimumGatheringElapsedMicros
    || maximumGatheringElapsedMicros >= 120_000_000n
    || !Number.isSafeInteger(evidence.maximumRouteSteps)
    || evidence.maximumRouteSteps < 1
    || evidence.maximumRouteSteps > 8_192
    || !exactInteger(evidence.terminalIdleWorkerCount, 4)
    || !exactInteger(evidence.isolatedResourceKindCount, 4)
    || !exactInteger(evidence.resourceQuantumCount, 4)
  ) fail('PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID');
  return Object.freeze({
    ...evidence,
    requestCycle: 0n,
    requestedAtMicros,
    baselineCapturedAtMicros,
    observedAtMicros,
    earliestDispatchAtMicros,
    latestRecallAtMicros,
    minimumGatheringElapsedMicros,
    maximumGatheringElapsedMicros,
    terminalAssignmentCount: 0n,
    terminalOccupationCount: 0n,
    terminalScheduleCount: 0n,
    foodDelta: 1n,
    woodDelta: 1n,
    stoneDelta: 1n,
    goldDelta: 1n,
  });
}

/** Validate the exact typed production procedure result without exposing it. */
export function validateProductionPlayerCanaryAdminEvidenceV1(value) {
  parseAdminEvidence(value);
}

export function parseProductionPlayerCanaryEvidenceAuthority(value) {
  const authority = exactKeys(
    value, AUTHORITY_KEYS, 'PRODUCTION_PLAYER_CANARY_EVIDENCE_AUTHORITY_INVALID',
  );
  if (
    authority.profile !== PRODUCTION_PLAYER_CANARY_EVIDENCE_AUTHORITY_PROFILE
    || !SHA256.test(authority.reviewedAdmissionPlanDigest)
    || !SHA256.test(authority.reviewedAdmissionClaimDigest)
    || !SHA256.test(authority.notificationEvidenceCommitment)
    || !SHA256.test(authority.adminGameplayEvidenceDigest)
    || !SHA256.test(authority.serverBaselineCommitment)
    || !SHA256.test(authority.ownerApprovalCommitment)
    || !SHA256.test(authority.routeSetCommitment)
    || !exactInstant(authority.approvedAt)
    || !exactInstant(authority.notAfter)
    || !exactInstant(authority.recordedAt)
    || Date.parse(authority.approvedAt) > Date.parse(authority.recordedAt)
    || Date.parse(authority.recordedAt) >= Date.parse(authority.notAfter)
    || !COMMIT.test(authority.protectedCommit)
    || !COMMIT.test(authority.protectedTree)
    || !SHA256.test(authority.notificationPagesLiveReceiptDigest)
    || !COMMIT.test(authority.notificationPagesLivePagesSourceCommit)
    || !COMMIT.test(authority.notificationPagesLiveBridgeSourceCommit)
    || !SHA256.test(authority.notificationPagesLiveRootReceiptDigest)
    || !COMMIT.test(authority.notificationPagesLiveRootPagesSourceCommit)
    || authority.normalRequestAdmission !== true
    || authority.exactlyOnceNotification !== true
    || authority.sameAdmissionGeneration !== true
    || authority.sameFounder !== true
    || authority.directTierOneFounder !== true
    || !exactInteger(authority.workerCount, 4)
    || !exactInteger(authority.dispatchReceiptCount, 4)
    || !exactInteger(authority.recallReceiptCount, 4)
    || !exactInteger(authority.distinctResourceKindCount, 4)
    || authority.naturalGatheringWindowSatisfied !== true
    || !exactInteger(authority.terminalIdleWorkerCount, 4)
    || authority.terminalGraphEmpty !== true
    || !exactInteger(authority.isolatedResourceKindCount, 4)
    || !exactInteger(authority.resourceQuantumCount, 4)
    || authority.humanRouteAndTimeCutoffSatisfied !== true
  ) fail('PRODUCTION_PLAYER_CANARY_EVIDENCE_AUTHORITY_INVALID');
  return Object.freeze(canonical(authority));
}

function sameCanonicalData(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function buildExpectedEvidenceAuthority(input) {
  if (typeof input?.evidenceNonce !== 'string' || !SHA256.test(input.evidenceNonce)) {
    fail('PRODUCTION_PLAYER_CANARY_EVIDENCE_AGGREGATE_INVALID');
  }
  const inspectedPlan = exactKeys(
    input.inspectedPlan,
    ['plan', 'planDigest', 'claimDigest', 'claimedAt'],
    'PRODUCTION_PLAYER_CANARY_REVIEWED_PLAN_INVALID',
  );
  const plan = record(
    inspectedPlan.plan,
    'PRODUCTION_PLAYER_CANARY_REVIEWED_PLAN_INVALID',
  );
  const planDigest = inspectedPlan.planDigest;
  const privateFid = u64(plan.fid, 'PRODUCTION_PLAYER_CANARY_REVIEWED_PLAN_INVALID');
  if (
    privateFid < 1n
    || plan.schemaVersion !== 4
    || plan.kind !== 'warpkeep-reviewed-founder-admission-plan'
    || typeof plan.planId !== 'string'
    || !/^[0-9a-f]{32}$/u.test(plan.planId)
    || typeof planDigest !== 'string'
    || !SHA256.test(planDigest)
    || typeof inspectedPlan.claimDigest !== 'string'
    || !SHA256.test(inspectedPlan.claimDigest)
  ) fail('PRODUCTION_PLAYER_CANARY_REVIEWED_PLAN_INVALID');

  const hermes = parseHermesAuthority(input.notificationPagesLiveAuthority);
  if (HERMES_KEYS.some(key => plan[key] !== hermes[key])) {
    fail('PRODUCTION_PLAYER_CANARY_REVIEWED_PLAN_HERMES_MISMATCH');
  }
  const diagnostics = record(
    input.notificationDiagnostics,
    'PRODUCTION_PLAYER_CANARY_NOTIFICATION_DIAGNOSTICS_INVALID',
  );
  const inspectedApproval = exactKeys(
    input.inspectedApproval,
    [
      'approval', 'artifactDigest', 'approvalCommitment',
      'routeSetCommitment', 'commandSetCommitment',
    ],
    'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID',
  );
  const approval = record(
    inspectedApproval.approval,
    'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID',
  );
  const admin = parseAdminEvidence(input.adminEvidence);
  const requestedAtMicros = Number(admin.requestedAtMicros);
  if (
    !Number.isSafeInteger(requestedAtMicros)
    || diagnostics.status !== 'already-sent'
    || diagnostics.generation !== 'pending-request'
    || diagnostics.requestedAtMicros !== requestedAtMicros
    || diagnostics.deliveryAttemptCount !== 1
    || diagnostics.verificationFailureCount !== 0
    || diagnostics.subscribed !== true
    || diagnostics.recoveryCount !== 0
    || diagnostics.lastRecoveryAt !== undefined
    || !Array.isArray(diagnostics.retryReasons)
    || diagnostics.retryReasons.length !== 0
    || diagnostics.lastFailureReason !== undefined
    || diagnostics.nextAttemptAt !== undefined
  ) fail('PRODUCTION_PLAYER_CANARY_NOTIFICATION_NOT_EXACTLY_ONCE');

  if (
    !exactInstant(approval.approvedAt)
    || !exactInstant(approval.notAfter)
    || !COMMIT.test(approval.protectedCommit)
    || !COMMIT.test(approval.protectedTree)
    || !Number.isSafeInteger(approval.minimumGatheringSeconds)
    || !Number.isSafeInteger(approval.maximumGatheringSeconds)
    || !Number.isSafeInteger(approval.maximumRouteSteps)
  ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID');

  const expectedChallengeDigest = createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.challenge.v1',
    input.evidenceNonce,
  ])}\n`, 'utf8').digest('hex');
  const expectedProfileDigest = productionPlayerCanaryAdmissionProfileDigest(plan.profile);
  const approvedAtMicros = BigInt(Date.parse(approval.approvedAt)) * 1_000n;
  const notAfterMicros = BigInt(Date.parse(approval.notAfter)) * 1_000n;
  const observedAtMillis = admin.observedAtMicros / 1_000n;
  const expectedOwnerApprovalCommitment = createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.owner-approval.v1',
    approval.evidenceNonce,
    inspectedApproval.artifactDigest,
    approval.serverBaselineCommitment,
    inspectedApproval.routeSetCommitment,
  ])}\n`, 'utf8').digest('hex');
  const expectedCommandAuthority = deriveProductionPlayerCanaryCommandAuthorityV1({
    evidenceNonce: approval.evidenceNonce,
    reviewedAdmissionPlanDigest: approval.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: approval.serverBaselineCommitment,
    routeSetCommitment: inspectedApproval.routeSetCommitment,
  });
  const expectedApprovalRegistrationCommitment = createHash('sha256').update(
    `${framed([
      'warpkeep.production-player-canary.approval-registration.v1',
      expectedChallengeDigest,
      planDigest,
      approval.serverBaselineCommitment,
      inspectedApproval.routeSetCommitment,
      expectedCommandAuthority.commandKeyPolicyVersion,
      expectedCommandAuthority.commandSetCommitment,
      inspectedApproval.artifactDigest,
      inspectedApproval.approvalCommitment,
      approvedAtMicros,
      notAfterMicros,
    ])}\n`,
    'utf8',
  ).digest('hex');
  if (
    admin.challengeDigest !== expectedChallengeDigest
    || admin.reviewedAdmissionPlanDigest !== planDigest
    || admin.admissionProfileDigest !== expectedProfileDigest
    || !SHA256.test(approval.serverBaselineCommitment)
    || admin.serverBaselineCommitment !== approval.serverBaselineCommitment
    || approval.evidenceNonce !== input.evidenceNonce
    || approval.reviewedAdmissionPlanDigest !== planDigest
    || approval.protectedCommit !== hermes.notificationPagesLivePagesSourceCommit
    || approval.predecessorLiveReceiptDigest
      !== hermes.notificationPagesLiveReceiptDigest
    || approval.predecessorLiveRootReceiptDigest
      !== hermes.notificationPagesLiveRootReceiptDigest
    || approval.predecessorLiveRootPagesSourceCommit
      !== hermes.notificationPagesLiveRootPagesSourceCommit
    || !SHA256.test(inspectedApproval.artifactDigest)
    || !SHA256.test(inspectedApproval.approvalCommitment)
    || inspectedApproval.approvalCommitment !== expectedOwnerApprovalCommitment
    || !SHA256.test(inspectedApproval.routeSetCommitment)
    || !SHA256.test(inspectedApproval.commandSetCommitment)
    || approval.routeSetCommitment !== inspectedApproval.routeSetCommitment
    || approval.commandKeyPolicyVersion
      !== expectedCommandAuthority.commandKeyPolicyVersion
    || approval.commandSetCommitment
      !== expectedCommandAuthority.commandSetCommitment
    || approval.commandSetCommitment !== inspectedApproval.commandSetCommitment
    || admin.routeSetCommitment !== inspectedApproval.routeSetCommitment
    || admin.commandSetCommitment !== inspectedApproval.commandSetCommitment
    || admin.ownerApprovalArtifactDigest !== inspectedApproval.artifactDigest
    || admin.ownerApprovalCommitment !== inspectedApproval.approvalCommitment
    || admin.approvalRegistrationCommitment
      !== expectedApprovalRegistrationCommitment
    || admin.maximumRouteSteps > approval.maximumRouteSteps
    || admin.minimumGatheringElapsedMicros
      < BigInt(approval.minimumGatheringSeconds) * 1_000_000n
    || admin.maximumGatheringElapsedMicros
      >= BigInt(approval.maximumGatheringSeconds) * 1_000_000n
    || admin.baselineCapturedAtMicros > approvedAtMicros
    || admin.earliestDispatchAtMicros < approvedAtMicros
    || admin.latestRecallAtMicros >= notAfterMicros
    || admin.observedAtMicros >= notAfterMicros
    || observedAtMillis > BigInt(Number.MAX_SAFE_INTEGER)
  ) fail('PRODUCTION_PLAYER_CANARY_SAME_FOUNDER_EVIDENCE_INVALID');

  const recordedAt = new Date(Number(observedAtMillis)).toISOString();

  const authority = parseProductionPlayerCanaryEvidenceAuthority({
    profile: PRODUCTION_PLAYER_CANARY_EVIDENCE_AUTHORITY_PROFILE,
    reviewedAdmissionPlanDigest: planDigest,
    reviewedAdmissionClaimDigest: inspectedPlan.claimDigest,
    notificationEvidenceCommitment: digestPrivateCanonical(
      'warpkeep.production-player-canary.notification-evidence.v1',
      input.evidenceNonce,
      diagnostics,
    ),
    adminGameplayEvidenceDigest: admin.evidenceDigest,
    serverBaselineCommitment: admin.serverBaselineCommitment,
    ownerApprovalCommitment: inspectedApproval.approvalCommitment,
    routeSetCommitment: inspectedApproval.routeSetCommitment,
    approvedAt: approval.approvedAt,
    notAfter: approval.notAfter,
    recordedAt,
    protectedCommit: approval.protectedCommit,
    protectedTree: approval.protectedTree,
    notificationPagesLiveReceiptDigest:
      hermes.notificationPagesLiveReceiptDigest,
    notificationPagesLivePagesSourceCommit:
      hermes.notificationPagesLivePagesSourceCommit,
    notificationPagesLiveBridgeSourceCommit:
      hermes.notificationPagesLiveBridgeSourceCommit,
    notificationPagesLiveRootReceiptDigest:
      hermes.notificationPagesLiveRootReceiptDigest,
    notificationPagesLiveRootPagesSourceCommit:
      hermes.notificationPagesLiveRootPagesSourceCommit,
    normalRequestAdmission: true,
    exactlyOnceNotification: true,
    sameAdmissionGeneration: true,
    sameFounder: true,
    directTierOneFounder: true,
    workerCount: 4,
    dispatchReceiptCount: 4,
    recallReceiptCount: 4,
    distinctResourceKindCount: 4,
    naturalGatheringWindowSatisfied: true,
    terminalIdleWorkerCount: 4,
    terminalGraphEmpty: true,
    isolatedResourceKindCount: 4,
    resourceQuantumCount: 4,
    humanRouteAndTimeCutoffSatisfied: true,
  });
  authorityBrand.add(authority);
  return authority;
}

function adminProcedureInput(plan, approval) {
  if (
    typeof approval.serverBaselineCommitment !== 'string'
    || !SHA256.test(approval.serverBaselineCommitment)
  ) fail('PRODUCTION_PLAYER_CANARY_PRIVATE_ADMIN_INPUT_INVALID');
  return Object.freeze({
    fid: u64(plan.fid, 'PRODUCTION_PLAYER_CANARY_PRIVATE_ADMIN_INPUT_INVALID'),
    reviewedAdmissionPlanDigest: approval.reviewedAdmissionPlanDigest,
    evidenceNonce: approval.evidenceNonce,
  });
}

async function defaultInspectClaimedPlan(input) {
  const module = await import('./profiles/founder-admission-plan.ts');
  return module.inspectClaimedReviewedFounderAdmissionPlan(input);
}

async function defaultInspectHermes(input) {
  const module = await import('./notification-pages-live-hermes-authority.mjs');
  return module.inspectHermesNotificationPagesLiveAuthority(input);
}

async function defaultInspectOwnerApproval(input) {
  const module = await import('./production-player-canary-owner-approval.mjs');
  return module.inspectProductionPlayerCanaryOwnerApproval(input);
}

async function defaultInspectNotification(input) {
  const module = await import('./hermes-admin.ts');
  return module.inspectAdmissionNotification(
    input.bridgeUrl,
    input.fid,
    input.operatorSecret,
    input.fetchImpl,
  );
}

async function defaultCallAdminEvidence(input) {
  const transportModule = await import('./greater-realm-production-transport.ts');
  const canaryTransportModule = await import('./production-player-canary-admin-transport.ts');
  const session = transportModule.createGreaterRealmAdminTransportSession({
    adminSecret: input.adminSecret,
  });
  try {
    return await canaryTransportModule.getProductionPlayerCanaryEvidenceV1({
      session,
      arguments: input.arguments,
    });
  } finally {
    await session.close();
  }
}

async function inspectExpectedEvidenceAuthority(input, dependencies) {
  if (
    input === null
    || typeof input !== 'object'
    || typeof input.founderPlanDirectory !== 'string'
    || typeof input.ownerApprovalDirectory !== 'string'
    || !(input.now instanceof Date)
    || !Number.isSafeInteger(input.now.getTime())
  ) fail('PRODUCTION_PLAYER_CANARY_EVIDENCE_INSPECTION_INPUT_INVALID');
  const inspectClaimedPlan = dependencies.inspectClaimedPlan;
  const inspectHermes = dependencies.inspectHermes;
  const inspectOwnerApproval = dependencies.inspectOwnerApproval;
  const inspectNotification = dependencies.inspectNotification;
  const callAdminEvidence = dependencies.callAdminEvidence;
  const inspectProtectedSource = dependencies.assertProtectedSource
    ?? assertProtectedSource;
  const planInspectionInput = Object.freeze({
    directory: input.founderPlanDirectory,
    reference: input.reviewedAdmissionPlanReference,
    expectedSourceConfigurationDigest: input.expectedSourceConfigurationDigest,
    expectedTargetConfigurationDigest: input.expectedTargetConfigurationDigest,
    expectedProfilePolicyVersion: input.expectedProfilePolicyVersion,
    now: input.now,
  });
  const inspectedPlan = await inspectClaimedPlan(planInspectionInput);
  const plan = record(
    inspectedPlan?.plan,
    'PRODUCTION_PLAYER_CANARY_REVIEWED_PLAN_INVALID',
  );
  const privateFid = u64(plan.fid, 'PRODUCTION_PLAYER_CANARY_REVIEWED_PLAN_INVALID');
  const approvalInspectionInput = Object.freeze({
    directory: input.ownerApprovalDirectory,
    reference: input.ownerApprovalReference,
    now: input.now,
  });
  const inspectedApproval = await inspectOwnerApproval(approvalInspectionInput);
  const approval = record(
    inspectedApproval?.approval,
    'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID',
  );
  if (approval.reviewedAdmissionPlanDigest !== inspectedPlan.planDigest) {
    fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_PLAN_MISMATCH');
  }
  inspectProtectedSource(
    input.repositoryRoot,
    approval.protectedCommit,
    approval.protectedTree,
  );
  const hermesInput = Object.freeze({
    required: true,
    pagesSourceCommit: input.pagesSourceCommit,
    rootBinding: input.rootBinding,
    directory: input.liveReceiptDirectory,
    repositoryRoot: input.repositoryRoot,
    fetchImpl: input.liveFetchImpl,
    now: input.now,
  });
  const hermesBefore = await inspectHermes(hermesInput);
  const notificationInput = Object.freeze({
    bridgeUrl: input.notificationBridgeUrl,
    fid: privateFid,
    operatorSecret: input.notificationOperatorSecret,
    fetchImpl: input.notificationFetchImpl,
  });
  const diagnosticsBefore = await inspectNotification(notificationInput);
  const adminEvidence = await callAdminEvidence({
    adminSecret: input.adminSecret,
    arguments: adminProcedureInput(plan, approval),
  });

  // Recheck the two independently mutable authorities after the DB read. A
  // transition during aggregation is rejected rather than producing a mixed
  // point-in-time receipt.
  const [diagnosticsAfter, hermesAfter, inspectedPlanAfter, inspectedApprovalAfter] =
    await Promise.all([
    inspectNotification(notificationInput),
    inspectHermes(hermesInput),
    inspectClaimedPlan(planInspectionInput),
    inspectOwnerApproval(approvalInspectionInput),
  ]);
  if (
    !sameCanonicalData(diagnosticsBefore, diagnosticsAfter)
    || !sameCanonicalData(hermesBefore, hermesAfter)
    || !sameCanonicalData(inspectedPlan, inspectedPlanAfter)
    || !sameCanonicalData(inspectedApproval, inspectedApprovalAfter)
  ) fail('PRODUCTION_PLAYER_CANARY_EVIDENCE_CHANGED_DURING_INSPECTION');
  inspectProtectedSource(
    input.repositoryRoot,
    inspectedApprovalAfter.approval.protectedCommit,
    inspectedApprovalAfter.approval.protectedTree,
  );
  return buildExpectedEvidenceAuthority({
    evidenceNonce: approval.evidenceNonce,
    inspectedPlan: inspectedPlanAfter,
    inspectedApproval: inspectedApprovalAfter,
    notificationPagesLiveAuthority: hermesAfter,
    notificationDiagnostics: diagnosticsAfter,
    adminEvidence,
  });
}

/**
 * Acquire every mutable/private input directly at the final operator boundary.
 * No public constructor can brand caller-manufactured plan, claim, Hermes,
 * diagnostic, or gameplay objects.
 */
export async function inspectProductionPlayerCanaryExpectedEvidenceAuthority(input) {
  return inspectExpectedEvidenceAuthority(input, Object.freeze({
    inspectClaimedPlan: defaultInspectClaimedPlan,
    inspectHermes: defaultInspectHermes,
    inspectOwnerApproval: defaultInspectOwnerApproval,
    inspectNotification: defaultInspectNotification,
    callAdminEvidence: defaultCallAdminEvidence,
    assertProtectedSource,
  }));
}

export function requireProductionPlayerCanaryExpectedEvidenceAuthority(value) {
  if (!authorityBrand.has(value)) {
    fail('PRODUCTION_PLAYER_CANARY_EXPECTED_EVIDENCE_AUTHORITY_REQUIRED');
  }
  return value;
}

export const productionPlayerCanaryEvidenceAuthorityTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      assertProtectedSource,
      assertProtectedSourceAtRoot,
      buildExpectedEvidenceAuthority,
      inspectExpectedEvidenceAuthority,
    })
    : undefined;
