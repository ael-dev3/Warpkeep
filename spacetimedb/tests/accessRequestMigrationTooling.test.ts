import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function registrations(text: string, marker: string): string[] {
  const start = text.indexOf(marker);
  const end = text.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start, `missing schema marker: ${marker}`);
  return text.slice(start + marker.length, end)
    .split(/[,\n]/)
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

test('v13 through v15 remain frozen prefixes before the v16 Realm Chat append', () => {
  const v12 = source('../migration-fixtures/additive-v12-schema/src/index.ts');
  const v13 = source('../migration-fixtures/additive-v13-schema/src/index.ts');
  const v14 = source('../migration-fixtures/additive-v14-schema/src/index.ts');
  const v15 = source('../migration-fixtures/additive-v15-schema/src/index.ts');
  const v16 = source('../migration-fixtures/additive-v16-schema/src/index.ts');
  const candidate = source('../src/schema.ts');
  const v12Tables = registrations(v12, 'const db = schema({');
  const v13Tables = registrations(v13, 'const db = schema({');
  const v14Tables = registrations(v14, 'const db = schema({');
  const v15Tables = registrations(v15, 'const db = schema({');
  const v16Tables = registrations(v16, 'const db = schema({');
  const candidateTables = registrations(candidate, 'const warpkeep = schema({');

  assert.equal(v12Tables.length, 53);
  assert.deepEqual(v13Tables.slice(0, 53), v12Tables);
  assert.deepEqual(candidateTables.slice(0, 54), v13Tables);
  assert.deepEqual(v13Tables.slice(53), ['accessRequestV1']);
  assert.deepEqual(v14Tables.slice(0, 54), v13Tables);
  assert.deepEqual(v14Tables.slice(54), ['dailyMarkGrantV1', 'dailyMarkScheduleV1']);
  assert.deepEqual(v15Tables.slice(0, 56), v14Tables);
  assert.deepEqual(v15Tables.slice(56), [
    'innerKeepLayoutV1',
    'innerKeepSlotV1',
    'innerKeepBuildingCatalogV1',
    'innerKeepBuildLevelV1',
    'castleInnerKeepBuildingV1',
    'castleInnerBuilderV1',
    'castleInnerBuildReceiptV1',
    'castleInnerConstructionScheduleV1',
  ]);
  assert.deepEqual(v16Tables.slice(0, 64), v15Tables);
  assert.deepEqual(v16Tables.slice(64), [
    'realmChatStatusV1',
    'realmChatChannelV1',
    'realmChatMessageV1',
    'realmChatRecentV1',
    'realmChatRateEventV1',
    'realmChatSendReceiptV1',
    'realmChatReportV1',
    'realmChatReportRateEventV1',
  ]);
  assert.deepEqual(candidateTables.slice(0, v16Tables.length), v16Tables);
  assert.match(v13, /const accessRequestV1 = table\(\{ name: 'access_request_v1' \}, \{/);
  assert.match(
    v13,
    /fid: t\.u64\(\)\.primaryKey\(\), requestCycle: t\.u64\(\), requestedAt: t\.timestamp\(\)/,
  );
  assert.doesNotMatch(
    v13.slice(v13.indexOf('const accessRequestV1 = table('), v13.indexOf('\nconst db = schema({')),
    /public:\s*true|status|approved|reviewed|note|source|updatedAt/i,
  );
});

test('general rehearsal retains v15 schema and row preservation inside v17', () => {
  const proof = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const receipt = source('../../scripts/spacetime-additive-migration-proof.mjs');
  const v13PreservationStart = proof.indexOf(
    '// Prove the complete v13 suffix survives the v14 append while populated.',
  );
  const v13PreservationEnd = proof.indexOf(
    '// Populate both private v14 tables before the v15 append.',
    v13PreservationStart,
  );
  const v13Preservation = proof.slice(v13PreservationStart, v13PreservationEnd);

  assert.match(proof, /spacetimedb\/migration-fixtures\/additive-v13-schema/);
  assert.match(proof, /function assertAdditiveV13Schema\(before, after\)/);
  assert.match(proof, /assertAdditiveV13Schema\(emptyV12, emptyV13\)/);
  assert.match(proof, /spacetimedb\/migration-fixtures\/additive-v14-schema/);
  assert.match(proof, /function assertAdditiveV14Schema\(before, after\)/);
  assert.match(proof, /assertAdditiveV14Schema\(emptyV13, emptyV14\)/);
  assert.match(proof, /spacetimedb\/migration-fixtures\/additive-v15-schema/);
  assert.match(proof, /function assertAdditiveV15Schema\(before, after\)/);
  assert.match(proof, /assertAdditiveV15Schema\(emptyV14, emptyV15\)/);
  assert.match(proof, /spacetimedb\/migration-fixtures\/additive-v16-schema/);
  assert.match(proof, /function assertAdditiveV16Schema\(before, after\)/);
  assert.match(proof, /assertAdditiveV16Schema\(emptyV15, emptyV16\)/);
  assert.match(proof, /tableRowDigests\([\s\S]*deployedV12Tables[\s\S]*populatedWaterStoneV12Rows/);
  assert.match(proof, /'access_request_v1',[\s\S]*\),\s*0n/);
  assert.ok(v13PreservationStart >= 0 && v13PreservationEnd > v13PreservationStart);
  assert.match(v13Preservation, /fixture_seed_access_request_sentinel_v13/);
  assert.match(
    v13Preservation,
    /const dailyMarksV13Rows = await tableRowDigests\([\s\S]*deployedV13Tables/,
  );
  assert.match(
    v13Preservation,
    /count\([\s\S]*'access_request_v1'\)[\s\S]*1n/,
  );
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
  assert.ok((currentCensus.match(/admin_list_access_requests_v1/g) ?? []).length >= 2);
  assert.ok((currentCensus.match(/access_request_get_status_v1/g) ?? []).length >= 2);
  assert.match(proof, /'--delete-data=never'/);
  assert.match(proof, /value\.startsWith\('--delete-data='/);
  assert.doesNotMatch(proof, /--delete-data=(?:always|on-conflict|if-required)/);

  assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 18/);
  assert.match(receipt, /const V13_TABLE_SCHEMA_RECEIPT_FIELD = 'v13_table_schema_sha256'/);
  assert.match(receipt, /v13TableSchemaDigest/);
  assert.match(receipt, /const V14_TABLE_SCHEMA_RECEIPT_FIELD = 'v14_table_schema_sha256'/);
  assert.match(receipt, /v14TableSchemaDigest/);
  assert.match(receipt, /const V15_TABLE_SCHEMA_RECEIPT_FIELD = 'v15_table_schema_sha256'/);
  assert.match(receipt, /v15TableSchemaDigest/);
  assert.match(receipt, /const V16_TABLE_SCHEMA_RECEIPT_FIELD = 'v16_table_schema_sha256'/);
  assert.match(receipt, /v16TableSchemaDigest/);
  assert.match(receipt, /const V17_TABLE_SCHEMA_RECEIPT_FIELD = 'v17_table_schema_sha256'/);
  assert.match(receipt, /'current_candidate_table_schema_sha256'/);
  assert.match(receipt, /v17TableSchemaDigest/);
  assert.match(receipt, /currentCandidateTableSchemaDigest/);
});

test('connected rehearsal seals current requests while preserving grandfathered admission', () => {
  const proof = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const lifecycleStart = proof.indexOf('async function verifyAccessRequestHttpLifecycle(');
  const lifecycleEnd = proof.indexOf('\nfunction parseExpeditionState(', lifecycleStart);
  const lifecycle = proof.slice(lifecycleStart, lifecycleEnd);
  const invocation = proof.indexOf('await verifyAccessRequestHttpLifecycle(');
  const finalOwnerRead = proof.slice(invocation, proof.indexOf(
    'await verifyResolverHttpLifecycle(',
    invocation,
  ));
  const resourceLifecycleStart = proof.indexOf(
    'async function verifyActualModuleResourceLifecycle(',
  );
  const resourceLifecycleEnd = proof.indexOf(
    '\nasync function verifyActualModuleExpeditionLifecycles(',
    resourceLifecycleStart,
  );
  const resourceLifecycle = proof.slice(resourceLifecycleStart, resourceLifecycleEnd);

  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart);
  assert.match(
    proof,
    /serviceClaims\(\s*'service:access-request-resolver',\s*\['warpkeep-access-request-resolver'\],\s*15,/,
  );
  assert.match(
    proof,
    /function accessRequestServiceClaims\(requestFid, requestOperation\)[\s\S]*request_operation: requestOperation/,
  );
  assert.match(
    lifecycle,
    /access_request_submit_v1[\s\S]*requestCredential\('submit'\)[\s\S]*500/,
  );
  assert.match(
    lifecycle,
    /The module instance encountered a fatal error: ACCESS_REQUESTS_SEALED/,
  );
  assert.match(
    lifecycle,
    /access_request_get_status_v1[\s\S]*requestCredential\('status'\)/,
  );
  assert.equal((lifecycle.match(/access_request_submit_v1/g) ?? []).length, 1);
  assert.equal((lifecycle.match(/access_request_get_status_v1/g) ?? []).length, 2);
  assert.doesNotMatch(lifecycle, /submitConcurrentBatch|two-call concurrent|ten-call concurrent|fifty-call concurrent|second-FID concurrent/);
  assert.match(
    lifecycle,
    /status:\s*'not_requested',[\s\S]*requestedAtMicros:\s*undefined/,
  );
  assert.match(lifecycle, /assert\.deepEqual\(finalStatus,\s*initial(?:Status)?\)/);
  assert.match(lifecycle, /admin_list_access_requests_v1[\s\S]*requestCredential\('status'\)[\s\S]*500/);
  assert.match(lifecycle, /get_alpha_backend_info[\s\S]*requestCredential\('status'\)[\s\S]*500/);
  assert.match(lifecycle, /get_my_resource_state_v1[\s\S]*requestCredential\('status'\)[\s\S]*500/);
  assert.match(lifecycle, /createEphemeralJwt\(privateKey, adminServiceClaims\(\)\)/);
  assert.match(lifecycle, /assert\.equal\(page\.totalRequests,\s*0n\)/);
  assert.match(lifecycle, /assert\.equal\(page\.pendingRequests,\s*0n\)/);
  assert.match(lifecycle, /assert\.deepEqual\(page\.entries,\s*\[\]\)/);
  assert.match(lifecycle, /auth_resolver_get_fid_admission_v2/);
  assert.match(lifecycle, /assert\.deepEqual\(admission, \['missing', 0\]\)/);
  assert.ok(
    resourceLifecycleStart >= 0 && resourceLifecycleEnd > resourceLifecycleStart,
  );
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
  );
  assert.match(
    resourceLifecycle,
    /admin_(?:allow_fid|disable_fid|admit_founder_v1)[\s\S]*530/,
  );
  assert.doesNotMatch(
    proof,
    /stage = '(?:disabled-founder-access-request|founded-access-request-reset)'/,
  );

  assert.ok(invocation >= 0);
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
});

test('dedicated Worker v11-to-v12 proof remains a separate frozen boundary', () => {
  const verifier = source('../../scripts/verify-castle-worker-additive-migration.mjs');
  assert.match(verifier, /additive-v11-schema/);
  assert.match(verifier, /additive-v12-schema/);
  assert.match(verifier, /previous\.length, 47/);
  assert.match(verifier, /candidate\.slice\(47\)/);
  assert.match(verifier, /refs 47–52 append-only/);
  assert.doesNotMatch(verifier, /additive-v13-schema|accessRequestV1/);
});

test('workspace metadata includes frozen v13 through v17 and current-candidate inspection fixtures', () => {
  assert.match(
    source('../migration-fixtures/additive-v13-schema/package.json'),
    /warpkeep-additive-v13-schema-migration-fixture/,
  );
  assert.match(
    source('../pnpm-lock.yaml'),
    /migration-fixtures\/additive-v13-schema:/,
  );
  assert.match(
    source('../migration-fixtures/additive-v14-schema/package.json'),
    /warpkeep-additive-v14-schema-migration-fixture/,
  );
  assert.match(
    source('../pnpm-lock.yaml'),
    /migration-fixtures\/additive-v14-schema:/,
  );
  assert.match(
    source('../migration-fixtures/additive-v15-schema/package.json'),
    /warpkeep-additive-v15-schema-migration-fixture/,
  );
  assert.match(
    source('../pnpm-lock.yaml'),
    /migration-fixtures\/additive-v15-schema:/,
  );
  assert.match(
    source('../migration-fixtures/additive-v16-schema/package.json'),
    /warpkeep-additive-v16-schema-migration-fixture/,
  );
  assert.match(
    source('../pnpm-lock.yaml'),
    /migration-fixtures\/additive-v16-schema:/,
  );
  assert.match(
    source('../migration-fixtures/additive-v17-schema/package.json'),
    /warpkeep-additive-v17-schema-migration-fixture/,
  );
  assert.match(
    source('../pnpm-lock.yaml'),
    /migration-fixtures\/additive-v17-schema:/,
  );
  assert.match(
    source('../migration-fixtures/current-candidate-inspection/package.json'),
    /warpkeep-current-candidate-inspection-migration-fixture/,
  );
  assert.match(
    source('../pnpm-lock.yaml'),
    /migration-fixtures\/current-candidate-inspection:/,
  );
  const packageJson = JSON.parse(source('../../package.json')) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.['stdb:build-current-candidate-inspection-fixture'],
    'spacetime build --module-path spacetimedb/migration-fixtures/current-candidate-inspection',
  );
  assert.match(
    source('../../.github/workflows/verify.yml'),
    /npm run stdb:build-current-candidate-inspection-fixture/,
  );
});
