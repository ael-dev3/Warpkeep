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
import { pointyHexCorners } from '../src/components/realm/createTerrainGeometry';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import {
  axialToWorld,
  hexDistance,
  type HexWorldPosition
} from '../src/game/map/hexCoordinates';
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
const canonicalHeightAtWorld = (world: HexWorldPosition) => terrainHeightAtWorld(
  canonicalSurface.renderMap,
  world,
  1,
  canonicalPlacements
);

const activeRiverCells = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.filter(
  (cell) => cell.regime === 'river'
);

function worldPointKey(world: HexWorldPosition) {
  return `${Math.round(world.x * 1_000_000)},${Math.round(world.z * 1_000_000)}`;
}

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
    vertexShader: '#include <color_vertex>',
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

    // Every authoritative river coordinate is one complete hex-wide channel.
    expect((rivers.geometry.index?.count ?? 0) / 3).toBe(
      GENESIS_RIVERS_V1.reduce((sum, river) => sum + river.orderedCellKeys.length * 6, 0)
    );
    const riverPositions = rivers.geometry.getAttribute('position');
    let vertexOffset = 0;
    for (const river of GENESIS_RIVERS_V1) {
      const mouthVertex = vertexOffset + (river.orderedCellKeys.length - 1) * 7;
      const persistedPresentationY = waterSurfaceLevelToWorldY(GENESIS_WATER_SEA_LEVEL_MILLI)
        + 0.035;
      expect(riverPositions.getY(mouthVertex))
        .toBeGreaterThanOrEqual(persistedPresentationY - 0.000_001);
      expect(riverPositions.getY(mouthVertex))
        .toBeLessThan(persistedPresentationY + 0.16);
      vertexOffset += river.orderedCellKeys.length * 7;
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

  it('renders the active revision as exact full-cell rivers with no lake draw', () => {
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
    expect(telemetry.drawCalls).toBe(3);
    expect(layer.group.getObjectByName('canonical-lake-surfaces')).toBeDefined();
    expect((layer.group.getObjectByName('canonical-lake-surfaces') as THREE.Mesh)
      .geometry.index?.count ?? 0).toBe(0);
    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh;
    const rivers = layer.group.getObjectByName('canonical-river-ribbons') as THREE.Mesh;
    expect(firstTriangleNormalY(ocean.geometry)).toBeGreaterThan(0);
    expect(firstTriangleNormalY(rivers.geometry)).toBeGreaterThan(0);
    layer.dispose();
  });

  it('keeps every canonical river surface clear and every shared edge continuous', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const rivers = layer.group.getObjectByName('canonical-river-ribbons') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const positions = rivers.geometry.getAttribute('position');
    const index = rivers.geometry.index;
    expect(positions.count).toBe(activeRiverCells.length * 7);
    expect(index?.count).toBe(activeRiverCells.length * 6 * 3);
    expect(layer.getTelemetry().riverCellCount).toBe(activeRiverCells.length);
    expect((index?.count ?? 0) / 3).toBe(activeRiverCells.length * 6);

    let minimumVertexClearance = Number.POSITIVE_INFINITY;
    let minimumProbeClearance = Number.POSITIVE_INFINITY;
    const cornerHeights = activeRiverCells.map((cell, cellIndex) => {
      const base = cellIndex * 7;
      const expectedWorlds = [
        axialToWorld({ q: cell.q, r: cell.r }, 1),
        ...pointyHexCorners({ q: cell.q, r: cell.r }, 1)
      ];
      const heights = new Map<string, number>();
      expectedWorlds.forEach((expectedWorld, vertexIndex) => {
        const renderedVertex = base + vertexIndex;
        const renderedWorld = {
          x: positions.getX(renderedVertex),
          z: positions.getZ(renderedVertex)
        };
        expect(renderedWorld.x).toBeCloseTo(expectedWorld.x, 5);
        expect(renderedWorld.z).toBeCloseTo(expectedWorld.z, 5);
        const renderedY = positions.getY(renderedVertex);
        minimumVertexClearance = Math.min(
          minimumVertexClearance,
          renderedY - canonicalHeightAtWorld(renderedWorld)
        );
        if (vertexIndex > 0) heights.set(worldPointKey(renderedWorld), renderedY);
      });

      // Probe edges and triangle interiors more densely than construction.
      for (let triangle = 0; triangle < 6; triangle += 1) {
        const first = base + triangle + 1;
        const second = base + ((triangle + 1) % 6) + 1;
        for (let firstStep = 0; firstStep <= 12; firstStep += 1) {
          for (let secondStep = 0; secondStep <= 12 - firstStep; secondStep += 1) {
            const firstWeight = firstStep / 12;
            const secondWeight = secondStep / 12;
            const centerWeight = 1 - firstWeight - secondWeight;
            const world = {
              x: positions.getX(base) * centerWeight
                + positions.getX(first) * firstWeight
                + positions.getX(second) * secondWeight,
              z: positions.getZ(base) * centerWeight
                + positions.getZ(first) * firstWeight
                + positions.getZ(second) * secondWeight
            };
            const surfaceY = positions.getY(base) * centerWeight
              + positions.getY(first) * firstWeight
              + positions.getY(second) * secondWeight;
            minimumProbeClearance = Math.min(
              minimumProbeClearance,
              surfaceY - canonicalHeightAtWorld(world)
            );
          }
        }
      }

      const cellIndices = Array.from(
        { length: 18 },
        (_, offset) => index?.getX(cellIndex * 18 + offset)
      );
      expect(cellIndices).toEqual([
        base, base + 2, base + 1,
        base, base + 3, base + 2,
        base, base + 4, base + 3,
        base, base + 5, base + 4,
        base, base + 6, base + 5,
        base, base + 1, base + 6
      ]);
      return heights;
    });

    let sharedEdgeCount = 0;
    let slopedSharedEdgeCount = 0;
    let maximumSharedEdgeDelta = 0;
    activeRiverCells.forEach((cell, cellIndex) => {
      for (let neighborIndex = cellIndex + 1; neighborIndex < activeRiverCells.length; neighborIndex += 1) {
        const neighbor = activeRiverCells[neighborIndex]!;
        if (hexDistance(cell, neighbor) !== 1) continue;
        const sharedCornerKeys = [...cornerHeights[cellIndex]!.keys()].filter(
          (key) => cornerHeights[neighborIndex]!.has(key)
        );
        expect(sharedCornerKeys).toHaveLength(2);
        sharedEdgeCount += 1;
        if (cell.surfaceLevelMilli !== neighbor.surfaceLevelMilli) slopedSharedEdgeCount += 1;
        sharedCornerKeys.forEach((key) => {
          maximumSharedEdgeDelta = Math.max(
            maximumSharedEdgeDelta,
            Math.abs(cornerHeights[cellIndex]!.get(key)!
              - cornerHeights[neighborIndex]!.get(key)!)
          );
        });
      }
    });

    // A merely non-negative surface can still disappear into the adaptive
    // ground depth buffer at strategic zoom. Preserve a visible safety margin.
    expect(minimumVertexClearance).toBeGreaterThanOrEqual(0.005);
    expect(minimumProbeClearance).toBeGreaterThanOrEqual(0.005);
    expect(sharedEdgeCount).toBeGreaterThan(0);
    expect(slopedSharedEdgeCount).toBeGreaterThan(0);
    expect(maximumSharedEdgeDelta).toBe(0);
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
        heightAtWorld: canonicalHeightAtWorld
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
      heightAtWorld: () => 10
    })).toThrow('REALM_WATER_SURFACE_BELOW_TERRAIN');
  });
});
