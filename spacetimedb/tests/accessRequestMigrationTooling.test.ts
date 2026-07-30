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

test('v13 fixture is the exact frozen v12 prefix plus one private request table', () => {
  const v12 = source('../migration-fixtures/additive-v12-schema/src/index.ts');
  const v13 = source('../migration-fixtures/additive-v13-schema/src/index.ts');
  const candidate = source('../src/schema.ts');
  const v12Tables = registrations(v12, 'const db = schema({');
  const v13Tables = registrations(v13, 'const db = schema({');
  const candidateTables = registrations(candidate, 'const warpkeep = schema({');

  assert.equal(v12Tables.length, 53);
  assert.deepEqual(v13Tables.slice(0, 53), v12Tables);
  assert.deepEqual(candidateTables.slice(0, 53), v12Tables);
  assert.deepEqual(v13Tables.slice(53), ['accessRequestV1']);
  assert.deepEqual(candidateTables.slice(53), ['accessRequestV1']);
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

test('general rehearsal binds v13 schema and row preservation with deletion disabled', () => {
  const proof = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const receipt = source('../../scripts/spacetime-additive-migration-proof.mjs');

  assert.match(proof, /spacetimedb\/migration-fixtures\/additive-v13-schema/);
  assert.match(proof, /function assertAdditiveV13Schema\(before, after\)/);
  assert.match(proof, /assertAdditiveV13Schema\(emptyV12, emptyV13\)/);
  assert.match(proof, /tableRowDigests\([\s\S]*deployedV12Tables[\s\S]*populatedWaterStoneV12Rows/);
  assert.match(proof, /'access_request_v1',[\s\S]*\),\s*0n/);
  assert.match(proof, /'--delete-data=never'/);
  assert.match(proof, /value\.startsWith\('--delete-data='/);
  assert.doesNotMatch(proof, /--delete-data=(?:always|on-conflict|if-required)/);

  assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 13/);
  assert.match(receipt, /const V13_TABLE_SCHEMA_RECEIPT_FIELD = 'v13_table_schema_sha256'/);
  assert.match(receipt, /v13TableSchemaDigest/);
});

test('connected rehearsal contains the bounded private request lifecycle', () => {
  const proof = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const lifecycleStart = proof.indexOf('async function verifyAccessRequestHttpLifecycle(');
  const lifecycleEnd = proof.indexOf('\nfunction parseExpeditionState(', lifecycleStart);
  const lifecycle = proof.slice(lifecycleStart, lifecycleEnd);
  const invocation = proof.indexOf('await verifyAccessRequestHttpLifecycle(');
  const finalOwnerRead = proof.slice(invocation, proof.indexOf(
    'await verifyResolverHttpLifecycle(',
    invocation,
  ));

  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart);
  assert.match(
    proof,
    /serviceClaims\(\s*'service:access-request-resolver',\s*\['warpkeep-access-request-resolver'\],\s*15,/,
  );
  assert.match(lifecycle, /access_request_get_status_v1[\s\S]*access_request_submit_v1/);
  assert.equal((lifecycle.match(/access_request_submit_v1/g) ?? []).length, 2);
  assert.equal((lifecycle.match(/access_request_get_status_v1/g) ?? []).length, 2);
  assert.match(lifecycle, /assert\.deepEqual\(duplicate, submitted\)/);
  assert.match(lifecycle, /assert\.deepEqual\(finalStatus, submitted\)/);
  assert.match(lifecycle, /admin_list_access_requests_v1[\s\S]*requestCredential\(\)[\s\S]*500/);
  assert.match(lifecycle, /get_alpha_backend_info[\s\S]*requestCredential\(\)[\s\S]*500/);
  assert.match(lifecycle, /get_my_resource_state_v1[\s\S]*requestCredential\(\)[\s\S]*500/);
  assert.match(lifecycle, /createEphemeralJwt\(privateKey, adminServiceClaims\(\)\)/);
  assert.match(lifecycle, /admissionState: 'missing'/);
  assert.match(lifecycle, /auth_resolver_get_fid_admission_v2/);
  assert.match(lifecycle, /assert\.deepEqual\(admission, \['missing', 0\]\)/);
  assert.match(proof, /stage = 'disabled-founder-access-request'/);
  assert.match(proof, /admissionState: 'disabled'[\s\S]*requestState: 'pending'/);
  assert.match(proof, /Local disable changed permanent founder authority state/);
  assert.match(proof, /Disabled founder access request changed permanent founder authority state/);
  assert.match(proof, /status: 'already_admitted'[\s\S]*pendingRequests: 0n/);

  assert.ok(invocation >= 0);
  assert.match(finalOwnerRead, /additiveV13SchemaFixture/);
  assert.match(finalOwnerRead, /tableRowDigests\([\s\S]*deployedV12Tables/);
  assert.match(finalOwnerRead, /access_request_v1 WHERE fid = \$\{syntheticMissingAccessRequestFid\}/);
  assert.match(finalOwnerRead, /allowed_fid WHERE fid = \$\{syntheticMissingAccessRequestFid\}/);
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

test('workspace metadata includes the frozen v13 fixture', () => {
  assert.match(
    source('../migration-fixtures/additive-v13-schema/package.json'),
    /warpkeep-additive-v13-schema-migration-fixture/,
  );
  assert.match(
    source('../pnpm-lock.yaml'),
    /migration-fixtures\/additive-v13-schema:/,
  );
});
