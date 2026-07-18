import { describe, expect, it } from 'vitest';

import {
  createRealmGrassExclusionIndex,
  generateRealmGrassCells,
  type RealmGrassExclusion
} from '../src/game/map/realmGrass';
import type { RealmTerrainKind } from '../src/game/map/realmTerrainSemantics';
import { axialToWorld, hexKey } from '../src/game/map/hexCoordinates';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { pointyHexBoundaryDistance } from '../src/game/map/terrainHeight';
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
      expect(point.height).toBeGreaterThanOrEqual(0.08);
      expect(point.height).toBeLessThanOrEqual(0.30);
      expect(point.width).toBeGreaterThanOrEqual(0.07);
      expect(point.width).toBeLessThanOrEqual(0.22);
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
});
