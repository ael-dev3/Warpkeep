import { describe, expect, it } from 'vitest';

import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { terrainHeightForCell } from '../src/game/map/terrainHeight';
import {
  createHegemonyCastlePlacements,
  createHegemonyKeepPlacement,
  EMPTY_TERRAIN_PLACEMENTS,
  HEGEMONY_KEEP_PLACEMENT,
  HEGEMONY_TERRAIN_PLACEMENTS,
  placementInfluenceAtWorld,
  terrainPlacementsAtCoord,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from '../src/game/map/terrainPlacements';

describe('Hegemony keep terrain placement', () => {
  it('is flat through the footprint, blends smoothly, and reaches zero before the cell edge', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 4);
    const cell = terrainCellByCoord(map, { q: 0, r: 0 })!;
    const center = { x: 0, z: 0 };
    const inside = { x: 0.32, z: 0 };
    const blend = { x: 0.56, z: 0 };
    const outside = { x: 0.76, z: 0 };
    const edge = { x: Math.sqrt(3) / 2, z: 0 };

    const centerHeight = terrainHeightForCell(
      map.worldSeed,
      cell,
      center,
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );
    expect(terrainHeightForCell(map.worldSeed, cell, inside, 1, HEGEMONY_TERRAIN_PLACEMENTS))
      .toBeCloseTo(centerHeight, 8);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, blend, 1)).toBeGreaterThan(0);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, blend, 1)).toBeLessThan(1);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, outside, 1)).toBe(0);
    expect(terrainHeightForCell(map.worldSeed, cell, edge, 1, HEGEMONY_TERRAIN_PLACEMENTS)).toBeCloseTo(
      terrainHeightForCell(map.worldSeed, cell, edge, 1, []),
      10
    );
  });

  it('moves the flat foundation to an authoritative off-center castle cell', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 4);
    const coord = { q: 2, r: -1 } as const;
    const cell = terrainCellByCoord(map, coord)!;
    const center = axialToWorld(coord, 1);
    const inside = { x: center.x + 0.32, z: center.z };
    const placement = createHegemonyKeepPlacement('own-keep', coord);
    const placements = [placement] as const;

    const centerHeight = terrainHeightForCell(map.worldSeed, cell, center, 1, placements);
    expect(terrainHeightForCell(map.worldSeed, cell, inside, 1, placements))
      .toBeCloseTo(centerHeight, 8);
    expect(placementInfluenceAtWorld(placement, center, 1)).toBe(1);

    const originCell = terrainCellByCoord(map, { q: 0, r: 0 })!;
    const origin = axialToWorld(originCell.coord, 1);
    expect(terrainHeightForCell(map.worldSeed, originCell, origin, 1, placements))
      .toBeCloseTo(terrainHeightForCell(map.worldSeed, originCell, origin, 1, []), 10);
  });

  it('keeps adjacent castle foundations while deterministically collapsing exact tile collisions', () => {
    const locations = [
      { id: 'own', coord: { q: 2, r: -1 } },
      { id: 'peer-later', coord: { q: 1, r: 0 } },
      { id: 'duplicate-peer', coord: { q: 2, r: -1 } },
      { id: 'peer-neighbor', coord: { q: 2, r: 0 } }
    ] as const;
    const placements = createHegemonyCastlePlacements(locations);
    const reordered = createHegemonyCastlePlacements([
      locations[3],
      locations[1],
      locations[0],
      locations[2]
    ]);

    expect(placements.map((placement) => placement.coord)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: -1 },
      { q: 2, r: 0 }
    ]);
    expect(placements).toEqual(reordered);
    expect(Object.isFrozen(placements)).toBe(true);
    expect(placements.every((placement) => (
      Object.isFrozen(placement) && Object.isFrozen(placement.coord)
    ))).toBe(true);
  });

  it('reuses immutable coordinate buckets without retaining stale mutable indexes', () => {
    const immutable = createHegemonyCastlePlacements([
      { id: 'first', coord: { q: 0, r: 0 } },
      { id: 'second', coord: { q: 1, r: 0 } }
    ]);
    const firstBucket = terrainPlacementsAtCoord(immutable, { q: 1, r: 0 });
    expect(firstBucket).toBe(terrainPlacementsAtCoord(immutable, { q: 1, r: 0 }));
    expect(Object.isFrozen(firstBucket)).toBe(true);

    const mutablePlacement: TerrainStructurePlacement = {
      id: 'moving-fixture',
      coord: { q: 0, r: 0 },
      footprintRadius: 0.43,
      blendRadius: 0.7,
      targetHeightMode: 'cell-center'
    };
    const mutable = [mutablePlacement];
    expect(terrainPlacementsAtCoord(mutable, { q: 0, r: 0 })).toHaveLength(1);
    (mutablePlacement.coord as { q: number; r: number }).q = 2;
    expect(terrainPlacementsAtCoord(mutable, { q: 0, r: 0 }))
      .toBe(EMPTY_TERRAIN_PLACEMENTS);
    expect(terrainPlacementsAtCoord(mutable, { q: 2, r: 0 })).toEqual([mutablePlacement]);
  });

  it('falls back to the complete placement set when custom influence can cross a hex edge', () => {
    const local = createHegemonyKeepPlacement('local', { q: 0, r: 0 });
    const neighboringWidePlacement = Object.freeze({
      ...createHegemonyKeepPlacement('wide-neighbor', { q: 1, r: 0 }),
      blendRadius: 1.2
    });
    const placements = Object.freeze([local, neighboringWidePlacement]);

    expect(terrainPlacementsForCell(placements, { q: 0, r: 0 }, 1))
      .toBe(placements);
    expect(terrainPlacementsForCell(
      Object.freeze([local]),
      { q: 1, r: 0 },
      1
    )).toBe(EMPTY_TERRAIN_PLACEMENTS);

    const wideFootprint = Object.freeze({
      ...createHegemonyKeepPlacement('wide-footprint', { q: 1, r: 0 }),
      footprintRadius: 1.1,
      blendRadius: 0.7
    });
    const wideFootprintPlacements = Object.freeze([wideFootprint]);
    expect(terrainPlacementsForCell(wideFootprintPlacements, { q: 0, r: 0 }, 1))
      .toBe(wideFootprintPlacements);
  });

  it('keeps a wide custom foundation continuous across a shared cell edge', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const west = terrainCellByCoord(map, { q: 0, r: 0 })!;
    const east = terrainCellByCoord(map, { q: 1, r: 0 })!;
    const sharedEdge = { x: Math.sqrt(3) / 2, z: 0 };
    const widePlacement = Object.freeze({
      ...createHegemonyKeepPlacement('wide-neighbor', east.coord),
      blendRadius: 1.2
    });
    const placements = Object.freeze([widePlacement]);

    const fromWest = terrainHeightForCell(
      map.worldSeed,
      west,
      sharedEdge,
      1,
      placements
    );
    const fromEast = terrainHeightForCell(
      map.worldSeed,
      east,
      sharedEdge,
      1,
      placements
    );
    expect(fromWest).toBeCloseTo(fromEast, 12);
  });
});
