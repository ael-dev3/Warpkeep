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
  GENESIS_WATER_OCEAN_RADIUS,
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
import { REALM_SKY_FALLBACK_COLOR } from './createRealmEnvironment';
import {
  createRealmWaterChannelPlan,
  type RealmWaterChannelBodyPlan,
  type RealmWaterChannelPlan,
  type RealmWaterChannelSection
} from './realmWaterChannelPresentation';

const WATER_Y_LIFT = 0.035;
const RIVER_BANK_BLEND = 0.28;
// The adaptive terrain and the full-cell river mesh are intentionally close,
// but a sub-centimetre gap aliases away at strategic camera distances. Keep a
// small deterministic presentation clearance so the persisted channel wins
// the depth buffer without reading as a floating sheet.
const RIVER_TERRAIN_CLEARANCE = 0.014;
const RIVER_SURFACE_PROBE_SUBDIVISIONS = 6;
const MAXIMUM_RIVER_SURFACE_CORRECTION = 0.16;
const RIVER_CHANNEL_LONGITUDINAL_STEP = 0.58;
const RIVER_CHANNEL_LATERAL_STOPS = Object.freeze([-1, -0.64, 0.64, 1]);
const OUTER_SKIRT_DEPTH = 1.25;
const ANALYTIC_PICK_NEIGHBORHOOD_RADIUS = 2;
const ANALYTIC_PICK_DIRECTION_EPSILON = 0.000_001;
const RIVER_TRIANGLES_PER_CELL = 6;
const OUTER_EDGE_NEIGHBOR_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 0, r: 1 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: 0, r: -1 })
]);

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
  riverBodyCount: number;
  riverChannelBodyCount: number;
  riverFallbackBodyCount: number;
  riverFallbackCellCount: number;
  riverChannelSegmentCount: number;
  riverMouthConnectionCount: number;
  riverLocalizedFoamVertexCount: number;
  shaderFallbackCount: number;
  riverFallbackReasons: readonly Readonly<{
    bodyId: string;
    reason: string;
  }>[];
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
  if (cell.regime === 'river') return 0.12;
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
  if (cell.regime === 'river') return new THREE.Color('#315e64');
  if (cell.regime === 'lake') return new THREE.Color('#548eac');
  const depth = GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.cellKey) ?? cell.depthCells;
  return depth >= 5 ? new THREE.Color('#315b78') : depth >= 3
    ? new THREE.Color('#3c7691') : new THREE.Color('#4f91ab');
}

function waterPointKey(point: HexWorldPosition) {
  const precision = 1_000_000;
  return `${Math.round(point.x * precision)},${Math.round(point.z * precision)}`;
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
  const cornerPresentation = new Map<string, {
    red: number;
    green: number;
    blue: number;
    depth: number;
    fogMix: number;
    shoreFoam: number;
    count: number;
  }>();
  cells.forEach((cell) => {
    const color = regimeColor(cell);
    const depth = Math.min(1, cell.depthCells / 5);
    const fogMix = fogMixForCell(cell);
    const shoreFoam = shoreFoamForCell(cell);
    pointyHexCorners({ q: cell.q, r: cell.r }, hexSize).forEach((corner) => {
      const key = waterPointKey(corner);
      const aggregate = cornerPresentation.get(key) ?? {
        red: 0,
        green: 0,
        blue: 0,
        depth: 0,
        fogMix: 0,
        shoreFoam: 0,
        count: 0
      };
      aggregate.red += color.r;
      aggregate.green += color.g;
      aggregate.blue += color.b;
      aggregate.depth += depth;
      aggregate.fogMix += fogMix;
      aggregate.shoreFoam += shoreFoam;
      aggregate.count += 1;
      cornerPresentation.set(key, aggregate);
    });
  });
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
      const aggregate = cornerPresentation.get(waterPointKey(corner));
      const divisor = Math.max(1, aggregate?.count ?? 0);
      positions.push(corner.x, ground, corner.z);
      colors.push(
        (aggregate?.red ?? color.r) / divisor,
        (aggregate?.green ?? color.g) / divisor,
        (aggregate?.blue ?? color.b) / divisor
      );
      waterDepth.push((aggregate?.depth ?? Math.min(1, cell.depthCells / 5)) / divisor);
      waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
      waterFogMix.push((aggregate?.fogMix ?? fogMixForCell(cell)) / divisor);
      waterRegime.push(waterRegimeForCell(cell));
      waterShoreFoam.push((aggregate?.shoreFoam ?? shoreFoamForCell(cell)) / divisor);
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
  readonly baseHeight: number;
  height: number;
};

type RiverPickSurface = Readonly<{
  cell: GenesisWaterCellV1;
  center: MutableRiverSurfaceNode;
  corners: readonly MutableRiverSurfaceNode[];
}>;

/**
 * Canonical selection remains the complete authoritative river hex even
 * though the visible channel is narrow. These CPU-only surfaces keep exact
 * full-cell ray identity without adding a render draw or hidden GPU mesh.
 */
function createRiverPickSurfaces(
  cells: readonly GenesisWaterCellV1[],
  hexSize: number,
  heightAtWorld: (world: HexWorldPosition) => number
) {
  const sharedCorners = new Map<string, MutableRiverSurfaceNode>();
  const plans = cells.map((cell): RiverPickSurface => {
    const centerWorld = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
    const baseHeight = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + WATER_Y_LIFT;
    const center = { world: centerWorld, baseHeight, height: baseHeight };
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize).map((world) => {
      const key = waterPointKey(world);
      const existing = sharedCorners.get(key);
      if (existing) {
        existing.height = Math.max(existing.height, baseHeight);
        return existing;
      }
      const node = { world, baseHeight, height: baseHeight };
      sharedCorners.set(key, node);
      return node;
    });
    return { cell, center, corners };
  });

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
            || terrainY + RIVER_TERRAIN_CLEARANCE - plan.center.baseHeight
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
  return new Map(plans.map((plan) => [plan.cell.cellKey, plan] as const));
}

type RiverGeometryArrays = {
  positions: number[];
  normals: number[];
  colors: number[];
  waterDepth: number[];
  waterBankBlend: number[];
  waterFogMix: number[];
  waterRegime: number[];
  waterShoreFoam: number[];
  waterFlowX: number[];
  waterFlowZ: number[];
  indices: number[];
};

function createRiverGeometryArrays(): RiverGeometryArrays {
  return {
    positions: [],
    normals: [],
    colors: [],
    waterDepth: [],
    waterBankBlend: [],
    waterFogMix: [],
    waterRegime: [],
    waterShoreFoam: [],
    waterFlowX: [],
    waterFlowZ: [],
    indices: []
  };
}

function appendRiverVertex(
  arrays: RiverGeometryArrays,
  node: Readonly<{
    world: HexWorldPosition;
    height: number;
    color: THREE.Color;
    depth: number;
    bankBlend: number;
    shoreFoam: number;
    flow: HexWorldPosition;
  }>
) {
  arrays.positions.push(node.world.x, node.height, node.world.z);
  arrays.normals.push(0, 1, 0);
  arrays.colors.push(node.color.r, node.color.g, node.color.b);
  arrays.waterDepth.push(node.depth);
  arrays.waterBankBlend.push(node.bankBlend);
  arrays.waterFogMix.push(0);
  arrays.waterRegime.push(1);
  arrays.waterShoreFoam.push(node.shoreFoam);
  arrays.waterFlowX.push(node.flow.x);
  arrays.waterFlowZ.push(node.flow.z);
}

function appendFullCellFallback(
  arrays: RiverGeometryArrays,
  cells: readonly GenesisWaterCellV1[],
  pickSurfaces: ReadonlyMap<string, RiverPickSurface>,
  cellsByKey: ReadonlyMap<string, GenesisWaterCellV1>
) {
  cells.forEach((cell) => {
    const surface = pickSurfaces.get(cell.cellKey);
    if (!surface) throw new Error('REALM_WATER_FALLBACK_SURFACE_MISSING');
    const color = regimeColor(cell);
    const flow = flowForCell(cell, cellsByKey);
    const base = arrays.positions.length / 3;
    [surface.center, ...surface.corners].forEach((node) => {
      appendRiverVertex(arrays, {
        world: node.world,
        height: node.height,
        color,
        depth: Math.min(1, cell.depthCells / 5),
        bankBlend: RIVER_BANK_BLEND,
        shoreFoam: 0.1,
        flow
      });
    });
    for (let corner = 0; corner < 6; corner += 1) {
      arrays.indices.push(base, base + ((corner + 1) % 6) + 1, base + corner + 1);
    }
  });
}

type MutableRiverChannelNode = {
  readonly world: HexWorldPosition;
  readonly baseHeight: number;
  readonly color: THREE.Color;
  readonly depth: number;
  readonly bankBlend: number;
  readonly shoreFoam: number;
  readonly flow: HexWorldPosition;
  height: number;
};

type RiverChannelBuildResult = Readonly<{
  segmentCount: number;
  localizedFoamVertexCount: number;
}>;

function normalizeWorldDirection(
  from: HexWorldPosition,
  to: HexWorldPosition
): HexWorldPosition | undefined {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  return length > 0.000_001 ? { x: x / length, z: z / length } : undefined;
}

function interpolateSection(
  first: RealmWaterChannelSection,
  second: RealmWaterChannelSection,
  progress: number
): RealmWaterChannelSection {
  return Object.freeze({
    world: Object.freeze({
      x: THREE.MathUtils.lerp(first.world.x, second.world.x, progress),
      z: THREE.MathUtils.lerp(first.world.z, second.world.z, progress)
    }),
    halfWidth: THREE.MathUtils.lerp(first.halfWidth, second.halfWidth, progress),
    cellKey: progress < 0.5 ? first.cellKey : second.cellKey,
    surfaceLevelMilli: THREE.MathUtils.lerp(
      first.surfaceLevelMilli,
      second.surfaceLevelMilli,
      progress
    ),
    foam: THREE.MathUtils.lerp(first.foam, second.foam, progress),
    kind: progress <= 0
      ? first.kind
      : progress >= 1
        ? second.kind
        : 'cell'
  });
}

function sampledChannelSections(
  sections: readonly RealmWaterChannelSection[],
  hexSize: number
) {
  const sampled: RealmWaterChannelSection[] = [];
  sections.slice(1).forEach((section, index) => {
    const previous = sections[index]!;
    const length = Math.hypot(
      section.world.x - previous.world.x,
      section.world.z - previous.world.z
    );
    const subdivisionCount = Math.max(
      1,
      Math.ceil(length / (RIVER_CHANNEL_LONGITUDINAL_STEP * hexSize))
    );
    if (index === 0) sampled.push(previous);
    for (let step = 1; step <= subdivisionCount; step += 1) {
      sampled.push(interpolateSection(previous, section, step / subdivisionCount));
    }
  });
  return sampled;
}

function appendChannelBody(
  arrays: RiverGeometryArrays,
  body: RealmWaterChannelBodyPlan,
  hexSize: number,
  heightAtWorld: (world: HexWorldPosition) => number
): RiverChannelBuildResult {
  const samples = sampledChannelSections(body.sections, hexSize);
  if (samples.length < 2) throw new Error('channel-has-no-segments');
  const crossSections: MutableRiverChannelNode[][] = [];
  const deepColor = new THREE.Color('#294f59');
  const bankColor = new THREE.Color('#456d6d');
  samples.forEach((sample, sampleIndex) => {
    const previous = samples[Math.max(0, sampleIndex - 1)]!;
    const next = samples[Math.min(samples.length - 1, sampleIndex + 1)]!;
    const incoming = normalizeWorldDirection(previous.world, sample.world);
    const outgoing = normalizeWorldDirection(sample.world, next.world);
    const primary = outgoing ?? incoming;
    if (!primary) throw new Error('channel-zero-length-tangent');
    let tangent = primary;
    if (incoming && outgoing) {
      const joinedLength = Math.hypot(
        incoming.x + outgoing.x,
        incoming.z + outgoing.z
      );
      if (joinedLength > 0.000_001) {
        tangent = {
          x: (incoming.x + outgoing.x) / joinedLength,
          z: (incoming.z + outgoing.z) / joinedLength
        };
      }
    }
    const normal = { x: -tangent.z, z: tangent.x };
    const referenceNormal = { x: -primary.z, z: primary.x };
    const miterDenominator = Math.max(
      0.72,
      Math.abs(normal.x * referenceNormal.x + normal.z * referenceNormal.z)
    );
    const miterHalfWidth = Math.min(
      sample.halfWidth * 1.34,
      sample.halfWidth / miterDenominator
    );
    const baseHeight = waterSurfaceLevelToWorldY(sample.surfaceLevelMilli) + WATER_Y_LIFT;
    const crossSection = RIVER_CHANNEL_LATERAL_STOPS.map((lateral) => {
      const bankBlend = Math.pow(Math.abs(lateral), 2.2);
      const world = Object.freeze({
        x: sample.world.x + normal.x * miterHalfWidth * lateral,
        z: sample.world.z + normal.z * miterHalfWidth * lateral
      });
      return {
        world,
        baseHeight,
        height: baseHeight,
        color: deepColor.clone().lerp(bankColor, bankBlend * 0.72),
        depth: THREE.MathUtils.clamp(0.46 + sample.halfWidth / hexSize * 0.62, 0, 1),
        bankBlend,
        shoreFoam: sample.foam * (0.16 + bankBlend * 0.84),
        flow: Object.freeze({ ...tangent })
      };
    });
    crossSections.push(crossSection);
  });

  const localIndices: number[] = [];
  for (let sectionIndex = 0; sectionIndex < crossSections.length - 1; sectionIndex += 1) {
    for (let lateralIndex = 0; lateralIndex < RIVER_CHANNEL_LATERAL_STOPS.length - 1; lateralIndex += 1) {
      const current = sectionIndex * RIVER_CHANNEL_LATERAL_STOPS.length + lateralIndex;
      const next = current + RIVER_CHANNEL_LATERAL_STOPS.length;
      localIndices.push(
        current, current + 1, next,
        current + 1, next + 1, next
      );
    }
  }
  for (let indexOffset = 0; indexOffset < localIndices.length; indexOffset += 3) {
    const first = crossSections[
      Math.floor(localIndices[indexOffset]! / RIVER_CHANNEL_LATERAL_STOPS.length)
    ]![
      localIndices[indexOffset]! % RIVER_CHANNEL_LATERAL_STOPS.length
    ]!;
    const second = crossSections[
      Math.floor(localIndices[indexOffset + 1]! / RIVER_CHANNEL_LATERAL_STOPS.length)
    ]![
      localIndices[indexOffset + 1]! % RIVER_CHANNEL_LATERAL_STOPS.length
    ]!;
    const third = crossSections[
      Math.floor(localIndices[indexOffset + 2]! / RIVER_CHANNEL_LATERAL_STOPS.length)
    ]![
      localIndices[indexOffset + 2]! % RIVER_CHANNEL_LATERAL_STOPS.length
    ]!;
    for (let firstStep = 0; firstStep <= 3; firstStep += 1) {
      for (let secondStep = 0; secondStep <= 3 - firstStep; secondStep += 1) {
        const firstWeight = firstStep / 3;
        const secondWeight = secondStep / 3;
        const thirdWeight = 1 - firstWeight - secondWeight;
        const world = {
          x: first.world.x * firstWeight
            + second.world.x * secondWeight
            + third.world.x * thirdWeight,
          z: first.world.z * firstWeight
            + second.world.z * secondWeight
            + third.world.z * thirdWeight
        };
        const terrainY = heightAtWorld(world);
        const baseHeight = first.baseHeight * firstWeight
          + second.baseHeight * secondWeight
          + third.baseHeight * thirdWeight;
        if (
          !Number.isFinite(terrainY)
          || terrainY + RIVER_TERRAIN_CLEARANCE - baseHeight
            > MAXIMUM_RIVER_SURFACE_CORRECTION
        ) throw new Error('channel-terrain-clearance');
        const surfaceY = first.height * firstWeight
          + second.height * secondWeight
          + third.height * thirdWeight;
        const correction = terrainY + RIVER_TERRAIN_CLEARANCE - surfaceY;
        if (correction <= 0) continue;
        first.height += correction;
        second.height += correction;
        third.height += correction;
      }
    }
  }

  const baseIndex = arrays.positions.length / 3;
  let localizedFoamVertexCount = 0;
  crossSections.flat().forEach((node) => {
    if (node.shoreFoam >= 0.2) localizedFoamVertexCount += 1;
    appendRiverVertex(arrays, node);
  });
  localIndices.forEach((index) => arrays.indices.push(baseIndex + index));
  return Object.freeze({
    segmentCount: crossSections.length - 1,
    localizedFoamVertexCount
  });
}

function riverSurfaceGeometry(
  cells: readonly GenesisWaterCellV1[],
  channelPlan: RealmWaterChannelPlan,
  hexSize: number,
  heightAtWorld: (world: HexWorldPosition) => number
) {
  const arrays = createRiverGeometryArrays();
  const cellsByKey = new Map(cells.map((cell) => [cell.cellKey, cell] as const));
  const pickSurfaces = createRiverPickSurfaces(cells, hexSize, heightAtWorld);
  const fallbackReasons: { bodyId: string; reason: string }[] = [];
  let channelBodyCount = 0;
  let fallbackCellCount = 0;
  let channelSegmentCount = 0;
  let localizedFoamVertexCount = 0;
  channelPlan.bodies.forEach((body) => {
    const bodyCells = body.cellKeys.map((cellKey) => cellsByKey.get(cellKey))
      .filter((cell): cell is GenesisWaterCellV1 => cell !== undefined);
    if (bodyCells.length !== body.cellKeys.length) {
      throw new Error('REALM_WATER_CHANNEL_IDENTITY_MISSING');
    }
    if (body.mode === 'channel') {
      const arrayLengths = Object.fromEntries(
        Object.entries(arrays).map(([key, values]) => [key, values.length])
      ) as Record<keyof RiverGeometryArrays, number>;
      try {
        const result = appendChannelBody(arrays, body, hexSize, heightAtWorld);
        channelBodyCount += 1;
        channelSegmentCount += result.segmentCount;
        localizedFoamVertexCount += result.localizedFoamVertexCount;
        return;
      } catch (error) {
        (Object.keys(arrays) as (keyof RiverGeometryArrays)[]).forEach((key) => {
          arrays[key].length = arrayLengths[key];
        });
        fallbackReasons.push({
          bodyId: body.bodyId,
          reason: error instanceof Error ? error.message : 'channel-build-failed'
        });
      }
    } else {
      fallbackReasons.push({
        bodyId: body.bodyId,
        reason: body.fallbackReason ?? 'channel-plan-failed'
      });
    }
    appendFullCellFallback(arrays, bodyCells, pickSurfaces, cellsByKey);
    fallbackCellCount += bodyCells.length;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrays.colors, 3));
  geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(arrays.waterDepth, 1));
  geometry.setAttribute('waterBankBlend', new THREE.Float32BufferAttribute(arrays.waterBankBlend, 1));
  geometry.setAttribute('waterFogMix', new THREE.Float32BufferAttribute(arrays.waterFogMix, 1));
  geometry.setAttribute('waterRegime', new THREE.Float32BufferAttribute(arrays.waterRegime, 1));
  geometry.setAttribute('waterShoreFoam', new THREE.Float32BufferAttribute(arrays.waterShoreFoam, 1));
  geometry.setAttribute('waterFlowX', new THREE.Float32BufferAttribute(arrays.waterFlowX, 1));
  geometry.setAttribute('waterFlowZ', new THREE.Float32BufferAttribute(arrays.waterFlowZ, 1));
  geometry.userData.realmWaterChannelPlan = channelPlan;
  geometry.userData.realmWaterVisibleBodyModes = channelPlan.bodies.map((body) => Object.freeze({
    bodyId: body.bodyId,
    mode: fallbackReasons.some((fallback) => fallback.bodyId === body.bodyId)
      ? 'full-cell-fallback'
      : 'channel'
  }));
  try {
    geometry.setIndex(arrays.indices);
    geometry.computeBoundingSphere();
    return Object.freeze({
      geometry,
      pickSurfaces,
      channelBodyCount,
      fallbackBodyCount: fallbackReasons.length,
      fallbackCellCount,
      channelSegmentCount,
      localizedFoamVertexCount,
      fallbackReasons: Object.freeze(fallbackReasons.map((fallback) => Object.freeze(fallback)))
    });
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
    if (
      cell.regime !== 'ocean'
      || hexDistance(cell, { q: 0, r: 0 }) !== GENESIS_WATER_OCEAN_RADIUS
    ) continue;
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize);
    for (let side = 0; side < 6; side += 1) {
      const direction = OUTER_EDGE_NEIGHBOR_DIRECTIONS[side]!;
      const neighborKey = `${cell.q + direction.q},${cell.r + direction.r}`;
      if (keys.has(neighborKey)) continue;
      const a = corners[side]!;
      const b = corners[(side + 1) % 6]!;
      const base = positions.length / 3;
      const surfaceY = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli);
      const bottomY = surfaceY - OUTER_SKIRT_DEPTH;
      // Close only the below-water edge of the canonical disc. The full-fog
      // ocean cells above this skirt already blend into the matching sky, so
      // raising geometry into the horizon would create a visible map wall.
      positions.push(
        a.x, surfaceY, a.z,
        b.x, surfaceY, b.z,
        b.x, bottomY, b.z,
        a.x, bottomY, a.z
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
  river: boolean,
  onShaderFallback: () => void
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
  const uniforms = { uWaterTime: { value: 0 } };
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
  const shaderContract = `warpkeep-water-world-space-r185-${river ? 'river' : 'ocean'}-v4`;
  let shaderFallback = false;
  material.onBeforeCompile = (shader) => {
    if (
      !shader.vertexShader.includes('#include <color_vertex>')
      || !shader.vertexShader.includes('#include <begin_vertex>')
      || !shader.vertexShader.includes('#include <beginnormal_vertex>')
      || !shader.fragmentShader.includes('#include <opaque_fragment>')
    ) {
      if (!shaderFallback) {
        shaderFallback = true;
        material.userData.waterWaveComponents = 0;
        material.userData.waterShaderFallbackReason = 'shader-contract-changed';
        material.userData.waterShaderFallbackPresentation = 'full-mesh-fog-color';
        onShaderFallback();
      }
      // Fail closed at the horizon if a future Three release changes the
      // reviewed shader-chunk contract. A constant, unlit fog-color program
      // keeps the affected mesh visually continuous with the Realm
      // background instead of exposing bright Water or a map-edge wall.
      const fallbackFogColor = new THREE.Color(
        REALM_SKY_FALLBACK_COLOR
      ).convertLinearToSRGB();
      shader.vertexShader = `void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
      shader.fragmentShader = `void main() {
  vec3 warpkeepWaterFogFallback = vec3(
    ${fallbackFogColor.r.toFixed(6)},
    ${fallbackFogColor.g.toFixed(6)},
    ${fallbackFogColor.b.toFixed(6)}
  );
  gl_FragColor = vec4(warpkeepWaterFogFallback, 1.0);
}`;
      return;
    }
    if (activeWaveComponents > 0) shader.uniforms.uWaterTime = uniforms.uWaterTime;
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
  vWarpkeepWaterWave = warpkeepWaterHeight(vWarpkeepWaterWorldXZ, waterRegime, vec2(waterFlowX, waterFlowZ))
    * (1.0 - clamp(waterFogMix, 0.0, 1.0));
  transformed.y += vWarpkeepWaterWave;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float warpkeepWaterEpsilon = 0.045;
  float warpkeepWaterWaveVisibility = 1.0 - clamp(waterFogMix, 0.0, 1.0);
  vec2 warpkeepWaterNormalWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
  float warpkeepWaterNormalHeight = warpkeepWaterHeight(warpkeepWaterNormalWorldXZ, waterRegime, vec2(waterFlowX, waterFlowZ));
  float warpkeepWaterDx = ((warpkeepWaterHeight(warpkeepWaterNormalWorldXZ + vec2(warpkeepWaterEpsilon, 0.0), waterRegime, vec2(waterFlowX, waterFlowZ)) - warpkeepWaterNormalHeight) / warpkeepWaterEpsilon) * warpkeepWaterWaveVisibility;
  float warpkeepWaterDz = ((warpkeepWaterHeight(warpkeepWaterNormalWorldXZ + vec2(0.0, warpkeepWaterEpsilon), waterRegime, vec2(waterFlowX, waterFlowZ)) - warpkeepWaterNormalHeight) / warpkeepWaterEpsilon) * warpkeepWaterWaveVisibility;
  objectNormal = normalize(vec3(-warpkeepWaterDx, 1.0, -warpkeepWaterDz));`);
    shader.fragmentShader = `varying float vWarpkeepWaterDepth;
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
        vec3 oceanDeepColor = vec3(0.055, 0.22, 0.34);
        vec3 oceanShallowColor = vec3(0.16, 0.48, 0.58);
        vec3 riverDeepColor = vec3(0.055, 0.19, 0.21);
        vec3 riverShallowColor = vec3(0.16, 0.35, 0.36);
        vec3 waterDeepColor = mix(oceanDeepColor, riverDeepColor, step(0.5, vWarpkeepWaterRegime));
        vec3 waterShallowColor = mix(oceanShallowColor, riverShallowColor, step(0.5, vWarpkeepWaterRegime));
        vec3 waterBodyColor = mix(waterShallowColor, waterDeepColor, clamp(vWarpkeepWaterDepth, 0.0, 1.0) * 0.78);
        float waterGlimmer = abs(vWarpkeepWaterWave) * (vWarpkeepWaterRegime > 0.5 ? 1.8 : 3.2);
        float waterCrest = smoothstep(0.012, 0.032, abs(vWarpkeepWaterWave));
        float waterFoamPattern = 0.58 + 0.42 * sin(dot(vWarpkeepWaterWorldXZ, vec2(3.7, 2.9)));
        float waterFoam = clamp(vWarpkeepWaterShoreFoam, 0.0, 1.0)
          * (0.055 + waterCrest * 0.26)
          * waterFoamPattern;
        float waterBankEdge = clamp(vWarpkeepWaterBankBlend, 0.0, 1.0);
        float bankSoftness = 1.0 - waterBankEdge * 0.2;
        outgoingLight = mix(outgoingLight, outgoingLight * waterBodyColor * 1.65, 0.42);
        outgoingLight += (waterBodyColor * waterFresnel + vec3(waterGlimmer)) * bankSoftness;
        outgoingLight = mix(outgoingLight, vec3(0.10, 0.20, 0.18), waterBankEdge * 0.12 * step(0.5, vWarpkeepWaterRegime));
        outgoingLight = mix(outgoingLight, vec3(0.93, 0.91, 0.82), waterFoam);
        #ifdef USE_FOG
          outgoingLight = mix(outgoingLight, fogColor, clamp(vWarpkeepWaterFogMix, 0.0, 1.0));
        #endif
        #include <opaque_fragment>`);
    material.userData.waterShaderContract = shaderContract;
  };
  material.customProgramCacheKey = () => (
    `${shaderContract}:${shaderFallback ? 'static-fallback' : 'custom'}`
  );
  material.userData.waterUniforms = uniforms;
  material.userData.waterWaveComponents = activeWaveComponents;
  material.userData.waterShaderContract = shaderContract;
  material.userData.waterShaderFallbackReason = null;
  material.userData.waterShaderFallbackPresentation = null;
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
  const channelPlan = createRealmWaterChannelPlan(options.cells, options.hexSize);
  const budget = REALM_WATER_RENDER_BUDGETS[options.quality.id];
  const group = new THREE.Group();
  group.name = 'genesis-canonical-water';
  let oceanGeometry: THREE.BufferGeometry | undefined;
  let lakeGeometry: THREE.BufferGeometry | undefined;
  let riverGeometryData: THREE.BufferGeometry | undefined;
  let riverSurfaceData: ReturnType<typeof riverSurfaceGeometry> | undefined;
  let skirtGeometry: THREE.BufferGeometry | undefined;
  let waterMaterial: THREE.MeshStandardMaterial | undefined;
  let lakeMaterial: THREE.MeshStandardMaterial | undefined;
  let riverMaterial: THREE.MeshStandardMaterial | undefined;
  let skirtMaterial: THREE.MeshBasicMaterial | undefined;
  let shaderFallbackCount = 0;
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
    riverSurfaceData = riverSurfaceGeometry(
      rivers,
      channelPlan,
      options.hexSize,
      options.heightAtWorld
    );
    riverGeometryData = riverSurfaceData.geometry;
    skirtGeometry = outerSkirtGeometry(ocean, options.hexSize);
    const recordShaderFallback = () => { shaderFallbackCount += 1; };
    waterMaterial = createWaterMaterial(
      options.quality,
      options.reducedMotion,
      false,
      recordShaderFallback
    );
    lakeMaterial = createWaterMaterial(
      options.quality,
      options.reducedMotion,
      false,
      recordShaderFallback
    );
    riverMaterial = createWaterMaterial(
      options.quality,
      options.reducedMotion,
      true,
      recordShaderFallback
    );
    riverMaterial.emissive.set('#143d41');
    riverMaterial.emissiveIntensity = 0.08;
    riverMaterial.roughness = 0.42;
    skirtMaterial = new THREE.MeshBasicMaterial({
      color: REALM_SKY_FALLBACK_COLOR,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
  } catch (error) {
    disposeResources();
    throw error;
  }
  if (!oceanGeometry || !lakeGeometry || !riverGeometryData || !riverSurfaceData || !skirtGeometry
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
  const riverPickSurfaces = riverSurfaceData.pickSurfaces;
  const pickHeightByCellKey = new Map<string, number>();
  ocean.forEach((cell) => {
    pickHeightByCellKey.set(
      cell.cellKey,
      waterSurfaceLevelToWorldY(cell.surfaceLevelMilli)
    );
  });
  const visiblePickHeights: number[] = [];
  ocean.forEach((cell) => {
    if (!visiblePickCellsByKey.has(cell.cellKey)) return;
    const height = pickHeightByCellKey.get(cell.cellKey);
    if (height !== undefined && Number.isFinite(height)) visiblePickHeights.push(height);
  });
  rivers.forEach((cell) => {
    if (!visiblePickCellsByKey.has(cell.cellKey)) return;
    const surface = riverPickSurfaces.get(cell.cellKey);
    if (!surface) return;
    for (const node of [surface.center, ...surface.corners]) {
      const height = node.height;
      if (Number.isFinite(height)) visiblePickHeights.push(height);
    }
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
  const analyticCandidateKeys = new Set<string>();
  const analyticSamplePoint = new THREE.Vector3();
  const analyticOceanHitPoint = new THREE.Vector3();
  const analyticRiverTriangleA = new THREE.Vector3();
  const analyticRiverTriangleB = new THREE.Vector3();
  const analyticRiverTriangleC = new THREE.Vector3();
  const analyticRiverHitPoint = new THREE.Vector3();
  const analyticRaycast = (raycaster: THREE.Raycaster) => {
    if (visiblePickCellsByKey.size === 0) return null;
    analyticCandidateKeys.clear();
    const heightSpan = maximumPickHeight - minimumPickHeight;
    // Three bounded height samples account for the shallow river elevation
    // range without raycasting thousands of rendered triangles on every hover.
    for (const fraction of [0, 0.5, 1]) {
      const sampleHeight = minimumPickHeight + heightSpan * fraction;
      const point = rayPointAtSurfaceY(raycaster.ray, sampleHeight, analyticSamplePoint);
      if (!point) continue;
      const nearestCoord = worldToNearestAxial({ x: point.x, z: point.z }, options.hexSize);
      hexDisc(nearestCoord, ANALYTIC_PICK_NEIGHBORHOOD_RADIUS).forEach((coord) => {
        analyticCandidateKeys.add(hexKey(coord));
      });
    }
    let nearest: RealmWaterCellHit | null = null;
    for (const cellKey of analyticCandidateKeys) {
      const cell = visiblePickCellsByKey.get(cellKey);
      if (!cell) continue;
      let distance: number | undefined;
      if (cell.regime === 'river') {
        const surface = riverPickSurfaces.get(cell.cellKey);
        if (!surface) continue;
        analyticRiverTriangleA.set(
          surface.center.world.x,
          surface.center.height,
          surface.center.world.z
        );
        for (let corner = 0; corner < RIVER_TRIANGLES_PER_CELL; corner += 1) {
          const firstCorner = surface.corners[(corner + 1) % 6]!;
          const secondCorner = surface.corners[corner]!;
          analyticRiverTriangleB.set(
            firstCorner.world.x,
            firstCorner.height,
            firstCorner.world.z
          );
          analyticRiverTriangleC.set(
            secondCorner.world.x,
            secondCorner.height,
            secondCorner.world.z
          );
          const point = raycaster.ray.intersectTriangle(
            analyticRiverTriangleA,
            analyticRiverTriangleB,
            analyticRiverTriangleC,
            true,
            analyticRiverHitPoint
          );
          if (!point) continue;
          const triangleDistance = raycaster.ray.origin.distanceTo(point);
          if (
            !Number.isFinite(triangleDistance)
            || triangleDistance < Math.max(0, raycaster.near)
            || triangleDistance > raycaster.far
          ) continue;
          if (distance === undefined || triangleDistance < distance) {
            distance = triangleDistance;
          }
        }
      } else if (cell.regime === 'ocean') {
        // Ocean cells remain planar, so their existing cheap analytic path is
        // exact and avoids broad mesh raycasting across the surrounding disc.
        const surfaceY = pickHeightByCellKey.get(cell.cellKey);
        if (surfaceY === undefined) continue;
        const point = rayPointAtSurfaceY(raycaster.ray, surfaceY, analyticOceanHitPoint);
        if (!point) continue;
        const center = axialToWorld(cell, options.hexSize);
        if (!pointInsidePointyHex({ x: point.x, z: point.z }, center, options.hexSize)) continue;
        distance = raycaster.ray.origin.distanceTo(point);
      }
      if (
        distance === undefined
        || !Number.isFinite(distance)
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
  const animatedMaterials = [waterMaterial, lakeMaterial, riverMaterial].map((material) => ({
    material,
    uniforms: material.userData.waterUniforms as { uWaterTime: { value: number } }
  }));
  const animationActive = () => animatedMaterials.some(({ material }) => (
    (material.userData.waterWaveComponents as number) > 0
  ));
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
  const fallbackBodyIds = new Set(
    riverSurfaceData.fallbackReasons.map((fallback) => fallback.bodyId)
  );
  const fullFogOceanCellCount = ocean.reduce(
    (count, cell) => count + Number(cell.fogBand === 'full'),
    0
  );
  const riverMouthConnectionCount = channelPlan.bodies.reduce(
    (count, body) => count + Number(
      body.mode === 'channel'
      && body.mouthConnectedToOcean
      && !fallbackBodyIds.has(body.bodyId)
    ),
    0
  );
  let cachedTelemetry: RealmWaterLayerTelemetry | undefined;
  let cachedAnimated = false;
  let cachedShaderFallbackCount = -1;
  const getTelemetry = (): RealmWaterLayerTelemetry => {
    const animated = animationActive();
    if (
      cachedTelemetry
      && cachedAnimated === animated
      && cachedShaderFallbackCount === shaderFallbackCount
    ) return cachedTelemetry;
    cachedAnimated = animated;
    cachedShaderFallbackCount = shaderFallbackCount;
    cachedTelemetry = Object.freeze({
      layoutVersion: options.cells === GENESIS_WATER_REVISION_ENABLED_CELLS_V1
        ? GENESIS_WATER_REVISION_VERSION
        : GENESIS_WATER_LAYOUT_VERSION,
      oceanCellCount: ocean.length,
      lakeCellCount: lakes.length,
      riverCellCount: rivers.length,
      triangleCount,
      drawCalls,
      animated,
      fullFogOceanCellCount,
      riverBodyCount: channelPlan.bodies.length,
      riverChannelBodyCount: riverSurfaceData.channelBodyCount,
      riverFallbackBodyCount: riverSurfaceData.fallbackBodyCount,
      riverFallbackCellCount: riverSurfaceData.fallbackCellCount,
      riverChannelSegmentCount: riverSurfaceData.channelSegmentCount,
      riverMouthConnectionCount,
      riverLocalizedFoamVertexCount: riverSurfaceData.localizedFoamVertexCount,
      shaderFallbackCount,
      riverFallbackReasons: riverSurfaceData.fallbackReasons
    });
    return cachedTelemetry;
  };
  return {
    group,
    updateEnvironment: (elapsedSeconds) => {
      if (
        disposed
        || !animationActive()
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
      animatedMaterials.forEach(({ material, uniforms }) => {
        if ((material.userData.waterWaveComponents as number) <= 0) return;
        uniforms.uWaterTime.value = phase.phaseSeconds;
      });
      return true;
    },
    isAnimationActive: () => animationActive(),
    getTelemetry,
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
