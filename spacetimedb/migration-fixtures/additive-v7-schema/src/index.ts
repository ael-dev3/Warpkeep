import { schema, table, t } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import {
  CANONICAL_CASTLE_SLOTS,
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILE_META,
  GENESIS_GENERATION_V2_WORLD_TILES,
} from '../../../src/world';

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
  displayName: t.option(t.string()), pfpUrl: t.option(t.string()), joinedAt: t.timestamp(),
  status: t.string(),
});
const castle = table({ name: 'castle', public: true }, {
  castleId: t.u64().primaryKey().autoInc(), ownerFid: t.u64().unique(),
  tileKey: t.string().unique(), q: t.i32(), r: t.i32(), level: t.i32(),
  name: t.string(), createdAt: t.timestamp(),
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
  realmId: t.string().primaryKey(), publicName: t.string(), seedName: t.string(),
  numericSeed: t.u32(), generationVersion: t.u32(), authoritativeRadius: t.u32(),
  renderRadius: t.u32(), playerCapacity: t.u32(), active: t.bool(), createdAt: t.timestamp(),
});
const worldTileMetaV1 = table({
  name: 'world_tile_meta_v1', public: true,
  indexes: [{ accessor: 'byRealmAndRing', algorithm: 'btree', columns: ['realmId', 'ring'] as const }] as const,
}, {
  tileKey: t.string().primaryKey(), realmId: t.string().index(), s: t.i32(), ring: t.u32(),
  sector: t.u32(), terrainKind: t.string(), passable: t.bool(), movementCost: t.u32(),
  staticContentKind: t.string(), generationVersion: t.u32(),
});
const castleSlotV1 = table({ name: 'castle_slot_v1', public: true }, {
  slotId: t.u32().primaryKey(), realmId: t.string().index(), tileKey: t.string().unique(),
  q: t.i32(), r: t.i32(), generationVersion: t.u32(),
});
const castleSlotClaimV1 = table({ name: 'castle_slot_claim_v1' }, {
  slotId: t.u32().primaryKey(), ownerFid: t.u64().unique(), castleId: t.u64().unique(),
  claimedAt: t.timestamp(), generationVersion: t.u32(),
});
const realmProfileV1 = table({ name: 'realm_profile_v1', public: true }, {
  fid: t.u64().primaryKey(), canonicalUsername: t.option(t.string()),
  displayName: t.option(t.string()), pfpUrl: t.option(t.string()), publicBio: t.option(t.string()),
  admittedAt: t.timestamp(), firstAuthenticatedAt: t.option(t.timestamp()),
  profileUpdatedAt: t.timestamp(), publicStatus: t.string(), communityStatsVisible: t.bool(),
  totalSnapBurnedMicros: t.option(t.u128()), marksEarnedMicros: t.option(t.u128()),
  marksSpentMicros: t.option(t.u128()), marksBalanceMicros: t.option(t.u128()),
  marksPolicyVersion: t.option(t.string()),
});
const markAccountV1 = table({ name: 'mark_account_v1' }, {
  fid: t.u64().primaryKey(), totalSnapBurnedMicros: t.u128(), earnedMicros: t.u128(),
  spentMicros: t.u128(), balanceMicros: t.u128(), policyVersion: t.string(), updatedAt: t.timestamp(),
});
const snapBurnCreditV1 = table({ name: 'snap_burn_credit_v1' }, {
  eventKey: t.string().primaryKey(), batchId: t.string().index(), chainId: t.u32(),
  tokenContract: t.string(), transactionHash: t.string(), logIndex: t.u32(),
  burnReference: t.string().unique(), burnMethod: t.string(), senderAddress: t.string(),
  blockNumber: t.u64(), blockHash: t.string(), amountMicros: t.u128(),
  attributedFid: t.u64().index(), attributionPolicyVersion: t.string(),
  contractCodeHash: t.string(), creditedAt: t.timestamp(),
});
const fidWalletAttributionV1 = table({
  name: 'fid_wallet_attribution_v1',
  indexes: [{ accessor: 'bySnapshotAndAddress', algorithm: 'btree', columns: ['snapshotGeneration', 'address'] as const }] as const,
}, {
  snapshotAttributionKey: t.string().primaryKey(), attributionKey: t.string(),
  snapshotGeneration: t.u64(), fid: t.u64().index(), address: t.string(), addressType: t.string(),
  source: t.string(), snapshotAt: t.timestamp(), attributionPolicyVersion: t.string(), active: t.bool(),
});
const walletAttributionSnapshotV1 = table({ name: 'wallet_attribution_snapshot_v1' }, {
  snapshotKey: t.string().primaryKey(), generation: t.u64(), snapshotId: t.string(),
  policyVersion: t.string(), attributionCount: t.u32(), snapshotAt: t.timestamp(),
});
const snapScanCursorV1 = table({ name: 'snap_scan_cursor_v1' }, {
  cursorKey: t.string().primaryKey(), chainId: t.u32(), tokenContract: t.string(),
  policyVersion: t.string(), deploymentStartBlock: t.u64(), lastFinalizedBlock: t.u64(),
  lastFinalizedBlockHash: t.string(), proxyCodeHash: t.string(), implementationAddress: t.string(),
  implementationCodeHash: t.string(), walletSnapshotGeneration: t.u64(), walletSnapshotId: t.string(),
  scannedAt: t.timestamp(),
});
const snapScanBatchV1 = table({
  name: 'snap_scan_batch_v1',
  indexes: [{ accessor: 'byCursorAndStatus', algorithm: 'btree', columns: ['cursorKey', 'status'] as const }] as const,
}, {
  batchId: t.string().primaryKey(), cursorKey: t.string(), status: t.string(),
  previousFinalizedBlock: t.u64(), previousFinalizedBlockHash: t.string(),
  throughFinalizedBlock: t.u64(), throughFinalizedBlockHash: t.string(),
  walletSnapshotGeneration: t.u64(), walletSnapshotId: t.string(), walletAttributionCount: t.u32(),
  expectedCredits: t.u32(), expectedMicros: t.u128(), appliedCredits: t.u32(), appliedMicros: t.u128(),
  proxyCodeHash: t.string(), implementationAddress: t.string(), implementationCodeHash: t.string(),
  startedAt: t.timestamp(), finalizedAt: t.option(t.timestamp()),
});
const alphaTermsAcceptanceV1 = table({ name: 'alpha_terms_acceptance_v1' }, {
  acceptanceKey: t.string().primaryKey(), fid: t.u64().index(), termsVersion: t.string(), acceptedAt: t.timestamp(),
});
const resourceAccountV1 = table({ name: 'resource_account_v1' }, {
  fid: t.u64().primaryKey(), castleId: t.u64().unique(), realmId: t.string().index(),
  food: t.u64(), wood: t.u64(), stone: t.u64(), gold: t.u64(), settledThroughMicros: t.u64(),
  revision: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
});

const goldSiteV1 = table({ name: 'gold_site_v1', public: true }, {
  siteId: t.string().primaryKey(), q: t.i32(), r: t.i32(), tier: t.u32(), active: t.bool(),
});
const goldNodeOccupationV1 = table({
  name: 'gold_node_occupation_v1', public: true,
  indexes: [{ accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const }] as const,
}, {
  siteId: t.string().primaryKey(), originCastleId: t.u64(), phase: t.string(), startedAtMicros: t.u64(),
  arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(),
});
const goldExpeditionV1 = table({
  name: 'gold_expedition_v1',
  indexes: [{ accessor: 'byFidAndPhase', algorithm: 'btree', columns: ['fid', 'phase'] as const }] as const,
}, {
  expeditionId: t.string().primaryKey(), fid: t.u64().unique(), originCastleId: t.u64().unique(),
  siteId: t.string().index(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(),
  gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(), settledThroughMicros: t.u64(),
  accruedGold: t.u64(), creditedGold: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
});
const goldExpeditionIdempotencyV1 = table({ name: 'gold_expedition_idempotency_v1' }, {
  requestKey: t.string().primaryKey(), fid: t.u64().index(), siteId: t.string(),
  expeditionId: t.string().unique(), createdAt: t.timestamp(),
});
const goldExpeditionScheduleV1 = table({
  name: 'gold_expedition_schedule_v_1', public: true,
  scheduled: (): any => runGoldExpeditionScheduleV1,
}, {
  scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(),
  originCastleId: t.u64().index(), siteId: t.string().index(), stage: t.string(),
});

const realmForestLayoutV1 = table({ name: 'realm_forest_layout_v1', public: true }, {
  realmId: t.string().primaryKey(), layoutVersion: t.u32(), policyVersion: t.string(),
  layoutDigest: t.string(), assetCatalogDigest: t.string(), instanceCount: t.u32(), seededAt: t.timestamp(),
});
const realmForestInstanceV1 = table({ name: 'realm_forest_instance_v1', public: true }, {
  treeId: t.string().primaryKey(), realmId: t.string().index(), tileKey: t.string(), q: t.i32(), r: t.i32(),
  localXMicrounits: t.i64(), localZMicrounits: t.i64(), worldXMicrounits: t.i64(), worldZMicrounits: t.i64(),
  rotationMilliDegrees: t.u32(), scaleBasisPoints: t.u32(), speciesId: t.string(), habitat: t.string(), layoutVersion: t.u32(),
});

const foodSiteV1 = table({ name: 'food_site_v1', public: true }, {
  siteId: t.string().primaryKey(), q: t.i32(), r: t.i32(), tier: t.u32(), active: t.bool(),
});
const foodNodeOccupationV1 = table({
  name: 'food_node_occupation_v1', public: true,
  indexes: [{ accessor: 'byOriginCastle', algorithm: 'btree', columns: ['originCastleId'] as const }] as const,
}, {
  siteId: t.string().primaryKey(), originCastleId: t.u64(), phase: t.string(), startedAtMicros: t.u64(),
  arrivesAtMicros: t.u64(), gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(),
});
const foodExpeditionV1 = table({
  name: 'food_expedition_v1',
  indexes: [{ accessor: 'byFidAndPhase', algorithm: 'btree', columns: ['fid', 'phase'] as const }] as const,
}, {
  expeditionId: t.string().primaryKey(), fid: t.u64().unique(), originCastleId: t.u64().unique(),
  siteId: t.string().index(), phase: t.string(), startedAtMicros: t.u64(), arrivesAtMicros: t.u64(),
  gatheringEndsAtMicros: t.u64(), returnsAtMicros: t.u64(), settledThroughMicros: t.u64(),
  accruedFood: t.u64(), creditedFood: t.u64(), policyVersion: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
});
const foodExpeditionIdempotencyV1 = table({ name: 'food_expedition_idempotency_v1' }, {
  requestKey: t.string().primaryKey(), fid: t.u64().index(), siteId: t.string(),
  expeditionId: t.string().unique(), createdAt: t.timestamp(),
});
const foodExpeditionScheduleV1 = table({
  name: 'food_expedition_schedule_v_1', public: true,
  scheduled: (): any => runFoodExpeditionScheduleV1,
}, {
  scheduleId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(),
  originCastleId: t.u64().index(), siteId: t.string().index(), stage: t.string(),
});

const db = schema({
  allowedFid,
  worldTile,
  player,
  castle,
  adminAudit,
  playerV2,
  playerOwnershipV2,
  realmV1,
  worldTileMetaV1,
  castleSlotV1,
  castleSlotClaimV1,
  realmProfileV1,
  markAccountV1,
  snapBurnCreditV1,
  fidWalletAttributionV1,
  walletAttributionSnapshotV1,
  snapScanCursorV1,
  snapScanBatchV1,
  alphaTermsAcceptanceV1,
  resourceAccountV1,
  goldSiteV1,
  goldNodeOccupationV1,
  goldExpeditionV1,
  goldExpeditionIdempotencyV1,
  goldExpeditionScheduleV1,
  realmForestLayoutV1,
  realmForestInstanceV1,
  foodSiteV1,
  foodNodeOccupationV1,
  foodExpeditionV1,
  foodExpeditionIdempotencyV1,
  foodExpeditionScheduleV1,
});

/** Schema-only schedule target; the disposable proof never inserts schedules. */
export const runGoldExpeditionScheduleV1 = db.reducer(
  { name: 'run_gold_expedition_schedule_v_1' },
  { arg: goldExpeditionScheduleV1.rowType },
  () => {},
);
/** Schema-only schedule target; the disposable proof never inserts schedules. */
export const runFoodExpeditionScheduleV1 = db.reducer(
  { name: 'run_food_expedition_schedule_v_1' },
  { arg: foodExpeditionScheduleV1.rowType },
  () => {},
);

const FIXTURE_RESOURCE_QUANTUM_MICROS = 600_000_000n;
const FIXTURE_RESOURCE_POLICY_VERSION = 'genesis-resource-yield-v1';
const FIXTURE_MARK_POLICY_VERSION = 'snap-current-linked-wallet-1to1-v1';
const FIXTURE_GENERATION_V2_FOUNDER_FID = 730_001n;

/**
 * Disposable loopback-only predecessor fixture. It retains every v5, v6, and
 * v7 append so inspection never requests a destructive schema downgrade.
 */
export const fixtureSeedGenesisGenerationV2 = db.reducer(
  { name: 'fixture_seed_genesis_generation_v2' },
  ctx => {
    if (
      ctx.db.worldTile.count() !== 0n
      || ctx.db.realmV1.count() !== 0n
      || ctx.db.worldTileMetaV1.count() !== 0n
      || ctx.db.castleSlotV1.count() !== 0n
      || ctx.db.castle.count() !== 0n
      || ctx.db.castleSlotClaimV1.count() !== 0n
      || ctx.db.allowedFid.count() !== 0n
      || ctx.db.realmProfileV1.count() !== 0n
      || ctx.db.markAccountV1.count() !== 0n
      || ctx.db.resourceAccountV1.count() !== 0n
      || ctx.db.goldSiteV1.count() !== 0n
      || ctx.db.goldNodeOccupationV1.count() !== 0n
      || ctx.db.goldExpeditionV1.count() !== 0n
      || ctx.db.goldExpeditionIdempotencyV1.count() !== 0n
      || ctx.db.goldExpeditionScheduleV1.count() !== 0n
      || ctx.db.realmForestLayoutV1.count() !== 0n
      || ctx.db.realmForestInstanceV1.count() !== 0n
      || ctx.db.foodSiteV1.count() !== 0n
      || ctx.db.foodNodeOccupationV1.count() !== 0n
      || ctx.db.foodExpeditionV1.count() !== 0n
      || ctx.db.foodExpeditionIdempotencyV1.count() !== 0n
      || ctx.db.foodExpeditionScheduleV1.count() !== 0n
    ) throw new Error('FIXTURE_GENERATION_V2_NOT_EMPTY');

    for (const tile of GENESIS_GENERATION_V2_WORLD_TILES) {
      ctx.db.worldTile.insert({ ...tile, occupantCastleId: undefined });
    }
    ctx.db.realmV1.insert({ ...GENESIS_GENERATION_V2_REALM, createdAt: ctx.timestamp });
    for (const metadata of GENESIS_GENERATION_V2_WORLD_TILE_META) {
      ctx.db.worldTileMetaV1.insert(metadata);
    }
    for (const slot of CANONICAL_CASTLE_SLOTS) ctx.db.castleSlotV1.insert(slot);

    const foundingSlot = CANONICAL_CASTLE_SLOTS[0]!;
    const castleRow = ctx.db.castle.insert({
      castleId: 0n,
      ownerFid: FIXTURE_GENERATION_V2_FOUNDER_FID,
      tileKey: foundingSlot.tileKey,
      q: foundingSlot.q,
      r: foundingSlot.r,
      level: 1,
      name: 'Migration Fixture Keep',
      createdAt: ctx.timestamp,
    });
    const tile = ctx.db.worldTile.key.find(foundingSlot.tileKey);
    if (tile === null) throw new Error('FIXTURE_GENERATION_V2_TILE_MISSING');
    ctx.db.worldTile.key.update({ ...tile, occupantCastleId: castleRow.castleId });
    ctx.db.castleSlotClaimV1.insert({
      slotId: foundingSlot.slotId,
      ownerFid: FIXTURE_GENERATION_V2_FOUNDER_FID,
      castleId: castleRow.castleId,
      claimedAt: ctx.timestamp,
      generationVersion: foundingSlot.generationVersion,
    });
    ctx.db.allowedFid.insert({
      fid: FIXTURE_GENERATION_V2_FOUNDER_FID,
      enabled: true,
      authEpoch: 1,
      invitedAt: ctx.timestamp,
      invitedBy: 'migration-fixture',
      note: 'generation-v2 world expansion fixture',
    });
    ctx.db.realmProfileV1.insert({
      fid: FIXTURE_GENERATION_V2_FOUNDER_FID,
      canonicalUsername: undefined,
      displayName: undefined,
      pfpUrl: undefined,
      publicBio: undefined,
      admittedAt: ctx.timestamp,
      firstAuthenticatedAt: undefined,
      profileUpdatedAt: ctx.timestamp,
      publicStatus: 'founded',
      communityStatsVisible: false,
      totalSnapBurnedMicros: undefined,
      marksEarnedMicros: undefined,
      marksSpentMicros: undefined,
      marksBalanceMicros: undefined,
      marksPolicyVersion: undefined,
    });
    ctx.db.markAccountV1.insert({
      fid: FIXTURE_GENERATION_V2_FOUNDER_FID,
      totalSnapBurnedMicros: 0n,
      earnedMicros: 0n,
      spentMicros: 0n,
      balanceMicros: 0n,
      policyVersion: FIXTURE_MARK_POLICY_VERSION,
      updatedAt: ctx.timestamp,
    });
  },
);

/** Disposable-only resource clock fixture. */
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
