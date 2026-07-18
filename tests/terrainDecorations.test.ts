import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { createTerrainDecorationLayers } from '../src/components/realm/createTerrainDecorations';
import { REALM_QUALITY_SPECS, resolveRealmRenderPlan } from '../src/components/realm/realmQuality';
import { axialToWorld, hexDistance } from '../src/game/map/hexCoordinates';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { generateTerrainDecorations } from '../src/game/map/terrainDecorations';
import { pointyHexBoundaryDistance } from '../src/game/map/terrainHeight';
import {
  HEGEMONY_KEEP_PLACEMENT,
  HEGEMONY_TERRAIN_PLACEMENTS,
  distanceToPlacement
} from '../src/game/map/terrainPlacements';

describe('static lowland stone decorations', () => {
  it('is deterministic, bounded, edge-safe, placement-safe, and never calls Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
    const quality = { playableRadius: 4, stoneChancePlayable: 0.8, stoneChanceApron: 0.2 };
    const first = generateTerrainDecorations(
      surface.renderMap,
      quality,
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );
    const second = generateTerrainDecorations(
      surface.renderMap,
      quality,
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );

    expect(first).toEqual(second);
    expect(random).not.toHaveBeenCalled();
    expect(first.counts).toEqual({ stone: first.points.length });
    first.points.forEach((point) => {
      const center = axialToWorld(point.coord, 1);
      expect(pointyHexBoundaryDistance({
        x: point.world.x - center.x,
        z: point.world.z - center.z
      }, 1)).toBeLessThanOrEqual(0.72);
      expect(distanceToPlacement(HEGEMONY_KEEP_PLACEMENT, point.world, 1))
        .toBeGreaterThanOrEqual(HEGEMONY_KEEP_PLACEMENT.blendRadius + 0.08);
    });
    expect(first.points.some((point) => hexDistance({ q: 0, r: 0 }, point.coord) === 5)).toBe(true);
  });

  it('keeps stones separate from the grass replacement and suppresses semantic barren terrain', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
    const barren = new Map(surface.renderMap.cells.map((cell) => [
      `${cell.coord.q},${cell.coord.r}`,
      'lake' as const
    ]));
    const details = generateTerrainDecorations(
      surface.renderMap,
      { playableRadius: 4, stoneChancePlayable: 1, stoneChanceApron: 1 },
      1,
      [],
      barren
    );
    expect(details.points).toEqual([]);
    expect(details.counts).toEqual({ stone: 0 });
  });

  it('keeps radius-sixty static detail under its independent static budget', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 58, 60);
    const plan = resolveRealmRenderPlan(REALM_QUALITY_SPECS.high, {
      playableRadius: surface.playableMap.radius,
      renderRadius: surface.renderMap.radius,
      playableCellCount: surface.playableMap.cells.length,
      renderCellCount: surface.renderMap.cells.length
    });
    const details = generateTerrainDecorations(
      surface.renderMap,
      { ...plan.stoneDecorationDensity, playableRadius: surface.playableMap.radius },
      1,
      [],
      undefined,
      {
        maximumPoints: plan.stoneDecorationInstanceBudget,
        preserveRadius: 20,
        playableKeys: surface.playableKeys
      }
    );
    expect(details.points.length).toBeLessThanOrEqual(plan.stoneDecorationInstanceBudget);
    expect(details.points.length).toBeLessThanOrEqual(plan.decorationInstanceBudget);
  });

  it('creates one static stone draw and releases it exactly once', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
    const data = generateTerrainDecorations(
      surface.renderMap,
      { playableRadius: 4, stoneChancePlayable: 1, stoneChanceApron: 0 }
    );
    const dispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    const layers = createTerrainDecorationLayers(data, surface.renderMap, REALM_QUALITY_SPECS.reduced);

    expect(layers.group.getObjectByName('terrain-green-tufts')).toBeUndefined();
    expect(layers.group.getObjectByName('terrain-dry-tufts')).toBeUndefined();
    expect(layers.drawCalls).toBe(data.points.length > 0 ? 1 : 0);
    layers.dispose();
    layers.dispose();
    expect(dispose).toHaveBeenCalledTimes(layers.drawCalls);
    dispose.mockRestore();
  });
});
