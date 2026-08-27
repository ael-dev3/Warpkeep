import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  fstatSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from './auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  assertNotificationPagesProductionPlayerCanaryActivationSourceTransition,
} from './notification-pages-live-receipt.mjs';
import {
  parseProductionPlayerCanaryActivationRequest,
  preflightProductionPlayerCanaryActivationRequestPublication,
  requireInspectedActivationRequestReferences,
  writeProductionPlayerCanaryActivationRequest,
} from './production-player-canary-deploy-authority.mjs';
import {
  assertProductionPlayerCanaryProtectedSource,
  parseProductionPlayerCanaryEvidenceAuthority,
  productionPlayerCanarySubjectCommitment,
} from './production-player-canary-evidence-authority.mjs';
import {
  inspectProductionPlayerCanaryTerminalReceiptJournal,
} from './production-player-canary-operator-journal.mjs';
import {
  defaultProductionPlayerCanaryReceiptDirectory,
  inspectSettledProductionPlayerCanaryReceipt,
  PRODUCTION_PLAYER_CANARY_RECEIPT_MAXIMUM_AGE_MS,
} from './production-player-canary-receipt.mjs';

export const PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PROFILE =
  'warpkeep-production-player-canary-activation-launcher-v1';

const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const OPERATION_ID = /^[0-9a-f]{32}$/u;
const MAXIMUM_STDIN_BYTES = 32 * 1_024;
const LAUNCH_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'operatorOperationId',
  'candidatePagesSourceTree',
  'request',
]);

export class ProductionPlayerCanaryActivationLauncherError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryActivationLauncherError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryActivationLauncherError(code);
}

function exactPlainObject(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some(key => typeof key !== 'string')
    || ownKeys.join('\0') !== keys.join('\0')
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return keys.every(key => {
    const descriptor = descriptors[key];
    return descriptor !== undefined
      && descriptor.enumerable === true
      && Object.hasOwn(descriptor, 'value')
      && !Object.hasOwn(descriptor, 'get')
      && !Object.hasOwn(descriptor, 'set');
  });
}

export function parseProductionPlayerCanaryActivationLaunch(value) {
  if (
    !exactPlainObject(value, LAUNCH_KEYS)
    || value.schemaVersion !== 1
    || value.profile !== PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PROFILE
    || typeof value.operatorOperationId !== 'string'
    || !OPERATION_ID.test(value.operatorOperationId)
    || typeof value.candidatePagesSourceTree !== 'string'
    || !COMMIT.test(value.candidatePagesSourceTree)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_INPUT_INVALID');
  let request;
  try { request = parseProductionPlayerCanaryActivationRequest(value.request); } catch {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_INPUT_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    profile: PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PROFILE,
    operatorOperationId: value.operatorOperationId,
    candidatePagesSourceTree: value.candidatePagesSourceTree,
    request,
  });
}

function sameFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readCanonicalLaunchWithIo(descriptor, io) {
  let storage;
  let bytes;
  try {
    const named = io.fstat(descriptor, { bigint: true });
    if (
      !named.isFile()
      || named.isSymbolicLink()
      || named.nlink !== 1n
      || (named.mode & 0o7777n) !== 0o600n
      || named.size < 2n
      || named.size > BigInt(MAXIMUM_STDIN_BYTES)
      || (process.getuid !== undefined
        && named.uid !== BigInt(process.getuid()))
    ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_INVALID');
    const before = io.fstat(descriptor, { bigint: true });
    if (!sameFile(named, before)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_CHANGED');
    }
    storage = Buffer.alloc(Number(named.size) + 1);
    let offset = 0;
    while (offset < storage.byteLength) {
      const count = io.read(
        descriptor,
        storage,
        offset,
        storage.byteLength - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    if (offset !== Number(named.size)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_CHANGED');
    }
    bytes = storage.subarray(0, offset);
    const after = io.fstat(descriptor, { bigint: true });
    const current = io.fstat(descriptor, { bigint: true });
    if (!sameFile(before, after) || !sameFile(before, current)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_CHANGED');
    }
    let raw;
    try {
      raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_INVALID');
    }
    const launch = parseProductionPlayerCanaryActivationLaunch(raw);
    if (`${JSON.stringify(launch, null, 2)}\n` !== bytes.toString('utf8')) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_NONCANONICAL');
    }
    return launch;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryActivationLauncherError) {
      throw error;
    }
    return fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_INVALID');
  } finally {
    storage?.fill(0);
  }
}

function readCanonicalLaunchFromDescriptor(descriptor = 0) {
  return readCanonicalLaunchWithIo(descriptor, {
    fstat: fstatSync,
    read: readSync,
  });
}

function gitLine(arguments_) {
  const result = spawnSync('/usr/bin/git', [
    '--no-optional-locks',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    ...arguments_,
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: Object.freeze({
      PATH: '/usr/bin:/bin',
      HOME: '/nonexistent',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      LC_ALL: 'C',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5_000,
    maxBuffer: 4_096,
  });
  const value = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  if (
    result.status !== 0
    || result.signal !== null
    || result.error !== undefined
    || result.stderr !== ''
    || !COMMIT.test(value)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_SOURCE_INVALID');
  return value;
}

function inspectExactCheckout() {
  return Object.freeze({
    commit: gitLine(['rev-parse', '--verify', 'HEAD^{commit}']),
    tree: gitLine(['rev-parse', '--verify', 'HEAD^{tree}']),
  });
}

function exactReference(left, right) {
  return left !== null
    && right !== null
    && typeof left === 'object'
    && typeof right === 'object'
    && left.filename === right.filename
    && left.sha256 === right.sha256
    && Object.keys(left).sort().join('\0') === 'filename\0sha256'
    && Object.keys(right).sort().join('\0') === 'filename\0sha256';
}

function framed(values) {
  return values.map(value => {
    const text = value.toString();
    return `${Buffer.byteLength(text, 'utf8')}:${text}`;
  }).join('|');
}

function exactSourceAttestation(launch, dependencies) {
  const { request } = launch;
  let checkout;
  let closure;
  let transition;
  try {
    checkout = dependencies.inspectCheckout();
    if (
      checkout?.commit !== request.candidatePagesSourceCommit
      || checkout?.tree !== launch.candidatePagesSourceTree
    ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CANDIDATE_MISMATCH');
    dependencies.assertProtectedSource({
      repositoryRoot: REPOSITORY_ROOT,
      protectedCommit: request.predecessorPagesSourceCommit,
      protectedTree: request.predecessorProtectedTree,
    });
    closure = dependencies.verifySourceClosure({ repositoryRoot: REPOSITORY_ROOT });
    if (
      closure?.memberCount !== 926
      || typeof closure.manifestSha256 !== 'string'
      || !SHA256.test(closure.manifestSha256)
    ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CLOSURE_INVALID');
    transition = dependencies.assertSourceTransition({
      predecessorPagesSourceCommit: request.predecessorPagesSourceCommit,
      candidatePagesSourceCommit: request.candidatePagesSourceCommit,
    });
    if (
      transition?.predecessorPagesSourceCommit
        !== request.predecessorPagesSourceCommit
      || transition?.candidatePagesSourceCommit
        !== request.candidatePagesSourceCommit
      || transition?.productionPlayerCanaryReceiptDigest
        !== request.productionPlayerCanaryReceiptDigest
    ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_TRANSITION_MISMATCH');
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryActivationLauncherError) throw error;
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_SOURCE_INVALID');
  }
  return Object.freeze({
    commit: checkout.commit,
    tree: checkout.tree,
    manifestSha256: closure.manifestSha256,
    transition,
  });
}

function requireTerminalJournal(launch, journal) {
  const { request } = launch;
  const contract = journal?.contract;
  if (
    journal?.operationId !== launch.operatorOperationId
    || contract === null
    || typeof contract !== 'object'
    || contract.operationId !== launch.operatorOperationId
    || contract.repositoryRoot !== REPOSITORY_ROOT
    || contract.protectedCommit !== request.predecessorPagesSourceCommit
    || contract.protectedTree !== request.predecessorProtectedTree
    || contract.founderPlanDirectory !== request.founderPlanDirectory
    || !exactReference(
      contract.reviewedAdmissionPlanReference,
      request.reviewedAdmissionPlanReference,
    )
    || contract.ownerApprovalDirectory !== request.ownerApprovalDirectory
    || contract.receiptDirectory
      !== defaultProductionPlayerCanaryReceiptDirectory()
    || !exactReference(
      journal.ownerApprovalReference,
      request.ownerApprovalReference,
    )
    || journal.receipt?.filename
      !== `production-player-canary-${request.productionPlayerCanaryReceiptDigest}.json`
    || journal.receipt?.receiptDigest
      !== request.productionPlayerCanaryReceiptDigest
    || !['installed', 'unchanged'].includes(journal.receipt?.result)
    || journal.receiptIntent?.receiptDigest
      !== request.productionPlayerCanaryReceiptDigest
    || typeof journal.terminalRecordDigest !== 'string'
    || !SHA256.test(journal.terminalRecordDigest)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_JOURNAL_MISMATCH');
  return journal;
}

function requireSettledReceipt(launch, journal, inspected, now) {
  const { request } = launch;
  const receipt = inspected?.receipt;
  const recordedAt = Date.parse(receipt?.recordedAt);
  const notAfter = Date.parse(receipt?.evidenceAuthority?.notAfter);
  const authorityBytes = Buffer.from(
    JSON.stringify(receipt?.evidenceAuthority ?? null),
    'utf8',
  );
  let evidenceAuthorityDigest;
  try {
    evidenceAuthorityDigest = createHash('sha256')
      .update('warpkeep.production-player-canary.evidence-authority.v1\0', 'utf8')
      .update(authorityBytes)
      .digest('hex');
  } finally { authorityBytes.fill(0); }
  if (
    inspected?.receiptDigest !== request.productionPlayerCanaryReceiptDigest
    || inspected?.filename !== journal.receipt.filename
    || receipt === null
    || typeof receipt !== 'object'
    || receipt.source?.protectedCommit !== request.predecessorPagesSourceCommit
    || receipt.source?.protectedTree !== request.predecessorProtectedTree
    || receipt.predecessor?.pagesSourceCommit
      !== request.predecessorPagesSourceCommit
    || journal.receiptIntent.recordedAt !== receipt.recordedAt
    || journal.receiptIntent.notAfter !== receipt.evidenceAuthority?.notAfter
    || journal.receiptIntent.evidenceAuthorityDigest !== evidenceAuthorityDigest
    || !Number.isSafeInteger(recordedAt)
    || !Number.isSafeInteger(notAfter)
    || recordedAt > now.getTime()
    || now.getTime() > notAfter
    || now.getTime() - recordedAt
      > PRODUCTION_PLAYER_CANARY_RECEIPT_MAXIMUM_AGE_MS
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_RECEIPT_MISMATCH');
  return receipt;
}

function requirePrivateAuthorityCrossBinding(
  launch,
  journal,
  receipt,
  references,
) {
  let authority;
  try {
    authority = parseProductionPlayerCanaryEvidenceAuthority(
      receipt.evidenceAuthority,
    );
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CROSS_BINDING_INVALID');
  }
  const inspectedPlan = references?.plan;
  const plan = inspectedPlan?.plan;
  const inspectedApproval = references?.approval;
  const approval = inspectedApproval?.approval;
  if (
    plan === null
    || typeof plan !== 'object'
    || approval === null
    || typeof approval !== 'object'
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CROSS_BINDING_INVALID');
  const challengeDigest = createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.challenge.v1',
    approval.evidenceNonce,
  ])}\n`, 'utf8').digest('hex');
  const approvedAt = Date.parse(approval.approvedAt);
  const notAfter = Date.parse(approval.notAfter);
  if (!Number.isSafeInteger(approvedAt) || !Number.isSafeInteger(notAfter)) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CROSS_BINDING_INVALID');
  }
  const approvedAtMicros = BigInt(approvedAt) * 1_000n;
  const notAfterMicros = BigInt(notAfter) * 1_000n;
  const approvalRegistrationCommitment = createHash('sha256').update(
    `${framed([
      'warpkeep.production-player-canary.approval-registration.v1',
      challengeDigest,
      inspectedPlan.planDigest,
      approval.serverBaselineCommitment,
      inspectedApproval.routeSetCommitment,
      approval.commandKeyPolicyVersion,
      inspectedApproval.commandSetCommitment,
      inspectedApproval.artifactDigest,
      inspectedApproval.approvalCommitment,
      approvedAtMicros,
      notAfterMicros,
    ])}\n`,
    'utf8',
  ).digest('hex');
  let subjectCommitment;
  try {
    subjectCommitment = productionPlayerCanarySubjectCommitment(
      plan.fid,
      approval.evidenceNonce,
    );
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CROSS_BINDING_INVALID');
  }
  if (
    inspectedPlan.planDigest !== launch.request.reviewedAdmissionPlanReference.sha256
    || inspectedPlan.planDigest !== authority.reviewedAdmissionPlanDigest
    || inspectedPlan.claimDigest !== journal.contract.reviewedAdmissionClaimDigest
    || inspectedPlan.claimDigest !== authority.reviewedAdmissionClaimDigest
    || subjectCommitment !== journal.contract.subjectCommitment
    || inspectedApproval.artifactDigest
      !== launch.request.ownerApprovalReference.sha256
    || inspectedApproval.approvalCommitment !== authority.ownerApprovalCommitment
    || inspectedApproval.routeSetCommitment !== authority.routeSetCommitment
    || authority.protectedCommit !== launch.request.predecessorPagesSourceCommit
    || authority.protectedTree !== launch.request.predecessorProtectedTree
    || authority.notificationPagesLivePagesSourceCommit
      !== launch.request.predecessorPagesSourceCommit
    || approval.reviewedAdmissionPlanDigest !== inspectedPlan.planDigest
    || approval.protectedCommit !== authority.protectedCommit
    || approval.protectedTree !== authority.protectedTree
    || approval.serverBaselineCommitment !== authority.serverBaselineCommitment
    || approval.routeSetCommitment !== inspectedApproval.routeSetCommitment
    || approval.commandSetCommitment !== inspectedApproval.commandSetCommitment
    || approval.approvedAt !== authority.approvedAt
    || approval.notAfter !== authority.notAfter
    || approval.predecessorLiveReceiptDigest
      !== authority.notificationPagesLiveReceiptDigest
    || approval.predecessorLiveRootReceiptDigest
      !== authority.notificationPagesLiveRootReceiptDigest
    || approval.predecessorLiveRootPagesSourceCommit
      !== authority.notificationPagesLiveRootPagesSourceCommit
    || plan.notificationPagesLiveReceiptDigest
      !== authority.notificationPagesLiveReceiptDigest
    || plan.notificationPagesLivePagesSourceCommit
      !== authority.notificationPagesLivePagesSourceCommit
    || plan.notificationPagesLiveBridgeSourceCommit
      !== authority.notificationPagesLiveBridgeSourceCommit
    || plan.notificationPagesLiveRootReceiptDigest
      !== authority.notificationPagesLiveRootReceiptDigest
    || plan.notificationPagesLiveRootPagesSourceCommit
      !== authority.notificationPagesLiveRootPagesSourceCommit
    || journal.baselineCheckpoint?.challengeDigest !== challengeDigest
    || journal.baselineCheckpoint?.reviewedAdmissionPlanDigest
      !== inspectedPlan.planDigest
    || journal.baselineCheckpoint?.serverBaselineCommitment
      !== authority.serverBaselineCommitment
    || journal.baselineCheckpoint?.routeSetCommitment
      !== authority.routeSetCommitment
    || !exactReference(
      journal.ownerApprovalCheckpoint?.reference,
      launch.request.ownerApprovalReference,
    )
    || journal.ownerApprovalCheckpoint?.approvalCommitment
      !== inspectedApproval.approvalCommitment
    || journal.ownerApprovalCheckpoint?.routeSetCommitment
      !== inspectedApproval.routeSetCommitment
    || journal.ownerApprovalCheckpoint?.commandSetCommitment
      !== inspectedApproval.commandSetCommitment
    || journal.approvalCheckpoint?.approvalRegistrationCommitment
      !== approvalRegistrationCommitment
    || journal.approvalCheckpoint?.routeSetCommitment
      !== inspectedApproval.routeSetCommitment
    || journal.approvalCheckpoint?.commandSetCommitment
      !== inspectedApproval.commandSetCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CROSS_BINDING_INVALID');
  return authority;
}

async function inspectPrivateReferences(request, now) {
  const [{
    FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
    FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
  }, { FARCASTER_PROFILE_POLICY_VERSION }, planModule, approvalModule] =
    await Promise.all([
      import('./hermes-admin.ts'),
      import('./profiles/farcaster-profile-policy.ts'),
      import('./profiles/founder-admission-plan.ts'),
      import('./production-player-canary-owner-approval.mjs'),
    ]);
  const [plan, approval] = await Promise.all([
    planModule.inspectClaimedReviewedFounderAdmissionPlan({
      directory: request.founderPlanDirectory,
      reference: request.reviewedAdmissionPlanReference,
      expectedSourceConfigurationDigest:
        FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
      expectedTargetConfigurationDigest:
        FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
      expectedProfilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
      now,
    }),
    approvalModule.inspectProductionPlayerCanaryOwnerApproval({
      directory: request.ownerApprovalDirectory,
      reference: request.ownerApprovalReference,
      now,
    }),
  ]);
  return Object.freeze({ plan, approval });
}

function defaultDependencies() {
  return Object.freeze({
    now: () => new Date(),
    inspectCheckout: inspectExactCheckout,
    assertProtectedSource: assertProductionPlayerCanaryProtectedSource,
    verifySourceClosure: verifyAuthBridgeNotificationPreparedDeployClosure,
    assertSourceTransition:
      assertNotificationPagesProductionPlayerCanaryActivationSourceTransition,
    inspectTerminalJournal:
      inspectProductionPlayerCanaryTerminalReceiptJournal,
    inspectSettledReceipt: inspectSettledProductionPlayerCanaryReceipt,
    inspectReferences: inspectPrivateReferences,
    requireReferences: requireInspectedActivationRequestReferences,
    preflightPublication:
      preflightProductionPlayerCanaryActivationRequestPublication,
    writeRequest: writeProductionPlayerCanaryActivationRequest,
  });
}

/**
 * Re-attest all source and durable read-only authority, then invoke exactly the
 * established no-clobber request writer. It never deploys, activates, calls a
 * network surface, or advances the completed canary journal.
 */
async function runWithDependencies(
  launchValue,
  injected = {},
) {
  const launch = parseProductionPlayerCanaryActivationLaunch(launchValue);
  const dependencies = Object.freeze({ ...defaultDependencies(), ...injected });
  if (Object.values(dependencies).some(value => typeof value !== 'function')) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_DEPENDENCY_INVALID');
  }
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isSafeInteger(now.getTime())) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CLOCK_INVALID');
  }
  const sourceBefore = exactSourceAttestation(launch, dependencies);
  let journal;
  let settled;
  let receipt;
  let references;
  try {
    journal = requireTerminalJournal(
      launch,
      dependencies.inspectTerminalJournal({
        operatorOperationId: launch.operatorOperationId,
      }),
    );
    settled = dependencies.inspectSettledReceipt({
      expectedReceiptDigest: launch.request.productionPlayerCanaryReceiptDigest,
    });
    receipt = requireSettledReceipt(launch, journal, settled, now);
    references = await dependencies.inspectReferences(launch.request, now);
    dependencies.requireReferences(
      launch.request,
      references.plan,
      references.approval,
    );
    requirePrivateAuthorityCrossBinding(
      launch,
      journal,
      receipt,
      references,
    );
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryActivationLauncherError) throw error;
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PRIVATE_STATE_INVALID');
  }
  const sourceAfter = exactSourceAttestation(launch, dependencies);
  if (
    sourceAfter.commit !== sourceBefore.commit
    || sourceAfter.tree !== sourceBefore.tree
    || sourceAfter.manifestSha256 !== sourceBefore.manifestSha256
    || JSON.stringify(sourceAfter.transition)
      !== JSON.stringify(sourceBefore.transition)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_SOURCE_CHANGED');
  let preflight;
  try {
    preflight = dependencies.preflightPublication({ request: launch.request });
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PUBLICATION_CONFLICT');
  }
  if (
    preflight === null
    || typeof preflight !== 'object'
    || !['absent', 'recoverable', 'installed'].includes(preflight.state)
    || typeof preflight.activationRequestDigest !== 'string'
    || !SHA256.test(preflight.activationRequestDigest)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PUBLICATION_INVALID');
  const sourceFinal = exactSourceAttestation(launch, dependencies);
  if (
    sourceFinal.commit !== sourceAfter.commit
    || sourceFinal.tree !== sourceAfter.tree
    || sourceFinal.manifestSha256 !== sourceAfter.manifestSha256
    || JSON.stringify(sourceFinal.transition)
      !== JSON.stringify(sourceAfter.transition)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_SOURCE_CHANGED');
  let published;
  try {
    published = await dependencies.writeRequest({
      request: launch.request,
      now,
    });
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PUBLICATION_FAILED');
  }
  if (
    published?.activationRequestDigest !== preflight.activationRequestDigest
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PUBLICATION_MISMATCH');
  return Object.freeze({
    activationRequestDigest: published.activationRequestDigest,
  });
}

export async function runProductionPlayerCanaryActivationLauncher(
  launchValue,
) {
  if (arguments.length !== 1) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_DEPENDENCY_OVERRIDE_INVALID');
  }
  return runWithDependencies(launchValue);
}

async function main() {
  if (
    process.argv.length !== 3
    || process.argv[2] !== 'write'
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_ARGUMENT_INVALID');
  const launch = readCanonicalLaunchFromDescriptor(0);
  const result = await runProductionPlayerCanaryActivationLauncher(launch);
  process.stdout.write(`${result.activationRequestDigest}\n`);
}

export const productionPlayerCanaryActivationLauncherTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      inspectExactCheckout,
      readCanonicalLaunchFromDescriptor,
      readCanonicalLaunchWithIo,
      requirePrivateAuthorityCrossBinding,
      requireSettledReceipt,
      requireTerminalJournal,
      runWithDependencies,
    })
    : undefined;

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    process.stderr.write(`${
      error instanceof ProductionPlayerCanaryActivationLauncherError
        ? error.code
        : 'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_FAILED'
    }\n`);
    process.exitCode = 1;
  });
}
