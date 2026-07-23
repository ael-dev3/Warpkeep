import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_RIVERS_V1,
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_V1,
  GENESIS_WATER_OCEAN_RADIUS,
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
import { REALM_SKY_FALLBACK_COLOR } from '../src/components/realm/createRealmEnvironment';
import { DEFAULT_REALM_CAMERA_SPEC } from '../src/components/realm/realmCameraController';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import {
  axialToWorld,
  hexDisc,
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

function worldEdgeKey(first: HexWorldPosition, second: HexWorldPosition) {
  const edgePointKey = (world: HexWorldPosition) => (
    `${Math.round(Math.fround(world.x) * 10_000)},${Math.round(Math.fround(world.z) * 10_000)}`
  );
  return [edgePointKey(first), edgePointKey(second)].sort().join('|');
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
    vertexShader: [
      '#include <beginnormal_vertex>',
      '#include <begin_vertex>',
      '#include <color_vertex>'
    ].join('\n'),
    fragmentShader: [
      '#include <opaque_fragment>',
      '#include <colorspace_fragment>',
      '#include <fog_fragment>',
      '#include <dithering_fragment>'
    ].join('\n')
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

function renderedRiverTriangleHit(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>,
  raycaster: THREE.Raycaster
) {
  const positions = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const cellKeys = mesh.geometry.userData.realmWaterCellKeys as readonly string[] | undefined;
  if (!index || !cellKeys) throw new Error('TEST_RIVER_GEOMETRY_CONTRACT_MISSING');
  const triangleA = new THREE.Vector3();
  const triangleB = new THREE.Vector3();
  const triangleC = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  let nearest: Readonly<{ cellKey: string; distance: number }> | null = null;
  for (let triangleIndex = 0; triangleIndex < index.count / 3; triangleIndex += 1) {
    triangleA.fromBufferAttribute(positions, index.getX(triangleIndex * 3));
    triangleB.fromBufferAttribute(positions, index.getX(triangleIndex * 3 + 1));
    triangleC.fromBufferAttribute(positions, index.getX(triangleIndex * 3 + 2));
    const point = raycaster.ray.intersectTriangle(
      triangleA,
      triangleB,
      triangleC,
      true,
      hitPoint
    );
    if (!point) continue;
    const distance = raycaster.ray.origin.distanceTo(point);
    if (
      distance < Math.max(0, raycaster.near)
      || distance > raycaster.far
    ) continue;
    const cellKey = cellKeys[Math.floor(triangleIndex / 6)];
    if (!cellKey) throw new Error('TEST_RIVER_TRIANGLE_IDENTITY_MISSING');
    if (
      nearest !== null
      && (distance > nearest.distance
        || (distance === nearest.distance && cellKey >= nearest.cellKey))
    ) continue;
    nearest = Object.freeze({ cellKey, distance });
  }
  return nearest;
}

function angledRiverRay(
  cellKey: string,
  targetOffset: readonly [number, number],
  originOffset: readonly [number, number, number],
  near = 0,
  far = 30
) {
  const cell = activeRiverCells.find((candidate) => candidate.cellKey === cellKey);
  if (!cell) throw new Error(`TEST_RIVER_CELL_MISSING:${cellKey}`);
  const center = axialToWorld(cell, 1);
  const target = new THREE.Vector3(
    center.x + targetOffset[0],
    0,
    center.z + targetOffset[1]
  );
  const origin = target.clone().add(new THREE.Vector3(...originOffset));
  return new THREE.Raycaster(
    origin,
    target.clone().sub(origin).normalize(),
    near,
    far
  );
}

function cameraPitchRiverRay(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>,
  cellKey: string,
  pitchDegrees: number
) {
  const cellKeys = mesh.geometry.userData.realmWaterCellKeys as readonly string[] | undefined;
  const cellIndex = cellKeys?.indexOf(cellKey) ?? -1;
  if (cellIndex < 0) throw new Error(`TEST_RIVER_CELL_MISSING:${cellKey}`);
  const positions = mesh.geometry.getAttribute('position');
  const target = new THREE.Vector3(
    positions.getX(cellIndex * 7),
    positions.getY(cellIndex * 7),
    positions.getZ(cellIndex * 7)
  );
  const pitch = THREE.MathUtils.degToRad(pitchDegrees);
  const azimuth = THREE.MathUtils.degToRad(DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees);
  const distance = 35;
  const horizontalDistance = Math.cos(pitch) * distance;
  const origin = target.clone().add(new THREE.Vector3(
    Math.sin(azimuth) * horizontalDistance,
    Math.sin(pitch) * distance,
    Math.cos(azimuth) * horizontalDistance
  ));
  return new THREE.Raycaster(
    origin,
    target.clone().sub(origin).normalize(),
    0,
    distance + 1
  );
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
    const skirt = layer.group.getObjectByName('canonical-ocean-downward-skirt') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;
    const fogMix = Array.from(ocean.geometry.getAttribute('waterFogMix').array as ArrayLike<number>);
    const waterDepth = Array.from(
      ocean.geometry.getAttribute('waterDepth').array as ArrayLike<number>
    );
    const shoreFoam = Array.from(
      ocean.geometry.getAttribute('waterShoreFoam').array as ArrayLike<number>
    );
    expect(fogMix).toContain(0);
    expect(fogMix.some((value) => Math.abs(value - 0.45) < 0.0001)).toBe(true);
    expect(fogMix.some((value) => value > 0 && value < 0.45)).toBe(true);
    expect(fogMix).toContain(1);
    expect(waterDepth.some((value) => Math.abs(value * 5 - Math.round(value * 5)) > 0.001))
      .toBe(true);
    expect(shoreFoam.some((value) => value > 0.06 && value < 0.56)).toBe(true);
    const skirtPositions = skirt.geometry.getAttribute('position');
    const skirtY = Array.from(
      { length: skirtPositions.count },
      (_, index) => skirtPositions.getY(index)
    );
    const seaLevelY = waterSurfaceLevelToWorldY(GENESIS_WATER_SEA_LEVEL_MILLI);
    expect(Math.max(...skirtY)).toBeCloseTo(seaLevelY, 6);
    expect(Math.min(...skirtY)).toBeCloseTo(seaLevelY - 1.25, 6);
    expect(skirt.material.fog).toBe(true);
    expect(skirt.material.transparent).toBe(false);
    expect(skirt.material.depthWrite).toBe(true);
    expect(skirt.material.color.getHexString()).toBe(
      new THREE.Color(REALM_SKY_FALLBACK_COLOR).getHexString()
    );

    const edgeIncidence = new Map<string, number>();
    hexDisc({ q: 0, r: 0 }, GENESIS_WATER_OCEAN_RADIUS).forEach((coord) => {
      const corners = pointyHexCorners(coord, 1);
      corners.forEach((corner, index) => {
        const edge = worldEdgeKey(corner, corners[(index + 1) % corners.length]!);
        edgeIncidence.set(edge, (edgeIncidence.get(edge) ?? 0) + 1);
      });
    });
    const expectedPerimeter = [...edgeIncidence.entries()]
      .filter(([, count]) => count === 1)
      .map(([edge]) => edge)
      .sort();
    const actualPerimeter: string[] = [];
    for (let vertex = 0; vertex < skirtPositions.count; vertex += 4) {
      actualPerimeter.push(worldEdgeKey(
        { x: skirtPositions.getX(vertex), z: skirtPositions.getZ(vertex) },
        { x: skirtPositions.getX(vertex + 1), z: skirtPositions.getZ(vertex + 1) }
      ));
    }
    expect(actualPerimeter).toHaveLength(786);
    expect([...new Set(actualPerimeter)].sort()).toEqual(expectedPerimeter);

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
    expect(shader.vertexShader).not.toContain('uniform float uWaterTime');
    expect(shader.vertexShader).toContain('return 0.0');
    expect(shader.fragmentShader).toContain('float waterGlimmer = abs(vWarpkeepWaterWave)');
    expect(shader.fragmentShader).toContain('vWarpkeepWaterFogMix');
    expect(shader.fragmentShader).toContain('fogColor');
    expect(shader.fragmentShader).not.toContain('uWaterHorizonColor');
    expect(shader.fragmentShader.indexOf('waterGlimmer'))
      .toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(shader.fragmentShader.indexOf('gl_FragColor.rgb = mix'))
      .toBeGreaterThan(shader.fragmentShader.indexOf('#include <colorspace_fragment>'));

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

  it('maps real direct and angled ray hits analytically and excludes full fog', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const river = activeRiverCells[0]!;
    const riverWorld = axialToWorld(river, 1);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(riverWorld.x, 10, riverWorld.z),
      new THREE.Vector3(0, -1, 0)
    );
    const meshRaycast = vi.spyOn(raycaster, 'intersectObject');
    expect(layer.raycast(raycaster)).toMatchObject({
      cellKey: river.cellKey,
      bodyId: river.bodyId,
      regime: 'river',
      coord: { q: river.q, r: river.r }
    });
    expect(meshRaycast).not.toHaveBeenCalled();
    const broadCellRaycaster = new THREE.Raycaster(
      new THREE.Vector3(riverWorld.x + 0.65, 10, riverWorld.z),
      new THREE.Vector3(0, -1, 0)
    );
    expect(layer.raycast(broadCellRaycaster)).toMatchObject({
      cellKey: river.cellKey,
      bodyId: river.bodyId,
      regime: 'river'
    });
    const angledOrigin = new THREE.Vector3(riverWorld.x + 2, 6, riverWorld.z + 1);
    const angledTarget = new THREE.Vector3(
      riverWorld.x,
      waterSurfaceLevelToWorldY(river.surfaceLevelMilli) + 0.035,
      riverWorld.z
    );
    const angledRaycaster = new THREE.Raycaster(
      angledOrigin,
      angledTarget.clone().sub(angledOrigin).normalize(),
      0,
      20
    );
    expect(layer.raycast(angledRaycaster)).toMatchObject({
      cellKey: river.cellKey,
      bodyId: river.bodyId,
      regime: 'river'
    });
    angledRaycaster.far = 1;
    expect(layer.raycast(angledRaycaster)).toBeNull();
    const visibleOcean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'ocean' && cell.fogBand !== 'full'
    );
    expect(visibleOcean).toBeDefined();
    const visibleOceanWorld = axialToWorld(visibleOcean!, 1);
    const oceanRaycaster = new THREE.Raycaster(
      new THREE.Vector3(visibleOceanWorld.x, 10, visibleOceanWorld.z),
      new THREE.Vector3(0, -1, 0)
    );
    const oceanMeshRaycast = vi.spyOn(oceanRaycaster, 'intersectObject');
    expect(layer.raycast(oceanRaycaster)).toMatchObject({
      cellKey: visibleOcean!.cellKey,
      bodyId: visibleOcean!.bodyId,
      regime: 'ocean'
    });
    expect(oceanMeshRaycast).not.toHaveBeenCalled();
    const fullFog = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'ocean' && cell.fogBand === 'full'
    );
    expect(fullFog).toBeDefined();
    const fogWorld = axialToWorld(fullFog!, 1);
    const fogRaycaster = new THREE.Raycaster(
      new THREE.Vector3(fogWorld.x, 10, fogWorld.z),
      new THREE.Vector3(0, -1, 0)
    );
    expect(layer.getCellPresentation(fullFog!.cellKey)?.fogBand).toBe('full');
    expect(layer.raycast(fogRaycaster)).toBeNull();
    layer.dispose();
  });

  it('matches rendered river triangles at angled edges, transitions, misses, and clips', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const riverMesh = layer.group.getObjectByName('canonical-river-ribbons') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material
    >;
    const fixedCases = [
      {
        label: 'raised near-edge triangle',
        raycaster: angledRiverRay('26,8', [0.82, 0], [3, 7, -2]),
        expectedCellKey: '26,8'
      },
      {
        label: 'different-level adjacent triangle',
        raycaster: angledRiverRay('38,17', [-0.42, -0.72], [-3, 8, -2]),
        expectedCellKey: '38,17'
      },
      {
        label: 'sloped-geometry miss outside the rendered edge',
        raycaster: angledRiverRay('26,7', [-0.82, 0], [-3, 8, -2]),
        expectedCellKey: null
      }
    ] as const;
    fixedCases.forEach(({ label, raycaster, expectedCellKey }) => {
      const renderedHit = renderedRiverTriangleHit(riverMesh, raycaster);
      expect(renderedHit?.cellKey ?? null, label).toBe(expectedCellKey);
      const layerHit = layer.raycast(raycaster);
      expect(layerHit?.cellKey ?? null, label).toBe(renderedHit?.cellKey ?? null);
      if (renderedHit && layerHit) {
        expect(layerHit.distance, label).toBeCloseTo(renderedHit.distance, 8);
      }
    });

    const riverCellsByKey = new Map(activeRiverCells.map(
      (cell) => [cell.cellKey, cell] as const
    ));
    for (const [upstreamKey, downstreamKey] of [
      ['26,7', '26,8'],
      ['38,16', '38,17']
    ] as const) {
      const upstream = riverCellsByKey.get(upstreamKey)!;
      const downstream = riverCellsByKey.get(downstreamKey)!;
      if (upstreamKey === '26,7') {
        expect(upstream.surfaceLevelMilli).toBe(downstream.surfaceLevelMilli);
      } else {
        expect(upstream.surfaceLevelMilli).not.toBe(downstream.surfaceLevelMilli);
      }
      const upstreamWorld = axialToWorld(upstream, 1);
      const downstreamWorld = axialToWorld(downstream, 1);
      const towardDownstream = new THREE.Vector2(
        downstreamWorld.x - upstreamWorld.x,
        downstreamWorld.z - upstreamWorld.z
      ).normalize();
      const target = new THREE.Vector3(
        (upstreamWorld.x + downstreamWorld.x) * 0.5 + towardDownstream.x * 0.03,
        0,
        (upstreamWorld.z + downstreamWorld.z) * 0.5 + towardDownstream.y * 0.03
      );
      const origin = target.clone().add(new THREE.Vector3(2, 6, 1));
      const adjacencyRaycaster = new THREE.Raycaster(
        origin,
        target.clone().sub(origin).normalize(),
        0,
        30
      );
      const renderedHit = renderedRiverTriangleHit(riverMesh, adjacencyRaycaster);
      expect(renderedHit?.cellKey).toBe(downstreamKey);
      expect(layer.raycast(adjacencyRaycaster)?.cellKey).toBe(renderedHit?.cellKey);
    }

    const unclippedRaycaster = angledRiverRay('26,8', [0.82, 0], [3, 7, -2]);
    const unclippedHit = renderedRiverTriangleHit(riverMesh, unclippedRaycaster)!;
    const acceptedWindow = new THREE.Raycaster(
      unclippedRaycaster.ray.origin.clone(),
      unclippedRaycaster.ray.direction.clone(),
      unclippedHit.distance - 0.000_1,
      unclippedHit.distance + 0.000_1
    );
    expect(layer.raycast(acceptedWindow)?.cellKey)
      .toBe(renderedRiverTriangleHit(riverMesh, acceptedWindow)?.cellKey);
    for (const clippedRaycaster of [
      new THREE.Raycaster(
        unclippedRaycaster.ray.origin.clone(),
        unclippedRaycaster.ray.direction.clone(),
        0,
        unclippedHit.distance - 0.000_1
      ),
      new THREE.Raycaster(
        unclippedRaycaster.ray.origin.clone(),
        unclippedRaycaster.ray.direction.clone(),
        unclippedHit.distance + 0.000_1,
        unclippedHit.distance + 0.5
      )
    ]) {
      expect(renderedRiverTriangleHit(riverMesh, clippedRaycaster)).toBeNull();
      expect(layer.raycast(clippedRaycaster)).toBeNull();
    }
    layer.dispose();
  });

  it('selects the highest and lowest river surfaces at both supported camera pitch bounds', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const riverMesh = layer.group.getObjectByName('canonical-river-ribbons') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material
    >;
    const orderedBySurface = [...activeRiverCells].sort((left, right) => (
      left.surfaceLevelMilli - right.surfaceLevelMilli
      || left.cellKey.localeCompare(right.cellKey)
    ));
    const lowest = orderedBySurface[0]!;
    const highest = orderedBySurface.at(-1)!;
    expect(highest.surfaceLevelMilli).toBeGreaterThan(lowest.surfaceLevelMilli);

    for (const cell of [lowest, highest]) {
      for (const pitchDegrees of [
        DEFAULT_REALM_CAMERA_SPEC.closePitchDegrees,
        DEFAULT_REALM_CAMERA_SPEC.overviewPitchDegrees
      ]) {
        const raycaster = cameraPitchRiverRay(riverMesh, cell.cellKey, pitchDegrees);
        const renderedHit = renderedRiverTriangleHit(riverMesh, raycaster);
        expect(renderedHit?.cellKey, `${cell.cellKey} at ${pitchDegrees}°`)
          .toBe(cell.cellKey);
        expect(layer.raycast(raycaster)?.cellKey, `${cell.cellKey} at ${pitchDegrees}°`)
          .toBe(cell.cellKey);
      }
    }
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
    expect(shader.vertexShader.match(/sin\(/g)).toHaveLength(
      REALM_WATER_RENDER_BUDGETS.high.waveComponents + 1
    );
    expect(shader.vertexShader).toContain('uniform float uWaterTime');
    expect(shader.vertexShader).not.toContain('uWaterWaveComponents');
    expect(shader.vertexShader).toContain('(modelMatrix * vec4(position, 1.0)).xz');
    expect(shader.vertexShader).toContain('1.0 - clamp(waterFogMix, 0.0, 1.0)');
    expect(shader.vertexShader).toContain('* warpkeepWaterWaveVisibility');
    expect(shader.vertexShader).not.toContain('vViewPosition.xz');
    expect(shader.fragmentShader).toContain('outgoingLight +=');
    expect(ocean.material.userData.waterShaderContract).toContain('-v3');
    expect(shader.uniforms).toHaveProperty('uWaterTime');
    expect(layer.updateEnvironment(1)).toBe(true);
    expect(layer.updateEnvironment(1)).toBe(false);
    expect(layer.updateEnvironment(2)).toBe(true);

    layer.dispose();
  });

  it('aligns first animated samples to the same canonical environment boundary', () => {
    const options = {
      cells: GENESIS_WATER_CELLS_V1,
      quality: REALM_QUALITY_SPECS.balanced,
      reducedMotion: false,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld,
      environment: {
        ...GENESIS_WATER_ENVIRONMENT_V1,
        updatedAtMicros: 1_000_000_000n
      },
      waterBodies: GENESIS_WATER_BODIES_V1,
      nowMicros: () => 1_014_000_000n
    } as const;
    const first = createRealmWaterLayer(options);
    const second = createRealmWaterLayer(options);
    expect(first.updateEnvironment(1)).toBe(true);
    expect(second.updateEnvironment(40)).toBe(true);
    const firstOcean = first.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const secondOcean = second.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const firstTime = firstOcean.material.userData.waterUniforms.uWaterTime.value as number;
    const secondTime = secondOcean.material.userData.waterUniforms.uWaterTime.value as number;
    expect(firstTime).toBe(secondTime);
    expect(firstTime).toBeGreaterThanOrEqual(0);
    expect(firstTime).toBeLessThan(97);
    first.dispose();
    second.dispose();
  });

  it('does not treat the local wall clock as a synchronized Water clock', () => {
    const dateNow = vi.spyOn(Date, 'now');
    const options = {
      cells: GENESIS_WATER_CELLS_V1,
      quality: REALM_QUALITY_SPECS.balanced,
      reducedMotion: false,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld,
      environment: {
        ...GENESIS_WATER_ENVIRONMENT_V1,
        updatedAtMicros: 1_000_000_000n
      },
      waterBodies: GENESIS_WATER_BODIES_V1
    } as const;
    const first = createRealmWaterLayer(options);
    const second = createRealmWaterLayer(options);
    expect(first.updateEnvironment(3)).toBe(true);
    expect(second.updateEnvironment(3)).toBe(true);
    expect(dateNow).not.toHaveBeenCalled();
    const firstOcean = first.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const secondOcean = second.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    expect(firstOcean.material.userData.waterUniforms.uWaterTime.value)
      .toBe(secondOcean.material.userData.waterUniforms.uWaterTime.value);
    first.dispose();
    second.dispose();
  });

  it('reuses fixed overlay buffers while selection and hover move between cells', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const selected = layer.group.getObjectByName('selected-water-cell-outline') as THREE.LineLoop;
    const hovered = layer.group.getObjectByName('hovered-water-cell-outline') as THREE.LineLoop;
    const selectedPositions = selected.geometry.getAttribute('position');
    const hoveredPositions = hovered.geometry.getAttribute('position');

    layer.setSelectedCellKey(activeRiverCells[0]!.cellKey);
    layer.setSelectedCellKey(activeRiverCells[1]!.cellKey);
    layer.setHoveredCellKey(activeRiverCells[0]!.cellKey);
    layer.setHoveredCellKey(activeRiverCells[1]!.cellKey);

    expect(selected.geometry.getAttribute('position')).toBe(selectedPositions);
    expect(hovered.geometry.getAttribute('position')).toBe(hoveredPositions);
    expect(selectedPositions.count).toBe(6);
    expect(hoveredPositions.count).toBe(6);
    expect(selected.visible).toBe(true);
    expect(hovered.visible).toBe(true);
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
      expect(geometryDispose).toHaveBeenCalledTimes(6);
      expect(materialDispose).toHaveBeenCalledTimes(6);
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
