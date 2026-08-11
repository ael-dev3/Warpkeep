import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from '../scripts/atlas/greater-realm-biomes';
import {
  GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY,
  GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS,
  GREATER_REALM_TOPOGRAPHIC_QA_VERSION,
  measureGreaterRealmTopographicQa,
  type GreaterRealmTopographicQaInput,
} from '../scripts/atlas/greater-realm-topographic-qa';
import {
  GREATER_REALM_COASTAL_CLASS,
} from '../scripts/atlas/greater-realm-geomorphology';
import {
  greaterRealmHexDistance,
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

const WATER_DRY = 0;
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 3;
const WATER_MARSH = 6;

function fixture(reverseCoordinates = false): GreaterRealmTopographicQaInput {
  const coordinates: AxialCoordinate[] = [];
  const radius = 2;
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) {
      coordinates.push({ q, r });
    }
  }
  const grid = indexGreaterRealmAxialGrid(
    reverseCoordinates ? [...coordinates].reverse() : coordinates,
  );
  const elevation = new Int32Array(grid.cellCount);
  const regionId = new Uint8Array(grid.cellCount);
  const geomorphologyCoastalClass = new Uint8Array(grid.cellCount);
  const preErosionElevation = new Int32Array(grid.cellCount);
  const sedimentDepth = new Uint16Array(grid.cellCount);
  const flowReceiver = new Int32Array(grid.cellCount);
  flowReceiver.fill(-1);
  const flowAccumulation = new BigUint64Array(grid.cellCount);
  flowAccumulation.fill(1n);
  const waterRegime = new Uint8Array(grid.cellCount);
  const biomeId = new Uint8Array(grid.cellCount);
  const landformId = new Uint8Array(grid.cellCount);
  const slope = new Uint16Array(grid.cellCount);
  const aspect = new Uint8Array(grid.cellCount);
  const profileCurvature = new Int32Array(grid.cellCount);
  const planCurvature = new Int32Array(grid.cellCount);
  const watershedId = new Int32Array(grid.cellCount);
  watershedId.fill(1);
  const ridgeId = new Int32Array(grid.cellCount);
  const distance = new Uint8Array(grid.cellCount);

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const cellDistance = greaterRealmHexDistance({
      q: grid.q[cell]!,
      r: grid.r[cell]!,
    });
    distance[cell] = cellDistance;
    elevation[cell] =
      cellDistance === 0
        ? -400
        : cellDistance === 1
          ? 2_200 + grid.q[cell]! * 40 + grid.r[cell]! * 25
          : 6_400 + grid.q[cell]! * 110 + grid.r[cell]! * 70;
    sedimentDepth[cell] = (cell % 4) * 8;
    preErosionElevation[cell] = elevation[cell]! + (cell % 3) * 64;
    slope[cell] = cellDistance === 2
      ? [260, 620, 1_100, 1_800][cell % 4]!
      : 750;
    aspect[cell] = cell % 7;
    profileCurvature[cell] = (cell % 5 - 2) * 700;
    planCurvature[cell] = (cell % 7 - 3) * 500;

    if (grid.q[cell] === 1 && grid.r[cell] === 0) {
      waterRegime[cell] = WATER_OCEAN;
      biomeId[cell] = GREATER_REALM_BIOME_ID.SALTWATER;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.ISLAND_SHELF;
    } else if (cellDistance <= 1) {
      waterRegime[cell] = WATER_RIVER;
      biomeId[cell] = GREATER_REALM_BIOME_ID.RIVER_STREAM;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.WATERCOURSE;
    } else {
      waterRegime[cell] = WATER_DRY;
      ridgeId[cell] = 1;
      biomeId[cell] = GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND;
      landformId[cell] =
        cell % 6 === 0 || cell % 6 === 1
          ? GREATER_REALM_LANDFORM_ID.BASIN
          : cell % 3 === 0
            ? GREATER_REALM_LANDFORM_ID.ALPINE_PLATEAU
            : GREATER_REALM_LANDFORM_ID.MOUNTAIN;
    }
  }

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (distance[cell] === 0) continue;
    let receiver = -1;
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = grid.neighbors[cell * 6 + direction]!;
      if (neighbor < 0 || distance[neighbor]! >= distance[cell]!) continue;
      if (receiver < 0 || neighbor < receiver) receiver = neighbor;
    }
    if (receiver < 0) throw new Error('fixture receiver missing');
    flowReceiver[cell] = receiver;
  }
  const descendingCells = Array.from(
    { length: grid.cellCount },
    (_, cell) => cell,
  ).sort((first, second) =>
    distance[second]! - distance[first]! || first - second
  );
  for (const cell of descendingCells) {
    const receiver = flowReceiver[cell]!;
    if (receiver >= 0) {
      flowAccumulation[receiver] += flowAccumulation[cell]!;
    }
  }
  distance.fill(0);
  descendingCells.fill(0);

  return Object.freeze({
    grid,
    regionId,
    geomorphologyCoastalClass,
    elevation,
    preErosionElevation,
    sedimentDepth,
    flowReceiver,
    flowAccumulation,
    waterRegime,
    biomeId,
    landformId,
    slope,
    aspect,
    profileCurvature,
    planCurvature,
    watershedId,
    ridgeId,
  });
}

function landDetourStraitFixture(): GreaterRealmTopographicQaInput {
  const coordinates: AxialCoordinate[] = [{ q: -1, r: 15 }];
  for (let q = 0; q <= 5; q += 1) {
    for (let r = 0; r < 32; r += 1) coordinates.push({ q, r });
  }
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const elevation = new Int32Array(grid.cellCount);
  const preErosionElevation = new Int32Array(grid.cellCount);
  const sedimentDepth = new Uint16Array(grid.cellCount);
  const flowReceiver = new Int32Array(grid.cellCount);
  flowReceiver.fill(-1);
  const flowAccumulation = new BigUint64Array(grid.cellCount);
  flowAccumulation.fill(1n);
  const waterRegime = new Uint8Array(grid.cellCount);
  const biomeId = new Uint8Array(grid.cellCount);
  const landformId = new Uint8Array(grid.cellCount);
  const slope = new Uint16Array(grid.cellCount);
  const aspect = new Uint8Array(grid.cellCount);
  aspect.fill(6);
  const regionId = new Uint8Array(grid.cellCount);
  regionId.fill(4);
  const watershedId = new Int32Array(grid.cellCount);
  watershedId.fill(1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const water = grid.q[cell] === -1
      || grid.q[cell] === 2
      || grid.q[cell] === 3;
    elevation[cell] = water ? -1_000 : 1_000;
    preErosionElevation[cell] = elevation[cell]!;
    waterRegime[cell] = water ? WATER_OCEAN : WATER_DRY;
    biomeId[cell] = water
      ? GREATER_REALM_BIOME_ID.SALTWATER
      : GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND;
    landformId[cell] = water
      ? GREATER_REALM_LANDFORM_ID.ISLAND_SHELF
      : GREATER_REALM_LANDFORM_ID.LOWLAND;
  }
  return Object.freeze({
    grid,
    regionId,
    geomorphologyCoastalClass: new Uint8Array(grid.cellCount),
    elevation,
    preErosionElevation,
    sedimentDepth,
    flowReceiver,
    flowAccumulation,
    waterRegime,
    biomeId,
    landformId,
    slope,
    aspect,
    profileCurvature: new Int32Array(grid.cellCount),
    planCurvature: new Int32Array(grid.cellCount),
    watershedId,
    ridgeId: new Int32Array(grid.cellCount),
  });
}

function oasisInfluenceFixture(
  distance: number,
  options: Readonly<{
    foreignIntermediate?: boolean;
    saltwaterIntermediate?: boolean;
    saltMarshEndpoint?: boolean;
  }> = {},
): GreaterRealmTopographicQaInput {
  const coordinates = Array.from(
    { length: distance + 1 },
    (_, q) => ({ q, r: 0 }),
  );
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const cellAt = (q: number): number => {
    const cell = grid.indexOf({ q, r: 0 });
    if (cell < 0) throw new Error(`oasis fixture cell missing: ${q},0`);
    return cell;
  };
  const elevation = new Int32Array(grid.cellCount);
  elevation.fill(1_000);
  const preErosionElevation = new Int32Array(elevation);
  const sedimentDepth = new Uint16Array(grid.cellCount);
  const flowReceiver = new Int32Array(grid.cellCount);
  flowReceiver.fill(-1);
  const flowAccumulation = new BigUint64Array(grid.cellCount);
  flowAccumulation.fill(1n);
  const waterRegime = new Uint8Array(grid.cellCount);
  const biomeId = new Uint8Array(grid.cellCount);
  biomeId.fill(GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND);
  const landformId = new Uint8Array(grid.cellCount);
  landformId.fill(GREATER_REALM_LANDFORM_ID.LOWLAND);
  const slope = new Uint16Array(grid.cellCount);
  slope.fill(100);
  const aspect = new Uint8Array(grid.cellCount);
  aspect.fill(6);
  const profileCurvature = new Int32Array(grid.cellCount);
  const planCurvature = new Int32Array(grid.cellCount);
  const watershedId = new Int32Array(grid.cellCount);
  watershedId.fill(1);
  const ridgeId = new Int32Array(grid.cellCount);
  const regionId = new Uint8Array(grid.cellCount);
  regionId.fill(2);
  const geomorphologyCoastalClass = new Uint8Array(grid.cellCount);
  const freshwater = cellAt(0);
  const aridMargin = cellAt(distance);
  waterRegime[freshwater] = WATER_LAKE;
  biomeId[freshwater] = GREATER_REALM_BIOME_ID.LAKE;
  landformId[freshwater] = GREATER_REALM_LANDFORM_ID.LAKE_BASIN;
  if (options.saltMarshEndpoint) {
    waterRegime[freshwater] = WATER_MARSH;
    biomeId[freshwater] = GREATER_REALM_BIOME_ID.SALT_MARSH;
    landformId[freshwater] = GREATER_REALM_LANDFORM_ID.BASIN;
  }
  biomeId[aridMargin] = GREATER_REALM_BIOME_ID.DUNE_DESERT;
  landformId[aridMargin] = GREATER_REALM_LANDFORM_ID.DUNE;
  if (options.foreignIntermediate) {
    regionId[cellAt(Math.max(1, distance - 1))] = 3;
  }
  if (options.saltwaterIntermediate) {
    const saltwater = cellAt(Math.max(1, distance - 1));
    waterRegime[saltwater] = WATER_OCEAN;
    biomeId[saltwater] = GREATER_REALM_BIOME_ID.SALTWATER;
    landformId[saltwater] = GREATER_REALM_LANDFORM_ID.ISLAND_SHELF;
  }
  return Object.freeze({
    grid,
    regionId,
    geomorphologyCoastalClass,
    elevation,
    preErosionElevation,
    sedimentDepth,
    flowReceiver,
    flowAccumulation,
    waterRegime,
    biomeId,
    landformId,
    slope,
    aspect,
    profileCurvature,
    planCurvature,
    watershedId,
    ridgeId,
  });
}

function histogramTotal(histogram: Readonly<{
  counts: readonly number[];
  underflowCount: number;
  overflowCount: number;
}>): number {
  return histogram.counts.reduce((total, count) => total + count, 0)
    + histogram.underflowCount
    + histogram.overflowCount;
}

function collectViews(value: unknown, views = new Set<ArrayBufferView>()): Set<ArrayBufferView> {
  if (ArrayBuffer.isView(value)) {
    views.add(value);
    return views;
  }
  if (value === null || typeof value !== 'object') return views;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectViews(nested, views);
  }
  return views;
}

function everyNumericViewValueIsZero(view: ArrayBufferView): boolean {
  if (view instanceof BigInt64Array || view instanceof BigUint64Array) {
    return view.every(value => value === 0n);
  }
  if (
    view instanceof Int8Array
    || view instanceof Uint8Array
    || view instanceof Uint8ClampedArray
    || view instanceof Int16Array
    || view instanceof Uint16Array
    || view instanceof Int32Array
    || view instanceof Uint32Array
    || view instanceof Float32Array
    || view instanceof Float64Array
  ) return view.every(value => value === 0);
  return true;
}

function expectCoordinateFree(value: unknown): void {
  const forbiddenKeys = new Set([
    'q',
    'r',
    'coordinate',
    'coordinates',
    'cell',
    'cellIndex',
    'cellIndexes',
    'indices',
  ]);
  const visit = (nested: unknown): void => {
    expect(ArrayBuffer.isView(nested)).toBe(false);
    if (nested === null || typeof nested !== 'object') return;
    for (const [key, child] of Object.entries(
      nested as Record<string, unknown>,
    )) {
      expect(forbiddenKeys.has(key)).toBe(false);
      visit(child);
    }
  };
  visit(value);
}

describe('Greater Realm coordinate-free topographic QA', () => {
  it('measures the complete fixed aggregate report deterministically', () => {
    const input = fixture();
    const originalElevation = new Int32Array(input.elevation);
    const originalReceiver = new Int32Array(input.flowReceiver);
    const first = measureGreaterRealmTopographicQa(input);
    const second = measureGreaterRealmTopographicQa(input);

    expect(first).toEqual(second);
    expect(first.version).toBe(GREATER_REALM_TOPOGRAPHIC_QA_VERSION);
    expect(first.version).toBe('greater-realm-topographic-qa-v2');
    expect(first.cellCount).toBe(19);
    expect(first.landCellCount).toBe(12);
    expect(first.waterCellCount).toBe(7);
    expect(first.elevation.hypsometricCurve).toHaveLength(21);
    expect(first.elevation.hypsometricCurve[0]!.landAreaAboveBasisPoints).toBe(0);
    expect(first.elevation.hypsometricCurve.at(-1)!.landAreaAboveBasisPoints).toBe(10_000);
    expect(histogramTotal(first.elevation.allCellsHistogram)).toBe(19);
    expect(histogramTotal(first.elevation.landCellsHistogram)).toBe(12);
    expect(histogramTotal(first.slope.histogram)).toBe(12);
    expect(first.elevation.allCellsHistogram.counts).toHaveLength(
      GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.elevation.count,
    );
    expect(first.slope.histogram.counts).toHaveLength(
      GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.slope.count,
    );
    expect(first.landforms).toHaveLength(18);
    expect(first.landforms.reduce((total, entry) => total + entry.count, 0)).toBe(19);
    expect(first.ridges.cellCount).toBe(12);
    expect(first.ridges.componentCount).toBe(1);
    expect(first.ridges.connectedEdgeCount).toBeGreaterThan(0);
    expect(first.watersheds.watershedCount).toBe(1);
    expect(first.watersheds.largestWatershedCells).toBe(19);
    expect(first.rivers.channelCellCount).toBe(6);
    expect(first.rivers.channelEdgeCount).toBe(5);
    expect(first.rivers.maximumStrahlerOrder).toBe(2);
    expect(first.rivers.strahlerOrderCellCounts[0]).toBe(5);
    expect(first.rivers.strahlerOrderCellCounts[1]).toBe(1);
    expect(first.rivers.drainageDensityBasisPoints).toBeGreaterThan(0);
    expect(first.rivers.strahlerOrderCellCounts).toHaveLength(32);
    expect(first.mountainChains.cellCount).toBe(12);
    expect(first.mountainChains.componentCount).toBe(1);
    expect(
      first.mountainChains.maximumTwoSweepGraphSpanCells,
    ).toBeGreaterThan(1);
    expect(first.plateaus.cellCount).toBeGreaterThan(0);
    expect(first.basins.cellCount).toBeGreaterThan(0);
    expect(first.coastalSlopes.coastalLandCellCount).toBeGreaterThan(0);
    expect(Number(first.erosion.totalErodedUnits)).toBeGreaterThan(0);
    expect(Number(first.sediment.totalDepositedUnits)).toBeGreaterThan(0);
    expect(first.biomeElevationConsistency.inconsistentCellCount).toBe(0);
    expect(first.axialArtifacts.aspectCellCounts).toHaveLength(7);
    expect(first.axialArtifacts.axisEdgeCounts).toHaveLength(3);
    expect(first.roughness.edgeCount).toBeGreaterThan(0);
    expect(histogramTotal(first.roughness.absoluteElevationDeltaHistogram)).toBe(
      first.roughness.edgeCount,
    );
    expect(first.regionalHydrogeomorphology.proof).toBe(false);
    expect(first.regionalHydrogeomorphology.tierII.highlandChannelSourceCounts)
      .toEqual([0, 0, 0]);
    expect(Object.isFrozen(first.regionalHydrogeomorphology)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.elevation.hypsometricCurve)).toBe(true);
    expect(Object.isFrozen(first.rivers.strahlerOrderCellCounts)).toBe(true);
    expectCoordinateFree(first);
    expect(input.elevation).toEqual(originalElevation);
    expect(input.flowReceiver).toEqual(originalReceiver);
  });

  it('is invariant to caller coordinate traversal order', () => {
    expect(measureGreaterRealmTopographicQa(fixture())).toEqual(
      measureGreaterRealmTopographicQa(fixture(true)),
    );
  });

  it('rejects malformed fields, classifications, grids, labels, and flow', () => {
    const input = fixture();
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      slope: new Uint16Array(input.grid.cellCount - 1),
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_FIELD_LENGTH_INVALID');
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      slope: new Int32Array(input.grid.cellCount) as unknown as Uint16Array,
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_FIELD_TYPE_INVALID');

    const badWater = new Uint8Array(input.waterRegime);
    badWater[0] = 7;
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      waterRegime: badWater,
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_WATER_REGIME_INVALID');

    const badRegion = new Uint8Array(input.regionId);
    badRegion[0] = 10;
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      regionId: badRegion,
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_REGION_INVALID');

    const badCoastalClass = new Uint8Array(
      input.geomorphologyCoastalClass,
    );
    badCoastalClass[0] = GREATER_REALM_COASTAL_CLASS.glacialFjord + 1;
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      geomorphologyCoastalClass: badCoastalClass,
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_COASTAL_CLASS_INVALID');

    const disconnectedWatersheds = new Int32Array(input.watershedId);
    disconnectedWatersheds[input.grid.indexOf({ q: -2, r: 0 })] = 2;
    disconnectedWatersheds[input.grid.indexOf({ q: 2, r: 0 })] = 2;
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      watershedId: disconnectedWatersheds,
    })).toThrow(
      'GREATER_REALM_TOPOGRAPHIC_QA_WATERSHED_LABEL_DISCONNECTED',
    );

    const splitRidge = new Int32Array(input.ridgeId);
    splitRidge[input.grid.indexOf({ q: -2, r: 0 })] = 2;
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      ridgeId: splitRidge,
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_RIDGE_LABEL_DISCONNECTED');

    const cyclicReceiver = new Int32Array(input.flowReceiver);
    const center = input.grid.indexOf({ q: 0, r: 0 });
    const neighbor = input.grid.indexOf({ q: 1, r: 0 });
    cyclicReceiver[center] = neighbor;
    cyclicReceiver[neighbor] = center;
    const flatAccumulation = new BigUint64Array(input.grid.cellCount);
    flatAccumulation.fill(1n);
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      flowReceiver: cyclicReceiver,
      flowAccumulation: flatAccumulation,
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_FLOW_CYCLE');

    const brokenNeighbors = new Int32Array(input.grid.neighbors);
    brokenNeighbors[0] = -1;
    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      grid: Object.freeze({ ...input.grid, neighbors: brokenNeighbors }),
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_GRID_INVALID');
  });

  it('rejects a topologically valid but non-canonical grid reindexing', () => {
    const input = fixture();
    const cellCount = input.grid.cellCount;
    const q = new Int32Array(cellCount);
    const r = new Int32Array(cellCount);
    const neighbors = new Int32Array(cellCount * 6);
    for (let newCell = 0; newCell < cellCount; newCell += 1) {
      const oldCell = cellCount - 1 - newCell;
      q[newCell] = input.grid.q[oldCell]!;
      r[newCell] = input.grid.r[oldCell]!;
      for (let direction = 0; direction < 6; direction += 1) {
        const oldNeighbor = input.grid.neighbors[oldCell * 6 + direction]!;
        neighbors[newCell * 6 + direction] =
          oldNeighbor < 0 ? -1 : cellCount - 1 - oldNeighbor;
      }
    }
    const reindexed = Object.freeze({
      cellCount,
      q,
      r,
      neighbors,
      indexOf(coordinate: AxialCoordinate) {
        for (let cell = 0; cell < cellCount; cell += 1) {
          if (q[cell] === coordinate.q && r[cell] === coordinate.r) return cell;
        }
        return -1;
      },
    });

    expect(() => measureGreaterRealmTopographicQa({
      ...input,
      grid: reindexed,
    })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_GRID_INVALID');
  });

  it('does not let dry tributaries or a terminal ocean edge inflate river metrics', () => {
    const input = fixture();
    const report = measureGreaterRealmTopographicQa(input);
    expect(report.rivers.maximumStrahlerOrder).toBe(2);
    expect(report.rivers.strahlerOrderCellCounts[0]).toBe(5);
    expect(report.rivers.strahlerOrderCellCounts[1]).toBe(1);

    const waterRegime = new Uint8Array(input.waterRegime);
    const biomeId = new Uint8Array(input.biomeId);
    const landformId = new Uint8Array(input.landformId);
    let keptChannel = -1;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (waterRegime[cell] !== WATER_RIVER) continue;
      if (keptChannel < 0 && input.flowReceiver[cell]! >= 0) {
        keptChannel = cell;
        continue;
      }
      waterRegime[cell] = WATER_OCEAN;
      biomeId[cell] = GREATER_REALM_BIOME_ID.SALTWATER;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.ISLAND_SHELF;
    }
    expect(keptChannel).toBeGreaterThanOrEqual(0);
    const receiver = input.flowReceiver[keptChannel]!;
    waterRegime[receiver] = WATER_OCEAN;
    biomeId[receiver] = GREATER_REALM_BIOME_ID.SALTWATER;
    landformId[receiver] = GREATER_REALM_LANDFORM_ID.ISLAND_SHELF;

    const oneCellChannel = measureGreaterRealmTopographicQa({
      ...input,
      waterRegime,
      biomeId,
      landformId,
    });
    expect(oneCellChannel.rivers.channelCellCount).toBe(1);
    expect(oneCellChannel.rivers.channelEdgeCount).toBe(0);
    expect(oneCellChannel.rivers.outletCount).toBe(1);
    expect(oneCellChannel.rivers.maximumStrahlerOrder).toBe(1);
    expect(oneCellChannel.rivers.strahlerOrderCellCounts[0]).toBe(1);

    waterRegime[keptChannel] = WATER_OCEAN;
    biomeId[keptChannel] = GREATER_REALM_BIOME_ID.SALTWATER;
    landformId[keptChannel] = GREATER_REALM_LANDFORM_ID.ISLAND_SHELF;
    const noChannels = measureGreaterRealmTopographicQa({
      ...input,
      waterRegime,
      biomeId,
      landformId,
    });
    expect(noChannels.rivers.channelCellCount).toBe(0);
    expect(noChannels.rivers.channelEdgeCount).toBe(0);
    expect(noChannels.rivers.outletCount).toBe(0);
    expect(noChannels.rivers.maximumStrahlerOrder).toBe(0);
  });

  it('labels Mirefen lateral channel adjacency explicitly as a braiding proxy', () => {
    const input = fixture();
    const regionId = new Uint8Array(input.grid.cellCount);
    regionId.fill(3);
    const geomorphologyCoastalClass = new Uint8Array(input.grid.cellCount);
    geomorphologyCoastalClass.fill(
      GREATER_REALM_COASTAL_CLASS.deltaEstuary,
      0,
      GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
        .mirefenMinimumDeltaEstuaryCells,
    );
    let expectedProxyEdges = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (
        input.waterRegime[cell] !== WATER_RIVER
        || input.slope[cell]! > 1_200
      ) continue;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = input.grid.neighbors[cell * 6 + direction]!;
        if (
          neighbor <= cell
          || input.waterRegime[neighbor] !== WATER_RIVER
          || input.slope[neighbor]! > 1_200
          || input.flowReceiver[cell] === neighbor
          || input.flowReceiver[neighbor] === cell
        ) continue;
        expectedProxyEdges += 1;
      }
    }
    const report = measureGreaterRealmTopographicQa({
      ...input,
      regionId,
      geomorphologyCoastalClass,
    });

    expect(report.regionalHydrogeomorphology.mirefen).toMatchObject({
      deltaEstuaryCellCount:
        GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
          .mirefenMinimumDeltaEstuaryCells,
      braidedChannelProxyEdgeCount: expectedProxyEdges,
      proof: false,
    });
    expect(expectedProxyEdges).toBeGreaterThan(0);
  });

  it('treats up to two riparian cells as freshwater influence, not shoreline', () => {
    for (const distance of [2, 3]) {
      const input = oasisInfluenceFixture(distance);
      try {
        const report = measureGreaterRealmTopographicQa(input);
        expect(report.regionalHydrogeomorphology.sunscar).toMatchObject({
          oasisMarginCellCount: 1,
          oasisSystemCount: 1,
        });
      } finally {
        input.grid.clearIndex?.();
      }
    }

    const beyondInfluence = oasisInfluenceFixture(4);
    try {
      const report = measureGreaterRealmTopographicQa(beyondInfluence);
      expect(report.regionalHydrogeomorphology.sunscar).toMatchObject({
        oasisMarginCellCount: 0,
        oasisSystemCount: 0,
      });
    } finally {
      beyondInfluence.grid.clearIndex?.();
    }
  });

  it('does not carry oasis influence across a foreign region or saltwater', () => {
    for (const options of [
      { foreignIntermediate: true },
      { saltwaterIntermediate: true },
    ]) {
      const input = oasisInfluenceFixture(3, options);
      try {
        const report = measureGreaterRealmTopographicQa(input);
        expect(report.regionalHydrogeomorphology.sunscar).toMatchObject({
          oasisMarginCellCount: 0,
          oasisSystemCount: 0,
        });
      } finally {
        input.grid.clearIndex?.();
      }
    }
  });

  it('does not treat a coastal salt-marsh endpoint as freshwater oasis influence', () => {
    const input = oasisInfluenceFixture(3, { saltMarshEndpoint: true });
    try {
      const report = measureGreaterRealmTopographicQa(input);
      expect(report.regionalHydrogeomorphology.sunscar).toMatchObject({
        oasisMarginCellCount: 0,
        oasisSystemCount: 0,
      });
    } finally {
      input.grid.clearIndex?.();
    }
  });

  it('does not count a Stonewake strait reached only by crossing island land', () => {
    const report = measureGreaterRealmTopographicQa(
      landDetourStraitFixture(),
    );

    expect(report.regionalHydrogeomorphology.stonewake).toMatchObject({
      meaningfulIslandCount: 2,
      // Only the two 32-cell saltwater gap columns see both islands. The
      // isolated west-coast water cell would be a false 65th match if the BFS
      // were allowed to cross the first island as a shortcut.
      narrowIslandStraitCellCount: 64,
      proof: false,
    });
  });

  it('reports biome/elevation inconsistencies without turning QA into a gate', () => {
    const input = fixture();
    const biomeId = new Uint8Array(input.biomeId);
    const firstLand = input.waterRegime.findIndex(value => value === WATER_DRY);
    biomeId[firstLand] = GREATER_REALM_BIOME_ID.SALTWATER;
    const report = measureGreaterRealmTopographicQa({ ...input, biomeId });

    expect(report.biomeElevationConsistency.waterRegimeMismatchCount).toBe(1);
    expect(report.biomeElevationConsistency.inconsistentCellCount).toBe(1);
    expect(report.biomeElevationConsistency.consistentCellCount).toBe(18);
  });

  it('keeps frozen legacy reconciliation out of erosion and sediment process totals', () => {
    const input = fixture();
    const legacyProtectedCell = new Uint8Array(input.grid.cellCount);
    const protectedCell = input.waterRegime.findIndex(value => value === WATER_DRY);
    expect(protectedCell).toBeGreaterThanOrEqual(0);
    legacyProtectedCell[protectedCell] = 1;
    const elevation = new Int32Array(input.elevation);
    const preErosionElevation = new Int32Array(input.preErosionElevation);
    const sedimentDepth = new Uint16Array(input.sedimentDepth);
    elevation[protectedCell] = preErosionElevation[protectedCell]! + 20_000;
    sedimentDepth[protectedCell] = 4_000;

    const withoutMask = measureGreaterRealmTopographicQa({
      ...input,
      elevation,
      preErosionElevation,
      sedimentDepth,
    });
    const withMask = measureGreaterRealmTopographicQa({
      ...input,
      elevation,
      preErosionElevation,
      sedimentDepth,
      legacyProtectedCell,
    });

    expect(Number(withoutMask.erosion.totalNonSedimentaryGainUnits))
      .toBeGreaterThan(Number(withMask.erosion.totalNonSedimentaryGainUnits));
    expect(Number(withoutMask.sediment.totalDepositedUnits))
      .toBe(Number(withMask.sediment.totalDepositedUnits) + 4_000);
    expect(withMask.elevation.maximum).toBe(elevation[protectedCell]);
  });

  it('accepts marsh as non-dry low-gradient wetland, never as a channel', () => {
    const input = fixture();
    const waterRegime = new Uint8Array(input.waterRegime);
    const biomeId = new Uint8Array(input.biomeId);
    const landformId = new Uint8Array(input.landformId);
    const slope = new Uint16Array(input.slope);
    const marsh = waterRegime.findIndex((value, cell) =>
      value === WATER_RIVER && input.flowReceiver[cell]! >= 0
    );
    waterRegime[marsh] = WATER_MARSH;
    biomeId[marsh] = GREATER_REALM_BIOME_ID.FRESHWATER_MARSH;
    landformId[marsh] = GREATER_REALM_LANDFORM_ID.BASIN;
    slope[marsh] = 420;

    const report = measureGreaterRealmTopographicQa({
      ...input,
      waterRegime,
      biomeId,
      landformId,
      slope,
    });

    expect(report.landCellCount).toBe(12);
    expect(report.waterCellCount).toBe(7);
    expect(report.rivers.channelCellCount).toBe(5);
    expect(report.rivers.channelEdgeCount).toBe(4);
    expect(report.biomeElevationConsistency.marshCellCount).toBe(1);
    expect(
      report.biomeElevationConsistency.lowGradientMarshCellCount,
    ).toBe(1);
    expect(
      report.biomeElevationConsistency.highGradientMarshCellCount,
    ).toBe(0);
    expect(
      report.biomeElevationConsistency.marshClassificationMismatchCount,
    ).toBe(0);
    expect(report.biomeElevationConsistency.inconsistentCellCount).toBe(0);
  });

  it('zeroizes owned typed scratch on success and on a late failure', () => {
    const input = fixture();
    const callerViews = collectViews(input);
    const spies = [
      vi.spyOn(Uint8Array.prototype, 'fill'),
      vi.spyOn(Uint16Array.prototype, 'fill'),
      vi.spyOn(Uint32Array.prototype, 'fill'),
      vi.spyOn(Int32Array.prototype, 'fill'),
      vi.spyOn(Float64Array.prototype, 'fill'),
      vi.spyOn(BigInt64Array.prototype, 'fill'),
    ] as const;
    try {
      measureGreaterRealmTopographicQa(input);

      const lateFailureInput = fixture();
      const allWater = new Uint8Array(lateFailureInput.grid.cellCount);
      allWater.fill(WATER_OCEAN);
      const saltwaterBiomes = new Uint8Array(lateFailureInput.grid.cellCount);
      saltwaterBiomes.fill(GREATER_REALM_BIOME_ID.SALTWATER);
      const shelfLandforms = new Uint8Array(lateFailureInput.grid.cellCount);
      shelfLandforms.fill(GREATER_REALM_LANDFORM_ID.ISLAND_SHELF);
      const noRidges = new Int32Array(lateFailureInput.grid.cellCount);
      for (const view of collectViews(lateFailureInput)) callerViews.add(view);
      callerViews.add(allWater);
      callerViews.add(saltwaterBiomes);
      callerViews.add(shelfLandforms);
      callerViews.add(noRidges);
      expect(() => measureGreaterRealmTopographicQa({
        ...lateFailureInput,
        waterRegime: allWater,
        biomeId: saltwaterBiomes,
        landformId: shelfLandforms,
        ridgeId: noRidges,
      })).toThrow('GREATER_REALM_TOPOGRAPHIC_QA_LAND_MISSING');

      const ownedReceivers = new Set<ArrayBufferView>();
      for (const spy of spies) {
        for (const receiver of spy.mock.instances as unknown as ArrayBufferView[]) {
          if (!callerViews.has(receiver)) ownedReceivers.add(receiver);
        }
      }
      expect(ownedReceivers.size).toBeGreaterThan(30);
      expect(
        [...ownedReceivers].every(everyNumericViewValueIsZero),
      ).toBe(true);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
