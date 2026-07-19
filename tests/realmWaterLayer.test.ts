import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_RIVERS_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_SEA_LEVEL_MILLI
} from '../spacetimedb/src/waterWorld';
import { HEGEMONY_WORLD_SEED } from '../spacetimedb/src/world';
import { canonicalLowlandsTerrainCenterHeight } from '../spacetimedb/src/lowlandsSurface';
import {
  createRealmWaterLayer,
  REALM_WATER_RENDER_BUDGETS,
  waterSurfaceLevelToWorldY
} from '../src/components/realm/realmWaterLayer';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

const canonicalHeightAt = (coord: Readonly<{ q: number; r: number }>) => (
  canonicalLowlandsTerrainCenterHeight(HEGEMONY_WORLD_SEED, coord.q, coord.r)
);

function createLayer(quality: 'high' | 'balanced' | 'reduced', reducedMotion = false) {
  return createRealmWaterLayer({
    cells: GENESIS_WATER_CELLS_V1,
    quality: REALM_QUALITY_SPECS[quality],
    reducedMotion,
    hexSize: 1,
    heightAt: canonicalHeightAt
  });
}

function compileMaterial(material: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <color_vertex>',
    fragmentShader: '#include <opaque_fragment>\n#include <dithering_fragment>'
  };
  material.onBeforeCompile(
    shader as Parameters<typeof material.onBeforeCompile>[0],
    {} as THREE.WebGLRenderer
  );
  return shader;
}

describe('Realm canonical water layer', () => {
  it('converts the persisted fixed-point datum into terrain world height', () => {
    expect(waterSurfaceLevelToWorldY(1_000)).toBe(0);
    expect(waterSurfaceLevelToWorldY(GENESIS_WATER_SEA_LEVEL_MILLI)).toBeCloseTo(-0.025, 6);
  });

  it('constructs the complete reduced layer inside its four-draw budget', () => {
    const layer = createLayer('reduced');
    const telemetry = layer.getTelemetry();

    expect(telemetry.drawCalls).toBe(4);
    expect(telemetry.drawCalls).toBeLessThanOrEqual(REALM_WATER_RENDER_BUDGETS.reduced.draws);
    expect(telemetry.triangleCount).toBeLessThanOrEqual(
      REALM_WATER_RENDER_BUDGETS.reduced.triangles
    );
    expect(telemetry.fullFogOceanCellCount).toBeGreaterThan(0);
    expect(layer.isAnimationActive()).toBe(false);
    expect(layer.updateEnvironment(1)).toBe(false);

    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const rivers = layer.group.getObjectByName('canonical-river-ribbons') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const fogMix = Array.from(ocean.geometry.getAttribute('waterFogMix').array as ArrayLike<number>);
    expect(fogMix).toContain(0);
    expect(fogMix.some((value) => Math.abs(value - 0.45) < 0.0001)).toBe(true);
    expect(fogMix).toContain(1);

    // Each canonical river gains one visual continuation cell into the ocean,
    // producing two ribbon triangles per authoritative river cell.
    expect((rivers.geometry.index?.count ?? 0) / 3).toBe(
      GENESIS_RIVERS_V1.reduce((sum, river) => sum + river.orderedCellKeys.length * 2, 0)
    );
    const riverPositions = rivers.geometry.getAttribute('position');
    let vertexOffset = 0;
    for (const river of GENESIS_RIVERS_V1) {
      const mouthVertex = vertexOffset + (river.orderedCellKeys.length - 1) * 2;
      const oceanVertex = vertexOffset + river.orderedCellKeys.length * 2;
      expect(riverPositions.getY(mouthVertex))
        .toBeCloseTo(waterSurfaceLevelToWorldY(GENESIS_WATER_SEA_LEVEL_MILLI) + 0.003, 6);
      expect(riverPositions.getY(oceanVertex))
        .toBeCloseTo(waterSurfaceLevelToWorldY(GENESIS_WATER_SEA_LEVEL_MILLI) + 0.003, 6);
      vertexOffset += (river.orderedCellKeys.length + 1) * 2;
    }

    const shader = compileMaterial(ocean.material);
    expect(ocean.material.userData.waterWaveComponents).toBe(0);
    expect(shader.fragmentShader).not.toContain('uniform float uWaterTime');
    expect(shader.fragmentShader).toContain('float waterGlimmer = 0.0');
    expect(shader.fragmentShader).toContain('vWarpkeepWaterFogMix');
    expect(shader.fragmentShader.indexOf('waterGlimmer'))
      .toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));

    layer.dispose();
  });

  it('compiles the declared wave count into a shader path that affects outgoing light', () => {
    const layer = createLayer('high');
    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const shader = compileMaterial(ocean.material);

    expect(ocean.material.userData.waterWaveComponents)
      .toBe(REALM_WATER_RENDER_BUDGETS.high.waveComponents);
    expect(shader.fragmentShader.match(/sin\(/g)).toHaveLength(
      REALM_WATER_RENDER_BUDGETS.high.waveComponents
    );
    expect(shader.fragmentShader).toContain('uniform float uWaterTime');
    expect(shader.fragmentShader).not.toContain('uWaterWaveComponents');
    expect(shader.fragmentShader).toContain('outgoingLight +=');
    expect(shader.uniforms).toHaveProperty('uWaterTime');
    expect(layer.updateEnvironment(1)).toBe(true);
    expect(layer.updateEnvironment(1)).toBe(false);
    expect(layer.updateEnvironment(2)).toBe(true);

    layer.dispose();
  });

  it('disposes every owned GPU resource once and becomes inert', () => {
    const layer = createLayer('balanced', true);
    const meshes = layer.group.children as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[];
    const geometryDisposals = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    const materialDisposals = meshes.map((mesh) => vi.spyOn(mesh.material, 'dispose'));

    layer.dispose();
    layer.dispose();

    geometryDisposals.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    materialDisposals.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(layer.updateEnvironment(3)).toBe(false);
  });

  it('releases partially constructed resources when the geometry budget rejects input', () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    try {
      expect(() => createRealmWaterLayer({
        cells: [...GENESIS_WATER_CELLS_V1, ...GENESIS_WATER_CELLS_V1],
        quality: REALM_QUALITY_SPECS.reduced,
        reducedMotion: true,
        hexSize: 1,
        heightAt: canonicalHeightAt
      })).toThrow('REALM_WATER_RENDER_BUDGET_EXCEEDED');
      expect(geometryDispose).toHaveBeenCalledTimes(4);
      expect(materialDispose).toHaveBeenCalledTimes(4);
    } finally {
      geometryDispose.mockRestore();
      materialDispose.mockRestore();
    }
  });

  it('fails closed when a non-ocean surface would render below the supplied terrain', () => {
    expect(() => createRealmWaterLayer({
      cells: GENESIS_WATER_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAt: () => 10
    })).toThrow('REALM_WATER_SURFACE_BELOW_TERRAIN');
  });
});
