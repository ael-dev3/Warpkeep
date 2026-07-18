import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  CANONICAL_WORLD_TILES,
  GENESIS_RENDER_RADIUS,
  LOWLANDS_RADIUS
} from '../spacetimedb/src/world';
import { createTerrainDecorationLayers } from '../src/components/realm/createTerrainDecorations';
import {
  REALM_QUALITY_SPECS,
  resolveRealmRenderPlan
} from '../src/components/realm/realmQuality';
import { axialToWorld, hexDistance, hexKey } from '../src/game/map/hexCoordinates';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import {
  createAuthoritativeRealmTerrainSurface,
  createRealmTerrainSurface
} from '../src/game/map/realmTerrainSurface';
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

function expandedGenesisSurface() {
  return createAuthoritativeRealmTerrainSurface(
    HEGEMONY_GENESIS_001,
    CANONICAL_WORLD_TILES,
    LOWLANDS_RADIUS,
    GENESIS_RENDER_RADIUS
  );
}

describe('deterministic lowland decorations', () => {
  it('is stable, edge-safe, placement-safe, and never calls Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
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
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
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

  it('moves high-quality tufts deterministically and keeps reduced quality static', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
    const highDetails = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.high, surface.playableMap.radius),
      1,
      HEGEMONY_TERRAIN_PLACEMENTS
    );
    const first = createTerrainDecorationLayers(
      highDetails,
      surface.renderMap,
      REALM_QUALITY_SPECS.high
    );
    const second = createTerrainDecorationLayers(
      highDetails,
      surface.renderMap,
      REALM_QUALITY_SPECS.high
    );
    const firstTufts = first.group.getObjectByName('terrain-green-tufts') as THREE.InstancedMesh;
    const secondTufts = second.group.getObjectByName('terrain-green-tufts') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    firstTufts.getMatrixAt(0, matrix);
    const initial = [...matrix.elements];

    expect(first.animated).toBe(true);
    expect(first.updateWind(0.18)).toBe(true);
    expect(second.updateWind(0.18)).toBe(true);
    firstTufts.getMatrixAt(0, matrix);
    const firstFrame = [...matrix.elements];
    secondTufts.getMatrixAt(0, matrix);
    expect([...matrix.elements]).toEqual(firstFrame);
    expect(firstFrame).not.toEqual(initial);
    expect(first.updateWind(0.18)).toBe(false);

    const reducedDetails = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.reduced, surface.playableMap.radius)
    );
    const reduced = createTerrainDecorationLayers(
      reducedDetails,
      surface.renderMap,
      REALM_QUALITY_SPECS.reduced
    );
    const reducedTufts = reduced.group.getObjectByName('terrain-green-tufts') as THREE.InstancedMesh;
    reducedTufts.getMatrixAt(0, matrix);
    const reducedInitial = [...matrix.elements];
    expect(reduced.animated).toBe(false);
    expect(reduced.updateWind(0.18)).toBe(false);
    reducedTufts.getMatrixAt(0, matrix);
    expect([...matrix.elements]).toEqual(reducedInitial);

    first.dispose();
    second.dispose();
    reduced.dispose();
    expect(first.updateWind(0.36)).toBe(false);
  });

  it('clears deterministic decoration footprints around off-center own and nearby peer castles', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
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

  it('bounds radius-sixty decoration selection and treats missing ring-58 cells as apron', () => {
    const surface = expandedGenesisSurface();
    const plan = resolveRealmRenderPlan(REALM_QUALITY_SPECS.high, {
      playableRadius: surface.playableMap.radius,
      renderRadius: surface.renderMap.radius,
      playableCellCount: surface.playableMap.cells.length,
      renderCellCount: surface.renderMap.cells.length
    });
    const details = generateTerrainDecorations(
      surface.renderMap,
      { ...plan.decorationDensity, playableRadius: surface.playableMap.radius },
      1,
      [],
      undefined,
      {
        maximumPoints: plan.genericDecorationInstanceBudget,
        preserveRadius: 20,
        playableKeys: surface.playableKeys
      }
    );
    const absentPerimeterDetails = details.points.filter((point) => (
      hexDistance({ q: 0, r: 0 }, point.coord) === LOWLANDS_RADIUS
      && !surface.playableKeys.has(hexKey(point.coord))
    ));

    expect(details.points.length).toBeLessThanOrEqual(plan.genericDecorationInstanceBudget);
    expect(details.points).toHaveLength(
      details.counts['green-tuft'] + details.counts['dry-tuft'] + details.counts.stone
    );
    expect(absentPerimeterDetails.length).toBeGreaterThan(0);
    expect(absentPerimeterDetails.every((point) => point.apron)).toBe(true);
    expect(details.points.every((point) => (
      point.apron === !surface.playableKeys.has(hexKey(point.coord))
    ))).toBe(true);
  });

  it('preserves every established radius-twenty decoration and its encounter order', () => {
    const establishedSurface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 20, 22);
    const expandedSurface = expandedGenesisSurface();

    for (const quality of Object.values(REALM_QUALITY_SPECS)) {
      const plan = resolveRealmRenderPlan(quality, {
        playableRadius: expandedSurface.playableMap.radius,
        renderRadius: expandedSurface.renderMap.radius,
        playableCellCount: expandedSurface.playableMap.cells.length,
        renderCellCount: expandedSurface.renderMap.cells.length
      });
      const density = {
        ...plan.decorationDensity,
        playableRadius: establishedSurface.playableMap.radius
      };
      const established = generateTerrainDecorations(
        establishedSurface.renderMap,
        density
      ).points.filter((point) => (
        hexDistance({ q: 0, r: 0 }, point.coord) <= 20
      ));
      const expanded = generateTerrainDecorations(
        expandedSurface.renderMap,
        { ...density, playableRadius: expandedSurface.playableMap.radius },
        1,
        [],
        undefined,
        {
          maximumPoints: plan.genericDecorationInstanceBudget,
          preserveRadius: 20,
          playableKeys: expandedSurface.playableKeys
        }
      ).points.filter((point) => (
        hexDistance({ q: 0, r: 0 }, point.coord) <= 20
      ));

      expect(expanded, quality.id).toEqual(established);
    }
  });

  it('does not scatter generic grass or stones across semantic blockers', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
    const blockerKinds = new Map(surface.renderMap.cells.map((cell) => [
      hexKey(cell.coord),
      'lake' as const
    ]));
    const details = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.high, surface.playableMap.radius),
      1,
      [],
      blockerKinds
    );

    expect(details.points).toHaveLength(0);
    expect(details.counts).toEqual({ 'green-tuft': 0, 'dry-tuft': 0, stone: 0 });
  });

  it('releases unique instance buffers exactly once when decoration layers are recreated', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001, 4, 5);
    const details = generateTerrainDecorations(
      surface.renderMap,
      decorationQuality(REALM_QUALITY_SPECS.reduced, surface.playableMap.radius)
    );
    const instanceDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    const layers = createTerrainDecorationLayers(
      details,
      surface.renderMap,
      REALM_QUALITY_SPECS.reduced
    );

    layers.dispose();
    layers.dispose();

    expect(instanceDispose).toHaveBeenCalledTimes(layers.drawCalls);
    instanceDispose.mockRestore();
  });
});
