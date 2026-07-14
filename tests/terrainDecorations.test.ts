import { describe, expect, it, vi } from 'vitest';

import {
  REALM_QUALITY_SPECS,
  resolveRealmRenderPlan
} from '../src/components/realm/realmQuality';
import { axialToWorld, hexDistance } from '../src/game/map/hexCoordinates';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { generateTerrainDecorations } from '../src/game/map/terrainDecorations';
import { pointyHexBoundaryDistance } from '../src/game/map/terrainHeight';
import {
  createHegemonyCastlePlacements,
  HEGEMONY_KEEP_PLACEMENT,
  HEGEMONY_TERRAIN_PLACEMENTS,
  distanceToPlacement
} from '../src/game/map/terrainPlacements';

function decorationQuality(
  quality: (typeof REALM_QUALITY_SPECS)[keyof typeof REALM_QUALITY_SPECS],
  playableRadius: number
) {
  return { ...quality, playableRadius };
}

describe('deterministic lowland decorations', () => {
  it('is stable, edge-safe, placement-safe, and never calls Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001);
    const first = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.high, surface.playableMap.radius),
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );
    const second = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.high, surface.playableMap.radius),
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );

    expect(first).toEqual(second);
    expect(random).not.toHaveBeenCalled();
    first.points.forEach((point) => {
      const center = axialToWorld(point.coord, 1);
      expect(pointyHexBoundaryDistance({
        x: point.world.x - center.x,
        z: point.world.z - center.z
      }, 1)).toBeLessThanOrEqual(0.74);
      expect(distanceToPlacement(HEGEMONY_KEEP_PLACEMENT, point.world, 1))
        .toBeGreaterThanOrEqual(HEGEMONY_KEEP_PLACEMENT.blendRadius + 0.08);
    });
    expect(first.points.some((point) => hexDistance({ q: 0, r: 0 }, point.coord) === 5)).toBe(true);
  });

  it('respects quality density and reduces the visual-apron density', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001);
    const high = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.high, surface.playableMap.radius),
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );
    const balanced = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.balanced, surface.playableMap.radius),
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );
    const reduced = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.reduced, surface.playableMap.radius),
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );

    expect(high.counts['green-tuft']).toBe(780);
    expect(high.counts['dry-tuft']).toBe(150);
    expect(high.counts.stone).toBeGreaterThanOrEqual(40);
    expect(high.counts.stone).toBeLessThanOrEqual(80);
    expect(balanced.counts['green-tuft']).toBe(480);
    expect(reduced.counts['green-tuft']).toBe(60);
    expect(high.points.filter((point) => point.apron).length)
      .toBeLessThan(high.points.filter((point) => !point.apron).length);
  });

  it('clears deterministic decoration footprints around off-center own and nearby peer castles', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001);
    const placements = createHegemonyCastlePlacements([
      { id: 'own-keep', coord: { q: 2, r: -1 } },
      { id: 'peer-castle-2', coord: { q: 2, r: 0 } }
    ]);
    const uncleared = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.high, surface.playableMap.radius),
      1,
      []
    );
    const cleared = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.high, surface.playableMap.radius),
      1,
      placements
    );

    expect(uncleared.points.some((point) => placements.some((placement) => (
      distanceToPlacement(placement, point.world, 1) < placement.blendRadius + 0.08
    )))).toBe(true);
    cleared.points.forEach((point) => {
      placements.forEach((placement) => {
        expect(distanceToPlacement(placement, point.world, 1))
          .toBeGreaterThanOrEqual(placement.blendRadius + 0.08);
      });
    });
  });

  it('keeps the expanded radius-twenty detail layer under its deterministic instance ceiling', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 20, 22);
    const plan = resolveRealmRenderPlan(REALM_QUALITY_SPECS.high, {
      playableRadius: surface.playableMap.radius,
      renderRadius: surface.renderMap.radius,
      playableCellCount: surface.playableMap.cells.length,
      renderCellCount: surface.renderMap.cells.length
    });
    const details = generateTerrainDecorations(surface.renderMap, {
      ...plan.decorationDensity,
      playableRadius: surface.playableMap.radius
    });

    expect(details.points).toHaveLength(
      details.counts['green-tuft'] + details.counts['dry-tuft'] + details.counts.stone
    );
    expect(details.points.length).toBeLessThanOrEqual(plan.estimatedMaximumDecorationInstances);
    expect(details.points.length).toBeLessThanOrEqual(plan.decorationInstanceBudget);
    expect(details.counts['green-tuft']).toBeGreaterThan(details.counts['dry-tuft']);
    expect(details.counts['dry-tuft']).toBeGreaterThan(details.counts.stone);
  });
});
