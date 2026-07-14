import { describe, expect, it } from 'vitest';

import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { sampleLowlandsColor } from '../src/game/map/terrainColor';
import { createHegemonyKeepPlacement } from '../src/game/map/terrainPlacements';

describe('lowlands terrain color', () => {
  it('is deterministic, finite, and identical from either side of a shared edge', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 5);
    const first = terrainCellByCoord(map, { q: 0, r: 0 });
    const second = terrainCellByCoord(map, { q: 1, r: 0 });
    if (!first || !second) throw new Error('missing adjacent terrain cells');
    const sharedEdge = { x: Math.sqrt(3) / 2, z: 0 };
    const context = { hexSize: 1, playableRadius: 4, renderRadius: 5 } as const;
    const fromFirst = sampleLowlandsColor(map.worldSeed, sharedEdge, { ...context, cell: first });
    const fromSecond = sampleLowlandsColor(map.worldSeed, sharedEdge, { ...context, cell: second });

    expect(fromFirst).toEqual(sampleLowlandsColor(map.worldSeed, sharedEdge, {
      ...context,
      cell: first
    }));
    expect(fromFirst.r).toBeCloseTo(fromSecond.r, 10);
    expect(fromFirst.g).toBeCloseTo(fromSecond.g, 10);
    expect(fromFirst.b).toBeCloseTo(fromSecond.b, 10);
    expect(Object.values(fromFirst).every(Number.isFinite)).toBe(true);
    expect(Object.values(fromFirst).every((channel) => channel >= 0 && channel <= 1)).toBe(true);
  });

  it('applies an off-center packed-earth keep pad only inside its smooth placement influence', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 5);
    const centerCell = terrainCellByCoord(map, { q: 2, r: -1 });
    if (!centerCell) throw new Error('missing keep terrain cell');
    const center = axialToWorld(centerCell.coord, 1);
    const context = {
      cell: centerCell,
      hexSize: 1,
      playableRadius: 4,
      renderRadius: 5,
      placements: [createHegemonyKeepPlacement('own-keep', centerCell.coord)]
    } as const;
    const padded = sampleLowlandsColor(map.worldSeed, center, context);
    const natural = sampleLowlandsColor(map.worldSeed, center, { ...context, placements: [] });
    const cellEdge = { x: center.x + Math.sqrt(3) / 2, z: center.z };
    const paddedEdge = sampleLowlandsColor(map.worldSeed, cellEdge, context);
    const naturalEdge = sampleLowlandsColor(map.worldSeed, cellEdge, {
      ...context,
      placements: []
    });

    expect(padded).not.toEqual(natural);
    expect(paddedEdge.r).toBeCloseTo(naturalEdge.r, 10);
    expect(paddedEdge.g).toBeCloseTo(naturalEdge.g, 10);
    expect(paddedEdge.b).toBeCloseTo(naturalEdge.b, 10);
  });
});
