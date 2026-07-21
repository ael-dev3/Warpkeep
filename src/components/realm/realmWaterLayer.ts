import * as THREE from 'three';

import {
  axialToWorld,
  hexDistance,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import {
  GENESIS_OCEAN_DEPTH_BY_KEY,
  GENESIS_WATER_LAYOUT_VERSION,
  genesisWaterWorldHeightFromMilli,
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import type { RealmQualitySpec } from './realmQuality';
import { pointyHexCorners } from './createTerrainGeometry';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_VERSION
} from '../../../spacetimedb/src/waterRevision';

const WATER_Y_LIFT = 0.035;
const RIVER_BANK_BLEND = 0.28;
// The adaptive terrain and the full-cell river mesh are intentionally close,
// but a sub-centimetre gap aliases away at strategic camera distances. Keep a
// small deterministic presentation clearance so the persisted channel wins
// the depth buffer without reading as a floating sheet.
const RIVER_TERRAIN_CLEARANCE = 0.014;
const RIVER_SURFACE_PROBE_SUBDIVISIONS = 6;
const MAXIMUM_RIVER_SURFACE_CORRECTION = 0.16;

/** Convert the persisted +1000 fixed-point datum into the terrain's world-Y space. */
export function waterSurfaceLevelToWorldY(surfaceLevelMilli: number): number {
  return genesisWaterWorldHeightFromMilli(surfaceLevelMilli);
}

function fogMixForCell(cell: GenesisWaterCellV1): number {
  if (cell.regime !== 'ocean') return 0;
  if (cell.fogBand === 'full') return 1;
  if (cell.fogBand === 'haze') return 0.45;
  return 0;
}

export const REALM_WATER_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ triangles: 220_000, draws: 4, waveComponents: 8 }),
  balanced: Object.freeze({ triangles: 105_000, draws: 4, waveComponents: 5 }),
  reduced: Object.freeze({ triangles: 35_000, draws: 4, waveComponents: 0 })
});

export type RealmWaterLayerTelemetry = Readonly<{
  layoutVersion: number;
  oceanCellCount: number;
  lakeCellCount: number;
  riverCellCount: number;
  triangleCount: number;
  drawCalls: number;
  animated: boolean;
  fullFogOceanCellCount: number;
}>;

export type RealmWaterCellHit = Readonly<{
  cellKey: string;
  bodyId: string;
  regime: 'ocean' | 'river';
  coord: Readonly<{ q: number; r: number }>;
  distance: number;
}>;

export type RealmWaterLayer = Readonly<{
  group: THREE.Group;
  raycast: (raycaster: THREE.Raycaster) => RealmWaterCellHit | null;
  getCellPresentation: (cellKey: string) => GenesisWaterCellV1 | undefined;
  setSelectedCellKey: (cellKey: string | null) => void;
  setHoveredCellKey: (cellKey: string | null) => void;
  updateEnvironment: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  getTelemetry: () => RealmWaterLayerTelemetry;
  dispose: () => void;
}>;

type WaterLayerOptions = Readonly<{
  cells: readonly GenesisWaterCellV1[];
  quality: RealmQualitySpec;
  reducedMotion: boolean;
  hexSize: number;
  heightAtWorld: (world: HexWorldPosition) => number;
}>;

function regimeColor(cell: GenesisWaterCellV1): THREE.Color {
  if (cell.regime === 'river') return new THREE.Color('#4aa9c7');
  if (cell.regime === 'lake') return new THREE.Color('#548eac');
  const depth = GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.cellKey) ?? cell.depthCells;
  return depth >= 5 ? new THREE.Color('#315b78') : depth >= 3
    ? new THREE.Color('#3c7691') : new THREE.Color('#4f91ab');
}

function surfaceGeometry(
  cells: readonly GenesisWaterCellV1[],
  hexSize: number,
  heightAtWorld: (world: HexWorldPosition) => number
) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const waterDepth: number[] = [];
  const waterBankBlend: number[] = [];
  const waterFogMix: number[] = [];
  const indices: number[] = [];
  cells.forEach((cell) => {
    const center = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
    const authoritativeSurfaceY = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli);
    const ground = cell.regime === 'ocean'
      ? authoritativeSurfaceY
      : authoritativeSurfaceY + WATER_Y_LIFT;
    if (cell.regime !== 'ocean') {
      const terrainY = heightAtWorld(center);
      if (!Number.isFinite(terrainY) || ground < terrainY) {
        throw new Error('REALM_WATER_SURFACE_BELOW_TERRAIN');
      }
    }
    const color = regimeColor(cell);
    const base = positions.length / 3;
    positions.push(center.x, ground, center.z);
    colors.push(color.r, color.g, color.b);
    waterDepth.push(Math.min(1, cell.depthCells / 5));
    waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
    waterFogMix.push(fogMixForCell(cell));
    normals.push(0, 1, 0);
    pointyHexCorners({ q: cell.q, r: cell.r }, hexSize).forEach((corner) => {
      positions.push(corner.x, ground, corner.z);
      colors.push(color.r, color.g, color.b);
      waterDepth.push(Math.min(1, cell.depthCells / 5));
      waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
      waterFogMix.push(fogMixForCell(cell));
      normals.push(0, 1, 0);
    });
    for (let corner = 0; corner < 6; corner += 1) {
      // Pointy corners advance clockwise in Three.js's x/z ground plane when
      // viewed from +y, so reverse the pair to keep the water front-facing.
      indices.push(base, base + ((corner + 1) % 6) + 1, base + corner + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(waterDepth, 1));
  geometry.setAttribute('waterBankBlend', new THREE.Float32BufferAttribute(waterBankBlend, 1));
  geometry.setAttribute('waterFogMix', new THREE.Float32BufferAttribute(waterFogMix, 1));
  geometry.userData.realmWaterCellKeys = cells.map((cell) => cell.cellKey);
  try {
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

type MutableRiverSurfaceNode = {
  readonly world: HexWorldPosition;
  height: number;
};

type RiverSurfacePlan = Readonly<{
  cell: GenesisWaterCellV1;
  baseHeight: number;
  center: MutableRiverSurfaceNode;
  corners: readonly MutableRiverSurfaceNode[];
}>;

function waterPointKey(point: HexWorldPosition) {
  const precision = 1_000_000;
  return `${Math.round(point.x * precision)},${Math.round(point.z * precision)}`;
}

/**
 * River cells retain the reviewed six-triangle/full-hex topology, but their
 * seven presentation vertices cannot all use the persisted center datum.
 * Terrain detail is continuous at cell boundaries and can rise above that
 * datum near a bank. Shared corner nodes give both sides of a river edge the
 * exact same endpoints, while deterministic triangle probes lift only the
 * presentation mesh enough to clear the rendered terrain between vertices.
 */
function riverSurfaceGeometry(
  cells: readonly GenesisWaterCellV1[],
  hexSize: number,
  heightAtWorld: (world: HexWorldPosition) => number
) {
  const sharedCorners = new Map<string, MutableRiverSurfaceNode>();
  const plans = cells.map((cell): RiverSurfacePlan => {
    const centerWorld = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
    const baseHeight = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + WATER_Y_LIFT;
    const center = { world: centerWorld, height: baseHeight };
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize).map((world) => {
      const key = waterPointKey(world);
      const existing = sharedCorners.get(key);
      if (existing) {
        existing.height = Math.max(existing.height, baseHeight);
        return existing;
      }
      const node = { world, height: baseHeight };
      sharedCorners.set(key, node);
      return node;
    });
    return { cell, baseHeight, center, corners };
  });

  // The elevation solution must not depend on subscription row order.
  const orderedPlans = [...plans].sort((left, right) => (
    left.cell.q - right.cell.q
    || left.cell.r - right.cell.r
    || left.cell.cellKey.localeCompare(right.cell.cellKey)
  ));
  for (const plan of orderedPlans) {
    for (let triangle = 0; triangle < 6; triangle += 1) {
      const first = plan.corners[triangle]!;
      const second = plan.corners[(triangle + 1) % 6]!;
      for (let firstStep = 0; firstStep <= RIVER_SURFACE_PROBE_SUBDIVISIONS; firstStep += 1) {
        for (
          let secondStep = 0;
          secondStep <= RIVER_SURFACE_PROBE_SUBDIVISIONS - firstStep;
          secondStep += 1
        ) {
          const firstWeight = firstStep / RIVER_SURFACE_PROBE_SUBDIVISIONS;
          const secondWeight = secondStep / RIVER_SURFACE_PROBE_SUBDIVISIONS;
          const centerWeight = 1 - firstWeight - secondWeight;
          const world = {
            x: plan.center.world.x * centerWeight
              + first.world.x * firstWeight
              + second.world.x * secondWeight,
            z: plan.center.world.z * centerWeight
              + first.world.z * firstWeight
              + second.world.z * secondWeight
          };
          const terrainY = heightAtWorld(world);
          if (
            !Number.isFinite(terrainY)
            || terrainY + RIVER_TERRAIN_CLEARANCE - plan.baseHeight
              > MAXIMUM_RIVER_SURFACE_CORRECTION
          ) throw new Error('REALM_WATER_SURFACE_BELOW_TERRAIN');
          const surfaceY = plan.center.height * centerWeight
            + first.height * firstWeight
            + second.height * secondWeight;
          const correction = terrainY + RIVER_TERRAIN_CLEARANCE - surfaceY;
          if (correction <= 0) continue;
          plan.center.height += correction;
          first.height += correction;
          second.height += correction;
        }
      }
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const waterDepth: number[] = [];
  const waterBankBlend: number[] = [];
  const waterFogMix: number[] = [];
  const indices: number[] = [];
  plans.forEach((plan) => {
    const color = regimeColor(plan.cell);
    const depth = Math.min(1, plan.cell.depthCells / 5);
    const base = positions.length / 3;
    [plan.center, ...plan.corners].forEach((node) => {
      positions.push(node.world.x, node.height, node.world.z);
      colors.push(color.r, color.g, color.b);
      waterDepth.push(depth);
      waterBankBlend.push(RIVER_BANK_BLEND);
      waterFogMix.push(0);
      normals.push(0, 1, 0);
    });
    for (let corner = 0; corner < 6; corner += 1) {
      indices.push(base, base + ((corner + 1) % 6) + 1, base + corner + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(waterDepth, 1));
  geometry.setAttribute('waterBankBlend', new THREE.Float32BufferAttribute(waterBankBlend, 1));
  geometry.setAttribute('waterFogMix', new THREE.Float32BufferAttribute(waterFogMix, 1));
  geometry.userData.realmWaterCellKeys = cells.map((cell) => cell.cellKey);
  try {
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

function outerSkirtGeometry(cells: readonly GenesisWaterCellV1[], hexSize: number) {
  const keys = new Set(cells.map((cell) => cell.cellKey));
  const positions: number[] = [];
  const indices: number[] = [];
  const bottom = -1.25;
  for (const cell of cells) {
    if (cell.regime !== 'ocean' || hexDistance(cell, { q: 0, r: 0 }) !== 65) continue;
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize);
    for (let side = 0; side < 6; side += 1) {
      const direction = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }][side]!;
      const neighborKey = `${cell.q + direction.q},${cell.r + direction.r}`;
      if (keys.has(neighborKey)) continue;
      const a = corners[side]!;
      const b = corners[(side + 1) % 6]!;
      const base = positions.length / 3;
      const surfaceY = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli);
      positions.push(a.x, surfaceY, a.z, b.x, surfaceY, b.z, b.x, bottom, b.z, a.x, bottom, a.z);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  try {
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

function createWaterMaterial(quality: RealmQualitySpec, reducedMotion: boolean) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // Keep the material base neutral so the authoritative per-regime vertex
    // palette is not multiplied back toward the pale Lowlands ground tint.
    color: '#ffffff',
    roughness: 0.28,
    metalness: 0.04,
    transparent: false,
    depthWrite: true,
    fog: true
  });
  const activeWaveComponents = reducedMotion
    ? 0
    : REALM_WATER_RENDER_BUDGETS[quality.id].waveComponents;
  const uniforms = {
    uWaterTime: { value: 0 },
    uWaterHorizonColor: { value: new THREE.Color('#b9cad8') }
  };
  const waveTerms = Array.from({ length: activeWaveComponents }, (_, index) => {
    const ordinal = index + 1;
    const xFrequency = (2.25 + ordinal * 0.37).toFixed(2);
    const zFrequency = (1.65 + ordinal * 0.29).toFixed(2);
    const timeFrequency = (0.19 + ordinal * 0.035).toFixed(3);
    return `sin(vViewPosition.x * ${xFrequency} + vViewPosition.z * ${zFrequency} + uWaterTime * ${timeFrequency})`;
  });
  const waveSource = waveTerms.length === 0
    ? 'float waterGlimmer = 0.0;'
    : `float waterGlimmer = (${waveTerms.join(' + ')}) * ${(0.018 / waveTerms.length).toFixed(8)};`;
  material.onBeforeCompile = (shader) => {
    if (activeWaveComponents > 0) shader.uniforms.uWaterTime = uniforms.uWaterTime;
    shader.uniforms.uWaterHorizonColor = uniforms.uWaterHorizonColor;
    shader.vertexShader = `attribute float waterDepth;\nattribute float waterBankBlend;\nattribute float waterFogMix;\nvarying float vWarpkeepWaterDepth;\nvarying float vWarpkeepWaterBankBlend;\nvarying float vWarpkeepWaterFogMix;\n${shader.vertexShader}`
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vWarpkeepWaterDepth = waterDepth;\n  vWarpkeepWaterBankBlend = waterBankBlend;\n  vWarpkeepWaterFogMix = waterFogMix;');
    const timeUniform = activeWaveComponents > 0 ? 'uniform float uWaterTime;\n' : '';
    shader.fragmentShader = `${timeUniform}uniform vec3 uWaterHorizonColor;\nvarying float vWarpkeepWaterDepth;\nvarying float vWarpkeepWaterBankBlend;\nvarying float vWarpkeepWaterFogMix;\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        ${waveSource}
        float waterFresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(-vViewPosition)), 0.0), 3.0) * 0.08;
        float waterDepthTint = mix(1.0, 0.72, clamp(vWarpkeepWaterDepth, 0.0, 1.0));
        float bankSoftness = 1.0 - clamp(vWarpkeepWaterBankBlend, 0.0, 1.0) * 0.18;
        outgoingLight += vec3(waterGlimmer + waterFresnel) * waterDepthTint * bankSoftness;
        outgoingLight = mix(outgoingLight, uWaterHorizonColor, clamp(vWarpkeepWaterFogMix, 0.0, 1.0) * 0.62);
        #include <opaque_fragment>`);
    material.userData.waterShaderContract = 'three-r185-reviewed';
  };
  material.userData.waterUniforms = uniforms;
  material.userData.waterWaveComponents = activeWaveComponents;
  return material;
}

export function createRealmWaterLayer(options: WaterLayerOptions): RealmWaterLayer {
  const ocean = options.cells.filter((cell) => cell.regime === 'ocean');
  const lakes = options.cells.filter((cell) => cell.regime === 'lake');
  const rivers = options.cells.filter((cell) => cell.regime === 'river');
  const budget = REALM_WATER_RENDER_BUDGETS[options.quality.id];
  const group = new THREE.Group();
  group.name = 'genesis-canonical-water';
  let oceanGeometry: THREE.BufferGeometry | undefined;
  let lakeGeometry: THREE.BufferGeometry | undefined;
  let riverGeometryData: THREE.BufferGeometry | undefined;
  let skirtGeometry: THREE.BufferGeometry | undefined;
  let waterMaterial: THREE.MeshStandardMaterial | undefined;
  let lakeMaterial: THREE.MeshStandardMaterial | undefined;
  let riverMaterial: THREE.MeshStandardMaterial | undefined;
  let skirtMaterial: THREE.MeshBasicMaterial | undefined;
  const disposeResources = () => {
    oceanGeometry?.dispose();
    lakeGeometry?.dispose();
    riverGeometryData?.dispose();
    skirtGeometry?.dispose();
    waterMaterial?.dispose();
    lakeMaterial?.dispose();
    riverMaterial?.dispose();
    skirtMaterial?.dispose();
  };
  try {
    oceanGeometry = surfaceGeometry(ocean, options.hexSize, options.heightAtWorld);
    lakeGeometry = surfaceGeometry(lakes, options.hexSize, options.heightAtWorld);
    // Each reviewed river coordinate owns one complete hex surface. The old
    // narrow spline left most of an authoritative river cell looking like
    // ordinary terrain and read as a decorative line; full hexes make the
    // persisted one-cell-wide topology legible without inventing new paths.
    riverGeometryData = riverSurfaceGeometry(rivers, options.hexSize, options.heightAtWorld);
    skirtGeometry = outerSkirtGeometry(ocean, options.hexSize);
    waterMaterial = createWaterMaterial(options.quality, options.reducedMotion);
    lakeMaterial = createWaterMaterial(options.quality, options.reducedMotion);
    riverMaterial = createWaterMaterial(options.quality, options.reducedMotion);
    // Rivers occupy only one authoritative hex at a time and sit over the
    // pale Lowlands palette. A restrained cool emissive lift keeps the
    // connected channel readable in daylight without changing its geometry.
    riverMaterial.emissive.set('#0b607b');
    riverMaterial.emissiveIntensity = 0.2;
    riverMaterial.roughness = 0.22;
    skirtMaterial = new THREE.MeshBasicMaterial({
      color: '#26485e',
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide
    });
  } catch (error) {
    disposeResources();
    throw error;
  }
  if (!oceanGeometry || !lakeGeometry || !riverGeometryData || !skirtGeometry
    || !waterMaterial || !lakeMaterial || !riverMaterial || !skirtMaterial) {
    disposeResources();
    throw new Error('REALM_WATER_RESOURCE_CONSTRUCTION_FAILED');
  }
  const oceanMesh = new THREE.Mesh(oceanGeometry, waterMaterial);
  const lakeMesh = new THREE.Mesh(lakeGeometry, lakeMaterial);
  const riverMesh = new THREE.Mesh(riverGeometryData, riverMaterial);
  const skirtMesh = new THREE.Mesh(skirtGeometry, skirtMaterial);
  oceanMesh.name = 'canonical-ocean-surface';
  lakeMesh.name = 'canonical-lake-surfaces';
  riverMesh.name = 'canonical-river-ribbons';
  skirtMesh.name = 'canonical-ocean-downward-skirt';
  riverMesh.renderOrder = 2;
  skirtMesh.renderOrder = 1;
  const cellsByKey = new Map(options.cells.map((cell) => [cell.cellKey, cell] as const));
  const visiblePickCells = new Set(options.cells
    .filter((cell) => cell.regime !== 'ocean' || cell.fogBand !== 'full')
    .map((cell) => cell.cellKey));
  const selectedWaterOverlay = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: '#e8fbce',
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  const hoveredWaterOverlay = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: '#d3f4ec',
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  selectedWaterOverlay.name = 'selected-water-cell-outline';
  hoveredWaterOverlay.name = 'hovered-water-cell-outline';
  selectedWaterOverlay.renderOrder = 6;
  hoveredWaterOverlay.renderOrder = 5;
  selectedWaterOverlay.visible = false;
  hoveredWaterOverlay.visible = false;
  group.add(selectedWaterOverlay, hoveredWaterOverlay);
  const updateWaterOverlay = (
    overlay: THREE.LineLoop,
    cellKey: string | null,
    opacity: number
  ) => {
    const cell = cellKey ? cellsByKey.get(cellKey) : undefined;
    if (!cell || !visiblePickCells.has(cell.cellKey)) {
      overlay.visible = false;
      return;
    }
    const center = axialToWorld({ q: cell.q, r: cell.r }, options.hexSize);
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, options.hexSize);
    const ground = cell.regime === 'river'
      ? Math.max(
        waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + WATER_Y_LIFT,
        options.heightAtWorld(center) + 0.035
      )
      : waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + WATER_Y_LIFT;
    const positions = new Float32Array(corners.length * 3);
    corners.forEach((corner, index) => {
      positions[index * 3] = corner.x;
      positions[index * 3 + 1] = ground + (opacity > 0.8 ? 0.018 : 0.012);
      positions[index * 3 + 2] = corner.z;
    });
    overlay.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    overlay.geometry.computeBoundingSphere();
    (overlay.material as THREE.LineBasicMaterial).opacity = opacity;
    overlay.visible = true;
  };
  const raycastMesh = (mesh: THREE.Mesh, raycaster: THREE.Raycaster) => {
    const intersection = raycaster.intersectObject(mesh, false)[0];
    if (!intersection || intersection.faceIndex === undefined || intersection.faceIndex === null) return null;
    const keys = mesh.geometry.userData.realmWaterCellKeys as readonly string[] | undefined;
    const cellKey = keys?.[Math.floor(intersection.faceIndex / 6)];
    if (!cellKey || !visiblePickCells.has(cellKey)) return null;
    const cell = cellsByKey.get(cellKey);
    if (!cell || (cell.regime !== 'ocean' && cell.regime !== 'river')) return null;
    return {
      cellKey,
      bodyId: cell.bodyId,
      regime: cell.regime,
      coord: { q: cell.q, r: cell.r },
      distance: intersection.distance
    } satisfies RealmWaterCellHit;
  };
  group.add(oceanMesh, lakeMesh, riverMesh, skirtMesh);
  const triangleCount = (oceanGeometry.index?.count ?? 0) / 3
    + (lakeGeometry.index?.count ?? 0) / 3
    + (riverGeometryData.index?.count ?? 0) / 3
    + (skirtGeometry.index?.count ?? 0) / 3;
  const drawCalls = [oceanMesh, lakeMesh, riverMesh, skirtMesh]
    .filter((mesh) => (mesh.geometry.index?.count ?? 0) > 0).length;
  if (triangleCount > budget.triangles || drawCalls > budget.draws) {
    selectedWaterOverlay.geometry.dispose();
    (selectedWaterOverlay.material as THREE.Material).dispose();
    hoveredWaterOverlay.geometry.dispose();
    (hoveredWaterOverlay.material as THREE.Material).dispose();
    disposeResources();
    throw new Error('REALM_WATER_RENDER_BUDGET_EXCEEDED');
  }
  const uniforms = [waterMaterial, lakeMaterial, riverMaterial]
    .filter((material) => (material.userData.waterWaveComponents as number) > 0)
    .map((material) => material.userData.waterUniforms as { uWaterTime: { value: number } });
  const animated = uniforms.length > 0;
  let lastTime = -1;
  let disposed = false;
  const telemetry = Object.freeze({
    layoutVersion: options.cells === GENESIS_WATER_REVISION_ENABLED_CELLS_V1
      ? GENESIS_WATER_REVISION_VERSION
      : GENESIS_WATER_LAYOUT_VERSION,
    oceanCellCount: ocean.length,
    lakeCellCount: lakes.length,
    riverCellCount: rivers.length,
    triangleCount,
    drawCalls,
    animated,
    fullFogOceanCellCount: ocean.filter((cell) => cell.fogBand === 'full').length
  });
  return {
    group,
    updateEnvironment: (elapsedSeconds) => {
      if (disposed || !animated || !Number.isFinite(elapsedSeconds) || elapsedSeconds === lastTime) return false;
      lastTime = elapsedSeconds;
      uniforms.forEach((uniform) => { uniform.uWaterTime.value = elapsedSeconds; });
      return true;
    },
    isAnimationActive: () => animated,
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      selectedWaterOverlay.geometry.dispose();
      (selectedWaterOverlay.material as THREE.Material).dispose();
      hoveredWaterOverlay.geometry.dispose();
      (hoveredWaterOverlay.material as THREE.Material).dispose();
      disposeResources();
    },
    raycast: (raycaster) => {
      if (disposed) return null;
      const hits = [raycastMesh(oceanMesh, raycaster), raycastMesh(lakeMesh, raycaster), raycastMesh(riverMesh, raycaster)]
        .filter((hit): hit is RealmWaterCellHit => hit !== null)
        .sort((left, right) => left.distance - right.distance);
      return hits[0] ?? null;
    },
    getCellPresentation: (cellKey) => cellsByKey.get(cellKey),
    setSelectedCellKey: (cellKey) => {
      if (disposed) return;
      updateWaterOverlay(selectedWaterOverlay, cellKey, 0.94);
    },
    setHoveredCellKey: (cellKey) => {
      if (disposed) return;
      updateWaterOverlay(hoveredWaterOverlay, cellKey, 0.6);
    }
  };
}
