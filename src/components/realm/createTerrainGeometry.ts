import {
  axialToWorld,
  hexDistance,
  hexDisc,
  hexKey,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import {
  REALM_TERRAIN_KIND_PALETTE,
  sampleLowlandsColor,
  type TerrainRgb
} from '../../game/map/terrainColor';
import { terrainHeightForCell } from '../../game/map/terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  placementInfluenceAtWorld,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from '../../game/map/terrainPlacements';
import type { RealmNorthernSnowField } from '../../game/map/realmNorthernSnow';
import type { RealmTerrainMap } from '../../game/map/terrainTypes';
import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';
import type {
  RealmRiverBankPresentation
} from '../../game/map/realmRiverBankPresentation';

const SQRT_3 = Math.sqrt(3);
const CORNER_COUNT = 6;
export const DEFAULT_TERRAIN_SUBDIVISIONS = 8;
export { sampleLowlandsColor };

export type TerrainBounds = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}>;

/** Renderer-neutral indexed data used by the direct Three.js terrain surface. */
export type TerrainGeometryData = Readonly<{
  positions: Float32Array;
  colors: Float32Array;
  /**
   * Per-vertex slope, signed hollow/crest, vegetation and wetness cues used by
   * one bounded terrain material. These are presentation only.
   */
  materialCues: Float32Array;
  materialCueMetrics: TerrainMaterialCueMetrics;
  /** One optional renderer-only scalar; absent when the winter field is disabled. */
  snowCoverage?: Float32Array;
  snowCoverageMetrics: TerrainSnowCoverageMetrics;
  indices: Uint16Array | Uint32Array;
  bounds: TerrainBounds;
  /** Exact convex x/z perimeter of the rendered union of terrain hexes. */
  overviewHull: readonly HexWorldPosition[];
  vertexCount: number;
  triangleCount: number;
  degenerateTriangleCount: number;
  sharedVertexReuseCount: number;
  surfaceCellCount: number;
  highDetailCellCount: number;
  coarseCellCount: number;
  transitionEdgeCount: number;
  riverBankVertexCount: number;
  riverBankInfluenceMax: number;
  detailRadius: number;
  subdivisionsPerEdge: number;
  outerSubdivisionsPerEdge: 1;
}>;

export type TerrainMaterialCueMetrics = Readonly<{
  slopeMin: number;
  slopeMax: number;
  concavityMin: number;
  concavityMax: number;
  vegetationMin: number;
  vegetationMax: number;
  wetnessMin: number;
  wetnessMax: number;
}>;

export type TerrainSnowCoverageMetrics = Readonly<{
  minimum: number;
  maximum: number;
  mean: number;
  attributeBytes: number;
}>;

export type TerrainGeometryOptions = Readonly<{
  subdivisionsPerEdge?: number;
  /** Cells through this radius retain the established triangular lattice. */
  adaptiveDetailRadius?: number;
  playableRadius?: number;
  placements?: readonly TerrainStructurePlacement[];
  terrainKindsByKey?: ReadonlyMap<string, RealmTerrainKind>;
  /** Non-authoritative forest ecoregion tint for the existing terrain cell. */
  forestCanopyByKey?: ReadonlyMap<string, number>;
  /** Continuous presentation ecology retained when instance grass is hidden. */
  vegetationDensityByKey?: ReadonlyMap<string, number>;
  /** Renderer-only land treatment for legacy scenic lake cells. */
  visualizeLegacyLakesAsLand?: boolean;
  /** Full-cell river boundary field used only for adjacent-land presentation. */
  riverBankPresentation?: RealmRiverBankPresentation;
  /** Immutable renderer-only climate field; never changes terrain authority. */
  northernSnow?: RealmNorthernSnowField;
  /** Complete validated Water coordinates suppress the underlying land treatment. */
  snowExcludedCellKeys?: ReadonlySet<string>;
}>;

type MutableTerrainBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type ContinuousTerrainPresentation = Readonly<{
  terrainKind?: RealmTerrainKind;
  semanticColor?: TerrainRgb;
  semanticStrength: number;
  forestCanopy: number;
  vegetationDensity: number;
  wetness: number;
}>;

const EMPTY_CONTINUOUS_TERRAIN_PRESENTATION: ContinuousTerrainPresentation =
  Object.freeze({
    semanticStrength: 0,
    forestCanopy: 0,
    vegetationDensity: 0,
    wetness: 0
  });

export function pointyHexCorners(coord: HexCoord, hexSize: number): HexWorldPosition[] {
  const center = axialToWorld(coord, hexSize);
  const size = Math.max(0.001, Number.isFinite(hexSize) ? hexSize : 1);
  return Array.from({ length: CORNER_COUNT }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / CORNER_COUNT;
    return {
      x: center.x + Math.cos(angle) * size,
      z: center.z + Math.sin(angle) * size
    };
  });
}

function pointKey(point: HexWorldPosition) {
  const precision = 1_000_000;
  return `${Math.round(point.x * precision)},${Math.round(point.z * precision)}`;
}

function hullCross(
  origin: HexWorldPosition,
  first: HexWorldPosition,
  second: HexWorldPosition
) {
  return (first.x - origin.x) * (second.z - origin.z)
    - (first.z - origin.z) * (second.x - origin.x);
}

/**
 * Return the actual convex perimeter of the rendered hex union. A Realm disc
 * has small corner chamfers, so this is intentionally derived from cell
 * corners rather than approximated by either the terrain AABB or a regular
 * six-point center hull.
 */
export function createTerrainOverviewHull(
  map: RealmTerrainMap,
  hexSize: number
): readonly HexWorldPosition[] {
  const byKey = new Map<string, HexWorldPosition>();
  map.cells.forEach((cell) => {
    pointyHexCorners(cell.coord, hexSize).forEach((point) => {
      const key = pointKey(point);
      if (!byKey.has(key)) byKey.set(key, point);
    });
  });
  const points = [...byKey.values()].sort((left, right) => (
    left.x - right.x || left.z - right.z
  ));
  if (points.length <= 2) return Object.freeze(points.map((point) => Object.freeze({ ...point })));

  const lower: HexWorldPosition[] = [];
  points.forEach((point) => {
    while (
      lower.length >= 2
      && hullCross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 1e-9
    ) lower.pop();
    lower.push(point);
  });
  const upper: HexWorldPosition[] = [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    while (
      upper.length >= 2
      && hullCross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 1e-9
    ) upper.pop();
    upper.push(point);
  }
  return Object.freeze(
    [...lower.slice(0, -1), ...upper.slice(0, -1)]
      .map((point) => Object.freeze({ x: point.x, z: point.z }))
  );
}

function calculateTriangleArea(
  positions: readonly number[],
  first: number,
  second: number,
  third: number
) {
  const firstOffset = first * 3;
  const secondOffset = second * 3;
  const thirdOffset = third * 3;
  const abX = positions[secondOffset] - positions[firstOffset];
  const abY = positions[secondOffset + 1] - positions[firstOffset + 1];
  const abZ = positions[secondOffset + 2] - positions[firstOffset + 2];
  const acX = positions[thirdOffset] - positions[firstOffset];
  const acY = positions[thirdOffset + 1] - positions[firstOffset + 1];
  const acZ = positions[thirdOffset + 2] - positions[firstOffset + 2];
  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  return Math.hypot(crossX, crossY, crossZ) * 0.5;
}

function safeSubdivisionCount(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_TERRAIN_SUBDIVISIONS;
  return Math.min(16, Math.max(1, Math.trunc(value)));
}

function safeDetailRadius(value: number | undefined, renderRadius: number) {
  if (value === undefined) return renderRadius;
  if (!Number.isFinite(value)) return renderRadius;
  return Math.min(renderRadius, Math.max(0, Math.trunc(value)));
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp(
    (value - edge0) / Math.max(0.000_001, edge1 - edge0)
  );
  return progress * progress * (3 - progress * 2);
}

function applySnowCpuColor(
  colors: number[],
  vertexIndex: number,
  coverage: number,
  concavity: number,
  wetness: number
) {
  if (coverage <= 0) return;
  const offset = vertexIndex * 3;
  const hollow = Math.max(0, concavity);
  const pearl = { r: 0.76, g: 0.81, b: 0.86 };
  const blueGrey = { r: 0.58, g: 0.66, b: 0.75 };
  const depthMix = clamp(hollow * 0.42 + wetness * 0.10);
  const snow = {
    r: pearl.r + (blueGrey.r - pearl.r) * depthMix,
    g: pearl.g + (blueGrey.g - pearl.g) * depthMix,
    b: pearl.b + (blueGrey.b - pearl.b) * depthMix
  };
  // Preserve underlying soil, stone and vegetation anchors even at the rim.
  const amount = smoothstep(0.035, 0.93, coverage) * 0.91;
  colors[offset] = colors[offset]! + (snow.r - colors[offset]!) * amount;
  colors[offset + 1] = colors[offset + 1]!
    + (snow.g - colors[offset + 1]!) * amount;
  colors[offset + 2] = colors[offset + 2]!
    + (snow.b - colors[offset + 2]!) * amount;
}

function applyNorthernSnowPresentation(
  positions: readonly number[],
  colors: number[],
  materialCues: readonly number[],
  options: TerrainGeometryOptions,
  hexSize: number,
  placements: readonly TerrainStructurePlacement[]
) {
  const field = options.northernSnow;
  if (!field) return undefined;
  const vertexCount = positions.length / 3;
  const snowCoverage = new Float32Array(vertexCount);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let sum = 0;

  for (let index = 0; index < vertexCount; index += 1) {
    const world = {
      x: positions[index * 3]!,
      z: positions[index * 3 + 2]!
    };
    const nearest = worldToNearestAxial(world, hexSize);
    let placementInfluence = 0;
    terrainPlacementsForCell(placements, nearest, hexSize).forEach((placement) => {
      placementInfluence = Math.max(
        placementInfluence,
        placementInfluenceAtWorld(placement, world, hexSize)
      );
    });
    const excluded = options.snowExcludedCellKeys?.has(hexKey(nearest)) === true;
    const slope = materialCues[index * 4]!;
    const concavity = materialCues[index * 4 + 1]!;
    const wetness = materialCues[index * 4 + 3]!;
    const coverage = excluded
      ? 0
      : field.retainedCoverageAtWorld(world, {
        slope,
        concavity,
        placementInfluence
      });
    const safeCoverage = Number.isFinite(coverage) ? clamp(coverage) : 0;
    snowCoverage[index] = safeCoverage;
    minimum = Math.min(minimum, safeCoverage);
    maximum = Math.max(maximum, safeCoverage);
    sum += safeCoverage;
    applySnowCpuColor(colors, index, safeCoverage, concavity, wetness);
  }

  return Object.freeze({
    snowCoverage,
    metrics: Object.freeze({
      minimum: Number.isFinite(minimum) ? minimum : 0,
      maximum: Number.isFinite(maximum) ? maximum : 0,
      mean: vertexCount > 0 ? sum / vertexCount : 0,
      attributeBytes: snowCoverage.byteLength
    })
  });
}

function terrainWetness(kind: RealmTerrainKind) {
  if (kind === 'lake') return 1;
  if (kind === 'lowland') return 0.66;
  if (kind === 'forest') return 0.53;
  if (kind === 'meadow') return 0.34;
  if (kind === 'heath') return 0.22;
  return 0.08;
}

/**
 * Blend renderer-only semantic/ecology signals over nearby cell centres.
 * This removes hex-centre staining while preserving broad biome identity.
 * The canonical terrain map and its exact kind rows remain untouched.
 */
export function sampleContinuousTerrainPresentation(
  world: HexWorldPosition,
  hexSize: number,
  options: Pick<
    TerrainGeometryOptions,
    | 'terrainKindsByKey'
    | 'forestCanopyByKey'
    | 'vegetationDensityByKey'
    | 'visualizeLegacyLakesAsLand'
  >
): ContinuousTerrainPresentation {
  if (!options.terrainKindsByKey || options.terrainKindsByKey.size === 0) {
    return EMPTY_CONTINUOUS_TERRAIN_PRESENTATION;
  }
  const nearest = worldToNearestAxial(world, hexSize);
  let totalWeight = 0;
  let strengthTotal = 0;
  let forestCanopy = 0;
  let vegetationDensity = 0;
  let wetness = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  const kindWeights = new Map<RealmTerrainKind, number>();
  hexDisc(nearest, 2).forEach((coord) => {
    const key = hexKey(coord);
    const sourceKind = options.terrainKindsByKey?.get(key);
    if (!sourceKind) return;
    const kind = options.visualizeLegacyLakesAsLand && sourceKind === 'lake'
      ? 'lowland'
      : sourceKind;
    const center = axialToWorld(coord, hexSize);
    const distance = Math.hypot(world.x - center.x, world.z - center.z)
      / Math.max(0.001, hexSize);
    const radial = clamp((2.15 - distance) / 2.15);
    const weight = radial * radial * (3 - radial * 2);
    if (weight <= 0) return;
    const semantic = REALM_TERRAIN_KIND_PALETTE[kind];
    totalWeight += weight;
    strengthTotal += semantic.strength * weight;
    red += semantic.color.r * weight;
    green += semantic.color.g * weight;
    blue += semantic.color.b * weight;
    forestCanopy += clamp(options.forestCanopyByKey?.get(key) ?? 0) * weight;
    vegetationDensity += clamp(options.vegetationDensityByKey?.get(key) ?? 0) * weight;
    wetness += terrainWetness(kind) * weight;
    kindWeights.set(kind, (kindWeights.get(kind) ?? 0) + weight);
  });
  if (totalWeight <= 0) {
    return EMPTY_CONTINUOUS_TERRAIN_PRESENTATION;
  }
  const terrainKind = [...kindWeights].sort((left, right) => (
    right[1] - left[1] || left[0].localeCompare(right[0])
  ))[0]?.[0];
  return Object.freeze({
    terrainKind,
    semanticColor: Object.freeze({
      r: red / totalWeight,
      g: green / totalWeight,
      b: blue / totalWeight
    }),
    // Continuous overlapping semantics need less strength than isolated
    // centre-staining; clamp leaves the base Lowlands palette in control.
    semanticStrength: clamp(strengthTotal / totalWeight),
    forestCanopy: clamp(forestCanopy / totalWeight),
    vegetationDensity: clamp(vegetationDensity / totalWeight),
    wetness: clamp(wetness / totalWeight)
  });
}

/**
 * Derive shape cues from the exact indexed surface after tessellation.
 * Sampling the full height authority four extra times per vertex made the
 * radius-sixty envelope needlessly expensive on slower CI/mobile CPUs. The
 * mesh already contains the authoritative final heights, so accumulated face
 * normals and adjacent-height deltas are both faster and more truthful.
 */
export function applyTerrainMaterialShapeCues(
  positions: readonly number[],
  indices: readonly number[],
  materialCues: number[],
  metrics: {
    slopeMin: number;
    slopeMax: number;
    concavityMin: number;
    concavityMax: number;
  }
) {
  const vertexCount = positions.length / 3;
  const normalX = new Float64Array(vertexCount);
  const normalY = new Float64Array(vertexCount);
  const normalZ = new Float64Array(vertexCount);
  const heightDelta = new Float64Array(vertexCount);
  const neighbourCount = new Uint32Array(vertexCount);
  const addNeighbour = (from: number, to: number) => {
    heightDelta[from] += positions[to * 3 + 1]! - positions[from * 3 + 1]!;
    neighbourCount[from] += 1;
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    const first = indices[offset]!;
    const second = indices[offset + 1]!;
    const third = indices[offset + 2]!;
    const firstOffset = first * 3;
    const secondOffset = second * 3;
    const thirdOffset = third * 3;
    const firstSecondX = positions[secondOffset]! - positions[firstOffset]!;
    const firstSecondY = positions[secondOffset + 1]! - positions[firstOffset + 1]!;
    const firstSecondZ = positions[secondOffset + 2]! - positions[firstOffset + 2]!;
    const firstThirdX = positions[thirdOffset]! - positions[firstOffset]!;
    const firstThirdY = positions[thirdOffset + 1]! - positions[firstOffset + 1]!;
    const firstThirdZ = positions[thirdOffset + 2]! - positions[firstOffset + 2]!;
    const faceX = firstSecondY * firstThirdZ - firstSecondZ * firstThirdY;
    const faceY = firstSecondZ * firstThirdX - firstSecondX * firstThirdZ;
    const faceZ = firstSecondX * firstThirdY - firstSecondY * firstThirdX;
    normalX[first] += faceX;
    normalY[first] += faceY;
    normalZ[first] += faceZ;
    normalX[second] += faceX;
    normalY[second] += faceY;
    normalZ[second] += faceZ;
    normalX[third] += faceX;
    normalY[third] += faceY;
    normalZ[third] += faceZ;
    addNeighbour(first, second);
    addNeighbour(first, third);
    addNeighbour(second, first);
    addNeighbour(second, third);
    addNeighbour(third, first);
    addNeighbour(third, second);
  }
  for (let index = 0; index < vertexCount; index += 1) {
    const magnitude = Math.hypot(
      normalX[index]!,
      normalY[index]!,
      normalZ[index]!
    );
    const slope = magnitude > 0.000_001
      ? clamp(Math.hypot(normalX[index]!, normalZ[index]!) / magnitude * 2.8)
      : 0;
    const concavity = neighbourCount[index]! > 0
      ? clamp(heightDelta[index]! / neighbourCount[index]! * 18, -1, 1)
      : 0;
    materialCues[index * 4] = slope;
    materialCues[index * 4 + 1] = concavity;
    metrics.slopeMin = Math.min(metrics.slopeMin, slope);
    metrics.slopeMax = Math.max(metrics.slopeMax, slope);
    metrics.concavityMin = Math.min(metrics.concavityMin, concavity);
    metrics.concavityMax = Math.max(metrics.concavityMax, concavity);
  }
}

/** Neighbor across the outer edge of each pointy-hex radial wedge. */
const WEDGE_NEIGHBOR_DIRECTIONS: readonly HexCoord[] = Object.freeze([
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 0, r: 1 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: 0, r: -1 })
]);

function interpolateTriangle(
  center: HexWorldPosition,
  firstCorner: HexWorldPosition,
  secondCorner: HexWorldPosition,
  firstWeight: number,
  secondWeight: number
): HexWorldPosition {
  const centerWeight = 1 - firstWeight - secondWeight;
  return {
    x: center.x * centerWeight + firstCorner.x * firstWeight + secondCorner.x * secondWeight,
    z: center.z * centerWeight + firstCorner.z * firstWeight + secondCorner.z * secondWeight
  };
}

/**
 * Construct one tessellated indexed surface for every logical cell.
 *
 * Each logical hex remains a single gameplay cell. The founding district uses
 * its established triangular lattice; expansion cells use one triangle per
 * wedge. A coarse wedge touching that lattice fans across the same segmented
 * edge, avoiding a T-junction without globally multiplying outer topology.
 * Vertices are keyed in world space so every shared border resolves to one
 * indexed point and the existing boundary falloff stays height-continuous.
 */
export function createTerrainGeometryData(
  map: RealmTerrainMap,
  hexSize: number,
  subdivisionsOrOptions: number | TerrainGeometryOptions = DEFAULT_TERRAIN_SUBDIVISIONS
): TerrainGeometryData {
  const options = typeof subdivisionsOrOptions === 'number'
    ? { subdivisionsPerEdge: subdivisionsOrOptions }
    : subdivisionsOrOptions;
  const placements = options.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const subdivisions = safeSubdivisionCount(options.subdivisionsPerEdge ?? DEFAULT_TERRAIN_SUBDIVISIONS);
  const detailRadius = safeDetailRadius(options.adaptiveDetailRadius, map.radius);
  const mapCellKeys = new Set(map.cells.map((cell) => hexKey(cell.coord)));
  const positions: number[] = [];
  const colors: number[] = [];
  const materialCues: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<string, number>();
  let sharedVertexReuseCount = 0;
  let highDetailCellCount = 0;
  let coarseCellCount = 0;
  let transitionEdgeCount = 0;
  let riverBankVertexCount = 0;
  let riverBankInfluenceMax = 0;
  const materialCueMetrics = {
    slopeMin: Number.POSITIVE_INFINITY,
    slopeMax: Number.NEGATIVE_INFINITY,
    concavityMin: Number.POSITIVE_INFINITY,
    concavityMax: Number.NEGATIVE_INFINITY,
    vegetationMin: Number.POSITIVE_INFINITY,
    vegetationMax: Number.NEGATIVE_INFINITY,
    wetnessMin: Number.POSITIVE_INFINITY,
    wetnessMax: Number.NEGATIVE_INFINITY
  };
  const bounds: MutableTerrainBounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  };

  const addVertex = (
    key: string,
    world: HexWorldPosition,
    height: number,
    cell: RealmTerrainMap['cells'][number]
  ) => {
    const existing = vertices.get(key);
    if (existing !== undefined) {
      sharedVertexReuseCount += 1;
      return existing;
    }
    const presentation = sampleContinuousTerrainPresentation(
      world,
      hexSize,
      options
    );
    const riverBankInfluence = options.riverBankPresentation
      ?.bankInfluenceAtWorld(world) ?? 0;
    if (riverBankInfluence > 0) riverBankVertexCount += 1;
    riverBankInfluenceMax = Math.max(
      riverBankInfluenceMax,
      riverBankInfluence
    );
    const color = sampleLowlandsColor(map.worldSeed, world, {
      cell,
      hexSize,
      playableRadius: options.playableRadius ?? Math.max(0, map.radius - 1),
      renderRadius: map.radius,
      terrainKind: presentation.terrainKind,
      semanticColor: presentation.semanticColor,
      semanticStrength: presentation.semanticStrength,
      forestCanopy: presentation.forestCanopy,
      vegetationDensity: presentation.vegetationDensity,
      riverBankInfluence,
      visualizeLegacyLakeAsLand: options.visualizeLegacyLakesAsLand,
      placements
    });
    const wetness = Math.max(
      presentation.wetness,
      riverBankInfluence * 0.92
    );
    const index = positions.length / 3;
    vertices.set(key, index);
    positions.push(world.x, height, world.z);
    colors.push(color.r, color.g, color.b);
    materialCues.push(
      0,
      0,
      presentation.vegetationDensity,
      wetness
    );
    materialCueMetrics.vegetationMin = Math.min(
      materialCueMetrics.vegetationMin,
      presentation.vegetationDensity
    );
    materialCueMetrics.vegetationMax = Math.max(
      materialCueMetrics.vegetationMax,
      presentation.vegetationDensity
    );
    materialCueMetrics.wetnessMin = Math.min(
      materialCueMetrics.wetnessMin,
      wetness
    );
    materialCueMetrics.wetnessMax = Math.max(
      materialCueMetrics.wetnessMax,
      wetness
    );
    bounds.minX = Math.min(bounds.minX, world.x);
    bounds.maxX = Math.max(bounds.maxX, world.x);
    bounds.minY = Math.min(bounds.minY, height);
    bounds.maxY = Math.max(bounds.maxY, height);
    bounds.minZ = Math.min(bounds.minZ, world.z);
    bounds.maxZ = Math.max(bounds.maxZ, world.z);
    return index;
  };

  const addLatticeWedge = (
    cell: RealmTerrainMap['cells'][number],
    center: HexWorldPosition,
    corner: HexWorldPosition,
    nextCorner: HexWorldPosition,
    wedgeSubdivisions: number
  ) => {
    const rows: number[][] = [];
    for (let first = 0; first <= wedgeSubdivisions; first += 1) {
      rows[first] = [];
      for (let second = 0; second <= wedgeSubdivisions - first; second += 1) {
        const world = interpolateTriangle(
          center,
          nextCorner,
          corner,
          first / wedgeSubdivisions,
          second / wedgeSubdivisions
        );
        rows[first][second] = addVertex(
          `surface:${pointKey(world)}`,
          world,
          terrainHeightForCell(map.worldSeed, cell, world, hexSize, placements),
          cell
        );
      }
    }

    for (let first = 0; first < wedgeSubdivisions; first += 1) {
      for (let second = 0; second < wedgeSubdivisions - first; second += 1) {
        const origin = rows[first][second];
        const alongFirst = rows[first + 1][second];
        const alongSecond = rows[first][second + 1];
        // This x/z winding points normals upward along Three.js's +y axis.
        indices.push(origin, alongFirst, alongSecond);

        if (first + second < wedgeSubdivisions - 1) {
          const opposite = rows[first + 1][second + 1];
          indices.push(alongFirst, opposite, alongSecond);
        }
      }
    }
  };

  const addTransitionFan = (
    cell: RealmTerrainMap['cells'][number],
    center: HexWorldPosition,
    corner: HexWorldPosition,
    nextCorner: HexWorldPosition
  ) => {
    const centerIndex = addVertex(
      `surface:${pointKey(center)}`,
      center,
      terrainHeightForCell(map.worldSeed, cell, center, hexSize, placements),
      cell
    );
    const edge: number[] = [];
    for (let segment = 0; segment <= subdivisions; segment += 1) {
      // Match the established lattice's barycentric operation exactly so the
      // rounded world-space key resolves to one shared transition vertex.
      const world = interpolateTriangle(
        center,
        nextCorner,
        corner,
        (subdivisions - segment) / subdivisions,
        segment / subdivisions
      );
      edge.push(addVertex(
        `surface:${pointKey(world)}`,
        world,
        terrainHeightForCell(map.worldSeed, cell, world, hexSize, placements),
        cell
      ));
    }
    for (let segment = 0; segment < subdivisions; segment += 1) {
      indices.push(centerIndex, edge[segment], edge[segment + 1]);
    }
  };

  map.cells.forEach((cell) => {
    const center = axialToWorld(cell.coord, hexSize);
    const corners = pointyHexCorners(cell.coord, hexSize);
    const highDetail = hexDistance({ q: 0, r: 0 }, cell.coord) <= detailRadius;
    if (highDetail) highDetailCellCount += 1;
    else coarseCellCount += 1;

    corners.forEach((corner, cornerIndex) => {
      const nextCorner = corners[(cornerIndex + 1) % corners.length];
      if (highDetail) {
        addLatticeWedge(cell, center, corner, nextCorner, subdivisions);
        return;
      }

      const direction = WEDGE_NEIGHBOR_DIRECTIONS[cornerIndex]!;
      const neighbor = {
        q: cell.coord.q + direction.q,
        r: cell.coord.r + direction.r
      };
      const transition = mapCellKeys.has(hexKey(neighbor))
        && hexDistance({ q: 0, r: 0 }, neighbor) <= detailRadius;
      if (transition) {
        transitionEdgeCount += 1;
        addTransitionFan(cell, center, corner, nextCorner);
      } else {
        addLatticeWedge(cell, center, corner, nextCorner, 1);
      }
    });
  });

  let degenerateTriangleCount = 0;
  for (let index = 0; index < indices.length; index += 3) {
    if (calculateTriangleArea(positions, indices[index], indices[index + 1], indices[index + 2]) <= 1e-9) {
      degenerateTriangleCount += 1;
    }
  }
  applyTerrainMaterialShapeCues(
    positions,
    indices,
    materialCues,
    materialCueMetrics
  );
  const snowPresentation = applyNorthernSnowPresentation(
    positions,
    colors,
    materialCues,
    options,
    hexSize,
    placements
  );

  const vertexCount = positions.length / 3;
  const typedIndices = vertexCount <= 0xffff ? new Uint16Array(indices) : new Uint32Array(indices);
  const safeMetric = (value: number) => Number.isFinite(value) ? value : 0;
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    materialCues: new Float32Array(materialCues),
    materialCueMetrics: Object.freeze({
      slopeMin: safeMetric(materialCueMetrics.slopeMin),
      slopeMax: safeMetric(materialCueMetrics.slopeMax),
      concavityMin: safeMetric(materialCueMetrics.concavityMin),
      concavityMax: safeMetric(materialCueMetrics.concavityMax),
      vegetationMin: safeMetric(materialCueMetrics.vegetationMin),
      vegetationMax: safeMetric(materialCueMetrics.vegetationMax),
      wetnessMin: safeMetric(materialCueMetrics.wetnessMin),
      wetnessMax: safeMetric(materialCueMetrics.wetnessMax)
    }),
    snowCoverage: snowPresentation?.snowCoverage,
    snowCoverageMetrics: snowPresentation?.metrics ?? Object.freeze({
      minimum: 0,
      maximum: 0,
      mean: 0,
      attributeBytes: 0
    }),
    indices: typedIndices,
    bounds,
    overviewHull: createTerrainOverviewHull(map, hexSize),
    vertexCount,
    triangleCount: indices.length / 3,
    degenerateTriangleCount,
    sharedVertexReuseCount,
    surfaceCellCount: map.cells.length,
    highDetailCellCount,
    coarseCellCount,
    transitionEdgeCount,
    riverBankVertexCount,
    riverBankInfluenceMax,
    detailRadius,
    subdivisionsPerEdge: subdivisions,
    outerSubdivisionsPerEdge: 1
  };
}

export const POINTY_TOP_HEX_WIDTH = SQRT_3;
