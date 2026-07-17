import { describe, expect, it } from 'vitest';

import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { axialToWorld, hexDistance } from '../src/game/map/hexCoordinates';
import { HEGEMONY_MAIN_CASTLE } from '../src/game/map/hegemonyLandmarks';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { terrainHeightAtWorld, terrainHeightForCell } from '../src/game/map/terrainHeight';
import {
  createHegemonyCastlePlacements,
  createHegemonyKeepPlacement,
  EMPTY_TERRAIN_PLACEMENTS,
  HEGEMONY_KEEP_PLACEMENT,
  HEGEMONY_TERRAIN_PLACEMENTS,
  isPlacementClear,
  placementInfluenceAtWorld,
  terrainPlacementsAtCoord,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from '../src/game/map/terrainPlacements';
import { CANONICAL_CASTLE_SLOTS, GENESIS_RENDER_RADIUS } from '../spacetimedb/src/world';

const AUTHORED_LANDSCAPE_BASE_RADIUS = 1.06;

describe('Hegemony keep terrain placement', () => {
  it('is flat across the authored island and blends smoothly outside it across cell edges', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 4);
    const cell = terrainCellByCoord(map, { q: 0, r: 0 })!;
    const center = { x: 0, z: 0 };
    const inside = { x: AUTHORED_LANDSCAPE_BASE_RADIUS, z: 0 };
    const blend = { x: 1.15, z: 0 };
    const outside = { x: 1.24, z: 0 };
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
    expect(terrainHeightForCell(map.worldSeed, cell, edge, 1, HEGEMONY_TERRAIN_PLACEMENTS))
      .toBeCloseTo(centerHeight, 8);
  });

  it('keeps terrain support and decoration clearance outside the complete authored island', () => {
    const center = axialToWorld(HEGEMONY_KEEP_PLACEMENT.coord, 1);
    const islandEdge = { x: center.x + AUTHORED_LANDSCAPE_BASE_RADIUS, z: center.z };
    const blend = { x: center.x + 1.15, z: center.z };
    const beyondIsland = { x: center.x + 1.31, z: center.z };

    expect(HEGEMONY_KEEP_PLACEMENT).toMatchObject({
      footprintRadius: 1.08,
      blendRadius: 1.22,
      decorationClearanceRadius: 1.22
    });
    expect(HEGEMONY_KEEP_PLACEMENT.footprintRadius)
      .toBeGreaterThan(AUTHORED_LANDSCAPE_BASE_RADIUS);
    expect(HEGEMONY_MAIN_CASTLE.landscapeBaseFootprintDiameter / 2)
      .toBeLessThan(AUTHORED_LANDSCAPE_BASE_RADIUS);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, islandEdge, 1)).toBe(1);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, blend, 1)).toBeGreaterThan(0);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, blend, 1)).toBeLessThan(1);
    expect(isPlacementClear(
      HEGEMONY_TERRAIN_PLACEMENTS,
      islandEdge,
      1,
      0.08
    )).toBe(false);
    expect(isPlacementClear(
      HEGEMONY_TERRAIN_PLACEMENTS,
      beyondIsland,
      1,
      0.08
    )).toBe(true);

    // The support plane and decoration exclusion now both cross into cells
    // touched by the authored island and its short terrain blend.
    expect(terrainPlacementsForCell(
      HEGEMONY_TERRAIN_PLACEMENTS,
      { q: 1, r: 0 },
      1
    )).toBe(HEGEMONY_TERRAIN_PLACEMENTS);
    expect(terrainPlacementsForCell(
      HEGEMONY_TERRAIN_PLACEMENTS,
      { q: 1, r: 0 },
      1,
      0.08
    )).toBe(HEGEMONY_TERRAIN_PLACEMENTS);
  });

  it('keeps the full authored base extent level at all 100 canonical castle slots', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, GENESIS_RENDER_RADIUS);
    const placements = createHegemonyCastlePlacements(CANONICAL_CASTLE_SLOTS.map((slot) => ({
      id: `castle-${slot.slotId}`,
      coord: slot
    })));
    const radii = [0, AUTHORED_LANDSCAPE_BASE_RADIUS * 0.5, AUTHORED_LANDSCAPE_BASE_RADIUS];

    expect(placements).toHaveLength(100);
    placements.forEach((placement) => {
      const center = axialToWorld(placement.coord, 1);
      const centerHeight = terrainHeightAtWorld(map, center, 1, placements);
      radii.forEach((radius) => {
        for (let sample = 0; sample < 24; sample += 1) {
          const angle = (sample / 24) * Math.PI * 2;
          const world = {
            x: center.x + Math.cos(angle) * radius,
            z: center.z + Math.sin(angle) * radius
          };
          expect(placementInfluenceAtWorld(placement, world, 1)).toBe(1);
          expect(terrainHeightAtWorld(map, world, 1, placements)).toBeCloseTo(centerHeight, 10);
        }
      });
    });
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
      footprintRadius: 0.62,
      blendRadius: 0.78,
      targetHeightMode: 'cell-center'
    };
    const mutable = [mutablePlacement];
    expect(terrainPlacementsAtCoord(mutable, { q: 0, r: 0 })).toHaveLength(1);
    (mutablePlacement.coord as { q: number; r: number }).q = 2;
    expect(terrainPlacementsAtCoord(mutable, { q: 0, r: 0 }))
      .toBe(EMPTY_TERRAIN_PLACEMENTS);
    expect(terrainPlacementsAtCoord(mutable, { q: 2, r: 0 })).toEqual([mutablePlacement]);
  });

  it('bounds normal decoration queries to a small neighboring subset', () => {
    const placements = createHegemonyCastlePlacements(CANONICAL_CASTLE_SLOTS.map((slot) => ({
      id: `castle-${slot.slotId}`,
      coord: slot
    })));
    const target = placements[49]!;

    const terrainOnly = terrainPlacementsForCell(placements, target.coord, 1);
    const decorationNeighbors = terrainPlacementsForCell(
      placements,
      target.coord,
      1,
      0.08
    );

    expect(terrainOnly.map((placement) => placement.id)).toEqual([target.id]);
    expect(decorationNeighbors.map((placement) => placement.id)).toEqual([target.id]);
    expect(decorationNeighbors.length).toBeLessThan(placements.length / 10);
    expect(decorationNeighbors).not.toBe(placements);
    expect(CANONICAL_CASTLE_SLOTS.every((slot, first) => (
      CANONICAL_CASTLE_SLOTS.slice(first + 1).every((other) => hexDistance(slot, other) >= 2)
    ))).toBe(true);
  });

  it('falls back to the complete placement set when custom influence can cross a hex edge', () => {
    const local = createHegemonyKeepPlacement('local', { q: 0, r: 0 });
    const neighboringWidePlacement = Object.freeze({
      ...createHegemonyKeepPlacement('wide-neighbor', { q: 1, r: 0 }),
      blendRadius: 1.4
    });
    const placements = Object.freeze([local, neighboringWidePlacement]);
    const localOnly = Object.freeze([local]);

    expect(terrainPlacementsForCell(placements, { q: 0, r: 0 }, 1))
      .toBe(placements);
    expect(terrainPlacementsForCell(
      localOnly,
      { q: 1, r: 0 },
      1
    )).toBe(localOnly);

    const wideFootprint = Object.freeze({
      ...createHegemonyKeepPlacement('wide-footprint', { q: 1, r: 0 }),
      footprintRadius: 1.1,
      blendRadius: 0.7
    });
    const wideFootprintPlacements = Object.freeze([wideFootprint]);
    expect(terrainPlacementsForCell(wideFootprintPlacements, { q: 0, r: 0 }, 1))
      .toBe(wideFootprintPlacements);
  });

  it('keeps the official foundation continuous across a shared cell edge', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const west = terrainCellByCoord(map, { q: 0, r: 0 })!;
    const east = terrainCellByCoord(map, { q: 1, r: 0 })!;
    const sharedEdge = { x: Math.sqrt(3) / 2, z: 0 };
    const widePlacement = createHegemonyKeepPlacement('wide-neighbor', east.coord);
    const placements = Object.freeze([
      widePlacement,
      ...Array.from(
        { length: 99 },
        (_, index) => createHegemonyKeepPlacement(`distant-${index}`, { q: index + 10, r: 0 })
      )
    ]);

    const westCandidates = terrainPlacementsForCell(placements, west.coord, 1);
    expect(westCandidates).toContain(widePlacement);
    expect(westCandidates.length).toBeLessThan(10);

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

  it('includes finite custom decoration radii that can reach across multiple cells', () => {
    const remoteIsland = Object.freeze({
      ...createHegemonyKeepPlacement('remote-island', { q: 2, r: 0 }),
      decorationClearanceRadius: 2.7
    });
    const placements = Object.freeze([
      remoteIsland,
      ...Array.from(
        { length: 99 },
        (_, index) => createHegemonyKeepPlacement(`far-${index}`, { q: index + 10, r: 0 })
      )
    ]);

    const candidates = terrainPlacementsForCell(placements, { q: 0, r: 0 }, 1, 0.08);
    expect(candidates).toContain(remoteIsland);
    expect(candidates.length).toBeLessThan(10);
    expect(isPlacementClear(
      candidates,
      { x: Math.sqrt(3) / 2, z: 0 },
      1,
      0.08
    )).toBe(false);
  });

  it('falls back to the complete set for non-integer axial coordinates', () => {
    const fractionalPlacement = Object.freeze({
      ...createHegemonyKeepPlacement('fractional', { q: 0, r: 0 }),
      coord: Object.freeze({ q: 0.5, r: 0 })
    });
    const placements = Object.freeze([
      fractionalPlacement,
      ...Array.from(
        { length: 99 },
        (_, index) => createHegemonyKeepPlacement(`integer-${index}`, { q: index + 10, r: 0 })
      )
    ]);

    expect(terrainPlacementsForCell(placements, { q: 0, r: 0 }, 1, 0.08))
      .toBe(placements);
    expect(terrainPlacementsForCell(placements, { q: 0.5, r: 0 }, 1, 0.08))
      .toBe(placements);
  });
});
