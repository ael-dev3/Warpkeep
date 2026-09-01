import { schema, table, t } from 'spacetimedb/server';

import {
  PTR_PRIVATE_TABLE_COUNT,
  assertPtrPrivateSchemaSurface,
} from './schemaContract';

/*
 * These table descriptors are intentionally defined in this isolated module.
 * Importing the production schema would evaluate and bundle its registration
 * graph, including admission/gameplay/economy wires that PTR must not carry.
 * Every descriptor below omits `public: true`, so all 24 tables are private.
 */

export const allowedFid = table(
  { name: 'allowed_fid' },
  {
    fid: t.u64().primaryKey(),
    enabled: t.bool(),
    authEpoch: t.u32(),
    invitedAt: t.timestamp(),
    invitedBy: t.string(),
    note: t.string(),
  },
);

export const accessRequestV1 = table(
  { name: 'access_request_v1' },
  {
    fid: t.u64().primaryKey(),
    requestCycle: t.u64(),
    requestedAt: t.timestamp(),
  },
);

export const player = table(
  { name: 'player' },
  {
    fid: t.u64().primaryKey(),
    identity: t.identity().unique(),
    username: t.option(t.string()),
    displayName: t.option(t.string()),
    pfpUrl: t.option(t.string()),
    joinedAt: t.timestamp(),
    status: t.string(),
  },
);

export const playerV2 = table(
  { name: 'player_v2' },
  {
    fid: t.u64().primaryKey(),
    username: t.option(t.string()),
    displayName: t.option(t.string()),
    pfpUrl: t.option(t.string()),
    joinedAt: t.timestamp(),
    status: t.string(),
  },
);

export const playerOwnershipV2 = table(
  { name: 'player_ownership_v2' },
  {
    fid: t.u64().primaryKey(),
    identity: t.identity().unique(),
  },
);

export const castle = table(
  { name: 'castle' },
  {
    castleId: t.u64().primaryKey().autoInc(),
    ownerFid: t.u64().unique(),
    tileKey: t.string().unique(),
    q: t.i32(),
    r: t.i32(),
    level: t.i32(),
    name: t.string(),
    createdAt: t.timestamp(),
  },
);

export const realmProfileV1 = table(
  { name: 'realm_profile_v1' },
  {
    fid: t.u64().primaryKey(),
    canonicalUsername: t.option(t.string()),
    displayName: t.option(t.string()),
    pfpUrl: t.option(t.string()),
    publicBio: t.option(t.string()),
    admittedAt: t.timestamp(),
    firstAuthenticatedAt: t.option(t.timestamp()),
    profileUpdatedAt: t.timestamp(),
    publicStatus: t.string(),
    communityStatsVisible: t.bool(),
    totalSnapBurnedMicros: t.option(t.u128()),
    marksEarnedMicros: t.option(t.u128()),
    marksSpentMicros: t.option(t.u128()),
    marksBalanceMicros: t.option(t.u128()),
    marksPolicyVersion: t.option(t.string()),
  },
);

export const alphaTermsAcceptanceV1 = table(
  { name: 'alpha_terms_acceptance_v1' },
  {
    acceptanceKey: t.string().primaryKey(),
    fid: t.u64().index(),
    termsVersion: t.string(),
    acceptedAt: t.timestamp(),
  },
);

export const markAccountV1 = table(
  { name: 'mark_account_v1' },
  {
    fid: t.u64().primaryKey(),
    totalSnapBurnedMicros: t.u128(),
    earnedMicros: t.u128(),
    spentMicros: t.u128(),
    balanceMicros: t.u128(),
    policyVersion: t.string(),
    updatedAt: t.timestamp(),
  },
);

export const resourceAccountV1 = table(
  { name: 'resource_account_v1' },
  {
    fid: t.u64().primaryKey(),
    castleId: t.u64().unique(),
    realmId: t.string().index(),
    food: t.u64(),
    wood: t.u64(),
    stone: t.u64(),
    gold: t.u64(),
    settledThroughMicros: t.u64(),
    revision: t.u64(),
    policyVersion: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
);

export const adminAudit = table(
  { name: 'admin_audit' },
  {
    id: t.u64().primaryKey().autoInc(),
    action: t.string(),
    targetFid: t.option(t.u64()),
    actorSubject: t.string(),
    createdAt: t.timestamp(),
    note: t.string(),
  },
);

export const greaterRealmReleaseV1 = table(
  { name: 'greater_realm_release_v1' },
  {
    atlasId: t.string().primaryKey(),
    publicReleaseId: t.string().unique(),
    publicApprovalReceiptId: t.string().unique(),
    sourceCommit: t.string(),
    generatorVersion: t.string(),
    sourceFormatVersion: t.string(),
    livingWorldVersion: t.string(),
    runtimePartitionVersion: t.string(),
    rendererContractVersion: t.string(),
    expectedRegionCount: t.u32(),
    expectedComponentCount: t.u32(),
    expectedChunkCount: t.u32(),
    expectedCellCount: t.u32(),
    expectedSlotCount: t.u32(),
    expectedResourceNodeCount: t.u32(),
    componentExpectedCellCount: t.u32(),
    componentExpectedSlotCount: t.u32(),
    componentExpectedResourceNodeCount: t.u32(),
    importedPassableCellCount: t.u32(),
    expectedReleaseSha256: t.string(),
    releaseHeaderSha256: t.string(),
    importEpoch: t.u64(),
    publicName: t.option(t.string()),
    componentManifestJson: t.string(),
    regionManifestJson: t.option(t.string()),
    regionVerificationJson: t.string(),
    legacyTransformRotation: t.option(t.u32()),
    legacyTransformOffsetQ: t.option(t.i32()),
    legacyTransformOffsetR: t.option(t.i32()),
    verifiedLegacyCellCount: t.u32(),
    verifiedLegacyWaterCellCount: t.u32(),
    legacyWaterBodyVerificationJson: t.string(),
    legacyResourceVerificationJson: t.string(),
    nextChunkOrdinal: t.u32(),
    verificationPhase: t.string(),
    verificationCursor: t.u64(),
    verificationDigest: t.string(),
    verifiedComponentCount: t.u32(),
    verifiedChunkCount: t.u32(),
    verifiedCellCount: t.u32(),
    verifiedSlotCount: t.u32(),
    verifiedResourceNodeCount: t.u32(),
    state: t.string(),
    approvedAt: t.timestamp(),
    stagedAt: t.timestamp(),
    readyAt: t.option(t.timestamp()),
  },
);

export const greaterRealmChunkV1 = table(
  {
    name: 'greater_realm_chunk_v1',
    indexes: [{
      accessor: 'byAtlasAndImportOrdinal',
      algorithm: 'btree',
      columns: ['atlasId', 'importOrdinal'] as const,
    }] as const,
  },
  {
    chunkHandle: t.string().primaryKey(),
    atlasId: t.string().index(),
    chunkCoordKey: t.string().unique(),
    importOrdinal: t.u32().unique(),
    binQ: t.i32(),
    binR: t.i32(),
    firstCellOrdinal: t.u32(),
    coreCellCount: t.u32(),
    apronCellCount: t.u32(),
    lod0CellCount: t.u32(),
    lod1CellCount: t.u32(),
    lod2CellCount: t.u32(),
    lod3CellCount: t.u32(),
    payloadSha256: t.string(),
    payloadJson: t.string(),
    importedAt: t.timestamp(),
  },
);

export const greaterRealmNavigationComponentV1 = table(
  { name: 'greater_realm_navigation_component_v1' },
  {
    componentKey: t.string().primaryKey(),
    atlasId: t.string().index(),
    componentOrdinal: t.u32().unique(),
    regionMask: t.u32(),
    rootCellKey: t.string().unique(),
    expectedCellCount: t.u32(),
    importedCellCount: t.u32(),
    verifiedCellCount: t.u32(),
    verifiedRegionMask: t.u32(),
    verifiedMaxRouteDepth: t.u32(),
    maxRouteDepth: t.u32(),
    expectedSlotCount: t.u32(),
    importedSlotCount: t.u32(),
    expectedFoodNodeCount: t.u32(),
    importedFoodNodeCount: t.u32(),
    expectedWoodNodeCount: t.u32(),
    importedWoodNodeCount: t.u32(),
    expectedStoneNodeCount: t.u32(),
    importedStoneNodeCount: t.u32(),
    expectedGoldNodeCount: t.u32(),
    importedGoldNodeCount: t.u32(),
    verifiedSlotCount: t.u32(),
    verifiedFoodNodeCount: t.u32(),
    verifiedWoodNodeCount: t.u32(),
    verifiedStoneNodeCount: t.u32(),
    verifiedGoldNodeCount: t.u32(),
    componentSha256: t.string(),
    verificationPhase: t.string(),
    verificationDigest: t.string(),
    regionVerificationJson: t.string(),
    active: t.bool(),
  },
);

export const greaterRealmCellV1 = table(
  {
    name: 'greater_realm_cell_v1',
    indexes: [{
      accessor: 'byAtlasAndReleaseOrdinal',
      algorithm: 'btree',
      columns: ['atlasId', 'releaseOrdinal'] as const,
    }, {
      accessor: 'byChunkAndReleaseOrdinal',
      algorithm: 'btree',
      columns: ['chunkHandle', 'releaseOrdinal'] as const,
    }, {
      accessor: 'byComponentAndRouteDepth',
      algorithm: 'btree',
      columns: ['componentKey', 'routeDepth'] as const,
    }] as const,
  },
  {
    cellKey: t.string().primaryKey(),
    atlasCoordKey: t.string().unique(),
    releaseOrdinal: t.u32().unique(),
    atlasId: t.string().index(),
    chunkHandle: t.string().index(),
    regionId: t.string().index(),
    componentKey: t.option(t.string()),
    localQ: t.i32(),
    localR: t.i32(),
    atlasQ: t.i32(),
    atlasR: t.i32(),
    tier: t.u32(),
    passable: t.bool(),
    elevation: t.i32(),
    slope: t.u32(),
    aspect: t.u32(),
    profileCurvature: t.i32(),
    planCurvature: t.i32(),
    ridgeId: t.option(t.string()),
    geologicalBarrierBand: t.u32(),
    biomeClass: t.u32(),
    landformClass: t.u32(),
    yieldClass: t.u32(),
    movementCost: t.u32(),
    sealedBoundaryMask: t.u32(),
    hydroRegime: t.u32(),
    hydroBodyId: t.option(t.string()),
    hydroDepthClass: t.u32(),
    hydroSurfaceMilli: t.i32(),
    hydroFlowDirection: t.option(t.u32()),
    flowAccumulation: t.u64(),
    bankVariant: t.u32(),
    hydrologyRevision: t.u32(),
    routeParentDirection: t.option(t.u32()),
    routeDepth: t.option(t.u32()),
    travelClass: t.u32(),
    wetness: t.u32(),
    exposure: t.i32(),
    coastDistance: t.u32(),
    freshwaterDistance: t.u32(),
    temperature: t.i32(),
    moisture: t.i32(),
    habitatClass: t.u32(),
    canopyBasisPoints: t.u32(),
    groundcoverBasisPoints: t.u32(),
    wildflowerBasisPoints: t.u32(),
    featureClass: t.u32(),
    ambienceClass: t.u32(),
    presentationVariant: t.u32(),
  },
);

export const greaterRealmCastleSlotV1 = table(
  { name: 'greater_realm_castle_slot_v1' },
  {
    slotId: t.string().primaryKey(),
    releaseOrdinal: t.u32().unique(),
    atlasId: t.string().index(),
    cellKey: t.string().unique(),
    regionId: t.string().index(),
    componentKey: t.string().index(),
    legacySlotId: t.option(t.u32()),
    tier: t.u32(),
    regionOrderRank: t.u32(),
    allocationRank: t.u32(),
    active: t.bool(),
  },
);

export const greaterRealmCastleClaimV1 = table(
  { name: 'greater_realm_castle_claim_v1' },
  {
    slotId: t.string().primaryKey(),
    ownerFid: t.u64().unique(),
    castleId: t.u64().unique(),
    atlasId: t.string().index(),
    activationId: t.string().index(),
    state: t.string(),
    claimKind: t.string(),
    allocationSequence: t.u64().unique(),
    plannedAt: t.timestamp(),
    activatedAt: t.option(t.timestamp()),
    legacySlotId: t.option(t.u32()),
    legacyClaimedAt: t.option(t.timestamp()),
    legacyGenerationVersion: t.option(t.u32()),
    legacyTileKey: t.option(t.string()),
    legacyQ: t.option(t.i32()),
    legacyR: t.option(t.i32()),
  },
);

export const greaterRealmCellOccupancyV1 = table(
  { name: 'greater_realm_cell_occupancy_v1' },
  {
    cellKey: t.string().primaryKey(),
    atlasId: t.string().index(),
    regionId: t.string().index(),
    castleId: t.u64().unique(),
    atlasRevision: t.u64(),
    occupiedAt: t.timestamp(),
  },
);

export const greaterRealmResourceNodeV1 = table(
  {
    name: 'greater_realm_resource_node_v1',
    indexes: [{
      accessor: 'byComponentAndResourceKind',
      algorithm: 'btree',
      columns: ['componentKey', 'resourceKind'] as const,
    }] as const,
  },
  {
    nodeId: t.string().primaryKey(),
    releaseOrdinal: t.u32().unique(),
    atlasId: t.string().index(),
    locationId: t.string().index(),
    cellKey: t.string().index(),
    regionId: t.string().index(),
    componentKey: t.string().index(),
    resourceKind: t.string().index(),
    tier: t.u32(),
    nodeOrdinal: t.u32(),
    allocationRank: t.u32(),
    legacyCatalogId: t.option(t.string()),
    policyVersion: t.string(),
    active: t.bool(),
  },
);

export const greaterRealmActivationV1 = table(
  { name: 'greater_realm_activation_v1' },
  {
    activationId: t.string().primaryKey(),
    atlasId: t.string().unique(),
    quietEpoch: t.u64(),
    mode: t.string(),
    snapshotCastleCount: t.u32(),
    snapshotWorkerCount: t.u32(),
    snapshotResourceAccountCount: t.u32(),
    snapshotMarkAccountCount: t.u32(),
    snapshotInnerKeepBuildingCount: t.u32(),
    snapshotClaimCount: t.u32(),
    snapshotOccupancyCount: t.u32(),
    snapshotCastleDigest: t.string(),
    snapshotWorkerDigest: t.string(),
    snapshotResourceDigest: t.string(),
    snapshotMarksDigest: t.string(),
    snapshotInnerKeepDigest: t.string(),
    snapshotScheduleDigest: t.string(),
    topologySnapshotDigest: t.string(),
    relocationPlanDigest: t.string(),
    nextAllocationSequence: t.u64(),
    postCanaryFoundingCount: t.u32(),
    postCanaryDispatchCount: t.u32(),
    actorSubject: t.string(),
    preparedAt: t.timestamp(),
    drainingAt: t.option(t.timestamp()),
    frozenAt: t.option(t.timestamp()),
    plannedAt: t.option(t.timestamp()),
    canaryAt: t.option(t.timestamp()),
    activatedAt: t.option(t.timestamp()),
    haltedAt: t.option(t.timestamp()),
    rolledBackAt: t.option(t.timestamp()),
  },
);

export const realmAtlasV1 = table(
  { name: 'realm_atlas_v1' },
  {
    atlasId: t.string().primaryKey(),
    publicReleaseId: t.string().unique(),
    name: t.string(),
    protocolVersion: t.u32(),
    generatorVersion: t.string(),
    runtimePartitionVersion: t.string(),
    rendererContractVersion: t.string(),
    revision: t.u64(),
    visibleTierMax: t.u32(),
    navigationTierMax: t.u32(),
    foundingTierMax: t.u32(),
    visibleRegionCount: t.u32(),
    visibleCellCount: t.u32(),
    visibleChunkCount: t.u32(),
    castleCapacity: t.u32(),
    mode: t.string(),
    createdAt: t.timestamp(),
    activatedAt: t.option(t.timestamp()),
  },
);

export const realmAtlasVisibleRegionV1 = table(
  { name: 'realm_atlas_visible_region_v1' },
  {
    regionId: t.string().primaryKey(),
    atlasId: t.string().index(),
    ordinal: t.u32().unique(),
    publicName: t.string(),
    tier: t.u32(),
    cellCount: t.u32(),
    passableCellCount: t.u32(),
    chunkCount: t.u32(),
    castleCapacity: t.u32(),
    resourceLocationCount: t.u32(),
    resourceNodeCount: t.u32(),
    foodNodeCount: t.u32(),
    woodNodeCount: t.u32(),
    stoneNodeCount: t.u32(),
    goldNodeCount: t.u32(),
    active: t.bool(),
  },
);

export const realmWorkerSystemV2 = table(
  { name: 'realm_worker_system_v2' },
  {
    atlasId: t.string().primaryKey(),
    policyVersion: t.string(),
    workersPerCastle: t.u32(),
    castleCapacity: t.u32(),
    currentCastleCount: t.u32(),
    currentWorkerCount: t.u32(),
    rosterDigest: t.string(),
    mode: t.string(),
    createdAt: t.timestamp(),
    activatedAt: t.option(t.timestamp()),
  },
);

/** The sole non-atlas PTR authority row; it is never a player or castle. */
export const ptrOwnerAnchorV1 = table(
  { name: 'ptr_owner_anchor_v1' },
  {
    singletonKey: t.string().primaryKey(),
    ownerFid: t.u64().unique(),
    authEpoch: t.u32(),
    enabled: t.bool(),
    provisionedAt: t.timestamp(),
    provisionedBy: t.string(),
    suspendedAt: t.option(t.timestamp()),
    suspendedBy: t.option(t.string()),
  },
);

const ptrTables = {
  allowedFid,
  accessRequestV1,
  player,
  playerV2,
  playerOwnershipV2,
  castle,
  realmProfileV1,
  alphaTermsAcceptanceV1,
  markAccountV1,
  resourceAccountV1,
  adminAudit,
  greaterRealmReleaseV1,
  greaterRealmChunkV1,
  greaterRealmNavigationComponentV1,
  greaterRealmCellV1,
  greaterRealmCastleSlotV1,
  greaterRealmCastleClaimV1,
  greaterRealmCellOccupancyV1,
  greaterRealmResourceNodeV1,
  greaterRealmActivationV1,
  realmAtlasV1,
  realmAtlasVisibleRegionV1,
  realmWorkerSystemV2,
  ptrOwnerAnchorV1,
} as const;

assertPtrPrivateSchemaSurface(Object.keys(ptrTables));
if (Object.keys(ptrTables).length !== PTR_PRIVATE_TABLE_COUNT) {
  throw new Error('PTR_PRIVATE_TABLE_SET_INVALID');
}

const ptr = schema(ptrTables);

export default ptr;
