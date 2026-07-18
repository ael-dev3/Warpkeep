import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

import type warpkeep from './schema';
import {
  FoundingPolicyError,
  existingFounderAssignmentIsConsistent,
  selectNextPermanentCastleSlot,
} from './foundingPolicy';
import {
  SNAP_MARK_POLICY_VERSION,
  markAccountIsConsistent,
} from './marksAuthorityPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  GENESIS_STARTING_RESOURCE_BALANCES,
} from './resourceAuthorityPolicy';
import {
  admissionProfileIsComplete,
  trustedProfilesEqual,
  type AdmissionReadyTrustedProfile,
} from './profileAuthorityPolicy';
import {
  HEGEMONY_REALM_ID,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
  matchesGenerationV2Realm,
} from './world';
import {
  classifyGenesisStaticSnapshot,
} from './worldSeedPolicy';
import { worldCastleGraphIsConsistent } from './worldCastleIntegrity';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

function fail(code = 'STATE_INTEGRITY'): never {
  throw new SenderError(code);
}

function assertGenesisStaticStateComplete(ctx: WarpkeepReducerContext): void {
  const generation = classifyGenesisStaticSnapshot({
    worldTiles: ctx.db.worldTile.iter(),
    realms: ctx.db.realmV1.iter(),
    worldMeta: ctx.db.worldTileMetaV1.iter(),
    castleSlots: ctx.db.castleSlotV1.iter(),
  });
  if (generation === 'invalid') fail('GENESIS_NOT_SEEDED');
}

function profileProjectionIsConsistent(
  profile: NonNullable<ReturnType<WarpkeepReducerContext['db']['realmProfileV1']['fid']['find']>>,
  account: NonNullable<ReturnType<WarpkeepReducerContext['db']['markAccountV1']['fid']['find']>>,
): boolean {
  if (!profile.communityStatsVisible) {
    return profile.totalSnapBurnedMicros === undefined
      && profile.marksEarnedMicros === undefined
      && profile.marksSpentMicros === undefined
      && profile.marksBalanceMicros === undefined
      && profile.marksPolicyVersion === undefined;
  }
  return profile.firstAuthenticatedAt !== undefined
    && profile.totalSnapBurnedMicros === account.totalSnapBurnedMicros
    && profile.marksEarnedMicros === account.earnedMicros
    && profile.marksSpentMicros === account.spentMicros
    && profile.marksBalanceMicros === account.balanceMicros
    && profile.marksPolicyVersion === account.policyVersion;
}

export function assertGenesisFoundingGraph(
  ctx: WarpkeepReducerContext,
  permittedUnfoundedFid?: bigint,
): void {
  assertGenesisStaticStateComplete(ctx);
  if (!worldCastleGraphIsConsistent(ctx.db.worldTile.iter(), ctx.db.castle.iter())) fail();

  let claimCount = 0n;
  for (const claim of ctx.db.castleSlotClaimV1.iter()) {
    claimCount += 1n;
    const castle = ctx.db.castle.castleId.find(claim.castleId);
    const slot = ctx.db.castleSlotV1.slotId.find(claim.slotId);
    if (castle === null || slot === null) fail();
    const tile = ctx.db.worldTile.key.find(slot.tileKey);
    if (tile === null || !existingFounderAssignmentIsConsistent({
      fid: claim.ownerFid,
      castleId: castle.castleId,
      castleOwnerFid: castle.ownerFid,
      castleTileKey: castle.tileKey,
      castleQ: castle.q,
      castleR: castle.r,
      castleLevel: castle.level,
      claimOwnerFid: claim.ownerFid,
      claimCastleId: claim.castleId,
      claimSlotId: claim.slotId,
      claimGenerationVersion: claim.generationVersion,
      slot,
      tileOccupantCastleId: tile.occupantCastleId,
    })) fail();
    if (ctx.db.allowedFid.fid.find(claim.ownerFid) === null) fail();
  }
  if (claimCount !== ctx.db.castle.count()) fail();

  for (const account of ctx.db.markAccountV1.iter()) {
    const profile = ctx.db.realmProfileV1.fid.find(account.fid);
    if (
      profile === null
      || ctx.db.allowedFid.fid.find(account.fid) === null
      || !admissionProfileIsComplete(profile)
      || !markAccountIsConsistent(account)
      || !profileProjectionIsConsistent(profile, account)
    ) fail();
  }
  for (const profile of ctx.db.realmProfileV1.iter()) {
    if (
      ctx.db.allowedFid.fid.find(profile.fid) === null
      || ctx.db.markAccountV1.fid.find(profile.fid) === null
      || ctx.db.castle.ownerFid.find(profile.fid) === null
    ) fail();
  }
  for (const allowed of ctx.db.allowedFid.iter()) {
    if (allowed.fid === permittedUnfoundedFid) continue;
    if (
      ctx.db.castle.ownerFid.find(allowed.fid) === null
      || ctx.db.castleSlotClaimV1.ownerFid.find(allowed.fid) === null
      || ctx.db.realmProfileV1.fid.find(allowed.fid) === null
      || ctx.db.markAccountV1.fid.find(allowed.fid) === null
    ) fail();
  }
}

function requireGenesisFounderStructureForFid(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): NonNullable<ReturnType<WarpkeepReducerContext['db']['realmProfileV1']['fid']['find']>> {
  const castle = ctx.db.castle.ownerFid.find(fid);
  const claim = ctx.db.castleSlotClaimV1.ownerFid.find(fid);
  const profile = ctx.db.realmProfileV1.fid.find(fid);
  const account = ctx.db.markAccountV1.fid.find(fid);
  if (
    ctx.db.allowedFid.fid.find(fid) === null
    || castle === null
    || claim === null
    || profile === null
    || account === null
    || !markAccountIsConsistent(account)
    || !profileProjectionIsConsistent(profile, account)
  ) fail();
  const slot = ctx.db.castleSlotV1.slotId.find(claim.slotId);
  const tile = slot === null ? null : ctx.db.worldTile.key.find(slot.tileKey);
  const meta = slot === null ? null : ctx.db.worldTileMetaV1.tileKey.find(slot.tileKey);
  const realm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
  if (
    slot === null
    || tile === null
    || meta === null
    || realm === null
    || !matchesCanonicalTerrain(tile)
    || !matchesCanonicalWorldMeta(meta)
    || (!matchesCanonicalRealm(realm) && !matchesGenerationV2Realm(realm))
    || !existingFounderAssignmentIsConsistent({
      fid,
      castleId: castle.castleId,
      castleOwnerFid: castle.ownerFid,
      castleTileKey: castle.tileKey,
      castleQ: castle.q,
      castleR: castle.r,
      castleLevel: castle.level,
      claimOwnerFid: claim.ownerFid,
      claimCastleId: claim.castleId,
      claimSlotId: claim.slotId,
      claimGenerationVersion: claim.generationVersion,
      slot,
      tileOccupantCastleId: tile.occupantCastleId,
    })
  ) fail();
  return profile;
}

/** Exact-admin recovery gate: structure must be sound, but profile may need repair. */
export function assertGenesisFounderForProfileRepair(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): void {
  requireGenesisFounderStructureForFid(ctx, fid);
}

/** Player and gameplay gate: structural validity plus complete public identity. */
export function assertGenesisFounderForFid(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): void {
  const profile = requireGenesisFounderStructureForFid(ctx, fid);
  if (!admissionProfileIsComplete(profile)) fail('FOUNDER_PROFILE_INCOMPLETE');
}

/**
 * Creates the complete permanent founder state or verifies and preserves the
 * complete existing assignment. Reducer atomicity rolls every write back if a
 * later invariant check fails.
 */
export function ensureGenesisFounder(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  admissionProfile: AdmissionReadyTrustedProfile,
): 'created' | 'preserved' {
  const existingCastle = ctx.db.castle.ownerFid.find(fid);
  const existingClaim = ctx.db.castleSlotClaimV1.ownerFid.find(fid);
  const existingProfile = ctx.db.realmProfileV1.fid.find(fid);
  const existingAccount = ctx.db.markAccountV1.fid.find(fid);
  const existingResourceAccount = ctx.db.resourceAccountV1.fid.find(fid);

  if (existingCastle !== null) {
    if (
      existingClaim === null
      || existingProfile === null
      || existingAccount === null
      || !admissionProfileIsComplete(existingProfile)
      || !trustedProfilesEqual(existingProfile, admissionProfile)
    ) fail();
    assertGenesisFoundingGraph(ctx);
    return 'preserved';
  }
  if (
    existingClaim !== null
    || existingProfile !== null
    || existingAccount !== null
    || existingResourceAccount !== null
  ) fail();
  assertGenesisFoundingGraph(ctx, fid);

  const claimedSlotIds = new Set<number>();
  for (const claim of ctx.db.castleSlotClaimV1.iter()) claimedSlotIds.add(claim.slotId);
  let slot;
  try {
    slot = selectNextPermanentCastleSlot(ctx.db.castleSlotV1.iter(), claimedSlotIds);
  } catch (error) {
    if (error instanceof FoundingPolicyError) fail(error.code);
    throw error;
  }
  const tile = ctx.db.worldTile.key.find(slot.tileKey);
  if (
    tile === null
    || tile.q !== slot.q
    || tile.r !== slot.r
    || tile.occupantCastleId !== undefined
  ) fail();

  const profile = ctx.db.realmProfileV1.insert({
    fid,
    canonicalUsername: admissionProfile.canonicalUsername,
    displayName: admissionProfile.displayName,
    pfpUrl: admissionProfile.pfpUrl,
    publicBio: admissionProfile.publicBio,
    admittedAt: ctx.timestamp,
    firstAuthenticatedAt: undefined,
    profileUpdatedAt: ctx.timestamp,
    publicStatus: 'founded',
    communityStatsVisible: false,
    totalSnapBurnedMicros: undefined,
    marksEarnedMicros: undefined,
    marksSpentMicros: undefined,
    marksBalanceMicros: undefined,
    marksPolicyVersion: undefined,
  });
  if (
    !admissionProfileIsComplete(profile)
    || !trustedProfilesEqual(profile, admissionProfile)
    || profile.firstAuthenticatedAt !== undefined
    || profile.communityStatsVisible
    || profile.totalSnapBurnedMicros !== undefined
    || profile.marksEarnedMicros !== undefined
    || profile.marksSpentMicros !== undefined
    || profile.marksBalanceMicros !== undefined
    || profile.marksPolicyVersion !== undefined
  ) fail();

  ctx.db.markAccountV1.insert({
    fid,
    totalSnapBurnedMicros: 0n,
    earnedMicros: 0n,
    spentMicros: 0n,
    balanceMicros: 0n,
    policyVersion: SNAP_MARK_POLICY_VERSION,
    updatedAt: ctx.timestamp,
  });
  const castle = ctx.db.castle.insert({
    castleId: 0n,
    ownerFid: fid,
    tileKey: slot.tileKey,
    q: slot.q,
    r: slot.r,
    level: 1,
    name: `Hegemony Keep ${slot.slotId.toString().padStart(3, '0')}`,
    createdAt: ctx.timestamp,
  });
  ctx.db.castleSlotClaimV1.insert({
    slotId: slot.slotId,
    ownerFid: fid,
    castleId: castle.castleId,
    claimedAt: ctx.timestamp,
    generationVersion: slot.generationVersion,
  });
  ctx.db.worldTile.key.update({ ...tile, occupantCastleId: castle.castleId });
  ctx.db.resourceAccountV1.insert({
    fid,
    castleId: castle.castleId,
    realmId: HEGEMONY_REALM_ID,
    ...GENESIS_STARTING_RESOURCE_BALANCES,
    settledThroughMicros: ctx.timestamp.microsSinceUnixEpoch,
    revision: 0n,
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });

  assertGenesisFoundingGraph(ctx);
  return 'created';
}
