import { GREATER_REALM_BIOME_ID } from './greater-realm-biomes';
import {
  GREATER_REALM_CHUNK_BENCHMARK_VERSION,
  GREATER_REALM_REVIEWED_CHUNK_AXIS_SPAN,
  benchmarkGreaterRealmChunkPartition,
} from './greater-realm-chunk-benchmark';
import type { GreaterRealmPrivateCandidate } from './greater-realm-candidate-generator';
import {
  GREATER_REALM_GEOLOGY_AUTHORITY_VERSION,
  deriveGreaterRealmDomainMaterialAuthority,
  type GreaterRealmDomainMaterialAuthority,
} from './greater-realm-geology-authority';
import {
  GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION,
  GREATER_REALM_HYDROLOGY_GENERATION_VERSION,
  GREATER_REALM_WATER_REGIME_ID,
  deriveGreaterRealmHydrologyAuthority,
  type GreaterRealmHydrologyAuthority,
} from './greater-realm-hydrology-authority';
import {
  GREATER_REALM_STRATEGIC_AUDITS_VERSION,
  measureGreaterRealmCastleSuitability,
  measureGreaterRealmInnerGateThroneRedundancy,
  measureGreaterRealmRegionBoundaryAlignment,
  measureGreaterRealmTierPotentialDensity,
} from './greater-realm-strategic-audits';
import {
  GREATER_REALM_TOPOGRAPHIC_QA_VERSION,
  measureGreaterRealmTopographicQa,
} from './greater-realm-topographic-qa';
import {
  GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORT_VERSION,
  measureGreaterRealmTopographyPatchSupport,
} from './greater-realm-topography-patch-support';

const PRIVATE_CANVAS_RADIUS = 270;
const PRIVATE_MINIMUM_CELL_COUNT = 100_000;
const PRIVATE_MAXIMUM_CELL_COUNT = 150_000;
const PRIVATE_DOMAIN_KEYS = Object.freeze([
  'age',
  'baseThickness',
  'buoyancy',
  'crustClass',
  'id',
  'motionQ',
  'motionR',
  'q',
  'r',
  'resistance',
  'rockFamily',
  'volcanicPotential',
] as const);

function fail(code: string): never {
  throw new Error(code);
}

function assertPrivateAuthorityCandidateEnvelope(
  candidate: GreaterRealmPrivateCandidate,
): void {
  if (
    !candidate
    || typeof candidate !== 'object'
    || !candidate.grid
    || !Number.isSafeInteger(candidate.grid.cellCount)
    || candidate.grid.cellCount < PRIVATE_MINIMUM_CELL_COUNT
    || candidate.grid.cellCount > PRIVATE_MAXIMUM_CELL_COUNT
    || !(candidate.candidateSeed instanceof Uint32Array)
    || candidate.candidateSeed.constructor !== Uint32Array
    || candidate.candidateSeed.length !== 4
    || !(candidate.candidateSeed.buffer instanceof ArrayBuffer)
  ) fail('GREATER_REALM_PRIVATE_AUTHORITY_INPUT_INVALID');
}

function hasExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const actualKeys = Reflect.ownKeys(value);
  if (actualKeys.some(key => typeof key !== 'string')) return false;
  const actualNames = (actualKeys as string[]).sort();
  const expectedNames = [...expectedKeys].sort();
  if (
    actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
  ) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value))
    .every(descriptor => 'value' in descriptor);
}

function hasCanonicalPrivateDomainInventory(
  candidate: GreaterRealmPrivateCandidate,
): boolean {
  const domains = candidate.domains;
  if (!Array.isArray(domains) || Object.getPrototypeOf(domains) !== Array.prototype) {
    return false;
  }
  const arrayKeys = Reflect.ownKeys(domains);
  if (arrayKeys.length !== domains.length + 1 || !arrayKeys.includes('length')) {
    return false;
  }
  for (let index = 0; index < domains.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(domains, String(index));
    if (
      !descriptor
      || !('value' in descriptor)
      || !hasExactDataRecord(descriptor.value, PRIVATE_DOMAIN_KEYS)
    ) return false;
  }
  return true;
}

function privateEngineeredWaterClearanceMask(
  candidate: GreaterRealmPrivateCandidate,
): Uint8Array {
  const mask = new Uint8Array(candidate.grid.cellCount);
  let completed = false;
  try {
    if (!Array.isArray(candidate.gates)) {
      fail('GREATER_REALM_PRIVATE_WATER_EXEMPTION_INVALID');
    }
    for (const gate of candidate.gates) {
      for (const cell of [gate.firstCell, gate.secondCell]) {
        if (
          !Number.isSafeInteger(cell)
          || cell < 0
          || cell >= candidate.grid.cellCount
        ) fail('GREATER_REALM_PRIVATE_WATER_EXEMPTION_INVALID');
        mask[cell] = 1;
      }
      for (const path of [
        gate.firstApproachPath,
        gate.firstAlternateApproachPath,
        gate.secondApproachPath,
        gate.secondAlternateApproachPath,
      ]) {
        if (!Array.isArray(path)) {
          fail('GREATER_REALM_PRIVATE_WATER_EXEMPTION_INVALID');
        }
        for (const cell of path) {
          if (
            !Number.isSafeInteger(cell)
            || cell < 0
            || cell >= candidate.grid.cellCount
          ) fail('GREATER_REALM_PRIVATE_WATER_EXEMPTION_INVALID');
          mask[cell] = 1;
        }
      }
    }
    completed = true;
    return mask;
  } finally {
    if (!completed) mask.fill(0);
  }
}

function equalPrivateData(
  expected: unknown,
  actual: unknown,
  seen = new WeakMap<object, object>(),
): boolean {
  if (Object.is(expected, actual)) return true;
  if (
    expected === null
    || actual === null
    || typeof expected !== 'object'
    || typeof actual !== 'object'
  ) return false;
  if (Object.getPrototypeOf(expected) !== Object.getPrototypeOf(actual)) return false;
  const priorExpected = seen.get(actual);
  if (priorExpected) return priorExpected === expected;
  seen.set(actual, expected);
  const expectedKeys = Reflect.ownKeys(expected);
  const actualKeys = Reflect.ownKeys(actual);
  if (
    expectedKeys.length !== actualKeys.length
    || !expectedKeys.every(key => typeof key === 'string')
    || !actualKeys.every(key => typeof key === 'string')
  ) return false;
  const expectedNames = (expectedKeys as string[]).sort();
  const actualNames = (actualKeys as string[]).sort();
  const expectedDescriptors = Object.getOwnPropertyDescriptors(expected);
  const actualDescriptors = Object.getOwnPropertyDescriptors(actual);
  for (let index = 0; index < expectedNames.length; index += 1) {
    const name = expectedNames[index]!;
    const expectedDescriptor = expectedDescriptors[name];
    const actualDescriptor = actualDescriptors[name];
    if (
      name !== actualNames[index]
      || !expectedDescriptor
      || !actualDescriptor
      || !('value' in expectedDescriptor)
      || !('value' in actualDescriptor)
      || !equalPrivateData(
        expectedDescriptor.value,
        actualDescriptor.value,
        seen,
      )
    ) return false;
  }
  return true;
}

function equalTypedArray<T extends ArrayBufferView & { readonly length: number }>(
  expected: T,
  actual: unknown,
  constructor: abstract new (...args: never[]) => T,
): boolean {
  if (
    !(actual instanceof constructor)
    || (actual as ArrayBufferView).constructor !== constructor
    || !(actual.buffer instanceof ArrayBuffer)
    || actual.length !== expected.length
    || actual.byteLength !== expected.byteLength
  ) return false;
  const expectedBytes = new Uint8Array(
    expected.buffer,
    expected.byteOffset,
    expected.byteLength,
  );
  const actualBytes = new Uint8Array(
    actual.buffer,
    actual.byteOffset,
    actual.byteLength,
  );
  for (let index = 0; index < expectedBytes.length; index += 1) {
    if (expectedBytes[index] !== actualBytes[index]) return false;
  }
  return true;
}

function assertPrivateGeologyAuthority(candidate: GreaterRealmPrivateCandidate): void {
  let expected: GreaterRealmDomainMaterialAuthority | undefined;
  try {
    if (!hasCanonicalPrivateDomainInventory(candidate)) {
      fail('GREATER_REALM_PRIVATE_GEOLOGY_AUTHORITY_INVALID');
    }
    expected = deriveGreaterRealmDomainMaterialAuthority({
      seed: candidate.candidateSeed,
      domains: candidate.domains,
    });
    const domainFieldsExact = candidate.domains.length === expected.baseThickness.length
      && candidate.domains.every(domain => (
        Number.isSafeInteger(domain.baseThickness)
        && domain.baseThickness === expected!.baseThickness[domain.id]
        && Number.isSafeInteger(domain.rockFamily)
        && domain.rockFamily === expected!.rockFamily[domain.id]
      ));
    const stored = candidate.privateMetrics.geologyAuthority;
    const expectedStored = Object.freeze({
      version: GREATER_REALM_GEOLOGY_AUTHORITY_VERSION,
      metrics: expected.metrics,
    });
    if (
      !domainFieldsExact
      || expected.metrics.proof !== true
      || !equalPrivateData(expectedStored, stored)
    ) fail('GREATER_REALM_PRIVATE_GEOLOGY_AUTHORITY_INVALID');
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'GREATER_REALM_PRIVATE_GEOLOGY_AUTHORITY_INVALID'
    ) throw error;
    fail('GREATER_REALM_PRIVATE_GEOLOGY_AUTHORITY_INVALID');
  } finally {
    expected?.clear();
  }
}

function assertPrivateHydrologyAuthority(
  candidate: GreaterRealmPrivateCandidate,
  engineeredWaterClearanceMask: Uint8Array,
): void {
  const cellCount = candidate.grid.cellCount;
  const sourceWaterRegime = new Uint8Array(cellCount);
  const marshMask = new Uint8Array(cellCount);
  let expected: GreaterRealmHydrologyAuthority | undefined;
  try {
    if (
      !(candidate.waterRegime instanceof Uint8Array)
      || candidate.waterRegime.constructor !== Uint8Array
      || candidate.waterRegime.length !== cellCount
      || !(candidate.biomeId instanceof Uint8Array)
      || candidate.biomeId.constructor !== Uint8Array
      || candidate.biomeId.length !== cellCount
    ) fail('GREATER_REALM_PRIVATE_HYDROLOGY_AUTHORITY_INVALID');
    for (let cell = 0; cell < cellCount; cell += 1) {
      const biome = candidate.biomeId[cell]!;
      const marsh = biome === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
        || biome === GREATER_REALM_BIOME_ID.SALT_MARSH;
      const promotedMarsh = marsh && engineeredWaterClearanceMask[cell] === 0;
      marshMask[cell] = promotedMarsh ? 1 : 0;
      sourceWaterRegime[cell] = promotedMarsh
        ? GREATER_REALM_WATER_REGIME_ID.DRY
        : candidate.waterRegime[cell]!;
    }
    expected = deriveGreaterRealmHydrologyAuthority({
      grid: candidate.grid,
      seed: candidate.candidateSeed,
      waterRegime: sourceWaterRegime,
      marshMask,
      flowContinuityExemptionMask: candidate.legacyLowlandsProtectedCell,
      elevation: candidate.elevation,
      filledElevation: candidate.filledElevation,
      flowReceiver: candidate.flowReceiver,
      flowAccumulation: candidate.flowAccumulation,
      seaLevel: 0,
    });
    const stored = candidate.privateMetrics.hydrologyAuthority;
    const expectedStored = Object.freeze({
      version: GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION,
      generationVersion: GREATER_REALM_HYDROLOGY_GENERATION_VERSION,
      metrics: expected.metrics,
    });
    if (
      expected.metrics.proof !== true
      || !equalPrivateData(expectedStored, stored)
      || !equalTypedArray(expected.waterRegime, candidate.waterRegime, Uint8Array)
      || !equalTypedArray(expected.waterBodyId, candidate.waterBodyId, Uint32Array)
      || !equalTypedArray(expected.depthClass, candidate.waterDepthClass, Uint8Array)
      || !equalTypedArray(expected.surfaceLevel, candidate.waterSurfaceLevel, Int32Array)
      || !equalTypedArray(expected.downstream, candidate.waterDownstream, Int32Array)
      || !equalTypedArray(expected.flowAccumulation, candidate.flowAccumulation, BigUint64Array)
      || !equalTypedArray(expected.bankSeed, candidate.waterBankSeed, Uint32Array)
      || !equalTypedArray(
        expected.generationVersion,
        candidate.waterGenerationVersion,
        Uint16Array,
      )
    ) fail('GREATER_REALM_PRIVATE_HYDROLOGY_AUTHORITY_INVALID');
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'GREATER_REALM_PRIVATE_HYDROLOGY_AUTHORITY_INVALID'
    ) throw error;
    fail('GREATER_REALM_PRIVATE_HYDROLOGY_AUTHORITY_INVALID');
  } finally {
    sourceWaterRegime.fill(0);
    marshMask.fill(0);
    expected?.clear();
  }
}

function assertPrivateStrategicAuthorities(candidate: GreaterRealmPrivateCandidate): void {
  try {
    const stored = candidate.privateMetrics.strategicAudits;
    if (stored.version !== GREATER_REALM_STRATEGIC_AUDITS_VERSION) {
      fail('GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID');
    }
    const regionBoundaryAlignment = measureGreaterRealmRegionBoundaryAlignment({
      grid: candidate.grid,
      regionId: candidate.regionId,
      waterRegime: candidate.waterRegime,
      barrier: candidate.barrier,
      geologicalBarrierBand: candidate.geologicalBarrierBand,
      watershedId: candidate.watershedId,
      ridgeId: candidate.ridgeId,
      landformId: candidate.landformId,
      biomeId: candidate.biomeId,
      gates: candidate.gates,
    });
    if (
      regionBoundaryAlignment.proof !== true
      || !equalPrivateData(regionBoundaryAlignment, stored.regionBoundaryAlignment)
    ) fail('GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID');
    const tierPotentialDensity = measureGreaterRealmTierPotentialDensity({
      tierId: candidate.tierId,
      waterRegime: candidate.waterRegime,
      barrier: candidate.barrier,
      castleSlot: candidate.castleSlot,
      legacyProtectedCell: candidate.legacyLowlandsProtectedCell,
      resourcePotential: candidate.resourcePotential,
      corePotential: candidate.corePotential,
    });
    if (
      tierPotentialDensity.proof !== true
      || !equalPrivateData(tierPotentialDensity, stored.tierPotentialDensity)
    ) fail('GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID');
    const castleSuitability = measureGreaterRealmCastleSuitability({
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
    if (
      castleSuitability.proof !== true
      || !equalPrivateData(castleSuitability, stored.castleSuitability)
    ) fail('GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID');
    const innerGateThrone = measureGreaterRealmInnerGateThroneRedundancy({
      grid: candidate.grid,
      regionId: candidate.regionId,
      waterRegime: candidate.waterRegime,
      barrier: candidate.barrier,
      throneAnchor: candidate.throneAnchor,
      gates: candidate.gates,
    });
    if (
      innerGateThrone.proof !== true
      || !equalPrivateData(innerGateThrone, stored.innerGateThrone)
    ) fail('GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID');
    if (!equalPrivateData(Object.freeze({
      version: GREATER_REALM_STRATEGIC_AUDITS_VERSION,
      regionBoundaryAlignment,
      tierPotentialDensity,
      castleSuitability,
      innerGateThrone,
    }), stored)) fail('GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID');
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID'
    ) throw error;
    fail('GREATER_REALM_PRIVATE_STRATEGIC_AUTHORITY_INVALID');
  }
}

function assertPrivateTopographicQa(
  candidate: GreaterRealmPrivateCandidate,
  engineeredWaterClearanceMask: Uint8Array,
): void {
  try {
    const expected = measureGreaterRealmTopographicQa({
      grid: candidate.grid,
      regionId: candidate.regionId,
      geomorphologyCoastalClass: candidate.geomorphologyCoastalClass,
      elevation: candidate.elevation,
      preErosionElevation: candidate.geomorphologyElevation,
      sedimentDepth: candidate.sedimentDepth,
      flowReceiver: candidate.flowReceiver,
      flowAccumulation: candidate.flowAccumulation,
      waterRegime: candidate.waterRegime,
      biomeId: candidate.biomeId,
      landformId: candidate.landformId,
      slope: candidate.slope,
      aspect: candidate.aspect,
      profileCurvature: candidate.profileCurvature,
      planCurvature: candidate.planCurvature,
      watershedId: candidate.watershedId,
      ridgeId: candidate.ridgeId,
      legacyProtectedCell: candidate.legacyLowlandsProtectedCell,
      waterClassificationExemptionMask: engineeredWaterClearanceMask,
      seaLevel: 0,
    });
    if (
      expected.version !== GREATER_REALM_TOPOGRAPHIC_QA_VERSION
      || expected.cellCount !== candidate.grid.cellCount
      || expected.landCellCount + expected.waterCellCount !== candidate.grid.cellCount
      || expected.biomeElevationConsistency.inconsistentCellCount !== 0
      || expected.biomeElevationConsistency.highGradientMarshCellCount !== 0
      || expected.biomeElevationConsistency.marshClassificationMismatchCount !== 0
      || expected.regionalHydrogeomorphology.proof !== true
      || !equalPrivateData(expected, candidate.privateMetrics.topographicQa)
    ) fail('GREATER_REALM_PRIVATE_TOPOGRAPHIC_QA_INVALID');
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'GREATER_REALM_PRIVATE_TOPOGRAPHIC_QA_INVALID'
    ) throw error;
    fail('GREATER_REALM_PRIVATE_TOPOGRAPHIC_QA_INVALID');
  }
}

function assertPrivateChunkBenchmark(candidate: GreaterRealmPrivateCandidate): void {
  try {
    const expected = benchmarkGreaterRealmChunkPartition({
      grid: candidate.grid,
      canvasRadius: PRIVATE_CANVAS_RADIUS,
    });
    if (
      expected.version !== GREATER_REALM_CHUNK_BENCHMARK_VERSION
      || expected.selectedAxisSpan !== GREATER_REALM_REVIEWED_CHUNK_AXIS_SPAN
      || expected.proof !== true
      || !equalPrivateData(expected, candidate.privateMetrics.chunkBenchmark)
    ) fail('GREATER_REALM_PRIVATE_CHUNK_BENCHMARK_INVALID');
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'GREATER_REALM_PRIVATE_CHUNK_BENCHMARK_INVALID'
    ) throw error;
    fail('GREATER_REALM_PRIVATE_CHUNK_BENCHMARK_INVALID');
  }
}

function assertPrivateTopographyPatchSupport(candidate: GreaterRealmPrivateCandidate): void {
  try {
    const expected = measureGreaterRealmTopographyPatchSupport({
      grid: candidate.grid,
      elevation: candidate.elevation,
      waterRegime: candidate.waterRegime,
      waterDepthClass: candidate.waterDepthClass,
      waterSurfaceLevel: candidate.waterSurfaceLevel,
      bankSeed: candidate.waterBankSeed,
      landformId: candidate.landformId,
      geologicalBarrierBand: candidate.geologicalBarrierBand,
      slope: candidate.slope,
      aspect: candidate.aspect,
      profileCurvature: candidate.profileCurvature,
      planCurvature: candidate.planCurvature,
      ridgeId: candidate.ridgeId,
      routeClass: candidate.routeClass,
    });
    if (
      expected.version !== GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORT_VERSION
      || expected.proof !== true
      || !equalPrivateData(expected, candidate.privateMetrics.topographyPatchSupport)
    ) fail('GREATER_REALM_PRIVATE_TOPOGRAPHY_PATCH_SUPPORT_INVALID');
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'GREATER_REALM_PRIVATE_TOPOGRAPHY_PATCH_SUPPORT_INVALID'
    ) throw error;
    fail('GREATER_REALM_PRIVATE_TOPOGRAPHY_PATCH_SUPPORT_INVALID');
  }
}

/**
 * Re-derive every new PR-A authority from exact private candidate fields.
 *
 * Package orchestration calls this once through atlas serialization and then
 * reuses that successful proof for its seven private previews. The exported
 * standalone preview path calls it independently before rendering.
 */
export function assertGreaterRealmPrivateAdvancedAuthorities(
  candidate: GreaterRealmPrivateCandidate,
): void {
  assertPrivateAuthorityCandidateEnvelope(candidate);
  assertPrivateGeologyAuthority(candidate);
  const engineeredWaterClearanceMask = privateEngineeredWaterClearanceMask(candidate);
  try {
    assertPrivateHydrologyAuthority(candidate, engineeredWaterClearanceMask);
    assertPrivateStrategicAuthorities(candidate);
    assertPrivateTopographicQa(candidate, engineeredWaterClearanceMask);
    assertPrivateChunkBenchmark(candidate);
    assertPrivateTopographyPatchSupport(candidate);
  } finally {
    engineeredWaterClearanceMask.fill(0);
  }
}
