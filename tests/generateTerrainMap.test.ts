import { describe, expect, it } from 'vitest';

import { hexKey } from '../src/game/map/hexCoordinates';
import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';

describe('Hegemony Lowlands terrain-map generation', () => {
  it('generates the canonical radius-two 19-cell map deterministically', () => {
    const first = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const second = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const keys = first.cells.map((cell) => hexKey(cell.coord));

    expect(first).toEqual(second);
    expect(first).toMatchObject({ version: 1, radius: 2 });
    expect(first.cells).toHaveLength(19);
    expect(new Set(keys).size).toBe(19);
  });

  it('changes restrained interior attributes with a different seed while keeping topology', () => {
    const canonical = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const alternate = generateRealmTerrainMap('HEGEMONY_GENESIS_002', 2);

    expect(alternate.cells.map((cell) => hexKey(cell.coord))).toEqual(
      canonical.cells.map((cell) => hexKey(cell.coord))
    );
    expect(alternate.cells.map((cell) => cell.seed)).not.toEqual(
      canonical.cells.map((cell) => cell.seed)
    );
  });

  it('supports an explicit radius-five terrain fixture without changing the serialized contract', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 5);
    const keys = map.cells.map((cell) => hexKey(cell.coord));

    expect(map).toMatchObject({ version: 1, radius: 5 });
    expect(map.cells).toHaveLength(91);
    expect(new Set(keys).size).toBe(91);
  });

  it('requires an explicit finite nonnegative integer radius', () => {
    expect(() => generateRealmTerrainMap(HEGEMONY_GENESIS_001, Number.NaN))
      .toThrow('REALM_TERRAIN_RADIUS_INVALID');
    expect(() => generateRealmTerrainMap(HEGEMONY_GENESIS_001, -1))
      .toThrow('REALM_TERRAIN_RADIUS_INVALID');
  });

  it('keeps every serializable terrain attribute finite and bounded', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);

    map.cells.forEach((cell) => {
      expect(cell.biome).toBe('temperate-lowland');
      expect(Number.isFinite(cell.seed)).toBe(true);
      [
        cell.elevationBias,
        cell.moisture,
        cell.soilBias,
        cell.rockBias,
        cell.dryGrassBias
      ].forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });
});
