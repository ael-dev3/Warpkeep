import {
  DbConnection,
  tables,
  type EventContext,
  type SubscriptionHandle
} from './playerModuleBindings';
import type {
  WarpkeepAdmissionStatus,
  WarpkeepCastle,
  WarpkeepPlayer,
  WarpkeepRealm,
  WarpkeepRealmProfile,
  WarpkeepRealmSnapshot,
  WarpkeepRealmSnapshotCandidate,
  WarpkeepWorldTileMetadata,
  WarpkeepWorldTile
} from './warpkeepBackendTypes';
import type { WarpkeepRuntimeConfig } from './warpkeepConfig';
import { WARPKEEP_ALPHA_TERMS_VERSION } from '../legal/alphaTermsPolicy';
import {
  readCompatibleWarpkeepBackendInfo,
  WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
  type WarpkeepBackendInfo
} from './warpkeepProtocol';
import { validateCanonicalGenesisSnapshot } from './canonicalGenesisSnapshot';

export type WarpkeepConnectionCallbacks = Readonly<{
  onDisconnected?: () => void;
}>;

export type WarpkeepConnection = DbConnection;

const CONNECTION_HANDSHAKE_TIMEOUT_MILLISECONDS = 10_000;
export { WARPKEEP_ALPHA_TERMS_VERSION } from '../legal/alphaTermsPolicy';

const admissionStatuses = new Set<WarpkeepAdmissionStatus>([
  'not_admitted',
  'admitted_needs_bootstrap',
  'ready',
  'disabled'
]);

function isBridgeJwt(value: string) {
  if (value.length < 24 || value.length > 16_384) {
    return false;
  }

  const parts = value.split('.');
  return parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

function toSafeNumber(value: bigint | number | undefined) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : undefined;
  }
  if (
    typeof value === 'bigint'
    && value >= BigInt(Number.MIN_SAFE_INTEGER)
    && value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value);
  }
  return undefined;
}

function requireSafePositiveNumber(value: bigint | number | undefined) {
  const converted = toSafeNumber(value);
  if (converted === undefined || converted <= 0) {
    throw new Error('Warpkeep records are unavailable.');
  }
  return converted;
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toSafeTimestampMilliseconds(value: { toMillis: () => bigint } | undefined) {
  if (!value) return undefined;
  try {
    return toSafeNumber(value.toMillis());
  } catch {
    return undefined;
  }
}

/**
 * Builds only when an authoritative bridge JWT is supplied. The callback's
 * SpacetimeDB token is deliberately ignored: the bridge token remains the
 * sole browser credential for this closed-alpha connection.
 */
export function createWarpkeepConnectionBuilder(
  config: WarpkeepRuntimeConfig,
  bridgeJwt: string,
  callbacks: WarpkeepConnectionCallbacks = {}
) {
  if (!config.publicConfigValid) {
    throw new Error('Warpkeep records are unavailable.');
  }
  if (!isBridgeJwt(bridgeJwt)) {
    throw new Error('Warpkeep requires a valid bridge session before connecting.');
  }

  return DbConnection.builder()
    .withUri(config.spacetimeUri)
    .withDatabaseName(config.spacetimeDatabase)
    .withToken(bridgeJwt)
    .onDisconnect(() => {
      callbacks.onDisconnected?.();
    });
}

/** Resolve/reject from the explicit connection lifecycle without exposing server details. */
export function connectWarpkeep(
  config: WarpkeepRuntimeConfig,
  bridgeJwt: string,
  callbacks: WarpkeepConnectionCallbacks = {}
): Promise<WarpkeepConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failed = false;
    let pendingConnection: WarpkeepConnection | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      callback();
      return true;
    };
    const rejectUnavailable = () => {
      if (!settle(() => reject(new Error('Warpkeep records are unavailable.')))) return false;
      failed = true;
      disconnectWarpkeep(pendingConnection);
      pendingConnection = undefined;
      return true;
    };

    timeout = setTimeout(() => {
      rejectUnavailable();
    }, CONNECTION_HANDSHAKE_TIMEOUT_MILLISECONDS);
    try {
      const builder = createWarpkeepConnectionBuilder(config, bridgeJwt, callbacks)
        .onConnect((connection, _identity, _serverIssuedToken) => {
          // Never persist or log `_serverIssuedToken`; it is not Warpkeep authority.
          if (settle(() => resolve(connection))) pendingConnection = undefined;
          else disconnectWarpkeep(connection);
        })
        .onConnectError(() => {
          rejectUnavailable();
        });
      const builtConnection = builder.build();
      if (failed) disconnectWarpkeep(builtConnection);
      else if (!settled) pendingConnection = builtConnection;
    } catch {
      rejectUnavailable();
    }
  });
}

export async function readWarpkeepAdmissionStatus(connection: WarpkeepConnection) {
  const status = await connection.procedures.getMyAdmissionStatusV2({});
  if (!admissionStatuses.has(status as WarpkeepAdmissionStatus)) {
    throw new Error('Warpkeep returned an invalid admission status.');
  }
  return status as WarpkeepAdmissionStatus;
}

/** Read and validate static protocol metadata before admission or subscription. */
export async function readWarpkeepBackendInfo(
  connection: WarpkeepConnection
): Promise<WarpkeepBackendInfo> {
  const info = await connection.procedures.getAlphaBackendInfo({});
  return readCompatibleWarpkeepBackendInfo(info);
}

export async function bootstrapWarpkeepPlayer(connection: WarpkeepConnection) {
  await connection.reducers.bootstrapPlayerV2({});
}

/** Authenticated, idempotent acknowledgement; callers must retain gesture intent in memory only. */
export async function acceptWarpkeepAlphaTerms(connection: WarpkeepConnection) {
  await connection.reducers.acceptAlphaTermsV1({
    termsVersion: WARPKEEP_ALPHA_TERMS_VERSION,
    accepted: true
  });
}

/** Start only the protocol-v3 public shared-state subscription, never private/admin tables. */
export function subscribeToWarpkeepRealm(
  connection: WarpkeepConnection,
  onApplied: () => void,
  onError: () => void
): SubscriptionHandle {
  return connection
    .subscriptionBuilder()
    .onApplied(onApplied)
    .onError(() => onError())
    .subscribe([
      tables.worldTile,
      tables.worldTileMetaV1,
      tables.playerV2,
      tables.castle,
      tables.realmV1,
      tables.realmProfileV1
    ]);
}

function readWorldTiles(connection: WarpkeepConnection): WarpkeepWorldTile[] {
  const rows: WarpkeepWorldTile[] = [];
  for (const row of connection.db.worldTile.iter()) {
    const occupantCastleId = toSafeNumber(row.occupantCastleId);
    if (row.occupantCastleId !== undefined && (occupantCastleId === undefined || occupantCastleId <= 0)) {
      throw new Error('Warpkeep records are unavailable.');
    }
    rows.push({
      key: row.key,
      q: row.q,
      r: row.r,
      biome: row.biome,
      terrainSeed: row.terrainSeed,
      ...(occupantCastleId === undefined ? {} : { occupantCastleId })
    });
  }
  return rows.sort((left, right) => left.q - right.q || left.r - right.r);
}

function readPlayers(connection: WarpkeepConnection): WarpkeepPlayer[] {
  const rows: WarpkeepPlayer[] = [];
  for (const row of connection.db.playerV2.iter()) {
    const fid = requireSafePositiveNumber(row.fid);
    rows.push({
      fid,
      ...(toOptionalString(row.username) === undefined ? {} : { username: row.username! }),
      ...(toOptionalString(row.displayName) === undefined
        ? {}
        : { displayName: row.displayName! }),
      ...(toOptionalString(row.pfpUrl) === undefined ? {} : { pfpUrl: row.pfpUrl! }),
      status: row.status
    });
  }
  return rows.sort((left, right) => left.fid - right.fid);
}

function readWorldTileMetadata(connection: WarpkeepConnection): WarpkeepWorldTileMetadata[] {
  const rows: WarpkeepWorldTileMetadata[] = [];
  for (const row of connection.db.worldTileMetaV1.iter()) {
    rows.push({
      tileKey: row.tileKey,
      realmId: row.realmId,
      s: row.s,
      ring: row.ring,
      sector: row.sector,
      terrainKind: row.terrainKind,
      passable: row.passable,
      movementCost: row.movementCost,
      staticContentKind: row.staticContentKind,
      generationVersion: row.generationVersion
    });
  }
  return rows.sort((left, right) => left.ring - right.ring || left.tileKey.localeCompare(right.tileKey));
}

function readRealmProfiles(connection: WarpkeepConnection): WarpkeepRealmProfile[] {
  const rows: WarpkeepRealmProfile[] = [];
  for (const row of connection.db.realmProfileV1.iter()) {
    const fid = requireSafePositiveNumber(row.fid);
    const admittedAt = toSafeTimestampMilliseconds(row.admittedAt);
    const firstAuthenticatedAt = toSafeTimestampMilliseconds(row.firstAuthenticatedAt);
    rows.push({
      fid,
      ...(toOptionalString(row.canonicalUsername) ? { canonicalUsername: row.canonicalUsername! } : {}),
      ...(toOptionalString(row.displayName) ? { displayName: row.displayName! } : {}),
      ...(toOptionalString(row.pfpUrl) ? { pfpUrl: row.pfpUrl! } : {}),
      ...(toOptionalString(row.publicBio) ? { publicBio: row.publicBio! } : {}),
      ...(admittedAt === undefined ? {} : { admittedAt }),
      ...(firstAuthenticatedAt === undefined ? {} : { firstAuthenticatedAt }),
      publicStatus: row.publicStatus,
      communityStatsVisible: row.communityStatsVisible,
      ...(row.totalSnapBurnedMicros === undefined
        ? {}
        : { totalSnapBurnedMicros: row.totalSnapBurnedMicros }),
      ...(row.marksEarnedMicros === undefined ? {} : { marksEarnedMicros: row.marksEarnedMicros }),
      ...(row.marksSpentMicros === undefined ? {} : { marksSpentMicros: row.marksSpentMicros }),
      ...(row.marksBalanceMicros === undefined ? {} : { marksBalanceMicros: row.marksBalanceMicros }),
      ...(toOptionalString(row.marksPolicyVersion)
        ? { marksPolicyVersion: row.marksPolicyVersion! }
        : {})
    });
  }
  return rows.sort((left, right) => left.fid - right.fid);
}

function readActiveRealms(connection: WarpkeepConnection): WarpkeepRealm[] {
  return [...connection.db.realmV1.iter()]
    .filter((row) => row.active)
    .map((row) => ({
      realmId: row.realmId,
      publicName: row.publicName,
      seedName: row.seedName,
      numericSeed: row.numericSeed,
      generationVersion: row.generationVersion,
      authoritativeRadius: row.authoritativeRadius,
      renderRadius: row.renderRadius,
      playerCapacity: row.playerCapacity,
      active: row.active
    }))
    .sort((left, right) => left.realmId.localeCompare(right.realmId));
}

function readCastles(connection: WarpkeepConnection): WarpkeepCastle[] {
  const rows: WarpkeepCastle[] = [];
  for (const row of connection.db.castle.iter()) {
    const castleId = requireSafePositiveNumber(row.castleId);
    const ownerFid = requireSafePositiveNumber(row.ownerFid);
    const foundedAt = toSafeTimestampMilliseconds(row.createdAt);
    rows.push({
      castleId,
      ownerFid,
      tileKey: row.tileKey,
      q: row.q,
      r: row.r,
      level: row.level,
      name: row.name,
      ...(foundedAt === undefined ? {} : { foundedAt })
    });
  }
  return rows.sort((left, right) => left.castleId - right.castleId);
}

export function readWarpkeepRealmSnapshot(
  connection: WarpkeepConnection,
  ownFid: number
): WarpkeepRealmSnapshot {
  const castles = readCastles(connection);
  const ownCastle = castles.find((castle) => castle.ownerFid === ownFid);
  const candidate: WarpkeepRealmSnapshotCandidate = {
    tiles: readWorldTiles(connection),
    tileMetadata: readWorldTileMetadata(connection),
    players: readPlayers(connection),
    profiles: readRealmProfiles(connection),
    castles,
    activeRealms: readActiveRealms(connection),
    ...(ownCastle ? { ownCastle } : {})
  };
  return validateCanonicalGenesisSnapshot(candidate, {
    ownFid,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
  });
}

/**
 * Keeps the React-facing snapshot current after the initial narrow
 * subscription. Every callback is removed during sign-out/token replacement.
 */
export function observeWarpkeepRealm(
  connection: WarpkeepConnection,
  ownFid: number,
  onChange: (snapshot: WarpkeepRealmSnapshot) => void,
  onError: () => void
) {
  let active = true;
  let latestTransactionEventId: string | undefined;
  const sync = (context: EventContext) => {
    // SubscribeApplied first fills every subscribed table and invokes the
    // builder's onApplied callback; its subsequent row callbacks would only
    // rebuild the same full snapshot a second time.
    if (
      !active
      || context.event.tag === 'SubscribeApplied'
      || context.event.id === latestTransactionEventId
    ) return;
    latestTransactionEventId = context.event.id;
    try {
      onChange(readWarpkeepRealmSnapshot(connection, ownFid));
    } catch {
      // A post-ready canonical violation must revoke the browser's renderer
      // authority instead of escaping the SDK callback with stale ready state.
      active = false;
      onError();
    }
  };
  connection.db.worldTile.onInsert(sync);
  connection.db.worldTile.onDelete(sync);
  connection.db.worldTile.onUpdate(sync);
  connection.db.worldTileMetaV1.onInsert(sync);
  connection.db.worldTileMetaV1.onDelete(sync);
  connection.db.worldTileMetaV1.onUpdate(sync);
  connection.db.playerV2.onInsert(sync);
  connection.db.playerV2.onDelete(sync);
  connection.db.playerV2.onUpdate(sync);
  connection.db.castle.onInsert(sync);
  connection.db.castle.onDelete(sync);
  connection.db.castle.onUpdate(sync);
  connection.db.realmV1.onInsert(sync);
  connection.db.realmV1.onDelete(sync);
  connection.db.realmV1.onUpdate(sync);
  connection.db.realmProfileV1.onInsert(sync);
  connection.db.realmProfileV1.onDelete(sync);
  connection.db.realmProfileV1.onUpdate(sync);

  return () => {
    active = false;
    connection.db.worldTile.removeOnInsert(sync);
    connection.db.worldTile.removeOnDelete(sync);
    connection.db.worldTile.removeOnUpdate(sync);
    connection.db.worldTileMetaV1.removeOnInsert(sync);
    connection.db.worldTileMetaV1.removeOnDelete(sync);
    connection.db.worldTileMetaV1.removeOnUpdate(sync);
    connection.db.playerV2.removeOnInsert(sync);
    connection.db.playerV2.removeOnDelete(sync);
    connection.db.playerV2.removeOnUpdate(sync);
    connection.db.castle.removeOnInsert(sync);
    connection.db.castle.removeOnDelete(sync);
    connection.db.castle.removeOnUpdate(sync);
    connection.db.realmV1.removeOnInsert(sync);
    connection.db.realmV1.removeOnDelete(sync);
    connection.db.realmV1.removeOnUpdate(sync);
    connection.db.realmProfileV1.removeOnInsert(sync);
    connection.db.realmProfileV1.removeOnDelete(sync);
    connection.db.realmProfileV1.removeOnUpdate(sync);
  };
}

export function disconnectWarpkeep(connection: WarpkeepConnection | undefined) {
  if (!connection || connection.isDisconnectRequested) {
    return;
  }
  try {
    connection.disconnect();
  } catch {
    // A stale socket must not compromise title/menu or sign-out.
  }
}
