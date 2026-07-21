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
  type GenesisWaterCellV1,
  type GenesisWaterBodyV1,
  GENESIS_RIVERS_V1
} from '../../../spacetimedb/src/waterWorld';
import type { RealmQualitySpec } from './realmQuality';
import { pointyHexCorners } from './createTerrainGeometry';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_VERSION
} from '../../../spacetimedb/src/waterRevision';
import { resolveRealmWaterPhase } from './realmWaterPhase';

const WATER_Y_LIFT = 0.035;
const RIVER_TERRAIN_CLEARANCE = 0.014;
const MAXIMUM_RIVER_SURFACE_CORRECTION = 0.16;
const RIVER_MIN_WIDTH = 0.50;
const RIVER_MAX_WIDTH = 0.72;
const OUTER_WATER_RADIUS = 65;
const OUTER_CURTAIN_BOTTOM = -20;
const OUTER_CURTAIN_TOP = 38;

/** Renderer cadence is shared with grass/wagons through one scheduler. */
export const REALM_WATER_ANIMATION_FRAME_CAPS = Object.freeze({
  high: 30,
  balanced: 22,
  reduced: 0
});

export const REALM_WATER_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ triangles: 220_000, draws: 5, waveComponents: 8 }),
  balanced: Object.freeze({ triangles: 105_000, draws: 5, waveComponents: 5 }),
  reduced: Object.freeze({ triangles: 35_000, draws: 4, waveComponents: 0 })
});

export type RealmWaterPickHit = Readonly<{
  cellKey: string;
  coord: Readonly<{ q: number; r: number }>;
  regime: GenesisWaterCellV1['regime'];
  distance: number;
}>;

export type RealmWaterLayerTelemetry = Readonly<{
  layoutVersion: number;
  oceanCellCount: number;
  lakeCellCount: number;
  riverCellCount: number;
  triangleCount: number;
  drawCalls: number;
  animated: boolean;
  fullFogOceanCellCount: number;
  oceanSubdivision: number;
  riverRibbonCount: number;
  selectedCellKey: string | null;
}>;

export type RealmWaterLayer = Readonly<{
  group: THREE.Group;
  updateEnvironment: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  raycast: (raycaster: THREE.Raycaster) => RealmWaterPickHit | null;
  setSelectedCellKey: (cellKey: string | null) => void;
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
}>;

type WaterVertex = Readonly<{
  world: HexWorldPosition;
  height: number;
  cell: GenesisWaterCellV1;
}>;

type MutableWaterVertex = {
  world: HexWorldPosition;
  height: number;
  cell: GenesisWaterCellV1;
};

function finiteNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function waterPointKey(point: HexWorldPosition) {
  const precision = 1_000_000;
  return `${Math.round(point.x * precision)},${Math.round(point.z * precision)}`;
}

function cellKeyFor(cell: GenesisWaterCellV1) {
  return cell.cellKey;
}

function fogMixForCell(cell: GenesisWaterCellV1): number {
  if (cell.regime !== 'ocean') return 0;
  const depth = GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.cellKey) ?? cell.oceanDepth;
  if (depth < 3) return 0;
  if (depth >= 5) return 1;
  // The haze band starts at canonical depth 3 and is fully concealing at 5.
  return depth === 3 ? 0.45 : 0.72;
}

function shoreFoamForCell(cell: GenesisWaterCellV1): number {
  if (cell.regime === 'river') return 0.86;
  if (cell.regime !== 'ocean') return 0.18;
  const depth = GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.cellKey) ?? cell.oceanDepth;
  if (depth <= 1) return 1;
  if (depth === 2) return 0.58;
  return 0.08;
}

function regimeNumber(cell: GenesisWaterCellV1) {
  return cell.regime === 'river' ? 1 : 0;
}

function regimeColor(cell: GenesisWaterCellV1): THREE.Color {
  if (cell.regime === 'river') return new THREE.Color('#3f9bb7');
  if (cell.regime === 'lake') return new THREE.Color('#548eac');
  const depth = GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.cellKey) ?? cell.depthCells;
  return depth >= 5 ? new THREE.Color('#315b78') : depth >= 3
    ? new THREE.Color('#3c7691') : new THREE.Color('#4f91ab');
}

function appendVertexAttributes(
  vertex: WaterVertex,
  positions: number[],
  normals: number[],
  colors: number[],
  depths: number[],
  bankBlends: number[],
  fogMixes: number[],
  regimes: number[],
  shoreFoam: number[],
  flowX: number[],
  flowZ: number[]
) {
  const color = regimeColor(vertex.cell);
  positions.push(vertex.world.x, vertex.height, vertex.world.z);
  normals.push(0, 1, 0);
  colors.push(color.r, color.g, color.b);
  depths.push(Math.min(1, Math.max(0, vertex.cell.depthCells / 5)));
  bankBlends.push(vertex.cell.regime === 'river' ? 0.34 : 0);
  fogMixes.push(fogMixForCell(vertex.cell));
  regimes.push(regimeNumber(vertex.cell));
  shoreFoam.push(shoreFoamForCell(vertex.cell));
  // Flow vectors are refined on ribbon vertices; this stable fallback keeps
  // the attribute finite for ocean and legacy lake surfaces.
  flowX.push(0);
  flowZ.push(0);
}

function subdivisionForQuality(quality: RealmQualitySpec) {
  return quality.id === 'high' ? 3 : quality.id === 'balanced' ? 2 : 1;
}

type GeometryBuildResult = Readonly<{
  geometry: THREE.BufferGeometry;
  triangleCellKeys: readonly string[];
}>;

function createGeometry(
  positions: number[],
  normals: number[],
  colors: number[],
  depths: number[],
  bankBlends: number[],
  fogMixes: number[],
  regimes: number[],
  shoreFoam: number[],
  flowX: number[],
  flowZ: number[],
  indices: number[],
  triangleCellKeys: string[]
): GeometryBuildResult {
  const geometry = new THREE.BufferGeometry();
  try {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(depths, 1));
    geometry.setAttribute('waterBankBlend', new THREE.Float32BufferAttribute(bankBlends, 1));
    geometry.setAttribute('waterFogMix', new THREE.Float32BufferAttribute(fogMixes, 1));
    geometry.setAttribute('waterRegime', new THREE.Float32BufferAttribute(regimes, 1));
    geometry.setAttribute('waterShoreFoam', new THREE.Float32BufferAttribute(shoreFoam, 1));
    geometry.setAttribute('waterFlowX', new THREE.Float32BufferAttribute(flowX, 1));
    geometry.setAttribute('waterFlowZ', new THREE.Float32BufferAttribute(flowZ, 1));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.userData.waterTriangleCellKeys = Object.freeze([...triangleCellKeys]);
    return { geometry, triangleCellKeys: Object.freeze([...triangleCellKeys]) };
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

function sharedVertexIndex(
  world: HexWorldPosition,
  height: number,
  cell: GenesisWaterCellV1,
  vertices: Map<string, number>,
  positions: number[],
  normals: number[],
  colors: number[],
  depths: number[],
  bankBlends: number[],
  fogMixes: number[],
  regimes: number[],
  shoreFoam: number[],
  flowX: number[],
  flowZ: number[]
) {
  const key = waterPointKey(world);
  const existing = vertices.get(key);
  if (existing !== undefined) {
    // A shared boundary must remain fully concealed when either neighboring
    // cell is canonical full fog. Maxing only presentation attributes keeps
    // the seam closed without changing the persisted cell identity mapping.
    fogMixes[existing] = Math.max(fogMixes[existing] ?? 0, fogMixForCell(cell));
    depths[existing] = Math.max(depths[existing] ?? 0, Math.min(1, Math.max(0, cell.depthCells / 5)));
    shoreFoam[existing] = Math.max(shoreFoam[existing] ?? 0, shoreFoamForCell(cell));
    return existing;
  }
  const index = positions.length / 3;
  appendVertexAttributes(
    { world, height, cell },
    positions,
    normals,
    colors,
    depths,
    bankBlends,
    fogMixes,
    regimes,
    shoreFoam,
    flowX,
    flowZ
  );
  vertices.set(key, index);
  return index;
}

function barycentricPoint(
  center: HexWorldPosition,
  first: HexWorldPosition,
  second: HexWorldPosition,
  u: number,
  v: number
) {
  const centerWeight = 1 - u - v;
  return {
    x: center.x * centerWeight + first.x * u + second.x * v,
    z: center.z * centerWeight + first.z * u + second.z * v
  };
}

/**
 * Build a connected, deterministically subdivided hex surface. Boundary
 * vertices are shared by world-space key, so adjacent cells cannot crack when
 * the vertex shader applies the same world-space displacement function.
 */
function connectedSurfaceGeometry(
  cells: readonly GenesisWaterCellV1[],
  hexSize: number,
  subdivision: number
): GeometryBuildResult {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const depths: number[] = [];
  const bankBlends: number[] = [];
  const fogMixes: number[] = [];
  const regimes: number[] = [];
  const shoreFoam: number[] = [];
  const flowX: number[] = [];
  const flowZ: number[] = [];
  const indices: number[] = [];
  const triangleCellKeys: string[] = [];
  const vertices = new Map<string, number>();
  const ordered = [...cells].sort((left, right) => (
    left.q - right.q || left.r - right.r || left.cellKey.localeCompare(right.cellKey)
  ));
  for (const cell of ordered) {
    const center = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize);
    const height = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli)
      + (cell.regime === 'ocean' ? 0 : WATER_Y_LIFT);
    for (let corner = 0; corner < 6; corner += 1) {
      const first = corners[corner]!;
      const second = corners[(corner + 1) % 6]!;
      for (let uStep = 0; uStep < subdivision; uStep += 1) {
        for (let vStep = 0; vStep < subdivision - uStep; vStep += 1) {
          const u = uStep / subdivision;
          const v = vStep / subdivision;
          const nextU = (uStep + 1) / subdivision;
          const nextV = (vStep + 1) / subdivision;
          const addTriangle = (a: HexWorldPosition, b: HexWorldPosition, c: HexWorldPosition) => {
            indices.push(
              sharedVertexIndex(a, height, cell, vertices, positions, normals, colors, depths, bankBlends, fogMixes, regimes, shoreFoam, flowX, flowZ),
              sharedVertexIndex(c, height, cell, vertices, positions, normals, colors, depths, bankBlends, fogMixes, regimes, shoreFoam, flowX, flowZ),
              sharedVertexIndex(b, height, cell, vertices, positions, normals, colors, depths, bankBlends, fogMixes, regimes, shoreFoam, flowX, flowZ)
            );
            triangleCellKeys.push(cell.cellKey);
          };
          addTriangle(
            barycentricPoint(center, first, second, u, v),
            barycentricPoint(center, first, second, nextU, v),
            barycentricPoint(center, first, second, u, nextV)
          );
          if (uStep + vStep < subdivision - 1) {
            addTriangle(
              barycentricPoint(center, first, second, nextU, v),
              barycentricPoint(center, first, second, nextU, nextV),
              barycentricPoint(center, first, second, u, nextV)
            );
          }
        }
      }
    }
  }
  return createGeometry(
    positions, normals, colors, depths, bankBlends, fogMixes, regimes,
    shoreFoam, flowX, flowZ, indices, triangleCellKeys
  );
}

type RiverPoint = Readonly<{
  cell: GenesisWaterCellV1;
  world: HexWorldPosition;
  height: number;
  flowX: number;
  flowZ: number;
  left: HexWorldPosition;
  right: HexWorldPosition;
  width: number;
}>;

function riverFlowDirection(
  current: HexWorldPosition,
  previous: HexWorldPosition | undefined,
  next: HexWorldPosition | undefined
) {
  const from = previous ?? current;
  const to = next ?? current;
  let x = to.x - from.x;
  let z = to.z - from.z;
  const magnitude = Math.hypot(x, z);
  if (magnitude < 0.00001) return { x: 0, z: 1 };
  x /= magnitude;
  z /= magnitude;
  return { x, z };
}

function riverRibbonGeometry(
  cells: readonly GenesisWaterCellV1[],
  hexSize: number,
  heightAtWorld: (world: HexWorldPosition) => number
): GeometryBuildResult {
  const cellsByKey = new Map(cells.map((cell) => [cell.cellKey, cell]));
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const depths: number[] = [];
  const bankBlends: number[] = [];
  const fogMixes: number[] = [];
  const regimes: number[] = [];
  const shoreFoam: number[] = [];
  const flowX: number[] = [];
  const flowZ: number[] = [];
  const indices: number[] = [];
  const triangleCellKeys: string[] = [];
  let ribbonCount = 0;

  const appendRibbonVertex = (point: RiverPoint, world: HexWorldPosition) => {
    const color = regimeColor(point.cell);
    positions.push(world.x, point.height, world.z);
    normals.push(0, 1, 0);
    colors.push(color.r, color.g, color.b);
    depths.push(Math.min(1, Math.max(0, point.cell.depthCells / 5)));
    bankBlends.push(0.72);
    fogMixes.push(0);
    regimes.push(1);
    shoreFoam.push(Math.min(1, 0.4 + point.cell.flowAccumulation / 12));
    flowX.push(point.flowX);
    flowZ.push(point.flowZ);
    return positions.length / 3 - 1;
  };

  for (const river of GENESIS_RIVERS_V1) {
    const pathCells = river.orderedCellKeys.map((key) => cellsByKey.get(key)).filter(
      (cell): cell is GenesisWaterCellV1 => cell !== undefined
    );
    if (pathCells.length < 2) continue;
    ribbonCount += 1;
    const points: RiverPoint[] = pathCells.map((cell, index) => {
      const world = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
      const previous = index > 0
        ? axialToWorld({ q: pathCells[index - 1]!.q, r: pathCells[index - 1]!.r }, hexSize)
        : undefined;
      const next = index + 1 < pathCells.length
        ? axialToWorld({ q: pathCells[index + 1]!.q, r: pathCells[index + 1]!.r }, hexSize)
        : undefined;
      const direction = riverFlowDirection(world, previous, next);
      const accumulation = Math.min(1, Math.max(0, cell.flowAccumulation / 12));
      const width = RIVER_MIN_WIDTH + (RIVER_MAX_WIDTH - RIVER_MIN_WIDTH) * accumulation;
      const halfWidth = width * 0.5;
      const lateral = { x: -direction.z, z: direction.x };
      const left = { x: world.x + lateral.x * halfWidth, z: world.z + lateral.z * halfWidth };
      const right = { x: world.x - lateral.x * halfWidth, z: world.z - lateral.z * halfWidth };
      const persisted = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + WATER_Y_LIFT;
      const leftTerrain = finiteNumber(heightAtWorld(left), persisted);
      const rightTerrain = finiteNumber(heightAtWorld(right), persisted);
      const correction = Math.max(0, Math.max(leftTerrain, rightTerrain) + RIVER_TERRAIN_CLEARANCE - persisted);
      if (correction > MAXIMUM_RIVER_SURFACE_CORRECTION) {
        throw new Error('REALM_WATER_SURFACE_BELOW_TERRAIN');
      }
      return {
        cell,
        world,
        height: persisted + correction,
        flowX: direction.x,
        flowZ: direction.z,
        left,
        right,
        width
      };
    });
    const edgePairs = points.map((point) => ({
      left: appendRibbonVertex(point, point.left),
      right: appendRibbonVertex(point, point.right)
    }));
    for (let index = 0; index + 1 < edgePairs.length; index += 1) {
      const first = edgePairs[index]!;
      const second = edgePairs[index + 1]!;
      indices.push(first.left, second.right, first.right, first.left, second.left, second.right);
      triangleCellKeys.push(points[index]!.cell.cellKey, points[index]!.cell.cellKey);
    }
    const firstPoint = points[0]!;
    const lastPoint = points.at(-1)!;
    const firstEdge = edgePairs[0]!;
    const lastEdge = edgePairs.at(-1)!;
    const firstCenter = appendRibbonVertex(firstPoint, firstPoint.world);
    const lastCenter = appendRibbonVertex(lastPoint, lastPoint.world);
    indices.push(firstCenter, firstEdge.left, firstEdge.right);
    triangleCellKeys.push(firstPoint.cell.cellKey);
    indices.push(lastCenter, lastEdge.right, lastEdge.left);
    triangleCellKeys.push(lastPoint.cell.cellKey);
  }
  return createGeometry(
    positions, normals, colors, depths, bankBlends, fogMixes, regimes,
    shoreFoam, flowX, flowZ, indices, triangleCellKeys
  );
}

function outerCurtainGeometry(cells: readonly GenesisWaterCellV1[], hexSize: number) {
  const keys = new Set(cells.map((cell) => cell.cellKey));
  const positions: number[] = [];
  const indices: number[] = [];
  for (const cell of cells) {
    if (cell.regime !== 'ocean' || hexDistance(cell, { q: 0, r: 0 }) !== OUTER_WATER_RADIUS) continue;
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize);
    for (let side = 0; side < 6; side += 1) {
      const direction = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
      ][side]!;
      if (keys.has(`${cell.q + direction.q},${cell.r + direction.r}`)) continue;
      const a = corners[side]!;
      const b = corners[(side + 1) % 6]!;
      const base = positions.length / 3;
      const top = OUTER_CURTAIN_TOP;
      positions.push(
        a.x, top, a.z,
        b.x, top, b.z,
        b.x, OUTER_CURTAIN_BOTTOM, b.z,
        a.x, OUTER_CURTAIN_BOTTOM, a.z
      );
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createWaterMaterial(
  quality: RealmQualitySpec,
  reducedMotion: boolean,
  river: boolean
) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: river ? 0.34 : 0.27,
    metalness: 0.04,
    transparent: false,
    depthWrite: true,
    fog: true
  });
  const activeWaveComponents = reducedMotion
    ? 0
    : river ? Math.min(2, REALM_WATER_RENDER_BUDGETS[quality.id].waveComponents)
      : REALM_WATER_RENDER_BUDGETS[quality.id].waveComponents;
  const uniforms = {
    uWaterTime: { value: 0 },
    uWaterHorizonColor: { value: new THREE.Color('#b9cad8') },
    uWaterSunDirection: { value: new THREE.Vector3(0.286, 0.89, 0.355).normalize() },
    uWaterWindDirection: { value: new THREE.Vector2(0.82, 0.42).normalize() }
  };
  const waveTerms = Array.from({ length: activeWaveComponents }, (_, index) => {
    const ordinal = index + 1;
    const directionX = (0.54 + ((ordinal * 17) % 31) / 100).toFixed(3);
    const directionZ = (0.84 - ((ordinal * 11) % 23) / 100).toFixed(3);
    const frequency = (0.28 + ordinal * 0.075).toFixed(3);
    const speed = (0.16 + ordinal * 0.031).toFixed(3);
    const amplitude = (river ? 0.006 : 0.026 / Math.sqrt(ordinal)).toFixed(5);
    return `sin(dot(p, vec2(${directionX}, ${directionZ})) * ${frequency} + uWaterTime * ${speed}) * ${amplitude}`;
  });
  const waves = waveTerms.length === 0 ? '0.0' : waveTerms.join(' + ');
  const fragmentGlimmer = waveTerms.length === 0
    ? '0.0'
    : `(${waveTerms.map((term) => term.replace('dot(p,', 'dot(vViewPosition.xz,')).join(' + ')}) * 0.025`;
  const shaderContract = `warpkeep-water-layered-r185-${river ? 'river' : 'ocean'}-v1`;
  material.onBeforeCompile = (shader) => {
    const requiredChunks = [
      '#include <color_vertex>',
      '#include <begin_vertex>',
      '#include <beginnormal_vertex>'
    ];
    if (!requiredChunks.every((chunk) => shader.vertexShader.includes(chunk))
      || !shader.fragmentShader.includes('#include <opaque_fragment>')) {
      throw new Error('REALM_WATER_SHADER_CONTRACT_CHANGED');
    }
    shader.uniforms.uWaterTime = uniforms.uWaterTime;
    shader.uniforms.uWaterHorizonColor = uniforms.uWaterHorizonColor;
    shader.uniforms.uWaterSunDirection = uniforms.uWaterSunDirection;
    shader.uniforms.uWaterWindDirection = uniforms.uWaterWindDirection;
    shader.vertexShader = `
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
varying vec2 vWarpkeepWaterFlow;
uniform float uWaterTime;
uniform vec2 uWaterWindDirection;
float warpkeepWaterHeight(vec2 p, float regime, vec2 flow) {
  float wave = ${waves};
  float riverFlow = sin(dot(p, flow) * 2.3 + uWaterTime * 0.72) * 0.008;
  return (regime > 0.5 ? riverFlow : wave);
}
${shader.vertexShader}`
      .replace('#include <color_vertex>', `#include <color_vertex>
  vWarpkeepWaterDepth = waterDepth;
  vWarpkeepWaterBankBlend = waterBankBlend;
  vWarpkeepWaterFogMix = waterFogMix;
  vWarpkeepWaterRegime = waterRegime;
  vWarpkeepWaterShoreFoam = waterShoreFoam;
  vWarpkeepWaterFlow = vec2(waterFlowX, waterFlowZ);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec2 warpkeepWaterPosition = position.xz;
  float warpkeepWaterAmplitude = waterRegime > 0.5 ? 0.55 : 1.0;
  transformed.y += warpkeepWaterHeight(warpkeepWaterPosition, waterRegime, vec2(waterFlowX, waterFlowZ)) * warpkeepWaterAmplitude;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float warpkeepWaterEpsilon = 0.045;
  float warpkeepWaterCenter = warpkeepWaterHeight(position.xz, waterRegime, vec2(waterFlowX, waterFlowZ));
  float warpkeepWaterDx = (warpkeepWaterHeight(position.xz + vec2(warpkeepWaterEpsilon, 0.0), waterRegime, vec2(waterFlowX, waterFlowZ)) - warpkeepWaterCenter) / warpkeepWaterEpsilon;
  float warpkeepWaterDz = (warpkeepWaterHeight(position.xz + vec2(0.0, warpkeepWaterEpsilon), waterRegime, vec2(waterFlowX, waterFlowZ)) - warpkeepWaterCenter) / warpkeepWaterEpsilon;
  objectNormal = normalize(vec3(-warpkeepWaterDx, 1.0, -warpkeepWaterDz));`);
    shader.fragmentShader = `
uniform float uWaterTime;
uniform vec3 uWaterHorizonColor;
uniform vec3 uWaterSunDirection;
varying float vWarpkeepWaterDepth;
varying float vWarpkeepWaterBankBlend;
varying float vWarpkeepWaterFogMix;
varying float vWarpkeepWaterRegime;
varying float vWarpkeepWaterShoreFoam;
varying vec2 vWarpkeepWaterFlow;
${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        float waterViewFacing = max(dot(normalize(vNormal), normalize(-vViewPosition)), 0.0);
        float waterFresnel = pow(1.0 - waterViewFacing, 3.0) * (vWarpkeepWaterRegime > 0.5 ? 0.045 : 0.095);
        vec3 waterDeepColor = vec3(0.055, 0.22, 0.34);
        vec3 waterShallowColor = vec3(0.16, 0.48, 0.58);
        float waterAbsorption = clamp(vWarpkeepWaterDepth, 0.0, 1.0);
        vec3 waterBodyColor = mix(waterShallowColor, waterDeepColor, waterAbsorption * 0.78);
        float waterFlowPhase = cos(dot(vViewPosition.xz, normalize(vWarpkeepWaterFlow + vec2(0.001))) * 2.0 + uWaterTime * 0.7) * 0.5 + 0.5;
        float waterCrest = smoothstep(0.72, 0.94, waterFlowPhase) * (vWarpkeepWaterRegime > 0.5 ? 0.12 : 0.32);
        float waterShore = clamp(vWarpkeepWaterShoreFoam, 0.0, 1.0) * (0.62 + waterFlowPhase * 0.38);
        vec3 waterFoamColor = vec3(0.93, 0.91, 0.82);
        float waterGlimmer = ${fragmentGlimmer};
        float waterGlitter = pow(max(dot(normalize(vNormal), normalize(uWaterSunDirection)), 0.0), 48.0) * (vWarpkeepWaterRegime > 0.5 ? 0.16 : 0.42);
        outgoingLight = mix(outgoingLight, outgoingLight * waterBodyColor * 1.7, 0.44);
        outgoingLight += waterBodyColor * waterFresnel + vec3(waterGlitter + waterGlimmer);
        outgoingLight = mix(outgoingLight, waterFoamColor, clamp(waterShore * 0.34 + waterCrest, 0.0, 0.68));
        if (vWarpkeepWaterFogMix >= 0.999) outgoingLight = uWaterHorizonColor;
        else outgoingLight = mix(outgoingLight, uWaterHorizonColor, clamp(vWarpkeepWaterFogMix, 0.0, 1.0));
        #include <opaque_fragment>`);
    material.userData.waterShaderContract = shaderContract;
  };
  material.customProgramCacheKey = () => shaderContract;
  material.userData.waterUniforms = uniforms;
  material.userData.waterWaveComponents = activeWaveComponents;
  material.userData.waterShaderContract = shaderContract;
  return material;
}

function createSelectionOverlay(cell: GenesisWaterCellV1, hexSize: number) {
  const geometry = new THREE.BufferGeometry();
  const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize);
  const y = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + WATER_Y_LIFT + 0.045;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    corners.flatMap((corner) => [corner.x, y, corner.z]),
    3
  ));
  const material = new THREE.LineBasicMaterial({
    color: '#fff1b8',
    transparent: true,
    opacity: 0.95,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  const overlay = new THREE.LineLoop(geometry, material);
  overlay.name = 'canonical-water-selection';
  overlay.visible = false;
  overlay.renderOrder = 5;
  return { overlay, geometry, material };
}

export function waterSurfaceLevelToWorldY(surfaceLevelMilli: number): number {
  return genesisWaterWorldHeightFromMilli(surfaceLevelMilli);
}

export function createRealmWaterLayer(options: WaterLayerOptions): RealmWaterLayer {
  const ocean = options.cells.filter((cell) => cell.regime === 'ocean');
  const lakes = options.cells.filter((cell) => cell.regime === 'lake');
  const rivers = options.cells.filter((cell) => cell.regime === 'river');
  const budget = REALM_WATER_RENDER_BUDGETS[options.quality.id];
  const subdivision = subdivisionForQuality(options.quality);
  const group = new THREE.Group();
  group.name = 'genesis-canonical-water';
  let oceanBuild: GeometryBuildResult | undefined;
  let lakeBuild: GeometryBuildResult | undefined;
  let riverBuild: GeometryBuildResult | undefined;
  let curtainGeometry: THREE.BufferGeometry | undefined;
  let oceanMaterial: THREE.MeshStandardMaterial | undefined;
  let lakeMaterial: THREE.MeshStandardMaterial | undefined;
  let riverMaterial: THREE.MeshStandardMaterial | undefined;
  let curtainMaterial: THREE.MeshBasicMaterial | undefined;
  let selection: ReturnType<typeof createSelectionOverlay> | undefined;
  const disposeResources = () => {
    oceanBuild?.geometry.dispose();
    lakeBuild?.geometry.dispose();
    riverBuild?.geometry.dispose();
    curtainGeometry?.dispose();
    oceanMaterial?.dispose();
    lakeMaterial?.dispose();
    riverMaterial?.dispose();
    curtainMaterial?.dispose();
    selection?.geometry.dispose();
    selection?.material.dispose();
  };
  try {
    oceanBuild = connectedSurfaceGeometry(ocean, options.hexSize, subdivision);
    lakeBuild = connectedSurfaceGeometry(lakes, options.hexSize, Math.max(1, subdivision - 1));
    riverBuild = riverRibbonGeometry(rivers, options.hexSize, options.heightAtWorld);
    curtainGeometry = outerCurtainGeometry(ocean, options.hexSize);
    oceanMaterial = createWaterMaterial(options.quality, options.reducedMotion, false);
    lakeMaterial = createWaterMaterial(options.quality, options.reducedMotion, false);
    riverMaterial = createWaterMaterial(options.quality, options.reducedMotion, true);
    riverMaterial.emissive.set('#0b607b');
    riverMaterial.emissiveIntensity = 0.14;
    curtainMaterial = new THREE.MeshBasicMaterial({
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
  if (!oceanBuild || !lakeBuild || !riverBuild || !curtainGeometry
    || !oceanMaterial || !lakeMaterial || !riverMaterial || !curtainMaterial) {
    disposeResources();
    throw new Error('REALM_WATER_RESOURCE_CONSTRUCTION_FAILED');
  }
  const oceanMesh = new THREE.Mesh(oceanBuild.geometry, oceanMaterial);
  const lakeMesh = new THREE.Mesh(lakeBuild.geometry, lakeMaterial);
  const riverMesh = new THREE.Mesh(riverBuild.geometry, riverMaterial);
  const curtainMesh = new THREE.Mesh(curtainGeometry, curtainMaterial);
  oceanMesh.name = 'canonical-ocean-surface';
  lakeMesh.name = 'canonical-lake-surfaces';
  riverMesh.name = 'canonical-river-ribbons';
  curtainMesh.name = 'canonical-ocean-fog-curtain';
  riverMesh.renderOrder = 2;
  curtainMesh.renderOrder = 1;
  group.add(oceanMesh, lakeMesh, riverMesh, curtainMesh);
  const cellByKey = new Map(options.cells.map((cell) => [cell.cellKey, cell]));
  const triangleCellKeys = new Map<THREE.Mesh, readonly string[]>([
    [oceanMesh, oceanBuild.triangleCellKeys],
    [lakeMesh, lakeBuild.triangleCellKeys],
    [riverMesh, riverBuild.triangleCellKeys]
  ]);
  const triangleCount = (
    oceanBuild.geometry.index?.count ?? 0
  ) / 3 + (
    lakeBuild.geometry.index?.count ?? 0
  ) / 3 + (
    riverBuild.geometry.index?.count ?? 0
  ) / 3 + (
    curtainGeometry.index?.count ?? 0
  ) / 3;
  const drawCalls = [oceanMesh, lakeMesh, riverMesh, curtainMesh]
    .filter((mesh) => (mesh.geometry.index?.count ?? 0) > 0).length;
  if (triangleCount > budget.triangles || drawCalls > budget.draws) {
    disposeResources();
    throw new Error('REALM_WATER_RENDER_BUDGET_EXCEEDED');
  }
  const uniforms = [oceanMaterial, lakeMaterial, riverMaterial]
    .filter((material) => (material.userData.waterWaveComponents as number) > 0)
    .map((material) => material.userData.waterUniforms as { uWaterTime: { value: number } });
  const phaseEnvironment = options.environment !== null && typeof options.environment === 'object'
    ? options.environment as Readonly<Record<string, unknown>>
    : undefined;
  const environmentEpoch = typeof phaseEnvironment?.environmentEpoch === 'bigint'
    ? phaseEnvironment.environmentEpoch : 1n;
  const environmentUpdatedAt = phaseEnvironment?.updatedAt;
  const waterBodies = new Map<string, GenesisWaterBodyV1>();
  for (const value of options.waterBodies ?? []) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const candidate = value as Partial<GenesisWaterBodyV1>;
    if (typeof candidate.bodyId === 'string'
      && typeof candidate.seed === 'number'
      && Number.isFinite(candidate.seed)
      && typeof candidate.wavePreset === 'string') {
      waterBodies.set(candidate.bodyId, candidate as GenesisWaterBodyV1);
    }
  }
  const seedCell = ocean[0] ?? rivers[0] ?? lakes[0];
  const phaseBody = seedCell ? waterBodies.get(seedCell.bodyId) : undefined;
  const phaseSeed = phaseBody?.seed ?? seedCell?.bankSeed ?? 0;
  const phaseWavePreset = phaseBody?.wavePreset ?? seedCell?.bodyId ?? 'genesis-water';
  const animated = uniforms.length > 0;
  let lastElapsed = -1;
  let lastPhaseSeconds: number | undefined;
  let selectedCellKey: string | null = null;
  const telemetry: {
    layoutVersion: number;
    oceanCellCount: number;
    lakeCellCount: number;
    riverCellCount: number;
    triangleCount: number;
    drawCalls: number;
    animated: boolean;
    fullFogOceanCellCount: number;
    oceanSubdivision: number;
    riverRibbonCount: number;
    selectedCellKey: string | null;
  } = {
    layoutVersion: options.cells === GENESIS_WATER_REVISION_ENABLED_CELLS_V1
      ? GENESIS_WATER_REVISION_VERSION : GENESIS_WATER_LAYOUT_VERSION,
    oceanCellCount: ocean.length,
    lakeCellCount: lakes.length,
    riverCellCount: rivers.length,
    triangleCount,
    drawCalls,
    animated,
    fullFogOceanCellCount: ocean.filter((cell) => cell.fogBand === 'full').length,
    oceanSubdivision: subdivision,
    riverRibbonCount: new Set(rivers.map((cell) => cell.bodyId)).size,
    selectedCellKey: null
  };
  selection = createSelectionOverlay(seedCell ?? {
    realmId: '', cellKey: '', q: 0, r: 0, regime: 'ocean', bodyId: '',
    depthCells: 1, elevationMilli: 1_000, surfaceLevelMilli: 1_000, ring: 0, s: 0,
    flowAccumulation: 0, depthClass: 0, oceanDepth: 1, bankSeed: 0,
    generationVersion: 1, fogBand: 'clear', layoutVersion: 1
  }, options.hexSize);
  selection.overlay.visible = false;
  group.add(selection.overlay);

  let disposed = false;
  return {
    group,
    updateEnvironment: (elapsedSeconds) => {
      if (disposed || !animated || !Number.isFinite(elapsedSeconds) || elapsedSeconds === lastElapsed) return false;
      lastElapsed = elapsedSeconds;
      const phase = resolveRealmWaterPhase({
        environmentEpoch,
        environmentUpdatedAt,
        localMonotonicSeconds: elapsedSeconds,
        previousPhaseSeconds: lastPhaseSeconds,
        reducedMotion: options.reducedMotion,
        bodySeed: phaseSeed,
        wavePreset: phaseWavePreset
      });
      lastPhaseSeconds = phase.phaseSeconds;
      uniforms.forEach((uniform) => { uniform.uWaterTime.value = phase.phaseSeconds; });
      return true;
    },
    isAnimationActive: () => animated,
    raycast: (raycaster) => {
      if (disposed) return null;
      let nearest: RealmWaterPickHit | null = null;
      for (const mesh of [oceanMesh, lakeMesh, riverMesh]) {
        const intersections = raycaster.intersectObject(mesh, false);
        for (const intersection of intersections) {
          const faceIndex = intersection.faceIndex;
          const key = typeof faceIndex !== 'number' ? undefined : triangleCellKeys.get(mesh)?.[faceIndex];
          const cell = key === undefined ? undefined : cellByKey.get(key);
          if (!cell || cell.fogBand === 'full') continue;
          if (!nearest || intersection.distance < nearest.distance) {
            nearest = Object.freeze({
              cellKey: cell.cellKey,
              coord: Object.freeze({ q: cell.q, r: cell.r }),
              regime: cell.regime,
              distance: intersection.distance
            });
          }
        }
      }
      return nearest;
    },
    setSelectedCellKey: (cellKey) => {
      if (disposed) return;
      const cell = cellKey === null ? undefined : cellByKey.get(cellKey);
      if (cell?.fogBand === 'full') return;
      selectedCellKey = cell?.cellKey ?? null;
      telemetry.selectedCellKey = selectedCellKey;
      if (cell) {
        if (selection) group.remove(selection.overlay);
        selection?.geometry.dispose();
        selection?.material.dispose();
        selection = createSelectionOverlay(cell, options.hexSize);
        selection.overlay.visible = true;
        group.add(selection.overlay);
      } else if (selection) {
        selection.overlay.visible = false;
      }
    },
    getTelemetry: () => Object.freeze({ ...telemetry }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeResources();
    }
  };
}
