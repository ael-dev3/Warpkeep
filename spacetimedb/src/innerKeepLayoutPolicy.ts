import type {
  InnerKeepBuildingKind,
  InnerKeepFootprintClass,
} from './innerKeepPolicy';

// Browser-pinned digest of the reviewable client presentation-layout manifest.
// Kept as a scalar here so dense decorative data never enters module authority.
export const INNER_KEEP_PRESENTATION_LAYOUT_DIGEST =
  '533ff0c18624445af874f97b71d1d3ae4c6cb4a61f8b7732ba905ee10a61b443';

export const INNER_KEEP_LAYOUT_ID = 'genesis-001-inner-keep-v1';
export const INNER_KEEP_LAYOUT_VERSION = 1;
export const INNER_KEEP_SLOT_COUNT = 0;
export const INNER_KEEP_MEDIUM_SLOT_COUNT = 0;
export const INNER_KEEP_LARGE_SLOT_COUNT = 0;
export const INNER_KEEP_LAYOUT_POLICY_VERSION =
  'genesis-001-inner-keep-free-placement-v1';
export const INNER_KEEP_PLACEMENT_SNAP_MICROUNITS = 500_000n;
export const INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES =
  Object.freeze([0, 90_000, 180_000, 270_000] as const);
export const INNER_KEEP_BUILDABLE_SUPPORT = Object.freeze({
  minimumXMicrounits: -44_000_000n,
  maximumXMicrounits: 44_000_000n,
  minimumZMicrounits: -40_000_000n,
  maximumZMicrounits: 32_000_000n,
});

export type InnerKeepPlacementTransform = Readonly<{
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
}>;

export type InnerKeepPlacementFootprint = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  halfXMicrounits: bigint;
  halfZMicrounits: bigint;
}>;

export const CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS:
Readonly<Record<InnerKeepBuildingKind, InnerKeepPlacementFootprint>> =
  Object.freeze({
    'city-mill': Object.freeze({
      buildingKind: 'city-mill',
      halfXMicrounits: 5_650_000n,
      halfZMicrounits: 4_750_000n,
    }),
    'lumber-camp': Object.freeze({
      buildingKind: 'lumber-camp',
      halfXMicrounits: 5_300_000n,
      halfZMicrounits: 4_400_000n,
    }),
    'city-stoneworks': Object.freeze({
      buildingKind: 'city-stoneworks',
      halfXMicrounits: 5_500_000n,
      halfZMicrounits: 4_600_000n,
    }),
    'city-goldworks': Object.freeze({
      buildingKind: 'city-goldworks',
      halfXMicrounits: 5_500_000n,
      halfZMicrounits: 4_600_000n,
    }),
    'city-barracks': Object.freeze({
      buildingKind: 'city-barracks',
      halfXMicrounits: 9_250_000n,
      halfZMicrounits: 7_750_000n,
    }),
    'grand-covenant-cathedral': Object.freeze({
      buildingKind: 'grand-covenant-cathedral',
      halfXMicrounits: 18_500_000n,
      halfZMicrounits: 16_010_000n,
    }),
  });

export type InnerKeepPlacementExclusion = Readonly<{
  exclusionId: string;
  centerXMicrounits: bigint;
  centerZMicrounits: bigint;
  halfXMicrounits: bigint;
  halfZMicrounits: bigint;
}>;

export const CANONICAL_INNER_KEEP_PLACEMENT_EXCLUSIONS:
readonly InnerKeepPlacementExclusion[] = Object.freeze([
  Object.freeze({
    exclusionId: 'inner-keep-permanent-gate-spine',
    centerXMicrounits: 0n,
    centerZMicrounits: 14_500_000n,
    halfXMicrounits: 3_000_000n,
    halfZMicrounits: 17_500_000n,
  }),
  Object.freeze({
    exclusionId: 'inner-keep-permanent-civic-commons',
    centerXMicrounits: 0n,
    centerZMicrounits: 2_000_000n,
    halfXMicrounits: 5_000_000n,
    halfZMicrounits: 5_000_000n,
  }),
  Object.freeze({
    exclusionId: 'inner-keep-permanent-gate-approach',
    centerXMicrounits: 0n,
    centerZMicrounits: 30_000_000n,
    halfXMicrounits: 4_000_000n,
    halfZMicrounits: 2_000_000n,
  }),
]);

export type InnerKeepPlacementInvalidReason =
  | 'INNER_KEEP_PLACEMENT_INVALID'
  | 'INNER_KEEP_PLACEMENT_OFF_GRID'
  | 'INNER_KEEP_PLACEMENT_ROTATION'
  | 'INNER_KEEP_PLACEMENT_OUTSIDE'
  | 'INNER_KEEP_PLACEMENT_RESERVED'
  | 'INNER_KEEP_PLACEMENT_OCCUPIED';

export type InnerKeepPlacementEvaluation = Readonly<{
  valid: boolean;
  reason?: InnerKeepPlacementInvalidReason;
  conflictId?: string;
}>;

export type InnerKeepOccupiedPlacement = InnerKeepPlacementTransform & Readonly<{
  buildingKey: string;
  buildingKind: InnerKeepBuildingKind;
}>;

function rotatedHalfExtents(
  buildingKind: InnerKeepBuildingKind,
  rotationMilliDegrees: number,
): readonly [bigint, bigint] {
  const footprint = CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS[buildingKind];
  return rotationMilliDegrees === 90_000 || rotationMilliDegrees === 270_000
    ? [footprint.halfZMicrounits, footprint.halfXMicrounits]
    : [footprint.halfXMicrounits, footprint.halfZMicrounits];
}

function rectanglesOverlap(
  leftX: bigint,
  leftZ: bigint,
  leftHalfX: bigint,
  leftHalfZ: bigint,
  rightX: bigint,
  rightZ: bigint,
  rightHalfX: bigint,
  rightHalfZ: bigint,
): boolean {
  const deltaX = leftX >= rightX ? leftX - rightX : rightX - leftX;
  const deltaZ = leftZ >= rightZ ? leftZ - rightZ : rightZ - leftZ;
  return deltaX < leftHalfX + rightHalfX && deltaZ < leftHalfZ + rightHalfZ;
}

export function evaluateCanonicalInnerKeepPlacement(
  buildingKind: InnerKeepBuildingKind,
  transform: InnerKeepPlacementTransform,
  occupied: readonly InnerKeepOccupiedPlacement[],
): InnerKeepPlacementEvaluation {
  if (
    typeof transform.localXMicrounits !== 'bigint'
    || typeof transform.localZMicrounits !== 'bigint'
    || !Number.isSafeInteger(transform.rotationMilliDegrees)
  ) return Object.freeze({ valid: false, reason: 'INNER_KEEP_PLACEMENT_INVALID' });
  if (!INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES.includes(
    transform.rotationMilliDegrees as 0 | 90_000 | 180_000 | 270_000,
  )) return Object.freeze({ valid: false, reason: 'INNER_KEEP_PLACEMENT_ROTATION' });
  if (
    transform.localXMicrounits % INNER_KEEP_PLACEMENT_SNAP_MICROUNITS !== 0n
    || transform.localZMicrounits % INNER_KEEP_PLACEMENT_SNAP_MICROUNITS !== 0n
  ) return Object.freeze({ valid: false, reason: 'INNER_KEEP_PLACEMENT_OFF_GRID' });
  const [halfX, halfZ] = rotatedHalfExtents(
    buildingKind,
    transform.rotationMilliDegrees,
  );
  if (
    transform.localXMicrounits - halfX < INNER_KEEP_BUILDABLE_SUPPORT.minimumXMicrounits
    || transform.localXMicrounits + halfX > INNER_KEEP_BUILDABLE_SUPPORT.maximumXMicrounits
    || transform.localZMicrounits - halfZ < INNER_KEEP_BUILDABLE_SUPPORT.minimumZMicrounits
    || transform.localZMicrounits + halfZ > INNER_KEEP_BUILDABLE_SUPPORT.maximumZMicrounits
  ) return Object.freeze({ valid: false, reason: 'INNER_KEEP_PLACEMENT_OUTSIDE' });
  for (const exclusion of CANONICAL_INNER_KEEP_PLACEMENT_EXCLUSIONS) {
    if (rectanglesOverlap(
      transform.localXMicrounits,
      transform.localZMicrounits,
      halfX,
      halfZ,
      exclusion.centerXMicrounits,
      exclusion.centerZMicrounits,
      exclusion.halfXMicrounits,
      exclusion.halfZMicrounits,
    )) {
      return Object.freeze({
        valid: false,
        reason: 'INNER_KEEP_PLACEMENT_RESERVED',
        conflictId: exclusion.exclusionId,
      });
    }
  }
  for (const existing of occupied) {
    const [existingHalfX, existingHalfZ] = rotatedHalfExtents(
      existing.buildingKind,
      existing.rotationMilliDegrees,
    );
    if (rectanglesOverlap(
      transform.localXMicrounits,
      transform.localZMicrounits,
      halfX,
      halfZ,
      existing.localXMicrounits,
      existing.localZMicrounits,
      existingHalfX,
      existingHalfZ,
    )) {
      return Object.freeze({
        valid: false,
        reason: 'INNER_KEEP_PLACEMENT_OCCUPIED',
        conflictId: existing.buildingKey,
      });
    }
  }
  return Object.freeze({ valid: true });
}

/**
 * Retained empty compatibility shape for the unshipped v15 table. Free
 * placement is authoritative through the layout digest and building rows.
 */
export type InnerKeepSlotPolicy = Readonly<{
  slotId: string;
  layoutId: string;
  footprintClass: InnerKeepFootprintClass;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
  sortOrder: number;
  active: boolean;
}>;
export const CANONICAL_INNER_KEEP_SLOTS: readonly InnerKeepSlotPolicy[] =
  Object.freeze([]);
export function canonicalInnerKeepSlot(_slotId: string): undefined {
  return undefined;
}
export function matchesCanonicalInnerKeepSlot(_row: Readonly<{
  slotId: string;
  layoutId: string;
  footprintClass: string;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
  sortOrder: number;
  active: boolean;
}>): false {
  return false;
}

/** Stable source for the SHA-256 layout digest pinned below. */
export function canonicalInnerKeepLayoutDigestInput(): string {
  return [
    INNER_KEEP_LAYOUT_POLICY_VERSION,
    INNER_KEEP_LAYOUT_ID,
    INNER_KEEP_LAYOUT_VERSION,
    INNER_KEEP_SLOT_COUNT,
    INNER_KEEP_MEDIUM_SLOT_COUNT,
    INNER_KEEP_LARGE_SLOT_COUNT,
    INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
    INNER_KEEP_PLACEMENT_SNAP_MICROUNITS,
    ...INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES,
    ...Object.values(INNER_KEEP_BUILDABLE_SUPPORT),
    ...Object.values(CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS).flatMap(row => [
      row.buildingKind,
      row.halfXMicrounits,
      row.halfZMicrounits,
    ]),
    ...CANONICAL_INNER_KEEP_PLACEMENT_EXCLUSIONS.flatMap(row => [
      row.exclusionId,
      row.centerXMicrounits,
      row.centerZMicrounits,
      row.halfXMicrounits,
      row.halfZMicrounits,
    ]),
  ].join('|');
}

// SHA-256 of canonicalInnerKeepLayoutDigestInput(); regenerated before commit.
export const INNER_KEEP_LAYOUT_DIGEST =
  '1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7';

/** Exact runtime asset-family digest; asset bytes remain unchanged. */
export const INNER_KEEP_ASSET_CATALOG_DIGEST =
  'cf1fdac091e310cce3362d43403be938fe7946e46df906f2efb8cff601497c6d';

export type InnerKeepLayoutRoot = Readonly<{
  layoutId: string;
  layoutVersion: number;
  policyVersion: string;
  slotCount: number;
  mediumSlotCount: number;
  largeSlotCount: number;
  assetCatalogDigest: string;
  layoutDigest: string;
}>;

export const CANONICAL_INNER_KEEP_LAYOUT: InnerKeepLayoutRoot = Object.freeze({
  layoutId: INNER_KEEP_LAYOUT_ID,
  layoutVersion: INNER_KEEP_LAYOUT_VERSION,
  policyVersion: INNER_KEEP_LAYOUT_POLICY_VERSION,
  slotCount: INNER_KEEP_SLOT_COUNT,
  mediumSlotCount: INNER_KEEP_MEDIUM_SLOT_COUNT,
  largeSlotCount: INNER_KEEP_LARGE_SLOT_COUNT,
  assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
  layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
});

export type InnerKeepLayoutRootLike = InnerKeepLayoutRoot;

export type InnerKeepActivationLifecycle =
  | 'never-activated'
  | 'active'
  | 'inactive-after-activation'
  | 'invalid';

export function innerKeepActivationLifecycle(row: Readonly<{
  active: boolean;
  activatedAt: unknown | undefined;
}>): InnerKeepActivationLifecycle {
  if (row.active) return row.activatedAt === undefined ? 'invalid' : 'active';
  return row.activatedAt === undefined ? 'never-activated' : 'inactive-after-activation';
}

export function innerKeepLifecycleRequiresBuilders(
  lifecycle: InnerKeepActivationLifecycle,
): boolean {
  return lifecycle === 'active' || lifecycle === 'inactive-after-activation';
}

export function matchesCanonicalInnerKeepLayout(row: InnerKeepLayoutRootLike): boolean {
  const expected = CANONICAL_INNER_KEEP_LAYOUT;
  return row.layoutId === expected.layoutId
    && row.layoutVersion === expected.layoutVersion
    && row.policyVersion === expected.policyVersion
    && row.slotCount === expected.slotCount
    && row.mediumSlotCount === expected.mediumSlotCount
    && row.largeSlotCount === expected.largeSlotCount
    && row.assetCatalogDigest === expected.assetCatalogDigest
    && row.layoutDigest === expected.layoutDigest;
}

if (
  CANONICAL_INNER_KEEP_SLOTS.length !== 0
  || new Set(Object.keys(CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS)).size !== 6
  || INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES.length !== 4
) {
  throw new Error('INNER_KEEP_LAYOUT_POLICY_DRIFT');
}
