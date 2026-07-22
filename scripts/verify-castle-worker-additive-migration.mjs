import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(root, 'spacetimedb/src/schema.ts');
const previousFixturePath = resolve(root, 'spacetimedb/migration-fixtures/additive-v11-schema/src/index.ts');
const fixturePath = resolve(root, 'spacetimedb/migration-fixtures/additive-v12-schema/src/index.ts');

function registrations(source, marker) {
  const start = source.indexOf(marker);
  const end = source.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start, `missing schema marker: ${marker}`);
  return source.slice(start + marker.length, end)
    .split(/[,\n]/)
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

function table(source, name) {
  const start = source.indexOf(`const ${name} = table(`);
  const end = source.indexOf('\n);', start);
  assert.ok(start >= 0 && end > start, `missing table: ${name}`);
  return source.slice(start, end);
}

const [schema, previousFixture, fixture] = await Promise.all([
  readFile(schemaPath, 'utf8'),
  readFile(previousFixturePath, 'utf8'),
  readFile(fixturePath, 'utf8'),
]);
const current = registrations(schema, 'const warpkeep = schema({');
const previous = registrations(previousFixture, 'const db = schema({');
const candidate = registrations(fixture, 'const db = schema({');
assert.equal(previous.length, 47, 'v11 fixture must end at ref 46');
assert.deepEqual(current.slice(0, 47), previous, 'current schema changed before the v12 suffix');
assert.deepEqual(candidate.slice(0, 47), previous, 'v12 fixture changed the deployed prefix');
assert.deepEqual(candidate.slice(47), [
  'realmWorkerSystemV1',
  'castleWorkerV1',
  'workerAssignmentV1',
  'workerNodeOccupationV1',
  'workerCommandIdempotencyV1',
  'workerAssignmentScheduleV1',
]);
assert.deepEqual(current.slice(47), candidate.slice(47), 'module and fixture suffix differ');
for (const name of ['realmWorkerSystemV1', 'castleWorkerV1', 'workerNodeOccupationV1']) {
  const definition = table(schema, name);
  assert.match(definition, /public: true/);
  assert.doesNotMatch(definition, /\bfid\b|assignmentId|accruedAmount|materializedAmount|balance|requestKey|auth/i);
}
for (const name of ['workerAssignmentV1', 'workerCommandIdempotencyV1', 'workerAssignmentScheduleV1']) {
  assert.doesNotMatch(table(schema, name), /public: true/);
}
assert.match(fixture, /fixture_seed_generic_worker_sentinel_v12/);
console.log('generic worker additive migration proof passed: refs 0–46 preserved, refs 47–52 append-only, populated fixture present, assignment correlation remains private');
