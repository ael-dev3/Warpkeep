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
  cellKey: string,
  pitchDegrees: number
) {
  const cell = activeRiverCells.find((candidate) => candidate.cellKey === cellKey);
  if (!cell) throw new Error(`TEST_RIVER_CELL_MISSING:${cellKey}`);
  const world = axialToWorld(cell, 1);
  const target = new THREE.Vector3(
    world.x,
    Math.max(
      waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + 0.035,
      canonicalHeightAtWorld(world) + 0.014
    ),
    world.z
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
    expect(layer.getTelemetry()).toBe(telemetry);
    expect(layer.isAnimationActive()).toBe(false);
    expect(layer.updateEnvironment(1)).toBe(false);

    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const rivers = layer.group.getObjectByName('canonical-river-full-cell-surface') as THREE.Mesh<
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

    expect(telemetry.riverBodyCount).toBe(GENESIS_RIVERS_V1.length);
    expect(telemetry.riverChannelBodyCount).toBe(GENESIS_RIVERS_V1.length);
    expect(telemetry.riverFallbackBodyCount).toBe(0);
    expect(telemetry.riverFallbackCellCount).toBe(0);
    expect(telemetry.riverMouthConnectionCount).toBe(GENESIS_RIVERS_V1.length);
    expect(telemetry.riverLocalizedFoamVertexCount).toBeGreaterThan(0);
    expect(rivers.geometry.getAttribute('waterFlowAccumulation')).toBeDefined();
    expect(rivers.geometry.getAttribute('waterFeaturePhase')).toBeDefined();
    expect(rivers.geometry.getAttribute('waterSourceMix')).toBeDefined();
    expect(rivers.geometry.getAttribute('waterMouthMix')).toBeDefined();
    expect((rivers.geometry.index?.count ?? 0) / 3)
      .toBe(telemetry.riverFullCellTriangleCount);
    expect(telemetry.riverFullCellCount).toBe(telemetry.riverCellCount);
    expect(telemetry.riverIncompleteCellCount).toBe(0);
    expect(telemetry.riverOverlappingPhysicalTriangleCount).toBe(0);
    expect(telemetry.riverBankEdgeCount).toBeGreaterThan(0);
    expect(telemetry.riverSharedEdgeCount).toBeGreaterThan(0);
    expect(telemetry.riverMouthEdgeCount).toBeGreaterThan(0);
    expect(rivers.material.color.getHexString()).toBe('ffffff');
    expect(rivers.material.emissive.getHexString()).toBe('143d41');
    expect(rivers.material.emissiveIntensity).toBeCloseTo(0.08, 6);
    expect(rivers.material.userData.waterPhysicalRiverDisplacement).toBe(0);
    expect(rivers.material.userData.waterFoamQualityScale).toBe(0);

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
    expect(shader.fragmentShader.indexOf('outgoingLight = mix(outgoingLight, fogColor'))
      .toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));

    layer.dispose();
  });

  it('renders every active river as one full-cell surface with no lake draw', () => {
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
    expect(telemetry.riverChannelBodyCount).toBe(12);
    expect(telemetry.riverFallbackBodyCount).toBe(0);
    expect(telemetry.riverMouthConnectionCount).toBe(12);
    expect(telemetry.riverFullCellCount).toBe(400);
    expect(telemetry.riverFullCellTriangleCount).toBe(2_400);
    expect(telemetry.riverIncompleteCellCount).toBe(0);
    expect(telemetry.riverOverlappingPhysicalTriangleCount).toBe(0);
    expect(telemetry.drawCalls).toBe(3);
    expect(layer.group.getObjectByName('canonical-lake-surfaces')).toBeDefined();
    expect((layer.group.getObjectByName('canonical-lake-surfaces') as THREE.Mesh)
      .geometry.index?.count ?? 0).toBe(0);
    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh;
    const rivers = layer.group.getObjectByName(
      'canonical-river-full-cell-surface'
    ) as THREE.Mesh;
    expect(firstTriangleNormalY(ocean.geometry)).toBeGreaterThan(0);
    expect(firstTriangleNormalY(rivers.geometry)).toBeGreaterThan(0);
    layer.dispose();
  });

  it.each([
    ['high', 8, 2, true],
    ['balanced', 5, 1, true],
    ['reduced', 0, 0, false]
  ] as const)(
    'keeps the exact full-cell Water budget and motion contract at %s quality',
    (quality, oceanWaveCount, riverWaveCount, animated) => {
      const layer = createRealmWaterLayer({
        cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
        quality: REALM_QUALITY_SPECS[quality],
        reducedMotion: false,
        hexSize: 1,
        heightAtWorld: canonicalHeightAtWorld
      });
      const telemetry = layer.getTelemetry();
      const ocean = layer.group.getObjectByName(
        'canonical-ocean-surface'
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const river = layer.group.getObjectByName(
        'canonical-river-full-cell-surface'
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

      expect(telemetry).toMatchObject({
        drawCalls: 3,
        animated,
        riverCellCount: 400,
        riverFullCellCount: 400,
        riverFullCellTriangleCount: 2_400,
        riverIncompleteCellCount: 0,
        riverOverlappingPhysicalTriangleCount: 0,
        shaderFallbackCount: 0
      });
      expect(telemetry.triangleCount).toBe(21_198);
      expect(telemetry.drawCalls).toBeLessThanOrEqual(
        REALM_WATER_RENDER_BUDGETS[quality].draws
      );
      expect(telemetry.triangleCount).toBeLessThanOrEqual(
        REALM_WATER_RENDER_BUDGETS[quality].triangles
      );
      expect(ocean.material.userData.waterWaveComponents).toBe(oceanWaveCount);
      expect(river.material.userData.waterWaveComponents).toBe(riverWaveCount);
      expect(layer.isAnimationActive()).toBe(animated);
      expect(layer.updateEnvironment(1)).toBe(animated);
      layer.dispose();
    }
  );

  it('makes a high-quality Water layer fully static under reduced motion', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.high,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const materials = [
      'canonical-ocean-surface',
      'canonical-lake-surfaces',
      'canonical-river-full-cell-surface'
    ].map((name) => (
      (layer.group.getObjectByName(name) as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshStandardMaterial
      >).material
    ));

    expect(materials.map((material) => material.userData.waterWaveComponents))
      .toEqual([0, 0, 0]);
    expect(layer.getTelemetry()).toMatchObject({
      animated: false,
      drawCalls: 3,
      riverFullCellCount: 400,
      riverFullCellTriangleCount: 2_400,
      shaderFallbackCount: 0,
      triangleCount: 21_198
    });
    expect(layer.isAnimationActive()).toBe(false);
    expect(layer.updateEnvironment(1)).toBe(false);
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

  it('picks all canonical river centers, corners, and edge midpoints as full cells', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    activeRiverCells.forEach((cell) => {
      const center = axialToWorld(cell, 1);
      const corners = pointyHexCorners(cell, 1);
      const probes = [
        center,
        ...corners.map((corner) => ({
          x: center.x + (corner.x - center.x) * 0.985,
          z: center.z + (corner.z - center.z) * 0.985
        })),
        ...corners.map((corner, index) => {
          const next = corners[(index + 1) % corners.length]!;
          return {
            x: center.x + ((corner.x + next.x) * 0.5 - center.x) * 0.985,
            z: center.z + ((corner.z + next.z) * 0.5 - center.z) * 0.985
          };
        })
      ];
      probes.forEach((probe, probeIndex) => {
        const hit = layer.raycast(new THREE.Raycaster(
          new THREE.Vector3(probe.x, 10, probe.z),
          new THREE.Vector3(0, -1, 0)
        ));
        expect(hit?.cellKey, `${cell.cellKey}:${probeIndex}`).toBe(cell.cellKey);
      });
    });
    layer.dispose();
  });

  it('keeps full-cell river selection across the complete Water hex and honors ray clips', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const fixedCases = [
      {
        label: 'raised near-edge canonical cell',
        raycaster: angledRiverRay('26,8', [0.82, 0], [3, 7, -2]),
        expectedCellKey: '26,8'
      },
      {
        label: 'different-level canonical cell',
        raycaster: angledRiverRay('38,17', [-0.42, -0.72], [-3, 8, -2]),
        expectedCellKey: '38,17'
      },
      {
        label: 'opposite bank remains selectable',
        raycaster: angledRiverRay('26,7', [-0.65, 0], [-3, 8, -2]),
        expectedCellKey: '26,7'
      }
    ] as const;
    fixedCases.forEach(({ label, raycaster, expectedCellKey }) => {
      const layerHit = layer.raycast(raycaster);
      expect(layerHit?.cellKey ?? null, label).toBe(expectedCellKey);
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
      expect([upstreamKey, downstreamKey]).toContain(
        layer.raycast(adjacencyRaycaster)?.cellKey
      );
    }

    const unclippedRaycaster = angledRiverRay('26,8', [0.82, 0], [3, 7, -2]);
    const unclippedHit = layer.raycast(unclippedRaycaster)!;
    const acceptedWindow = new THREE.Raycaster(
      unclippedRaycaster.ray.origin.clone(),
      unclippedRaycaster.ray.direction.clone(),
      unclippedHit.distance - 0.000_1,
      unclippedHit.distance + 0.000_1
    );
    expect(layer.raycast(acceptedWindow)?.cellKey).toBe(unclippedHit.cellKey);
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
        const raycaster = cameraPitchRiverRay(cell.cellKey, pitchDegrees);
        expect(layer.raycast(raycaster)?.cellKey, `${cell.cellKey} at ${pitchDegrees}°`)
          .toBe(cell.cellKey);
      }
    }
    layer.dispose();
  });

  it('keeps every full-cell river clear, connected, and inside canonical Water', () => {
    const layer = createRealmWaterLayer({
      cells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const rivers = layer.group.getObjectByName('canonical-river-full-cell-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const positions = rivers.geometry.getAttribute('position');
    const index = rivers.geometry.index;
    const telemetry = layer.getTelemetry();
    expect(telemetry.riverCellCount).toBe(activeRiverCells.length);
    expect((index?.count ?? 0) / 3).toBe(telemetry.riverFullCellTriangleCount);
    expect(telemetry.riverFullCellTriangleCount).toBe(activeRiverCells.length * 6);
    expect(telemetry.riverChannelBodyCount).toBe(12);
    expect(telemetry.riverFallbackBodyCount).toBe(0);
    const ranges = rivers.geometry.userData.realmWaterFullCellRanges as readonly Readonly<{
      cellKey: string;
      vertexStart: number;
      vertexCount: number;
      indexStart: number;
      triangleCount: number;
    }>[];
    expect(ranges).toHaveLength(activeRiverCells.length);
    expect(new Set(ranges.map((range) => range.cellKey)).size)
      .toBe(activeRiverCells.length);
    const riverCellsByKey = new Map(activeRiverCells.map(
      (cell) => [cell.cellKey, cell] as const
    ));
    const shoreFoam = rivers.geometry.getAttribute('waterShoreFoam');
    ranges.forEach((range) => {
      expect(range.vertexCount).toBe(7);
      expect(range.triangleCount).toBe(6);
      const cell = riverCellsByKey.get(range.cellKey);
      expect(cell).toBeDefined();
      const center = axialToWorld(cell!, 1);
      expect(positions.getX(range.vertexStart)).toBeCloseTo(center.x, 5);
      expect(positions.getZ(range.vertexStart)).toBeCloseTo(center.z, 5);
      const expectedCorners = pointyHexCorners(cell!, 1).map((corner) => (
        `${Math.round(corner.x * 10_000)},${Math.round(corner.z * 10_000)}`
      )).sort();
      const actualCorners = Array.from({ length: 6 }, (_, cornerIndex) => {
        const vertex = range.vertexStart + cornerIndex + 1;
        return `${Math.round(positions.getX(vertex) * 10_000)},${
          Math.round(positions.getZ(vertex) * 10_000)
        }`;
      }).sort();
      expect(actualCorners).toEqual(expectedCorners);
      for (
        let offset = range.indexStart;
        offset < range.indexStart + range.triangleCount * 3;
        offset += 1
      ) {
        const vertex = index?.getX(offset);
        expect(vertex).toBeGreaterThanOrEqual(range.vertexStart);
        expect(vertex).toBeLessThan(range.vertexStart + range.vertexCount);
      }
    });
    ranges.filter((range) => riverCellsByKey.get(range.cellKey)?.riverOrder === 0)
      .forEach((range) => {
        expect(shoreFoam.getX(range.vertexStart)).toBeCloseTo(0.16, 6);
        expect(Math.max(...Array.from(
          { length: 6 },
          (_, cornerIndex) => shoreFoam.getX(range.vertexStart + cornerIndex + 1)
        ))).toBeGreaterThan(0.379);
      });

    let minimumVertexClearance = Number.POSITIVE_INFINITY;
    let minimumProbeClearance = Number.POSITIVE_INFINITY;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const world = { x: positions.getX(vertex), z: positions.getZ(vertex) };
      minimumVertexClearance = Math.min(
        minimumVertexClearance,
        positions.getY(vertex) - canonicalHeightAtWorld(world)
      );
    }
    if (!index) throw new Error('TEST_RIVER_CHANNEL_INDEX_MISSING');
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const first = index.getX(triangle);
      const second = index.getX(triangle + 1);
      const third = index.getX(triangle + 2);
      const normalY = (
        (positions.getZ(second) - positions.getZ(first))
          * (positions.getX(third) - positions.getX(first))
        - (positions.getX(second) - positions.getX(first))
          * (positions.getZ(third) - positions.getZ(first))
      );
      expect(normalY).toBeGreaterThan(0);
      for (let firstStep = 0; firstStep <= 3; firstStep += 1) {
        for (let secondStep = 0; secondStep <= 3 - firstStep; secondStep += 1) {
          const firstWeight = firstStep / 3;
          const secondWeight = secondStep / 3;
          const thirdWeight = 1 - firstWeight - secondWeight;
          const world = {
            x: positions.getX(first) * firstWeight
              + positions.getX(second) * secondWeight
              + positions.getX(third) * thirdWeight,
            z: positions.getZ(first) * firstWeight
              + positions.getZ(second) * secondWeight
              + positions.getZ(third) * thirdWeight
          };
          const surfaceY = positions.getY(first) * firstWeight
            + positions.getY(second) * secondWeight
            + positions.getY(third) * thirdWeight;
          minimumProbeClearance = Math.min(
            minimumProbeClearance,
            surfaceY - canonicalHeightAtWorld(world)
          );
        }
      }
    }

    expect(minimumVertexClearance).toBeGreaterThanOrEqual(0.005);
    expect(minimumProbeClearance).toBeGreaterThanOrEqual(0.005);
    expect(telemetry.riverLocalizedFoamVertexCount).toBeGreaterThan(0);

    const heightSetsByWorldPoint = new Map<string, number[]>();
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const key = `${
        Math.round(positions.getX(vertex) * 1_000_000)
      },${Math.round(positions.getZ(vertex) * 1_000_000)}`;
      const heights = heightSetsByWorldPoint.get(key);
      if (heights) heights.push(positions.getY(vertex));
      else heightSetsByWorldPoint.set(key, [positions.getY(vertex)]);
    }
    const sharedRiverPoints = [...heightSetsByWorldPoint.values()]
      .filter((heights) => heights.length > 1);
    expect(sharedRiverPoints.length).toBeGreaterThan(0);
    sharedRiverPoints.forEach((heights) => {
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.000_001);
    });

    const ocean = layer.group.getObjectByName('canonical-ocean-surface') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const oceanPositions = ocean.geometry.getAttribute('position');
    const oceanHeightsByWorldPoint = new Map<string, number[]>();
    for (let vertex = 0; vertex < oceanPositions.count; vertex += 1) {
      const key = `${
        Math.round(oceanPositions.getX(vertex) * 1_000_000)
      },${Math.round(oceanPositions.getZ(vertex) * 1_000_000)}`;
      const heights = oceanHeightsByWorldPoint.get(key);
      if (heights) heights.push(oceanPositions.getY(vertex));
      else oceanHeightsByWorldPoint.set(key, [oceanPositions.getY(vertex)]);
    }
    const mouthPoints = [...heightSetsByWorldPoint]
      .filter(([key]) => oceanHeightsByWorldPoint.has(key));
    expect(mouthPoints.length).toBeGreaterThan(0);
    mouthPoints.forEach(([key, riverHeights]) => {
      const oceanHeights = oceanHeightsByWorldPoint.get(key)!;
      expect(
        Math.max(...riverHeights, ...oceanHeights)
          - Math.min(...riverHeights, ...oceanHeights)
      ).toBeLessThan(0.000_001);
    });
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
      REALM_WATER_RENDER_BUDGETS.high.waveComponents
    );
    expect(shader.vertexShader).toContain('uniform float uWaterTime');
    expect(shader.fragmentShader).toContain('uniform float uWaterTime');
    expect(shader.vertexShader).not.toContain('uWaterWaveComponents');
    expect(shader.vertexShader).toContain('(modelMatrix * vec4(position, 1.0)).xz');
    expect(shader.vertexShader).toContain('1.0 - clamp(waterFogMix, 0.0, 1.0)');
    expect(shader.vertexShader).toContain('* warpkeepWaterWaveVisibility');
    expect(shader.vertexShader).not.toContain('vViewPosition.xz');
    expect(shader.fragmentShader).toContain('outgoingLight +=');
    expect(ocean.material.userData.waterShaderContract).toContain('-v6');
    expect(shader.uniforms).toHaveProperty('uWaterTime');
    expect(layer.updateEnvironment(1)).toBe(true);
    expect(layer.updateEnvironment(1)).toBe(false);
    expect(layer.updateEnvironment(2)).toBe(true);

    layer.dispose();
  });

  it.each([
    ['high', 2],
    ['balanced', 1],
    ['reduced', 0]
  ] as const)(
    'renders exactly the advertised %s river-wave component count',
    (quality, expectedWaveCount) => {
      const layer = createLayer(quality);
      const rivers = layer.group.getObjectByName(
        'canonical-river-full-cell-surface'
      ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const shader = compileMaterial(rivers.material);

      expect(rivers.material.userData.waterWaveComponents).toBe(expectedWaveCount);
      expect(shader.vertexShader.match(/sin\(/g) ?? []).toHaveLength(expectedWaveCount);
      expect(rivers.material.userData.waterShaderContract).toContain('-v6');

      layer.dispose();
    }
  );

  it('keeps river vertices welded while animating downstream light and normals', () => {
    const layer = createLayer('high');
    const rivers = layer.group.getObjectByName(
      'canonical-river-full-cell-surface'
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const shader = compileMaterial(rivers.material);

    expect(rivers.material.userData.waterWaveComponents).toBe(2);
    expect(shader.vertexShader.match(/sin\(/g)).toHaveLength(2);
    expect(rivers.material.userData.waterFoamQualityScale).toBe(1);
    expect(shader.vertexShader).toContain(
      'transformed.y += vWarpkeepWaterWave * (1.0 - step(0.5, waterRegime))'
    );
    expect(shader.vertexShader).toContain(
      'uWaterTime * (0.54 + waterFlowAccumulation * 0.24)'
    );
    expect(shader.fragmentShader).toContain('waterDirectionalCurrent');
    expect(shader.fragmentShader).toContain('waterHydrologyFoam');
    expect(shader.fragmentShader).toContain('vWarpkeepWaterSourceMix');
    expect(shader.fragmentShader).toContain('vWarpkeepWaterMouthMix');
    expect(shader.fragmentShader).toContain('outgoingLight = min(outgoingLight, vec3(1.35))');

    const positions = rivers.geometry.getAttribute('position');
    const ranges = rivers.geometry.userData.realmWaterFullCellRanges as readonly Readonly<{
      vertexStart: number;
      vertexCount: number;
    }>[];
    const depth = rivers.geometry.getAttribute('waterDepth');
    const bank = rivers.geometry.getAttribute('waterBankBlend');
    const foam = rivers.geometry.getAttribute('waterShoreFoam');
    const flowX = rivers.geometry.getAttribute('waterFlowX');
    const flowZ = rivers.geometry.getAttribute('waterFlowZ');
    const accumulation = rivers.geometry.getAttribute('waterFlowAccumulation');
    const phase = rivers.geometry.getAttribute('waterFeaturePhase');
    const source = rivers.geometry.getAttribute('waterSourceMix');
    const mouth = rivers.geometry.getAttribute('waterMouthMix');
    const points = new Map<string, number[][]>();
    ranges.forEach((range) => {
      for (let offset = 1; offset < range.vertexCount; offset += 1) {
        const vertex = range.vertexStart + offset;
        const key = `${
          Math.round(positions.getX(vertex) * 1_000_000)
        },${Math.round(positions.getZ(vertex) * 1_000_000)}`;
        const samples = points.get(key) ?? [];
        samples.push([
          positions.getY(vertex),
          depth.getX(vertex),
          bank.getX(vertex),
          foam.getX(vertex),
          flowX.getX(vertex),
          flowZ.getX(vertex),
          accumulation.getX(vertex),
          phase.getX(vertex),
          source.getX(vertex),
          mouth.getX(vertex)
        ]);
        points.set(key, samples);
      }
    });
    [...points.values()]
      .filter((samples) => samples.length > 1)
      .forEach((samples) => {
        for (let field = 0; field < samples[0]!.length; field += 1) {
          const values = samples.map((sample) => sample[field]!);
          expect(Math.max(...values) - Math.min(...values))
            .toBeLessThan(0.000_001);
        }
      });
    layer.dispose();
  });

  it('falls back to static standard materials when a Three shader marker drifts', () => {
    const layer = createLayer('high');
    const materials = [
      'canonical-ocean-surface',
      'canonical-lake-surfaces',
      'canonical-river-full-cell-surface'
    ].map((name) => (
      (layer.group.getObjectByName(name) as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshStandardMaterial
      >).material
    ));

    const preFallbackTelemetry = layer.getTelemetry();
    materials.forEach((material) => {
      const shader = {
        uniforms: {},
        vertexShader: [
          '#include <begin_vertex>',
          '#include <color_vertex>'
        ].join('\n'),
        fragmentShader: '#include <opaque_fragment>'
      };
      expect(() => material.onBeforeCompile(
        shader as Parameters<typeof material.onBeforeCompile>[0],
        {} as THREE.WebGLRenderer
      )).not.toThrow();
      expect(shader.vertexShader).not.toContain('warpkeepWaterHeight');
      expect(shader.fragmentShader).toContain('warpkeepWaterFogFallback');
      expect(material.userData.waterWaveComponents).toBe(0);
      expect(material.userData.waterShaderFallbackReason)
        .toBe('shader-contract-changed');
      expect(material.userData.waterShaderFallbackPresentation)
        .toBe('full-mesh-fog-color');
    });

    const fallbackTelemetry = layer.getTelemetry();
    expect(fallbackTelemetry).not.toBe(preFallbackTelemetry);
    expect(fallbackTelemetry.shaderFallbackCount).toBe(3);
    expect(fallbackTelemetry.animated).toBe(false);
    expect(layer.getTelemetry()).toBe(fallbackTelemetry);
    expect(layer.isAnimationActive()).toBe(false);
    expect(layer.updateEnvironment(1)).toBe(false);
    const river = activeRiverCells[0]!;
    const world = axialToWorld(river, 1);
    expect(layer.raycast(new THREE.Raycaster(
      new THREE.Vector3(world.x, 10, world.z),
      new THREE.Vector3(0, -1, 0)
    ))).toMatchObject({
      cellKey: river.cellKey,
      bodyId: river.bodyId,
      regime: 'river'
    });
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
    const shiftedOcean = GENESIS_WATER_CELLS_V1
      .filter((cell) => cell.regime === 'ocean')
      .map((cell) => Object.freeze({
        ...cell,
        q: cell.q + 200,
        cellKey: `${cell.q + 200},${cell.r}`
      }));
    try {
      expect(() => createRealmWaterLayer({
        cells: [...GENESIS_WATER_CELLS_V1, ...shiftedOcean],
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

  it('contains malformed river topology to one truthful full-cell body fallback', () => {
    const bodyId = activeRiverCells[0]!.bodyId;
    const bodyCells = activeRiverCells.filter((cell) => cell.bodyId === bodyId);
    const first = [...bodyCells].sort((left, right) => (
      (left.riverOrder ?? 0) - (right.riverOrder ?? 0)
    ))[0]!;
    const cells = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map((cell) => (
      cell.cellKey === first.cellKey
        ? Object.freeze({ ...cell, downstreamWaterCellKey: 'not-the-reviewed-next-cell' })
        : cell
    ));
    const layer = createRealmWaterLayer({
      cells,
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    });
    const telemetry = layer.getTelemetry();
    expect(telemetry.riverFallbackBodyCount).toBe(1);
    expect(telemetry.riverFallbackCellCount).toBe(bodyCells.length);
    expect(telemetry.riverChannelBodyCount).toBe(11);
    expect(telemetry.riverFallbackReasons).toEqual([{
      bodyId,
      reason: 'downstream-mismatch'
    }]);
    const world = axialToWorld(first, 1);
    expect(layer.raycast(new THREE.Raycaster(
      new THREE.Vector3(world.x + 0.65, 10, world.z),
      new THREE.Vector3(0, -1, 0)
    ))?.cellKey).toBe(first.cellKey);
    layer.dispose();
  });

  it('fails closed instead of drawing overlapping Water for duplicate river coordinates', () => {
    const duplicate = Object.freeze({
      ...activeRiverCells[0]!,
      cellKey: `duplicate:${activeRiverCells[0]!.cellKey}`
    });
    expect(() => createRealmWaterLayer({
      cells: [...GENESIS_WATER_REVISION_ENABLED_CELLS_V1, duplicate],
      quality: REALM_QUALITY_SPECS.reduced,
      reducedMotion: true,
      hexSize: 1,
      heightAtWorld: canonicalHeightAtWorld
    })).toThrow('REALM_WATER_DUPLICATE_RIVER_COORDINATE');
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
