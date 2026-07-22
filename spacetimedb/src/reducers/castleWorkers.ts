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

function senderPolicyError(error: unknown): never {
  const code = castleWorkerErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('WORKER_REQUEST_FAILED');
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
