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

test('rollout source preserves all six deployed v12 table shapes and order', () => {
  const schema = source('../src/schema.ts');
  const fixture = source('../migration-fixtures/additive-v12-schema/src/index.ts');
  const registrations = (text: string, marker: string) => {
    const start = text.indexOf(marker);
    const end = text.indexOf('\n});', start);
    assert.ok(start >= 0 && end > start);
    return text.slice(start + marker.length, end)
      .split(/[,\n]/)
      .map(value => value.trim())
      .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
  };
  const expected = [
    'realmWorkerSystemV1',
    'castleWorkerV1',
    'workerAssignmentV1',
    'workerNodeOccupationV1',
    'workerCommandIdempotencyV1',
    'workerAssignmentScheduleV1',
  ];
  assert.deepEqual(
    registrations(schema, 'const warpkeep = schema({').slice(47),
    expected,
  );
  assert.deepEqual(
    registrations(fixture, 'const db = schema({').slice(47),
    expected,
  );
  assert.doesNotMatch(schema, /realmWorkerSystemV2|castleWorkerV2|workerAssignmentV2/);
});

test('staging, backfill, drain, and activation are separate admin-only operations', () => {
  const reducers = source('../src/reducers/castleWorkers.ts');
  const authority = source('../src/castleWorkerRolloutAuthority.ts');
  for (const reducer of [
    'admin_stage_worker_system_v1',
    'admin_backfill_worker_roster_v1',
    'admin_begin_worker_legacy_drain_v1',
    'admin_activate_worker_system_v1',
  ]) assert.match(reducers, new RegExp(`name: '${reducer}'`));
  assert.equal(
    reducers.match(/const admin = requireAdmin\(ctx\)/g)?.length,
    4,
  );
  const stage = section(authority, 'export function stageWorkerSystem', 'export function backfillWorkerRoster');
  assert.match(stage, /ctx\.db\.castleWorkerV1\.count\(\) !== 0n/);
  assert.doesNotMatch(stage, /castleWorkerV1\.insert/);
  const backfill = section(authority, 'export function backfillWorkerRoster', 'export function beginWorkerLegacyDrain');
  assert.match(backfill, /planDeterministicWorkerBackfill/);
  assert.match(backfill, /for \(const row of plan\.rowsToInsert\)/);
  assert.match(backfill, /ctx\.db\.castleWorkerV1\.insert\(row\)/);
  assert.match(backfill, /after\.rowsToInsert\.length !== 0/);
});

test('legacy drain closes only new dispatch and never deletes legacy rows', () => {
  const reservations = source('../src/resourceExpeditionReservationAuthority.ts');
  const authority = source('../src/castleWorkerRolloutAuthority.ts');
  const drain = section(authority, 'export function beginWorkerLegacyDrain', 'export function activateWorkerSystem');
  assert.match(
    reservations,
    /phase === 'draining' \|\| phase === 'active'[\s\S]*LEGACY_EXPEDITION_DISPATCH_RETIRED/,
  );
  assert.match(drain, /legacyDrainRequired: true/);
  assert.doesNotMatch(
    drain,
    /goldExpeditionV1\..*delete|foodExpeditionV1\..*delete|woodExpeditionV1\..*delete|stoneExpeditionV1\..*delete/,
  );
});

test('founding advances staged or draining rosters without enabling generic commands', () => {
  const roster = source('../src/castleWorkerRoster.ts');
  const ensure = section(
    roster,
    'export function ensureCastleWorkerRoster',
    'export function workerRosterDigestInput',
  );
  assert.match(ensure, /phase === 'staged' \|\| phase === 'draining'/);
  for (const table of [
    'workerAssignmentV1',
    'workerNodeOccupationV1',
    'workerAssignmentScheduleV1',
    'workerCommandIdempotencyV1',
  ]) assert.match(ensure, new RegExp(`${table}\\.count\\(\\)`));
  assert.match(ensure, /const countedCastle = castleCount === BigInt\(system\.expectedCastleCount\)/);
  assert.match(ensure, /const appendedCastle = castleCount === BigInt\(system\.expectedCastleCount\) \+ 1n/);
  assert.match(ensure, /planDeterministicWorkerBackfill\([\s\S]*priorCastleIds,[\s\S]*priorWorkerRows/);
  assert.match(
    ensure,
    /phase === 'draining'[\s\S]*priorPlan\.rowsToInsert\.length !== 0/,
  );
  assert.match(
    ensure,
    /if \(countedCastle\) \{[\s\S]*if \(existing\.length > 0\) assertCastleWorkerRoster\(ctx, castle\.castleId\);[\s\S]*return;/,
  );
  assert.match(ensure, /for \(const row of expectedWorkerRowsForCastle\(castle\)\) \{[\s\S]*castleWorkerV1\.insert\(row\)/);
  assert.match(ensure, /expectedCastleCount: nextCastleCount/);
  assert.match(ensure, /expectedWorkerCount: nextWorkerCount/);
  assert.match(ensure, /rosterDigest: nextRosterDigest/);
  assert.match(ensure, /\.\.\.system,[\s\S]*expectedCastleCount: nextCastleCount/);
  assert.doesNotMatch(ensure, /\.delete\(/);
  assert.doesNotMatch(ensure, /mode: 'active'|legacyDrainRequired: false/);
});

test('every legacy resource rejects the exact generic lease and corrupt preactivation state', () => {
  const reservations = source('../src/resourceExpeditionReservationAuthority.ts');
  assert.match(
    reservations,
    /const nodeKey = workerNodeKey\(resourceKind, siteId\)/,
  );
  assert.match(
    reservations,
    /workerNodeOccupationV1\.nodeKey\.find\(nodeKey\) !== null/,
  );
  for (const table of [
    'workerAssignmentV1',
    'workerNodeOccupationV1',
    'workerAssignmentScheduleV1',
    'workerCommandIdempotencyV1',
  ]) assert.match(reservations, new RegExp(`${table}\\.count\\(\\)`));
  assert.match(reservations, /planDeterministicWorkerBackfill\(castleIds, workerRows\)/);
  assert.match(reservations, /ctx\.db\.castle\.iter\(\)/);
  assert.match(reservations, /rosterDigestMatches/);
  assert.match(reservations, /wholeCastleWorkerSubset/);
  assert.match(reservations, /CASTLE_WORKER_MAX_CASTLES \* CASTLE_WORKERS_PER_CASTLE/);

  for (const kind of ['gold', 'food', 'wood', 'stone']) {
    const legacy = source(`../src/${kind}ExpeditionAuthority.ts`);
    const dispatch = section(
      legacy,
      `export function dispatchGenesis${kind[0]!.toUpperCase()}${kind.slice(1)}Expedition`,
      `const site = ctx.db.${kind}SiteV1`,
    );
    assert.match(
      dispatch,
      new RegExp(`assertLegacyExpeditionDispatchAllowed\\(ctx, '${kind}', input\\.siteId\\)`),
    );
    const receiptLookup = dispatch.indexOf('const prior =');
    const replayReturn = dispatch.indexOf(
      'return Object.freeze({ expedition, idempotent: true })',
    );
    const freshDispatchGate = dispatch.indexOf(
      'assertLegacyExpeditionDispatchAllowed(',
    );
    assert.ok(receiptLookup >= 0 && receiptLookup < replayReturn);
    assert.ok(replayReturn < freshDispatchGate);
  }
});

test('activation binds capability, release artifact, resources, catalogs, roster, and zero legacy state', () => {
  const reducers = source('../src/reducers/castleWorkers.ts');
  const policy = source('../src/castleWorkerRolloutPolicy.ts');
  const activation = section(
    reducers,
    'export const adminActivateWorkerSystemV1',
    'export const adminGetWorkerRolloutStatusV2',
  );
  for (const field of [
    'capability',
    'clientRelease',
    'clientArtifactDigest',
    'sourceCommit',
    'resourceStateVersion',
    'resourcePolicyVersion',
    'resourceCatalogDigest',
    'expectedCastleCount',
    'expectedWorkerCount',
    'rosterDigest',
    'resourceRosterDigest',
  ]) assert.match(activation, new RegExp(`${field}: t\\.`));
  for (const auditField of [
    'resource_state_version=',
    'resource_policy=',
    'expected_castles=',
    'expected_workers=',
  ]) assert.match(activation, new RegExp(auditField));
  assert.match(policy, /clientRelease\.length > CASTLE_WORKER_CLIENT_RELEASE_MAX_LENGTH/);
  assert.match(
    policy,
    /row\.mode === 'active'[\s\S]*row\.activatedAt === undefined[\s\S]*microsSinceUnixEpoch < row\.createdAt\.microsSinceUnixEpoch/,
  );
  assert.match(
    policy,
    /row\.mode !== 'staged'[\s\S]*row\.activatedAt !== undefined && row\.activatedAt !== null/,
  );
  const rolloutAuthority = source('../src/castleWorkerRolloutAuthority.ts');
  assert.match(
    rolloutAuthority,
    /assertInspectionCapacity\(ctx\);[\s\S]*inspectCastleWorkerGraph\(ctx\)[\s\S]*inspectGenesisResourceGraph\(ctx\)/,
  );
  assert.match(rolloutAuthority, /phase: workerRolloutPhaseAt\(/);
  assert.equal(
    rolloutAuthority.match(/workerRolloutPhaseAt\(/g)?.length,
    5,
  );
  assert.doesNotMatch(rolloutAuthority, /workerRolloutPhase\(/);
  const legacyReservations = source(
    '../src/resourceExpeditionReservationAuthority.ts',
  );
  assert.match(legacyReservations, /workerRolloutPhaseAt\(/);
  assert.doesNotMatch(legacyReservations, /workerRolloutPhase\(/);
  for (const blocker of [
    'WORKER_CLIENT_CAPABILITY_MISMATCH',
    'WORKER_RESOURCE_POLICY_MISMATCH',
    'WORKER_RESOURCE_CATALOG_MISMATCH',
    'WORKER_ROSTER_COUNT_MISMATCH',
    'WORKER_ROSTER_DIGEST_MISMATCH',
    'WORKER_RESOURCE_STATE_NOT_READY',
    'WORKER_LEGACY_DRAIN_REQUIRED',
    'WORKER_PREACTIVATION_STATE_NOT_EMPTY',
  ]) assert.match(policy, new RegExp(blocker));
});

test('dispatch, recall one, recall all, settlement, and exact replay binding remain server-authoritative', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const commands = source('../src/castleWorkerCommandPolicy.ts');
  const dispatch = section(authority, 'export function dispatchCastleWorker', 'function progressBasisPoints');
  const recall = section(authority, 'export function recallCastleWorker', 'export function recallAllCastleWorkers');
  const recallAll = section(authority, 'export function recallAllCastleWorkers', 'export type WorkerGraphAggregate');
  assert.match(dispatch, /prior\.workerId !== input\.workerId/);
  assert.match(dispatch, /prior\.resourceKind !== input\.resourceKind/);
  assert.match(dispatch, /prior\.siteId !== input\.siteId/);
  assert.match(dispatch, /worker\.status !== 'idle'/);
  assert.match(dispatch, /workerNodeOccupationV1\.nodeKey\.find\(nodeKey\) !== null/);
  assert.match(recall, /recallReplayMatches\(prior, input\.fid, input\.workerId\)/);
  assert.match(recallAll, /recallAllReplayMatches\(prior, input\.fid\)/);
  assert.match(commands, /workerCommandReceiptShapeIsValid/);
  assert.match(authority, /export function settleAllWorkerAssignmentsForFid/);
  assert.match(authority, /planCastleWorkerAccrual\(assignment, observedAtMicros\)/);
  assert.match(authority, /runCastleWorkerSchedule/);
  assert.match(
    authority,
    /settleAndBeginReturnAt\([\s\S]*settlementObservedAtMicros[\s\S]*returnStartedAtMicros[\s\S]*settleAllWorkerAssignmentsForFid\([\s\S]*settlementObservedAtMicros[\s\S]*beginWorkerReturn\([\s\S]*returnStartedAtMicros/,
  );
});

test('same-resource dispatch remains unrestricted while exact occupied nodes reject', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const dispatch = section(authority, 'export function dispatchCastleWorker', 'function progressBasisPoints');
  assert.match(dispatch, /const nodeKey = workerNodeKey\(input\.resourceKind, input\.siteId\)/);
  assert.match(dispatch, /workerNodeOccupationV1\.nodeKey\.find\(nodeKey\) !== null/);
  assert.doesNotMatch(dispatch, /resourceKind.*unique|byResourceKind|WORKER_RESOURCE_OCCUPIED/);
});
