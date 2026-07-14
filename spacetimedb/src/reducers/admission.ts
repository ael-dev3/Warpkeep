import { SenderError, t } from 'spacetimedb/server';

import type { WarpkeepJwtClaims } from '../claims';
import { evaluateAdmissionEpoch } from '../admissionPolicy';
import { requireAdmittedPlayer, requireAllowedFid, requireWarpkeepJwt } from '../auth';
import { assertGenesisFounderForFid } from '../foundingAuthority';
import { WARPKEEP_ALPHA_TERMS_VERSION } from '../marksAuthorityPolicy';
import { evaluatePlayerOwnership } from '../playerOwnershipPolicy';
import warpkeep from '../schema';

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
  assertGenesisFounderForFid(ctx, claims.fid);

  const player = ctx.db.playerV2.fid.find(claims.fid);
  const ownership = ctx.db.playerOwnershipV2.fid.find(claims.fid);
  const ownershipState = evaluatePlayerOwnership(
    player !== null,
    ownership !== null,
    ownership?.identity.equals(ctx.sender) ?? false,
  );
  if (ownershipState === 'unbound') {
    if (ctx.db.playerOwnershipV2.identity.find(ctx.sender) !== null) return 'disabled';
    return 'admitted_needs_bootstrap';
  }
  if (ownershipState !== 'current') return 'disabled';

  return 'ready';
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

function assertExistingPlayerV2Consistency(
  ctx: Parameters<typeof requireWarpkeepJwt>[0],
  claims: WarpkeepJwtClaims,
): void {
  assertGenesisFounderForFid(ctx, claims.fid);
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
    return;
  }

  if (ownershipState === 'partial') {
    throw new SenderError('STATE_INTEGRITY');
  }

  if (ownershipState === 'identity_mismatch') {
    throw new SenderError('IDENTITY_MISMATCH');
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
 * Atomic and idempotent: it derives the account key from the bridge JWT and
 * links the already-founded permanent assignment. Admission never fabricates
 * an Identity and first authentication never moves or recreates the castle.
 */
export const bootstrapPlayerV2 = warpkeep.reducer(
  { name: 'bootstrap_player_v2' },
  ctx => {
    const { claims } = requireAllowedFid(ctx);
    assertExistingPlayerV2Consistency(ctx, claims);
    if (ctx.db.playerV2.fid.find(claims.fid) !== null) {
      const existingProfile = ctx.db.realmProfileV1.fid.find(claims.fid);
      if (existingProfile?.firstAuthenticatedAt === undefined) {
        throw new SenderError('STATE_INTEGRITY');
      }
      return;
    }

    const profile = ctx.db.realmProfileV1.fid.find(claims.fid);
    if (profile === null) throw new SenderError('STATE_INTEGRITY');
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
      joinedAt: profile.admittedAt,
      status: 'active',
    });
    ctx.db.realmProfileV1.fid.update({
      ...profile,
      firstAuthenticatedAt: profile.firstAuthenticatedAt ?? ctx.timestamp,
      profileUpdatedAt: ctx.timestamp,
    });
  },
);

/**
 * Records the explicit current Alpha agreement after genuine authentication.
 * This is the only player transition that makes private Mark aggregates public.
 */
export const acceptAlphaTermsV1 = warpkeep.reducer(
  { name: 'accept_alpha_terms_v1' },
  { termsVersion: t.string(), accepted: t.bool() },
  (ctx, { termsVersion, accepted }) => {
    const { claims } = requireAdmittedPlayer(ctx);
    if (!accepted || termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION) {
      throw new SenderError('ALPHA_TERMS_REQUIRED');
    }
    const profile = ctx.db.realmProfileV1.fid.find(claims.fid);
    const account = ctx.db.markAccountV1.fid.find(claims.fid);
    if (profile === null || account === null || profile.firstAuthenticatedAt === undefined) {
      throw new SenderError('STATE_INTEGRITY');
    }
    const acceptanceKey = `${claims.fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`;
    const existingAcceptance = ctx.db.alphaTermsAcceptanceV1.acceptanceKey.find(acceptanceKey);
    if (existingAcceptance === null) {
      ctx.db.alphaTermsAcceptanceV1.insert({
        acceptanceKey,
        fid: claims.fid,
        termsVersion: WARPKEEP_ALPHA_TERMS_VERSION,
        acceptedAt: ctx.timestamp,
      });
    } else if (
      existingAcceptance.fid !== claims.fid
      || existingAcceptance.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION
    ) {
      throw new SenderError('ALPHA_TERMS_ACCEPTANCE_CONFLICT');
    }
    if (profile.communityStatsVisible) return;
    ctx.db.realmProfileV1.fid.update({
      ...profile,
      publicStatus: 'active',
      communityStatsVisible: true,
      totalSnapBurnedMicros: account.totalSnapBurnedMicros,
      marksEarnedMicros: account.earnedMicros,
      marksSpentMicros: account.spentMicros,
      marksBalanceMicros: account.balanceMicros,
      marksPolicyVersion: account.policyVersion,
    });
  },
);
