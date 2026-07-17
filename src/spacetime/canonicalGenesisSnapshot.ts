import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta
} from '../../spacetimedb/src/world';

import type {
  CanonicalWarpkeepRealmSnapshot,
  WarpkeepCastle,
  WarpkeepRealmSnapshotCandidate,
  WarpkeepWorldTile
} from './warpkeepBackendTypes';
import {
  REALM_CASTLE_NAME_MAXIMUM_LENGTH,
  REALM_DISPLAY_NAME_MAXIMUM_LENGTH,
  REALM_MARKS_POLICY_MAXIMUM_LENGTH,
  REALM_PUBLIC_BIO_MAXIMUM_LENGTH,
  REALM_PUBLIC_STATUS_MAXIMUM_LENGTH,
  isCanonicalOptionalRealmProfileImageUrl,
  isCanonicalOptionalRealmPublicText,
  isCanonicalOptionalRealmUsername,
  isCanonicalRealmPublicText
} from './publicRealmProjectionPolicy';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from './warpkeepProtocol';

export const CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT = [
  'warpkeep:genesis-001',
  `protocol-${WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION}`,
  `seed-${CANONICAL_REALM.numericSeed}`,
  `generation-${CANONICAL_REALM.generationVersion}`,
  `radius-${CANONICAL_REALM.authoritativeRadius}`,
  `render-${CANONICAL_REALM.renderRadius}`,
  `capacity-${CANONICAL_REALM.playerCapacity}`,
  `tiles-${CANONICAL_WORLD_TILES.length}`,
  `metadata-${CANONICAL_WORLD_TILE_META.length}`
].join(':');

const CANONICAL_SNAPSHOT_BRAND = Symbol('warpkeep.canonical-genesis-snapshot');
const CANONICAL_CASTLE_TILE_KEYS = new Set(
  CANONICAL_CASTLE_SLOTS.map((slot) => slot.tileKey)
);

type CanonicalSnapshotBrand = Readonly<{ ownFid: number }>;
type BrandedSnapshot = CanonicalWarpkeepRealmSnapshot & Readonly<{
  [CANONICAL_SNAPSHOT_BRAND]: CanonicalSnapshotBrand;
}>;

export class CanonicalGenesisSnapshotError extends Error {
  constructor() {
    super('Warpkeep Genesis 001 records are incomplete or incompatible.');
    this.name = 'CanonicalGenesisSnapshotError';
  }
}

function fail(): never {
  throw new CanonicalGenesisSnapshotError();
}

function safePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function sameCastle(left: WarpkeepCastle, right: WarpkeepCastle) {
  return left.castleId === right.castleId
    && left.ownerFid === right.ownerFid
    && left.tileKey === right.tileKey
    && left.q === right.q
    && left.r === right.r
    && left.level === right.level
    && left.name === right.name
    && left.foundedAt === right.foundedAt;
}

function freezeRows<T extends object>(rows: readonly T[]): readonly Readonly<T>[] {
  return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

function validateStaticWorld(candidate: WarpkeepRealmSnapshotCandidate) {
  if (
    candidate.activeRealms.length !== 1
    || !matchesCanonicalRealm(candidate.activeRealms[0]!)
    || candidate.tiles.length !== CANONICAL_WORLD_TILES.length
    || candidate.tileMetadata.length !== CANONICAL_WORLD_TILE_META.length
  ) fail();

  const tilesByKey = new Map<string, WarpkeepWorldTile>();
  for (const tile of candidate.tiles) {
    if (
      tilesByKey.has(tile.key)
      || !matchesCanonicalTerrain(tile)
      || (tile.occupantCastleId !== undefined && !safePositiveInteger(tile.occupantCastleId))
    ) fail();
    tilesByKey.set(tile.key, tile);
  }

  const metadataByKey = new Map<string, (typeof candidate.tileMetadata)[number]>();
  for (const metadata of candidate.tileMetadata) {
    if (
      metadataByKey.has(metadata.tileKey)
      || !matchesCanonicalWorldMeta(metadata)
      || !tilesByKey.has(metadata.tileKey)
    ) fail();
    metadataByKey.set(metadata.tileKey, metadata);
  }
  for (const tile of tilesByKey.values()) {
    if (!metadataByKey.has(tile.key)) fail();
  }

  return { tilesByKey, metadataByKey };
}

function validatePublicRows(
  candidate: WarpkeepRealmSnapshotCandidate,
  allowLocalProfilePlaceholder: boolean
) {
  if (
    candidate.players.length > CANONICAL_REALM.playerCapacity
    || candidate.profiles.length > CANONICAL_REALM.playerCapacity
  ) fail();
  const playerFids = new Set<number>();
  for (const player of candidate.players) {
    if (
      !safePositiveInteger(player.fid)
      || playerFids.has(player.fid)
      || !isCanonicalOptionalRealmUsername(player.username)
      || !isCanonicalOptionalRealmPublicText(
        player.displayName,
        REALM_DISPLAY_NAME_MAXIMUM_LENGTH
      )
      || !isCanonicalOptionalRealmProfileImageUrl(
        player.pfpUrl,
        allowLocalProfilePlaceholder
      )
      || !isCanonicalRealmPublicText(
        player.status,
        REALM_PUBLIC_STATUS_MAXIMUM_LENGTH
      )
    ) fail();
    playerFids.add(player.fid);
  }

  const profileFids = new Set<number>();
  for (const profile of candidate.profiles) {
    if (
      !safePositiveInteger(profile.fid)
      || profileFids.has(profile.fid)
      || !isCanonicalOptionalRealmUsername(profile.canonicalUsername)
      || !isCanonicalOptionalRealmPublicText(
        profile.displayName,
        REALM_DISPLAY_NAME_MAXIMUM_LENGTH
      )
      || !isCanonicalOptionalRealmProfileImageUrl(
        profile.pfpUrl,
        allowLocalProfilePlaceholder
      )
      || !isCanonicalOptionalRealmPublicText(
        profile.publicBio,
        REALM_PUBLIC_BIO_MAXIMUM_LENGTH
      )
      || !isCanonicalRealmPublicText(
        profile.publicStatus,
        REALM_PUBLIC_STATUS_MAXIMUM_LENGTH
      )
      || typeof profile.communityStatsVisible !== 'boolean'
      || !isCanonicalOptionalRealmPublicText(
        profile.marksPolicyVersion,
        REALM_MARKS_POLICY_MAXIMUM_LENGTH
      )
    ) fail();
    profileFids.add(profile.fid);
  }
  return { profileFids };
}

function validateCastleGraph(
  candidate: WarpkeepRealmSnapshotCandidate,
  ownFid: number,
  tilesByKey: ReadonlyMap<string, WarpkeepWorldTile>,
  metadataByKey: ReadonlyMap<string, (typeof candidate.tileMetadata)[number]>,
  profileFids: ReadonlySet<number>
) {
  if (candidate.castles.length > CANONICAL_REALM.playerCapacity) fail();

  const castlesById = new Map<number, WarpkeepCastle>();
  const ownerFids = new Set<number>();
  const castleTileKeys = new Set<string>();
  for (const castle of candidate.castles) {
    if (
      !safePositiveInteger(castle.castleId)
      || !safePositiveInteger(castle.ownerFid)
      || !Number.isSafeInteger(castle.q)
      || !Number.isSafeInteger(castle.r)
      || !Number.isSafeInteger(castle.level)
      || castle.level <= 0
      || !isCanonicalRealmPublicText(
        castle.name,
        REALM_CASTLE_NAME_MAXIMUM_LENGTH
      )
      || !profileFids.has(castle.ownerFid)
      || castlesById.has(castle.castleId)
      || ownerFids.has(castle.ownerFid)
      || castleTileKeys.has(castle.tileKey)
      || !CANONICAL_CASTLE_TILE_KEYS.has(castle.tileKey)
    ) fail();

    const tile = tilesByKey.get(castle.tileKey);
    const metadata = metadataByKey.get(castle.tileKey);
    if (
      tile === undefined
      || metadata === undefined
      || tile.q !== castle.q
      || tile.r !== castle.r
      || tile.occupantCastleId !== castle.castleId
      || metadata.staticContentKind !== 'castle-slot'
      || !metadata.passable
    ) fail();

    castlesById.set(castle.castleId, castle);
    ownerFids.add(castle.ownerFid);
    castleTileKeys.add(castle.tileKey);
  }

  for (const tile of tilesByKey.values()) {
    if (tile.occupantCastleId === undefined) continue;
    const castle = castlesById.get(tile.occupantCastleId);
    if (
      castle === undefined
      || castle.tileKey !== tile.key
      || castle.q !== tile.q
      || castle.r !== tile.r
    ) fail();
  }

  const ownCastles = candidate.castles.filter((castle) => castle.ownerFid === ownFid);
  if (ownCastles.length !== 1) fail();
  const ownCastle = ownCastles[0]!;
  if (candidate.ownCastle !== undefined && !sameCastle(candidate.ownCastle, ownCastle)) fail();
  return ownCastle;
}

export function isCanonicalGenesisSnapshot(
  value: unknown,
  ownFid?: number
): value is CanonicalWarpkeepRealmSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BrandedSnapshot>;
  const brand = candidate[CANONICAL_SNAPSHOT_BRAND];
  return Object.isFrozen(candidate)
    && candidate.protocolVersion === WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
    && candidate.canonicalFingerprint === CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT
    && brand !== undefined
    && (ownFid === undefined || brand.ownFid === ownFid);
}

/**
 * Convert an untrusted public-table projection into the sole snapshot shape
 * permitted to enter ready/reconnecting state. Validation is deterministic,
 * bounded by the fixed Genesis world, and never reads private tables.
 */
export function validateCanonicalGenesisSnapshot(
  candidate: WarpkeepRealmSnapshotCandidate | CanonicalWarpkeepRealmSnapshot,
  input: Readonly<{
    ownFid: number;
    protocolVersion: number;
    /** Dev-only exact local portrait used by the synthetic observer fixture. */
    allowLocalProfilePlaceholder?: boolean;
  }>
): CanonicalWarpkeepRealmSnapshot {
  if (
    input.protocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
    || !safePositiveInteger(input.ownFid)
  ) fail();
  if (isCanonicalGenesisSnapshot(candidate, input.ownFid)) return candidate;
  if (
    !candidate
    || !Array.isArray(candidate.tiles)
    || !Array.isArray(candidate.tileMetadata)
    || !Array.isArray(candidate.players)
    || !Array.isArray(candidate.profiles)
    || !Array.isArray(candidate.castles)
    || !Array.isArray(candidate.activeRealms)
  ) fail();

  const { tilesByKey, metadataByKey } = validateStaticWorld(candidate);
  const { profileFids } = validatePublicRows(
    candidate,
    input.allowLocalProfilePlaceholder === true
  );
  const ownCastle = validateCastleGraph(
    candidate,
    input.ownFid,
    tilesByKey,
    metadataByKey,
    profileFids
  );

  const activeRealms = freezeRows(candidate.activeRealms);
  const tiles = freezeRows(candidate.tiles);
  const tileMetadata = freezeRows(candidate.tileMetadata);
  const players = freezeRows(candidate.players);
  const profiles = freezeRows(candidate.profiles);
  const castles = freezeRows(candidate.castles);
  const frozenOwnCastle = castles.find((castle) => castle.castleId === ownCastle.castleId);
  if (frozenOwnCastle === undefined) fail();

  const canonical = {
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    canonicalFingerprint: CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT,
    activeRealms,
    realm: activeRealms[0]!,
    tiles,
    tileMetadata,
    players,
    profiles,
    castles,
    ownCastle: frozenOwnCastle
  } as BrandedSnapshot;
  Object.defineProperty(canonical, CANONICAL_SNAPSHOT_BRAND, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ ownFid: input.ownFid })
  });
  return Object.freeze(canonical);
}
