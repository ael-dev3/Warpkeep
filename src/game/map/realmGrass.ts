import {
  axialToWorld,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { deriveChannelSeed, seededUnitFloat } from './realmSeed';
import { sampleLowlandsColor, type TerrainRgb } from './terrainColor';
import { realmGrassPalette } from './realmGrassPalette';
import { pointyHexBoundaryDistance, terrainHeightAtWorld } from './terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  isPlacementClear,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from './terrainPlacements';
import type { RealmTerrainKind } from './realmTerrainSemantics';
import { sampleRealmGrassCoverage } from './realmGrassNoise';
import type { RealmNorthernSnowField } from './realmNorthernSnow';
import type { RealmVegetationField } from './realmVegetationField';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

export type RealmGrassQuality = 'high' | 'balanced' | 'reduced';
export type RealmGrassTerrainKind = RealmTerrainKind | 'apron';

export type RealmGrassBiomeProfile = Readonly<{
  kind: RealmGrassTerrainKind;
  highCandidateCount: number;
  completelyBareThreshold: number;
  retention: number;
  height: readonly number[];
  width: readonly number[];
  palette: readonly TerrainRgb[];
  slopeSoftLimit: number;
  slopeHardLimit: number;
  minimumSeparation: number;
}>;

const palette = (values: readonly string[]) => realmGrassPalette(values);

/**
 * The stable visual policy. Thresholds are intentionally ordered from lush
 * meadow fields through nearly bare stone; coverage is then further thinned by
 * a second world-space field and candidate-specific hash.
 */
export const REALM_GRASS_BIOME_PROFILES: Readonly<
  Record<RealmGrassTerrainKind, RealmGrassBiomeProfile>
> = Object.freeze({
  meadow: Object.freeze({
    kind: 'meadow', highCandidateCount: 34, completelyBareThreshold: 0.25, retention: 0.94,
    height: Object.freeze([0.11, 0.19]), width: Object.freeze([0.34, 0.52]),
    palette: palette(['#82985B', '#8CA062', '#91A46C', '#788E53']),
    slopeSoftLimit: 0.42, slopeHardLimit: 0.78, minimumSeparation: 0.07
  }),
  lowland: Object.freeze({
    kind: 'lowland', highCandidateCount: 30, completelyBareThreshold: 0.29, retention: 0.88,
    height: Object.freeze([0.10, 0.18]), width: Object.freeze([0.32, 0.50]),
    palette: palette(['#768B51', '#82965A', '#8B9C63', '#6C814B']),
    slopeSoftLimit: 0.42, slopeHardLimit: 0.78, minimumSeparation: 0.075
  }),
  forest: Object.freeze({
    kind: 'forest', highCandidateCount: 24, completelyBareThreshold: 0.33, retention: 0.82,
    height: Object.freeze([0.10, 0.17]), width: Object.freeze([0.30, 0.46]),
    palette: palette(['#627B4E', '#6B8454', '#748C5C', '#587345']),
    slopeSoftLimit: 0.40, slopeHardLimit: 0.74, minimumSeparation: 0.08
  }),
  heath: Object.freeze({
    kind: 'heath', highCandidateCount: 22, completelyBareThreshold: 0.39, retention: 0.80,
    height: Object.freeze([0.09, 0.16]), width: Object.freeze([0.28, 0.43]),
    palette: palette(['#7B8054', '#85895B', '#8A8E64']),
    slopeSoftLimit: 0.34, slopeHardLimit: 0.67, minimumSeparation: 0.085
  }),
  ridge: Object.freeze({
    kind: 'ridge', highCandidateCount: 6, completelyBareThreshold: 0.72, retention: 0.62,
    height: Object.freeze([0.08, 0.13]), width: Object.freeze([0.24, 0.34]),
    palette: palette(['#85815A', '#777A50']),
    slopeSoftLimit: 0.22, slopeHardLimit: 0.44, minimumSeparation: 0.10
  }),
  'ancient-stone': Object.freeze({
    kind: 'ancient-stone', highCandidateCount: 4, completelyBareThreshold: 0.86, retention: 0.54,
    height: Object.freeze([0.07, 0.11]), width: Object.freeze([0.22, 0.30]),
    palette: palette(['#7A7D60', '#6E7458']),
    slopeSoftLimit: 0.18, slopeHardLimit: 0.34, minimumSeparation: 0.12
  }),
  lake: Object.freeze({
    kind: 'lake', highCandidateCount: 0, completelyBareThreshold: 1, retention: 0,
    height: Object.freeze([0, 0]), width: Object.freeze([0, 0]), palette: palette([]),
    slopeSoftLimit: 0, slopeHardLimit: 0, minimumSeparation: 0
  }),
  apron: Object.freeze({
    kind: 'apron', highCandidateCount: 6, completelyBareThreshold: 0.52, retention: 0.56,
    height: Object.freeze([0.08, 0.13]), width: Object.freeze([0.24, 0.36]),
    palette: palette(['#6D8450', '#788E58']),
    slopeSoftLimit: 0.30, slopeHardLimit: 0.58, minimumSeparation: 0.11
  })
});

export const REALM_GRASS_QUALITY_MULTIPLIERS: Readonly<Record<RealmGrassQuality, number>> =
  Object.freeze({ high: 1, balanced: 0.62, reduced: 0.25 });

export type RealmGrassExclusion = Readonly<{
  id: string;
  world: HexWorldPosition;
  radius: number;
}>;

/**
 * Renderer-neutral spatial lookup for small presentation-only root clearances.
 * It is optional because pure callers can still pass a simple sorted list, but
 * a camera window can build it once rather than rescanning every semantic root
 * for every retained grass candidate.
 */
export type RealmGrassExclusionIndex = Readonly<{
  get: (world: HexWorldPosition) => readonly RealmGrassExclusion[];
  size: number;
}>;

export type RealmGrassCandidate = Readonly<{
  coord: HexCoord;
  candidateIndex: number;
  world: HexWorldPosition;
  rank: number;
}>;

export type RealmGrassPoint = Readonly<{
  coord: HexCoord;
  candidateIndex: number;
  terrainKind: RealmGrassTerrainKind;
  apron: boolean;
  world: HexWorldPosition;
  groundY: number;
  surfaceNormal: Readonly<{ x: number; y: number; z: number }>;
  yaw: number;
  height: number;
  width: number;
  tint: TerrainRgb;
  windPhase: number;
  stiffness: number;
  windScale: number;
  windShelter: number;
  snowCoverage: number;
  variant: number;
  rank: number;
}>;

export type RealmGrassCellData = Readonly<{
  key: string;
  coord: HexCoord;
  terrainKind: RealmGrassTerrainKind;
  apron: boolean;
  candidateCount: number;
  completelyBare: boolean;
  rejectedByStructure: number;
  rejectedByExclusion: number;
  rejectedBySlope: number;
  rejectedBySnow: number;
  retainedInSnowTransition: number;
  snowCoverage: number;
  points: readonly RealmGrassPoint[];
}>;

export type RealmGrassCellsData = Readonly<{
  cells: readonly RealmGrassCellData[];
  points: readonly RealmGrassPoint[];
  candidateCount: number;
  completelyBareCellCount: number;
  rejectedByStructure: number;
  rejectedByExclusion: number;
  rejectedBySlope: number;
  rejectedBySnow: number;
  retainedInSnowTransition: number;
}>;

export type RealmGrassGenerationInput = Readonly<{
  map: RealmTerrainMap;
  cells: readonly TerrainCell[];
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>;
  playableKeys: ReadonlySet<string>;
  playableRadius: number;
  renderRadius: number;
  quality: RealmGrassQuality;
  placements?: readonly TerrainStructurePlacement[];
  castleSlotKeys?: ReadonlySet<string>;
  exclusions?: readonly RealmGrassExclusion[];
  exclusionIndex?: RealmGrassExclusionIndex;
  hexSize?: number;
  densityMultiplier?: number;
  heightAtWorld?: (world: HexWorldPosition) => number;
  /** Shared renderer-only ecology field; omitted callers retain the v1 policy. */
  vegetationField?: RealmVegetationField;
  /** Shared immutable climate field; sampled only during existing cache generation. */
  northernSnow?: RealmNorthernSnowField;
  /** Narrow water/route/root mask shared with decorative tree infill. */
  isWorldExcluded?: (world: HexWorldPosition) => boolean;
  /** Present legacy scenic lake semantics as grass-covered land only. */
  visualizeLegacyLakes?: boolean;
  /** Defaults true for compatibility; the live scene suppresses occupied keeps only. */
  suppressCastleSlots?: boolean;
}>;

const GOLDEN_RATIO_CONJUGATE = 0.6180339887498948;
const SAFE_HEX_INTERIOR = 0.86;
const EMPTY_EXCLUSIONS: readonly RealmGrassExclusion[] = Object.freeze([]);
const EMPTY_CASTLE_SLOT_KEYS: ReadonlySet<string> = new Set();

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(first: number, second: number, amount: number) {
  return first + (second - first) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / Math.max(0.000_1, edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - normalized * 2);
}

function fract(value: number) {
  return value - Math.floor(value);
}

function stableCells(cells: readonly TerrainCell[]) {
  return [...cells].sort((left, right) => (
    left.coord.q - right.coord.q || left.coord.r - right.coord.r
  ));
}

export function normalizeRealmGrassExclusions(exclusions: readonly RealmGrassExclusion[]) {
  return Object.freeze([...exclusions]
    .filter((exclusion) => (
      typeof exclusion.id === 'string'
      &&
      Number.isFinite(exclusion.world.x)
      && Number.isFinite(exclusion.world.z)
      && Number.isFinite(exclusion.radius)
      && exclusion.radius >= 0
    ))
    .map((exclusion) => Object.freeze({
      id: exclusion.id,
      world: Object.freeze({ x: exclusion.world.x, z: exclusion.world.z }),
      radius: exclusion.radius
    }))
    .sort((left, right) => (
      left.world.x - right.world.x
      || left.world.z - right.world.z
      || left.radius - right.radius
      || left.id.localeCompare(right.id)
    )));
}

/**
 * Index generic exclusion circles into a small world-space grid. An exclusion
 * is stored in every intersecting bucket, so a candidate needs to inspect
 * only its own bucket while preserving exact circle semantics.
 */
export function createRealmGrassExclusionIndex(
  exclusions: readonly RealmGrassExclusion[],
  bucketSizeInput = 1
): RealmGrassExclusionIndex {
  const bucketSize = Number.isFinite(bucketSizeInput) && bucketSizeInput > 0
    ? bucketSizeInput
    : 1;
  const mutableBuckets = new Map<string, RealmGrassExclusion[]>();
  const normalized = normalizeRealmGrassExclusions(exclusions);
  normalized.forEach((exclusion) => {
    const minimumX = Math.floor((exclusion.world.x - exclusion.radius) / bucketSize);
    const maximumX = Math.floor((exclusion.world.x + exclusion.radius) / bucketSize);
    const minimumZ = Math.floor((exclusion.world.z - exclusion.radius) / bucketSize);
    const maximumZ = Math.floor((exclusion.world.z + exclusion.radius) / bucketSize);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let z = minimumZ; z <= maximumZ; z += 1) {
        const key = `${x},${z}`;
        const bucket = mutableBuckets.get(key);
        if (bucket) bucket.push(exclusion);
        else mutableBuckets.set(key, [exclusion]);
      }
    }
  });
  const empty: readonly RealmGrassExclusion[] = Object.freeze([]);
  const buckets = new Map<string, readonly RealmGrassExclusion[]>(
    [...mutableBuckets].map(([key, bucket]) => [key, Object.freeze(bucket)] as const)
  );
  return Object.freeze({
    get: (world) => {
      if (!Number.isFinite(world.x) || !Number.isFinite(world.z)) return empty;
      return buckets.get(
        `${Math.floor(world.x / bucketSize)},${Math.floor(world.z / bucketSize)}`
      ) ?? empty;
    },
    size: normalized.length
  });
}

export function realmGrassCandidateCount(
  profile: RealmGrassBiomeProfile,
  quality: RealmGrassQuality,
  densityMultiplier = REALM_GRASS_QUALITY_MULTIPLIERS[quality]
) {
  const multiplier = Number.isFinite(densityMultiplier)
    ? Math.max(0, densityMultiplier)
    : REALM_GRASS_QUALITY_MULTIPLIERS[quality];
  // High is the canonical candidate reservoir. Lower qualities and runtime
  // density plans may only take a prefix; they never generate a different
  // layout or exceed the authored high-water population.
  return Math.min(
    profile.highCandidateCount,
    Math.max(0, Math.round(profile.highCandidateCount * multiplier))
  );
}

export function resolveRealmGrassProfile(kind: RealmGrassTerrainKind) {
  return REALM_GRASS_BIOME_PROFILES[kind];
}

function candidateForCell(
  cell: TerrainCell,
  candidateIndex: number,
  canonicalCandidateCount: number,
  hexSize: number
): RealmGrassCandidate | null {
  const center = axialToWorld(cell.coord, hexSize);
  const cellRotation = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'realm-grass-cell-rotation-v1'))
    * Math.PI * 2;
  const sequence = fract((candidateIndex + 0.5) * GOLDEN_RATIO_CONJUGATE);
  const jitterAngle = seededUnitFloat(
    deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-candidate-jitter-angle-v1')
  ) * Math.PI * 2;
  const jitterRadius = seededUnitFloat(
    deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-candidate-jitter-radius-v1')
  ) * hexSize * 0.052;
  const radius = Math.sqrt(
    (candidateIndex + 0.5) / Math.max(1, canonicalCandidateCount)
  ) * hexSize * 0.81;
  const angle = sequence * Math.PI * 2 + cellRotation;
  const local = {
    x: Math.cos(angle) * radius + Math.cos(jitterAngle) * jitterRadius,
    z: Math.sin(angle) * radius + Math.sin(jitterAngle) * jitterRadius
  };
  if (pointyHexBoundaryDistance(local, hexSize) > SAFE_HEX_INTERIOR) return null;
  return Object.freeze({
    coord: Object.freeze({ q: cell.coord.q, r: cell.coord.r }),
    candidateIndex,
    world: Object.freeze({ x: center.x + local.x, z: center.z + local.z }),
    rank: deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-candidate-rank-v1') >>> 0
  });
}

function hasNearbyPoint(
  accepted: readonly RealmGrassPoint[],
  candidate: RealmGrassCandidate,
  minimumSeparation: number
) {
  const minimumSquared = minimumSeparation * minimumSeparation;
  return accepted.some((point) => {
    const dx = point.world.x - candidate.world.x;
    const dz = point.world.z - candidate.world.z;
    return dx * dx + dz * dz < minimumSquared;
  });
}

function isExcluded(world: HexWorldPosition, exclusions: readonly RealmGrassExclusion[]) {
  return exclusions.some((exclusion) => {
    const dx = world.x - exclusion.world.x;
    const dz = world.z - exclusion.world.z;
    return dx * dx + dz * dz < exclusion.radius * exclusion.radius;
  });
}

function mixColor(first: TerrainRgb, second: TerrainRgb, amount: number): TerrainRgb {
  const blend = clamp(amount, 0, 1);
  return Object.freeze({
    r: lerp(first.r, second.r, blend),
    g: lerp(first.g, second.g, blend),
    b: lerp(first.b, second.b, blend)
  });
}

export function estimateRealmGrassSlope(
  world: HexWorldPosition,
  sampleHeight: (world: HexWorldPosition) => number,
  hexSize = 1
) {
  return sampleRealmGrassSurfaceFrame(world, sampleHeight, hexSize).slope;
}

export function sampleRealmGrassSurfaceFrame(
  world: HexWorldPosition,
  sampleHeight: (world: HexWorldPosition) => number,
  hexSize = 1
) {
  const offset = Math.max(0.025, hexSize * 0.055);
  const xPositive = sampleHeight({ x: world.x + offset, z: world.z });
  const xNegative = sampleHeight({ x: world.x - offset, z: world.z });
  const zPositive = sampleHeight({ x: world.x, z: world.z + offset });
  const zNegative = sampleHeight({ x: world.x, z: world.z - offset });
  if (![xPositive, xNegative, zPositive, zNegative].every(Number.isFinite)) {
    return Object.freeze({
      slope: Infinity,
      normal: Object.freeze({ x: 0, y: 1, z: 0 })
    });
  }
  const gradientX = (xPositive - xNegative) / (offset * 2);
  const gradientZ = (zPositive - zNegative) / (offset * 2);
  const length = Math.hypot(gradientX, 1, gradientZ);
  return Object.freeze({
    slope: Math.hypot(gradientX, gradientZ),
    normal: Object.freeze({
      x: -gradientX / length,
      y: 1 / length,
      z: -gradientZ / length
    })
  });
}

function resolveTerrainKind(
  key: string,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  playableKeys: ReadonlySet<string>,
  visualizeLegacyLakes = false
): RealmGrassTerrainKind {
  if (!playableKeys.has(key)) return 'apron';
  const terrainKind = terrainKindsByKey.get(key) ?? 'lowland';
  return visualizeLegacyLakes && terrainKind === 'lake' ? 'lowland' : terrainKind;
}

export function generateRealmGrassCells(input: RealmGrassGenerationInput): RealmGrassCellsData {
  const hexSize = Number.isFinite(input.hexSize) && input.hexSize! > 0 ? input.hexSize! : 1;
  const placements = input.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const castleSlotKeys = input.castleSlotKeys ?? EMPTY_CASTLE_SLOT_KEYS;
  const exclusions = input.exclusionIndex
    ? EMPTY_EXCLUSIONS
    : normalizeRealmGrassExclusions(input.exclusions ?? EMPTY_EXCLUSIONS);
  const sampleHeight = input.heightAtWorld ?? ((world: HexWorldPosition) => terrainHeightAtWorld(
    input.map,
    world,
    hexSize,
    placements
  ));
  const cells: RealmGrassCellData[] = [];
  const points: RealmGrassPoint[] = [];
  let candidateCount = 0;
  let completelyBareCellCount = 0;
  let rejectedByStructure = 0;
  let rejectedByExclusion = 0;
  let rejectedBySlope = 0;
  let rejectedBySnow = 0;
  let retainedInSnowTransition = 0;

  stableCells(input.cells).forEach((cell) => {
    const key = hexKey(cell.coord);
    const apron = !input.playableKeys.has(key);
    const terrainKind = resolveTerrainKind(
      key,
      input.terrainKindsByKey,
      input.playableKeys,
      input.visualizeLegacyLakes === true
    );
    const profile = resolveRealmGrassProfile(terrainKind);
    const count = realmGrassCandidateCount(profile, input.quality, input.densityMultiplier);
    const center = axialToWorld(cell.coord, hexSize);
    const cellSnowCoverage = input.northernSnow?.coverageAtWorld(center) ?? 0;
    const coverage = sampleRealmGrassCoverage(input.map.worldSeed, center);
    const vegetation = input.vegetationField?.sampleCell(cell.coord);
    const cellRestHash = seededUnitFloat(
      deriveChannelSeed(cell.seed, 0, 0, 'realm-grass-cell-rest-v2')
    );
    const cellRestSignal = coverage.macro * 0.34
      + coverage.cluster * 0.46
      + cellRestHash * 0.20;
    const suppressCastleSlot = input.suppressCastleSlots !== false && castleSlotKeys.has(key);
    const ecologyDormant = vegetation !== undefined && vegetation.grassDensity <= 0.035;
    const baselineCompletelyBare = count === 0
      || suppressCastleSlot
      || ecologyDormant
      || cellRestSignal < profile.completelyBareThreshold;
    // A nearly complete field sample is the only snow condition that can
    // suppress candidate allocation for the whole cell. Transition cells
    // still evaluate the stable high-quality candidate reservoir.
    const snowGuaranteedBare = !baselineCompletelyBare
      && cellSnowCoverage >= 0.985;
    const completelyBare = baselineCompletelyBare || snowGuaranteedBare;
    const accepted: RealmGrassPoint[] = [];
    let localStructure = 0;
    let localExclusion = 0;
    let localSlope = 0;
    let localSnow = snowGuaranteedBare ? count : 0;
    let localSnowTransition = 0;
    candidateCount += count;

    if (!completelyBare) {
      const localPlacements = terrainPlacementsForCell(placements, cell.coord, hexSize, 0.03);
      for (let candidateIndex = 0; candidateIndex < count; candidateIndex += 1) {
        const candidate = candidateForCell(
          cell,
          candidateIndex,
          profile.highCandidateCount,
          hexSize
        );
        if (!candidate) continue;
        const micro = seededUnitFloat(
          deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-micro-coverage-v1')
        );
        const candidateVegetation = input.vegetationField?.sample(candidate.world);
        const candidateCoverage = sampleRealmGrassCoverage(
          input.map.worldSeed,
          candidate.world
        );
        const clusterSignal = candidateVegetation
          ? candidateCoverage.cluster * 0.58
            + candidateVegetation.meso * 0.27
            + candidateVegetation.macro * 0.15
          : candidateCoverage.cluster * 0.62
            + candidateCoverage.meso * 0.25
            + candidateCoverage.macro * 0.13;
        // A continuous secondary field creates actual rests between tufts.
        // The hard low tail is intentional: it leaves readable open soil
        // pockets rather than merely making every patch uniformly thinner.
        if (clusterSignal < 0.285) continue;
        const clusterRetention = smoothstep(0.29, 0.72, clusterSignal);
        const retainedByCoverage = candidateVegetation
          ? clamp(
            profile.retention
              * (0.22 + candidateVegetation.grassDensity * 0.70)
              * (0.16 + clusterRetention * 0.98),
            0,
            1
          )
          : profile.retention
            * (0.30 + candidateCoverage.macro * 0.70)
            * (0.16 + clusterRetention * 0.98);
        if (micro > retainedByCoverage) continue;
        if (hasNearbyPoint(accepted, candidate, profile.minimumSeparation)) continue;
        if (!isPlacementClear(localPlacements, candidate.world, hexSize, 0.03)) {
          localStructure += 1;
          continue;
        }
        const candidateExclusions = input.exclusionIndex?.get(candidate.world) ?? exclusions;
        if (isExcluded(candidate.world, candidateExclusions)) {
          localExclusion += 1;
          continue;
        }
        if (input.isWorldExcluded?.(candidate.world) === true) {
          localExclusion += 1;
          continue;
        }
        const snowCoverage = input.northernSnow?.coverageAtWorld(candidate.world) ?? 0;
        if (snowCoverage > 0) {
          const snowRetention = 1
            - smoothstep(0.14, 0.91, snowCoverage) * 0.955;
          const snowHash = seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-snow-retention-v1')
          );
          if (snowHash > snowRetention) {
            localSnow += 1;
            continue;
          }
        }
        const surfaceFrame = sampleRealmGrassSurfaceFrame(
          candidate.world,
          sampleHeight,
          hexSize
        );
        const slope = surfaceFrame.slope;
        if (slope >= profile.slopeHardLimit) {
          localSlope += 1;
          continue;
        }
        if (slope > profile.slopeSoftLimit) {
          const slopeRetention = (profile.slopeHardLimit - slope)
            / Math.max(0.001, profile.slopeHardLimit - profile.slopeSoftLimit);
          const slopeHash = seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-slope-thinning-v1')
          );
          if (slopeHash > slopeRetention) {
            localSlope += 1;
            continue;
          }
        }
        const heightMix = seededUnitFloat(
          deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-height-v1')
        );
        const widthMix = seededUnitFloat(
          deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-width-v1')
        );
        const paletteIndex = Math.min(
          profile.palette.length - 1,
          Math.floor(seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-palette-v1')
          ) * profile.palette.length)
        );
        const authoredTint = profile.palette[paletteIndex] ?? { r: 0.36, g: 0.48, b: 0.25 };
        const groundTint = sampleLowlandsColor(input.map.worldSeed, candidate.world, {
          cell,
          hexSize,
          playableRadius: input.playableRadius,
          renderRadius: input.renderRadius,
          terrainKind: terrainKind === 'apron' ? undefined : terrainKind,
          placements
        });
        // Phase follows smooth world-space fields; neighbouring tufts therefore
        // share gusts instead of each choosing an unrelated oscillator.
        const phase = (
          candidateCoverage.cluster * 0.72
          + candidateCoverage.meso * 0.28
        ) * Math.PI * 2;
        const stiffness = 0.78 + seededUnitFloat(
          deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-stiffness-v1')
        ) * 0.34;
        const terrainResponse = terrainKind === 'meadow' ? 1.08
          : terrainKind === 'forest' ? 0.82
            : terrainKind === 'ridge' || terrainKind === 'ancient-stone' ? 0.68
              : 1;
        const windShelter = clamp(
          (candidateVegetation?.forestNeighbourShare ?? (terrainKind === 'forest' ? 0.35 : 0))
            * 0.48,
          0,
          0.48
        );
        const groundY = sampleHeight(candidate.world);
        if (!Number.isFinite(groundY)) {
          localSlope += 1;
          continue;
        }
        accepted.push(Object.freeze({
          coord: Object.freeze({ q: cell.coord.q, r: cell.coord.r }),
          candidateIndex,
          terrainKind,
          apron,
          world: candidate.world,
          groundY,
          surfaceNormal: surfaceFrame.normal,
          yaw: seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-yaw-v1')
          ) * Math.PI * 2,
          height: lerp(profile.height[0], profile.height[1], heightMix)
            * (1 - smoothstep(0.10, 0.88, snowCoverage) * 0.36),
          width: lerp(profile.width[0], profile.width[1], widthMix),
          // Keep the renderer-linear authored palette dominant; terrain adds
          // only a restrained local response.
          tint: mixColor(
            mixColor(groundTint, authoredTint, 0.86),
            { r: 0.49, g: 0.52, b: 0.39 },
            smoothstep(0.10, 0.86, snowCoverage) * 0.66
          ),
          windPhase: phase,
          stiffness,
          windScale: terrainResponse
            * (1 - windShelter)
            * (1 - snowCoverage * 0.18)
            * (0.86 + seededUnitFloat(
              deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-wind-scale-v1')
            ) * 0.28),
          windShelter,
          snowCoverage,
          variant: Math.floor(seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-geometry-variant-v1')
          ) * 3),
          rank: candidate.rank
        }));
        if (snowCoverage >= 0.15 && snowCoverage < 0.88) {
          localSnowTransition += 1;
        }
      }
    }
    if (completelyBare) completelyBareCellCount += 1;
    rejectedByStructure += localStructure;
    rejectedByExclusion += localExclusion;
    rejectedBySlope += localSlope;
    rejectedBySnow += localSnow;
    retainedInSnowTransition += localSnowTransition;
    points.push(...accepted);
    cells.push(Object.freeze({
      key,
      coord: Object.freeze({ q: cell.coord.q, r: cell.coord.r }),
      terrainKind,
      apron,
      candidateCount: count,
      completelyBare,
      rejectedByStructure: localStructure,
      rejectedByExclusion: localExclusion,
      rejectedBySlope: localSlope,
      rejectedBySnow: localSnow,
      retainedInSnowTransition: localSnowTransition,
      snowCoverage: cellSnowCoverage,
      points: Object.freeze(accepted)
    }));
  });

  return Object.freeze({
    cells: Object.freeze(cells),
    points: Object.freeze(points),
    candidateCount,
    completelyBareCellCount,
    rejectedByStructure,
    rejectedByExclusion,
    rejectedBySlope,
    rejectedBySnow,
    retainedInSnowTransition
  });
}
