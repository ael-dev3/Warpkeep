import {
  isCanonicalGreaterRealmAxialGrid,
  type IndexedAxialGrid,
} from './greater-realm-terrain';

/**
 * Private, deterministic reconstruction contract for Greater Realm terrain
 * patches. It describes what the exact cell fields support; it is not a
 * caller-visible payload and it never materializes a global subcell heightmap.
 */
export const GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORT_VERSION =
  'greater-realm-topography-patch-support-v1' as const;
export const GREATER_REALM_TOPOGRAPHY_PATCH_RECONSTRUCTION =
  'fixed-point-hex-gradient-curvature-v1' as const;
export const GREATER_REALM_TOPOGRAPHY_PATCH_LOD_MODEL =
  'stable-axial-decimation-v1' as const;
export const GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORTED_LEVELS =
  Object.freeze([0, 1, 2, 3] as const);

export const GREATER_REALM_TOPOGRAPHY_PATCH_REQUIRED_FIELDS = Object.freeze([
  'erosion-elevation',
  'water-regime',
  'water-depth-class',
  'water-surface-level',
  'water-bank-seed',
  'landform-id',
  'geological-barrier-band',
  'slope',
  'aspect',
  'profile-curvature',
  'plan-curvature',
  'ridge-id',
  'route-class',
] as const);

const WATER_DRY = 0;
const WATER_MARSH = 6;
const ROUTE_MAXIMUM = 4;
const ASPECT_MAXIMUM = 6;
const MAXIMUM_CELL_COUNT = 150_000;

export type GreaterRealmTopographyPatchSupportMetrics = Readonly<{
  version: typeof GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORT_VERSION;
  reconstruction: typeof GREATER_REALM_TOPOGRAPHY_PATCH_RECONSTRUCTION;
  lodModel: typeof GREATER_REALM_TOPOGRAPHY_PATCH_LOD_MODEL;
  cellCount: number;
  lodSampleCounts: readonly number[];
  ridgeOrValleySupportCellCount: number;
  cliffSupportCellCount: number;
  routedSurfaceCellCount: number;
  riverBankSupportCellCount: number;
  buildableFlatSupportCellCount: number;
  localNormalGenerationProof: boolean;
  lodSimplificationProof: boolean;
  featureSupportProof: boolean;
  proof: boolean;
}>;

export type GreaterRealmTopographyPatchSupportInput = Readonly<{
  grid: IndexedAxialGrid;
  elevation: Int32Array;
  waterRegime: Uint8Array;
  waterDepthClass: Uint8Array;
  waterSurfaceLevel: Int32Array;
  bankSeed: Uint32Array;
  landformId: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  slope: Uint16Array;
  aspect: Uint8Array;
  profileCurvature: Int32Array;
  planCurvature: Int32Array;
  ridgeId: Int32Array;
  routeClass: Uint8Array;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function assertInput(input: GreaterRealmTopographyPatchSupportInput): void {
  const { grid } = input;
  if (
    !grid
    || !Number.isSafeInteger(grid.cellCount)
    || grid.cellCount < 1
    || grid.cellCount > MAXIMUM_CELL_COUNT
    || !isCanonicalGreaterRealmAxialGrid(grid)
  ) fail('GREATER_REALM_TOPOGRAPHY_PATCH_GRID_INVALID');
  const exact = (value: ArrayBufferView, constructor: unknown): boolean => (
    value.constructor === constructor
    && (value as { length?: number }).length === grid.cellCount
  );
  if (
    !exact(input.elevation, Int32Array)
    || !exact(input.waterRegime, Uint8Array)
    || !exact(input.waterDepthClass, Uint8Array)
    || !exact(input.waterSurfaceLevel, Int32Array)
    || !exact(input.bankSeed, Uint32Array)
    || !exact(input.landformId, Uint8Array)
    || !exact(input.geologicalBarrierBand, Uint8Array)
    || !exact(input.slope, Uint16Array)
    || !exact(input.aspect, Uint8Array)
    || !exact(input.profileCurvature, Int32Array)
    || !exact(input.planCurvature, Int32Array)
    || !exact(input.ridgeId, Int32Array)
    || !exact(input.routeClass, Uint8Array)
  ) fail('GREATER_REALM_TOPOGRAPHY_PATCH_FIELD_INVALID');
}

function floorDivide(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

/**
 * Prove that the private exact fields can reconstruct bounded local relief and
 * deterministic lower LODs. Returned evidence is coordinate-free.
 */
export function measureGreaterRealmTopographyPatchSupport(
  input: GreaterRealmTopographyPatchSupportInput,
): GreaterRealmTopographyPatchSupportMetrics {
  assertInput(input);
  const lodSampleCountsWorking = new Uint32Array(
    GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORTED_LEVELS.length,
  );
  let lodHashCapacity = 1;
  while (lodHashCapacity < input.grid.cellCount * 2) lodHashCapacity *= 2;
  const lodHashQ = new Int32Array(lodHashCapacity);
  const lodHashR = new Int32Array(lodHashCapacity);
  const lodHashOccupied = new Uint8Array(lodHashCapacity);
  let ridgeOrValleySupportCellCount = 0;
  let cliffSupportCellCount = 0;
  let routedSurfaceCellCount = 0;
  let riverBankSupportCellCount = 0;
  let buildableFlatSupportCellCount = 0;
  let localNormalGenerationProof = true;
  try {
    const lodHashMask = lodHashCapacity - 1;
    for (
      let ordinal = 0;
      ordinal < GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORTED_LEVELS.length;
      ordinal += 1
    ) {
      const divisor = 1 << GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORTED_LEVELS[ordinal]!;
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        const lodQ = floorDivide(input.grid.q[cell]!, divisor);
        const lodR = floorDivide(input.grid.r[cell]!, divisor);
        let slot = (
          Math.imul(lodQ, 0x9e37_79b1)
          ^ Math.imul(lodR, 0x85eb_ca6b)
        ) >>> 0;
        slot &= lodHashMask;
        while (lodHashOccupied[slot] === 1) {
          if (lodHashQ[slot] === lodQ && lodHashR[slot] === lodR) break;
          slot = (slot + 1) & lodHashMask;
        }
        if (lodHashOccupied[slot] === 1) continue;
        lodHashOccupied[slot] = 1;
        lodHashQ[slot] = lodQ;
        lodHashR[slot] = lodR;
        lodSampleCountsWorking[ordinal] += 1;
      }
      lodHashQ.fill(0);
      lodHashR.fill(0);
      lodHashOccupied.fill(0);
    }

    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const regime = input.waterRegime[cell]!;
      const depth = input.waterDepthClass[cell]!;
      const route = input.routeClass[cell]!;
      const aspect = input.aspect[cell]!;
      if (
        regime > WATER_MARSH
        || depth > 3
        || route > ROUTE_MAXIMUM
        || aspect > ASPECT_MAXIMUM
        || input.ridgeId[cell]! < 0
      ) fail('GREATER_REALM_TOPOGRAPHY_PATCH_VALUE_INVALID');
      if (
        (regime === WATER_DRY && (depth !== 0 || input.bankSeed[cell] !== 0))
        || (regime !== WATER_DRY && depth === 0)
      ) fail('GREATER_REALM_TOPOGRAPHY_PATCH_WATER_METADATA_INVALID');

      if (
        input.ridgeId[cell]! > 0
        || input.profileCurvature[cell] !== 0
        || input.planCurvature[cell] !== 0
      ) ridgeOrValleySupportCellCount += 1;
      if (
        input.geologicalBarrierBand[cell] !== 0
        || input.slope[cell]! >= 3_000
      ) cliffSupportCellCount += 1;
      if (route !== 0) routedSurfaceCellCount += 1;
      if (regime !== WATER_DRY) riverBankSupportCellCount += 1;
      if (
        regime === WATER_DRY
        && input.slope[cell]! <= 650
        && input.geologicalBarrierBand[cell] === 0
      ) buildableFlatSupportCellCount += 1;
      if (
        !Number.isSafeInteger(input.elevation[cell]!)
        || !Number.isSafeInteger(input.waterSurfaceLevel[cell]!)
      ) localNormalGenerationProof = false;

    }
    const lodSampleCounts = Object.freeze(Array.from(lodSampleCountsWorking));
    const lodSimplificationProof = lodSampleCounts[0] === input.grid.cellCount
      && lodSampleCounts.every((count, ordinal) => (
        count > 0
        && (ordinal === 0 || count <= lodSampleCounts[ordinal - 1]!)
      ))
      && lodSampleCounts.at(-1)! < lodSampleCounts[0]!;
    const featureSupportProof = ridgeOrValleySupportCellCount > 0
      && cliffSupportCellCount > 0
      && routedSurfaceCellCount > 0
      && riverBankSupportCellCount > 0
      && buildableFlatSupportCellCount > 0;
    return Object.freeze({
      version: GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORT_VERSION,
      reconstruction: GREATER_REALM_TOPOGRAPHY_PATCH_RECONSTRUCTION,
      lodModel: GREATER_REALM_TOPOGRAPHY_PATCH_LOD_MODEL,
      cellCount: input.grid.cellCount,
      lodSampleCounts,
      ridgeOrValleySupportCellCount,
      cliffSupportCellCount,
      routedSurfaceCellCount,
      riverBankSupportCellCount,
      buildableFlatSupportCellCount,
      localNormalGenerationProof,
      lodSimplificationProof,
      featureSupportProof,
      proof: localNormalGenerationProof
        && lodSimplificationProof
        && featureSupportProof,
    });
  } finally {
    lodSampleCountsWorking.fill(0);
    lodHashQ.fill(0);
    lodHashR.fill(0);
    lodHashOccupied.fill(0);
  }
}
