import { schema, table, t } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';

const allowedFid = table(
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

const worldTile = table(
  { name: 'world_tile', public: true },
  {
    key: t.string().primaryKey(),
    q: t.i32(),
    r: t.i32(),
    biome: t.string(),
    terrainSeed: t.u32(),
    occupantCastleId: t.option(t.u64()),
  },
);

const player = table(
  { name: 'player', public: true },
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

const castle = table(
  { name: 'castle', public: true },
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

const adminAudit = table(
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

const playerV2 = table(
  { name: 'player_v2', public: true },
  {
    fid: t.u64().primaryKey(),
    username: t.option(t.string()),
    displayName: t.option(t.string()),
    pfpUrl: t.option(t.string()),
    joinedAt: t.timestamp(),
    status: t.string(),
  },
);

const playerOwnershipV2 = table(
  { name: 'player_ownership_v2' },
  {
    fid: t.u64().primaryKey(),
    identity: t.identity().unique(),
  },
);

const realmV1 = table(
  { name: 'realm_v1', public: true },
  {
    realmId: t.string().primaryKey(),
    publicName: t.string(),
    seedName: t.string(),
    numericSeed: t.u32(),
    generationVersion: t.u32(),
    authoritativeRadius: t.u32(),
    renderRadius: t.u32(),
    playerCapacity: t.u32(),
    active: t.bool(),
    createdAt: t.timestamp(),
  },
);

const worldTileMetaV1 = table(
  {
    name: 'world_tile_meta_v1',
    public: true,
    indexes: [{
      accessor: 'byRealmAndRing',
      algorithm: 'btree',
      columns: ['realmId', 'ring'] as const,
    }] as const,
  },
  {
    tileKey: t.string().primaryKey(),
    realmId: t.string().index(),
    s: t.i32(),
    ring: t.u32(),
    sector: t.u32(),
    terrainKind: t.string(),
    passable: t.bool(),
    movementCost: t.u32(),
    staticContentKind: t.string(),
    generationVersion: t.u32(),
  },
);

const castleSlotV1 = table(
  { name: 'castle_slot_v1', public: true },
  {
    slotId: t.u32().primaryKey(),
    realmId: t.string().index(),
    tileKey: t.string().unique(),
    q: t.i32(),
    r: t.i32(),
    generationVersion: t.u32(),
  },
);

const castleSlotClaimV1 = table(
  { name: 'castle_slot_claim_v1' },
  {
    slotId: t.u32().primaryKey(),
    ownerFid: t.u64().unique(),
    castleId: t.u64().unique(),
    claimedAt: t.timestamp(),
    generationVersion: t.u32(),
  },
);

const realmProfileV1 = table(
  { name: 'realm_profile_v1', public: true },
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

const markAccountV1 = table(
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

const snapBurnCreditV1 = table(
  { name: 'snap_burn_credit_v1' },
  {
    eventKey: t.string().primaryKey(),
    batchId: t.string().index(),
    chainId: t.u32(),
    tokenContract: t.string(),
    transactionHash: t.string(),
    logIndex: t.u32(),
    burnReference: t.string().unique(),
    burnMethod: t.string(),
    senderAddress: t.string(),
    blockNumber: t.u64(),
    blockHash: t.string(),
    amountMicros: t.u128(),
    attributedFid: t.u64().index(),
    attributionPolicyVersion: t.string(),
    contractCodeHash: t.string(),
    creditedAt: t.timestamp(),
  },
);

const fidWalletAttributionV1 = table(
  {
    name: 'fid_wallet_attribution_v1',
    indexes: [{
      accessor: 'bySnapshotAndAddress',
      algorithm: 'btree',
      columns: ['snapshotGeneration', 'address'] as const,
    }] as const,
  },
  {
    snapshotAttributionKey: t.string().primaryKey(),
    attributionKey: t.string(),
    snapshotGeneration: t.u64(),
    fid: t.u64().index(),
    address: t.string(),
    addressType: t.string(),
    source: t.string(),
    snapshotAt: t.timestamp(),
    attributionPolicyVersion: t.string(),
    active: t.bool(),
  },
);

const walletAttributionSnapshotV1 = table(
  { name: 'wallet_attribution_snapshot_v1' },
  {
    snapshotKey: t.string().primaryKey(),
    generation: t.u64(),
    snapshotId: t.string(),
    policyVersion: t.string(),
    attributionCount: t.u32(),
    snapshotAt: t.timestamp(),
  },
);

const snapScanCursorV1 = table(
  { name: 'snap_scan_cursor_v1' },
  {
    cursorKey: t.string().primaryKey(),
    chainId: t.u32(),
    tokenContract: t.string(),
    policyVersion: t.string(),
    deploymentStartBlock: t.u64(),
    lastFinalizedBlock: t.u64(),
    lastFinalizedBlockHash: t.string(),
    proxyCodeHash: t.string(),
    implementationAddress: t.string(),
    implementationCodeHash: t.string(),
    walletSnapshotGeneration: t.u64(),
    walletSnapshotId: t.string(),
    scannedAt: t.timestamp(),
  },
);

const snapScanBatchV1 = table(
  {
    name: 'snap_scan_batch_v1',
    indexes: [{
      accessor: 'byCursorAndStatus',
      algorithm: 'btree',
      columns: ['cursorKey', 'status'] as const,
    }] as const,
  },
  {
    batchId: t.string().primaryKey(),
    cursorKey: t.string(),
    status: t.string(),
    previousFinalizedBlock: t.u64(),
    previousFinalizedBlockHash: t.string(),
    throughFinalizedBlock: t.u64(),
    throughFinalizedBlockHash: t.string(),
    walletSnapshotGeneration: t.u64(),
    walletSnapshotId: t.string(),
    walletAttributionCount: t.u32(),
    expectedCredits: t.u32(),
    expectedMicros: t.u128(),
    appliedCredits: t.u32(),
    appliedMicros: t.u128(),
    proxyCodeHash: t.string(),
    implementationAddress: t.string(),
    implementationCodeHash: t.string(),
    startedAt: t.timestamp(),
    finalizedAt: t.option(t.timestamp()),
  },
);

const alphaTermsAcceptanceV1 = table(
  { name: 'alpha_terms_acceptance_v1' },
  {
    acceptanceKey: t.string().primaryKey(),
    fid: t.u64().index(),
    termsVersion: t.string(),
    acceptedAt: t.timestamp(),
  },
);

const resourceAccountV1 = table(
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


const goldSiteV1 = table(
  { name: 'gold_site_v1', public: true },
  {
    siteId: t.string().primaryKey(),
    q: t.i32(),
    r: t.i32(),
    tier: t.u32(),
    active: t.bool(),
  },
);

const goldNodeOccupationV1 = table(
  {
    name: 'gold_node_occupation_v1',
    public: true,
    indexes: [{
      accessor: 'byOriginCastle',
      algorithm: 'btree',
      columns: ['originCastleId'] as const,
    }] as const,
  },
  {
    siteId: t.string().primaryKey(),
    originCastleId: t.u64(),
    phase: t.string(),
    startedAtMicros: t.u64(),
    arrivesAtMicros: t.u64(),
    gatheringEndsAtMicros: t.u64(),
    returnsAtMicros: t.u64(),
  },
);

const goldExpeditionV1 = table(
  {
    name: 'gold_expedition_v1',
    indexes: [{
      accessor: 'byFidAndPhase',
      algorithm: 'btree',
      columns: ['fid', 'phase'] as const,
    }] as const,
  },
  {
    expeditionId: t.string().primaryKey(),
    fid: t.u64().unique(),
    originCastleId: t.u64().unique(),
    siteId: t.string().index(),
    phase: t.string(),
    startedAtMicros: t.u64(),
    arrivesAtMicros: t.u64(),
    gatheringEndsAtMicros: t.u64(),
    returnsAtMicros: t.u64(),
    settledThroughMicros: t.u64(),
    accruedGold: t.u64(),
    creditedGold: t.u64(),
    policyVersion: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
);

const goldExpeditionIdempotencyV1 = table(
  { name: 'gold_expedition_idempotency_v1' },
  {
    requestKey: t.string().primaryKey(),
    fid: t.u64().index(),
    siteId: t.string(),
    expeditionId: t.string().unique(),
    createdAt: t.timestamp(),
  },
);

const goldExpeditionScheduleV1 = table(
  {
    name: 'gold_expedition_schedule_v_1',
    public: true,
    // Keep the production reducer identity. SpacetimeDB treats changing this
    // schedule target as removing a live schedule, which is intentionally not
    // an additive migration.
    scheduled: (): any => runGoldExpeditionScheduleV1,
  },
  {
    scheduleId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    originCastleId: t.u64().index(),
    siteId: t.string().index(),
    stage: t.string(),
  },
);

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
});

/** Schema-only v5 schedule target; disposable migration proof never inserts it. */
export const runGoldExpeditionScheduleV1 = db.reducer(
  { name: 'run_gold_expedition_schedule_v_1' },
  { arg: goldExpeditionScheduleV1.rowType },
  () => {},
);

const FIXTURE_RESOURCE_QUANTUM_MICROS = 600_000_000n;
const FIXTURE_RESOURCE_POLICY_VERSION = 'genesis-resource-yield-v1';

/**
 * Disposable-loopback-only clock fixture. This schema package is never a
 * production module; the reducer exists solely to exercise the actual
 * module's positive-quantum persistence branch deterministically.
 */
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
