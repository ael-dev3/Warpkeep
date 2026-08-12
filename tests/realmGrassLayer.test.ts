import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { createRealmGrassLayer } from '../src/components/realm/createRealmGrassLayer';
import { REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS } from '../src/components/realm/createRealmGrassMaterial';
import type { RealmGrassRenderPlan } from '../src/components/realm/realmGrassActiveWindow';
import {
  REALM_GRASS_RENDER_PLANS,
  REALM_LIVING_REALM_BUDGETS
} from '../src/components/realm/realmQuality';
import { axialToWorld, hexKey } from '../src/game/map/hexCoordinates';
import { sampleRealmGrassSurfaceFrame } from '../src/game/map/realmGrass';
import { REALM_GRASS_COLOR_BOUNDS } from '../src/game/map/realmGrassPalette';
import type { RealmTerrainKind } from '../src/game/map/realmTerrainSemantics';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { terrainHeightAtWorld } from '../src/game/map/terrainHeight';

function plan(): RealmGrassRenderPlan {
  return Object.freeze({
    ...REALM_GRASS_RENDER_PLANS.balanced,
    activeRadius: 2,
    nearRadius: 0.75,
    lodTransitionCells: 1,
    midDensityMultiplier: 1,
    hysteresisRadius: 2,
    cacheLimit: 8,
    maximumNearInstances: 64,
    maximumMidInstances: 32,
    maximumNearTriangles: 1_728,
    maximumMidTriangles: 128,
    maximumActiveInstances: 96,
    maximumActiveTriangles: 2_592
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
      reducedMotion: false,
      livingBudget: REALM_LIVING_REALM_BUDGETS.balanced
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
    expect(telemetry.triangleCount).toBeLessThanOrEqual(2_592);
    expect(telemetry.nearInstanceCount).toBeGreaterThan(0);
    expect(telemetry.midInstanceCount).toBeGreaterThan(0);
    expect(telemetry.nearInstanceCount).toBeLessThanOrEqual(64);
    expect(telemetry.midInstanceCount).toBeLessThanOrEqual(32);
    expect(telemetry.nearTriangleCount).toBeLessThanOrEqual(1_728);
    expect(telemetry.midTriangleCount).toBeLessThanOrEqual(128);
    expect(telemetry.drawCalls).toBeLessThanOrEqual(4);
    expect(telemetry.nearDrawCalls).toBeLessThanOrEqual(2);
    expect(telemetry.midDrawCalls).toBeLessThanOrEqual(2);
    expect(telemetry.lodTransitionInstanceCount).toBeGreaterThan(0);
    expect(telemetry.wildflowers.instanceCount).toBeLessThanOrEqual(256);
    expect(telemetry.wildflowers.triangleCount)
      .toBe(telemetry.wildflowers.instanceCount * 4);
    expect(telemetry.wildflowers.drawCalls).toBeLessThanOrEqual(1);
    expect(layer.wildflowers.mesh.parent).toBe(layer.group);
    expect(layer.wildflowers.mesh.raycast).toBeDefined();
    expect(telemetry.cacheEntries).toBeLessThanOrEqual(8);
    expect(telemetry.cacheLimit).toBe(8);
    expect(telemetry.cacheHighWaterMark).toBe(telemetry.cacheEntries);
    expect(telemetry.cacheHighWaterMark).toBeGreaterThan(0);
    expect(telemetry.repackCount).toBe(2);
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
    expect(telemetry.paletteDisplaySrgbSaturationMin).toBeGreaterThan(0);
    expect(telemetry.paletteDisplaySrgbSaturationMax)
      .toBeLessThanOrEqual(REALM_GRASS_COLOR_BOUNDS.displaySrgbSaturationMax);
    expect(telemetry.paletteLuminanceMin)
      .toBeGreaterThanOrEqual(REALM_GRASS_COLOR_BOUNDS.linearLuminanceMin);
    expect(telemetry.paletteLuminanceMax)
      .toBeLessThanOrEqual(REALM_GRASS_COLOR_BOUNDS.linearLuminanceMax);
    expect(layer.meshes.reduce((sum, currentMesh) => sum + currentMesh.count, 0))
      .toBe(telemetry.instanceCount);
    expect(layer.nearMeshes.reduce((sum, currentMesh) => sum + currentMesh.count, 0))
      .toBe(telemetry.nearInstanceCount);
    expect(layer.midMeshes.reduce((sum, currentMesh) => sum + currentMesh.count, 0))
      .toBe(telemetry.midInstanceCount);
    expect(layer.nearMeshes.every((currentMesh) => currentMesh.frustumCulled)).toBe(true);
    expect(layer.midMeshes.every((currentMesh) => currentMesh.frustumCulled)).toBe(true);
    expect(layer.meshes.every((currentMesh) => (
      currentMesh.instanceMatrix.usage === THREE.DynamicDrawUsage
    ))).toBe(true);
    expect(layer.meshes.filter((currentMesh) => currentMesh.count > 0).every((currentMesh) => (
      currentMesh.boundingBox !== null && currentMesh.boundingSphere !== null
    ))).toBe(true);
    expect(layer.mesh.geometry.getAttribute('grassPhase')).toBeDefined();
    expect(layer.mesh.geometry.getAttribute('grassEdgeFade')).toBeDefined();
    expect((layer.mesh.geometry.getAttribute('grassPhase') as THREE.BufferAttribute).usage)
      .toBe(THREE.DynamicDrawUsage);
    expect((layer.mesh.geometry.getAttribute('grassEdgeFade') as THREE.BufferAttribute).usage)
      .toBe(THREE.DynamicDrawUsage);
    expect(layer.mesh.geometry.getAttribute('grassBladeData')).toBeDefined();
    expect(layer.midMeshes[0]?.geometry.userData.realmGrassLod).toBe('mid');
    expect(layer.midMeshes[0]?.geometry.userData.realmGrassTriangleCount)
      .toBeLessThan(layer.nearMeshes[0]?.geometry.userData.realmGrassTriangleCount);
    expect(layer.isAnimationActive()).toBe(true);

    const populatedMesh = layer.meshes.find((currentMesh) => currentMesh.count > 0)!;
    const expandedBoundingBox = populatedMesh.boundingBox!.clone();
    const expandedBoundingSphere = populatedMesh.boundingSphere!.clone();
    populatedMesh.computeBoundingBox();
    const undeformedBoundingBox = populatedMesh.boundingBox!.clone();
    populatedMesh.computeBoundingSphere();
    const undeformedBoundingSphere = populatedMesh.boundingSphere!.clone();
    expect(expandedBoundingBox.min.x).toBeCloseTo(
      undeformedBoundingBox.min.x - REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS,
      10
    );
    expect(expandedBoundingBox.max.y).toBeCloseTo(
      undeformedBoundingBox.max.y + REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS,
      10
    );
    expect(expandedBoundingSphere.radius).toBeCloseTo(
      undeformedBoundingSphere.radius + REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS,
      10
    );
    populatedMesh.boundingBox!.copy(expandedBoundingBox);
    populatedMesh.boundingSphere!.copy(expandedBoundingSphere);
    const material = populatedMesh.material as THREE.MeshStandardMaterial;
    const geometryAttributeSlots = Object.values(populatedMesh.geometry.attributes)
      .reduce((sum, attribute) => sum + Math.ceil(attribute.itemSize / 4), 0);
    const activeAttributeSlots = geometryAttributeSlots + 4 + (populatedMesh.instanceColor ? 1 : 0);
    expect(material.vertexColors).toBe(false);
    expect(activeAttributeSlots).toBe(13);
    expect(activeAttributeSlots).toBeLessThanOrEqual(16);
    const plantedMatrix = new THREE.Matrix4();
    populatedMesh.getMatrixAt(0, plantedMatrix);
    const plantedPosition = new THREE.Vector3().setFromMatrixPosition(plantedMatrix);
    const plantedUp = new THREE.Vector3(
      plantedMatrix.elements[4]!,
      plantedMatrix.elements[5]!,
      plantedMatrix.elements[6]!
    ).normalize();
    const expectedSurface = sampleRealmGrassSurfaceFrame(
      { x: plantedPosition.x, z: plantedPosition.z },
      (world) => terrainHeightAtWorld(surface.renderMap, world, 1, [])
    );
    expect(plantedPosition.y).toBeCloseTo(
      terrainHeightAtWorld(surface.renderMap, plantedPosition, 1, []),
      5
    );
    expect(plantedUp.dot(new THREE.Vector3(
      expectedSurface.normal.x,
      expectedSurface.normal.y,
      expectedSurface.normal.z
    ))).toBeGreaterThan(0.9999);

    const matrixWrites = layer.meshes.map((currentMesh) => vi.spyOn(currentMesh, 'setMatrixAt'));
    const matrixVersions = layer.meshes.map((currentMesh) => currentMesh.instanceMatrix.version);
    expect(layer.updateWind(0.5)).toBe(true);
    expect(layer.updateWind(0.75, {
      count: 1,
      centers: new Float32Array([1, 2, 0, 0, 0, 0, 0, 0]),
      params: new Float32Array([0.7, 0.8, 0.25, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    })).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      disturbanceSlotCount: 4,
      activeDisturbanceCount: 1
    });
    layer.setInteraction({ q: 0, r: 0 }, { q: 1, r: 0 });
    matrixWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    layer.meshes.forEach((currentMesh, index) => expect(currentMesh.instanceMatrix.version)
      .toBe(matrixVersions[index]));
    expect(layer.updateView(axialToWorld({ q: 1, r: 0 }, 1), 'keep')).toBe(false);
    expect(layer.getTelemetry().repackCount).toBe(2);
    matrixWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(layer.invalidateExclusions()).toBe(true);
    matrixWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(layer.updateView(axialToWorld({ q: 1, r: 0 }, 1), 'keep')).toBe(true);
    expect(layer.getTelemetry().repackCount).toBe(3);
    expect(layer.getTelemetry().cacheHighWaterMark).toBe(telemetry.cacheHighWaterMark);
    expect(matrixWrites.some((spy) => spy.mock.calls.length > 0)).toBe(true);
    matrixWrites.forEach((spy) => spy.mockClear());
    expect(layer.updateView(axialToWorld({ q: 1, r: 0 }, 1), 'keep')).toBe(false);
    matrixWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(layer.updateView(axialToWorld({ q: 3, r: 0 }, 1), 'keep')).toBe(true);
    expect(layer.getTelemetry().repackCount).toBe(4);
    expect(layer.getTelemetry().cacheHighWaterMark).toBe(8);
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
    expect(layer.getTelemetry().wildflowers.animated).toBe(false);
    expect(layer.updateWind(1)).toBe(false);
    const material = layer.mesh.material as THREE.MeshStandardMaterial;
    const uniforms = material.userData.realmGrassUniforms as {
      uGrassTime: THREE.IUniform<number>;
      uGrassWindStrength: THREE.IUniform<number>;
    };
    expect(uniforms.uGrassWindStrength.value).toBe(0);
    expect(uniforms.uGrassTime.value).toBe(0);
    layer.dispose();
    expect(layer.invalidateExclusions()).toBe(false);
  });

  it('reports shader fallback truthfully while retaining the static grass instances', () => {
    const surface = createRealmTerrainSurface('grass-layer-fallback', 3, 4);
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
    layer.updateView({ x: 0, z: 0 }, 'keep');
    const before = layer.getTelemetry();
    const material = layer.mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      vertexShader: 'void main() {}',
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {}
    };
    const compile = material.onBeforeCompile as unknown as (
      shaderInput: typeof shader
    ) => void;

    expect(() => compile(shader)).not.toThrow();
    const fallback = layer.getTelemetry();
    expect(fallback.shaderFallbackActive).toBe(true);
    expect(fallback.shaderFallbackCount).toBe(1);
    expect(fallback.shaderFallbackReason)
      .toBe('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
    expect(fallback.instanceCount).toBe(before.instanceCount);
    expect(fallback.instanceCount).toBeGreaterThan(0);
    expect(layer.group.visible).toBe(true);
    expect(fallback.animated).toBe(fallback.wildflowers.animated);
    expect(layer.isAnimationActive()).toBe(fallback.wildflowers.animated);
    expect(layer.updateWind(1)).toBe(fallback.wildflowers.animated);

    layer.dispose();
  });
});
