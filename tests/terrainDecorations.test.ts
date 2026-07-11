import { describe, expect, it, vi } from 'vitest';

import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import { axialToWorld, hexDistance } from '../src/game/map/hexCoordinates';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { generateTerrainDecorations } from '../src/game/map/terrainDecorations';
import { pointyHexBoundaryDistance } from '../src/game/map/terrainHeight';
import { HEGEMONY_KEEP_PLACEMENT, distanceToPlacement } from '../src/game/map/terrainPlacements';

describe('deterministic lowland decorations', () => {
  it('is stable, edge-safe, placement-safe, and never calls Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001);
    const first = generateTerrainDecorations(surface.renderMap, REALM_QUALITY_SPECS.high);
    const second = generateTerrainDecorations(surface.renderMap, REALM_QUALITY_SPECS.high);

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
    const high = generateTerrainDecorations(surface.renderMap, REALM_QUALITY_SPECS.high);
    const compact = generateTerrainDecorations(surface.renderMap, REALM_QUALITY_SPECS.compact);
    const reduced = generateTerrainDecorations(surface.renderMap, REALM_QUALITY_SPECS.reduced);

    expect(high.counts['green-tuft']).toBe(780);
    expect(high.counts['dry-tuft']).toBe(150);
    expect(high.counts.stone).toBeGreaterThanOrEqual(40);
    expect(high.counts.stone).toBeLessThanOrEqual(80);
    expect(compact.counts['green-tuft']).toBe(360);
    expect(reduced.counts['green-tuft']).toBe(60);
    expect(high.points.filter((point) => point.apron).length)
      .toBeLessThan(high.points.filter((point) => !point.apron).length);
  });
});
