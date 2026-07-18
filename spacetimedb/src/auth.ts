import {
  SenderError,
  type AuthCtx,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

import {
  type AuthEpochResolverJwtClaims,
  ClaimValidationError,
  type QaSnapshotResolverJwtClaims,
  type WarpkeepBaseJwtClaims,
  type WarpkeepJwtClaims,
  isAuthEpochResolverJwt,
  isHermesAdminJwt,
  isQaSnapshotResolverJwt,
  readFreshAuthEpochResolverJwt,
  readFreshHermesAdminJwt,
  readFreshQaSnapshotResolverJwt,
  readFreshWarpkeepPlayerJwt,
  readWarpkeepBaseJwt,
} from './claims';
import { evaluateAdmissionEpoch } from './admissionPolicy';
import { MAX_SUPPORTED_FID } from './config';
import { assertGenesisFounderForFid } from './foundingAuthority';
import { WARPKEEP_ALPHA_TERMS_VERSION } from './marksAuthorityPolicy';
import { evaluatePlayerOwnership } from './playerOwnershipPolicy';
import { assertGenesisResourceForFid } from './resourceAuthority';
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
 * Hermes administrator, the exact fresh admission resolver, or the exact fresh
 * QA snapshot resolver. SpacetimeDB invokes this lifecycle gate before HTTP
 * procedures too, so either resolver must pass it before its independently
 * protected read-only procedure can run. A resolver bearer presented while
 * fresh can technically establish public subscriptions that may persist until
 * transport disconnect. Only the admission resolver can read static backend
 * metadata; the QA resolver is rejected there. Reducer/procedure guards still
 * deny player, private, and administrator authority and recheck resolver expiry.
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
    if (isQaSnapshotResolverJwt(base)) {
      return readFreshQaSnapshotResolverJwt(
        payload,
        ctx.timestamp.microsSinceUnixEpoch,
      );
    }
  } catch (error) {
    return senderError(error);
  }

  return requireAllowedFid(ctx).claims;
}

/**
 * Static compatibility metadata remains available to ordinary admitted,
 * administrator, and admission-resolver connections. The QA principal is
 * deliberately excluded so its sole callable procedure is the v2 aggregate
 * attestation; the retained v1 wire fails before entering this guard.
 */
export function requireWarpkeepMetadataConnection(
  ctx: WarpkeepReducerContext,
): WarpkeepJwtClaims | WarpkeepBaseJwtClaims {
  const claims = requireWarpkeepConnection(ctx);
  if (isQaSnapshotResolverJwt(claims)) {
    throw new SenderError('INVALID_QA_SNAPSHOT_RESOLVER_SESSION');
  }
  return claims;
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

/** Require the exact fresh bridge-internal principal for the QA snapshot only. */
export function requireQaSnapshotResolver(
  ctx: WarpkeepReducerContext,
): QaSnapshotResolverJwtClaims {
  try {
    return readFreshQaSnapshotResolverJwt(
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
  player: NonNullable<ReturnType<typeof ctx.db.playerV2.fid.find>>;
  castle: NonNullable<ReturnType<typeof ctx.db.castle.ownerFid.find>>;
} {
  const { claims } = requireAllowedFid(ctx);
  assertGenesisFounderForFid(ctx, claims.fid);
  const player = ctx.db.playerV2.fid.find(claims.fid);
  const ownership = ctx.db.playerOwnershipV2.fid.find(claims.fid);
  const castle = ctx.db.castle.ownerFid.find(claims.fid);
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

  if (castle === null) {
    throw new SenderError('STATE_INTEGRITY');
  }

  return { claims, player: player!, castle };
}

/**
 * Resolve the only castle the authenticated caller may control. Player-facing
 * commands deliberately accept no FID or castle selector; future own-castle
 * reducers should derive their actor through this boundary.
 */
export function requireOwnedCastleActionV1(
  ctx: WarpkeepReducerContext,
): ReturnType<typeof requireAdmittedPlayer> {
  const admitted = requireAdmittedPlayer(ctx);
  if (admitted.castle.ownerFid !== admitted.claims.fid) {
    throw new SenderError('STATE_INTEGRITY');
  }
  return admitted;
}

/**
 * Require the complete current gameplay graph. Resource entry points never
 * infer Alpha consent from public presentation fields alone.
 */
export function requireGameplayPlayerV1(ctx: WarpkeepReducerContext) {
  const admitted = requireOwnedCastleActionV1(ctx);
  const acceptanceKey = `${admitted.claims.fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`;
  const acceptance = ctx.db.alphaTermsAcceptanceV1.acceptanceKey.find(acceptanceKey);
  if (
    acceptance === null
    || acceptance.fid !== admitted.claims.fid
    || acceptance.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION
  ) {
    throw new SenderError('ALPHA_TERMS_REQUIRED');
  }
  const resource = assertGenesisResourceForFid(ctx, admitted.claims.fid);
  return Object.freeze({ ...admitted, ...resource });
}

/** Admin inputs use the same safe FID envelope as bridge-issued player claims. */
export function requireSupportedFid(fid: bigint): void {
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new SenderError('INVALID_FID');
  }
}
