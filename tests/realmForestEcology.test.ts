import { describe, expect, it } from 'vitest';

import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import { hexKey } from '../src/game/map/hexCoordinates';
import {
  createRealmForestStructureCounts,
  generateRealmForestCellEcology,
  realmForestSilhouetteCoverageRatio,
  realmForestSpeciesPatchKey,
  REALM_FOREST_ECOLOGY_MAX_CANDIDATES_PER_CELL,
  REALM_FOREST_ECOLOGY_PALETTE_LIMIT,
  REALM_FOREST_ECOLOGY_VERSION,
  selectRealmForestEcologySpeciesPalette,
  summarizeRealmForestStructure
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
    expect(REALM_FOREST_ECOLOGY_VERSION).toBe('crafted-lowlands-forest-ecology-v2');
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

  it('forms stable species patches instead of shuffling species per tree', () => {
    const map = generateRealmTerrainMap('crafted-lowlands-species-patches', 6);
    const species = [
      { id: 'pine-a', triangles: 90, footprintDiameter: 0.18, biomes: ['coniferous'] },
      { id: 'pine-b', triangles: 90, footprintDiameter: 0.18, biomes: ['coniferous'] },
      { id: 'pine-c', triangles: 90, footprintDiameter: 0.18, biomes: ['coniferous'] }
    ];
    const vegetation = {
      macro: 1,
      meso: 1,
      forestNeighbourShare: 1,
      wetness: 0.3,
      grassDensity: 0.8,
      woodlandPotential: 1
    };
    const byPatch = new Map<string, Array<ReturnType<typeof generateRealmForestCellEcology>>>();
    map.cells.forEach((cell) => {
      const ecology = generateRealmForestCellEcology(cell, {
        worldSeed: map.worldSeed,
        quality: 'high',
        species,
        vegetation,
        terrainKind: 'forest',
        playable: true
      });
      if (ecology.candidates.length === 0) return;
      const key = realmForestSpeciesPatchKey(cell.coord);
      const bucket = byPatch.get(key);
      if (bucket) bucket.push(ecology);
      else byPatch.set(key, [ecology]);
    });
    const multiCellPatches = [...byPatch.values()].filter((cells) => cells.length >= 2);
    expect(multiCellPatches.length).toBeGreaterThan(0);
    multiCellPatches.forEach((cells) => {
      expect(new Set(cells.flatMap((cell) => (
        cell.candidates.map((candidate) => candidate.speciesId)
      ))).size).toBe(1);
    });
  });

  it('uses canopy structure for denser, taller cores and deterministic clearings', () => {
    const map = generateRealmTerrainMap('crafted-lowlands-forest-structure', 7);
    const species = [{
      id: 'pine',
      triangles: 90,
      footprintDiameter: 0.16,
      biomes: ['coniferous']
    }];
    const common = {
      worldSeed: map.worldSeed,
      quality: 'high' as const,
      species,
      terrainKind: 'forest' as const,
      playable: true
    };
    const coreVegetation = {
      macro: 1,
      meso: 1,
      forestNeighbourShare: 1,
      wetness: 0.3,
      grassDensity: 0.8,
      woodlandPotential: 1
    };
    const fringeVegetation = {
      ...coreVegetation,
      forestNeighbourShare: 0,
      woodlandPotential: 0.28
    };
    const paired = map.cells.map((cell) => Object.freeze({
      core: generateRealmForestCellEcology(cell, {
        ...common,
        vegetation: coreVegetation
      }),
      fringe: generateRealmForestCellEcology(cell, {
        ...common,
        vegetation: fringeVegetation
      })
    })).find(({ core, fringe }) => (
      core.structure === 'core'
      && fringe.structure === 'fringe'
      && core.candidates.length > 0
      && fringe.candidates.length > 0
    ));
    expect(paired).toBeDefined();
    expect(paired!.core.candidates.length).toBeGreaterThan(
      paired!.fringe.candidates.length
    );
    expect(Math.min(...paired!.core.candidates.map((candidate) => candidate.scale)))
      .toBeGreaterThanOrEqual(1);
    expect(Math.max(...paired!.fringe.candidates.map((candidate) => candidate.scale)))
      .toBeLessThanOrEqual(0.94);

    const clearing = map.cells.map((cell) => generateRealmForestCellEcology(cell, {
      ...common,
      vegetation: coreVegetation
    })).find((ecology) => ecology.structure === 'clearing');
    expect(clearing).toBeDefined();
    expect(clearing!.candidates).toEqual([]);
    expect(generateRealmForestCellEcology(
      map.cells.find((cell) => hexKey(cell.coord) === clearing!.cellKey)!,
      { ...common, vegetation: coreVegetation }
    )).toEqual(clearing);
  });

  it('summarizes structure and bounded silhouette coverage without tree authority', () => {
    const counts = summarizeRealmForestStructure([
      { coord: { q: 0, r: 0 }, habitat: 'fringe' },
      { coord: { q: 0, r: 0 }, habitat: 'grove' },
      { coord: { q: 1, r: 0 }, habitat: 'forest' },
      { coord: { q: 2, r: 0 }, habitat: 'fringe' }
    ], 4);
    expect(counts).toEqual({ core: 1, body: 1, fringe: 1, clearing: 4 });
    expect(createRealmForestStructureCounts()).toEqual({
      core: 0,
      body: 0,
      fringe: 0,
      clearing: 0
    });
    const coverage = realmForestSilhouetteCoverageRatio([
      { footprintDiameter: 0.5, scale: 1 },
      { footprintDiameter: 0.4, scale: 0.9, edgeFade: 0.5 }
    ], 3);
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThanOrEqual(1);
    expect(realmForestSilhouetteCoverageRatio([
      { footprintDiameter: 0.4, scale: 0.9, edgeFade: 0.1 }
    ], 3)).toBe(realmForestSilhouetteCoverageRatio([
      { footprintDiameter: 0.4, scale: 0.9, edgeFade: 1 }
    ], 3));
    expect(realmForestSilhouetteCoverageRatio([], 3)).toBe(0);
    expect(realmForestSilhouetteCoverageRatio([
      { footprintDiameter: 0.5, scale: 1 }
    ], 0)).toBe(0);
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
