import {
  isCanonicalGreaterRealmAxialGrid,
  type IndexedAxialGrid,
} from './greater-realm-terrain';

export const GREATER_REALM_CHUNK_BENCHMARK_VERSION =
  'greater-realm-private-chunk-benchmark-v1' as const;

export const GREATER_REALM_REVIEWED_CHUNK_CELL_MINIMUM = 192;
export const GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM = 256;
/** Reviewed 15×15 axial bin: nominal 225 cells, near the radius-eight 217 reference. */
export const GREATER_REALM_REVIEWED_CHUNK_AXIS_SPAN = 15;
export const GREATER_REALM_CHUNK_AXIS_SPAN_CANDIDATES = Object.freeze([
  14,
  15,
  16,
] as const);

export type GreaterRealmChunkPartitionBenchmarkRow = Readonly<{
  axisSpan: number;
  nominalCellCapacity: number;
  chunkCount: number;
  minimumPopulation: number;
  medianPopulation: number;
  p95Population: number;
  maximumPopulation: number;
  reviewedPopulationChunkCount: number;
  reviewedPopulationCellCount: number;
  reviewedPopulationCellShareBasisPoints: number;
  completeChunkCount: number;
}>;

export type GreaterRealmChunkPartitionBenchmark = Readonly<{
  version: typeof GREATER_REALM_CHUNK_BENCHMARK_VERSION;
  targetMinimumCells: typeof GREATER_REALM_REVIEWED_CHUNK_CELL_MINIMUM;
  targetMaximumCells: typeof GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM;
  selectedAxisSpan: number;
  rows: readonly GreaterRealmChunkPartitionBenchmarkRow[];
  proof: boolean;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function percentile(sorted: readonly number[], numerator: number, denominator: number): number {
  const index = Math.floor(((sorted.length - 1) * numerator) / denominator);
  return sorted[index]!;
}

function roundedBasisPoints(numerator: number, denominator: number): number {
  if (denominator < 1 || numerator < 0 || numerator > denominator) {
    fail('GREATER_REALM_CHUNK_BENCHMARK_COUNT_INVALID');
  }
  return Math.floor((numerator * 10_000 + Math.floor(denominator / 2)) / denominator);
}

function benchmarkSpan(
  grid: IndexedAxialGrid,
  canvasRadius: number,
  axisSpan: number,
): GreaterRealmChunkPartitionBenchmarkRow {
  const chunkAxisCount = Math.ceil((canvasRadius * 2 + 1) / axisSpan);
  if (!Number.isSafeInteger(chunkAxisCount) || chunkAxisCount < 1) {
    fail('GREATER_REALM_CHUNK_BENCHMARK_INPUT_INVALID');
  }
  const populations = new Map<number, number>();
  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const translatedQ = grid.q[cell]! + canvasRadius;
      const translatedR = grid.r[cell]! + canvasRadius;
      if (
        translatedQ < 0
        || translatedQ > canvasRadius * 2
        || translatedR < 0
        || translatedR > canvasRadius * 2
      ) fail('GREATER_REALM_CHUNK_BENCHMARK_COORDINATE_INVALID');
      const chunkQ = Math.floor(translatedQ / axisSpan);
      const chunkR = Math.floor(translatedR / axisSpan);
      const key = chunkQ * chunkAxisCount + chunkR;
      populations.set(key, (populations.get(key) ?? 0) + 1);
    }
    const sorted = [...populations.values()].sort((first, second) => first - second);
    if (sorted.length < 1) fail('GREATER_REALM_CHUNK_BENCHMARK_EMPTY');
    const nominalCellCapacity = axisSpan * axisSpan;
    let reviewedPopulationChunkCount = 0;
    let reviewedPopulationCellCount = 0;
    let completeChunkCount = 0;
    for (const population of sorted) {
      if (population === nominalCellCapacity) completeChunkCount += 1;
      if (
        population >= GREATER_REALM_REVIEWED_CHUNK_CELL_MINIMUM
        && population <= GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM
      ) {
        reviewedPopulationChunkCount += 1;
        reviewedPopulationCellCount += population;
      }
    }
    return Object.freeze({
      axisSpan,
      nominalCellCapacity,
      chunkCount: sorted.length,
      minimumPopulation: sorted[0]!,
      medianPopulation: percentile(sorted, 1, 2),
      p95Population: percentile(sorted, 95, 100),
      maximumPopulation: sorted[sorted.length - 1]!,
      reviewedPopulationChunkCount,
      reviewedPopulationCellCount,
      reviewedPopulationCellShareBasisPoints: roundedBasisPoints(
        reviewedPopulationCellCount,
        grid.cellCount,
      ),
      completeChunkCount,
    });
  } finally {
    populations.clear();
  }
}

/**
 * Compare the three reviewed axial-bin candidates against the prompt's
 * 192–256-cell target. Selection is deterministic: candidates whose median
 * and p95 are within the target win first, then closeness to the 217-cell
 * radius-eight reference, retained target-range cells, and finally span.
 */
export function benchmarkGreaterRealmChunkPartition(input: Readonly<{
  grid: IndexedAxialGrid;
  canvasRadius: number;
}>): GreaterRealmChunkPartitionBenchmark {
  if (
    !isCanonicalGreaterRealmAxialGrid(input.grid)
    || !Number.isSafeInteger(input.canvasRadius)
    || input.canvasRadius < 1
    || input.canvasRadius > 10_000
  ) fail('GREATER_REALM_CHUNK_BENCHMARK_INPUT_INVALID');
  const rows = Object.freeze(GREATER_REALM_CHUNK_AXIS_SPAN_CANDIDATES.map(axisSpan => (
    benchmarkSpan(input.grid, input.canvasRadius, axisSpan)
  )));
  const ordered = [...rows].sort((first, second) => {
    const firstInRange = first.medianPopulation >= GREATER_REALM_REVIEWED_CHUNK_CELL_MINIMUM
      && first.medianPopulation <= GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM
      && first.p95Population <= GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM;
    const secondInRange = second.medianPopulation >= GREATER_REALM_REVIEWED_CHUNK_CELL_MINIMUM
      && second.medianPopulation <= GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM
      && second.p95Population <= GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM;
    if (firstInRange !== secondInRange) return firstInRange ? -1 : 1;
    const referenceDifference = Math.abs(first.medianPopulation - 217)
      - Math.abs(second.medianPopulation - 217);
    if (referenceDifference !== 0) return referenceDifference;
    if (
      first.reviewedPopulationCellShareBasisPoints
      !== second.reviewedPopulationCellShareBasisPoints
    ) {
      return second.reviewedPopulationCellShareBasisPoints
        - first.reviewedPopulationCellShareBasisPoints;
    }
    return first.axisSpan - second.axisSpan;
  });
  const selected = ordered[0]!;
  return Object.freeze({
    version: GREATER_REALM_CHUNK_BENCHMARK_VERSION,
    targetMinimumCells: GREATER_REALM_REVIEWED_CHUNK_CELL_MINIMUM,
    targetMaximumCells: GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM,
    selectedAxisSpan: selected.axisSpan,
    rows,
    proof: selected.axisSpan === GREATER_REALM_REVIEWED_CHUNK_AXIS_SPAN
      && selected.nominalCellCapacity === 225
      && selected.medianPopulation >= GREATER_REALM_REVIEWED_CHUNK_CELL_MINIMUM
      && selected.medianPopulation <= GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM
      && selected.p95Population <= GREATER_REALM_REVIEWED_CHUNK_CELL_MAXIMUM,
  });
}
