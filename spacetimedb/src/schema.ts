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
 * Private ownership binding. OIDC identities are authorization material, not
 * player profile data, and must never be exposed through public subscriptions.
 */
export const playerOwnership = table(
  { name: 'player_ownership' },
  {
    fid: t.u64().primaryKey(),
    identity: t.identity().unique(),
  },
);

/** Public gameplay/profile projection for admitted, bootstrapped accounts. */
export const player = table(
  { name: 'player', public: true },
  {
    fid: t.u64().primaryKey(),
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

const warpkeep = schema({
  allowedFid,
  worldTile,
  playerOwnership,
  player,
  castle,
  adminAudit,
});

// SpacetimeDB 2.6's default case converter separates a trailing digit from
// its prefix (`v2` -> `v_2`). Pin this security boundary's public procedure
// spelling so the resolver contract remains exactly versioned as designed.
warpkeep.moduleDef.explicitNames.entries.push({
  tag: 'Function',
  value: {
    sourceName: 'auth_resolver_get_fid_admission_v2',
    canonicalName: 'auth_resolver_get_fid_admission_v2',
  },
});

export default warpkeep;
