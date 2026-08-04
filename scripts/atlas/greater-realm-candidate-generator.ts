import { createHash, createHmac } from 'node:crypto';

import {
  GREATER_REALM_REQUIRED_CASTLE_SLOT_COUNT,
  GREATER_REALM_REQUIRED_GATE_COUNT,
  type GreaterRealmSanitizedCandidateSource,
} from './greater-realm-contracts';
import { rejectGreaterRealmCandidate } from './greater-realm-candidate-rejection';
import {
  GREATER_REALM_AXIAL_DIRECTIONS,
  accumulateGreaterRealmSingleFlow,
  createGreaterRealmMultiscaleIntegerField,
  digestGreaterRealmTerrainStage,
  erodeGreaterRealmThermally,
  greaterRealmCounterRandomU32,
  greaterRealmTerrainChannelId,
  indexGreaterRealmAxialGrid,
  priorityFloodGreaterRealmHexGrid,
  routeGreaterRealmSingleFlow,
  type AxialCoordinate,
  type GreaterRealmTerrainSeed,
  type GreaterRealmSingleFlowRouting,
  type IndexedAxialGrid,
  type IntegerTerrainArray,
} from './greater-realm-terrain';
import {
  GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
  assertGreaterRealmLegacyLowlandsPatchLocked,
  inverseGlobalToLegacyLowlands,
  transformLegacyLowlandsToGlobal,
  type LegacyLowlandsAtlasTransform,
} from './greater-realm-legacy-lowlands';
import {
  shapeGreaterRealmGeomorphology,
  type GreaterRealmGeomorphologyMetrics,
} from './greater-realm-geomorphology';
import {
  deriveGreaterRealmTopography,
} from './greater-realm-topography';
import {
  measureGreaterRealmNaturalComposition,
  type GreaterRealmNaturalCompositionMetrics,
} from './greater-realm-composition';

export const GREATER_REALM_GENERATOR_VERSION =
  'greater-realm-v2-natural-continent-pr-a.6' as const;
// Package/algorithm revisions must not silently reroll root-seed ordinals.
// Bump this namespace only for an explicitly approved deterministic world reroll.
export const GREATER_REALM_TERRAIN_SEED_NAMESPACE =
  'greater-realm-v2-natural-continent-pr-a.3' as const;
export const GREATER_REALM_PRIVATE_PACKAGE_MAGIC = 'WKGR-PRIVATE-ATLAS-V1' as const;
export const GREATER_REALM_PRIVATE_MANIFEST_KIND =
  'warpkeep.greater-realm.private-candidate.v1' as const;

const PRIVATE_CANVAS_RADIUS = 270;
const ACTIVE_DEEP_OCEAN_BUFFER_MINIMUM = 20;
const ACTIVE_DEEP_OCEAN_BUFFER_SPAN = 9;
const SEA_LEVEL = 0;
const REGION_COUNT = 10;
const TIER_I_REGION_COUNT = 6;
const TIER_II_REGION_COUNT = 3;
const TIER_III_REGION_INDEX = 9;
const HEX_NEIGHBOR_COUNT = 6;
const INT32_MAX = 0x7fff_ffff;
const WATER_DRY = 0;
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 3;
const WATER_STREAM = 4;
const WATER_SEA = 5;
// Calibrated against ordinary deterministic continents so the generated river
// network falls inside the reviewed 48–72 range without truncating valid
// watersheds after the fact. The flow authority remains continuous; this is
// only the classification threshold between a major river and a minor stream.
const MAJOR_RIVER_DISCHARGE = 144;

export const GREATER_REALM_REGION_SPECS = Object.freeze([
  Object.freeze({ id: 'T1_LOWLANDS', name: 'The Hegemony Lowlands', tier: 1 }),
  Object.freeze({ id: 'T1_FROSTMERE', name: 'Frostmere Reach', tier: 1 }),
  Object.freeze({ id: 'T1_SUNSCAR', name: 'Sunscar Expanse', tier: 1 }),
  Object.freeze({ id: 'T1_MIREFEN', name: 'Mirefen Delta', tier: 1 }),
  Object.freeze({ id: 'T1_STONEWAKE', name: 'Stonewake Isles', tier: 1 }),
  Object.freeze({ id: 'T1_EMBERWOOD', name: 'Emberwood March', tier: 1 }),
  Object.freeze({ id: 'T2_CROWNWOOD', name: 'Crownwood March', tier: 2 }),
  Object.freeze({ id: 'T2_IRONVEIL', name: 'Ironveil March', tier: 2 }),
  Object.freeze({ id: 'T2_GLASSWATER', name: 'Glasswater March', tier: 2 }),
  Object.freeze({ id: 'T3_THRONEHEART', name: 'Throneheart', tier: 3 }),
] as const);

const GREATER_REALM_PROVISIONAL_GATE_GRAPH = Object.freeze([
  Object.freeze([0, 6]),
  Object.freeze([1, 6]),
  Object.freeze([2, 7]),
  Object.freeze([3, 7]),
  Object.freeze([4, 8]),
  Object.freeze([5, 8]),
  Object.freeze([6, 9]),
  Object.freeze([7, 9]),
  Object.freeze([8, 9]),
] as const);

export type GreaterRealmGateGraphEdge = readonly [number, number];

export type GreaterRealmPseudoTectonicDomain = Readonly<{
  id: number;
  q: number;
  r: number;
  crustClass: 0 | 1 | 2;
  motionQ: number;
  motionR: number;
  buoyancy: number;
  resistance: number;
  volcanicPotential: number;
  age: number;
}>;

export type GreaterRealmPrivateGate = Readonly<{
  gateIndex: number;
  firstRegion: number;
  secondRegion: number;
  firstCell: number;
  secondCell: number;
  firstApproachPath: readonly number[];
  firstAlternateApproachPath: readonly number[];
  secondApproachPath: readonly number[];
  secondAlternateApproachPath: readonly number[];
}>;

export type GreaterRealmPrivateBarrierCrossSection = Readonly<{
  firstCell: number;
  secondCell: number;
  system: 1 | 2;
  firstSideCellCount: number;
  waterAssistedCellCount: number;
  cells: readonly number[];
}>;

export type GreaterRealmPrivateCandidate = Readonly<{
  candidateOrdinal: number;
  seedMaterial: Buffer;
  candidateSeed: Uint32Array;
  domains: readonly GreaterRealmPseudoTectonicDomain[];
  grid: IndexedAxialGrid;
  legacyLowlandsTransform: LegacyLowlandsAtlasTransform;
  legacyLowlandsCell: Uint8Array;
  legacyLowlandsProtectedCell: Uint8Array;
  legacyLowlandsReserveCell: Uint8Array;
  legacyLowlandsCastleSlot: Uint8Array;
  bedrockElevation: Int32Array;
  elevation: Int32Array;
  filledElevation: Int32Array;
  sedimentDepth: Uint16Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
  domainId: Uint8Array;
  geologyId: Uint8Array;
  tectonicUplift: Int32Array;
  rockResistance: Int32Array;
  geomorphologyElevation: Int32Array;
  geomorphologyTemperature: Int32Array;
  geomorphologyMoisture: Int32Array;
  geomorphologyTotalDelta: Int32Array;
  geomorphologyGlacialDelta: Int32Array;
  geomorphologyAridDelta: Int32Array;
  geomorphologyVolcanicDelta: Int32Array;
  geomorphologyCoastalDelta: Int32Array;
  geomorphologyGlacialMask: Uint8Array;
  geomorphologyAridMask: Uint8Array;
  geomorphologyVolcanicMask: Uint8Array;
  geomorphologyVolcanicAnchorMask: Uint8Array;
  geomorphologyCoastalMask: Uint8Array;
  geomorphologyCoastalClass: Uint8Array;
  regionId: Uint8Array;
  tierId: Uint8Array;
  waterRegime: Uint8Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  slope: Uint16Array;
  aspect: Uint8Array;
  profileCurvature: Int32Array;
  planCurvature: Int32Array;
  wetnessIndex: Uint16Array;
  exposure: Int32Array;
  distanceToCoast: Uint16Array;
  distanceToFreshwater: Uint16Array;
  watershedId: Int32Array;
  ridgeId: Int32Array;
  temperature: Int32Array;
  moisture: Int32Array;
  barrier: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  castleSlot: Uint8Array;
  resourcePotential: Uint8Array;
  corePotential: Uint8Array;
  throneAnchor: Uint8Array;
  tierOneSemanticPermutation: readonly number[];
  gateGraph: readonly GreaterRealmGateGraphEdge[];
  gates: readonly GreaterRealmPrivateGate[];
  barrierCrossSections: readonly GreaterRealmPrivateBarrierCrossSection[];
  stageDigests: Readonly<Record<string, string>>;
  aggregate: Omit<GreaterRealmSanitizedCandidateSource, 'candidateHandle' | 'performance'>;
  privateMetrics: Readonly<{
    activeBoundaryCells: number;
    maximumBoundaryRadiusShareBasisPoints: number;
    rotationalSimilarityBasisPoints: number;
    maximumAlignedBoundaryRun: number;
    minimumBoundaryLandDistance: number;
    saltwaterBoundaryBasisPoints: number;
    majorLandmassCount: number;
    largeIslandCount: number;
    smallIslandCount: number;
    mountainBarrierCells: number;
    measuredMinimumBarrierWidth: number;
    measuredMaximumBarrierWidth: number;
    gateRouteRedundancyProof: boolean;
    lakeBasinCandidates: number;
    riverMouthCandidates: number;
    streamHeadCandidates: number;
    resourcePotentialSites: number;
    corePotentialSites: number;
    chunkCount: number;
    chunkPopulationMinimum: number;
    chunkPopulationMedian: number;
    chunkPopulationP95: number;
    chunkPopulationMaximum: number;
    erodedMaterialUnits: number;
    depositedMaterialUnits: number;
    exportedSedimentUnits: number;
    minimumLargestPassableRegionShareBasisPoints: number;
    largestPassableRegionSharesBasisPoints: readonly number[];
    minorPassableFragmentSharesBasisPoints: readonly number[];
    passableBoundaryDensityBasisPoints: readonly number[];
    passableTendrilSharesBasisPoints: readonly number[];
    tierRadialAgreementBasisPoints: number;
    radialTierOneBoundaryShareBasisPoints: number;
    highlandBarrierShareBasisPoints: number;
    barrierMeanElevationAdvantage: number;
    barrierMeanUpliftAdvantage: number;
    naturalComposition: GreaterRealmNaturalCompositionMetrics;
    geomorphology: GreaterRealmGeomorphologyMetrics;
    throneAnchorBarrierClearance: number;
    tierThreePassableLandCells: number;
    smallestOtherRegionPassableLandCells: number;
    eligibilityFailureCodes: readonly string[];
  }>;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function assertRootSeed(rootSeed: Uint8Array): void {
  if (!(rootSeed instanceof Uint8Array) || rootSeed.byteLength !== 32) {
    fail('GREATER_REALM_ROOT_SEED_INVALID');
  }
}

function axialDistance(q: number, r: number, otherQ = 0, otherR = 0): number {
  const deltaQ = q - otherQ;
  const deltaR = r - otherR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(-deltaQ - deltaR));
}

function hexDot(q1: number, r1: number, q2: number, r2: number): number {
  return 2 * q1 * q2 + q1 * r2 + r1 * q2 + 2 * r1 * r2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function integerSquareRoot(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) fail('GREATER_REALM_INTEGER_SQRT_INVALID');
  if (value < 2) return value;
  let low = 1;
  let high = Math.min(value, 1 << 26);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const square = middle * middle;
    if (square === value) return middle;
    if (square < value) low = middle + 1;
    else high = middle - 1;
  }
  return high;
}

export function deriveGreaterRealmCandidateSeedMaterial(
  rootSeed: Uint8Array,
  candidateOrdinal: number,
): Buffer {
  assertRootSeed(rootSeed);
  if (!Number.isSafeInteger(candidateOrdinal) || candidateOrdinal < 0) {
    fail('GREATER_REALM_CANDIDATE_ORDINAL_INVALID');
  }
  return createHmac('sha256', rootSeed)
    .update(GREATER_REALM_TERRAIN_SEED_NAMESPACE, 'utf8')
    .update('\0candidate\0', 'utf8')
    .update(String(candidateOrdinal), 'utf8')
    .digest();
}

function deriveCandidateSeed(
  seedMaterial: Uint8Array,
): Uint32Array {
  const digest = createHash('sha256')
    .update('warpkeep-greater-realm-u32-v1\0', 'utf8')
    .update(seedMaterial)
    .digest();
  try {
    return new Uint32Array([
      digest.readUInt32LE(0),
      digest.readUInt32LE(4),
      digest.readUInt32LE(8),
      digest.readUInt32LE(12),
    ]);
  } finally {
    digest.fill(0);
  }
}

let sharedPrivateCanvas: IndexedAxialGrid | undefined;

function greaterRealmPrivateCanvasAuthority(): IndexedAxialGrid {
  if (sharedPrivateCanvas) return sharedPrivateCanvas;
  const coordinates: AxialCoordinate[] = [];
  for (let q = -PRIVATE_CANVAS_RADIUS; q <= PRIVATE_CANVAS_RADIUS; q += 1) {
    const minimumR = Math.max(-PRIVATE_CANVAS_RADIUS, -q - PRIVATE_CANVAS_RADIUS);
    const maximumR = Math.min(PRIVATE_CANVAS_RADIUS, -q + PRIVATE_CANVAS_RADIUS);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  sharedPrivateCanvas = indexGreaterRealmAxialGrid(coordinates);
  return sharedPrivateCanvas;
}

/** A defensive snapshot; callers can never mutate the generator's cached authority grid. */
export function greaterRealmPrivateCanvas(): IndexedAxialGrid {
  const canvas = greaterRealmPrivateCanvasAuthority();
  return Object.freeze({
    cellCount: canvas.cellCount,
    q: new Int32Array(canvas.q),
    r: new Int32Array(canvas.r),
    neighbors: new Int32Array(canvas.neighbors),
    indexOf: canvas.indexOf,
  });
}

function separatedDomains(
  candidateSeed: GreaterRealmTerrainSeed,
): readonly GreaterRealmPseudoTectonicDomain[] {
  const count = 7 + (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tectonic-domain-count'),
      0,
      0,
    ) % 6
  );
  const domains: GreaterRealmPseudoTectonicDomain[] = [];
  const positionChannel = greaterRealmTerrainChannelId('tectonic-domain-position');
  for (let ordinal = 0; ordinal < 4_096 && domains.length < count; ordinal += 1) {
    const qRandom = greaterRealmCounterRandomU32(candidateSeed, positionChannel, 0, 0, ordinal * 2);
    const rRandom = greaterRealmCounterRandomU32(candidateSeed, positionChannel, 0, 0, ordinal * 2 + 1);
    const q = (qRandom % 361) - 180;
    const minimumR = Math.max(-180, -q - 180);
    const maximumR = Math.min(180, -q + 180);
    const r = minimumR + (rRandom % (maximumR - minimumR + 1));
    if (domains.some(domain => axialDistance(q, r, domain.q, domain.r) < 46)) continue;
    const id = domains.length;
    const attribute = (sample: number) => greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tectonic-domain-attribute'),
      q,
      r,
      sample,
    );
    const motion = GREATER_REALM_AXIAL_DIRECTIONS[attribute(1) % 6]!;
    domains.push(Object.freeze({
      id,
      q,
      r,
      crustClass: (id === 0 ? 0 : attribute(0) % 3) as 0 | 1 | 2,
      motionQ: motion.q * (1 + (attribute(2) % 3)),
      motionR: motion.r * (1 + (attribute(3) % 3)),
      buoyancy: (attribute(4) % 5_001) - 2_000,
      resistance: 3_000 + (attribute(5) % 5_001),
      volcanicPotential: attribute(6) % 10_001,
      age: 1_000 + (attribute(7) % 9_001),
    }));
  }
  if (domains.length !== count) {
    rejectGreaterRealmCandidate('GREATER_REALM_TECTONIC_DOMAIN_PLACEMENT_FAILED');
  }
  return Object.freeze(domains);
}

function nearestDomains(
  grid: IndexedAxialGrid,
  domains: readonly GreaterRealmPseudoTectonicDomain[],
): Readonly<{
  domainId: Uint8Array;
  nearestDistance: Uint16Array;
  boundaryCloseness: Uint16Array;
}> {
  const domainId = new Uint8Array(grid.cellCount);
  const nearestDistance = new Uint16Array(grid.cellCount);
  const boundaryCloseness = new Uint16Array(grid.cellCount);
  for (let index = 0; index < grid.cellCount; index += 1) {
    let nearest = INT32_MAX;
    let second = INT32_MAX;
    let nearestId = 0;
    for (const domain of domains) {
      const distance = axialDistance(grid.q[index]!, grid.r[index]!, domain.q, domain.r);
      if (distance < nearest || (distance === nearest && domain.id < nearestId)) {
        second = nearest;
        nearest = distance;
        nearestId = domain.id;
      } else if (distance < second) {
        second = distance;
      }
    }
    domainId[index] = nearestId;
    nearestDistance[index] = nearest;
    boundaryCloseness[index] = clamp(96 - (second - nearest), 0, 96);
  }
  return Object.freeze({ domainId, nearestDistance, boundaryCloseness });
}

function macroGeology(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  domains: readonly GreaterRealmPseudoTectonicDomain[],
): Readonly<{
  bedrock: Int32Array;
  uplift: Int32Array;
  resistance: Int32Array;
  domainId: Uint8Array;
  geologyId: Uint8Array;
}> {
  const nearest = nearestDomains(grid, domains);
  const relief = createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
    { channel: 'relief-macro', amplitude: 7_200, smoothingPasses: 24, selfWeight: 3 },
    { channel: 'relief-meso', amplitude: 2_800, smoothingPasses: 7, selfWeight: 2 },
    { channel: 'relief-local', amplitude: 800, smoothingPasses: 1, selfWeight: 2 },
  ]);
  const bedrock = new Int32Array(grid.cellCount);
  const uplift = new Int32Array(grid.cellCount);
  const resistance = new Int32Array(grid.cellCount);
  const geologyId = new Uint8Array(grid.cellCount);
  const continentCenterChannel = greaterRealmTerrainChannelId('dominant-continent-center');
  const continentCenterQ = (
    greaterRealmCounterRandomU32(candidateSeed, continentCenterChannel, 0, 0, 0) % 45
  ) - 22;
  const continentCenterR = (
    greaterRealmCounterRandomU32(candidateSeed, continentCenterChannel, 0, 0, 1) % 45
  ) - 22;
  const islandChannel = greaterRealmTerrainChannelId('subduction-island-arcs');
  const islandArcCount = 3 + (
    greaterRealmCounterRandomU32(candidateSeed, islandChannel, 0, 0, 0) % 6
  );
  const islandAnchors: Array<Readonly<{ q: number; r: number }>> = [];
  const islandLobes: Array<Readonly<{ q: number; r: number; radius: number; peak: number }>> = [];
  for (let attempt = 0; attempt < 4_096 && islandAnchors.length < islandArcCount; attempt += 1) {
    const q = (greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      0,
      0,
      attempt * 2 + 1,
    ) % 421) - 210;
    const minimumR = Math.max(-210, -q - 210);
    const maximumR = Math.min(210, -q + 210);
    const r = minimumR + (greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      0,
      0,
      attempt * 2 + 2,
    ) % (maximumR - minimumR + 1));
    const radiusFromContinent = axialDistance(q, r, continentCenterQ, continentCenterR);
    // This materialized geological envelope includes mountain shoulders and
    // natural water/escarpment portions of the strategic barrier. The narrower
    // `barrier` mask below is the actually impassable crest/cut.
    if (
      radiusFromContinent < 200
      || radiusFromContinent > 220
      || islandAnchors.some(anchor => axialDistance(q, r, anchor.q, anchor.r) < 38)
    ) continue;
    const arc = islandAnchors.length;
    islandAnchors.push(Object.freeze({ q, r }));
    const direction = GREATER_REALM_AXIAL_DIRECTIONS[greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      q,
      r,
      8_000 + arc,
    ) % HEX_NEIGHBOR_COUNT]!;
    const lobeCount = 2 + (greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      q,
      r,
      9_000 + arc,
    ) % 3);
    for (let lobe = 0; lobe < lobeCount; lobe += 1) {
      const offset = (lobe * 5) - Math.floor(((lobeCount - 1) * 5) / 2);
      islandLobes.push(Object.freeze({
        q: q + direction.q * offset,
        r: r + direction.r * offset,
        radius: 11 + (greaterRealmCounterRandomU32(
          candidateSeed,
          islandChannel,
          q,
          r,
          10_000 + arc * 4 + lobe,
        ) % 5),
        peak: 42_000 + (greaterRealmCounterRandomU32(
          candidateSeed,
          islandChannel,
          q,
          r,
          20_000 + arc * 4 + lobe,
        ) % 10_001),
      }));
    }
  }
  if (islandAnchors.length !== islandArcCount) {
    rejectGreaterRealmCandidate('GREATER_REALM_ISLAND_ARC_PLACEMENT_FAILED');
  }
  for (let index = 0; index < grid.cellCount; index += 1) {
    const q = grid.q[index]!;
    const r = grid.r[index]!;
    const distanceFromCenter = axialDistance(q, r, continentCenterQ, continentCenterR);
    const domain = domains[nearest.domainId[index]!]!;
    const crustBias = domain.crustClass === 0 ? 2_500 : domain.crustClass === 1 ? -3_200 : -300;
    const boundary = nearest.boundaryCloseness[index]!;
    let interaction = 0;
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[index * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor < 0 || nearest.domainId[neighbor] === nearest.domainId[index]) continue;
      const other = domains[nearest.domainId[neighbor]!]!;
      const towardQ = other.q - domain.q;
      const towardR = other.r - domain.r;
      const relativeQ = domain.motionQ - other.motionQ;
      const relativeR = domain.motionR - other.motionR;
      interaction = Math.max(interaction, hexDot(relativeQ, relativeR, towardQ, towardR));
    }
    const convergent = clamp(Math.floor(interaction / 16), 0, 80);
    const divergent = clamp(Math.floor(-interaction / 20), 0, 60);
    const volcanic = Math.floor((domain.volcanicPotential * boundary) / 160);
    const upliftValue = boundary * (24 + convergent) + volcanic - divergent * 40;
    const continentalUplift = clamp(upliftValue, -12_000, 18_000);
    const edgeOcean = Math.max(0, distanceFromCenter - 188) * 480;
    const broadContinent = 8_800 - distanceFromCenter * 62;
    let islandArcUplift = 0;
    let islandArcTrench = 0;
    for (const lobe of islandLobes) {
      const distance = axialDistance(q, r, lobe.q, lobe.r);
      if (distance <= lobe.radius) {
        islandArcUplift = Math.max(
          islandArcUplift,
          Math.floor((lobe.peak * (lobe.radius - distance + 1)) / (lobe.radius + 1)),
        );
      } else if (distance <= lobe.radius + 4) {
        // A subduction trench keeps each coherent arc geologically separate
        // from the continental shelf and neighboring arcs. The taper is wide
        // enough to survive thermal relaxation without becoming a hard ring.
        islandArcTrench = Math.max(
          islandArcTrench,
          18_000 - (distance - lobe.radius - 1) * 3_000,
        );
      }
    }
    // Island arcs are themselves tectonic highlands. Record a bounded share
    // of their endogenic rise in the authoritative uplift field so later
    // ridge/barrier reasoning cannot mistake them for unexplained peaks.
    uplift[index] = clamp(
      continentalUplift + Math.floor(islandArcUplift / 4),
      -12_000,
      18_000,
    );
    bedrock[index] = clamp(
      broadContinent + crustBias + domain.buoyancy + relief[index]! + continentalUplift
        + islandArcUplift - (islandArcUplift > 0 ? 0 : islandArcTrench) - edgeOcean,
      -60_000,
      60_000,
    );
    resistance[index] = domain.resistance;
    geologyId[index] = (domain.id % 8) + 1;
  }
  return Object.freeze({
    bedrock,
    uplift,
    resistance,
    domainId: nearest.domainId,
    geologyId,
  });
}

function distanceFromMask(
  grid: IndexedAxialGrid,
  starts: Uint8Array,
): Uint16Array {
  if (starts.length !== grid.cellCount) fail('GREATER_REALM_DISTANCE_MASK_INVALID');
  const distance = new Uint16Array(grid.cellCount);
  distance.fill(0xffff);
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (starts[index] !== 1) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }
  if (tail === 0) fail('GREATER_REALM_DISTANCE_MASK_EMPTY');
  while (head < tail) {
    const cell = queue[head++]!;
    const nextDistance = distance[cell]! + 1;
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor < 0 || distance[neighbor]! <= nextDistance) continue;
      distance[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    }
  }
  return distance;
}

function activeMask(
  canvas: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  shapedElevation: Int32Array,
): Readonly<{
  mask: Uint8Array;
  distanceToLand: Uint16Array;
}> {
  const land = new Uint8Array(canvas.cellCount);
  let landCellCount = 0;
  for (let index = 0; index < canvas.cellCount; index += 1) {
    if (shapedElevation[index]! > SEA_LEVEL) {
      land[index] = 1;
      landCellCount += 1;
    }
  }
  if (landCellCount === 0) rejectGreaterRealmCandidate('GREATER_REALM_ACTIVE_MASK_EMPTY');
  const distanceToLand = distanceFromMask(canvas, land);
  const mask = new Uint8Array(canvas.cellCount);
  const boundaryChannel = greaterRealmTerrainChannelId('active-deep-ocean-boundary');
  for (let index = 0; index < canvas.cellCount; index += 1) {
    const variableBuffer = ACTIVE_DEEP_OCEAN_BUFFER_MINIMUM + (
      greaterRealmCounterRandomU32(
        candidateSeed,
        boundaryChannel,
        Math.floor(canvas.q[index]! / 9),
        Math.floor(canvas.r[index]! / 9),
      ) % ACTIVE_DEEP_OCEAN_BUFFER_SPAN
    );
    const canvasClearance = PRIVATE_CANVAS_RADIUS - axialDistance(canvas.q[index]!, canvas.r[index]!);
    if (distanceToLand[index]! <= variableBuffer && canvasClearance >= 8) mask[index] = 1;
  }
  const components = [...connectedComponents(canvas, mask)]
    .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
  if (components.length === 0) rejectGreaterRealmCandidate('GREATER_REALM_ACTIVE_MASK_EMPTY');
  mask.fill(0);
  for (const index of components[0]!) mask[index] = 1;
  const inactive = new Uint8Array(canvas.cellCount);
  for (let index = 0; index < canvas.cellCount; index += 1) {
    if (mask[index] === 0) inactive[index] = 1;
  }
  for (const component of connectedComponents(canvas, inactive)) {
    const reachesCanvasBoundary = component.some(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (canvas.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) return true;
      }
      return false;
    });
    if (!reachesCanvasBoundary) {
      for (const cell of component) mask[cell] = 1;
    }
  }
  return Object.freeze({ mask, distanceToLand });
}

function activeGridFromCanvas(
  canvas: IndexedAxialGrid,
  mask: Uint8Array,
): Readonly<{ grid: IndexedAxialGrid; sourceIndexes: Uint32Array }> {
  const coordinates: AxialCoordinate[] = [];
  const source: number[] = [];
  for (let index = 0; index < canvas.cellCount; index += 1) {
    if (mask[index] !== 1) continue;
    coordinates.push({ q: canvas.q[index]!, r: canvas.r[index]! });
    source.push(index);
  }
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const sourceByKey = new Map<string, number>();
  for (const index of source) sourceByKey.set(`${canvas.q[index]},${canvas.r[index]}`, index);
  const sourceIndexes = new Uint32Array(grid.cellCount);
  for (let index = 0; index < grid.cellCount; index += 1) {
    const sourceIndex = sourceByKey.get(`${grid.q[index]},${grid.r[index]}`);
    if (sourceIndex === undefined) fail('GREATER_REALM_ACTIVE_GRID_MAPPING_FAILED');
    sourceIndexes[index] = sourceIndex;
  }
  return Object.freeze({ grid, sourceIndexes });
}

function projectInt32(source: Int32Array, indexes: Uint32Array): Int32Array {
  const output = new Int32Array(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) output[index] = source[indexes[index]!]!;
  return output;
}

function projectUint8(source: Uint8Array, indexes: Uint32Array): Uint8Array {
  const output = new Uint8Array(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) output[index] = source[indexes[index]!]!;
  return output;
}

type GreaterRealmLegacyPlacement = Readonly<{
  transform: LegacyLowlandsAtlasTransform;
  worldCell: Uint8Array;
  protectedCell: Uint8Array;
  reserveCell: Uint8Array;
  castleSlot: Uint8Array;
  proof: boolean;
}>;

/**
 * Reserve one exact, reversible placement for the deployed Lowlands patch.
 * The protected mask is the union of all 10,000 canonical cells and the
 * current Water-v1 cells; the four-cell halo lets future PRs join new geology
 * to that immutable patch without cutting a tier barrier through it.
 */
function placeLegacyLowlands(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  existingElevation: Int32Array,
): GreaterRealmLegacyPlacement {
  assertGreaterRealmLegacyLowlandsPatchLocked();
  const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
  const protectedByKey = new Map<string, AxialCoordinate>();
  for (const tile of patch.world.tiles) protectedByKey.set(tile.key, tile);
  for (const waterCell of patch.water.cells) {
    protectedByKey.set(waterCell.cellKey, waterCell);
  }
  const protectedCoordinates = [...protectedByKey.values()];
  const boundary = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) {
        boundary[cell] = 1;
        break;
      }
    }
  }
  const clearance = distanceFromMask(grid, boundary);
  const targetChannel = greaterRealmTerrainChannelId('legacy-lowlands-placement-target');
  const targetQ = 148 + (
    greaterRealmCounterRandomU32(candidateSeed, targetChannel, 0, 0, 0) % 17
  ) - 8;
  const targetR = (
    greaterRealmCounterRandomU32(candidateSeed, targetChannel, 0, 0, 1) % 25
  ) - 12;
  const centers = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    .filter(cell => clearance[cell]! >= 70 && existingElevation[cell]! > SEA_LEVEL)
    .sort((first, second) => {
      const firstScore = axialDistance(grid.q[first]!, grid.r[first]!, targetQ, targetR) * 1_000
        - clamp(existingElevation[first]!, -12_000, 12_000) * 20
        + (greaterRealmCounterRandomU32(
          candidateSeed,
          targetChannel,
          grid.q[first]!,
          grid.r[first]!,
          2,
        ) % 1_000);
      const secondScore = axialDistance(grid.q[second]!, grid.r[second]!, targetQ, targetR) * 1_000
        - clamp(existingElevation[second]!, -12_000, 12_000) * 20
        + (greaterRealmCounterRandomU32(
          candidateSeed,
          targetChannel,
          grid.q[second]!,
          grid.r[second]!,
          2,
        ) % 1_000);
      return firstScore - secondScore || first - second;
    });
  if (centers.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_MISSING');
  }
  const firstRotation = greaterRealmCounterRandomU32(
    candidateSeed,
    targetChannel,
    0,
    0,
    3,
  ) % 6;
  for (const center of centers.slice(0, 1_024)) {
    for (let rotationOffset = 0; rotationOffset < 6; rotationOffset += 1) {
      const transform: LegacyLowlandsAtlasTransform = Object.freeze({
        rotationSteps: ((firstRotation + rotationOffset) % 6) as 0 | 1 | 2 | 3 | 4 | 5,
        globalOffsetQ: grid.q[center]!,
        globalOffsetR: grid.r[center]!,
      });
      const protectedCell = new Uint8Array(grid.cellCount);
      let placementValid = true;
      for (const localCoordinate of protectedCoordinates) {
        const globalCoordinate = transformLegacyLowlandsToGlobal(localCoordinate, transform);
        const globalIndex = grid.indexOf(globalCoordinate);
        if (globalIndex < 0 || protectedCell[globalIndex] === 1) {
          placementValid = false;
          break;
        }
        protectedCell[globalIndex] = 1;
      }
      if (!placementValid) continue;

      const worldCell = new Uint8Array(grid.cellCount);
      let mappedWorldCells = 0;
      let underlyingLandCells = 0;
      for (const tile of patch.world.tiles) {
        const globalCoordinate = transformLegacyLowlandsToGlobal(tile, transform);
        const globalIndex = grid.indexOf(globalCoordinate);
        if (globalIndex < 0 || worldCell[globalIndex] === 1) {
          placementValid = false;
          break;
        }
        const roundTrip = inverseGlobalToLegacyLowlands(globalCoordinate, transform);
        if (roundTrip.q !== tile.q || roundTrip.r !== tile.r) {
          placementValid = false;
          break;
        }
        worldCell[globalIndex] = 1;
        mappedWorldCells += 1;
        if (existingElevation[globalIndex]! > SEA_LEVEL) underlyingLandCells += 1;
      }
      if (
        !placementValid
        || mappedWorldCells !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount
        || underlyingLandCells * 100 < mappedWorldCells * 70
      ) {
        continue;
      }

      const castleSlot = new Uint8Array(grid.cellCount);
      let mappedCastleSlots = 0;
      for (const slot of patch.castleSlots.rows) {
        const globalIndex = grid.indexOf(transformLegacyLowlandsToGlobal(slot, transform));
        if (globalIndex < 0 || worldCell[globalIndex] !== 1 || castleSlot[globalIndex] === 1) {
          placementValid = false;
          break;
        }
        castleSlot[globalIndex] = 1;
        mappedCastleSlots += 1;
      }
      if (!placementValid || mappedCastleSlots !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount) {
        continue;
      }

      let reserveCell = new Uint8Array(protectedCell);
      for (let pass = 0; pass < 4; pass += 1) {
        const expanded = new Uint8Array(reserveCell);
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (reserveCell[cell] !== 1) continue;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0) expanded[neighbor] = 1;
          }
        }
        reserveCell = expanded;
      }
      return Object.freeze({
        transform,
        worldCell,
        protectedCell,
        reserveCell,
        castleSlot,
        proof: true,
      });
    }
  }
  rejectGreaterRealmCandidate('GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_FAILED');
}

function fluvialPass(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  resistance: Int32Array,
  protectedCell: Uint8Array,
): Readonly<{
  elevation: Int32Array;
  filledElevation: Int32Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
  sedimentDepth: Uint16Array;
  erodedMaterialUnits: number;
  depositedMaterialUnits: number;
  exportedSedimentUnits: number;
}> {
  if (
    elevation.length !== grid.cellCount
    || resistance.length !== grid.cellCount
    || protectedCell.length !== grid.cellCount
  ) fail('GREATER_REALM_FLUVIAL_INPUT_LENGTH_INVALID');
  const seaOutlets: number[] = [];
  const localContribution = new Uint32Array(grid.cellCount);
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (elevation[index]! <= SEA_LEVEL) seaOutlets.push(index);
    else localContribution[index] = 1;
  }
  if (seaOutlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_OCEAN_OUTLETS_MISSING');
  }
  const firstFlood = priorityFloodGreaterRealmHexGrid(grid, elevation, seaOutlets);
  const firstRouting = routeGreaterRealmSingleFlow(grid, firstFlood);
  const firstAccumulation = accumulateGreaterRealmSingleFlow(
    grid,
    firstFlood.filledElevation,
    firstRouting,
    localContribution,
  );
  const carved = new Int32Array(elevation);
  const sedimentFlux = new BigUint64Array(grid.cellCount);
  let erodedMaterial = 0n;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const receiver = firstRouting.receiver[cell]!;
    if (
      receiver < 0
      || elevation[cell]! <= SEA_LEVEL
      || protectedCell[cell] === 1
    ) continue;
    const slope = Math.max(0, firstFlood.filledElevation[cell]! - firstFlood.filledElevation[receiver]!);
    const discharge = Number(firstAccumulation[cell]!);
    const incision = clamp(
      Math.floor((integerSquareRoot(discharge) * Math.min(slope, 4_000) * 48) / resistance[cell]!),
      0,
      1_200,
    );
    carved[cell] = clamp(carved[cell]! - incision, -60_000, 60_000);
    sedimentFlux[cell] = BigInt(incision);
    erodedMaterial += BigInt(incision);
  }

  // Relax the incised land before routing sediment. Deposition therefore
  // belongs to the authoritative final fluvial surface instead of describing
  // a transient surface that a later thermal pass would move away.
  const relaxed = erodeGreaterRealmThermally(grid, carved, {
    iterations: 2,
    talus: 1_100,
    transferNumerator: 1,
    transferDenominator: 24,
  }).elevation;
  const postThermalOutlets: number[] = [];
  const postThermalContribution = new Uint32Array(grid.cellCount);
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (relaxed[index]! <= SEA_LEVEL) postThermalOutlets.push(index);
    else postThermalContribution[index] = 1;
  }
  if (postThermalOutlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_OCEAN_OUTLETS_MISSING');
  }
  const postThermalFlood = priorityFloodGreaterRealmHexGrid(
    grid,
    relaxed,
    postThermalOutlets,
  );
  const postThermalRouting = routeGreaterRealmSingleFlow(grid, postThermalFlood);
  const postThermalAccumulation = accumulateGreaterRealmSingleFlow(
    grid,
    postThermalFlood.filledElevation,
    postThermalRouting,
    postThermalContribution,
  );
  const depositedElevation = new Int32Array(relaxed);
  const sedimentDepth = new Uint16Array(grid.cellCount);
  let depositedMaterial = 0n;
  let exportedSediment = 0n;
  for (let orderIndex = grid.cellCount - 1; orderIndex >= 0; orderIndex -= 1) {
    const cell = postThermalRouting.order[orderIndex]!;
    const available = sedimentFlux[cell]!;
    if (available === 0n) continue;
    const receiver = postThermalRouting.receiver[cell]!;
    let deposited = 0;
    if (
      receiver >= 0
      && relaxed[cell]! > SEA_LEVEL
      && protectedCell[cell] !== 1
    ) {
      const slope = Math.max(
        0,
        postThermalFlood.filledElevation[cell]!
          - postThermalFlood.filledElevation[receiver]!,
      );
      const discharge = Number(postThermalAccumulation[cell]!);
      if (slope < 160 && discharge > 80) {
        deposited = Math.min(
          240,
          Number(available / 4n),
          Math.max(0, 60_000 - relaxed[cell]!),
        );
        sedimentDepth[cell] = deposited;
        depositedElevation[cell] += deposited;
        depositedMaterial += BigInt(deposited);
      }
    }
    const remaining = available - BigInt(deposited);
    if (receiver >= 0) sedimentFlux[receiver] = sedimentFlux[receiver]! + remaining;
    else exportedSediment += remaining;
  }
  if (erodedMaterial !== depositedMaterial + exportedSediment) {
    fail('GREATER_REALM_SEDIMENT_BUDGET_MISMATCH');
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      depositedElevation[cell] !== relaxed[cell]! + sedimentDepth[cell]!
      || (protectedCell[cell] === 1 && sedimentDepth[cell] !== 0)
    ) fail('GREATER_REALM_FINAL_SEDIMENT_SURFACE_MISMATCH');
  }
  const outlets: number[] = [];
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (depositedElevation[index]! <= SEA_LEVEL) outlets.push(index);
  }
  if (outlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_OCEAN_OUTLETS_MISSING');
  }
  const flood = priorityFloodGreaterRealmHexGrid(grid, depositedElevation, outlets);
  const routing = routeGreaterRealmSingleFlow(grid, flood);
  const accumulation = accumulateGreaterRealmSingleFlow(
    grid,
    flood.filledElevation,
    routing,
    postThermalContribution,
  );
  return Object.freeze({
    elevation: depositedElevation,
    filledElevation: flood.filledElevation,
    flowReceiver: routing.receiver,
    flowAccumulation: accumulation,
    sedimentDepth,
    erodedMaterialUnits: Number(erodedMaterial),
    depositedMaterialUnits: Number(depositedMaterial),
    exportedSedimentUnits: Number(exportedSediment),
  });
}

function reconcileLegacyLowlandsTopography(
  grid: IndexedAxialGrid,
  legacy: GreaterRealmLegacyPlacement,
  bedrockElevation: Int32Array,
  erodedElevation: Int32Array,
): Readonly<{
  bedrockElevation: Int32Array;
  elevation: Int32Array;
  filledElevation: Int32Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
}> {
  const adjustedBedrock = new Int32Array(bedrockElevation);
  const adjustedElevation = new Int32Array(erodedElevation);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacy.protectedCell[cell] !== 1) continue;
    adjustedBedrock[cell] = Math.max(200, adjustedBedrock[cell]!);
    adjustedElevation[cell] = Math.max(300, adjustedElevation[cell]!);
  }
  for (const waterCell of GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells) {
    const cell = grid.indexOf(transformLegacyLowlandsToGlobal(waterCell, legacy.transform));
    if (cell < 0 || legacy.protectedCell[cell] !== 1) {
      fail('GREATER_REALM_LEGACY_WATER_TOPOGRAPHY_MISSING');
    }
    const target = waterCell.regime === 'ocean' ? -600 : waterCell.regime === 'lake' ? -180 : -80;
    adjustedBedrock[cell] = Math.min(adjustedBedrock[cell]!, target - 80);
    adjustedElevation[cell] = Math.min(adjustedElevation[cell]!, target);
  }
  const outlets: number[] = [];
  const localContribution = new Uint32Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (adjustedElevation[cell]! <= SEA_LEVEL) outlets.push(cell);
    else localContribution[cell] = 1;
  }
  if (outlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_RECONCILED_OCEAN_OUTLETS_MISSING');
  }
  const flood = priorityFloodGreaterRealmHexGrid(grid, adjustedElevation, outlets);
  const generatedRouting = routeGreaterRealmSingleFlow(grid, flood);
  const receiver = new Int32Array(generatedRouting.receiver);
  const legacyWaterByKey = new Map(
    GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells.map(
      waterCell => [waterCell.cellKey, waterCell] as const,
    ),
  );
  // Priority-Flood correctly treats sea-level cells as outlets, but the
  // deployed twelve-river DAG is immutable authority. Restore those exact
  // downstream edges before accumulating the reconciled Greater Realm flow.
  for (const waterCell of GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells) {
    if (waterCell.regime !== 'river') continue;
    const cell = grid.indexOf(transformLegacyLowlandsToGlobal(waterCell, legacy.transform));
    if (cell < 0) fail('GREATER_REALM_LEGACY_RIVER_ROUTING_MISSING');
    if (waterCell.downstreamWaterCellKey === undefined) {
      receiver[cell] = -1;
      continue;
    }
    const downstreamWaterCell = legacyWaterByKey.get(waterCell.downstreamWaterCellKey);
    if (downstreamWaterCell?.regime !== 'river') {
      fail('GREATER_REALM_LEGACY_RIVER_ROUTING_MISSING');
    }
    const downstream = grid.indexOf(transformLegacyLowlandsToGlobal(
      downstreamWaterCell,
      legacy.transform,
    ));
    if (downstream < 0) fail('GREATER_REALM_LEGACY_RIVER_ROUTING_MISSING');
    receiver[cell] = downstream;
  }
  const routing = rebuildFlowRoutingFromReceivers(grid, receiver);
  const flowAccumulation = accumulateGreaterRealmSingleFlow(
    grid,
    flood.filledElevation,
    routing,
    localContribution,
  );
  return Object.freeze({
    bedrockElevation: adjustedBedrock,
    elevation: adjustedElevation,
    filledElevation: flood.filledElevation,
    flowReceiver: routing.receiver,
    flowAccumulation,
  });
}

function rebuildFlowRoutingFromReceivers(
  grid: IndexedAxialGrid,
  receiver: Int32Array,
): GreaterRealmSingleFlowRouting {
  if (receiver.length !== grid.cellCount) fail('GREATER_REALM_FLOW_INPUT_LENGTH_INVALID');
  const outlets = new Uint8Array(grid.cellCount);
  const order = new Uint32Array(grid.cellCount);
  const rank = new Uint32Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (receiver[cell] !== -1) continue;
    outlets[cell] = 1;
    queue[tail++] = cell;
  }
  let orderIndex = 0;
  while (head < tail) {
    const cell = queue[head++]!;
    order[orderIndex] = cell;
    rank[cell] = orderIndex;
    orderIndex += 1;
    const upstream: number[] = [];
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && receiver[neighbor] === cell) upstream.push(neighbor);
    }
    upstream.sort((first, second) => first - second);
    for (const upstreamCell of upstream) queue[tail++] = upstreamCell;
  }
  if (orderIndex !== grid.cellCount || tail !== grid.cellCount) {
    fail('GREATER_REALM_FLOW_CYCLE');
  }
  return Object.freeze({ receiver, order, rank, outlets });
}

type GreaterRealmStrategicFrontierEntry = Readonly<{
  cell: number;
  depth: number;
  priority: number;
}>;

function strategicFrontierLess(
  first: GreaterRealmStrategicFrontierEntry,
  second: GreaterRealmStrategicFrontierEntry,
): boolean {
  return first.priority < second.priority
    || (first.priority === second.priority && first.depth < second.depth)
    || (
      first.priority === second.priority
      && first.depth === second.depth
      && first.cell < second.cell
    );
}

function strategicFrontierPush(
  heap: GreaterRealmStrategicFrontierEntry[],
  entry: GreaterRealmStrategicFrontierEntry,
): void {
  let index = heap.length;
  heap.push(entry);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!strategicFrontierLess(entry, heap[parent]!)) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = entry;
}

function strategicFrontierPop(
  heap: GreaterRealmStrategicFrontierEntry[],
): GreaterRealmStrategicFrontierEntry | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child = right < heap.length && strategicFrontierLess(heap[right]!, heap[left]!)
      ? right
      : left;
    if (!strategicFrontierLess(heap[child]!, last)) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return first;
}

function growNaturalStrategicBasin(
  grid: IndexedAxialGrid,
  targetCount: number,
  seeds: readonly number[],
  blocked: Uint8Array,
  terrainCost: Int32Array,
  depthWeight: number,
  countedCell?: Uint8Array,
): Uint8Array {
  const selected = new Uint8Array(grid.cellCount);
  const bestPriority = new Int32Array(grid.cellCount);
  bestPriority.fill(0x7fff_ffff);
  const heap: GreaterRealmStrategicFrontierEntry[] = [];
  let selectedCount = 0;

  const offer = (cell: number, depth: number) => {
    if (cell < 0 || blocked[cell] === 1 || selected[cell] === 1) return;
    const priority = terrainCost[cell]! + depth * depthWeight;
    if (priority >= bestPriority[cell]!) return;
    bestPriority[cell] = priority;
    strategicFrontierPush(heap, Object.freeze({ cell, depth, priority }));
  };
  for (const seed of [...seeds].sort((first, second) => first - second)) {
    if (seed < 0 || blocked[seed] === 1 || selected[seed] === 1) continue;
    selected[seed] = 1;
    selectedCount += countedCell ? countedCell[seed]! : 1;
  }
  if (seeds.length === 0 || selectedCount > targetCount) {
    fail('GREATER_REALM_STRATEGIC_BASIN_SEED_INVALID');
  }
  for (const seed of seeds) {
    if (selected[seed] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      offer(grid.neighbors[seed * HEX_NEIGHBOR_COUNT + direction]!, 1);
    }
  }
  while (selectedCount < targetCount) {
    let entry = strategicFrontierPop(heap);
    if (!entry) {
      // Natural masks can contain islands separated by blocked water/reserve
      // bands. Restart from the cheapest remaining basin cell so construction
      // is total; coherence/island metrics decide whether the result is fit.
      let restart = -1;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (blocked[cell] === 1 || selected[cell] === 1) continue;
        if (
          restart < 0
          || terrainCost[cell]! < terrainCost[restart]!
          || (terrainCost[cell] === terrainCost[restart] && cell < restart)
        ) restart = cell;
      }
      if (restart < 0) {
        rejectGreaterRealmCandidate('GREATER_REALM_STRATEGIC_BASIN_CAPACITY_INVARIANT');
      }
      entry = Object.freeze({ cell: restart, depth: 0, priority: terrainCost[restart]! });
      bestPriority[restart] = entry.priority;
    }
    if (
      selected[entry.cell] === 1
      || bestPriority[entry.cell] !== entry.priority
    ) continue;
    selected[entry.cell] = 1;
    selectedCount += countedCell ? countedCell[entry.cell]! : 1;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      offer(
        grid.neighbors[entry.cell * HEX_NEIGHBOR_COUNT + direction]!,
        entry.depth + 1,
      );
    }
  }
  return selected;
}

function rebalanceCoherentStrategicGroups(
  grid: IndexedAxialGrid,
  cells: readonly number[],
  groupCount: number,
  costs: Int32Array,
  forcedGroup: Int8Array,
  initialAssignment: Uint8Array,
): Uint8Array {
  const assignment = new Uint8Array(initialAssignment);
  const ordinalByCell = new Int32Array(grid.cellCount);
  ordinalByCell.fill(-1);
  const counts = new Uint32Array(groupCount);
  const targets = new Uint32Array(groupCount);
  for (let group = 0; group < groupCount; group += 1) {
    targets[group] = Math.floor(cells.length / groupCount)
      + (group < cells.length % groupCount ? 1 : 0);
  }
  for (let ordinal = 0; ordinal < cells.length; ordinal += 1) {
    const cell = cells[ordinal]!;
    ordinalByCell[cell] = ordinal;
    counts[assignment[cell]!] += 1;
  }

  type Transfer = Readonly<{
    cell: number;
    from: number;
    to: number;
    priority: number;
  }>;
  const heap: Transfer[] = [];
  const less = (first: Transfer, second: Transfer) => first.priority < second.priority
    || (first.priority === second.priority && first.cell < second.cell)
    || (first.priority === second.priority && first.cell === second.cell && first.to < second.to);
  const push = (entry: Transfer) => {
    let index = heap.length;
    heap.push(entry);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!less(entry, heap[parent]!)) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = entry;
  };
  const pop = (): Transfer | undefined => {
    if (heap.length === 0) return undefined;
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child = right < heap.length && less(heap[right]!, heap[left]!) ? right : left;
      if (!less(heap[child]!, last)) break;
      heap[index] = heap[child]!;
      index = child;
    }
    heap[index] = last;
    return first;
  };
  const offer = (cell: number, to: number) => {
    const ordinal = ordinalByCell[cell]!;
    if (ordinal < 0 || forcedGroup[cell]! >= 0) return;
    const from = assignment[cell]!;
    if (from === to || counts[from]! <= targets[from]! || counts[to]! >= targets[to]!) return;
    let adjacentToTarget = 0;
    let adjacentToSource = 0;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0) continue;
      if (assignment[neighbor] === to) adjacentToTarget += 1;
      else if (assignment[neighbor] === from) adjacentToSource += 1;
    }
    if (adjacentToTarget === 0) return;
    const delta = costs[ordinal * groupCount + to]! - costs[ordinal * groupCount + from]!;
    // Peel coherent boundary bands instead of teleporting isolated cells. The
    // terrain cost keeps those bands attached to the same natural basin field.
    const priority = delta + adjacentToSource * 360 - adjacentToTarget * 520;
    push(Object.freeze({ cell, from, to, priority }));
  };
  for (const cell of cells) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && ordinalByCell[neighbor]! >= 0) offer(cell, assignment[neighbor]!);
    }
  }
  let remaining = [...counts].reduce(
    (total, count, group) => total + Math.max(0, count - targets[group]!),
    0,
  );
  while (remaining > 0) {
    let transfer = pop();
    if (!transfer) {
      // A sea channel can disconnect two otherwise valid continental basins.
      // Rebalance the best whole-envelope cell deterministically instead of
      // aborting the candidate; later land-coherence gates reject a bad island
      // allocation, while water-envelope quotas remain total and reproducible.
      let fallback: Transfer | undefined;
      for (const cell of cells) {
        const ordinal = ordinalByCell[cell]!;
        const from = assignment[cell]!;
        if (forcedGroup[cell]! >= 0 || counts[from]! <= targets[from]!) continue;
        for (let to = 0; to < groupCount; to += 1) {
          if (counts[to]! >= targets[to]!) continue;
          const priority = costs[ordinal * groupCount + to]!
            - costs[ordinal * groupCount + from]!;
          const candidate = Object.freeze({ cell, from, to, priority });
          if (!fallback || less(candidate, fallback)) fallback = candidate;
        }
      }
      if (!fallback) fail('GREATER_REALM_STRATEGIC_GROUP_REBALANCE_INVARIANT');
      assignment[fallback.cell] = fallback.to;
      counts[fallback.from] -= 1;
      counts[fallback.to] += 1;
      remaining -= 1;
      continue;
    }
    if (
      assignment[transfer.cell] !== transfer.from
      || counts[transfer.from]! <= targets[transfer.from]!
      || counts[transfer.to]! >= targets[transfer.to]!
    ) continue;
    let stillAdjacent = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[transfer.cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && assignment[neighbor] === transfer.to) {
        stillAdjacent = true;
        break;
      }
    }
    if (!stillAdjacent) continue;
    assignment[transfer.cell] = transfer.to;
    counts[transfer.from] -= 1;
    counts[transfer.to] += 1;
    remaining -= 1;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[transfer.cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || ordinalByCell[neighbor]! < 0) continue;
      offer(neighbor, transfer.to);
      offer(transfer.cell, assignment[neighbor]!);
    }
  }
  return assignment;
}

function assignCoherentStrategicGroups(
  grid: IndexedAxialGrid,
  cells: readonly number[],
  groupCount: number,
  costs: Int32Array,
  forcedGroup: Int8Array,
): Uint8Array {
  if (costs.length !== cells.length * groupCount || forcedGroup.length !== grid.cellCount) {
    fail('GREATER_REALM_STRATEGIC_GROUP_INPUT_INVALID');
  }
  const initialAssignment = new Uint8Array(grid.cellCount);
  initialAssignment.fill(0xff);
  for (let ordinal = 0; ordinal < cells.length; ordinal += 1) {
    const cell = cells[ordinal]!;
    const fixed = forcedGroup[cell]!;
    if (fixed >= groupCount) fail('GREATER_REALM_STRATEGIC_GROUP_FORCE_INVALID');
    let selected = fixed;
    if (selected < 0) {
      selected = 0;
      let selectedCost = costs[ordinal * groupCount]!;
      for (let group = 1; group < groupCount; group += 1) {
        const cost = costs[ordinal * groupCount + group]!;
        if (cost < selectedCost || (cost === selectedCost && group < selected)) {
          selected = group;
          selectedCost = cost;
        }
      }
    }
    initialAssignment[cell] = selected;
  }
  return rebalanceCoherentStrategicGroups(
    grid,
    cells,
    groupCount,
    costs,
    forcedGroup,
    initialAssignment,
  );
}

function assignTiersAndRegions(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  uplift: Int32Array,
  domainId: Uint8Array,
  flowAccumulation: BigUint64Array,
  legacyReserveCell: Uint8Array,
): Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
}> {
  const tierIIIShare = 400 + (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tier-three-share'),
      0,
      0,
    ) % 151
  );
  const tierIIShare = 2_250 + (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tier-two-share'),
      0,
      0,
    ) % 401
  );
  const tierThreeCount = Math.round((grid.cellCount * tierIIIShare) / 10_000);
  const tierTwoCount = Math.round((grid.cellCount * tierIIShare) / 10_000);
  let reservedCount = 0;
  for (const reserved of legacyReserveCell) reservedCount += reserved === 1 ? 1 : 0;
  if (reservedCount >= grid.cellCount - tierThreeCount - tierTwoCount) {
    rejectGreaterRealmCandidate('GREATER_REALM_LEGACY_LOWLANDS_RESERVE_TOO_LARGE');
  }
  const basinField = createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
    { channel: 'strategic-tier-basin-macro', amplitude: 5_600, smoothingPasses: 18, selfWeight: 3 },
    { channel: 'strategic-tier-basin-local', amplitude: 1_800, smoothingPasses: 5, selfWeight: 2 },
  ]);
  const terrainCost = new Int32Array(grid.cellCount);
  const boundaryMask = new Uint8Array(grid.cellCount);
  let activeQTotal = 0;
  let activeRTotal = 0;
  let legacyQTotal = 0;
  let legacyRTotal = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    activeQTotal += grid.q[cell]!;
    activeRTotal += grid.r[cell]!;
    if (legacyReserveCell[cell] === 1) {
      legacyQTotal += grid.q[cell]!;
      legacyRTotal += grid.r[cell]!;
    }
    let flowMagnitude = 0;
    for (let flow = flowAccumulation[cell]!; flow > 1n; flow >>= 1n) flowMagnitude += 1;
    const elevationValue = elevation[cell]!;
    const waterPenalty = elevationValue <= SEA_LEVEL
      ? 7_000 + Math.min(8_000, Math.floor(Math.abs(elevationValue) / 3))
      : 0;
    const basinElevation = elevationValue > SEA_LEVEL
      ? Math.min(9_000, Math.floor(Math.abs(elevationValue - 1_400) / 3))
      : 0;
    const highlandPenalty = Math.floor(Math.max(0, uplift[cell]!) / 3);
    terrainCost[cell] = clamp(
      basinField[cell]! + waterPenalty + basinElevation + highlandPenalty - flowMagnitude * 150,
      -30_000,
      60_000,
    );
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) {
        boundaryMask[cell] = 1;
        break;
      }
    }
  }
  const distanceToActiveBoundary = distanceFromMask(grid, boundaryMask);
  const activeCenterQ = Math.round(activeQTotal / grid.cellCount);
  const activeCenterR = Math.round(activeRTotal / grid.cellCount);
  const legacyCenterQ = Math.round(legacyQTotal / reservedCount);
  const legacyCenterR = Math.round(legacyRTotal / reservedCount);
  let tierThreeSeed = -1;
  let tierThreeSeedScore = Number.POSITIVE_INFINITY;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      legacyReserveCell[cell] === 1
      || elevation[cell]! <= SEA_LEVEL
      || distanceToActiveBoundary[cell]! < 42
      || axialDistance(grid.q[cell]!, grid.r[cell]!, legacyCenterQ, legacyCenterR) < 72
    ) continue;
    const centerDistance = axialDistance(
      grid.q[cell]!,
      grid.r[cell]!,
      activeCenterQ,
      activeCenterR,
    );
    const score = terrainCost[cell]! + centerDistance * 18;
    if (score < tierThreeSeedScore || (score === tierThreeSeedScore && cell < tierThreeSeed)) {
      tierThreeSeed = cell;
      tierThreeSeedScore = score;
    }
  }
  if (tierThreeSeed < 0) {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (legacyReserveCell[cell] === 1 || elevation[cell]! <= SEA_LEVEL) continue;
      if (
        tierThreeSeed < 0
        || terrainCost[cell]! < terrainCost[tierThreeSeed]!
        || (terrainCost[cell] === terrainCost[tierThreeSeed] && cell < tierThreeSeed)
      ) tierThreeSeed = cell;
    }
  }
  if (tierThreeSeed < 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_TIER_THREE_CAPACITY_INVARIANT');
  }

  const tierThreeBlocked = new Uint8Array(legacyReserveCell);
  const tierThreeMask = growNaturalStrategicBasin(
    grid,
    tierThreeCount,
    [tierThreeSeed],
    tierThreeBlocked,
    terrainCost,
    94,
  );
  const tierTwoSeeds: number[] = [];
  const tierTwoBlocked = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierThreeMask[cell] === 1 || legacyReserveCell[cell] === 1) {
      tierTwoBlocked[cell] = 1;
    }
    if (tierThreeMask[cell] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && tierThreeMask[neighbor] !== 1
        && legacyReserveCell[neighbor] !== 1
      ) tierTwoSeeds.push(neighbor);
    }
  }
  const tierTwoMask = growNaturalStrategicBasin(
    grid,
    tierTwoCount,
    [...new Set(tierTwoSeeds)],
    tierTwoBlocked,
    terrainCost,
    52,
  );
  const tierId = new Uint8Array(grid.cellCount);
  tierId.fill(1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierThreeMask[cell] === 1) tierId[cell] = 3;
    else if (tierTwoMask[cell] === 1) tierId[cell] = 2;
  }

  let tierTwoBoundary: number[] = [];
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] !== 2 || elevation[cell]! <= SEA_LEVEL) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && tierId[neighbor] === 3) {
        tierTwoBoundary.push(cell);
        break;
      }
    }
  }
  if (tierTwoBoundary.length < 3) {
    tierTwoBoundary = Array.from({ length: grid.cellCount }, (_, cell) => cell)
      .filter(cell => tierId[cell] === 2 && elevation[cell]! > SEA_LEVEL);
  }
  if (tierTwoBoundary.length < 3) {
    tierTwoBoundary = Array.from({ length: grid.cellCount }, (_, cell) => cell)
      .filter(cell => tierId[cell] === 2);
  }
  if (tierTwoBoundary.length < 3) {
    rejectGreaterRealmCandidate('GREATER_REALM_TIER_TWO_CAPACITY_INVARIANT');
  }
  const parentAnchors: number[] = [];
  const firstParentAnchor = [...tierTwoBoundary].sort((first, second) => {
    const score = (cell: number) => axialDistance(
      grid.q[cell]!,
      grid.r[cell]!,
      legacyCenterQ,
      legacyCenterR,
    ) * 120 + terrainCost[cell]!;
    return score(first) - score(second) || first - second;
  })[0]!;
  parentAnchors.push(firstParentAnchor);
  while (parentAnchors.length < 3) {
    let selected = -1;
    let selectedScore = Number.NEGATIVE_INFINITY;
    for (const cell of tierTwoBoundary) {
      if (parentAnchors.includes(cell)) continue;
      const separation = Math.min(...parentAnchors.map(anchor => axialDistance(
        grid.q[cell]!,
        grid.r[cell]!,
        grid.q[anchor]!,
        grid.r[anchor]!,
      )));
      const score = separation * 1_000 - terrainCost[cell]!;
      if (score > selectedScore || (score === selectedScore && cell < selected)) {
        selected = cell;
        selectedScore = score;
      }
    }
    if (selected < 0) fail('GREATER_REALM_PARENT_BASIN_ANCHOR_MISSING');
    parentAnchors.push(selected);
  }
  const parentNoise = Array.from(
    { length: 3 },
    (_, parent) => createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
      {
        channel: `strategic-parent-basin-${parent}`,
        amplitude: 1_200,
        smoothingPasses: 9,
        selfWeight: 3,
      },
    ]),
  );
  const regionId = new Uint8Array(grid.cellCount);
  const parentId = new Uint8Array(grid.cellCount);
  parentId.fill(0xff);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] === 3) regionId[cell] = TIER_III_REGION_INDEX;
  }
  const strategicCells = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    .filter(cell => tierId[cell] !== 3);
  const parentCosts = new Int32Array(strategicCells.length * parentAnchors.length);
  for (let ordinal = 0; ordinal < strategicCells.length; ordinal += 1) {
    const cell = strategicCells[ordinal]!;
    for (let parent = 0; parent < parentAnchors.length; parent += 1) {
      const anchor = parentAnchors[parent]!;
      const domainAffinity = domainId[cell] === domainId[anchor] ? -300 : 300;
      parentCosts[ordinal * parentAnchors.length + parent] =
        axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[anchor]!,
          grid.r[anchor]!,
        ) * 92
        + parentNoise[parent]![cell]!
        + domainAffinity
        + Math.floor(Math.abs(elevation[cell]! - elevation[anchor]!) / 300);
    }
  }
  const tierOneCells = strategicCells.filter(cell => tierId[cell] === 1);
  const tierTwoCells = strategicCells.filter(cell => tierId[cell] === 2);
  // Every middle realm must span the full strategic ring: one dry anchor at
  // the Throneheart frontier and one at the outer-realm frontier, joined by a
  // compact dry spine. Without this constraint, a balanced Voronoi envelope
  // can consume its entire quota beside Tier III and leave one parent with no
  // possible outer gate at all. Try all parent orders so the three spines are
  // vertex-disjoint; if geography makes that impossible, still pin distinct
  // outer anchors and let the coherent partition grow toward them.
  const tierTwoOuterDryBoundary = tierTwoCells.filter(cell => {
    if (elevation[cell]! <= SEA_LEVEL) return false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && tierId[neighbor] === 1
        && elevation[neighbor]! > SEA_LEVEL
      ) return true;
    }
    return false;
  });
  const outerDryMask = new Uint8Array(grid.cellCount);
  for (const cell of tierTwoOuterDryBoundary) outerDryMask[cell] = 1;
  const parentSpineOrders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ] as const;
  let parentTierTwoSpines: number[][] | undefined;
  if (tierTwoOuterDryBoundary.length >= 3) {
    for (const order of parentSpineOrders) {
      const claimed = new Uint8Array(grid.cellCount);
      const paths = Array.from({ length: 3 }, () => [] as number[]);
      let complete = true;
      for (const parent of order) {
        const start = parentAnchors[parent]!;
        const previous = new Int32Array(grid.cellCount);
        previous.fill(-2);
        const queue = new Uint32Array(grid.cellCount);
        let head = 0;
        let tail = 0;
        let target = -1;
        previous[start] = -1;
        queue[tail++] = start;
        while (head < tail && target < 0) {
          const cell = queue[head++]!;
          if (cell !== start && outerDryMask[cell] === 1 && claimed[cell] === 0) {
            target = cell;
            break;
          }
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor < 0
              || previous[neighbor] !== -2
              || claimed[neighbor] === 1
              || tierId[neighbor] !== 2
              || elevation[neighbor]! <= SEA_LEVEL
              || parentAnchors.some((anchor, owner) => owner !== parent && anchor === neighbor)
            ) continue;
            previous[neighbor] = cell;
            queue[tail++] = neighbor;
          }
        }
        if (target < 0) {
          complete = false;
          break;
        }
        for (let cell = target; cell >= 0; cell = previous[cell]!) {
          paths[parent]!.push(cell);
        }
        paths[parent]!.reverse();
        for (const cell of paths[parent]!) claimed[cell] = 1;
      }
      if (complete) {
        parentTierTwoSpines = paths;
        break;
      }
    }
  }
  if (!parentTierTwoSpines) {
    const usedOuter = new Set<number>();
    parentTierTwoSpines = parentAnchors.map((anchor) => {
      const outer = [...tierTwoOuterDryBoundary]
        .filter(cell => !usedOuter.has(cell))
        .sort((first, second) => (
          axialDistance(
            grid.q[first]!,
            grid.r[first]!,
            grid.q[anchor]!,
            grid.r[anchor]!,
          ) - axialDistance(
            grid.q[second]!,
            grid.r[second]!,
            grid.q[anchor]!,
            grid.r[anchor]!,
          ) || terrainCost[first]! - terrainCost[second]! || first - second
        ))[0];
      if (outer === undefined) return [anchor];
      usedOuter.add(outer);
      return outer === anchor ? [anchor] : [anchor, outer];
    });
  }
  const costsFor = (cells: readonly number[]) => {
    const byCell = new Map(strategicCells.map((cell, ordinal) => [cell, ordinal] as const));
    const costs = new Int32Array(cells.length * parentAnchors.length);
    for (let ordinal = 0; ordinal < cells.length; ordinal += 1) {
      const source = byCell.get(cells[ordinal]!)!;
      for (let parent = 0; parent < parentAnchors.length; parent += 1) {
        costs[ordinal * parentAnchors.length + parent] =
          parentCosts[source * parentAnchors.length + parent]!;
      }
    }
    return costs;
  };
  const forcedTierOneParent = new Int8Array(grid.cellCount);
  forcedTierOneParent.fill(-1);
  for (const cell of tierOneCells) {
    if (legacyReserveCell[cell] === 1) forcedTierOneParent[cell] = 0;
  }
  const forcedTierTwoParent = new Int8Array(grid.cellCount);
  forcedTierTwoParent.fill(-1);
  const anchorOnlyTierTwoParent = new Int8Array(grid.cellCount);
  anchorOnlyTierTwoParent.fill(-1);
  for (let parent = 0; parent < parentAnchors.length; parent += 1) {
    anchorOnlyTierTwoParent[parentAnchors[parent]!] = parent;
    for (const cell of parentTierTwoSpines[parent]!) {
      forcedTierTwoParent[cell] = parent;
    }
  }
  const baselineTierTwoParents = assignCoherentStrategicGroups(
    grid,
    tierTwoCells,
    parentAnchors.length,
    costsFor(tierTwoCells),
    anchorOnlyTierTwoParent,
  );
  const baselineOuterDryContact = new Uint8Array(parentAnchors.length);
  for (const cell of tierTwoOuterDryBoundary) {
    baselineOuterDryContact[baselineTierTwoParents[cell]!] = 1;
  }
  const tierTwoParents = baselineOuterDryContact.every(contact => contact === 1)
    ? baselineTierTwoParents
    : assignCoherentStrategicGroups(
        grid,
        tierTwoCells,
        parentAnchors.length,
        costsFor(tierTwoCells),
        forcedTierTwoParent,
      );
  for (const cell of tierTwoCells) parentId[cell] = tierTwoParents[cell]!;
  const tierOneAnchors: number[] = [];
  for (let parent = 0; parent < parentAnchors.length; parent += 1) {
    const candidates = tierOneCells.filter(cell => {
      if (elevation[cell]! <= SEA_LEVEL) return false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === 2
          && parentId[neighbor] === parent
          && elevation[neighbor]! > SEA_LEVEL
        ) return true;
      }
      return false;
    });
    const fallback = candidates.length > 0
      ? candidates
      : tierOneCells.filter(cell => {
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && tierId[neighbor] === 2 && parentId[neighbor] === parent) return true;
          }
          return false;
        });
    const anchor = [...(fallback.length > 0 ? fallback : tierOneCells)].sort((first, second) => (
      axialDistance(
        grid.q[first]!,
        grid.r[first]!,
        grid.q[parentAnchors[parent]!]!,
        grid.r[parentAnchors[parent]!]!,
      ) - axialDistance(
        grid.q[second]!,
        grid.r[second]!,
        grid.q[parentAnchors[parent]!]!,
        grid.r[parentAnchors[parent]!]!,
      ) || terrainCost[first]! - terrainCost[second]! || first - second
    ))[0]!;
    tierOneAnchors.push(anchor);
    forcedTierOneParent[anchor] = parent;
  }
  // Preserve one dry Lowlands-to-Crown spine before the capacity-balanced
  // partition. The later child split widens its end into a natural gate basin.
  const lowlandsPrevious = new Int32Array(grid.cellCount);
  lowlandsPrevious.fill(-2);
  const lowlandsQueue = new Uint32Array(grid.cellCount);
  let lowlandsHead = 0;
  let lowlandsTail = 0;
  for (const cell of tierOneCells) {
    if (legacyReserveCell[cell] !== 1 || elevation[cell]! <= SEA_LEVEL) continue;
    lowlandsPrevious[cell] = -1;
    lowlandsQueue[lowlandsTail++] = cell;
  }
  while (lowlandsHead < lowlandsTail && lowlandsPrevious[tierOneAnchors[0]!] === -2) {
    const cell = lowlandsQueue[lowlandsHead++]!;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor < 0
        || tierId[neighbor] !== 1
        || elevation[neighbor]! <= SEA_LEVEL
        || lowlandsPrevious[neighbor] !== -2
      ) continue;
      lowlandsPrevious[neighbor] = cell;
      lowlandsQueue[lowlandsTail++] = neighbor;
    }
  }
  if (lowlandsPrevious[tierOneAnchors[0]!] !== -2) {
    for (
      let cell = tierOneAnchors[0]!;
      cell >= 0;
      cell = lowlandsPrevious[cell]!
    ) forcedTierOneParent[cell] = 0;
  }
  const tierOneParents = assignCoherentStrategicGroups(
    grid,
    tierOneCells,
    parentAnchors.length,
    costsFor(tierOneCells),
    forcedTierOneParent,
  );
  for (const cell of tierOneCells) parentId[cell] = tierOneParents[cell]!;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] === 2) regionId[cell] = TIER_I_REGION_COUNT + parentId[cell]!;
  }
  for (let parent = 0; parent < parentAnchors.length; parent += 1) {
    const cells = strategicCells.filter(cell => tierId[cell] === 1 && parentId[cell] === parent);
    const children = [parent * 2, parent * 2 + 1] as const;
    const rawParentTierTwoBoundary = cells.filter(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === 2
          && parentId[neighbor] === parent
        ) return true;
      }
      return false;
    });
    const dryParentTierTwoBoundary = rawParentTierTwoBoundary.filter(cell => {
      if (elevation[cell]! <= SEA_LEVEL) return false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === 2
          && parentId[neighbor] === parent
          && elevation[neighbor]! > SEA_LEVEL
        ) return true;
      }
      return false;
    });
    const parentTierTwoBoundary = dryParentTierTwoBoundary.length >= 2
      ? dryParentTierTwoBoundary
      : rawParentTierTwoBoundary.length >= 2
        ? rawParentTierTwoBoundary
        : cells;
    const firstChildAnchor = parent === 0
      ? [...parentTierTwoBoundary].sort((first, second) => {
          const score = (cell: number) => axialDistance(
            grid.q[cell]!,
            grid.r[cell]!,
            legacyCenterQ,
            legacyCenterR,
          ) * 100 + terrainCost[cell]!;
          return score(first) - score(second) || first - second;
        })[0]!
      : [...parentTierTwoBoundary].sort((first, second) => (
          terrainCost[first]! - terrainCost[second]! || first - second
        ))[0]!;
    const secondChildAnchor = [...parentTierTwoBoundary].sort((first, second) => {
      const score = (cell: number) => axialDistance(
        grid.q[cell]!,
        grid.r[cell]!,
        grid.q[firstChildAnchor]!,
        grid.r[firstChildAnchor]!,
      ) * 1_000 - terrainCost[cell]!;
      return score(second) - score(first) || first - second;
    })[0]!;
    const lowlandsApproach = new Set<number>();
    if (parent === 0) {
      const allowed = new Uint8Array(grid.cellCount);
      const target = new Uint8Array(grid.cellCount);
      const previous = new Int32Array(grid.cellCount);
      previous.fill(-2);
      const queue = new Uint32Array(grid.cellCount);
      let head = 0;
      let tail = 0;
      for (const cell of cells) {
        if (elevation[cell]! <= SEA_LEVEL) continue;
        allowed[cell] = 1;
        if (legacyReserveCell[cell] === 1) {
          previous[cell] = -1;
          queue[tail++] = cell;
        }
      }
      target[firstChildAnchor] = 1;
      let reached = -1;
      while (head < tail && reached < 0) {
        const cell = queue[head++]!;
        if (target[cell] === 1) {
          reached = cell;
          break;
        }
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || allowed[neighbor] !== 1 || previous[neighbor] !== -2) continue;
          previous[neighbor] = cell;
          queue[tail++] = neighbor;
        }
      }
      if (reached >= 0) {
        for (let cell = reached; cell >= 0; cell = previous[cell]!) lowlandsApproach.add(cell);
      } else {
        for (const cell of cells) {
          if (legacyReserveCell[cell] === 1) lowlandsApproach.add(cell);
        }
      }
    }
    const blocked = new Uint8Array(grid.cellCount);
    blocked.fill(1);
    for (const cell of cells) {
      blocked[cell] = 0;
    }
    const firstChildCore = growNaturalStrategicBasin(
      grid,
      Math.min(960, Math.max(1, Math.floor(cells.length / 16))),
      [firstChildAnchor],
      blocked,
      terrainCost,
      48,
    );
    for (const cell of cells) {
      if (firstChildCore[cell] === 1) blocked[cell] = 1;
    }
    const childSeeds = [secondChildAnchor];
    const reachable = new Uint8Array(grid.cellCount);
    const queue = new Uint32Array(grid.cellCount);
    const floodComponent = (start: number) => {
      let head = 0;
      let tail = 0;
      const component: number[] = [];
      reachable[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const cell = queue[head++]!;
        component.push(cell);
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || blocked[neighbor] === 1 || reachable[neighbor] === 1) continue;
          reachable[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      return component;
    };
    floodComponent(secondChildAnchor);
    for (const cell of cells) {
      if (blocked[cell] === 1 || reachable[cell] === 1) continue;
      const component = floodComponent(cell);
      component.sort((first, second) => terrainCost[first]! - terrainCost[second]! || first - second);
      childSeeds.push(component[0]!);
    }
    const countedLand = new Uint8Array(grid.cellCount);
    let parentLandCount = 0;
    for (const cell of cells) {
      if (elevation[cell]! <= SEA_LEVEL) continue;
      countedLand[cell] = 1;
      parentLandCount += 1;
    }
    const desiredSecondCount = Math.floor(cells.length / 2);
    const secondChildBasin = growNaturalStrategicBasin(
      grid,
      Math.floor(parentLandCount / 2),
      childSeeds,
      blocked,
      terrainCost,
      72,
      countedLand,
    );
    let secondCount = cells.reduce((total, cell) => total + secondChildBasin[cell]!, 0);
    if (secondCount > desiredSecondCount) {
      const removableWater = cells.filter(cell => (
        secondChildBasin[cell] === 1
        && elevation[cell]! <= SEA_LEVEL
        && cell !== secondChildAnchor
      ));
      removableWater.sort((first, second) => {
        const score = (cell: number) => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[secondChildAnchor]!,
          grid.r[secondChildAnchor]!,
        ) * 80 + terrainCost[cell]!;
        return score(second) - score(first) || second - first;
      });
      for (const cell of removableWater) {
        if (secondCount <= desiredSecondCount) break;
        secondChildBasin[cell] = 0;
        secondCount -= 1;
      }
    } else if (secondCount < desiredSecondCount) {
      const additionalWater = cells.filter(cell => (
        secondChildBasin[cell] !== 1
        && blocked[cell] !== 1
        && elevation[cell]! <= SEA_LEVEL
      ));
      additionalWater.sort((first, second) => {
        const score = (cell: number) => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[secondChildAnchor]!,
          grid.r[secondChildAnchor]!,
        ) * 80 + terrainCost[cell]!;
        return score(first) - score(second) || first - second;
      });
      for (const cell of additionalWater) {
        if (secondCount >= desiredSecondCount) break;
        secondChildBasin[cell] = 1;
        secondCount += 1;
      }
    }
    let retainedSecondCount = cells.reduce((total, cell) => total + (
      secondChildBasin[cell] === 1
      && firstChildCore[cell] !== 1
      && !(parent === 0 && (legacyReserveCell[cell] === 1 || lowlandsApproach.has(cell)))
        ? 1
        : 0
    ), 0);
    if (retainedSecondCount < desiredSecondCount) {
      const expansionCandidates = cells.filter(cell => (
        secondChildBasin[cell] !== 1
        && firstChildCore[cell] !== 1
        && !(parent === 0 && (legacyReserveCell[cell] === 1 || lowlandsApproach.has(cell)))
      ));
      expansionCandidates.sort((first, second) => {
        const score = (cell: number) => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[secondChildAnchor]!,
          grid.r[secondChildAnchor]!,
        ) * 96 + terrainCost[cell]!;
        return score(first) - score(second) || first - second;
      });
      for (const cell of expansionCandidates) {
        if (retainedSecondCount >= desiredSecondCount) break;
        secondChildBasin[cell] = 1;
        retainedSecondCount += 1;
      }
    }
    for (const cell of cells) {
      regionId[cell] = (
        secondChildBasin[cell] === 1
        && firstChildCore[cell] !== 1
        && !(parent === 0 && (legacyReserveCell[cell] === 1 || lowlandsApproach.has(cell)))
      ) ? children[1] : children[0];
    }
  }
  const tierCounts: [number, number, number] = [0, 0, 0];
  const regionCounts = Array<number>(REGION_COUNT).fill(0);
  for (let index = 0; index < grid.cellCount; index += 1) {
    tierCounts[tierId[index]! - 1] += 1;
    regionCounts[regionId[index]!] += 1;
  }
  return Object.freeze({ tierId, regionId, tierCounts, regionCounts: Object.freeze(regionCounts) });
}

function remapTierOneNaturalBasinsByCharacter(
  grid: IndexedAxialGrid,
  provisional: Readonly<{
    tierId: Uint8Array;
    regionId: Uint8Array;
    tierCounts: readonly [number, number, number];
  }>,
  elevation: Int32Array,
  uplift: Int32Array,
  flowAccumulation: BigUint64Array,
  domainId: Uint8Array,
  domains: readonly GreaterRealmPseudoTectonicDomain[],
  waterRegime: Uint8Array,
  temperatureField: Int32Array,
  moistureField: Int32Array,
  glacialMask: Uint8Array,
  aridMask: Uint8Array,
  volcanicMask: Uint8Array,
  coastalMask: Uint8Array,
  coastalClass: Uint8Array,
): Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
  semanticPermutation: readonly number[];
  gateGraph: readonly GreaterRealmGateGraphEdge[];
}> {
  // Provisional T1 basin IDs carry topology only. Working identities are
  // assigned afterward from climate/process evidence so no named region is
  // created by painting a biome into a preselected wedge.
  const scoreSums = Array.from({ length: TIER_I_REGION_COUNT }, () => (
    Array<bigint>(TIER_I_REGION_COUNT - 1).fill(0n)
  ));
  const landCounts = new Uint32Array(TIER_I_REGION_COUNT);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const basin = provisional.regionId[cell]!;
    if (provisional.tierId[cell] !== 1 || basin === 0 || elevation[cell]! <= SEA_LEVEL) continue;
    landCounts[basin] += 1;
    const temperature = temperatureField[cell]!;
    const moisture = moistureField[cell]!;
    let flowMagnitude = 0;
    for (let flow = flowAccumulation[cell]!; flow > 1n; flow >>= 1n) flowMagnitude += 1;
    let coastNeighbors = 0;
    let wetNeighbors = 0;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0) continue;
      if (
        waterRegime[neighbor] === WATER_OCEAN
        || waterRegime[neighbor] === WATER_SEA
        || waterRegime[neighbor] === WATER_LAKE
      ) coastNeighbors += 1;
      if (waterRegime[neighbor] >= 2) wetNeighbors += 1;
    }
    const domain = domains[domainId[cell]!]!;
    const scores = [
      Math.max(0, 5_000 - temperature) * 3
        + Math.floor(Math.max(0, elevation[cell]! - 7_000) / 3)
        + glacialMask[cell]! * 12_000,
      Math.max(0, temperature - 3_500) * 2
        + Math.max(0, -moisture - 500) * 2
        + aridMask[cell]! * 12_000
        + Math.max(0, 8 - flowMagnitude) * 180,
      flowMagnitude * 520
        + wetNeighbors * 1_500
        + Math.max(0, moisture) * 2
        + (coastalClass[cell] === 3 ? 8_000 : 0),
      coastNeighbors * 3_400
        + coastalMask[cell]! * 5_000
        + (coastalClass[cell] > 0 ? 2_500 : 0)
        + Math.floor(Math.max(0, elevation[cell]!) / 8),
      Math.floor(domain.volcanicPotential * 3)
        + Math.floor(Math.max(0, uplift[cell]!) / 2)
        + volcanicMask[cell]! * 12_000,
    ] as const;
    for (let role = 0; role < scores.length; role += 1) {
      scoreSums[basin]![role] += BigInt(scores[role]!);
    }
  }
  const normalizedScores = scoreSums.map((scores, basin) => scores.map(score => {
    const count = landCounts[basin]!;
    return count > 0 ? score / BigInt(count) : 0n;
  }));
  for (let basin = 1; basin < TIER_I_REGION_COUNT; basin += 1) {
    const passableMask = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        provisional.regionId[cell] === basin
        && strategicallyPassableSurface(waterRegime[cell]!)
      ) passableMask[cell] = 1;
    }
    const components = connectedComponents(grid, passableMask);
    const total = components.reduce((sum, component) => sum + component.length, 0);
    const largest = components.reduce(
      (maximum, component) => Math.max(maximum, component.length),
      0,
    );
    const meaningfulIslands = components.filter(component => component.length >= 64).length;
    const islandiness = total === 0 ? 0 : 10_000 - Math.round((largest * 10_000) / total);
    normalizedScores[basin]![3] += BigInt(
      islandiness * 4 + Math.min(10, meaningfulIslands) * 500,
    );
  }
  let bestScore: bigint | undefined;
  let bestPermutation: readonly number[] | undefined;
  // Exactly 5! bounded integer assignments. Loop order is the complete
  // lexicographic tie-break, so equal scores replay identically.
  for (let first = 1; first <= 5; first += 1) {
    for (let second = 1; second <= 5; second += 1) {
      if (second === first) continue;
      for (let third = 1; third <= 5; third += 1) {
        if (third === first || third === second) continue;
        for (let fourth = 1; fourth <= 5; fourth += 1) {
          if (fourth === first || fourth === second || fourth === third) continue;
          for (let fifth = 1; fifth <= 5; fifth += 1) {
            if ([first, second, third, fourth].includes(fifth)) continue;
            const permutation = [0, first, second, third, fourth, fifth] as const;
            let score = 0n;
            for (let basin = 1; basin <= 5; basin += 1) {
              score += normalizedScores[basin]![permutation[basin]! - 1]!;
            }
            if (bestScore === undefined || score > bestScore) {
              bestScore = score;
              bestPermutation = permutation;
            }
          }
        }
      }
    }
  }
  if (!bestPermutation) fail('GREATER_REALM_SEMANTIC_REGION_REMAP_FAILED');
  const regionId = new Uint8Array(provisional.regionId);
  const regionCounts = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const provisionalRegion = provisional.regionId[cell]!;
    if (provisionalRegion > 0 && provisionalRegion < TIER_I_REGION_COUNT) {
      regionId[cell] = bestPermutation[provisionalRegion]!;
    }
    regionCounts[regionId[cell]!] += 1;
  }
  const gateGraph = GREATER_REALM_PROVISIONAL_GATE_GRAPH.map(([first, second]) => (
    Object.freeze([
      first > 0 && first < TIER_I_REGION_COUNT ? bestPermutation[first]! : first,
      second,
    ] as const)
  ));
  return Object.freeze({
    tierId: provisional.tierId,
    regionId,
    tierCounts: provisional.tierCounts,
    regionCounts: Object.freeze(regionCounts),
    semanticPermutation: Object.freeze([...bestPermutation]),
    gateGraph: Object.freeze(gateGraph),
  });
}

function connectedComponents(
  grid: IndexedAxialGrid,
  included: Uint8Array,
): readonly (readonly number[])[] {
  const seen = new Uint8Array(grid.cellCount);
  const components: number[][] = [];
  const queue = new Uint32Array(grid.cellCount);
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (included[start] !== 1 || seen[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const component: number[] = [];
    while (head < tail) {
      const cell = queue[head++]!;
      component.push(cell);
      for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
        if (neighbor < 0 || included[neighbor] !== 1 || seen[neighbor] === 1) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    components.push(component);
  }
  return Object.freeze(components.map(component => Object.freeze(component)));
}

function connectedComponentsAtEqualSurface(
  grid: IndexedAxialGrid,
  included: Uint8Array,
  surface: Int32Array,
): readonly (readonly number[])[] {
  const seen = new Uint8Array(grid.cellCount);
  const components: number[][] = [];
  const queue = new Uint32Array(grid.cellCount);
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (included[start] !== 1 || seen[start] === 1) continue;
    const level = surface[start]!;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const component: number[] = [];
    while (head < tail) {
      const cell = queue[head++]!;
      component.push(cell);
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || included[neighbor] !== 1
          || seen[neighbor] === 1
          || surface[neighbor] !== level
        ) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    components.push(component);
  }
  return Object.freeze(components.map(component => Object.freeze(component)));
}

function repairNaturalRegionLandCoherence(
  grid: IndexedAxialGrid,
  strategy: Readonly<{
    tierId: Uint8Array;
    regionId: Uint8Array;
    tierCounts: readonly [number, number, number];
    regionCounts: readonly number[];
    semanticPermutation: readonly number[];
    gateGraph: readonly GreaterRealmGateGraphEdge[];
  }>,
  waterRegime: Uint8Array,
  legacyProtectedCell: Uint8Array,
): Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
  semanticPermutation: readonly number[];
  gateGraph: readonly GreaterRealmGateGraphEdge[];
}> {
  const tierId = new Uint8Array(strategy.tierId);
  const regionId = new Uint8Array(strategy.regionId);
  const initialCounts = [...strategy.regionCounts];
  const regionRepairLocked = new Uint8Array(grid.cellCount);
  // Keep each region's dominant land body. A detached component is transferred
  // only to a same-tier region it physically touches; truly isolated T1
  // islands belong to Stonewake. Equal non-passable water ownership is swapped
  // back so the exact region/tier population contract is unchanged.
  const repairOrder = [1, 2, 3, 5, 6, 7, 8, 9, 0, 4] as const;
  for (const sourceRegion of repairOrder) {
    const included = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        regionId[cell] === sourceRegion
        && strategicallyPassableSurface(waterRegime[cell]!)
      ) included[cell] = 1;
    }
    const components = [...connectedComponents(grid, included)]
      .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
    if (components.length <= 1) continue;
    const destinationTier = GREATER_REALM_REGION_SPECS[sourceRegion]!.tier + 1;
    const tierContactCount = (component: readonly number[]) => {
      let count = 0;
      for (const cell of component) {
        if (waterRegime[cell] !== 0) continue;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && tierId[neighbor] === destinationTier
            && waterRegime[neighbor] === 0
          ) count += 1;
        }
      }
      return count;
    };
    const largestHasTierContact = sourceRegion === TIER_III_REGION_INDEX
      || tierContactCount(components[0]!) > 0;
    const protectedGateComponent = largestHasTierContact
      ? undefined
      : components.slice(1)
          .filter(component => component.length >= 64 && tierContactCount(component) > 0)
          .sort((first, second) => (
            tierContactCount(second) - tierContactCount(first)
            || second.length - first.length
            || first[0]! - second[0]!
          ))[0];
    // Repair to a deliberately stronger pre-barrier target. The later
    // geological shoulder mask legitimately removes boundary cells; matching
    // the final threshold here left ordinary candidates just below it.
    const targetLargestShare = sourceRegion < TIER_I_REGION_COUNT
      ? sourceRegion === 4 ? 7_000 : 8_750
      : sourceRegion < TIER_III_REGION_INDEX ? 9_250 : 9_500;
    const targetMinorShare = sourceRegion === 4 ? 425 : 250;
    const selectedComponents: Array<readonly number[]> = [];
    let remainingPassable = components.reduce((total, component) => total + component.length, 0);
    let remainingMinor = components.slice(1).reduce(
      (total, component) => total + (component.length < 64 ? component.length : 0),
      0,
    );
    for (const component of components.slice(1)) {
      if (component === protectedGateComponent) continue;
      if (components[0]!.length * 10_000 >= remainingPassable * targetLargestShare) break;
      selectedComponents.push(component);
      remainingPassable -= component.length;
      if (component.length < 64) remainingMinor -= component.length;
    }
    const alreadySelected = new Set(selectedComponents);
    const smallFragments = components.slice(1)
      .filter(component => (
        component.length < 64
        && component !== protectedGateComponent
        && !alreadySelected.has(component)
      ))
      .sort((first, second) => first.length - second.length || first[0]! - second[0]!);
    for (const component of smallFragments) {
      if (remainingMinor * 10_000 <= remainingPassable * targetMinorShare) break;
      selectedComponents.push(component);
      remainingPassable -= component.length;
      remainingMinor -= component.length;
    }
    for (const component of selectedComponents) {
      if (component.some(cell => (
        legacyProtectedCell[cell] === 1
          || (
            regionRepairLocked[cell] === 1
            && sourceRegion !== 4
            && sourceRegion !== 0
          )
      ))) continue;
      const contacts = new Uint32Array(REGION_COUNT);
      for (const cell of component) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || !strategicallyPassableSurface(waterRegime[neighbor]!)
            || (
              sourceRegion === TIER_III_REGION_INDEX
                ? tierId[neighbor] !== 2
                : tierId[neighbor] !== tierId[cell]
            )
            || regionId[neighbor] === sourceRegion
          ) continue;
          contacts[regionId[neighbor]!] += 1;
        }
      }
      let targetRegion = -1;
      let bestContacts = 0;
      if (sourceRegion === TIER_III_REGION_INDEX) {
        // Throneheart is the only Tier III region, so an offshore fragment has
        // no same-tier recipient. Move that land to the nearest adjacent
        // middle realm and exchange equal non-passable ownership back into
        // Tier III. Tier/region populations remain exact while the throne
        // realm's traversable authority stays on one natural land body.
        for (let region = TIER_I_REGION_COUNT; region < TIER_III_REGION_INDEX; region += 1) {
          if (
            contacts[region]! > bestContacts
            || (
              contacts[region] === bestContacts
              && contacts[region]! > 0
              && region < targetRegion
            )
          ) {
            targetRegion = region;
            bestContacts = contacts[region]!;
          }
        }
        if (targetRegion < 0) {
          let bestDistance = Number.POSITIVE_INFINITY;
          for (
            let region = TIER_I_REGION_COUNT;
            region < TIER_III_REGION_INDEX;
            region += 1
          ) {
            const targetMask = new Uint8Array(grid.cellCount);
            for (let cell = 0; cell < grid.cellCount; cell += 1) {
              if (regionId[cell] === region) targetMask[cell] = 1;
            }
            const distance = distanceFromMask(grid, targetMask);
            const minimum = component.reduce(
              (value, cell) => Math.min(value, distance[cell]!),
              Number.POSITIVE_INFINITY,
            );
            if (minimum < bestDistance || (minimum === bestDistance && region < targetRegion)) {
              targetRegion = region;
              bestDistance = minimum;
            }
          }
        }
      } else {
        for (let region = 0; region < REGION_COUNT; region += 1) {
          if (
            region === sourceRegion
            || GREATER_REALM_REGION_SPECS[region]!.tier
              !== GREATER_REALM_REGION_SPECS[sourceRegion]!.tier
          ) continue;
          if (contacts[region]! > bestContacts) {
            targetRegion = region;
            bestContacts = contacts[region]!;
          }
        }
      }
      if (targetRegion < 0 && sourceRegion < TIER_I_REGION_COUNT) {
        // A whole offshore island has no same-landmass neighbour. Assigning
        // every such island to Stonewake made that realm an arbitrary bucket
        // of disconnected terrain. Instead distribute isolated landmasses to
        // the same-tier realm whose dominant body can absorb the fragment
        // with the highest projected coherence. This remains deterministic
        // and preserves each island as a single political unit.
        const currentTopology = passableRegionTopology(
          grid,
          regionId,
          waterRegime,
          new Uint8Array(grid.cellCount),
        );
        const currentMinorCells = new Uint32Array(REGION_COUNT);
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          const componentId = currentTopology.componentId[cell]!;
          if (
            componentId >= 0
            && currentTopology.componentSizes[componentId]! < 64
          ) currentMinorCells[regionId[cell]!] += 1;
        }
        let bestProjectedShare = -1;
        let bestMinorBurden = Number.POSITIVE_INFINITY;
        for (let region = 0; region < TIER_I_REGION_COUNT; region += 1) {
          if (region === sourceRegion) continue;
          const projectedTotal = currentTopology.passableCounts[region]! + component.length;
          const projectedShare = projectedTotal === 0
            ? 0
            : Math.floor(
              (currentTopology.largestCounts[region]! * 10_000) / projectedTotal,
            );
          const projectedMinorShare = projectedTotal === 0
            ? 10_000
            : Math.floor((
              currentMinorCells[region]!
                + (component.length < 64 ? component.length : 0)
            ) * 10_000 / projectedTotal);
          const minorAllowance = region === 4 ? 425 : 250;
          const minorBurden = Math.floor((projectedMinorShare * 10_000) / minorAllowance);
          const preferable = component.length < 64
            ? minorBurden < bestMinorBurden
              || (minorBurden === bestMinorBurden && projectedShare > bestProjectedShare)
              || (
                minorBurden === bestMinorBurden
                && projectedShare === bestProjectedShare
                && region < targetRegion
              )
            : projectedShare > bestProjectedShare
              || (projectedShare === bestProjectedShare && minorBurden < bestMinorBurden)
              || (
                projectedShare === bestProjectedShare
                && minorBurden === bestMinorBurden
                && region < targetRegion
              );
          if (preferable) {
            targetRegion = region;
            bestProjectedShare = projectedShare;
            bestMinorBurden = minorBurden;
          }
        }
      }
      if (targetRegion < 0 || targetRegion === sourceRegion) continue;

      const waterSwapCandidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          regionId[cell] !== targetRegion
          || strategicallyPassableSurface(waterRegime[cell]!)
          || legacyProtectedCell[cell] === 1
        ) continue;
        waterSwapCandidates.push(cell);
      }
      if (waterSwapCandidates.length < component.length) continue;
      waterSwapCandidates.sort((first, second) => {
        const sourceContacts = (cell: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === sourceRegion) count += 1;
          }
          return count;
        };
        return sourceContacts(second) - sourceContacts(first) || first - second;
      });
      for (const cell of component) {
        regionId[cell] = targetRegion;
        if (sourceRegion === TIER_III_REGION_INDEX) tierId[cell] = 2;
        regionRepairLocked[cell] = 1;
      }
      for (let index = 0; index < component.length; index += 1) {
        const swap = waterSwapCandidates[index]!;
        regionId[swap] = sourceRegion;
        if (sourceRegion === TIER_III_REGION_INDEX) tierId[swap] = 3;
      }
    }
    // Lowlands (and any analogous island realm) may have its immutable main
    // body offshore while a second continental foothold carries its gates.
    // If retaining that whole foothold would miss the coherence threshold,
    // keep a connected dry saddle district and transfer only its hinterland.
    const repairedMask = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        regionId[cell] === sourceRegion
        && strategicallyPassableSurface(waterRegime[cell]!)
      ) repairedMask[cell] = 1;
    }
    const repairedComponents = [...connectedComponents(grid, repairedMask)]
      .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
    const repairedTotal = repairedComponents.reduce(
      (total, component) => total + component.length,
      0,
    );
    if (
      repairedComponents.length > 1
      && repairedComponents[0]!.length * 10_000 < repairedTotal * targetLargestShare
    ) {
      const foothold = repairedComponents.slice(1)
        .filter(component => component.length >= 96 && tierContactCount(component) >= 2)
        .sort((first, second) => (
          tierContactCount(second) - tierContactCount(first)
          || second.length - first.length
          || first[0]! - second[0]!
          ))[0];
      if (foothold) {
        const maximumTotal = Math.floor(
          (repairedComponents[0]!.length * 10_000) / targetLargestShare,
        );
        const excess = repairedTotal - maximumTotal;
        const keepCount = Math.max(96, foothold.length - excess - 8);
        if (keepCount < foothold.length) {
          const footholdMask = new Uint8Array(grid.cellCount);
          for (const cell of foothold) footholdMask[cell] = 1;
          const seed = [...foothold]
            .filter(cell => tierContactCount([cell]) > 0)
            .sort((first, second) => first - second)[0];
          if (seed !== undefined) {
            const keep = new Uint8Array(grid.cellCount);
            const queue = new Uint32Array(grid.cellCount);
            let head = 0;
            let tail = 0;
            keep[seed] = 1;
            queue[tail++] = seed;
            while (head < tail && tail < keepCount) {
              const cell = queue[head++]!;
              for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
                const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
                if (neighbor < 0 || footholdMask[neighbor] !== 1 || keep[neighbor] === 1) continue;
                keep[neighbor] = 1;
                queue[tail++] = neighbor;
                if (tail >= keepCount) break;
              }
            }
            const transfer = foothold.filter(cell => keep[cell] !== 1);
            const transferMask = new Uint8Array(grid.cellCount);
            for (const cell of transfer) transferMask[cell] = 1;
            const transferPieces = [...connectedComponents(grid, transferMask)]
              .sort((first, second) => first[0]! - second[0]!);
            const assignments: Array<Readonly<{
              cells: readonly number[];
              targetRegion: number;
            }>> = [];
            const swapCounts = new Uint32Array(REGION_COUNT);
            let assignmentValid = transferPieces.length > 0;
            for (const cells of transferPieces) {
              const contacts = new Uint32Array(REGION_COUNT);
              for (const cell of cells) {
                for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
                  const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
                  if (
                    neighbor >= 0
                    && strategicallyPassableSurface(waterRegime[neighbor]!)
                    && tierId[neighbor] === tierId[cell]
                    && regionId[neighbor] !== sourceRegion
                  ) contacts[regionId[neighbor]!] += 1;
                }
              }
              let targetRegion = -1;
              let bestContacts = 0;
              for (let region = 0; region < REGION_COUNT; region += 1) {
                if (
                  region !== sourceRegion
                  && GREATER_REALM_REGION_SPECS[region]!.tier
                    === GREATER_REALM_REGION_SPECS[sourceRegion]!.tier
                  && contacts[region]! > bestContacts
                ) {
                  targetRegion = region;
                  bestContacts = contacts[region]!;
                }
              }
              if (targetRegion < 0) {
                assignmentValid = false;
                break;
              }
              assignments.push(Object.freeze({ cells, targetRegion }));
              swapCounts[targetRegion] += cells.length;
            }
            // Validate every connected piece and every compensating water swap
            // before the first political ownership mutation.
            const plannedWaterSwaps = new Map<number, readonly number[]>();
            if (assignmentValid) {
              for (let region = 0; region < REGION_COUNT; region += 1) {
                const swapCount = swapCounts[region]!;
                if (swapCount === 0) continue;
                const waterSwapCandidates = Array.from(
                  { length: grid.cellCount },
                  (_, cell) => cell,
                ).filter(cell => (
                  regionId[cell] === region
                  && !strategicallyPassableSurface(waterRegime[cell]!)
                  && legacyProtectedCell[cell] === 0
                ));
                if (waterSwapCandidates.length < swapCount) {
                  assignmentValid = false;
                  break;
                }
                plannedWaterSwaps.set(
                  region,
                  Object.freeze(waterSwapCandidates.slice(0, swapCount)),
                );
              }
            }
            if (assignmentValid) {
              for (const { cells, targetRegion } of assignments) {
                for (const cell of cells) {
                  regionId[cell] = targetRegion;
                  regionRepairLocked[cell] = 1;
                }
              }
              for (const cells of plannedWaterSwaps.values()) {
                for (const cell of cells) regionId[cell] = sourceRegion;
              }
            }
          }
        }
      }
    }
  }
  const finalCounts = Array<number>(REGION_COUNT).fill(0);
  for (const region of regionId) finalCounts[region] += 1;
  if (finalCounts.some((count, region) => count !== initialCounts[region])) {
    fail('GREATER_REALM_REGION_COHERENCE_BALANCE_FAILED');
  }
  const finalTierCounts: [number, number, number] = [0, 0, 0];
  for (const tier of tierId) finalTierCounts[tier - 1] += 1;
  if (finalTierCounts.some((count, tier) => count !== strategy.tierCounts[tier])) {
    fail('GREATER_REALM_TIER_COHERENCE_BALANCE_FAILED');
  }
  // Every outer/middle realm must own more traversable land than the compact
  // throne realm. Grow deficient realms outward from their dominant land body
  // through same-tier political boundaries, then exchange an equal number of
  // non-passable ownership cells with each donor. Geometry and tier totals are
  // untouched; only the natural border follows the usable land more closely.
  const initialPassableTopology = passableRegionTopology(
    grid,
    regionId,
    waterRegime,
    new Uint8Array(grid.cellCount),
  );
  const passableFloor = initialPassableTopology.passableCounts[TIER_III_REGION_INDEX]! + 512;
  const regionsByNeed = Array.from({ length: TIER_III_REGION_INDEX }, (_, region) => region)
    .sort((first, second) => (
      initialPassableTopology.passableCounts[first]!
        - initialPassableTopology.passableCounts[second]!
      || first - second
    ));
  for (const targetRegion of regionsByNeed) {
    const currentTopology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const needed = passableFloor - currentTopology.passableCounts[targetRegion]!;
    if (needed <= 0) continue;
    const largestComponent = currentTopology.largestComponentByRegion[targetRegion]!;
    if (largestComponent < 0) continue;
    const donorCapacity = currentTopology.passableCounts.map((count, region) => (
      region === targetRegion
        || GREATER_REALM_REGION_SPECS[region]!.tier
          !== GREATER_REALM_REGION_SPECS[targetRegion]!.tier
        ? 0
        : Math.max(0, count - passableFloor)
    ));
    const seen = new Uint8Array(grid.cellCount);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (currentTopology.componentId[cell] !== largestComponent) continue;
      seen[cell] = 1;
      queue[tail++] = cell;
    }
    const annex: number[] = [];
    const donorCounts = new Uint32Array(REGION_COUNT);
    while (head < tail && annex.length < needed) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || seen[neighbor] === 1
          || tierId[neighbor] !== tierId[cell]
          || !strategicallyPassableSurface(waterRegime[neighbor]!)
          || legacyProtectedCell[neighbor] === 1
        ) continue;
        const donor = regionId[neighbor]!;
        if (donor !== targetRegion && donorCapacity[donor]! <= 0) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
        if (donor !== targetRegion) {
          annex.push(neighbor);
          donorCounts[donor] += 1;
          donorCapacity[donor] -= 1;
          if (annex.length >= needed) break;
        }
      }
    }
    if (annex.length < needed) continue;
    const waterSwaps = new Map<number, number[]>();
    const reservedWater = new Set<number>();
    let swapsAvailable = true;
    for (let donor = 0; donor < REGION_COUNT; donor += 1) {
      const swapCount = donorCounts[donor]!;
      if (swapCount === 0) continue;
      const candidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          reservedWater.has(cell)
          || regionId[cell] !== targetRegion
          || strategicallyPassableSurface(waterRegime[cell]!)
          || legacyProtectedCell[cell] === 1
        ) continue;
        candidates.push(cell);
      }
      candidates.sort((first, second) => {
        const contacts = (candidate: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[candidate * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === donor) count += 1;
          }
          return count;
        };
        return contacts(second) - contacts(first) || first - second;
      });
      if (candidates.length < swapCount) {
        swapsAvailable = false;
        break;
      }
      const selected = candidates.slice(0, swapCount);
      for (const cell of selected) reservedWater.add(cell);
      waterSwaps.set(donor, selected);
    }
    if (!swapsAvailable) continue;
    for (const cell of annex) regionId[cell] = targetRegion;
    for (const [donor, cells] of waterSwaps) {
      for (const cell of cells) regionId[cell] = donor;
    }
  }
  const noBarrier = new Uint8Array(grid.cellCount);
  const topology = passableRegionTopology(grid, regionId, waterRegime, noBarrier);
  const contactScores = Array.from({ length: TIER_I_REGION_COUNT }, () => (
    new Uint32Array(TIER_II_REGION_COUNT)
  ));
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
      const first = regionId[cell]! < TIER_I_REGION_COUNT ? cell : neighbor;
      const second = first === cell ? neighbor : cell;
      const child = regionId[first]!;
      const parent = regionId[second]!;
      if (child >= TIER_I_REGION_COUNT || parent < 6 || parent > 8) continue;
      if (waterRegime[first] !== 0 || waterRegime[second] !== 0) continue;
      const firstComponent = topology.componentId[first]!;
      const secondComponent = topology.componentId[second]!;
      const durable = firstComponent >= 0
        && secondComponent >= 0
        && topology.componentSizes[firstComponent]! >= 64
        && topology.componentSizes[secondComponent]! >= 64;
      contactScores[child]![parent - 6] += durable ? 101 : 1;
    }
  }
  const provisionalParent = new Uint8Array(TIER_I_REGION_COUNT);
  for (const [child, parent] of strategy.gateGraph) {
    if (child < TIER_I_REGION_COUNT && parent >= 6 && parent <= 8) {
      provisionalParent[child] = parent;
    }
  }
  let bestAssignment: readonly number[] | undefined;
  let bestBottleneck = -1;
  let bestTotal = -1;
  let bestProvisionalMatches = -1;
  // 3^6 is a tiny, fixed search. Enforce two children per T2 parent and choose
  // the graph with the strongest real dry saddle contacts after coherence
  // repair; the former basin parent is retained as a deterministic tie-break.
  for (let encoded = 0; encoded < 729; encoded += 1) {
    let cursor = encoded;
    const assignment = Array<number>(TIER_I_REGION_COUNT).fill(0);
    const counts = [0, 0, 0];
    let bottleneck = Number.POSITIVE_INFINITY;
    let total = 0;
    let provisionalMatches = 0;
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      const parentOffset = cursor % 3;
      cursor = Math.floor(cursor / 3);
      assignment[child] = parentOffset + 6;
      counts[parentOffset] += 1;
      const score = contactScores[child]![parentOffset]!;
      bottleneck = Math.min(bottleneck, score);
      total += score;
      if (provisionalParent[child] === parentOffset + 6) provisionalMatches += 1;
    }
    if (counts.some(count => count !== 2)) continue;
    if (
      bottleneck > bestBottleneck
      || (bottleneck === bestBottleneck && total > bestTotal)
      || (
        bottleneck === bestBottleneck
        && total === bestTotal
        && provisionalMatches > bestProvisionalMatches
      )
    ) {
      bestAssignment = assignment;
      bestBottleneck = bottleneck;
      bestTotal = total;
      bestProvisionalMatches = provisionalMatches;
    }
  }
  if (!bestAssignment) fail('GREATER_REALM_GATE_PARENT_ASSIGNMENT_FAILED');
  const gateGraph: GreaterRealmGateGraphEdge[] = [];
  for (let parent = 6; parent <= 8; parent += 1) {
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      if (bestAssignment[child] === parent) {
        gateGraph.push(Object.freeze([child, parent] as const));
      }
    }
  }
  gateGraph.push(
    Object.freeze([6, 9] as const),
    Object.freeze([7, 9] as const),
    Object.freeze([8, 9] as const),
  );
  const minimumGateFootholdCells = 512;
  const growGateFoothold = (endpoint: number, targetRegion: number): boolean => {
    let currentTopology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const component = currentTopology.componentId[endpoint]!;
    if (component < 0) return false;
    if (currentTopology.componentSizes[component]! >= minimumGateFootholdCells) return true;
    const seen = new Uint8Array(grid.cellCount);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (currentTopology.componentId[cell] !== component) continue;
      seen[cell] = 1;
      queue[tail++] = cell;
    }
    const annex: number[] = [];
    const donorCounts = new Uint32Array(REGION_COUNT);
    while (head < tail && tail < minimumGateFootholdCells) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || seen[neighbor] === 1
          || tierId[neighbor] !== tierId[endpoint]
          || !strategicallyPassableSurface(waterRegime[neighbor]!)
          || legacyProtectedCell[neighbor] === 1
        ) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
        if (regionId[neighbor] !== targetRegion) {
          annex.push(neighbor);
          donorCounts[regionId[neighbor]!] += 1;
        }
        if (tail >= minimumGateFootholdCells) break;
      }
    }
    if (tail < minimumGateFootholdCells) return false;
    const waterSwaps = new Map<number, number[]>();
    const reservedWater = new Set<number>();
    for (let donor = 0; donor < REGION_COUNT; donor += 1) {
      const needed = donorCounts[donor]!;
      if (needed === 0) continue;
      const candidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          reservedWater.has(cell)
          || regionId[cell] !== targetRegion
          || strategicallyPassableSurface(waterRegime[cell]!)
          || legacyProtectedCell[cell] === 1
        ) continue;
        candidates.push(cell);
      }
      candidates.sort((first, second) => {
        const contacts = (cell: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === donor) count += 1;
          }
          return count;
        };
        return contacts(second) - contacts(first) || first - second;
      });
      if (candidates.length < needed) return false;
      const selected = candidates.slice(0, needed);
      for (const cell of selected) reservedWater.add(cell);
      waterSwaps.set(donor, selected);
    }
    for (const cell of annex) regionId[cell] = targetRegion;
    for (const [donor, cells] of waterSwaps) {
      for (const cell of cells) regionId[cell] = donor;
    }
    currentTopology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const grownComponent = currentTopology.componentId[endpoint]!;
    return grownComponent >= 0
      && currentTopology.componentSizes[grownComponent]! >= minimumGateFootholdCells;
  };
  const createBorrowedGateFoothold = (
    targetRegion: number,
    adjacentRegion: number,
  ): boolean => {
    const topology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const boundarySeeds: number[] = [];
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        tierId[cell] !== GREATER_REALM_REGION_SPECS[targetRegion]!.tier
        || regionId[cell] === targetRegion
        || waterRegime[cell] !== 0
        || legacyProtectedCell[cell] === 1
        || regionRepairLocked[cell] === 1
      ) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && regionId[neighbor] === adjacentRegion
          && waterRegime[neighbor] === 0
        ) {
          boundarySeeds.push(cell);
          break;
        }
      }
    }
    boundarySeeds.sort((first, second) => {
      const firstSize = topology.componentSizes[topology.componentId[first]!] ?? 0;
      const secondSize = topology.componentSizes[topology.componentId[second]!] ?? 0;
      return secondSize - firstSize || first - second;
    });
    for (const seed of boundarySeeds.slice(0, 256)) {
      const donor = regionId[seed]!;
      const donorComponent = topology.componentId[seed]!;
      if (donorComponent < 0 || topology.componentSizes[donorComponent]! < 2_048) continue;
      const seen = new Uint8Array(grid.cellCount);
      const queue = new Uint32Array(grid.cellCount);
      let head = 0;
      let tail = 0;
      seen[seed] = 1;
      queue[tail++] = seed;
      while (head < tail && tail < minimumGateFootholdCells) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || seen[neighbor] === 1
            || regionId[neighbor] !== donor
            || !strategicallyPassableSurface(waterRegime[neighbor]!)
            || legacyProtectedCell[neighbor] === 1
            || regionRepairLocked[neighbor] === 1
          ) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
          if (tail >= minimumGateFootholdCells) break;
        }
      }
      if (tail < minimumGateFootholdCells) continue;
      const patch = Array.from(queue.slice(0, minimumGateFootholdCells));
      let dryContacts = 0;
      for (const cell of patch) {
        if (waterRegime[cell] !== 0) continue;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && regionId[neighbor] === adjacentRegion
            && waterRegime[neighbor] === 0
          ) dryContacts += 1;
        }
      }
      if (dryContacts < 2) continue;
      const waterSwapCandidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          regionId[cell] === targetRegion
          && !strategicallyPassableSurface(waterRegime[cell]!)
          && legacyProtectedCell[cell] === 0
        ) waterSwapCandidates.push(cell);
      }
      if (waterSwapCandidates.length < patch.length) continue;
      waterSwapCandidates.sort((first, second) => {
        const donorContacts = (cell: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === donor) count += 1;
          }
          return count;
        };
        return donorContacts(second) - donorContacts(first) || first - second;
      });
      for (const cell of patch) {
        regionId[cell] = targetRegion;
        regionRepairLocked[cell] = 1;
      }
      for (let index = 0; index < patch.length; index += 1) {
        regionId[waterSwapCandidates[index]!] = donor;
      }
      const postBorrowTopology = passableRegionTopology(
        grid,
        regionId,
        waterRegime,
        new Uint8Array(grid.cellCount),
      );
      const donorMinimumShare = donor < TIER_I_REGION_COUNT
        ? donor === 4 ? 6_500 : 8_500
        : donor < TIER_III_REGION_INDEX ? 9_000 : 9_500;
      if (postBorrowTopology.largestSharesBasisPoints[donor]! < donorMinimumShare) {
        // A gate district must be borrowed from a shoreline, not carved as a
        // stripe through the donor's dominant body. Reject any patch that
        // would split that realm below its strict coherence margin.
        for (const cell of patch) {
          regionId[cell] = donor;
          regionRepairLocked[cell] = 0;
        }
        for (let index = 0; index < patch.length; index += 1) {
          regionId[waterSwapCandidates[index]!] = targetRegion;
        }
        continue;
      }
      return true;
    }
    return false;
  };
  for (const [firstRegion, secondRegion] of gateGraph) {
    let topologyAtGate = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const edges: Array<readonly [number, number]> = [];
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor <= cell || waterRegime[cell] !== 0 || waterRegime[neighbor] !== 0) continue;
        if (
          regionId[cell] === firstRegion
          && regionId[neighbor] === secondRegion
        ) edges.push(Object.freeze([cell, neighbor] as const));
        else if (
          regionId[cell] === secondRegion
          && regionId[neighbor] === firstRegion
        ) edges.push(Object.freeze([neighbor, cell] as const));
      }
    }
    edges.sort((first, second) => {
      const strength = (edge: readonly [number, number]) => Math.min(
        topologyAtGate.componentSizes[topologyAtGate.componentId[edge[0]!]!] ?? 0,
        topologyAtGate.componentSizes[topologyAtGate.componentId[edge[1]!]!] ?? 0,
      );
      return strength(second) - strength(first) || first[0] - second[0] || first[1] - second[1];
    });
    let edge = edges[0];
    if (!edge) {
      createBorrowedGateFoothold(firstRegion, secondRegion);
      topologyAtGate = passableRegionTopology(
        grid,
        regionId,
        waterRegime,
        new Uint8Array(grid.cellCount),
      );
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor <= cell || waterRegime[cell] !== 0 || waterRegime[neighbor] !== 0) continue;
          if (regionId[cell] === firstRegion && regionId[neighbor] === secondRegion) {
            edges.push(Object.freeze([cell, neighbor] as const));
          } else if (regionId[cell] === secondRegion && regionId[neighbor] === firstRegion) {
            edges.push(Object.freeze([neighbor, cell] as const));
          }
        }
      }
      edges.sort((first, second) => {
        const strength = (candidate: readonly [number, number]) => Math.min(
          topologyAtGate.componentSizes[topologyAtGate.componentId[candidate[0]!]!] ?? 0,
          topologyAtGate.componentSizes[topologyAtGate.componentId[candidate[1]!]!] ?? 0,
        );
        return strength(second) - strength(first)
          || first[0] - second[0]
          || first[1] - second[1];
      });
      edge = edges[0];
    }
    if (!edge) continue;
    if (!growGateFoothold(edge[0], firstRegion)) {
      createBorrowedGateFoothold(firstRegion, secondRegion);
    }
    topologyAtGate = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    // The opposite endpoint remains adjacent after a same-tier foothold edit.
    if (!growGateFoothold(edge[1], secondRegion)) {
      createBorrowedGateFoothold(secondRegion, firstRegion);
    }
  }
  const balancedCounts = Array<number>(REGION_COUNT).fill(0);
  const balancedTierCounts = [0, 0, 0];
  for (const region of regionId) balancedCounts[region] += 1;
  for (const tier of tierId) balancedTierCounts[tier - 1] += 1;
  if (balancedCounts.some((count, region) => count !== initialCounts[region])) {
    fail('GREATER_REALM_GATE_FOOTHOLD_BALANCE_FAILED');
  }
  if (balancedTierCounts.some((count, tier) => count !== strategy.tierCounts[tier])) {
    fail('GREATER_REALM_GATE_FOOTHOLD_TIER_BALANCE_FAILED');
  }
  return Object.freeze({
    ...strategy,
    tierId,
    regionId,
    regionCounts: Object.freeze(balancedCounts),
    gateGraph: Object.freeze(gateGraph),
  });
}

type GreaterRealmPassableRegionTopology = Readonly<{
  componentId: Int32Array;
  componentSizes: readonly number[];
  largestComponentByRegion: readonly number[];
  passableCounts: readonly number[];
  largestCounts: readonly number[];
  largestSharesBasisPoints: readonly number[];
  proof: boolean;
}>;

type GreaterRealmRobustRegionTopology = Readonly<{
  articulation: Uint8Array;
  componentId: Int32Array;
  componentSizes: readonly number[];
}>;

function strategicallyPassableSurface(waterRegime: number): boolean {
  // Ocean/lake cells require future naval or bridge mechanics. River and
  // stream corridors are retained as fordable route surfaces for topology;
  // castle and gate endpoint suitability still requires a dry cell.
  return waterRegime === 0 || waterRegime === 3 || waterRegime === 4;
}

function passableRegionTopology(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
): GreaterRealmPassableRegionTopology {
  const componentId = new Int32Array(grid.cellCount);
  componentId.fill(-1);
  const componentSizes: number[] = [];
  const largestComponentByRegion = Array<number>(REGION_COUNT).fill(-1);
  const passableCounts = Array<number>(REGION_COUNT).fill(0);
  const largestCounts = Array<number>(REGION_COUNT).fill(0);
  const queue = new Uint32Array(grid.cellCount);
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (!strategicallyPassableSurface(waterRegime[start]!) || barrier[start] !== 0) continue;
    const region = regionId[start]!;
    passableCounts[region] += 1;
    if (componentId[start] >= 0) continue;
    const id = componentSizes.length;
    let head = 0;
    let tail = 0;
    let size = 0;
    componentId[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++]!;
      size += 1;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || componentId[neighbor] >= 0
          || regionId[neighbor] !== region
          || !strategicallyPassableSurface(waterRegime[neighbor]!)
          || barrier[neighbor] !== 0
        ) continue;
        componentId[neighbor] = id;
        queue[tail++] = neighbor;
      }
    }
    componentSizes.push(size);
    if (size > largestCounts[region]!) {
      largestCounts[region] = size;
      largestComponentByRegion[region] = id;
    }
  }
  // The first pass counted only component roots for cells seen later. Derive
  // exact totals independently from the final passability mask.
  passableCounts.fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (strategicallyPassableSurface(waterRegime[cell]!) && barrier[cell] === 0) {
      passableCounts[regionId[cell]!] += 1;
    }
  }
  const largestSharesBasisPoints = passableCounts.map((count, region) => (
    count === 0 ? 0 : Math.round((largestCounts[region]! * 10_000) / count)
  ));
  const proof = largestSharesBasisPoints.every((share, region) => (
    region < TIER_I_REGION_COUNT ? share >= (region === 4 ? 5_500 : 8_000)
      : region < TIER_III_REGION_INDEX ? share >= 8_500
        : share >= 9_000
  ));
  return Object.freeze({
    componentId,
    componentSizes: Object.freeze(componentSizes),
    largestComponentByRegion: Object.freeze(largestComponentByRegion),
    passableCounts: Object.freeze(passableCounts),
    largestCounts: Object.freeze(largestCounts),
    largestSharesBasisPoints: Object.freeze(largestSharesBasisPoints),
    proof,
  });
}

/**
 * Derive disjoint, vertex-biconnected regional cores from the final
 * passability graph. Tarjan blocks retain a genuinely articulation-free core
 * even when a harmless spur is attached to it. Because articulation vertices
 * can belong to several blocks, each is owned by its largest incident block
 * (stable block id breaks ties) and every conflicting block is discarded.
 * The remaining component ids therefore describe complete, non-overlapping
 * biconnected subgraphs rather than the fragments produced by deleting the
 * original graph's articulation vertices only once.
 */
function robustRegionTopology(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
): GreaterRealmRobustRegionTopology {
  const discovery = new Int32Array(grid.cellCount);
  const low = new Int32Array(grid.cellCount);
  const parent = new Int32Array(grid.cellCount);
  const nextNeighbor = new Uint8Array(grid.cellCount);
  const childCount = new Uint8Array(grid.cellCount);
  const articulation = new Uint8Array(grid.cellCount);
  const edgeFirst: number[] = [];
  const edgeSecond: number[] = [];
  const blocks: number[][] = [];
  const blockMark = new Uint32Array(grid.cellCount);
  let blockGeneration = 0;
  discovery.fill(-1);
  parent.fill(-1);
  let clock = 0;
  const passable = (cell: number) => (
    strategicallyPassableSurface(waterRegime[cell]!)
    && barrier[cell] === 0
  );
  for (let root = 0; root < grid.cellCount; root += 1) {
    if (!passable(root) || discovery[root] >= 0) continue;
    const stack: number[] = [root];
    discovery[root] = clock;
    low[root] = clock;
    clock += 1;
    while (stack.length > 0) {
      const cell = stack[stack.length - 1]!;
      const direction = nextNeighbor[cell]!;
      if (direction < HEX_NEIGHBOR_COUNT) {
        nextNeighbor[cell] = direction + 1;
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || regionId[neighbor] !== regionId[cell]
          || !passable(neighbor)
        ) continue;
        if (discovery[neighbor] < 0) {
          parent[neighbor] = cell;
          childCount[cell] += 1;
          edgeFirst.push(cell);
          edgeSecond.push(neighbor);
          discovery[neighbor] = clock;
          low[neighbor] = clock;
          clock += 1;
          stack.push(neighbor);
          continue;
        }
        if (neighbor !== parent[cell] && discovery[neighbor]! < discovery[cell]!) {
          edgeFirst.push(cell);
          edgeSecond.push(neighbor);
          low[cell] = Math.min(low[cell]!, discovery[neighbor]!);
        }
        continue;
      }
      stack.pop();
      const ancestor = parent[cell]!;
      if (ancestor < 0) {
        if (childCount[cell]! > 1) articulation[cell] = 1;
        if (childCount[cell] === 0) blocks.push([cell]);
        continue;
      }
      low[ancestor] = Math.min(low[ancestor]!, low[cell]!);
      if (low[cell]! < discovery[ancestor]!) continue;
      if (parent[ancestor]! >= 0) articulation[ancestor] = 1;
      blockGeneration += 1;
      if (blockGeneration === 0xffff_ffff) fail('GREATER_REALM_BICONNECTED_MARK_OVERFLOW');
      const vertices: number[] = [];
      let foundTreeEdge = false;
      while (edgeFirst.length > 0) {
        const second = edgeSecond.pop()!;
        const first = edgeFirst.pop()!;
        if (blockMark[first] !== blockGeneration) {
          blockMark[first] = blockGeneration;
          vertices.push(first);
        }
        if (blockMark[second] !== blockGeneration) {
          blockMark[second] = blockGeneration;
          vertices.push(second);
        }
        if (first === ancestor && second === cell) {
          foundTreeEdge = true;
          break;
        }
      }
      if (!foundTreeEdge) fail('GREATER_REALM_BICONNECTED_EDGE_STACK_CORRUPT');
      vertices.sort((first, second) => first - second);
      blocks.push(vertices);
    }
  }
  if (edgeFirst.length !== 0 || edgeSecond.length !== 0) {
    fail('GREATER_REALM_BICONNECTED_EDGE_STACK_NOT_EMPTY');
  }

  // An articulation may participate in multiple valid blocks. Give it to one
  // deterministic largest block, then discard every block that would be
  // incomplete without that vertex. Kept cores are therefore complete
  // biconnected induced subgraphs and can safely use a single component id.
  const articulationOwner = new Int32Array(grid.cellCount);
  articulationOwner.fill(-1);
  for (let block = 0; block < blocks.length; block += 1) {
    for (const cell of blocks[block]!) {
      if (articulation[cell] !== 1) continue;
      const current = articulationOwner[cell]!;
      if (
        current < 0
        || blocks[block]!.length > blocks[current]!.length
        || (blocks[block]!.length === blocks[current]!.length && block < current)
      ) articulationOwner[cell] = block;
    }
  }
  const componentId = new Int32Array(grid.cellCount);
  componentId.fill(-1);
  const componentSizes: number[] = [];
  for (let block = 0; block < blocks.length; block += 1) {
    const vertices = blocks[block]!;
    if (vertices.some(cell => (
      articulation[cell] === 1 && articulationOwner[cell] !== block
    ))) continue;
    const id = componentSizes.length;
    for (const cell of vertices) {
      if (componentId[cell] >= 0) fail('GREATER_REALM_BICONNECTED_CORE_OVERLAP');
      componentId[cell] = id;
    }
    componentSizes.push(vertices.length);
  }
  return Object.freeze({
    articulation,
    componentId,
    componentSizes: Object.freeze(componentSizes),
  });
}

type GreaterRealmStrategicShapeMetrics = Readonly<{
  minorFragmentSharesBasisPoints: readonly number[];
  boundaryDensityBasisPoints: readonly number[];
  tendrilSharesBasisPoints: readonly number[];
  tierRadialAgreementBasisPoints: number;
  radialTierOneBoundaryShareBasisPoints: number;
  fragmentationProof: boolean;
  compactnessProof: boolean;
  tendrilProof: boolean;
  nonRadialProof: boolean;
}>;

function strategicShapeMetrics(
  grid: IndexedAxialGrid,
  tierId: Uint8Array,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  topology: GreaterRealmPassableRegionTopology,
): GreaterRealmStrategicShapeMetrics {
  const minorCells = Array<number>(REGION_COUNT).fill(0);
  const componentRegion = Array<number>(topology.componentSizes.length).fill(-1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const component = topology.componentId[cell]!;
    if (component >= 0 && componentRegion[component] === -1) {
      componentRegion[component] = regionId[cell]!;
    }
  }
  for (let component = 0; component < topology.componentSizes.length; component += 1) {
    if (topology.componentSizes[component]! >= 64) continue;
    const region = componentRegion[component]!;
    if (region >= 0) minorCells[region] += topology.componentSizes[component]!;
  }
  const boundarySides = Array<number>(REGION_COUNT).fill(0);
  const tendrils = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (!strategicallyPassableSurface(waterRegime[cell]!) || barrier[cell] !== 0) continue;
    const region = regionId[cell]!;
    let sameRegionNeighbors = 0;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === region
        && strategicallyPassableSurface(waterRegime[neighbor]!)
        && barrier[neighbor] === 0
      ) sameRegionNeighbors += 1;
      else boundarySides[region] += 1;
    }
    if (sameRegionNeighbors <= 1) tendrils[region] += 1;
  }
  const minorFragmentSharesBasisPoints = topology.passableCounts.map((count, region) => (
    count === 0 ? 10_000 : Math.round((minorCells[region]! * 10_000) / count)
  ));
  const boundaryDensityBasisPoints = topology.passableCounts.map((count, region) => (
    count === 0
      ? 10_000
      : Math.round((boundarySides[region]! * 10_000) / (count * HEX_NEIGHBOR_COUNT))
  ));
  const tendrilSharesBasisPoints = topology.passableCounts.map((count, region) => (
    count === 0 ? 10_000 : Math.round((tendrils[region]! * 10_000) / count)
  ));

  let tierThreeQ = 0;
  let tierThreeR = 0;
  let tierThreeCells = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] !== 3) continue;
    tierThreeQ += grid.q[cell]!;
    tierThreeR += grid.r[cell]!;
    tierThreeCells += 1;
  }
  const roundedRatio = (numerator: number, denominator: number) => numerator >= 0
    ? Math.floor((numerator * 2 + denominator) / (denominator * 2))
    : -Math.floor((-numerator * 2 + denominator) / (denominator * 2));
  const centerQ = roundedRatio(tierThreeQ, tierThreeCells);
  const centerR = roundedRatio(tierThreeR, tierThreeCells);
  const radialTierCounts = new Map<number, [number, number, number]>();
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const radius = axialDistance(grid.q[cell]!, grid.r[cell]!, centerQ, centerR);
    const counts = radialTierCounts.get(radius) ?? [0, 0, 0];
    counts[tierId[cell]! - 1] += 1;
    radialTierCounts.set(radius, counts);
  }
  let radialModalCells = 0;
  for (const counts of radialTierCounts.values()) radialModalCells += Math.max(...counts);
  const tierRadialAgreementBasisPoints = Math.round(
    (radialModalCells * 10_000) / grid.cellCount,
  );
  let tierOneBoundaryEdges = 0;
  let radialTierOneBoundaryEdges = 0;
  const centerX = 2 * centerQ + centerR;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[neighbor] !== 1
        || regionId[neighbor] === regionId[cell]
      ) continue;
      tierOneBoundaryEdges += 1;
      const midpointX = (2 * grid.q[cell]! + grid.r[cell]!)
        + (2 * grid.q[neighbor]! + grid.r[neighbor]!)
        - 2 * centerX;
      const midpointR = grid.r[cell]! + grid.r[neighbor]! - 2 * centerR;
      const deltaQ = grid.q[neighbor]! - grid.q[cell]!;
      const deltaR = grid.r[neighbor]! - grid.r[cell]!;
      const edgeX = 2 * deltaQ + deltaR;
      const dot = midpointX * edgeX + 3 * midpointR * deltaR;
      const radialNorm = midpointX * midpointX + 3 * midpointR * midpointR;
      const edgeNorm = edgeX * edgeX + 3 * deltaR * deltaR;
      if (
        BigInt(dot) * BigInt(dot) * 100n
        <= BigInt(radialNorm) * BigInt(edgeNorm) * 16n
      ) radialTierOneBoundaryEdges += 1;
    }
  }
  const radialTierOneBoundaryShareBasisPoints = tierOneBoundaryEdges === 0
    ? 10_000
    : Math.round((radialTierOneBoundaryEdges * 10_000) / tierOneBoundaryEdges);
  return Object.freeze({
    minorFragmentSharesBasisPoints: Object.freeze(minorFragmentSharesBasisPoints),
    boundaryDensityBasisPoints: Object.freeze(boundaryDensityBasisPoints),
    tendrilSharesBasisPoints: Object.freeze(tendrilSharesBasisPoints),
    tierRadialAgreementBasisPoints,
    radialTierOneBoundaryShareBasisPoints,
    fragmentationProof: minorFragmentSharesBasisPoints.every((share, region) => (
      share <= (region === 4 ? 500 : 300)
    )),
    compactnessProof: boundaryDensityBasisPoints.every(share => share <= 1_000),
    tendrilProof: tendrilSharesBasisPoints.every(share => share <= 150),
    nonRadialProof: tierRadialAgreementBasisPoints <= 9_200
      && radialTierOneBoundaryShareBasisPoints <= 4_500,
  });
}

function waterAndBiomes(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  filledElevation: Int32Array,
  flowReceiver: Int32Array,
  accumulation: BigUint64Array,
  tierId: Uint8Array,
  legacyProtectedCell: Uint8Array,
  temperatureField: Int32Array,
  moistureField: Int32Array,
): Readonly<{
  waterRegime: Uint8Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  majorRiverCount: number;
  minorStreamCount: number;
  lakeCount: number;
  lakeBasinCandidates: number;
  riverMouthCandidates: number;
  streamHeadCandidates: number;
}> {
  const lakeCandidate = new Uint8Array(grid.cellCount);
  const belowSea = new Uint8Array(grid.cellCount);
  const majorRiverNetwork = new Uint8Array(grid.cellCount);
  const minorStreamNetwork = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (elevation[cell]! <= SEA_LEVEL) belowSea[cell] = 1;
    if (
      legacyProtectedCell[cell] !== 1
      && elevation[cell]! > SEA_LEVEL
      && filledElevation[cell]! - elevation[cell]! >= 80
    ) {
      lakeCandidate[cell] = 1;
    }
    if (legacyProtectedCell[cell] === 1 || elevation[cell]! <= SEA_LEVEL) continue;
    const discharge = Number(accumulation[cell]!);
    if (discharge >= MAJOR_RIVER_DISCHARGE) majorRiverNetwork[cell] = 1;
    else if (discharge >= 96) minorStreamNetwork[cell] = 1;
  }
  const allLakeComponents = [...connectedComponentsAtEqualSurface(
    grid,
    lakeCandidate,
    filledElevation,
  )]
    .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
  const majorRiverCount = connectedComponents(grid, majorRiverNetwork).length;
  let minorStreamCount = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (minorStreamNetwork[cell] !== 1) continue;
    let hasUpstreamStream = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && minorStreamNetwork[neighbor] === 1
        && flowReceiver[neighbor] === cell
      ) {
        hasUpstreamStream = true;
        break;
      }
    }
    if (!hasUpstreamStream) minorStreamCount += 1;
  }
  const waterRegime = new Uint8Array(grid.cellCount);
  let existingMajorBodies = 0;
  for (const component of connectedComponents(grid, belowSea)) {
    const touchesActiveBoundary = component.some(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) return true;
      }
      return false;
    });
    const regime = touchesActiveBoundary
      ? WATER_OCEAN
      : component.length >= 48 ? WATER_SEA : WATER_LAKE;
    if (regime === WATER_OCEAN || regime === WATER_SEA) existingMajorBodies += 1;
    for (const cell of component) waterRegime[cell] = regime;
  }
  const targetMajorBodies = 4 + (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('inland-sea-body-count'),
      0,
      0,
    ) % 3
  );
  const inlandSeaComponents = allLakeComponents
    .filter(component => component.length >= 48)
    .slice(0, Math.max(0, targetMajorBodies - existingMajorBodies));
  const inlandSeaCells = new Set(inlandSeaComponents.flat());
  for (const component of inlandSeaComponents) {
    for (const cell of component) waterRegime[cell] = WATER_SEA;
  }
  const selectedLakes: Array<readonly number[]> = [];
  for (const component of allLakeComponents) {
    if (
      selectedLakes.length >= 72
      || component.length < 2
      || component.length > 64
      || inlandSeaCells.has(component[0]!)
    ) continue;
    const level = filledElevation[component[0]!]!;
    const conflicts = component.some(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && waterRegime[neighbor] === WATER_LAKE
          && (elevation[neighbor]! <= SEA_LEVEL ? SEA_LEVEL : filledElevation[neighbor]!) !== level
        ) return true;
      }
      return false;
    });
    if (conflicts) continue;
    selectedLakes.push(component);
    for (const cell of component) waterRegime[cell] = WATER_LAKE;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] === WATER_DRY && majorRiverNetwork[cell] === 1) {
      waterRegime[cell] = WATER_RIVER;
    } else if (waterRegime[cell] === WATER_DRY && minorStreamNetwork[cell] === 1) {
      waterRegime[cell] = WATER_STREAM;
    }
  }

  const biomeId = new Uint8Array(grid.cellCount);
  const landformId = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] !== WATER_DRY) {
      const saltwater = waterRegime[cell] === WATER_OCEAN || waterRegime[cell] === WATER_SEA;
      biomeId[cell] = saltwater ? 20 : waterRegime[cell] === WATER_LAKE ? 21 : 22;
      landformId[cell] = saltwater ? 16 : waterRegime[cell] === WATER_LAKE ? 10 : 2;
      continue;
    }
    let maximumDrop = 0;
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor < 0) continue;
      maximumDrop = Math.max(maximumDrop, Math.abs(elevation[cell]! - elevation[neighbor]!));
    }
    const temperature = temperatureField[cell]!;
    const moisture = moistureField[cell]!;
    if (maximumDrop > 2_500 || elevation[cell]! > 16_000) {
      biomeId[cell] = temperature < 2_500 ? 7 : 19;
      landformId[cell] = elevation[cell]! > 20_000 ? 7 : 6;
    } else if (temperature < 1_800) {
      biomeId[cell] = moisture > 0 ? 6 : 8;
      landformId[cell] = 14;
    } else if (moisture < -1_800) {
      biomeId[cell] = temperature > 6_000 ? 12 : 11;
      landformId[cell] = maximumDrop > 900 ? 9 : 13;
    } else if (moisture > 2_000) {
      biomeId[cell] = tierId[cell] === 1 ? 4 : 5;
      landformId[cell] = maximumDrop > 1_200 ? 5 : 3;
    } else {
      biomeId[cell] = tierId[cell] === 3 ? 15 : 1;
      landformId[cell] = maximumDrop > 1_000 ? 4 : 3;
    }
  }
  return Object.freeze({
    waterRegime,
    biomeId,
    landformId,
    majorRiverCount,
    minorStreamCount,
    lakeCount: selectedLakes.length,
    lakeBasinCandidates: allLakeComponents.length,
    riverMouthCandidates: majorRiverCount,
    streamHeadCandidates: minorStreamCount,
  });
}

/**
 * The generated surface is never allowed to reinterpret the deployed patch.
 * Clear all generated water inside its protected footprint, then project the
 * exact active Water revision and the seven frozen gameplay terrain classes.
 * Detailed legacy hydrology remains in the pinned private patch descriptor.
 */
function overlayLegacyLowlandsSurface(
  grid: IndexedAxialGrid,
  legacy: GreaterRealmLegacyPlacement,
  waterRegime: Uint8Array,
  biomeId: Uint8Array,
  landformId: Uint8Array,
): boolean {
  const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacy.protectedCell[cell] === 1) waterRegime[cell] = 0;
  }
  const tileByKey = new Map(patch.world.tiles.map(tile => [tile.key, tile] as const));
  const visualClass = Object.freeze({
    lowland: Object.freeze([1, 3] as const),
    meadow: Object.freeze([2, 3] as const),
    forest: Object.freeze([4, 3] as const),
    heath: Object.freeze([9, 3] as const),
    ridge: Object.freeze([19, 6] as const),
    lake: Object.freeze([1, 3] as const),
    'ancient-stone': Object.freeze([19, 5] as const),
  });
  for (const metadata of patch.world.metadata) {
    const tile = tileByKey.get(metadata.tileKey);
    if (!tile) return false;
    const cell = grid.indexOf(transformLegacyLowlandsToGlobal(tile, legacy.transform));
    const classification = visualClass[metadata.terrainKind];
    if (cell < 0 || !classification) return false;
    biomeId[cell] = classification[0];
    landformId[cell] = classification[1];
  }
  let enabledWaterCount = 0;
  for (const waterCell of patch.water.enabledCells) {
    const cell = grid.indexOf(transformLegacyLowlandsToGlobal(waterCell, legacy.transform));
    if (cell < 0 || legacy.protectedCell[cell] !== 1) return false;
    waterRegime[cell] = waterCell.regime === 'ocean' ? 1 : waterCell.regime === 'river' ? 3 : 2;
    biomeId[cell] = waterCell.regime === 'ocean' ? 20 : waterCell.regime === 'river' ? 22 : 21;
    landformId[cell] = waterCell.regime === 'ocean' ? 16 : waterCell.regime === 'river' ? 2 : 10;
    enabledWaterCount += 1;
  }
  if (enabledWaterCount !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.waterEnabledCellCount) {
    return false;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacy.castleSlot[cell] === 1 && waterRegime[cell] !== 0) return false;
  }
  return true;
}

function finalHydrologyMetrics(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  filledElevation: Int32Array,
  flowReceiver: Int32Array,
  flowAccumulation: BigUint64Array,
  waterRegime: Uint8Array,
  legacyProtectedCell: Uint8Array,
): Readonly<{
  majorOceanSeaBodies: number;
  majorRivers: number;
  minorStreams: number;
  lakes: number;
  watersheds: number;
  surfaceConsistencyProof: boolean;
}> {
  const regimeComponents = (regime: number) => {
    const included = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (waterRegime[cell] === regime) included[cell] = 1;
    }
    return connectedComponents(grid, included);
  };
  const oceanComponents = regimeComponents(WATER_OCEAN);
  const seaComponents = regimeComponents(WATER_SEA);
  const lakeComponents = regimeComponents(WATER_LAKE);
  const majorOceanSeaBodies = oceanComponents.length + seaComponents.length;
  const lakes = lakeComponents.filter(component => component.length >= 2).length;
  const generatedMajorRiver = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      legacyProtectedCell[cell] !== 1
      && elevation[cell]! > SEA_LEVEL
      && flowAccumulation[cell]! >= BigInt(MAJOR_RIVER_DISCHARGE)
    ) generatedMajorRiver[cell] = 1;
  }
  const majorRivers = connectedComponents(grid, generatedMajorRiver).length;
  let minorStreams = 0;
  let watersheds = 0;
  let surfaceConsistencyProof = true;
  for (const component of oceanComponents) {
    if (!component.some(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) return true;
      }
      return false;
    })) surfaceConsistencyProof = false;
  }
  for (const components of [seaComponents, lakeComponents]) {
    for (const component of components) {
      const componentMask = new Uint8Array(grid.cellCount);
      for (const cell of component) componentMask[cell] = 1;
      const expectedSurface = elevation[component[0]!]! <= SEA_LEVEL
        ? SEA_LEVEL
        : filledElevation[component[0]!]!;
      if (component.some(cell => (
        (elevation[cell]! <= SEA_LEVEL ? SEA_LEVEL : filledElevation[cell]!)
          !== expectedSurface
      ))) {
        surfaceConsistencyProof = false;
        continue;
      }
      const hasLegalSpillOrOutlet = component.some(cell => {
        const receiver = flowReceiver[cell]!;
        if (receiver < 0) return expectedSurface <= SEA_LEVEL;
        if (componentMask[receiver] === 1) return false;
        const receiverSurface = elevation[receiver]! <= SEA_LEVEL
          ? SEA_LEVEL
          : filledElevation[receiver]!;
        return receiverSurface <= expectedSurface;
      });
      if (!hasLegalSpillOrOutlet) surfaceConsistencyProof = false;
    }
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const receiver = flowReceiver[cell]!;
    if (receiver < 0) {
      if (waterRegime[cell] === 0) surfaceConsistencyProof = false;
      if (flowAccumulation[cell]! >= 64n) watersheds += 1;
    }
    if (legacyProtectedCell[cell] === 1) continue;
    if (waterRegime[cell] === 4) {
      let hasUpstreamStream = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && waterRegime[neighbor] === 4
          && flowReceiver[neighbor] === cell
        ) {
          hasUpstreamStream = true;
          break;
        }
      }
      if (!hasUpstreamStream) minorStreams += 1;
    }
    if (
      (waterRegime[cell] === 3 || waterRegime[cell] === 4)
      && receiver >= 0
      && legacyProtectedCell[receiver] !== 1
      && waterRegime[receiver] === 0
    ) surfaceConsistencyProof = false;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacyProtectedCell[cell] !== 1) continue;
    if ((waterRegime[cell] === 0) !== (elevation[cell]! > SEA_LEVEL)) {
      surfaceConsistencyProof = false;
    }
  }
  return Object.freeze({
    majorOceanSeaBodies,
    majorRivers,
    minorStreams,
    lakes,
    watersheds,
    surfaceConsistencyProof,
  });
}

function barrierApproachPaths(
  grid: IndexedAxialGrid,
  endpoint: number,
  region: number,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  targetComponentId: Int32Array,
  targetComponentSizes: readonly number[],
): readonly (readonly number[])[] | undefined {
  const starts: number[] = [];
  for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
    const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
    if (
      neighbor >= 0
      && regionId[neighbor] === region
      && waterRegime[neighbor] === 0
    ) starts.push(neighbor);
  }
  starts.sort((first, second) => first - second);
  const findPath = (
    start: number,
    forbidden: ReadonlySet<number> = new Set<number>(),
  ): number[] | undefined => {
    if (forbidden.has(start)) return undefined;
    const previous = new Int32Array(grid.cellCount);
    const depth = new Uint8Array(grid.cellCount);
    previous.fill(-2);
    previous[start] = -1;
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let target = -1;
    while (head < tail) {
      const cell = queue[head++]!;
      if (
        barrier[cell] === 0
        && targetComponentId[cell]! >= 0
        && targetComponentSizes[targetComponentId[cell]!]! >= 64
      ) {
        target = cell;
        break;
      }
      // Natural coastlines and highland shoulders can separate a valid dry
      // saddle from its region's durable interior by more than twenty cells.
      // This is still a bounded offline search; the path is accepted only if
      // both sides remain sealed from every unintended cross-tier contact.
      if (depth[cell]! >= 64) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || neighbor === endpoint
          || forbidden.has(neighbor)
          || previous[neighbor] !== -2
          || regionId[neighbor] !== region
          || waterRegime[neighbor] !== 0
        ) continue;
        previous[neighbor] = cell;
        depth[neighbor] = depth[cell]! + 1;
        queue[tail++] = neighbor;
      }
    }
    if (target < 0) return undefined;
    const path: number[] = [];
    for (let cell = target; cell >= 0; cell = previous[cell]!) path.push(cell);
    path.reverse();
    return path;
  };
  const paths: number[][] = [];
  const signatures = new Set<string>();
  for (const start of starts) {
    const path = findPath(start);
    if (!path) continue;
    signatures.add(path.join(','));
    paths.push(path);
  }
  // A fixed neighbour order can make two otherwise independent approaches
  // converge on the same short crest route. Deterministically search an
  // alternative for each second start while excluding the first route's
  // non-terminal cells. This proves two real corridors instead of counting
  // two labels on one bridge cell.
  const primaryPaths = [...paths];
  for (const first of primaryPaths) {
    const forbidden = new Set(first);
    for (const start of starts) {
      if (start === first[0]) continue;
      const alternative = findPath(start, forbidden);
      if (!alternative) continue;
      const signature = alternative.join(',');
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      paths.push(alternative);
    }
  }
  paths.sort((first, second) => first.length - second.length || first[0]! - second[0]!);
  if (paths.length < 1) return undefined;
  // Keep the owned coordinate arrays mutable so private-candidate retirement
  // can overwrite their contents; only the collection shape is immutable.
  return Object.freeze(paths);
}

function gateApproachCorridorsDisjoint(
  left: readonly number[],
  right: readonly number[],
): boolean {
  const occupied = new Set(left);
  return right.every(cell => !occupied.has(cell));
}

function compatibleGateApproaches(
  grid: IndexedAxialGrid,
  tierId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  targetComponentId: Int32Array,
  targetComponentSizes: readonly number[],
  first: readonly (readonly number[])[],
  second: readonly (readonly number[])[],
  optionOrdinal = 0,
): Readonly<{
  first: readonly number[];
  firstAlternate: readonly number[];
  second: readonly number[];
  secondAlternate: readonly number[];
  all: readonly (readonly number[])[];
}> | undefined {
  let compatibleOrdinal = 0;
  for (let firstA = 0; firstA < first.length; firstA += 1) {
    for (let secondA = 0; secondA < second.length; secondA += 1) {
      const firstAlternatives = first.map((_, index) => index).filter(index => (
        index !== firstA
        && gateApproachCorridorsDisjoint(first[firstA]!, first[index]!)
      ));
      const secondAlternatives = second.map((_, index) => index).filter(index => (
        index !== secondA
        && gateApproachCorridorsDisjoint(second[secondA]!, second[index]!)
      ));
      for (const firstB of firstAlternatives) {
        for (const secondB of secondAlternatives) {
          const paths = [
            first[firstA]!,
            second[secondA]!,
            first[firstB]!,
            second[secondB]!,
          ];
          const firstTarget = targetComponentId[paths[0]![paths[0]!.length - 1]!]!;
          const secondTarget = targetComponentId[paths[1]![paths[1]!.length - 1]!]!;
          const firstAlternateTarget = targetComponentId[paths[2]![paths[2]!.length - 1]!]!;
          const secondAlternateTarget = targetComponentId[paths[3]![paths[3]!.length - 1]!]!;
          if (
            firstTarget < 0
            || secondTarget < 0
            || firstTarget !== firstAlternateTarget
            || secondTarget !== secondAlternateTarget
            || targetComponentSizes[firstTarget]! < 64
            || targetComponentSizes[secondTarget]! < 64
          ) continue;
          const frozenPaths = Object.freeze(paths);
          const carved = new Set(frozenPaths.flat());
          let bypass = false;
          for (const cell of carved) {
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor >= 0
                && tierId[cell] !== tierId[neighbor]
                && strategicallyPassableSurface(waterRegime[cell]!)
                && strategicallyPassableSurface(waterRegime[neighbor]!)
                && (barrier[cell] === 0 || carved.has(cell))
                && (barrier[neighbor] === 0 || carved.has(neighbor))
              ) {
                bypass = true;
                break;
              }
            }
            if (bypass) break;
          }
          if (!bypass) {
            if (compatibleOrdinal < optionOrdinal) {
              compatibleOrdinal += 1;
              continue;
            }
            return Object.freeze({
              first: first[firstA]!,
              firstAlternate: first[firstB]!,
              second: second[secondA]!,
              secondAlternate: second[secondB]!,
              all: frozenPaths,
            });
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * The geological shoulder is deliberately wider than the exact cross-tier
 * cut. On a narrow peninsula, an interior shoulder cell can therefore split
 * one political region without contributing to the tier seal. Reconnect only
 * those same-region fragments through a bounded pass: every cross-tier
 * contact and every sealed gate endpoint remains locked as barrier authority.
 */
function reconnectBarrierSplitRegionComponents(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  tierId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  gates: readonly GreaterRealmPrivateGate[],
): void {
  const lockedBarrier = new Uint8Array(grid.cellCount);
  for (const gate of gates) {
    lockedBarrier[gate.firstCell] = 1;
    lockedBarrier[gate.secondCell] = 1;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (barrier[cell] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && tierId[neighbor] !== tierId[cell]) {
        lockedBarrier[cell] = 1;
        break;
      }
    }
  }

  for (let region = 0; region < REGION_COUNT; region += 1) {
    // A fixed bound prevents malformed geography from turning repair into an
    // unbounded convergence process. Normal shoulder splits need 1-3 passes.
    for (let repair = 0; repair < 32; repair += 1) {
      const topology = passableRegionTopology(grid, regionId, waterRegime, barrier);
      const targetComponent = topology.largestComponentByRegion[region]!;
      if (targetComponent < 0) break;
      const candidates = topology.componentSizes
        .map((size, component) => Object.freeze({ component, size }))
        .filter(({ component }) => {
          if (component === targetComponent) return false;
          for (let cell = 0; cell < grid.cellCount; cell += 1) {
            if (topology.componentId[cell] === component) return regionId[cell] === region;
          }
          return false;
        })
        .sort((first, second) => second.size - first.size || first.component - second.component)
        .slice(0, 16);
      if (candidates.length === 0) break;

      let repaired = false;
      for (const candidate of candidates) {
        const previous = new Int32Array(grid.cellCount);
        previous.fill(-2);
        const queue = new Uint32Array(grid.cellCount);
        let head = 0;
        let tail = 0;
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (topology.componentId[cell] !== candidate.component) continue;
          previous[cell] = -1;
          queue[tail++] = cell;
        }
        let target = -1;
        while (head < tail && target < 0) {
          const cell = queue[head++]!;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor < 0
              || previous[neighbor] !== -2
              || regionId[neighbor] !== region
              || !strategicallyPassableSurface(waterRegime[neighbor]!)
              || (barrier[neighbor] === 1 && lockedBarrier[neighbor] === 1)
            ) continue;
            previous[neighbor] = cell;
            if (
              barrier[neighbor] === 0
              && topology.componentId[neighbor] === targetComponent
            ) {
              target = neighbor;
              break;
            }
            queue[tail++] = neighbor;
          }
        }
        if (target < 0) continue;
        const passCells: number[] = [];
        for (let cell = target; cell >= 0; cell = previous[cell]!) {
          if (barrier[cell] === 1) passCells.push(cell);
        }
        if (passCells.length === 0 || passCells.length > 16) continue;
        for (const cell of passCells) barrier[cell] = 0;
        repaired = true;
        break;
      }
      if (!repaired) break;
    }
  }
}

function reconcileBarrierMeasuredRegionCoherence(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  tierId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  legacyProtectedCell: Uint8Array,
  protectedApproachCells: ReadonlySet<number>,
): void {
  const initialCounts = Array<number>(REGION_COUNT).fill(0);
  for (const region of regionId) initialCounts[region] += 1;
  const protectedCell = new Uint8Array(grid.cellCount);
  for (const cell of protectedApproachCells) protectedCell[cell] = 1;

  const largestTarget = (region: number) => region < TIER_I_REGION_COUNT
    ? region === 4 ? 6_250 : 8_500
    : region < TIER_III_REGION_INDEX ? 9_000 : 9_500;
  const minorTarget = (region: number) => region === 4 ? 425 : 250;

  const detachableProtectedFoothold = (component: readonly number[]) => {
    if (component.some(cell => legacyProtectedCell[cell] === 1)) return undefined;
    const anchors = component.filter(cell => protectedCell[cell] === 1);
    if (anchors.length === 0) return Object.freeze([...component]);
    // A reviewed gate approach must remain assigned to its endpoint's region,
    // but a large island or peninsula behind that approach need not become an
    // immutable political exclave. Preserve one connected 128-cell foothold
    // containing every protected approach cell, then allow only its hinterland
    // to participate in the ordinary same-tier coherence repair.
    if (component.length <= 128) return undefined;
    const member = new Uint8Array(grid.cellCount);
    for (const cell of component) member[cell] = 1;
    const keep = new Uint8Array(grid.cellCount);
    keep[anchors[0]!] = 1;
    let keepCount = 1;
    for (const anchor of anchors.slice(1)) {
      if (keep[anchor] === 1) continue;
      const previous = new Int32Array(grid.cellCount);
      previous.fill(-2);
      const queue = new Uint32Array(grid.cellCount);
      let head = 0;
      let tail = 0;
      for (const cell of component) {
        if (keep[cell] !== 1) continue;
        previous[cell] = -1;
        queue[tail++] = cell;
      }
      while (head < tail && previous[anchor] === -2) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || member[neighbor] !== 1 || previous[neighbor] !== -2) continue;
          previous[neighbor] = cell;
          queue[tail++] = neighbor;
        }
      }
      if (previous[anchor] === -2) {
        fail('GREATER_REALM_GATE_FOOTHOLD_CONNECTIVITY_INVALID');
      }
      for (let cell = anchor; cell >= 0 && keep[cell] !== 1; cell = previous[cell]!) {
        keep[cell] = 1;
        keepCount += 1;
      }
    }
    for (const anchor of anchors) {
      if (keep[anchor] === 0) fail('GREATER_REALM_GATE_FOOTHOLD_PROTECTION_INVALID');
    }
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (const cell of component) {
      if (keep[cell] === 1) queue[tail++] = cell;
    }
    while (head < tail && keepCount < 128) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || member[neighbor] !== 1 || keep[neighbor] === 1) continue;
        keep[neighbor] = 1;
        keepCount += 1;
        queue[tail++] = neighbor;
        if (keepCount === 128) break;
      }
    }
    const detachable = component.filter(cell => keep[cell] === 0);
    if (detachable.length === 0) return undefined;
    const detachableMask = new Uint8Array(grid.cellCount);
    for (const cell of detachable) detachableMask[cell] = 1;
    return [...connectedComponents(grid, detachableMask)]
      .sort((first, second) => second.length - first.length || first[0]! - second[0]!)[0];
  };

  // Four fixed sweeps let a recipient consolidate a component donated after
  // its prior visit, without an unbounded convergence loop.
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const sweepTopology = passableRegionTopology(grid, regionId, waterRegime, barrier);
    const ordering = Array.from({ length: REGION_COUNT }, (_, region) => region)
      .sort((first, second) => (
        sweepTopology.largestSharesBasisPoints[first]!
          - sweepTopology.largestSharesBasisPoints[second]!
        || first - second
      ));
    for (const sourceRegion of ordering) {
      const included = new Uint8Array(grid.cellCount);
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          regionId[cell] === sourceRegion
          && strategicallyPassableSurface(waterRegime[cell]!)
          && barrier[cell] === 0
        ) included[cell] = 1;
      }
      const components = [...connectedComponents(grid, included)]
        .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
      if (components.length <= 1) continue;
      const largest = components[0]!;
      let remainingTotal = components.reduce((sum, component) => sum + component.length, 0);
      let remainingMinor = components.slice(1).reduce(
        (sum, component) => sum + (component.length < 64 ? component.length : 0),
        0,
      );
      for (const component of components.slice(1)) {
        const largestSatisfied = largest.length * 10_000
          >= remainingTotal * largestTarget(sourceRegion);
        const minorSatisfied = remainingMinor * 10_000
          <= remainingTotal * minorTarget(sourceRegion);
        if (largestSatisfied && minorSatisfied) break;
        const transferableComponent = detachableProtectedFoothold(component);
        if (!transferableComponent) continue;
        const contacts = new Uint32Array(REGION_COUNT);
        const contactedComponents = Array.from(
          { length: REGION_COUNT },
          () => new Set<number>(),
        );
        const topology = passableRegionTopology(grid, regionId, waterRegime, barrier);
        const availableSwapWater = new Uint32Array(REGION_COUNT);
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (
            !strategicallyPassableSurface(waterRegime[cell]!)
            && legacyProtectedCell[cell] === 0
            && protectedCell[cell] === 0
          ) availableSwapWater[regionId[cell]!] += 1;
        }
        for (const cell of transferableComponent) {
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor < 0
              || barrier[neighbor] !== 0
              || !strategicallyPassableSurface(waterRegime[neighbor]!)
              || tierId[neighbor] !== tierId[cell]
              || regionId[neighbor] === sourceRegion
            ) continue;
            contacts[regionId[neighbor]!] += 1;
            const neighborComponent = topology.componentId[neighbor]!;
            if (neighborComponent >= 0) {
              contactedComponents[regionId[neighbor]!]!.add(neighborComponent);
            }
          }
        }
        let targetRegion = -1;
        let bestContacts = -1;
        let bestProjectedShare = -1;
        let selectedJoinedSize = -1;
        let selectedProjectedLargest = -1;
        for (let region = 0; region < REGION_COUNT; region += 1) {
          if (
            region === sourceRegion
            || GREATER_REALM_REGION_SPECS[region]!.tier
              !== GREATER_REALM_REGION_SPECS[sourceRegion]!.tier
            || availableSwapWater[region]! < transferableComponent.length
          ) continue;
          const projectedTotal = topology.passableCounts[region]!
            + transferableComponent.length;
          const joinedRecipientComponents = [...contactedComponents[region]!];
          const joinedSize = transferableComponent.length
            + joinedRecipientComponents
            .reduce((sum, componentId) => sum + topology.componentSizes[componentId]!, 0);
          const projectedLargest = Math.max(topology.largestCounts[region]!, joinedSize);
          const projectedShare = projectedTotal === 0
            ? 0
            : Math.floor((projectedLargest * 10_000) / projectedTotal);
          // A water-separated island has no same-tier land contact to inherit,
          // but its political ownership can still move to a coherent peer while
          // an equal non-passable ownership area moves back. Never cure one
          // fragmented realm by pushing the recipient below its own proof floor.
          if (projectedShare < largestTarget(region)) continue;
          if (
            projectedShare > bestProjectedShare
            || (
              projectedShare === bestProjectedShare
              && contacts[region]! > bestContacts
            )
            || (
              projectedShare === bestProjectedShare
              && contacts[region] === bestContacts
              && region < targetRegion
            )
          ) {
            targetRegion = region;
            bestContacts = contacts[region]!;
            bestProjectedShare = projectedShare;
            selectedJoinedSize = joinedSize;
            selectedProjectedLargest = projectedLargest;
          }
        }
        if (targetRegion < 0) continue;
        const waterSwapCandidates: number[] = [];
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (
            regionId[cell] === targetRegion
            && !strategicallyPassableSurface(waterRegime[cell]!)
            && legacyProtectedCell[cell] === 0
            && protectedCell[cell] === 0
          ) waterSwapCandidates.push(cell);
        }
        if (waterSwapCandidates.length < transferableComponent.length) continue;
        waterSwapCandidates.sort((first, second) => {
          const sourceContacts = (cell: number) => {
            let count = 0;
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (neighbor >= 0 && regionId[neighbor] === sourceRegion) count += 1;
            }
            return count;
          };
          return sourceContacts(second) - sourceContacts(first) || first - second;
        });
        const waterSwaps = waterSwapCandidates.slice(0, transferableComponent.length);
        for (const cell of transferableComponent) regionId[cell] = targetRegion;
        for (const cell of waterSwaps) regionId[cell] = sourceRegion;
        const projectedTopology = passableRegionTopology(
          grid,
          regionId,
          waterRegime,
          barrier,
        );
        const transferRepresentative = transferableComponent[0]!;
        const transferTargetComponent = projectedTopology.componentId[transferRepresentative]!;
        const projectedRegionCounts = Array<number>(REGION_COUNT).fill(0);
        for (const assignedRegion of regionId) projectedRegionCounts[assignedRegion] += 1;
        const projectionExact = regionId[transferRepresentative] === targetRegion
          && transferTargetComponent >= 0
          && projectedTopology.componentSizes[transferTargetComponent] === selectedJoinedSize
          && projectedTopology.passableCounts[targetRegion]
            === topology.passableCounts[targetRegion]! + transferableComponent.length
          && projectedTopology.passableCounts[sourceRegion]
            === topology.passableCounts[sourceRegion]! - transferableComponent.length
          && projectedTopology.largestCounts[targetRegion] === selectedProjectedLargest
          && projectedRegionCounts.every((count, region) => count === initialCounts[region])
          && projectedTopology.passableCounts.every((count, region) => (
            region === sourceRegion
            || region === targetRegion
            || (
              count === topology.passableCounts[region]
              && projectedTopology.largestCounts[region] === topology.largestCounts[region]
            )
          ));
        if (!projectionExact) {
          // A projection is advisory until the recomputed topology matches it
          // exactly; rollback both sides before considering another transfer.
          for (const cell of transferableComponent) regionId[cell] = sourceRegion;
          for (const cell of waterSwaps) regionId[cell] = targetRegion;
          continue;
        }
        remainingTotal -= transferableComponent.length;
        if (component.length < 64) remainingMinor -= transferableComponent.length;
      }
    }
  }
  const finalCounts = Array<number>(REGION_COUNT).fill(0);
  for (const region of regionId) finalCounts[region] += 1;
  if (finalCounts.some((count, region) => count !== initialCounts[region])) {
    fail('GREATER_REALM_BARRIER_REGION_RECONCILIATION_BALANCE_FAILED');
  }
}

function barriersAndGates(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  uplift: Int32Array,
  waterRegime: Uint8Array,
  tierId: Uint8Array,
  regionId: Uint8Array,
  gateGraph: readonly GreaterRealmGateGraphEdge[],
  legacyProtectedCell: Uint8Array,
): Readonly<{
  barrier: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  barrierCrossSections: readonly GreaterRealmPrivateBarrierCrossSection[];
  gates: readonly GreaterRealmPrivateGate[];
  barrierProof: boolean;
  gateApproachProof: boolean;
  gateRouteRedundancyProof: boolean;
  gateGraphProof: boolean;
  passableRegionProof: boolean;
  regionGraphProof: boolean;
  passableTopology: GreaterRealmPassableRegionTopology;
  highlandBarrierShareBasisPoints: number;
  barrierMeanElevationAdvantage: number;
  barrierMeanUpliftAdvantage: number;
  measuredMinimumBarrierWidth: number;
  measuredMaximumBarrierWidth: number;
  geologicalHighlandProof: boolean;
}> {
  const boundary = new Uint8Array(grid.cellCount);
  const outerBoundary = new Uint8Array(grid.cellCount);
  const innerBoundary = new Uint8Array(grid.cellCount);
  const edgesByPair = new Map<string, Array<readonly [number, number]>>();
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
      boundary[cell] = 1;
      boundary[neighbor] = 1;
      const systemBoundary = Math.min(tierId[cell]!, tierId[neighbor]!) === 1
        ? outerBoundary
        : innerBoundary;
      systemBoundary[cell] = 1;
      systemBoundary[neighbor] = 1;
      const firstRegion = Math.min(regionId[cell]!, regionId[neighbor]!);
      const secondRegion = Math.max(regionId[cell]!, regionId[neighbor]!);
      const key = `${firstRegion}:${secondRegion}`;
      const edges = edgesByPair.get(key) ?? [];
      const firstCell = regionId[cell] === firstRegion ? cell : neighbor;
      const secondCell = firstCell === cell ? neighbor : cell;
      edges.push(Object.freeze([firstCell, secondCell] as const));
      edgesByPair.set(key, edges);
    }
  }
  const distanceWithinTier = (systemBoundary: Uint8Array): Uint16Array => {
    const distance = new Uint16Array(grid.cellCount);
    distance.fill(0xffff);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (systemBoundary[cell] !== 1) continue;
      distance[cell] = 0;
      queue[tail++] = cell;
    }
    while (head < tail) {
      const cell = queue[head++]!;
      const nextDistance = distance[cell]! + 1;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || tierId[neighbor] !== tierId[cell]
          || distance[neighbor] !== 0xffff
        ) continue;
        distance[neighbor] = nextDistance;
        queue[tail++] = neighbor;
      }
    }
    return distance;
  };
  const distanceToOuterBoundary = distanceWithinTier(outerBoundary);
  const distanceToInnerBoundary = distanceWithinTier(innerBoundary);
  const barrier = new Uint8Array(grid.cellCount);
  const geologicalBarrierBand = new Uint8Array(grid.cellCount);
  const landElevations = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    .filter(cell => (
      strategicallyPassableSurface(waterRegime[cell]!)
      && elevation[cell]! > SEA_LEVEL
      && legacyProtectedCell[cell] !== 1
    ))
    .map(cell => elevation[cell]!)
    .sort((first, second) => first - second);
  const landUplift = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    .filter(cell => (
      strategicallyPassableSurface(waterRegime[cell]!)
      && elevation[cell]! > SEA_LEVEL
      && legacyProtectedCell[cell] !== 1
    ))
    .map(cell => uplift[cell]!)
    .sort((first, second) => first - second);
  if (landElevations.length === 0 || landUplift.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_STRATEGIC_HIGHLAND_REFERENCE_MISSING');
  }
  const highlandElevation = landElevations[Math.floor(landElevations.length * 0.58)]!;
  const highlandUplift = landUplift[Math.floor(landUplift.length * 0.58)]!;
  // Materialize the final band from nearest-boundary distance inside each
  // tier. Outer Crown arms use two cells per side (four total); the stronger
  // Inner Throne arms use three per side (six total). Width is therefore a
  // property of the completed band, not a configured number pasted into the
  // report. Water cells remain explicit, counted natural barrier assistance.
  const OUTER_BARRIER_SIDE_LAYERS = 2;
  const INNER_BARRIER_SIDE_LAYERS = 3;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacyProtectedCell[cell] === 1) continue;
    if (distanceToOuterBoundary[cell]! < OUTER_BARRIER_SIDE_LAYERS) {
      geologicalBarrierBand[cell] |= 1;
    }
    if (distanceToInnerBoundary[cell]! < INNER_BARRIER_SIDE_LAYERS) {
      geologicalBarrierBand[cell] |= 2;
    }
    if (
      geologicalBarrierBand[cell] !== 0
      && strategicallyPassableSurface(waterRegime[cell]!)
      && (
        boundary[cell] === 1
        || elevation[cell]! >= highlandElevation
        || uplift[cell]! >= highlandUplift
      )
    ) barrier[cell] = 1;
  }
  const sidePath = (
    endpoint: number,
    system: 1 | 2,
  ): number[] => {
    if (
      legacyProtectedCell[endpoint] === 1
      || (geologicalBarrierBand[endpoint]! & system) === 0
    ) return [];
    const previous = new Int32Array(grid.cellCount);
    previous.fill(-2);
    previous[endpoint] = -1;
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    let target = -1;
    queue[tail++] = endpoint;
    while (head < tail) {
      const cell = queue[head++]!;
      let exitsBand = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === tierId[endpoint]
          && legacyProtectedCell[neighbor] !== 1
          && (geologicalBarrierBand[neighbor]! & system) === 0
        ) {
          exitsBand = true;
          break;
        }
      }
      if (exitsBand) {
        target = cell;
        break;
      }
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || previous[neighbor] !== -2
          || tierId[neighbor] !== tierId[endpoint]
          || legacyProtectedCell[neighbor] === 1
          || (geologicalBarrierBand[neighbor]! & system) === 0
        ) continue;
        previous[neighbor] = cell;
        queue[tail++] = neighbor;
      }
    }
    if (target < 0) return [];
    const path: number[] = [];
    for (let cell = target; cell >= 0; cell = previous[cell]!) path.push(cell);
    path.reverse();
    return path;
  };
  const barrierCrossSections: GreaterRealmPrivateBarrierCrossSection[] = [];
  for (const edges of edgesByPair.values()) {
    for (const [first, second] of edges) {
      if (
        !strategicallyPassableSurface(waterRegime[first]!)
        || !strategicallyPassableSurface(waterRegime[second]!)
      ) continue;
      const system = (Math.min(tierId[first]!, tierId[second]!) === 1 ? 1 : 2) as 1 | 2;
      const firstCells = sidePath(first, system);
      const secondCells = sidePath(second, system);
      const firstSideCellCount = firstCells.length;
      if (
        firstSideCellCount < 2
        || firstSideCellCount > 4
        || secondCells.length < 2
        || secondCells.length > 4
      ) continue;
      const cells = [...firstCells.reverse(), ...secondCells];
      // Concave corners can make a longitudinal walk much longer than the
      // band's normal distance. Store only bounded local normal witnesses;
      // the complete band itself is independently proven from the distance
      // fields below.
      if (cells.length < 4 || cells.length > 8) continue;
      barrierCrossSections.push(Object.freeze({
        firstCell: first,
        secondCell: second,
        system,
        firstSideCellCount,
        waterAssistedCellCount: cells.filter(cell => (
          !strategicallyPassableSurface(waterRegime[cell]!)
        )).length,
        // Keep private coordinate buffers mutable so package retirement can
        // overwrite them in place.
        cells,
      }));
    }
  }
  const gates: GreaterRealmPrivateGate[] = [];
  const baseRobustTopology = robustRegionTopology(grid, regionId, waterRegime, barrier);
  const preGateBarrier = new Uint8Array(barrier);
  const usedGateCells = new Set<number>();
  const protectedApproachCells = new Set<number>();
  const requiredApproachCells = new Set<number>();
  const gateChannel = greaterRealmTerrainChannelId('sealed-gate-saddle');
  type GateApproaches = Readonly<{
    first: readonly number[];
    firstAlternate: readonly number[];
    second: readonly number[];
    secondAlternate: readonly number[];
    all: readonly (readonly number[])[];
  }>;
  type GateSelection = Readonly<{
    edge: readonly [number, number];
    approaches: GateApproaches;
  }>;
  type GateApproachCandidate = Readonly<{
    edge: readonly [number, number];
    first: readonly (readonly number[])[];
    second: readonly (readonly number[])[];
  }>;
  for (const [firstRegion, secondRegion] of gateGraph) {
    const key = `${Math.min(firstRegion, secondRegion)}:${Math.max(firstRegion, secondRegion)}`;
    const candidates = [...(edgesByPair.get(key) ?? [])].filter(([first, second]) => (
      waterRegime[first] === 0
      && waterRegime[second] === 0
      && barrier[first] === 1
      && barrier[second] === 1
    ));
    candidates.sort(([firstA, secondA], [firstB, secondB]) => {
      const score = (first: number, second: number) => elevation[first]! + elevation[second]!
        + (greaterRealmCounterRandomU32(
          candidateSeed,
          gateChannel,
          grid.q[first]!,
          grid.r[first]!,
        ) % 4_001);
      return score(firstA, secondA) - score(firstB, secondB)
        || firstA - firstB
        || secondA - secondB;
    });
    const approachCandidates: GateApproachCandidate[] = [];
    for (const edge of candidates) {
      if (
        usedGateCells.has(edge[0])
        || usedGateCells.has(edge[1])
        || protectedApproachCells.has(edge[0])
        || protectedApproachCells.has(edge[1])
      ) continue;
      // Endpoints must be distinct, but a narrow geological saddle may carry
      // both sealed crossings. Requiring an arbitrary six-cell separation
      // rejected otherwise valid natural passes on island/coastal frontiers.
      const firstApproaches = barrierApproachPaths(
        grid,
        edge[0],
        firstRegion,
        regionId,
        waterRegime,
        barrier,
        baseRobustTopology.componentId,
        baseRobustTopology.componentSizes,
      );
      const secondApproaches = barrierApproachPaths(
        grid,
        edge[1],
        secondRegion,
        regionId,
        waterRegime,
        barrier,
        baseRobustTopology.componentId,
        baseRobustTopology.componentSizes,
      );
      if (!firstApproaches || !secondApproaches) continue;
      approachCandidates.push(Object.freeze({
        edge,
        first: firstApproaches,
        second: secondApproaches,
      }));
    }
    // Choose both gates as one deterministic pair. A greedy first selection
    // can consume the only independent corridor on a narrow frontier even
    // when a later pair is valid; pairwise selection provides real route
    // redundancy without making ordinary candidate yield order-dependent.
    let selected: readonly GateSelection[] = Object.freeze([]);
    for (let firstIndex = 0; firstIndex < approachCandidates.length; firstIndex += 1) {
      const firstCandidate = approachCandidates[firstIndex]!;
      for (let firstOptionOrdinal = 0; firstOptionOrdinal < 32; firstOptionOrdinal += 1) {
        const firstApproaches = compatibleGateApproaches(
          grid,
          tierId,
          waterRegime,
          barrier,
          baseRobustTopology.componentId,
          baseRobustTopology.componentSizes,
          firstCandidate.first,
          firstCandidate.second,
          firstOptionOrdinal,
        );
        if (!firstApproaches) break;
        if (firstApproaches.all.some(path => path.some(cell => usedGateCells.has(cell)))) continue;
        for (let secondIndex = 0; secondIndex < approachCandidates.length; secondIndex += 1) {
          if (secondIndex === firstIndex) continue;
          const secondCandidate = approachCandidates[secondIndex]!;
          const endpointSet = new Set([
            ...firstCandidate.edge,
            ...secondCandidate.edge,
          ]);
          if (endpointSet.size !== 4) continue;
          for (let secondOptionOrdinal = 0; secondOptionOrdinal < 32; secondOptionOrdinal += 1) {
            const secondApproaches = compatibleGateApproaches(
              grid,
              tierId,
              waterRegime,
              barrier,
              baseRobustTopology.componentId,
              baseRobustTopology.componentSizes,
              secondCandidate.first,
              secondCandidate.second,
              secondOptionOrdinal,
            );
            if (!secondApproaches) break;
            const allPaths: readonly (readonly number[])[] = Object.freeze([
              ...firstApproaches.all,
              ...secondApproaches.all,
            ]);
            if (allPaths.some((path: readonly number[]) => path.some((cell: number) => (
              usedGateCells.has(cell) || endpointSet.has(cell)
            )))) continue;
            const combinedCarved: Set<number> = new Set<number>(
              allPaths.flatMap((path: readonly number[]) => [...path]),
            );
            const tentativeGatePairs = [
            ...gates.map(gate => Object.freeze([
              gate.firstCell,
              gate.secondCell,
            ] as const)),
            firstCandidate.edge,
            secondCandidate.edge,
            ] as const;
            const tentativeGateMate = new Map<number, number>();
            for (const [firstEndpoint, secondEndpoint] of tentativeGatePairs) {
              tentativeGateMate.set(firstEndpoint, secondEndpoint);
              tentativeGateMate.set(secondEndpoint, firstEndpoint);
            }
            const unavoidableOpenApproaches = new Set<number>([
            ...requiredApproachCells,
            ...firstApproaches.first,
            ...firstApproaches.firstAlternate,
            ...firstApproaches.second,
            ...firstApproaches.secondAlternate,
            ...secondApproaches.first,
            ...secondApproaches.firstAlternate,
            ...secondApproaches.second,
            ...secondApproaches.secondAlternate,
            ]);
          // Opening a reviewed gate pair must expose exactly that one physical
          // cross-tier edge. Reject endpoints whose neighbouring gate mouths
          // or required approaches would become an unrecorded side entrance.
          // Non-required carved shoulders may still be re-sealed after the
          // same-tier coherence repair below.
            let isolatedGateMouths = true;
            for (const [endpoint, mate] of tentativeGateMate) {
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor < 0
                || tierId[endpoint] === tierId[neighbor]
                || !strategicallyPassableSurface(waterRegime[endpoint]!)
                || !strategicallyPassableSurface(waterRegime[neighbor]!)
                || neighbor === mate
              ) continue;
              if (
                tentativeGateMate.has(neighbor)
                || unavoidableOpenApproaches.has(neighbor)
              ) {
                isolatedGateMouths = false;
                break;
              }
            }
              if (!isolatedGateMouths) break;
            }
            if (!isolatedGateMouths) continue;
            let combinedBypass = false;
            for (const cell of combinedCarved) {
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor >= 0
                && tierId[cell] !== tierId[neighbor]
                && strategicallyPassableSurface(waterRegime[cell]!)
                && strategicallyPassableSurface(waterRegime[neighbor]!)
                && (barrier[cell] === 0 || combinedCarved.has(cell))
                && (barrier[neighbor] === 0 || combinedCarved.has(neighbor))
              ) {
                combinedBypass = true;
                break;
              }
            }
              if (combinedBypass) break;
            }
            if (combinedBypass) continue;
            selected = Object.freeze([
              Object.freeze({ edge: firstCandidate.edge, approaches: firstApproaches }),
              Object.freeze({ edge: secondCandidate.edge, approaches: secondApproaches }),
            ]);
            break;
          }
          if (selected.length === 2) break;
        }
        if (selected.length === 2) break;
      }
      if (selected.length === 2) break;
    }
    for (const selection of selected) {
      usedGateCells.add(selection.edge[0]);
      usedGateCells.add(selection.edge[1]);
      for (const cell of selection.approaches.first) requiredApproachCells.add(cell);
      for (const cell of selection.approaches.firstAlternate) requiredApproachCells.add(cell);
      for (const cell of selection.approaches.second) requiredApproachCells.add(cell);
      for (const cell of selection.approaches.secondAlternate) requiredApproachCells.add(cell);
      for (const path of selection.approaches.all) {
        for (const cell of path) {
          barrier[cell] = 0;
          protectedApproachCells.add(cell);
        }
      }
    }
    for (const { edge: [firstCell, secondCell], approaches } of selected) {
      gates.push(Object.freeze({
        gateIndex: gates.length,
        firstRegion,
        secondRegion,
        firstCell,
        secondCell,
        firstApproachPath: approaches.first,
        firstAlternateApproachPath: approaches.firstAlternate,
        secondApproachPath: approaches.second,
        secondAlternateApproachPath: approaches.secondAlternate,
      }));
    }
  }
  const greedyGateAssignmentComplete = gateGraph.every(([firstRegion, secondRegion]) => (
    gates.filter(gate => (
      gate.firstRegion === firstRegion && gate.secondRegion === secondRegion
    )).length === 2
  ));
  if (!greedyGateAssignmentComplete) {
    // The ordinary path above remains authoritative whenever it succeeds.
    // Only an incomplete greedy assignment reaches this transactional fallback;
    // all search state is derived from the immutable pre-gate barrier and is
    // committed only after all nine region pairs have two valid gates.
    const MAX_OPTIONS_PER_EDGE = 32;
    const MAX_CANDIDATE_EDGES_PER_PAIR = 128;
    const MAX_BUNDLES_PER_PAIR = 128;
    const MAX_PAIR_ENUMERATION_NODES = 131_072;
    const MAX_GLOBAL_SEARCH_NODES = 32_768;
    type GateBundle = Readonly<{
      graphIndex: number;
      selections: readonly [GateSelection, GateSelection];
    }>;
    const selectionsAreGloballyCompatible = (
      selections: readonly GateSelection[],
    ): boolean => {
      const gateMate = new Map<number, number>();
      for (const { edge: [firstEndpoint, secondEndpoint] } of selections) {
        if (gateMate.has(firstEndpoint) || gateMate.has(secondEndpoint)) return false;
        gateMate.set(firstEndpoint, secondEndpoint);
        gateMate.set(secondEndpoint, firstEndpoint);
      }
      const carved = new Set<number>();
      for (const selection of selections) {
        for (const path of selection.approaches.all) {
          for (const cell of path) {
            if (gateMate.has(cell)) return false;
            carved.add(cell);
          }
        }
      }
      // Opening any selected endpoint must expose only its reviewed mate. A
      // neighbouring gate endpoint or required approach would become a second
      // entrance and therefore invalidates the whole partial assignment.
      for (const [endpoint, mate] of gateMate) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || neighbor === mate
            || tierId[endpoint] === tierId[neighbor]
            || !strategicallyPassableSurface(waterRegime[endpoint]!)
            || !strategicallyPassableSurface(waterRegime[neighbor]!)
          ) continue;
          if (gateMate.has(neighbor) || carved.has(neighbor)) return false;
        }
      }
      // Pair-local validation is insufficient when routes from different graph
      // arms combine. Re-evaluate the complete carved set at every DFS node so
      // two individually safe bundles cannot jointly open an ungated bypass.
      for (const cell of carved) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && tierId[cell] !== tierId[neighbor]
            && strategicallyPassableSurface(waterRegime[cell]!)
            && strategicallyPassableSurface(waterRegime[neighbor]!)
            && (preGateBarrier[cell] === 0 || carved.has(cell))
            && (preGateBarrier[neighbor] === 0 || carved.has(neighbor))
          ) return false;
        }
      }
      return true;
    };
    const enumeratePairBundles = (
      graphIndex: number,
      firstRegion: number,
      secondRegion: number,
    ): readonly GateBundle[] => {
      const key = `${Math.min(firstRegion, secondRegion)}:${Math.max(firstRegion, secondRegion)}`;
      const candidates = [...(edgesByPair.get(key) ?? [])].filter(([first, second]) => (
        waterRegime[first] === 0
        && waterRegime[second] === 0
        && preGateBarrier[first] === 1
        && preGateBarrier[second] === 1
      ));
      candidates.sort(([firstA, secondA], [firstB, secondB]) => {
        const score = (first: number, second: number) => elevation[first]! + elevation[second]!
          + (greaterRealmCounterRandomU32(
            candidateSeed,
            gateChannel,
            grid.q[first]!,
            grid.r[first]!,
          ) % 4_001);
        return score(firstA, secondA) - score(firstB, secondB)
          || firstA - firstB
          || secondA - secondB;
      });
      const options: Array<Readonly<{
        edge: readonly [number, number];
        approaches: readonly GateApproaches[];
      }>> = [];
      for (
        let candidateIndex = 0;
        candidateIndex < Math.min(candidates.length, MAX_CANDIDATE_EDGES_PER_PAIR);
        candidateIndex += 1
      ) {
        const edge = candidates[candidateIndex]!;
        const firstApproaches = barrierApproachPaths(
          grid,
          edge[0],
          firstRegion,
          regionId,
          waterRegime,
          preGateBarrier,
          baseRobustTopology.componentId,
          baseRobustTopology.componentSizes,
        );
        const secondApproaches = barrierApproachPaths(
          grid,
          edge[1],
          secondRegion,
          regionId,
          waterRegime,
          preGateBarrier,
          baseRobustTopology.componentId,
          baseRobustTopology.componentSizes,
        );
        if (!firstApproaches || !secondApproaches) continue;
        const approachOptions: GateApproaches[] = [];
        for (let optionOrdinal = 0; optionOrdinal < MAX_OPTIONS_PER_EDGE; optionOrdinal += 1) {
          const approaches = compatibleGateApproaches(
            grid,
            tierId,
            waterRegime,
            preGateBarrier,
            baseRobustTopology.componentId,
            baseRobustTopology.componentSizes,
            firstApproaches,
            secondApproaches,
            optionOrdinal,
          );
          if (!approaches) break;
          approachOptions.push(approaches);
        }
        if (approachOptions.length > 0) {
          options.push(Object.freeze({
            edge,
            approaches: Object.freeze(approachOptions),
          }));
        }
      }
      const bundles: GateBundle[] = [];
      const endpointQuartetCounts = new Map<string, number>();
      let enumerationNodes = 0;
      pairEnumeration:
      for (let firstIndex = 0; firstIndex < options.length; firstIndex += 1) {
        const first = options[firstIndex]!;
        for (let secondIndex = firstIndex + 1; secondIndex < options.length; secondIndex += 1) {
          const second = options[secondIndex]!;
          const endpoints = [...first.edge, ...second.edge];
          if (new Set(endpoints).size !== 4) continue;
          const quartetKey = [...endpoints].sort((left, right) => left - right).join(':');
          const maximumDiagonal = first.approaches.length + second.approaches.length - 2;
          for (let diagonal = 0; diagonal <= maximumDiagonal; diagonal += 1) {
            const firstOptionMaximum = Math.min(diagonal, first.approaches.length - 1);
            const firstOptionMinimum = Math.max(0, diagonal - second.approaches.length + 1);
            for (
              let firstOption = firstOptionMaximum;
              firstOption >= firstOptionMinimum;
              firstOption -= 1
            ) {
              const secondOption = diagonal - firstOption;
              if (enumerationNodes >= MAX_PAIR_ENUMERATION_NODES) break pairEnumeration;
              enumerationNodes += 1;
              if ((endpointQuartetCounts.get(quartetKey) ?? 0) >= 2) continue;
              const firstApproaches = first.approaches[firstOption]!;
              const secondApproaches = second.approaches[secondOption]!;
              const selections = Object.freeze([
                Object.freeze({ edge: first.edge, approaches: firstApproaches }),
                Object.freeze({ edge: second.edge, approaches: secondApproaches }),
              ] as const);
              if (!selectionsAreGloballyCompatible(selections)) continue;
              endpointQuartetCounts.set(
                quartetKey,
                (endpointQuartetCounts.get(quartetKey) ?? 0) + 1,
              );
              bundles.push(Object.freeze({ graphIndex, selections }));
              if (bundles.length >= MAX_BUNDLES_PER_PAIR) break pairEnumeration;
            }
          }
        }
      }
      return Object.freeze(bundles);
    };
    const plans = gateGraph.map(([firstRegion, secondRegion], graphIndex) => Object.freeze({
      graphIndex,
      bundles: enumeratePairBundles(graphIndex, firstRegion, secondRegion),
    }));
    let fallbackSolution: readonly GateBundle[] | undefined;
    if (plans.every(plan => plan.bundles.length > 0)) {
      const constrainedPlans = [...plans].sort((first, second) => (
        first.bundles.length - second.bundles.length
        || first.graphIndex - second.graphIndex
      ));
      const chosen: GateBundle[] = [];
      let searchNodes = 0;
      const search = (depth: number): boolean => {
        if (depth === constrainedPlans.length) {
          fallbackSolution = Object.freeze([...chosen]);
          return true;
        }
        const plan = constrainedPlans[depth]!;
        for (const bundle of plan.bundles) {
          if (searchNodes >= MAX_GLOBAL_SEARCH_NODES) return false;
          searchNodes += 1;
          const selections = [
            ...chosen.flatMap(selected => selected.selections),
            ...bundle.selections,
          ];
          if (!selectionsAreGloballyCompatible(selections)) continue;
          chosen.push(bundle);
          if (search(depth + 1)) return true;
          chosen.pop();
        }
        return false;
      };
      search(0);
    }
    if (fallbackSolution?.length === gateGraph.length) {
      const solutionByGraphIndex = new Map(
        fallbackSolution.map(bundle => [bundle.graphIndex, bundle] as const),
      );
      // Selected greedy routes are private coordinate buffers. Retire them
      // before replacing the incomplete assignment, then restore the exact
      // pre-gate barrier and commit the complete solution in graph order.
      const retiredPaths = new Set<readonly number[]>();
      for (const gate of gates) {
        for (const path of [
          gate.firstApproachPath,
          gate.firstAlternateApproachPath,
          gate.secondApproachPath,
          gate.secondAlternateApproachPath,
        ]) retiredPaths.add(path);
      }
      for (const path of retiredPaths) (path as number[]).fill(0);
      barrier.set(preGateBarrier);
      gates.length = 0;
      usedGateCells.clear();
      protectedApproachCells.clear();
      requiredApproachCells.clear();
      for (let graphIndex = 0; graphIndex < gateGraph.length; graphIndex += 1) {
        const bundle = solutionByGraphIndex.get(graphIndex)!;
        const [firstRegion, secondRegion] = gateGraph[graphIndex]!;
        for (const selection of bundle.selections) {
          usedGateCells.add(selection.edge[0]);
          usedGateCells.add(selection.edge[1]);
          for (const cell of selection.approaches.first) requiredApproachCells.add(cell);
          for (const cell of selection.approaches.firstAlternate) {
            requiredApproachCells.add(cell);
          }
          for (const cell of selection.approaches.second) requiredApproachCells.add(cell);
          for (const cell of selection.approaches.secondAlternate) {
            requiredApproachCells.add(cell);
          }
          for (const path of selection.approaches.all) {
            for (const cell of path) {
              barrier[cell] = 0;
              protectedApproachCells.add(cell);
            }
          }
          gates.push(Object.freeze({
            gateIndex: gates.length,
            firstRegion,
            secondRegion,
            firstCell: selection.edge[0],
            secondCell: selection.edge[1],
            firstApproachPath: selection.approaches.first,
            firstAlternateApproachPath: selection.approaches.firstAlternate,
            secondApproachPath: selection.approaches.second,
            secondAlternateApproachPath: selection.approaches.secondAlternate,
          }));
        }
      }
    }
  }
  // Approach carving for a later pass may cross the shoulder of an earlier
  // pass in the same region. Gate endpoints themselves are immutable sealed
  // barrier cells; restore that invariant before graph/topology proofs.
  const lockedGateEndpoint = new Uint8Array(grid.cellCount);
  for (const gate of gates) {
    barrier[gate.firstCell] = 1;
    barrier[gate.secondCell] = 1;
    lockedGateEndpoint[gate.firstCell] = 1;
    lockedGateEndpoint[gate.secondCell] = 1;
  }
  // A cross-tier edge only needs one sealed side. Keeping both sides of every
  // edge turned natural passes into broad lowland walls and split otherwise
  // coherent regions. Retain the geologically stronger side of each ordinary
  // boundary edge, while leaving the two reviewed cells of every gate sealed.
  const retainedBoundaryBarrier = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[cell] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[cell]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
      ) continue;
      const selectable = (candidate: number) => (
        legacyProtectedCell[candidate] !== 1
        && !protectedApproachCells.has(candidate)
      );
      let selected = -1;
      if (lockedGateEndpoint[cell] === 1) selected = cell;
      else if (lockedGateEndpoint[neighbor] === 1) selected = neighbor;
      else if (!selectable(cell)) selected = selectable(neighbor) ? neighbor : -1;
      else if (!selectable(neighbor)) selected = cell;
      else {
        const cellHighland = elevation[cell]! >= highlandElevation
          || uplift[cell]! >= highlandUplift;
        const neighborHighland = elevation[neighbor]! >= highlandElevation
          || uplift[neighbor]! >= highlandUplift;
        if (cellHighland !== neighborHighland) selected = cellHighland ? cell : neighbor;
        else {
          const cellScore = elevation[cell]! * 4 + uplift[cell]!;
          const neighborScore = elevation[neighbor]! * 4 + uplift[neighbor]!;
          selected = cellScore > neighborScore
            ? cell
            : neighborScore > cellScore ? neighbor : Math.min(cell, neighbor);
        }
      }
      if (selected >= 0) retainedBoundaryBarrier[selected] = 1;
    }
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (boundary[cell] !== 1) continue;
    if (lockedGateEndpoint[cell] === 1) barrier[cell] = 1;
    else if (protectedApproachCells.has(cell)) barrier[cell] = 0;
    else barrier[cell] = retainedBoundaryBarrier[cell]!;
  }
  reconnectBarrierSplitRegionComponents(
    grid,
    regionId,
    tierId,
    waterRegime,
    barrier,
    gates,
  );
  reconcileBarrierMeasuredRegionCoherence(
    grid,
    regionId,
    tierId,
    waterRegime,
    barrier,
    legacyProtectedCell,
    protectedApproachCells,
  );
  // Same-tier coherence repair must never become the last writer on a Crown
  // boundary. Re-seal any newly exposed cross-tier edge on an unreviewed,
  // non-approach side; a contact protected on both sides remains an explicit
  // proof failure instead of silently becoming an extra gate.
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[cell] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[cell]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
        || barrier[cell] === 1
        || barrier[neighbor] === 1
      ) continue;
      const cellProtected = protectedApproachCells.has(cell);
      const neighborProtected = protectedApproachCells.has(neighbor);
      if (cellProtected && neighborProtected) {
        const cellRequired = requiredApproachCells.has(cell);
        const neighborRequired = requiredApproachCells.has(neighbor);
        if (cellRequired && neighborRequired) continue;
        if (cellRequired) barrier[neighbor] = 1;
        else if (neighborRequired) barrier[cell] = 1;
        else {
          const cellScore = elevation[cell]! * 4 + uplift[cell]!;
          const neighborScore = elevation[neighbor]! * 4 + uplift[neighbor]!;
          barrier[cellScore >= neighborScore ? cell : neighbor] = 1;
        }
        continue;
      }
      if (cellProtected) barrier[neighbor] = 1;
      else if (neighborProtected) barrier[cell] = 1;
      else {
        const cellScore = elevation[cell]! * 4 + uplift[cell]!;
        const neighborScore = elevation[neighbor]! * 4 + uplift[neighbor]!;
        barrier[cellScore >= neighborScore ? cell : neighbor] = 1;
      }
    }
  }
  // Reconcile the final impassable crest to the measured geological band after
  // every coherence mutation. The broader band intentionally includes
  // traversable foothills; every blocking cell must nevertheless be part of
  // that band, while the independent cross-tier cut proof guarantees that no
  // foothill creates an ungated route through the system.
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacyProtectedCell[cell] === 1) continue;
    if (geologicalBarrierBand[cell] === 0) barrier[cell] = 0;
  }
  // A gate is a single reviewed physical edge, not merely a label placed on a
  // broad pass. Model the future open state without mutating the sealed gate
  // endpoints: every other passable cross-tier neighbour must remain sealed.
  // Required primary approaches are never sacrificed to manufacture this
  // proof; a collision with one makes the candidate ineligible instead.
  const gateMate = new Int32Array(grid.cellCount);
  gateMate.fill(-1);
  let gatePhysicalCorridorProof = true;
  for (const gate of gates) {
    if (gateMate[gate.firstCell] >= 0 || gateMate[gate.secondCell] >= 0) {
      gatePhysicalCorridorProof = false;
      continue;
    }
    gateMate[gate.firstCell] = gate.secondCell;
    gateMate[gate.secondCell] = gate.firstCell;
  }
  for (let endpoint = 0; endpoint < grid.cellCount; endpoint += 1) {
    const mate = gateMate[endpoint]!;
    if (mate < 0) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor < 0
        || neighbor === mate
        || tierId[endpoint] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[endpoint]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
        || barrier[neighbor] === 1
      ) continue;
      if (gateMate[neighbor]! >= 0 || requiredApproachCells.has(neighbor)) {
        gatePhysicalCorridorProof = false;
      } else {
        barrier[neighbor] = 1;
      }
    }
  }
  // The corridor-isolation pass above can seal an additional shoulder cell
  // beside a gate mouth after the ordinary coherence repair has completed.
  // Reconnect same-region fragments once more against that final sealed mask.
  // The repair keeps every gate endpoint and every cross-tier-adjacent barrier
  // cell locked, so it cannot manufacture an unreviewed Crown crossing.
  reconnectBarrierSplitRegionComponents(
    grid,
    regionId,
    tierId,
    waterRegime,
    barrier,
    gates,
  );
  let futureOpenCrossTierEdges = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[cell] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[cell]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
      ) continue;
      const cellWouldBeOpen = barrier[cell] === 0 || gateMate[cell]! >= 0;
      const neighborWouldBeOpen = barrier[neighbor] === 0 || gateMate[neighbor]! >= 0;
      if (!cellWouldBeOpen || !neighborWouldBeOpen) continue;
      futureOpenCrossTierEdges += 1;
      if (gateMate[cell] !== neighbor || gateMate[neighbor] !== cell) {
        gatePhysicalCorridorProof = false;
      }
    }
  }
  if (futureOpenCrossTierEdges !== gates.length) gatePhysicalCorridorProof = false;
  let barrierProof = true;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (
        neighbor >= 0
        && tierId[cell] !== tierId[neighbor]
        && strategicallyPassableSurface(waterRegime[cell]!)
        && strategicallyPassableSurface(waterRegime[neighbor]!)
        && barrier[cell] !== 1
        && barrier[neighbor] !== 1
      ) barrierProof = false;
    }
  }
  const gateGraphProof = gatePhysicalCorridorProof
    && gates.length === GREATER_REALM_REQUIRED_GATE_COUNT
    && gateGraph.length === 9
    && gateGraph.every(([firstRegion, secondRegion]) => {
      const pairGates = gates.filter(gate => (
        gate.firstRegion === firstRegion && gate.secondRegion === secondRegion
      ));
      return pairGates.length === 2 && pairGates.every(gate => {
        if (
          regionId[gate.firstCell] !== firstRegion
          || regionId[gate.secondCell] !== secondRegion
          || waterRegime[gate.firstCell] !== 0
          || waterRegime[gate.secondCell] !== 0
        ) return false;
        if (barrier[gate.firstCell] !== 1 || barrier[gate.secondCell] !== 1) return false;
        const neighborOffset = gate.firstCell * HEX_NEIGHBOR_COUNT;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          if (grid.neighbors[neighborOffset + direction] === gate.secondCell) return true;
        }
        return false;
      });
    });
  const passableTopology = passableRegionTopology(grid, regionId, waterRegime, barrier);
  const robustTopology = robustRegionTopology(grid, regionId, waterRegime, barrier);
  const adjacentGateApproachProof = gates.length === GREATER_REALM_REQUIRED_GATE_COUNT
    && gates.every(gate => ([
      [gate.firstCell, gate.firstRegion],
      [gate.secondCell, gate.secondRegion],
    ] as const).every(([endpoint, region]) => {
      const approachCells: number[] = [];
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && regionId[neighbor] === region
          && waterRegime[neighbor] === 0
          && barrier[neighbor] === 0
          && passableTopology.componentId[neighbor]! >= 0
          && passableTopology.componentSizes[passableTopology.componentId[neighbor]!]! >= 64
        ) approachCells.push(neighbor);
      }
      return approachCells.length >= 1;
    }));
  const routeFinalRobustComponent = (
    endpoint: number,
    region: number,
    path: readonly number[],
  ): number => {
    if (path.length === 0 || new Set(path).size !== path.length) return -1;
    let startsAtEndpoint = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction] === path[0]) {
        startsAtEndpoint = true;
        break;
      }
    }
    if (!startsAtEndpoint) return -1;
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index]!;
      if (
        regionId[cell] !== region
        || waterRegime[cell] !== 0
        || barrier[cell] !== 0
      ) return -1;
      if (index > 0) {
        let adjacent = false;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          if (grid.neighbors[path[index - 1]! * HEX_NEIGHBOR_COUNT + direction] === cell) {
            adjacent = true;
            break;
          }
        }
        if (!adjacent) return -1;
      }
    }
    const target = path[path.length - 1]!;
    const component = robustTopology.componentId[target]!;
    return component >= 0 && robustTopology.componentSizes[component]! >= 64
      ? component
      : -1;
  };
  const routePairIsVertexDisjoint = (
    endpoint: number,
    region: number,
    primary: readonly number[],
    alternate: readonly number[],
  ): boolean => {
    if (
      primary.length === 0
      || alternate.length === 0
      || primary[0] === alternate[0]
      || !gateApproachCorridorsDisjoint(primary, alternate)
    ) return false;
    const primaryComponent = routeFinalRobustComponent(endpoint, region, primary);
    const alternateComponent = routeFinalRobustComponent(endpoint, region, alternate);
    return primaryComponent >= 0 && primaryComponent === alternateComponent;
  };
  const gateRouteRedundancyProof = gates.length === GREATER_REALM_REQUIRED_GATE_COUNT
    && gates.every(gate => (
      routePairIsVertexDisjoint(
        gate.firstCell,
        gate.firstRegion,
        gate.firstApproachPath,
        gate.firstAlternateApproachPath,
      )
      && routePairIsVertexDisjoint(
        gate.secondCell,
        gate.secondRegion,
        gate.secondApproachPath,
        gate.secondAlternateApproachPath,
      )
    ));
  const gateApproachProof = adjacentGateApproachProof && gateRouteRedundancyProof;
  // All ordinary cross-tier land contacts are sealed by the mountain cut.
  // Opening only the reviewed gate edges therefore derives (rather than
  // assumes) the future traversable region graph from the cell topology.
  const traversablePairs = new Set(gates.map(gate => `${gate.firstRegion}:${gate.secondRegion}`));
  const expectedPairs = new Set(gateGraph.map(
    ([firstRegion, secondRegion]) => `${firstRegion}:${secondRegion}`,
  ));
  const regionGraphProof = barrierProof
    && gateGraphProof
    && gateApproachProof
    && passableTopology.proof
    && traversablePairs.size === expectedPairs.size
    && [...traversablePairs].every(key => expectedPairs.has(key));
  let barrierCells = 0;
  let highlandBarrierCells = 0;
  let barrierElevationTotal = 0;
  let barrierUpliftTotal = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (barrier[cell] !== 1) continue;
    barrierCells += 1;
    barrierElevationTotal += elevation[cell]!;
    barrierUpliftTotal += uplift[cell]!;
    if (elevation[cell]! >= highlandElevation || uplift[cell]! >= highlandUplift) {
      highlandBarrierCells += 1;
    }
  }
  const landElevationTotal = landElevations.reduce((total, value) => total + value, 0);
  const landUpliftTotal = landUplift.reduce((total, value) => total + value, 0);
  const highlandBarrierShareBasisPoints = barrierCells === 0
    ? 0
    : Math.round((highlandBarrierCells * 10_000) / barrierCells);
  const barrierMeanElevationAdvantage = barrierCells === 0
    ? -INT32_MAX
    : Math.floor(barrierElevationTotal / barrierCells)
      - Math.floor(landElevationTotal / landElevations.length);
  const barrierMeanUpliftAdvantage = barrierCells === 0
    ? -INT32_MAX
    : Math.floor(barrierUpliftTotal / barrierCells)
      - Math.floor(landUpliftTotal / landUplift.length);
  let measuredMinimumBarrierWidth = INT32_MAX;
  let measuredMaximumBarrierWidth = 0;
  let barrierWidthProof = barrierCrossSections.length > 0;
  const measureBandSideThickness = (endpoint: number, system: 1 | 2): number => {
    if ((geologicalBarrierBand[endpoint]! & system) === 0) return 0;
    const distance = new Uint16Array(grid.cellCount);
    distance.fill(0xffff);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    distance[endpoint] = 0;
    queue[tail++] = endpoint;
    while (head < tail) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === tierId[endpoint]
          && legacyProtectedCell[neighbor] !== 1
          && (geologicalBarrierBand[neighbor]! & system) === 0
        ) return distance[cell]! + 1;
      }
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || distance[neighbor] !== 0xffff
          || tierId[neighbor] !== tierId[endpoint]
          || legacyProtectedCell[neighbor] === 1
          || (geologicalBarrierBand[neighbor]! & system) === 0
        ) continue;
        distance[neighbor] = distance[cell]! + 1;
        queue[tail++] = neighbor;
      }
    }
    return 0;
  };
  const expectedStrategicBoundaryPairs = new Set(gateGraph.map(
    ([firstRegion, secondRegion]) => `${firstRegion}:${secondRegion}`,
  ));
  let distanceFieldBandProof = true;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const expectedBand = legacyProtectedCell[cell] === 1
      ? 0
      : (distanceToOuterBoundary[cell]! < OUTER_BARRIER_SIDE_LAYERS ? 1 : 0)
        | (distanceToInnerBoundary[cell]! < INNER_BARRIER_SIDE_LAYERS ? 2 : 0);
    if (geologicalBarrierBand[cell] !== expectedBand) distanceFieldBandProof = false;
    if (barrier[cell] === 1 && geologicalBarrierBand[cell] === 0) {
      barrierWidthProof = false;
    }
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
    }
  }
  const crossSectionEdges = new Set<string>();
  const witnessedStrategicBoundaryPairs = new Set<string>();
  for (const crossSection of barrierCrossSections) {
    const edgeKey = crossSection.firstCell < crossSection.secondCell
      ? `${crossSection.firstCell}:${crossSection.secondCell}`
      : `${crossSection.secondCell}:${crossSection.firstCell}`;
    if (crossSectionEdges.has(edgeKey)) barrierWidthProof = false;
    crossSectionEdges.add(edgeKey);
    const witnessedPair = [
      Math.min(regionId[crossSection.firstCell]!, regionId[crossSection.secondCell]!),
      Math.max(regionId[crossSection.firstCell]!, regionId[crossSection.secondCell]!),
    ].join(':');
    if (expectedStrategicBoundaryPairs.has(witnessedPair)) {
      witnessedStrategicBoundaryPairs.add(witnessedPair);
    }
    const firstThickness = measureBandSideThickness(
      crossSection.firstCell,
      crossSection.system,
    );
    const secondThickness = measureBandSideThickness(
      crossSection.secondCell,
      crossSection.system,
    );
    const measuredWidth = firstThickness + secondThickness;
    measuredMinimumBarrierWidth = Math.min(measuredMinimumBarrierWidth, measuredWidth);
    measuredMaximumBarrierWidth = Math.max(measuredMaximumBarrierWidth, measuredWidth);
    if (
      measuredWidth < 4
      || measuredWidth > 8
      || crossSection.cells.length !== measuredWidth
      || crossSection.firstSideCellCount !== firstThickness
      || crossSection.firstSideCellCount < 1
      || crossSection.firstSideCellCount >= crossSection.cells.length
      || crossSection.cells[crossSection.firstSideCellCount - 1] !== crossSection.firstCell
      || crossSection.cells[crossSection.firstSideCellCount] !== crossSection.secondCell
      || crossSection.waterAssistedCellCount !== crossSection.cells.filter(cell => (
        !strategicallyPassableSurface(waterRegime[cell]!)
      )).length
    ) barrierWidthProof = false;
    for (let index = 0; index < crossSection.cells.length; index += 1) {
      const cell = crossSection.cells[index]!;
      const expectedEndpoint = index < crossSection.firstSideCellCount
        ? crossSection.firstCell
        : crossSection.secondCell;
      if (
        legacyProtectedCell[cell] === 1
        || (geologicalBarrierBand[cell]! & crossSection.system) === 0
        || tierId[cell] !== tierId[expectedEndpoint]
      ) barrierWidthProof = false;
      if (index === 0) continue;
      const previous = crossSection.cells[index - 1]!;
      let adjacent = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (grid.neighbors[previous * HEX_NEIGHBOR_COUNT + direction] === cell) {
          adjacent = true;
          break;
        }
      }
      if (!adjacent) barrierWidthProof = false;
    }
  }
  if (barrierCrossSections.length === 0) measuredMinimumBarrierWidth = 0;
  barrierWidthProof = barrierWidthProof
    && distanceFieldBandProof
    && barrierProof
    && witnessedStrategicBoundaryPairs.size === expectedStrategicBoundaryPairs.size
    && [...witnessedStrategicBoundaryPairs].every(
      pair => expectedStrategicBoundaryPairs.has(pair),
    )
    && measuredMinimumBarrierWidth >= 4
    && measuredMaximumBarrierWidth <= 8;
  const geologicalHighlandProof = barrierWidthProof
    && highlandBarrierShareBasisPoints >= 6_500
    && (
      barrierMeanElevationAdvantage >= 300
      || barrierMeanUpliftAdvantage >= 100
    );
  return Object.freeze({
    barrier,
    geologicalBarrierBand,
    barrierCrossSections: Object.freeze(barrierCrossSections),
    gates: Object.freeze(gates),
    barrierProof,
    gateApproachProof,
    gateRouteRedundancyProof,
    gateGraphProof,
    passableRegionProof: passableTopology.proof,
    regionGraphProof,
    passableTopology,
    highlandBarrierShareBasisPoints,
    barrierMeanElevationAdvantage,
    barrierMeanUpliftAdvantage,
    measuredMinimumBarrierWidth,
    measuredMaximumBarrierWidth,
    geologicalHighlandProof,
  });
}

function castleAndPotentialSites(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  waterRegime: Uint8Array,
  tierId: Uint8Array,
  regionId: Uint8Array,
  barrier: Uint8Array,
  gates: readonly GreaterRealmPrivateGate[],
  legacyProtectedCell: Uint8Array,
  legacyCastleSlot: Uint8Array,
): Readonly<{
  castleSlot: Uint8Array;
  resourcePotential: Uint8Array;
  corePotential: Uint8Array;
  castleCount: number;
  placementProof: boolean;
  resourcePotentialCount: number;
  corePotentialCount: number;
}> {
  const gateCells = new Uint8Array(grid.cellCount);
  for (const gate of gates) {
    gateCells[gate.firstCell] = 1;
    gateCells[gate.secondCell] = 1;
  }
  const gateDistance = gates.length > 0
    ? distanceFromMask(grid, gateCells)
    : new Uint16Array(grid.cellCount).fill(0xffff);
  const topology = passableRegionTopology(grid, regionId, waterRegime, barrier);
  const candidateChannel = greaterRealmTerrainChannelId('castle-suitability-order');
  const castleSlot = new Uint8Array(legacyCastleSlot);
  const selectedAll: number[] = [];
  let castleCount = 0;
  for (let cell = 0; cell < castleSlot.length; cell += 1) {
    if (castleSlot[cell] !== 1) continue;
    castleCount += 1;
    selectedAll.push(cell);
  }
  if (castleCount !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount) {
    fail('GREATER_REALM_LEGACY_CASTLE_SLOT_COUNT_INVALID');
  }
  for (let region = 0; region < TIER_I_REGION_COUNT; region += 1) {
    // Region zero already contains the exact 100 deployed castle slots. The
    // other five regions receive dormant candidate slots only.
    if (region === 0) continue;
    const candidates: number[] = [];
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        regionId[cell] !== region
        || tierId[cell] !== 1
        || waterRegime[cell] !== 0
        || barrier[cell] === 1
        || gateCells[cell] === 1
        || gateDistance[cell]! < 3
        || topology.componentId[cell]! < 0
        || topology.componentSizes[topology.componentId[cell]!]! < 200
      ) continue;
      let passableNeighbors = 0;
      let maximumDrop = 0;
      const neighborPassable = Array<boolean>(HEX_NEIGHBOR_COUNT).fill(false);
      for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
        if (neighbor < 0) continue;
        maximumDrop = Math.max(maximumDrop, Math.abs(elevation[cell]! - elevation[neighbor]!));
        if (
          regionId[neighbor] === region
          && waterRegime[neighbor] === 0
          && barrier[neighbor] === 0
          && topology.componentId[neighbor] === topology.componentId[cell]
        ) {
          neighborPassable[directionIndex] = true;
          passableNeighbors += 1;
        }
      }
      const hasLocalAlternateRoute = neighborPassable.some((passable, direction) => (
        passable && neighborPassable[(direction + 1) % HEX_NEIGHBOR_COUNT]
      ));
      if (passableNeighbors >= 4 && hasLocalAlternateRoute && maximumDrop <= 6_000) {
        candidates.push(cell);
      }
    }
    let selected: number[] = [];
    for (let attempt = 0; attempt < 16 && selected.length < 100; attempt += 1) {
      const ordered = [...candidates].sort((first, second) => {
        const sample = region * 32 + attempt;
        const firstScore = greaterRealmCounterRandomU32(
          candidateSeed,
          candidateChannel,
          grid.q[first]!,
          grid.r[first]!,
          sample,
        );
        const secondScore = greaterRealmCounterRandomU32(
          candidateSeed,
          candidateChannel,
          grid.q[second]!,
          grid.r[second]!,
          sample,
        );
        return firstScore - secondScore || first - second;
      });
      const trial: number[] = [];
      for (const cell of ordered) {
        if ([...selectedAll, ...trial].some(existing => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[existing]!,
          grid.r[existing]!,
        ) < 5)) continue;
        trial.push(cell);
        if (trial.length === 100) break;
      }
      if (trial.length > selected.length) selected = trial;
    }
    for (const cell of selected) {
      selectedAll.push(cell);
      castleSlot[cell] = 1;
    }
    castleCount += selected.length;
  }
  let placementProof = castleCount === GREATER_REALM_REQUIRED_CASTLE_SLOT_COUNT;
  for (let ordinal = 0; ordinal < selectedAll.length; ordinal += 1) {
    const cell = selectedAll[ordinal]!;
    if (legacyCastleSlot[cell] === 1) continue;
    const region = regionId[cell]!;
    let independentlyVerifiedPassableNeighbors = 0;
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === region
        && waterRegime[neighbor] === 0
        && barrier[neighbor] === 0
        && topology.componentId[neighbor] === topology.componentId[cell]
      ) independentlyVerifiedPassableNeighbors += 1;
    }
    if (
      region < 1
      || region >= TIER_I_REGION_COUNT
      || tierId[cell] !== 1
      || waterRegime[cell] !== 0
      || barrier[cell] !== 0
      || gateDistance[cell]! < 3
      || topology.componentId[cell]! < 0
      || topology.componentSizes[topology.componentId[cell]!]! < 200
      || independentlyVerifiedPassableNeighbors < 4
    ) placementProof = false;
    for (let previous = 0; previous < ordinal; previous += 1) {
      const other = selectedAll[previous]!;
      if (axialDistance(
        grid.q[cell]!,
        grid.r[cell]!,
        grid.q[other]!,
        grid.r[other]!,
      ) < 5) placementProof = false;
    }
  }
  const resourcePotential = new Uint8Array(grid.cellCount);
  const corePotential = new Uint8Array(grid.cellCount);
  let resourcePotentialCount = 0;
  let corePotentialCount = 0;
  const resourceChannel = greaterRealmTerrainChannelId('resource-potential');
  const coreChannel = greaterRealmTerrainChannelId('core-potential');
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      waterRegime[cell] !== 0
      || barrier[cell] === 1
      || castleSlot[cell] === 1
      || legacyProtectedCell[cell] === 1
    ) continue;
    const resourceThreshold = tierId[cell] === 1 ? 2_000 : tierId[cell] === 2 ? 2_800 : 4_000;
    const coreThreshold = tierId[cell] === 1 ? 1_400 : tierId[cell] === 2 ? 2_000 : 2_800;
    if ((greaterRealmCounterRandomU32(
      candidateSeed,
      resourceChannel,
      grid.q[cell]!,
      grid.r[cell]!,
    ) % 10_000) < resourceThreshold) {
      resourcePotential[cell] = tierId[cell]!;
      resourcePotentialCount += 1;
    }
    if ((greaterRealmCounterRandomU32(
      candidateSeed,
      coreChannel,
      grid.q[cell]!,
      grid.r[cell]!,
    ) % 10_000) < coreThreshold) {
      corePotential[cell] = tierId[cell]!;
      corePotentialCount += 1;
    }
  }
  return Object.freeze({
    castleSlot,
    resourcePotential,
    corePotential,
    castleCount,
    placementProof,
    resourcePotentialCount,
    corePotentialCount,
  });
}

function dormantThroneAnchor(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  waterRegime: Uint8Array,
  regionId: Uint8Array,
  barrier: Uint8Array,
  castleSlot: Uint8Array,
  resourcePotential: Uint8Array,
  corePotential: Uint8Array,
  gates: readonly GreaterRealmPrivateGate[],
): Readonly<{
  mask: Uint8Array;
  proof: boolean;
  barrierClearance: number;
}> {
  const distanceToBarrier = distanceFromMask(grid, barrier);
  const gateCells = new Uint8Array(grid.cellCount);
  for (const gate of gates) {
    gateCells[gate.firstCell] = 1;
    gateCells[gate.secondCell] = 1;
  }
  let centerQTotal = 0;
  let centerRTotal = 0;
  let centerCells = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (regionId[cell] !== TIER_III_REGION_INDEX) continue;
    centerQTotal += grid.q[cell]!;
    centerRTotal += grid.r[cell]!;
    centerCells += 1;
  }
  if (centerCells === 0) fail('GREATER_REALM_THRONE_REGION_INVARIANT');
  const roundedRatio = (numerator: number) => numerator >= 0
    ? Math.floor((numerator * 2 + centerCells) / (centerCells * 2))
    : -Math.floor((-numerator * 2 + centerCells) / (centerCells * 2));
  const centerQ = roundedRatio(centerQTotal);
  const centerR = roundedRatio(centerRTotal);
  let selected = -1;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      regionId[cell] !== TIER_III_REGION_INDEX
      || waterRegime[cell] !== 0
      || barrier[cell] !== 0
      || elevation[cell]! <= SEA_LEVEL
      || distanceToBarrier[cell]! < 4
      || castleSlot[cell] !== 0
      || resourcePotential[cell] !== 0
      || corePotential[cell] !== 0
      || gateCells[cell] !== 0
    ) continue;
    let passableNeighbors = 0;
    let footprintClear = true;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === TIER_III_REGION_INDEX
        && waterRegime[neighbor] === 0
        && barrier[neighbor] === 0
      ) passableNeighbors += 1;
      if (
        neighbor < 0
        || castleSlot[neighbor] !== 0
        || resourcePotential[neighbor] !== 0
        || corePotential[neighbor] !== 0
        || gateCells[neighbor] !== 0
      ) footprintClear = false;
    }
    if (passableNeighbors < 5 || !footprintClear) continue;
    const score = distanceToBarrier[cell]! * 4_000
      + Math.floor(Math.max(0, elevation[cell]!) / 4)
      - axialDistance(grid.q[cell]!, grid.r[cell]!, centerQ, centerR) * 120;
    if (score > selectedScore || (score === selectedScore && cell < selected)) {
      selected = cell;
      selectedScore = score;
    }
  }
  const mask = new Uint8Array(grid.cellCount);
  if (selected >= 0) mask[selected] = 1;
  let selectedPassableNeighbors = 0;
  let selectedFootprintClear = selected >= 0;
  if (selected >= 0) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[selected * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === TIER_III_REGION_INDEX
        && waterRegime[neighbor] === 0
        && barrier[neighbor] === 0
      ) selectedPassableNeighbors += 1;
      if (
        neighbor < 0
        || castleSlot[neighbor] !== 0
        || resourcePotential[neighbor] !== 0
        || corePotential[neighbor] !== 0
        || gateCells[neighbor] !== 0
      ) selectedFootprintClear = false;
    }
  }
  return Object.freeze({
    mask,
    proof: selected >= 0
      && mask.reduce((total, value) => total + value, 0) === 1
      && regionId[selected] === TIER_III_REGION_INDEX
      && waterRegime[selected] === 0
      && barrier[selected] === 0
      && castleSlot[selected] === 0
      && resourcePotential[selected] === 0
      && corePotential[selected] === 0
      && gateCells[selected] === 0
      && selectedPassableNeighbors >= 5
      && selectedFootprintClear
      && distanceToBarrier[selected]! >= 4,
    barrierClearance: selected < 0 ? 0 : distanceToBarrier[selected]!,
  });
}

function boundaryMetrics(
  grid: IndexedAxialGrid,
  waterRegime: Uint8Array,
): Readonly<{
  boundaryCells: number;
  maximumRadiusShareBasisPoints: number;
  rotationalSimilarityBasisPoints: number;
  maximumAlignedBoundaryRun: number;
  minimumBoundaryLandDistance: number;
  saltwaterBoundaryBasisPoints: number;
  naturalBoundary: boolean;
  deepOceanBoundary: boolean;
}> {
  const boundary: number[] = [];
  const boundaryByMissingDirection = Array.from(
    { length: HEX_NEIGHBOR_COUNT },
    () => new Uint8Array(grid.cellCount),
  );
  const land = new Uint8Array(grid.cellCount);
  const radiusCounts = new Map<number, number>();
  const keys = new Set<string>();
  for (let index = 0; index < grid.cellCount; index += 1) {
    keys.add(`${grid.q[index]},${grid.r[index]}`);
    if (waterRegime[index] === 0) land[index] = 1;
    let isBoundary = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[index * HEX_NEIGHBOR_COUNT + direction] !== -1) continue;
      boundaryByMissingDirection[direction]![index] = 1;
      isBoundary = true;
    }
    if (isBoundary) {
      boundary.push(index);
      const radius = axialDistance(grid.q[index]!, grid.r[index]!);
      radiusCounts.set(radius, (radiusCounts.get(radius) ?? 0) + 1);
    }
  }
  const maximumRadiusCount = Math.max(0, ...radiusCounts.values());
  const maximumRadiusShareBasisPoints = boundary.length === 0
    ? 10_000
    : Math.round((maximumRadiusCount * 10_000) / boundary.length);
  let rotatedIntersection = 0;
  for (let index = 0; index < grid.cellCount; index += 1) {
    const rotatedQ = -grid.r[index]!;
    const rotatedR = grid.q[index]! + grid.r[index]!;
    if (keys.has(`${rotatedQ},${rotatedR}`)) rotatedIntersection += 1;
  }
  const rotationalSimilarityBasisPoints = Math.round(
    (rotatedIntersection * 10_000) / (grid.cellCount * 2 - rotatedIntersection),
  );
  const maximumRadius = Math.max(...boundary.map(index => axialDistance(grid.q[index]!, grid.r[index]!)));
  const distanceToLand = distanceFromMask(grid, land);
  const minimumBoundaryLandDistance = Math.min(...boundary.map(index => distanceToLand[index]!));
  const saltwaterBoundaryCells = boundary.filter(index => waterRegime[index] === 1).length;
  const saltwaterBoundaryBasisPoints = boundary.length === 0
    ? 0
    : Math.round((saltwaterBoundaryCells * 10_000) / boundary.length);
  let maximumAlignedBoundaryRun = 0;
  for (const directionBoundary of boundaryByMissingDirection) {
    for (const component of connectedComponents(grid, directionBoundary)) {
      maximumAlignedBoundaryRun = Math.max(maximumAlignedBoundaryRun, component.length);
    }
  }
  return Object.freeze({
    boundaryCells: boundary.length,
    maximumRadiusShareBasisPoints,
    rotationalSimilarityBasisPoints,
    maximumAlignedBoundaryRun,
    minimumBoundaryLandDistance,
    saltwaterBoundaryBasisPoints,
    naturalBoundary: boundary.length > 0
      && maximumRadiusShareBasisPoints < 1_800
      && rotationalSimilarityBasisPoints < 9_300
      && maximumAlignedBoundaryRun <= 96,
    deepOceanBoundary: maximumRadius <= PRIVATE_CANVAS_RADIUS - 8
      && minimumBoundaryLandDistance >= 8
      && saltwaterBoundaryBasisPoints === 10_000,
  });
}

function topographicLandmassMetrics(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
): Readonly<{
  majorLandmassCount: number;
  largeIslandCount: number;
  smallIslandCount: number;
  proof: boolean;
}> {
  const land = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (elevation[cell]! > SEA_LEVEL) land[cell] = 1;
  }
  const componentSizes = connectedComponents(grid, land).map(component => component.length);
  const majorLandmassCount = componentSizes.filter(size => size >= 5_000).length;
  const largeIslandCount = componentSizes.filter(size => size >= 96 && size < 5_000).length;
  const smallIslandCount = componentSizes.filter(size => size > 0 && size < 96).length;
  return Object.freeze({
    majorLandmassCount,
    largeIslandCount,
    smallIslandCount,
    proof: majorLandmassCount >= 2
      && majorLandmassCount <= 4
      && largeIslandCount >= 3
      && largeIslandCount <= 8,
  });
}

function chunkMetrics(grid: IndexedAxialGrid): Readonly<{
  count: number;
  minimum: number;
  median: number;
  p95: number;
  maximum: number;
}> {
  const populations = new Map<string, number>();
  for (let index = 0; index < grid.cellCount; index += 1) {
    const chunkQ = Math.floor((grid.q[index]! + PRIVATE_CANVAS_RADIUS) / 15);
    const chunkR = Math.floor((grid.r[index]! + PRIVATE_CANVAS_RADIUS) / 15);
    const key = `${chunkQ}:${chunkR}`;
    populations.set(key, (populations.get(key) ?? 0) + 1);
  }
  const sorted = [...populations.values()].sort((first, second) => first - second);
  if (sorted.length === 0) fail('GREATER_REALM_CHUNKS_EMPTY');
  return Object.freeze({
    count: sorted.length,
    minimum: sorted[0]!,
    median: sorted[Math.floor((sorted.length - 1) * 0.5)]!,
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)]!,
    maximum: sorted[sorted.length - 1]!,
  });
}

function regionRanges(regionCounts: readonly number[]) {
  const tierI = regionCounts.slice(0, 6);
  const tierII = regionCounts.slice(6, 9);
  const tierIII = regionCounts.slice(9, 10);
  const range = (values: readonly number[]) => Object.freeze({
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  });
  return Object.freeze({ tierI: range(tierI), tierII: range(tierII), tierIII: range(tierIII) });
}

function regionBalance(values: readonly number[]): boolean {
  const sorted = [...values].sort((first, second) => first - second);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return values.every(value => value * 100 >= median * 75 && value * 100 <= median * 135);
}

function allActiveConnected(grid: IndexedAxialGrid): boolean {
  const all = new Uint8Array(grid.cellCount);
  all.fill(1);
  return connectedComponents(grid, all).length === 1;
}

function activeMaskHasNoEnclosedVoids(
  canvas: IndexedAxialGrid,
  mask: Uint8Array,
): boolean {
  const inactive = new Uint8Array(canvas.cellCount);
  for (let cell = 0; cell < canvas.cellCount; cell += 1) {
    if (mask[cell] === 0) inactive[cell] = 1;
  }
  return connectedComponents(canvas, inactive).every(component => component.some(cell => {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (canvas.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) return true;
    }
    return false;
  }));
}

function hydrologyIsAcyclic(
  grid: IndexedAxialGrid,
  receiver: Int32Array,
  filledElevation: Int32Array,
): boolean {
  if (receiver.length !== grid.cellCount || filledElevation.length !== grid.cellCount) return false;
  const incoming = new Uint32Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const downstream = receiver[cell]!;
    if (downstream === -1) continue;
    if (
      downstream < 0
      || downstream >= grid.cellCount
      || downstream === cell
      || filledElevation[downstream]! > filledElevation[cell]!
    ) return false;
    let isNeighbor = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === downstream) {
        isNeighbor = true;
        break;
      }
    }
    if (!isNeighbor) return false;
    incoming[downstream] += 1;
  }
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (incoming[cell] === 0) queue[tail++] = cell;
  }
  let visited = 0;
  while (head < tail) {
    const cell = queue[head++]!;
    visited += 1;
    const downstream = receiver[cell]!;
    if (downstream < 0) continue;
    incoming[downstream] -= 1;
    if (incoming[downstream] === 0) queue[tail++] = downstream;
  }
  return visited === grid.cellCount;
}

function candidateStageDigests(
  grid: IndexedAxialGrid,
  fields: Readonly<Record<string, IntegerTerrainArray>>,
): Readonly<Record<string, string>> {
  const groups = [
    ['geology', ['bedrockElevation', 'domainId', 'geologyId']],
    ['geomorphology', [
      'geomorphologyElevation',
      'geomorphologyTemperature',
      'geomorphologyMoisture',
      'geomorphologyTotalDelta',
      'geomorphologyGlacialDelta',
      'geomorphologyAridDelta',
      'geomorphologyVolcanicDelta',
      'geomorphologyCoastalDelta',
      'geomorphologyGlacialMask',
      'geomorphologyAridMask',
      'geomorphologyVolcanicMask',
      'geomorphologyVolcanicAnchorMask',
      'geomorphologyCoastalMask',
      'geomorphologyCoastalClass',
    ]],
    ['hydrology', ['elevation', 'filledElevation', 'flowReceiver', 'waterRegime']],
    ['topography', [
      'slope', 'aspect', 'profileCurvature', 'planCurvature', 'wetnessIndex',
      'exposure', 'distanceToCoast', 'distanceToFreshwater', 'watershedId',
      'ridgeId', 'temperature', 'moisture', 'biomeId', 'landformId',
    ]],
    ['strategy', ['regionId', 'tierId', 'barrier', 'castleSlot', 'throneAnchor']],
    ['final', Object.keys(fields)],
  ] as const;
  return Object.freeze(Object.fromEntries(groups.map(([stage, names]) => [
    stage,
    digestGreaterRealmTerrainStage(
      stage,
      grid,
      Object.fromEntries(names.map(name => [name, fields[name]!])) as Record<string, IntegerTerrainArray>,
    ),
  ])));
}

export function generateGreaterRealmCandidate(input: Readonly<{
  rootSeed: Uint8Array;
  candidateOrdinal: number;
}>): GreaterRealmPrivateCandidate {
  const seedMaterial = deriveGreaterRealmCandidateSeedMaterial(
    input.rootSeed,
    input.candidateOrdinal,
  );
  const candidateSeed = deriveCandidateSeed(seedMaterial);
  try {
    const canvas = greaterRealmPrivateCanvasAuthority();
    const domains = separatedDomains(candidateSeed);
    const geology = macroGeology(canvas, candidateSeed, domains);
    const thermallyShaped = erodeGreaterRealmThermally(canvas, geology.bedrock, {
      iterations: 3,
      talus: geology.resistance.map(value => 700 + Math.floor(value / 8)),
      transferNumerator: 1,
      transferDenominator: 24,
    }).elevation;
    const maskResult = activeMask(canvas, candidateSeed, thermallyShaped);
    const active = activeGridFromCanvas(canvas, maskResult.mask);
    const grid = active.grid;
    const projectedBedrock = projectInt32(geology.bedrock, active.sourceIndexes);
    const initialElevation = projectInt32(thermallyShaped, active.sourceIndexes);
    const resistance = projectInt32(geology.resistance, active.sourceIndexes);
    const uplift = projectInt32(geology.uplift, active.sourceIndexes);
    const domainId = projectUint8(geology.domainId, active.sourceIndexes);
    const geologyId = projectUint8(geology.geologyId, active.sourceIndexes);
    const legacy = placeLegacyLowlands(grid, candidateSeed, initialElevation);
    const volcanicPotential = Int32Array.from(
      domainId,
      value => domains[value]!.volcanicPotential,
    );
    const geomorphology = shapeGreaterRealmGeomorphology({
      grid,
      candidateSeed,
      elevation: initialElevation,
      tectonicUplift: uplift,
      rockResistance: resistance,
      volcanicPotential,
      legacyReserveCell: legacy.reserveCell,
      seaLevel: SEA_LEVEL,
    });
    const fluvial = fluvialPass(
      grid,
      geomorphology.elevation,
      resistance,
      legacy.protectedCell,
    );
    const reconciled = reconcileLegacyLowlandsTopography(
      grid,
      legacy,
      projectedBedrock,
      fluvial.elevation,
    );
    const provisionalStrategy = assignTiersAndRegions(
      grid,
      candidateSeed,
      reconciled.elevation,
      uplift,
      domainId,
      reconciled.flowAccumulation,
      legacy.reserveCell,
    );
    const surface = waterAndBiomes(
      grid,
      candidateSeed,
      reconciled.elevation,
      reconciled.filledElevation,
      reconciled.flowReceiver,
      reconciled.flowAccumulation,
      provisionalStrategy.tierId,
      legacy.protectedCell,
      geomorphology.temperature,
      geomorphology.moisture,
    );
    const legacySurfaceProof = overlayLegacyLowlandsSurface(
      grid,
      legacy,
      surface.waterRegime,
      surface.biomeId,
      surface.landformId,
    );
    const semanticStrategy = remapTierOneNaturalBasinsByCharacter(
      grid,
      provisionalStrategy,
      reconciled.elevation,
      uplift,
      reconciled.flowAccumulation,
      domainId,
      domains,
      surface.waterRegime,
      geomorphology.temperature,
      geomorphology.moisture,
      geomorphology.glacialMask,
      geomorphology.aridMask,
      geomorphology.volcanicMask,
      geomorphology.coastalMask,
      geomorphology.coastalClass,
    );
    const strategy = repairNaturalRegionLandCoherence(
      grid,
      semanticStrategy,
      surface.waterRegime,
      legacy.protectedCell,
    );
    const topography = deriveGreaterRealmTopography({
      grid,
      elevation: reconciled.elevation,
      flowReceiver: reconciled.flowReceiver,
      flowAccumulation: reconciled.flowAccumulation,
      waterRegime: surface.waterRegime,
      geologyId,
      tectonicUplift: uplift,
      rockResistance: resistance,
      regionId: strategy.regionId,
      tierId: strategy.tierId,
      legacyProtectedCell: legacy.protectedCell,
      protectedBiomeId: surface.biomeId,
      protectedLandformId: surface.landformId,
      geomorphicTemperature: geomorphology.temperature,
      geomorphicMoisture: geomorphology.moisture,
      geomorphicGlacialMask: geomorphology.glacialMask,
      geomorphicAridMask: geomorphology.aridMask,
      geomorphicVolcanicMask: geomorphology.volcanicMask,
      geomorphicCoastalClass: geomorphology.coastalClass,
    });
    const finalHydrology = finalHydrologyMetrics(
      grid,
      reconciled.elevation,
      reconciled.filledElevation,
      reconciled.flowReceiver,
      reconciled.flowAccumulation,
      surface.waterRegime,
      legacy.protectedCell,
    );
    const strategicBarrier = barriersAndGates(
      grid,
      candidateSeed,
      reconciled.elevation,
      uplift,
      surface.waterRegime,
      strategy.tierId,
      strategy.regionId,
      strategy.gateGraph,
      legacy.protectedCell,
    );
    const sites = castleAndPotentialSites(
      grid,
      candidateSeed,
      reconciled.elevation,
      surface.waterRegime,
      strategy.tierId,
      strategy.regionId,
      strategicBarrier.barrier,
      strategicBarrier.gates,
      legacy.protectedCell,
      legacy.castleSlot,
    );
    const throne = dormantThroneAnchor(
      grid,
      reconciled.elevation,
      surface.waterRegime,
      strategy.regionId,
      strategicBarrier.barrier,
      sites.castleSlot,
      sites.resourcePotential,
      sites.corePotential,
      strategicBarrier.gates,
    );
    const boundary = boundaryMetrics(grid, surface.waterRegime);
    const landmasses = topographicLandmassMetrics(grid, reconciled.elevation);
    const chunks = chunkMetrics(grid);
    let landCellCount = 0;
    let waterCellCount = 0;
    let mountainBarrierCells = 0;
    for (let index = 0; index < grid.cellCount; index += 1) {
      // Public land/water shares describe the continent's topographic footprint;
      // rivers and enclosed surface-water overlays remain features of that land.
      if (reconciled.elevation[index]! > SEA_LEVEL) landCellCount += 1;
      else waterCellCount += 1;
      if (strategicBarrier.geologicalBarrierBand[index] !== 0) mountainBarrierCells += 1;
    }
    const geologicalBarrierMask = Uint8Array.from(
      strategicBarrier.geologicalBarrierBand,
      value => value === 0 ? 0 : 1,
    );
    const barrierComponents = connectedComponents(
      grid,
      geologicalBarrierMask,
    );
    const barrierSystems = barrierComponents.filter(component => component.length >= 64);
    const continuousBarrierCells = barrierSystems.reduce(
      (total, component) => total + component.length,
      0,
    );
    const tierICounts = strategy.regionCounts.slice(0, 6);
    const tierIICounts = strategy.regionCounts.slice(6, 9);
    const approvedRange = grid.cellCount >= 100_000 && grid.cellCount <= 150_000;
    const tierIBasisPoints = Math.round((strategy.tierCounts[0] * 10_000) / grid.cellCount);
    const tierIIBasisPoints = Math.round((strategy.tierCounts[1] * 10_000) / grid.cellCount);
    const tierIIIBasisPoints = 10_000 - tierIBasisPoints - tierIIBasisPoints;
    const topology = strategicBarrier.passableTopology;
    const strategicShape = strategicShapeMetrics(
      grid,
      strategy.tierId,
      strategy.regionId,
      surface.waterRegime,
      strategicBarrier.barrier,
      topology,
    );
    const tierThreePassableLandCells = topology.passableCounts[TIER_III_REGION_INDEX]!;
    const smallestOtherRegionPassableLandCells = Math.min(
      ...topology.passableCounts.slice(0, TIER_III_REGION_INDEX),
    );
    const hydrologyAcyclic = hydrologyIsAcyclic(
      grid,
      reconciled.flowReceiver,
      reconciled.filledElevation,
    );
    const naturalComposition = measureGreaterRealmNaturalComposition({
      grid,
      canvasRadius: PRIVATE_CANVAS_RADIUS,
      elevation: reconciled.elevation,
      tierId: strategy.tierId,
      waterRegime: surface.waterRegime,
      biomeId: topography.biomeId,
      legacyProtectedCell: legacy.protectedCell,
      ridgeId: topography.ridgeId,
      landformId: topography.landformId,
      slope: topography.slope,
      seaLevel: SEA_LEVEL,
      dryWaterRegime: WATER_DRY,
      oceanWaterRegime: WATER_OCEAN,
      seaWaterRegime: WATER_SEA,
    });
    const proofs = Object.freeze({
      activeMaskConnected: allActiveConnected(grid)
        && activeMaskHasNoEnclosedVoids(canvas, maskResult.mask),
      approvedCellRange: approvedRange,
      barriersHaveNoBypass: strategicBarrier.barrierProof,
      biomeCoherence:
        topography.biomeMetrics.incompatibleVisualBiomeAdjacencyCount === 0
        && topography.biomeMetrics.incompatibleBiomeLandformPairCount === 0,
      biomeDiversity: topography.biomeMetrics.visualBiomeClassCount >= 8
        && topography.biomeMetrics.minimumRegionVisualBiomeClassCount >= 3
        && topography.biomeMetrics.minimumTierIVisualBiomeClassCount >= 6
        && topography.biomeMetrics.minimumTierIIVisualBiomeClassCount >= 5
        && topography.biomeMetrics.tierIIIVisualBiomeClassCount >= 3
        && topography.biomeMetrics.minimumTierIMajorVisualBiomeClassCount >= 4
        && topography.biomeMetrics.minimumTierITransitionVisualBiomeClassCount >= 2
        && topography.biomeMetrics.minimumTierIIMajorVisualBiomeClassCount >= 5
        && topography.biomeMetrics.tierIIIMajorVisualBiomeClassCount >= 3
        && topography.biomeMetrics.maximumTierISingleBiomeShareBasisPoints <= 5_500,
      castleCapacity: sites.placementProof,
      deepOceanBoundary: boundary.deepOceanBoundary,
      dormantThroneAnchor: throne.proof,
      gateApproaches: strategicBarrier.gateApproachProof,
      gateGraph: strategicBarrier.gateGraphProof,
      geologicalHighlandBarriers: strategicBarrier.geologicalHighlandProof,
      advancedGeomorphology: geomorphology.metrics.changedCellCount > 0
        && geomorphology.metrics.maximumAbsoluteCellDelta <= 8_192
        && geomorphology.metrics.protectedChangedCellCount === 0
        && geomorphology.metrics.erodedMaterialUnits
          === geomorphology.metrics.depositedMaterialUnits
            + geomorphology.metrics.exportedMaterialUnits
        && geomorphology.metrics.glacialClimateCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.aridClimateCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.volcanicTectonicCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.coastalProximityCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.glacial.systemCount > 0
        && geomorphology.metrics.glacial.minimumSystemCellCount >= 6
        && geomorphology.metrics.arid.systemCount > 0
        && geomorphology.metrics.arid.minimumSystemCellCount >= 8
        && geomorphology.metrics.volcanicAnchorCount >= 2
        && geomorphology.metrics.volcanicAnchorCount <= 8
        && geomorphology.metrics.coastalClassCount >= 3
        && geomorphology.metrics.ridgeUpliftAlignmentBasisPoints >= 8_500
        && geomorphology.metrics.riverValleyAlignmentBasisPoints >= 8_500,
      hydrologyAcyclic,
      hydrologySurfaceConsistency: finalHydrology.surfaceConsistencyProof,
      legacyLowlandsPreserved: legacy.proof && legacySurfaceProof,
      naturalLandmassTopology: landmasses.proof,
      naturalStrategicRegions: strategicShape.nonRadialProof,
      naturalOuterBoundary: boundary.naturalBoundary,
      regionLandCoherence: strategicBarrier.passableRegionProof
        && strategicShape.fragmentationProof
        && strategicShape.compactnessProof
        && strategicShape.tendrilProof,
      regionPassableLand: strategicBarrier.passableRegionProof,
      regionGraph: strategicBarrier.regionGraphProof,
      naturalLandSilhouette: naturalComposition.landSilhouette.proof,
      dominantContinentComposition: naturalComposition.dominantContinent.proof,
      deepOceanBreathingRoom: naturalComposition.oceanBreathingRoom.proof,
      forestPatchComposition: naturalComposition.forestPatches.proof,
      mountainSystemComposition: naturalComposition.mountainSystems.proof,
    });
    const hardGates = Object.freeze({
      ...Object.fromEntries(Object.entries(proofs).map(([key, value]) => [
        `PROOF_${key.replace(/([a-z])([A-Z])/gu, '$1_$2').toUpperCase()}`,
        value,
      ])),
      LAND_SHARE_6200_7200: landCellCount * 10_000 >= grid.cellCount * 6_200
        && landCellCount * 10_000 <= grid.cellCount * 7_200,
      TIER_I_SHARE_6800_7400: tierIBasisPoints >= 6_800 && tierIBasisPoints <= 7_400,
      TIER_II_SHARE_2200_2700: tierIIBasisPoints >= 2_200 && tierIIBasisPoints <= 2_700,
      TIER_III_SHARE_0300_0600: tierIIIBasisPoints >= 300 && tierIIIBasisPoints <= 600,
      TIER_I_REGION_BALANCE: regionBalance(tierICounts),
      TIER_II_REGION_BALANCE: regionBalance(tierIICounts),
      TIER_III_SMALLEST_TOTAL_CELLS: strategy.regionCounts[TIER_III_REGION_INDEX]!
        < Math.min(...strategy.regionCounts.slice(0, TIER_III_REGION_INDEX)),
      TIER_III_SMALLEST_PASSABLE_LAND: tierThreePassableLandCells
        < smallestOtherRegionPassableLandCells,
      HYDROLOGY_MAJOR_OCEAN_SEA_BODIES_4_6: finalHydrology.majorOceanSeaBodies >= 4
        && finalHydrology.majorOceanSeaBodies <= 6,
      HYDROLOGY_MAJOR_RIVERS_48_72: finalHydrology.majorRivers >= 48
        && finalHydrology.majorRivers <= 72,
      HYDROLOGY_MINOR_STREAMS_120_240: finalHydrology.minorStreams >= 120
        && finalHydrology.minorStreams <= 240,
      HYDROLOGY_LAKES_48_96: finalHydrology.lakes >= 48
        && finalHydrology.lakes <= 96,
      SEDIMENT_MATERIAL_BUDGET: fluvial.erodedMaterialUnits
        === fluvial.depositedMaterialUnits + fluvial.exportedSedimentUnits,
    });
    const eligibilityFailureCodes = Object.freeze(Object.entries(hardGates)
      .filter(([, passed]) => !passed)
      .map(([code]) => code));
    const eligible = eligibilityFailureCodes.length === 0;
    const axialArtifactBasisPoints = clamp(
      boundary.maximumRadiusShareBasisPoints
        + Math.floor(boundary.rotationalSimilarityBasisPoints / 3)
        + boundary.maximumAlignedBoundaryRun * 8,
      0,
      10_000,
    );
    const legacyBoundaryNaturalnessBasisPoints = clamp(
      10_000 - axialArtifactBasisPoints,
      0,
      10_000,
    );
    const compositionNaturalnessBasisPoints = Math.round((
      clamp(
        10_000 - naturalComposition.landSilhouette.raster256.rotationalIouBasisPoints,
        0,
        10_000,
      )
      + clamp(
        10_000
          - naturalComposition.landSilhouette.maximumAlignedCoastRunShareBasisPoints,
        0,
        10_000,
      )
      + clamp(
        10_000 - Math.abs(
          naturalComposition.landSilhouette.dominantLandSolidityBasisPoints - 7_900,
        ) * 5,
        0,
        10_000,
      )
      + clamp(
        naturalComposition.oceanBreathingRoom.boundaryLandDistanceP50 * 400,
        0,
        10_000,
      )
      + naturalComposition.forestPatches.clusteredShareBasisPoints
      + naturalComposition.mountainSystems.clusteredShareBasisPoints
    ) / 6);
    const scoreRange = (value: number, minimum: number, maximum: number) => {
      if (value >= minimum && value <= maximum) return 10_000;
      const miss = value < minimum ? minimum - value : value - maximum;
      return clamp(10_000 - Math.round((miss * 10_000) / Math.max(1, maximum - minimum)), 0, 10_000);
    };
    const hydrologyCoherenceBasisPoints = Math.round((
      scoreRange(finalHydrology.majorOceanSeaBodies, 4, 6)
      + scoreRange(finalHydrology.majorRivers, 48, 72)
      + scoreRange(finalHydrology.minorStreams, 120, 240)
      + scoreRange(finalHydrology.lakes, 48, 96)
      + (finalHydrology.surfaceConsistencyProof ? 10_000 : 0)
      + (hydrologyAcyclic ? 10_000 : 0)
    ) / 6);
    const ridgeContinuityBasisPoints = mountainBarrierCells === 0
      ? 0
      : Math.round((continuousBarrierCells * 10_000) / mountainBarrierCells);
    const aggregate = Object.freeze({
      eligible,
      activeCellCount: grid.cellCount,
      landCellCount,
      waterCellCount,
      tierCellCounts: Object.freeze({
        tierI: strategy.tierCounts[0],
        tierII: strategy.tierCounts[1],
        tierIII: strategy.tierCounts[2],
      }),
      regionSizeRanges: regionRanges(strategy.regionCounts),
      hydrology: Object.freeze({
        majorOceanSeaBodies: finalHydrology.majorOceanSeaBodies,
        majorRivers: finalHydrology.majorRivers,
        minorStreams: finalHydrology.minorStreams,
        lakes: finalHydrology.lakes,
      }),
      geology: Object.freeze({
        pseudoTectonicDomains: domains.length,
        mountainSystems: naturalComposition.mountainSystems.broadComponentCount,
        watersheds: finalHydrology.watersheds,
      }),
      topography: Object.freeze({
        signedElevationMinimum: topography.topographyMetrics.elevationMinimum,
        signedElevationMaximum: topography.topographyMetrics.elevationMaximum,
        slopeP50: topography.topographyMetrics.slopeP50,
        slopeP95: topography.topographyMetrics.slopeP95,
        ridgeCellCount: topography.topographyMetrics.ridgeCells,
        plateauCellCount: topography.topographyMetrics.plateauCells,
        basinCellCount: topography.topographyMetrics.basinCells,
        coastCellCount: topography.topographyMetrics.coastCells,
      }),
      biomes: Object.freeze({
        visualClassCount: topography.biomeMetrics.visualBiomeClassCount,
        minimumPerRegionVisualClassCount:
          topography.biomeMetrics.minimumRegionVisualBiomeClassCount,
        minimumTierIVisualClassCount:
          topography.biomeMetrics.minimumTierIVisualBiomeClassCount,
        minimumTierIIVisualClassCount:
          topography.biomeMetrics.minimumTierIIVisualBiomeClassCount,
        tierIIIVisualClassCount: topography.biomeMetrics.tierIIIVisualBiomeClassCount,
        minimumTierIMajorVisualClassCount:
          topography.biomeMetrics.minimumTierIMajorVisualBiomeClassCount,
        minimumTierITransitionVisualClassCount:
          topography.biomeMetrics.minimumTierITransitionVisualBiomeClassCount,
        minimumTierIIMajorVisualClassCount:
          topography.biomeMetrics.minimumTierIIMajorVisualBiomeClassCount,
        tierIIIMajorVisualClassCount:
          topography.biomeMetrics.tierIIIMajorVisualBiomeClassCount,
        maximumTierISingleBiomeShareBasisPoints:
          topography.biomeMetrics.maximumTierISingleBiomeShareBasisPoints,
        incompatibleVisualAdjacencyCount:
          topography.biomeMetrics.incompatibleVisualBiomeAdjacencyCount,
        incompatibleBiomeLandformPairCount:
          topography.biomeMetrics.incompatibleBiomeLandformPairCount,
      }),
      quality: Object.freeze({
        naturalnessBasisPoints: Math.round((
          legacyBoundaryNaturalnessBasisPoints + compositionNaturalnessBasisPoints
        ) / 2),
        axialArtifactBasisPoints,
        ridgeContinuityBasisPoints,
        hydrologyCoherenceBasisPoints,
      }),
      gateCount: strategicBarrier.gates.length,
      castleSlotCount: sites.castleCount,
      proofs,
    });
    const fields: Readonly<Record<string, IntegerTerrainArray>> = Object.freeze({
      bedrockElevation: reconciled.bedrockElevation,
      elevation: reconciled.elevation,
      filledElevation: reconciled.filledElevation,
      sedimentDepth: fluvial.sedimentDepth,
      flowReceiver: reconciled.flowReceiver,
      flowAccumulation: reconciled.flowAccumulation,
      domainId,
      geologyId,
      tectonicUplift: uplift,
      rockResistance: resistance,
      geomorphologyElevation: geomorphology.elevation,
      geomorphologyTemperature: geomorphology.temperature,
      geomorphologyMoisture: geomorphology.moisture,
      geomorphologyTotalDelta: geomorphology.totalDelta,
      geomorphologyGlacialDelta: geomorphology.glacialDelta,
      geomorphologyAridDelta: geomorphology.aridDelta,
      geomorphologyVolcanicDelta: geomorphology.volcanicDelta,
      geomorphologyCoastalDelta: geomorphology.coastalDelta,
      geomorphologyGlacialMask: geomorphology.glacialMask,
      geomorphologyAridMask: geomorphology.aridMask,
      geomorphologyVolcanicMask: geomorphology.volcanicMask,
      geomorphologyVolcanicAnchorMask: geomorphology.volcanicAnchorMask,
      geomorphologyCoastalMask: geomorphology.coastalMask,
      geomorphologyCoastalClass: geomorphology.coastalClass,
      regionId: strategy.regionId,
      tierId: strategy.tierId,
      waterRegime: surface.waterRegime,
      biomeId: topography.biomeId,
      landformId: topography.landformId,
      slope: topography.slope,
      aspect: topography.aspect,
      profileCurvature: topography.profileCurvature,
      planCurvature: topography.planCurvature,
      wetnessIndex: topography.wetnessIndex,
      exposure: topography.exposure,
      distanceToCoast: topography.distanceToCoast,
      distanceToFreshwater: topography.distanceToFreshwater,
      watershedId: topography.watershedId,
      ridgeId: topography.ridgeId,
      temperature: topography.temperature,
      moisture: topography.moisture,
      barrier: strategicBarrier.barrier,
      geologicalBarrierBand: strategicBarrier.geologicalBarrierBand,
      castleSlot: sites.castleSlot,
      resourcePotential: sites.resourcePotential,
      corePotential: sites.corePotential,
      throneAnchor: throne.mask,
      legacyLowlandsCell: legacy.worldCell,
      legacyLowlandsProtectedCell: legacy.protectedCell,
      legacyLowlandsReserveCell: legacy.reserveCell,
      legacyLowlandsCastleSlot: legacy.castleSlot,
    });
    const stageDigests = candidateStageDigests(grid, fields);
    return Object.freeze({
      candidateOrdinal: input.candidateOrdinal,
      seedMaterial,
      candidateSeed,
      domains,
      grid,
      legacyLowlandsTransform: legacy.transform,
      legacyLowlandsCell: legacy.worldCell,
      legacyLowlandsProtectedCell: legacy.protectedCell,
      legacyLowlandsReserveCell: legacy.reserveCell,
      legacyLowlandsCastleSlot: legacy.castleSlot,
      bedrockElevation: reconciled.bedrockElevation,
      elevation: reconciled.elevation,
      filledElevation: reconciled.filledElevation,
      sedimentDepth: fluvial.sedimentDepth,
      flowReceiver: reconciled.flowReceiver,
      flowAccumulation: reconciled.flowAccumulation,
      domainId,
      geologyId,
      tectonicUplift: uplift,
      rockResistance: resistance,
      geomorphologyElevation: geomorphology.elevation,
      geomorphologyTemperature: geomorphology.temperature,
      geomorphologyMoisture: geomorphology.moisture,
      geomorphologyTotalDelta: geomorphology.totalDelta,
      geomorphologyGlacialDelta: geomorphology.glacialDelta,
      geomorphologyAridDelta: geomorphology.aridDelta,
      geomorphologyVolcanicDelta: geomorphology.volcanicDelta,
      geomorphologyCoastalDelta: geomorphology.coastalDelta,
      geomorphologyGlacialMask: geomorphology.glacialMask,
      geomorphologyAridMask: geomorphology.aridMask,
      geomorphologyVolcanicMask: geomorphology.volcanicMask,
      geomorphologyVolcanicAnchorMask: geomorphology.volcanicAnchorMask,
      geomorphologyCoastalMask: geomorphology.coastalMask,
      geomorphologyCoastalClass: geomorphology.coastalClass,
      regionId: strategy.regionId,
      tierId: strategy.tierId,
      waterRegime: surface.waterRegime,
      biomeId: topography.biomeId,
      landformId: topography.landformId,
      slope: topography.slope,
      aspect: topography.aspect,
      profileCurvature: topography.profileCurvature,
      planCurvature: topography.planCurvature,
      wetnessIndex: topography.wetnessIndex,
      exposure: topography.exposure,
      distanceToCoast: topography.distanceToCoast,
      distanceToFreshwater: topography.distanceToFreshwater,
      watershedId: topography.watershedId,
      ridgeId: topography.ridgeId,
      temperature: topography.temperature,
      moisture: topography.moisture,
      barrier: strategicBarrier.barrier,
      geologicalBarrierBand: strategicBarrier.geologicalBarrierBand,
      castleSlot: sites.castleSlot,
      resourcePotential: sites.resourcePotential,
      corePotential: sites.corePotential,
      throneAnchor: throne.mask,
      tierOneSemanticPermutation: strategy.semanticPermutation,
      gateGraph: strategy.gateGraph,
      gates: strategicBarrier.gates,
      barrierCrossSections: strategicBarrier.barrierCrossSections,
      stageDigests,
      aggregate,
      privateMetrics: Object.freeze({
        activeBoundaryCells: boundary.boundaryCells,
        maximumBoundaryRadiusShareBasisPoints: boundary.maximumRadiusShareBasisPoints,
        rotationalSimilarityBasisPoints: boundary.rotationalSimilarityBasisPoints,
        maximumAlignedBoundaryRun: boundary.maximumAlignedBoundaryRun,
        minimumBoundaryLandDistance: boundary.minimumBoundaryLandDistance,
        saltwaterBoundaryBasisPoints: boundary.saltwaterBoundaryBasisPoints,
        majorLandmassCount: landmasses.majorLandmassCount,
        largeIslandCount: landmasses.largeIslandCount,
        smallIslandCount: landmasses.smallIslandCount,
        mountainBarrierCells,
        measuredMinimumBarrierWidth: strategicBarrier.measuredMinimumBarrierWidth,
        measuredMaximumBarrierWidth: strategicBarrier.measuredMaximumBarrierWidth,
        gateRouteRedundancyProof: strategicBarrier.gateRouteRedundancyProof,
        lakeBasinCandidates: surface.lakeBasinCandidates,
        riverMouthCandidates: surface.riverMouthCandidates,
        streamHeadCandidates: surface.streamHeadCandidates,
        resourcePotentialSites: sites.resourcePotentialCount,
        corePotentialSites: sites.corePotentialCount,
        chunkCount: chunks.count,
        chunkPopulationMinimum: chunks.minimum,
        chunkPopulationMedian: chunks.median,
        chunkPopulationP95: chunks.p95,
        chunkPopulationMaximum: chunks.maximum,
        erodedMaterialUnits: fluvial.erodedMaterialUnits,
        depositedMaterialUnits: fluvial.depositedMaterialUnits,
        exportedSedimentUnits: fluvial.exportedSedimentUnits,
        minimumLargestPassableRegionShareBasisPoints: Math.min(
          ...topology.largestSharesBasisPoints,
        ),
        largestPassableRegionSharesBasisPoints: topology.largestSharesBasisPoints,
        minorPassableFragmentSharesBasisPoints:
          strategicShape.minorFragmentSharesBasisPoints,
        passableBoundaryDensityBasisPoints: strategicShape.boundaryDensityBasisPoints,
        passableTendrilSharesBasisPoints: strategicShape.tendrilSharesBasisPoints,
        tierRadialAgreementBasisPoints: strategicShape.tierRadialAgreementBasisPoints,
        radialTierOneBoundaryShareBasisPoints:
          strategicShape.radialTierOneBoundaryShareBasisPoints,
        highlandBarrierShareBasisPoints:
          strategicBarrier.highlandBarrierShareBasisPoints,
        barrierMeanElevationAdvantage: strategicBarrier.barrierMeanElevationAdvantage,
        barrierMeanUpliftAdvantage: strategicBarrier.barrierMeanUpliftAdvantage,
        naturalComposition,
        geomorphology: geomorphology.metrics,
        throneAnchorBarrierClearance: throne.barrierClearance,
        tierThreePassableLandCells,
        smallestOtherRegionPassableLandCells,
        eligibilityFailureCodes,
      }),
    });
  } catch (error) {
    seedMaterial.fill(0);
    candidateSeed.fill(0);
    throw error;
  }
}

export function clearGreaterRealmCandidateSecret(candidate: GreaterRealmPrivateCandidate): void {
  candidate.seedMaterial.fill(0);
  candidate.candidateSeed.fill(0);
}
