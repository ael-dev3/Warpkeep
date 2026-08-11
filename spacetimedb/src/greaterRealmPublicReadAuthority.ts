import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  greaterRealmActivationCheckpointFromRowV1,
  type GreaterRealmActivationRowV1,
} from './greaterRealmActivationState';
import { CASTLE_WORKERS_PER_CASTLE } from './castleWorkerPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_CHUNK_BIN_SIZE,
  GREATER_REALM_PROTOCOL_VERSION,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_VISIBLE_TIER_MAX,
} from './greaterRealmV17Policy';
import type warpkeep from './schema';
import {
  HEGEMONY_REALM_ID,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
  matchesGenerationV2Realm,
} from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['ownerFid']['find']>
>;
type ReleaseRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmReleaseV1']['atlasId']['find']>
>;
type AtlasRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmAtlasV1']['atlasId']['find']>
>;
type RegionRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmAtlasVisibleRegionV1']['regionId']['find']>
>;
type ClaimRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCastleClaimV1']['castleId']['find']>
>;
type SlotRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCastleSlotV1']['slotId']['find']>
>;
type CellRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCellV1']['cellKey']['find']>
>;
type OccupancyRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCellOccupancyV1']['castleId']['find']>
>;
type ChunkRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmChunkV1']['chunkHandle']['find']>
>;

const INITIAL_ATLAS_REVISION = 1n;
const U32_MAX = 0xffff_ffff;

export class GreaterRealmPublicReadAuthorityError extends Error {
  constructor(readonly code = 'GREATER_REALM_PUBLIC_READ_AUTHORITY_INVALID') {
    super(code);
    this.name = 'GreaterRealmPublicReadAuthorityError';
  }
}

function fail(code?: string): never {
  throw new GreaterRealmPublicReadAuthorityError(code);
}

function sameTimestamp(
  left: { microsSinceUnixEpoch: bigint } | undefined,
  right: { microsSinceUnixEpoch: bigint } | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.microsSinceUnixEpoch === right.microsSinceUnixEpoch;
}

function safeU32(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= U32_MAX;
}

type RegionManifestRow = Readonly<{
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

function exactRegionManifest(release: ReleaseRow): readonly RegionManifestRow[] {
  if (release.regionManifestJson === undefined || !release.regionManifestJson.endsWith('\n')) {
    fail();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(release.regionManifestJson);
  } catch {
    return fail();
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== GREATER_REALM_PUBLIC_REGIONS.length
    || `${JSON.stringify(parsed)}\n` !== release.regionManifestJson
  ) fail();
  const keys = [
    'regionId', 'publicName', 'ordinal', 'tier', 'cellCount', 'passableCellCount',
    'chunkCount', 'castleCapacity', 'resourceLocationCount', 'resourceNodeCount',
    'foodNodeCount', 'woodNodeCount', 'stoneNodeCount', 'goldNodeCount', 'active',
  ];
  return Object.freeze(parsed.map((value, index) => {
    if (value === null || Array.isArray(value) || typeof value !== 'object') fail();
    const row = value as Record<string, unknown>;
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
        typeof row[key] !== 'number' || !safeU32(row[key] as number)
      ))
    ) fail();
    return row as unknown as RegionManifestRow;
  }));
}

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

export type GreaterRealmPublicReadRootsV1 = Readonly<{
  activation: GreaterRealmActivationRowV1;
  release: ReleaseRow;
  atlas: AtlasRow;
  regions: readonly RegionRow[];
}>;

function assertPublicReadRoots(
  ctx: WarpkeepReducerContext,
  activation: GreaterRealmActivationRowV1,
): GreaterRealmPublicReadRootsV1 {
  const checkpoint = greaterRealmActivationCheckpointFromRowV1(activation);
  const expectedCastleCount = activation.snapshotCastleCount
    + activation.postCanaryFoundingCount;
  const expectedWorkerCount = expectedCastleCount * CASTLE_WORKERS_PER_CASTLE;
  if (
    !['canary', 'active', 'halted'].includes(checkpoint.phase)
    || activation.canaryAt === undefined
    || activation.rolledBackAt !== undefined
    || !safeU32(activation.snapshotCastleCount)
    || !safeU32(activation.snapshotWorkerCount)
    || !safeU32(activation.snapshotResourceAccountCount)
    || !safeU32(activation.snapshotMarkAccountCount)
    || !safeU32(activation.snapshotClaimCount)
    || !safeU32(activation.snapshotOccupancyCount)
    || !safeU32(activation.postCanaryFoundingCount)
    || !safeU32(activation.postCanaryDispatchCount)
    || !safeU32(expectedCastleCount)
    || !safeU32(expectedWorkerCount)
    || expectedCastleCount > GREATER_REALM_CASTLE_CAPACITY
    || activation.snapshotClaimCount !== activation.snapshotCastleCount
    || activation.snapshotOccupancyCount !== activation.snapshotCastleCount
    || activation.snapshotResourceAccountCount !== activation.snapshotCastleCount
    || activation.snapshotMarkAccountCount !== activation.snapshotCastleCount
    || activation.snapshotWorkerCount
      !== activation.snapshotCastleCount * CASTLE_WORKERS_PER_CASTLE
    || activation.nextAllocationSequence !== BigInt(expectedCastleCount)
  ) fail();
  const release = ctx.db.greaterRealmReleaseV1.atlasId.find(activation.atlasId);
  const atlas = ctx.db.realmAtlasV1.atlasId.find(activation.atlasId);
  const legacyRealm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
  if (
    release === null
    || atlas === null
    || legacyRealm === null
    || ctx.db.greaterRealmReleaseV1.count() !== 1n
    || ctx.db.realmAtlasV1.count() !== 1n
    || ctx.db.realmAtlasVisibleRegionV1.count()
      !== BigInt(GREATER_REALM_PUBLIC_REGIONS.length)
    || ctx.db.realmV1.count() !== 1n
    || legacyRealm.active
    || (
      !matchesCanonicalRealm({ ...legacyRealm, active: true })
      && !matchesGenerationV2Realm({ ...legacyRealm, active: true })
    )
    || release.state !== activation.mode
    || release.publicName === undefined
    || release.readyAt === undefined
    || release.expectedRegionCount !== GREATER_REALM_PUBLIC_REGIONS.length
    || release.expectedSlotCount !== GREATER_REALM_CASTLE_CAPACITY
    || release.verificationPhase !== 'complete'
    || release.verifiedComponentCount !== release.expectedComponentCount
    || release.verifiedChunkCount !== release.expectedChunkCount
    || release.verifiedCellCount !== release.expectedCellCount
    || release.verifiedSlotCount !== release.expectedSlotCount
    || release.verifiedResourceNodeCount !== release.expectedResourceNodeCount
    || release.componentExpectedCellCount !== release.expectedCellCount
    || release.componentExpectedSlotCount !== release.expectedSlotCount
    || release.componentExpectedResourceNodeCount !== release.expectedResourceNodeCount
    || ctx.db.greaterRealmNavigationComponentV1.count()
      !== BigInt(release.expectedComponentCount)
    || ctx.db.greaterRealmChunkV1.count() !== BigInt(release.expectedChunkCount)
    || ctx.db.greaterRealmCellV1.count() !== BigInt(release.expectedCellCount)
    || ctx.db.greaterRealmCastleSlotV1.count() !== BigInt(release.expectedSlotCount)
    || ctx.db.greaterRealmResourceNodeV1.count()
      !== BigInt(release.expectedResourceNodeCount)
    || ctx.db.castle.count() !== BigInt(expectedCastleCount)
    || ctx.db.greaterRealmCastleClaimV1.count() !== BigInt(expectedCastleCount)
    || ctx.db.greaterRealmCellOccupancyV1.count() !== BigInt(expectedCastleCount)
    || ctx.db.castleSlotClaimV1.count() !== 0n
    || ctx.db.allowedFid.count() !== BigInt(expectedCastleCount)
    || ctx.db.realmProfileV1.count() !== BigInt(expectedCastleCount)
    || ctx.db.markAccountV1.count() !== BigInt(expectedCastleCount)
    || ctx.db.resourceAccountV1.count() !== BigInt(expectedCastleCount)
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
  ) fail();
  const manifest = exactRegionManifest(release);
  const regions = manifest.map(expected => {
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
    return region;
  });
  return Object.freeze({ activation, release, atlas, regions: Object.freeze(regions) });
}

export type GreaterRealmCurrentPlacementV1 = Readonly<{
  castle: CastleRow;
  claim: ClaimRow;
  slot: SlotRow;
  cell: CellRow;
  occupancy: OccupancyRow;
  chunk: ChunkRow;
}>;

export function assertGreaterRealmCurrentPlacementV1(
  ctx: WarpkeepReducerContext,
  roots: GreaterRealmPublicReadRootsV1,
  castleId: bigint,
): GreaterRealmCurrentPlacementV1 {
  const { activation, atlas } = roots;
  const castle = ctx.db.castle.castleId.find(castleId);
  const claim = ctx.db.greaterRealmCastleClaimV1.castleId.find(castleId);
  const slot = claim === null
    ? null
    : ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId);
  const cell = slot === null ? null : ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
  const occupancy = ctx.db.greaterRealmCellOccupancyV1.castleId.find(castleId);
  const chunk = cell === null
    ? null
    : ctx.db.greaterRealmChunkV1.chunkHandle.find(cell.chunkHandle);
  const component = cell?.componentKey === undefined
    ? null
    : ctx.db.greaterRealmNavigationComponentV1.componentKey.find(cell.componentKey);
  const region = cell === null
    ? null
    : ctx.db.realmAtlasVisibleRegionV1.regionId.find(cell.regionId);
  const relocated = claim !== null && completeRelocationPreimage(claim);
  const founded = claim !== null && emptyFoundingPreimage(claim);
  const claimTimeCurrent = claim !== null && claim.activatedAt !== undefined && (
    relocated
      ? claim.allocationSequence < BigInt(activation.snapshotCastleCount)
        && sameTimestamp(claim.plannedAt, activation.plannedAt)
        && sameTimestamp(claim.activatedAt, activation.canaryAt)
      : founded
        && activation.activatedAt !== undefined
        && claim.allocationSequence >= BigInt(activation.snapshotCastleCount)
        && claim.allocationSequence < activation.nextAllocationSequence
        && sameTimestamp(claim.plannedAt, claim.activatedAt)
        && claim.activatedAt.microsSinceUnixEpoch
          >= activation.activatedAt.microsSinceUnixEpoch
  );
  if (
    castle === null
    || claim === null
    || slot === null
    || cell === null
    || occupancy === null
    || chunk === null
    || component === null
    || region === null
    || claim.castleId !== castle.castleId
    || claim.ownerFid !== castle.ownerFid
    || claim.activationId !== activation.activationId
    || claim.atlasId !== activation.atlasId
    || claim.state !== 'active'
    || !claimTimeCurrent
    || claim.allocationSequence < 0n
    || claim.allocationSequence >= activation.nextAllocationSequence
    || slot.regionOrderRank !== Number(
      claim.allocationSequence / BigInt(GREATER_REALM_PUBLIC_REGIONS.length)
    )
    || slot.slotId !== claim.slotId
    || !slot.active
    || slot.atlasId !== activation.atlasId
    || slot.tier !== GREATER_REALM_VISIBLE_TIER_MAX
    || slot.cellKey !== cell.cellKey
    || slot.regionId !== cell.regionId
    || slot.componentKey !== cell.componentKey
    || slot.regionOrderRank >= GREATER_REALM_CASTLES_PER_REGION
    || slot.allocationRank >= GREATER_REALM_CASTLE_CAPACITY
    || cell.atlasId !== activation.atlasId
    || cell.tier !== GREATER_REALM_VISIBLE_TIER_MAX
    || !cell.passable
    || !GREATER_REALM_PUBLIC_REGIONS.some(expected => expected.id === cell.regionId)
    || component.atlasId !== activation.atlasId
    || component.componentKey !== cell.componentKey
    || !component.active
    || (component.regionMask & (1 << region.ordinal)) === 0
    || region.atlasId !== activation.atlasId
    || region.regionId !== cell.regionId
    || !region.active
    || castle.tileKey !== cell.cellKey
    || castle.q !== cell.atlasQ
    || castle.r !== cell.atlasR
    || castle.level <= 0
    || occupancy.castleId !== castle.castleId
    || occupancy.cellKey !== cell.cellKey
    || occupancy.atlasId !== activation.atlasId
    || occupancy.regionId !== cell.regionId
    || occupancy.atlasRevision !== atlas.revision
    || !sameTimestamp(occupancy.occupiedAt, claim.activatedAt)
    || chunk.atlasId !== activation.atlasId
    || chunk.chunkHandle !== cell.chunkHandle
    || chunk.binQ !== Math.floor(cell.atlasQ / GREATER_REALM_CHUNK_BIN_SIZE)
    || chunk.binR !== Math.floor(cell.atlasR / GREATER_REALM_CHUNK_BIN_SIZE)
    || chunk.chunkCoordKey !== `B:${chunk.binQ}:${chunk.binR}`
  ) fail();
  if (relocated) {
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
      || legacyTile.occupantCastleId !== undefined
      || !matchesCanonicalTerrain(legacyTile)
      || !matchesCanonicalWorldMeta(legacyMeta)
    ) fail();
  }
  return Object.freeze({ castle, claim, slot, cell, occupancy, chunk });
}

export type GreaterRealmIndexedPublicReadAuthorityV1 =
  GreaterRealmPublicReadRootsV1 & GreaterRealmCurrentPlacementV1;

/**
 * One root-count plus indexed caller boundary for steady-state v17 reads. It
 * never replays the population allocation, worker digest, or founder graph.
 */
export function assertGreaterRealmIndexedPublicReadAuthorityV1(
  ctx: WarpkeepReducerContext,
  activation: GreaterRealmActivationRowV1,
  caller: Readonly<{ fid: bigint; castle: CastleRow }>,
): GreaterRealmIndexedPublicReadAuthorityV1 {
  const roots = assertPublicReadRoots(ctx, activation);
  const placement = assertGreaterRealmCurrentPlacementV1(
    ctx,
    roots,
    caller.castle.castleId,
  );
  if (
    caller.fid !== placement.castle.ownerFid
    || caller.castle.castleId !== placement.castle.castleId
    || caller.castle.ownerFid !== placement.castle.ownerFid
  ) fail();
  return Object.freeze({ ...roots, ...placement });
}
