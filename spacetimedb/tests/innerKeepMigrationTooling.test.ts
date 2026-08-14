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

const innerKeepRegistrations = [
  'innerKeepLayoutV1',
  'innerKeepSlotV1',
  'innerKeepBuildingCatalogV1',
  'innerKeepBuildLevelV1',
  'castleInnerKeepBuildingV1',
  'castleInnerBuilderV1',
  'castleInnerBuildReceiptV1',
  'castleInnerConstructionScheduleV1',
] as const;

const realmChatRegistrations = [
  'realmChatStatusV1',
  'realmChatChannelV1',
  'realmChatMessageV1',
  'realmChatRecentV1',
  'realmChatRateEventV1',
  'realmChatSendReceiptV1',
  'realmChatReportV1',
  'realmChatReportRateEventV1',
] as const;

test('v15 remains the exact v14 prefix plus Inner Keep refs 56-63 before v16', () => {
  const v14 = source('../migration-fixtures/additive-v14-schema/src/index.ts');
  const v15 = source('../migration-fixtures/additive-v15-schema/src/index.ts');
  const v16 = source('../migration-fixtures/additive-v16-schema/src/index.ts');
  const candidate = source('../src/schema.ts');
  const v14Tables = registrations(v14, 'const db = schema({');
  const v15Tables = registrations(v15, 'const db = schema({');
  const v16Tables = registrations(v16, 'const db = schema({');
  const candidateTables = registrations(candidate, 'const warpkeep = schema({');

  assert.equal(v14Tables.length, 56);
  assert.equal(v15Tables.length, 64);
  assert.equal(v16Tables.length, 72);
  assert.deepEqual(v15Tables.slice(0, 56), v14Tables);
  assert.deepEqual(v15Tables.slice(56), innerKeepRegistrations);
  assert.deepEqual(v16Tables.slice(0, 64), v15Tables);
  assert.deepEqual(v16Tables.slice(64), realmChatRegistrations);
  assert.deepEqual(candidateTables.slice(0, v16Tables.length), v16Tables);
});

test('v15 fixture pins public projection, private authority, and an empty compatibility slot table', () => {
  const fixture = source('../migration-fixtures/additive-v15-schema/src/index.ts');
  const packageJson = source('../migration-fixtures/additive-v15-schema/package.json');
  const lock = source('../pnpm-lock.yaml');

  for (const name of [
    'inner_keep_layout_v1',
    'inner_keep_slot_v1',
    'inner_keep_building_catalog_v1',
    'inner_keep_build_level_v1',
    'castle_inner_keep_building_v1',
  ]) {
    assert.match(fixture, new RegExp(`name: '${name}'[^\n]*public: true`));
  }
  for (const name of [
    'castle_inner_builder_v1',
    'castle_inner_build_receipt_v1',
    'castle_inner_construction_schedule_v_1',
  ]) {
    const declaration = fixture.slice(
      fixture.indexOf(`name: '${name}'`) - 80,
      fixture.indexOf(`name: '${name}'`) + 240,
    );
    assert.doesNotMatch(declaration, /public:\s*true/);
  }
  assert.match(fixture, /name: 'fixture_seed_inner_keep_sentinel_v15'/);
  for (const accessor of innerKeepRegistrations) {
    if (accessor === 'innerKeepSlotV1') continue;
    assert.match(
      fixture.slice(fixture.indexOf("name: 'fixture_seed_inner_keep_sentinel_v15'")),
      new RegExp(`ctx\\.db\\.${accessor}\\.insert`),
    );
  }
  const buildingDeclaration = fixture.slice(
    fixture.indexOf('const castleInnerKeepBuildingV1'),
    fixture.indexOf('/** v15 private Builder'),
  );
  const receiptDeclaration = fixture.slice(
    fixture.indexOf('const castleInnerBuildReceiptV1'),
    fixture.indexOf('const castleInnerConstructionScheduleV1'),
  );
  for (const declaration of [buildingDeclaration, receiptDeclaration]) {
    assert.match(declaration, /localXMicrounits: t\.i64\(\)/);
    assert.match(declaration, /localZMicrounits: t\.i64\(\)/);
    assert.match(declaration, /rotationMilliDegrees: t\.u32\(\)/);
    assert.doesNotMatch(declaration, /slot(?:Key|Id):/);
  }
  const sentinel = fixture.slice(
    fixture.indexOf("name: 'fixture_seed_inner_keep_sentinel_v15'"),
    fixture.indexOf('/** Retain the v13 populated-suffix fixture reducer'),
  );
  assert.match(sentinel, /slotCount: 0, mediumSlotCount: 0, largeSlotCount: 0/);
  assert.doesNotMatch(sentinel, /ctx\.db\.innerKeepSlotV1\.insert/);
  assert.match(packageJson, /warpkeep-additive-v15-schema-migration-fixture/);
  assert.match(lock, /migration-fixtures\/additive-v15-schema:/);
});

test('general rehearsal preserves the populated v14 to v15 boundary inside v17', () => {
  const verifier = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const receipt = source('../../scripts/spacetime-additive-migration-proof.mjs');

  assert.match(verifier, /function assertAdditiveV15Schema\(before, after\)/);
  assert.match(verifier, /assertAdditiveV15Schema\(emptyV14, emptyV15\)/);
  assert.match(verifier, /fixture_seed_daily_marks_sentinel_v14/);
  assert.match(verifier, /dailyMarksPopulatedV14Rows/);
  assert.match(verifier, /fixture_seed_inner_keep_sentinel_v15/);
  assert.match(verifier, /dailyMarksPopulatedV15Rows/);
  assert.match(verifier, /additiveV14SchemaFixture,[\s\S]{0,120}dailyMarksMigrationDatabase,[\s\S]{0,40}false/);
  assert.match(verifier, /The v15 boundary must refuse its own predecessor/);
  assert.match(verifier, /inner_keep_layout_v1: 56/);
  assert.match(verifier, /castle_inner_construction_schedule_v_1: 63/);
  assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 18/);
  assert.match(receipt, /const V15_TABLE_SCHEMA_RECEIPT_FIELD = 'v15_table_schema_sha256'/);
  assert.match(receipt, /v15TableSchemaDigest/);
  assert.match(receipt, /const V16_TABLE_SCHEMA_RECEIPT_FIELD = 'v16_table_schema_sha256'/);
  assert.match(receipt, /v16TableSchemaDigest/);
  assert.match(receipt, /const V17_TABLE_SCHEMA_RECEIPT_FIELD = 'v17_table_schema_sha256'/);
  assert.match(receipt, /'current_candidate_table_schema_sha256'/);
  assert.match(receipt, /v17TableSchemaDigest/);
  assert.match(receipt, /currentCandidateTableSchemaDigest/);
});
