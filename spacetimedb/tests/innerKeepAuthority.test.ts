import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, startMarker: string, endMarker?: string): string {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source section: ${startMarker}`);
  if (endMarker === undefined) return text.slice(start);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source section terminator: ${endMarker}`);
  return text.slice(start, end);
}

test('project start derives caller, castle, level, cost, and server time', () => {
  const reducers = source('../src/reducers/innerKeep.ts');
  const authority = source('../src/innerKeepAuthority.ts');
  const wire = section(
    reducers,
    'export const innerKeepStartProjectV1',
    'export const adminGetInnerKeepStatusV1',
  );
  const start = section(
    authority,
    'export function startInnerKeepProject',
    '/** Exact schedule completion',
  );
  const idempotency = section(
    authority,
    'function priorReceiptMatches',
    'export type InnerKeepStartResult',
  );
  assert.match(wire, /name: 'inner_keep_start_project_v1'/);
  assert.match(wire, /buildingKind: t\.string\(\)/);
  assert.match(wire, /localXMicrounits: t\.i64\(\)/);
  assert.match(wire, /localZMicrounits: t\.i64\(\)/);
  assert.match(wire, /rotationMilliDegrees: t\.u32\(\)/);
  assert.doesNotMatch(wire, /slot(?:Id|Key):/);
  assert.match(wire, /requestKey: t\.string\(\)/);
  assert.match(wire, /expectedTargetLevel: t\.u32\(\)/);
  assert.match(wire, /expectedProjectRevision: t\.string\(\)/);
  assert.match(wire, /expectedPolicyDigest: t\.string\(\)/);
  assert.match(wire, /expectedLayoutDigest: t\.string\(\)/);
  assert.doesNotMatch(wire, /fid: t\.|castleId: t\.|expectedCost|expectedDuration|completion/i);
  assert.match(wire, /const \{ claims, castle \} = requireGameplayPlayerV1\(ctx\)/);
  assert.match(start, /const prior = ctx\.db\.castleInnerBuildReceiptV1\.receiptKey\.find/);
  assert.match(idempotency, /row\.localXMicrounits === input\.localXMicrounits/);
  assert.match(idempotency, /row\.localZMicrounits === input\.localZMicrounits/);
  assert.match(idempotency, /row\.rotationMilliDegrees === input\.rotationMilliDegrees/);
  assert.match(start, /evaluateCanonicalInnerKeepPlacement\(/);
  assert.ok(start.indexOf('if (prior !== null)') < start.indexOf('assertInnerKeepComponentActive(ctx)'));
  assert.ok(
    start.indexOf('if (prior !== null)')
      < start.indexOf('retainedPolicyDigest !== INNER_KEEP_POLICY_DIGEST'),
  );
  assert.ok(
    start.indexOf('retainedPolicyDigest !== INNER_KEEP_POLICY_DIGEST')
      < start.indexOf('reconcileOverdueProject('),
  );
  assert.ok(
    start.indexOf('retainedLayoutDigest !== INNER_KEEP_LAYOUT_DIGEST')
      < start.indexOf('reconcileOverdueProject('),
  );
  assert.match(start, /targetLevel = existing\.completedLevel \+ 1/);
  assert.match(start, /input\.expectedTargetLevel !== targetLevel/);
  assert.match(start, /retainedProjectRevision !== currentProjectRevision/);
  assert.match(start, /canonicalInnerKeepCost\([\s\S]*completedLevels\(buildings\)/);
  assert.match(start, /settleAllWorkerAssignmentsForFid\(ctx, input\.fid, ctx\.timestamp\.microsSinceUnixEpoch\)/);
  assert.ok(
    start.indexOf("fail('INNER_KEEP_STATE_CHANGED')")
      < start.indexOf('settleAllWorkerAssignmentsForFid('),
  );
  assert.match(start, /resource\.food - cost\.effectiveCost\.food/);
  assert.match(start, /ScheduleAt\.time\(project\.completesAtMicros\)/);
  assert.equal((start.match(/castleInnerBuildReceiptV1\.insert\(/g) ?? []).length, 1);
  assert.equal((start.match(/castleInnerConstructionScheduleV1\.insert\(/g) ?? []).length, 1);
  assert.doesNotMatch(start, /markAccountV1\.(?:insert|update|delete)/);
});

test('one private Builder enforces single-flight construction and durable deactivation history', () => {
  const authority = source('../src/innerKeepAuthority.ts');
  const builderAuthority = source('../src/innerKeepBuilderAuthority.ts');
  const founding = source('../src/foundingAuthority.ts');
  const start = section(
    authority,
    'export function startInnerKeepProject',
    '/** Exact schedule completion',
  );
  const graph = section(
    authority,
    'function assertBuilderProjectGraph',
    'function deleteSchedulesForBuilding',
  );
  const activation = section(
    authority,
    'export function activateInnerKeep',
    'export function deactivateInnerKeep',
  );

  assert.match(start, /INNER_KEEP_BUILDER_BUSY/);
  assert.match(graph, /constructing\.length > 1/);
  assert.match(builderAuthority, /innerKeepLifecycleRequiresBuilders\(componentLifecycle\(ctx\)\)/);
  assert.match(builderAuthority, /activeBuildingKey: undefined,[\s\S]*busyUntilMicros: undefined,[\s\S]*revision: 0n/);
  assert.match(founding, /insertInnerKeepBuilderForNewFounderIfEverActivated\(ctx, castle\)/);
  assert.match(founding, /assertInnerKeepBuilderForExistingFounder\(ctx, existingCastle\)/);
  assert.match(activation, /activatedAt: layout\.activatedAt \?\? ctx\.timestamp/);
});

test('scheduled completion validates exact revision and target before clearing Builder', () => {
  const authority = source('../src/innerKeepAuthority.ts');
  const exactSchedule = section(
    authority,
    'function scheduleMatchesBuilding',
    'function buildingRowIsConsistent',
  );
  const consistency = section(
    authority,
    'function buildingRowIsConsistent',
    'function builderForCastle',
  );
  const schedule = section(
    authority,
    'export function runInnerKeepConstructionSchedule',
    'export type MyInnerKeepState',
  );

  assert.match(exactSchedule, /schedule\.scheduledAt\.tag === 'Time'/);
  assert.match(exactSchedule, /scheduledAtMicros === building\.completesAtMicros/);
  assert.match(exactSchedule, /schedule\.buildingKey === building\.buildingKey/);
  assert.match(exactSchedule, /schedule\.expectedRevision === building\.revision/);
  assert.match(exactSchedule, /schedule\.expectedTargetLevel === building\.targetLevel/);
  assert.equal((schedule.match(/scheduleMatchesBuilding\(/g) ?? []).length, 2);
  assert.match(schedule, /builder\.activeBuildingKey !== building\.buildingKey/);
  assert.match(schedule, /completeProject\(ctx, castle, builder, building, ctx\.timestamp\.microsSinceUnixEpoch\)/);
  assert.match(
    consistency,
    /row\.completesAtMicros - row\.startedAtMicros !== levelPolicy\.durationMicros/,
  );

  const completion = section(authority, 'function completeProject', 'function reconcileOverdueProject');
  assert.match(completion, /if \(now < building\.completesAtMicros\) fail\('INNER_KEEP_COMPLETION_EARLY'\)/);
  assert.match(completion, /completedLevel: building\.targetLevel/);
  assert.match(completion, /phase: 'complete'/);
  assert.match(completion, /activeBuildingKey: undefined/);
  assert.match(completion, /busyUntilMicros: undefined/);
  assert.match(completion, /deleteSchedulesForBuilding/);
  assert.ok(
    completion.indexOf('beforeWrite?.()')
      < completion.indexOf('deleteSchedulesForBuilding(ctx, building.buildingKey)'),
  );
});

test('zero-input entry upgrades to the full gate only immediately before an overdue write', () => {
  const reducers = source('../src/reducers/innerKeep.ts');
  const authority = source('../src/innerKeepAuthority.ts');
  const entry = section(
    reducers,
    'export const getMyInnerKeepStateV1',
    'export const getMyInnerKeepRequestStatusV1',
  );
  const synchronization = section(
    authority,
    'export function synchronizeMyInnerKeepEntry',
    'function completedLevels',
  );
  const errorMapping = section(
    authority,
    'export function innerKeepEntryErrorCode',
  );

  assert.match(entry, /warpkeep\.procedure\([\s\S]*ctx => ctx\.withTx\(tx =>/);
  assert.doesNotMatch(entry, /\{\s*(?:fid|castleId|scheduleId|requestKey)\s*:/);
  assert.match(entry, /const read = requireGameplayReadPlayerV1\(tx\)/);
  assert.match(
    entry,
    /requireSameInnerKeepMutationAuthority\(read, requireGameplayPlayerV1\(tx\)\)/,
  );
  const readGateIndex = entry.indexOf('const read = requireGameplayReadPlayerV1(tx)');
  const synchronizationIndex = entry.indexOf('synchronizeMyInnerKeepEntry(tx, castle, () =>');
  const fullGateIndex = entry.indexOf('requireGameplayPlayerV1(tx)', synchronizationIndex);
  const guardCloseIndex = entry.indexOf('});', fullGateIndex);
  const projectionIndex = entry.indexOf('projectMyInnerKeepStateForIndexedReadV1(tx, read)');
  assert.ok(readGateIndex >= 0);
  assert.ok(synchronizationIndex > readGateIndex);
  assert.ok(fullGateIndex > synchronizationIndex);
  assert.ok(guardCloseIndex > fullGateIndex);
  assert.ok(projectionIndex > guardCloseIndex);
  assert.equal(entry.indexOf('requireGameplayPlayerV1(tx)'), fullGateIndex);
  assert.match(entry, /senderInnerKeepEntryError\(error\)/);
  assert.match(synchronization, /if \(!catalog\.exact \|\| catalog\.layout\?\.active !== true\) return/);
  assert.match(synchronization, /assertInnerKeepComponentActive\(ctx\)/);
  assert.match(
    synchronization,
    /reconcileOverdueProject\([\s\S]*ctx\.timestamp\.microsSinceUnixEpoch,[\s\S]*beforeOverdueWrite/,
  );
  assert.match(errorMapping, /'INNER_KEEP_STATE_INTEGRITY'/);
});

test('overdue mutation rebinds the exact indexed caller, castle, and resource authority', () => {
  const reducers = source('../src/reducers/innerKeep.ts');
  const rebind = section(
    reducers,
    'function requireSameInnerKeepMutationAuthority',
    'export const getMyInnerKeepStateV1',
  );
  assert.match(rebind, /mutation\.claims\.fid !== read\.claims\.fid/);
  for (const field of ['castleId', 'ownerFid', 'tileKey', 'q', 'r', 'level', 'name']) {
    assert.match(rebind, new RegExp(`mutationCastle\\.${field} !== readCastle\\.${field}`));
  }
  for (const field of [
    'fid',
    'castleId',
    'realmId',
    'food',
    'wood',
    'stone',
    'gold',
    'settledThroughMicros',
    'revision',
    'policyVersion',
  ]) {
    assert.match(rebind, new RegExp(`mutationAccount\\.${field} !== readAccount\\.${field}`));
  }
  assert.match(rebind, /mutation\.terrainKind !== read\.terrainKind/);
  assert.match(rebind, /mutation\.founderSource !== read\.founderSource/);
  assert.match(rebind, /throw new SenderError\('STATE_INTEGRITY'\)/);
});

test('aggregate inspection validates schedule time and both Builder-project directions', () => {
  const authority = source('../src/innerKeepAuthority.ts');
  const inspection = section(
    authority,
    'export function inspectInnerKeep',
    'export function innerKeepErrorCode',
  );
  assert.match(inspection, /scheduleMatchesBuilding\(schedule, building\)/);
  assert.match(inspection, /constructingForCastle\.length !== 1/);
  assert.match(inspection, /builder\?\.activeBuildingKey === building\.buildingKey/);
  assert.match(inspection, /building\.phase === 'constructing'[\s\S]*schedulesForBuilding\(ctx, building\.buildingKey\)\.length === 0/);
});

test('public bindings expose projections while Builder, receipt, and schedule stay private', () => {
  const bindings = new URL('../../src/spacetime/module_bindings/', import.meta.url);
  for (const publicTable of [
    'inner_keep_layout_v_1_table.ts',
    'inner_keep_slot_v_1_table.ts',
    'inner_keep_building_catalog_v_1_table.ts',
    'inner_keep_build_level_v_1_table.ts',
    'castle_inner_keep_building_v_1_table.ts',
  ]) assert.equal(existsSync(new URL(publicTable, bindings)), true);
  for (const privateTable of [
    'castle_inner_builder_v_1_table.ts',
    'castle_inner_build_receipt_v_1_table.ts',
    'castle_inner_construction_schedule_v_1_table.ts',
  ]) assert.equal(existsSync(new URL(privateTable, bindings)), false);

  const publicBuilding = readFileSync(
    new URL('castle_inner_keep_building_v_1_table.ts', bindings),
    'utf8',
  );
  const startReducer = readFileSync(
    new URL('inner_keep_start_project_v_1_reducer.ts', bindings),
    'utf8',
  );
  for (const generated of [publicBuilding, startReducer]) {
    assert.match(generated, /localXMicrounits: __t\.i64\(\)/);
    assert.match(generated, /localZMicrounits: __t\.i64\(\)/);
    assert.match(generated, /rotationMilliDegrees: __t\.u32\(\)/);
    assert.doesNotMatch(generated, /slot(?:Key|Id):/);
  }
});

test('admin transitions are separate, attested, counts-bound, and never activate during seed', () => {
  const reducers = source('../src/reducers/innerKeep.ts');
  const seed = section(
    reducers,
    'export const adminSeedInnerKeepCatalogV1',
    'export const adminPlanInnerKeepBuildersV1',
  );
  const backfill = section(
    reducers,
    'export const adminBackfillInnerKeepBuildersV1',
    'export const adminActivateInnerKeepV1',
  );
  const activate = section(
    reducers,
    'export const adminActivateInnerKeepV1',
    'export const adminDeactivateInnerKeepV1',
  );
  const deactivate = section(
    reducers,
    'export const adminDeactivateInnerKeepV1',
  );

  for (const body of [seed, backfill, activate, deactivate]) {
    assert.match(body, /requireAdmin\(ctx\)/);
    assert.match(body, /expected/i);
  }
  assert.match(seed, /requireStaticAttestation\(input\)/);
  assert.match(seed, /'active=false'/);
  assert.match(backfill, /'resources_unchanged=true'/);
  assert.match(backfill, /'workers_unchanged=true'/);
  assert.match(backfill, /'marks_unchanged=true'/);
  assert.match(activate, /clientArtifactDigest/);
  assert.match(activate, /moduleArtifactDigest/);
  assert.match(deactivate, /expectedCastleCount: t\.u32\(\)/);
  assert.match(deactivate, /expectedActiveProjects: t\.u32\(\)/);
  assert.match(deactivate, /const aggregate = inspectInnerKeep\(ctx\)/);
  assert.match(deactivate, /!aggregate\.active/);
  assert.match(deactivate, /aggregate\.castleRows !== BigInt\(input\.expectedCastleCount\)/);
  assert.match(deactivate, /aggregate\.activeProjects !== BigInt\(input\.expectedActiveProjects\)/);
  assert.ok(
    deactivate.indexOf('const aggregate = inspectInnerKeep(ctx)')
      < deactivate.indexOf('deactivateInnerKeep(ctx, input.capability)'),
  );
  assert.doesNotMatch(seed, /activateInnerKeep\(/);
  assert.doesNotMatch(backfill, /activateInnerKeep\(/);
});
