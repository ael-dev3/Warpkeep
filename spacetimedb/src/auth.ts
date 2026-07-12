import {
  SenderError,
  type AuthCtx,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

import {
  ClaimValidationError,
  type WarpkeepBaseJwtClaims,
  type WarpkeepJwtClaims,
  isHermesAdminJwt,
  readFreshHermesAdminJwt,
  readFreshWarpkeepPlayerJwt,
  readWarpkeepBaseJwt,
} from './claims';
import { MAX_SUPPORTED_FID } from './config';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

function senderError(error: unknown): never {
  if (error instanceof ClaimValidationError) {
    throw new SenderError(error.code);
  }

  throw error;
}

function requireJwtPayload(auth: AuthCtx): unknown {
  const jwt = auth.jwt;
  if (jwt === null) {
    throw new SenderError('AUTH_REQUIRED');
  }

  return jwt.fullPayload;
}

/** Require the complete bridge-issued Farcaster player token contract. */
export function requireWarpkeepJwt(ctx: WarpkeepReducerContext): WarpkeepJwtClaims {
  try {
    return readFreshWarpkeepPlayerJwt(
      requireJwtPayload(ctx.senderAuth),
      ctx.timestamp.microsSinceUnixEpoch,
    );
  } catch (error) {
    return senderError(error);
  }
}

/**
 * Connections may be made by a player token or by the short-lived Hermes
 * admin token. Both still require the exact bridge issuer, audience, token
 * type, and syntactically valid roles. Player calls continue to require an
 * FID and auth epoch; admin-only procedures separately require the role.
 */
export function requireWarpkeepConnection(
  ctx: WarpkeepReducerContext,
): WarpkeepJwtClaims | WarpkeepBaseJwtClaims {
  try {
    const payload = requireJwtPayload(ctx.senderAuth);
    const base = readWarpkeepBaseJwt(payload);
    return isHermesAdminJwt(base)
      ? base
      : readFreshWarpkeepPlayerJwt(payload, ctx.timestamp.microsSinceUnixEpoch);
  } catch (error) {
    return senderError(error);
  }
}

/** Require a bridge-issued admin token; admin tokens intentionally have no FID. */
export function requireAdmin(ctx: WarpkeepReducerContext): WarpkeepBaseJwtClaims {
  try {
    return readFreshHermesAdminJwt(
      requireJwtPayload(ctx.senderAuth),
      ctx.timestamp.microsSinceUnixEpoch,
    );
  } catch (error) {
    return senderError(error);
  }
}

export function requireAllowedFid(ctx: WarpkeepReducerContext): {
  claims: WarpkeepJwtClaims;
  allowed: NonNullable<ReturnType<typeof ctx.db.allowedFid.fid.find>>;
} {
  const claims = requireWarpkeepJwt(ctx);
  const allowed = ctx.db.allowedFid.fid.find(claims.fid);

  if (allowed === null || !allowed.enabled) {
    throw new SenderError('NOT_ADMITTED');
  }

  if (allowed.authEpoch !== claims.authEpoch) {
    throw new SenderError('AUTH_EPOCH_MISMATCH');
  }

  return { claims, allowed };
}

export function requireAdmittedPlayer(ctx: WarpkeepReducerContext): {
  claims: WarpkeepJwtClaims;
  player: NonNullable<ReturnType<typeof ctx.db.player.fid.find>>;
} {
  const { claims } = requireAllowedFid(ctx);
  const player = ctx.db.player.fid.find(claims.fid);

  if (player === null) {
    throw new SenderError('PLAYER_NOT_BOOTSTRAPPED');
  }

  if (!player.identity.equals(ctx.sender)) {
    throw new SenderError('IDENTITY_MISMATCH');
  }

  return { claims, player };
}

/** Admin inputs use the same safe FID envelope as bridge-issued player claims. */
export function requireSupportedFid(fid: bigint): void {
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new SenderError('INVALID_FID');
  }
}
