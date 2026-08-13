import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireSupportedFid } from '../auth';
import { greaterRealmActivationPolicyErrorCode } from '../greaterRealmActivationPolicy';
import { greaterRealmActivationStateErrorCode } from '../greaterRealmActivationState';
import {
  type GreaterRealmCutoverTransitionActionV1,
  type GreaterRealmCutoverTransitionResultV1,
  runGreaterRealmCutoverTransitionWithAuditV1,
} from '../greaterRealmCutoverAudit';
import {
  greaterRealmCutoverStatusErrorCode,
  projectGreaterRealmCutoverStatusV1,
  projectGreaterRealmReenableStatusV1,
} from '../greaterRealmCutoverStatus';
import {
  beginGreaterRealmDrainAuthorizedTransactionV1,
  commitGreaterRealmActiveAuthorizedTransactionV1,
  freezeGreaterRealmActivationAuthorizedTransactionV1,
  greaterRealmRelocationAuthorityErrorCode,
  haltGreaterRealmActivationAuthorizedTransactionV1,
  planGreaterRealmRelocationAuthorizedTransactionV1,
  prepareGreaterRealmActivationAuthorizedTransactionV1,
  relocateGreaterRealmCanaryAuthorizedTransactionV1,
  resumeGreaterRealmActiveAuthorizedTransactionV1,
  rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1,
} from '../greaterRealmRelocationAuthority';
import { greaterRealmRelocationSnapshotErrorCode } from '../greaterRealmRelocationSnapshot';
import {
  greaterRealmAuthorityErrorCode,
  requireGreaterRealmV17ActivationGate,
} from '../greaterRealmV17Authority';
import { castleWorkerErrorCode } from '../castleWorkerAuthority';
import warpkeep from '../schema';

const adminGreaterRealmCutoverStatusV1 = t.object(
  'AdminGreaterRealmCutoverStatusV1',
  {
    importMutationsCompiled: t.bool(),
    activationMutationsCompiled: t.bool(),

    releaseRows: t.u64(),
    releasePresent: t.bool(),
    atlasId: t.option(t.string()),
    publicReleaseId: t.option(t.string()),
    sourceCommit: t.option(t.string()),
    importEpoch: t.option(t.u64()),
    releaseState: t.string(),
    verificationPhase: t.string(),
    verificationCursor: t.u64(),
    expectedReleaseSha256: t.option(t.string()),
    releaseHeaderSha256: t.option(t.string()),
    verificationDigest: t.option(t.string()),
    expectedRegionCount: t.u32(),
    expectedComponentCount: t.u32(),
    expectedChunkCount: t.u32(),
    expectedCellCount: t.u32(),
    expectedSlotCount: t.u32(),
    expectedResourceNodeCount: t.u32(),
    componentExpectedCellCount: t.u32(),
    componentExpectedSlotCount: t.u32(),
    componentExpectedResourceNodeCount: t.u32(),
    importedPassableCellCount: t.u32(),
    verifiedComponentCount: t.u32(),
    verifiedChunkCount: t.u32(),
    verifiedCellCount: t.u32(),
    verifiedSlotCount: t.u32(),
    verifiedResourceNodeCount: t.u32(),
    regionManifestRows: t.u32(),
    componentRows: t.u64(),
    chunkRows: t.u64(),
    cellRows: t.u64(),
    slotRows: t.u64(),
    activeSlotRows: t.u64(),
    resourceNodeRows: t.u64(),
    activeResourceNodeRows: t.u64(),
    releaseImportsExact: t.bool(),
    releaseVerificationExact: t.bool(),
    releaseReady: t.bool(),

    activationRows: t.u64(),
    activationPresent: t.bool(),
    activationMode: t.string(),
    everActive: t.bool(),
    topologySnapshotDigest: t.option(t.string()),
    relocationPlanDigest: t.option(t.string()),
    snapshotCastleDigest: t.option(t.string()),
    snapshotWorkerDigest: t.option(t.string()),
    snapshotResourceDigest: t.option(t.string()),
    snapshotMarksDigest: t.option(t.string()),
    snapshotInnerKeepDigest: t.option(t.string()),
    snapshotScheduleDigest: t.option(t.string()),
    snapshotCastleCount: t.u32(),
    snapshotWorkerCount: t.u32(),
    snapshotResourceAccountCount: t.u32(),
    snapshotMarkAccountCount: t.u32(),
    snapshotInnerKeepBuildingCount: t.u32(),
    snapshotClaimCount: t.u32(),
    snapshotOccupancyCount: t.u32(),
    nextAllocationSequence: t.u64(),
    postCanaryFoundingCount: t.u32(),
    postCanaryDispatchCount: t.u32(),
    rollbackEligible: t.bool(),
    resumeEligible: t.bool(),
    legacyFoundingOpen: t.bool(),
    legacyJourneyDispatchOpen: t.bool(),

    castleCapacity: t.u32(),
    currentFounderCount: t.u32(),
    founderCapacityRemaining: t.u32(),
    castleRows: t.u64(),
    greaterRealmClaimRows: t.u64(),
    greaterRealmOccupancyRows: t.u64(),
    plannedClaimRows: t.u64(),
    activeClaimRows: t.u64(),
    unknownClaimStateRows: t.u64(),
    relocatedClaimRows: t.u64(),
    foundedClaimRows: t.u64(),
    unknownClaimKindRows: t.u64(),
    legacyClaimRows: t.u64(),
    legacyOccupiedWorldTileRows: t.u64(),
    lowlandsFounderCount: t.u32(),
    frostmereFounderCount: t.u32(),
    sunscarFounderCount: t.u32(),
    mirefenFounderCount: t.u32(),
    stonewakeFounderCount: t.u32(),
    emberwoodFounderCount: t.u32(),
    unassignedRegionFounderCount: t.u32(),
    profileRows: t.u64(),
    markAccountRows: t.u64(),
    resourceAccountRows: t.u64(),
    allowedFidRows: t.u64(),
    enabledAllowedFidRows: t.u64(),
    castleWorkerRows: t.u64(),
    idleCastleWorkerRows: t.u64(),
    nonIdleCastleWorkerRows: t.u64(),
    auditRows: t.u64(),

    legacyRealmRows: t.u64(),
    legacyRealmActive: t.bool(),
    atlasRows: t.u64(),
    atlasMode: t.string(),
    atlasRevision: t.option(t.u64()),
    atlasCastleCapacity: t.u32(),
    atlasVisibleRegionCount: t.u32(),
    atlasVisibleCellCount: t.u32(),
    atlasVisibleChunkCount: t.u32(),
    visibleRegionRows: t.u64(),
    activeVisibleRegionRows: t.u64(),
    workerSystemV2Rows: t.u64(),
    workerSystemV2Mode: t.string(),
    workerSystemV2RosterDigest: t.option(t.string()),
    workerSystemV2CurrentCastleCount: t.u32(),
    workerSystemV2CurrentWorkerCount: t.u32(),
    workerSystemV1Rows: t.u64(),
    workerSystemV1Mode: t.string(),
    workerSystemV1RosterDigest: t.option(t.string()),
    workerSystemV1ExpectedCastleCount: t.u32(),
    workerSystemV1ExpectedWorkerCount: t.u32(),
    workerSystemV1LegacyDrainRequired: t.bool(),

    goldNodeOccupationRows: t.u64(),
    goldExpeditionRows: t.u64(),
    goldExpeditionScheduleRows: t.u64(),
    foodNodeOccupationRows: t.u64(),
    foodExpeditionRows: t.u64(),
    foodExpeditionScheduleRows: t.u64(),
    woodNodeOccupationRows: t.u64(),
    woodExpeditionRows: t.u64(),
    woodExpeditionScheduleRows: t.u64(),
    stoneNodeOccupationRows: t.u64(),
    stoneExpeditionRows: t.u64(),
    stoneExpeditionScheduleRows: t.u64(),
    workerAssignmentRows: t.u64(),
    workerNodeOccupationRows: t.u64(),
    workerAssignmentScheduleRows: t.u64(),

    currentWorldGraphApplicable: t.bool(),
    currentWorldGraphExact: t.bool(),
    currentWorldIntegrityViolationCount: t.u32(),
    activeAdmissionEligible: t.bool(),
  },
);

const adminGreaterRealmReenableStatusV1 = t.object(
  'AdminGreaterRealmReenableStatusV1',
  {
    currentWorldGraphApplicable: t.bool(),
    targetFounderGraphExact: t.bool(),
    targetAllowedEnabled: t.bool(),
    targetAuthEpoch: t.option(t.u32()),
    targetRequestCycle: t.option(t.u64()),
    targetRequestedAtMicros: t.option(t.u64()),
    targetReenableEligible: t.bool(),
  },
);

function senderActivationError(error: unknown): never {
  const code = greaterRealmRelocationAuthorityErrorCode(error)
    ?? greaterRealmRelocationSnapshotErrorCode(error)
    ?? greaterRealmActivationPolicyErrorCode(error)
    ?? greaterRealmActivationStateErrorCode(error)
    ?? greaterRealmAuthorityErrorCode(error)
    ?? castleWorkerErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('GREATER_REALM_ACTIVATION_FAILED');
}

function senderCutoverStatusError(error: unknown): never {
  const code = greaterRealmCutoverStatusErrorCode(error)
    ?? greaterRealmActivationPolicyErrorCode(error)
    ?? greaterRealmActivationStateErrorCode(error)
    ?? greaterRealmAuthorityErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('GREATER_REALM_CUTOVER_STATUS_INVALID');
}

/** Gate-before-auth keeps the registered production ABI inert and non-oracular. */
function authorizedActivation(
  ctx: Parameters<typeof requireAdmin>[0],
  action: GreaterRealmCutoverTransitionActionV1,
  run: (actorSubject: string) => GreaterRealmCutoverTransitionResultV1,
): void {
  try {
    requireGreaterRealmV17ActivationGate();
    const admin = requireAdmin(ctx);
    runGreaterRealmCutoverTransitionWithAuditV1(
      ctx,
      admin.subject,
      action,
      () => run(admin.subject),
    );
  } catch (error) {
    return senderActivationError(error);
  }
}

export const adminPrepareGreaterRealmActivationV1 = warpkeep.reducer(
  { name: 'admin_prepare_greater_realm_activation_v1' },
  ctx => authorizedActivation(ctx, 'prepare_greater_realm_activation_v1', actorSubject => (
    prepareGreaterRealmActivationAuthorizedTransactionV1(ctx, actorSubject)
  )),
);

export const adminBeginGreaterRealmDrainV1 = warpkeep.reducer(
  { name: 'admin_begin_greater_realm_drain_v1' },
  ctx => authorizedActivation(ctx, 'begin_greater_realm_drain_v1', () => (
    beginGreaterRealmDrainAuthorizedTransactionV1(ctx)
  )),
);

export const adminFreezeGreaterRealmActivationV1 = warpkeep.reducer(
  { name: 'admin_freeze_greater_realm_activation_v1' },
  ctx => authorizedActivation(ctx, 'freeze_greater_realm_activation_v1', () => (
    freezeGreaterRealmActivationAuthorizedTransactionV1(ctx)
  )),
);

export const adminPlanGreaterRealmRelocationV1 = warpkeep.reducer(
  { name: 'admin_plan_greater_realm_relocation_v1' },
  ctx => authorizedActivation(ctx, 'plan_greater_realm_relocation_v1', () => (
    planGreaterRealmRelocationAuthorizedTransactionV1(ctx)
  )),
);

export const adminRelocateGreaterRealmCanaryV1 = warpkeep.reducer(
  { name: 'admin_relocate_greater_realm_canary_v1' },
  ctx => authorizedActivation(ctx, 'relocate_greater_realm_canary_v1', () => (
    relocateGreaterRealmCanaryAuthorizedTransactionV1(ctx)
  )),
);

export const adminCommitGreaterRealmActiveV1 = warpkeep.reducer(
  { name: 'admin_commit_greater_realm_active_v1' },
  ctx => authorizedActivation(ctx, 'commit_greater_realm_active_v1', () => (
    commitGreaterRealmActiveAuthorizedTransactionV1(ctx)
  )),
);

export const adminHaltGreaterRealmActivationV1 = warpkeep.reducer(
  { name: 'admin_halt_greater_realm_activation_v1' },
  ctx => authorizedActivation(ctx, 'halt_greater_realm_activation_v1', () => (
    haltGreaterRealmActivationAuthorizedTransactionV1(ctx)
  )),
);

export const adminResumeGreaterRealmActiveV1 = warpkeep.reducer(
  { name: 'admin_resume_greater_realm_active_v1' },
  ctx => authorizedActivation(ctx, 'resume_greater_realm_active_v1', () => (
    resumeGreaterRealmActiveAuthorizedTransactionV1(ctx)
  )),
);

export const adminRollbackGreaterRealmBeforeCommitV1 = warpkeep.reducer(
  { name: 'admin_rollback_greater_realm_before_commit_v1' },
  ctx => authorizedActivation(ctx, 'rollback_greater_realm_before_commit_v1', () => (
    rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(ctx)
  )),
);

export const adminGetGreaterRealmCutoverStatusV1 = warpkeep.procedure(
  { name: 'admin_get_greater_realm_cutover_status_v1' },
  adminGreaterRealmCutoverStatusV1,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      return projectGreaterRealmCutoverStatusV1(tx);
    } catch (error) {
      return senderCutoverStatusError(error);
    }
  }),
);

export const adminGetGreaterRealmReenableStatusV1 = warpkeep.procedure(
  { name: 'admin_get_greater_realm_reenable_status_v1' },
  { fid: t.u64() },
  adminGreaterRealmReenableStatusV1,
  (ctx, { fid }) => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      requireSupportedFid(fid);
      return projectGreaterRealmReenableStatusV1(tx, fid);
    } catch (error) {
      return senderCutoverStatusError(error);
    }
  }),
);
