import { schema, table, t } from 'spacetimedb/server';

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
 * Public generation-v2 sidecar keyed by the unchanged `world_tile.key`.
 * Canonical q/r remain single-source fields in the deployed prefix table.
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

/** Private immutable evidence that one FID accepted one exact Terms version. */
export const alphaTermsAcceptanceV1 = table(
  { name: 'alpha_terms_acceptance_v1' },
  {
    acceptanceKey: t.string().primaryKey(),
    fid: t.u64().index(),
    termsVersion: t.string(),
    acceptedAt: t.timestamp(),
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
});

// SpacetimeDB 2.6's default case converter separates a trailing digit from
// its prefix (`v2` -> `v_2`). Pin every protocol-v2 wire spelling explicitly.
for (const name of [
  'auth_resolver_get_fid_admission_v2',
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
]) {
  warpkeep.moduleDef.explicitNames.entries.push({
    tag: 'Function',
    value: { sourceName: name, canonicalName: name },
  });
}

export default warpkeep;
