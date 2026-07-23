import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import {
  castleWorkerErrorCode,
  dispatchCastleWorker,
  inspectCastleWorkerGraph,
  projectMyWorkerState,
  recallAllCastleWorkers,
  recallCastleWorker,
} from '../castleWorkerAuthority';
import {
  activateWorkerSystem,
  backfillWorkerRoster,
  beginWorkerLegacyDrain,
  castleWorkerRolloutErrorCode,
  inspectWorkerRollout,
  stageWorkerSystem,
} from '../castleWorkerRolloutAuthority';
import type {
  WorkerClientAttestation,
} from '../castleWorkerRolloutPolicy';
import warpkeep from '../schema';

const workerPrivate = t.object('WorkerPrivateV1', {
  workerId: t.string(),
  ordinal: t.u32(),
  status: t.string(),
  resourceKind: t.option(t.string()),
  siteId: t.option(t.string()),
  accruedAmount: t.u64(),
  materializedAmount: t.u64(),
  availableAmount: t.u64(),
  observedAtMicros: t.u64(),
  revision: t.u64(),
});

const myWorkerRoster = t.object('MyWorkerRosterV1', {
  fid: t.u64(),
  castleId: t.u64(),
  observedAtMicros: t.u64(),
  workers: t.array(workerPrivate),
});

const myResourceStateV2 = t.object('MyResourceStateV2', {
  fid: t.u64(),
  food: t.u64(),
  wood: t.u64(),
  stone: t.u64(),
  gold: t.u64(),
  workerPendingFood: t.u64(),
  workerPendingWood: t.u64(),
  workerPendingStone: t.u64(),
  workerPendingGold: t.u64(),
  observedAtMicros: t.u64(),
  settledThroughMicros: t.u64(),
  revision: t.u64(),
  resourcePolicyVersion: t.string(),
  workerPolicyVersion: t.string(),
  workerSystemMode: t.string(),
});

const adminWorkerSystemStatus = t.object('AdminWorkerSystemStatusV1', {
  systemRows: t.u64(),
  mode: t.string(),
  systemConfigValid: t.bool(),
  legacyDrainRequired: t.bool(),
  expectedCastleCount: t.u64(),
  expectedWorkerCount: t.u64(),
  actualWorkerCount: t.u64(),
  expectedCountsMatch: t.bool(),
  rosterDigestMatches: t.bool(),
  castlesMissingWorkers: t.u64(),
  castlesWithExtraWorkers: t.u64(),
  duplicateOrdinals: t.u64(),
  malformedWorkerIds: t.u64(),
  invalidWorkerStates: t.u64(),
  idleWorkers: t.u64(),
  outboundWorkers: t.u64(),
  gatheringWorkers: t.u64(),
  returningWorkers: t.u64(),
  assignments: t.u64(),
  occupations: t.u64(),
  schedules: t.u64(),
  orphanWorkers: t.u64(),
  orphanAssignments: t.u64(),
  assignmentsMissingOccupation: t.u64(),
  assignmentsWithoutSingleSchedule: t.u64(),
  orphanOccupations: t.u64(),
  orphanSchedules: t.u64(),
  invalidSchedules: t.u64(),
  assignmentPublicMismatches: t.u64(),
  occupationSiteMismatches: t.u64(),
  invalidAssignments: t.u64(),
  idempotencyReceipts: t.u64(),
  invalidIdempotencyReceipts: t.u64(),
  idempotencyOverflowFids: t.u64(),
  legacyExpeditions: t.u64(),
  legacyOccupations: t.u64(),
  legacySchedules: t.u64(),
  rosterDigest: t.string(),
  rosterDigestExpected: t.string(),
});

const adminWorkerRosterPlan = t.object('AdminWorkerRosterPlanV1', {
  ready: t.bool(),
  activationBlockedByLegacyRows: t.bool(),
  mode: t.string(),
  systemConfigValid: t.bool(),
  legacyDrainRequired: t.bool(),
  expectedCastleCount: t.u64(),
  expectedWorkerCount: t.u64(),
  actualWorkerCount: t.u64(),
  expectedCountsMatch: t.bool(),
  rosterDigestMatches: t.bool(),
  castlesMissingWorkers: t.u64(),
  castlesWithExtraWorkers: t.u64(),
  orphanWorkers: t.u64(),
  orphanAssignments: t.u64(),
  assignmentsMissingOccupation: t.u64(),
  assignmentsWithoutSingleSchedule: t.u64(),
  orphanOccupations: t.u64(),
  orphanSchedules: t.u64(),
  invalidSchedules: t.u64(),
  assignmentPublicMismatches: t.u64(),
  occupationSiteMismatches: t.u64(),
  invalidWorkerStates: t.u64(),
  invalidAssignments: t.u64(),
  invalidIdempotencyReceipts: t.u64(),
  idempotencyOverflowFids: t.u64(),
  legacyExpeditions: t.u64(),
  legacyOccupations: t.u64(),
  legacySchedules: t.u64(),
  rosterDigest: t.string(),
  rosterDigestExpected: t.string(),
});

const adminWorkerRolloutStatusV2 = t.object('AdminWorkerRolloutStatusV2', {
  phase: t.string(),
  systemRows: t.u64(),
  systemConfigValid: t.bool(),
  expectedCastleCount: t.u32(),
  expectedWorkerCount: t.u32(),
  actualCastleCount: t.u64(),
  actualWorkerCount: t.u64(),
  rosterDigest: t.string(),
  expectedRosterDigest: t.string(),
  malformedWorkerGraphRows: t.u64(),
  resourceAccounts: t.u64(),
  missingResourceAccounts: t.u64(),
  orphanedResourceAccounts: t.u64(),
  resourceInvariantViolations: t.u64(),
  resourceRosterDigest: t.string(),
  canonicalResourceCatalog: t.bool(),
  resourceCatalogDigest: t.string(),
  legacyExpeditions: t.u64(),
  legacyOccupations: t.u64(),
  legacySchedules: t.u64(),
  genericAssignments: t.u64(),
  genericOccupations: t.u64(),
  genericSchedules: t.u64(),
  genericCommandReceipts: t.u64(),
});

function senderPolicyError(error: unknown): never {
  const rolloutCode = castleWorkerRolloutErrorCode(error);
  if (rolloutCode !== undefined) throw new SenderError(rolloutCode);
  const code = castleWorkerErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('WORKER_REQUEST_FAILED');
}

function auditWorkerRollout(
  ctx: Parameters<typeof requireAdmin>[0],
  actorSubject: string,
  action: string,
  note: string,
): void {
  ctx.db.adminAudit.insert({
    id: 0n,
    action,
    targetFid: undefined,
    actorSubject,
    createdAt: ctx.timestamp,
    note,
  });
}

function workerSystemMode(ctx: Parameters<typeof projectMyWorkerState>[0]): string {
  return ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001')?.mode ?? 'absent';
}

function aggregateResult(aggregate: ReturnType<typeof inspectCastleWorkerGraph>) {
  return { ...aggregate };
}

export const getMyWorkerRosterV1 = warpkeep.procedure(
  { name: 'get_my_worker_roster_v1' },
  myWorkerRoster,
  ctx => ctx.withTx(tx => {
    try {
      const { claims, castle } = requireGameplayPlayerV1(tx);
      const observedAtMicros = tx.timestamp.microsSinceUnixEpoch;
      const projection = projectMyWorkerState(tx, claims.fid, observedAtMicros);
      return {
        fid: claims.fid,
        castleId: castle.castleId,
        observedAtMicros,
        workers: projection.workers.map(worker => ({
          workerId: worker.workerId,
          ordinal: worker.ordinal,
          status: worker.status,
          resourceKind: worker.resourceKind,
          siteId: worker.siteId,
          accruedAmount: worker.accruedAmount,
          materializedAmount: worker.materializedAmount,
          availableAmount: worker.availableAmount,
          observedAtMicros: worker.observedAtMicros,
          revision: worker.revision,
        })),
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

export const getMyResourceStateV2 = warpkeep.procedure(
  { name: 'get_my_resource_state_v2' },
  myResourceStateV2,
  ctx => ctx.withTx(tx => {
    try {
      const { claims } = requireGameplayPlayerV1(tx);
      const observedAtMicros = tx.timestamp.microsSinceUnixEpoch;
      const projection = projectMyWorkerState(tx, claims.fid, observedAtMicros);
      const pending = { food: 0n, wood: 0n, stone: 0n, gold: 0n };
      for (const worker of projection.workers) {
        if (worker.resourceKind === 'food') pending.food += worker.availableAmount;
        if (worker.resourceKind === 'wood') pending.wood += worker.availableAmount;
        if (worker.resourceKind === 'stone') pending.stone += worker.availableAmount;
        if (worker.resourceKind === 'gold') pending.gold += worker.availableAmount;
      }
      return {
        fid: claims.fid,
        food: projection.balances.food,
        wood: projection.balances.wood,
        stone: projection.balances.stone,
        gold: projection.balances.gold,
        workerPendingFood: pending.food,
        workerPendingWood: pending.wood,
        workerPendingStone: pending.stone,
        workerPendingGold: pending.gold,
        observedAtMicros,
        settledThroughMicros: projection.resource.settledThroughMicros,
        revision: projection.resource.revision,
        resourcePolicyVersion: projection.resource.policyVersion,
        workerPolicyVersion: 'genesis-001-castle-workers-v1',
        workerSystemMode: workerSystemMode(tx),
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

export const dispatchWorkerV1 = warpkeep.reducer(
  { name: 'dispatch_worker_v1' },
  { workerId: t.string(), resourceKind: t.string(), siteId: t.string(), idempotencyKey: t.string() },
  (ctx, { workerId, resourceKind, siteId, idempotencyKey }) => {
    try {
      const { claims, castle } = requireGameplayPlayerV1(ctx);
      dispatchCastleWorker(ctx, { fid: claims.fid, castle, workerId, resourceKind, siteId, idempotencyKey });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

export const recallWorkerV1 = warpkeep.reducer(
  { name: 'recall_worker_v1' },
  { workerId: t.string(), idempotencyKey: t.string() },
  (ctx, { workerId, idempotencyKey }) => {
    try {
      const { claims, castle } = requireGameplayPlayerV1(ctx);
      recallCastleWorker(ctx, { fid: claims.fid, castle, workerId, idempotencyKey });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

export const recallAllWorkersV1 = warpkeep.reducer(
  { name: 'recall_all_workers_v1' },
  { idempotencyKey: t.string() },
  (ctx, { idempotencyKey }) => {
    try {
      const { claims, castle } = requireGameplayPlayerV1(ctx);
      recallAllCastleWorkers(ctx, { fid: claims.fid, castle, idempotencyKey });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

export const adminGetWorkerSystemStatusV1 = warpkeep.procedure(
  { name: 'admin_get_worker_system_status_v1' },
  adminWorkerSystemStatus,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    return aggregateResult(inspectCastleWorkerGraph(tx));
  }),
);

export const adminPlanWorkerRosterV1 = warpkeep.procedure(
  { name: 'admin_plan_worker_roster_v1' },
  adminWorkerRosterPlan,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    const aggregate = inspectCastleWorkerGraph(tx);
    const legacyRows = aggregate.legacyExpeditions + aggregate.legacyOccupations + aggregate.legacySchedules;
    return {
      ready: aggregate.systemRows === 1n
        && aggregate.systemConfigValid
        && (aggregate.mode === 'staged' || aggregate.mode === 'active')
        && !aggregate.legacyDrainRequired
        && aggregate.expectedCountsMatch
        && aggregate.rosterDigestMatches
        && aggregate.castlesMissingWorkers === 0n
        && aggregate.castlesWithExtraWorkers === 0n
        && aggregate.duplicateOrdinals === 0n
        && aggregate.malformedWorkerIds === 0n
        && aggregate.invalidWorkerStates === 0n
        && aggregate.orphanWorkers === 0n
        && aggregate.orphanAssignments === 0n
        && aggregate.assignmentsMissingOccupation === 0n
        && aggregate.assignmentsWithoutSingleSchedule === 0n
        && aggregate.orphanOccupations === 0n
        && aggregate.orphanSchedules === 0n
        && aggregate.invalidSchedules === 0n
        && aggregate.assignmentPublicMismatches === 0n
        && aggregate.occupationSiteMismatches === 0n
        && aggregate.invalidAssignments === 0n
        && aggregate.invalidIdempotencyReceipts === 0n
        && aggregate.idempotencyOverflowFids === 0n
        && legacyRows === 0n,
      activationBlockedByLegacyRows: aggregate.legacyDrainRequired || legacyRows !== 0n,
      mode: aggregate.mode,
      systemConfigValid: aggregate.systemConfigValid,
      legacyDrainRequired: aggregate.legacyDrainRequired,
      expectedCastleCount: aggregate.expectedCastleCount,
      expectedWorkerCount: aggregate.expectedWorkerCount,
      actualWorkerCount: aggregate.actualWorkerCount,
      expectedCountsMatch: aggregate.expectedCountsMatch,
      rosterDigestMatches: aggregate.rosterDigestMatches,
      castlesMissingWorkers: aggregate.castlesMissingWorkers,
      castlesWithExtraWorkers: aggregate.castlesWithExtraWorkers,
      orphanWorkers: aggregate.orphanWorkers,
      orphanAssignments: aggregate.orphanAssignments,
      assignmentsMissingOccupation: aggregate.assignmentsMissingOccupation,
      assignmentsWithoutSingleSchedule: aggregate.assignmentsWithoutSingleSchedule,
      orphanOccupations: aggregate.orphanOccupations,
      orphanSchedules: aggregate.orphanSchedules,
      invalidSchedules: aggregate.invalidSchedules,
      assignmentPublicMismatches: aggregate.assignmentPublicMismatches,
      occupationSiteMismatches: aggregate.occupationSiteMismatches,
      invalidWorkerStates: aggregate.invalidWorkerStates,
      invalidAssignments: aggregate.invalidAssignments,
      invalidIdempotencyReceipts: aggregate.invalidIdempotencyReceipts,
      idempotencyOverflowFids: aggregate.idempotencyOverflowFids,
      legacyExpeditions: aggregate.legacyExpeditions,
      legacyOccupations: aggregate.legacyOccupations,
      legacySchedules: aggregate.legacySchedules,
      rosterDigest: aggregate.rosterDigest,
      rosterDigestExpected: aggregate.rosterDigestExpected,
    };
  }),
);

/**
 * Admin-only source boundary. Staging the singleton leaves generic commands
 * disabled and inserts no roster rows.
 */
export const adminStageWorkerSystemV1 = warpkeep.reducer(
  { name: 'admin_stage_worker_system_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      const row = stageWorkerSystem(ctx);
      auditWorkerRollout(
        ctx,
        admin.subject,
        'stage_worker_system_v1',
        [
          `mode=${row.mode}`,
          `castles=${row.expectedCastleCount}`,
          `workers=${row.expectedWorkerCount}`,
          `roster=${row.rosterDigest}`,
          'commands=disabled',
        ].join(';'),
      );
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Deterministic, idempotent four-worker roster backfill. */
export const adminBackfillWorkerRosterV1 = warpkeep.reducer(
  { name: 'admin_backfill_worker_roster_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      const result = backfillWorkerRoster(ctx);
      auditWorkerRollout(
        ctx,
        admin.subject,
        'backfill_worker_roster_v1',
        [
          `inserted=${result.insertedWorkers}`,
          `castles=${result.expectedCastleCount}`,
          `workers=${result.expectedWorkerCount}`,
          `roster=${result.rosterDigest}`,
          'generic_commands=disabled',
        ].join(';'),
      );
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Close new legacy dispatches. Existing expeditions are neither changed nor
 * deleted and must drain through their scheduled lifecycle.
 */
export const adminBeginWorkerLegacyDrainV1 = warpkeep.reducer(
  { name: 'admin_begin_worker_legacy_drain_v1' },
  ctx => {
    try {
      const admin = requireAdmin(ctx);
      const row = beginWorkerLegacyDrain(ctx);
      auditWorkerRollout(
        ctx,
        admin.subject,
        'begin_worker_legacy_drain_v1',
        [
          `mode=${row.mode}`,
          `legacy_drain_required=${row.legacyDrainRequired}`,
          `roster=${row.rosterDigest}`,
          'data_deletion=false',
        ].join(';'),
      );
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Final fail-closed transition. Every supplied field is a reviewed operator
 * attestation and is recomputed or validated by server authority.
 */
export const adminActivateWorkerSystemV1 = warpkeep.reducer(
  { name: 'admin_activate_worker_system_v1' },
  {
    capability: t.string(),
    clientRelease: t.string(),
    clientArtifactDigest: t.string(),
    sourceCommit: t.string(),
    resourceStateVersion: t.u32(),
    resourcePolicyVersion: t.string(),
    resourceCatalogDigest: t.string(),
    expectedCastleCount: t.u32(),
    expectedWorkerCount: t.u32(),
    rosterDigest: t.string(),
    resourceRosterDigest: t.string(),
  },
  (ctx, input) => {
    try {
      const admin = requireAdmin(ctx);
      const attestation: WorkerClientAttestation = Object.freeze({ ...input });
      const row = activateWorkerSystem(ctx, attestation);
      auditWorkerRollout(
        ctx,
        admin.subject,
        'activate_worker_system_v1',
        [
          `release=${attestation.clientRelease}`,
          `source=${attestation.sourceCommit}`,
          `artifact=${attestation.clientArtifactDigest}`,
          `capability=${attestation.capability}`,
          `resource_state_version=${attestation.resourceStateVersion}`,
          `resource_policy=${attestation.resourcePolicyVersion}`,
          `resource_catalog=${attestation.resourceCatalogDigest}`,
          `resource_roster=${attestation.resourceRosterDigest}`,
          `expected_castles=${attestation.expectedCastleCount}`,
          `expected_workers=${attestation.expectedWorkerCount}`,
          `roster=${row.rosterDigest}`,
          'data_deletion=false',
        ].join(';'),
      );
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Aggregate-only review surface; no FID, assignment, balance, or receipt. */
export const adminGetWorkerRolloutStatusV2 = warpkeep.procedure(
  { name: 'admin_get_worker_rollout_status_v2' },
  adminWorkerRolloutStatusV2,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      const status = inspectWorkerRollout(tx);
      return {
        phase: status.phase,
        systemRows: status.systemRows,
        systemConfigValid: status.systemConfigValid,
        expectedCastleCount: status.expectedCastleCount,
        expectedWorkerCount: status.expectedWorkerCount,
        actualCastleCount: status.actualCastleCount,
        actualWorkerCount: status.actualWorkerCount,
        rosterDigest: status.rosterDigest,
        expectedRosterDigest: status.expectedRosterDigest,
        malformedWorkerGraphRows: status.malformedWorkerGraphRows,
        resourceAccounts: status.resourceAccounts,
        missingResourceAccounts: status.missingResourceAccounts,
        orphanedResourceAccounts: status.orphanedResourceAccounts,
        resourceInvariantViolations: status.resourceInvariantViolations,
        resourceRosterDigest: status.resourceRosterDigest,
        canonicalResourceCatalog: status.canonicalResourceCatalog,
        resourceCatalogDigest: status.resourceCatalogDigest,
        legacyExpeditions: status.legacyExpeditions,
        legacyOccupations: status.legacyOccupations,
        legacySchedules: status.legacySchedules,
        genericAssignments: status.genericAssignments,
        genericOccupations: status.genericOccupations,
        genericSchedules: status.genericSchedules,
        genericCommandReceipts: status.genericCommandReceipts,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);
