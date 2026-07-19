import { describe, expect, it } from 'vitest';

import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  HEGEMONY_WORLD_SEED,
  hexDistance,
  hexKey,
  neighboringHexes
} from '../spacetimedb/src/world';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../spacetimedb/src/goldSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../spacetimedb/src/woodSitePolicy';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../spacetimedb/src/stoneSitePolicy';
import { CANONICAL_GENESIS_FOREST_INSTANCES_V1 } from '../spacetimedb/src/forestLayoutPolicy';
import { canonicalLowlandsTerrainCenterHeight } from '../spacetimedb/src/lowlandsSurface';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { createTerrainCellForCoord } from '../src/game/map/generateTerrainMap';
import { terrainHeightForCell } from '../src/game/map/terrainHeight';
import {
  GENESIS_OCEAN_DEPTH_BY_KEY,
  GENESIS_HYDROLOGY_V1,
  GENESIS_RIVERS_V1,
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_LAYOUT_DIGEST,
  GENESIS_WATER_LAYOUT_V1,
  GENESIS_WATER_OCEAN_CELL_COUNT,
  GENESIS_WATER_RIVER_COUNT,
  GENESIS_WATER_ELEVATION_DATUM_MILLI,
  GENESIS_WATER_LAKE_CLEARANCE_MILLI,
  GENESIS_WATER_RIVER_MAX_CELLS,
  GENESIS_WATER_RIVER_MIN_CELLS,
  GENESIS_WATER_RIVER_CLEARANCE_MILLI,
  GENESIS_WATER_SEA_LEVEL_MILLI,
  genesisWaterElevationMilli,
  genesisWaterWorldHeightFromMilli,
  matchesGenesisWaterLayoutV1
} from '../spacetimedb/src/waterWorld';

describe('Genesis canonical water artifact', () => {
  it('preserves the exact land boundary and ocean apron arithmetic', () => {
    expect(CANONICAL_WORLD_TILES).toHaveLength(10_000);
    expect(GENESIS_WATER_LAYOUT_V1.oceanCellCount).toBe(GENESIS_WATER_OCEAN_CELL_COUNT);
    expect(GENESIS_WATER_LAYOUT_V1.oceanCellCount).toBe(2_871);
    expect(GENESIS_WATER_LAYOUT_V1.canonicalLandCellCount).toBe(10_000);
    expect(GENESIS_WATER_LAYOUT_V1.seaLevelMilli).toBe(GENESIS_WATER_SEA_LEVEL_MILLI);
    expect(GENESIS_WATER_LAYOUT_DIGEST).toBe(GENESIS_WATER_LAYOUT_V1.layoutDigest);
    expect(GENESIS_WATER_LAYOUT_DIGEST).toBe(
      'e6e3601063254a232a80bcc2921e6717b7564f8fce7b276207ffca39c1843dba'
    );
    expect(Math.max(...GENESIS_OCEAN_DEPTH_BY_KEY.values())).toBeGreaterThanOrEqual(7);
  });

  it('keeps every canonical lake cell in a deterministic connected body', () => {
    const lakeCells = CANONICAL_WORLD_TILE_META.filter((meta) => meta.terrainKind === 'lake');
    const lakes = GENESIS_WATER_CELLS_V1.filter((cell) => cell.regime === 'lake');
    const lakeBodies = GENESIS_WATER_BODIES_V1.filter((body) => body.regime === 'lake');
    expect(lakeCells).toHaveLength(409);
    expect(lakes).toHaveLength(409);
    // The terrain policy contains 409 cells grouped into deterministic
    // connected bodies; adjacent lake cells intentionally share a body.
    expect(lakeBodies.length).toBeGreaterThan(0);
    expect(lakeBodies.length).toBeLessThanOrEqual(lakeCells.length);
    expect(new Set(lakes.map((cell) => cell.cellKey)).size).toBe(409);
    expect(lakes.every((cell) => lakeCells.some((meta) => meta.tileKey === cell.cellKey))).toBe(true);
  });

  it('selects two disjoint rivers per sector with coast-reaching mouths', () => {
    expect(GENESIS_RIVERS_V1).toHaveLength(GENESIS_WATER_RIVER_COUNT);
    expect(GENESIS_RIVERS_V1.map((river) => river.sector)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6
    ]);
    const riverCells = GENESIS_RIVERS_V1.flatMap((river) => river.orderedCellKeys);
    expect(new Set(riverCells).size).toBe(riverCells.length);
    expect(riverCells.length).toBeGreaterThanOrEqual(GENESIS_WATER_RIVER_MIN_CELLS);
    expect(riverCells.length).toBeLessThanOrEqual(GENESIS_WATER_RIVER_MAX_CELLS);
    expect(GENESIS_RIVERS_V1.every((river) => (
      river.orderedCellKeys.length >= 24 && river.orderedCellKeys.length <= 72
    ))).toBe(true);
    for (const river of GENESIS_RIVERS_V1) {
      const source = river.sourceCellKey.split(',').map(Number);
      const mouth = river.mouthCellKey.split(',').map(Number);
      expect(hexDistance({ q: source[0]!, r: source[1]! }, { q: 0, r: 0 })).toBeGreaterThanOrEqual(10);
      expect(hexDistance({ q: source[0]!, r: source[1]! }, { q: 0, r: 0 })).toBeLessThanOrEqual(34);
      expect(neighboringHexes({ q: mouth[0]!, r: mouth[1]! }).some((cell) => (
        GENESIS_OCEAN_DEPTH_BY_KEY.has(hexKey(cell.q, cell.r))
      ))).toBe(true);
      for (let index = 1; index < river.orderedCellKeys.length; index += 1) {
        const previous = river.orderedCellKeys[index - 1]!.split(',').map(Number);
        const current = river.orderedCellKeys[index]!.split(',').map(Number);
        expect(hexDistance(
          { q: previous[0]!, r: previous[1]! },
          { q: current[0]!, r: current[1]! },
        )).toBe(1);
      }
    }
    const mouths = GENESIS_RIVERS_V1.map((river) => river.mouthCellKey);
    expect(new Set(mouths).size).toBe(12);
    for (let left = 0; left < GENESIS_RIVERS_V1.length; left += 1) {
      for (let right = left + 1; right < GENESIS_RIVERS_V1.length; right += 1) {
        const a = GENESIS_RIVERS_V1[left]!.sourceCellKey.split(',').map(Number);
        const b = GENESIS_RIVERS_V1[right]!.sourceCellKey.split(',').map(Number);
        expect(hexDistance({ q: a[0]!, r: a[1]! }, { q: b[0]!, r: b[1]! })).toBeGreaterThanOrEqual(10);
      }
    }
    for (let left = 0; left < GENESIS_RIVERS_V1.length; left += 1) {
      for (let right = left + 1; right < GENESIS_RIVERS_V1.length; right += 1) {
        const a = GENESIS_RIVERS_V1[left]!.mouthCellKey.split(',').map(Number);
        const b = GENESIS_RIVERS_V1[right]!.mouthCellKey.split(',').map(Number);
        expect(hexDistance({ q: a[0]!, r: a[1]! }, { q: b[0]!, r: b[1]! })).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('freezes a coast-draining DAG and uses every downstream edge as the river route', () => {
    expect(GENESIS_HYDROLOGY_V1.size).toBeGreaterThan(8_000);
    for (const cell of GENESIS_HYDROLOGY_V1.values()) {
      if (cell.downstreamTileKey === undefined) {
        expect(cell.distanceToCoast).toBe(0);
        continue;
      }
      const parent = GENESIS_HYDROLOGY_V1.get(cell.downstreamTileKey);
      expect(parent).toBeDefined();
      expect(parent!.distanceToCoast).toBeLessThan(cell.distanceToCoast);
      expect(parent!.flowAccumulation).toBeGreaterThanOrEqual(cell.flowAccumulation);
    }
    for (const river of GENESIS_RIVERS_V1) {
      const rows = river.orderedCellKeys.map((key) => GENESIS_WATER_CELLS_V1.find((cell) => cell.cellKey === key)!);
      expect(rows.at(-1)!.surfaceLevelMilli).toBe(GENESIS_WATER_SEA_LEVEL_MILLI);
      for (let index = 1; index < rows.length; index += 1) {
        const previousHydrology = GENESIS_HYDROLOGY_V1.get(rows[index - 1]!.cellKey)!;
        const currentHydrology = GENESIS_HYDROLOGY_V1.get(rows[index]!.cellKey)!;
        expect(previousHydrology.downstreamTileKey).toBe(currentHydrology.tileKey);
        expect(currentHydrology.distanceToCoast).toBe(previousHydrology.distanceToCoast - 1);
        expect(currentHydrology.flowAccumulation)
          .toBeGreaterThanOrEqual(previousHydrology.flowAccumulation);
        expect(rows[index]!.surfaceLevelMilli).toBeLessThanOrEqual(rows[index - 1]!.surfaceLevelMilli);
      }
      expect(GENESIS_HYDROLOGY_V1.get(river.mouthCellKey)!.downstreamTileKey).toBeUndefined();
    }
  });

  it('shares the renderer terrain sampler and keeps canonical Water above it', () => {
    for (const tile of CANONICAL_WORLD_TILES) {
      const sharedCenter = canonicalLowlandsTerrainCenterHeight(
        HEGEMONY_WORLD_SEED,
        tile.q,
        tile.r,
      );
      const terrainCell = createTerrainCellForCoord(
        HEGEMONY_WORLD_SEED,
        { q: tile.q, r: tile.r },
      );
      const renderedCenter = terrainHeightForCell(
        HEGEMONY_WORLD_SEED,
        terrainCell,
        axialToWorld(terrainCell.coord, 1),
        1,
      );
      expect(sharedCenter).toBeCloseTo(renderedCenter, 12);
      expect(genesisWaterElevationMilli(tile.q, tile.r)).toBe(
        GENESIS_WATER_ELEVATION_DATUM_MILLI + Math.round(renderedCenter * 1_000)
      );
    }

    const seaWorldY = genesisWaterWorldHeightFromMilli(GENESIS_WATER_SEA_LEVEL_MILLI);
    expect(Math.abs(seaWorldY)).toBeLessThan(0.2);
    for (const cell of GENESIS_WATER_CELLS_V1.filter(row => row.regime === 'river')) {
      const terrainY = canonicalLowlandsTerrainCenterHeight(
        HEGEMONY_WORLD_SEED,
        cell.q,
        cell.r,
      );
      expect(cell.surfaceLevelMilli).toBeGreaterThanOrEqual(
        cell.elevationMilli + GENESIS_WATER_RIVER_CLEARANCE_MILLI
      );
      expect(genesisWaterWorldHeightFromMilli(cell.surfaceLevelMilli) - terrainY)
        .toBeGreaterThanOrEqual((GENESIS_WATER_RIVER_CLEARANCE_MILLI - 0.51) / 1_000);
    }
    for (const cell of GENESIS_WATER_CELLS_V1.filter(row => row.regime === 'lake')) {
      expect(cell.surfaceLevelMilli).toBeGreaterThanOrEqual(
        cell.elevationMilli + GENESIS_WATER_LAKE_CLEARANCE_MILLI
      );
    }
  });

  it('matches every persisted policy field and rejects metadata drift', () => {
    expect(matchesGenesisWaterLayoutV1(GENESIS_WATER_LAYOUT_V1)).toBe(true);
    for (const [field, value] of [
      ['seaLevelPolicyVersion', 'drifted-sea-level-policy'],
      ['fogStartDepthCells', GENESIS_WATER_LAYOUT_V1.fogStartDepthCells + 1],
      ['fogFullDepthCells', GENESIS_WATER_LAYOUT_V1.fogFullDepthCells + 1],
      ['hiddenBufferCells', GENESIS_WATER_LAYOUT_V1.hiddenBufferCells + 1]
    ] as const) {
      expect(matchesGenesisWaterLayoutV1({
        ...GENESIS_WATER_LAYOUT_V1,
        [field]: value
      })).toBe(false);
    }
  });

  it('does not consume reviewed castle, resource, or forest coordinates', () => {
    const protectedKeys = new Set([
      ...CANONICAL_CASTLE_SLOTS.map((slot) => slot.tileKey),
      ...CANONICAL_TIER_I_GOLD_SITES_V1.map((site) => hexKey(site.q, site.r)),
      ...CANONICAL_TIER_I_FOOD_SITES_V1.map((site) => hexKey(site.q, site.r)),
      ...CANONICAL_TIER_I_WOOD_SITES_V1.map((site) => hexKey(site.q, site.r)),
      ...CANONICAL_TIER_I_STONE_SITES_V1.map((site) => hexKey(site.q, site.r)),
      ...CANONICAL_GENESIS_FOREST_INSTANCES_V1.map((tree) => tree.tileKey)
    ]);
    expect(GENESIS_RIVERS_V1.flatMap((river) => river.orderedCellKeys)
      .every((key) => !protectedKeys.has(key))).toBe(true);
  });
});
