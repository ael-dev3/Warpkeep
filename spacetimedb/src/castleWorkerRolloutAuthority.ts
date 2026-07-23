import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  type CastleWorkerSiteShape,
  rosterDigestForCastleIds,
  workerResourcePolicy,
} from './castleWorkerPolicy';
import {
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  CASTLE_WORKER_MAX_CASTLES,
  CastleWorkerRolloutPolicyError,
  type WorkerActivationSnapshot,
  type WorkerClientAttestation,
  assertWorkerActivationReady,
  assertWorkerClientAttestation,
  planDeterministicWorkerBackfill,
  resourceRosterDigest,
  workerRolloutPhaseAt,
} from './castleWorkerRolloutPolicy';
import {
  WORKER_IDEMPOTENCY_RECEIPTS_PER_FID,
  type WorkerGraphAggregate,
  inspectCastleWorkerGraph,
} from './castleWorkerAuthority';
import {
  inspectGenesisResourceGraph,
} from './resourceAuthority';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type WorkerSystemRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmWorkerSystemV1']['realmId']['find']>
>;

const REALM_ID = 'GENESIS_001';
const BOUNDED_ROLLOUT_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_WORKER_ROWS =
  CASTLE_WORKER_MAX_CASTLES * CASTLE_WORKERS_PER_CASTLE;
const MAX_WORKER_RECEIPTS =
  CASTLE_WORKER_MAX_CASTLES * WORKER_IDEMPOTENCY_RECEIPTS_PER_FID;

export class CastleWorkerRolloutAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CastleWorkerRolloutAuthorityError';
  }
}

function fail(code: string): never {
  throw new CastleWorkerRolloutAuthorityError(code);
}

function safeRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
  code: string,
): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= maximum) fail(code);
    result.push(row);
  }
  return Object.freeze(result);
}

/**
 * Every subsequent inspection iterator is bounded by an authoritative row
 * count. Reject corrupt oversized graphs before opening any iterator.
 */
function assertInspectionCapacity(ctx: WarpkeepReducerContext): void {
  const caps = [
    [ctx.db.realmWorkerSystemV1.count(), 1],
    [ctx.db.castle.count(), CASTLE_WORKER_MAX_CASTLES],
    [ctx.db.castleWorkerV1.count(), MAX_WORKER_ROWS],
    [ctx.db.workerAssignmentV1.count(), MAX_WORKER_ROWS],
    [ctx.db.workerNodeOccupationV1.count(), MAX_WORKER_ROWS],
    [ctx.db.workerAssignmentScheduleV1.count(), MAX_WORKER_ROWS],
    [ctx.db.workerCommandIdempotencyV1.count(), MAX_WORKER_RECEIPTS],
    [ctx.db.resourceAccountV1.count(), CASTLE_WORKER_MAX_CASTLES],
  ] as const;
  if (caps.some(([count, cap]) => count > BigInt(cap))) {
    fail('WORKER_INSPECTION_CAPACITY');
  }
}

function castles(ctx: WarpkeepReducerContext) {
  return [...safeRows(ctx.db.castle.iter(), 100, 'WORKER_ROSTER_CAPACITY')]
    .sort((left, right) => (
      left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0
    ));
}

function genericPreactivationRows(ctx: WarpkeepReducerContext): bigint {
  return ctx.db.workerAssignmentV1.count()
    + ctx.db.workerNodeOccupationV1.count()
    + ctx.db.workerAssignmentScheduleV1.count()
    + ctx.db.workerCommandIdempotencyV1.count();
}

function assertGenericPreactivationEmpty(ctx: WarpkeepReducerContext): void {
  if (genericPreactivationRows(ctx) !== 0n) {
    fail('WORKER_PREACTIVATION_STATE_NOT_EMPTY');
  }
}

function rowsMatchCanonicalCatalog(
  kind: 'gold' | 'food' | 'wood' | 'stone',
  rows: Iterable<CastleWorkerSiteShape>,
): boolean {
  const policy = workerResourcePolicy(kind);
  let count = 0;
  for (const row of rows) {
    count += 1;
    if (count > policy.canonicalSiteCount || !policy.matchesCanonicalSite(row)) {
      return false;
    }
  }
  return count === policy.canonicalSiteCount;
}

export function workerResourceCatalogIsCanonical(
  ctx: WarpkeepReducerContext,
): boolean {
  return rowsMatchCanonicalCatalog('gold', ctx.db.goldSiteV1.iter())
    && rowsMatchCanonicalCatalog('food', ctx.db.foodSiteV1.iter())
    && rowsMatchCanonicalCatalog('wood', ctx.db.woodSiteV1.iter())
    && rowsMatchCanonicalCatalog('stone', ctx.db.stoneSiteV1.iter());
}

function malformedWorkerGraphRows(graph: WorkerGraphAggregate): bigint {
  return graph.castlesMissingWorkers
    + graph.castlesWithExtraWorkers
    + graph.duplicateOrdinals
    + graph.malformedWorkerIds
    + graph.invalidWorkerStates
    + graph.orphanWorkers
    + graph.orphanAssignments
    + graph.assignmentsMissingOccupation
    + graph.assignmentsWithoutSingleSchedule
    + graph.orphanOccupations
    + graph.orphanSchedules
    + graph.invalidSchedules
    + graph.assignmentPublicMismatches
    + graph.occupationSiteMismatches
    + graph.invalidAssignments
    + graph.invalidIdempotencyReceipts
    + graph.idempotencyOverflowFids;
}

export type WorkerRolloutInspection = WorkerActivationSnapshot & Readonly<{
  resourceCatalogDigest: string;
  activationReady: boolean;
  activationBlockers: readonly string[];
}>;

export function inspectWorkerRollout(
  ctx: WarpkeepReducerContext,
  attestation?: WorkerClientAttestation,
): WorkerRolloutInspection {
  assertInspectionCapacity(ctx);
  const system = ctx.db.realmWorkerSystemV1.realmId.find(REALM_ID);
  const graph = inspectCastleWorkerGraph(ctx);
  const resource = inspectGenesisResourceGraph(ctx);
  const castleRows = castles(ctx);
  const accountRows = safeRows(
    ctx.db.resourceAccountV1.iter(),
    100,
    'WORKER_RESOURCE_STATE_CAPACITY',
  );
  let accountDigest = '';
  try {
    accountDigest = resourceRosterDigest(accountRows);
  } catch {
    // The aggregate below retains the exact resource invariant counters. An
    // invalid account graph gets no digest and therefore cannot activate.
  }
  const snapshot: WorkerActivationSnapshot = Object.freeze({
    phase: workerRolloutPhaseAt(
      system,
      ctx.db.realmWorkerSystemV1.count(),
      ctx.timestamp.microsSinceUnixEpoch,
    ),
    systemRows: graph.systemRows,
    systemConfigValid: graph.systemConfigValid,
    expectedCastleCount: Number(graph.expectedCastleCount),
    expectedWorkerCount: Number(graph.expectedWorkerCount),
    actualCastleCount: BigInt(castleRows.length),
    actualWorkerCount: graph.actualWorkerCount,
    rosterDigest: graph.rosterDigest,
    expectedRosterDigest: rosterDigestForCastleIds(
      castleRows.map(castle => castle.castleId),
    ),
    malformedWorkerGraphRows: malformedWorkerGraphRows(graph),
    resourceAccounts: resource.resourceAccounts,
    missingResourceAccounts: resource.missingResourceAccounts,
    orphanedResourceAccounts: resource.orphanedResourceAccounts,
    resourceInvariantViolations: resource.resourceInvariantViolations,
    resourceRosterDigest: accountDigest,
    canonicalResourceCatalog: workerResourceCatalogIsCanonical(ctx),
    legacyExpeditions: graph.legacyExpeditions,
    legacyOccupations: graph.legacyOccupations,
    legacySchedules: graph.legacySchedules,
    genericAssignments: graph.assignments,
    genericOccupations: graph.occupations,
    genericSchedules: graph.schedules,
    genericCommandReceipts: graph.idempotencyReceipts,
  });
  const blockers = attestation === undefined
    ? Object.freeze(['WORKER_CLIENT_ATTESTATION_REQUIRED'])
    : (() => {
      try {
        assertWorkerActivationReady(snapshot, attestation);
        return Object.freeze([] as string[]);
      } catch (error) {
        const code = error instanceof CastleWorkerRolloutPolicyError
          ? error.code
          : 'WORKER_ACTIVATION_NOT_READY';
        return Object.freeze([code]);
      }
    })();
  return Object.freeze({
    ...snapshot,
    resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
    activationReady: blockers.length === 0,
    activationBlockers: blockers,
  });
}

/**
 * Create only the disabled singleton. This does not insert a worker, close a
 * legacy command path, or enable generic commands.
 */
export function stageWorkerSystem(
  ctx: WarpkeepReducerContext,
): WorkerSystemRow {
  const systemRows = ctx.db.realmWorkerSystemV1.count();
  if (systemRows > 1n) fail('WORKER_SYSTEM_INTEGRITY');
  const current = ctx.db.realmWorkerSystemV1.realmId.find(REALM_ID);
  if (current === null && systemRows !== 0n) fail('WORKER_SYSTEM_INTEGRITY');
  const castleRows = castles(ctx);
  const expectedCastleCount = castleRows.length;
  const expectedWorkerCount = expectedCastleCount * CASTLE_WORKERS_PER_CASTLE;
  const expectedDigest = rosterDigestForCastleIds(
    castleRows.map(castle => castle.castleId),
  );
  if (current !== null) {
    const phase = workerRolloutPhaseAt(
      current,
      systemRows,
      ctx.timestamp.microsSinceUnixEpoch,
    );
    if (
      (phase !== 'staged' && phase !== 'draining')
      || current.expectedCastleCount !== expectedCastleCount
      || current.expectedWorkerCount !== expectedWorkerCount
      || current.rosterDigest !== expectedDigest
    ) fail('WORKER_SYSTEM_ALREADY_CONFIGURED');
    return current;
  }
  if (ctx.db.castleWorkerV1.count() !== 0n) fail('WORKER_ROSTER_ORPHAN');
  assertGenericPreactivationEmpty(ctx);
  return ctx.db.realmWorkerSystemV1.insert({
    realmId: REALM_ID,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
    expectedCastleCount,
    expectedWorkerCount,
    rosterDigest: expectedDigest,
    mode: 'staged',
    legacyDrainRequired: false,
    createdAt: ctx.timestamp,
    activatedAt: undefined,
  });
}

/**
 * Insert missing complete rosters only after planning the entire realm. A
 * rerun over the exact roster writes nothing and returns the same digest.
 */
export function backfillWorkerRoster(
  ctx: WarpkeepReducerContext,
): Readonly<{
  insertedWorkers: number;
  expectedCastleCount: number;
  expectedWorkerCount: number;
  rosterDigest: string;
}> {
  const system = stageWorkerSystem(ctx);
  if (
    workerRolloutPhaseAt(
      system,
      ctx.db.realmWorkerSystemV1.count(),
      ctx.timestamp.microsSinceUnixEpoch,
    ) !== 'staged'
  ) {
    fail('WORKER_BACKFILL_PHASE_INVALID');
  }
  assertGenericPreactivationEmpty(ctx);
  const castleRows = castles(ctx);
  const existingRows = safeRows(
    ctx.db.castleWorkerV1.iter(),
    castleRows.length * CASTLE_WORKERS_PER_CASTLE,
    'WORKER_ROSTER_OVERSIZED',
  );
  const plan = planDeterministicWorkerBackfill(
    castleRows.map(castle => castle.castleId),
    existingRows,
  );
  for (const row of plan.rowsToInsert) {
    ctx.db.castleWorkerV1.insert(row);
  }
  if (
    ctx.db.castleWorkerV1.count() !== BigInt(plan.expectedWorkerCount)
    || system.expectedCastleCount !== plan.expectedCastleCount
    || system.expectedWorkerCount !== plan.expectedWorkerCount
    || system.rosterDigest !== plan.rosterDigest
  ) fail('WORKER_ROSTER_INTEGRITY');
  const after = planDeterministicWorkerBackfill(
    castleRows.map(castle => castle.castleId),
    safeRows(
      ctx.db.castleWorkerV1.iter(),
      plan.expectedWorkerCount,
      'WORKER_ROSTER_OVERSIZED',
    ),
  );
  if (after.rowsToInsert.length !== 0) fail('WORKER_ROSTER_INCOMPLETE');
  return Object.freeze({
    insertedWorkers: plan.rowsToInsert.length,
    expectedCastleCount: plan.expectedCastleCount,
    expectedWorkerCount: plan.expectedWorkerCount,
    rosterDigest: plan.rosterDigest,
  });
}

/**
 * Permanently close creation of new legacy expeditions while existing rows
 * finish through their unchanged scheduled lifecycle.
 */
export function beginWorkerLegacyDrain(
  ctx: WarpkeepReducerContext,
): WorkerSystemRow {
  const system = ctx.db.realmWorkerSystemV1.realmId.find(REALM_ID);
  const phase = workerRolloutPhaseAt(
    system,
    ctx.db.realmWorkerSystemV1.count(),
    ctx.timestamp.microsSinceUnixEpoch,
  );
  if (system === null || (phase !== 'staged' && phase !== 'draining')) {
    fail('WORKER_DRAIN_PHASE_INVALID');
  }
  if (phase === 'draining') return system;
  backfillWorkerRoster(ctx);
  const status = inspectWorkerRollout(ctx);
  if (
    status.actualCastleCount === 0n
    || status.malformedWorkerGraphRows !== 0n
    || status.actualWorkerCount !== BigInt(status.expectedWorkerCount)
    || status.rosterDigest !== status.expectedRosterDigest
    || status.resourceAccounts !== status.actualCastleCount
    || status.missingResourceAccounts !== 0n
    || status.orphanedResourceAccounts !== 0n
    || status.resourceInvariantViolations !== 0n
    || !status.canonicalResourceCatalog
    || genericPreactivationRows(ctx) !== 0n
  ) fail('WORKER_DRAIN_NOT_READY');
  return ctx.db.realmWorkerSystemV1.realmId.update({
    ...system,
    legacyDrainRequired: true,
  });
}

/** Activate only after exact operator and live-state attestations agree. */
export function activateWorkerSystem(
  ctx: WarpkeepReducerContext,
  attestation: WorkerClientAttestation,
): WorkerSystemRow {
  assertWorkerClientAttestation(attestation);
  const system = ctx.db.realmWorkerSystemV1.realmId.find(REALM_ID);
  if (system === null) fail('WORKER_SYSTEM_NOT_READY');
  const phase = workerRolloutPhaseAt(
    system,
    ctx.db.realmWorkerSystemV1.count(),
    ctx.timestamp.microsSinceUnixEpoch,
  );
  if (phase === 'active') fail('WORKER_SYSTEM_ALREADY_ACTIVE');
  if (phase !== 'draining') fail('WORKER_LEGACY_DRAIN_NOT_STARTED');
  const status = inspectWorkerRollout(ctx, attestation);
  assertWorkerActivationReady(status, attestation);
  return ctx.db.realmWorkerSystemV1.realmId.update({
    ...system,
    mode: 'active',
    legacyDrainRequired: false,
    activatedAt: ctx.timestamp,
  });
}

export function castleWorkerRolloutErrorCode(
  error: unknown,
): string | undefined {
  if (
    (error instanceof CastleWorkerRolloutAuthorityError
      || error instanceof CastleWorkerRolloutPolicyError)
    && BOUNDED_ROLLOUT_ERROR_CODE.test(error.code)
  ) return error.code;
  return undefined;
}
