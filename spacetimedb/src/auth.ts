import {
  SenderError,
  type AuthCtx,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

import {
  type AuthEpochResolverJwtClaims,
  ClaimValidationError,
  type WarpkeepBaseJwtClaims,
  type WarpkeepJwtClaims,
  isAuthEpochResolverJwt,
  isHermesAdminJwt,
  readFreshAuthEpochResolverJwt,
  readFreshHermesAdminJwt,
  readFreshWarpkeepPlayerJwt,
  readWarpkeepBaseJwt,
} from './claims';
import { evaluateAdmissionEpoch } from './admissionPolicy';
import { MAX_SUPPORTED_FID } from './config';
import { assertGenesisFounderForFid } from './foundingAuthority';
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
 * Connections may be made only by a currently admitted player, the exact fresh
 * Hermes administrator, or the exact fresh resolver principal. SpacetimeDB
 * invokes this lifecycle gate before HTTP procedures too, so the resolver must
 * pass it before its independently protected read-only procedure can run.
 * A resolver bearer presented while fresh can technically establish public
 * subscriptions that may persist until transport disconnect, and can read
 * static backend metadata while fresh. Reducer/procedure guards still deny
 * player, private, and administrator authority and recheck resolver expiry.
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
    if (isAuthEpochResolverJwt(base)) {
      return readFreshAuthEpochResolverJwt(
        payload,
        ctx.timestamp.microsSinceUnixEpoch,
      );
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

/** Require the exact short-lived resolver bound to this one procedure FID. */
export function requireAuthEpochResolver(
  ctx: WarpkeepReducerContext,
  expectedFid: bigint,
): AuthEpochResolverJwtClaims {
  try {
    const claims = readFreshAuthEpochResolverJwt(
      requireJwtPayload(ctx.senderAuth),
      ctx.timestamp.microsSinceUnixEpoch,
    );
    if (claims.resolverFid !== expectedFid) {
      throw new ClaimValidationError('INVALID_AUTH_RESOLVER_SESSION');
    }
    return claims;
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
  player: NonNullable<ReturnType<typeof ctx.db.playerV2.fid.find>>;
} {
  const { claims } = requireAllowedFid(ctx);
  assertGenesisFounderForFid(ctx, claims.fid);
  const player = ctx.db.playerV2.fid.find(claims.fid);
  const ownership = ctx.db.playerOwnershipV2.fid.find(claims.fid);
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

  if (ctx.db.castle.ownerFid.find(claims.fid) === null) {
    throw new SenderError('STATE_INTEGRITY');
  }

  return { claims, player: player! };
}

/** Admin inputs use the same safe FID envelope as bridge-issued player claims. */
export function requireSupportedFid(fid: bigint): void {
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new SenderError('INVALID_FID');
  }
}
