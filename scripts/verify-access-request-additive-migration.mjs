import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(repositoryRoot, 'spacetimedb/src/schema.ts');
const v12FixturePath = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v12-schema/src/index.ts',
);
const v13FixturePath = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v13-schema/src/index.ts',
);
const proofPath = resolve(
  repositoryRoot,
  'scripts/verify-spacetime-additive-migration.mjs',
);
const receiptPath = resolve(
  repositoryRoot,
  'scripts/spacetime-additive-migration-proof.mjs',
);

function registrations(source, marker) {
  const start = source.indexOf(marker);
  const end = source.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start, `missing schema marker: ${marker}`);
  return source.slice(start + marker.length, end)
    .split(/[,\n]/)
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

function tableDefinition(source, name) {
  const marker = `${name} = table(`;
  const start = source.indexOf(marker);
  const end = [source.indexOf('\n);', start), source.indexOf('\n});', start)]
    .filter(candidate => candidate > start)
    .sort((left, right) => left - right)[0] ?? -1;
  assert.ok(start >= 0 && end > start, `missing table: ${name}`);
  return source.slice(start, end);
}

const [schema, v12Fixture, v13Fixture, proof, receipt] = await Promise.all([
  readFile(schemaPath, 'utf8'),
  readFile(v12FixturePath, 'utf8'),
  readFile(v13FixturePath, 'utf8'),
  readFile(proofPath, 'utf8'),
  readFile(receiptPath, 'utf8'),
]);

const v12Registrations = registrations(v12Fixture, 'const db = schema({');
const v13Registrations = registrations(v13Fixture, 'const db = schema({');
const candidateRegistrations = registrations(schema, 'const warpkeep = schema({');
assert.equal(v12Registrations.length, 53, 'v12 fixture must end at ref 52');
assert.deepEqual(v13Registrations.slice(0, 53), v12Registrations);
assert.deepEqual(candidateRegistrations.slice(0, 53), v12Registrations);
assert.deepEqual(v13Registrations.slice(53), ['accessRequestV1']);
assert.deepEqual(candidateRegistrations.slice(0, 54), v13Registrations);
assert.deepEqual(candidateRegistrations.slice(54), [
  'dailyMarkGrantV1',
  'dailyMarkScheduleV1',
]);

const v13TailStart = v13Fixture.indexOf(
  '/** v13 private, append-only expression of interest in manual admission. */',
);
const v13SchemaStart = v13Fixture.indexOf('\nconst db = schema({', v13TailStart);
assert.ok(v13TailStart >= 0 && v13SchemaStart > v13TailStart);
const v13WithoutAccessRequestTable = (
  v13Fixture.slice(0, v13TailStart)
  + v13Fixture.slice(v13SchemaStart + 1)
).replace(
  '  workerAssignmentV1, workerNodeOccupationV1, workerCommandIdempotencyV1, workerAssignmentScheduleV1,\n'
    + '  accessRequestV1,\n',
  '  workerAssignmentV1, workerNodeOccupationV1, workerCommandIdempotencyV1, workerAssignmentScheduleV1,\n',
);
const v13SentinelStart = v13WithoutAccessRequestTable.indexOf(
  '/** Populates the v13 suffix before the v13 -> v14 preservation proof. */',
);
const v13SentinelEnd = v13WithoutAccessRequestTable.indexOf(
  '\nexport const runGoldExpeditionScheduleV1 = db.reducer(',
  v13SentinelStart,
);
assert.ok(v13SentinelStart >= 0 && v13SentinelEnd > v13SentinelStart);
const reconstructedV12Fixture = (
  v13WithoutAccessRequestTable.slice(0, v13SentinelStart)
  + v13WithoutAccessRequestTable.slice(v13SentinelEnd + 1)
);
assert.equal(
  reconstructedV12Fixture,
  v12Fixture,
  'v13 fixture changed content outside its appended table and isolated sentinel reducer',
);

for (const definition of [
  tableDefinition(schema, 'accessRequestV1'),
  tableDefinition(v13Fixture, 'accessRequestV1'),
]) {
  assert.match(definition, /name: 'access_request_v1'/);
  assert.match(definition, /fid: t\.u64\(\)\.primaryKey\(\)/);
  assert.match(definition, /requestCycle: t\.u64\(\)/);
  assert.match(definition, /requestedAt: t\.timestamp\(\)/);
  assert.doesNotMatch(
    definition,
    /public:\s*true|indexes:|status|approved|reviewed|note|source|updatedAt/i,
  );
}

assert.match(proof, /const additiveV13Tables = Object\.freeze\(\[\s*'access_request_v1'/);
assert.match(proof, /function assertAdditiveV13Schema\(before, after\)/);
assert.match(proof, /assertAdditiveV13Schema\(emptyV12, emptyV13\)/);
assert.match(proof, /deployedV12Tables[\s\S]*populatedWaterStoneV12Rows/);
assert.match(proof, /'access_request_v1',[\s\S]*\),\s*0n/);
assert.match(proof, /arguments_\.filter\(value => value === '--delete-data=never'\)\.length !== 1/);
assert.match(proof, /arguments_\.some\(value => value\.startsWith\('--delete-data='/);
assert.doesNotMatch(proof, /--delete-data=(?:always|on-conflict|if-required)/);

assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 14/);
assert.match(receipt, /v13_table_schema_sha256/);
assert.match(receipt, /v13TableSchemaDigest/);
assert.match(receipt, /v14_table_schema_sha256/);
assert.match(receipt, /v14TableSchemaDigest/);

console.log(
  'access-request additive migration proof passed: exact v12 refs 0–52 preserved, '
  + 'private access_request_v1 remains the exact v13 ref 53 boundary, '
  + 'the reviewed v14 daily Marks suffix is the only allowed extension, '
  + 'and the rehearsal remains deletion-disabled',
);
