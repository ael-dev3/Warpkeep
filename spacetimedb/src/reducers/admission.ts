import { SenderError, t } from 'spacetimedb/server';

import type { WarpkeepJwtClaims } from '../claims';
import { evaluateAdmissionEpoch } from '../admissionPolicy';
import { requireAllowedFid, requireWarpkeepJwt } from '../auth';
import { evaluatePlayerOwnership } from '../playerOwnershipPolicy';
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
  const decision = evaluateAdmissionEpoch(allowed, claims.authEpoch);

  if (decision === 'missing') return 'not_admitted';
  if (decision !== 'current') return 'disabled';

  const player = ctx.db.player.fid.find(claims.fid);
  const ownership = ctx.db.playerOwnership.fid.find(claims.fid);
  const ownershipState = evaluatePlayerOwnership(
    player !== null,
    ownership !== null,
    ownership?.identity.equals(ctx.sender) ?? false,
  );
  if (ownershipState === 'unbound') return 'admitted_needs_bootstrap';
  if (ownershipState !== 'current') return 'disabled';

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

function assertExistingPlayerConsistency(
  ctx: Parameters<typeof requireWarpkeepJwt>[0],
  claims: WarpkeepJwtClaims,
): void {
  const existingPlayer = ctx.db.player.fid.find(claims.fid);
  const existingOwnership = ctx.db.playerOwnership.fid.find(claims.fid);
  const ownershipState = evaluatePlayerOwnership(
    existingPlayer !== null,
    existingOwnership !== null,
    existingOwnership?.identity.equals(ctx.sender) ?? false,
  );

  if (ownershipState === 'unbound') {
    if (ctx.db.playerOwnership.identity.find(ctx.sender) !== null) {
      throw new SenderError('IDENTITY_MISMATCH');
    }
    return;
  }

  if (ownershipState === 'partial') {
    throw new SenderError('STATE_INTEGRITY');
  }

  if (ownershipState === 'identity_mismatch') {
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
    ctx.db.playerOwnership.insert({
      fid: claims.fid,
      identity: ctx.sender,
    });

    ctx.db.player.insert({
      fid: claims.fid,
      // JWT claims are authorization material, never a public-profile write
      // channel. Profile fields require a separate reviewed mutation path.
      username: undefined,
      displayName: undefined,
      pfpUrl: undefined,
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
