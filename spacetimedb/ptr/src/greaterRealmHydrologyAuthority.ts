import {
  canonicalOceanDepthAt,
  isCanonicalWaterCoordinate,
} from './greaterRealmFrozenWaterCatalog';

// These stable protocol IDs mirror GREATER_REALM_HYDRO_REGIME in atlasPolicy.
const HYDRO_REGIME = Object.freeze({
  DRY: 0,
  OCEAN: 1,
  LAKE: 2,
  RIVER: 3,
  STREAM: 4,
  SEA: 5,
  MARSH: 6,
} as const);

/** The caller must first verify the complete seal against installed Tier 1 cells. */
export function isGreaterRealmPtrSealedHydrologyContinuationV1(input: Readonly<{
  hydroRegime: number;
  hydroFlowDirection?: number;
  sealedBoundaryMask: number;
}>): boolean {
  const direction = input.hydroFlowDirection;
  return (input.hydroRegime === HYDRO_REGIME.RIVER || input.hydroRegime === HYDRO_REGIME.STREAM)
    && direction !== undefined
    && Number.isSafeInteger(direction) && direction >= 0 && direction < 6
    && Number.isSafeInteger(input.sealedBoundaryMask)
    && input.sealedBoundaryMask >= 0 && input.sealedBoundaryMask <= 0b11_1111
    && (input.sealedBoundaryMask & (1 << direction)) !== 0;
}

export type GreaterRealmPtrHydrologyCellV1 = Readonly<{
  regionId: string;
  localQ: number;
  localR: number;
  atlasQ: number;
  atlasR: number;
  hydroRegime: number;
  hydroBodyId?: string;
  hydroDepthClass: number;
  hydroSurfaceMilli: number;
  hydroFlowDirection?: number;
  flowAccumulation: bigint;
  hydrologyRevision: number;
  passable: boolean;
  movementCost: number;
  geologicalBarrierBand: number;
  biomeClass: number;
  landformClass: number;
  yieldClass: number;
}>;

export type GreaterRealmPtrLegacyTransformV1 = Readonly<{
  rotation: number;
  offsetQ: number;
  offsetR: number;
}>;

const LOWLANDS_REGION_ID = 'T1_LOWLANDS';
const HYDROLOGY_TRANSITIONS: Readonly<Record<number, readonly number[]>> = Object.freeze({
  [HYDRO_REGIME.OCEAN]: Object.freeze([
    HYDRO_REGIME.OCEAN,
  ]),
  [HYDRO_REGIME.LAKE]: Object.freeze([
    HYDRO_REGIME.DRY,
    HYDRO_REGIME.LAKE,
    HYDRO_REGIME.RIVER,
    HYDRO_REGIME.STREAM,
    HYDRO_REGIME.OCEAN,
    HYDRO_REGIME.SEA,
  ]),
  [HYDRO_REGIME.RIVER]: Object.freeze([
    HYDRO_REGIME.RIVER,
    HYDRO_REGIME.MARSH,
    HYDRO_REGIME.LAKE,
    HYDRO_REGIME.OCEAN,
    HYDRO_REGIME.SEA,
  ]),
  [HYDRO_REGIME.STREAM]: Object.freeze([
    HYDRO_REGIME.STREAM,
    HYDRO_REGIME.RIVER,
    HYDRO_REGIME.MARSH,
    HYDRO_REGIME.LAKE,
    HYDRO_REGIME.OCEAN,
    HYDRO_REGIME.SEA,
  ]),
  [HYDRO_REGIME.SEA]: Object.freeze([
    HYDRO_REGIME.SEA,
    HYDRO_REGIME.OCEAN,
  ]),
  [HYDRO_REGIME.MARSH]: Object.freeze([
    HYDRO_REGIME.DRY,
    HYDRO_REGIME.MARSH,
    HYDRO_REGIME.RIVER,
    HYDRO_REGIME.LAKE,
    HYDRO_REGIME.OCEAN,
    HYDRO_REGIME.SEA,
  ]),
});

function fail(code: string): never {
  throw new Error(code);
}

function rotateLegacyCoordinate(q: number, r: number, rotation: number): readonly [number, number] {
  let rotatedQ = q;
  let rotatedR = r;
  for (let step = 0; step < rotation; step += 1) {
    const nextQ = -rotatedR;
    rotatedR = rotatedQ + rotatedR;
    rotatedQ = nextQ;
  }
  return [rotatedQ, rotatedR];
}

function matchesLegacyTransform(
  row: GreaterRealmPtrHydrologyCellV1,
  transform: GreaterRealmPtrLegacyTransformV1,
): boolean {
  if (
    row.regionId !== LOWLANDS_REGION_ID
    || !Number.isSafeInteger(transform.rotation)
    || transform.rotation < 0
    || transform.rotation > 5
    || !Number.isSafeInteger(transform.offsetQ)
    || !Number.isSafeInteger(transform.offsetR)
  ) return false;
  const [rotatedQ, rotatedR] = rotateLegacyCoordinate(
    row.localQ,
    row.localR,
    transform.rotation,
  );
  return row.atlasQ === rotatedQ + transform.offsetQ
    && row.atlasR === rotatedR + transform.offsetR;
}

function isVerifiedFrozenAlphaOceanTerminal(
  row: GreaterRealmPtrHydrologyCellV1,
  transform: GreaterRealmPtrLegacyTransformV1 | undefined,
): boolean {
  if (
    transform === undefined
    || !matchesLegacyTransform(row, transform)
    || !isCanonicalWaterCoordinate(row.localQ, row.localR)
  ) return false;
  const frozenDepthCells = canonicalOceanDepthAt(row.localQ, row.localR);
  return frozenDepthCells !== undefined
    && row.hydroRegime === HYDRO_REGIME.OCEAN
    && row.hydroDepthClass === (frozenDepthCells >= 5 ? 3 : 1)
    && row.hydroSurfaceMilli === 975
    && row.hydroFlowDirection === undefined
    && row.flowAccumulation === 0n
    && row.hydrologyRevision === 3
    && row.passable === false
    && row.movementCost === 1_000_000
    && row.geologicalBarrierBand === 0
    && row.biomeClass === 20
    && row.landformClass === 16
    && row.yieldClass === 0
    && row.hydroBodyId !== undefined;
}

function allowsHydrologyTransition(source: number, downstream: number): boolean {
  return (HYDROLOGY_TRANSITIONS[source] ?? []).includes(downstream);
}

/**
 * PTR counterpart to the shared hydrology gate. Exceptions apply only to
 * generated-region sources and are tied to the retained Lowlands transform
 * plus the standalone frozen Alpha water catalog.
 */
export function requireGreaterRealmPtrHydrologyLinkV1(
  source: GreaterRealmPtrHydrologyCellV1,
  downstream: GreaterRealmPtrHydrologyCellV1,
  legacyTransform?: GreaterRealmPtrLegacyTransformV1,
): void {
  const downstreamIsDry = downstream.hydroRegime === HYDRO_REGIME.DRY;
  if (
    downstreamIsDry
    && source.hydroRegime !== HYDRO_REGIME.LAKE
    && source.hydroRegime !== HYDRO_REGIME.MARSH
  ) fail('GREATER_REALM_HYDROLOGY_DRY_TARGET_INVALID');
  if (downstream.hydroSurfaceMilli > source.hydroSurfaceMilli) {
    fail('GREATER_REALM_HYDROLOGY_UPHILL_INVALID');
  }
  if (downstream.flowAccumulation <= source.flowAccumulation) {
    const isDownhillEqualFlow = downstream.flowAccumulation === source.flowAccumulation
      && downstream.hydroSurfaceMilli < source.hydroSurfaceMilli
      && source.regionId !== LOWLANDS_REGION_ID;
    const isGeneratedRiverIntoFrozenOcean = downstream.flowAccumulation < source.flowAccumulation
      && (source.hydroRegime === HYDRO_REGIME.RIVER
        || source.hydroRegime === HYDRO_REGIME.STREAM)
      && (source.regionId !== LOWLANDS_REGION_ID
        || (legacyTransform !== undefined
          && matchesLegacyTransform(source, legacyTransform)
          && source.hydrologyRevision === 1
          && !isCanonicalWaterCoordinate(source.localQ, source.localR)))
      && isVerifiedFrozenAlphaOceanTerminal(downstream, legacyTransform);
    if (!isDownhillEqualFlow && !isGeneratedRiverIntoFrozenOcean) {
      fail('GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
    }
  }
  if (!allowsHydrologyTransition(source.hydroRegime, downstream.hydroRegime)) {
    fail('GREATER_REALM_HYDROLOGY_TRANSITION_INVALID');
  }
  if (downstreamIsDry) {
    if (source.hydroBodyId === undefined || downstream.hydroBodyId !== undefined) {
      fail('GREATER_REALM_HYDROLOGY_BODY_TRANSITION_INVALID');
    }
  } else if (
    source.hydroBodyId === undefined
    || downstream.hydroBodyId === undefined
    || ((source.hydroRegime === downstream.hydroRegime)
      !== (source.hydroBodyId === downstream.hydroBodyId))
  ) fail('GREATER_REALM_HYDROLOGY_BODY_TRANSITION_INVALID');
}
