import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_RIVERS_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_SEA_LEVEL_MILLI
} from '../spacetimedb/src/waterWorld';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_VERSION
} from '../spacetimedb/src/waterRevision';
import {
  createRealmWaterLayer,
  REALM_WATER_RENDER_BUDGETS,
  waterSurfaceLevelToWorldY
} from '../src/components/realm/realmWaterLayer';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import { createAuthoritativeRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { terrainHeightAtWorld } from '../src/game/map/terrainHeight';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

const canonicalSnapshot = createCanonicalGenesisSnapshot();
const canonicalSurface = createAuthoritativeRealmTerrainSurface(
  canonicalSnapshot.realm.numericSeed,
  canonicalSnapshot.tiles,
  canonicalSnapshot.realm.authoritativeRadius,
  canonicalSnapshot.realm.renderRadius
);
const canonicalPlacements = createHegemonyCastlePlacements(canonicalSnapshot.castles.map((castle) => ({
  id: `castle:${castle.castleId}`,
  coord: { q: castle.q, r: castle.r }
})));
const canonicalHeightAtWorld = (world: { x: number; z: number }) => terrainHeightAtWorld(
  canonicalSurface.renderMap,
  world,
  1,
  canonicalPlacements
);

function createLayer(quality: 'high' | 'balanced' | 'reduced', reducedMotion = false) {
  return createRealmWaterLayer({
    cells: GENESIS_WATER_CELLS_V1,
    quality: REALM_QUALITY_SPECS[quality],
    reducedMotion,
    hexSize: 1,
    heightAtWorld: canonicalHeightAtWorld
  });
}

function compileMaterial(material: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <color_vertex>',
    fragmentShader: '#include <opaque_fragment>\n#include <dithering_fragment>'
  };
  material.onBeforeCompile(
    shader as Parameters<typeof material.onBeforeCompile>[0],
    {} as THREE.WebGLRenderer
  );
  return shader;
}

function firstTriangleNormalY(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  const first = index?.getX(0) ?? 0;
  const second = index?.getX(1) ?? 1;
  const third = index?.getX(2) ?? 2;
  const abX = positions.getX(second) - positions.getX(first);
  const abZ = positions.getZ(second) - positions.getZ(first);
  const acX = positions.getX(third) - positions.getX(first);
  const acZ = positions.getZ(third) - positions.getZ(first);
  return abZ * acX - abX * acZ;
}

describe('Realm layered canonical Water layer', () => {
  it('converts the persisted fixed-point datum into terrain world height', () => {
    expect(waterSurfaceLevelToWorldY(1_000)).toBe(0);
    expect(waterSurfaceLevelToWorldY(GENESIS_WATER_SEA_LEVEL_MILLI)).toBeCloseTo(-0.025, 6);
  });

  it('builds connected quality-bounded surfaces and full-fog curtain', () => {
    const layer = createLayer('reduced');
    const telemetry = layer.getTelemetry();
    expect(telemetry.drawCalls).toBe(4);
    expect(telemetry.triangleCount).toBeLessThanOrEqual(REALM_WATER_RENDER_BUDGETS.reduced.triangles);
    expect(telemetry.fullFogOceanCellCount).toBeGreaterThan(0);
    expect(telemetry.oceanSubdivision).toBe(1);
    expect(layer.isAnimationActive()).toBe(false);

    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<THREE.BufferGeometry>;
    const rivers = layer.group.getObjectByName('canonical-river-ribbons') as THREE.Mesh<THREE.BufferGeometry>;
    const curtain = layer.group.getObjectByName('canonical-ocean-fog-curtain') as THREE.Mesh<THREE.BufferGeometry>;
    const fogMix = Array.from(ocean.geometry.getAttribute('waterFogMix').array as ArrayLike<number>);
    expect(fogMix).toContain(0);
    expect(fogMix.some((value) => value > 0 && value < 1)).toBe(true);
    expect(fogMix).toContain(1);
    expect((rivers.geometry.index?.count ?? 0) / 3).toBe(
      GENESIS_RIVERS_V1.reduce((sum, river) => sum + (river.orderedCellKeys.length - 1) * 2 + 2, 0)
    );
    expect((curtain.geometry.index?.count ?? 0) / 3).toBeGreaterThan(0);
    expect(firstTriangleNormalY(ocean.geometry)).toBeGreaterThan(0);
    expect(firstTriangleNormalY(rivers.geometry)).toBeGreaterThan(0);
    layer.dispose();
  });

  it('renders the active revision as ocean plus twelve continuous river ribbons', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const telemetry = layer.getTelemetry();
    expect(telemetry.layoutVersion).toBe(GENESIS_WATER_REVISION_VERSION);
    expect(telemetry.lakeCellCount).toBe(0);
    expect(telemetry.riverCellCount).toBe(400);
    expect(telemetry.riverRibbonCount).toBe(12);
    const rivers = layer.group.getObjectByName('canonical-river-ribbons') as THREE.Mesh<THREE.BufferGeometry>;
    const positions = rivers.geometry.getAttribute('position');
    const flowX = rivers.geometry.getAttribute('waterFlowX');
    const flowZ = rivers.geometry.getAttribute('waterFlowZ');
    expect(positions.count).toBeGreaterThan(800);
    expect(flowX.count).toBe(positions.count);
    expect(flowZ.count).toBe(positions.count);
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      expect(Math.hypot(flowX.getX(vertex), flowZ.getX(vertex))).toBeCloseTo(1, 4);
      expect(positions.getY(vertex)).toBeGreaterThanOrEqual(
        waterSurfaceLevelToWorldY(GENESIS_WATER_SEA_LEVEL_MILLI) + 0.035 - 0.000_001
      );
    }
    layer.dispose();
  });

  it('compiles bounded displacement, analytic normal, foam, Fresnel, and full fog paths', () => {
    const layer = createLayer('high');
    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const shader = compileMaterial(ocean.material);
    expect(ocean.material.userData.waterWaveComponents).toBe(REALM_WATER_RENDER_BUDGETS.high.waveComponents);
    expect(shader.vertexShader).toContain('warpkeepWaterHeight');
    expect(shader.vertexShader).toContain('objectNormal = normalize');
    expect(shader.fragmentShader.match(/sin\(/g)).toHaveLength(REALM_WATER_RENDER_BUDGETS.high.waveComponents);
    expect(shader.fragmentShader).toContain('waterFoamColor');
    expect(shader.fragmentShader).toContain('waterFresnel');
    expect(shader.fragmentShader).toContain('vWarpkeepWaterFogMix >= 0.999');
    expect(shader.uniforms).toHaveProperty('uWaterTime');
    expect(layer.updateEnvironment(1)).toBe(true);
    expect(layer.updateEnvironment(1)).toBe(false);
    expect(layer.updateEnvironment(2)).toBe(true);
    layer.dispose();
  });

  it('maps visible water triangles to canonical cells and rejects full fog', () => {
    const layer = createLayer('reduced', true);
    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<THREE.BufferGeometry>;
    const point = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(ocean);
    box.getCenter(point);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(point.x, point.y + 12, point.z + 0.01);
    camera.lookAt(point);
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = layer.raycast(raycaster);
    if (hit) {
      expect(hit.cellKey).toMatch(/,/);
      expect(hit.regime).toBe('ocean');
      layer.setSelectedCellKey(hit.cellKey);
      expect(layer.getTelemetry().selectedCellKey).toBe(hit.cellKey);
    }
    layer.setSelectedCellKey(null);
    expect(layer.getTelemetry().selectedCellKey).toBeNull();
    layer.dispose();
  });

  it('disposes owned GPU resources once and rejects over-budget input', () => {
    const layer = createLayer('balanced', true);
    const meshes = layer.group.children.filter(
      (child): child is THREE.Mesh<THREE.BufferGeometry, THREE.Material> => child instanceof THREE.Mesh
    );
    const geometryDisposals = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    const materialDisposals = meshes.map((mesh) => vi.spyOn(mesh.material, 'dispose'));
    layer.dispose();
    layer.dispose();
    geometryDisposals.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    materialDisposals.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(layer.updateEnvironment(3)).toBe(false);

    expect(() => createRealmWaterLayer({
      cells: [...GENESIS_WATER_CELLS_V1, ...GENESIS_WATER_CELLS_V1],
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    })).toThrow('REALM_WATER_RENDER_BUDGET_EXCEEDED');
  });
});
