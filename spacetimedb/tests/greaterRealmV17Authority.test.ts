import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canonicalGreaterRealmVerificationLine,
  greaterRealmAuthorityErrorCode,
  requireGreaterRealmV17ActivationGate,
  requireGreaterRealmV17ImportGate,
} from '../src/greaterRealmV17Authority';
import {
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
} from '../src/greaterRealmV17Policy';
import { attestCurrentGreaterRealmGateModeForTest } from './greaterRealmGateModeTestPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, startNeedle: string, endNeedle?: string): string {
  const start = text.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section: ${startNeedle}`);
  if (endNeedle === undefined) return text.slice(start);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing source section terminator: ${endNeedle}`);
  return text.slice(start, end);
}

function registrations(text: string, marker: string): string[] {
  return section(text, marker, '\n});')
    .split(/[\n,]/)
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

const greaterRealmSuffix = [
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

test('production import and activation authority follow the exact reviewed compile mode', () => {
  attestCurrentGreaterRealmGateModeForTest(
    GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
    GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  );
  for (const [allowed, gate] of [
    [GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED, requireGreaterRealmV17ImportGate],
    [GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED, requireGreaterRealmV17ActivationGate],
  ] as const) {
    if (allowed) assert.doesNotThrow(gate);
    else {
      assert.throws(
        gate,
        error => greaterRealmAuthorityErrorCode(error)?.endsWith('_NOT_COMPILED') === true,
      );
    }
  }
  assert.equal(
    canonicalGreaterRealmVerificationLine('cell', { z: 2, a: 'one' }),
    'cell|a="one"|z=2',
  );
});

test('v17 appends refs 72-83 after the byte-frozen v16 prefix', () => {
  const current = source('../src/schema.ts');
  const v16 = source('../migration-fixtures/additive-v16-schema/src/index.ts');
  const v17 = source('../migration-fixtures/additive-v17-schema/src/index.ts');
  const currentTables = registrations(current, 'const warpkeep = schema({');
  const v16Tables = registrations(v16, 'const db = schema({');
  const fixtureTables = registrations(v17, 'const db = schema({');

  assert.equal(v16Tables.length, 72);
  assert.equal(currentTables.length, 84);
  assert.equal(fixtureTables.length, 84);
  assert.deepEqual(currentTables.slice(0, 72), v16Tables);
  assert.deepEqual(fixtureTables.slice(0, 72), v16Tables);
  assert.deepEqual(currentTables.slice(72), greaterRealmSuffix);
  assert.deepEqual(fixtureTables.slice(72), greaterRealmSuffix);
  const sentinel = section(v17, 'export const fixtureSeedGreaterRealmSentinelV17');
  for (const tableName of greaterRealmSuffix) {
    assert.match(sentinel, new RegExp(`ctx\\.db\\.${tableName}\\.insert`));
  }
});

test('only the four approved v17 projections are public tables', () => {
  const schema = source('../src/schema.ts');
  const publicTables = new Set([
    'greaterRealmCellOccupancyV1',
    'realmAtlasV1',
    'realmAtlasVisibleRegionV1',
    'realmWorkerSystemV2',
  ]);
  for (const name of greaterRealmSuffix) {
    const definition = section(schema, `export const ${name} = table(`, '\n);');
    if (publicTables.has(name)) assert.match(definition, /public: true/);
    else assert.doesNotMatch(definition, /public: true/);
  }
});

test('admin write ABI exposes only the atomic authenticated chunk importer', () => {
  const reducer = source('../src/reducers/greaterRealm.ts');
  assert.match(reducer, /name: 'admin_import_greater_realm_chunk_v1'/);
  assert.doesNotMatch(
    reducer,
    /name: 'admin_import_greater_realm_(?:chunks|cells|slots|resources)_v1'/,
  );
  const chunkImport = section(
    reducer,
    'export const adminImportGreaterRealmChunkV1',
    'export const adminBeginGreaterRealmVerificationV1',
  );
  assert.match(chunkImport, /payloadSha256: t\.string\(\)/);
  assert.match(chunkImport, /payloadJson: t\.string\(\)/);
  assert.match(chunkImport, /importGreaterRealmChunkPayloadV1/);
});

test('release, chunk, and component tamper boundaries use canonical SHA-256', () => {
  const authority = source('../src/greaterRealmV17Authority.ts');
  const chunk = section(
    authority,
    'export function importGreaterRealmChunkPayloadV1',
    'const CELL_IMPORT_KEYS',
  );
  assert.match(chunk, /const payloadBytes = requireGreaterRealmChunkPayloadBytesV1\(payloadJson\)/);
  assert.match(chunk, /sha256Hex\(payloadBytes\)/);
  assert.match(chunk, /validateImportBatches/);
  assert.match(chunk, /cellsSha256/);
  assert.match(chunk, /resourceNodesSha256/);
  assert.match(chunk, /coreCellCount: cells\.length/);
  assert.match(chunk, /chunkCoordKey: `B:\$\{binQ\}:\$\{binR\}`/);

  const begin = section(
    authority,
    'export function beginGreaterRealmVerificationV1',
    'const AXIAL_DIRECTIONS',
  );
  assert.match(begin, /runtimeComponentManifest\(release\)/);
  assert.match(begin, /runtimeRegionManifest\(release\)/);
  assert.match(begin, /computedReleaseSha256 !== release\.expectedReleaseSha256/);
  assert.doesNotMatch(authority, /\bfnv\b/i);
  assert.match(authority, /componentSha256/);
  assert.match(authority, /GREATER_REALM_COMPONENT_SHA_MISMATCH/);
  assert.match(authority, /GREATER_REALM_COMPONENT_REGION_RESOURCE_MARGIN_INVALID/);
});

test('stage retry is constant-time over a stored canonical header checkpoint', () => {
  const authority = source('../src/greaterRealmV17Authority.ts');
  const stage = section(
    authority,
    'export function stageGreaterRealmReleaseV1',
    'const COMPONENT_IMPORT_KEYS',
  );
  assert.match(stage, /const releaseHeaderSha256 = sha256Hex/);
  assert.match(stage, /existing\.releaseHeaderSha256 !== releaseHeaderSha256/);
  assert.match(stage, /releaseHeaderSha256,/);
  assert.doesNotMatch(stage, /greaterRealmChunkV1|for\s*\(/);
});

test('verification transitions and component completion remain cursor-bounded', () => {
  const policy = source('../src/greaterRealmV17Policy.ts');
  const authority = source('../src/greaterRealmV17Authority.ts');
  assert.match(policy, /GREATER_REALM_MAX_COMPONENTS = 4096/);
  assert.match(policy, /GREATER_REALM_MAX_VERIFY_ROWS = 256/);
  const verify = section(
    authority,
    'export function verifyGreaterRealmBatchV1',
    'function assertLegacySlotSetExact',
  );
  assert.match(verify, /const end = Math\.min\(total, start \+ requestedRows\)/);
  assert.match(verify, /for \(let ordinal = start; ordinal < end; ordinal \+= 1\)/);
  assert.match(authority, /'component-finalize', 'complete'/);
  const finalize = section(
    authority,
    'export function finalizeGreaterRealmReleaseV1',
    'export function inspectGreaterRealmV17',
  );
  assert.doesNotMatch(finalize, /greaterRealmNavigationComponentV1\.iter/);
  assert.doesNotMatch(finalize, /realmAtlasV1\.insert|realmAtlasVisibleRegionV1\.insert|realmWorkerSystemV2\.insert/);
  assert.doesNotMatch(finalize, /workerPolicyVersion|rosterDigest/);
});

test('resource-location verification is O(1) and rejects split location blocks', () => {
  const authority = source('../src/greaterRealmV17Authority.ts');
  const block = section(
    authority,
    'function requireGreaterRealmResourceLocationBlock',
    'function verifyResource',
  );
  const verify = section(
    authority,
    'function verifyResource',
    'const VERIFY_PHASE_ORDER',
  );
  assert.match(verify, /releaseOrdinal\.find\(ordinal - 1\)/);
  assert.match(verify, /previous\.locationId\.localeCompare\(row\.locationId\) >= 0/);
  assert.match(verify, /previous\.cellKey === row\.cellKey/);
  assert.match(verify, /if \(firstResourceLocation\) requireGreaterRealmResourceLocationBlock/);
  assert.match(verify, /GREATER_REALM_RESOURCE_LOCATION_BLOCK_INVALID/);
  assert.match(block, /locationId\.filter\(row\.locationId\)/);
  assert.match(block, /locationCount > GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION/);
  assert.match(block, /lastOrdinal - firstOrdinal \+ 1 !== locationCount/);
  assert.match(block, /cellKey\.filter\(row\.cellKey\)/);
  assert.match(block, /GREATER_REALM_RESOURCE_KINDS\.length \* GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION/);
  assert.doesNotMatch(verify, /locationId\.filter\(/);
});

test('public read ABI is exact, revision-bound, and topology-minimized', () => {
  const reducer = source('../src/reducers/greaterRealm.ts');
  for (const wire of [
    'get_realm_atlas_bootstrap_v1',
    'get_realm_atlas_window_v1',
    'get_realm_atlas_chunk_v1',
    'get_realm_atlas_resource_locations_v1',
    'plan_realm_route_v1',
  ]) assert.match(reducer, new RegExp(`name: '${wire}'`));
  assert.doesNotMatch(reducer, /name: 'get_greater_realm_/);

  const cellProjection = section(
    reducer,
    "const greaterRealmCellProjectionV1 = t.object('GreaterRealmCellProjectionV1'",
    "const greaterRealmResourceLocationProjectionV1",
  );
  assert.doesNotMatch(cellProjection, /componentKey|atlasCoordKey|ridgeId|routeParentDirection|routeDepth/);
  const locationProjection = section(
    reducer,
    'const greaterRealmResourceLocationProjectionV1',
    'const greaterRealmChunkProjectionV1',
  );
  assert.match(locationProjection, /atlasQ: t\.i32\(\)/);
  assert.match(locationProjection, /atlasR: t\.i32\(\)/);
  assert.doesNotMatch(locationProjection, /nodeId|legacyCatalogId/);

  const window = section(
    reducer,
    'export const getRealmAtlasWindowV1',
    'export const getRealmAtlasChunkV1',
  );
  assert.match(window, /`B:\$\{centerQ \+ dq\}:\$\{centerR \+ dr\}`/);
  assert.match(window, /expectedRevision/);
  const route = section(reducer, 'export const planRealmRouteV1');
  assert.match(route, /originCellKey: t\.string\(\)/);
  assert.match(route, /destinationCellKey: t\.string\(\)/);
  assert.match(route, /destinationChain/);
  assert.match(route, /originLcaIndex/);
  assert.doesNotMatch(
    section(reducer, 'const greaterRealmRoutePageV1', 'type GreaterRealmReadContext'),
    /componentKey/,
  );
});

test('halted is read-only-readable across every atlas read while fresh dispatch stays active-only', () => {
  const reducer = source('../src/reducers/greaterRealm.ts');
  const readAuthority = source('../src/greaterRealmPublicReadAuthority.ts');
  assert.match(
    readAuthority,
    /!\['canary', 'active', 'halted'\]\.includes\(checkpoint\.phase\)/,
  );
  for (const [start, end] of [
    ['export const getRealmAtlasBootstrapV1', 'export const getRealmAtlasWindowV1'],
    ['export const getRealmAtlasWindowV1', 'export const getRealmAtlasChunkV1'],
    ['export const getRealmAtlasChunkV1', 'export const getRealmAtlasResourceLocationsV1'],
    ['export const getRealmAtlasResourceLocationsV1', 'export const planRealmRouteV1'],
  ] as const) {
    assert.match(
      section(reducer, start, end),
      /requireGreaterRealmPublicReadAuthorityV1\(tx\)/,
      start,
    );
  }
  assert.match(
    section(reducer, 'export const planRealmRouteV1'),
    /requireGreaterRealmPublicReadAuthorityV1\(tx\)/,
  );

  const worker = source('../src/greaterRealmWorkerAuthority.ts');
  const activeRoots = section(
    worker,
    'function requireActiveDispatchRoots',
    'export function resolveGreaterRealmWorkerDispatchTargetV2',
  );
  assert.match(activeRoots, /checkpoint\.phase !== 'active'/);
  assert.match(activeRoots, /release\.state !== 'active'/);
  assert.match(activeRoots, /atlas\.mode !== 'active'/);
  assert.doesNotMatch(activeRoots, /'halted'/);
});

test('every chunk LOD omits resource aggregates without constructing their map', () => {
  const reducer = source('../src/reducers/greaterRealm.ts');
  const chunk = section(
    reducer,
    'export const getRealmAtlasChunkV1',
    'export const getRealmAtlasResourceLocationsV1',
  );
  assert.match(chunk, /resourceLocations: \[\]/);
  assert.doesNotMatch(chunk, /payload\.resourceNodes|locationMap|nodeCount/);
});

test('generated bindings include projections and exclude every private v17 table', () => {
  const binding = (name: string) => new URL(
    `../../src/spacetime/module_bindings/${name}`,
    import.meta.url,
  );
  for (const name of [
    'greater_realm_cell_occupancy_v_1_table.ts',
    'realm_atlas_v_1_table.ts',
    'realm_atlas_visible_region_v_1_table.ts',
    'realm_worker_system_v_2_table.ts',
    'get_realm_atlas_bootstrap_v_1_procedure.ts',
    'get_realm_atlas_window_v_1_procedure.ts',
    'get_realm_atlas_chunk_v_1_procedure.ts',
    'get_realm_atlas_resource_locations_v_1_procedure.ts',
    'plan_realm_route_v_1_procedure.ts',
  ]) assert.equal(existsSync(binding(name)), true, `missing binding ${name}`);
  for (const name of [
    'greater_realm_release_v_1_table.ts',
    'greater_realm_chunk_v_1_table.ts',
    'greater_realm_navigation_component_v_1_table.ts',
    'greater_realm_cell_v_1_table.ts',
    'greater_realm_castle_slot_v_1_table.ts',
    'greater_realm_castle_claim_v_1_table.ts',
    'greater_realm_resource_node_v_1_table.ts',
    'greater_realm_activation_v_1_table.ts',
  ]) assert.equal(existsSync(binding(name)), false, `private binding leaked: ${name}`);
});

test('offline finalize keeps every public root absent until future canary activation', () => {
  const authority = source('../src/greaterRealmV17Authority.ts');
  const finalize = section(
    authority,
    'export function finalizeGreaterRealmReleaseV1',
    'export function inspectGreaterRealmV17',
  );
  assert.match(finalize, /publicName: input\.publicName/);
  assert.match(finalize, /state: 'ready'/);
  assert.doesNotMatch(finalize, /\.insert\(/);
});
