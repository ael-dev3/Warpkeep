import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function registrations(text: string): string[] {
  const start = text.indexOf('const db = schema({');
  const end = text.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start);
  return text.slice(start + 'const db = schema({'.length, end)
    .split(',')
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

function section(text: string, startNeedle: string, endNeedle: string): string {
  const start = text.indexOf(startNeedle);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start);
  return text.slice(start, end);
}

test('the auth-neutral v11 fixture extends the exact v10 table prefix at ref 46', () => {
  const v10 = source('../migration-fixtures/additive-v10-schema/src/index.ts');
  const v11 = source('../migration-fixtures/additive-v11-schema/src/index.ts');
  const packageJson = source('../migration-fixtures/additive-v11-schema/package.json');
  const v10Registrations = registrations(v10);
  const v11Registrations = registrations(v11);

  assert.equal(v10Registrations.length, 46);
  assert.deepEqual(v11Registrations.slice(0, 46), v10Registrations);
  assert.equal(v11Registrations[46], 'realmWaterRevisionV1');
  assert.match(packageJson, /"name": "warpkeep-additive-v11-schema-migration-fixture"/);
  assert.match(v11, /name: 'realm_water_revision_v1', public: true/);
  assert.match(v11, /baseLayoutDigest: t\.string\(\)/);
  assert.match(v11, /lakeCellCount: t\.u32\(\)/);
  assert.match(v11, /riverWidthCells: t\.u32\(\)/);
  assert.match(v11, /navigationFogBoundaryDepthCells: t\.u32\(\)/);
  assert.match(v11, /activatedAt: t\.option\(t\.timestamp\(\)\)/);
  assert.doesNotMatch(v11, /requireAdmin|onConnect/);

  assert.equal(
    section(
      v11,
      'export const fixtureSeedStoneSentinelV10',
      '/** Typed v11 sentinel',
    ).trim(),
    section(
      v10,
      'export const fixtureSeedStoneSentinelV10',
      'const FIXTURE_RESOURCE_QUANTUM_MICROS',
    ).trim(),
  );
  assert.match(v11, /name: 'fixture_seed_water_revision_sentinel_v11'/);
});

test('the migration verifier proves v10 to v11 with populated state and no downgrade', () => {
  const verifier = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const receipt = source('../../scripts/spacetime-additive-migration-proof.mjs');

  assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 11/);
  assert.match(verifier, /spacetimedb\/migration-fixtures\/additive-v11-schema/);
  assert.match(verifier, /const additiveV11Tables = Object\.freeze\(\[\s*'realm_water_revision_v1'/);
  assert.match(verifier, /realm_water_revision_v1: 46/);
  assert.match(verifier, /function assertAdditiveV11Schema\(before, after\)/);
  assert.match(verifier, /assertDeployedV10TablesUnchanged\(before, after\)/);
  assert.match(verifier, /fixture_seed_stone_sentinel_v10/);
  assert.match(verifier, /fixture_seed_water_revision_sentinel_v11/);
  assert.match(verifier, /populatedWaterStoneV10Rows/);
  assert.match(verifier, /populatedWaterStoneV11Rows/);
  assert.match(verifier, /additiveV10SchemaFixture,[\s\S]{0,120}populatedWaterStoneMigrationDatabase,[\s\S]{0,40}false/);
  assert.match(verifier, /The immediate v11 -> v10 rollback must be refused/);
  assert.match(verifier, /deployedV11Tables/);
  assert.match(verifier, /populated v10 Water\/Stone fixtures remained preserved through v11/);
  assert.match(verifier, /stage = 'revision-base-precondition'/);
  assert.match(verifier, /stage = 'revision-inert-base-rejection'/);
  assert.match(verifier, /stage = 'revision-admin-denial'/);
  assert.match(verifier, /admin_inspect_genesis_water_revision_v_1/);
  assert.match(verifier, /admin_seed_genesis_water_revision_v1/);
  assert.match(verifier, /admin_activate_genesis_water_revision_v1/);
  assert.match(verifier, /revisionAuditBaseline \+ 2n/);
  assert.match(verifier, /waterStateDigests\(server, ownerToken, database\), activatedDigests/);

  const inspectionFixtures = [
    ...verifier.matchAll(/inspectionArtifactPath = join\((additiveV\d+SchemaFixture)/g),
  ].map(match => match[1]);
  assert.ok(inspectionFixtures.length >= 4);
  assert.deepEqual(
    new Set(inspectionFixtures),
    new Set(['additiveV11SchemaFixture']),
  );
});
