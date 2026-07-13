import { SenderError, t } from 'spacetimedb/server';

import type { WarpkeepJwtClaims } from '../claims';
import { evaluateAdmissionEpoch } from '../admissionPolicy';
import { requireAllowedFid, requireWarpkeepJwt } from '../auth';
import { evaluatePlayerOwnership } from '../playerOwnershipPolicy';
import warpkeep from '../schema';
import { CANONICAL_WORLD_TILES } from '../world';
import { worldCastleGraphIsConsistent } from '../worldCastleIntegrity';

export type AdmissionStatus =
  | 'not_admitted'
  | 'admitted_needs_bootstrap'
  | 'ready'
  | 'disabled';

function admissionStatusV2(ctx: Parameters<typeof requireWarpkeepJwt>[0]): AdmissionStatus {
  const claims = requireWarpkeepJwt(ctx);
  const allowed = ctx.db.allowedFid.fid.find(claims.fid);
  const decision = evaluateAdmissionEpoch(allowed, claims.authEpoch);

  if (decision === 'missing') return 'not_admitted';
  if (decision !== 'current') return 'disabled';
  if (!worldCastleGraphIsConsistent(ctx.db.worldTile.iter(), ctx.db.castle.iter())) {
    throw new SenderError('STATE_INTEGRITY');
  }

  const player = ctx.db.playerV2.fid.find(claims.fid);
  const ownership = ctx.db.playerOwnershipV2.fid.find(claims.fid);
  const ownershipState = evaluatePlayerOwnership(
    player !== null,
    ownership !== null,
    ownership?.identity.equals(ctx.sender) ?? false,
  );
  if (ownershipState === 'unbound') {
    if (ctx.db.playerOwnershipV2.identity.find(ctx.sender) !== null) return 'disabled';
    if (ctx.db.castle.ownerFid.find(claims.fid) !== null) return 'disabled';
    return 'admitted_needs_bootstrap';
  }
  if (ownershipState !== 'current') return 'disabled';

  const castle = ctx.db.castle.ownerFid.find(claims.fid);
  return castle === null ? 'disabled' : 'ready';
}

/** Retained wire contract for old clients, but protocol-v1 admission is retired. */
export const getMyAdmissionStatus = warpkeep.procedure(
  { name: 'get_my_admission_status' },
  t.string(),
  () => {
    throw new SenderError('PROTOCOL_RETIRED');
  },
);

export const getMyAdmissionStatusV2 = warpkeep.procedure(
  { name: 'get_my_admission_status_v2' },
  t.string(),
  ctx => ctx.withTx(tx => admissionStatusV2(tx)),
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

function assertExistingPlayerV2Consistency(
  ctx: Parameters<typeof requireWarpkeepJwt>[0],
  claims: WarpkeepJwtClaims,
): void {
  const existingPlayer = ctx.db.playerV2.fid.find(claims.fid);
  const existingOwnership = ctx.db.playerOwnershipV2.fid.find(claims.fid);
  const ownershipState = evaluatePlayerOwnership(
    existingPlayer !== null,
    existingOwnership !== null,
    existingOwnership?.identity.equals(ctx.sender) ?? false,
  );

  if (ownershipState === 'unbound') {
    if (ctx.db.playerOwnershipV2.identity.find(ctx.sender) !== null) {
      throw new SenderError('IDENTITY_MISMATCH');
    }
    if (ctx.db.castle.ownerFid.find(claims.fid) !== null) {
      throw new SenderError('STATE_INTEGRITY');
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
 * Retained only so a protocol-v1 client cannot reach its historical writer.
 * It deliberately performs no lookup or mutation.
 */
export const bootstrapPlayer = warpkeep.reducer(
  { name: 'bootstrap_player' },
  () => {
    throw new SenderError('PROTOCOL_RETIRED');
  },
);

/**
 * Atomic and idempotent: it derives the account key from the bridge JWT,
 * allocates the center tile first, and commits the v2 ownership/projection,
 * castle, and occupancy together without touching the frozen legacy player.
 */
export const bootstrapPlayerV2 = warpkeep.reducer(
  { name: 'bootstrap_player_v2' },
  ctx => {
    const { claims } = requireAllowedFid(ctx);
    if (!worldCastleGraphIsConsistent(ctx.db.worldTile.iter(), ctx.db.castle.iter())) {
      throw new SenderError('STATE_INTEGRITY');
    }
    assertExistingPlayerV2Consistency(ctx, claims);
    if (ctx.db.playerV2.fid.find(claims.fid) !== null) return;

    const spawn = firstUnoccupiedTile(ctx);
    ctx.db.playerOwnershipV2.insert({
      fid: claims.fid,
      identity: ctx.sender,
    });

    ctx.db.playerV2.insert({
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
