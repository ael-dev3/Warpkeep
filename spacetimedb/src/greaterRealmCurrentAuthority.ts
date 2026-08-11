import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  currentGreaterRealmActivationRowV1,
  greaterRealmCutoverIsCurrentV1,
} from './greaterRealmActivationState';
import { selectGreaterRealmCastleAllocationV1 } from './greaterRealmActivationPolicy';
import { existingFounderAssignmentIsConsistent } from './foundingPolicy';
import {
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  markAccountIsConsistent,
} from './marksAuthorityPolicy';
import type { GenesisResourceTerrainKind } from './resourceAuthorityPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_PROTOCOL_VERSION,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_VISIBLE_TIER_MAX,
} from './greaterRealmV17Policy';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
} from './castleWorkerPolicy';
import { assertCastleWorkerRoster } from './castleWorkerRoster';
import type warpkeep from './schema';
import {
  HEGEMONY_REALM_ID,
  canonicalMetaForKey,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
  matchesGenerationV2Realm,
} from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['ownerFid']['find']>
>;
type ProfileRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmProfileV1']['fid']['find']>
>;
type ClaimRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCastleClaimV1']['ownerFid']['find']>
>;
type OccupancyRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCellOccupancyV1']['castleId']['find']>
>;
type ActivationRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmActivationV1']['activationId']['find']>
>;
type ReleaseRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmReleaseV1']['atlasId']['find']>
>;

const INITIAL_ATLAS_REVISION = 1n;

export class GreaterRealmCurrentAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmCurrentAuthorityError';
  }
}

function fail(code = 'STATE_INTEGRITY'): never {
  throw new GreaterRealmCurrentAuthorityError(code);
}

function sameTimestamp(
  left: { microsSinceUnixEpoch: bigint } | undefined,
  right: { microsSinceUnixEpoch: bigint } | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.microsSinceUnixEpoch === right.microsSinceUnixEpoch;
}

type PublicRegionManifest = Readonly<{
  regionId: string;
  publicName: string;
  ordinal: number;
  tier: number;
  cellCount: number;
  passableCellCount: number;
  chunkCount: number;
  castleCapacity: number;
  resourceLocationCount: number;
  resourceNodeCount: number;
  foodNodeCount: number;
  woodNodeCount: number;
  stoneNodeCount: number;
  goldNodeCount: number;
  active: boolean;
}>;

function currentPublicRegionManifest(release: ReleaseRow): readonly PublicRegionManifest[] {
  if (release.regionManifestJson === undefined || !release.regionManifestJson.endsWith('\n')) fail();
  let parsed: unknown;
  try {
    parsed = JSON.parse(release.regionManifestJson);
  } catch {
    fail();
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== GREATER_REALM_PUBLIC_REGIONS.length
    || `${JSON.stringify(parsed)}\n` !== release.regionManifestJson
  ) fail();
  return Object.freeze(parsed.map((value, index) => {
    if (value === null || Array.isArray(value) || typeof value !== 'object') fail();
    const row = value as Record<string, unknown>;
    const keys = [
      'regionId', 'publicName', 'ordinal', 'tier', 'cellCount', 'passableCellCount',
      'chunkCount', 'castleCapacity', 'resourceLocationCount', 'resourceNodeCount',
      'foodNodeCount', 'woodNodeCount', 'stoneNodeCount', 'goldNodeCount', 'active',
    ];
    const expected = GREATER_REALM_PUBLIC_REGIONS[index]!;
    if (
      Object.keys(row).length !== keys.length
      || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))
      || row.regionId !== expected.id
      || row.publicName !== expected.name
      || row.ordinal !== expected.ordinal
      || row.tier !== GREATER_REALM_VISIBLE_TIER_MAX
      || row.castleCapacity !== GREATER_REALM_CASTLES_PER_REGION
      || row.active !== false
      || keys.slice(2, -1).some(key => (
        typeof row[key] !== 'number' || !Number.isSafeInteger(row[key])
      ))
    ) fail();
    return row as unknown as PublicRegionManifest;
  }));
}

function assertCurrentPublicRoots(
  ctx: WarpkeepReducerContext,
  activation: ActivationRow,
  release: ReleaseRow,
): NonNullable<ReturnType<WarpkeepReducerContext['db']['realmAtlasV1']['atlasId']['find']>> {
  const atlas = ctx.db.realmAtlasV1.atlasId.find(activation.atlasId);
  const worker = ctx.db.realmWorkerSystemV2.atlasId.find(activation.atlasId);
  const legacyRealm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
  const castles = [...ctx.db.castle.iter()].sort((left, right) => (
    left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0
  ));
  if (ctx.db.castleWorkerV1.count() !== BigInt(castles.length * CASTLE_WORKERS_PER_CASTLE)) {
    fail();
  }
  try {
    for (const castle of castles) assertCastleWorkerRoster(ctx, castle.castleId);
  } catch {
    fail();
  }
  if (
    atlas === null
    || worker === null
    || legacyRealm === null
    || ctx.db.realmV1.count() !== 1n
    || ctx.db.greaterRealmReleaseV1.count() !== 1n
    || legacyRealm.active
    || (
      !matchesCanonicalRealm({ ...legacyRealm, active: true })
      && !matchesGenerationV2Realm({ ...legacyRealm, active: true })
    )
    || release.publicName === undefined
    || ctx.db.realmAtlasV1.count() !== 1n
    || ctx.db.realmAtlasVisibleRegionV1.count() !== BigInt(GREATER_REALM_PUBLIC_REGIONS.length)
    || ctx.db.realmWorkerSystemV2.count() !== 1n
    || atlas.publicReleaseId !== release.publicReleaseId
    || atlas.name !== release.publicName
    || atlas.protocolVersion !== GREATER_REALM_PROTOCOL_VERSION
    || atlas.generatorVersion !== release.generatorVersion
    || atlas.runtimePartitionVersion !== release.runtimePartitionVersion
    || atlas.rendererContractVersion !== release.rendererContractVersion
    || atlas.revision !== INITIAL_ATLAS_REVISION
    || atlas.visibleTierMax !== GREATER_REALM_VISIBLE_TIER_MAX
    || atlas.navigationTierMax !== GREATER_REALM_VISIBLE_TIER_MAX
    || atlas.foundingTierMax !== GREATER_REALM_VISIBLE_TIER_MAX
    || atlas.visibleRegionCount !== GREATER_REALM_PUBLIC_REGIONS.length
    || atlas.visibleCellCount !== release.expectedCellCount
    || atlas.visibleChunkCount !== release.expectedChunkCount
    || atlas.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || atlas.mode !== activation.mode
    || !sameTimestamp(atlas.createdAt, activation.canaryAt)
    || !sameTimestamp(atlas.activatedAt, activation.activatedAt)
    || worker.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || worker.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || worker.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || worker.currentCastleCount !== castles.length
    || worker.currentWorkerCount !== Number(ctx.db.castleWorkerV1.count())
    || worker.rosterDigest !== rosterDigestForCastleIds(castles.map(castle => castle.castleId))
    || worker.mode !== activation.mode
    || !sameTimestamp(worker.createdAt, activation.canaryAt)
    || !sameTimestamp(worker.activatedAt, activation.activatedAt)
    || release.state !== activation.mode
  ) fail();
  for (const expected of currentPublicRegionManifest(release)) {
    const region = ctx.db.realmAtlasVisibleRegionV1.regionId.find(expected.regionId);
    if (
      region === null
      || region.atlasId !== activation.atlasId
      || region.ordinal !== expected.ordinal
      || region.publicName !== expected.publicName
      || region.tier !== expected.tier
      || region.cellCount !== expected.cellCount
      || region.passableCellCount !== expected.passableCellCount
      || region.chunkCount !== expected.chunkCount
      || region.castleCapacity !== expected.castleCapacity
      || region.resourceLocationCount !== expected.resourceLocationCount
      || region.resourceNodeCount !== expected.resourceNodeCount
      || region.foodNodeCount !== expected.foodNodeCount
      || region.woodNodeCount !== expected.woodNodeCount
      || region.stoneNodeCount !== expected.stoneNodeCount
      || region.goldNodeCount !== expected.goldNodeCount
      || !region.active
    ) fail();
  }
  return atlas;
}

function profileMatchesMarks(
  profile: ProfileRow,
  account: NonNullable<ReturnType<WarpkeepReducerContext['db']['markAccountV1']['fid']['find']>>,
): boolean {
  if (!profile.communityStatsVisible) {
    return profile.totalSnapBurnedMicros === undefined
      && profile.marksEarnedMicros === undefined
      && profile.marksSpentMicros === undefined
      && profile.marksBalanceMicros === undefined
      && profile.marksPolicyVersion === undefined;
  }
  const legacyProjectionMatches = account.policyVersion !== ADMITTED_DAILY_MARK_POLICY_VERSION
    && profile.totalSnapBurnedMicros === account.totalSnapBurnedMicros;
  const dailyProjectionMatches = account.policyVersion === ADMITTED_DAILY_MARK_POLICY_VERSION
    && profile.totalSnapBurnedMicros === undefined;
  return profile.firstAuthenticatedAt !== undefined
    && (legacyProjectionMatches || dailyProjectionMatches)
    && profile.marksEarnedMicros === account.earnedMicros
    && profile.marksSpentMicros === account.spentMicros
    && profile.marksBalanceMicros === account.balanceMicros
    && profile.marksPolicyVersion === account.policyVersion;
}

export type GreaterRealmCurrentFounderV1 = Readonly<{
  source: 'v16' | 'v17';
  castle: CastleRow;
  profile: ProfileRow;
  greaterRealmClaim?: ClaimRow;
  greaterRealmOccupancy?: OccupancyRow;
}>;

function completeRelocationPreimage(claim: ClaimRow): boolean {
  return claim.claimKind === 'relocated'
    && claim.legacySlotId !== undefined
    && claim.legacyClaimedAt !== undefined
    && claim.legacyGenerationVersion !== undefined
    && claim.legacyTileKey !== undefined
    && claim.legacyQ !== undefined
    && claim.legacyR !== undefined;
}

function emptyFoundingPreimage(claim: ClaimRow): boolean {
  return claim.claimKind === 'founded'
    && claim.legacySlotId === undefined
    && claim.legacyClaimedAt === undefined
    && claim.legacyGenerationVersion === undefined
    && claim.legacyTileKey === undefined
    && claim.legacyQ === undefined
    && claim.legacyR === undefined;
}

/**
 * Bind every current claim to the frozen 600-slot rank topology. This bounded
 * aggregate check makes the activation counters and the relocated/founded
 * sequence partition authoritative on every steady-state gameplay read.
 */
function assertCurrentClaimSequence(
  ctx: WarpkeepReducerContext,
  activation: ActivationRow,
): void {
  const expectedCount = activation.snapshotCastleCount
    + activation.postCanaryFoundingCount;
  if (
    expectedCount < 0
    || expectedCount > GREATER_REALM_CASTLE_CAPACITY
    || activation.snapshotClaimCount !== activation.snapshotCastleCount
    || activation.nextAllocationSequence !== BigInt(expectedCount)
    || ctx.db.castle.count() !== BigInt(expectedCount)
    || ctx.db.greaterRealmCastleClaimV1.count() !== BigInt(expectedCount)
    || ctx.db.greaterRealmCellOccupancyV1.count() !== BigInt(expectedCount)
    || ctx.db.greaterRealmCastleSlotV1.count() !== BigInt(GREATER_REALM_CASTLE_CAPACITY)
  ) fail();
  const claims = [...ctx.db.greaterRealmCastleClaimV1.iter()].sort((left, right) => (
    left.allocationSequence < right.allocationSequence ? -1
      : left.allocationSequence > right.allocationSequence ? 1
        : 0
  ));
  const slots = [...ctx.db.greaterRealmCastleSlotV1.iter()].map(slot => Object.freeze({
    slotId: slot.slotId,
    regionId: slot.regionId,
    tier: slot.tier,
    regionOrderRank: slot.regionOrderRank,
    allocationRank: slot.allocationRank,
    topologyDigest: activation.topologySnapshotDigest,
  }));
  if (claims.length > 0) {
    try {
      const replay = selectGreaterRealmCastleAllocationV1(
        slots,
        claims.map(claim => Object.freeze({
          castleId: claim.castleId,
          slotId: claim.slotId,
          allocationSequence: claim.allocationSequence,
          topologyDigest: activation.topologySnapshotDigest,
        })),
        claims[0]!.castleId,
      );
      if (replay.result !== 'unchanged') fail();
    } catch {
      fail();
    }
  }
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index]!;
    const castle = ctx.db.castle.castleId.find(claim.castleId);
    const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId);
    const cell = slot === null
      ? null
      : ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
    const occupancy = ctx.db.greaterRealmCellOccupancyV1.castleId.find(
      claim.castleId,
    );
    if (
      claim.allocationSequence !== BigInt(index)
      || claim.activationId !== activation.activationId
      || claim.atlasId !== activation.atlasId
      || claim.state !== 'active'
      || claim.activatedAt === undefined
      || castle === null
      || castle.ownerFid !== claim.ownerFid
      || slot === null
      || !slot.active
      || slot.atlasId !== activation.atlasId
      || slot.tier !== 1
      || cell === null
      || cell.atlasId !== activation.atlasId
      || cell.cellKey !== slot.cellKey
      || cell.regionId !== slot.regionId
      || cell.componentKey !== slot.componentKey
      || cell.tier !== 1
      || !cell.passable
      || !GREATER_REALM_PUBLIC_REGIONS.some(region => region.id === cell.regionId)
      || castle.tileKey !== cell.cellKey
      || castle.q !== cell.atlasQ
      || castle.r !== cell.atlasR
      || occupancy === null
      || occupancy.cellKey !== cell.cellKey
      || occupancy.atlasId !== activation.atlasId
      || occupancy.regionId !== cell.regionId
      || occupancy.castleId !== castle.castleId
      || occupancy.atlasRevision !== INITIAL_ATLAS_REVISION
      || !sameTimestamp(occupancy.occupiedAt, claim.activatedAt)
    ) fail();
    if (index < activation.snapshotCastleCount) {
      if (
        !completeRelocationPreimage(claim)
        || !sameTimestamp(claim.plannedAt, activation.plannedAt)
        || !sameTimestamp(claim.activatedAt, activation.canaryAt)
      ) fail();
    } else if (
      !emptyFoundingPreimage(claim)
      || activation.activatedAt === undefined
      || !sameTimestamp(claim.plannedAt, claim.activatedAt)
      || claim.activatedAt.microsSinceUnixEpoch
        < activation.activatedAt.microsSinceUnixEpoch
    ) fail();
  }
}

function legacyFounder(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): GreaterRealmCurrentFounderV1 {
  const castle = ctx.db.castle.ownerFid.find(fid);
  const claim = ctx.db.castleSlotClaimV1.ownerFid.find(fid);
  const profile = ctx.db.realmProfileV1.fid.find(fid);
  const marks = ctx.db.markAccountV1.fid.find(fid);
  const slot = claim === null ? null : ctx.db.castleSlotV1.slotId.find(claim.slotId);
  const tile = slot === null ? null : ctx.db.worldTile.key.find(slot.tileKey);
  const meta = slot === null ? null : ctx.db.worldTileMetaV1.tileKey.find(slot.tileKey);
  const realm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
  if (
    castle === null
    || claim === null
    || profile === null
    || marks === null
    || slot === null
    || tile === null
    || meta === null
    || realm === null
    || ctx.db.allowedFid.fid.find(fid) === null
    || !markAccountIsConsistent(marks)
    || !profileMatchesMarks(profile, marks)
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
  const activation = currentGreaterRealmActivationRowV1(ctx);
  if (
    activation !== undefined
    && activation.plannedAt !== undefined
    && activation.canaryAt === undefined
    && activation.rolledBackAt === undefined
  ) {
    const planned = ctx.db.greaterRealmCastleClaimV1.ownerFid.find(fid);
    if (
      planned === null
      || planned.castleId !== castle.castleId
      || planned.activationId !== activation.activationId
      || planned.atlasId !== activation.atlasId
      || planned.state !== 'planned'
      || planned.activatedAt !== undefined
      || !completeRelocationPreimage(planned)
      || planned.legacySlotId !== claim.slotId
      || planned.legacyClaimedAt!.microsSinceUnixEpoch
        !== claim.claimedAt.microsSinceUnixEpoch
      || planned.legacyGenerationVersion !== claim.generationVersion
      || planned.legacyTileKey !== castle.tileKey
      || planned.legacyQ !== castle.q
      || planned.legacyR !== castle.r
      || ctx.db.greaterRealmCellOccupancyV1.castleId.find(castle.castleId) !== null
    ) fail();
  }
  return Object.freeze({ source: 'v16', castle, profile });
}

function v17Founder(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  requireProfileProjection = true,
): GreaterRealmCurrentFounderV1 {
  const activation = currentGreaterRealmActivationRowV1(ctx);
  const castle = ctx.db.castle.ownerFid.find(fid);
  const profile = ctx.db.realmProfileV1.fid.find(fid);
  const marks = ctx.db.markAccountV1.fid.find(fid);
  const claim = ctx.db.greaterRealmCastleClaimV1.ownerFid.find(fid);
  if (
    activation === undefined
    || activation.canaryAt === undefined
    || activation.rolledBackAt !== undefined
    || castle === null
    || profile === null
    || marks === null
    || claim === null
    || ctx.db.allowedFid.fid.find(fid) === null
    || !markAccountIsConsistent(marks)
    || (requireProfileProjection && !profileMatchesMarks(profile, marks))
    || claim.ownerFid !== fid
    || claim.castleId !== castle.castleId
    || claim.activationId !== activation.activationId
    || claim.atlasId !== activation.atlasId
    || claim.state !== 'active'
    || activation.plannedAt === undefined
    || claim.activatedAt === undefined
    || (!completeRelocationPreimage(claim) && !emptyFoundingPreimage(claim))
  ) fail();
  assertCurrentClaimSequence(ctx, activation);
  const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId);
  const cell = slot === null ? null : ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
  const occupancy = ctx.db.greaterRealmCellOccupancyV1.castleId.find(castle.castleId);
  const release = ctx.db.greaterRealmReleaseV1.atlasId.find(activation.atlasId);
  if (
    slot === null
    || cell === null
    || occupancy === null
    || release === null
    || ctx.db.greaterRealmCastleClaimV1.count() !== ctx.db.castle.count()
    || ctx.db.greaterRealmCellOccupancyV1.count() !== ctx.db.castle.count()
    || ctx.db.castleSlotClaimV1.count() !== 0n
    || slot.atlasId !== activation.atlasId
    || !slot.active
    || slot.tier !== 1
    || cell.atlasId !== activation.atlasId
    || cell.cellKey !== slot.cellKey
    || cell.regionId !== slot.regionId
    || cell.tier !== 1
    || !GREATER_REALM_PUBLIC_REGIONS.some(region => region.id === cell.regionId)
    || !cell.passable
    || castle.tileKey !== cell.cellKey
    || castle.q !== cell.atlasQ
    || castle.r !== cell.atlasR
    || occupancy.cellKey !== cell.cellKey
    || occupancy.castleId !== castle.castleId
    || occupancy.atlasId !== activation.atlasId
    || occupancy.regionId !== cell.regionId
    || occupancy.atlasRevision !== INITIAL_ATLAS_REVISION
    || !sameTimestamp(occupancy.occupiedAt, claim.activatedAt)
  ) fail();
  const atlas = assertCurrentPublicRoots(ctx, activation, release);
  if (occupancy.atlasRevision !== atlas.revision) fail();
  if (completeRelocationPreimage(claim)) {
    const legacySlot = ctx.db.castleSlotV1.slotId.find(claim.legacySlotId!);
    const legacyTile = ctx.db.worldTile.key.find(claim.legacyTileKey!);
    const legacyMeta = ctx.db.worldTileMetaV1.tileKey.find(claim.legacyTileKey!);
    if (
      legacySlot === null
      || legacyTile === null
      || legacyMeta === null
      || legacySlot.tileKey !== claim.legacyTileKey
      || legacySlot.q !== claim.legacyQ
      || legacySlot.r !== claim.legacyR
      || legacySlot.generationVersion !== claim.legacyGenerationVersion
      || !sameTimestamp(claim.plannedAt, activation.plannedAt)
      || !sameTimestamp(claim.activatedAt, activation.canaryAt)
      || legacyTile.occupantCastleId !== undefined
      || !matchesCanonicalTerrain(legacyTile)
      || !matchesCanonicalWorldMeta(legacyMeta)
    ) fail();
  } else if (
    activation.activatedAt === undefined
    || !sameTimestamp(claim.plannedAt, claim.activatedAt)
    || claim.activatedAt.microsSinceUnixEpoch
      < activation.activatedAt.microsSinceUnixEpoch
  ) {
    fail();
  }
  return Object.freeze({
    source: 'v17',
    castle,
    profile,
    greaterRealmClaim: claim,
    greaterRealmOccupancy: occupancy,
  });
}

export function assertGreaterRealmCurrentFounderForFidV1(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): GreaterRealmCurrentFounderV1 {
  return greaterRealmCutoverIsCurrentV1(ctx) ? v17Founder(ctx, fid) : legacyFounder(ctx, fid);
}

/** Structural v17 recovery gate that deliberately permits profile-projection repair. */
export function assertGreaterRealmCurrentFounderForProfileRepairV1(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): GreaterRealmCurrentFounderV1 {
  if (!greaterRealmCutoverIsCurrentV1(ctx)) fail();
  return v17Founder(ctx, fid, false);
}

/**
 * Passive production for a relocated founder remains frozen to the v16 tile
 * stored in the rollback preimage. The new Greater Realm cell is never read as
 * a legacy terrain key.
 */
export function greaterRealmCurrentPassiveTerrainV1(
  ctx: WarpkeepReducerContext,
  founder: GreaterRealmCurrentFounderV1,
): GenesisResourceTerrainKind {
  const tileKey = founder.source === 'v16'
    ? founder.castle.tileKey
    : founder.greaterRealmClaim?.claimKind === 'relocated'
      ? founder.greaterRealmClaim.legacyTileKey
      : undefined;
  if (tileKey === undefined) fail('RESOURCE_TERRAIN_AUTHORITY_MISSING');
  const stored = ctx.db.worldTileMetaV1.tileKey.find(tileKey);
  const canonical = canonicalMetaForKey(tileKey);
  if (
    stored === null
    || canonical === undefined
    || !matchesCanonicalWorldMeta(stored)
    || stored.realmId !== HEGEMONY_REALM_ID
    || stored.staticContentKind !== 'castle-slot'
    || canonical.terrainKind !== stored.terrainKind
  ) fail('RESOURCE_STATE_INTEGRITY');
  return canonical.terrainKind;
}

export function greaterRealmCurrentAuthorityErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmCurrentAuthorityError ? error.code : undefined;
}
