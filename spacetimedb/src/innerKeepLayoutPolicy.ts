import type { InnerKeepFootprintClass } from './innerKeepPolicy';

// Browser-pinned digest of the reviewable client presentation-layout manifest.
// Kept as a scalar here so dense decorative data never enters module authority.
export const INNER_KEEP_PRESENTATION_LAYOUT_DIGEST =
  '96c20cac900e02234e53b36a15069d4e7c12057e5f1737c183f6c31cdb38b8b6';

export const INNER_KEEP_LAYOUT_ID = 'genesis-001-inner-keep-v1';
export const INNER_KEEP_LAYOUT_VERSION = 1;
export const INNER_KEEP_SLOT_COUNT = 12;
export const INNER_KEEP_MEDIUM_SLOT_COUNT = 8;
export const INNER_KEEP_LARGE_SLOT_COUNT = 4;
export const INNER_KEEP_LAYOUT_POLICY_VERSION = 'genesis-001-inner-keep-layout-v1';

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

/**
 * Fixed construction pads around the central keep and civic spine. Medium
 * pads are active in V1; the four large pads are visible future reservations.
 */
export const CANONICAL_INNER_KEEP_SLOTS: readonly InnerKeepSlotPolicy[] = Object.freeze([
  Object.freeze({ slotId: 'inner-keep-slot-m01', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: -7_000_000n, localZMicrounits: -3_200_000n, rotationMilliDegrees: 25_000, sortOrder: 1, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-m02', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: -3_800_000n, localZMicrounits: -4_800_000n, rotationMilliDegrees: 15_000, sortOrder: 2, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-m03', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: 3_800_000n, localZMicrounits: -4_800_000n, rotationMilliDegrees: 345_000, sortOrder: 3, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-m04', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: 7_000_000n, localZMicrounits: -3_200_000n, rotationMilliDegrees: 335_000, sortOrder: 4, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-m05', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: -7_200_000n, localZMicrounits: 1_900_000n, rotationMilliDegrees: 155_000, sortOrder: 5, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-m06', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: -4_300_000n, localZMicrounits: 4_900_000n, rotationMilliDegrees: 170_000, sortOrder: 6, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-m07', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: 4_300_000n, localZMicrounits: 4_900_000n, rotationMilliDegrees: 190_000, sortOrder: 7, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-m08', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'medium', localXMicrounits: 7_200_000n, localZMicrounits: 1_900_000n, rotationMilliDegrees: 205_000, sortOrder: 8, active: true }),
  Object.freeze({ slotId: 'inner-keep-slot-l01', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'large', localXMicrounits: -10_200_000n, localZMicrounits: -6_900_000n, rotationMilliDegrees: 35_000, sortOrder: 9, active: false }),
  Object.freeze({ slotId: 'inner-keep-slot-l02', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'large', localXMicrounits: 10_200_000n, localZMicrounits: -6_900_000n, rotationMilliDegrees: 325_000, sortOrder: 10, active: false }),
  Object.freeze({ slotId: 'inner-keep-slot-l03', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'large', localXMicrounits: -10_000_000n, localZMicrounits: 7_200_000n, rotationMilliDegrees: 145_000, sortOrder: 11, active: false }),
  Object.freeze({ slotId: 'inner-keep-slot-l04', layoutId: INNER_KEEP_LAYOUT_ID, footprintClass: 'large', localXMicrounits: 10_000_000n, localZMicrounits: 7_200_000n, rotationMilliDegrees: 215_000, sortOrder: 12, active: false }),
]);

export function canonicalInnerKeepSlot(slotId: string): InnerKeepSlotPolicy | undefined {
  return CANONICAL_INNER_KEEP_SLOTS.find(slot => slot.slotId === slotId);
}

export type InnerKeepSlotPolicyRowLike = Readonly<{
  slotId: string;
  layoutId: string;
  footprintClass: string;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
  sortOrder: number;
  active: boolean;
}>;

export function matchesCanonicalInnerKeepSlot(row: InnerKeepSlotPolicyRowLike): boolean {
  const expected = canonicalInnerKeepSlot(row.slotId);
  return expected !== undefined
    && row.layoutId === expected.layoutId
    && row.footprintClass === expected.footprintClass
    && row.localXMicrounits === expected.localXMicrounits
    && row.localZMicrounits === expected.localZMicrounits
    && row.rotationMilliDegrees === expected.rotationMilliDegrees
    && row.sortOrder === expected.sortOrder
    && row.active === expected.active;
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
    ...CANONICAL_INNER_KEEP_SLOTS.flatMap(slot => [
      slot.slotId,
      slot.layoutId,
      slot.footprintClass,
      slot.localXMicrounits,
      slot.localZMicrounits,
      slot.rotationMilliDegrees,
      slot.sortOrder,
      slot.active,
    ]),
  ].join('|');
}

// SHA-256 of canonicalInnerKeepLayoutDigestInput().
export const INNER_KEEP_LAYOUT_DIGEST =
  'dc314255b0046f5b43be836b52ab4b7af94a2d25992031f75aee89b1a81490c7';

/**
 * Logical asset-family digest. Runtime copy is separately authorization-gated;
 * activation must attest the exact runtime registry before this row can flip.
 */
export const INNER_KEEP_ASSET_CATALOG_DIGEST =
  '6763aeb1755d800b817a0d5174182474d3836a928c59beb4b4fdf65f5d1f6ec3';

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

export type InnerKeepLayoutRootLike = Readonly<{
  layoutId: string;
  layoutVersion: number;
  policyVersion: string;
  slotCount: number;
  mediumSlotCount: number;
  largeSlotCount: number;
  assetCatalogDigest: string;
  layoutDigest: string;
}>;

export type InnerKeepActivationLifecycle =
  | 'never-activated'
  | 'active'
  | 'inactive-after-activation'
  | 'invalid';

/**
 * `activatedAt` is durable lifecycle history. Deactivation only closes new
 * construction; it never makes the component behave as if it was never live.
 */
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
  CANONICAL_INNER_KEEP_SLOTS.length !== INNER_KEEP_SLOT_COUNT
  || new Set(CANONICAL_INNER_KEEP_SLOTS.map(slot => slot.slotId)).size !== INNER_KEEP_SLOT_COUNT
  || new Set(CANONICAL_INNER_KEEP_SLOTS.map(slot => slot.sortOrder)).size !== INNER_KEEP_SLOT_COUNT
  || CANONICAL_INNER_KEEP_SLOTS.filter(slot => slot.footprintClass === 'medium').length
    !== INNER_KEEP_MEDIUM_SLOT_COUNT
  || CANONICAL_INNER_KEEP_SLOTS.filter(slot => slot.footprintClass === 'large').length
    !== INNER_KEEP_LARGE_SLOT_COUNT
  || CANONICAL_INNER_KEEP_SLOTS.some(slot => (
    slot.layoutId !== INNER_KEEP_LAYOUT_ID
    || slot.rotationMilliDegrees < 0
    || slot.rotationMilliDegrees >= 360_000
    || (slot.footprintClass === 'large' && slot.active)
    || (slot.footprintClass === 'medium' && !slot.active)
  ))
) {
  throw new Error('INNER_KEEP_LAYOUT_POLICY_DRIFT');
}
