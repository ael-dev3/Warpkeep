import {
  createGreaterRealmMultiscaleIntegerField,
  type GreaterRealmTerrainSeed,
  type IndexedAxialGrid,
} from './greater-realm-terrain';

export const GREATER_REALM_TERRACE_VERSION =
  'greater-realm-low-frequency-terraces-v2' as const;

const NEIGHBOR_COUNT = 6;
const MACRO_SMOOTHING_PASSES = 12;
const TERRACE_STEP = 2_400;
const TERRACE_RAMP = 480;
const TERRACE_PLATEAU = TERRACE_STEP - TERRACE_RAMP;
const COAST_PROTECTION_HEIGHT = 1_800;
const FULL_STRENGTH_HEIGHT = 4_200;
const MAXIMUM_TERRACE_CELL_DELTA = 2_200;
const SPATIAL_RAMP_EDGE_LIMIT = 1_200;
const SPATIAL_RAMP_RELAXATION_PASSES = 24;
const WEATHERED_EDGE_ALLOWANCE = 560;
const FULL_STEP_EDGE_THRESHOLD = 2_000;
const FIXED_ONE = 4_096;
const DOMAIN_WARP_FIELD_AMPLITUDE = 4_096;
const DOMAIN_WARP_SMOOTHING_PASSES = 12;
const DOMAIN_WARP_SELF_WEIGHT = 3;
const DOMAIN_WARP_QUANTIZATION = 512;
const DOMAIN_WARP_MAX_HEX_DISTANCE = 5;
const DOMAIN_WARP_FALLBACK_PASSES = 3;
const DOMAIN_WARP_LOCAL_WEIGHT = 63;

export type GreaterRealmTerraceMetrics = Readonly<{
  eligibleCellCount: number;
  changedCellCount: number;
  plateauCellCount: number;
  rampCellCount: number;
  realizedPlateauCellCount: number;
  realizedRampCellCount: number;
  spatialRampCellCount: number;
  fullStepEdgeCount: number;
  maximumNewEdgeIncrease: number;
  weatheredDetailCellCount: number;
  maximumAbsoluteCellDelta: number;
  netElevationDelta: number;
  domainWarpSampledCellCount: number;
  domainWarpChangedCarrierCellCount: number;
  domainWarpOutputChangedCellCount: number;
  domainWarpMaximumDistance: number;
}>;

export type GreaterRealmTerraceResult = Readonly<{
  elevation: Int32Array;
  delta: Int32Array;
  metrics: GreaterRealmTerraceMetrics;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundDivide(numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    fail('GREATER_REALM_TERRACE_ARITHMETIC_INVALID');
  }
  return numerator >= 0
    ? Math.floor((numerator + Math.floor(denominator / 2)) / denominator)
    : -Math.floor((-numerator + Math.floor(denominator / 2)) / denominator);
}

function axialOffsetDistance(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

function smoothElevation(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
): Int32Array {
  let current: Int32Array = new Int32Array(elevation);
  let completed = false;
  try {
    for (let pass = 0; pass < MACRO_SMOOTHING_PASSES; pass += 1) {
      let next: Int32Array | undefined;
      try {
        next = new Int32Array(grid.cellCount);
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          let numerator = current[cell]! * 3;
          let denominator = 3;
          for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
            if (neighbor < 0) continue;
            numerator += current[neighbor]!;
            denominator += 1;
          }
          next[cell] = roundDivide(numerator, denominator);
        }
      } catch (error) {
        next?.fill(0);
        throw error;
      }
      current.fill(0);
      current = next;
    }
    completed = true;
    return current;
  } finally {
    if (!completed) current.fill(0);
  }
}

function relaxSpatialTerraceEdges(
  input: Readonly<{
    grid: IndexedAxialGrid;
    sourceElevation: Int32Array;
    eligible: Uint8Array;
    target: Int32Array;
    maximumAbsoluteDelta?: number;
    minimumValue?: number;
  }>,
): Uint8Array {
  const adjustment = new Int32Array(input.grid.cellCount);
  const adjustmentCount = new Uint8Array(input.grid.cellCount);
  const spatialRampCell = new Uint8Array(input.grid.cellCount);
  let completed = false;
  try {
    for (let pass = 0; pass < SPATIAL_RAMP_RELAXATION_PASSES; pass += 1) {
      adjustment.fill(0);
      adjustmentCount.fill(0);
      let violatingEdges = 0;
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        if (input.eligible[cell] !== 1) continue;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor =
            input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor <= cell || input.eligible[neighbor] !== 1) continue;
          const sourceEdge = Math.abs(
            input.sourceElevation[cell]! - input.sourceElevation[neighbor]!,
          );
          const allowedEdge = Math.max(
            SPATIAL_RAMP_EDGE_LIMIT,
            sourceEdge + WEATHERED_EDGE_ALLOWANCE,
          );
          const difference = input.target[neighbor]! - input.target[cell]!;
          const excess = Math.abs(difference) - allowedEdge;
          if (excess <= 0) continue;
          violatingEdges += 1;
          spatialRampCell[cell] = 1;
          spatialRampCell[neighbor] = 1;
          const firstCorrection = Math.floor(excess / 2);
          const secondCorrection = excess - firstCorrection;
          if (difference > 0) {
            adjustment[cell] += secondCorrection;
            adjustment[neighbor] -= firstCorrection;
          } else {
            adjustment[cell] -= secondCorrection;
            adjustment[neighbor] += firstCorrection;
          }
          adjustmentCount[cell] += 1;
          adjustmentCount[neighbor] += 1;
        }
      }
      if (violatingEdges === 0) break;
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        if (adjustmentCount[cell] === 0) continue;
        const correction = clamp(
          roundDivide(adjustment[cell]!, adjustmentCount[cell]!),
          -Math.floor(TERRACE_STEP / 4),
          Math.floor(TERRACE_STEP / 4),
        );
        const nextValue = input.target[cell]! + correction;
        input.target[cell] =
          input.maximumAbsoluteDelta === undefined
            ? nextValue
            : clamp(
                nextValue,
                Math.max(
                  input.minimumValue ?? -0x8000_0000,
                  input.sourceElevation[cell]! - input.maximumAbsoluteDelta,
                ),
                input.sourceElevation[cell]! + input.maximumAbsoluteDelta,
              );
      }
    }
    completed = true;
    return spatialRampCell;
  } finally {
    adjustment.fill(0);
    adjustmentCount.fill(0);
    if (!completed) spatialRampCell.fill(0);
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function smoothstepFixed(value: number, maximum: number): number {
  const t = clamp(roundDivide(value * FIXED_ONE, maximum), 0, FIXED_ONE);
  return roundDivide(t * t * (3 * FIXED_ONE - 2 * t), FIXED_ONE * FIXED_ONE);
}

function terracedCarrier(
  value: number,
): Readonly<{ value: number; ramp: boolean }> {
  const local = positiveModulo(value, TERRACE_STEP);
  const base = value - local;
  // Centre each plateau in its source band instead of flooring the whole
  // landscape. Adjacent ramp endpoints still meet exactly, while the shaping
  // no longer introduces a continent-wide downward elevation bias.
  const plateauHeight = base + Math.floor(TERRACE_STEP / 2);
  if (local <= TERRACE_PLATEAU) {
    return Object.freeze({ value: plateauHeight, ramp: false });
  }
  const rampProgress = smoothstepFixed(local - TERRACE_PLATEAU, TERRACE_RAMP);
  return Object.freeze({
    value: plateauHeight + roundDivide(TERRACE_STEP * rampProgress, FIXED_ONE),
    ramp: true,
  });
}

/**
 * Shape broad elevation bands into plateaus connected by short smooth ramps,
 * then restore bounded weathered detail. This runs before authoritative
 * fluvial routing; coast sign and the legacy reserve remain immutable.
 */
export function shapeGreaterRealmTerraces(
  input: Readonly<{
    grid: IndexedAxialGrid;
    candidateSeed: GreaterRealmTerrainSeed;
    elevation: Int32Array;
    legacyReserveCell: Uint8Array;
    seaLevel?: number;
  }>,
): GreaterRealmTerraceResult {
  const seaLevel = input.seaLevel ?? 0;
  if (
    input.elevation.length !== input.grid.cellCount ||
    input.legacyReserveCell.length !== input.grid.cellCount ||
    !Number.isSafeInteger(seaLevel)
  )
    fail('GREATER_REALM_TERRACE_INPUT_INVALID');
  for (const value of input.legacyReserveCell) {
    if (value > 1) fail('GREATER_REALM_TERRACE_RESERVE_MASK_INVALID');
  }

  let macroElevation: Int32Array | undefined;
  let contourWarp: Int32Array | undefined;
  let domainWarpQ: Int32Array | undefined;
  let domainWarpR: Int32Array | undefined;
  let weatheredDetail: Int32Array | undefined;
  let elevation: Int32Array | undefined;
  let delta: Int32Array | undefined;
  let eligible: Uint8Array | undefined;
  let intendedRampCell: Uint8Array | undefined;
  let weatheredTarget: Int32Array | undefined;
  let unweatheredTarget: Int32Array | undefined;
  let domainUnwarpedTarget: Int32Array | undefined;
  let unweatheredElevation: Int32Array | undefined;
  let domainUnwarpedElevation: Int32Array | undefined;
  let spatialRampCell: Uint8Array | undefined;
  let unweatheredSpatialRampCell: Uint8Array | undefined;
  let domainUnwarpedSpatialRampCell: Uint8Array | undefined;
  let appliedSpatialRampCell: Uint8Array | undefined;
  let appliedUnweatheredSpatialRampCell: Uint8Array | undefined;
  let appliedDomainUnwarpedSpatialRampCell: Uint8Array | undefined;
  let completed = false;
  try {
    macroElevation = smoothElevation(input.grid, input.elevation);
    contourWarp = createGreaterRealmMultiscaleIntegerField(
      input.grid,
      input.candidateSeed,
      [
        {
          channel: 'geomorphology-terrace-contour-warp-macro',
          amplitude: 900,
          smoothingPasses: 18,
          selfWeight: 3,
        },
        {
          channel: 'geomorphology-terrace-contour-warp-meso',
          amplitude: 320,
          smoothingPasses: 7,
          selfWeight: 2,
        },
      ],
    );
    domainWarpQ = createGreaterRealmMultiscaleIntegerField(
      input.grid,
      input.candidateSeed,
      [
        {
          channel: 'geomorphology-terrace-domain-warp-q',
          amplitude: DOMAIN_WARP_FIELD_AMPLITUDE,
          smoothingPasses: DOMAIN_WARP_SMOOTHING_PASSES,
          selfWeight: DOMAIN_WARP_SELF_WEIGHT,
        },
      ],
    );
    domainWarpR = createGreaterRealmMultiscaleIntegerField(
      input.grid,
      input.candidateSeed,
      [
        {
          channel: 'geomorphology-terrace-domain-warp-r',
          amplitude: DOMAIN_WARP_FIELD_AMPLITUDE,
          smoothingPasses: DOMAIN_WARP_SMOOTHING_PASSES,
          selfWeight: DOMAIN_WARP_SELF_WEIGHT,
        },
      ],
    );
    weatheredDetail = createGreaterRealmMultiscaleIntegerField(
      input.grid,
      input.candidateSeed,
      [
        {
          channel: 'geomorphology-terrace-weathering-meso',
          amplitude: 210,
          smoothingPasses: 4,
          selfWeight: 2,
        },
        {
          channel: 'geomorphology-terrace-weathering-detail',
          amplitude: 70,
          smoothingPasses: 1,
          selfWeight: 2,
        },
      ],
    );
    elevation = new Int32Array(input.elevation);
    delta = new Int32Array(input.grid.cellCount);
    eligible = new Uint8Array(input.grid.cellCount);
    intendedRampCell = new Uint8Array(input.grid.cellCount);
    weatheredTarget = new Int32Array(input.grid.cellCount);
    unweatheredTarget = new Int32Array(input.grid.cellCount);
    domainUnwarpedTarget = new Int32Array(input.grid.cellCount);
    unweatheredElevation = new Int32Array(input.elevation);
    domainUnwarpedElevation = new Int32Array(input.elevation);

    let eligibleCellCount = 0;
    let changedCellCount = 0;
    let plateauCellCount = 0;
    let rampCellCount = 0;
    let weatheredDetailCellCount = 0;
    let maximumAbsoluteCellDelta = 0;
    let netElevationDelta = 0;
    let domainWarpSampledCellCount = 0;
    let domainWarpChangedCarrierCellCount = 0;
    let domainWarpMaximumDistance = 0;

    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const original = input.elevation[cell]!;
      if (
        input.legacyReserveCell[cell] === 1 ||
        original <= seaLevel + COAST_PROTECTION_HEIGHT
      )
        continue;
      eligible[cell] = 1;
      eligibleCellCount += 1;
      let qOffset = roundDivide(
        domainWarpQ[cell]!,
        DOMAIN_WARP_QUANTIZATION,
      );
      let rOffset = roundDivide(
        domainWarpR[cell]!,
        DOMAIN_WARP_QUANTIZATION,
      );
      const rawWarpDistance = axialOffsetDistance(qOffset, rOffset);
      if (rawWarpDistance > DOMAIN_WARP_MAX_HEX_DISTANCE) {
        qOffset = Math.trunc(
          (qOffset * DOMAIN_WARP_MAX_HEX_DISTANCE) / rawWarpDistance,
        );
        rOffset = Math.trunc(
          (rOffset * DOMAIN_WARP_MAX_HEX_DISTANCE) / rawWarpDistance,
        );
      }
      let sampledCell = cell;
      let sampledDistance = 0;
      if (original > seaLevel + FULL_STRENGTH_HEIGHT) {
        for (
          let fallback = 0;
          fallback <= DOMAIN_WARP_FALLBACK_PASSES;
          fallback += 1
        ) {
          if (qOffset === 0 && rOffset === 0) break;
          const candidateSample = input.grid.indexOf({
            q: input.grid.q[cell]! + qOffset,
            r: input.grid.r[cell]! + rOffset,
          });
          if (
            candidateSample >= 0
            && input.legacyReserveCell[candidateSample] === 0
            && input.elevation[candidateSample]!
              > seaLevel + FULL_STRENGTH_HEIGHT
          ) {
            sampledCell = candidateSample;
            sampledDistance = axialOffsetDistance(qOffset, rOffset);
            break;
          }
          qOffset = Math.trunc(qOffset / 2);
          rOffset = Math.trunc(rOffset / 2);
        }
      }
      const warpedMacro = sampledCell === cell
        ? macroElevation[cell]!
        : roundDivide(
            macroElevation[cell]! * DOMAIN_WARP_LOCAL_WEIGHT
              + macroElevation[sampledCell]!,
            DOMAIN_WARP_LOCAL_WEIGHT + 1,
          );
      if (sampledCell !== cell) {
        domainWarpSampledCellCount += 1;
        domainWarpMaximumDistance = Math.max(
          domainWarpMaximumDistance,
          sampledDistance,
        );
        if (warpedMacro !== macroElevation[cell]!) {
          domainWarpChangedCarrierCellCount += 1;
        }
      }
      const carrier = warpedMacro + contourWarp[cell]!;
      const terraced = terracedCarrier(carrier);
      if (terraced.ramp) {
        rampCellCount += 1;
        intendedRampCell[cell] = 1;
      } else plateauCellCount += 1;

      const inheritedDetail = clamp(
        roundDivide(original - macroElevation[cell]!, 2),
        -180,
        180,
      );
      unweatheredTarget[cell] =
        terraced.value - contourWarp[cell]! + inheritedDetail;
      weatheredTarget[cell] = unweatheredTarget[cell]! + weatheredDetail[cell]!;
      const domainUnwarpedTerrace = terracedCarrier(
        macroElevation[cell]! + contourWarp[cell]!,
      );
      domainUnwarpedTarget[cell] =
        domainUnwarpedTerrace.value
        - contourWarp[cell]!
        + inheritedDetail
        + weatheredDetail[cell]!;
    }

    spatialRampCell = relaxSpatialTerraceEdges({
      grid: input.grid,
      sourceElevation: input.elevation,
      eligible,
      target: weatheredTarget,
    });
    unweatheredSpatialRampCell = relaxSpatialTerraceEdges({
      grid: input.grid,
      sourceElevation: input.elevation,
      eligible,
      target: unweatheredTarget,
    });
    domainUnwarpedSpatialRampCell = relaxSpatialTerraceEdges({
      grid: input.grid,
      sourceElevation: input.elevation,
      eligible,
      target: domainUnwarpedTarget,
    });
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (unweatheredSpatialRampCell[cell] === 1) spatialRampCell[cell] = 1;
      if (eligible[cell] !== 1) continue;
      const original = input.elevation[cell]!;
      const strength = clamp(
        roundDivide(
          (original - seaLevel - COAST_PROTECTION_HEIGHT) * FIXED_ONE,
          FULL_STRENGTH_HEIGHT - COAST_PROTECTION_HEIGHT,
        ),
        0,
        FIXED_ONE,
      );
      let cellDelta = roundDivide(
        (weatheredTarget[cell]! - original) * strength,
        FIXED_ONE,
      );
      cellDelta = clamp(
        cellDelta,
        -MAXIMUM_TERRACE_CELL_DELTA,
        MAXIMUM_TERRACE_CELL_DELTA,
      );
      const nextElevation = Math.max(seaLevel + 1, original + cellDelta);
      cellDelta = nextElevation - original;
      let unweatheredDelta = roundDivide(
        (unweatheredTarget[cell]! - original) * strength,
        FIXED_ONE,
      );
      unweatheredDelta = clamp(
        unweatheredDelta,
        -MAXIMUM_TERRACE_CELL_DELTA,
        MAXIMUM_TERRACE_CELL_DELTA,
      );
      unweatheredDelta =
        Math.max(seaLevel + 1, original + unweatheredDelta) - original;
      let domainUnwarpedDelta = roundDivide(
        (domainUnwarpedTarget[cell]! - original) * strength,
        FIXED_ONE,
      );
      domainUnwarpedDelta = clamp(
        domainUnwarpedDelta,
        -MAXIMUM_TERRACE_CELL_DELTA,
        MAXIMUM_TERRACE_CELL_DELTA,
      );
      domainUnwarpedDelta =
        Math.max(seaLevel + 1, original + domainUnwarpedDelta) - original;
      if (!Number.isSafeInteger(nextElevation) || nextElevation > 0x7fff_ffff) {
        fail('GREATER_REALM_TERRACE_ELEVATION_OVERFLOW');
      }
      elevation[cell] = nextElevation;
      unweatheredElevation[cell] = original + unweatheredDelta;
      domainUnwarpedElevation[cell] = original + domainUnwarpedDelta;
    }

    // Strength blending near the coast and the final per-cell displacement
    // clamp can reintroduce a hard edge after the target fields were relaxed.
    // Project the actually applied elevations once more so the proof describes
    // the rendered terrain, not merely an intermediate carrier field.
    appliedSpatialRampCell = relaxSpatialTerraceEdges({
      grid: input.grid,
      sourceElevation: input.elevation,
      eligible,
      target: elevation,
      maximumAbsoluteDelta: MAXIMUM_TERRACE_CELL_DELTA,
      minimumValue: seaLevel + 1,
    });
    appliedUnweatheredSpatialRampCell = relaxSpatialTerraceEdges({
      grid: input.grid,
      sourceElevation: input.elevation,
      eligible,
      target: unweatheredElevation,
      maximumAbsoluteDelta: MAXIMUM_TERRACE_CELL_DELTA,
      minimumValue: seaLevel + 1,
    });
    appliedDomainUnwarpedSpatialRampCell = relaxSpatialTerraceEdges({
      grid: input.grid,
      sourceElevation: input.elevation,
      eligible,
      target: domainUnwarpedElevation,
      maximumAbsoluteDelta: MAXIMUM_TERRACE_CELL_DELTA,
      minimumValue: seaLevel + 1,
    });
    let domainWarpOutputChangedCellCount = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (
        appliedSpatialRampCell[cell] === 1 ||
        appliedUnweatheredSpatialRampCell[cell] === 1
      )
        spatialRampCell[cell] = 1;
      if (eligible[cell] !== 1) continue;
      const cellDelta = elevation[cell]! - input.elevation[cell]!;
      if (!Number.isSafeInteger(cellDelta)) {
        fail('GREATER_REALM_TERRACE_ELEVATION_OVERFLOW');
      }
      delta[cell] = cellDelta;
      if (cellDelta !== 0) changedCellCount += 1;
      if (elevation[cell] !== unweatheredElevation[cell])
        weatheredDetailCellCount += 1;
      if (elevation[cell] !== domainUnwarpedElevation[cell]) {
        domainWarpOutputChangedCellCount += 1;
      }
      maximumAbsoluteCellDelta = Math.max(
        maximumAbsoluteCellDelta,
        Math.abs(cellDelta),
      );
      netElevationDelta += cellDelta;
      if (!Number.isSafeInteger(netElevationDelta)) {
        fail('GREATER_REALM_TERRACE_METRIC_OVERFLOW');
      }
    }

    let realizedPlateauCellCount = 0;
    let realizedRampCellCount = 0;
    let spatialRampCellCount = 0;
    let fullStepEdgeCount = 0;
    let maximumNewEdgeIncrease = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (eligible[cell] !== 1) continue;
      if (spatialRampCell[cell] === 1) spatialRampCellCount += 1;
      let maximumNeighborDelta = 0;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor =
          input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || eligible[neighbor] !== 1) continue;
        const shapedEdge = Math.abs(elevation[cell]! - elevation[neighbor]!);
        maximumNeighborDelta = Math.max(maximumNeighborDelta, shapedEdge);
        if (neighbor <= cell) continue;
        const sourceEdge = Math.abs(
          input.elevation[cell]! - input.elevation[neighbor]!,
        );
        maximumNewEdgeIncrease = Math.max(
          maximumNewEdgeIncrease,
          Math.max(0, shapedEdge - sourceEdge),
        );
        if (
          sourceEdge < SPATIAL_RAMP_EDGE_LIMIT &&
          shapedEdge >= FULL_STEP_EDGE_THRESHOLD
        )
          fullStepEdgeCount += 1;
      }
      const rampEvidence =
        intendedRampCell[cell] === 1 || spatialRampCell[cell] === 1;
      if (rampEvidence && maximumNeighborDelta > 80) realizedRampCellCount += 1;
      else if (!rampEvidence && maximumNeighborDelta <= 800)
        realizedPlateauCellCount += 1;
    }

    const result = Object.freeze({
      elevation,
      delta,
      metrics: Object.freeze({
        eligibleCellCount,
        changedCellCount,
        plateauCellCount,
        rampCellCount,
        realizedPlateauCellCount,
        realizedRampCellCount,
        spatialRampCellCount,
        fullStepEdgeCount,
        maximumNewEdgeIncrease,
        weatheredDetailCellCount,
        maximumAbsoluteCellDelta,
        netElevationDelta,
        domainWarpSampledCellCount,
        domainWarpChangedCarrierCellCount,
        domainWarpOutputChangedCellCount,
        domainWarpMaximumDistance,
      }),
    });
    completed = true;
    return result;
  } finally {
    macroElevation?.fill(0);
    contourWarp?.fill(0);
    domainWarpQ?.fill(0);
    domainWarpR?.fill(0);
    weatheredDetail?.fill(0);
    eligible?.fill(0);
    intendedRampCell?.fill(0);
    weatheredTarget?.fill(0);
    unweatheredTarget?.fill(0);
    domainUnwarpedTarget?.fill(0);
    unweatheredElevation?.fill(0);
    domainUnwarpedElevation?.fill(0);
    spatialRampCell?.fill(0);
    unweatheredSpatialRampCell?.fill(0);
    domainUnwarpedSpatialRampCell?.fill(0);
    appliedSpatialRampCell?.fill(0);
    appliedUnweatheredSpatialRampCell?.fill(0);
    appliedDomainUnwarpedSpatialRampCell?.fill(0);
    if (!completed) {
      elevation?.fill(0);
      delta?.fill(0);
    }
  }
}
