import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_REGION_SPECS,
  clearGreaterRealmCandidateSecret,
  deriveGreaterRealmCandidateSeedMaterial,
  generateGreaterRealmCandidate,
  type GreaterRealmPrivateCandidate,
} from '../scripts/atlas/greater-realm-candidate-generator';
import { GREATER_REALM_PROOF_KEYS } from '../scripts/atlas/greater-realm-contracts';
import { GREATER_REALM_ROUTE_CLASS } from '../scripts/atlas/greater-realm-living-world';
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
  type IntegerTerrainArray,
} from '../scripts/atlas/greater-realm-terrain';

const PINNED_ROOT_LABEL = 'greater-realm-ordinary-parent-a';
const SAME_FIRST_WORD_BASELINE_ROOT_INDEX = 23_248;
const SAME_FIRST_WORD_ROOT_INDEX = 41_769;
const PINNED_ORDINAL = 9;
const SAME_FIRST_WORD_ORDINAL = 0;
const SECONDARY_ROOT_LABEL = 'greater-realm-secondary-fixture';
const SECONDARY_ORDINAL = 19;
const EXPECTED_ACTIVE_CELL_MINIMUM = 100_000;
const EXPECTED_ACTIVE_CELL_MAXIMUM = 150_000;
const EXPECTED_CASTLES_PER_FRONTIER_REGION = 100;

let pinned: GreaterRealmPrivateCandidate | undefined;
let replay: GreaterRealmPrivateCandidate | undefined;
let secondary: GreaterRealmPrivateCandidate | undefined;
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

function requireCandidates(): readonly [
  GreaterRealmPrivateCandidate,
  GreaterRealmPrivateCandidate,
  GreaterRealmPrivateCandidate,
] {
  if (!pinned || !replay || !secondary) {
    throw new Error('GREATER_REALM_CANDIDATE_FIXTURE_MISSING');
  }
  return [pinned, replay, secondary];
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
  const secondaryRoot = Uint8Array.from(createHash('sha256')
    .update(`${SECONDARY_ROOT_LABEL}\0`, 'utf8')
    .digest());
  const collisionRoot = programmaticRoot(SAME_FIRST_WORD_BASELINE_ROOT_INDEX);
  const secondRoot = programmaticRoot(SAME_FIRST_WORD_ROOT_INDEX);
  const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
    mathRandomCallCount += 1;
    throw new Error('MATH_RANDOM_MUST_NOT_BE_USED');
  });
  try {
    pinned = generateGreaterRealmCandidate({
      rootSeed: firstRoot,
      candidateOrdinal: PINNED_ORDINAL,
    });
    replay = generateGreaterRealmCandidate({
      rootSeed: firstRoot,
      candidateOrdinal: PINNED_ORDINAL,
    });
    secondary = generateGreaterRealmCandidate({
      rootSeed: secondaryRoot,
      candidateOrdinal: SECONDARY_ORDINAL,
    });
    sameFirstWordBaseline = deriveTestCandidateSeed(collisionRoot);
    sameFirstWordVariant = deriveTestCandidateSeed(secondRoot);
  } finally {
    randomSpy.mockRestore();
    firstRoot.fill(0);
    secondaryRoot.fill(0);
    collisionRoot.fill(0);
    secondRoot.fill(0);
  }
}, 360_000);

afterAll(() => {
  if (pinned) clearGreaterRealmCandidateSecret(pinned);
  if (replay) clearGreaterRealmCandidateSecret(replay);
  if (secondary) clearGreaterRealmCandidateSecret(secondary);
  sameFirstWordBaseline?.fill(0);
  sameFirstWordVariant?.fill(0);
});

describe('Greater Realm private candidate generator', () => {
  it('replays the pinned eligible candidate without mutable random state', () => {
    const [candidate, repeated] = requireCandidates();

    expect(mathRandomCallCount).toBe(0);
    expect(candidate.candidateOrdinal).toBe(PINNED_ORDINAL);
    expect(candidate.aggregate.eligible).toBe(true);
    expect(candidate.seedMaterial).toEqual(repeated.seedMaterial);
    expect(candidate.candidateSeed).toEqual(repeated.candidateSeed);
    expect(candidate.domains).toEqual(repeated.domains);
    expect(candidate.gates).toEqual(repeated.gates);
    expect(candidate.barrierCrossSections).toEqual(repeated.barrierCrossSections);
    expect(candidate.stageDigests).toEqual(repeated.stageDigests);
    expect(candidate.aggregate).toEqual(repeated.aggregate);
    expect(candidate.privateMetrics).toEqual(repeated.privateMetrics);
    expect(candidate.grid.q).toEqual(repeated.grid.q);
    expect(candidate.grid.r).toEqual(repeated.grid.r);
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
    const [candidate, , variant] = requireCandidates();

    expect(variant.candidateOrdinal).toBe(SECONDARY_ORDINAL);
    expect(variant.candidateSeed).not.toEqual(candidate.candidateSeed);
    expect(variant.stageDigests.final).not.toBe(candidate.stageDigests.final);
    expect(variant.grid.q).not.toEqual(candidate.grid.q);
  });

  it('binds every returned authoritative integer field into stable stage evidence', () => {
    const [candidate, repeated] = requireCandidates();
    const fields = candidateFields(candidate);

    expect(candidate.stageDigests).toEqual(repeated.stageDigests);
    expect(candidate.stageDigests).toEqual({
      geology: digestGreaterRealmTerrainStage('geology', candidate.grid, {
        bedrockElevation: candidate.bedrockElevation,
        domainId: candidate.domainId,
        geologyId: candidate.geologyId,
      }),
      hydrology: digestGreaterRealmTerrainStage('hydrology', candidate.grid, {
        elevation: candidate.elevation,
        filledElevation: candidate.filledElevation,
        flowReceiver: candidate.flowReceiver,
        waterRegime: candidate.waterRegime,
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
    const [candidate] = requireCandidates();
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
      if (candidate.elevation[cell]! > 0) landCells += 1;
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
    const [candidate] = requireCandidates();
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
      /(?:livingWorld|layoutFingerprint|dressingExcluded|ecologyClass|vegetationDensity|routeClass|landmarkClass|ambientLifeClass|eligibleLandVegetatedBasisPoints|eligibleLandOpenBasisPoints|landmarkCellCounts|ambientLifeCellCounts)/u,
    );
  });

  it('maps every locked Lowlands cell and castle through one reversible protected transform', () => {
    const [candidate] = requireCandidates();
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
    const [candidate] = requireCandidates();
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
    const [candidate] = requireCandidates();
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
    const [candidate] = requireCandidates();
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
    const [candidate] = requireCandidates();
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
    const [candidate] = requireCandidates();
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

  it('returns adjacent downhill acyclic flow whose outlets conserve all local runoff', () => {
    const [candidate] = requireCandidates();
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
    const [candidate] = requireCandidates();
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
