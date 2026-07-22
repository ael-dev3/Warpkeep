import * as THREE from 'three';

import {
  axialToWorld,
  hexDisc,
  hexDistance,
  hexKey,
  worldToNearestAxial,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import {
  GENESIS_OCEAN_DEPTH_BY_KEY,
  GENESIS_WATER_LAYOUT_VERSION,
  genesisWaterWorldHeightFromMilli,
  type GenesisWaterBodyV1,
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import type { RealmQualitySpec } from './realmQuality';
import { pointyHexCorners } from './createTerrainGeometry';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_VERSION
} from '../../../spacetimedb/src/waterRevision';
import {
  resolveRealmWaterPhase,
  type RealmWaterPhase
} from './realmWaterPhase';

const WATER_Y_LIFT = 0.035;
const RIVER_BANK_BLEND = 0.28;
// The adaptive terrain and the full-cell river mesh are intentionally close,
// but a sub-centimetre gap aliases away at strategic camera distances. Keep a
// small deterministic presentation clearance so the persisted channel wins
// the depth buffer without reading as a floating sheet.
const RIVER_TERRAIN_CLEARANCE = 0.014;
const RIVER_SURFACE_PROBE_SUBDIVISIONS = 6;
const MAXIMUM_RIVER_SURFACE_CORRECTION = 0.16;
const OUTER_CURTAIN_BOTTOM = -20;
const OUTER_CURTAIN_TOP = 38;
const ANALYTIC_PICK_NEIGHBORHOOD_RADIUS = 2;
const ANALYTIC_PICK_DIRECTION_EPSILON = 0.000_001;

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

/** Water shares one demand-driven scheduler with grass and moving wagons. */
export const REALM_WATER_ANIMATION_FRAME_CAPS = Object.freeze({
  high: 30,
  balanced: 22,
  reduced: 0
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
  environment?: unknown;
  waterBodies?: readonly unknown[];
  /** Test seam; production defaults to a bounded local wall-clock sample. */
  nowMicros?: () => bigint;
}>;

function shoreFoamForCell(cell: GenesisWaterCellV1) {
  if (cell.regime === 'river') return 0.82;
  if (cell.regime !== 'ocean') return 0.16;
  const depth = GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.cellKey) ?? cell.oceanDepth;
  if (depth <= 1) return 1;
  if (depth === 2) return 0.56;
  return 0.06;
}

function waterRegimeForCell(cell: GenesisWaterCellV1) {
  return cell.regime === 'river' ? 1 : 0;
}

function flowForCell(
  cell: GenesisWaterCellV1,
  cellsByKey: ReadonlyMap<string, GenesisWaterCellV1>
) {
  const current = axialToWorld(cell, 1);
  const downstream = cell.downstreamWaterCellKey
    ? cellsByKey.get(cell.downstreamWaterCellKey)
    : undefined;
  const upstream = downstream
    ? undefined
    : [...cellsByKey.values()].find((candidate) => (
      candidate.downstreamWaterCellKey === cell.cellKey
    ));
  const neighbor = downstream ?? upstream;
  if (!neighbor) return { x: 0, z: 1 };
  const neighborWorld = axialToWorld(neighbor, 1);
  const direction = downstream
    ? { x: neighborWorld.x - current.x, z: neighborWorld.z - current.z }
    : { x: current.x - neighborWorld.x, z: current.z - neighborWorld.z };
  const magnitude = Math.hypot(direction.x, direction.z);
  return magnitude > 0.000_001
    ? { x: direction.x / magnitude, z: direction.z / magnitude }
    : { x: 0, z: 1 };
}

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
  const waterRegime: number[] = [];
  const waterShoreFoam: number[] = [];
  const waterFlowX: number[] = [];
  const waterFlowZ: number[] = [];
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
    waterRegime.push(waterRegimeForCell(cell));
    waterShoreFoam.push(shoreFoamForCell(cell));
    waterFlowX.push(0);
    waterFlowZ.push(0);
    normals.push(0, 1, 0);
    pointyHexCorners({ q: cell.q, r: cell.r }, hexSize).forEach((corner) => {
      positions.push(corner.x, ground, corner.z);
      colors.push(color.r, color.g, color.b);
      waterDepth.push(Math.min(1, cell.depthCells / 5));
      waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
      waterFogMix.push(fogMixForCell(cell));
      waterRegime.push(waterRegimeForCell(cell));
      waterShoreFoam.push(shoreFoamForCell(cell));
      waterFlowX.push(0);
      waterFlowZ.push(0);
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
  geometry.setAttribute('waterRegime', new THREE.Float32BufferAttribute(waterRegime, 1));
  geometry.setAttribute('waterShoreFoam', new THREE.Float32BufferAttribute(waterShoreFoam, 1));
  geometry.setAttribute('waterFlowX', new THREE.Float32BufferAttribute(waterFlowX, 1));
  geometry.setAttribute('waterFlowZ', new THREE.Float32BufferAttribute(waterFlowZ, 1));
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
  const cellsByKey = new Map(cells.map((cell) => [cell.cellKey, cell] as const));
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
  const waterRegime: number[] = [];
  const waterShoreFoam: number[] = [];
  const waterFlowX: number[] = [];
  const waterFlowZ: number[] = [];
  const indices: number[] = [];
  plans.forEach((plan) => {
    const color = regimeColor(plan.cell);
    const depth = Math.min(1, plan.cell.depthCells / 5);
    const flow = flowForCell(plan.cell, cellsByKey);
    const base = positions.length / 3;
    [plan.center, ...plan.corners].forEach((node) => {
      positions.push(node.world.x, node.height, node.world.z);
      colors.push(color.r, color.g, color.b);
      waterDepth.push(depth);
      waterBankBlend.push(RIVER_BANK_BLEND);
      waterFogMix.push(0);
      waterRegime.push(1);
      waterShoreFoam.push(shoreFoamForCell(plan.cell));
      waterFlowX.push(flow.x);
      waterFlowZ.push(flow.z);
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
  geometry.setAttribute('waterRegime', new THREE.Float32BufferAttribute(waterRegime, 1));
  geometry.setAttribute('waterShoreFoam', new THREE.Float32BufferAttribute(waterShoreFoam, 1));
  geometry.setAttribute('waterFlowX', new THREE.Float32BufferAttribute(waterFlowX, 1));
  geometry.setAttribute('waterFlowZ', new THREE.Float32BufferAttribute(waterFlowZ, 1));
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
      // A full-height horizon curtain closes the frustum even when the camera
      // pans over the visible ocean apron. It is presentation-only and follows
      // the exact outer edge of the canonical Water disc.
      positions.push(
        a.x, OUTER_CURTAIN_TOP, a.z,
        b.x, OUTER_CURTAIN_TOP, b.z,
        b.x, OUTER_CURTAIN_BOTTOM, b.z,
        a.x, OUTER_CURTAIN_BOTTOM, a.z
      );
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

function createWaterMaterial(
  quality: RealmQualitySpec,
  reducedMotion: boolean,
  river: boolean
) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // Keep the material base neutral so the authoritative per-regime vertex
    // palette is not multiplied back toward the pale Lowlands ground tint.
    color: '#ffffff',
    roughness: river ? 0.34 : 0.27,
    metalness: 0.04,
    transparent: false,
    depthWrite: true,
    fog: true
  });
  const activeWaveComponents = reducedMotion
    ? 0
    : river
      ? Math.min(2, REALM_WATER_RENDER_BUDGETS[quality.id].waveComponents)
      : REALM_WATER_RENDER_BUDGETS[quality.id].waveComponents;
  const uniforms = {
    uWaterTime: { value: 0 },
    uWaterHorizonColor: { value: new THREE.Color('#b9cad8') }
  };
  const waveTerms = Array.from({ length: activeWaveComponents }, (_, index) => {
    const ordinal = index + 1;
    const directionX = (0.54 + ((ordinal * 17) % 31) / 100).toFixed(3);
    const directionZ = (0.84 - ((ordinal * 11) % 23) / 100).toFixed(3);
    const frequency = (0.28 + ordinal * 0.075).toFixed(3);
    const speed = (0.16 + ordinal * 0.031).toFixed(3);
    const amplitude = (river ? 0.005 : 0.024 / Math.sqrt(ordinal)).toFixed(5);
    return `sin(dot(waterWorldXZ, vec2(${directionX}, ${directionZ})) * ${frequency} + uWaterTime * ${speed}) * ${amplitude}`;
  });
  const timeUniform = activeWaveComponents > 0 ? 'uniform float uWaterTime;\n' : '';
  const heightFunction = activeWaveComponents === 0
    ? 'float warpkeepWaterHeight(vec2 waterWorldXZ, float waterRegime, vec2 waterFlow) { return 0.0; }'
    : `float warpkeepWaterHeight(vec2 waterWorldXZ, float waterRegime, vec2 waterFlow) {
  float oceanWave = ${waveTerms.join(' + ')};
  float riverWave = sin(dot(waterWorldXZ, normalize(waterFlow + vec2(0.0001))) * 2.3 + uWaterTime * 0.72) * 0.006;
  return waterRegime > 0.5 ? riverWave : oceanWave;
}`;
  const shaderContract = `warpkeep-water-world-space-r185-${river ? 'river' : 'ocean'}-v2`;
  material.onBeforeCompile = (shader) => {
    if (
      !shader.vertexShader.includes('#include <color_vertex>')
      || !shader.vertexShader.includes('#include <begin_vertex>')
      || !shader.vertexShader.includes('#include <beginnormal_vertex>')
      || !shader.fragmentShader.includes('#include <opaque_fragment>')
    ) throw new Error('REALM_WATER_SHADER_CONTRACT_CHANGED');
    if (activeWaveComponents > 0) shader.uniforms.uWaterTime = uniforms.uWaterTime;
    shader.uniforms.uWaterHorizonColor = uniforms.uWaterHorizonColor;
    shader.vertexShader = `${timeUniform}
attribute float waterDepth;
attribute float waterBankBlend;
attribute float waterFogMix;
attribute float waterRegime;
attribute float waterShoreFoam;
attribute float waterFlowX;
attribute float waterFlowZ;
varying float vWarpkeepWaterDepth;
varying float vWarpkeepWaterBankBlend;
varying float vWarpkeepWaterFogMix;
varying float vWarpkeepWaterRegime;
varying float vWarpkeepWaterShoreFoam;
varying float vWarpkeepWaterWave;
varying vec2 vWarpkeepWaterWorldXZ;
${heightFunction}
${shader.vertexShader}`
      .replace('#include <color_vertex>', `#include <color_vertex>
  vWarpkeepWaterDepth = waterDepth;
  vWarpkeepWaterBankBlend = waterBankBlend;
  vWarpkeepWaterFogMix = waterFogMix;
  vWarpkeepWaterRegime = waterRegime;
  vWarpkeepWaterShoreFoam = waterShoreFoam;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vWarpkeepWaterWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
  vWarpkeepWaterWave = warpkeepWaterHeight(vWarpkeepWaterWorldXZ, waterRegime, vec2(waterFlowX, waterFlowZ));
  transformed.y += vWarpkeepWaterWave;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float warpkeepWaterEpsilon = 0.045;
  vec2 warpkeepWaterNormalWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
  float warpkeepWaterNormalHeight = warpkeepWaterHeight(warpkeepWaterNormalWorldXZ, waterRegime, vec2(waterFlowX, waterFlowZ));
  float warpkeepWaterDx = (warpkeepWaterHeight(warpkeepWaterNormalWorldXZ + vec2(warpkeepWaterEpsilon, 0.0), waterRegime, vec2(waterFlowX, waterFlowZ)) - warpkeepWaterNormalHeight) / warpkeepWaterEpsilon;
  float warpkeepWaterDz = (warpkeepWaterHeight(warpkeepWaterNormalWorldXZ + vec2(0.0, warpkeepWaterEpsilon), waterRegime, vec2(waterFlowX, waterFlowZ)) - warpkeepWaterNormalHeight) / warpkeepWaterEpsilon;
  objectNormal = normalize(vec3(-warpkeepWaterDx, 1.0, -warpkeepWaterDz));`);
    shader.fragmentShader = `uniform vec3 uWaterHorizonColor;
varying float vWarpkeepWaterDepth;
varying float vWarpkeepWaterBankBlend;
varying float vWarpkeepWaterFogMix;
varying float vWarpkeepWaterRegime;
varying float vWarpkeepWaterShoreFoam;
varying float vWarpkeepWaterWave;
varying vec2 vWarpkeepWaterWorldXZ;
${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        float waterViewFacing = max(dot(normalize(vNormal), normalize(-vViewPosition)), 0.0);
        float waterFresnel = pow(1.0 - waterViewFacing, 3.0) * (vWarpkeepWaterRegime > 0.5 ? 0.045 : 0.095);
        vec3 waterDeepColor = vec3(0.055, 0.22, 0.34);
        vec3 waterShallowColor = vec3(0.16, 0.48, 0.58);
        vec3 waterBodyColor = mix(waterShallowColor, waterDeepColor, clamp(vWarpkeepWaterDepth, 0.0, 1.0) * 0.78);
        float waterGlimmer = abs(vWarpkeepWaterWave) * (vWarpkeepWaterRegime > 0.5 ? 1.8 : 3.2);
        float waterCrest = smoothstep(0.012, 0.032, abs(vWarpkeepWaterWave));
        float waterFoam = clamp(vWarpkeepWaterShoreFoam, 0.0, 1.0) * (0.08 + waterCrest * 0.34);
        float bankSoftness = 1.0 - clamp(vWarpkeepWaterBankBlend, 0.0, 1.0) * 0.16;
        outgoingLight = mix(outgoingLight, outgoingLight * waterBodyColor * 1.65, 0.42);
        outgoingLight += (waterBodyColor * waterFresnel + vec3(waterGlimmer)) * bankSoftness;
        outgoingLight = mix(outgoingLight, vec3(0.93, 0.91, 0.82), waterFoam);
        outgoingLight = mix(outgoingLight, uWaterHorizonColor, clamp(vWarpkeepWaterFogMix, 0.0, 1.0));
        #include <opaque_fragment>`);
    material.userData.waterShaderContract = shaderContract;
  };
  material.customProgramCacheKey = () => shaderContract;
  material.userData.waterUniforms = uniforms;
  material.userData.waterWaveComponents = activeWaveComponents;
  material.userData.waterShaderContract = shaderContract;
  return material;
}

function waterLayerRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function pointInsidePointyHex(
  point: HexWorldPosition,
  center: HexWorldPosition,
  hexSize: number
) {
  const localX = Math.abs(point.x - center.x);
  const localZ = Math.abs(point.z - center.z);
  const epsilon = 0.000_01;
  return localX <= Math.sqrt(3) * hexSize * 0.5 + epsilon
    && localX / Math.sqrt(3) + localZ <= hexSize + epsilon;
}

function rayPointAtSurfaceY(
  ray: THREE.Ray,
  surfaceY: number,
  target: THREE.Vector3
) {
  if (
    !Number.isFinite(surfaceY)
    || !Number.isFinite(ray.origin.y)
    || !Number.isFinite(ray.direction.y)
    || Math.abs(ray.direction.y) <= ANALYTIC_PICK_DIRECTION_EPSILON
  ) return undefined;
  const rayParameter = (surfaceY - ray.origin.y) / ray.direction.y;
  if (!Number.isFinite(rayParameter) || rayParameter < 0) return undefined;
  return ray.at(rayParameter, target);
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
    waterMaterial = createWaterMaterial(options.quality, options.reducedMotion, false);
    lakeMaterial = createWaterMaterial(options.quality, options.reducedMotion, false);
    riverMaterial = createWaterMaterial(options.quality, options.reducedMotion, true);
    // Rivers occupy only one authoritative hex at a time and sit over the
    // pale Lowlands palette. A restrained cool emissive lift keeps the
    // connected channel readable in daylight without changing its geometry.
    riverMaterial.emissive.set('#0b607b');
    riverMaterial.emissiveIntensity = 0.2;
    riverMaterial.roughness = 0.22;
    skirtMaterial = new THREE.MeshBasicMaterial({
      color: '#b9cad8',
      transparent: false,
      depthWrite: true,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide,
      toneMapped: false
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
  const visibleOverlayCells = new Set(options.cells
    .filter((cell) => cell.regime !== 'ocean' || cell.fogBand !== 'full')
    .map((cell) => cell.cellKey));
  const visiblePickCellsByKey = new Map(options.cells
    .filter((cell) => (
      (cell.regime === 'ocean' || cell.regime === 'river')
      && cell.fogBand !== 'full'
    ))
    .map((cell) => [cell.cellKey, cell] as const));
  const pickHeightByCellKey = new Map<string, number>();
  ocean.forEach((cell) => {
    pickHeightByCellKey.set(
      cell.cellKey,
      waterSurfaceLevelToWorldY(cell.surfaceLevelMilli)
    );
  });
  rivers.forEach((cell, index) => {
    const renderedCenterY = riverGeometryData
      .getAttribute('position')
      .getY(index * 7);
    pickHeightByCellKey.set(
      cell.cellKey,
      Number.isFinite(renderedCenterY)
        ? renderedCenterY
        : waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + WATER_Y_LIFT
    );
  });
  const visiblePickHeights = [...visiblePickCellsByKey.keys()]
    .flatMap((cellKey) => {
      const height = pickHeightByCellKey.get(cellKey);
      return height === undefined || !Number.isFinite(height) ? [] : [height];
    });
  const minimumPickHeight = visiblePickHeights.length > 0
    ? Math.min(...visiblePickHeights)
    : 0;
  const maximumPickHeight = visiblePickHeights.length > 0
    ? Math.max(...visiblePickHeights)
    : 0;
  const createWaterOverlayGeometry = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    return geometry;
  };
  const selectedWaterOverlay = new THREE.LineLoop(
    createWaterOverlayGeometry(),
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
    createWaterOverlayGeometry(),
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
    if (!cell || !visibleOverlayCells.has(cell.cellKey)) {
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
    const positions = overlay.geometry.getAttribute('position') as THREE.BufferAttribute;
    corners.forEach((corner, index) => {
      positions.setXYZ(
        index,
        corner.x,
        ground + (opacity > 0.8 ? 0.018 : 0.012),
        corner.z
      );
    });
    positions.needsUpdate = true;
    overlay.geometry.computeBoundingSphere();
    (overlay.material as THREE.LineBasicMaterial).opacity = opacity;
    overlay.visible = true;
  };
  const analyticRaycast = (raycaster: THREE.Raycaster) => {
    if (visiblePickCellsByKey.size === 0) return null;
    const candidateKeys = new Set<string>();
    const samplePoint = new THREE.Vector3();
    const heightSpan = maximumPickHeight - minimumPickHeight;
    // Three bounded height samples account for the shallow river elevation
    // range without raycasting thousands of rendered triangles on every hover.
    for (const fraction of [0, 0.5, 1]) {
      const sampleHeight = minimumPickHeight + heightSpan * fraction;
      const point = rayPointAtSurfaceY(raycaster.ray, sampleHeight, samplePoint);
      if (!point) continue;
      const nearestCoord = worldToNearestAxial({ x: point.x, z: point.z }, options.hexSize);
      hexDisc(nearestCoord, ANALYTIC_PICK_NEIGHBORHOOD_RADIUS).forEach((coord) => {
        candidateKeys.add(hexKey(coord));
      });
    }
    let nearest: RealmWaterCellHit | null = null;
    const hitPoint = new THREE.Vector3();
    for (const cellKey of candidateKeys) {
      const cell = visiblePickCellsByKey.get(cellKey);
      const surfaceY = pickHeightByCellKey.get(cellKey);
      if (!cell || surfaceY === undefined) continue;
      const point = rayPointAtSurfaceY(raycaster.ray, surfaceY, hitPoint);
      if (!point) continue;
      const center = axialToWorld(cell, options.hexSize);
      if (!pointInsidePointyHex({ x: point.x, z: point.z }, center, options.hexSize)) continue;
      const distance = raycaster.ray.origin.distanceTo(point);
      if (
        !Number.isFinite(distance)
        || distance < Math.max(0, raycaster.near)
        || distance > raycaster.far
      ) continue;
      if (
        nearest !== null
        && (distance > nearest.distance
          || (distance === nearest.distance && cell.cellKey >= nearest.cellKey))
      ) continue;
      const regime = cell.regime === 'river'
        ? 'river'
        : cell.regime === 'ocean'
          ? 'ocean'
          : undefined;
      if (!regime) continue;
      nearest = Object.freeze({
        cellKey: cell.cellKey,
        bodyId: cell.bodyId,
        regime,
        coord: Object.freeze({ q: cell.q, r: cell.r }),
        distance
      });
    }
    return nearest;
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
  const environment = waterLayerRecord(options.environment);
  const environmentEpoch = typeof environment?.environmentEpoch === 'bigint'
    && environment.environmentEpoch >= 0n
    ? environment.environmentEpoch
    : 1n;
  const environmentUpdatedAtMicros = typeof environment?.updatedAtMicros === 'bigint'
    && environment.updatedAtMicros >= 0n
    ? environment.updatedAtMicros
    : undefined;
  const waterBodies = new Map<string, GenesisWaterBodyV1>();
  for (const value of options.waterBodies ?? []) {
    const candidate = waterLayerRecord(value);
    if (
      !candidate
      || typeof candidate.bodyId !== 'string'
      || typeof candidate.seed !== 'number'
      || !Number.isFinite(candidate.seed)
      || typeof candidate.wavePreset !== 'string'
    ) continue;
    waterBodies.set(candidate.bodyId, candidate as GenesisWaterBodyV1);
  }
  const phaseCell = ocean[0] ?? rivers[0] ?? lakes[0];
  const phaseBody = phaseCell ? waterBodies.get(phaseCell.bodyId) : undefined;
  const phaseSeed = phaseBody?.seed ?? phaseCell?.bankSeed ?? 0;
  const phaseWavePreset = phaseBody?.wavePreset ?? phaseCell?.bodyId ?? 'genesis-water';
  let lastElapsedSeconds = -1;
  let lastPhase: RealmWaterPhase | undefined;
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
      if (
        disposed
        || !animated
        || !Number.isFinite(elapsedSeconds)
        || elapsedSeconds === lastElapsedSeconds
      ) return false;
      lastElapsedSeconds = elapsedSeconds;
      let synchronizedServerTimeMicros: bigint | undefined;
      if (options.nowMicros) {
        try {
          const sample = options.nowMicros();
          if (typeof sample === 'bigint' && sample >= 0n) synchronizedServerTimeMicros = sample;
        } catch {
          synchronizedServerTimeMicros = undefined;
        }
      }
      const phase = resolveRealmWaterPhase({
        environmentEpoch,
        environmentUpdatedAtMicros,
        synchronizedServerTimeMicros,
        localMonotonicSeconds: elapsedSeconds,
        previousLocalMonotonicSeconds: lastPhase?.localMonotonicSeconds,
        previousUnwrappedPhaseSeconds: lastPhase?.unwrappedPhaseSeconds,
        reducedMotion: options.reducedMotion,
        bodySeed: phaseSeed,
        wavePreset: phaseWavePreset
      });
      lastPhase = phase;
      uniforms.forEach((uniform) => { uniform.uWaterTime.value = phase.phaseSeconds; });
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
      return analyticRaycast(raycaster);
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
