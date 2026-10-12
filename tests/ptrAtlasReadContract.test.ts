import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import {
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_PUBLIC_REGIONS,
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
  verifyGreaterRealmBatchV1,
} from '../spacetimedb/ptr/src/atlasAuthority';
import { Sha256 } from '../spacetimedb/ptr/src/sha256';
import { requireGreaterRealmPtrHydrologyLinkV1 } from '../spacetimedb/ptr/src/greaterRealmHydrologyAuthority';
import {
  PTR_ATLAS_MAX_RESOURCE_CHUNK_HANDLES,
  planPtrTreeRoute,
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

test('generated Lowlands river can terminate in the exact transformed frozen Alpha ocean', () => {
  // Installed atlas .53: verification ordinal 53823, observed on 2026-10-11.
  const source = { regionId: 'T1_LOWLANDS', localQ: -65, localR: 66,
    atlasQ: 29, atlasR: 27, hydroRegime: 3, hydroDepthClass: 2,
    hydroSurfaceMilli: 10076, hydroFlowDirection: 1, flowAccumulation: 1476n,
    hydrologyRevision: 1, passable: false, movementCost: 1_000_000,
    geologicalBarrierBand: 0, biomeClass: 22, landformClass: 2, yieldClass: 0,
    hydroBodyId: `GRW-${'A'.repeat(26)}` };
  const downstream = { ...source, localR: 65, atlasQ: 30, atlasR: 26,
    hydroRegime: 1, hydroDepthClass: 3, hydroSurfaceMilli: 975,
    hydroFlowDirection: undefined, flowAccumulation: 0n, hydrologyRevision: 3,
    biomeClass: 20, landformClass: 16, hydroBodyId: `GRW-${'B'.repeat(26)}` };
  const transform = { rotation: 1, offsetQ: 95, offsetR: 26 };
  assert.doesNotThrow(() => requireGreaterRealmPtrHydrologyLinkV1(source, downstream, transform));
  for (const changed of [
    { ...source, hydrologyRevision: 3 },
    { ...source, atlasQ: source.atlasQ + 1 },
    { ...source, localR: 65, atlasQ: 30, atlasR: 26 },
  ]) assert.throws(() => requireGreaterRealmPtrHydrologyLinkV1(changed, downstream, transform),
    /GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID/);
  assert.throws(() => requireGreaterRealmPtrHydrologyLinkV1(source, downstream),
    /GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID/);
  for (const changed of [
    { ...downstream, hydroDepthClass: 1 },
    { ...downstream, hydrologyRevision: 1 },
    { ...downstream, passable: true },
    { ...downstream, flowAccumulation: 1n },
  ]) assert.throws(() => requireGreaterRealmPtrHydrologyLinkV1(source, changed, transform),
    /GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID/);
});
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

function sealedHydrologyVerificationFixture(hydroRegime: number, mask = 63, neighbor = false) {
  const row: GreaterRealmCellImportV1 = {
    ...VALID_CELL_IMPORT, cellKey: 'T1_FROSTMERE:0:0', regionId: 'T1_FROSTMERE',
    passable: false, movementCost: 1_000_000, componentKey: undefined,
    routeDepth: undefined, sealedBoundaryMask: mask,
    hydroRegime, hydroBodyId: `GRW-${'A'.repeat(26)}`, hydroDepthClass: 2,
    hydroSurfaceMilli: 100, hydroFlowDirection: 0, flowAccumulation: 1n,
    hydrologyRevision: 1,
  };
  const regionFields = ['verifiedCellCount', 'verifiedPassableCellCount', 'verifiedChunkCount',
    'verifiedCastleCapacity', 'verifiedResourceLocationCount', 'verifiedResourceNodeCount',
    'verifiedFoodNodeCount', 'verifiedWoodNodeCount', 'verifiedStoneNodeCount', 'verifiedGoldNodeCount'];
  const regionVerification = GREATER_REALM_PUBLIC_REGIONS.map(region => ({
    regionId: region.id, ...Object.fromEntries(regionFields.map(field => [field, 0])),
  }));
  const regions = GREATER_REALM_PUBLIC_REGIONS.map(region => ({
    regionId: region.id, publicName: region.name, ordinal: region.ordinal, tier: 1,
    cellCount: region.id === row.regionId ? 1 : 0, passableCellCount: 0,
    chunkCount: region.id === row.regionId ? 1 : 0, castleCapacity: 0,
    resourceLocationCount: 0, resourceNodeCount: 0, foodNodeCount: 0,
    woodNodeCount: 0, stoneNodeCount: 0, goldNodeCount: 0, active: false,
  }));
  let release = {
    atlasId: row.atlasId, importEpoch: 1n, state: 'verifying',
    verificationPhase: 'cells', verificationCursor: 0n, expectedCellCount: 1,
    verifiedCellCount: 0, verificationDigest: new Sha256().serialize(),
    regionManifestJson: `${JSON.stringify(regions)}\n`,
    regionVerificationJson: `${JSON.stringify(regionVerification)}\n`,
  };
  const ctx = { db: {
    greaterRealmReleaseV1: { atlasId: {
      find: () => release,
      update: (value: typeof release) => { release = value; },
    } },
    greaterRealmChunkV1: { chunkHandle: { find: () => ({ chunkHandle: row.chunkHandle }) } },
    greaterRealmCellV1: {
      releaseOrdinal: { find: () => row },
      atlasCoordKey: { find: (key: string) => (
        neighbor && key === 'A:1:-1' ? { ...row, atlasQ: 1, atlasR: -1 } : null
      ) },
      chunkHandle: { filter: () => [row] },
    },
  } } as unknown as Parameters<typeof verifyGreaterRealmBatchV1>[0];
  return { run: () => verifyGreaterRealmBatchV1(ctx, row.atlasId, 1n, 1), release: () => release };
}

test('actual PTR cell verification preserves river and stream continuation through a fully verified seal', () => {
  for (const regime of [GREATER_REALM_HYDRO_REGIME.RIVER, GREATER_REALM_HYDRO_REGIME.STREAM]) {
    const fixture = sealedHydrologyVerificationFixture(regime);
    assert.deepEqual(fixture.run(), { phase: 'cells', processed: 1, remaining: 0, complete: false });
    assert.equal(fixture.release().verifiedCellCount, 1);
    assert.equal(fixture.release().verificationPhase, 'component-slots');
    const regions = JSON.parse(fixture.release().regionVerificationJson);
    assert.equal(regions.find((region: { regionId: string }) => region.regionId === 'T1_FROSTMERE').verifiedCellCount, 1);
  }
});

test('actual PTR cell verification rejects an unsealed exit and a forged complete seal before updating counters', () => {
  for (const fixture of [
    sealedHydrologyVerificationFixture(GREATER_REALM_HYDRO_REGIME.RIVER, 62),
    sealedHydrologyVerificationFixture(GREATER_REALM_HYDRO_REGIME.RIVER, 63, true),
  ]) {
    assert.throws(fixture.run, /GREATER_REALM_SEALED_BOUNDARY_CLOSURE_INVALID/u);
    assert.equal(fixture.release().verifiedCellCount, 0);
    assert.equal(fixture.release().verificationCursor, 0n);
  }
});

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
    assert.deepEqual(
      planPtrTreeRoute(nodes[2]!, nodes[3]!, findAt).map(cell => cell.cellKey),
      ['CELL-B', 'CELL-A', 'CELL-ROOT', 'CELL-C'],
      'the Worker adapter receives the complete verified route in one traversal',
    );
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
