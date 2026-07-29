import { describe, expect, it } from 'vitest';

import {
  createRealmGrassExclusionIndex,
  generateRealmGrassCells,
  realmGrassCandidateCount,
  REALM_GRASS_BIOME_PROFILES,
  type RealmGrassExclusion
} from '../src/game/map/realmGrass';
import type { RealmTerrainKind } from '../src/game/map/realmTerrainSemantics';
import { axialToWorld, hexDistance, hexKey } from '../src/game/map/hexCoordinates';
import { sampleRealmGrassCoverage } from '../src/game/map/realmGrassNoise';
import { createRealmNorthernSnowField } from '../src/game/map/realmNorthernSnow';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { pointyHexBoundaryDistance } from '../src/game/map/terrainHeight';
import { createRealmVegetationField } from '../src/game/map/realmVegetationField';
import {
  createHegemonyCastlePlacements,
  distanceToPlacement
} from '../src/game/map/terrainPlacements';

function semanticMap(surface: ReturnType<typeof createRealmTerrainSurface>) {
  return new Map<string, RealmTerrainKind>(
    surface.playableMap.cells.map((cell) => [hexKey(cell.coord), 'meadow'])
  );
}

function inputFor(surface: ReturnType<typeof createRealmTerrainSurface>, cells = surface.renderMap.cells) {
  return {
    map: surface.renderMap,
    cells,
    terrainKindsByKey: semanticMap(surface),
    playableKeys: surface.playableKeys,
    playableRadius: surface.playableMap.radius,
    renderRadius: surface.renderMap.radius,
    quality: 'high' as const
  };
}

describe('procedural biome grass generation', () => {
  it('is stable under input permutations and keeps presentation data immutable', () => {
    const surface = createRealmTerrainSurface('grass-permutation', 5, 6);
    const forward = generateRealmGrassCells(inputFor(surface));
    const reverse = generateRealmGrassCells(inputFor(surface, [...surface.renderMap.cells].reverse()));

    expect(forward).toEqual(reverse);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(forward.cells.every(Object.isFrozen)).toBe(true);
    expect(forward.points.every(Object.isFrozen)).toBe(true);
  });

  it('grounds points inside the hex, within profile ranges, and outside castle clearances', () => {
    const surface = createRealmTerrainSurface('grass-placement', 5, 6);
    const placements = createHegemonyCastlePlacements([{ id: 'keep', coord: { q: 0, r: 0 } }]);
    const data = generateRealmGrassCells({ ...inputFor(surface), placements });

    expect(data.points.length).toBeGreaterThan(0);
    data.points.forEach((point) => {
      const center = axialToWorld(point.coord, 1);
      expect(point.groundY).toBeTypeOf('number');
      expect(point.height).toBeGreaterThanOrEqual(0.07);
      expect(point.height).toBeLessThanOrEqual(0.19);
      expect(point.width).toBeGreaterThanOrEqual(0.22);
      expect(point.width).toBeLessThanOrEqual(0.52);
      expect(pointyHexBoundaryDistance({
        x: point.world.x - center.x,
        z: point.world.z - center.z
      }, 1)).toBeLessThanOrEqual(0.86);
      placements.forEach((placement) => {
        expect(distanceToPlacement(placement, point.world, 1))
          .toBeGreaterThanOrEqual((placement.decorationClearanceRadius ?? placement.blendRadius) + 0.03);
      });
    });
  });

  it('keeps lakes and permanent castle slots empty while allowing apron fade candidates', () => {
    const surface = createRealmTerrainSurface('grass-semantics', 4, 5);
    const terrainKinds = semanticMap(surface);
    terrainKinds.set('0,0', 'lake');
    const slotKeys = new Set(['1,0']);
    const data = generateRealmGrassCells({
      ...inputFor(surface),
      terrainKindsByKey: terrainKinds,
      castleSlotKeys: slotKeys
    });
    const lake = data.cells.find((cell) => cell.key === '0,0');
    const slot = data.cells.find((cell) => cell.key === '1,0');

    expect(lake?.points).toEqual([]);
    expect(slot?.points).toEqual([]);
    expect(data.cells.some((cell) => cell.apron && cell.candidateCount > 0)).toBe(true);
  });

  it('uses the live ecology field to present legacy lakes as land and reserves occupied castles only', () => {
    const surface = createRealmTerrainSurface('grass-live-ecology', 4, 5);
    const terrainKinds = semanticMap(surface);
    terrainKinds.set('0,0', 'lake');
    const field = createRealmVegetationField({
      worldSeed: surface.renderMap.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: surface.playableKeys,
      visualizeLegacyLakesAsLand: true
    });
    const data = generateRealmGrassCells({
      ...inputFor(surface),
      cells: surface.playableMap.cells.filter((cell) => (
        hexKey(cell.coord) === '0,0' || hexKey(cell.coord) === '1,0'
      )),
      terrainKindsByKey: terrainKinds,
      castleSlotKeys: new Set(['1,0']),
      vegetationField: field,
      visualizeLegacyLakes: true,
      suppressCastleSlots: false
    });
    const lake = data.cells.find((cell) => cell.key === '0,0');
    const unoccupiedSlot = data.cells.find((cell) => cell.key === '1,0');

    expect(lake?.terrainKind).toBe('lowland');
    expect(lake?.completelyBare).toBe(false);
    expect(lake?.points.length).toBeGreaterThan(0);
    expect(unoccupiedSlot?.completelyBare).toBe(false);
    expect(unoccupiedSlot?.points.length).toBeGreaterThan(0);
  });

  it('accepts generic semantic-root exclusions without knowing asset names', () => {
    const surface = createRealmTerrainSurface('grass-exclusion', 4, 5);
    const center = axialToWorld({ q: 0, r: 0 }, 1);
    const exclusion: RealmGrassExclusion = {
      id: 'reviewed-feature-root',
      world: center,
      radius: 1.2
    };
    const without = generateRealmGrassCells(inputFor(surface));
    const withExclusion = generateRealmGrassCells({ ...inputFor(surface), exclusions: [exclusion] });

    expect(withExclusion.rejectedByExclusion).toBeGreaterThan(0);
    expect(withExclusion.points.filter((point) => (
      Math.hypot(point.world.x - center.x, point.world.z - center.z) < exclusion.radius
    ))).toEqual([]);
    expect(withExclusion.points.length).toBeLessThan(without.points.length);
  });

  it('uses the same exact generic circles through a bounded prebuilt exclusion index', () => {
    const surface = createRealmTerrainSurface('grass-indexed-exclusion', 4, 5);
    const center = axialToWorld({ q: 0, r: 0 }, 1);
    const exclusion: RealmGrassExclusion = {
      id: 'generic-reviewed-root',
      world: center,
      radius: 1.2
    };
    const indexed = createRealmGrassExclusionIndex([exclusion], 1);
    const raw = generateRealmGrassCells({ ...inputFor(surface), exclusions: [exclusion] });
    const fromIndex = generateRealmGrassCells({ ...inputFor(surface), exclusionIndex: indexed });

    expect(indexed.size).toBe(1);
    expect(Object.isFrozen(indexed.get(center))).toBe(true);
    expect(fromIndex).toEqual(raw);
  });

  it('thins steep ground, preserves bare cells, and never materializes lake grass', () => {
    const surface = createRealmTerrainSurface('grass-slope-and-bare', 10, 11);
    const flat = generateRealmGrassCells(inputFor(surface));
    const steep = generateRealmGrassCells({
      ...inputFor(surface),
      heightAtWorld: (world) => world.x * 20 + world.z * 20
    });

    expect(flat.completelyBareCellCount).toBeGreaterThan(0);
    expect(steep.rejectedBySlope).toBeGreaterThan(0);
    expect(steep.points.length).toBeLessThan(flat.points.length);
    expect(flat.cells.filter((cell) => cell.terrainKind === 'lake').every((cell) => cell.points.length === 0))
      .toBe(true);
  });

  it('takes balanced and reduced layouts as exact prefixes of the canonical High reservoir', () => {
    const surface = createRealmTerrainSurface('grass-quality-subsets', 6, 7);
    const terrainKinds = semanticMap(surface);
    const vegetationField = createRealmVegetationField({
      worldSeed: surface.renderMap.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: surface.playableKeys
    });
    const common = {
      ...inputFor(surface),
      terrainKindsByKey: terrainKinds,
      vegetationField,
      heightAtWorld: () => 0
    };
    const high = generateRealmGrassCells({ ...common, quality: 'high' });
    const balanced = generateRealmGrassCells({ ...common, quality: 'balanced' });
    const reduced = generateRealmGrassCells({ ...common, quality: 'reduced' });
    const id = (point: (typeof high.points)[number]) =>
      `${point.coord.q},${point.coord.r}:${point.candidateIndex}`;
    const highById = new Map(high.points.map((point) => [id(point), point]));
    const balancedById = new Map(balanced.points.map((point) => [id(point), point]));

    expect(balanced.points.length).toBeLessThan(high.points.length);
    expect(reduced.points.length).toBeLessThan(balanced.points.length);
    balanced.points.forEach((point) => expect(highById.get(id(point))).toEqual(point));
    reduced.points.forEach((point) => {
      expect(highById.get(id(point))).toEqual(point);
      expect(balancedById.get(id(point))).toEqual(point);
    });
    expect(realmGrassCandidateCount(
      REALM_GRASS_BIOME_PROFILES.meadow,
      'high',
      10
    )).toBe(REALM_GRASS_BIOME_PROFILES.meadow.highCandidateCount);
  });

  it('thins and winter-tints northern grass while preserving quality subsets', () => {
    const surface = createRealmTerrainSurface('grass-northern-snow', 58, 60);
    const northernCells = surface.playableMap.cells.filter((cell) => (
      cell.coord.r <= -22 && cell.coord.r >= -54
    ));
    const northernSnow = createRealmNorthernSnowField({
      worldSeed: surface.renderMap.worldSeed,
      hexSize: 1,
      playableRadius: surface.playableMap.radius,
      renderRadius: surface.renderMap.radius
    });
    const common = {
      ...inputFor(surface, northernCells),
      heightAtWorld: () => 0,
      northernSnow
    };
    const baseline = generateRealmGrassCells({
      ...common,
      northernSnow: undefined,
      quality: 'high'
    });
    const high = generateRealmGrassCells({ ...common, quality: 'high' });
    const balanced = generateRealmGrassCells({ ...common, quality: 'balanced' });
    const reduced = generateRealmGrassCells({ ...common, quality: 'reduced' });
    const id = (point: (typeof high.points)[number]) =>
      `${point.coord.q},${point.coord.r}:${point.candidateIndex}`;
    const baselineById = new Map(baseline.points.map((point) => [id(point), point]));
    const highById = new Map(high.points.map((point) => [id(point), point]));
    const balancedById = new Map(balanced.points.map((point) => [id(point), point]));

    expect(high.points.length).toBeLessThan(baseline.points.length);
    expect(high.rejectedBySnow).toBeGreaterThan(0);
    expect(high.retainedInSnowTransition).toBeGreaterThan(0);
    expect(high.points.every((point) => (
      point.snowCoverage >= 0 && point.snowCoverage <= 1
    ))).toBe(true);
    const transition = high.points.find((point) => (
      point.snowCoverage >= 0.15 && point.snowCoverage < 0.88
    ));
    expect(transition).toBeDefined();
    const original = baselineById.get(id(transition!));
    expect(original).toBeDefined();
    expect(transition!.height).toBeLessThan(original!.height);
    expect(transition!.tint).not.toEqual(original!.tint);
    expect(transition!.windScale).toBeLessThan(original!.windScale);

    balanced.points.forEach((point) => expect(highById.get(id(point))).toEqual(point));
    reduced.points.forEach((point) => {
      expect(highById.get(id(point))).toEqual(point);
      expect(balancedById.get(id(point))).toEqual(point);
    });
  });

  it('creates deterministic bare cells, tuft clusters, rests, and open soil pockets', () => {
    const surface = createRealmTerrainSurface('grass-true-bare-distribution', 12, 13);
    const results = (['meadow', 'lowland', 'forest', 'heath'] as const).map((kind) => {
      const terrainKinds = new Map<string, RealmTerrainKind>(
        surface.playableMap.cells.map((cell) => [hexKey(cell.coord), kind])
      );
      const vegetationField = createRealmVegetationField({
        worldSeed: surface.renderMap.worldSeed,
        terrainKindsByKey: terrainKinds,
        playableKeys: surface.playableKeys
      });
      return generateRealmGrassCells({
        ...inputFor(surface, surface.playableMap.cells),
        terrainKindsByKey: terrainKinds,
        vegetationField,
        heightAtWorld: () => 0
      });
    });
    const [meadow, lowland, forest, heath] = results;

    expect(meadow.completelyBareCellCount).toBeGreaterThan(0);
    expect(meadow.completelyBareCellCount).toBeLessThan(lowland.completelyBareCellCount);
    expect(lowland.completelyBareCellCount).toBeLessThan(forest.completelyBareCellCount);
    expect(forest.completelyBareCellCount).toBeLessThan(heath.completelyBareCellCount);
    meadow.cells.filter((cell) => cell.completelyBare)
      .forEach((cell) => expect(cell.points).toEqual([]));

    const nonBareMeadow = meadow.cells.filter((cell) => !cell.completelyBare);
    expect(nonBareMeadow.some((cell) => cell.points.length <= 5)).toBe(true);
    expect(nonBareMeadow.some((cell) => cell.points.length >= 25)).toBe(true);
    const retainedClusterAverage = meadow.points.reduce((total, point) => (
      total + sampleRealmGrassCoverage(surface.renderMap.worldSeed, point.world).cluster
    ), 0) / meadow.points.length;
    const centerClusterAverage = surface.playableMap.cells.reduce((total, cell) => (
      total + sampleRealmGrassCoverage(
        surface.renderMap.worldSeed,
        axialToWorld(cell.coord, 1)
      ).cluster
    ), 0) / surface.playableMap.cells.length;
    expect(retainedClusterAverage).toBeGreaterThan(centerClusterAverage + 0.04);
  });

  it('grounds roots to a sampled slope and aligns their immutable surface normals', () => {
    const surface = createRealmTerrainSurface('grass-surface-frame', 4, 5);
    const heightAtWorld = (world: Readonly<{ x: number; z: number }>) =>
      1.7 + world.x * 0.2 - world.z * 0.1;
    const data = generateRealmGrassCells({
      ...inputFor(surface),
      heightAtWorld
    });
    const normalLength = Math.hypot(-0.2, 1, 0.1);
    const expectedNormal = {
      x: -0.2 / normalLength,
      y: 1 / normalLength,
      z: 0.1 / normalLength
    };

    expect(data.points.length).toBeGreaterThan(0);
    data.points.forEach((point) => {
      expect(point.groundY).toBeCloseTo(heightAtWorld(point.world), 10);
      expect(point.surfaceNormal.x).toBeCloseTo(expectedNormal.x, 10);
      expect(point.surfaceNormal.y).toBeCloseTo(expectedNormal.y, 10);
      expect(point.surfaceNormal.z).toBeCloseTo(expectedNormal.z, 10);
      expect(Object.isFrozen(point.surfaceNormal)).toBe(true);
    });
  });

  it('shares local gust phase and progressively shelters the forest edge', () => {
    const surface = createRealmTerrainSurface('grass-wind-shelter', 10, 11);
    const terrainKinds = new Map<string, RealmTerrainKind>(
      surface.playableMap.cells.map((cell) => [
        hexKey(cell.coord),
        hexDistance(cell.coord, { q: 0, r: 0 }) <= 2 ? 'forest' : 'meadow'
      ])
    );
    const vegetationField = createRealmVegetationField({
      worldSeed: surface.renderMap.worldSeed,
      terrainKindsByKey: terrainKinds,
      playableKeys: surface.playableKeys
    });
    const data = generateRealmGrassCells({
      ...inputFor(surface, surface.playableMap.cells),
      terrainKindsByKey: terrainKinds,
      vegetationField,
      heightAtWorld: () => 0
    });
    const shelteredMeadow = data.points.filter((point) => (
      point.terrainKind === 'meadow' && point.windShelter > 0
    ));
    const openMeadow = data.points.filter((point) => (
      point.terrainKind === 'meadow' && point.windShelter === 0
    ));
    const averageWind = (points: typeof data.points) => points.reduce(
      (total, point) => total + point.windScale,
      0
    ) / points.length;

    expect(shelteredMeadow.length).toBeGreaterThan(0);
    expect(openMeadow.length).toBeGreaterThan(0);
    shelteredMeadow.forEach((point) => {
      expect(point.windShelter).toBeCloseTo(
        vegetationField.sample(point.world).forestNeighbourShare * 0.48,
        10
      );
    });
    expect(averageWind(shelteredMeadow)).toBeLessThan(averageWind(openMeadow));

    const nearbyPhaseDifferences: number[] = [];
    const phaseSample = data.points.slice(0, 400);
    for (let left = 0; left < phaseSample.length; left += 1) {
      for (let right = left + 1; right < phaseSample.length; right += 1) {
        const first = phaseSample[left]!;
        const second = phaseSample[right]!;
        if (Math.hypot(
          first.world.x - second.world.x,
          first.world.z - second.world.z
        ) >= 0.25) continue;
        const rawDifference = Math.abs(first.windPhase - second.windPhase);
        nearbyPhaseDifferences.push(Math.min(
          rawDifference,
          Math.PI * 2 - rawDifference
        ));
      }
    }
    expect(nearbyPhaseDifferences.length).toBeGreaterThan(20);
    expect(nearbyPhaseDifferences.reduce((total, value) => total + value, 0)
      / nearbyPhaseDifferences.length).toBeLessThan(0.4);
  });
});
