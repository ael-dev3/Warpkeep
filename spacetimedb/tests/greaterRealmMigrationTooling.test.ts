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

function tableDefinition(text: string, name: string): string {
  const exported = `export const ${name} = table(`;
  const local = `const ${name} = table(`;
  const start = text.indexOf(exported) >= 0 ? text.indexOf(exported) : text.indexOf(local);
  const end = text.indexOf('\n);', start);
  assert.ok(start >= 0 && end > start, `missing table definition: ${name}`);
  return text.slice(start, end + 3).replace(/^export /, '');
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
  const inspection = source('../migration-fixtures/current-candidate-inspection/src/index.ts');
  const candidate = source('../src/schema.ts');
  const v16Tables = registrations(v16, 'const db = schema({');
  const v17Tables = registrations(v17, 'const db = schema({');
  const inspectionTables = registrations(inspection, 'const db = schema({');
  const candidateTables = registrations(candidate, 'const warpkeep = schema({');

  assert.equal(v16Tables.length, 72);
  assert.equal(v17Tables.length, 84);
  assert.equal(inspectionTables.length, 86);
  assert.deepEqual(v17Tables.slice(0, 72), v16Tables);
  assert.deepEqual(v17Tables.slice(72), suffixRegistrations);
  assert.deepEqual(candidateTables.slice(0, v17Tables.length), v17Tables);
  assert.deepEqual(candidateTables.slice(v17Tables.length), [
    'productionPlayerCanaryBaselineV1',
    'productionPlayerCanaryApprovalRegistrationV1',
  ]);
  assert.deepEqual(inspectionTables, candidateTables);
  const canaryTableNames = [
    'productionPlayerCanaryBaselineV1',
    'productionPlayerCanaryApprovalRegistrationV1',
  ] as const;
  for (const name of canaryTableNames) {
    assert.equal(tableDefinition(inspection, name), tableDefinition(candidate, name));
    assert.doesNotMatch(tableDefinition(inspection, name), /public:\s*true/);
  }
  const inspectionWithoutCanaryDeclarations = canaryTableNames.reduce(
    (text, name) => text.replace(tableDefinition(inspection, name), ''),
    inspection,
  );
  for (const name of canaryTableNames) {
    assert.equal(
      inspectionWithoutCanaryDeclarations.match(new RegExp(`\\b${name}\\b`, 'g'))?.length,
      1,
      `${name} may appear outside its declaration only in the schema registration`,
    );
  }
  assert.doesNotMatch(inspection, /db\.(?:procedure|clientConnected|clientDisconnected)\s*\(/);
  assert.doesNotMatch(
    inspection,
    /db\.reducer\([^\n]*productionPlayerCanary(?:Baseline|ApprovalRegistration)V1/,
  );
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
  assert.match(proof, /function assertCurrentCandidateSchema\(before, after\)/);
  assert.match(proof, /spacetimedb\/migration-fixtures\/current-candidate-inspection/);
  assert.match(proof, /greater_realm_release_v1: 72/);
  assert.match(proof, /realm_worker_system_v2: 83/);
  assert.match(proof, /production_player_canary_baseline_v1: 84/);
  assert.match(proof, /production_player_canary_approval_registration_v1: 85/);
  assert.match(
    proof,
    /const provenV17TableSchemaDigest = projectedTableSchemaBoundaryDigest\(\s*emptyCandidateV17,\s*deployedV17Tables,/,
  );
  assert.match(
    proof,
    /projectedTableSchemaBoundaryDigest\(description, deployedV17Tables\),\s*provenV17TableSchemaDigest/,
  );
  assert.match(
    proof,
    /const provenCurrentCandidateTableSchemaDigest =\s*canonicalTableSchemaBoundaryDigest\(\s*emptyCandidateV17,\s*deployedCurrentCandidateTables,/,
  );
  assert.match(proof, /populatedGreaterRealmPredecessorV16Rows/);
  assert.match(proof, /fixture_seed_water_sentinel_v9/);
  assert.match(proof, /fixture_seed_inner_keep_sentinel_v15/);
  assert.match(proof, /fixture_seed_realm_chat_sentinel_v16/);
  assert.match(proof, /fixture_seed_greater_realm_sentinel_v17/);
  assert.match(proof, /populatedGreaterRealmV17Rows/);
  assert.match(proof, /populatedCurrentCandidateRowsBeforeRollback/);
  assert.match(proof, /additiveV17SchemaFixture,[\s\S]{0,120}emptyDatabase,[\s\S]{0,40}false/);
  assert.match(proof, /additiveV16SchemaFixture,[\s\S]{0,120}emptyDatabase,[\s\S]{0,40}false/);
  assert.match(proof, /publishBuiltArtifact\([\s\S]{0,180}greaterRealmMigrationDatabase/);
  assert.match(receipt, /ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 18/);
  assert.match(receipt, /v17_table_schema_sha256/);
  assert.match(receipt, /current_candidate_table_schema_sha256/);
  assert.match(publisher, /function requireGreaterRealmV17ProductionPublishReady\(\)/);

  const lane = publisher.indexOf('export async function executeProtocolV15InactivePublicationLane(');
  const hardClose = publisher.indexOf('requireCurrentReviewOnlyProductionPublishReady();', lane);
  const publish = publisher.indexOf('await (dependencies.publishModule ?? publishModule)(', lane);
  assert.ok(lane >= 0 && hardClose > lane && publish > hardClose);
  assert.doesNotMatch(publisher, /admin_(?:import|activate|prepare|finalize)_greater_realm/);
});
