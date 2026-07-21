import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function schemaRegistrations(text: string, marker: string): string[] {
  const start = text.indexOf(marker);
  const end = text.indexOf('\n);', start);
  assert.ok(start >= 0 && end > start);
  return text.slice(start + marker.length, end)
    .split(/[,\n]/)
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

function tableDefinition(text: string, name: string): string {
  const start = text.indexOf(`const ${name} = table(`);
  const end = text.indexOf('\n);', start);
  assert.ok(start >= 0 && end > start);
  return text.slice(start, end);
}

test('v12 fixture appends six generic-worker tables after the exact v11 prefix', () => {
  const v11 = source('../migration-fixtures/additive-v11-schema/src/index.ts');
  const v12 = source('../migration-fixtures/additive-v12-schema/src/index.ts');
  const v11Registrations = schemaRegistrations(v11, 'const db = schema({');
  const v12Registrations = schemaRegistrations(v12, 'const db = schema({');
  assert.equal(v11Registrations.length, 47);
  assert.deepEqual(v12Registrations.slice(0, 47), v11Registrations);
  assert.deepEqual(v12Registrations.slice(47), [
    'realmWorkerSystemV1',
    'castleWorkerV1',
    'workerAssignmentV1',
    'workerNodeOccupationV1',
    'workerCommandIdempotencyV1',
    'workerAssignmentScheduleV1',
  ]);
  assert.match(v12, /fixture_seed_generic_worker_sentinel_v12/);
  assert.match(source('../migration-fixtures/additive-v12-schema/package.json'), /additive-v12-schema/);
});

test('public generic-worker rows exclude private ownership and accrual fields', () => {
  const schema = source('../src/schema.ts');
  for (const name of ['realmWorkerSystemV1', 'castleWorkerV1', 'workerNodeOccupationV1', 'workerAssignmentScheduleV1']) {
    const definition = tableDefinition(schema, name);
    assert.match(definition, /public: true/);
    assert.doesNotMatch(definition, /\bfid\b|accruedAmount|materializedAmount|balance|requestKey|auth/i);
  }
  const assignment = tableDefinition(schema, 'workerAssignmentV1');
  const idempotency = tableDefinition(schema, 'workerCommandIdempotencyV1');
  assert.doesNotMatch(assignment, /public: true/);
  assert.doesNotMatch(idempotency, /public: true/);
  assert.match(assignment, /fid: t\.u64\(\)/);
  assert.match(assignment, /accruedAmount: t\.u64\(\)/);
  assert.match(idempotency, /requestKey: t\.string\(\)\.primaryKey\(\)/);
});

test('worker reducers are caller-bound and activation remains explicitly gated', () => {
  const reducers = source('../src/reducers/castleWorkers.ts');
  const authority = source('../src/castleWorkerAuthority.ts');
  assert.match(reducers, /name: 'dispatch_worker_v1'/);
  assert.match(reducers, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(reducers, /dispatchCastleWorker\(ctx, \{ fid: claims\.fid, castle/);
  assert.match(reducers, /name: 'recall_all_workers_v1'/);
  assert.match(reducers, /name: 'admin_plan_worker_roster_v1'/);
  assert.match(authority, /if \(row\.mode !== 'active'\) fail\('WORKER_SYSTEM_STAGED'\)/);
  assert.match(authority, /legacy\.expeditions !== 0n \|\| legacy\.occupations !== 0n \|\| legacy\.schedules !== 0n/);
  assert.match(authority, /workerNodeOccupationV1\.nodeKey\.delete\(occupation\.nodeKey\)/);
  assert.match(authority, /planCastleWorkerAccrual\(assignment, observedAtMicros\)/);
  assert.match(authority, /No[\s\S]{0,20}per-minute writes/);
});
