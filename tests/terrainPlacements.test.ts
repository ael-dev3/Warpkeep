import { describe, expect, it } from 'vitest';

import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { terrainHeightForCell } from '../src/game/map/terrainHeight';
import {
  HEGEMONY_KEEP_PLACEMENT,
  placementInfluenceAtWorld
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

    const centerHeight = terrainHeightForCell(map.worldSeed, cell, center, 1);
    expect(terrainHeightForCell(map.worldSeed, cell, inside, 1)).toBeCloseTo(centerHeight, 8);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, blend, 1)).toBeGreaterThan(0);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, blend, 1)).toBeLessThan(1);
    expect(placementInfluenceAtWorld(HEGEMONY_KEEP_PLACEMENT, outside, 1)).toBe(0);
    expect(terrainHeightForCell(map.worldSeed, cell, edge, 1)).toBeCloseTo(
      terrainHeightForCell(map.worldSeed, cell, edge, 1, []),
      10
    );
  });
});
