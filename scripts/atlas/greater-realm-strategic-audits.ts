import {
  GREATER_REALM_BIOME_CLASS_COUNT,
  GREATER_REALM_LANDFORM_CLASS_COUNT,
  GREATER_REALM_LANDFORM_ID,
} from './greater-realm-biomes';
import {
  GREATER_REALM_ECOLOGY_CLASS,
  GREATER_REALM_LANDMARK_CLASS,
  GREATER_REALM_ROUTE_CLASS,
} from './greater-realm-living-world';
import {
  isCanonicalGreaterRealmAxialGrid,
  type IndexedAxialGrid,
} from './greater-realm-terrain';
import {
  deriveGreaterRealmSupportNormalizedAngularSectors,
} from './greater-realm-castle-distribution';

export const GREATER_REALM_STRATEGIC_AUDITS_VERSION =
  'greater-realm-strategic-audits-v1' as const;

const HEX_NEIGHBOR_COUNT = 6;
const REGION_COUNT = 10;
const TIER_I_REGION_COUNT = 6;
const TIER_III_REGION_INDEX = 9;
const MAXIMUM_AUDIT_CELL_COUNT = 150_000;
const MAXIMUM_CASTLE_SLOT_COUNT = 600;
const UNREACHED_DISTANCE = 0xffff;

function fail(code: string): never {
  throw new Error(code);
}

function assertSafeIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
}

function expectedTierForRegion(region: number): number {
  return region < 6 ? 1 : region < 9 ? 2 : 3;
}

function assertUint8Field(
  value: Uint8Array,
  cellCount: number,
  code: string,
): void {
  if (!(value instanceof Uint8Array) || value.length !== cellCount) fail(code);
}

function assertUint16Field(
  value: Uint16Array,
  cellCount: number,
  code: string,
): void {
  if (!(value instanceof Uint16Array) || value.length !== cellCount) fail(code);
}

function assertInt32Field(
  value: Int32Array,
  cellCount: number,
  code: string,
): void {
  if (!(value instanceof Int32Array) || value.length !== cellCount) fail(code);
}

function assertBinaryField(value: Uint8Array, code: string): void {
  for (const entry of value) {
    if (entry > 1) fail(code);
  }
}

function assertGrid(grid: IndexedAxialGrid): void {
  if (!grid || typeof grid !== 'object') fail('GREATER_REALM_AUDIT_GRID_INVALID');
  assertSafeIntegerInRange(
    grid.cellCount,
    1,
    MAXIMUM_AUDIT_CELL_COUNT,
    'GREATER_REALM_AUDIT_GRID_SIZE_INVALID',
  );
  if (!(grid.q instanceof Int32Array) || grid.q.length !== grid.cellCount) {
    fail('GREATER_REALM_AUDIT_GRID_Q_INVALID');
  }
  if (!(grid.r instanceof Int32Array) || grid.r.length !== grid.cellCount) {
    fail('GREATER_REALM_AUDIT_GRID_R_INVALID');
  }
  if (
    !(grid.neighbors instanceof Int32Array)
    || grid.neighbors.length !== grid.cellCount * HEX_NEIGHBOR_COUNT
  ) fail('GREATER_REALM_AUDIT_GRID_NEIGHBORS_INVALID');

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < -1 || neighbor >= grid.cellCount || neighbor === cell) {
        fail('GREATER_REALM_AUDIT_GRID_NEIGHBOR_INDEX_INVALID');
      }
      if (neighbor < 0) continue;
      const deltaQ = grid.q[neighbor]! - grid.q[cell]!;
      const deltaR = grid.r[neighbor]! - grid.r[cell]!;
      if (
        !(
          (deltaQ === 1 && deltaR === 0)
          || (deltaQ === 1 && deltaR === -1)
          || (deltaQ === 0 && deltaR === -1)
          || (deltaQ === -1 && deltaR === 0)
          || (deltaQ === -1 && deltaR === 1)
          || (deltaQ === 0 && deltaR === 1)
        )
      ) fail('GREATER_REALM_AUDIT_GRID_NEIGHBOR_GEOMETRY_INVALID');
      let reciprocalCount = 0;
      for (let reciprocal = 0; reciprocal < HEX_NEIGHBOR_COUNT; reciprocal += 1) {
        if (
          grid.neighbors[neighbor * HEX_NEIGHBOR_COUNT + reciprocal] === cell
        ) reciprocalCount += 1;
      }
      if (reciprocalCount !== 1) fail('GREATER_REALM_AUDIT_GRID_NEIGHBOR_RECIPROCAL_INVALID');
    }
  }
  if (!isCanonicalGreaterRealmAxialGrid(grid)) {
    fail('GREATER_REALM_AUDIT_GRID_NEIGHBOR_CANONICAL_INVALID');
  }
}

function assertRegionAndTierFields(
  regionId: Uint8Array,
  tierId: Uint8Array | undefined,
  cellCount: number,
): void {
  assertUint8Field(regionId, cellCount, 'GREATER_REALM_AUDIT_REGION_FIELD_INVALID');
  if (tierId) assertUint8Field(tierId, cellCount, 'GREATER_REALM_AUDIT_TIER_FIELD_INVALID');
  for (let cell = 0; cell < cellCount; cell += 1) {
    const region = regionId[cell]!;
    if (region >= REGION_COUNT) fail('GREATER_REALM_AUDIT_REGION_VALUE_INVALID');
    if (tierId && tierId[cell] !== expectedTierForRegion(region)) {
      fail('GREATER_REALM_AUDIT_REGION_TIER_MISMATCH');
    }
  }
}

function assertWaterField(waterRegime: Uint8Array, cellCount: number): void {
  assertUint8Field(waterRegime, cellCount, 'GREATER_REALM_AUDIT_WATER_FIELD_INVALID');
  for (const regime of waterRegime) {
    // Regime 6 is reserved for the explicit marsh authority added by the PR-A
    // hydrology audit. It is intentionally non-passable here.
    if (regime > 6) fail('GREATER_REALM_AUDIT_WATER_REGIME_INVALID');
  }
}

function strategicallyPassableSurface(regime: number): boolean {
  return regime === 0 || regime === 3 || regime === 4;
}

function roundedBasisPoints(numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(numerator)
    || !Number.isSafeInteger(denominator)
    || numerator < 0
    || denominator <= 0
    || numerator > denominator
  ) fail('GREATER_REALM_AUDIT_BASIS_POINTS_INVALID');
  return Math.floor((numerator * 10_000 + Math.floor(denominator / 2)) / denominator);
}

function axialDistance(
  firstQ: number,
  firstR: number,
  secondQ: number,
  secondR: number,
): number {
  const q = firstQ - secondQ;
  const r = firstR - secondR;
  const s = -q - r;
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r) || !Number.isSafeInteger(s)) {
    fail('GREATER_REALM_AUDIT_AXIAL_DISTANCE_OVERFLOW');
  }
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
}

export type GreaterRealmAuditGate = Readonly<{
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

function assertGateList(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  gates: readonly GreaterRealmAuditGate[],
): void {
  if (!Array.isArray(gates) || gates.length > 18) fail('GREATER_REALM_AUDIT_GATE_LIST_INVALID');
  const seenIndexes = new Uint8Array(18);
  const usedEndpoints = new Uint8Array(grid.cellCount);
  try {
    for (const gate of gates) {
      if (!gate || typeof gate !== 'object') fail('GREATER_REALM_AUDIT_GATE_INVALID');
      assertSafeIntegerInRange(gate.gateIndex, 0, 17, 'GREATER_REALM_AUDIT_GATE_INDEX_INVALID');
      if (seenIndexes[gate.gateIndex] === 1) fail('GREATER_REALM_AUDIT_GATE_INDEX_DUPLICATE');
      seenIndexes[gate.gateIndex] = 1;
      assertSafeIntegerInRange(
        gate.firstRegion,
        0,
        REGION_COUNT - 1,
        'GREATER_REALM_AUDIT_GATE_REGION_INVALID',
      );
      assertSafeIntegerInRange(
        gate.secondRegion,
        0,
        REGION_COUNT - 1,
        'GREATER_REALM_AUDIT_GATE_REGION_INVALID',
      );
      if (gate.firstRegion === gate.secondRegion) fail('GREATER_REALM_AUDIT_GATE_REGION_INVALID');
      assertSafeIntegerInRange(
        gate.firstCell,
        0,
        grid.cellCount - 1,
        'GREATER_REALM_AUDIT_GATE_CELL_INVALID',
      );
      assertSafeIntegerInRange(
        gate.secondCell,
        0,
        grid.cellCount - 1,
        'GREATER_REALM_AUDIT_GATE_CELL_INVALID',
      );
      if (
        regionId[gate.firstCell] !== gate.firstRegion
        || regionId[gate.secondCell] !== gate.secondRegion
      ) fail('GREATER_REALM_AUDIT_GATE_CELL_REGION_MISMATCH');
      if (usedEndpoints[gate.firstCell] === 1 || usedEndpoints[gate.secondCell] === 1) {
        fail('GREATER_REALM_AUDIT_GATE_ENDPOINT_DUPLICATE');
      }
      usedEndpoints[gate.firstCell] = 1;
      usedEndpoints[gate.secondCell] = 1;
      let adjacent = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (
          grid.neighbors[gate.firstCell * HEX_NEIGHBOR_COUNT + direction]
          === gate.secondCell
        ) adjacent = true;
      }
      if (!adjacent) fail('GREATER_REALM_AUDIT_GATE_ENDPOINT_NOT_ADJACENT');
      for (const path of [
        gate.firstApproachPath,
        gate.firstAlternateApproachPath,
        gate.secondApproachPath,
        gate.secondAlternateApproachPath,
      ]) {
        if (!Array.isArray(path) || path.length > grid.cellCount) {
          fail('GREATER_REALM_AUDIT_GATE_PATH_INVALID');
        }
        for (const cell of path) {
          assertSafeIntegerInRange(
            cell,
            0,
            grid.cellCount - 1,
            'GREATER_REALM_AUDIT_GATE_PATH_CELL_INVALID',
          );
        }
      }
    }
  } finally {
    seenIndexes.fill(0);
    usedEndpoints.fill(0);
  }
}

function structurallyNaturalLandform(landform: number): boolean {
  return (
    landform === GREATER_REALM_LANDFORM_ID.WATERCOURSE
    || landform === GREATER_REALM_LANDFORM_ID.HIGHLAND
    || landform === GREATER_REALM_LANDFORM_ID.MOUNTAIN
    || landform === GREATER_REALM_LANDFORM_ID.CANYON
    || landform === GREATER_REALM_LANDFORM_ID.LAKE_BASIN
    || landform === GREATER_REALM_LANDFORM_ID.DELTA
    || landform === GREATER_REALM_LANDFORM_ID.GLACIAL_VALLEY
    || landform === GREATER_REALM_LANDFORM_ID.ISLAND_SHELF
    || landform === GREATER_REALM_LANDFORM_ID.SEA_CLIFF
  );
}

export type GreaterRealmRegionBoundaryAlignmentPolicy = Readonly<{
  minimumStructuralAlignmentBasisPoints: number;
  minimumAnyNaturalAlignmentBasisPoints: number;
}>;

export const GREATER_REALM_REGION_BOUNDARY_ALIGNMENT_POLICY = Object.freeze({
  minimumStructuralAlignmentBasisPoints: 7_500,
  minimumAnyNaturalAlignmentBasisPoints: 9_000,
}) satisfies GreaterRealmRegionBoundaryAlignmentPolicy;

export type GreaterRealmRegionBoundaryAlignmentInput = Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  waterRegime: Uint8Array;
  barrier: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  watershedId: Int32Array;
  ridgeId: Int32Array;
  landformId: Uint8Array;
  biomeId: Uint8Array;
  gates?: readonly GreaterRealmAuditGate[];
  policy?: GreaterRealmRegionBoundaryAlignmentPolicy;
}>;

export type GreaterRealmRegionBoundaryAlignmentMetrics = Readonly<{
  boundaryEdgeCount: number;
  structurallyAlignedEdgeCount: number;
  anyNaturallyAlignedEdgeCount: number;
  unalignedEdgeCount: number;
  barrierAlignedEdgeCount: number;
  hydrologyAlignedEdgeCount: number;
  watershedAlignedEdgeCount: number;
  ridgeAlignedEdgeCount: number;
  landformAlignedEdgeCount: number;
  ecologicalTransitionEdgeCount: number;
  reviewedGateEdgeCount: number;
  structuralAlignmentBasisPoints: number;
  anyNaturalAlignmentBasisPoints: number;
  proof: boolean;
}>;

/**
 * Audit whether final strategic-region edges follow physical authority rather
 * than merely the assigned political label. The result intentionally contains
 * counts and ratios only; no edge, cell, region-pair, or coordinate escapes.
 */
export function measureGreaterRealmRegionBoundaryAlignment(
  input: GreaterRealmRegionBoundaryAlignmentInput,
): GreaterRealmRegionBoundaryAlignmentMetrics {
  assertGrid(input.grid);
  const cellCount = input.grid.cellCount;
  assertRegionAndTierFields(input.regionId, undefined, cellCount);
  assertWaterField(input.waterRegime, cellCount);
  assertUint8Field(input.barrier, cellCount, 'GREATER_REALM_AUDIT_BARRIER_FIELD_INVALID');
  assertUint8Field(
    input.geologicalBarrierBand,
    cellCount,
    'GREATER_REALM_AUDIT_GEOLOGICAL_BARRIER_FIELD_INVALID',
  );
  assertBinaryField(input.barrier, 'GREATER_REALM_AUDIT_BARRIER_VALUE_INVALID');
  assertInt32Field(input.watershedId, cellCount, 'GREATER_REALM_AUDIT_WATERSHED_FIELD_INVALID');
  assertInt32Field(input.ridgeId, cellCount, 'GREATER_REALM_AUDIT_RIDGE_FIELD_INVALID');
  assertUint8Field(input.landformId, cellCount, 'GREATER_REALM_AUDIT_LANDFORM_FIELD_INVALID');
  assertUint8Field(input.biomeId, cellCount, 'GREATER_REALM_AUDIT_BIOME_FIELD_INVALID');
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (input.landformId[cell]! >= GREATER_REALM_LANDFORM_CLASS_COUNT) {
      fail('GREATER_REALM_AUDIT_LANDFORM_VALUE_INVALID');
    }
    if (input.biomeId[cell]! >= GREATER_REALM_BIOME_CLASS_COUNT) {
      fail('GREATER_REALM_AUDIT_BIOME_VALUE_INVALID');
    }
    if (input.watershedId[cell]! < 0 || input.ridgeId[cell]! < 0) {
      fail('GREATER_REALM_AUDIT_TOPOGRAPHY_ID_INVALID');
    }
  }
  const gates = input.gates ?? Object.freeze([]);
  assertGateList(input.grid, input.regionId, gates);
  const policy = input.policy ?? GREATER_REALM_REGION_BOUNDARY_ALIGNMENT_POLICY;
  assertSafeIntegerInRange(
    policy.minimumStructuralAlignmentBasisPoints,
    0,
    10_000,
    'GREATER_REALM_AUDIT_BOUNDARY_POLICY_INVALID',
  );
  assertSafeIntegerInRange(
    policy.minimumAnyNaturalAlignmentBasisPoints,
    policy.minimumStructuralAlignmentBasisPoints,
    10_000,
    'GREATER_REALM_AUDIT_BOUNDARY_POLICY_INVALID',
  );

  const gateMate = new Int32Array(cellCount);
  gateMate.fill(-1);
  try {
    for (const gate of gates) {
      gateMate[gate.firstCell] = gate.secondCell;
      gateMate[gate.secondCell] = gate.firstCell;
    }
    let boundaryEdgeCount = 0;
    let structurallyAlignedEdgeCount = 0;
    let anyNaturallyAlignedEdgeCount = 0;
    let barrierAlignedEdgeCount = 0;
    let hydrologyAlignedEdgeCount = 0;
    let watershedAlignedEdgeCount = 0;
    let ridgeAlignedEdgeCount = 0;
    let landformAlignedEdgeCount = 0;
    let ecologicalTransitionEdgeCount = 0;
    let reviewedGateEdgeCount = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor <= cell || input.regionId[cell] === input.regionId[neighbor]) continue;
        boundaryEdgeCount += 1;
        const gateAligned = gateMate[cell] === neighbor;
        const barrierAligned = input.barrier[cell] === 1
          || input.barrier[neighbor] === 1
          || input.geologicalBarrierBand[cell] !== 0
          || input.geologicalBarrierBand[neighbor] !== 0;
        const cellWaterRegime = input.waterRegime[cell]!;
        const neighborWaterRegime = input.waterRegime[neighbor]!;
        // A coastline or a change of water regime can support a political
        // boundary. Two adjacent cells inside the same water regime cannot:
        // otherwise an arbitrary line through one ocean would receive full
        // natural-boundary credit.
        const hydrologyAligned = cellWaterRegime !== neighborWaterRegime;
        const watershedAligned = input.watershedId[cell]! > 0
          && input.watershedId[neighbor]! > 0
          && input.watershedId[cell] !== input.watershedId[neighbor];
        const ridgeAligned = input.ridgeId[cell]! > 0 || input.ridgeId[neighbor]! > 0;
        const landformAligned = structurallyNaturalLandform(input.landformId[cell]!)
          || structurallyNaturalLandform(input.landformId[neighbor]!);
        const ecologicalTransition = input.biomeId[cell] !== input.biomeId[neighbor];
        const structurallyAligned = gateAligned
          || barrierAligned
          || hydrologyAligned
          || watershedAligned
          || ridgeAligned
          || landformAligned;
        if (gateAligned) reviewedGateEdgeCount += 1;
        if (barrierAligned) barrierAlignedEdgeCount += 1;
        if (hydrologyAligned) hydrologyAlignedEdgeCount += 1;
        if (watershedAligned) watershedAlignedEdgeCount += 1;
        if (ridgeAligned) ridgeAlignedEdgeCount += 1;
        if (landformAligned) landformAlignedEdgeCount += 1;
        if (ecologicalTransition) ecologicalTransitionEdgeCount += 1;
        if (structurallyAligned) structurallyAlignedEdgeCount += 1;
        if (structurallyAligned || ecologicalTransition) anyNaturallyAlignedEdgeCount += 1;
      }
    }
    if (boundaryEdgeCount === 0) fail('GREATER_REALM_AUDIT_REGION_BOUNDARY_EMPTY');
    const structuralAlignmentBasisPoints = roundedBasisPoints(
      structurallyAlignedEdgeCount,
      boundaryEdgeCount,
    );
    const anyNaturalAlignmentBasisPoints = roundedBasisPoints(
      anyNaturallyAlignedEdgeCount,
      boundaryEdgeCount,
    );
    return Object.freeze({
      boundaryEdgeCount,
      structurallyAlignedEdgeCount,
      anyNaturallyAlignedEdgeCount,
      unalignedEdgeCount: boundaryEdgeCount - anyNaturallyAlignedEdgeCount,
      barrierAlignedEdgeCount,
      hydrologyAlignedEdgeCount,
      watershedAlignedEdgeCount,
      ridgeAlignedEdgeCount,
      landformAlignedEdgeCount,
      ecologicalTransitionEdgeCount,
      reviewedGateEdgeCount,
      structuralAlignmentBasisPoints,
      anyNaturalAlignmentBasisPoints,
      proof: structuralAlignmentBasisPoints >= policy.minimumStructuralAlignmentBasisPoints
        && anyNaturalAlignmentBasisPoints >= policy.minimumAnyNaturalAlignmentBasisPoints,
    });
  } finally {
    gateMate.fill(0);
  }
}

export type GreaterRealmTierPotentialDensityRange = Readonly<{
  minimumBasisPoints: number;
  maximumBasisPoints: number;
}>;

export type GreaterRealmTierPotentialDensityPolicy = Readonly<{
  resource: Readonly<{
    tierI: GreaterRealmTierPotentialDensityRange;
    tierII: GreaterRealmTierPotentialDensityRange;
    tierIII: GreaterRealmTierPotentialDensityRange;
  }>;
  core: Readonly<{
    tierI: GreaterRealmTierPotentialDensityRange;
    tierII: GreaterRealmTierPotentialDensityRange;
    tierIII: GreaterRealmTierPotentialDensityRange;
  }>;
}>;

export const GREATER_REALM_TIER_POTENTIAL_DENSITY_POLICY = Object.freeze({
  resource: Object.freeze({
    tierI: Object.freeze({ minimumBasisPoints: 1_800, maximumBasisPoints: 2_200 }),
    tierII: Object.freeze({ minimumBasisPoints: 2_600, maximumBasisPoints: 3_000 }),
    tierIII: Object.freeze({ minimumBasisPoints: 3_700, maximumBasisPoints: 4_300 }),
  }),
  core: Object.freeze({
    tierI: Object.freeze({ minimumBasisPoints: 1_200, maximumBasisPoints: 1_600 }),
    tierII: Object.freeze({ minimumBasisPoints: 1_800, maximumBasisPoints: 2_200 }),
    tierIII: Object.freeze({ minimumBasisPoints: 2_500, maximumBasisPoints: 3_000 }),
  }),
}) satisfies GreaterRealmTierPotentialDensityPolicy;

export type GreaterRealmTierPotentialDensityInput = Readonly<{
  tierId: Uint8Array;
  waterRegime: Uint8Array;
  barrier: Uint8Array;
  castleSlot: Uint8Array;
  legacyProtectedCell: Uint8Array;
  resourcePotential: Uint8Array;
  corePotential: Uint8Array;
  policy?: GreaterRealmTierPotentialDensityPolicy;
}>;

export type GreaterRealmTierPotentialDensityMetrics = Readonly<{
  eligibleCellCount: Readonly<{ tierI: number; tierII: number; tierIII: number }>;
  resourceCellCount: Readonly<{ tierI: number; tierII: number; tierIII: number }>;
  coreCellCount: Readonly<{ tierI: number; tierII: number; tierIII: number }>;
  resourceBasisPoints: Readonly<{ tierI: number; tierII: number; tierIII: number }>;
  coreBasisPoints: Readonly<{ tierI: number; tierII: number; tierIII: number }>;
  invalidPotentialValueCount: number;
  ineligiblePotentialCellCount: number;
  resourceDensityProof: boolean;
  coreDensityProof: boolean;
  proof: boolean;
}>;

function assertDensityRange(
  range: GreaterRealmTierPotentialDensityRange,
  code: string,
): void {
  if (!range || typeof range !== 'object') fail(code);
  assertSafeIntegerInRange(range.minimumBasisPoints, 0, 10_000, code);
  assertSafeIntegerInRange(range.maximumBasisPoints, range.minimumBasisPoints, 10_000, code);
}

/** Measure potential density against the exact cells the generator may sample. */
export function measureGreaterRealmTierPotentialDensity(
  input: GreaterRealmTierPotentialDensityInput,
): GreaterRealmTierPotentialDensityMetrics {
  const cellCount = input.tierId.length;
  assertSafeIntegerInRange(
    cellCount,
    1,
    MAXIMUM_AUDIT_CELL_COUNT,
    'GREATER_REALM_AUDIT_DENSITY_SIZE_INVALID',
  );
  assertUint8Field(input.tierId, cellCount, 'GREATER_REALM_AUDIT_TIER_FIELD_INVALID');
  assertWaterField(input.waterRegime, cellCount);
  assertUint8Field(input.barrier, cellCount, 'GREATER_REALM_AUDIT_BARRIER_FIELD_INVALID');
  assertUint8Field(input.castleSlot, cellCount, 'GREATER_REALM_AUDIT_CASTLE_FIELD_INVALID');
  assertUint8Field(
    input.legacyProtectedCell,
    cellCount,
    'GREATER_REALM_AUDIT_LEGACY_FIELD_INVALID',
  );
  assertUint8Field(
    input.resourcePotential,
    cellCount,
    'GREATER_REALM_AUDIT_RESOURCE_POTENTIAL_FIELD_INVALID',
  );
  assertUint8Field(
    input.corePotential,
    cellCount,
    'GREATER_REALM_AUDIT_CORE_POTENTIAL_FIELD_INVALID',
  );
  assertBinaryField(input.barrier, 'GREATER_REALM_AUDIT_BARRIER_VALUE_INVALID');
  assertBinaryField(input.castleSlot, 'GREATER_REALM_AUDIT_CASTLE_VALUE_INVALID');
  assertBinaryField(input.legacyProtectedCell, 'GREATER_REALM_AUDIT_LEGACY_VALUE_INVALID');
  const policy = input.policy ?? GREATER_REALM_TIER_POTENTIAL_DENSITY_POLICY;
  for (const range of [
    policy.resource.tierI,
    policy.resource.tierII,
    policy.resource.tierIII,
    policy.core.tierI,
    policy.core.tierII,
    policy.core.tierIII,
  ]) assertDensityRange(range, 'GREATER_REALM_AUDIT_DENSITY_POLICY_INVALID');

  const eligible = new Int32Array(3);
  const resources = new Int32Array(3);
  const cores = new Int32Array(3);
  try {
    let invalidPotentialValueCount = 0;
    let ineligiblePotentialCellCount = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      const tier = input.tierId[cell]!;
      if (tier < 1 || tier > 3) fail('GREATER_REALM_AUDIT_TIER_VALUE_INVALID');
      const tierIndex = tier - 1;
      const isEligible = input.waterRegime[cell] === 0
        && input.barrier[cell] === 0
        && input.castleSlot[cell] === 0
        && input.legacyProtectedCell[cell] === 0;
      if (isEligible) eligible[tierIndex] += 1;
      const resource = input.resourcePotential[cell]!;
      const core = input.corePotential[cell]!;
      if (resource !== 0 && resource !== tier) invalidPotentialValueCount += 1;
      if (core !== 0 && core !== tier) invalidPotentialValueCount += 1;
      if ((resource !== 0 || core !== 0) && !isEligible) ineligiblePotentialCellCount += 1;
      if (resource === tier && isEligible) resources[tierIndex] += 1;
      if (core === tier && isEligible) cores[tierIndex] += 1;
    }
    if ([...eligible].some(count => count === 0)) {
      fail('GREATER_REALM_AUDIT_DENSITY_TIER_EMPTY');
    }
    const resourceBasisPoints = Object.freeze({
      tierI: roundedBasisPoints(resources[0]!, eligible[0]!),
      tierII: roundedBasisPoints(resources[1]!, eligible[1]!),
      tierIII: roundedBasisPoints(resources[2]!, eligible[2]!),
    });
    const coreBasisPoints = Object.freeze({
      tierI: roundedBasisPoints(cores[0]!, eligible[0]!),
      tierII: roundedBasisPoints(cores[1]!, eligible[1]!),
      tierIII: roundedBasisPoints(cores[2]!, eligible[2]!),
    });
    const resourceRanges = [policy.resource.tierI, policy.resource.tierII, policy.resource.tierIII];
    const coreRanges = [policy.core.tierI, policy.core.tierII, policy.core.tierIII];
    const resourceValues = [
      resourceBasisPoints.tierI,
      resourceBasisPoints.tierII,
      resourceBasisPoints.tierIII,
    ];
    const coreValues = [coreBasisPoints.tierI, coreBasisPoints.tierII, coreBasisPoints.tierIII];
    const resourceDensityProof = resourceValues.every((value, index) => (
      value >= resourceRanges[index]!.minimumBasisPoints
      && value <= resourceRanges[index]!.maximumBasisPoints
    ));
    const coreDensityProof = coreValues.every((value, index) => (
      value >= coreRanges[index]!.minimumBasisPoints
      && value <= coreRanges[index]!.maximumBasisPoints
    ));
    return Object.freeze({
      eligibleCellCount: Object.freeze({
        tierI: eligible[0]!,
        tierII: eligible[1]!,
        tierIII: eligible[2]!,
      }),
      resourceCellCount: Object.freeze({
        tierI: resources[0]!,
        tierII: resources[1]!,
        tierIII: resources[2]!,
      }),
      coreCellCount: Object.freeze({
        tierI: cores[0]!,
        tierII: cores[1]!,
        tierIII: cores[2]!,
      }),
      resourceBasisPoints,
      coreBasisPoints,
      invalidPotentialValueCount,
      ineligiblePotentialCellCount,
      resourceDensityProof,
      coreDensityProof,
      proof: resourceDensityProof
        && coreDensityProof
        && invalidPotentialValueCount === 0
        && ineligiblePotentialCellCount === 0,
    });
  } finally {
    eligible.fill(0);
    resources.fill(0);
    cores.fill(0);
  }
}

export type GreaterRealmCastleAuditPolicy = Readonly<{
  expectedTotalCastleSlots: number;
  expectedLegacyCastleSlots: number;
  expectedNewCastleSlots: number;
  expectedSlotsPerTierIRegion: number;
  minimumCastleSpacing: number;
  minimumGateClearance: number;
  minimumPassableNeighbors: number;
  maximumSlope: number;
  maximumWetnessIndex: number;
  minimumDistanceToFreshwater: number;
  minimumDistanceToCoast: number;
  minimumEcologicallySuitableNeighbors: number;
  minimumOccupiedDistributionSectors: number;
  maximumDistributionSectorShareBasisPoints: number;
}>;

export const GREATER_REALM_CASTLE_AUDIT_POLICY = Object.freeze({
  expectedTotalCastleSlots: 600,
  expectedLegacyCastleSlots: 100,
  expectedNewCastleSlots: 500,
  expectedSlotsPerTierIRegion: 100,
  minimumCastleSpacing: 5,
  minimumGateClearance: 3,
  minimumPassableNeighbors: 4,
  maximumSlope: 6_000,
  maximumWetnessIndex: 5_000,
  minimumDistanceToFreshwater: 2,
  minimumDistanceToCoast: 2,
  minimumEcologicallySuitableNeighbors: 4,
  minimumOccupiedDistributionSectors: 5,
  maximumDistributionSectorShareBasisPoints: 3_500,
}) satisfies GreaterRealmCastleAuditPolicy;

export type GreaterRealmCastleAuditInput = Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  tierId: Uint8Array;
  waterRegime: Uint8Array;
  barrier: Uint8Array;
  castleSlot: Uint8Array;
  legacyCastleSlot: Uint8Array;
  resourcePotential: Uint8Array;
  corePotential: Uint8Array;
  throneAnchor: Uint8Array;
  slope: Uint16Array;
  wetnessIndex: Uint16Array;
  distanceToFreshwater: Uint16Array;
  distanceToCoast: Uint16Array;
  landformId: Uint8Array;
  ecologyClass: Uint8Array;
  routeClass: Uint8Array;
  landmarkClass: Uint8Array;
  gates: readonly GreaterRealmAuditGate[];
  policy?: GreaterRealmCastleAuditPolicy;
}>;

export type GreaterRealmCastleAuditMetrics = Readonly<{
  totalCastleSlotCount: number;
  legacyCastleSlotCount: number;
  newCastleSlotCount: number;
  minimumRegionCastleSlotCount: number;
  maximumRegionCastleSlotCount: number;
  minimumMeasuredCastleSpacing: number;
  minimumOccupiedDistributionSectors: number;
  maximumDistributionSectorShareBasisPoints: number;
  fullyClearNewCastleFootprintCount: number;
  twoRouteAccessCastleCount: number;
  twoRouteAccessNewCastleCount: number;
  twoRouteAccessLegacyCastleCount: number;
  invalidTierOrRegionCount: number;
  waterOrBarrierConflictCount: number;
  gateClearanceViolationCount: number;
  slopeOrStabilityViolationCount: number;
  floodOrWaterClearanceViolationCount: number;
  reservedContentConflictCount: number;
  ecologyViolationCount: number;
  passableNeighborViolationCount: number;
  footprintViolationCount: number;
  spacingViolationPairCount: number;
  routeAccessViolationCount: number;
  legacyRouteAccessViolationCount: number;
  exactCapacityProof: boolean;
  suitabilityProof: boolean;
  fullFootprintProof: boolean;
  distributionProof: boolean;
  twoRouteAccessProof: boolean;
  proof: boolean;
}>;

function stableCastleLandform(landform: number): boolean {
  return (
    landform === GREATER_REALM_LANDFORM_ID.COASTAL_PLAIN
    || landform === GREATER_REALM_LANDFORM_ID.LOWLAND
    || landform === GREATER_REALM_LANDFORM_ID.ROLLING_LOWLAND
    || landform === GREATER_REALM_LANDFORM_ID.HILL
    || landform === GREATER_REALM_LANDFORM_ID.HIGHLAND
    || landform === GREATER_REALM_LANDFORM_ID.ALPINE_PLATEAU
  );
}

function assertCastlePolicy(policy: GreaterRealmCastleAuditPolicy): void {
  for (const [value, minimum, maximum] of [
    [policy.expectedTotalCastleSlots, 1, MAXIMUM_CASTLE_SLOT_COUNT],
    [policy.expectedLegacyCastleSlots, 0, MAXIMUM_CASTLE_SLOT_COUNT],
    [policy.expectedNewCastleSlots, 0, MAXIMUM_CASTLE_SLOT_COUNT],
    [policy.expectedSlotsPerTierIRegion, 1, MAXIMUM_CASTLE_SLOT_COUNT],
    [policy.minimumCastleSpacing, 1, 32],
    [policy.minimumGateClearance, 1, 32],
    [policy.minimumPassableNeighbors, 2, HEX_NEIGHBOR_COUNT],
    [policy.maximumSlope, 0, 0xffff],
    [policy.maximumWetnessIndex, 0, 0xffff],
    [policy.minimumDistanceToFreshwater, 0, 0xffff],
    [policy.minimumDistanceToCoast, 0, 0xffff],
    [policy.minimumEcologicallySuitableNeighbors, 1, HEX_NEIGHBOR_COUNT],
    [policy.minimumOccupiedDistributionSectors, 1, HEX_NEIGHBOR_COUNT],
    [policy.maximumDistributionSectorShareBasisPoints, 1, 10_000],
  ] as const) assertSafeIntegerInRange(value, minimum, maximum, 'GREATER_REALM_AUDIT_CASTLE_POLICY_INVALID');
  if (
    policy.expectedLegacyCastleSlots + policy.expectedNewCastleSlots
    !== policy.expectedTotalCastleSlots
    || policy.expectedSlotsPerTierIRegion * TIER_I_REGION_COUNT
      !== policy.expectedTotalCastleSlots
  ) fail('GREATER_REALM_AUDIT_CASTLE_POLICY_CAPACITY_INVALID');
}

function gateDistances(
  grid: IndexedAxialGrid,
  gates: readonly GreaterRealmAuditGate[],
  gateMask: Uint8Array,
  queue: Uint32Array,
): Uint16Array {
  const distance = new Uint16Array(grid.cellCount);
  distance.fill(UNREACHED_DISTANCE);
  let head = 0;
  let tail = 0;
  for (const gate of gates) {
    for (const cell of [gate.firstCell, gate.secondCell]) {
      gateMask[cell] = 1;
      if (distance[cell] !== UNREACHED_DISTANCE) continue;
      distance[cell] = 0;
      queue[tail++] = cell;
    }
  }
  while (head < tail) {
    const cell = queue[head++]!;
    const nextDistance = distance[cell]! + 1;
    if (nextDistance >= UNREACHED_DISTANCE) fail('GREATER_REALM_AUDIT_GATE_DISTANCE_OVERFLOW');
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || distance[neighbor]! <= nextDistance) continue;
      distance[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    }
  }
  return distance;
}

function isMajorRoute(routeClass: number): boolean {
  return routeClass === GREATER_REALM_ROUTE_CLASS.ROAD
    || routeClass === GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY;
}

function buildMajorRouteComponents(
  input: GreaterRealmCastleAuditInput,
  majorRoute: Uint8Array,
  componentId: Int32Array,
  queue: Uint32Array,
): number {
  const { grid } = input;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      input.regionId[cell]! < TIER_I_REGION_COUNT
      && input.waterRegime[cell] === 0
      && input.barrier[cell] === 0
      && isMajorRoute(input.routeClass[cell]!)
    ) majorRoute[cell] = 1;
  }

  componentId.fill(-1);
  let componentCount = 0;
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (majorRoute[start] !== 1 || componentId[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    componentId[start] = componentCount;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || majorRoute[neighbor] !== 1
          || input.regionId[neighbor] !== input.regionId[cell]
          || componentId[neighbor] !== -1
        ) continue;
        componentId[neighbor] = componentCount;
        queue[tail++] = neighbor;
      }
    }
    componentCount += 1;
  }
  return componentCount;
}

/**
 * Audit every candidate castle without returning a slot or coordinate. A
 * new castle must have two distinct legal perimeter entries into one connected
 * major-route component. This is exactly the bridge test for adding a virtual
 * castle node: each virtual castle-entry edge lies on the cycle through the
 * other entry, so neither edge is a bridge. Remote routes separated by ordinary
 * passable terrain cannot certify the castle.
 */
export function measureGreaterRealmCastleSuitability(
  input: GreaterRealmCastleAuditInput,
): GreaterRealmCastleAuditMetrics {
  assertGrid(input.grid);
  const cellCount = input.grid.cellCount;
  assertRegionAndTierFields(input.regionId, input.tierId, cellCount);
  assertWaterField(input.waterRegime, cellCount);
  for (const [field, code] of [
    [input.barrier, 'GREATER_REALM_AUDIT_BARRIER_FIELD_INVALID'],
    [input.castleSlot, 'GREATER_REALM_AUDIT_CASTLE_FIELD_INVALID'],
    [input.legacyCastleSlot, 'GREATER_REALM_AUDIT_LEGACY_CASTLE_FIELD_INVALID'],
    [input.resourcePotential, 'GREATER_REALM_AUDIT_RESOURCE_POTENTIAL_FIELD_INVALID'],
    [input.corePotential, 'GREATER_REALM_AUDIT_CORE_POTENTIAL_FIELD_INVALID'],
    [input.throneAnchor, 'GREATER_REALM_AUDIT_THRONE_FIELD_INVALID'],
    [input.landformId, 'GREATER_REALM_AUDIT_LANDFORM_FIELD_INVALID'],
    [input.ecologyClass, 'GREATER_REALM_AUDIT_ECOLOGY_FIELD_INVALID'],
    [input.routeClass, 'GREATER_REALM_AUDIT_ROUTE_FIELD_INVALID'],
    [input.landmarkClass, 'GREATER_REALM_AUDIT_LANDMARK_FIELD_INVALID'],
  ] as const) assertUint8Field(field, cellCount, code);
  for (const [field, code] of [
    [input.slope, 'GREATER_REALM_AUDIT_SLOPE_FIELD_INVALID'],
    [input.wetnessIndex, 'GREATER_REALM_AUDIT_WETNESS_FIELD_INVALID'],
    [input.distanceToFreshwater, 'GREATER_REALM_AUDIT_FRESHWATER_DISTANCE_FIELD_INVALID'],
    [input.distanceToCoast, 'GREATER_REALM_AUDIT_COAST_DISTANCE_FIELD_INVALID'],
  ] as const) assertUint16Field(field, cellCount, code);
  assertBinaryField(input.barrier, 'GREATER_REALM_AUDIT_BARRIER_VALUE_INVALID');
  assertBinaryField(input.castleSlot, 'GREATER_REALM_AUDIT_CASTLE_VALUE_INVALID');
  assertBinaryField(input.legacyCastleSlot, 'GREATER_REALM_AUDIT_LEGACY_CASTLE_VALUE_INVALID');
  assertBinaryField(input.throneAnchor, 'GREATER_REALM_AUDIT_THRONE_VALUE_INVALID');
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (input.legacyCastleSlot[cell] === 1 && input.castleSlot[cell] !== 1) {
      fail('GREATER_REALM_AUDIT_LEGACY_CASTLE_NOT_SUBSET');
    }
    if (input.landformId[cell]! >= GREATER_REALM_LANDFORM_CLASS_COUNT) {
      fail('GREATER_REALM_AUDIT_LANDFORM_VALUE_INVALID');
    }
    if (input.ecologyClass[cell]! > GREATER_REALM_ECOLOGY_CLASS.SNOW) {
      fail('GREATER_REALM_AUDIT_ECOLOGY_VALUE_INVALID');
    }
    if (input.routeClass[cell]! > GREATER_REALM_ROUTE_CLASS.FORD) {
      fail('GREATER_REALM_AUDIT_ROUTE_VALUE_INVALID');
    }
    if (input.landmarkClass[cell]! > GREATER_REALM_LANDMARK_CLASS.LAMP_POST) {
      fail('GREATER_REALM_AUDIT_LANDMARK_VALUE_INVALID');
    }
  }
  if (input.gates.length === 0) fail('GREATER_REALM_AUDIT_GATE_LIST_EMPTY');
  assertGateList(input.grid, input.regionId, input.gates);
  const policy = input.policy ?? GREATER_REALM_CASTLE_AUDIT_POLICY;
  assertCastlePolicy(policy);

  const gateMask = new Uint8Array(cellCount);
  const gateQueue = new Uint32Array(cellCount);
  let gateDistance: Uint16Array | undefined;
  const majorRoute = new Uint8Array(cellCount);
  const componentId = new Int32Array(cellCount);
  const routeQueue = new Uint32Array(cellCount);
  const regionCastleCounts = new Int32Array(TIER_I_REGION_COUNT);
  const distributionSectorByCell =
    deriveGreaterRealmSupportNormalizedAngularSectors({
      grid: input.grid,
      regionId: input.regionId,
      waterRegime: input.waterRegime,
      barrier: input.barrier,
      regionCount: TIER_I_REGION_COUNT,
    });
  const sectorCounts = new Int32Array(TIER_I_REGION_COUNT * HEX_NEIGHBOR_COUNT);
  const castleCells = new Int32Array(policy.expectedTotalCastleSlots);
  castleCells.fill(-1);
  try {
    gateDistance = gateDistances(input.grid, input.gates, gateMask, gateQueue);
    buildMajorRouteComponents(
      input,
      majorRoute,
      componentId,
      routeQueue,
    );
    let totalCastleSlotCount = 0;
    let legacyCastleSlotCount = 0;
    let newCastleSlotCount = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      const region = input.regionId[cell]!;
      if (input.castleSlot[cell] !== 1) continue;
      if (totalCastleSlotCount >= castleCells.length) {
        fail('GREATER_REALM_AUDIT_CASTLE_COUNT_BOUND_EXCEEDED');
      }
      castleCells[totalCastleSlotCount] = cell;
      totalCastleSlotCount += 1;
      if (input.legacyCastleSlot[cell] === 1) legacyCastleSlotCount += 1;
      else newCastleSlotCount += 1;
      if (region < TIER_I_REGION_COUNT) regionCastleCounts[region] += 1;
    }

    let invalidTierOrRegionCount = 0;
    let waterOrBarrierConflictCount = 0;
    let gateClearanceViolationCount = 0;
    let slopeOrStabilityViolationCount = 0;
    let floodOrWaterClearanceViolationCount = 0;
    let reservedContentConflictCount = 0;
    let ecologyViolationCount = 0;
    let passableNeighborViolationCount = 0;
    let footprintViolationCount = 0;
    let fullyClearNewCastleFootprintCount = 0;
    let twoRouteAccessCastleCount = 0;
    let twoRouteAccessNewCastleCount = 0;
    let twoRouteAccessLegacyCastleCount = 0;
    let routeAccessViolationCount = 0;
    let legacyRouteAccessViolationCount = 0;
    for (let ordinal = 0; ordinal < totalCastleSlotCount; ordinal += 1) {
      const cell = castleCells[ordinal]!;
      const region = input.regionId[cell]!;
      const isLegacy = input.legacyCastleSlot[cell] === 1;
      if (region >= TIER_I_REGION_COUNT || input.tierId[cell] !== 1) {
        invalidTierOrRegionCount += 1;
      }
      if (input.waterRegime[cell] !== 0 || input.barrier[cell] !== 0) {
        waterOrBarrierConflictCount += 1;
      }
      if (gateDistance[cell]! < policy.minimumGateClearance) {
        gateClearanceViolationCount += 1;
      }
      // The locked Lowlands catalogue is immutable deployment authority and is
      // verified by its own patch lock. Terrain/ecology suitability is the
      // admission gate for the 500 newly generated dormant-region sites only;
      // legacy slots still remain subject to count, subset, tier, water,
      // barrier, gate, reservation, passability, and cross-catalogue spacing.
      if (!isLegacy && (
        input.slope[cell]! > policy.maximumSlope
        || !stableCastleLandform(input.landformId[cell]!)
      )) slopeOrStabilityViolationCount += 1;
      if (!isLegacy && (
        input.wetnessIndex[cell]! > policy.maximumWetnessIndex
        || input.distanceToFreshwater[cell]! < policy.minimumDistanceToFreshwater
        || input.distanceToCoast[cell]! < policy.minimumDistanceToCoast
      )) floodOrWaterClearanceViolationCount += 1;
      if (
        input.resourcePotential[cell] !== 0
        || input.corePotential[cell] !== 0
        || input.throneAnchor[cell] !== 0
        || gateMask[cell] !== 0
        || input.landmarkClass[cell] !== GREATER_REALM_LANDMARK_CLASS.NONE
      ) reservedContentConflictCount += 1;
      let passableNeighbors = 0;
      let ecologicallySuitableNeighbors = 0;
      let footprintClear = true;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        const passableNeighbor = neighbor >= 0
          && input.regionId[neighbor] === region
          && input.waterRegime[neighbor] === 0
          && input.barrier[neighbor] === 0;
        if (passableNeighbor) passableNeighbors += 1;
        if (
          passableNeighbor
          && input.ecologyClass[neighbor] !== GREATER_REALM_ECOLOGY_CLASS.NONE
        ) ecologicallySuitableNeighbors += 1;
        if (
          !passableNeighbor
          || input.castleSlot[neighbor] !== 0
          || input.resourcePotential[neighbor] !== 0
          || input.corePotential[neighbor] !== 0
          || input.throneAnchor[neighbor] !== 0
          || gateMask[neighbor] !== 0
          || input.landmarkClass[neighbor] !== GREATER_REALM_LANDMARK_CLASS.NONE
        ) footprintClear = false;
      }
      if (passableNeighbors < policy.minimumPassableNeighbors) {
        passableNeighborViolationCount += 1;
      }
      if (
        !isLegacy
        && ecologicallySuitableNeighbors < policy.minimumEcologicallySuitableNeighbors
      ) {
        ecologyViolationCount += 1;
      }
      if (!isLegacy) {
        if (footprintClear) fullyClearNewCastleFootprintCount += 1;
        else footprintViolationCount += 1;
      }

      let twoRouteAccess = false;
      for (
        let firstDirection = 0;
        firstDirection < HEX_NEIGHBOR_COUNT && !twoRouteAccess;
        firstDirection += 1
      ) {
        const firstEntry = input.grid.neighbors[
          cell * HEX_NEIGHBOR_COUNT + firstDirection
        ]!;
        if (
          firstEntry < 0
          || input.regionId[firstEntry] !== region
          || input.waterRegime[firstEntry] !== 0
          || input.barrier[firstEntry] !== 0
          || !isMajorRoute(input.routeClass[firstEntry]!)
        ) continue;
        const routeComponent = componentId[firstEntry]!;
        if (routeComponent < 0) continue;
        for (
          let secondDirection = firstDirection + 1;
          secondDirection < HEX_NEIGHBOR_COUNT;
          secondDirection += 1
        ) {
          const secondEntry = input.grid.neighbors[
            cell * HEX_NEIGHBOR_COUNT + secondDirection
          ]!;
          if (
            secondEntry >= 0
            && input.regionId[secondEntry] === region
            && input.waterRegime[secondEntry] === 0
            && input.barrier[secondEntry] === 0
            && isMajorRoute(input.routeClass[secondEntry]!)
            && componentId[secondEntry] === routeComponent
          ) {
            twoRouteAccess = true;
            break;
          }
        }
      }
      if (twoRouteAccess) {
        twoRouteAccessCastleCount += 1;
        if (isLegacy) twoRouteAccessLegacyCastleCount += 1;
        else twoRouteAccessNewCastleCount += 1;
      } else if (isLegacy) legacyRouteAccessViolationCount += 1;
      else routeAccessViolationCount += 1;
    }

    let spacingViolationPairCount = 0;
    let minimumMeasuredCastleSpacing = Number.POSITIVE_INFINITY;
    for (let first = 0; first < totalCastleSlotCount; first += 1) {
      const firstCell = castleCells[first]!;
      for (let second = first + 1; second < totalCastleSlotCount; second += 1) {
        const secondCell = castleCells[second]!;
        const distance = axialDistance(
          input.grid.q[firstCell]!,
          input.grid.r[firstCell]!,
          input.grid.q[secondCell]!,
          input.grid.r[secondCell]!,
        );
        if (
          input.legacyCastleSlot[firstCell] === 1
          && input.legacyCastleSlot[secondCell] === 1
        ) continue;
        minimumMeasuredCastleSpacing = Math.min(minimumMeasuredCastleSpacing, distance);
        if (distance < policy.minimumCastleSpacing) spacingViolationPairCount += 1;
      }
    }
    if (!Number.isFinite(minimumMeasuredCastleSpacing)) minimumMeasuredCastleSpacing = 0;

    for (let ordinal = 0; ordinal < totalCastleSlotCount; ordinal += 1) {
      const cell = castleCells[ordinal]!;
      if (input.legacyCastleSlot[cell] === 1) continue;
      const region = input.regionId[cell]!;
      if (region <= 0 || region >= TIER_I_REGION_COUNT) continue;
      const selectedSector = distributionSectorByCell[cell]!;
      if (selectedSector >= HEX_NEIGHBOR_COUNT) continue;
      sectorCounts[region * HEX_NEIGHBOR_COUNT + selectedSector] += 1;
    }
    let minimumOccupiedDistributionSectors = HEX_NEIGHBOR_COUNT;
    let maximumDistributionSectorShareBasisPoints = 0;
    for (let region = 1; region < TIER_I_REGION_COUNT; region += 1) {
      let occupied = 0;
      let maximum = 0;
      let total = 0;
      for (let sector = 0; sector < HEX_NEIGHBOR_COUNT; sector += 1) {
        const count = sectorCounts[region * HEX_NEIGHBOR_COUNT + sector]!;
        if (count > 0) occupied += 1;
        maximum = Math.max(maximum, count);
        total += count;
      }
      minimumOccupiedDistributionSectors = Math.min(
        minimumOccupiedDistributionSectors,
        occupied,
      );
      if (total > 0) {
        maximumDistributionSectorShareBasisPoints = Math.max(
          maximumDistributionSectorShareBasisPoints,
          roundedBasisPoints(maximum, total),
        );
      }
    }

    let minimumRegionCastleSlotCount = Number.POSITIVE_INFINITY;
    let maximumRegionCastleSlotCount = 0;
    let everyRegionHasExpectedCapacity = true;
    for (const count of regionCastleCounts) {
      minimumRegionCastleSlotCount = Math.min(minimumRegionCastleSlotCount, count);
      maximumRegionCastleSlotCount = Math.max(maximumRegionCastleSlotCount, count);
      if (count !== policy.expectedSlotsPerTierIRegion) {
        everyRegionHasExpectedCapacity = false;
      }
    }
    const exactCapacityProof = totalCastleSlotCount === policy.expectedTotalCastleSlots
      && legacyCastleSlotCount === policy.expectedLegacyCastleSlots
      && newCastleSlotCount === policy.expectedNewCastleSlots
      && everyRegionHasExpectedCapacity;
    const suitabilityProof = invalidTierOrRegionCount === 0
      && waterOrBarrierConflictCount === 0
      && gateClearanceViolationCount === 0
      && slopeOrStabilityViolationCount === 0
      && floodOrWaterClearanceViolationCount === 0
      && reservedContentConflictCount === 0
      && ecologyViolationCount === 0
      && passableNeighborViolationCount === 0
      && spacingViolationPairCount === 0;
    const fullFootprintProof = fullyClearNewCastleFootprintCount === newCastleSlotCount
      && footprintViolationCount === 0;
    const distributionProof = minimumOccupiedDistributionSectors
        >= policy.minimumOccupiedDistributionSectors
      && maximumDistributionSectorShareBasisPoints
        <= policy.maximumDistributionSectorShareBasisPoints;
    // PR A generates only the five dormant-region catalogues. The deployed
    // Lowlands route catalogue remains immutable and is verified by PR C's
    // legacy bridge rather than inferred from PR-A dressing fields.
    const twoRouteAccessProof = twoRouteAccessNewCastleCount === newCastleSlotCount
      && routeAccessViolationCount === 0;
    return Object.freeze({
      totalCastleSlotCount,
      legacyCastleSlotCount,
      newCastleSlotCount,
      minimumRegionCastleSlotCount,
      maximumRegionCastleSlotCount,
      minimumMeasuredCastleSpacing,
      minimumOccupiedDistributionSectors,
      maximumDistributionSectorShareBasisPoints,
      fullyClearNewCastleFootprintCount,
      twoRouteAccessCastleCount,
      twoRouteAccessNewCastleCount,
      twoRouteAccessLegacyCastleCount,
      invalidTierOrRegionCount,
      waterOrBarrierConflictCount,
      gateClearanceViolationCount,
      slopeOrStabilityViolationCount,
      floodOrWaterClearanceViolationCount,
      reservedContentConflictCount,
      ecologyViolationCount,
      passableNeighborViolationCount,
      footprintViolationCount,
      spacingViolationPairCount,
      routeAccessViolationCount,
      legacyRouteAccessViolationCount,
      exactCapacityProof,
      suitabilityProof,
      fullFootprintProof,
      distributionProof,
      twoRouteAccessProof,
      proof: exactCapacityProof
        && suitabilityProof
        && fullFootprintProof
        && distributionProof
        && twoRouteAccessProof,
    });
  } finally {
    gateMask.fill(0);
    gateQueue.fill(0);
    gateDistance?.fill(0);
    majorRoute.fill(0);
    componentId.fill(0);
    routeQueue.fill(0);
    regionCastleCounts.fill(0);
    distributionSectorByCell.fill(0);
    sectorCounts.fill(0);
    castleCells.fill(0);
  }
}

export type GreaterRealmInnerGateThronePolicy = Readonly<{
  expectedInnerGateCount: number;
  requiredIndependentRouteCount: 2;
}>;

export const GREATER_REALM_INNER_GATE_THRONE_POLICY = Object.freeze({
  expectedInnerGateCount: 6,
  requiredIndependentRouteCount: 2,
}) satisfies GreaterRealmInnerGateThronePolicy;

export type GreaterRealmInnerGateThroneInput = Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  waterRegime: Uint8Array;
  barrier: Uint8Array;
  throneAnchor: Uint8Array;
  gates: readonly GreaterRealmAuditGate[];
  policy?: GreaterRealmInnerGateThronePolicy;
}>;

export type GreaterRealmInnerGateThroneMetrics = Readonly<{
  innerGateCount: number;
  validApproachPairCount: number;
  gateWithTwoIndependentRoutesCount: number;
  minimumIndependentRouteCount: number;
  throneAnchorCount: number;
  proof: boolean;
}>;

function validateApproachPath(
  input: GreaterRealmInnerGateThroneInput,
  endpoint: number,
  region: number,
  path: readonly number[],
): boolean {
  if (path.length === 0 || path.length > input.grid.cellCount) return false;
  const seen = new Uint8Array(input.grid.cellCount);
  try {
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index]!;
      if (
        !Number.isSafeInteger(cell)
        || cell < 0
        || cell >= input.grid.cellCount
        || seen[cell] === 1
        || input.regionId[cell] !== region
        || !strategicallyPassableSurface(input.waterRegime[cell]!)
        || input.barrier[cell] !== 0
      ) return false;
      seen[cell] = 1;
      const previous = index === 0 ? endpoint : path[index - 1]!;
      let adjacent = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (
          input.grid.neighbors[previous * HEX_NEIGHBOR_COUNT + direction] === cell
        ) adjacent = true;
      }
      if (!adjacent) return false;
    }
    return true;
  } finally {
    seen.fill(0);
  }
}

function maximumTwoVertexDisjointRoutes(
  grid: IndexedAxialGrid,
  passableLocalIndex: Int32Array,
  passableCells: Int32Array,
  passableCount: number,
  directedAdjacencyCount: number,
  approachCells: readonly [number, number],
  throneCell: number,
): number {
  const nodeCount = passableCount * 2 + 1;
  const source = nodeCount - 1;
  const throneLocal = passableLocalIndex[throneCell]!;
  if (throneLocal < 0) return 0;
  const sink = throneLocal * 2 + 1;
  const edgeCapacity = 2 * (passableCount + directedAdjacencyCount + approachCells.length);
  const head = new Int32Array(nodeCount);
  const to = new Int32Array(edgeCapacity);
  const next = new Int32Array(edgeCapacity);
  const capacity = new Uint8Array(edgeCapacity);
  const parentEdge = new Int32Array(nodeCount);
  const queue = new Uint32Array(nodeCount);
  head.fill(-1);
  let edgeCount = 0;
  const addEdge = (from: number, destination: number, edgeCapacityValue: number): void => {
    if (edgeCount + 2 > edgeCapacity) fail('GREATER_REALM_AUDIT_THRONE_FLOW_EDGE_OVERFLOW');
    to[edgeCount] = destination;
    capacity[edgeCount] = edgeCapacityValue;
    next[edgeCount] = head[from]!;
    head[from] = edgeCount;
    edgeCount += 1;
    to[edgeCount] = from;
    capacity[edgeCount] = 0;
    next[edgeCount] = head[destination]!;
    head[destination] = edgeCount;
    edgeCount += 1;
  };
  try {
    for (let local = 0; local < passableCount; local += 1) {
      const cell = passableCells[local]!;
      addEdge(local * 2, local * 2 + 1, cell === throneCell ? 2 : 1);
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0) continue;
        const neighborLocal = passableLocalIndex[neighbor]!;
        if (neighborLocal >= 0) addEdge(local * 2 + 1, neighborLocal * 2, 2);
      }
    }
    for (const approachCell of approachCells) {
      const local = passableLocalIndex[approachCell]!;
      if (local < 0) return 0;
      addEdge(source, local * 2, 1);
    }
    let flow = 0;
    while (flow < 2) {
      parentEdge.fill(-1);
      let headIndex = 0;
      let tailIndex = 0;
      queue[tailIndex++] = source;
      parentEdge[source] = -2;
      while (headIndex < tailIndex && parentEdge[sink] === -1) {
        const node = queue[headIndex++]!;
        for (let edge = head[node]!; edge >= 0; edge = next[edge]!) {
          if (capacity[edge] === 0) continue;
          const destination = to[edge]!;
          if (parentEdge[destination] !== -1) continue;
          parentEdge[destination] = edge;
          queue[tailIndex++] = destination;
          if (destination === sink) break;
        }
      }
      if (parentEdge[sink] === -1) break;
      let node = sink;
      while (node !== source) {
        const edge = parentEdge[node]!;
        capacity[edge] -= 1;
        capacity[edge ^ 1] += 1;
        node = to[edge ^ 1]!;
      }
      flow += 1;
    }
    return flow;
  } finally {
    head.fill(0);
    to.fill(0);
    next.fill(0);
    capacity.fill(0);
    parentEdge.fill(0);
    queue.fill(0);
  }
}

/**
 * Prove two internally vertex-disjoint paths from each reviewed Tier-III gate
 * mouth to the one dormant throne. The flow is capped at two, so six production
 * inner gates remain a strict O(N + E) audit with a small fixed multiplier.
 */
export function measureGreaterRealmInnerGateThroneRedundancy(
  input: GreaterRealmInnerGateThroneInput,
): GreaterRealmInnerGateThroneMetrics {
  assertGrid(input.grid);
  const cellCount = input.grid.cellCount;
  assertRegionAndTierFields(input.regionId, undefined, cellCount);
  assertWaterField(input.waterRegime, cellCount);
  assertUint8Field(input.barrier, cellCount, 'GREATER_REALM_AUDIT_BARRIER_FIELD_INVALID');
  assertUint8Field(input.throneAnchor, cellCount, 'GREATER_REALM_AUDIT_THRONE_FIELD_INVALID');
  assertBinaryField(input.barrier, 'GREATER_REALM_AUDIT_BARRIER_VALUE_INVALID');
  assertBinaryField(input.throneAnchor, 'GREATER_REALM_AUDIT_THRONE_VALUE_INVALID');
  assertGateList(input.grid, input.regionId, input.gates);
  const policy = input.policy ?? GREATER_REALM_INNER_GATE_THRONE_POLICY;
  assertSafeIntegerInRange(
    policy.expectedInnerGateCount,
    1,
    6,
    'GREATER_REALM_AUDIT_THRONE_POLICY_INVALID',
  );
  if (policy.requiredIndependentRouteCount !== 2) {
    fail('GREATER_REALM_AUDIT_THRONE_POLICY_INVALID');
  }

  let throneCell = -1;
  let throneAnchorCount = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (input.throneAnchor[cell] !== 1) continue;
    throneAnchorCount += 1;
    throneCell = cell;
  }
  const innerGates: GreaterRealmAuditGate[] = [];
  for (const gate of input.gates) {
    if (
      gate.firstRegion === TIER_III_REGION_INDEX
      || gate.secondRegion === TIER_III_REGION_INDEX
    ) innerGates.push(gate);
  }
  const passableLocalIndex = new Int32Array(cellCount);
  passableLocalIndex.fill(-1);
  const passableCells = new Int32Array(cellCount);
  passableCells.fill(-1);
  try {
    let passableCount = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      if (
        input.regionId[cell] !== TIER_III_REGION_INDEX
        || !strategicallyPassableSurface(input.waterRegime[cell]!)
        || input.barrier[cell] !== 0
      ) continue;
      passableLocalIndex[cell] = passableCount;
      passableCells[passableCount] = cell;
      passableCount += 1;
    }
    let directedAdjacencyCount = 0;
    for (let local = 0; local < passableCount; local += 1) {
      const cell = passableCells[local]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor >= 0 && passableLocalIndex[neighbor]! >= 0) directedAdjacencyCount += 1;
      }
    }
    let validApproachPairCount = 0;
    let gateWithTwoIndependentRoutesCount = 0;
    let minimumIndependentRouteCount = 2;
    for (const gate of innerGates) {
      const tierThreeIsFirst = gate.firstRegion === TIER_III_REGION_INDEX;
      const endpoint = tierThreeIsFirst ? gate.firstCell : gate.secondCell;
      const primary = tierThreeIsFirst ? gate.firstApproachPath : gate.secondApproachPath;
      const alternate = tierThreeIsFirst
        ? gate.firstAlternateApproachPath
        : gate.secondAlternateApproachPath;
      const approachesValid = validateApproachPath(
        input,
        endpoint,
        TIER_III_REGION_INDEX,
        primary,
      ) && validateApproachPath(
        input,
        endpoint,
        TIER_III_REGION_INDEX,
        alternate,
      ) && primary[0] !== alternate[0];
      let routes = 0;
      if (approachesValid && throneAnchorCount === 1) {
        validApproachPairCount += 1;
        routes = maximumTwoVertexDisjointRoutes(
          input.grid,
          passableLocalIndex,
          passableCells,
          passableCount,
          directedAdjacencyCount,
          [primary[0]!, alternate[0]!],
          throneCell,
        );
      }
      minimumIndependentRouteCount = Math.min(minimumIndependentRouteCount, routes);
      if (routes >= policy.requiredIndependentRouteCount) {
        gateWithTwoIndependentRoutesCount += 1;
      }
    }
    if (innerGates.length === 0) minimumIndependentRouteCount = 0;
    return Object.freeze({
      innerGateCount: innerGates.length,
      validApproachPairCount,
      gateWithTwoIndependentRoutesCount,
      minimumIndependentRouteCount,
      throneAnchorCount,
      proof: innerGates.length === policy.expectedInnerGateCount
        && throneAnchorCount === 1
        && validApproachPairCount === innerGates.length
        && gateWithTwoIndependentRoutesCount === innerGates.length
        && minimumIndependentRouteCount >= policy.requiredIndependentRouteCount,
    });
  } finally {
    passableLocalIndex.fill(0);
    passableCells.fill(0);
    innerGates.length = 0;
  }
}
