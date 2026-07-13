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
  readFreshAuthEpochResolverJwt,
  readFreshHermesAdminJwt,
  readFreshWarpkeepPlayerJwt,
  readWarpkeepBaseJwt,
} from './claims';
import { evaluateAdmissionEpoch } from './admissionPolicy';
import { MAX_SUPPORTED_FID } from './config';
import { evaluatePlayerOwnership } from './playerOwnershipPolicy';
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
 * Connections may be made only by a currently admitted player or the exact,
 * fresh Hermes administrator. The resolver principal is intentionally limited
 * to its HTTP procedure and cannot open a subscription-bearing connection.
 */
export function requireWarpkeepConnection(
  ctx: WarpkeepReducerContext,
): WarpkeepJwtClaims | WarpkeepBaseJwtClaims {
  try {
    const payload = requireJwtPayload(ctx.senderAuth);
    const base = readWarpkeepBaseJwt(payload);
    if (isHermesAdminJwt(base)) {
      return readFreshHermesAdminJwt(payload, ctx.timestamp.microsSinceUnixEpoch);
    }
  } catch (error) {
    return senderError(error);
  }

  return requireAllowedFid(ctx).claims;
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

/** Require the exact, short-lived principal dedicated to admission resolution. */
export function requireAuthEpochResolver(
  ctx: WarpkeepReducerContext,
): WarpkeepBaseJwtClaims {
  try {
    return readFreshAuthEpochResolverJwt(
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
  const decision = evaluateAdmissionEpoch(allowed, claims.authEpoch);

  if (decision === 'missing' || decision === 'disabled') {
    throw new SenderError('NOT_ADMITTED');
  }

  if (decision === 'epoch_mismatch') {
    throw new SenderError('AUTH_EPOCH_MISMATCH');
  }

  return { claims, allowed: allowed! };
}

export function requireAdmittedPlayer(ctx: WarpkeepReducerContext): {
  claims: WarpkeepJwtClaims;
  player: NonNullable<ReturnType<typeof ctx.db.player.fid.find>>;
} {
  const { claims } = requireAllowedFid(ctx);
  const player = ctx.db.player.fid.find(claims.fid);
  const ownership = ctx.db.playerOwnership.fid.find(claims.fid);
  const ownershipState = evaluatePlayerOwnership(
    player !== null,
    ownership !== null,
    ownership?.identity.equals(ctx.sender) ?? false,
  );

  if (ownershipState === 'unbound') {
    throw new SenderError('PLAYER_NOT_BOOTSTRAPPED');
  }

  if (ownershipState === 'partial') {
    throw new SenderError('STATE_INTEGRITY');
  }

  if (ownershipState === 'identity_mismatch') {
    throw new SenderError('IDENTITY_MISMATCH');
  }

  return { claims, player: player! };
}

/** Admin inputs use the same safe FID envelope as bridge-issued player claims. */
export function requireSupportedFid(fid: bigint): void {
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new SenderError('INVALID_FID');
  }
}
