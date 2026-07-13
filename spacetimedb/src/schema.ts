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

/** The 61 authoritative radius-four Lowlands cells. */
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
});

// SpacetimeDB 2.6's default case converter separates a trailing digit from
// its prefix (`v2` -> `v_2`). Pin every protocol-v2 wire spelling explicitly.
for (const name of [
  'auth_resolver_get_fid_admission_v2',
  'get_my_admission_status_v2',
  'bootstrap_player_v2',
  'admin_get_alpha_status_v2',
]) {
  warpkeep.moduleDef.explicitNames.entries.push({
    tag: 'Function',
    value: { sourceName: name, canonicalName: name },
  });
}

export default warpkeep;
