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

const suffixRegistrations = [
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
] as const;

const suffixTables = [
  'greater_realm_release_v1',
  'greater_realm_chunk_v1',
  'greater_realm_navigation_component_v1',
  'greater_realm_cell_v1',
  'greater_realm_castle_slot_v1',
  'greater_realm_castle_claim_v1',
  'greater_realm_cell_occupancy_v1',
  'greater_realm_resource_node_v1',
  'greater_realm_activation_v1',
  'realm_atlas_v1',
  'realm_atlas_visible_region_v1',
  'realm_worker_system_v2',
] as const;

test('v17 is the exact frozen prefix before the private canary suffix', () => {
  const v16 = source('../migration-fixtures/additive-v16-schema/src/index.ts');
  const v17 = source('../migration-fixtures/additive-v17-schema/src/index.ts');
  const candidate = source('../src/schema.ts');
  const v16Tables = registrations(v16, 'const db = schema({');
  const v17Tables = registrations(v17, 'const db = schema({');
  const candidateTables = registrations(candidate, 'const warpkeep = schema({');

  assert.equal(v16Tables.length, 72);
  assert.equal(v17Tables.length, 84);
  assert.deepEqual(v17Tables.slice(0, 72), v16Tables);
  assert.deepEqual(v17Tables.slice(72), suffixRegistrations);
  assert.deepEqual(candidateTables.slice(0, v17Tables.length), v17Tables);
  assert.deepEqual(candidateTables.slice(v17Tables.length), [
    'productionPlayerCanaryBaselineV1',
    'productionPlayerCanaryApprovalRegistrationV1',
  ]);
});

test('v17 fixture freezes public visibility, composite indexes, and typed sentinels', () => {
  const fixture = source('../migration-fixtures/additive-v17-schema/src/index.ts');
  const candidate = source('../src/schema.ts');
  const publicTables = new Set([
    'greater_realm_cell_occupancy_v1',
    'realm_atlas_v1',
    'realm_atlas_visible_region_v1',
    'realm_worker_system_v2',
  ]);

  for (const table of suffixTables) {
    const marker = `name: '${table}'`;
    const start = fixture.indexOf(marker);
    assert.ok(start >= 0, `missing fixture table ${table}`);
    const declarationHead = fixture.slice(start, start + 220);
    if (publicTables.has(table)) assert.match(declarationHead, /public: true/);
    else assert.doesNotMatch(declarationHead, /public: true/);
  }

  const compositeIndexes = [
    ['byAtlasAndImportOrdinal', "columns: ['atlasId', 'importOrdinal']"],
    ['byAtlasAndReleaseOrdinal', "columns: ['atlasId', 'releaseOrdinal']"],
    ['byChunkAndReleaseOrdinal', "columns: ['chunkHandle', 'releaseOrdinal']"],
    ['byComponentAndRouteDepth', "columns: ['componentKey', 'routeDepth']"],
    ['byComponentAndResourceKind', "columns: ['componentKey', 'resourceKind']"],
  ] as const;
  for (const text of [fixture, candidate]) {
    for (const [accessor, columns] of compositeIndexes) {
      const index = text.indexOf(`accessor: '${accessor}'`);
      assert.ok(index >= 0, `missing ${accessor}`);
      assert.ok(text.slice(index, index + 220).includes(columns));
    }
  }

  const sentinel = fixture.slice(
    fixture.indexOf("name: 'fixture_seed_greater_realm_sentinel_v17'"),
    fixture.indexOf('\nexport default db;'),
  );
  assert.ok(sentinel.length > 0);
  for (const accessor of suffixRegistrations) {
    assert.match(sentinel, new RegExp(`ctx\\.db\\.${accessor}\\.insert`));
  }
});

test('connected proof binds all predecessor rows and keeps v17 publication fail closed', () => {
  const proof = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const receipt = source('../../scripts/spacetime-additive-migration-proof.mjs');
  const publisher = source('../../scripts/publish-spacetime-dev.mjs');

  assert.match(proof, /function assertDeployedV16TablesUnchanged\(before, after\)/);
  assert.match(proof, /function assertAdditiveV17Schema\(before, after\)/);
  assert.match(proof, /greater_realm_release_v1: 72/);
  assert.match(proof, /realm_worker_system_v2: 83/);
  assert.match(proof, /populatedGreaterRealmPredecessorV16Rows/);
  assert.match(proof, /fixture_seed_water_sentinel_v9/);
  assert.match(proof, /fixture_seed_inner_keep_sentinel_v15/);
  assert.match(proof, /fixture_seed_realm_chat_sentinel_v16/);
  assert.match(proof, /fixture_seed_greater_realm_sentinel_v17/);
  assert.match(proof, /populatedGreaterRealmV17Rows/);
  assert.match(proof, /populatedV17RowsBeforeRollback/);
  assert.match(proof, /additiveV16SchemaFixture,[\s\S]{0,120}emptyDatabase,[\s\S]{0,40}false/);
  assert.match(proof, /publishBuiltArtifact\([\s\S]{0,180}greaterRealmMigrationDatabase/);
  assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 17/);
  assert.match(receipt, /v17_table_schema_sha256/);
  assert.match(publisher, /function requireGreaterRealmV17ProductionPublishReady\(\)/);

  const lane = publisher.indexOf('export async function executeProtocolV15InactivePublicationLane(');
  const hardClose = publisher.indexOf('requireCurrentReviewOnlyProductionPublishReady();', lane);
  const publish = publisher.indexOf('await (dependencies.publishModule ?? publishModule)(', lane);
  assert.ok(lane >= 0 && hardClose > lane && publish > hardClose);
  assert.doesNotMatch(publisher, /admin_(?:import|activate|prepare|finalize)_greater_realm/);
});
