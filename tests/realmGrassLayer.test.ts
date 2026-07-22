import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { createRealmGrassLayer } from '../src/components/realm/createRealmGrassLayer';
import type { RealmGrassRenderPlan } from '../src/components/realm/realmGrassActiveWindow';
import { REALM_GRASS_RENDER_PLANS } from '../src/components/realm/realmQuality';
import { axialToWorld, hexKey } from '../src/game/map/hexCoordinates';
import type { RealmTerrainKind } from '../src/game/map/realmTerrainSemantics';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';

function plan(): RealmGrassRenderPlan {
  return Object.freeze({
    ...REALM_GRASS_RENDER_PLANS.balanced,
    activeRadius: 2,
    hysteresisRadius: 2,
    cacheLimit: 8,
    maximumActiveInstances: 96,
    maximumActiveTriangles: 2_016
  });
}

describe('camera-local procedural grass layer', () => {
  it('hides at overview, packs one bounded non-raycast layer near the camera, and animates by uniform', () => {
    const surface = createRealmTerrainSurface('grass-layer', 4, 5);
    const terrainKinds = new Map<string, RealmTerrainKind>(
      surface.playableMap.cells.map((cell) => [hexKey(cell.coord), 'meadow'])
    );
    const layer = createRealmGrassLayer({
      surface,
      terrainKindsByKey: terrainKinds,
      castleSlotKeys: new Set(),
      placements: [],
      plan: plan(),
      reducedMotion: false
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'realm')).toBe(true);
    expect(layer.mesh.count).toBe(0);
    expect(layer.getTelemetry()).toMatchObject({
      overviewHidden: true,
      activeCellCount: 0,
      drawCalls: 0
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'keep')).toBe(true);
    const telemetry = layer.getTelemetry();
    expect(telemetry.overviewHidden).toBe(false);
    expect(telemetry.instanceCount).toBeGreaterThan(0);
    expect(telemetry.instanceCount).toBeLessThanOrEqual(96);
    expect(telemetry.triangleCount).toBeLessThanOrEqual(2_016);
    expect(telemetry.drawCalls).toBeLessThanOrEqual(2);
    expect(telemetry.cacheEntries).toBeLessThanOrEqual(8);
    expect(Object.values(telemetry.candidateCellsByTerrain)
      .reduce((total, count) => total + count, 0)).toBe(telemetry.candidateCellCount);
    expect(Object.values(telemetry.activeCellsByTerrain)
      .reduce((total, count) => total + count, 0)).toBe(telemetry.activeCellCount);
    expect(telemetry.activeCellCount).toBeLessThanOrEqual(telemetry.candidateCellCount);
    expect(telemetry.averageRetainedPatchesPerActiveCell).toBeCloseTo(
      telemetry.instanceCount / telemetry.activeCellCount,
      10
    );
    expect(Object.values(telemetry.countsByTerrain)
      .reduce((total, count) => total + count, 0)).toBe(telemetry.instanceCount);
    expect(telemetry.averageRetainedPatchesByTerrain.meadow).toBeCloseTo(
      telemetry.countsByTerrain.meadow / telemetry.activeCellsByTerrain.meadow,
      10
    );
    expect(telemetry.paletteGreenMin).toBeGreaterThan(0);
    expect(telemetry.paletteGreenMax).toBeGreaterThanOrEqual(telemetry.paletteGreenMin);
    expect(telemetry.paletteLuminanceMax).toBeGreaterThanOrEqual(
      telemetry.paletteLuminanceMin
    );
    expect(layer.meshes.reduce((sum, currentMesh) => sum + currentMesh.count, 0))
      .toBe(telemetry.instanceCount);
    expect(layer.mesh.geometry.getAttribute('grassPhase')).toBeDefined();
    expect(layer.mesh.geometry.getAttribute('grassEdgeFade')).toBeDefined();
    expect(layer.mesh.geometry.getAttribute('grassBladeData')).toBeDefined();
    expect(layer.isAnimationActive()).toBe(true);

    const populatedMesh = layer.meshes.find((currentMesh) => currentMesh.count > 0)!;
    const material = populatedMesh.material as THREE.MeshStandardMaterial;
    const geometryAttributeSlots = Object.values(populatedMesh.geometry.attributes)
      .reduce((sum, attribute) => sum + Math.ceil(attribute.itemSize / 4), 0);
    const activeAttributeSlots = geometryAttributeSlots + 4 + (populatedMesh.instanceColor ? 1 : 0);
    expect(material.vertexColors).toBe(false);
    expect(activeAttributeSlots).toBe(13);
    expect(activeAttributeSlots).toBeLessThanOrEqual(16);

    const matrixWrites = layer.meshes.map((currentMesh) => vi.spyOn(currentMesh, 'setMatrixAt'));
    const matrixVersions = layer.meshes.map((currentMesh) => currentMesh.instanceMatrix.version);
    expect(layer.updateWind(0.5)).toBe(true);
    layer.setInteraction({ q: 0, r: 0 }, { q: 1, r: 0 });
    matrixWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    layer.meshes.forEach((currentMesh, index) => expect(currentMesh.instanceMatrix.version)
      .toBe(matrixVersions[index]));
    expect(layer.updateView(axialToWorld({ q: 1, r: 0 }, 1), 'keep')).toBe(false);
    matrixWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(layer.updateView(axialToWorld({ q: 2, r: 0 }, 1), 'keep')).toBe(true);
    expect(matrixWrites.some((spy) => spy.mock.calls.length > 0)).toBe(true);

    const intersections: THREE.Intersection[] = [];
    layer.mesh.raycast(new THREE.Raycaster(), intersections);
    expect(intersections).toEqual([]);
    layer.dispose();
    layer.dispose();
  });

  it('makes reduced-motion grass static while preserving the same bounded geometry layer', () => {
    const surface = createRealmTerrainSurface('grass-layer-static', 3, 4);
    const terrainKinds = new Map<string, RealmTerrainKind>(
      surface.playableMap.cells.map((cell) => [hexKey(cell.coord), 'lowland'])
    );
    const layer = createRealmGrassLayer({
      surface,
      terrainKindsByKey: terrainKinds,
      castleSlotKeys: new Set(),
      placements: [],
      plan: plan(),
      reducedMotion: true
    });

    layer.updateView({ x: 0, z: 0 }, 'keep');
    expect(layer.getTelemetry().animated).toBe(false);
    expect(layer.updateWind(1)).toBe(false);
    layer.dispose();
  });
});
