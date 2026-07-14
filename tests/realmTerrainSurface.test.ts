import { describe, expect, it } from 'vitest';

import {
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
});
