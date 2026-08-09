import { type IndexedAxialGrid } from './greater-realm-terrain';

export const GREATER_REALM_RELIEF_STRUCTURE_VERSION =
  'greater-realm-final-relief-structure-v1' as const;

export const GREATER_REALM_RELIEF_STRUCTURE_LAGS = Object.freeze([
  1, 4, 12,
] as const);

const BASIS_POINTS = 10_000;
const HEX_NEIGHBOR_COUNT = 6;
const UNDIRECTED_AXIS_COUNT = 3;
const SAFE_INTEGER_MAX_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export type GreaterRealmReliefAxisTriple = readonly [number, number, number];
export type GreaterRealmReliefLagMatrix = readonly [
  GreaterRealmReliefAxisTriple,
  GreaterRealmReliefAxisTriple,
  GreaterRealmReliefAxisTriple,
];

export type GreaterRealmReliefStructureThresholds = Readonly<{
  minimumPairCoverageBasisPointsByLag: GreaterRealmReliefAxisTriple;
  minimumScaleGrowthBasisPoints: readonly [number, number];
  maximumScaleGrowthBasisPoints: readonly [number, number];
  maximumAxialAnisotropyBasisPointsByLag: GreaterRealmReliefAxisTriple;
}>;

/**
 * Calibrated against the pinned eligible candidate and an independent
 * secondary replay. The margins reject grid stripes and scale-collapsed noise
 * without requiring a particular mountain orientation or exact spectrum.
 */
export const GREATER_REALM_RELIEF_STRUCTURE_THRESHOLDS = Object.freeze({
  minimumPairCoverageBasisPointsByLag: Object.freeze([
    8_500, 6_500, 3_000,
  ] as const),
  minimumScaleGrowthBasisPoints: Object.freeze([30_000, 15_000] as const),
  maximumScaleGrowthBasisPoints: Object.freeze([155_000, 85_000] as const),
  maximumAxialAnisotropyBasisPointsByLag: Object.freeze([
    17_500, 17_500, 17_500,
  ] as const),
}) satisfies GreaterRealmReliefStructureThresholds;

export type GreaterRealmReliefStructureMetrics = Readonly<{
  version: typeof GREATER_REALM_RELIEF_STRUCTURE_VERSION;
  eligibleCellCount: number;
  /** Axis order is the first three canonical hex directions (one per axis). */
  pairCountsByLagAndAxis: GreaterRealmReliefLagMatrix;
  pairCoverageBasisPointsByLagAndAxis: GreaterRealmReliefLagMatrix;
  meanSquaredDifferenceByLagAndAxis: GreaterRealmReliefLagMatrix;
  /** Per-axis growth from lag 1 to lag 4. */
  lagOneToFourGrowthBasisPointsByAxis: GreaterRealmReliefAxisTriple;
  /** Per-axis growth from lag 4 to lag 12. */
  lagFourToTwelveGrowthBasisPointsByAxis: GreaterRealmReliefAxisTriple;
  /** Maximum S2 divided by minimum S2 across the three axes, per lag. */
  axialAnisotropyBasisPointsByLag: GreaterRealmReliefAxisTriple;
  pairCoverageProof: boolean;
  scaleGrowthProof: boolean;
  axialAnisotropyProof: boolean;
  proof: boolean;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function assertSafeNonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('GREATER_REALM_RELIEF_STRUCTURE_THRESHOLD_INVALID');
  }
}

function validateThresholds(
  thresholds: GreaterRealmReliefStructureThresholds,
): void {
  const coverage = thresholds.minimumPairCoverageBasisPointsByLag;
  const minimumGrowth = thresholds.minimumScaleGrowthBasisPoints;
  const maximumGrowth = thresholds.maximumScaleGrowthBasisPoints;
  const anisotropy = thresholds.maximumAxialAnisotropyBasisPointsByLag;
  if (
    coverage.length !== GREATER_REALM_RELIEF_STRUCTURE_LAGS.length ||
    minimumGrowth.length !== GREATER_REALM_RELIEF_STRUCTURE_LAGS.length - 1 ||
    maximumGrowth.length !== GREATER_REALM_RELIEF_STRUCTURE_LAGS.length - 1 ||
    anisotropy.length !== GREATER_REALM_RELIEF_STRUCTURE_LAGS.length
  )
    fail('GREATER_REALM_RELIEF_STRUCTURE_THRESHOLD_INVALID');
  for (const value of coverage) {
    assertSafeNonnegativeInteger(value);
    if (value > BASIS_POINTS) {
      fail('GREATER_REALM_RELIEF_STRUCTURE_THRESHOLD_INVALID');
    }
  }
  for (let scale = 0; scale < minimumGrowth.length; scale += 1) {
    assertSafeNonnegativeInteger(minimumGrowth[scale]!);
    assertSafeNonnegativeInteger(maximumGrowth[scale]!);
    if (
      minimumGrowth[scale]! < BASIS_POINTS ||
      minimumGrowth[scale]! > maximumGrowth[scale]!
    )
      fail('GREATER_REALM_RELIEF_STRUCTURE_THRESHOLD_INVALID');
  }
  for (const value of anisotropy) {
    assertSafeNonnegativeInteger(value);
    if (value < BASIS_POINTS) {
      fail('GREATER_REALM_RELIEF_STRUCTURE_THRESHOLD_INVALID');
    }
  }
}

function frozenTriple(values: readonly number[]): GreaterRealmReliefAxisTriple {
  if (values.length !== UNDIRECTED_AXIS_COUNT) {
    fail('GREATER_REALM_RELIEF_STRUCTURE_INTERNAL_SHAPE_INVALID');
  }
  return Object.freeze([values[0]!, values[1]!, values[2]!] as const);
}

function frozenMatrix(
  values: readonly (readonly number[])[],
): GreaterRealmReliefLagMatrix {
  if (values.length !== GREATER_REALM_RELIEF_STRUCTURE_LAGS.length) {
    fail('GREATER_REALM_RELIEF_STRUCTURE_INTERNAL_SHAPE_INVALID');
  }
  return Object.freeze([
    frozenTriple(values[0]!),
    frozenTriple(values[1]!),
    frozenTriple(values[2]!),
  ] as const);
}

function roundedRatioBasisPoints(
  numerator: bigint,
  denominator: bigint,
): number {
  if (numerator < 0n || denominator <= 0n) {
    fail('GREATER_REALM_RELIEF_STRUCTURE_RATIO_INVALID');
  }
  const rounded =
    (numerator * BigInt(BASIS_POINTS) + denominator / 2n) / denominator;
  if (rounded > SAFE_INTEGER_MAX_BIGINT) {
    fail('GREATER_REALM_RELIEF_STRUCTURE_RATIO_OVERFLOW');
  }
  return Number(rounded);
}

function roundedMeanSquaredDifference(sum: bigint, count: number): bigint {
  if (sum < 0n || !Number.isSafeInteger(count) || count < 0) {
    fail('GREATER_REALM_RELIEF_STRUCTURE_MEAN_INVALID');
  }
  if (count === 0) return 0n;
  const denominator = BigInt(count);
  return (sum + denominator / 2n) / denominator;
}

function safeMeanNumber(value: bigint): number {
  if (value < 0n || value > SAFE_INTEGER_MAX_BIGINT) {
    fail('GREATER_REALM_RELIEF_STRUCTURE_MEAN_OVERFLOW');
  }
  return Number(value);
}

function finiteRatioOrSentinel(numerator: bigint, denominator: bigint): number {
  if (denominator > 0n) {
    return roundedRatioBasisPoints(numerator, denominator);
  }
  return numerator === 0n ? 0 : Number.MAX_SAFE_INTEGER;
}

/**
 * Measure a second-order structure function on final private relief authority.
 *
 * A pair is eligible only when its complete straight axial corridor is dry and
 * outside the frozen Lowlands patch. This prevents a coastline, watercourse,
 * active-mask edge, or protected seam from manufacturing large relief deltas.
 * Only aggregate counts and moments are returned; no mask, coordinate, seed,
 * digest, or sampled cell identity escapes this helper.
 */
export function measureGreaterRealmReliefStructure(
  input: Readonly<{
    grid: IndexedAxialGrid;
    elevation: Int32Array;
    waterRegime: Uint8Array;
    legacyProtectedCell: Uint8Array;
    dryWaterRegime?: number;
    thresholds?: GreaterRealmReliefStructureThresholds;
  }>,
): GreaterRealmReliefStructureMetrics {
  const { grid } = input;
  if (
    !Number.isSafeInteger(grid.cellCount) ||
    grid.cellCount <= 0 ||
    !(grid.q instanceof Int32Array) ||
    !(grid.r instanceof Int32Array) ||
    !(grid.neighbors instanceof Int32Array) ||
    grid.q.length !== grid.cellCount ||
    grid.r.length !== grid.cellCount ||
    grid.neighbors.length !== grid.cellCount * HEX_NEIGHBOR_COUNT
  )
    fail('GREATER_REALM_RELIEF_STRUCTURE_GRID_INVALID');
  for (const neighbor of grid.neighbors) {
    if (neighbor < -1 || neighbor >= grid.cellCount) {
      fail('GREATER_REALM_RELIEF_STRUCTURE_GRID_INVALID');
    }
  }
  if (
    !(input.elevation instanceof Int32Array) ||
    !(input.waterRegime instanceof Uint8Array) ||
    input.waterRegime instanceof Uint8ClampedArray ||
    !(input.legacyProtectedCell instanceof Uint8Array) ||
    input.legacyProtectedCell instanceof Uint8ClampedArray ||
    input.elevation.length !== grid.cellCount ||
    input.waterRegime.length !== grid.cellCount ||
    input.legacyProtectedCell.length !== grid.cellCount
  )
    fail('GREATER_REALM_RELIEF_STRUCTURE_INPUT_LENGTH_INVALID');
  const dryWaterRegime = input.dryWaterRegime ?? 0;
  if (
    !Number.isSafeInteger(dryWaterRegime) ||
    dryWaterRegime < 0 ||
    dryWaterRegime > 0xff
  )
    fail('GREATER_REALM_RELIEF_STRUCTURE_WATER_REGIME_INVALID');
  for (const value of input.legacyProtectedCell) {
    if (value !== 0 && value !== 1) {
      fail('GREATER_REALM_RELIEF_STRUCTURE_PROTECTED_MASK_INVALID');
    }
  }
  const thresholds =
    input.thresholds ?? GREATER_REALM_RELIEF_STRUCTURE_THRESHOLDS;
  validateThresholds(thresholds);

  const eligible = new Uint8Array(grid.cellCount);
  const pairCounts = Array.from(
    { length: GREATER_REALM_RELIEF_STRUCTURE_LAGS.length },
    () => Array<number>(UNDIRECTED_AXIS_COUNT).fill(0),
  );
  const squaredDifferenceSums = Array.from(
    { length: GREATER_REALM_RELIEF_STRUCTURE_LAGS.length },
    () => Array<bigint>(UNDIRECTED_AXIS_COUNT).fill(0n),
  );
  try {
    let eligibleCellCount = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        input.waterRegime[cell] === dryWaterRegime &&
        input.legacyProtectedCell[cell] === 0
      ) {
        eligible[cell] = 1;
        eligibleCellCount += 1;
      }
    }
    if (eligibleCellCount === 0) {
      fail('GREATER_REALM_RELIEF_STRUCTURE_ELIGIBLE_MASK_EMPTY');
    }

    const maximumLag = GREATER_REALM_RELIEF_STRUCTURE_LAGS.at(-1)!;
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (eligible[start] !== 1) continue;
      for (let axis = 0; axis < UNDIRECTED_AXIS_COUNT; axis += 1) {
        let cursor = start;
        let lagIndex = 0;
        for (let step = 1; step <= maximumLag; step += 1) {
          cursor = grid.neighbors[cursor * HEX_NEIGHBOR_COUNT + axis]!;
          if (cursor < 0 || eligible[cursor] !== 1) break;
          if (step !== GREATER_REALM_RELIEF_STRUCTURE_LAGS[lagIndex]) continue;
          const difference = BigInt(
            input.elevation[cursor]! - input.elevation[start]!,
          );
          pairCounts[lagIndex]![axis] += 1;
          squaredDifferenceSums[lagIndex]![axis] += difference * difference;
          lagIndex += 1;
          if (lagIndex === GREATER_REALM_RELIEF_STRUCTURE_LAGS.length) break;
        }
      }
    }

    const meanSquaredBigInt = squaredDifferenceSums.map((row, lag) =>
      row.map((sum, axis) =>
        roundedMeanSquaredDifference(sum, pairCounts[lag]![axis]!),
      ),
    );
    const meanSquaredDifference = meanSquaredBigInt.map((row) =>
      row.map(safeMeanNumber),
    );
    const pairCoverageBasisPoints = pairCounts.map((row) =>
      row.map((count) =>
        roundedRatioBasisPoints(BigInt(count), BigInt(eligibleCellCount)),
      ),
    );

    const lagOneToFourGrowth = Array.from(
      { length: UNDIRECTED_AXIS_COUNT },
      (_, axis) =>
        finiteRatioOrSentinel(
          meanSquaredBigInt[1]![axis]!,
          meanSquaredBigInt[0]![axis]!,
        ),
    );
    const lagFourToTwelveGrowth = Array.from(
      { length: UNDIRECTED_AXIS_COUNT },
      (_, axis) =>
        finiteRatioOrSentinel(
          meanSquaredBigInt[2]![axis]!,
          meanSquaredBigInt[1]![axis]!,
        ),
    );
    const axialAnisotropy = meanSquaredBigInt.map((row) => {
      const minimum = row.reduce((current, value) =>
        value < current ? value : current,
      );
      const maximum = row.reduce((current, value) =>
        value > current ? value : current,
      );
      return finiteRatioOrSentinel(maximum, minimum);
    });

    const pairCoverageProof = pairCoverageBasisPoints.every((row, lag) =>
      row.every(
        (value) =>
          value >= thresholds.minimumPairCoverageBasisPointsByLag[lag]!,
      ),
    );
    const positiveStructure = meanSquaredBigInt.every((row) =>
      row.every((value) => value > 0n),
    );
    const scaleGrowthProof =
      positiveStructure &&
      lagOneToFourGrowth.every(
        (value) =>
          value >= thresholds.minimumScaleGrowthBasisPoints[0]! &&
          value <= thresholds.maximumScaleGrowthBasisPoints[0]!,
      ) &&
      lagFourToTwelveGrowth.every(
        (value) =>
          value >= thresholds.minimumScaleGrowthBasisPoints[1]! &&
          value <= thresholds.maximumScaleGrowthBasisPoints[1]!,
      );
    const axialAnisotropyProof =
      positiveStructure &&
      axialAnisotropy.every(
        (value, lag) =>
          value <= thresholds.maximumAxialAnisotropyBasisPointsByLag[lag]!,
      );

    const result = Object.freeze({
      version: GREATER_REALM_RELIEF_STRUCTURE_VERSION,
      eligibleCellCount,
      pairCountsByLagAndAxis: frozenMatrix(pairCounts),
      pairCoverageBasisPointsByLagAndAxis: frozenMatrix(
        pairCoverageBasisPoints,
      ),
      meanSquaredDifferenceByLagAndAxis: frozenMatrix(meanSquaredDifference),
      lagOneToFourGrowthBasisPointsByAxis: frozenTriple(lagOneToFourGrowth),
      lagFourToTwelveGrowthBasisPointsByAxis: frozenTriple(
        lagFourToTwelveGrowth,
      ),
      axialAnisotropyBasisPointsByLag: frozenTriple(axialAnisotropy),
      pairCoverageProof,
      scaleGrowthProof,
      axialAnisotropyProof,
      proof: pairCoverageProof && scaleGrowthProof && axialAnisotropyProof,
    });
    return result;
  } finally {
    eligible.fill(0);
    for (const row of pairCounts) row.fill(0);
    for (const row of squaredDifferenceSums) row.fill(0n);
  }
}
