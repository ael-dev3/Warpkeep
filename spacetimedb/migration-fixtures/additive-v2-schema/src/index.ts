import { schema, table, t } from 'spacetimedb/server';

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

export default schema({
  allowedFid,
  worldTile,
  player,
  castle,
  adminAudit,
  playerV2,
  playerOwnershipV2,
});
