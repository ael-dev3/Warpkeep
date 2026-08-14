import {
  SenderError,
  type AuthCtx,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

import {
  type AccessRequestResolverJwtClaims,
  type AuthEpochResolverJwtClaims,
  ClaimValidationError,
  type QaSnapshotResolverJwtClaims,
  type WarpkeepBaseJwtClaims,
  type WarpkeepJwtClaims,
  isAccessRequestResolverJwt,
  isAuthEpochResolverJwt,
  isHermesAdminJwt,
  isQaSnapshotResolverJwt,
  readFreshAccessRequestResolverJwt,
  readFreshAuthEpochResolverJwt,
  readFreshHermesAdminJwt,
  readFreshQaSnapshotResolverJwt,
  readFreshWarpkeepPlayerJwt,
  readWarpkeepBaseJwt,
} from './claims';
import { evaluateAdmissionEpoch } from './admissionPolicy';
import { MAX_SUPPORTED_FID } from './config';
import { assertGenesisFounderForFid } from './foundingAuthority';
import { WARPKEEP_ALPHA_TERMS_VERSION } from './entryAgreementPolicy';
import {
  currentGreaterRealmActivationRowV1,
} from './greaterRealmActivationState';
import {
  assertGreaterRealmIndexedPublicReadAuthorityV1,
  GreaterRealmPublicReadAuthorityError,
} from './greaterRealmPublicReadAuthority';
import { evaluatePlayerOwnership } from './playerOwnershipPolicy';
import {
  requireStoredProductionPlayerCanaryApprovalRegistrationV2,
} from './productionPlayerCanaryApproval';
import {
  productionPlayerCanaryGameplayWriteGateCodeV2,
} from './productionPlayerCanaryApprovalPolicy';
import {
  assertGenesisResourceForFid,
  assertGreaterRealmResourceForIndexedReadV1,
} from './resourceAuthority';
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
 * Hermes administrator, the exact fresh admission resolver, the exact fresh
 * access-request resolver, or the exact fresh QA snapshot resolver. SpacetimeDB
 * invokes this lifecycle gate before HTTP procedures too, so a resolver must
 * pass it before its independently protected procedure can run. A resolver bearer presented while
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
    if (isAccessRequestResolverJwt(base)) {
      return readFreshAccessRequestResolverJwt(
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
 * administrator, and admission-resolver connections. The QA and access-request
 * principals are deliberately excluded so each retains only its exact
 * independently guarded procedure surface.
 */
export function requireWarpkeepMetadataConnection(
  ctx: WarpkeepReducerContext,
): WarpkeepJwtClaims | WarpkeepBaseJwtClaims {
  const claims = requireWarpkeepConnection(ctx);
  if (isQaSnapshotResolverJwt(claims)) {
    throw new SenderError('INVALID_QA_SNAPSHOT_RESOLVER_SESSION');
  }
  if (isAccessRequestResolverJwt(claims)) {
    throw new SenderError('INVALID_ACCESS_REQUEST_RESOLVER_SESSION');
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

/** Require the fresh bridge-internal principal and derive its sole bound FID. */
export function requireAccessRequestResolver(
  ctx: WarpkeepReducerContext,
  expectedOperation: 'status' | 'submit',
): AccessRequestResolverJwtClaims {
  try {
    const claims = readFreshAccessRequestResolverJwt(
      requireJwtPayload(ctx.senderAuth),
      ctx.timestamp.microsSinceUnixEpoch,
    );
    if (claims.requestOperation !== expectedOperation) {
      throw new ClaimValidationError('INVALID_ACCESS_REQUEST_RESOLVER_SESSION');
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
 * Authenticate an exact admitted player/castle owner without reading the
 * mutable Greater Realm activation roots. Receipt-first commands use this
 * boundary so a valid terminal retry survives halt or later capacity drift;
 * fresh commands must separately require the complete current founder graph.
 */
export function requireAuthenticatedCastleOwnerActionV1(
  ctx: WarpkeepReducerContext,
): ReturnType<typeof requireAllowedFid> & {
  player: NonNullable<ReturnType<typeof ctx.db.playerV2.fid.find>>;
  castle: NonNullable<ReturnType<typeof ctx.db.castle.ownerFid.find>>;
} {
  const admitted = requireAllowedFid(ctx);
  const player = ctx.db.playerV2.fid.find(admitted.claims.fid);
  const ownership = ctx.db.playerOwnershipV2.fid.find(admitted.claims.fid);
  const castle = ctx.db.castle.ownerFid.find(admitted.claims.fid);
  const acceptance = ctx.db.alphaTermsAcceptanceV1.acceptanceKey.find(
    `${admitted.claims.fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`,
  );
  const ownershipState = evaluatePlayerOwnership(
    player !== null,
    ownership !== null,
    ownership?.identity.equals(ctx.sender) ?? false,
  );
  if (ownershipState === 'unbound') throw new SenderError('PLAYER_NOT_BOOTSTRAPPED');
  if (ownershipState === 'partial' || castle === null) throw new SenderError('STATE_INTEGRITY');
  if (ownershipState === 'identity_mismatch') throw new SenderError('IDENTITY_MISMATCH');
  if (castle.ownerFid !== admitted.claims.fid) throw new SenderError('STATE_INTEGRITY');
  if (
    acceptance === null
    || acceptance.fid !== admitted.claims.fid
    || acceptance.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION
  ) throw new SenderError('ALPHA_TERMS_REQUIRED');
  return Object.freeze({ ...admitted, player: player!, castle });
}

/** Gate-free current gameplay graph shared by mutations and legacy reads. */
function requireGameplayPlayerGraphV1(ctx: WarpkeepReducerContext) {
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

/**
 * Require the complete current gameplay graph and mutation authority. Resource
 * entry points never infer acceptance from presentation or historical evidence.
 */
export function requireGameplayPlayerV1(ctx: WarpkeepReducerContext) {
  const gameplay = requireGameplayPlayerGraphV1(ctx);
  let activeCanary;
  try {
    activeCanary = requireStoredProductionPlayerCanaryApprovalRegistrationV2(
      ctx,
      gameplay.claims.fid,
    );
  } catch {
    throw new SenderError('STATE_INTEGRITY');
  }
  const canaryGateCode = productionPlayerCanaryGameplayWriteGateCodeV2(
    activeCanary,
    gameplay.claims.fid,
    ctx.timestamp.microsSinceUnixEpoch,
  );
  if (canaryGateCode !== undefined) throw new SenderError(canaryGateCode);
  return gameplay;
}

/**
 * Read-only v17 gate: authenticate once, validate bounded roots and the exact
 * indexed caller graph once, then validate the provided caller resource row
 * without entering any whole-population founder audit. Pre-cutover reads retain
 * the byte-for-byte legacy gameplay boundary.
 */
export function requireGameplayReadPlayerV1(ctx: WarpkeepReducerContext) {
  const admitted = requireAuthenticatedCastleOwnerActionV1(ctx);
  let activation;
  try {
    activation = currentGreaterRealmActivationRowV1(ctx);
  } catch {
    throw new SenderError('STATE_INTEGRITY');
  }
  if (
    activation === undefined
    || activation.canaryAt === undefined
    || activation.rolledBackAt !== undefined
  ) return requireGameplayPlayerGraphV1(ctx);
  try {
    const authority = assertGreaterRealmIndexedPublicReadAuthorityV1(
      ctx,
      activation,
      { fid: admitted.claims.fid, castle: admitted.castle },
    );
    const resource = assertGreaterRealmResourceForIndexedReadV1(ctx, authority);
    return Object.freeze({ ...admitted, ...resource, greaterRealm: authority });
  } catch (error) {
    if (error instanceof SenderError) throw error;
    throw new SenderError(error instanceof GreaterRealmPublicReadAuthorityError
      ? error.code
      : 'STATE_INTEGRITY');
  }
}

/** Exact caller-scoped v17 map authority without unrelated resource/profile reads. */
export function requireGreaterRealmPublicReadAuthorityV1(ctx: WarpkeepReducerContext) {
  const admitted = requireAuthenticatedCastleOwnerActionV1(ctx);
  try {
    const activation = currentGreaterRealmActivationRowV1(ctx);
    if (
      activation === undefined
      || activation.canaryAt === undefined
      || activation.rolledBackAt !== undefined
    ) throw new GreaterRealmPublicReadAuthorityError();
    const authority = assertGreaterRealmIndexedPublicReadAuthorityV1(
      ctx,
      activation,
      { fid: admitted.claims.fid, castle: admitted.castle },
    );
    return Object.freeze({ ...admitted, ...authority });
  } catch (error) {
    if (error instanceof SenderError) throw error;
    throw new SenderError(error instanceof GreaterRealmPublicReadAuthorityError
      ? error.code
      : 'STATE_INTEGRITY');
  }
}

/** Admin inputs use the same safe FID envelope as bridge-issued player claims. */
export function requireSupportedFid(fid: bigint): void {
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new SenderError('INVALID_FID');
  }
}
