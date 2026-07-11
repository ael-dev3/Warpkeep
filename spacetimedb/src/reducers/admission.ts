import { SenderError, t } from 'spacetimedb/server';

import {
  optionalDisplayClaim,
  type WarpkeepJwtClaims,
} from '../claims';
import { requireAllowedFid, requireWarpkeepJwt } from '../auth';
import warpkeep from '../schema';
import { CANONICAL_WORLD_TILES } from '../world';

export type AdmissionStatus =
  | 'not_admitted'
  | 'admitted_needs_bootstrap'
  | 'ready'
  | 'disabled';

function admissionStatus(ctx: Parameters<typeof requireWarpkeepJwt>[0]): AdmissionStatus {
  const claims = requireWarpkeepJwt(ctx);
  const allowed = ctx.db.allowedFid.fid.find(claims.fid);

  if (allowed === null) return 'not_admitted';
  if (!allowed.enabled || allowed.authEpoch !== claims.authEpoch) return 'disabled';

  const player = ctx.db.player.fid.find(claims.fid);
  if (player === null) return 'admitted_needs_bootstrap';
  if (!player.identity.equals(ctx.sender)) return 'disabled';

  const castle = ctx.db.castle.ownerFid.find(claims.fid);
  return castle === null ? 'admitted_needs_bootstrap' : 'ready';
}

export const getMyAdmissionStatus = warpkeep.procedure(
  { name: 'get_my_admission_status' },
  t.string(),
  ctx => ctx.withTx(tx => admissionStatus(tx)),
);

function firstUnoccupiedTile(ctx: Parameters<typeof requireWarpkeepJwt>[0]) {
  for (const tile of CANONICAL_WORLD_TILES) {
    const row = ctx.db.worldTile.key.find(tile.key);
    if (row !== null && row.occupantCastleId === undefined) {
      return row;
    }
  }

  throw new SenderError('WORLD_FULL');
}

function displayData(ctx: Parameters<typeof requireWarpkeepJwt>[0]) {
  const payload = ctx.senderAuth.jwt?.fullPayload;
  return {
    username: optionalDisplayClaim(payload, 'username', 64),
    displayName: optionalDisplayClaim(payload, 'display_name', 128),
    pfpUrl: optionalDisplayClaim(payload, 'pfp_url', 2_048),
  };
}

function assertExistingPlayerConsistency(
  ctx: Parameters<typeof requireWarpkeepJwt>[0],
  claims: WarpkeepJwtClaims,
): void {
  const existingPlayer = ctx.db.player.fid.find(claims.fid);
  if (existingPlayer === null) return;

  if (!existingPlayer.identity.equals(ctx.sender)) {
    throw new SenderError('IDENTITY_MISMATCH');
  }

  if (ctx.db.castle.ownerFid.find(claims.fid) === null) {
    throw new SenderError('STATE_INTEGRITY');
  }
}

/**
 * Atomic and idempotent: it derives the account key from the bridge JWT,
 * allocates the center tile first, and commits player/castle/occupancy together.
 */
export const bootstrapPlayer = warpkeep.reducer(
  { name: 'bootstrap_player' },
  ctx => {
    const { claims } = requireAllowedFid(ctx);
    assertExistingPlayerConsistency(ctx, claims);
    if (ctx.db.player.fid.find(claims.fid) !== null) return;

    const spawn = firstUnoccupiedTile(ctx);
    const display = displayData(ctx);

    ctx.db.player.insert({
      fid: claims.fid,
      identity: ctx.sender,
      ...display,
      joinedAt: ctx.timestamp,
      status: 'active',
    });

    const insertedCastle = ctx.db.castle.insert({
      castleId: 0n,
      ownerFid: claims.fid,
      tileKey: spawn.key,
      q: spawn.q,
      r: spawn.r,
      level: 1,
      name: `Hegemony Keep ${claims.fid.toString()}`,
      createdAt: ctx.timestamp,
    });

    ctx.db.worldTile.key.update({
      ...spawn,
      occupantCastleId: insertedCastle.castleId,
    });
  },
);
