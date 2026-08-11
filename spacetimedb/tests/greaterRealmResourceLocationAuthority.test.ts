import assert from 'node:assert/strict';
import test from 'node:test';

import {
  greaterRealmResourceLocationAuthorityErrorCode,
  projectGreaterRealmResourceLocationBatchV1,
  resolveGreaterRealmResourceLocationV1,
} from '../src/greaterRealmResourceLocationAuthority';

type Row = Record<string, any>;

const U32_MAX = 0xffff_ffff;
const ATLAS_ID = 'greater.realm.public.v17';
const CHUNK_HANDLE = 'GRK-AAAAAAAAAAAAAAAAAAAAAAAAAA';
const FOREIGN_CHUNK_HANDLE = 'GRK-BBBBBBBBBBBBBBBBBBBBBBBBBB';
const REGION_ID = 'T1_LOWLANDS';
const COMPONENT_KEY = 'GRC-AAAAAAAAAAAAAAAAAAAAAAAAAA';
const FOREIGN_COMPONENT_KEY = 'GRC-BBBBBBBBBBBBBBBBBBBBBBBBBB';

function table(rows: readonly Row[], indexes: readonly string[]) {
  const result: Record<string, any> = {
    count: () => BigInt(rows.length),
    iter: () => [...rows],
  };
  for (const field of indexes) {
    result[field] = {
      find: (value: unknown) => rows.find(row => row[field] === value) ?? null,
      filter: (value: unknown) => rows.filter(row => row[field] === value),
    };
  }
  return result;
}

function locationId(ordinal: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = ordinal + 1;
  let suffix = '';
  while (value > 0) {
    suffix = alphabet[value % alphabet.length]! + suffix;
    value = Math.floor(value / alphabet.length);
  }
  return `GRL-${suffix.padStart(26, 'A')}`;
}

function resourceRow(input: Readonly<{
  locationId?: string;
  cellKey?: string;
  componentKey?: string;
  resourceKind?: string;
  nodeOrdinal: number;
  releaseOrdinal: number;
}>): Row {
  return {
    nodeId: `GRN-${'A'.repeat(26)}`,
    atlasId: ATLAS_ID,
    locationId: input.locationId ?? locationId(0),
    cellKey: input.cellKey ?? 'CELL:1:0',
    regionId: REGION_ID,
    componentKey: input.componentKey ?? COMPONENT_KEY,
    resourceKind: input.resourceKind ?? 'wood',
    tier: 1,
    nodeOrdinal: input.nodeOrdinal,
    releaseOrdinal: input.releaseOrdinal,
    allocationRank: U32_MAX,
    legacyCatalogId: undefined,
    policyVersion: 'greater-realm-resource-v1',
    active: true,
  };
}

function resolveContext(rows: readonly Row[]) {
  const destination = {
    atlasId: ATLAS_ID,
    cellKey: 'CELL:1:0',
    regionId: REGION_ID,
    componentKey: COMPONENT_KEY,
    chunkHandle: CHUNK_HANDLE,
    atlasQ: 1,
    atlasR: 0,
    tier: 1,
    passable: true,
  };
  return {
    db: {
      greaterRealmResourceNodeV1: table(rows, ['locationId', 'cellKey']),
      greaterRealmCellV1: table([destination], ['cellKey']),
      greaterRealmNavigationComponentV1: table([{
        atlasId: ATLAS_ID,
        componentKey: COMPONENT_KEY,
        active: true,
      }], ['componentKey']),
      realmAtlasVisibleRegionV1: table([{
        atlasId: ATLAS_ID,
        regionId: REGION_ID,
        tier: 1,
        active: true,
      }], ['regionId']),
    },
  };
}

function integrityCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return greaterRealmResourceLocationAuthorityErrorCode(error);
  }
}

test('location blocks retain exporter-shaped nonzero group ordinals', () => {
  const rows = [
    resourceRow({ nodeOrdinal: 113, releaseOrdinal: 902 }),
    resourceRow({ nodeOrdinal: 111, releaseOrdinal: 900 }),
    resourceRow({ nodeOrdinal: 112, releaseOrdinal: 901 }),
  ];
  const resolved = resolveGreaterRealmResourceLocationV1(
    resolveContext(rows) as never,
    ATLAS_ID,
    locationId(0),
  );
  assert.deepEqual(resolved.rows.map(row => row.nodeOrdinal), [111, 112, 113]);
  assert.deepEqual(resolved.rows.map(row => row.releaseOrdinal), [900, 901, 902]);
  assert.equal(resolved.nodeCount, 3);
});

test('location blocks reject hostile starts and computed ordinal overflows', () => {
  const hostile = [Number.NaN, -1, Number.MAX_SAFE_INTEGER + 1] as const;
  for (const field of ['nodeOrdinal', 'releaseOrdinal'] as const) {
    for (const start of hostile) {
      const first = resourceRow({ nodeOrdinal: 10, releaseOrdinal: 20 });
      const second = resourceRow({ nodeOrdinal: 11, releaseOrdinal: 21 });
      first[field] = start;
      second[field] = start + 1;
      assert.equal(
        integrityCode(() => resolveGreaterRealmResourceLocationV1(
          resolveContext([first, second]) as never,
          ATLAS_ID,
          locationId(0),
        )),
        'GREATER_REALM_WORKER_LOCATION_INTEGRITY',
        `${field}:${String(start)}`,
      );
    }

    const first = resourceRow({ nodeOrdinal: 10, releaseOrdinal: 20 });
    const second = resourceRow({ nodeOrdinal: 11, releaseOrdinal: 21 });
    first[field] = U32_MAX;
    second[field] = U32_MAX + 1;
    assert.equal(
      integrityCode(() => resolveGreaterRealmResourceLocationV1(
        resolveContext([first, second]) as never,
        ATLAS_ID,
        locationId(0),
      )),
      'GREATER_REALM_WORKER_LOCATION_INTEGRITY',
      `${field}:computed-end`,
    );
  }
});

test('location blocks reject hostile later rows after valid starts', () => {
  for (const field of ['nodeOrdinal', 'releaseOrdinal'] as const) {
    const first = resourceRow({ nodeOrdinal: 10, releaseOrdinal: 20 });
    const second = resourceRow({ nodeOrdinal: 11, releaseOrdinal: 21 });
    second[field] = Number.NaN;
    assert.equal(
      integrityCode(() => resolveGreaterRealmResourceLocationV1(
        resolveContext([first, second]) as never,
        ATLAS_ID,
        locationId(0),
      )),
      'GREATER_REALM_WORKER_LOCATION_INTEGRITY',
    );
  }
});

function projectionFixture(mode: 'active' | 'halted' = 'active') {
  const cells = [
    {
      atlasId: ATLAS_ID,
      cellKey: 'CELL:0:0',
      chunkHandle: CHUNK_HANDLE,
      regionId: REGION_ID,
      componentKey: COMPONENT_KEY,
      atlasQ: 0,
      atlasR: 0,
      releaseOrdinal: 0,
      tier: 1,
      passable: true,
    },
    ...(['food', 'wood', 'stone', 'gold'] as const).map((resourceKind, index) => ({
      atlasId: ATLAS_ID,
      cellKey: `CELL:${index + 1}:0`,
      chunkHandle: CHUNK_HANDLE,
      regionId: REGION_ID,
      componentKey: COMPONENT_KEY,
      atlasQ: index + 1,
      atlasR: 0,
      releaseOrdinal: index + 1,
      tier: 1,
      passable: true,
      resourceKind,
    })),
    {
      atlasId: ATLAS_ID,
      cellKey: 'CELL:5:0',
      chunkHandle: CHUNK_HANDLE,
      regionId: REGION_ID,
      componentKey: FOREIGN_COMPONENT_KEY,
      atlasQ: 5,
      atlasR: 0,
      releaseOrdinal: 5,
      tier: 1,
      passable: true,
    },
  ];
  const resources = [
    resourceRow({
      locationId: locationId(0),
      cellKey: 'CELL:0:0',
      resourceKind: 'food',
      nodeOrdinal: 0,
      releaseOrdinal: 0,
    }),
    ...(['food', 'wood', 'stone', 'gold'] as const).map((resourceKind, index) => (
      resourceRow({
        locationId: locationId(index + 1),
        cellKey: `CELL:${index + 1}:0`,
        resourceKind,
        nodeOrdinal: index === 0 ? 1 : 0,
        releaseOrdinal: index + 1,
      })
    )),
    resourceRow({
      locationId: locationId(5),
      cellKey: 'CELL:5:0',
      componentKey: FOREIGN_COMPONENT_KEY,
      resourceKind: 'gold',
      nodeOrdinal: 1,
      releaseOrdinal: 5,
    }),
  ];
  const chunks = [
    {
      atlasId: ATLAS_ID,
      chunkHandle: CHUNK_HANDLE,
      binQ: 0,
      binR: 0,
      coreCellCount: cells.length,
    },
    {
      atlasId: ATLAS_ID,
      chunkHandle: FOREIGN_CHUNK_HANDLE,
      binQ: 5,
      binR: 0,
      coreCellCount: 0,
    },
  ];
  const components = [
    { atlasId: ATLAS_ID, componentKey: COMPONENT_KEY, active: true },
    { atlasId: ATLAS_ID, componentKey: FOREIGN_COMPONENT_KEY, active: true },
  ];
  return {
    atlas: { atlasId: ATLAS_ID, revision: 7n, mode },
    castle: { castleId: 1n, tileKey: 'CELL:0:0', q: 0, r: 0 },
    ctx: {
      db: {
        greaterRealmCellOccupancyV1: table([{
          castleId: 1n,
          cellKey: 'CELL:0:0',
          atlasId: ATLAS_ID,
          atlasRevision: 7n,
        }], ['castleId']),
        greaterRealmCellV1: table(cells, ['cellKey', 'chunkHandle']),
        greaterRealmChunkV1: table(chunks, ['chunkHandle']),
        greaterRealmNavigationComponentV1: table(components, ['componentKey']),
        greaterRealmReleaseV1: table([{
          atlasId: ATLAS_ID,
          state: mode,
          expectedResourceNodeCount: resources.length,
        }], ['atlasId']),
        greaterRealmResourceNodeV1: table(resources, ['locationId', 'cellKey']),
        realmAtlasVisibleRegionV1: table([{
          atlasId: ATLAS_ID,
          regionId: REGION_ID,
          tier: 1,
          active: true,
        }], ['regionId']),
      },
    },
  };
}

test('bounded projection exposes all four kinds but omits origin, foreign components, and private ABI', () => {
  const fixture = projectionFixture();
  const batch = projectGreaterRealmResourceLocationBatchV1(
    fixture.ctx as never,
    fixture.atlas as never,
    fixture.castle as never,
    [CHUNK_HANDLE],
  );
  assert.deepEqual(batch.resourceLocations.map(row => row.resourceKind), [
    'food', 'wood', 'stone', 'gold',
  ]);
  assert.deepEqual(batch.resourceLocations.map(row => row.locationId), [
    locationId(1), locationId(2), locationId(3), locationId(4),
  ]);
  for (const row of batch.resourceLocations) {
    assert.deepEqual(Object.keys(row).sort(), [
      'atlasQ', 'atlasR', 'chunkHandle', 'locationId', 'nodeCount', 'resourceKind',
    ]);
    for (const forbidden of [
      'nodeId', 'cellKey', 'regionId', 'componentKey', 'policyVersion',
      'capacityDigest', 'releaseOrdinal', 'nodeOrdinal',
    ]) assert.equal(forbidden in row, false, forbidden);
  }
});

test('halted releases remain readable while chunk selection stays caller-near', () => {
  const fixture = projectionFixture('halted');
  const batch = projectGreaterRealmResourceLocationBatchV1(
    fixture.ctx as never,
    fixture.atlas as never,
    fixture.castle as never,
    [CHUNK_HANDLE],
  );
  assert.equal(batch.revision, 7n);
  assert.equal(batch.resourceLocations.length, 4);
  assert.equal(
    integrityCode(() => projectGreaterRealmResourceLocationBatchV1(
      fixture.ctx as never,
      fixture.atlas as never,
      fixture.castle as never,
      [FOREIGN_CHUNK_HANDLE],
    )),
    'GREATER_REALM_RESOURCE_LOCATION_CHUNK_INVALID',
  );
  assert.equal(
    integrityCode(() => projectGreaterRealmResourceLocationBatchV1(
      fixture.ctx as never,
      fixture.atlas as never,
      fixture.castle as never,
      new Array(1),
    )),
    'GREATER_REALM_RESOURCE_LOCATION_BATCH_INVALID',
  );
});

function skewedProjectionFixture() {
  const origin = {
    atlasId: ATLAS_ID,
    cellKey: 'SKEW:ORIGIN',
    chunkHandle: CHUNK_HANDLE,
    regionId: REGION_ID,
    componentKey: COMPONENT_KEY,
    atlasQ: 0,
    atlasR: 0,
    releaseOrdinal: 0,
    tier: 1,
    passable: true,
  };
  const nearCoordinates: Array<Readonly<{ q: number; r: number }>> = [];
  for (let q = 0; q < 15 && nearCoordinates.length < 128; q += 1) {
    for (let r = 0; r < 15 && nearCoordinates.length < 128; r += 1) {
      if (q !== 0 || r !== 0) nearCoordinates.push({ q, r });
    }
  }
  const nearCells = nearCoordinates.map(({ q, r }, index) => ({
    ...origin,
    cellKey: `SKEW:FOOD:${index}`,
    atlasQ: q,
    atlasR: r,
    releaseOrdinal: index + 1,
  }));
  const farKinds = ['wood', 'stone', 'gold'] as const;
  const farCells = farKinds.flatMap((resourceKind, kindIndex) => (
    Array.from({ length: 8 }, (_, index) => ({
      ...origin,
      cellKey: `SKEW:${resourceKind}:${index}`,
      chunkHandle: FOREIGN_CHUNK_HANDLE,
      atlasQ: 60 + kindIndex * 2 + index,
      atlasR: 0,
      releaseOrdinal: 129 + kindIndex * 8 + index,
    }))
  ));
  const cells = [origin, ...nearCells, ...farCells];
  const resources = [
    ...nearCells.map((cell, index) => resourceRow({
      locationId: locationId(index),
      cellKey: cell.cellKey,
      resourceKind: 'food',
      nodeOrdinal: index,
      releaseOrdinal: index,
    })),
    ...farKinds.flatMap((resourceKind, kindIndex) => (
      Array.from({ length: 8 }, (_, index) => resourceRow({
        locationId: locationId(128 + kindIndex * 8 + index),
        cellKey: `SKEW:${resourceKind}:${index}`,
        resourceKind,
        nodeOrdinal: index,
        releaseOrdinal: 128 + kindIndex * 8 + index,
      }))
    )),
  ];
  return {
    atlas: { atlasId: ATLAS_ID, revision: 9n, mode: 'active' },
    castle: { castleId: 2n, tileKey: origin.cellKey, q: 0, r: 0 },
    ctx: {
      db: {
        greaterRealmCellOccupancyV1: table([{
          castleId: 2n,
          cellKey: origin.cellKey,
          atlasId: ATLAS_ID,
          atlasRevision: 9n,
        }], ['castleId']),
        greaterRealmCellV1: table(cells, ['cellKey', 'chunkHandle']),
        greaterRealmChunkV1: table([{
          atlasId: ATLAS_ID,
          chunkHandle: CHUNK_HANDLE,
          binQ: 0,
          binR: 0,
          coreCellCount: nearCells.length + 1,
        }, {
          atlasId: ATLAS_ID,
          chunkHandle: FOREIGN_CHUNK_HANDLE,
          binQ: 4,
          binR: 0,
          coreCellCount: farCells.length,
        }], ['chunkHandle']),
        greaterRealmNavigationComponentV1: table([{
          atlasId: ATLAS_ID,
          componentKey: COMPONENT_KEY,
          active: true,
        }], ['componentKey']),
        greaterRealmReleaseV1: table([{
          atlasId: ATLAS_ID,
          state: 'active',
          expectedResourceNodeCount: resources.length,
        }], ['atlasId']),
        greaterRealmResourceNodeV1: table(resources, ['locationId', 'cellKey']),
        realmAtlasVisibleRegionV1: table([{
          atlasId: ATLAS_ID,
          regionId: REGION_ID,
          tier: 1,
          active: true,
        }], ['regionId']),
      },
    },
  };
}

test('skewed truncation reserves the nearest six of every available kind', () => {
  const fixture = skewedProjectionFixture();
  const batch = projectGreaterRealmResourceLocationBatchV1(
    fixture.ctx as never,
    fixture.atlas as never,
    fixture.castle as never,
    [CHUNK_HANDLE, FOREIGN_CHUNK_HANDLE],
  );
  assert.equal(batch.truncated, true);
  assert.equal(batch.resourceLocations.length, 128);
  assert.deepEqual(
    Object.fromEntries((['food', 'wood', 'stone', 'gold'] as const).map(kind => [
      kind,
      batch.resourceLocations.filter(row => row.resourceKind === kind).length,
    ])),
    { food: 110, wood: 6, stone: 6, gold: 6 },
  );
  const distances = batch.resourceLocations.map(row => (
    Math.max(Math.abs(row.atlasQ), Math.abs(row.atlasR), Math.abs(row.atlasQ + row.atlasR))
  ));
  assert.equal(distances.every((distance, index) => (
    index === 0 || distance >= distances[index - 1]!
  )), true);
});
