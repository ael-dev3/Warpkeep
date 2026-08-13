import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  captureAndReconcileProductionPlayerCanaryBaselineV1,
  productionPlayerCanaryBaselineChallengeDigest,
  reacquireProductionPlayerCanaryBaselineReconciliationV1,
  requireProductionPlayerCanaryBaselineReconciliation,
} from './production-player-canary-baseline-reconciliation.mjs';
import {
  productionPlayerCanaryApprovalRegistrationArgumentsV1,
  reacquireProductionPlayerCanaryApprovalReconciliationV1,
  registerAndReconcileProductionPlayerCanaryApprovalV1,
  requireProductionPlayerCanaryApprovalReconciliation,
} from './production-player-canary-approval-reconciliation.mjs';
import {
  inspectProductionPlayerCanaryOwnerApproval,
  prepareProductionPlayerCanaryOwnerApprovalV1,
  writePreparedProductionPlayerCanaryOwnerApproval,
} from './production-player-canary-owner-approval.mjs';
import {
  installProductionPlayerCanaryReceipt,
  prepareProductionPlayerCanaryReceiptInstallation,
  reconcileProductionPlayerCanaryReceiptInstallation,
} from './production-player-canary-receipt.mjs';
import {
  parseProductionPlayerCanaryOperatorContract,
  productionPlayerCanaryOperatorConfirmationDigest,
  productionPlayerCanaryOperatorEffectDigest,
  PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_STATE_CHILD,
  withProductionPlayerCanaryOperatorJournal,
} from './production-player-canary-operator-journal.mjs';
import {
  assertProductionPlayerCanaryProtectedSource,
  productionPlayerCanarySubjectCommitment,
  inspectProductionPlayerCanaryExpectedEvidenceAuthority,
} from './production-player-canary-evidence-authority.mjs';
import {
  assertProductionAdminTrustedAncestors,
  canonicalProductionAdminAccountHome,
} from
  './production-admin-token-budget.mjs';

export const PRODUCTION_PLAYER_CANARY_OPERATOR_PROFILE =
  'warpkeep-production-player-canary-operator-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PRIVATE_DIRECTORY_MODE = 0o700;
const COMMANDS = Object.freeze([
  'inspect',
  'capture-baseline',
  'inspect-route-plan',
  'prepare-owner-approval',
  'install-owner-approval',
  'register-approval',
  'finalize-receipt',
]);
const ROUTE_RESOURCES = Object.freeze(['food', 'wood', 'stone', 'gold']);
const PHASES_AFTER_BASELINE = new Set([
  'baseline-reconciled',
  'owner-approval-install-intent',
  'owner-approval-installed',
  'approval-submit-intent',
  'approval-submission-uncertain',
  'approval-absence-observed',
  'approval-reconciled',
  'awaiting-authoritative-evidence',
  'receipt-install-intent',
  'receipt-install-not-published',
  'receipt-installed',
]);

export class ProductionPlayerCanaryOperatorError extends Error {
  constructor(code, disposition = 'halt', cause) {
    super(code);
    this.name = 'ProductionPlayerCanaryOperatorError';
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
  throw new ProductionPlayerCanaryOperatorError(code, disposition, cause);
}

function sameCanonical(left, right) {
  return JSON.stringify(left, (_key, value) => (
    typeof value === 'bigint' ? value.toString() : value
  )) === JSON.stringify(right, (_key, value) => (
    typeof value === 'bigint' ? value.toString() : value
  ));
}

function requireSecret(value, code) {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value).byteLength
    : 0;
  if (bytes < 32 || bytes > 512 || /[\0\r\n]/u.test(value ?? '')) fail(code);
  return value;
}

function exactPrivateDirectory(path, code) {
  try {
    if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) {
      fail(code);
    }
    assertProductionAdminTrustedAncestors(path);
    const status = lstatSync(path);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (status.mode & 0o7777) !== PRIVATE_DIRECTORY_MODE
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || realpathSync(path) !== path
    ) fail(code);
    return path;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryOperatorError) throw error;
    return fail(code, 'halt', error);
  }
}

function containsPath(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function overlappingPaths(left, right) {
  return containsPath(left, right) || containsPath(right, left);
}

function validatePrivatePathIsolation(contract, reportedHome) {
  let repositoryRoot;
  try {
    repositoryRoot = realpathSync(contract.repositoryRoot);
    const status = lstatSync(repositoryRoot);
    if (
      repositoryRoot !== contract.repositoryRoot
      || !status.isDirectory()
      || status.isSymbolicLink()
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_SOURCE_INVALID');
  } catch (cause) {
    if (cause instanceof ProductionPlayerCanaryOperatorError) throw cause;
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_SOURCE_INVALID', 'halt', cause);
  }
  const privateDirectories = [
    exactPrivateDirectory(
      contract.founderPlanDirectory,
      'PRODUCTION_PLAYER_CANARY_OPERATOR_FOUNDER_PLAN_DIRECTORY_INVALID',
    ),
    exactPrivateDirectory(
      contract.ownerApprovalDirectory,
      'PRODUCTION_PLAYER_CANARY_OPERATOR_OWNER_APPROVAL_DIRECTORY_INVALID',
    ),
    exactPrivateDirectory(
      contract.receiptDirectory,
      'PRODUCTION_PLAYER_CANARY_OPERATOR_RECEIPT_DIRECTORY_INVALID',
    ),
  ];
  const journalDirectory = join(
    canonicalProductionAdminAccountHome(reportedHome),
    '.warpkeep',
    'private',
    'production-admin-v1',
    PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_STATE_CHILD,
  );
  if (
    privateDirectories.some(path => overlappingPaths(repositoryRoot, path))
    || overlappingPaths(repositoryRoot, journalDirectory)
    || privateDirectories.some((path, index) =>
      privateDirectories.slice(index + 1).some(other =>
        overlappingPaths(path, other)))
    || privateDirectories.some(path => overlappingPaths(path, journalDirectory))
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_PATH_ISOLATION_INVALID');
}

function assertProtectedSource(contract) {
  try {
    assertProductionPlayerCanaryProtectedSource(contract);
  } catch (cause) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_SOURCE_INVALID', 'halt', cause);
  }
}

function validateClaimedPlan(contract, inspected) {
  const plan = inspected?.plan;
  if (
    plan === null
    || typeof plan !== 'object'
    || Array.isArray(plan)
    || inspected.planDigest !== contract.reviewedAdmissionPlanReference.sha256
    || typeof inspected.claimDigest !== 'string'
    || !SHA256.test(inspected.claimDigest)
    || inspected.claimDigest !== contract.reviewedAdmissionClaimDigest
    || typeof plan.fid !== 'string'
    || !/^[1-9][0-9]{0,15}$/u.test(plan.fid)
    || BigInt(plan.fid) > BigInt(Number.MAX_SAFE_INTEGER)
    || plan.notificationPagesLivePagesSourceCommit !== contract.protectedCommit
    || typeof plan.notificationPagesLiveReceiptDigest !== 'string'
    || !SHA256.test(plan.notificationPagesLiveReceiptDigest)
    || typeof plan.notificationPagesLiveBridgeSourceCommit !== 'string'
    || !COMMIT.test(plan.notificationPagesLiveBridgeSourceCommit)
    || typeof plan.notificationPagesLiveRootReceiptDigest !== 'string'
    || !SHA256.test(plan.notificationPagesLiveRootReceiptDigest)
    || typeof plan.notificationPagesLiveRootPagesSourceCommit !== 'string'
    || !COMMIT.test(plan.notificationPagesLiveRootPagesSourceCommit)
    || productionPlayerCanarySubjectCommitment(
      BigInt(plan.fid),
      contract.evidenceNonce,
    ) !== contract.subjectCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_REVIEWED_PLAN_INVALID');
  return inspected;
}

function baselineArguments(contract, inspectedPlan) {
  return Object.freeze({
    fid: BigInt(inspectedPlan.plan.fid),
    reviewedAdmissionPlanDigest: inspectedPlan.planDigest,
    evidenceNonce: contract.evidenceNonce,
  });
}

function compareBaselineCheckpoint(journal, reconciliation) {
  const checkpoint = journal.payloadFor('baseline-reconciled');
  if (checkpoint === null) return;
  if (
    checkpoint.challengeDigest !== reconciliation.challengeDigest
    || checkpoint.reviewedAdmissionPlanDigest
      !== reconciliation.reviewedAdmissionPlanDigest
    || checkpoint.serverBaselineCommitment
      !== reconciliation.serverBaselineCommitment
    || checkpoint.routeSetCommitment !== reconciliation.routeSetCommitment
    || checkpoint.capturedAtMicros !== reconciliation.capturedAtMicros.toString()
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_BASELINE_CHECKPOINT_MISMATCH');
}

function compareApprovalCheckpoint(journal, reconciliation) {
  const checkpoint = journal.payloadFor('approval-reconciled');
  if (checkpoint === null) return;
  if (
    checkpoint.approvalRegistrationCommitment
      !== reconciliation.approvalRegistrationCommitment
    || checkpoint.routeSetCommitment !== reconciliation.routeSetCommitment
    || checkpoint.commandSetCommitment !== reconciliation.commandSetCommitment
    || checkpoint.registeredAtMicros !== reconciliation.registeredAtMicros.toString()
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_APPROVAL_CHECKPOINT_MISMATCH');
}

function expectedConfirmation(contract, action, attempt, effectDigest) {
  return productionPlayerCanaryOperatorConfirmationDigest({
    operationId: contract.operationId,
    action,
    attempt,
    effectDigest,
  });
}

function requireConfirmation(value, expected) {
  if (typeof value !== 'string' || value !== expected) {
    fail(
      'PRODUCTION_PLAYER_CANARY_OPERATOR_CONFIRMATION_REQUIRED',
      'explicit-operator-confirmation-required',
    );
  }
  return value;
}

function sourceBoundWritePermit(permit, contract, deps) {
  const bound = () => {
    deps.assertProtectedSource(contract);
    permit();
  };
  if (typeof permit.markSubmissionUncertain === 'function') {
    bound.markSubmissionUncertain = permit.markSubmissionUncertain;
  }
  if (typeof permit.bindWriteNotStartedError === 'function') {
    bound.bindWriteNotStartedError = permit.bindWriteNotStartedError;
  }
  return bound;
}

function isAbsentError(error, kind) {
  return error !== null
    && typeof error === 'object'
    && error.code === `PRODUCTION_PLAYER_CANARY_${kind}_REACQUISITION_ABSENT`;
}

function isExplicitRetryError(error, kind) {
  return error !== null
    && typeof error === 'object'
    && (
      error.code
        === `PRODUCTION_PLAYER_CANARY_${kind}_EXPLICIT_OPERATOR_RETRY_REQUIRED`
      || (
        error.name === 'GreaterRealmCutoverWriteNotStartedError'
        && error.writeStarted === false
      )
    );
}

async function reacquireBaseline(journal, contract, adminSecret, arguments_, deps) {
  try {
    const reconciliation = requireProductionPlayerCanaryBaselineReconciliation(
      await deps.reacquireBaseline({
        adminSecret,
        arguments: arguments_,
      }),
    );
    compareBaselineCheckpoint(journal, reconciliation);
    return reconciliation;
  } catch (error) {
    if (isAbsentError(error, 'BASELINE')) {
      const phase = journal.inspect().phase;
      if (
        phase === 'baseline-submit-intent'
        || phase === 'baseline-submission-uncertain'
      ) journal.baselineAbsenceObserved();
      fail(
        'PRODUCTION_PLAYER_CANARY_OPERATOR_BASELINE_EXPLICIT_RETRY_REQUIRED',
        'explicit-operator-retry-required',
        error,
      );
    }
    throw error;
  }
}

async function ensureBaseline({
  journal,
  contract,
  inspectedPlan,
  adminSecret,
  confirmationDigest,
  allowSubmit,
  deps,
}) {
  const arguments_ = baselineArguments(contract, inspectedPlan);
  const phase = journal.inspect().phase;
  if (PHASES_AFTER_BASELINE.has(phase)) {
    return reacquireBaseline(journal, contract, adminSecret, arguments_, deps);
  }
  if (
    phase === 'baseline-submit-intent'
    || phase === 'baseline-submission-uncertain'
  ) {
    const reconciliation = await reacquireBaseline(
      journal,
      contract,
      adminSecret,
      arguments_,
      deps,
    );
    journal.baselineReconciled(reconciliation);
    return reconciliation;
  }
  if (phase !== 'prepared' && phase !== 'baseline-absence-observed') {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_PHASE_INVALID');
  }
  if (!allowSubmit) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_BASELINE_REQUIRED');
  }
  const attempt = phase === 'prepared' ? 1 : journal.inspect().payload.attempt + 1;
  const effectDigest = productionPlayerCanaryOperatorEffectDigest(arguments_);
  const confirmation = requireConfirmation(
    confirmationDigest,
    expectedConfirmation(contract, 'capture-baseline', attempt, effectDigest),
  );
  const write = journal.beginBaselineWrite({
    arguments: arguments_,
    confirmationDigest: confirmation,
  });
  let reconciliation;
  try {
    reconciliation = requireProductionPlayerCanaryBaselineReconciliation(
      await deps.captureBaseline({
        adminSecret,
        arguments: arguments_,
        assertCanStartWrite: sourceBoundWritePermit(
          write.permit,
          contract,
          deps,
        ),
      }),
    );
  } catch (error) {
    if (isExplicitRetryError(error, 'BASELINE')) {
      journal.baselineAbsenceObserved();
      fail(
        'PRODUCTION_PLAYER_CANARY_OPERATOR_BASELINE_EXPLICIT_RETRY_REQUIRED',
        'explicit-operator-retry-required',
        error,
      );
    }
    throw error;
  }
  journal.baselineReconciled(reconciliation);
  return reconciliation;
}

function validateRoutePlan(plan, baseline) {
  if (
    plan === null
    || typeof plan !== 'object'
    || Array.isArray(plan)
    || plan.profile !== 'warpkeep-production-player-canary-route-plan-v1'
    || plan.challengeDigest !== baseline.challengeDigest
    || plan.reviewedAdmissionPlanDigest !== baseline.reviewedAdmissionPlanDigest
    || plan.serverBaselineCommitment !== baseline.serverBaselineCommitment
    || plan.routeSetCommitment !== baseline.routeSetCommitment
    || typeof plan.atlasRevision !== 'bigint'
    || plan.atlasRevision < 1n
    || !Number.isSafeInteger(plan.equalRouteSteps)
    || plan.equalRouteSteps < 1
    || plan.equalRouteSteps > 12
    || !Array.isArray(plan.routes)
    || plan.routes.length !== 4
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_ROUTE_PLAN_INVALID');
  for (let index = 0; index < 4; index += 1) {
    const route = plan.routes[index];
    if (
      route === null
      || typeof route !== 'object'
      || route.ordinal !== index + 1
      || route.resourceKind !== ROUTE_RESOURCES[index]
      || typeof route.workerId !== 'string'
      || !/^genesis-001-castle-[0-9]+-worker-0[1-4]$/u.test(route.workerId)
      || typeof route.locationId !== 'string'
      || !/^GRL-[A-Z2-7]{26}$/u.test(route.locationId)
      || route.atlasRevision !== plan.atlasRevision
      || route.routeSteps !== plan.equalRouteSteps
      || !Number.isSafeInteger(route.nodeCount)
      || route.nodeCount < 1
      || route.nodeCount > 32
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_ROUTE_PLAN_INVALID');
  }
  return Object.freeze({
    ...plan,
    routes: Object.freeze(plan.routes.map(route => Object.freeze({ ...route }))),
  });
}

async function readRoutePlan(adminSecret, arguments_, baseline, deps) {
  return validateRoutePlan(
    await deps.planRoutes({ adminSecret, arguments: arguments_ }),
    baseline,
  );
}

function requireOwnerApprovalSource(contract, inspectedPlan, approval) {
  const plan = inspectedPlan.plan;
  if (
    approval.evidenceNonce !== contract.evidenceNonce
    || approval.reviewedAdmissionPlanDigest !== inspectedPlan.planDigest
    || approval.protectedCommit !== contract.protectedCommit
    || approval.protectedTree !== contract.protectedTree
    || approval.predecessorLiveReceiptDigest
      !== plan.notificationPagesLiveReceiptDigest
    || approval.predecessorLiveRootReceiptDigest
      !== plan.notificationPagesLiveRootReceiptDigest
    || approval.predecessorLiveRootPagesSourceCommit
      !== plan.notificationPagesLiveRootPagesSourceCommit
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_OWNER_APPROVAL_SOURCE_MISMATCH');
}

async function prepareOwnerMaterial({
  contract,
  inspectedPlan,
  baseline,
  routePlan,
  approval,
  deps,
}) {
  const prepared = deps.prepareOwnerApproval({
    approval,
    baselineReconciliation: baseline,
  });
  requireOwnerApprovalSource(contract, inspectedPlan, prepared.approval);
  const arguments_ = deps.approvalArguments({
    fid: BigInt(inspectedPlan.plan.fid),
    baselineReconciliation: baseline,
    routePlan,
    inspectedApproval: prepared,
  });
  return Object.freeze({ prepared, arguments_ });
}

function ownerReference(journal) {
  const payload = journal.payloadFor('owner-approval-installed');
  if (payload === null) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_OWNER_APPROVAL_REQUIRED');
  }
  return payload.reference;
}

async function ownerRegistrationMaterial({
  journal,
  contract,
  inspectedPlan,
  baseline,
  routePlan,
  deps,
  now,
}) {
  const reference = ownerReference(journal);
  const inspectedApproval = deps.inspectOwnerApproval({
    directory: contract.ownerApprovalDirectory,
    reference,
    now,
  });
  requireOwnerApprovalSource(contract, inspectedPlan, inspectedApproval.approval);
  const arguments_ = deps.approvalArguments({
    fid: BigInt(inspectedPlan.plan.fid),
    baselineReconciliation: baseline,
    routePlan,
    inspectedApproval,
  });
  return Object.freeze({ reference, inspectedApproval, arguments_ });
}

async function reacquireApproval(journal, adminSecret, arguments_, deps) {
  try {
    const reconciliation = requireProductionPlayerCanaryApprovalReconciliation(
      await deps.reacquireApproval({ adminSecret, arguments: arguments_ }),
    );
    compareApprovalCheckpoint(journal, reconciliation);
    return reconciliation;
  } catch (error) {
    if (isAbsentError(error, 'APPROVAL')) {
      const phase = journal.inspect().phase;
      if (
        phase === 'approval-submit-intent'
        || phase === 'approval-submission-uncertain'
      ) journal.approvalAbsenceObserved();
      fail(
        'PRODUCTION_PLAYER_CANARY_OPERATOR_APPROVAL_EXPLICIT_RETRY_REQUIRED',
        'explicit-operator-retry-required',
        error,
      );
    }
    throw error;
  }
}

function defaultDependencies() {
  return Object.freeze({
    withJournal: withProductionPlayerCanaryOperatorJournal,
    assertProtectedSource,
    now: () => new Date(),
    async inspectClaimedPlan(input) {
      const [hermes, profile, plans] = await Promise.all([
        import('./hermes-admin.ts'),
        import('./profiles/farcaster-profile-policy.ts'),
        import('./profiles/founder-admission-plan.ts'),
      ]);
      return plans.inspectClaimedReviewedFounderAdmissionPlan({
        directory: input.contract.founderPlanDirectory,
        reference: input.contract.reviewedAdmissionPlanReference,
        expectedSourceConfigurationDigest:
          hermes.FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
        expectedTargetConfigurationDigest:
          hermes.FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
        expectedProfilePolicyVersion: profile.FARCASTER_PROFILE_POLICY_VERSION,
        now: input.now,
      });
    },
    captureBaseline: captureAndReconcileProductionPlayerCanaryBaselineV1,
    reacquireBaseline:
      reacquireProductionPlayerCanaryBaselineReconciliationV1,
    async planRoutes(input) {
      const [transport, canary] = await Promise.all([
        import('./greater-realm-production-transport.ts'),
        import('./production-player-canary-admin-transport.ts'),
      ]);
      const session = transport.createGreaterRealmAdminTransportSession({
        adminSecret: input.adminSecret,
      });
      try {
        return await canary.planProductionPlayerCanaryRoutesV1({
          session,
          arguments: input.arguments,
        });
      } finally {
        await session.close();
      }
    },
    prepareOwnerApproval: prepareProductionPlayerCanaryOwnerApprovalV1,
    writeOwnerApproval: writePreparedProductionPlayerCanaryOwnerApproval,
    inspectOwnerApproval: inspectProductionPlayerCanaryOwnerApproval,
    approvalArguments: productionPlayerCanaryApprovalRegistrationArgumentsV1,
    registerApproval: registerAndReconcileProductionPlayerCanaryApprovalV1,
    reacquireApproval:
      reacquireProductionPlayerCanaryApprovalReconciliationV1,
    async inspectEvidence(input) {
      const [hermes, profile, bridge] = await Promise.all([
        import('./hermes-admin.ts'),
        import('./profiles/farcaster-profile-policy.ts'),
        import('./auth-bridge-config-attestation.mjs'),
      ]);
      return inspectProductionPlayerCanaryExpectedEvidenceAuthority({
        founderPlanDirectory: input.contract.founderPlanDirectory,
        reviewedAdmissionPlanReference:
          input.contract.reviewedAdmissionPlanReference,
        ownerApprovalDirectory: input.contract.ownerApprovalDirectory,
        ownerApprovalReference: input.ownerApprovalReference,
        expectedSourceConfigurationDigest:
          hermes.FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
        expectedTargetConfigurationDigest:
          hermes.FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
        expectedProfilePolicyVersion: profile.FARCASTER_PROFILE_POLICY_VERSION,
        pagesSourceCommit: input.contract.protectedCommit,
        candidatePagesSourceCommit: input.contract.protectedCommit,
        rootBinding: {
          notificationPagesLiveRootReceiptDigest:
            input.inspectedPlan.plan.notificationPagesLiveRootReceiptDigest,
          notificationPagesLiveRootPagesSourceCommit:
            input.inspectedPlan.plan.notificationPagesLiveRootPagesSourceCommit,
        },
        liveReceiptDirectory: input.liveReceiptDirectory,
        repositoryRoot: input.contract.repositoryRoot,
        notificationBridgeUrl: bridge.DEFAULT_AUTH_BRIDGE_URL,
        notificationOperatorSecret: input.notificationOperatorSecret,
        adminSecret: input.adminSecret,
        now: input.now,
      });
    },
    prepareReceipt: prepareProductionPlayerCanaryReceiptInstallation,
    installReceipt: installProductionPlayerCanaryReceipt,
    reconcileReceipt: reconcileProductionPlayerCanaryReceiptInstallation,
  });
}

async function executeWithDependencies(rawInput, deps) {
  if (
    rawInput === null
    || typeof rawInput !== 'object'
    || Array.isArray(rawInput)
    || !COMMANDS.includes(rawInput.command)
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_INPUT_INVALID');
  const contract = parseProductionPlayerCanaryOperatorContract(rawInput.contract);
  if (contract.profile !== PRODUCTION_PLAYER_CANARY_OPERATOR_PROFILE) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_INPUT_INVALID');
  }
  validatePrivatePathIsolation(contract, rawInput.reportedHome);
  deps.assertProtectedSource(contract);
  let initiallyInspectedPlan;
  let initialNow;
  return deps.withJournal({
    contract,
    reportedHome: rawInput.reportedHome,
    validateBeforePrepare: async () => {
      initialNow = deps.now();
      if (!(initialNow instanceof Date)
        || !Number.isSafeInteger(initialNow.getTime())) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_CLOCK_INVALID');
      }
      initiallyInspectedPlan = validateClaimedPlan(
        contract,
        await deps.inspectClaimedPlan({ contract, now: initialNow }),
      );
    },
    operation: async journal => {
      const initial = journal.inspect();
      if (
        rawInput.command === 'finalize-receipt'
        && (
          initial.phase === 'receipt-install-intent'
          || initial.phase === 'receipt-installed'
        )
      ) {
        const recovered = deps.reconcileReceipt({
          directory: contract.receiptDirectory,
          expectedReceiptDigest: initial.payload.receiptDigest,
        });
        if (recovered.state === 'installed') {
          if (
            recovered.receiptDigest !== initial.payload.receiptDigest
            || recovered.filename
              !== `production-player-canary-${initial.payload.receiptDigest}.json`
          ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_RECEIPT_RECOVERY_MISMATCH');
          if (initial.phase === 'receipt-install-intent') {
            journal.receiptInstalled({
              filename: recovered.filename,
              receiptDigest: recovered.receiptDigest,
              result: recovered.result,
            });
          }
          return Object.freeze({
            phase: 'receipt-installed',
            filename: recovered.filename,
            receiptDigest: recovered.receiptDigest,
          });
        }
        if (initial.phase === 'receipt-installed') {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_INSTALLED_RECEIPT_MISSING');
        }
        journal.receiptInstallNotPublished();
        fail(
          'PRODUCTION_PLAYER_CANARY_OPERATOR_RECEIPT_REINSPECTION_REQUIRED',
          'explicit-operator-retry-required',
        );
      }

      const now = initialNow ?? deps.now();
      if (!(now instanceof Date) || !Number.isSafeInteger(now.getTime())) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_CLOCK_INVALID');
      }
      const inspectedPlan = initiallyInspectedPlan ?? validateClaimedPlan(
        contract,
        await deps.inspectClaimedPlan({ contract, now }),
      );
      const preparedSummary = () => {
        const arguments_ = baselineArguments(contract, inspectedPlan);
        const state = journal.inspect();
        const attempt = state.phase === 'prepared'
          ? 1
          : state.phase === 'baseline-absence-observed'
            ? state.payload.attempt + 1
            : null;
        const effectDigest = productionPlayerCanaryOperatorEffectDigest(arguments_);
        return Object.freeze({
          phase: state.phase,
          operationId: contract.operationId,
          reviewedAdmissionPlanDigest: inspectedPlan.planDigest,
          reviewedAdmissionClaimDigest: inspectedPlan.claimDigest,
          challengeDigest: productionPlayerCanaryBaselineChallengeDigest(
            contract.evidenceNonce,
          ),
          subjectCommitment: productionPlayerCanarySubjectCommitment(
            BigInt(inspectedPlan.plan.fid),
            contract.evidenceNonce,
          ),
          nextBaselineAttempt: attempt,
          baselineArgumentsDigest: effectDigest,
          expectedBaselineConfirmation: attempt === null
            ? null
            : expectedConfirmation(
              contract,
              'capture-baseline',
              attempt,
              effectDigest,
            ),
        });
      };
      if (rawInput.command === 'inspect') return preparedSummary();

      const adminSecret = requireSecret(
        rawInput.adminSecret,
        'PRODUCTION_PLAYER_CANARY_OPERATOR_ADMIN_SECRET_INVALID',
      );
      const baseline = await ensureBaseline({
        journal,
        contract,
        inspectedPlan,
        adminSecret,
        confirmationDigest: rawInput.confirmationDigest,
        allowSubmit: rawInput.command === 'capture-baseline',
        deps,
      });
      const arguments_ = baselineArguments(contract, inspectedPlan);
      const routePlan = await readRoutePlan(
        adminSecret,
        arguments_,
        baseline,
        deps,
      );
      if (
        rawInput.command === 'capture-baseline'
        || rawInput.command === 'inspect-route-plan'
      ) return Object.freeze({
        phase: journal.inspect().phase,
        baseline: Object.freeze({
          challengeDigest: baseline.challengeDigest,
          reviewedAdmissionPlanDigest: baseline.reviewedAdmissionPlanDigest,
          serverBaselineCommitment: baseline.serverBaselineCommitment,
          routeSetCommitment: baseline.routeSetCommitment,
          capturedAtMicros: baseline.capturedAtMicros.toString(),
        }),
        routePlan,
      });

      if (
        rawInput.command === 'prepare-owner-approval'
        || rawInput.command === 'install-owner-approval'
      ) {
        const material = await prepareOwnerMaterial({
          contract,
          inspectedPlan,
          baseline,
          routePlan,
          approval: rawInput.approval,
          deps,
        });
        const reference = Object.freeze({
          filename:
            `production-player-canary-owner-approval-${material.prepared.approval.approvalId}.json`,
          sha256: material.prepared.artifactDigest,
        });
        const effectDigest = material.prepared.artifactDigest;
        const installConfirmation = expectedConfirmation(
          contract,
          'install-owner-approval',
          1,
          effectDigest,
        );
        const registrationDigest = productionPlayerCanaryOperatorEffectDigest(
          material.arguments_,
        );
        const approvalState = journal.inspect();
        const nextApprovalAttempt = approvalState.phase === 'approval-absence-observed'
          ? approvalState.payload.attempt + 1
          : [
            'baseline-reconciled',
            'owner-approval-install-intent',
            'owner-approval-installed',
          ].includes(approvalState.phase) ? 1 : null;
        const registrationConfirmation = nextApprovalAttempt === null
          ? null
          : expectedConfirmation(
            contract,
            'register-approval',
            nextApprovalAttempt,
            registrationDigest,
          );
        if (rawInput.command === 'prepare-owner-approval') {
          return Object.freeze({
            phase: journal.inspect().phase,
            reference,
            approvalCommitment: material.prepared.approvalCommitment,
            routeSetCommitment: material.prepared.routeSetCommitment,
            commandSetCommitment: material.prepared.commandSetCommitment,
            expectedInstallConfirmation: installConfirmation,
            registrationArgumentsDigest: registrationDigest,
            nextApprovalAttempt,
            expectedRegistrationConfirmation: registrationConfirmation,
          });
        }
        requireConfirmation(rawInput.confirmationDigest, installConfirmation);
        let state = journal.inspect();
        const journalMaterial = {
          reference,
          approvalCommitment: material.prepared.approvalCommitment,
          routeSetCommitment: material.prepared.routeSetCommitment,
          commandSetCommitment: material.prepared.commandSetCommitment,
        };
        if (state.phase === 'baseline-reconciled') {
          journal.ownerApprovalInstallIntent({
            ...journalMaterial,
            confirmationDigest: installConfirmation,
          });
          state = journal.inspect();
        }
        if (
          state.phase !== 'owner-approval-install-intent'
          && state.phase !== 'owner-approval-installed'
        ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_PHASE_INVALID');
        const checkpoint = state.phase === 'owner-approval-install-intent'
          ? state.payload
          : journal.payloadFor('owner-approval-installed');
        if (
          checkpoint === null
          || (state.phase === 'owner-approval-install-intent'
            && checkpoint.confirmationDigest !== installConfirmation)
          || !sameCanonical(checkpoint.reference, reference)
          || checkpoint.approvalCommitment !== journalMaterial.approvalCommitment
          || checkpoint.routeSetCommitment !== journalMaterial.routeSetCommitment
          || checkpoint.commandSetCommitment !== journalMaterial.commandSetCommitment
        ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_OWNER_APPROVAL_INTENT_MISMATCH');
        deps.assertProtectedSource(contract);
        const installed = deps.writeOwnerApproval({
          directory: contract.ownerApprovalDirectory,
          preparedApproval: material.prepared,
        });
        if (!sameCanonical(installed, reference)) {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_OWNER_APPROVAL_INSTALL_MISMATCH');
        }
        if (state.phase === 'owner-approval-install-intent') {
          journal.ownerApprovalInstalled(journalMaterial);
        }
        return Object.freeze({
          phase: journal.inspect().phase,
          reference,
          registrationArgumentsDigest: registrationDigest,
          nextApprovalAttempt,
          expectedRegistrationConfirmation: registrationConfirmation,
        });
      }

      const registration = await ownerRegistrationMaterial({
        journal,
        contract,
        inspectedPlan,
        baseline,
        routePlan,
        deps,
        now,
      });
      if (rawInput.command === 'register-approval') {
        let state = journal.inspect();
        if (
          state.phase === 'approval-submit-intent'
          || state.phase === 'approval-submission-uncertain'
        ) {
          const reconciled = await reacquireApproval(
            journal,
            adminSecret,
            registration.arguments_,
            deps,
          );
          journal.approvalReconciled(reconciled);
          state = journal.inspect();
        } else if (state.phase === 'owner-approval-installed'
          || state.phase === 'approval-absence-observed') {
          const attempt = state.phase === 'owner-approval-installed'
            ? 1
            : state.payload.attempt + 1;
          const effectDigest = productionPlayerCanaryOperatorEffectDigest(
            registration.arguments_,
          );
          const confirmation = requireConfirmation(
            rawInput.confirmationDigest,
            expectedConfirmation(
              contract,
              'register-approval',
              attempt,
              effectDigest,
            ),
          );
          const write = journal.beginApprovalWrite({
            arguments: registration.arguments_,
            confirmationDigest: confirmation,
          });
          let reconciled;
          try {
            reconciled = requireProductionPlayerCanaryApprovalReconciliation(
              await deps.registerApproval({
                adminSecret,
                arguments: registration.arguments_,
                assertCanStartWrite: sourceBoundWritePermit(
                  write.permit,
                  contract,
                  deps,
                ),
              }),
            );
          } catch (error) {
            if (isExplicitRetryError(error, 'APPROVAL')) {
              journal.approvalAbsenceObserved();
              fail(
                'PRODUCTION_PLAYER_CANARY_OPERATOR_APPROVAL_EXPLICIT_RETRY_REQUIRED',
                'explicit-operator-retry-required',
                error,
              );
            }
            throw error;
          }
          journal.approvalReconciled(reconciled);
          state = journal.inspect();
        } else if (
          state.phase === 'approval-reconciled'
          || state.phase === 'awaiting-authoritative-evidence'
        ) {
          await reacquireApproval(
            journal,
            adminSecret,
            registration.arguments_,
            deps,
          );
        } else {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_PHASE_INVALID');
        }
        if (journal.inspect().phase === 'approval-reconciled') {
          journal.awaitingAuthoritativeEvidence();
        }
        return Object.freeze({
          phase: journal.inspect().phase,
          ownerApprovalReference: registration.reference,
        });
      }

      if (rawInput.command === 'finalize-receipt') {
        await reacquireApproval(
          journal,
          adminSecret,
          registration.arguments_,
          deps,
        );
        if (journal.inspect().phase === 'approval-reconciled') {
          journal.awaitingAuthoritativeEvidence();
        }
        let state = journal.inspect();
        if (state.phase === 'receipt-install-intent') {
          const recovered = deps.reconcileReceipt({
            directory: contract.receiptDirectory,
            expectedReceiptDigest: state.payload.receiptDigest,
          });
          if (recovered.state === 'installed') {
            journal.receiptInstalled({
              filename: recovered.filename,
              receiptDigest: recovered.receiptDigest,
              result: recovered.result,
            });
            state = journal.inspect();
          } else {
            journal.receiptInstallNotPublished();
            fail(
              'PRODUCTION_PLAYER_CANARY_OPERATOR_RECEIPT_REINSPECTION_REQUIRED',
              'explicit-operator-retry-required',
            );
          }
        }
        if (
          state.phase === 'awaiting-authoritative-evidence'
          || state.phase === 'receipt-install-not-published'
        ) {
          const notificationOperatorSecret = requireSecret(
            rawInput.notificationOperatorSecret,
            'PRODUCTION_PLAYER_CANARY_OPERATOR_NOTIFICATION_SECRET_INVALID',
          );
          const evidenceAuthority = await deps.inspectEvidence({
            contract,
            inspectedPlan,
            ownerApprovalReference: registration.reference,
            adminSecret,
            notificationOperatorSecret,
            liveReceiptDirectory: rawInput.liveReceiptDirectory,
            now,
          });
          const intent = deps.prepareReceipt({ evidenceAuthority });
          journal.receiptInstallIntent(intent);
          deps.assertProtectedSource(contract);
          const installed = deps.installReceipt({
            evidenceAuthority,
            directory: contract.receiptDirectory,
            expectedReceiptDigest: intent.receiptDigest,
          });
          if (installed.receiptDigest !== intent.receiptDigest) {
            fail('PRODUCTION_PLAYER_CANARY_OPERATOR_RECEIPT_INSTALL_MISMATCH');
          }
          journal.receiptInstalled(installed);
          state = journal.inspect();
        }
        if (state.phase !== 'receipt-installed') {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_PHASE_INVALID');
        }
        return Object.freeze({
          phase: state.phase,
          filename: state.payload.filename,
          receiptDigest: state.payload.receiptDigest,
        });
      }

      return fail('PRODUCTION_PLAYER_CANARY_OPERATOR_PHASE_INVALID');
    },
  });
}

/**
 * Execute exactly one explicitly selected owner-private boundary. There is no
 * run-all mode and no browser-evidence, admission, gameplay, deploy, or secret
 * staging callsite in this operator.
 */
export function executeProductionPlayerCanaryOperatorPhase(input) {
  return executeWithDependencies(input, defaultDependencies());
}

export const productionPlayerCanaryOperatorTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      assertProtectedSource,
      executeWithDependencies,
      validateClaimedPlan,
      validateRoutePlan,
    })
    : undefined;
