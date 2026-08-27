import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_REGION_SPECS,
  clearGreaterRealmCandidateSecret,
  deriveGreaterRealmBoundaryConnectedInitialSeaMask,
  deriveGreaterRealmCandidateSeedMaterial,
  enforceGreaterRealmStandingWaterBodySurfaceProof,
  generateGreaterRealmCandidate,
  hasGreaterRealmStandingWaterBodySurfaceProof,
  selectGreaterRealmCompatibleStandingWaterComponents,
  type GreaterRealmPrivateCandidate,
} from '../scripts/atlas/greater-realm-candidate-generator';
import {
  greaterRealmCandidateRejectionCode,
} from '../scripts/atlas/greater-realm-candidate-rejection';
import { GREATER_REALM_PROOF_KEYS } from '../scripts/atlas/greater-realm-contracts';
import { GREATER_REALM_ROUTE_CLASS } from '../scripts/atlas/greater-realm-living-world';
import { measureGreaterRealmReliefStructure } from '../scripts/atlas/greater-realm-relief-structure';
import { measureGreaterRealmCastleSuitability } from '../scripts/atlas/greater-realm-strategic-audits';
import {
  GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY,
} from '../scripts/atlas/greater-realm-topographic-qa';
import {
  GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
  inverseGlobalToLegacyLowlands,
  transformLegacyLowlandsToGlobal,
} from '../scripts/atlas/greater-realm-legacy-lowlands';
import {
  digestGreaterRealmTerrainStage,
  greaterRealmCounterRandomU32,
  greaterRealmHexDistance,
  greaterRealmTerrainChannelId,
  indexGreaterRealmAxialGrid,
  type IntegerTerrainArray,
} from '../scripts/atlas/greater-realm-terrain';

const PINNED_ROOT_LABEL = 'greater-realm-ordinary-parent-a';
const SAME_FIRST_WORD_BASELINE_ROOT_INDEX = 23_248;
const SAME_FIRST_WORD_ROOT_INDEX = 41_769;
const PINNED_ORDINAL = 9;
const EXPECTED_PINNED_FINAL_DIGEST =
  'e706f79b8fbe46a814f8ff4d40a6e4dee5cfb47424509656bdf4cdc43f407608';
const SAME_FIRST_WORD_ORDINAL = 0;
const SECONDARY_ORDINAL = 10;
const REJECTED_ROOT_LABEL = 'greater-realm-secondary-fixture';
const REJECTED_ORDINAL = 19;
const EXPECTED_ACTIVE_CELL_MINIMUM = 100_000;
const EXPECTED_ACTIVE_CELL_MAXIMUM = 150_000;
const EXPECTED_CASTLES_PER_FRONTIER_REGION = 100;

let pinned: GreaterRealmPrivateCandidate | undefined;
let pinnedGateApronSearchLanes: Array<'ordinary' | 'lowlands-repair'> = [];
let replayFingerprint: string | undefined;
let secondaryEvidence: Readonly<{
  candidateOrdinal: number;
  candidateSeedDigest: string;
  finalDigest: string;
  gridDigest: string;
  reliefMatches: boolean;
  forestProof: boolean;
  eligibilityFailureCodes: readonly string[];
}> | undefined;
let rejectedFixtureEvidence: Readonly<{
  code: ReturnType<typeof greaterRealmCandidateRejectionCode>;
  retiredLargeAuthorityCount: number;
  allRetiredAuthoritiesCleared: boolean;
}> | undefined;
let sameFirstWordBaseline: Uint32Array | undefined;
let sameFirstWordVariant: Uint32Array | undefined;
let mathRandomCallCount = 0;

function programmaticRoot(index: number): Uint8Array {
  return Uint8Array.from(createHash('sha256')
    .update('greater-realm-test-root\0', 'utf8')
    .update(String(index), 'utf8')
    .digest());
}

function pinnedRoot(): Uint8Array {
  return Uint8Array.from(createHash('sha256')
    .update(`${PINNED_ROOT_LABEL}\0`, 'utf8')
    .digest());
}

function deriveTestCandidateSeed(rootSeed: Uint8Array): Uint32Array {
  const material = deriveGreaterRealmCandidateSeedMaterial(rootSeed, SAME_FIRST_WORD_ORDINAL);
  const digest = createHash('sha256')
    .update('warpkeep-greater-realm-u32-v1\0', 'utf8')
    .update(material)
    .digest();
  try {
    return new Uint32Array([
      digest.readUInt32LE(0),
      digest.readUInt32LE(4),
      digest.readUInt32LE(8),
      digest.readUInt32LE(12),
    ]);
  } finally {
    material.fill(0);
    digest.fill(0);
  }
}

function requirePinnedCandidate(): GreaterRealmPrivateCandidate {
  if (!pinned) {
    throw new Error('GREATER_REALM_CANDIDATE_FIXTURE_MISSING');
  }
  return pinned;
}

function updateFingerprintArray(
  hash: ReturnType<typeof createHash>,
  label: string,
  value: ArrayBufferView,
): void {
  hash.update(label, 'utf8');
  hash.update('\0', 'utf8');
  hash.update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  hash.update('\0', 'utf8');
}

function candidateReplayFingerprint(candidate: GreaterRealmPrivateCandidate): string {
  const hash = createHash('sha256').update(
    'warpkeep-greater-realm-test-replay-fingerprint-v1\0',
    'utf8',
  );
  updateFingerprintArray(hash, 'seedMaterial', candidate.seedMaterial);
  updateFingerprintArray(hash, 'candidateSeed', candidate.candidateSeed);
  updateFingerprintArray(hash, 'grid.q', candidate.grid.q);
  updateFingerprintArray(hash, 'grid.r', candidate.grid.r);
  for (const [label, value] of [
    ['domains', candidate.domains],
    ['gates', candidate.gates],
    ['barrierCrossSections', candidate.barrierCrossSections],
    ['stageDigests', candidate.stageDigests],
    ['aggregate', candidate.aggregate],
    ['privateMetrics', candidate.privateMetrics],
  ] as const) {
    hash.update(label, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(JSON.stringify(value), 'utf8');
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex');
}

function candidateSeedDigest(value: Uint32Array): string {
  const hash = createHash('sha256').update(
    'warpkeep-greater-realm-test-candidate-seed-v1\0',
    'utf8',
  );
  updateFingerprintArray(hash, 'candidateSeed', value);
  return hash.digest('hex');
}

function gridDigest(candidate: GreaterRealmPrivateCandidate): string {
  const hash = createHash('sha256').update(
    'warpkeep-greater-realm-test-grid-v1\0',
    'utf8',
  );
  updateFingerprintArray(hash, 'q', candidate.grid.q);
  updateFingerprintArray(hash, 'r', candidate.grid.r);
  return hash.digest('hex');
}

function candidateFields(
  candidate: GreaterRealmPrivateCandidate,
): Readonly<Record<string, IntegerTerrainArray>> {
  return Object.freeze({
    bedrockElevation: candidate.bedrockElevation,
    elevation: candidate.elevation,
    filledElevation: candidate.filledElevation,
    sedimentDepth: candidate.sedimentDepth,
    flowReceiver: candidate.flowReceiver,
    flowAccumulation: candidate.flowAccumulation,
    domainId: candidate.domainId,
    geologyId: candidate.geologyId,
    tectonicUplift: candidate.tectonicUplift,
    rockResistance: candidate.rockResistance,
    geomorphologyElevation: candidate.geomorphologyElevation,
    geomorphologyTemperature: candidate.geomorphologyTemperature,
    geomorphologyMoisture: candidate.geomorphologyMoisture,
    geomorphologyTotalDelta: candidate.geomorphologyTotalDelta,
    geomorphologyTerraceDelta: candidate.geomorphologyTerraceDelta,
    geomorphologyGlacialDelta: candidate.geomorphologyGlacialDelta,
    geomorphologyAridDelta: candidate.geomorphologyAridDelta,
    geomorphologyVolcanicDelta: candidate.geomorphologyVolcanicDelta,
    geomorphologyCoastalDelta: candidate.geomorphologyCoastalDelta,
    geomorphologyGlacialMask: candidate.geomorphologyGlacialMask,
    geomorphologyAridMask: candidate.geomorphologyAridMask,
    geomorphologyVolcanicMask: candidate.geomorphologyVolcanicMask,
    geomorphologyVolcanicAnchorMask: candidate.geomorphologyVolcanicAnchorMask,
    geomorphologyCoastalMask: candidate.geomorphologyCoastalMask,
    geomorphologyCoastalClass: candidate.geomorphologyCoastalClass,
    regionId: candidate.regionId,
    tierId: candidate.tierId,
    waterRegime: candidate.waterRegime,
    waterBodyId: candidate.waterBodyId,
    waterDepthClass: candidate.waterDepthClass,
    waterSurfaceLevel: candidate.waterSurfaceLevel,
    waterDownstream: candidate.waterDownstream,
    waterBankSeed: candidate.waterBankSeed,
    waterGenerationVersion: candidate.waterGenerationVersion,
    biomeId: candidate.biomeId,
    landformId: candidate.landformId,
    slope: candidate.slope,
    aspect: candidate.aspect,
    profileCurvature: candidate.profileCurvature,
    planCurvature: candidate.planCurvature,
    wetnessIndex: candidate.wetnessIndex,
    exposure: candidate.exposure,
    distanceToCoast: candidate.distanceToCoast,
    distanceToFreshwater: candidate.distanceToFreshwater,
    watershedId: candidate.watershedId,
    ridgeId: candidate.ridgeId,
    temperature: candidate.temperature,
    moisture: candidate.moisture,
    barrier: candidate.barrier,
    geologicalBarrierBand: candidate.geologicalBarrierBand,
    castleSlot: candidate.castleSlot,
    resourcePotential: candidate.resourcePotential,
    corePotential: candidate.corePotential,
    throneAnchor: candidate.throneAnchor,
    dressingExcluded: candidate.dressingExcluded,
    ecologyClass: candidate.ecologyClass,
    vegetationDensity: candidate.vegetationDensity,
    groundcoverDensity: candidate.groundcoverDensity,
    wildflowerDensity: candidate.wildflowerDensity,
    routeClass: candidate.routeClass,
    landmarkClass: candidate.landmarkClass,
    ambientLifeClass: candidate.ambientLifeClass,
    legacyLowlandsCell: candidate.legacyLowlandsCell,
    legacyLowlandsProtectedCell: candidate.legacyLowlandsProtectedCell,
    legacyLowlandsReserveCell: candidate.legacyLowlandsReserveCell,
    legacyLowlandsCastleSlot: candidate.legacyLowlandsCastleSlot,
  });
}

function areAdjacent(candidate: GreaterRealmPrivateCandidate, first: number, second: number): boolean {
  for (let direction = 0; direction < 6; direction += 1) {
    if (candidate.grid.neighbors[first * 6 + direction] === second) return true;
  }
  return false;
}

function regionPair(first: number, second: number): string {
  return `${Math.min(first, second)}:${Math.max(first, second)}`;
}

function strategicallyPassableWaterRegime(regime: number): boolean {
  return regime === 0 || regime === 3 || regime === 4;
}

function crossTierGraphAudit(
  candidate: GreaterRealmPrivateCandidate,
  expectedPairs: ReadonlySet<string>,
): Readonly<{
  rawPairs: readonly string[];
  traversablePairs: readonly string[];
  unprotectedUnexpectedContacts: number;
  unexpectedGatePairs: readonly string[];
}> {
  const rawPairs = new Set<string>();
  const traversablePairs = new Set<string>();
  let unprotectedUnexpectedContacts = 0;
  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = candidate.grid.neighbors[cell * 6 + direction]!;
      if (neighbor <= cell || candidate.tierId[cell] === candidate.tierId[neighbor]) continue;
      const pair = regionPair(candidate.regionId[cell]!, candidate.regionId[neighbor]!);
      rawPairs.add(pair);
      const blockedByWater = !strategicallyPassableWaterRegime(candidate.waterRegime[cell]!)
        || !strategicallyPassableWaterRegime(candidate.waterRegime[neighbor]!);
      const blockedByBarrier = candidate.barrier[cell] === 1
        || candidate.barrier[neighbor] === 1;
      if (!blockedByWater && !blockedByBarrier) traversablePairs.add(pair);
      if (
        !expectedPairs.has(pair)
        && !blockedByWater
        && !blockedByBarrier
      ) unprotectedUnexpectedContacts += 1;
    }
  }
  const unexpectedGatePairs = new Set<string>();
  for (const gate of candidate.gates) {
    const pair = regionPair(gate.firstRegion, gate.secondRegion);
    traversablePairs.add(pair);
    if (!expectedPairs.has(pair)) unexpectedGatePairs.add(pair);
  }
  return Object.freeze({
    rawPairs: Object.freeze([...rawPairs].sort()),
    traversablePairs: Object.freeze([...traversablePairs].sort()),
    unprotectedUnexpectedContacts,
    unexpectedGatePairs: Object.freeze([...unexpectedGatePairs].sort()),
  });
}

beforeAll(() => {
  const firstRoot = pinnedRoot();
  const rejectedRoot = Uint8Array.from(createHash('sha256')
    .update(`${REJECTED_ROOT_LABEL}\0`, 'utf8')
    .digest());
  const collisionRoot = programmaticRoot(SAME_FIRST_WORD_BASELINE_ROOT_INDEX);
  const secondRoot = programmaticRoot(SAME_FIRST_WORD_ROOT_INDEX);
  const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
    mathRandomCallCount += 1;
    throw new Error('MATH_RANDOM_MUST_NOT_BE_USED');
  });
  try {
    sameFirstWordBaseline = deriveTestCandidateSeed(collisionRoot);
    sameFirstWordVariant = deriveTestCandidateSeed(secondRoot);

    const uint64Fill = vi.spyOn(BigUint64Array.prototype, 'fill');
    let unexpectedlyGenerated: GreaterRealmPrivateCandidate | undefined;
    let rejectionCode: ReturnType<typeof greaterRealmCandidateRejectionCode>;
    try {
      try {
        unexpectedlyGenerated = generateGreaterRealmCandidate({
          rootSeed: rejectedRoot,
          candidateOrdinal: REJECTED_ORDINAL,
        });
      } catch (error) {
        rejectionCode = greaterRealmCandidateRejectionCode(error);
        if (rejectionCode === undefined) throw error;
      }
      const retiredLargeAuthorities = (
        uint64Fill.mock.instances as unknown as BigUint64Array[]
      ).filter(values => values.length >= EXPECTED_ACTIVE_CELL_MINIMUM);
      rejectedFixtureEvidence = Object.freeze({
        code: rejectionCode,
        retiredLargeAuthorityCount: retiredLargeAuthorities.length,
        allRetiredAuthoritiesCleared: retiredLargeAuthorities.every(values => (
          values.every(value => value === 0n)
        )),
      });
    } finally {
      uint64Fill.mockRestore();
      if (unexpectedlyGenerated) clearGreaterRealmCandidateSecret(unexpectedlyGenerated);
      unexpectedlyGenerated = undefined;
    }

    let generatedSecondary: GreaterRealmPrivateCandidate | undefined;
    try {
      generatedSecondary = generateGreaterRealmCandidate({
        rootSeed: firstRoot,
        candidateOrdinal: SECONDARY_ORDINAL,
      });
      const measured = measureGreaterRealmReliefStructure({
        grid: generatedSecondary.grid,
        elevation: generatedSecondary.elevation,
        waterRegime: generatedSecondary.waterRegime,
        legacyProtectedCell: generatedSecondary.legacyLowlandsProtectedCell,
      });
      secondaryEvidence = Object.freeze({
        candidateOrdinal: generatedSecondary.candidateOrdinal,
        candidateSeedDigest: candidateSeedDigest(generatedSecondary.candidateSeed),
        finalDigest: generatedSecondary.stageDigests.final,
        gridDigest: gridDigest(generatedSecondary),
        reliefMatches: measured.proof
          && JSON.stringify(generatedSecondary.privateMetrics.reliefStructure)
            === JSON.stringify(measured),
        forestProof: generatedSecondary.privateMetrics.naturalComposition
          .forestPatches.proof,
        eligibilityFailureCodes: Object.freeze([
          ...generatedSecondary.privateMetrics.eligibilityFailureCodes,
        ]),
      });
    } finally {
      if (generatedSecondary) clearGreaterRealmCandidateSecret(generatedSecondary);
      generatedSecondary = undefined;
    }

    let generatedReplay: GreaterRealmPrivateCandidate | undefined;
    try {
      generatedReplay = generateGreaterRealmCandidate({
        rootSeed: firstRoot,
        candidateOrdinal: PINNED_ORDINAL,
      });
      replayFingerprint = candidateReplayFingerprint(generatedReplay);
    } finally {
      if (generatedReplay) clearGreaterRealmCandidateSecret(generatedReplay);
      generatedReplay = undefined;
    }

    pinned = generateGreaterRealmCandidate({
      rootSeed: firstRoot,
      candidateOrdinal: PINNED_ORDINAL,
      onGateApronSearchLane: lane => pinnedGateApronSearchLanes.push(lane),
    });
  } finally {
    randomSpy.mockRestore();
    firstRoot.fill(0);
    rejectedRoot.fill(0);
    collisionRoot.fill(0);
    secondRoot.fill(0);
  }
}, 360_000);

afterAll(() => {
  if (pinned) clearGreaterRealmCandidateSecret(pinned);
  pinned = undefined;
  pinnedGateApronSearchLanes = [];
  replayFingerprint = undefined;
  secondaryEvidence = undefined;
  rejectedFixtureEvidence = undefined;
  sameFirstWordBaseline?.fill(0);
  sameFirstWordVariant?.fill(0);
  sameFirstWordBaseline = undefined;
  sameFirstWordVariant = undefined;
});

describe('Greater Realm private candidate generator', () => {
  it('replays the pinned eligible candidate without mutable random state', () => {
    const candidate = requirePinnedCandidate();

    expect(mathRandomCallCount).toBe(0);
    expect(candidate.candidateOrdinal).toBe(PINNED_ORDINAL);
    expect(candidate.aggregate.eligible).toBe(true);
    expect(candidate.stageDigests.final).toBe(EXPECTED_PINNED_FINAL_DIGEST);
    expect(candidateReplayFingerprint(candidate)).toBe(replayFingerprint);
    expect(pinnedGateApronSearchLanes).toEqual(['ordinary']);
  });

  it('binds domain materials, exact water descriptors, strategic audits, QA, chunks and LOD support', () => {
    const candidate = requirePinnedCandidate();

    expect(candidate.domains).toHaveLength(
      candidate.privateMetrics.geologyAuthority.metrics.domainCount,
    );
    expect(candidate.domains.every(domain => (
      Number.isSafeInteger(domain.baseThickness)
      && domain.baseThickness > 0
      && Number.isSafeInteger(domain.rockFamily)
      && domain.rockFamily >= 1
      && domain.rockFamily <= 6
    ))).toBe(true);
    expect(candidate.privateMetrics.geologyAuthority.metrics.proof).toBe(true);
    expect(candidate.privateMetrics.hydrologyAuthority.metrics.proof).toBe(true);
    expect(
      candidate.privateMetrics.hydrologyAuthority.metrics.waterCellCountsByRegime[6],
    ).toBeGreaterThan(0);
    let marshCells = 0;
    let invalidDryMetadata = 0;
    let invalidWaterMetadata = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (candidate.waterRegime[cell] === 0) {
        if (
          candidate.waterBodyId[cell] !== 0
          || candidate.waterDepthClass[cell] !== 0
          || candidate.waterSurfaceLevel[cell] !== -0x8000_0000
          || candidate.waterDownstream[cell] !== -1
          || candidate.waterBankSeed[cell] !== 0
          || candidate.waterGenerationVersion[cell] !== 0
        ) invalidDryMetadata += 1;
      } else {
        if (candidate.waterRegime[cell] === 6) marshCells += 1;
        if (
          candidate.waterBodyId[cell] === 0
          || candidate.waterDepthClass[cell] === 0
          || candidate.waterSurfaceLevel[cell]! < candidate.elevation[cell]!
          || candidate.waterGenerationVersion[cell] !== 1
        ) invalidWaterMetadata += 1;
      }
    }
    expect({ marshCells, invalidDryMetadata, invalidWaterMetadata }).toEqual({
      marshCells: candidate.privateMetrics.hydrologyAuthority.metrics
        .waterCellCountsByRegime[6],
      invalidDryMetadata: 0,
      invalidWaterMetadata: 0,
    });
    expect(Object.entries(candidate.privateMetrics.strategicAudits)
      .filter(([key]) => key !== 'version')
      .every(([, metrics]) => (metrics as { proof: boolean }).proof)).toBe(true);
    expect(candidate.privateMetrics.topographicQa.cellCount).toBe(candidate.grid.cellCount);
    expect(
      candidate.privateMetrics.topographicQa.biomeElevationConsistency.inconsistentCellCount,
    ).toBe(0);
    const regional = candidate.privateMetrics.topographicQa
      .regionalHydrogeomorphology;
    expect(regional.proof).toBe(true);
    expect(Object.values(regional)
      .filter(value => typeof value === 'object')
      .every(value => (value as { proof: boolean }).proof)).toBe(true);
    expect(regional.mirefen.braidedChannelProxyEdgeCount).toBeGreaterThanOrEqual(
      GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
        .mirefenMinimumBraidedChannelProxyEdges,
    );
    expect(regional.stonewake.narrowIslandStraitCellCount)
      .toBeGreaterThanOrEqual(
        GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
          .stonewakeMinimumNarrowIslandStraitCells,
      );
    expect(candidate.privateMetrics.chunkBenchmark.proof).toBe(true);
    expect(candidate.privateMetrics.chunkBenchmark.selectedAxisSpan).toBe(15);
    expect(candidate.privateMetrics.topographyPatchSupport.proof).toBe(true);
    expect(candidate.privateMetrics.topographyPatchSupport.lodSampleCounts).toHaveLength(4);
  });

  it('uses all 128 candidate-seed bits instead of collapsing to the first word', () => {
    if (!sameFirstWordBaseline || !sameFirstWordVariant) {
      throw new Error('GREATER_REALM_COLLISION_FIXTURE_MISSING');
    }
    const candidate = sameFirstWordBaseline;
    const variant = sameFirstWordVariant;

    // These programmatic roots were selected for a collision in word zero.
    expect(candidate[0]).toBe(variant[0]);
    expect(candidate.slice(1)).not.toEqual(variant.slice(1));
    const channel = greaterRealmTerrainChannelId('all-seed-words-regression');
    const firstSamples = Array.from({ length: 8 }, (_, counter) => (
      greaterRealmCounterRandomU32(candidate, channel, 17, -31, counter)
    ));
    const secondSamples = Array.from({ length: 8 }, (_, counter) => (
      greaterRealmCounterRandomU32(variant, channel, 17, -31, counter)
    ));
    expect(firstSamples).not.toEqual(secondSamples);
  });

  it('carries seed diversity through a second complete deterministic terrain', () => {
    const candidate = requirePinnedCandidate();
    if (!secondaryEvidence) {
      throw new Error('GREATER_REALM_SECONDARY_EVIDENCE_MISSING');
    }

    expect(secondaryEvidence.candidateOrdinal).toBe(SECONDARY_ORDINAL);
    expect(secondaryEvidence.candidateSeedDigest).not.toBe(
      candidateSeedDigest(candidate.candidateSeed),
    );
    expect(secondaryEvidence.finalDigest).not.toBe(candidate.stageDigests.final);
    expect(secondaryEvidence.gridDigest).not.toBe(gridDigest(candidate));
    expect(secondaryEvidence.eligibilityFailureCodes).toContain(
      'REGIONAL_HYDROGEOMORPHOLOGY_QA',
    );
    expect(secondaryEvidence.eligibilityFailureCodes.some(code => (
      /^REGIONAL_HYDROGEOMORPHOLOGY_(?:FROSTMERE|MIREFEN|SUNSCAR|STONEWAKE|TIER_II|THRONEHEART)$/u
        .test(code)
    ))).toBe(true);
  });

  it('classifies bounded dry-gate-apron exhaustion as a typed candidate rejection', () => {
    if (!rejectedFixtureEvidence) {
      throw new Error('GREATER_REALM_REJECTION_EVIDENCE_MISSING');
    }
    expect(rejectedFixtureEvidence.code).toBe(
      'GREATER_REALM_TIER_TWO_DRY_GATE_APRON_SEARCH_NODE_LIMIT',
    );
    expect(rejectedFixtureEvidence.retiredLargeAuthorityCount).toBeGreaterThan(0);
    expect(rejectedFixtureEvidence.allRetiredAuthoritiesCleared).toBe(true);
  }, 180_000);

  it('isolates the placement-time sea component which reaches the active boundary', () => {
    const coordinates = [];
    for (let q = -3; q <= 3; q += 1) {
      const minimumR = Math.max(-3, -q - 3);
      const maximumR = Math.min(3, -q + 3);
      for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
    }
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(100);
    const boundarySea = grid.indexOf({ q: 3, r: 0 });
    const connectedSea = grid.indexOf({ q: 2, r: 0 });
    const seaLevelContact = grid.indexOf({ q: 1, r: 0 });
    const inlandDepression = grid.indexOf({ q: -1, r: 0 });
    elevation[boundarySea] = -100;
    elevation[connectedSea] = -50;
    elevation[seaLevelContact] = 0;
    elevation[inlandDepression] = -100;
    const originalElevation = new Int32Array(elevation);
    const uint32Fill = vi.spyOn(Uint32Array.prototype, 'fill');
    let connected: Uint8Array | undefined;
    try {
      connected = deriveGreaterRealmBoundaryConnectedInitialSeaMask({
        grid,
        elevation,
      });
      expect(connected[boundarySea]).toBe(1);
      expect(connected[connectedSea]).toBe(1);
      expect(connected[seaLevelContact]).toBe(1);
      expect(connected[inlandDepression]).toBe(0);
      expect(elevation).toEqual(originalElevation);
      expect((uint32Fill.mock.instances as unknown as Uint32Array[]).some(
        values => values.length === grid.cellCount && values.every(value => value === 0),
      )).toBe(true);

      const noBoundarySea = deriveGreaterRealmBoundaryConnectedInitialSeaMask({
        grid,
        elevation: new Int32Array(grid.cellCount).fill(100),
      });
      try {
        expect(noBoundarySea).toEqual(new Uint8Array(grid.cellCount));
      } finally {
        noBoundarySea.fill(0);
      }
    } finally {
      connected?.fill(0);
      uint32Fill.mockRestore();
      elevation.fill(0);
      originalElevation.fill(0);
    }
    expect(() => deriveGreaterRealmBoundaryConnectedInitialSeaMask({
      grid,
      elevation: new Int32Array(grid.cellCount - 1),
    })).toThrow('GREATER_REALM_BOUNDARY_CONNECTED_INITIAL_SEA_INPUT_INVALID');
    expect(() => deriveGreaterRealmBoundaryConnectedInitialSeaMask(
      null as never,
    )).toThrow('GREATER_REALM_BOUNDARY_CONNECTED_INITIAL_SEA_INPUT_INVALID');
  });

  it('distinguishes a valid generated standing body from an invalid overlay result', () => {
    const grid = indexGreaterRealmAxialGrid([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
    const center = grid.indexOf({ q: 0, r: 0 });
    const boundary = grid.indexOf({ q: 1, r: 0 });
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(100);
    elevation[center] = -100;
    elevation[boundary] = -100;
    const filledElevation = new Int32Array(elevation);
    const generated = new Uint8Array(grid.cellCount);
    generated[boundary] = 1;
    const generatedProof = hasGreaterRealmStandingWaterBodySurfaceProof({
      grid,
      waterRegime: generated,
      elevation,
      filledElevation,
    });
    expect(generatedProof).toBe(true);
    expect(() => enforceGreaterRealmStandingWaterBodySurfaceProof({
      phase: 'generated',
      proof: generatedProof,
    })).not.toThrow();

    const overlaid = new Uint8Array(grid.cellCount);
    overlaid[center] = 1;
    const overlaidProof = hasGreaterRealmStandingWaterBodySurfaceProof({
      grid,
      waterRegime: overlaid,
      elevation,
      filledElevation,
    });
    expect(overlaidProof).toBe(false);

    let generatedFailure: unknown;
    try {
      enforceGreaterRealmStandingWaterBodySurfaceProof({
        phase: 'generated',
        proof: overlaidProof,
      });
    } catch (error) {
      generatedFailure = error;
    }
    expect(generatedFailure).toMatchObject({
      message: 'GREATER_REALM_HYDROLOGY_BODY_SURFACE_INVARIANT',
    });
    expect(greaterRealmCandidateRejectionCode(generatedFailure)).toBeUndefined();

    let overlayFailure: unknown;
    try {
      enforceGreaterRealmStandingWaterBodySurfaceProof({
        phase: 'legacy-overlay',
        proof: overlaidProof,
      });
    } catch (error) {
      overlayFailure = error;
    }
    expect(greaterRealmCandidateRejectionCode(overlayFailure)).toBe(
      'GREATER_REALM_HYDROLOGY_BODY_SURFACE_GEOGRAPHY_EXHAUSTED',
    );
    expect(greaterRealmCandidateRejectionCode(new Error(
      'GREATER_REALM_HYDROLOGY_BODY_SURFACE_GEOGRAPHY_EXHAUSTED',
    ))).toBeUndefined();

    const aboveSeaOcean = new Uint8Array(grid.cellCount);
    aboveSeaOcean[grid.indexOf({ q: -1, r: 0 })] = 1;
    expect(() => hasGreaterRealmStandingWaterBodySurfaceProof({
      grid,
      waterRegime: aboveSeaOcean,
      elevation: new Int32Array(grid.cellCount).fill(100),
      filledElevation: new Int32Array(grid.cellCount).fill(100),
    })).toThrow('GREATER_REALM_HYDROLOGY_SURFACE_INVALID');
    const mixedOcean = new Uint8Array(grid.cellCount);
    mixedOcean[center] = 1;
    mixedOcean[boundary] = 1;
    const mixedElevation = new Int32Array(grid.cellCount);
    mixedElevation.fill(100);
    mixedElevation[center] = -100;
    expect(() => hasGreaterRealmStandingWaterBodySurfaceProof({
      grid,
      waterRegime: mixedOcean,
      elevation: mixedElevation,
      filledElevation: new Int32Array(mixedElevation),
    })).toThrow('GREATER_REALM_HYDROLOGY_SURFACE_INVALID');
    expect(() => hasGreaterRealmStandingWaterBodySurfaceProof({
      grid,
      waterRegime: new Uint8Array(grid.cellCount - 1),
      elevation,
      filledElevation,
    })).toThrow('GREATER_REALM_STANDING_WATER_AUDIT_INPUT_INVALID');
    expect(() => hasGreaterRealmStandingWaterBodySurfaceProof(
      undefined as never,
    )).toThrow('GREATER_REALM_STANDING_WATER_AUDIT_INPUT_INVALID');
    expect(() => enforceGreaterRealmStandingWaterBodySurfaceProof(
      null as never,
    )).toThrow('GREATER_REALM_STANDING_WATER_AUDIT_INPUT_INVALID');
  });

  it('skips ranked inland seas that would merge unequal standing levels', () => {
    const grid = indexGreaterRealmAxialGrid(Array.from(
      { length: 4 },
      (_, q) => ({ q, r: 0 }),
    ));
    const first = grid.indexOf({ q: 0, r: 0 });
    const conflicting = grid.indexOf({ q: 1, r: 0 });
    const middle = grid.indexOf({ q: 2, r: 0 });
    const fallback = grid.indexOf({ q: 3, r: 0 });
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(10);
    const filledElevation = new Int32Array(grid.cellCount);
    filledElevation.fill(10);
    filledElevation[first] = 100;
    filledElevation[conflicting] = 200;
    filledElevation[fallback] = 300;
    const waterRegime = new Uint8Array(grid.cellCount);

    const selected = selectGreaterRealmCompatibleStandingWaterComponents({
      grid,
      rankedComponents: [[first], [conflicting], [fallback]],
      elevation,
      filledElevation,
      waterRegime,
      maximumCount: 2,
      minimumCellCount: 1,
    });

    expect(selected).toEqual([[first], [fallback]]);
    expect(Array.from(waterRegime)).toEqual([5, 0, 0, 5]);
    expect(selectGreaterRealmCompatibleStandingWaterComponents({
      grid,
      rankedComponents: [[first]],
      elevation,
      filledElevation,
      waterRegime: new Uint8Array(grid.cellCount),
      maximumCount: 2,
      minimumCellCount: 1,
    })).toEqual([[first]]);
    expect(() => selectGreaterRealmCompatibleStandingWaterComponents({
      grid,
      rankedComponents: [[first], [first]],
      elevation,
      filledElevation,
      waterRegime: new Uint8Array(grid.cellCount),
      maximumCount: 1,
      minimumCellCount: 1,
    })).toThrow('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
    expect(() => selectGreaterRealmCompatibleStandingWaterComponents(
      { grid: null } as never,
    )).toThrow('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
    const atomicallyRejectedRegime = new Uint8Array(grid.cellCount);
    expect(() => selectGreaterRealmCompatibleStandingWaterComponents({
      grid,
      rankedComponents: [[first], [conflicting, middle]],
      elevation,
      filledElevation,
      waterRegime: atomicallyRejectedRegime,
      maximumCount: 2,
      minimumCellCount: 1,
    })).toThrow('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
    expect(atomicallyRejectedRegime).toEqual(new Uint8Array(grid.cellCount));
  });

  it('binds multiscale final relief and genuine forest patches across independent worlds', () => {
    const candidate = requirePinnedCandidate();
    if (!secondaryEvidence) {
      throw new Error('GREATER_REALM_SECONDARY_EVIDENCE_MISSING');
    }
    const measured = measureGreaterRealmReliefStructure({
      grid: candidate.grid,
      elevation: candidate.elevation,
      waterRegime: candidate.waterRegime,
      legacyProtectedCell: candidate.legacyLowlandsProtectedCell,
    });
    expect(measured.proof).toBe(true);
    expect(candidate.privateMetrics.reliefStructure).toEqual(measured);
    expect(candidate.privateMetrics.naturalComposition.forestPatches.proof).toBe(true);
    expect(secondaryEvidence.reliefMatches).toBe(true);
    expect(secondaryEvidence.forestProof).toBe(true);
  });

  it('binds every returned authoritative integer field into stable stage evidence', () => {
    const candidate = requirePinnedCandidate();
    const fields = candidateFields(candidate);

    expect(candidate.stageDigests).toEqual({
      geology: digestGreaterRealmTerrainStage('geology', candidate.grid, {
        bedrockElevation: candidate.bedrockElevation,
        domainId: candidate.domainId,
        geologyId: candidate.geologyId,
      }),
      hydrology: digestGreaterRealmTerrainStage('hydrology', candidate.grid, {
        elevation: candidate.elevation,
        filledElevation: candidate.filledElevation,
        sedimentDepth: candidate.sedimentDepth,
        flowReceiver: candidate.flowReceiver,
        flowAccumulation: candidate.flowAccumulation,
        waterRegime: candidate.waterRegime,
        waterBodyId: candidate.waterBodyId,
        waterDepthClass: candidate.waterDepthClass,
        waterSurfaceLevel: candidate.waterSurfaceLevel,
        waterDownstream: candidate.waterDownstream,
        waterBankSeed: candidate.waterBankSeed,
        waterGenerationVersion: candidate.waterGenerationVersion,
      }),
      geomorphology: digestGreaterRealmTerrainStage('geomorphology', candidate.grid, {
        geomorphologyElevation: candidate.geomorphologyElevation,
        geomorphologyTemperature: candidate.geomorphologyTemperature,
        geomorphologyMoisture: candidate.geomorphologyMoisture,
        geomorphologyTotalDelta: candidate.geomorphologyTotalDelta,
        geomorphologyTerraceDelta: candidate.geomorphologyTerraceDelta,
        geomorphologyGlacialDelta: candidate.geomorphologyGlacialDelta,
        geomorphologyAridDelta: candidate.geomorphologyAridDelta,
        geomorphologyVolcanicDelta: candidate.geomorphologyVolcanicDelta,
        geomorphologyCoastalDelta: candidate.geomorphologyCoastalDelta,
        geomorphologyGlacialMask: candidate.geomorphologyGlacialMask,
        geomorphologyAridMask: candidate.geomorphologyAridMask,
        geomorphologyVolcanicMask: candidate.geomorphologyVolcanicMask,
        geomorphologyVolcanicAnchorMask: candidate.geomorphologyVolcanicAnchorMask,
        geomorphologyCoastalMask: candidate.geomorphologyCoastalMask,
        geomorphologyCoastalClass: candidate.geomorphologyCoastalClass,
      }),
      topography: digestGreaterRealmTerrainStage('topography', candidate.grid, {
        slope: candidate.slope,
        aspect: candidate.aspect,
        profileCurvature: candidate.profileCurvature,
        planCurvature: candidate.planCurvature,
        wetnessIndex: candidate.wetnessIndex,
        exposure: candidate.exposure,
        distanceToCoast: candidate.distanceToCoast,
        distanceToFreshwater: candidate.distanceToFreshwater,
        watershedId: candidate.watershedId,
        ridgeId: candidate.ridgeId,
        temperature: candidate.temperature,
        moisture: candidate.moisture,
        biomeId: candidate.biomeId,
        landformId: candidate.landformId,
      }),
      strategy: digestGreaterRealmTerrainStage('strategy', candidate.grid, {
        regionId: candidate.regionId,
        tierId: candidate.tierId,
        barrier: candidate.barrier,
        castleSlot: candidate.castleSlot,
        throneAnchor: candidate.throneAnchor,
      }),
      dressing: digestGreaterRealmTerrainStage('dressing', candidate.grid, {
        dressingExcluded: candidate.dressingExcluded,
        ecologyClass: candidate.ecologyClass,
        vegetationDensity: candidate.vegetationDensity,
        groundcoverDensity: candidate.groundcoverDensity,
        wildflowerDensity: candidate.wildflowerDensity,
        routeClass: candidate.routeClass,
        landmarkClass: candidate.landmarkClass,
        ambientLifeClass: candidate.ambientLifeClass,
      }),
      final: digestGreaterRealmTerrainStage('final', candidate.grid, fields),
    });
    expect(Object.values(candidate.stageDigests).every(digest => /^[0-9a-f]{64}$/u.test(digest)))
      .toBe(true);
  });

  it('produces one connected approved mask with coherent tiers and authoritative arrays', () => {
    const candidate = requirePinnedCandidate();
    const { grid } = candidate;
    const fields = candidateFields(candidate);

    expect(grid.cellCount).toBeGreaterThanOrEqual(EXPECTED_ACTIVE_CELL_MINIMUM);
    expect(grid.cellCount).toBeLessThanOrEqual(EXPECTED_ACTIVE_CELL_MAXIMUM);
    expect(candidate.aggregate.activeCellCount).toBe(grid.cellCount);
    expect(Object.values(fields).every(field => field.length === grid.cellCount)).toBe(true);
    expect(Object.keys(candidate.aggregate.proofs).sort()).toEqual([...GREATER_REALM_PROOF_KEYS].sort());
    expect(Object.values(candidate.aggregate.proofs).every(Boolean)).toBe(true);

    const seen = new Uint8Array(grid.cellCount);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    let visited = 0;
    seen[0] = 1;
    queue[tail++] = 0;
    while (head < tail) {
      const cell = queue[head++]!;
      visited += 1;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = grid.neighbors[cell * 6 + direction]!;
        if (neighbor < 0 || seen[neighbor] === 1) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    expect(visited).toBe(grid.cellCount);
    expect(candidate.aggregate.proofs.activeMaskConnected).toBe(visited === grid.cellCount);
    expect(candidate.aggregate.proofs.approvedCellRange).toBe(
      grid.cellCount >= EXPECTED_ACTIVE_CELL_MINIMUM
      && grid.cellCount <= EXPECTED_ACTIVE_CELL_MAXIMUM,
    );

    const tierCounts = [0, 0, 0];
    const regionCounts = Array<number>(GREATER_REALM_REGION_SPECS.length).fill(0);
    let invalidTier = 0;
    let invalidRegion = 0;
    let tierRegionMismatch = 0;
    let landCells = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const tier = candidate.tierId[cell]!;
      const region = candidate.regionId[cell]!;
      if (tier < 1 || tier > 3) invalidTier += 1;
      else tierCounts[tier - 1] += 1;
      if (region >= GREATER_REALM_REGION_SPECS.length) invalidRegion += 1;
      else {
        regionCounts[region] += 1;
        if (GREATER_REALM_REGION_SPECS[region]!.tier !== tier) tierRegionMismatch += 1;
      }
      if (candidate.waterRegime[cell] === 0) landCells += 1;
    }
    expect({ invalidTier, invalidRegion, tierRegionMismatch }).toEqual({
      invalidTier: 0,
      invalidRegion: 0,
      tierRegionMismatch: 0,
    });
    expect(tierCounts).toEqual([
      candidate.aggregate.tierCellCounts.tierI,
      candidate.aggregate.tierCellCounts.tierII,
      candidate.aggregate.tierCellCounts.tierIII,
    ]);
    expect(regionCounts.every(count => count > 0)).toBe(true);
    expect(landCells).toBe(candidate.aggregate.landCellCount);
    expect(landCells + candidate.aggregate.waterCellCount).toBe(grid.cellCount);
  });

  it('binds a natural dormant living-world layer without leaking it into public evidence', () => {
    const candidate = requirePinnedCandidate();
    const gateCell = new Uint8Array(candidate.grid.cellCount);
    const gateApproachCell = new Uint8Array(candidate.grid.cellCount);
    for (const gate of candidate.gates) {
      gateCell[gate.firstCell] = 1;
      gateCell[gate.secondCell] = 1;
      for (const path of [
        gate.firstApproachPath,
        gate.firstAlternateApproachPath,
        gate.secondApproachPath,
        gate.secondAlternateApproachPath,
      ]) {
        for (const cell of path) gateApproachCell[cell] = 1;
      }
    }

    const livingWorld = candidate.privateMetrics.livingWorld;
    expect(Object.values(livingWorld.invariants).every(Boolean)).toBe(true);
    expect(
      Object.values(livingWorld.metrics.ecologyCellCounts).every(
        (count) => count > 0,
      ),
    ).toBe(true);
    expect(
      Object.values(livingWorld.metrics.routeCellCounts).every(
        (count) => count > 0,
      ),
    ).toBe(true);
    expect(
      Object.values(livingWorld.metrics.landmarkCellCounts).every(
        (count) => count > 0,
      ),
    ).toBe(true);
    expect(
      Object.values(livingWorld.metrics.ambientLifeCellCounts).every(
        (count) => count > 0,
      ),
    ).toBe(true);
    expect(
      livingWorld.metrics.eligibleLandVegetatedBasisPoints,
    ).toBeGreaterThanOrEqual(2_500);
    expect(
      livingWorld.metrics.eligibleLandVegetatedBasisPoints,
    ).toBeLessThanOrEqual(8_500);
    expect(
      livingWorld.metrics.eligibleLandOpenBasisPoints,
    ).toBeGreaterThanOrEqual(1_500);

    let exclusionMaskMismatchCount = 0;
    let excludedOutputViolationCount = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const excluded =
        candidate.waterRegime[cell] !== 0 ||
        candidate.legacyLowlandsProtectedCell[cell] !== 0 ||
        candidate.castleSlot[cell] !== 0 ||
        candidate.throneAnchor[cell] !== 0 ||
        candidate.barrier[cell] !== 0 ||
        gateCell[cell] !== 0 ||
        gateApproachCell[cell] !== 0;
      if (candidate.dressingExcluded[cell] !== (excluded ? 1 : 0)) {
        exclusionMaskMismatchCount += 1;
      }
      if (!excluded) continue;
      if (
        candidate.ecologyClass[cell] !== 0 ||
        candidate.vegetationDensity[cell] !== 0 ||
        candidate.groundcoverDensity[cell] !== 0 ||
        candidate.wildflowerDensity[cell] !== 0 ||
        candidate.landmarkClass[cell] !== 0 ||
        candidate.ambientLifeClass[cell] !== 0 ||
        (candidate.routeClass[cell] !== 0 &&
          !(
            (candidate.waterRegime[cell] === 3 ||
              candidate.waterRegime[cell] === 4) &&
            candidate.routeClass[cell] === GREATER_REALM_ROUTE_CLASS.FORD
          ))
      )
        excludedOutputViolationCount += 1;
    }
    expect({
      exclusionMaskMismatchCount,
      excludedOutputViolationCount,
    }).toEqual({
      exclusionMaskMismatchCount: 0,
      excludedOutputViolationCount: 0,
    });
    expect(JSON.stringify(candidate.aggregate)).not.toMatch(
      /(?:livingWorld|reliefStructure|meanSquaredDifference|pairCountsByLag|layoutFingerprint|dressingExcluded|ecologyClass|vegetationDensity|groundcoverDensity|wildflowerDensity|routeClass|landmarkClass|ambientLifeClass|eligibleLandVegetatedBasisPoints|eligibleLandOpenBasisPoints|eligibleLandGroundcoverBasisPoints|groundcoveredLandWildflowerBasisPoints|landmarkCellCounts|ambientLifeCellCounts)/u,
    );
  });

  it('maps every locked Lowlands cell and castle through one reversible protected transform', () => {
    const candidate = requirePinnedCandidate();
    const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
    const mappedWorldIndexes = new Set<number>();
    const mappedProtectedIndexes = new Set<number>();
    const mappedEnabledWaterIndexes = new Set<number>();
    let invalidWorldCell = 0;
    let invalidLegacyWater = 0;
    let invalidCastleSlot = 0;

    for (const tile of patch.world.tiles) {
      const global = transformLegacyLowlandsToGlobal(tile, candidate.legacyLowlandsTransform);
      const local = inverseGlobalToLegacyLowlands(global, candidate.legacyLowlandsTransform);
      const index = candidate.grid.indexOf(global);
      if (
        index < 0
        || local.q !== tile.q
        || local.r !== tile.r
        || candidate.legacyLowlandsCell[index] !== 1
        || candidate.legacyLowlandsProtectedCell[index] !== 1
        || candidate.legacyLowlandsReserveCell[index] !== 1
      ) invalidWorldCell += 1;
      if (index >= 0) {
        mappedWorldIndexes.add(index);
        mappedProtectedIndexes.add(index);
      }
    }
    for (const waterCell of patch.water.cells) {
      const global = transformLegacyLowlandsToGlobal(
        waterCell,
        candidate.legacyLowlandsTransform,
      );
      const index = candidate.grid.indexOf(global);
      if (
        index < 0
        || candidate.legacyLowlandsProtectedCell[index] !== 1
        || candidate.legacyLowlandsReserveCell[index] !== 1
      ) invalidWorldCell += 1;
      if (index >= 0) mappedProtectedIndexes.add(index);
    }
    for (const waterCell of patch.water.enabledCells) {
      const global = transformLegacyLowlandsToGlobal(
        waterCell,
        candidate.legacyLowlandsTransform,
      );
      const index = candidate.grid.indexOf(global);
      const expectedRegime = waterCell.regime === 'ocean'
        ? 1
        : waterCell.regime === 'river' ? 3 : 2;
      if (index < 0 || candidate.waterRegime[index] !== expectedRegime) {
        invalidLegacyWater += 1;
      }
      if (index >= 0) mappedEnabledWaterIndexes.add(index);
    }
    for (const slot of patch.castleSlots.rows) {
      const global = transformLegacyLowlandsToGlobal(slot, candidate.legacyLowlandsTransform);
      const index = candidate.grid.indexOf(global);
      if (
        index < 0
        || candidate.legacyLowlandsCastleSlot[index] !== 1
        || candidate.castleSlot[index] !== 1
        || candidate.legacyLowlandsCell[index] !== 1
      ) invalidCastleSlot += 1;
    }

    const sumMask = (mask: Uint8Array): number => {
      let total = 0;
      for (const value of mask) total += value === 1 ? 1 : 0;
      return total;
    };
    const mappedExactly = invalidWorldCell === 0
      && invalidLegacyWater === 0
      && invalidCastleSlot === 0
      && mappedWorldIndexes.size === GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount
      && mappedProtectedIndexes.size === sumMask(candidate.legacyLowlandsProtectedCell)
      && sumMask(candidate.legacyLowlandsCastleSlot)
        === GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount;

    let protectedWaterCount = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (
        candidate.legacyLowlandsProtectedCell[cell] === 1
        && candidate.waterRegime[cell] !== 0
      ) protectedWaterCount += 1;
    }
    expect({ invalidWorldCell, invalidLegacyWater, invalidCastleSlot }).toEqual({
      invalidWorldCell: 0,
      invalidLegacyWater: 0,
      invalidCastleSlot: 0,
    });
    expect(mappedWorldIndexes.size).toBe(GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount);
    expect(mappedProtectedIndexes.size).toBe(sumMask(candidate.legacyLowlandsProtectedCell));
    expect(mappedEnabledWaterIndexes.size).toBe(
      GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.waterEnabledCellCount,
    );
    expect(protectedWaterCount).toBe(mappedEnabledWaterIndexes.size);
    expect(candidate.aggregate.proofs.legacyLowlandsPreserved).toBe(mappedExactly);
  });

  it('derives the declared traversable graph while sealing every unexpected raw contact', () => {
    const candidate = requirePinnedCandidate();
    const expectedPairs = candidate.gateGraph
      .map(([first, second]) => regionPair(first, second))
      .sort();
    const audit = crossTierGraphAudit(candidate, new Set(expectedPairs));
    const graphMatches = audit.traversablePairs.length === expectedPairs.length
      && audit.traversablePairs.every((pair, index) => pair === expectedPairs[index])
      && audit.unprotectedUnexpectedContacts === 0
      && audit.unexpectedGatePairs.length === 0;

    expect(audit.rawPairs.length).toBeGreaterThanOrEqual(expectedPairs.length);
    expect(audit.traversablePairs).toEqual(expectedPairs);
    expect(audit.unprotectedUnexpectedContacts).toBe(0);
    expect(audit.unexpectedGatePairs).toEqual([]);
    expect(candidate.aggregate.proofs.regionGraph).toBe(graphMatches);
  });

  it('keeps the abstract 6-to-3-to-1 graph while semantic T1 IDs vary by candidate', () => {
    const candidate = requirePinnedCandidate();
    const outerEdges = candidate.gateGraph.filter(([first, second]) => first < 6 && second < 9);
    const innerEdges = candidate.gateGraph.filter(([first, second]) => first >= 6 && second === 9);
    expect(candidate.gateGraph).toHaveLength(9);
    expect(outerEdges.map(([first]) => first).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect([6, 7, 8].map(region => (
      outerEdges.filter(([, second]) => second === region).length
    ))).toEqual([2, 2, 2]);
    expect(innerEdges).toEqual([[6, 9], [7, 9], [8, 9]]);
    expect(candidate.tierOneSemanticPermutation[0]).toBe(0);
    expect([...candidate.tierOneSemanticPermutation].sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('stores two correctly oriented gates per declared graph edge', () => {
    const candidate = requirePinnedCandidate();
    const expectedPairs = candidate.gateGraph
      .map(([first, second]) => regionPair(first, second))
      .sort();
    const gatePairCounts = new Map<string, number>();
    const endpointCells = new Set<number>();
    let invalidGate = 0;

    for (let index = 0; index < candidate.gates.length; index += 1) {
      const gate = candidate.gates[index]!;
      const pair = regionPair(gate.firstRegion, gate.secondRegion);
      gatePairCounts.set(pair, (gatePairCounts.get(pair) ?? 0) + 1);
      endpointCells.add(gate.firstCell);
      endpointCells.add(gate.secondCell);
      if (
        gate.gateIndex !== index
        || candidate.regionId[gate.firstCell] !== gate.firstRegion
        || candidate.regionId[gate.secondCell] !== gate.secondRegion
        || !areAdjacent(candidate, gate.firstCell, gate.secondCell)
        || candidate.tierId[gate.firstCell] === candidate.tierId[gate.secondCell]
        || candidate.waterRegime[gate.firstCell] !== 0
        || candidate.waterRegime[gate.secondCell] !== 0
        || candidate.barrier[gate.firstCell] !== 1
        || candidate.barrier[gate.secondCell] !== 1
      ) invalidGate += 1;
    }

    expect([...gatePairCounts.keys()].sort()).toEqual(expectedPairs);
    expect([...gatePairCounts.values()].every(count => count === 2)).toBe(true);
    expect(candidate.gates).toHaveLength(expectedPairs.length * 2);
    expect(endpointCells.size).toBe(candidate.gates.length * 2);
    expect(invalidGate).toBe(0);
    expect(candidate.aggregate.proofs.gateGraph).toBe(
      invalidGate === 0
      && gatePairCounts.size === expectedPairs.length
      && [...gatePairCounts.values()].every(count => count === 2),
    );
  });

  it('attests sealed tier boundaries and the measured natural deep-ocean edge', () => {
    const candidate = requirePinnedCandidate();
    const radiusCounts = new Map<number, number>();
    const coordinateKeys = new Set<string>();
    let boundaryCells = 0;
    let maximumBoundaryRadius = 0;
    let barrierBypasses = 0;

    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const q = candidate.grid.q[cell]!;
      const r = candidate.grid.r[cell]!;
      coordinateKeys.add(`${q},${r}`);
      let boundary = false;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = candidate.grid.neighbors[cell * 6 + direction]!;
        if (neighbor < 0) {
          boundary = true;
          continue;
        }
        if (
          neighbor > cell
          && candidate.tierId[cell] !== candidate.tierId[neighbor]
          && strategicallyPassableWaterRegime(candidate.waterRegime[cell]!)
          && strategicallyPassableWaterRegime(candidate.waterRegime[neighbor]!)
          && candidate.barrier[cell] !== 1
          && candidate.barrier[neighbor] !== 1
        ) barrierBypasses += 1;
      }
      if (!boundary) continue;
      boundaryCells += 1;
      const radius = greaterRealmHexDistance({ q, r });
      maximumBoundaryRadius = Math.max(maximumBoundaryRadius, radius);
      radiusCounts.set(radius, (radiusCounts.get(radius) ?? 0) + 1);
    }

    let rotatedIntersection = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const rotatedQ = -candidate.grid.r[cell]!;
      const rotatedR = candidate.grid.q[cell]! + candidate.grid.r[cell]!;
      if (coordinateKeys.has(`${rotatedQ},${rotatedR}`)) rotatedIntersection += 1;
    }
    const maximumRadiusCount = Math.max(0, ...radiusCounts.values());
    const maximumRadiusShareBasisPoints = boundaryCells === 0
      ? 10_000
      : Math.round((maximumRadiusCount * 10_000) / boundaryCells);
    const rotationalSimilarityBasisPoints = Math.round(
      (rotatedIntersection * 10_000)
      / (candidate.grid.cellCount * 2 - rotatedIntersection),
    );
    const naturalOuterBoundary = boundaryCells > 0
      && maximumRadiusShareBasisPoints < 1_800
      && rotationalSimilarityBasisPoints < 9_300;
    const deepOceanBoundary = maximumBoundaryRadius <= 270 - 8;

    expect(barrierBypasses).toBe(0);
    expect(candidate.aggregate.proofs.barriersHaveNoBypass).toBe(barrierBypasses === 0);
    expect(candidate.aggregate.proofs.naturalOuterBoundary).toBe(naturalOuterBoundary);
    expect(candidate.aggregate.proofs.deepOceanBoundary).toBe(deepOceanBoundary);
    expect(candidate.privateMetrics).toMatchObject({
      activeBoundaryCells: boundaryCells,
      maximumBoundaryRadiusShareBasisPoints: maximumRadiusShareBasisPoints,
      rotationalSimilarityBasisPoints,
    });
  });

  it('preserves 100 Lowlands slots and allocates separated slots to every new frontier', () => {
    const candidate = requirePinnedCandidate();
    const castlesByRegion = Array.from({ length: 6 }, () => [] as number[]);
    let invalidCastle = 0;
    let underConnectedCastle = 0;

    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (candidate.castleSlot[cell] !== 1) continue;
      const region = candidate.regionId[cell]!;
      if (
        region >= castlesByRegion.length
        || candidate.tierId[cell] !== 1
        || candidate.waterRegime[cell] !== 0
        || candidate.barrier[cell] !== 0
      ) {
        invalidCastle += 1;
        continue;
      }
      castlesByRegion[region]!.push(cell);
      if (candidate.legacyLowlandsCastleSlot[cell] !== 1) {
        const passableNeighbors = Array.from(
          { length: 6 },
          (_, direction) => candidate.grid.neighbors[cell * 6 + direction]!,
        ).filter(neighbor => (
          neighbor >= 0
          && candidate.regionId[neighbor] === region
          && candidate.waterRegime[neighbor] === 0
          && candidate.barrier[neighbor] === 0
        )).length;
        if (passableNeighbors < 4) underConnectedCastle += 1;
      }
    }

    let tooClose = 0;
    for (const castles of castlesByRegion.slice(1)) {
      for (let first = 0; first < castles.length; first += 1) {
        for (let second = first + 1; second < castles.length; second += 1) {
          const firstCell = castles[first]!;
          const secondCell = castles[second]!;
          if (greaterRealmHexDistance(
            { q: candidate.grid.q[firstCell]!, r: candidate.grid.r[firstCell]! },
            { q: candidate.grid.q[secondCell]!, r: candidate.grid.r[secondCell]! },
          ) < 5) tooClose += 1;
        }
      }
    }

    expect(invalidCastle).toBe(0);
    expect(underConnectedCastle).toBe(0);
    expect(tooClose).toBe(0);
    expect(castlesByRegion.map(castles => castles.length)).toEqual(
      Array<number>(6).fill(EXPECTED_CASTLES_PER_FRONTIER_REGION),
    );
    expect(candidate.aggregate.castleSlotCount).toBe(
      EXPECTED_CASTLES_PER_FRONTIER_REGION * castlesByRegion.length,
    );
    expect(candidate.aggregate.proofs.castleCapacity).toBe(
      invalidCastle === 0
      && underConnectedCastle === 0
      && tooClose === 0
      && castlesByRegion.every(
        castles => castles.length === EXPECTED_CASTLES_PER_FRONTIER_REGION,
      ),
    );
  });

  it('admits every new pinned castle through the strategic suitability audit', () => {
    const candidate = requirePinnedCandidate();
    const metrics = measureGreaterRealmCastleSuitability({
      grid: candidate.grid,
      regionId: candidate.regionId,
      tierId: candidate.tierId,
      waterRegime: candidate.waterRegime,
      barrier: candidate.barrier,
      castleSlot: candidate.castleSlot,
      legacyCastleSlot: candidate.legacyLowlandsCastleSlot,
      resourcePotential: candidate.resourcePotential,
      corePotential: candidate.corePotential,
      throneAnchor: candidate.throneAnchor,
      slope: candidate.slope,
      wetnessIndex: candidate.wetnessIndex,
      distanceToFreshwater: candidate.distanceToFreshwater,
      distanceToCoast: candidate.distanceToCoast,
      landformId: candidate.landformId,
      ecologyClass: candidate.ecologyClass,
      routeClass: candidate.routeClass,
      landmarkClass: candidate.landmarkClass,
      gates: candidate.gates,
    });
    expect(metrics).toMatchObject({
      totalCastleSlotCount: 600,
      legacyCastleSlotCount: 100,
      newCastleSlotCount: 500,
      minimumRegionCastleSlotCount: 100,
      maximumRegionCastleSlotCount: 100,
      fullyClearNewCastleFootprintCount: 500,
      twoRouteAccessNewCastleCount: 500,
      slopeOrStabilityViolationCount: 0,
      floodOrWaterClearanceViolationCount: 0,
      ecologyViolationCount: 0,
      footprintViolationCount: 0,
      spacingViolationPairCount: 0,
      exactCapacityProof: true,
      suitabilityProof: true,
      fullFootprintProof: true,
      distributionProof: true,
      twoRouteAccessProof: true,
      proof: true,
    });
  });

  it('returns adjacent downhill acyclic flow whose outlets conserve all local runoff', () => {
    const candidate = requirePinnedCandidate();
    const state = new Uint8Array(candidate.grid.cellCount);
    let invalidReceiver = 0;
    let uphillReceiver = 0;
    let cycles = 0;
    let outletAccumulation = 0n;
    const incomingAccumulation = new BigUint64Array(candidate.grid.cellCount);

    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const receiver = candidate.flowReceiver[cell]!;
      if (receiver < 0) {
        outletAccumulation += candidate.flowAccumulation[cell]!;
        continue;
      }
      if (receiver >= candidate.grid.cellCount || !areAdjacent(candidate, cell, receiver)) {
        invalidReceiver += 1;
      } else if (candidate.filledElevation[receiver]! > candidate.filledElevation[cell]!) {
        uphillReceiver += 1;
      }
      if (receiver >= 0 && receiver < candidate.grid.cellCount) {
        incomingAccumulation[receiver] = (
          incomingAccumulation[receiver]! + candidate.flowAccumulation[cell]!
        );
      }
    }

    for (let start = 0; start < candidate.grid.cellCount; start += 1) {
      if (state[start] !== 0) continue;
      let cell = start;
      while (cell >= 0 && state[cell] === 0) {
        state[cell] = 1;
        cell = candidate.flowReceiver[cell]!;
      }
      if (cell >= 0 && state[cell] === 1) cycles += 1;
      cell = start;
      while (cell >= 0 && state[cell] === 1) {
        state[cell] = 2;
        cell = candidate.flowReceiver[cell]!;
      }
    }

    let derivedLocalContribution = 0n;
    let invalidLocalContribution = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const contribution = candidate.flowAccumulation[cell]! - incomingAccumulation[cell]!;
      if (contribution !== 0n && contribution !== 1n) invalidLocalContribution += 1;
      derivedLocalContribution += contribution;
    }

    expect({ invalidReceiver, uphillReceiver, cycles, invalidLocalContribution }).toEqual({
      invalidReceiver: 0,
      uphillReceiver: 0,
      cycles: 0,
      invalidLocalContribution: 0,
    });
    expect(outletAccumulation).toBe(derivedLocalContribution);
    expect(candidate.aggregate.proofs.hydrologyAcyclic).toBe(cycles === 0);
  });

  it('zeroizes both candidate seed material and all derived seed words', () => {
    const candidate = requirePinnedCandidate();
    const disposable = Object.freeze({
      ...candidate,
      seedMaterial: Buffer.from(candidate.seedMaterial),
      candidateSeed: Uint32Array.from(candidate.candidateSeed),
    }) as unknown as GreaterRealmPrivateCandidate;
    expect(disposable.seedMaterial.some(byte => byte !== 0)).toBe(true);
    expect([...disposable.candidateSeed].some(word => word !== 0)).toBe(true);

    clearGreaterRealmCandidateSecret(disposable);

    expect(disposable.seedMaterial.every(byte => byte === 0)).toBe(true);
    expect([...disposable.candidateSeed].every(word => word === 0)).toBe(true);
  });
});
