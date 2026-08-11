import { schema, table, t } from 'spacetimedb/server';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import {
  goldExpeditionErrorCode,
  runGoldExpeditionSchedule,
} from '../../../src/goldExpeditionAuthority';
import {
  foodExpeditionErrorCode,
  runFoodExpeditionSchedule,
} from '../../../src/foodExpeditionAuthority';
import {
  woodExpeditionErrorCode,
  runWoodExpeditionSchedule,
} from '../../../src/woodExpeditionAuthority';
import {
  stoneExpeditionErrorCode,
  runStoneExpeditionSchedule,
} from '../../../src/stoneExpeditionAuthority';

const allowedFid = table({ name: 'allowed_fid' }, {
  fid: t.u64().primaryKey(), enabled: t.bool(), authEpoch: t.u32(),
  invitedAt: t.timestamp(), invitedBy: t.string(), note: t.string(),
});
const worldTile = table({ name: 'world_tile', public: true }, {
  key: t.string().primaryKey(), q: t.i32(), r: t.i32(), biome: t.string(),
  terrainSeed: t.u32(), occupantCastleId: t.option(t.u64()),
});
const player = table({ name: 'player', public: true }, {
  fid: t.u64().primaryKey(), identity: t.identity().unique(), username: t.option(t.string()),
  displayName: t.option(t.string()), pfpUrl: t.option(t.string()), joinedAt: t.timestamp(), status: t.string(),
});
const castle = table({ name: 'castle', public: true }, {
  castleId: t.u64().primaryKey().autoInc(), ownerFid: t.u64().unique(), tileKey: t.string().unique(),
  q: t.i32(), r: t.i32(), level: t.i32(), name: t.string(), createdAt: t.timestamp(),
});
const adminAudit = table({ name: 'admin_audit' }, {
  id: t.u64().primaryKey().autoInc(), action: t.string(), targetFid: t.option(t.u64()),
  actorSubject: t.string(), createdAt: t.timestamp(), note: t.string(),
});
const playerV2 = table({ name: 'player_v2', public: true }, {
  fid: t.u64().primaryKey(), username: t.option(t.string()), displayName: t.option(t.string()),
  pfpUrl: t.option(t.string()), joinedAt: t.timestamp(), status: t.string(),
});
const playerOwnershipV2 = table({ name: 'player_ownership_v2' }, {
  fid: t.u64().primaryKey(), identity: t.identity().unique(),
});
const realmV1 = table({ name: 'realm_v1', public: true }, {
  realmId: t.string().primaryKey(), publicName: t.string(), seedName: t.string(), numericSeed: t.u32(),
  generationVersion: t.u32(), authoritativeRadius: t.u32(), renderRadius: t.u32(), playerCapacity: t.u32(),
  active: t.bool(), createdAt: t.timestamp(),
});
const worldTileMetaV1 = table({
  name: 'world_tile_meta_v1', public: true,
  indexes: [{ accessor: 'byRealmAndRing', algorithm: 'btree', columns: ['realmId', 'ring'] as const }] as const,
}, {
  tileKey: t.string().primaryKey(), realmId: t.string().index(), s: t.i32(), ring: t.u32(), sector: t.u32(),
  terrainKind: t.string(), passable: t.bool(), movementCost: t.u32(), staticContentKind: t.string(), generationVersion: t.u32(),
});
const castleSlotV1 = table({ name: 'castle_slot_v1', public: true }, {
  slotId: t.u32().primaryKey(), realmId: t.string().index(), tileKey: t.string().unique(), q: t.i32(), r: t.i32(), generationVersion: t.u32(),
});
const castleSlotClaimV1 = table({ name: 'castle_slot_claim_v1' }, {
  slotId: t.u32().primaryKey(), ownerFid: t.u64().unique(), castleId: t.u64().unique(), claimedAt: t.timestamp(), generationVersion: t.u32(),
});
const realmProfileV1 = table({ name: 'realm_profile_v1', public: true }, {
  fid: t.u64().primaryKey(), canonicalUsername: t.option(t.string()), displayName: t.option(t.string()), pfpUrl: t.option(t.string()), publicBio: t.option(t.string()),
  admittedAt: t.timestamp(), firstAuthenticatedAt: t.option(t.timestamp()), profileUpdatedAt: t.timestamp(), publicStatus: t.string(), communityStatsVisible: t.bool(),
  totalSnapBurnedMicros: t.option(t.u128()), marksEarnedMicros: t.option(t.u128()), marksSpentMicros: t.option(t.u128()), marksBalanceMicros: t.option(t.u128()), marksPolicyVersion: t.option(t.string()),
});
const markAccountV1 = table({ name: 'mark_account_v1' }, {
  fid: t.u64().primaryKey(), totalSnapBurnedMicros: t.u128(), earnedMicros: t.u128(), spentMicros: t.u128(), balanceMicros: t.u128(), policyVersion: t.string(), updatedAt: t.timestamp(),
});
const snapBurnCreditV1 = table({ name: 'snap_burn_credit_v1' }, {
  eventKey: t.string().primaryKey(), batchId: t.string().index(), chainId: t.u32(), tokenContract: t.string(), transactionHash: t.string(), logIndex: t.u32(), burnReference: t.string().unique(), burnMethod: t.string(), senderAddress: t.string(), blockNumber: t.u64(), blockHash: t.string(), amountMicros: t.u128(), attributedFid: t.u64().index(), attributionPolicyVersion: t.string(), contractCodeHash: t.string(), creditedAt: t.timestamp(),
});
const fidWalletAttributionV1 = table({
  name: 'fid_wallet_attribution_v1', indexes: [{ accessor: 'bySnapshotAndAddress', algorithm: 'btree', columns: ['snapshotGeneration', 'address'] as const }] as const,
}, {
  snapshotAttributionKey: t.string().primaryKey(), attributionKey: t.string(), snapshotGeneration: t.u64(), fid: t.u64().index(), address: t.string(), addressType: t.string(), source: t.string(), snapshotAt: t.timestamp(), attributionPolicyVersion: t.string(), active: t.bool(),
});
const walletAttributionSnapshotV1 = table({ name: 'wallet_attribution_snapshot_v1' }, {
  snapshotKey: t.string().primaryKey(), generation: t.u64(), snapshotId: t.string(), policyVersion: t.string(), attributionCount: t.u32(), snapshotAt: t.timestamp(),
});
const snapScanCursorV1 = table({ name: 'snap_scan_cursor_v1' }, {
  cursorKey: t.string().primaryKey(), chainId: t.u32(), tokenContract: t.string(), policyVersion: t.string(), deploymentStartBlock: t.u64(), lastFinalizedBlock: t.u64(), lastFinalizedBlockHash: t.string(), proxyCodeHash: t.string(), implementationAddress: t.string(), implementationCodeHash: t.string(), walletSnapshotGeneration: t.u64(), walletSnapshotId: t.string(), scannedAt: t.timestamp(),
});
const snapScanBatchV1 = table({
  name: 'snap_scan_batch_v1', indexes: [{ accessor: 'byCursorAndStatus', algorithm: 'btree', columns: ['cursorKey', 'status'] as const }] as const,
}, {
  batchId: t.string().primaryKey(), cursorKey: t.string(), status: t.string(), previousFinalizedBlock: t.u64(), previousFinalizedBlockHash: t.string(), throughFinalizedBlock: t.u64(), throughFinalizedBlockHash: t.string(), walletSnapshotGeneration: t.u64(), walletSnapshotId: t.string(), walletAttributionCount: t.u32(), expectedCredits: t.u32(), expectedMicros: t.u128(), appliedCredits: t.u32(), appliedMicros: t.u128(), proxyCodeHash: t.string(), implementationAddress: t.string(), implementationCodeHash: t.string(), startedAt: t.timestamp(), finalizedAt: t.option(t.timestamp()),
});
const alphaTermsAcceptanceV1 = table({ name: 'alpha_terms_acceptance_v1' }, {
  acceptanceKey: t.string().primaryKey(), fid: t.u64().index(), termsVersion: t.string(), acceptedAt: t.timestamp(),
});
const resourceAccountV1 = table({ name: 'resource_account_v1' }, {
  fid: t.u64().primaryKey(), castleId: t.u64().unique(), realmId: t.string().index(), food: t.u64(), wood: t.u64(), stone: t.u64(), gold: t.u64(), settledThroughMicros: t.u64(), revision: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
});

const goldSiteV1 = table({ name: 'gold_site_v1', public: true }, { siteId: t.string().primaryKey(), q: t.i32(), r: t.i32(), tier: t.u32(), active: t.bool() });
const goldNodeOccupationV1 = table({ name: 'gold_node_occupation_v1', public: true, indexes: [{ accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const }] as const }, { siteId: t.string().primaryKey(), originCastleId: t.u64(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64() });
const goldExpeditionV1 = table({ name: 'gold_expedition_v1', indexes: [{ accessor: 'byFidAndPhase', algorithm: 'btree', columns: ['fid', 'phase'] as const }] as const }, { expeditionId: t.string().primaryKey(), fid: t.u64().unique(), originCastleId: t.u64().unique(), siteId: t.string().index(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(), settledThroughMicros: t.u64(), accruedGold: t.u64(), creditedGold: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp() });
const goldExpeditionIdempotencyV1 = table({ name: 'gold_expedition_idempotency_v1' }, { requestKey: t.string().primaryKey(), fid: t.u64().index(), siteId: t.string(), expeditionId: t.string().unique(), createdAt: t.timestamp() });
const goldExpeditionScheduleV1 = table({ name: 'gold_expedition_schedule_v_1', public: true, scheduled: (): any => runGoldExpeditionScheduleV1 }, { scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), originCastleId: t.u64().index(), siteId: t.string().index(), stage: t.string() });

const realmForestLayoutV1 = table({ name: 'realm_forest_layout_v1', public: true }, { realmId: t.string().primaryKey(), layoutVersion: t.u32(), policyVersion: t.string(), layoutDigest: t.string(), assetCatalogDigest: t.string(), instanceCount: t.u32(), seededAt: t.timestamp() });
const realmForestInstanceV1 = table({ name: 'realm_forest_instance_v1', public: true }, { treeId: t.string().primaryKey(), realmId: t.string().index(), tileKey: t.string(), q: t.i32(), r: t.i32(), localXMicrounits: t.i64(), localZMicrounits: t.i64(), worldXMicrounits: t.i64(), worldZMicrounits: t.i64(), rotationMilliDegrees: t.u32(), scaleBasisPoints: t.u32(), speciesId: t.string(), habitat: t.string(), layoutVersion: t.u32() });

const foodSiteV1 = table({ name: 'food_site_v1', public: true }, { siteId: t.string().primaryKey(), q: t.i32(), r: t.i32(), tier: t.u32(), active: t.bool() });
const foodNodeOccupationV1 = table({ name: 'food_node_occupation_v1', public: true, indexes: [{ accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const }] as const }, { siteId: t.string().primaryKey(), originCastleId: t.u64(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64() });
const foodExpeditionV1 = table({ name: 'food_expedition_v1', indexes: [{ accessor: 'byFidAndPhase', algorithm: 'btree', columns: ['fid', 'phase'] as const }] as const }, { expeditionId: t.string().primaryKey(), fid: t.u64().unique(), originCastleId: t.u64().unique(), siteId: t.string().index(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(), settledThroughMicros: t.u64(), accruedFood: t.u64(), creditedFood: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp() });
const foodExpeditionIdempotencyV1 = table({ name: 'food_expedition_idempotency_v1' }, { requestKey: t.string().primaryKey(), fid: t.u64().index(), siteId: t.string(), expeditionId: t.string().unique(), createdAt: t.timestamp() });
const foodExpeditionScheduleV1 = table({ name: 'food_expedition_schedule_v_1', public: true, scheduled: (): any => runFoodExpeditionScheduleV1 }, { scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), originCastleId: t.u64().index(), siteId: t.string().index(), stage: t.string() });

const woodSiteV1 = table({ name: 'wood_site_v1', public: true }, { siteId: t.string().primaryKey(), q: t.i32(), r: t.i32(), tier: t.u32(), active: t.bool() });
const woodNodeOccupationV1 = table({ name: 'wood_node_occupation_v1', public: true, indexes: [{ accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const }] as const }, { siteId: t.string().primaryKey(), originCastleId: t.u64(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64() });
const woodExpeditionV1 = table({ name: 'wood_expedition_v1', indexes: [{ accessor: 'byFidAndPhase', algorithm: 'btree', columns: ['fid', 'phase'] as const }] as const }, { expeditionId: t.string().primaryKey(), fid: t.u64().unique(), originCastleId: t.u64().unique(), siteId: t.string().index(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(), settledThroughMicros: t.u64(), accruedWood: t.u64(), creditedWood: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp() });
const woodExpeditionIdempotencyV1 = table({ name: 'wood_expedition_idempotency_v1' }, { requestKey: t.string().primaryKey(), fid: t.u64().index(), siteId: t.string(), expeditionId: t.string().unique(), createdAt: t.timestamp() });
const woodExpeditionScheduleV1 = table({ name: 'wood_expedition_schedule_v_1', public: true, scheduled: (): any => runWoodExpeditionScheduleV1 }, { scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), originCastleId: t.u64().index(), siteId: t.string().index(), stage: t.string() });

const realmWaterLayoutV1 = table({ name: 'realm_water_layout_v1', public: true }, { realmId: t.string().primaryKey(), layoutVersion: t.u32(), policyVersion: t.string(), generationVersion: t.u32(), canonicalLandCellCount: t.u32(), oceanCellCount: t.u32(), lakeCellCount: t.u32(), lakeBodyCount: t.u32(), riverCount: t.u32(), riverCellCount: t.u32(), seaLevelMilli: t.i32(), seaLevelPolicyVersion: t.string(), fogStartDepthCells: t.u32(), fogFullDepthCells: t.u32(), hiddenBufferCells: t.u32(), layoutDigest: t.string(), sourceCommit: t.string(), activated: t.bool(), seededAt: t.timestamp(), activatedAt: t.option(t.timestamp()) });
const realmWaterBodyV1 = table({ name: 'realm_water_body_v1', public: true, indexes: [{ accessor: 'byRealmAndRegime', algorithm: 'btree', columns: ['realmId', 'regime'] as const }] as const }, { bodyId: t.string().primaryKey(), realmId: t.string().index(), regime: t.string(), cellCount: t.u32(), sourceCellKey: t.string(), mouthCellKey: t.string(), surfaceLevelMilli: t.i32(), flowDirectionXQ15: t.i32(), flowDirectionZQ15: t.i32(), wavePreset: t.string(), ordinal: t.u32(), seed: t.u32(), generationVersion: t.u32(), layoutVersion: t.u32() });
const realmWaterCellV1 = table({ name: 'realm_water_cell_v1', public: true, indexes: [{ accessor: 'byRealmAndRegime', algorithm: 'btree', columns: ['realmId', 'regime'] as const }, { accessor: 'byBody', algorithm: 'btree', columns: ['bodyId'] as const }] as const }, { cellKey: t.string().primaryKey(), realmId: t.string().index(), q: t.i32(), r: t.i32(), regime: t.string(), bodyId: t.string(), depthCells: t.u32(), elevationMilli: t.i32(), surfaceLevelMilli: t.i32(), ring: t.u32(), s: t.i32(), underlyingTileKey: t.option(t.string()), riverOrdinal: t.option(t.u32()), riverOrder: t.option(t.u32()), downstreamWaterCellKey: t.option(t.string()), flowAccumulation: t.u32(), depthClass: t.u32(), oceanDepth: t.u32(), bankSeed: t.u32(), generationVersion: t.u32(), fogBand: t.string(), layoutVersion: t.u32() });
const realmEnvironmentV1 = table({ name: 'realm_environment_v1', public: true }, { realmId: t.string().primaryKey(), environmentEpoch: t.u64(), waterLayoutVersion: t.u32(), seaLevelMilli: t.i32(), sunDirectionXMicro: t.i32(), sunDirectionYMicro: t.i32(), sunDirectionZMicro: t.i32(), updatedAt: t.timestamp() });

const stoneSiteV1 = table({ name: 'stone_site_v1', public: true }, { siteId: t.string().primaryKey(), q: t.i32(), r: t.i32(), tier: t.u32(), active: t.bool() });
const stoneNodeOccupationV1 = table({ name: 'stone_node_occupation_v1', public: true, indexes: [{ accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const }] as const }, { siteId: t.string().primaryKey(), originCastleId: t.u64(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64() });
const stoneExpeditionV1 = table({ name: 'stone_expedition_v1', indexes: [{ accessor: 'byFidAndPhase', algorithm: 'btree', columns: ['fid', 'phase'] as const }] as const }, { expeditionId: t.string().primaryKey(), fid: t.u64().unique(), originCastleId: t.u64().unique(), siteId: t.string().index(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(), settledThroughMicros: t.u64(), accruedStone: t.u64(), creditedStone: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp() });
const stoneExpeditionIdempotencyV1 = table({ name: 'stone_expedition_idempotency_v1' }, { requestKey: t.string().primaryKey(), fid: t.u64().index(), siteId: t.string(), expeditionId: t.string().unique(), createdAt: t.timestamp() });
const stoneExpeditionScheduleV1 = table({ name: 'stone_expedition_schedule_v_1', public: true, scheduled: (): any => runStoneExpeditionScheduleV1 }, { scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), originCastleId: t.u64().index(), siteId: t.string().index(), stage: t.string() });

const realmWaterRevisionV1 = table({ name: 'realm_water_revision_v1', public: true }, {
  realmId: t.string().primaryKey(), revisionVersion: t.u32(), policyVersion: t.string(),
  baseLayoutVersion: t.u32(), baseLayoutDigest: t.string(), oceanBodyCount: t.u32(),
  riverBodyCount: t.u32(), enabledBodyCount: t.u32(), oceanCellCount: t.u32(),
  riverCellCount: t.u32(), enabledCellCount: t.u32(), lakeBodyCount: t.u32(),
  lakeCellCount: t.u32(), riverWidthCells: t.u32(), navigationFogBoundaryDepthCells: t.u32(),
  hiddenBufferCells: t.u32(), revisionDigest: t.string(), sourceCommit: t.string(),
  activated: t.bool(), seededAt: t.timestamp(), activatedAt: t.option(t.timestamp()),
});

/** v12 generic-worker suffix. Public rows contain only identity/lifecycle data. */
const realmWorkerSystemV1 = table({ name: 'realm_worker_system_v1', public: true }, {
  realmId: t.string().primaryKey(), policyVersion: t.string(), workersPerCastle: t.u32(),
  expectedCastleCount: t.u32(), expectedWorkerCount: t.u32(), rosterDigest: t.string(),
  mode: t.string(), legacyDrainRequired: t.bool(), createdAt: t.timestamp(),
  activatedAt: t.option(t.timestamp()),
});
const castleWorkerV1 = table({
  name: 'castle_worker_v1', public: true,
  indexes: [{ accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const }] as const,
}, {
  workerId: t.string().primaryKey(), originCastleId: t.u64(), ordinal: t.u32(), status: t.string(),
  resourceKind: t.option(t.string()), siteId: t.option(t.string()),
  startedAtMicros: t.option(t.u64()), arrivesAtMicros: t.option(t.u64()), gatheringEndsAtMicros: t.option(t.u64()),
  returnStartedAtMicros: t.option(t.u64()), returnsAtMicros: t.option(t.u64()), routeSteps: t.option(t.u32()),
  returnStartProgressBasisPoints: t.option(t.u32()), timelineRevision: t.u32(), revision: t.u64(),
});
const workerAssignmentV1 = table({
  name: 'worker_assignment_v1',
  indexes: [
    { accessor: 'byFid', algorithm: 'btree', columns: ['fid'] as const },
    { accessor: 'byFidAndPhase', algorithm: 'btree', columns: ['fid', 'phase'] as const },
  ] as const,
}, {
  assignmentId: t.string().primaryKey(), workerId: t.string().unique(), fid: t.u64(),
  originCastleId: t.u64(), resourceKind: t.string(), siteId: t.string().index(), phase: t.string(),
  startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(),
  returnStartedAtMicros: t.option(t.u64()), returnsAtMicros: t.u64(), routeSteps: t.u32(),
  returnStartProgressBasisPoints: t.u32(), settledThroughMicros: t.u64(), accruedAmount: t.u64(),
  materializedAmount: t.u64(), timelineRevision: t.u32(), policyVersion: t.string(),
  createdAt: t.timestamp(), updatedAt: t.timestamp(),
});
const workerNodeOccupationV1 = table({
  name: 'worker_node_occupation_v1', public: true,
  indexes: [
    { accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const },
    { accessor: 'byWorker', algorithm: 'btree', columns: ['workerId'] as const },
  ] as const,
}, {
  nodeKey: t.string().primaryKey(), resourceKind: t.string(), siteId: t.string(), workerId: t.string(),
  workerOrdinal: t.u32(), originCastleId: t.u64(), phase: t.string(),
  startedAtMicros: t.u64(), arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), timelineRevision: t.u32(),
});
const workerCommandIdempotencyV1 = table({
  name: 'worker_command_idempotency_v1',
  indexes: [{ accessor: 'byFid', algorithm: 'btree', columns: ['fid'] as const }] as const,
}, {
  requestKey: t.string().primaryKey(), fid: t.u64(), workerId: t.option(t.string()), commandKind: t.string(),
  resourceKind: t.option(t.string()), siteId: t.option(t.string()), assignmentId: t.option(t.string()),
  resultRevision: t.u64(), createdAt: t.timestamp(),
});
const workerAssignmentScheduleV1 = table({
  name: 'worker_assignment_schedule_v_1',
  indexes: [
    { accessor: 'byAssignment', algorithm: 'btree', columns: ['assignmentId'] as const },
    { accessor: 'byWorker', algorithm: 'btree', columns: ['workerId'] as const },
  ] as const,
  scheduled: (): any => runWorkerAssignmentScheduleV1,
}, {
  scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), assignmentId: t.string(),
  workerId: t.string(), timelineRevision: t.u32(), stage: t.string(),
});

/** v13 private, append-only expression of interest in manual admission. */
const accessRequestV1 = table({ name: 'access_request_v1' }, {
  fid: t.u64().primaryKey(), requestCycle: t.u64(), requestedAt: t.timestamp(),
});

/** v14 private, exactly-once admitted-player UTC-day Mark receipt. */
const dailyMarkGrantV1 = table({ name: 'daily_mark_grant_v1' }, {
  grantKey: t.string().primaryKey(), fid: t.u64().index(), utcDay: t.u64().index(),
  amountMicros: t.u128(), policyVersion: t.string(), grantedAt: t.timestamp(),
});

/** v14 identity-free, private scheduler singleton. */
const dailyMarkScheduleV1 = table({
  name: 'daily_mark_schedule_v_1',
  scheduled: (): any => runDailyMarkScheduleV1,
}, {
  scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(),
  policyVersion: t.string().unique(),
});

/** v15 public, separately activated Inner Keep root and static catalog. */
const innerKeepLayoutV1 = table({ name: 'inner_keep_layout_v1', public: true }, {
  layoutId: t.string().primaryKey(), layoutVersion: t.u32(), policyVersion: t.string(),
  slotCount: t.u32(), mediumSlotCount: t.u32(), largeSlotCount: t.u32(),
  assetCatalogDigest: t.string(), layoutDigest: t.string(), active: t.bool(),
  createdAt: t.timestamp(), activatedAt: t.option(t.timestamp()),
});
const innerKeepSlotV1 = table({ name: 'inner_keep_slot_v1', public: true }, {
  slotId: t.string().primaryKey(), layoutId: t.string().index(), footprintClass: t.string(),
  localXMicrounits: t.i64(), localZMicrounits: t.i64(), rotationMilliDegrees: t.u32(),
  sortOrder: t.u32(), active: t.bool(),
});
const innerKeepBuildingCatalogV1 = table({ name: 'inner_keep_building_catalog_v1', public: true }, {
  buildingKind: t.string().primaryKey(), publicLabel: t.string(), category: t.string(),
  footprintClass: t.string(), maximumLevel: t.u32(), uniquePerCastle: t.bool(),
  matchingDiscountResource: t.string(), discountBasisPointsPerLevel: t.u32(),
  discountCapBasisPoints: t.u32(), runtimeAssetId: t.string(), previewAssetId: t.string(),
  active: t.bool(), policyVersion: t.string(),
});
const innerKeepBuildLevelV1 = table({ name: 'inner_keep_build_level_v1', public: true }, {
  levelKey: t.string().primaryKey(), buildingKind: t.string().index(), targetLevel: t.u32(),
  baseFoodCost: t.u64(), baseWoodCost: t.u64(), baseStoneCost: t.u64(), baseGoldCost: t.u64(),
  levelMultiplierBasisPoints: t.u32(), durationMicros: t.u64(), policyVersion: t.string(),
});
const castleInnerKeepBuildingV1 = table({
  name: 'castle_inner_keep_building_v1', public: true,
  indexes: [{ accessor: 'byCastle', algorithm: 'btree', columns: ['castleId'] as const }] as const,
}, {
  buildingKey: t.string().primaryKey(), castleId: t.u64(), buildingKind: t.string(),
  localXMicrounits: t.i64(), localZMicrounits: t.i64(), rotationMilliDegrees: t.u32(),
  completedLevel: t.u32(), targetLevel: t.u32(),
  phase: t.string(), startedAtMicros: t.u64(), completesAtMicros: t.u64(), revision: t.u64(),
  policyVersion: t.string(),
});

/** v15 private Builder, receipt, and scheduler authority. */
const castleInnerBuilderV1 = table({ name: 'castle_inner_builder_v1' }, {
  castleId: t.u64().primaryKey(), fid: t.u64().unique(), activeBuildingKey: t.option(t.string()),
  busyUntilMicros: t.option(t.u64()), revision: t.u64(), policyVersion: t.string(),
  createdAt: t.timestamp(), updatedAt: t.timestamp(),
});
const castleInnerBuildReceiptV1 = table({ name: 'castle_inner_build_receipt_v1' }, {
  receiptKey: t.string().primaryKey(), fid: t.u64().index(), requestKey: t.string(),
  castleId: t.u64(), buildingKey: t.string(), buildingKind: t.string(),
  localXMicrounits: t.i64(), localZMicrounits: t.i64(), rotationMilliDegrees: t.u32(),
  targetLevel: t.u32(), deductedFood: t.u64(), deductedWood: t.u64(), deductedStone: t.u64(),
  deductedGold: t.u64(), startedAt: t.timestamp(), policyVersion: t.string(),
});
const castleInnerConstructionScheduleV1 = table({
  name: 'castle_inner_construction_schedule_v_1',
  indexes: [{ accessor: 'byBuilding', algorithm: 'btree', columns: ['buildingKey'] as const }] as const,
  scheduled: (): any => runInnerKeepConstructionScheduleV1,
}, {
  scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), buildingKey: t.string(),
  expectedRevision: t.u64(), expectedTargetLevel: t.u32(),
});

/** v16 public, identity-free Realm Chat readiness projection. */
const realmChatStatusV1 = table({ name: 'realm_chat_status_v1', public: true }, {
  channelKey: t.string().primaryKey(), realmId: t.string().index(), policyVersion: t.string(),
  mode: t.string(), recentLimit: t.u32(), historyPageLimit: t.u32(), updatedAt: t.timestamp(),
});

/** v16 private channel authority and monotonic sequence cursor. */
const realmChatChannelV1 = table({ name: 'realm_chat_channel_v1' }, {
  channelKey: t.string().primaryKey(), realmId: t.string().unique(), policyVersion: t.string(),
  mode: t.string(), nextSequence: t.u64(), pendingReports: t.u32(), updatedAt: t.timestamp(),
});

/** v16 private permanent message archive. */
const realmChatMessageV1 = table({
  name: 'realm_chat_message_v1',
  indexes: [{ accessor: 'byChannelAndSequence', algorithm: 'btree', columns: ['channelKey', 'sequence'] as const }] as const,
}, {
  messageId: t.string().primaryKey(), sequence: t.u64().unique(), channelKey: t.string(),
  senderFid: t.u64().index(), body: t.string(), sentAt: t.timestamp(), visibility: t.string(),
  moderatedAt: t.option(t.timestamp()), moderationCode: t.option(t.string()),
});

/** v16 private bounded recent-message cache. */
const realmChatRecentV1 = table({ name: 'realm_chat_recent_v1' }, {
  sequence: t.u64().primaryKey(), messageId: t.string().unique(), channelKey: t.string().index(),
  senderFid: t.u64().index(), body: t.string(), sentAt: t.timestamp(), visibility: t.string(),
});

/** v16 private rolling rate ledger. */
const realmChatRateEventV1 = table({ name: 'realm_chat_rate_event_v1' }, {
  eventId: t.string().primaryKey(), fid: t.u64().index(), acceptedAtMicros: t.u64(), bodyDigest: t.string(),
});

/** v16 private exactly-once send receipts. */
const realmChatSendReceiptV1 = table({ name: 'realm_chat_send_receipt_v1' }, {
  operationKey: t.string().primaryKey(), fid: t.u64().index(), requestKey: t.string(),
  bodyDigest: t.string(), messageId: t.string().unique(), sequence: t.u64().unique(), createdAt: t.timestamp(),
});

/** v16 private one-reporter/one-message evidence. */
const realmChatReportV1 = table({ name: 'realm_chat_report_v1' }, {
  reportOrdinal: t.u64().primaryKey().autoInc(), reportKey: t.string().unique(),
  reportId: t.string().unique(), reporterFid: t.u64().index(), messageId: t.string().index(),
  reportedSenderFid: t.u64(), messageSequence: t.u64(), category: t.string(), details: t.string(),
  contextFirstSequence: t.u64(), contextLastSequence: t.u64(), createdAt: t.timestamp(),
  status: t.string().index(), reviewedAt: t.option(t.timestamp()), resolutionCode: t.option(t.string()),
});

/** v16 private globally bounded one-day report-ingress ledger. */
const realmChatReportRateEventV1 = table({ name: 'realm_chat_report_rate_event_v1' }, {
  eventId: t.string().primaryKey(), reporterFid: t.u64().index(), acceptedAtMicros: t.u64(),
});

const greaterRealmReleaseV1 = table(
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
    importEpoch: t.u64(),
    publicName: t.option(t.string()),
    componentManifestJson: t.string(),
    regionManifestJson: t.option(t.string()),
    regionVerificationJson: t.string(),
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

/** Private bounded streaming manifest plus its canonical authenticated payload. */
const greaterRealmChunkV1 = table(
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

/** Private connected-component manifest for Tier-I reachability closure. */
const greaterRealmNavigationComponentV1 = table(
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

/**
 * Private declassified Tier-I cell authority. It retains only a route parent
 * direction and depth: no private neighbour, gate, hidden-region, or
 * downstream-water identifier may cross this boundary.
 */
const greaterRealmCellV1 = table(
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

/** Private Tier-I founding capacity. Allocation ranks are assigned at finalize. */
const greaterRealmCastleSlotV1 = table(
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

/** Private relocation/founding plan. This subtask intentionally has no writer. */
const greaterRealmCastleClaimV1 = table(
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

/** Public identity-minimized occupied-cell projection. */
const greaterRealmCellOccupancyV1 = table(
  { name: 'greater_realm_cell_occupancy_v1', public: true },
  {
    cellKey: t.string().primaryKey(),
    atlasId: t.string().index(),
    regionId: t.string().index(),
    castleId: t.u64().unique(),
    atlasRevision: t.u64(),
    occupiedAt: t.timestamp(),
  },
);

/** Private Tier-I resource catalogue. Balances and assignments remain elsewhere. */
const greaterRealmResourceNodeV1 = table(
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

/** Private quiet-window and rollback envelope. No activation writer exists yet. */
const greaterRealmActivationV1 = table(
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

/** Public protocol-v17 atlas header; only six accessible Tier-I regions exist. */
const realmAtlasV1 = table(
  { name: 'realm_atlas_v1', public: true },
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

/** Public aggregate for one of the exact six approved Tier-I region names. */
const realmAtlasVisibleRegionV1 = table(
  { name: 'realm_atlas_visible_region_v1', public: true },
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

/** Public v17 worker-system readiness projection; v1 remains byte-exact. */
const realmWorkerSystemV2 = table(
  { name: 'realm_worker_system_v2', public: true },
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


const db = schema({
  allowedFid, worldTile, player, castle, adminAudit, playerV2, playerOwnershipV2,
  realmV1, worldTileMetaV1, castleSlotV1, castleSlotClaimV1, realmProfileV1, markAccountV1,
  snapBurnCreditV1, fidWalletAttributionV1, walletAttributionSnapshotV1, snapScanCursorV1,
  snapScanBatchV1, alphaTermsAcceptanceV1, resourceAccountV1, goldSiteV1, goldNodeOccupationV1,
  goldExpeditionV1, goldExpeditionIdempotencyV1, goldExpeditionScheduleV1, realmForestLayoutV1,
  realmForestInstanceV1, foodSiteV1, foodNodeOccupationV1, foodExpeditionV1,
  foodExpeditionIdempotencyV1, foodExpeditionScheduleV1, woodSiteV1, woodNodeOccupationV1,
  woodExpeditionV1, woodExpeditionIdempotencyV1, woodExpeditionScheduleV1, realmWaterLayoutV1,
  realmWaterBodyV1, realmWaterCellV1, realmEnvironmentV1, stoneSiteV1,
  stoneNodeOccupationV1, stoneExpeditionV1, stoneExpeditionIdempotencyV1,
  stoneExpeditionScheduleV1, realmWaterRevisionV1, realmWorkerSystemV1, castleWorkerV1,
  workerAssignmentV1, workerNodeOccupationV1, workerCommandIdempotencyV1, workerAssignmentScheduleV1,
  accessRequestV1, dailyMarkGrantV1, dailyMarkScheduleV1,
  innerKeepLayoutV1, innerKeepSlotV1, innerKeepBuildingCatalogV1, innerKeepBuildLevelV1,
  castleInnerKeepBuildingV1, castleInnerBuilderV1, castleInnerBuildReceiptV1,
  castleInnerConstructionScheduleV1,
  // Additive v16 Realm Chat suffix. Refs 0-63 above remain frozen verbatim.
  realmChatStatusV1, realmChatChannelV1, realmChatMessageV1, realmChatRecentV1,
  realmChatRateEventV1, realmChatSendReceiptV1, realmChatReportV1,
  realmChatReportRateEventV1,
  // Additive v17 Greater Realm suffix. Refs 0-71 above remain frozen verbatim.
  greaterRealmReleaseV1, greaterRealmChunkV1, greaterRealmNavigationComponentV1,
  greaterRealmCellV1, greaterRealmCastleSlotV1, greaterRealmCastleClaimV1,
  greaterRealmCellOccupancyV1, greaterRealmResourceNodeV1, greaterRealmActivationV1,
  realmAtlasV1, realmAtlasVisibleRegionV1, realmWorkerSystemV2,
});

export const runWorkerAssignmentScheduleV1 = db.reducer(
  { name: 'run_worker_assignment_schedule_v_1' },
  { arg: workerAssignmentScheduleV1.rowType },
  () => {},
);

/** Scheduler-only v14 wire; the schema fixture deliberately performs no grant. */
export const runDailyMarkScheduleV1 = db.reducer(
  { name: 'run_daily_mark_schedule_v_1' },
  { arg: dailyMarkScheduleV1.rowType },
  () => {},
);

/** Retain the populated v14 suffix helper across the v15 append. */
export const fixtureSeedDailyMarksSentinelV14 = db.reducer(
  { name: 'fixture_seed_daily_marks_sentinel_v14' },
  ctx => {
    if (ctx.db.dailyMarkGrantV1.count() !== 0n || ctx.db.dailyMarkScheduleV1.count() !== 0n) {
      throw new Error('FIXTURE_DAILY_MARKS_NOT_EMPTY');
    }
    ctx.db.dailyMarkGrantV1.insert({
      grantKey: 'migration-daily-mark-grant-v14',
      fid: 991_251n,
      utcDay: 20_000n,
      amountMicros: 1_000_000n,
      policyVersion: 'migration-daily-marks-v14',
      grantedAt: ctx.timestamp,
    });
    ctx.db.dailyMarkScheduleV1.insert({
      scheduleId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 31_536_000_000_000n),
      policyVersion: 'migration-daily-marks-v14',
    });
  },
);

/** Scheduler-only v15 wire; fixture rows prove persistence, not gameplay. */
export const runInnerKeepConstructionScheduleV1 = db.reducer(
  { name: 'run_inner_keep_construction_schedule_v_1' },
  { arg: castleInnerConstructionScheduleV1.rowType },
  () => {},
);

/** Populates the seven state-bearing v15 tables; the retired slot table stays empty. */
export const fixtureSeedInnerKeepSentinelV15 = db.reducer(
  { name: 'fixture_seed_inner_keep_sentinel_v15' },
  ctx => {
    if (
      ctx.db.innerKeepLayoutV1.count() !== 0n
      || ctx.db.innerKeepSlotV1.count() !== 0n
      || ctx.db.innerKeepBuildingCatalogV1.count() !== 0n
      || ctx.db.innerKeepBuildLevelV1.count() !== 0n
      || ctx.db.castleInnerKeepBuildingV1.count() !== 0n
      || ctx.db.castleInnerBuilderV1.count() !== 0n
      || ctx.db.castleInnerBuildReceiptV1.count() !== 0n
      || ctx.db.castleInnerConstructionScheduleV1.count() !== 0n
    ) throw new Error('FIXTURE_INNER_KEEP_NOT_EMPTY');
    const castleId = 991_301n;
    const fid = 991_302n;
    const layoutId = 'migration-inner-keep-layout';
    const buildingKind = 'migration-inner-keep-building';
    const buildingKey = `${castleId}:${buildingKind}`;
    const localXMicrounits = 14_000_000n;
    const localZMicrounits = -10_000_000n;
    const rotationMilliDegrees = 90_000;
    const startedAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    const completesAtMicros = startedAtMicros + 86_400_000_000n;
    ctx.db.innerKeepLayoutV1.insert({
      layoutId, layoutVersion: 1, policyVersion: 'migration-inner-keep-v1',
      slotCount: 0, mediumSlotCount: 0, largeSlotCount: 0,
      assetCatalogDigest: '2'.repeat(64), layoutDigest: '3'.repeat(64),
      active: false, createdAt: ctx.timestamp, activatedAt: undefined,
    });
    ctx.db.innerKeepBuildingCatalogV1.insert({
      buildingKind, publicLabel: 'Migration Building', category: 'economy',
      footprintClass: 'medium', maximumLevel: 5, uniquePerCastle: true,
      matchingDiscountResource: 'food', discountBasisPointsPerLevel: 500,
      discountCapBasisPoints: 2_500, runtimeAssetId: 'migration.runtime',
      previewAssetId: 'migration.preview', active: true, policyVersion: 'migration-inner-keep-v1',
    });
    ctx.db.innerKeepBuildLevelV1.insert({
      levelKey: `${buildingKind}:1`, buildingKind, targetLevel: 1, baseFoodCost: 300n,
      baseWoodCost: 900n, baseStoneCost: 600n, baseGoldCost: 0n,
      levelMultiplierBasisPoints: 10_000, durationMicros: 86_400_000_000n,
      policyVersion: 'migration-inner-keep-v1',
    });
    ctx.db.castleInnerKeepBuildingV1.insert({
      buildingKey, castleId, buildingKind,
      localXMicrounits, localZMicrounits, rotationMilliDegrees,
      completedLevel: 0, targetLevel: 1, phase: 'constructing', startedAtMicros,
      completesAtMicros, revision: 0n, policyVersion: 'migration-inner-keep-v1',
    });
    ctx.db.castleInnerBuilderV1.insert({
      castleId, fid, activeBuildingKey: buildingKey, busyUntilMicros: completesAtMicros,
      revision: 1n, policyVersion: 'migration-inner-keep-v1', createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ctx.db.castleInnerBuildReceiptV1.insert({
      receiptKey: `${fid}:migration-inner-keep-request`, fid,
      requestKey: 'migration-inner-keep-request', castleId, buildingKey, buildingKind,
      localXMicrounits, localZMicrounits, rotationMilliDegrees,
      targetLevel: 1, deductedFood: 300n, deductedWood: 900n, deductedStone: 600n,
      deductedGold: 0n, startedAt: ctx.timestamp, policyVersion: 'migration-inner-keep-v1',
    });
    ctx.db.castleInnerConstructionScheduleV1.insert({
      scheduleId: 0n, scheduledAt: ScheduleAt.time(completesAtMicros), buildingKey,
      expectedRevision: 0n, expectedTargetLevel: 1,
    });
  },
);

/** One typed row per additive-v16 Realm Chat table for populated rollback and preservation proof. */
export const fixtureSeedRealmChatSentinelV16 = db.reducer(
  { name: 'fixture_seed_realm_chat_sentinel_v16' },
  ctx => {
    if (
      ctx.db.realmChatStatusV1.count() !== 0n
      || ctx.db.realmChatChannelV1.count() !== 0n
      || ctx.db.realmChatMessageV1.count() !== 0n
      || ctx.db.realmChatRecentV1.count() !== 0n
      || ctx.db.realmChatRateEventV1.count() !== 0n
      || ctx.db.realmChatSendReceiptV1.count() !== 0n
      || ctx.db.realmChatReportV1.count() !== 0n
      || ctx.db.realmChatReportRateEventV1.count() !== 0n
    ) throw new Error('FIXTURE_REALM_CHAT_NOT_EMPTY');
    const channelKey = 'realm:genesis-001';
    const messageId = '018f7b44-5f2f-7c54-8c0d-3f521d46b193';
    const requestKey = '00000000-0000-7000-8000-000000000002';
    ctx.db.realmChatStatusV1.insert({
      channelKey, realmId: 'HEGEMONY_GENESIS_001', policyVersion: 'migration-chat-v1',
      mode: 'staged', recentLimit: 128, historyPageLimit: 50, updatedAt: ctx.timestamp,
    });
    ctx.db.realmChatChannelV1.insert({
      channelKey, realmId: 'HEGEMONY_GENESIS_001', policyVersion: 'migration-chat-v1',
      mode: 'staged', nextSequence: 2n, pendingReports: 1, updatedAt: ctx.timestamp,
    });
    ctx.db.realmChatMessageV1.insert({
      messageId, sequence: 1n, channelKey, senderFid: 991_301n, body: 'migration sentinel',
      sentAt: ctx.timestamp, visibility: 'visible', moderatedAt: undefined, moderationCode: undefined,
    });
    ctx.db.realmChatRecentV1.insert({
      sequence: 1n, messageId, channelKey, senderFid: 991_301n, body: 'migration sentinel',
      sentAt: ctx.timestamp, visibility: 'visible',
    });
    ctx.db.realmChatRateEventV1.insert({
      eventId: messageId, fid: 991_301n,
      acceptedAtMicros: ctx.timestamp.microsSinceUnixEpoch, bodyDigest: '0000000000000000',
    });
    ctx.db.realmChatSendReceiptV1.insert({
      operationKey: `991301:${requestKey}`, fid: 991_301n,
      requestKey, bodyDigest: '0000000000000000',
      messageId, sequence: 1n, createdAt: ctx.timestamp,
    });
    ctx.db.realmChatReportV1.insert({
      reportOrdinal: 0n, reportKey: `991302:${messageId}`,
      reportId: '018f7b44-5f2f-7c54-8c0d-3f521d46b195', reporterFid: 991_302n,
      messageId, reportedSenderFid: 991_301n, messageSequence: 1n,
      category: 'other', details: 'migration sentinel', contextFirstSequence: 1n,
      contextLastSequence: 11n, createdAt: ctx.timestamp, status: 'pending',
      reviewedAt: undefined, resolutionCode: undefined,
    });
    ctx.db.realmChatReportRateEventV1.insert({
      eventId: '018f7b44-5f2f-7c54-8c0d-3f521d46b195', reporterFid: 991_302n,
      acceptedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  },
);

/** Retain the v13 populated-suffix fixture reducer across the v14 append. */
export const fixtureSeedAccessRequestSentinelV13 = db.reducer(
  { name: 'fixture_seed_access_request_sentinel_v13' },
  ctx => {
    if (ctx.db.accessRequestV1.count() !== 0n) {
      throw new Error('FIXTURE_ACCESS_REQUEST_NOT_EMPTY');
    }
    ctx.db.accessRequestV1.insert({
      fid: 991_201n,
      requestCycle: 1n,
      requestedAt: ctx.timestamp,
    });
  },
);

export const runGoldExpeditionScheduleV1 = db.reducer(
  { name: 'run_gold_expedition_schedule_v_1' },
  { arg: goldExpeditionScheduleV1.rowType },
  (ctx, { arg }) => {
    try { runGoldExpeditionSchedule(ctx as any, arg as any); }
    catch (error) { const code = goldExpeditionErrorCode(error); throw new SenderError(code ?? 'GOLD_SCHEDULE_ERROR'); }
  },
);
export const runFoodExpeditionScheduleV1 = db.reducer(
  { name: 'run_food_expedition_schedule_v_1' },
  { arg: foodExpeditionScheduleV1.rowType },
  (ctx, { arg }) => {
    try { runFoodExpeditionSchedule(ctx as any, arg as any); }
    catch (error) { const code = foodExpeditionErrorCode(error); throw new SenderError(code ?? 'FOOD_SCHEDULE_ERROR'); }
  },
);
export const runWoodExpeditionScheduleV1 = db.reducer(
  { name: 'run_wood_expedition_schedule_v_1' },
  { arg: woodExpeditionScheduleV1.rowType },
  (ctx, { arg }) => {
    try { runWoodExpeditionSchedule(ctx as any, arg as any); }
    catch (error) { const code = woodExpeditionErrorCode(error); throw new SenderError(code ?? 'WOOD_SCHEDULE_ERROR'); }
  },
);
export const runStoneExpeditionScheduleV1 = db.reducer(
  { name: 'run_stone_expedition_schedule_v_1' },
  { arg: stoneExpeditionScheduleV1.rowType },
  (ctx, { arg }) => {
    try { runStoneExpeditionSchedule(ctx as any, arg as any); }
    catch (error) { const code = stoneExpeditionErrorCode(error); throw new SenderError(code ?? 'STONE_SCHEDULE_ERROR'); }
  },
);

/** Auth-neutral identity fixture; SQL identity literals are issuer-bound. */
export const fixtureInsertPlayerOwnershipV9 = db.reducer(
  { name: 'fixture_insert_player_ownership_v9' },
  { fid: t.u64() },
  (ctx, { fid }) => {
    if (ctx.db.playerOwnershipV2.fid.find(fid) !== null) throw new Error('FIXTURE_OWNERSHIP_EXISTS');
    ctx.db.playerOwnershipV2.insert({ fid, identity: ctx.sender });
  },
);

/** Bounded identity-row assertion; SQL cannot read identity columns across issuers. */
export const fixtureAssertPlayerOwnershipV9 = db.reducer(
  { name: 'fixture_assert_player_ownership_v9' },
  { fid: t.u64(), expectedCount: t.u64() },
  (ctx, { fid, expectedCount }) => {
    if (ctx.db.playerOwnershipV2.count() !== expectedCount) throw new Error('FIXTURE_OWNERSHIP_COUNT_INVALID');
    if (expectedCount === 0n) {
      if (ctx.db.playerOwnershipV2.fid.find(fid) !== null) throw new Error('FIXTURE_OWNERSHIP_UNEXPECTED');
      return;
    }
    if (expectedCount !== 1n || ctx.db.playerOwnershipV2.fid.find(fid) === null) {
      throw new Error('FIXTURE_OWNERSHIP_ROW_INVALID');
    }
  },
);

/** Preserve the v9 Water sentinel wire unchanged in the v10 fixture. */
export const fixtureSeedWaterSentinelV9 = db.reducer(
  { name: 'fixture_seed_water_sentinel_v9' },
  ctx => {
    if (
      ctx.db.realmWaterLayoutV1.count() !== 0n
      || ctx.db.realmWaterBodyV1.count() !== 0n
      || ctx.db.realmWaterCellV1.count() !== 0n
      || ctx.db.realmEnvironmentV1.count() !== 0n
    ) throw new Error('FIXTURE_WATER_NOT_EMPTY');
    const realmId = 'MIGRATION_WATER_SENTINEL';
    const bodyId = 'migration-water-body';
    ctx.db.realmWaterLayoutV1.insert({
      realmId,
      layoutVersion: 1,
      policyVersion: 'migration-water-sentinel-v1',
      generationVersion: 3,
      canonicalLandCellCount: 10_000,
      oceanCellCount: 1,
      lakeCellCount: 0,
      lakeBodyCount: 0,
      riverCount: 0,
      riverCellCount: 0,
      seaLevelMilli: 0,
      seaLevelPolicyVersion: 'migration-water-sentinel-v1',
      fogStartDepthCells: 1,
      fogFullDepthCells: 2,
      hiddenBufferCells: 1,
      layoutDigest: '0'.repeat(64),
      sourceCommit: '0'.repeat(40),
      activated: false,
      seededAt: ctx.timestamp,
      activatedAt: undefined,
    });
    ctx.db.realmWaterBodyV1.insert({
      bodyId,
      realmId,
      regime: 'ocean',
      cellCount: 1,
      sourceCellKey: 'migration-water-cell',
      mouthCellKey: 'migration-water-cell',
      surfaceLevelMilli: 0,
      flowDirectionXQ15: 0,
      flowDirectionZQ15: 0,
      wavePreset: 'migration',
      ordinal: 0,
      seed: 0,
      generationVersion: 3,
      layoutVersion: 1,
    });
    ctx.db.realmWaterCellV1.insert({
      cellKey: 'migration-water-cell',
      realmId,
      q: 0,
      r: 0,
      regime: 'ocean',
      bodyId,
      depthCells: 1,
      elevationMilli: 0,
      surfaceLevelMilli: 0,
      ring: 0,
      s: 0,
      underlyingTileKey: undefined,
      riverOrdinal: undefined,
      riverOrder: undefined,
      downstreamWaterCellKey: undefined,
      flowAccumulation: 0,
      depthClass: 1,
      oceanDepth: 1,
      bankSeed: 0,
      generationVersion: 3,
      fogBand: 'clear',
      layoutVersion: 1,
    });
    ctx.db.realmEnvironmentV1.insert({
      realmId,
      environmentEpoch: 1n,
      waterLayoutVersion: 1,
      seaLevelMilli: 0,
      sunDirectionXMicro: 0,
      sunDirectionYMicro: 1_000_000,
      sunDirectionZMicro: 0,
      updatedAt: ctx.timestamp,
    });
  },
);

/** One typed row per v10 Stone table for the next additive migration. */
export const fixtureSeedStoneSentinelV10 = db.reducer(
  { name: 'fixture_seed_stone_sentinel_v10' },
  ctx => {
    if (
      ctx.db.stoneSiteV1.count() !== 0n
      || ctx.db.stoneNodeOccupationV1.count() !== 0n
      || ctx.db.stoneExpeditionV1.count() !== 0n
      || ctx.db.stoneExpeditionIdempotencyV1.count() !== 0n
      || ctx.db.stoneExpeditionScheduleV1.count() !== 0n
    ) throw new Error('FIXTURE_STONE_NOT_EMPTY');
    const startedAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    const arrivesAtMicros = startedAtMicros + 7n * 24n * 60n * 60n * 1_000_000n;
    const gatheringEndsAtMicros = arrivesAtMicros + 24n * 60n * 60n * 1_000_000n;
    const returnsAtMicros = gatheringEndsAtMicros + 24n * 60n * 60n * 1_000_000n;
    const siteId = 'migration-stone-site';
    const expeditionId = 'migration-stone-expedition';
    const originCastleId = 991_001n;
    const fid = 991_002n;
    ctx.db.stoneSiteV1.insert({ siteId, q: 1, r: -1, tier: 1, active: true });
    ctx.db.stoneNodeOccupationV1.insert({
      siteId,
      originCastleId,
      phase: 'outbound',
      startedAtMicros,
      arrivesAtMicros,
      gatheringEndsAtMicros,
      returnsAtMicros,
    });
    ctx.db.stoneExpeditionV1.insert({
      expeditionId,
      fid,
      originCastleId,
      siteId,
      phase: 'outbound',
      startedAtMicros,
      arrivesAtMicros,
      gatheringEndsAtMicros,
      returnsAtMicros,
      settledThroughMicros: startedAtMicros,
      accruedStone: 0n,
      creditedStone: 0n,
      policyVersion: 'migration-stone-sentinel-v1',
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ctx.db.stoneExpeditionIdempotencyV1.insert({
      requestKey: 'migration-stone-sentinel-request-0001',
      fid,
      siteId,
      expeditionId,
      createdAt: ctx.timestamp,
    });
    ctx.db.stoneExpeditionScheduleV1.insert({
      scheduleId: 0n,
      scheduledAt: ScheduleAt.time(arrivesAtMicros),
      originCastleId,
      siteId,
      stage: 'arrival',
    });
  },
);

/** Typed v11 sentinel used only to prove rollback refusal and row survival. */
export const fixtureSeedWaterRevisionSentinelV11 = db.reducer(
  { name: 'fixture_seed_water_revision_sentinel_v11' },
  ctx => {
    if (ctx.db.realmWaterRevisionV1.count() !== 0n) {
      throw new Error('FIXTURE_WATER_REVISION_NOT_EMPTY');
    }
    ctx.db.realmWaterRevisionV1.insert({
      realmId: 'MIGRATION_WATER_SENTINEL',
      revisionVersion: 2,
      policyVersion: 'migration-water-revision-sentinel-v1',
      baseLayoutVersion: 1,
      baseLayoutDigest: '0'.repeat(64),
      oceanBodyCount: 1,
      riverBodyCount: 0,
      enabledBodyCount: 1,
      oceanCellCount: 1,
      riverCellCount: 0,
      enabledCellCount: 1,
      lakeBodyCount: 0,
      lakeCellCount: 0,
      riverWidthCells: 1,
      navigationFogBoundaryDepthCells: 2,
      hiddenBufferCells: 1,
      revisionDigest: '1'.repeat(64),
      sourceCommit: '1'.repeat(40),
      activated: false,
      seededAt: ctx.timestamp,
      activatedAt: undefined,
    });
  },
);

const FIXTURE_RESOURCE_QUANTUM_MICROS = 600_000_000n;
const FIXTURE_RESOURCE_POLICY_VERSION = 'genesis-resource-yield-v1';

export const fixtureRewindResourceOneQuantum = db.reducer(
  { name: 'fixture_rewind_resource_one_quantum' },
  { fid: t.u64() },
  (ctx, { fid }) => {
    const row = ctx.db.resourceAccountV1.fid.find(fid);
    if (
      row === null
      || row.policyVersion !== FIXTURE_RESOURCE_POLICY_VERSION
      || row.revision !== 0n
      || row.food !== 0n
      || row.wood !== 0n
      || row.stone !== 0n
      || row.gold !== 0n
      || row.settledThroughMicros < FIXTURE_RESOURCE_QUANTUM_MICROS
    ) throw new Error('FIXTURE_RESOURCE_STATE_INVALID');
    const rewoundMicros = row.settledThroughMicros - FIXTURE_RESOURCE_QUANTUM_MICROS;
    ctx.db.resourceAccountV1.fid.update({
      ...row,
      settledThroughMicros: rewoundMicros,
      createdAt: new Timestamp(rewoundMicros),
      updatedAt: ctx.timestamp,
    });
  },
);

/** Populates every v12 table with bounded, auth-neutral rows for migration proof. */
export const fixtureSeedGenericWorkerSentinelV12 = db.reducer(
  { name: 'fixture_seed_generic_worker_sentinel_v12' },
  ctx => {
    if (
      ctx.db.realmWorkerSystemV1.count() !== 0n
      || ctx.db.castleWorkerV1.count() !== 0n
      || ctx.db.workerAssignmentV1.count() !== 0n
      || ctx.db.workerNodeOccupationV1.count() !== 0n
      || ctx.db.workerCommandIdempotencyV1.count() !== 0n
      || ctx.db.workerAssignmentScheduleV1.count() !== 0n
    ) throw new Error('FIXTURE_WORKER_NOT_EMPTY');
    const castleId = 991_101n;
    const fid = 991_102n;
    const startedAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    const arrivesAtMicros = startedAtMicros + 30_000_000n;
    const gatheringEndsAtMicros = arrivesAtMicros + 86_400_000_000n;
    const returnsAtMicros = gatheringEndsAtMicros + 30_000_000n;
    const assignmentId = 'migration-worker-assignment-0001';
    const workerId = 'genesis-001-castle-991101-worker-01';
    const siteId = 'migration-worker-site';
    ctx.db.realmWorkerSystemV1.insert({
      realmId: 'GENESIS_001',
      policyVersion: 'genesis-001-castle-workers-v1',
      workersPerCastle: 4,
      expectedCastleCount: 1,
      expectedWorkerCount: 4,
      rosterDigest: 'migration-worker-roster-digest',
      mode: 'staged',
      legacyDrainRequired: true,
      createdAt: ctx.timestamp,
      activatedAt: undefined,
    });
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      ctx.db.castleWorkerV1.insert({
        workerId: `genesis-001-castle-991101-worker-0${ordinal}`,
        originCastleId: castleId,
        ordinal,
        status: ordinal === 1 ? 'gathering' : 'idle',
        resourceKind: ordinal === 1 ? 'stone' : undefined,
        siteId: ordinal === 1 ? siteId : undefined,
        startedAtMicros: ordinal === 1 ? startedAtMicros : undefined,
        arrivesAtMicros: ordinal === 1 ? arrivesAtMicros : undefined,
        gatheringEndsAtMicros: ordinal === 1 ? gatheringEndsAtMicros : undefined,
        returnStartedAtMicros: undefined,
        returnsAtMicros: ordinal === 1 ? returnsAtMicros : undefined,
        routeSteps: ordinal === 1 ? 1 : undefined,
        returnStartProgressBasisPoints: undefined,
        timelineRevision: 0,
        revision: 0n,
      });
    }
    ctx.db.workerAssignmentV1.insert({
      assignmentId,
      workerId,
      fid,
      originCastleId: castleId,
      resourceKind: 'stone',
      siteId,
      phase: 'gathering',
      startedAtMicros,
      arrivesAtMicros,
      gatheringEndsAtMicros,
      returnStartedAtMicros: undefined,
      returnsAtMicros,
      routeSteps: 1,
      returnStartProgressBasisPoints: 0,
      settledThroughMicros: arrivesAtMicros,
      accruedAmount: 0n,
      materializedAmount: 0n,
      timelineRevision: 0,
      policyVersion: 'genesis-001-castle-workers-v1',
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ctx.db.workerNodeOccupationV1.insert({
      nodeKey: 'stone:migration-worker-site',
      resourceKind: 'stone',
      siteId,
      workerId,
      workerOrdinal: 1,
      originCastleId: castleId,
      phase: 'gathering',
      startedAtMicros,
      arrivesAtMicros,
      gatheringEndsAtMicros,
      timelineRevision: 0,
    });
    ctx.db.workerCommandIdempotencyV1.insert({
      requestKey: '991102:migration-worker-request-0001',
      fid,
      workerId,
      commandKind: 'dispatch',
      resourceKind: 'stone',
      siteId,
      assignmentId,
      resultRevision: 0n,
      createdAt: ctx.timestamp,
    });
    ctx.db.workerAssignmentScheduleV1.insert({
      scheduleId: 0n,
      scheduledAt: ScheduleAt.time(gatheringEndsAtMicros),
      assignmentId,
      workerId,
      timelineRevision: 0,
      stage: 'gathering-expiry',
    });
  },
);

/** Populates every v17 suffix table with one auth-neutral migration sentinel. */
export const fixtureSeedGreaterRealmSentinelV17 = db.reducer(
  { name: 'fixture_seed_greater_realm_sentinel_v17' },
  ctx => {
    const atlasId = 'migration-greater-realm-atlas';
    const releaseId = 'migration-greater-realm-release';
    const componentKey = 'migration-greater-realm-component';
    const chunkHandle = 'migration-greater-realm-chunk';
    const cellKey = 'T1_LOWLANDS:0:0';
    const slotId = 'migration-greater-realm-slot';
    const activationId = 'migration-greater-realm-activation';
    ctx.db.greaterRealmReleaseV1.insert({
      atlasId,
      publicReleaseId: releaseId,
      publicApprovalReceiptId: 'migration-greater-realm-approval',
      sourceCommit: '0000000000000000000000000000000000000000',
      generatorVersion: 'migration-v1',
      sourceFormatVersion: 'migration-v1',
      livingWorldVersion: 'migration-v1',
      runtimePartitionVersion: 'axial-bin-15-tier-one-filter-v1',
      rendererContractVersion: 'migration-v1',
      expectedRegionCount: 1,
      expectedComponentCount: 1,
      expectedChunkCount: 1,
      expectedCellCount: 1,
      expectedSlotCount: 1,
      expectedResourceNodeCount: 1,
      componentExpectedCellCount: 1,
      componentExpectedSlotCount: 1,
      componentExpectedResourceNodeCount: 1,
      importedPassableCellCount: 1,
      expectedReleaseSha256: 'migration-release-sha',
      importEpoch: 1n,
      publicName: 'Migration Greater Realm',
      componentManifestJson: '[]\n',
      regionManifestJson: '[]\n',
      regionVerificationJson: '[]\n',
      nextChunkOrdinal: 1,
      verificationPhase: 'complete',
      verificationCursor: 0n,
      verificationDigest: 'migration-verification-digest',
      verifiedComponentCount: 1,
      verifiedChunkCount: 1,
      verifiedCellCount: 1,
      verifiedSlotCount: 1,
      verifiedResourceNodeCount: 1,
      state: 'ready',
      approvedAt: ctx.timestamp,
      stagedAt: ctx.timestamp,
      readyAt: ctx.timestamp,
    });
    ctx.db.greaterRealmChunkV1.insert({
      chunkHandle,
      atlasId,
      chunkCoordKey: 'B:0:0',
      importOrdinal: 0,
      binQ: 0,
      binR: 0,
      firstCellOrdinal: 0,
      coreCellCount: 1,
      apronCellCount: 0,
      lod0CellCount: 1,
      lod1CellCount: 1,
      lod2CellCount: 1,
      lod3CellCount: 1,
      payloadSha256: 'migration-payload-sha',
      payloadJson: '{}\n',
      importedAt: ctx.timestamp,
    });
    ctx.db.greaterRealmNavigationComponentV1.insert({
      componentKey,
      atlasId,
      componentOrdinal: 0,
      regionMask: 1,
      rootCellKey: cellKey,
      expectedCellCount: 1,
      importedCellCount: 1,
      verifiedCellCount: 1,
      verifiedRegionMask: 1,
      verifiedMaxRouteDepth: 0,
      maxRouteDepth: 0,
      expectedSlotCount: 1,
      importedSlotCount: 1,
      expectedFoodNodeCount: 1,
      importedFoodNodeCount: 1,
      expectedWoodNodeCount: 0,
      importedWoodNodeCount: 0,
      expectedStoneNodeCount: 0,
      importedStoneNodeCount: 0,
      expectedGoldNodeCount: 0,
      importedGoldNodeCount: 0,
      verifiedSlotCount: 1,
      verifiedFoodNodeCount: 1,
      verifiedWoodNodeCount: 0,
      verifiedStoneNodeCount: 0,
      verifiedGoldNodeCount: 0,
      componentSha256: 'migration-component-sha',
      verificationPhase: 'complete',
      verificationDigest: 'migration-component-sha',
      regionVerificationJson: '[]\n',
      active: true,
    });
    ctx.db.greaterRealmCellV1.insert({
      cellKey,
      atlasCoordKey: 'A:0:0',
      releaseOrdinal: 0,
      atlasId,
      chunkHandle,
      regionId: 'T1_LOWLANDS',
      componentKey,
      localQ: 0,
      localR: 0,
      atlasQ: 0,
      atlasR: 0,
      tier: 1,
      passable: true,
      elevation: 0,
      slope: 0,
      aspect: 0,
      profileCurvature: 0,
      planCurvature: 0,
      ridgeId: undefined,
      geologicalBarrierBand: 0,
      biomeClass: 0,
      landformClass: 0,
      yieldClass: 0,
      movementCost: 1,
      sealedBoundaryMask: 63,
      hydroRegime: 0,
      hydroBodyId: undefined,
      hydroDepthClass: 0,
      hydroSurfaceMilli: 0,
      hydroFlowDirection: undefined,
      flowAccumulation: 0n,
      bankVariant: 0,
      hydrologyRevision: 0,
      routeParentDirection: undefined,
      routeDepth: 0,
      travelClass: 1,
      wetness: 0,
      exposure: 0,
      coastDistance: 0,
      freshwaterDistance: 0,
      temperature: 0,
      moisture: 0,
      habitatClass: 0,
      canopyBasisPoints: 0,
      groundcoverBasisPoints: 0,
      wildflowerBasisPoints: 0,
      featureClass: 0,
      ambienceClass: 0,
      presentationVariant: 0,
    });
    ctx.db.greaterRealmCastleSlotV1.insert({
      slotId,
      releaseOrdinal: 0,
      atlasId,
      cellKey,
      regionId: 'T1_LOWLANDS',
      componentKey,
      legacySlotId: 1,
      tier: 1,
      regionOrderRank: 0,
      allocationRank: 0,
      active: true,
    });
    ctx.db.greaterRealmCastleClaimV1.insert({
      slotId,
      ownerFid: 991_201n,
      castleId: 991_202n,
      atlasId,
      activationId,
      state: 'active',
      claimKind: 'relocated',
      allocationSequence: 0n,
      plannedAt: ctx.timestamp,
      activatedAt: ctx.timestamp,
      legacySlotId: 1,
      legacyClaimedAt: ctx.timestamp,
      legacyGenerationVersion: 3,
      legacyTileKey: '0,0',
      legacyQ: 0,
      legacyR: 0,
    });
    ctx.db.greaterRealmCellOccupancyV1.insert({
      cellKey,
      atlasId,
      regionId: 'T1_LOWLANDS',
      castleId: 991_202n,
      atlasRevision: 1n,
      occupiedAt: ctx.timestamp,
    });
    ctx.db.greaterRealmResourceNodeV1.insert({
      nodeId: 'migration-greater-realm-node',
      releaseOrdinal: 0,
      atlasId,
      locationId: 'migration-greater-realm-location',
      cellKey,
      regionId: 'T1_LOWLANDS',
      componentKey,
      resourceKind: 'food',
      tier: 1,
      nodeOrdinal: 0,
      allocationRank: 0,
      legacyCatalogId: 'migration-food-site',
      policyVersion: 'migration-v1',
      active: true,
    });
    ctx.db.greaterRealmActivationV1.insert({
      activationId,
      atlasId,
      quietEpoch: 1n,
      mode: 'active',
      snapshotCastleCount: 1,
      snapshotWorkerCount: 4,
      snapshotResourceAccountCount: 1,
      snapshotMarkAccountCount: 1,
      snapshotInnerKeepBuildingCount: 0,
      snapshotClaimCount: 1,
      snapshotOccupancyCount: 1,
      snapshotCastleDigest: 'migration-castle-digest',
      snapshotWorkerDigest: 'migration-worker-digest',
      snapshotResourceDigest: 'migration-resource-digest',
      snapshotMarksDigest: 'migration-marks-digest',
      snapshotInnerKeepDigest: 'migration-inner-keep-digest',
      snapshotScheduleDigest: 'migration-schedule-digest',
      topologySnapshotDigest: 'migration-topology-digest',
      relocationPlanDigest: 'migration-relocation-digest',
      nextAllocationSequence: 1n,
      postCanaryFoundingCount: 0,
      postCanaryDispatchCount: 0,
      actorSubject: 'migration-admin',
      preparedAt: ctx.timestamp,
      drainingAt: ctx.timestamp,
      frozenAt: ctx.timestamp,
      plannedAt: ctx.timestamp,
      canaryAt: ctx.timestamp,
      activatedAt: ctx.timestamp,
      haltedAt: undefined,
      rolledBackAt: undefined,
    });
    ctx.db.realmAtlasV1.insert({
      atlasId,
      publicReleaseId: releaseId,
      name: 'Migration Greater Realm',
      protocolVersion: 17,
      generatorVersion: 'migration-v1',
      runtimePartitionVersion: 'axial-bin-15-tier-one-filter-v1',
      rendererContractVersion: 'migration-v1',
      revision: 1n,
      visibleTierMax: 1,
      navigationTierMax: 1,
      foundingTierMax: 1,
      visibleRegionCount: 1,
      visibleCellCount: 1,
      visibleChunkCount: 1,
      castleCapacity: 1,
      mode: 'active',
      createdAt: ctx.timestamp,
      activatedAt: ctx.timestamp,
    });
    ctx.db.realmAtlasVisibleRegionV1.insert({
      regionId: 'T1_LOWLANDS',
      atlasId,
      ordinal: 0,
      publicName: 'The Hegemony Lowlands',
      tier: 1,
      cellCount: 1,
      passableCellCount: 1,
      chunkCount: 1,
      castleCapacity: 1,
      resourceLocationCount: 1,
      resourceNodeCount: 1,
      foodNodeCount: 1,
      woodNodeCount: 0,
      stoneNodeCount: 0,
      goldNodeCount: 0,
      active: true,
    });
    ctx.db.realmWorkerSystemV2.insert({
      atlasId,
      policyVersion: 'migration-v1',
      workersPerCastle: 4,
      castleCapacity: 1,
      currentCastleCount: 1,
      currentWorkerCount: 4,
      rosterDigest: 'migration-roster-digest',
      mode: 'active',
      createdAt: ctx.timestamp,
      activatedAt: ctx.timestamp,
    });
  },
);

export default db;
