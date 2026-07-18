import { describe, expect, it } from 'vitest';

import {
  CANONICAL_WORLD_TILES,
  GENESIS_AUTHORITATIVE_CELL_COUNT,
  GENESIS_FULL_DISC_RADIUS,
  GENESIS_PARTIAL_OUTER_RING_CELL_COUNT,
  GENESIS_RENDER_RADIUS,
  LOWLANDS_RADIUS
} from '../spacetimedb/src/world';
import { hexDistance, hexKey } from '../src/game/map/hexCoordinates';
import {
  createAuthoritativeRealmTerrainSurface,
  createRealmTerrainSurface,
  isPlayableRealmCoord
} from '../src/game/map/realmTerrainSurface';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';

describe('Hegemony terrain surface layers', () => {
  it('keeps an explicitly requested historical radius-four fixture separate from its apron', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);

    expect(surface.playableMap.radius).toBe(4);
    expect(surface.playableMap.cells).toHaveLength(61);
    expect(surface.renderMap.radius).toBe(5);
    expect(surface.renderMap.cells).toHaveLength(91);
    expect(surface.apronCells).toHaveLength(30);
    expect(surface.playableKeys.size).toBe(61);
    surface.apronCells.forEach((cell) => expect(isPlayableRealmCoord(surface, cell.coord)).toBe(false));
  });

  it('remains deterministic and keeps the canonical world seed across both layers', () => {
    const first = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 20, 22);
    const second = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 20, 22);

    expect(first.playableMap).toEqual(second.playableMap);
    expect(first.renderMap).toEqual(second.renderMap);
    expect(first.playableMap.worldSeed).toBe(first.renderMap.worldSeed);
  });

  it('requires explicit valid radii instead of synthesizing a small runtime world', () => {
    expect(() => createRealmTerrainSurface(HEGEMONY_GENESIS_001, 20, 19))
      .toThrow('REALM_TERRAIN_SURFACE_RADIUS_INVALID');
    expect(() => createRealmTerrainSurface(HEGEMONY_GENESIS_001, Number.NaN, 22))
      .toThrow('REALM_TERRAIN_SURFACE_RADIUS_INVALID');
  });

  it('renders exactly 10,000 authoritative cells while keeping every absent perimeter cell in the apron', () => {
    const surface = createAuthoritativeRealmTerrainSurface(
      HEGEMONY_GENESIS_001,
      CANONICAL_WORLD_TILES,
      LOWLANDS_RADIUS,
      GENESIS_RENDER_RADIUS
    );
    const distanceFromOrigin = (coord: Readonly<{ q: number; r: number }>) => (
      hexDistance({ q: 0, r: 0 }, coord)
    );
    const completeDiscCells = surface.playableMap.cells.filter((cell) => (
      distanceFromOrigin(cell.coord) <= GENESIS_FULL_DISC_RADIUS
    ));
    const playableOuterRing = surface.playableMap.cells.filter((cell) => (
      distanceFromOrigin(cell.coord) === LOWLANDS_RADIUS
    ));
    const missingOuterRing = surface.apronCells.filter((cell) => (
      distanceFromOrigin(cell.coord) === LOWLANDS_RADIUS
    ));

    expect(surface.playableMap.cells).toHaveLength(GENESIS_AUTHORITATIVE_CELL_COUNT);
    expect(surface.playableKeys.size).toBe(GENESIS_AUTHORITATIVE_CELL_COUNT);
    expect(surface.renderMap.cells).toHaveLength(10_981);
    expect(surface.apronCells).toHaveLength(981);
    expect(completeDiscCells).toHaveLength(9_919);
    expect(playableOuterRing).toHaveLength(GENESIS_PARTIAL_OUTER_RING_CELL_COUNT);
    expect(missingOuterRing).toHaveLength(267);
    expect(CANONICAL_WORLD_TILES.every((tile) => surface.playableKeys.has(tile.key))).toBe(true);
    expect(missingOuterRing.every((cell) => (
      !surface.playableKeys.has(hexKey(cell.coord))
      && !isPlayableRealmCoord(surface, cell.coord)
    ))).toBe(true);
  });

  it('fails closed for duplicate, out-of-envelope, or seed-incompatible authority rows', () => {
    const first = CANONICAL_WORLD_TILES[0]!;
    expect(() => createAuthoritativeRealmTerrainSurface(
      HEGEMONY_GENESIS_001,
      [first, first],
      LOWLANDS_RADIUS,
      GENESIS_RENDER_RADIUS
    )).toThrow('REALM_TERRAIN_AUTHORITY_INVALID');
    expect(() => createAuthoritativeRealmTerrainSurface(
      HEGEMONY_GENESIS_001,
      [{ q: LOWLANDS_RADIUS + 1, r: 0 }],
      LOWLANDS_RADIUS,
      GENESIS_RENDER_RADIUS
    )).toThrow('REALM_TERRAIN_AUTHORITY_INVALID');
    expect(() => createAuthoritativeRealmTerrainSurface(
      HEGEMONY_GENESIS_001,
      [{ ...first, terrainSeed: first.terrainSeed ^ 1 }],
      LOWLANDS_RADIUS,
      GENESIS_RENDER_RADIUS
    )).toThrow('REALM_TERRAIN_AUTHORITY_INVALID');
  });
});
