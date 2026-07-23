import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, startNeedle: string, endNeedle: string): string {
  const start = text.indexOf(startNeedle);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `missing section ${startNeedle}`);
  return text.slice(start, end);
}

test('worker lifecycle advances one synchronized revision and one schedule at a time', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const dispatch = section(authority, 'export function dispatchCastleWorker', 'function progressBasisPoints');
  const arrival = section(authority, 'function transitionWorkerArrival', 'function settleAndBeginReturnAt');
  const returning = section(authority, 'function beginWorkerReturn', 'function completeWorkerReturn');
  const complete = section(authority, 'function completeWorkerReturn', 'function transitionWorkerArrival');

  assert.match(dispatch, /timelineRevision = safeNextU32\(worker\.timelineRevision/);
  assert.equal(dispatch.match(/insertSchedule\(/g)?.length, 1);
  assert.match(dispatch, /WORKER_SCHEDULE_STAGE_ARRIVAL/);
  assert.match(dispatch, /revision: safeNextU64\(worker\.revision/);

  for (const transition of [arrival, returning]) {
    assert.match(transition, /timelineRevision = safeNextU32\(assignment\.timelineRevision/);
    assert.match(transition, /deleteSchedulesForAssignment\(ctx, assignment\.assignmentId\)/);
    assert.match(transition, /revision: safeNextU64\(worker\.revision/);
    assert.equal(transition.match(/insertSchedule\(/g)?.length, 1);
  }
  assert.match(arrival, /WORKER_SCHEDULE_STAGE_GATHERING_EXPIRY/);
  assert.match(returning, /WORKER_SCHEDULE_STAGE_RETURN_COMPLETE/);
  assert.match(complete, /deleteSchedulesForAssignment\(ctx, assignment\.assignmentId\)/);
  assert.match(complete, /workerAssignmentV1\.assignmentId\.delete\(assignment\.assignmentId\)/);
});

test('worker leases allow repeated resource kinds but enforce one worker per node', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const schema = source('../src/schema.ts');
  const dispatch = section(authority, 'export function dispatchCastleWorker', 'function progressBasisPoints');
  const occupation = section(schema, 'export const workerNodeOccupationV1', 'export const workerCommandIdempotencyV1');

  assert.match(dispatch, /const nodeKey = workerNodeKey\(input\.resourceKind, input\.siteId\)/);
  assert.match(dispatch, /workerNodeOccupationV1\.nodeKey\.find\(nodeKey\) !== null/);
  assert.match(occupation, /nodeKey: t\.string\(\)\.primaryKey\(\)/);
  assert.doesNotMatch(occupation, /resourceKind: t\.string\(\)\.unique\(\)/);
  assert.doesNotMatch(occupation, /siteId: t\.string\(\)\.unique\(\)/);
});

test('recall caps server-time accrual and persists replay-safe no-op receipts', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const recall = section(authority, 'export function recallCastleWorker', 'export function recallAllCastleWorkers');
  const recallAll = section(authority, 'export function recallAllCastleWorkers', 'export type WorkerGraphAggregate');
  const accrual = source('../src/castleWorkerPolicy.ts');

  assert.match(recall, /now < assignment\.gatheringEndsAtMicros[\s\S]*assignment\.gatheringEndsAtMicros/);
  assert.match(recall, /recallWorkerReceipt\([\s\S]*assignment === null \? undefined/);
  assert.match(recallAll, /recallAllWorkersReceipt\([\s\S]*lastAssignmentId/);
  assert.doesNotMatch(recallAll, /if \(lastAssignmentId === undefined\) return;/);
  assert.match(authority, /WORKER_IDEMPOTENCY_RECEIPTS_PER_FID = 64/);
  assert.match(authority, /workerCommandIdempotencyV1\.byFid\.filter\(fid\)/);
  assert.match(accrual, /state\.phase === 'returning'[\s\S]*state\.returnStartedAtMicros/);
});

test('founding updates active roster readiness atomically and legacy dispatch is retired', () => {
  const roster = source('../src/castleWorkerRoster.ts');
  const founding = source('../src/foundingAuthority.ts');
  const reservations = source('../src/resourceExpeditionReservationAuthority.ts');

  assert.match(roster, /const nextRosterDigest = rosterDigestForCastleIds\(/);
  assert.match(roster, /appendCastleWorkerRosterDigest\(system\.rosterDigest, castle\.castleId\)[\s\S]*!== nextRosterDigest/);
  assert.match(roster, /realmWorkerSystemV1\.realmId\.update\(\{[\s\S]*expectedCastleCount: nextCastleCount,[\s\S]*expectedWorkerCount: nextWorkerCount,[\s\S]*rosterDigest: nextRosterDigest/);
  assert.match(roster, /ctx\.db\.castle\.iter\(\),[\s\S]*CASTLE_WORKER_MAX_CASTLES/);
  assert.match(roster, /ctx\.db\.castleWorkerV1\.iter\(\),[\s\S]*CASTLE_WORKER_MAX_CASTLES \* CASTLE_WORKERS_PER_CASTLE/);
  assert.match(founding, /ensureCastleWorkerRoster\(ctx, existingCastle\)/);
  assert.match(founding, /ensureCastleWorkerRoster\(ctx, castle\)/);
  assert.match(
    reservations,
    /phase === 'draining' \|\| phase === 'active'[\s\S]*LEGACY_EXPEDITION_DISPATCH_RETIRED/,
  );
  for (const kind of ['gold', 'food', 'wood', 'stone']) {
    const legacy = source(`../src/${kind}ExpeditionAuthority.ts`);
    const dispatch = section(
      legacy,
      `export function dispatchGenesis${kind[0].toUpperCase()}${kind.slice(1)}Expedition`,
      `const site = ctx.db.${kind}SiteV1`,
    );
    assert.match(
      dispatch,
      new RegExp(`assertLegacyExpeditionDispatchAllowed\\(ctx, '${kind}', input\\.siteId\\)`),
    );
    assert.ok(
      dispatch.indexOf('const prior =')
        < dispatch.indexOf('return Object.freeze({ expedition, idempotent: true })'),
    );
    assert.ok(
      dispatch.indexOf('return Object.freeze({ expedition, idempotent: true })')
        < dispatch.indexOf('assertLegacyExpeditionDispatchAllowed('),
    );
  }
});

test('worker reads use bounded indexes and public tables omit assignment correlation', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const reservations = source('../src/resourceExpeditionReservationAuthority.ts');
  const schema = source('../src/schema.ts');
  const settlement = section(authority, 'export function settleAllWorkerAssignmentsForFid', 'export type WorkerPrivateProjection');
  const active = section(authority, 'function workerSystemActive', 'function canonicalSiteFor');
  const callerGraph = section(authority, 'function assertCallerWorkerGraph', 'function pruneWorkerIdempotencyReceipts');
  const publicMatch = section(authority, 'function publicWorkerMatchesAssignment', 'function occupationMatchesAssignment');
  const occupationMatch = section(authority, 'function occupationMatchesAssignment', 'function canonicalCastleOwnershipMatches');

  assert.match(settlement, /workerAssignmentV1\.byFid\.filter\(fid\)/);
  assert.doesNotMatch(settlement, /workerAssignmentV1\.iter\(\)/);
  assert.doesNotMatch(active, /\.iter\(\)|inspectCastleWorkerGraph/);
  assert.match(callerGraph, /workerAssignmentV1\.byFid\.filter\(fid\)/);
  assert.match(callerGraph, /workerNodeOccupationV1\.byWorker\.filter\(worker\.workerId\)/);
  assert.match(callerGraph, /workerAssignmentScheduleV1\.byWorker\.filter\(worker\.workerId\)/);
  assert.match(callerGraph, /workerCommandIdempotencyV1\.byFid\.filter\(fid\)/);
  assert.doesNotMatch(callerGraph, /\.iter\(\)/);
  assert.match(reservations, /workerAssignmentV1\.byFid\.filter\(fid\)/);
  assert.match(publicMatch, /worker\.workerId === workerIdForCastle\(assignment\.originCastleId, worker\.ordinal\)/);
  assert.match(publicMatch, /worker\.returnStartedAtMicros === assignment\.returnStartedAtMicros/);
  assert.match(publicMatch, /worker\.returnStartProgressBasisPoints === expectedReturnProgress/);
  for (const field of [
    'nodeKey', 'resourceKind', 'siteId', 'workerId', 'workerOrdinal',
    'originCastleId', 'phase', 'startedAtMicros', 'arrivesAtMicros',
    'gatheringEndsAtMicros', 'timelineRevision',
  ]) assert.match(occupationMatch, new RegExp(`occupation\\.${field}`));
  assert.match(occupationMatch, /assignment\.phase !== 'returning'/);
  assert.doesNotMatch(section(schema, 'export const castleWorkerV1', 'export const workerAssignmentV1'), /assignmentId/);
  assert.doesNotMatch(section(schema, 'export const workerNodeOccupationV1', 'export const workerCommandIdempotencyV1'), /assignmentId/);
  assert.doesNotMatch(section(schema, 'export const workerAssignmentScheduleV1', 'const warpkeep = schema'), /public: true/);
});

test('worker assignments and replay receipts remain bound to canonical castle ownership', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const graph = section(authority, 'export function inspectCastleWorkerGraph', 'export function castleWorkerErrorCode');
  const dispatch = section(authority, 'export function dispatchCastleWorker', 'function progressBasisPoints');
  const recall = section(authority, 'export function recallCastleWorker', 'export function recallAllCastleWorkers');
  const recallAll = section(authority, 'export function recallAllCastleWorkers', 'export type WorkerGraphAggregate');

  assert.match(authority, /function canonicalCastleOwnershipMatches[\s\S]*castle\.castleId\.find\(castleId\)[\s\S]*resourceAccountV1\.fid\.find\(fid\)/);
  assert.match(graph, /if \(!assignmentOwnerIsCanonical\(ctx, assignment\)\) fail\('WORKER_OWNER_INTEGRITY'\)/);
  assert.match(graph, /!workerReceiptShapeIsValid\(receipt\)[\s\S]*!receiptOwnerIsCanonical\(ctx, receipt\)/);
  assert.match(graph, /!receiptOwnerIsCanonical\(ctx, receipt\)/);
  assert.match(dispatch, /workerReceiptShapeIsValid\(prior\)/);
  assert.match(recall, /recallReplayMatches\(prior, input\.fid, input\.workerId\)/);
  assert.match(recallAll, /recallAllReplayMatches\(prior, input\.fid\)/);
  for (const replay of [dispatch, recall, recallAll]) {
    assert.match(replay, /receiptOwnerIsCanonical\(ctx, prior, input\.castle\.castleId\)/);
    assert.match(replay, /canonicalCastleOwnershipMatches\(ctx, input\.fid, input\.castle\.castleId\)/);
  }
  assert.match(dispatch, /!assignmentOwnerIsCanonical\(ctx, assignment\)/);
});

test('admin readiness and sender errors fail closed on every bounded graph signal', () => {
  const reducers = source('../src/reducers/castleWorkers.ts');
  const authority = source('../src/castleWorkerAuthority.ts');

  for (const signal of [
    'systemConfigValid', 'legacyDrainRequired', 'expectedCountsMatch',
    'rosterDigestMatches', 'invalidWorkerStates', 'assignmentsMissingOccupation',
    'assignmentsWithoutSingleSchedule', 'orphanSchedules', 'invalidSchedules',
    'invalidAssignments', 'invalidIdempotencyReceipts', 'idempotencyOverflowFids',
  ]) assert.match(reducers, new RegExp(signal));
  assert.match(section(reducers, 'export const adminPlanWorkerRosterV1', '\n);'), /requireAdmin\(tx\)/);
  assert.match(reducers, /throw new SenderError\('WORKER_REQUEST_FAILED'\)/);
  assert.match(authority, /BOUNDED_WORKER_ERROR_CODE = \/\^\[A-Z\]\[A-Z0-9_\]\{0,63\}\$\//);
});

test('CI runs both static and real populated v11 to v12 migration proofs', () => {
  const workflow = source('../../.github/workflows/verify.yml');
  const verifier = source('../../scripts/verify-spacetime-additive-migration.mjs');

  assert.match(workflow, /npm run stdb:verify-worker-migration[\s\S]*npm run stdb:verify-additive-migration/);
  assert.match(verifier, /function assertAdditiveV12Schema\(before, after\)/);
  assert.match(verifier, /fixture_seed_generic_worker_sentinel_v12/);
  assert.match(verifier, /populatedWaterStoneV12Rows/);
  assert.match(verifier, /additiveV11SchemaFixture,[\s\S]{0,120}populatedWaterStoneMigrationDatabase,[\s\S]{0,40}false/);
  assert.match(verifier, /every v12 table was populated, retained through the real candidate/);
});
