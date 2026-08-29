export const PTR_PRIVATE_TABLE_ACCESSORS = Object.freeze([
  'allowedFid',
  'accessRequestV1',
  'player',
  'playerV2',
  'playerOwnershipV2',
  'castle',
  'realmProfileV1',
  'alphaTermsAcceptanceV1',
  'markAccountV1',
  'resourceAccountV1',
  'adminAudit',
  'greaterRealmReleaseV1',
  'greaterRealmChunkV1',
  'greaterRealmNavigationComponentV1',
  'greaterRealmCellV1',
  'greaterRealmCastleSlotV1',
  'greaterRealmCastleClaimV1',
  'greaterRealmCellOccupancyV1',
  'greaterRealmResourceNodeV1',
  'greaterRealmActivationV1',
  'realmAtlasV1',
  'realmAtlasVisibleRegionV1',
  'realmWorkerSystemV2',
  'ptrOwnerAnchorV1',
] as const);

export const PTR_PRIVATE_TABLE_COUNT = PTR_PRIVATE_TABLE_ACCESSORS.length;

export function assertPtrPrivateSchemaSurface(
  actualAccessors: readonly string[],
): void {
  if (
    actualAccessors.length !== PTR_PRIVATE_TABLE_ACCESSORS.length
    || actualAccessors.some((name, index) => (
      name !== PTR_PRIVATE_TABLE_ACCESSORS[index]
    ))
  ) throw new Error('PTR_PRIVATE_TABLE_SET_INVALID');
}
