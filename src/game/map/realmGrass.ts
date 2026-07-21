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
    kind: 'meadow', highCandidateCount: 34, completelyBareThreshold: 0.08, retention: 0.94,
    height: Object.freeze([0.11, 0.19]), width: Object.freeze([0.34, 0.52]),
    palette: palette(['#A8FF67', '#8EF04B', '#C0FF79', '#76DB39']),
    slopeSoftLimit: 0.42, slopeHardLimit: 0.78, minimumSeparation: 0.07
  }),
  lowland: Object.freeze({
    kind: 'lowland', highCandidateCount: 30, completelyBareThreshold: 0.14, retention: 0.88,
    height: Object.freeze([0.10, 0.18]), width: Object.freeze([0.32, 0.50]),
    palette: palette(['#8AF052', '#70DC3D', '#A2F966', '#62C934']),
    slopeSoftLimit: 0.42, slopeHardLimit: 0.78, minimumSeparation: 0.075
  }),
  forest: Object.freeze({
    kind: 'forest', highCandidateCount: 24, completelyBareThreshold: 0.22, retention: 0.82,
    height: Object.freeze([0.10, 0.17]), width: Object.freeze([0.30, 0.46]),
    palette: palette(['#69D849', '#55C43D', '#7BE457', '#48B635']),
    slopeSoftLimit: 0.40, slopeHardLimit: 0.74, minimumSeparation: 0.08
  }),
  heath: Object.freeze({
    kind: 'heath', highCandidateCount: 22, completelyBareThreshold: 0.28, retention: 0.80,
    height: Object.freeze([0.09, 0.16]), width: Object.freeze([0.28, 0.43]),
    palette: palette(['#7ED34A', '#67C33E', '#9BE05C']),
    slopeSoftLimit: 0.34, slopeHardLimit: 0.67, minimumSeparation: 0.085
  }),
  ridge: Object.freeze({
    kind: 'ridge', highCandidateCount: 6, completelyBareThreshold: 0.72, retention: 0.62,
    height: Object.freeze([0.08, 0.13]), width: Object.freeze([0.24, 0.34]),
    palette: palette(['#8EC85A', '#79B84D']),
    slopeSoftLimit: 0.22, slopeHardLimit: 0.44, minimumSeparation: 0.10
  }),
  'ancient-stone': Object.freeze({
    kind: 'ancient-stone', highCandidateCount: 4, completelyBareThreshold: 0.86, retention: 0.54,
    height: Object.freeze([0.07, 0.11]), width: Object.freeze([0.22, 0.30]),
    palette: palette(['#86B66A', '#6FA05C']),
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
    palette: palette(['#75D84B', '#65C93F']),
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
  terrainKind: RealmGrassTerrainKind;
  apron: boolean;
  world: HexWorldPosition;
  groundY: number;
  yaw: number;
  height: number;
  width: number;
  tint: TerrainRgb;
  windPhase: number;
  stiffness: number;
  windScale: number;
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
  return Math.max(0, Math.round(profile.highCandidateCount * multiplier));
}

export function resolveRealmGrassProfile(kind: RealmGrassTerrainKind) {
  return REALM_GRASS_BIOME_PROFILES[kind];
}

function candidateForCell(
  cell: TerrainCell,
  candidateIndex: number,
  candidateCount: number,
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
  const radius = Math.sqrt((candidateIndex + 0.5) / Math.max(1, candidateCount)) * hexSize * 0.81;
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
  const offset = Math.max(0.025, hexSize * 0.055);
  const xPositive = sampleHeight({ x: world.x + offset, z: world.z });
  const xNegative = sampleHeight({ x: world.x - offset, z: world.z });
  const zPositive = sampleHeight({ x: world.x, z: world.z + offset });
  const zNegative = sampleHeight({ x: world.x, z: world.z - offset });
  if (![xPositive, xNegative, zPositive, zNegative].every(Number.isFinite)) return Infinity;
  return Math.hypot(xPositive - xNegative, zPositive - zNegative) / (offset * 2);
}

function resolveTerrainKind(
  key: string,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  playableKeys: ReadonlySet<string>
): RealmGrassTerrainKind {
  if (!playableKeys.has(key)) return 'apron';
  return terrainKindsByKey.get(key) ?? 'lowland';
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

  stableCells(input.cells).forEach((cell) => {
    const key = hexKey(cell.coord);
    const apron = !input.playableKeys.has(key);
    const terrainKind = resolveTerrainKind(key, input.terrainKindsByKey, input.playableKeys);
    const profile = resolveRealmGrassProfile(terrainKind);
    const count = realmGrassCandidateCount(profile, input.quality, input.densityMultiplier);
    const center = axialToWorld(cell.coord, hexSize);
    const coverage = sampleRealmGrassCoverage(input.map.worldSeed, center);
    const completelyBare = count === 0
      || castleSlotKeys.has(key)
      || coverage.macro < profile.completelyBareThreshold;
    const accepted: RealmGrassPoint[] = [];
    let localStructure = 0;
    let localExclusion = 0;
    let localSlope = 0;
    candidateCount += count;

    if (!completelyBare) {
      const localPlacements = terrainPlacementsForCell(placements, cell.coord, hexSize, 0.03);
      for (let candidateIndex = 0; candidateIndex < count; candidateIndex += 1) {
        const candidate = candidateForCell(cell, candidateIndex, count, hexSize);
        if (!candidate) continue;
        const micro = seededUnitFloat(
          deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-micro-coverage-v1')
        );
        const retainedByCoverage = profile.retention
          * (0.35 + coverage.macro * 0.65)
          * (0.4 + coverage.meso * 0.6);
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
        const slope = estimateRealmGrassSlope(candidate.world, sampleHeight, hexSize);
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
        const phase = seededUnitFloat(
          deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-wind-phase-v1')
        ) * Math.PI * 2;
        const stiffness = 0.78 + seededUnitFloat(
          deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-stiffness-v1')
        ) * 0.34;
        const terrainResponse = terrainKind === 'meadow' ? 1.08
          : terrainKind === 'forest' ? 0.88
            : terrainKind === 'ridge' || terrainKind === 'ancient-stone' ? 0.68
              : 1;
        accepted.push(Object.freeze({
          coord: Object.freeze({ q: cell.coord.q, r: cell.coord.r }),
          terrainKind,
          apron,
          world: candidate.world,
          groundY: sampleHeight(candidate.world),
          yaw: seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-yaw-v1')
          ) * Math.PI * 2,
          height: lerp(profile.height[0], profile.height[1], heightMix),
          width: lerp(profile.width[0], profile.width[1], widthMix),
          // Keep authored sRGB palette colours dominant; terrain contributes
          // only a restrained local response so grass stays brighter below.
          tint: mixColor(groundTint, authoredTint, 0.86),
          windPhase: phase,
          stiffness,
          windScale: terrainResponse * (0.86 + seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-wind-scale-v1')
          ) * 0.28),
          variant: Math.floor(seededUnitFloat(
            deriveChannelSeed(cell.seed, candidateIndex, 0, 'realm-grass-geometry-variant-v1')
          ) * 3),
          rank: candidate.rank
        }));
      }
    }
    if (completelyBare) completelyBareCellCount += 1;
    rejectedByStructure += localStructure;
    rejectedByExclusion += localExclusion;
    rejectedBySlope += localSlope;
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
    rejectedBySlope
  });
}
