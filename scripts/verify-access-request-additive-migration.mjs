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
const v14FixturePath = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v14-schema/src/index.ts',
);
const v15FixturePath = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v15-schema/src/index.ts',
);
const v16FixturePath = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v16-schema/src/index.ts',
);
const v17FixturePath = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v17-schema/src/index.ts',
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

const [
  schema,
  v12Fixture,
  v13Fixture,
  v14Fixture,
  v15Fixture,
  v16Fixture,
  v17Fixture,
  proof,
  receipt,
] = await Promise.all([
  readFile(schemaPath, 'utf8'),
  readFile(v12FixturePath, 'utf8'),
  readFile(v13FixturePath, 'utf8'),
  readFile(v14FixturePath, 'utf8'),
  readFile(v15FixturePath, 'utf8'),
  readFile(v16FixturePath, 'utf8'),
  readFile(v17FixturePath, 'utf8'),
  readFile(proofPath, 'utf8'),
  readFile(receiptPath, 'utf8'),
]);

const v12Registrations = registrations(v12Fixture, 'const db = schema({');
const v13Registrations = registrations(v13Fixture, 'const db = schema({');
const v14Registrations = registrations(v14Fixture, 'const db = schema({');
const v15Registrations = registrations(v15Fixture, 'const db = schema({');
const v16Registrations = registrations(v16Fixture, 'const db = schema({');
const v17Registrations = registrations(v17Fixture, 'const db = schema({');
const candidateRegistrations = registrations(schema, 'const warpkeep = schema({');
assert.equal(v12Registrations.length, 53, 'v12 fixture must end at ref 52');
assert.deepEqual(v13Registrations.slice(0, 53), v12Registrations);
assert.deepEqual(v13Registrations.slice(53), ['accessRequestV1']);
assert.deepEqual(v14Registrations.slice(0, 54), v13Registrations);
assert.deepEqual(v14Registrations.slice(54), [
  'dailyMarkGrantV1',
  'dailyMarkScheduleV1',
]);
assert.deepEqual(v15Registrations.slice(0, 56), v14Registrations);
assert.deepEqual(v15Registrations.slice(56), [
  'innerKeepLayoutV1',
  'innerKeepSlotV1',
  'innerKeepBuildingCatalogV1',
  'innerKeepBuildLevelV1',
  'castleInnerKeepBuildingV1',
  'castleInnerBuilderV1',
  'castleInnerBuildReceiptV1',
  'castleInnerConstructionScheduleV1',
]);
assert.deepEqual(v16Registrations.slice(0, 64), v15Registrations);
assert.deepEqual(v16Registrations.slice(64), [
  'realmChatStatusV1',
  'realmChatChannelV1',
  'realmChatMessageV1',
  'realmChatRecentV1',
  'realmChatRateEventV1',
  'realmChatSendReceiptV1',
  'realmChatReportV1',
  'realmChatReportRateEventV1',
]);
assert.deepEqual(v17Registrations.slice(0, 72), v16Registrations);
assert.deepEqual(v17Registrations.slice(72), [
  'greaterRealmReleaseV1',
  'greaterRealmChunkV1',
  'greaterRealmNavigationComponentV1',
  'greaterRealmCellV1',
  'greaterRealmCastleSlotV1',
  'greaterRealmCastleClaimV1',
  'greaterRealmCellOccupancyV1',
  'greaterRealmResourceNodeV1',
  'greaterRealmActivationV1',
  'realmAtlasV1',
  'realmAtlasVisibleRegionV1',
  'realmWorkerSystemV2',
]);
assert.deepEqual(
  candidateRegistrations.slice(0, v17Registrations.length),
  v17Registrations,
  'candidate must preserve the complete exact v17 Greater Realm prefix',
);
assert.deepEqual(
  candidateRegistrations.slice(v17Registrations.length),
  [
    'productionPlayerCanaryBaselineV1',
    'productionPlayerCanaryApprovalRegistrationV1',
  ],
  'candidate must append only the two private production-player canary authority tables',
);

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
assert.match(proof, /function assertAdditiveV15Schema\(before, after\)/);
assert.match(proof, /assertAdditiveV15Schema\(emptyV14, emptyV15\)/);
assert.match(proof, /function assertAdditiveV16Schema\(before, after\)/);
assert.match(proof, /assertAdditiveV16Schema\(emptyV15, emptyV16\)/);
assert.match(proof, /function assertAdditiveV17Schema\(before, after\)/);
assert.match(proof, /assertAdditiveV17Schema\(emptyV16, emptyV17\)/);
assert.match(proof, /const additiveV17Tables = Object\.freeze\(\[\s*'greater_realm_release_v1'/);
assert.match(proof, /fixture_seed_greater_realm_sentinel_v17/);
assert.match(proof, /populatedGreaterRealmPredecessorV16Rows/);
assert.match(proof, /populatedGreaterRealmV17Rows/);
assert.match(proof, /deployedV12Tables[\s\S]*populatedWaterStoneV12Rows/);
assert.match(proof, /'access_request_v1',[\s\S]*\),\s*0n/);
assert.match(
  proof,
  /function accessRequestServiceClaims\(requestFid, requestOperation\)[\s\S]*request_operation: requestOperation/,
);

const v13PreservationStart = proof.indexOf(
  '// Prove the complete v13 suffix survives the v14 append while populated.',
);
const v13PreservationEnd = proof.indexOf(
  '// Populate both private v14 tables before the v15 append.',
  v13PreservationStart,
);
assert.ok(v13PreservationStart >= 0 && v13PreservationEnd > v13PreservationStart);
const v13Preservation = proof.slice(v13PreservationStart, v13PreservationEnd);
assert.match(v13Preservation, /fixture_seed_access_request_sentinel_v13/);
assert.match(
  v13Preservation,
  /const dailyMarksV13Rows = await tableRowDigests\([\s\S]*deployedV13Tables/,
);
assert.match(v13Preservation, /count\([\s\S]*'access_request_v1'\)[\s\S]*1n/);
assert.ok(
  (v13Preservation.match(/dailyMarksV13Rows/g) ?? []).length >= 4,
  'v13 request sentinel digest must survive upgrade, republish, and rejected downgrade',
);

const currentCensusStart = proof.indexOf(
  '// Read the preserved v13 applicant through the current complete production',
);
const currentCensusEnd = proof.indexOf(
  'await publish(\n      server,\n      owner.token,\n      currentCandidateInspectionFixture,\n      dailyMarksMigrationDatabase,',
  currentCensusStart,
);
assert.ok(currentCensusStart >= 0 && currentCensusEnd > currentCensusStart);
const currentCensus = proof.slice(currentCensusStart, currentCensusEnd);
assert.match(currentCensus, /const retainedAccessRequestFid = 991_201n/);
assert.match(currentCensus, /access_request_get_status_v1[\s\S]*status: 'not_requested'/);
assert.match(currentCensus, /admin_list_access_requests_v1/);
assert.match(currentCensus, /\[0,0,100,true\]/);
assert.match(currentCensus, /admissionState: 'missing'[\s\S]*requestState: 'resolved'/);
assert.match(currentCensus, /totalRequests: 1n[\s\S]*pendingRequests: 0n/);
assert.match(currentCensus, /access_request_submit_v1[\s\S]*500/);
assert.match(currentCensus, /ACCESS_REQUESTS_SEALED/);
assert.ok(
  (currentCensus.match(/admin_list_access_requests_v1/g) ?? []).length >= 2,
  'current census must read the retained applicant before and after the sealed submit',
);
assert.ok(
  (currentCensus.match(/access_request_get_status_v1/g) ?? []).length >= 2,
  'current status must read the retained applicant before and after the sealed submit',
);

const lifecycleStart = proof.indexOf('async function verifyAccessRequestHttpLifecycle(');
const lifecycleEnd = proof.indexOf('\nfunction parseExpeditionState(', lifecycleStart);
assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart);
const lifecycle = proof.slice(lifecycleStart, lifecycleEnd);
assert.match(
  lifecycle,
  /access_request_submit_v1[\s\S]*requestCredential\('submit'\)[\s\S]*500/,
);
assert.match(
  lifecycle,
  /The module instance encountered a fatal error: ACCESS_REQUESTS_SEALED/,
);
assert.equal((lifecycle.match(/access_request_submit_v1/g) ?? []).length, 1);
assert.equal((lifecycle.match(/access_request_get_status_v1/g) ?? []).length, 2);
assert.doesNotMatch(
  lifecycle,
  /submitConcurrentBatch|two-call concurrent|ten-call concurrent|fifty-call concurrent|second-FID concurrent/,
);
assert.match(
  lifecycle,
  /status:\s*'not_requested',[\s\S]*requestedAtMicros:\s*undefined/,
);
assert.match(lifecycle, /assert\.deepEqual\(finalStatus,\s*initial(?:Status)?\)/);
assert.match(lifecycle, /assert\.equal\(page\.totalRequests,\s*0n\)/);
assert.match(lifecycle, /assert\.equal\(page\.pendingRequests,\s*0n\)/);
assert.match(lifecycle, /assert\.deepEqual\(page\.entries,\s*\[\]\)/);
assert.match(lifecycle, /assert\.deepEqual\(admission, \['missing', 0\]\)/);

const invocation = proof.indexOf('await verifyAccessRequestHttpLifecycle(');
const finalOwnerReadEnd = proof.indexOf('await verifyResolverHttpLifecycle(', invocation);
assert.ok(invocation >= 0 && finalOwnerReadEnd > invocation);
const finalOwnerRead = proof.slice(invocation, finalOwnerReadEnd);
assert.match(finalOwnerRead, /currentCandidateInspectionFixture/);
assert.match(finalOwnerRead, /tableRowDigests\([\s\S]*deployedV12Tables/);
assert.match(finalOwnerRead, /'access_request_v1',\s*\),\s*0n/);
assert.match(
  finalOwnerRead,
  /access_request_v1 WHERE fid = \$\{syntheticMissingAccessRequestFid\}`[,]?\s*\)\),\s*0n/,
);
assert.match(
  finalOwnerRead,
  /access_request_v1 WHERE fid = \$\{syntheticSecondAccessRequestFid\}`[,]?\s*\)\),\s*0n/,
);
assert.match(
  finalOwnerRead,
  /allowed_fid WHERE fid = \$\{syntheticMissingAccessRequestFid\}`[,]?\s*\)\),\s*0n/,
);
assert.match(
  finalOwnerRead,
  /allowed_fid WHERE fid = \$\{syntheticSecondAccessRequestFid\}`[,]?\s*\)\),\s*0n/,
);

const resourceLifecycleStart = proof.indexOf(
  'async function verifyActualModuleResourceLifecycle(',
);
const resourceLifecycleEnd = proof.indexOf(
  '\nasync function verifyActualModuleExpeditionLifecycles(',
  resourceLifecycleStart,
);
assert.ok(resourceLifecycleStart >= 0 && resourceLifecycleEnd > resourceLifecycleStart);
const resourceLifecycle = proof.slice(resourceLifecycleStart, resourceLifecycleEnd);
assert.match(resourceLifecycle, /stage = 'grandfathered-founder-preservation'/);
assert.match(resourceLifecycle, /stage = 'sealed-current-admission-boundary'/);
assert.match(resourceLifecycle, /ADMISSIONS_SEALED/);
assert.match(
  proof,
  /const frozenLegacyMarksPolicyVersion = 'snap-current-linked-wallet-1to1-v1'/,
);
assert.ok(
  (resourceLifecycle.match(
    /expectedMarksPolicyVersion: frozenLegacyMarksPolicyVersion/g,
  ) ?? []).length >= 4,
  'grandfathered resource reads must preserve the frozen predecessor Marks policy',
);
assert.match(
  resourceLifecycle,
  /admin_(?:allow_fid|disable_fid|admit_founder_v1)[\s\S]*530/,
);
assert.doesNotMatch(
  proof,
  /stage = '(?:disabled-founder-access-request|founded-access-request-reset)'/,
);
assert.match(proof, /arguments_\.filter\(value => value === '--delete-data=never'\)\.length !== 1/);
assert.match(proof, /arguments_\.some\(value => value\.startsWith\('--delete-data='/);
assert.doesNotMatch(proof, /--delete-data=(?:always|on-conflict|if-required)/);

assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 18/);
assert.match(receipt, /v13_table_schema_sha256/);
assert.match(receipt, /v13TableSchemaDigest/);
assert.match(receipt, /v14_table_schema_sha256/);
assert.match(receipt, /v14TableSchemaDigest/);
assert.match(receipt, /v15_table_schema_sha256/);
assert.match(receipt, /v15TableSchemaDigest/);
assert.match(receipt, /v16_table_schema_sha256/);
assert.match(receipt, /v16TableSchemaDigest/);
assert.match(receipt, /v17_table_schema_sha256/);
assert.match(receipt, /current_candidate_table_schema_sha256/);
assert.match(receipt, /v17TableSchemaDigest/);
assert.match(receipt, /currentCandidateTableSchemaDigest/);

console.log(
  'access-request additive migration proof passed: exact v12 refs 0–52 preserved, '
  + 'private access_request_v1 remains the exact v13 ref 53 boundary, '
  + 'the reviewed v14 daily Marks, v15 Inner Keep, and v16 Chat suffixes remain frozen before the exact v17 Greater Realm extension, '
  + 'the two private production-player canary authority tables are its only candidate suffix, '
  + 'the historical v13 request sentinel remains byte-preserved and current-census readable, '
  + 'the current candidate rejects request and admission mutations while preserving grandfathered access, '
  + 'and every rehearsal remains deletion-disabled',
);
