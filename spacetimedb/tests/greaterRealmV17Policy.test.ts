import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS,
  GREATER_REALM_MAX_COMPONENTS,
  GREATER_REALM_MAX_CHUNK_PAYLOAD_BYTES,
  GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
  GREATER_REALM_MAX_VERIFY_ROWS,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RUNTIME_PARTITION_VERSION,
  GREATER_REALM_TRAVEL_CLASS,
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
  greaterRealmV17ErrorCode,
  requireGreaterRealmOpaqueId,
  requireGreaterRealmChunkPayloadBytesV1,
  requireGreaterRealmSafeInteger,
  validateGreaterRealmCellInputV1,
  validateGreaterRealmChunkInputV1,
  validateGreaterRealmComponentInputV1,
  validateGreaterRealmReleaseInputV1,
} from '../src/greaterRealmV17Policy';

const SHA = '0'.repeat(64);

function errorCode(action: () => void): string | undefined {
  try {
    action();
  } catch (error) {
    return greaterRealmV17ErrorCode(error);
  }
  return undefined;
}

test('protocol-v17 mutation gates are compiled fail-closed', () => {
  assert.equal(GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED, false);
  assert.equal(GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED, false);
  assert.equal(GREATER_REALM_PUBLIC_REGIONS.length, 6);
  assert.equal(GREATER_REALM_CASTLE_CAPACITY, 600);
});

test('component ceiling is 4,096 while each mutation remains bounded', () => {
  assert.equal(GREATER_REALM_MAX_COMPONENTS, 4096);
  assert.equal(GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS, 128);
  assert.equal(GREATER_REALM_MAX_VERIFY_ROWS, 256);
  validateGreaterRealmReleaseInputV1({
    atlasId: 'GRA-RELEASE',
    publicReleaseId: 'GRP-RELEASE',
    publicApprovalReceiptId: 'APR-RELEASE',
    sourceCommit: 'a'.repeat(40),
    generatorVersion: 'greater-realm-v1',
    sourceFormatVersion: 'runtime-v1',
    livingWorldVersion: 'living-v1',
    runtimePartitionVersion: GREATER_REALM_RUNTIME_PARTITION_VERSION,
    rendererContractVersion: 'renderer-v1',
    expectedRegionCount: 6,
    expectedComponentCount: 4096,
    expectedChunkCount: 1,
    expectedCellCount: 1,
    expectedSlotCount: 600,
    expectedResourceNodeCount: 12_000,
    expectedReleaseSha256: SHA,
    importEpoch: 1n,
  });
});

test('a navigation component with no founding slots needs no resource margin', () => {
  validateGreaterRealmComponentInputV1({
    componentKey: 'GRC-ZERO-SLOTS',
    atlasId: 'GRA-RELEASE',
    componentOrdinal: 4095,
    regionMask: 1,
    rootCellKey: 'T1_LOWLANDS:0:0',
    expectedCellCount: 1,
    maxRouteDepth: 0,
    expectedSlotCount: 0,
    expectedFoodNodeCount: 0,
    expectedWoodNodeCount: 0,
    expectedStoneNodeCount: 0,
    expectedGoldNodeCount: 0,
    componentSha256: SHA,
  });
});

test('all strings and numeric policy inputs must already be canonical', () => {
  assert.equal(
    errorCode(() => requireGreaterRealmOpaqueId(' GRA-1', 'NONCANONICAL')),
    'NONCANONICAL',
  );
  assert.equal(
    errorCode(() => requireGreaterRealmOpaqueId('ＧＲＡ-1', 'NONCANONICAL')),
    'NONCANONICAL',
  );
  assert.equal(
    errorCode(() => requireGreaterRealmOpaqueId('GRA-\u200b1', 'NONCANONICAL')),
    'NONCANONICAL',
  );
  for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      errorCode(() => requireGreaterRealmSafeInteger(value, 0, 10, 'UNSAFE_INTEGER')),
      'UNSAFE_INTEGER',
    );
  }
});

test('passable route membership is nullable and permits only dry cells or wet fords', () => {
  const root = {
    cellKey: 'T1_LOWLANDS:0:0',
    atlasCoordKey: 'A:0:0',
    releaseOrdinal: 0,
    atlasId: 'GRA-RELEASE',
    chunkHandle: 'GRC-CHUNK',
    regionId: 'T1_LOWLANDS',
    componentKey: 'GRC-COMPONENT',
    tier: 1,
    passable: true,
    movementCost: 1,
    sealedBoundaryMask: 0,
    hydroRegime: GREATER_REALM_HYDRO_REGIME.DRY,
    travelClass: GREATER_REALM_TRAVEL_CLASS.ROAD,
    routeDepth: 0,
    canopyBasisPoints: 0,
    groundcoverBasisPoints: 0,
    wildflowerBasisPoints: 0,
  } as const;
  validateGreaterRealmCellInputV1(root);
  validateGreaterRealmCellInputV1({
    ...root,
    hydroRegime: GREATER_REALM_HYDRO_REGIME.RIVER,
    hydroBodyId: 'GRW-PUBLIC',
    travelClass: GREATER_REALM_TRAVEL_CLASS.FORD,
  });
  assert.equal(
    errorCode(() => validateGreaterRealmCellInputV1({
      ...root,
      hydroRegime: GREATER_REALM_HYDRO_REGIME.RIVER,
      hydroBodyId: 'GRW-PUBLIC',
      travelClass: GREATER_REALM_TRAVEL_CLASS.ROAD,
    })),
    'GREATER_REALM_WET_NAVIGATION_INVALID',
  );
  validateGreaterRealmCellInputV1({
    ...root,
    componentKey: undefined,
    routeDepth: undefined,
    passable: false,
    movementCost: 1_000_000,
    hydroRegime: GREATER_REALM_HYDRO_REGIME.OCEAN,
    hydroBodyId: 'GRW-PUBLIC',
    travelClass: GREATER_REALM_TRAVEL_CLASS.NONE,
  });
});

test('chunk counts use the full core-plus-apron visibility set for reduced LODs', () => {
  validateGreaterRealmChunkInputV1({
    chunkHandle: 'GRK-CHUNK',
    atlasId: 'GRA-RELEASE',
    chunkCoordKey: 'B:0:0',
    importOrdinal: 0,
    binQ: 0,
    binR: 0,
    firstCellOrdinal: 0,
    coreCellCount: 10,
    apronCellCount: 100,
    lod0CellCount: 10,
    lod1CellCount: 55,
    lod2CellCount: 28,
    lod3CellCount: 14,
    payloadSha256: SHA,
  });
  assert.equal(
    errorCode(() => validateGreaterRealmChunkInputV1({
      chunkHandle: 'GRK-CHUNK',
      atlasId: 'GRA-RELEASE',
      chunkCoordKey: 'B:0:0',
      importOrdinal: 0,
      binQ: 0,
      binR: 0,
      firstCellOrdinal: 0,
      coreCellCount: 10,
      apronCellCount: 100,
      lod0CellCount: 10,
      lod1CellCount: 5,
      lod2CellCount: 3,
      lod3CellCount: 2,
      payloadSha256: SHA,
    })),
    'GREATER_REALM_CHUNK_LOD_COUNTS_INVALID',
  );
});

test('canonical chunk payload ceiling counts UTF-8 bytes rather than UTF-16 code units', () => {
  assert.equal(
    requireGreaterRealmChunkPayloadBytesV1('a'.repeat(GREATER_REALM_MAX_CHUNK_PAYLOAD_BYTES)).length,
    GREATER_REALM_MAX_CHUNK_PAYLOAD_BYTES,
  );
  assert.equal(
    errorCode(() => requireGreaterRealmChunkPayloadBytesV1(
      'é'.repeat(Math.floor(GREATER_REALM_MAX_CHUNK_PAYLOAD_BYTES / 2) + 1),
    )),
    'GREATER_REALM_CHUNK_PAYLOAD_SIZE_INVALID',
  );
});

test('a public resource location has at most 32 private capacity nodes', () => {
  assert.equal(GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION, 32);
});
