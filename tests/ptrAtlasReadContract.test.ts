import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import {
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_RUNTIME_PARTITION_VERSION,
  GREATER_REALM_TRAVEL_CLASS,
  GREATER_REALM_UNASSIGNED_RANK,
  type GreaterRealmCellInputV1,
  type GreaterRealmChunkInputV1,
  type GreaterRealmReleaseInputV1,
  type GreaterRealmResourceInputV1,
  validateGreaterRealmCellInputV1,
  validateGreaterRealmChunkInputV1,
  validateGreaterRealmReleaseInputV1,
  validateGreaterRealmResourceInputV1,
} from '../spacetimedb/ptr/src/atlasPolicy';
import {
  type GreaterRealmCellImportV1,
  validateGreaterRealmCellImportV1,
} from '../spacetimedb/ptr/src/atlasAuthority';
import {
  PTR_ATLAS_MAX_RESOURCE_CHUNK_HANDLES,
  planPtrTreeRoutePage,
  requirePtrChunkRequest,
  requirePtrResourceChunkHandles,
  requirePtrRoutePageRequest,
  requirePtrWindowRequest,
  type PtrRouteNode,
} from '../spacetimedb/ptr/src/atlasReadPolicy';

const CHUNK_A = `GRK-${'A'.repeat(26)}`;
const CHUNK_B = `GRK-${'B'.repeat(26)}`;
const PUBLIC_RELEASE_A = `GRR-${'A'.repeat(26)}`;
const RESOURCE_LOCATION_A = `GRL-${'A'.repeat(26)}`;
const COMPONENT_A = `GRC-${'A'.repeat(26)}`;
const SHA_A = 'a'.repeat(64);

const VALID_RELEASE: GreaterRealmReleaseInputV1 = {
  atlasId: 'PTR_GREATER_REALM',
  publicReleaseId: PUBLIC_RELEASE_A,
  publicApprovalReceiptId: 'PTR-APPROVAL-1',
  sourceCommit: 'a'.repeat(40),
  generatorVersion: 'generator-v1',
  sourceFormatVersion: 'source-v1',
  livingWorldVersion: 'living-world-v1',
  runtimePartitionVersion: GREATER_REALM_RUNTIME_PARTITION_VERSION,
  rendererContractVersion: 'greater-realm-renderer-v1',
  expectedRegionCount: 6,
  expectedComponentCount: 1,
  expectedChunkCount: 1,
  expectedCellCount: 1,
  expectedSlotCount: 600,
  expectedResourceNodeCount: 12_000,
  expectedReleaseSha256: SHA_A,
  importEpoch: 1n,
};

const VALID_CHUNK: GreaterRealmChunkInputV1 = {
  chunkHandle: CHUNK_A,
  atlasId: 'PTR_GREATER_REALM',
  chunkCoordKey: 'B:0:0',
  importOrdinal: 0,
  binQ: 0,
  binR: 0,
  firstCellOrdinal: 0,
  coreCellCount: 1,
  apronCellCount: 0,
  lod0CellCount: 1,
  lod1CellCount: 1,
  lod2CellCount: 1,
  lod3CellCount: 1,
  payloadSha256: SHA_A,
};

const VALID_CELL: GreaterRealmCellInputV1 = {
  cellKey: 'T1_LOWLANDS:0:0',
  atlasCoordKey: 'A:0:0',
  releaseOrdinal: 0,
  atlasId: 'PTR_GREATER_REALM',
  chunkHandle: CHUNK_A,
  regionId: 'T1_LOWLANDS',
  componentKey: COMPONENT_A,
  tier: 1,
  passable: true,
  movementCost: 1,
  sealedBoundaryMask: 0,
  hydroRegime: GREATER_REALM_HYDRO_REGIME.DRY,
  travelClass: GREATER_REALM_TRAVEL_CLASS.NONE,
  routeDepth: 0,
  canopyBasisPoints: 0,
  groundcoverBasisPoints: 0,
  wildflowerBasisPoints: 0,
};

const VALID_CELL_IMPORT: GreaterRealmCellImportV1 = {
  ...VALID_CELL,
  localQ: 0,
  localR: 0,
  atlasQ: 0,
  atlasR: 0,
  elevation: 0,
  slope: 0,
  aspect: 0,
  profileCurvature: 0,
  planCurvature: 0,
  geologicalBarrierBand: 0,
  biomeClass: 0,
  landformClass: 0,
  yieldClass: 0,
  hydroDepthClass: 0,
  hydroSurfaceMilli: 0,
  flowAccumulation: 0n,
  bankVariant: 0,
  hydrologyRevision: 0,
  wetness: 0,
  exposure: 0,
  coastDistance: 0,
  freshwaterDistance: 0,
  temperature: 0,
  moisture: 0,
  habitatClass: 0,
  featureClass: 0,
  ambienceClass: 0,
  presentationVariant: 0,
};

const VALID_RESOURCE: GreaterRealmResourceInputV1 = {
  nodeId: 'GRN-RESOURCE-1',
  releaseOrdinal: 0,
  atlasId: 'PTR_GREATER_REALM',
  locationId: RESOURCE_LOCATION_A,
  cellKey: VALID_CELL.cellKey,
  regionId: VALID_CELL.regionId,
  componentKey: COMPONENT_A,
  resourceKind: 'food',
  tier: 1,
  nodeOrdinal: 0,
  allocationRank: GREATER_REALM_UNASSIGNED_RANK,
  policyVersion: 'resource-v1',
  active: false,
};

describe('PTR import rows are owner-readable before finalization', () => {
  test('requires the exact public release identifier and renderer contract', () => {
    assert.doesNotThrow(() => validateGreaterRealmReleaseInputV1(VALID_RELEASE));
    assert.throws(
      () => validateGreaterRealmReleaseInputV1({
        ...VALID_RELEASE,
        publicReleaseId: 'release-v1',
      }),
      /GREATER_REALM_PUBLIC_RELEASE_ID_INVALID/u,
    );
    assert.throws(
      () => validateGreaterRealmReleaseInputV1({
        ...VALID_RELEASE,
        rendererContractVersion: 'greater-realm-renderer-v2',
      }),
      /GREATER_REALM_RENDERER_VERSION_INVALID/u,
    );
  });

  test('requires canonical GRK handles and coordinate-derived chunk keys', () => {
    assert.doesNotThrow(() => validateGreaterRealmChunkInputV1(VALID_CHUNK));
    assert.throws(
      () => validateGreaterRealmChunkInputV1({
        ...VALID_CHUNK,
        chunkHandle: 'chunk-1',
      }),
      /GREATER_REALM_CHUNK_HANDLE_INVALID/u,
    );
    assert.throws(
      () => validateGreaterRealmChunkInputV1({
        ...VALID_CHUNK,
        chunkCoordKey: 'B:1:0',
      }),
      /GREATER_REALM_CHUNK_COORD_KEY_INVALID/u,
    );
  });

  test('requires canonical cell handles, keys, coordinates, and read-safe semantics', () => {
    assert.doesNotThrow(() => validateGreaterRealmCellInputV1(VALID_CELL));
    assert.doesNotThrow(() => validateGreaterRealmCellInputV1({
      ...VALID_CELL,
      movementCost: 999_999,
    }));
    for (const [row, expectedCode] of [
      [{ ...VALID_CELL, chunkHandle: 'chunk-1' }, 'GREATER_REALM_CHUNK_HANDLE_INVALID'],
      [{ ...VALID_CELL, movementCost: 1_000_000 }, 'GREATER_REALM_MOVEMENT_COST_INVALID'],
      [{ ...VALID_CELL, travelClass: GREATER_REALM_TRAVEL_CLASS.FORD }, 'GREATER_REALM_WET_NAVIGATION_INVALID'],
      [{
        ...VALID_CELL,
        groundcoverBasisPoints: 4_000,
        wildflowerBasisPoints: 4_001,
      }, 'GREATER_REALM_DENSITY_INVALID'],
    ] as const) {
      assert.throws(
        () => validateGreaterRealmCellInputV1(row),
        new RegExp(expectedCode, 'u'),
      );
    }
    assert.doesNotThrow(() => validateGreaterRealmCellImportV1(VALID_CELL_IMPORT));
    assert.throws(
      () => validateGreaterRealmCellImportV1({
        ...VALID_CELL_IMPORT,
        atlasCoordKey: 'A:1:0',
      }),
      /GREATER_REALM_ATLAS_COORD_KEY_INVALID/u,
    );
    assert.throws(
      () => validateGreaterRealmCellImportV1({
        ...VALID_CELL_IMPORT,
        cellKey: 'T1_LOWLANDS:1:0',
      }),
      /GREATER_REALM_REGION_CELL_KEY_INVALID/u,
    );
  });

  test('requires canonical GRL resource location identifiers', () => {
    assert.doesNotThrow(() => validateGreaterRealmResourceInputV1(VALID_RESOURCE));
    assert.throws(
      () => validateGreaterRealmResourceInputV1({
        ...VALID_RESOURCE,
        locationId: 'resource-location-1',
      }),
      /GREATER_REALM_RESOURCE_LOCATION_INVALID/u,
    );
  });
});

describe('PTR atlas request bounds', () => {
  test('accepts only the reviewed window and LOD bounds', () => {
    assert.deepEqual(requirePtrWindowRequest(0), { radius: 0 });
    assert.deepEqual(requirePtrWindowRequest(4), { radius: 4 });
    assert.deepEqual(requirePtrChunkRequest(CHUNK_A, 0), {
      chunkHandle: CHUNK_A,
      lod: 0,
    });
    assert.deepEqual(requirePtrChunkRequest(CHUNK_A, 3), {
      chunkHandle: CHUNK_A,
      lod: 3,
    });

    for (const radius of [-1, 5, 1.5, Number.NaN]) {
      assert.throws(() => requirePtrWindowRequest(radius), /PTR_ATLAS_WINDOW_INVALID/u);
    }
    for (const lod of [-1, 4, 1.5, Number.NaN]) {
      assert.throws(() => requirePtrChunkRequest(CHUNK_A, lod), /PTR_ATLAS_LOD_INVALID/u);
    }
    assert.throws(
      () => requirePtrChunkRequest('../private', 0),
      /PTR_ATLAS_CHUNK_HANDLE_INVALID/u,
    );
  });

  test('requires one to eight unique canonical resource chunks', () => {
    assert.equal(PTR_ATLAS_MAX_RESOURCE_CHUNK_HANDLES, 8);
    assert.deepEqual(requirePtrResourceChunkHandles([CHUNK_A, CHUNK_B]), [
      CHUNK_A,
      CHUNK_B,
    ]);
    for (const handles of [
      [],
      [CHUNK_A, CHUNK_A],
      ['bad'],
      Array.from({ length: 9 }, (_, index) => `GRK-${String(index).padStart(26, 'A')}`),
    ]) {
      assert.throws(
        () => requirePtrResourceChunkHandles(handles),
        /PTR_ATLAS_RESOURCE_BATCH_INVALID/u,
      );
    }
  });

  test('bounds route pagination to one 128-cell page and a u32 offset', () => {
    assert.deepEqual(requirePtrRoutePageRequest(0, 1), { offset: 0, limit: 1 });
    assert.deepEqual(requirePtrRoutePageRequest(0xffff_ffff, 128), {
      offset: 0xffff_ffff,
      limit: 128,
    });
    for (const [offset, limit] of [
      [-1, 1],
      [0x1_0000_0000, 1],
      [0, 0],
      [0, 129],
      [0.5, 1],
    ]) {
      assert.throws(
        () => requirePtrRoutePageRequest(offset, limit),
        /PTR_ATLAS_ROUTE_PAGE_INVALID/u,
      );
    }
  });
});

describe('PTR bounded tree-route policy', () => {
  const nodes: readonly PtrRouteNode[] = Object.freeze([
    Object.freeze({
      cellKey: 'CELL-ROOT', atlasId: 'PTR_GREATER_REALM', componentKey: 'COMP-A',
      atlasQ: 0, atlasR: 0, passable: true, routeDepth: 0,
      routeParentDirection: undefined,
    }),
    Object.freeze({
      cellKey: 'CELL-A', atlasId: 'PTR_GREATER_REALM', componentKey: 'COMP-A',
      atlasQ: 1, atlasR: 0, passable: true, routeDepth: 1,
      routeParentDirection: 3,
    }),
    Object.freeze({
      cellKey: 'CELL-B', atlasId: 'PTR_GREATER_REALM', componentKey: 'COMP-A',
      atlasQ: 2, atlasR: 0, passable: true, routeDepth: 2,
      routeParentDirection: 3,
    }),
    Object.freeze({
      cellKey: 'CELL-C', atlasId: 'PTR_GREATER_REALM', componentKey: 'COMP-A',
      atlasQ: 0, atlasR: 1, passable: true, routeDepth: 1,
      routeParentDirection: 2,
    }),
  ]);
  const byCoordinate = new Map(nodes.map(node => [
    `${node.atlasQ}:${node.atlasR}`,
    node,
  ] as const));
  const findAt = (q: number, r: number) => byCoordinate.get(`${q}:${r}`) ?? null;

  test('returns a deterministic paged path through the lowest common ancestor', () => {
    const result = planPtrTreeRoutePage(
      nodes[2]!,
      nodes[3]!,
      1,
      2,
      findAt,
    );
    assert.deepEqual(result.cells.map(cell => cell.cellKey), ['CELL-A', 'CELL-ROOT']);
    assert.equal(result.totalLength, 4);
    assert.equal(result.nextOffset, 3);
    assert.equal(result.complete, false);

    const tail = planPtrTreeRoutePage(nodes[2]!, nodes[3]!, 3, 128, findAt);
    assert.deepEqual(tail.cells.map(cell => cell.cellKey), ['CELL-C']);
    assert.equal(tail.totalLength, 4);
    assert.equal(tail.nextOffset, undefined);
    assert.equal(tail.complete, true);
  });

  test('rejects off-atlas, impassable, disconnected, broken-depth, and oversized routes', () => {
    for (const destination of [
      { ...nodes[3]!, atlasId: 'GENESIS_002_GREATER_REALM' },
      { ...nodes[3]!, passable: false },
      { ...nodes[3]!, componentKey: 'COMP-B' },
      { ...nodes[3]!, routeDepth: undefined },
    ]) {
      assert.throws(
        () => planPtrTreeRoutePage(nodes[2]!, destination, 0, 128, findAt),
        /PTR_ATLAS_ROUTE_UNAVAILABLE/u,
      );
    }
    const brokenFind = (q: number, r: number) => {
      const row = findAt(q, r);
      return row?.cellKey === 'CELL-A' ? { ...row, routeDepth: 0 } : row;
    };
    assert.throws(
      () => planPtrTreeRoutePage(nodes[2]!, nodes[3]!, 0, 128, brokenFind),
      /PTR_ATLAS_ROUTE_UNAVAILABLE/u,
    );
  });
});
