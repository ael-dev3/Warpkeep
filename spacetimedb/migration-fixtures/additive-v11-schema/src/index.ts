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
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILE_META,
  CANONICAL_WORLD_TILES,
} from '../../../src/world';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
} from '../../../src/goldSitePolicy';
import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
} from '../../../src/foodSitePolicy';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
} from '../../../src/woodSitePolicy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
} from '../../../src/stoneSitePolicy';
import {
  GOLD_EXPEDITION_POLICY_VERSION,
  GOLD_GATHERING_DURATION_MICROS,
} from '../../../src/goldExpeditionPolicy';
import {
  FOOD_EXPEDITION_POLICY_VERSION,
  FOOD_GATHERING_DURATION_MICROS,
} from '../../../src/foodExpeditionPolicy';
import {
  WOOD_EXPEDITION_POLICY_VERSION,
  WOOD_GATHERING_DURATION_MICROS,
} from '../../../src/woodExpeditionPolicy';
import {
  STONE_EXPEDITION_POLICY_VERSION,
  STONE_GATHERING_DURATION_MICROS,
} from '../../../src/stoneExpeditionPolicy';

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
  stoneExpeditionScheduleV1, realmWaterRevisionV1,
});

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

/**
 * One coherent, active v11 predecessor graph for the real v12 Worker cutover
 * rehearsal. The fixture is disposable and loopback-only; it creates no
 * generic Worker table because those tables do not exist until publication.
 */
export const fixtureSeedWorkerCutoverV11 = db.reducer(
  { name: 'fixture_seed_worker_cutover_v11' },
  { fid: t.u64() },
  (ctx, { fid }) => {
    if (
      fid <= 0n
      || ctx.db.worldTile.count() !== 0n
      || ctx.db.realmV1.count() !== 0n
      || ctx.db.castle.count() !== 0n
      || ctx.db.resourceAccountV1.count() !== 0n
      || ctx.db.goldExpeditionV1.count() !== 0n
      || ctx.db.foodExpeditionV1.count() !== 0n
      || ctx.db.woodExpeditionV1.count() !== 0n
      || ctx.db.stoneExpeditionV1.count() !== 0n
    ) throw new Error('FIXTURE_WORKER_CUTOVER_NOT_EMPTY');

    ctx.db.realmV1.insert({ ...CANONICAL_REALM, createdAt: ctx.timestamp });
    for (const tile of CANONICAL_WORLD_TILES) {
      ctx.db.worldTile.insert({ ...tile, occupantCastleId: undefined });
    }
    for (const meta of CANONICAL_WORLD_TILE_META) ctx.db.worldTileMetaV1.insert(meta);
    for (const slot of CANONICAL_CASTLE_SLOTS) ctx.db.castleSlotV1.insert(slot);
    const slot = CANONICAL_CASTLE_SLOTS[0]!;
    const tile = ctx.db.worldTile.key.find(slot.tileKey);
    if (tile === null) throw new Error('FIXTURE_WORKER_CUTOVER_SLOT');

    ctx.db.allowedFid.insert({
      fid,
      enabled: true,
      authEpoch: 1,
      invitedAt: ctx.timestamp,
      invitedBy: 'loopback-worker-cutover-v11',
      note: 'disposable worker cutover predecessor',
    });
    ctx.db.player.insert({
      fid,
      identity: ctx.sender,
      username: 'migration.worker.v11',
      displayName: 'Migration Worker V11',
      pfpUrl: 'https://profiles.example.com/migration-worker-v11.png',
      joinedAt: ctx.timestamp,
      status: 'active',
    });
    ctx.db.playerV2.insert({
      fid,
      username: 'migration.worker.v11',
      displayName: 'Migration Worker V11',
      pfpUrl: 'https://profiles.example.com/migration-worker-v11.png',
      joinedAt: ctx.timestamp,
      status: 'active',
    });
    ctx.db.playerOwnershipV2.insert({ fid, identity: ctx.sender });
    const castleRow = ctx.db.castle.insert({
      castleId: 0n,
      ownerFid: fid,
      tileKey: slot.tileKey,
      q: slot.q,
      r: slot.r,
      level: 1,
      name: 'Hegemony Keep 001',
      createdAt: ctx.timestamp,
    });
    ctx.db.castleSlotClaimV1.insert({
      slotId: slot.slotId,
      ownerFid: fid,
      castleId: castleRow.castleId,
      claimedAt: ctx.timestamp,
      generationVersion: slot.generationVersion,
    });
    ctx.db.worldTile.key.update({ ...tile, occupantCastleId: castleRow.castleId });
    ctx.db.realmProfileV1.insert({
      fid,
      canonicalUsername: 'migration.worker.v11',
      displayName: 'Migration Worker V11',
      pfpUrl: 'https://profiles.example.com/migration-worker-v11.png',
      publicBio: 'Disposable loopback-only Worker cutover fixture',
      admittedAt: ctx.timestamp,
      firstAuthenticatedAt: ctx.timestamp,
      profileUpdatedAt: ctx.timestamp,
      publicStatus: 'active',
      communityStatsVisible: true,
      totalSnapBurnedMicros: 0n,
      marksEarnedMicros: 0n,
      marksSpentMicros: 0n,
      marksBalanceMicros: 0n,
      marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1',
    });
    ctx.db.markAccountV1.insert({
      fid,
      totalSnapBurnedMicros: 0n,
      earnedMicros: 0n,
      spentMicros: 0n,
      balanceMicros: 0n,
      policyVersion: 'snap-current-linked-wallet-1to1-v1',
      updatedAt: ctx.timestamp,
    });
    ctx.db.alphaTermsAcceptanceV1.insert({
      acceptanceKey: `${fid}:2026-07-19-hegemony-entry-agreement-v3`,
      fid,
      termsVersion: '2026-07-19-hegemony-entry-agreement-v3',
      acceptedAt: ctx.timestamp,
    });
    ctx.db.resourceAccountV1.insert({
      fid,
      castleId: castleRow.castleId,
      realmId: CANONICAL_REALM.realmId,
      food: 0n,
      wood: 0n,
      stone: 0n,
      gold: 0n,
      settledThroughMicros: ctx.timestamp.microsSinceUnixEpoch,
      revision: 0n,
      policyVersion: FIXTURE_RESOURCE_POLICY_VERSION,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    for (const site of CANONICAL_TIER_I_GOLD_SITES_V1) ctx.db.goldSiteV1.insert(site);
    for (const site of CANONICAL_TIER_I_FOOD_SITES_V1) ctx.db.foodSiteV1.insert(site);
    for (const site of CANONICAL_TIER_I_WOOD_SITES_V1) ctx.db.woodSiteV1.insert(site);
    for (const site of CANONICAL_TIER_I_STONE_SITES_V1) ctx.db.stoneSiteV1.insert(site);

    const now = ctx.timestamp.microsSinceUnixEpoch;
    const arrivesAtMicros = now - 150_000_000n;
    const startedAtMicros = arrivesAtMicros - 60_000_000n;
    const resources = [
      {
        kind: 'gold',
        site: CANONICAL_TIER_I_GOLD_SITES_V1[0]!,
        duration: GOLD_GATHERING_DURATION_MICROS,
        policy: GOLD_EXPEDITION_POLICY_VERSION,
      },
      {
        kind: 'food',
        site: CANONICAL_TIER_I_FOOD_SITES_V1[0]!,
        duration: FOOD_GATHERING_DURATION_MICROS,
        policy: FOOD_EXPEDITION_POLICY_VERSION,
      },
      {
        kind: 'wood',
        site: CANONICAL_TIER_I_WOOD_SITES_V1[0]!,
        duration: WOOD_GATHERING_DURATION_MICROS,
        policy: WOOD_EXPEDITION_POLICY_VERSION,
      },
      {
        kind: 'stone',
        site: CANONICAL_TIER_I_STONE_SITES_V1[0]!,
        duration: STONE_GATHERING_DURATION_MICROS,
        policy: STONE_EXPEDITION_POLICY_VERSION,
      },
    ] as const;
    for (const resource of resources) {
      const gatheringEndsAtMicros = arrivesAtMicros + resource.duration;
      const returnsAtMicros = gatheringEndsAtMicros + 60_000_000n;
      const expeditionId = `migration-v11-${resource.kind}-expedition`;
      const shared = {
        originCastleId: castleRow.castleId,
        siteId: resource.site.siteId,
        phase: 'gathering',
        startedAtMicros,
        arrivesAtMicros,
        gatheringEndsAtMicros,
        returnsAtMicros,
      };
      const schedule = (table: {
        insert(row: {
          scheduleId: bigint;
          scheduledAt: ScheduleAt;
          originCastleId: bigint;
          siteId: string;
          stage: string;
        }): unknown;
      }) => {
        table.insert({
          scheduleId: 0n,
          scheduledAt: ScheduleAt.time(gatheringEndsAtMicros),
          originCastleId: castleRow.castleId,
          siteId: resource.site.siteId,
          stage: 'gathering-expiry',
        });
        table.insert({
          scheduleId: 0n,
          scheduledAt: ScheduleAt.time(returnsAtMicros),
          originCastleId: castleRow.castleId,
          siteId: resource.site.siteId,
          stage: 'return-complete',
        });
      };
      if (resource.kind === 'gold') {
        ctx.db.goldNodeOccupationV1.insert(shared);
        ctx.db.goldExpeditionV1.insert({
          expeditionId, fid, ...shared,
          settledThroughMicros: arrivesAtMicros,
          accruedGold: 0n, creditedGold: 0n,
          policyVersion: resource.policy, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
        });
        schedule(ctx.db.goldExpeditionScheduleV1);
      } else if (resource.kind === 'food') {
        ctx.db.foodNodeOccupationV1.insert(shared);
        ctx.db.foodExpeditionV1.insert({
          expeditionId, fid, ...shared,
          settledThroughMicros: arrivesAtMicros,
          accruedFood: 0n, creditedFood: 0n,
          policyVersion: resource.policy, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
        });
        schedule(ctx.db.foodExpeditionScheduleV1);
      } else if (resource.kind === 'wood') {
        ctx.db.woodNodeOccupationV1.insert(shared);
        ctx.db.woodExpeditionV1.insert({
          expeditionId, fid, ...shared,
          settledThroughMicros: arrivesAtMicros,
          accruedWood: 0n, creditedWood: 0n,
          policyVersion: resource.policy, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
        });
        schedule(ctx.db.woodExpeditionScheduleV1);
      } else {
        ctx.db.stoneNodeOccupationV1.insert(shared);
        ctx.db.stoneExpeditionV1.insert({
          expeditionId, fid, ...shared,
          settledThroughMicros: arrivesAtMicros,
          accruedStone: 0n, creditedStone: 0n,
          policyVersion: resource.policy, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
        });
        schedule(ctx.db.stoneExpeditionScheduleV1);
      }
    }
  },
);

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

export default db;
