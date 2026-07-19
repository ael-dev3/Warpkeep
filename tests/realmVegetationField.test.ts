import { describe, expect, it } from 'vitest';

import { axialToWorld, hexKey } from '../src/game/map/hexCoordinates';
import type { RealmTerrainKind } from '../src/game/map/realmTerrainSemantics';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { createRealmVegetationField } from '../src/game/map/realmVegetationField';

describe('Realm vegetation field', () => {
  it('is deterministic, continuous, bounded, and derived from the existing terrain projection', () => {
    const surface = createRealmTerrainSurface('vegetation-field', 8, 9);
    const terrainKinds = new Map<string, RealmTerrainKind>(surface.playableMap.cells.map((cell) => (
      [hexKey(cell.coord), 'meadow'] as const
    )));
    terrainKinds.set('0,0', 'forest');
    terrainKinds.set('1,0', 'forest');
    terrainKinds.set('0,1', 'forest');
    const field = createRealmVegetationField({
      worldSeed: surface.playableMap.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: surface.playableKeys
    });
    const repeat = createRealmVegetationField({
      worldSeed: surface.playableMap.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: surface.playableKeys
    });
    const center = axialToWorld({ q: 0, r: 0 }, 1);
    const first = field.sample(center);
    const nearby = field.sample({ x: center.x + 0.01, z: center.z + 0.01 });

    expect(first).toEqual(repeat.sample(center));
    expect(field.sampleCell({ q: 0, r: 0 })).toBe(field.sampleCell({ q: 0, r: 0 }));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Math.abs(first.macro - nearby.macro)).toBeLessThan(0.01);
    expect(Math.abs(first.meso - nearby.meso)).toBeLessThan(0.02);
    expect(first.forestNeighbourShare).toBeGreaterThan(0);
    expect(first.woodlandPotential).toBeGreaterThan(0);
    Object.values(first).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  it('fails closed outside persistent playable metadata', () => {
    const surface = createRealmTerrainSurface('vegetation-field-edge', 3, 4);
    const terrainKinds = new Map<string, RealmTerrainKind>(surface.playableMap.cells.map((cell) => (
      [hexKey(cell.coord), 'forest'] as const
    )));
    const field = createRealmVegetationField({
      worldSeed: surface.playableMap.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: surface.playableKeys
    });
    const outside = field.sampleCell({ q: 4, r: 0 });

    expect(outside.grassDensity).toBe(0);
    expect(outside.woodlandPotential).toBe(0);
    expect(outside.forestNeighbourShare).toBe(0);
  });

  it('keeps lake ecology dormant until the no-lake presentation revision is active', () => {
    const surface = createRealmTerrainSurface('vegetation-field-lake-gate', 3, 3);
    const terrainKinds = new Map<string, RealmTerrainKind>(surface.playableMap.cells.map((cell) => (
      [hexKey(cell.coord), hexKey(cell.coord) === '0,0' ? 'lake' : 'meadow'] as const
    )));
    const input = {
      worldSeed: surface.playableMap.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: surface.playableKeys
    } as const;
    const inactive = createRealmVegetationField(input).sampleCell({ q: 0, r: 0 });
    const active = createRealmVegetationField({
      ...input,
      visualizeLegacyLakesAsLand: true
    }).sampleCell({ q: 0, r: 0 });

    expect(inactive.grassDensity).toBe(0);
    expect(inactive.woodlandPotential).toBe(0);
    expect(active.grassDensity).toBeGreaterThan(0);
    expect(active.woodlandPotential).toBeGreaterThan(0);
  });
});
