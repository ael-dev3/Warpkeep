import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILES,
  GENESIS_GENERATION_V2_WORLD_TILE_META,
  matchesCanonicalRealm,
  matchesGenerationV2Realm,
  type CanonicalWorldTile,
  type CanonicalWorldTileMeta
} from '../../spacetimedb/src/world';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_EPOCH,
  GENESIS_WATER_LAYOUT_V1,
  GENESIS_WATER_SUN_DIRECTION_MICRO
} from '../../spacetimedb/src/waterWorld';

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

function makeSnapshotFingerprint(
  realm: WarpkeepRealmSnapshotCandidate['activeRealms'][number],
  worldTileCount: number,
  worldTileMetadataCount: number
) {
  return [
    'warpkeep:genesis-001',
    `protocol-${WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION}`,
    `seed-${realm.numericSeed}`,
    `generation-${realm.generationVersion}`,
    `radius-${realm.authoritativeRadius}`,
    `render-${realm.renderRadius}`,
    `capacity-${realm.playerCapacity}`,
    `tiles-${worldTileCount}`,
    `metadata-${worldTileMetadataCount}`
  ].join(':');
}

/** Frozen deployed fingerprint retained throughout the additive v2 -> v3 rollout. */
export const GENESIS_GENERATION_V2_SNAPSHOT_FINGERPRINT = makeSnapshotFingerprint(
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILES.length,
  GENESIS_GENERATION_V2_WORLD_TILE_META.length
);

/** Target fingerprint for the exact 10,000-cell generation-v3 snapshot. */
export const GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT = makeSnapshotFingerprint(
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES.length,
  CANONICAL_WORLD_TILE_META.length
);

/** Backward-compatible name for the current target generation. */
export const CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT =
  GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT;

const CANONICAL_SNAPSHOT_BRAND = Symbol('warpkeep.canonical-genesis-snapshot');
const CANONICAL_CASTLE_TILE_KEYS = new Set(
  CANONICAL_CASTLE_SLOTS.map((slot) => slot.tileKey)
);

type CanonicalSnapshotBrand = Readonly<{
  ownFid: number;
  canonicalFingerprint: string;
}>;
type BrandedSnapshot = CanonicalWarpkeepRealmSnapshot & Readonly<{
  [CANONICAL_SNAPSHOT_BRAND]: CanonicalSnapshotBrand;
}>;

type StaticWorldProfile = Readonly<{
  fingerprint: string;
  tiles: readonly CanonicalWorldTile[];
  tileMetadata: readonly CanonicalWorldTileMeta[];
  tileByKey: ReadonlyMap<string, CanonicalWorldTile>;
  metadataByKey: ReadonlyMap<string, CanonicalWorldTileMeta>;
}>;

function makeStaticWorldProfile(
  fingerprint: string,
  tiles: readonly CanonicalWorldTile[],
  tileMetadata: readonly CanonicalWorldTileMeta[]
): StaticWorldProfile {
  return Object.freeze({
    fingerprint,
    tiles,
    tileMetadata,
    tileByKey: new Map(tiles.map((tile) => [tile.key, tile] as const)),
    metadataByKey: new Map(
      tileMetadata.map((metadata) => [metadata.tileKey, metadata] as const)
    )
  });
}

const GENERATION_V2_STATIC_WORLD = makeStaticWorldProfile(
  GENESIS_GENERATION_V2_SNAPSHOT_FINGERPRINT,
  GENESIS_GENERATION_V2_WORLD_TILES,
  GENESIS_GENERATION_V2_WORLD_TILE_META
);
const GENERATION_V3_STATIC_WORLD = makeStaticWorldProfile(
  GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META
);

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

function staticWorldForCandidate(
  candidate: WarpkeepRealmSnapshotCandidate
): StaticWorldProfile {
  if (candidate.activeRealms.length !== 1) fail();
  const realm = candidate.activeRealms[0]!;
  if (matchesGenerationV2Realm(realm)) return GENERATION_V2_STATIC_WORLD;
  if (matchesCanonicalRealm(realm)) return GENERATION_V3_STATIC_WORLD;
  return fail();
}

/**
 * Additive presentation records are deliberately not canonical Realm
 * authority. Preserve their *presence* (including malformed values) so the
 * renderer's strict decoder can fail closed instead of mistaking an
 * incomplete v6 projection for an older service that lacks the tables.
 */
function freezePresentationValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => (
      entry !== null && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.freeze({ ...entry })
        : entry
    )));
  }
  if (value !== null && typeof value === 'object') return Object.freeze({ ...value });
  return value;
}

function waterRowObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

/**
 * Water is additive, but unlike a local decorative hint its topology is an
 * authority artifact. Accept only the complete reviewed row set and retain a
 * present-invalid projection so the renderer cannot invent local shorelines.
 */
function validateWaterProjection(candidate: WarpkeepRealmSnapshotCandidate): {
  layout?: unknown;
  bodies?: readonly unknown[];
  cells?: readonly unknown[];
  realmEnvironment?: unknown;
  waterRevision?: unknown;
} {
  const rawLayout = candidate.waterLayout;
  const rawBodies = candidate.waterBodies;
  const rawCells = candidate.waterCells;
  const rawEnvironment = candidate.realmEnvironment;
  const rawRevision = candidate.waterRevision;
  if (
    rawLayout === undefined
    && rawBodies === undefined
    && rawCells === undefined
    && rawEnvironment === undefined
    && rawRevision === undefined
  ) return {};
  if (
    !waterRowObject(rawLayout)
    || !Array.isArray(rawBodies)
    || !Array.isArray(rawCells)
    || !waterRowObject(rawEnvironment)
  ) {
    return {
      layout: freezePresentationValue(rawLayout),
      bodies: Array.isArray(rawBodies) ? freezeRows(rawBodies) : undefined,
      cells: Array.isArray(rawCells) ? freezeRows(rawCells) : undefined,
      realmEnvironment: freezePresentationValue(rawEnvironment),
      waterRevision: rawRevision === undefined
        ? undefined
        : freezePresentationValue(rawRevision)
    };
  }
  if (rawBodies.length !== GENESIS_WATER_BODIES_V1.length || rawCells.length !== GENESIS_WATER_CELLS_V1.length) {
    return {
      layout: freezePresentationValue(rawLayout),
      bodies: freezeRows(rawBodies),
      cells: freezeRows(rawCells),
      realmEnvironment: freezePresentationValue(rawEnvironment),
      waterRevision: rawRevision === undefined
        ? undefined
        : freezePresentationValue(rawRevision)
    };
  }
  const layout = rawLayout as Readonly<Record<string, unknown>>;
  const layoutFields: readonly [string, unknown][] = [
    ['realmId', GENESIS_WATER_LAYOUT_V1.realmId],
    ['layoutVersion', GENESIS_WATER_LAYOUT_V1.layoutVersion],
    ['policyVersion', GENESIS_WATER_LAYOUT_V1.policyVersion],
    ['generationVersion', GENESIS_WATER_LAYOUT_V1.generationVersion],
    ['canonicalLandCellCount', GENESIS_WATER_LAYOUT_V1.canonicalLandCellCount],
    ['oceanCellCount', GENESIS_WATER_LAYOUT_V1.oceanCellCount],
    ['lakeCellCount', GENESIS_WATER_LAYOUT_V1.lakeCellCount],
    ['lakeBodyCount', GENESIS_WATER_LAYOUT_V1.lakeBodyCount],
    ['riverCount', GENESIS_WATER_LAYOUT_V1.riverCount],
    ['riverCellCount', GENESIS_WATER_LAYOUT_V1.riverCellCount],
    ['seaLevelMilli', GENESIS_WATER_LAYOUT_V1.seaLevelMilli],
    ['seaLevelPolicyVersion', GENESIS_WATER_LAYOUT_V1.seaLevelPolicyVersion],
    ['fogStartDepthCells', GENESIS_WATER_LAYOUT_V1.fogStartDepthCells],
    ['fogFullDepthCells', GENESIS_WATER_LAYOUT_V1.fogFullDepthCells],
    ['hiddenBufferCells', GENESIS_WATER_LAYOUT_V1.hiddenBufferCells],
    ['layoutDigest', GENESIS_WATER_LAYOUT_V1.layoutDigest],
    ['sourceCommit', GENESIS_WATER_LAYOUT_V1.sourceCommit]
  ];
  const validLayout = layoutFields.every(([field, expected]) => layout[field] === expected)
    && typeof layout.activated === 'boolean';
  const environment = rawEnvironment as Readonly<Record<string, unknown>>;
  const validEnvironment = environment.realmId === GENESIS_WATER_LAYOUT_V1.realmId
    && environment.environmentEpoch === GENESIS_WATER_ENVIRONMENT_EPOCH
    && environment.waterLayoutVersion === GENESIS_WATER_LAYOUT_V1.layoutVersion
    && environment.seaLevelMilli === GENESIS_WATER_LAYOUT_V1.seaLevelMilli
    && environment.sunDirectionXMicro === GENESIS_WATER_SUN_DIRECTION_MICRO.x
    && environment.sunDirectionYMicro === GENESIS_WATER_SUN_DIRECTION_MICRO.y
    && environment.sunDirectionZMicro === GENESIS_WATER_SUN_DIRECTION_MICRO.z;
  const expectedBodies = new Map(GENESIS_WATER_BODIES_V1.map((body) => [body.bodyId, body]));
  const validBodies = rawBodies.every((value) => {
    const row = waterRowObject(value);
    if (!row || typeof row.bodyId !== 'string') return false;
    const expected = expectedBodies.get(row.bodyId);
    return expected !== undefined
      && row.realmId === expected.realmId
      && row.regime === expected.regime
      && row.cellCount === expected.cellCount
      && row.sourceCellKey === expected.sourceCellKey
      && row.mouthCellKey === expected.mouthCellKey
      && row.surfaceLevelMilli === expected.surfaceLevelMilli
      && row.seed === expected.seed
      && row.layoutVersion === expected.layoutVersion;
  });
  const expectedCells = new Map(GENESIS_WATER_CELLS_V1.map((cell) => [cell.cellKey, cell]));
  const validCells = rawCells.every((value) => {
    const row = waterRowObject(value);
    if (!row || typeof row.cellKey !== 'string') return false;
    const expected = expectedCells.get(row.cellKey);
    return expected !== undefined
      && row.realmId === expected.realmId
      && row.q === expected.q
      && row.r === expected.r
      && row.regime === expected.regime
      && row.bodyId === expected.bodyId
      && row.depthCells === expected.depthCells
      && row.elevationMilli === expected.elevationMilli
      && row.surfaceLevelMilli === expected.surfaceLevelMilli
      && row.fogBand === expected.fogBand
      && row.layoutVersion === expected.layoutVersion;
  });
  return {
    layout: validLayout ? Object.freeze({ ...layout }) : freezePresentationValue(rawLayout),
    bodies: validLayout && validBodies ? freezeRows(rawBodies) : freezeRows(rawBodies),
    cells: validLayout && validCells ? freezeRows(rawCells) : freezeRows(rawCells),
    realmEnvironment: validEnvironment
      ? Object.freeze({ ...environment })
      : freezePresentationValue(rawEnvironment),
    waterRevision: rawRevision === undefined
      ? undefined
      : freezePresentationValue(rawRevision)
  };
}

function validateStaticWorld(candidate: WarpkeepRealmSnapshotCandidate) {
  const staticWorld = staticWorldForCandidate(candidate);
  if (
    candidate.tiles.length !== staticWorld.tiles.length
    || candidate.tileMetadata.length !== staticWorld.tileMetadata.length
  ) fail();

  const tilesByKey = new Map<string, WarpkeepWorldTile>();
  for (const tile of candidate.tiles) {
    const expected = staticWorld.tileByKey.get(tile.key);
    if (
      tilesByKey.has(tile.key)
      || expected === undefined
      || tile.q !== expected.q
      || tile.r !== expected.r
      || tile.biome !== expected.biome
      || tile.terrainSeed !== expected.terrainSeed
      || (tile.occupantCastleId !== undefined && !safePositiveInteger(tile.occupantCastleId))
    ) fail();
    tilesByKey.set(tile.key, tile);
  }

  const metadataByKey = new Map<string, (typeof candidate.tileMetadata)[number]>();
  for (const metadata of candidate.tileMetadata) {
    const expected = staticWorld.metadataByKey.get(metadata.tileKey);
    if (
      metadataByKey.has(metadata.tileKey)
      || expected === undefined
      || metadata.realmId !== expected.realmId
      || metadata.s !== expected.s
      || metadata.ring !== expected.ring
      || metadata.sector !== expected.sector
      || metadata.terrainKind !== expected.terrainKind
      || metadata.passable !== expected.passable
      || metadata.movementCost !== expected.movementCost
      || metadata.staticContentKind !== expected.staticContentKind
      || metadata.generationVersion !== expected.generationVersion
      || !tilesByKey.has(metadata.tileKey)
    ) fail();
    metadataByKey.set(metadata.tileKey, metadata);
  }
  for (const tile of tilesByKey.values()) {
    if (!metadataByKey.has(tile.key)) fail();
  }

  return { tilesByKey, metadataByKey, staticWorld };
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
    && (
      candidate.canonicalFingerprint === GENESIS_GENERATION_V2_SNAPSHOT_FINGERPRINT
      || candidate.canonicalFingerprint === GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT
    )
    && brand !== undefined
    && brand.canonicalFingerprint === candidate.canonicalFingerprint
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

  const { tilesByKey, metadataByKey, staticWorld } = validateStaticWorld(candidate);
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
  // Gold sites are additive v5 presentation data, not part of the Genesis
  // world attestation. Preserve them only when both public tables arrived;
  // their strict UI decoder then fails to an empty node layer on malformed or
  // contradictory rows instead of revoking the entire canonical Realm.
  const goldSites = Array.isArray(candidate.goldSites)
    && Array.isArray(candidate.goldNodeOccupations)
    ? freezeRows(candidate.goldSites)
    : undefined;
  const goldNodeOccupations = goldSites !== undefined
    ? freezeRows(candidate.goldNodeOccupations!)
    : undefined;
  // Food is independently additive. Preserve its paired public tables only
  // when both arrive; strict Food presentation may then fail closed without
  // revoking a valid Gold projection or the canonical Realm itself.
  const foodSites = Array.isArray(candidate.foodSites)
    && Array.isArray(candidate.foodNodeOccupations)
    ? freezeRows(candidate.foodSites)
    : undefined;
  const foodNodeOccupations = foodSites !== undefined
    ? freezeRows(candidate.foodNodeOccupations!)
    : undefined;
  // Wood is likewise independently additive. Keep only paired public tables
  // and let the strict Wood decoder fail closed without revoking Food, Gold,
  // forest presentation, or the canonical Realm itself.
  const woodSites = Array.isArray(candidate.woodSites)
    && Array.isArray(candidate.woodNodeOccupations)
    ? freezeRows(candidate.woodSites)
    : undefined;
  const woodNodeOccupations = woodSites !== undefined
    ? freezeRows(candidate.woodNodeOccupations!)
    : undefined;
  // Stone follows the same paired-projection boundary as the other resource
  // families. Preserve it only when both public tables arrived so an atomic
  // subscription can never expose a one-sided quarry state to the renderer.
  const stoneSites = Array.isArray(candidate.stoneSites)
    && Array.isArray(candidate.stoneNodeOccupations)
    ? freezeRows(candidate.stoneSites)
    : undefined;
  const stoneNodeOccupations = stoneSites !== undefined
    ? freezeRows(candidate.stoneNodeOccupations!)
    : undefined;
  // Generic workers are a staged additive projection. Preserve only the
  // complete public trio; absent or malformed rows keep the legacy renderer
  // path instead of revoking the canonical world snapshot.
  const rawWorkerSystem = candidate.workerSystem;
  const workerSystem = rawWorkerSystem === undefined ? undefined : freezePresentationValue(rawWorkerSystem);
  const workerWorkers = candidate.workerWorkers === undefined ? undefined : freezePresentationValue(candidate.workerWorkers);
  const workerOccupations = candidate.workerOccupations === undefined ? undefined : freezePresentationValue(candidate.workerOccupations);
  // The shared forest is another additive presentation pair. Keep each
  // field's presence intact for the browser-safe layout policy to verify. A
  // v6-but-unseeded `{ forestTrees: [] }`, a one-sided table, or malformed
  // value must reach that decoder as present-invalid; collapsing it to both
  // absent would incorrectly enable the DEV-only legacy preview path.
  const rawForestLayout = (candidate as Readonly<{ forestLayout?: unknown }>).forestLayout;
  const rawForestTrees = (candidate as Readonly<{ forestTrees?: unknown }>).forestTrees;
  const forestLayout = rawForestLayout === undefined
    ? undefined
    : freezePresentationValue(rawForestLayout);
  const forestTrees = rawForestTrees === undefined
    ? undefined
    : freezePresentationValue(rawForestTrees);
  const waterProjection = validateWaterProjection(candidate);
  const frozenOwnCastle = castles.find((castle) => castle.castleId === ownCastle.castleId);
  if (frozenOwnCastle === undefined) fail();

  const canonical = {
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    canonicalFingerprint: staticWorld.fingerprint,
    activeRealms,
    realm: activeRealms[0]!,
    tiles,
    tileMetadata,
    players,
    profiles,
    castles,
    ...(goldSites === undefined ? {} : { goldSites }),
    ...(goldNodeOccupations === undefined ? {} : { goldNodeOccupations }),
    ...(foodSites === undefined ? {} : { foodSites }),
    ...(foodNodeOccupations === undefined ? {} : { foodNodeOccupations }),
    ...(woodSites === undefined ? {} : { woodSites }),
    ...(woodNodeOccupations === undefined ? {} : { woodNodeOccupations }),
    ...(stoneSites === undefined ? {} : { stoneSites }),
    ...(stoneNodeOccupations === undefined ? {} : { stoneNodeOccupations }),
    ...(workerSystem === undefined ? {} : { workerSystem }),
    ...(workerWorkers === undefined ? {} : { workerWorkers }),
    ...(workerOccupations === undefined ? {} : { workerOccupations }),
    ...(forestLayout === undefined ? {} : { forestLayout }),
    ...(forestTrees === undefined ? {} : { forestTrees }),
    ...(waterProjection.layout === undefined ? {} : { waterLayout: waterProjection.layout }),
    ...(waterProjection.bodies === undefined ? {} : { waterBodies: waterProjection.bodies }),
    ...(waterProjection.cells === undefined ? {} : { waterCells: waterProjection.cells }),
    ...(waterProjection.realmEnvironment === undefined ? {} : {
      realmEnvironment: waterProjection.realmEnvironment
    }),
    ...(waterProjection.waterRevision === undefined ? {} : {
      waterRevision: waterProjection.waterRevision
    }),
    ownCastle: frozenOwnCastle
  } as BrandedSnapshot;
  Object.defineProperty(canonical, CANONICAL_SNAPSHOT_BRAND, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      ownFid: input.ownFid,
      canonicalFingerprint: staticWorld.fingerprint
    })
  });
  return Object.freeze(canonical);
}
