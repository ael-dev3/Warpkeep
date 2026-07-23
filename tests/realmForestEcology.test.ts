import { describe, expect, it } from 'vitest';

import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import { hexKey } from '../src/game/map/hexCoordinates';
import {
  generateRealmForestCellEcology,
  REALM_FOREST_ECOLOGY_MAX_CANDIDATES_PER_CELL,
  REALM_FOREST_ECOLOGY_PALETTE_LIMIT,
  REALM_FOREST_ECOLOGY_VERSION,
  selectRealmForestEcologySpeciesPalette
} from '../src/game/map/realmForestEcology';
import { HEGEMONY_TREE_RUNTIME_ASSETS, hegemonyTreeModel } from '../src/components/realm/hegemonyTreeRuntimeAssets';
import { createRealmVegetationField } from '../src/game/map/realmVegetationField';
import type { RealmTerrainKind } from '../src/game/map/realmTerrainSemantics';

describe('camera-local forest ecology candidates', () => {
  it('is deterministic and independent of species input order', () => {
    const map = generateRealmTerrainMap('dense-forest-ecology', 4);
    const cell = map.cells.find((candidate) => candidate.coord.q === 0 && candidate.coord.r === 0)!;
    const terrainKinds = new Map<string, RealmTerrainKind>(map.cells.map((candidate) => [hexKey(candidate.coord), 'forest']));
    const field = createRealmVegetationField({
      worldSeed: map.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: new Set(terrainKinds.keys())
    });
    const species = HEGEMONY_TREE_RUNTIME_ASSETS.slice(0, 4).map((asset) => ({
      id: asset.id,
      triangles: hegemonyTreeModel(asset, 'compact').triangles,
      footprintDiameter: hegemonyTreeModel(asset, 'compact').normalizedFootprintDiameter,
      biomes: asset.biomes
    }));
    const options = {
      worldSeed: map.worldSeed,
      quality: 'high' as const,
      vegetation: { ...field.sampleCell(cell.coord), woodlandPotential: 1, forestNeighbourShare: 1 },
      terrainKind: 'forest' as const,
      playable: true
    };
    const first = generateRealmForestCellEcology(cell, { ...options, species });
    const repeat = generateRealmForestCellEcology(cell, { ...options, species: [...species].reverse() });
    expect(first).toEqual(repeat);
    expect(first.cellKey).toBe(hexKey(cell.coord));
    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.candidates.every((candidate) => candidate.cellKey === first.cellKey)).toBe(true);
    expect(REALM_FOREST_ECOLOGY_VERSION).toBe('dense-forest-ecology-v1');
  });

  it('honours visual exclusions and does not eagerly generate a world', () => {
    const map = generateRealmTerrainMap('dense-forest-exclusions', 12);
    const cell = map.cells.find((candidate) => candidate.coord.q === 2 && candidate.coord.r === -1)!;
    const species = HEGEMONY_TREE_RUNTIME_ASSETS.slice(0, 2).map((asset) => ({
      id: asset.id,
      triangles: 95,
      footprintDiameter: 0.27,
      biomes: asset.biomes
    }));
    const vegetation = {
      macro: 1,
      meso: 1,
      forestNeighbourShare: 1,
      wetness: 0.3,
      grassDensity: 0.8,
      woodlandPotential: 1
    };
    const blocked = generateRealmForestCellEcology(cell, {
      worldSeed: map.worldSeed,
      quality: 'high',
      species,
      vegetation,
      terrainKind: 'forest',
      playable: true,
      isWorldExcluded: () => true
    });
    expect(blocked.candidates).toEqual([]);
    const local = generateRealmForestCellEcology(cell, {
      worldSeed: map.worldSeed,
      quality: 'high',
      species,
      vegetation,
      terrainKind: 'forest',
      playable: true
    });
    expect(local.candidates.length).toBeLessThanOrEqual(
      REALM_FOREST_ECOLOGY_MAX_CANDIDATES_PER_CELL.high
    );
    expect(local.candidates.every((candidate) => candidate.coord.q === cell.coord.q)).toBe(true);
    expect(new Set(local.candidates.map(({ world }) => `${world.x}:${world.z}`)).size)
      .toBe(local.candidates.length);
  });

  it('selects one bounded, seed-stable world palette independent of catalog order', () => {
    const species = [
      { id: 'wet', triangles: 100, biomes: ['wetland', 'river'] },
      { id: 'pine-a', triangles: 100, biomes: ['coniferous', 'boreal'] },
      { id: 'pine-b', triangles: 100, biomes: ['coniferous', 'forest', 'boreal'] },
      { id: 'oak-a', triangles: 100, biomes: ['deciduous', 'temperate'] },
      { id: 'oak-b', triangles: 100, biomes: ['deciduous', 'meadow', 'temperate'] },
      { id: 'extra-a', triangles: 100, biomes: ['forest'] },
      { id: 'extra-b', triangles: 100, biomes: ['meadow'] }
    ];
    const first = selectRealmForestEcologySpeciesPalette(species, 42);
    const reversed = selectRealmForestEcologySpeciesPalette([...species].reverse(), 42);
    expect(first).toEqual(reversed);
    expect(first).toHaveLength(REALM_FOREST_ECOLOGY_PALETTE_LIMIT);
    expect(first.filter((candidate) => candidate.biomes?.some(
      (tag) => tag === 'wetland' || tag === 'river'
    ))).toHaveLength(1);
    expect(first.filter((candidate) => (
      candidate.biomes?.includes('coniferous')
    ))).toHaveLength(2);
    expect(first.filter((candidate) => (
      candidate.biomes?.includes('deciduous')
    ))).toHaveLength(2);
  });

  it('fails closed when passability or world-exclusion predicates throw', () => {
    const map = generateRealmTerrainMap('dense-forest-predicate-failure', 4);
    const cell = map.cells.find((candidate) => candidate.coord.q === 0 && candidate.coord.r === 0)!;
    const common = {
      worldSeed: map.worldSeed,
      quality: 'high' as const,
      species: [{ id: 'tree', triangles: 100, footprintDiameter: 0.27 }],
      vegetation: {
        macro: 1,
        meso: 1,
        forestNeighbourShare: 1,
        wetness: 0.3,
        grassDensity: 0.8,
        woodlandPotential: 1
      },
      terrainKind: 'forest' as const,
      playable: true
    };
    expect(generateRealmForestCellEcology(cell, {
      ...common,
      isCoordPassable: () => { throw new Error('unavailable'); }
    }).candidates).toEqual([]);
    expect(generateRealmForestCellEcology(cell, {
      ...common,
      isWorldExcluded: () => { throw new Error('unavailable'); }
    }).candidates).toEqual([]);
  });
});
