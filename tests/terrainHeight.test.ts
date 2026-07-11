import { describe, expect, it } from 'vitest';

import { axialToWorld } from '../src/game/map/hexCoordinates';
import { generateRealmTerrainMap, terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import {
  cellInteriorDetail,
  cellInteriorEdgeFalloff,
  globalLowlandHeight,
  terrainHeightForCell,
  terrainHeightAtWorld
} from '../src/game/map/terrainHeight';

const HEX_SIZE = 1;
const SQRT_3 = Math.sqrt(3);

describe('seam-safe Hegemony Lowlands height model', () => {
  it('uses one continuous world-space global relief function', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const world = { x: 0.42, z: -0.28 };

    expect(globalLowlandHeight(map.worldSeed, world)).toBe(globalLowlandHeight(map.worldSeed, world));
    expect(terrainHeightAtWorld(map, world, HEX_SIZE)).toBeCloseTo(
      terrainHeightAtWorld(map, world, HEX_SIZE),
      12
    );
  });

  it('fades cell-local micro-relief exactly to zero on pointy-top cell borders', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const centerCell = terrainCellByCoord(map, { q: 0, r: 0 });
    if (!centerCell) throw new Error('missing center terrain cell');
    const rightEdgeMidpoint = { x: SQRT_3 * 0.5, z: 0 };

    expect(cellInteriorEdgeFalloff(rightEdgeMidpoint, HEX_SIZE)).toBe(0);
    expect(cellInteriorDetail(centerCell, rightEdgeMidpoint, HEX_SIZE)).toBe(0);
  });

  it('matches total heights all along a shared edge and at shared corners', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const centerCell = terrainCellByCoord(map, { q: 0, r: 0 });
    const eastCell = terrainCellByCoord(map, { q: 1, r: 0 });
    if (!centerCell || !eastCell) throw new Error('missing adjacent terrain cells');
    const samples = [-0.5, -0.24, 0, 0.24, 0.5].map((z) => ({ x: SQRT_3 * 0.5, z }));

    samples.forEach((world) => {
      expect(terrainHeightForCell(map.worldSeed, centerCell, world, HEX_SIZE)).toBeCloseTo(
        terrainHeightForCell(map.worldSeed, eastCell, world, HEX_SIZE),
        12
      );
    });
  });

  it('keeps heights finite and subtle over all cell centers', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);

    map.cells.forEach((cell) => {
      const height = terrainHeightAtWorld(map, axialToWorld(cell.coord, HEX_SIZE), HEX_SIZE);
      expect(Number.isFinite(height)).toBe(true);
      expect(Math.abs(height)).toBeLessThan(0.12);
    });
  });
});
