import { SenderError, schema, table, t } from 'spacetimedb/server';

import {
  goldExpeditionErrorCode,
  runGoldExpeditionSchedule,
} from './goldExpeditionAuthority';

/**
 * Private closed-alpha admission list. This table is intentionally omitted
 * from public subscriptions; reducers/procedures return only a caller's
 * admission status.
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

/** Frozen tile row shape; the first 61 radius-four records remain immutable. */
export const worldTile = table(
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

/**
 * Frozen protocol-v1 projection. Its exact public shape, field order, indexes,
 * and placement are a deployed schema contract. Protocol v2 never reads or
 * writes this table; it remains present only for additive compatibility.
 */
export const player = table(
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

/** One persistent keep per Farcaster FID and one occupant per world tile. */
export const castle = table(
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

/** Private admin action trace. No browser client may subscribe to this table. */
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

/** Public protocol-v2 gameplay projection; opaque OIDC identity is excluded. */
export const playerV2 = table(
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

/**
 * Private protocol-v2 ownership binding. OIDC identities are authorization
 * material and must never be exposed through public subscriptions.
 */
export const playerOwnershipV2 = table(
  { name: 'player_ownership_v2' },
  {
    fid: t.u64().primaryKey(),
    identity: t.identity().unique(),
  },
);

/** Public immutable identity for the Genesis 001 realm generation. */
export const realmV1 = table(
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

/**
 * Public static-world sidecar introduced with generation v2 and extended
 * additively by generation v3. Canonical q/r remain single-source fields in
 * the frozen deployed `world_tile` shape.
 */
export const worldTileMetaV1 = table(
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

/** Public immutable slot coordinates. Claim state is normalized and private. */
export const castleSlotV1 = table(
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

/**
 * Private one-to-one claim relation. Public castle rows already disclose a
 * founded castle; an unclaimed-slot allocation plan need not expose FIDs.
 */
export const castleSlotClaimV1 = table(
  { name: 'castle_slot_claim_v1' },
  {
    slotId: t.u32().primaryKey(),
    ownerFid: t.u64().unique(),
    castleId: t.u64().unique(),
    claimedAt: t.timestamp(),
    generationVersion: t.u32(),
  },
);

/**
 * Public presentation projection. Community aggregates stay undefined until
 * accepted participation terms make `communityStatsVisible` true.
 */
export const realmProfileV1 = table(
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

/** Private authoritative Mark account; never subscribed to by browsers. */
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

/**
 * Private event-neutral Ethereum mainnet burn credit receipt. Its policy pins
 * the reviewed SNAP contract/event separately from product semantics.
 */
export const snapBurnCreditV1 = table(
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

/** Private trusted Farcaster address attribution snapshot. */
export const fidWalletAttributionV1 = table(
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
    // Non-unique by design: conflicting trusted snapshots must be representable
    // so attribution can quarantine ambiguity rather than silently discard it.
    address: t.string(),
    addressType: t.string(),
    source: t.string(),
    snapshotAt: t.timestamp(),
    attributionPolicyVersion: t.string(),
    active: t.bool(),
  },
);

/** Private singleton naming the complete current wallet attribution snapshot. */
export const walletAttributionSnapshotV1 = table(
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

/** Private finalized-chain scan checkpoint. */
export const snapScanCursorV1 = table(
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

/** Private resumable apply transaction; at most one row may be pending. */
export const snapScanBatchV1 = table(
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

/** Private immutable evidence that one FID accepted one exact entry-agreement bundle. */
export const alphaTermsAcceptanceV1 = table(
  { name: 'alpha_terms_acceptance_v1' },
  {
    acceptanceKey: t.string().primaryKey(),
    fid: t.u64().index(),
    termsVersion: t.string(),
    acceptedAt: t.timestamp(),
  },
);

/**
 * Private authoritative economic inventory for one founded castle. Strategic
 * balances are player-scoped and are never exposed through public Realm
 * subscriptions. Marks remain canonical in `mark_account_v1`.
 */
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

/**
 * Public immutable Tier-I Gold pilot catalog. It has no ownership or balance
 * fields: every client can render the same approved Genesis 001 site list.
 */
export const goldSiteV1 = table(
  { name: 'gold_site_v1', public: true },
  {
    siteId: t.string().primaryKey(),
    q: t.i32(),
    r: t.i32(),
    tier: t.u32(),
    active: t.bool(),
  },
);

/**
 * Public occupancy is intentionally identity-free. `originCastleId` links to
 * the pre-existing public castle projection; private FID, accrued Gold, and
 * idempotency data stay outside browser subscriptions.
 */
export const goldNodeOccupationV1 = table(
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

/** Private active wagon, exact accrual cursor, and owner binding. */
export const goldExpeditionV1 = table(
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
    // One permanent castle per founder means one active wagon per FID. A
    // unique lookup keeps owner-only state reads hot and bounded.
    fid: t.u64().unique(),
    originCastleId: t.u64().unique(),
    // A completed gathering releases the public site while its wagon is
    // privately returning. Keep this indexed rather than unique so the next
    // wagon may occupy that released site without waiting for the first wagon
    // to reach its origin castle.
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

/** Private caller-request receipt for bounded exactly-once dispatch retries. */
export const goldExpeditionIdempotencyV1 = table(
  { name: 'gold_expedition_idempotency_v1' },
  {
    requestKey: t.string().primaryKey(),
    fid: t.u64().index(),
    siteId: t.string(),
    expeditionId: t.string().unique(),
    createdAt: t.timestamp(),
  },
);

/**
 * Three one-shot lifecycle rows are inserted atomically with a dispatch. This
 * is a deliberately public-safe scheduler projection, not economy state:
 * every field is already derivable from `gold_node_occupation_v1`. It contains
 * no FID, request key, private expedition ID, accrual cursor, or balance.
 *
 * The pinned 2.6.1 TypeScript generator cannot extract a scheduled reducer
 * whose exact table row stays private. Keeping this minimal projection public
 * preserves codegen while the reducer still resolves all authority through the
 * private expedition and resource rows. The client never subscribes to it.
 */
export const goldExpeditionScheduleV1 = table(
  {
    // SpacetimeDB 2.6.1's TypeScript generator cannot resolve a scheduled
    // table whose physical name ends in an attached version suffix (`_v1`).
    // The generator accepts the SDK's default separated spelling (`_v_1`),
    // so use it for this newly additive scheduler table while retaining the
    // versioned TypeScript accessor/API contract.
    name: 'gold_expedition_schedule_v_1',
    public: true,
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

/**
 * Public immutable receipt for the one shared Genesis 001 forest layout.
 *
 * It is presentation state only: no gameplay actor can edit it, and it does
 * not change terrain metadata, passability, resources, or route authority.
 * `seededAt` establishes provenance for the exact reviewed catalog without
 * becoming part of the pinned layout digest.
 */
export const realmForestLayoutV1 = table(
  { name: 'realm_forest_layout_v1', public: true },
  {
    realmId: t.string().primaryKey(),
    layoutVersion: t.u32(),
    policyVersion: t.string(),
    layoutDigest: t.string(),
    assetCatalogDigest: t.string(),
    instanceCount: t.u32(),
    seededAt: t.timestamp(),
  },
);

/**
 * Public immutable tree instances. All transform values use fixed point so
 * every client renders the same reviewed position/rotation/scale regardless
 * of local PRNG behavior or graphics quality. Quality selects model LOD only.
 */
export const realmForestInstanceV1 = table(
  { name: 'realm_forest_instance_v1', public: true },
  {
    treeId: t.string().primaryKey(),
    realmId: t.string().index(),
    tileKey: t.string(),
    q: t.i32(),
    r: t.i32(),
    localXMicrounits: t.i64(),
    localZMicrounits: t.i64(),
    worldXMicrounits: t.i64(),
    worldZMicrounits: t.i64(),
    rotationMilliDegrees: t.u32(),
    scaleBasisPoints: t.u32(),
    speciesId: t.string(),
    habitat: t.string(),
    layoutVersion: t.u32(),
  },
);

const warpkeep = schema({
  // Preserve the original production schema prefix exactly. New tables are
  // append-only so SpacetimeDB can apply this migration without rewriting it.
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
});

/**
 * Scheduled reducers are normal callable reducers in SpacetimeDB. The
 * scheduler's internal principal is therefore verified before a lifecycle row
 * can advance an occupation, credit Gold, or release a site.
 */
export const runGoldExpeditionScheduleV1 = warpkeep.reducer(
  // This reducer is scheduler-only and never receives a browser binding. The
  // `_v_1` wire spelling is required because SpacetimeDB 2.6.1 resolves
  // scheduled reducer targets with its default trailing-digit conversion.
  { name: 'run_gold_expedition_schedule_v_1' },
  // The scheduler receives the concrete table row as one argument. The
  // wrapper is required by the SDK's scheduled-table type reference.
  { arg: goldExpeditionScheduleV1.rowType },
  (ctx, { arg }) => {
    if (!ctx.senderAuth.isInternal) {
      throw new SenderError('GOLD_EXPEDITION_SCHEDULE_INTERNAL_ONLY');
    }
    try {
      runGoldExpeditionSchedule(ctx, arg);
    } catch (error) {
      const code = goldExpeditionErrorCode(error);
      if (code !== undefined) throw new SenderError(code);
      throw error;
    }
  },
);

// SpacetimeDB 2.6's default case converter separates a trailing digit from
// its prefix (`v2` -> `v_2`). Pin every versioned wire spelling explicitly.
for (const name of [
  'auth_resolver_get_fid_admission_v2',
  'qa_observer_get_realm_snapshot_v1',
  'qa_observer_get_realm_attestation_v2',
  'get_my_admission_status_v2',
  'bootstrap_player_v2',
  'admin_get_alpha_status_v2',
  'admin_get_alpha_status_v3',
  'admin_upsert_realm_profile_v1',
  'admin_upsert_fid_wallet_attribution_v1',
  'admin_replace_fid_wallet_snapshot_v1',
  'admin_begin_snap_scan_batch_v1',
  'admin_credit_snap_burn_v1',
  'admin_finalize_snap_scan_batch_v1',
  'admin_get_snap_scan_batch_aggregate_v1',
  'accept_alpha_terms_v1',
  'get_my_resource_state_v1',
  'collect_resources_v1',
  'admin_backfill_resource_accounts_v1',
  'admin_get_alpha_status_v4',
  'get_my_gold_expedition_state_v1',
  'dispatch_gold_expedition_v1',
  'collect_gold_expedition_v1',
  'admin_seed_genesis_tier_i_gold_sites_v1',
  'admin_seed_genesis_forest_layout_v1',
]) {
  warpkeep.moduleDef.explicitNames.entries.push({
    tag: 'Function',
    value: { sourceName: name, canonicalName: name },
  });
}

export default warpkeep;
