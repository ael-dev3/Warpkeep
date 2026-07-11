import {
  DbConnection,
  tables,
  type SubscriptionHandle
} from './module_bindings';
import type {
  WarpkeepAdmissionStatus,
  WarpkeepCastle,
  WarpkeepPlayer,
  WarpkeepRealmSnapshot,
  WarpkeepWorldTile
} from './warpkeepBackendTypes';
import type { WarpkeepRuntimeConfig } from './warpkeepConfig';

export type WarpkeepConnectionCallbacks = Readonly<{
  onDisconnected?: () => void;
}>;

export type WarpkeepConnection = DbConnection;

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
  if (typeof value === 'bigint' && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return undefined;
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
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
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    try {
      const builder = createWarpkeepConnectionBuilder(config, bridgeJwt, callbacks)
        .onConnect((connection, _identity, _serverIssuedToken) => {
          // Never persist or log `_serverIssuedToken`; it is not Warpkeep authority.
          settle(() => resolve(connection));
        })
        .onConnectError(() => {
          settle(() => reject(new Error('Warpkeep records are unavailable.')));
        });
      builder.build();
    } catch {
      settle(() => reject(new Error('Warpkeep records are unavailable.')));
    }
  });
}

export async function readWarpkeepAdmissionStatus(connection: WarpkeepConnection) {
  const status = await connection.procedures.getMyAdmissionStatus({});
  if (!admissionStatuses.has(status as WarpkeepAdmissionStatus)) {
    throw new Error('Warpkeep returned an invalid admission status.');
  }
  return status as WarpkeepAdmissionStatus;
}

export async function bootstrapWarpkeepPlayer(connection: WarpkeepConnection) {
  await connection.reducers.bootstrapPlayer({});
}

/** Start only the three public shared-state subscriptions, never private/admin tables. */
export function subscribeToWarpkeepRealm(
  connection: WarpkeepConnection,
  onApplied: () => void,
  onError: () => void
): SubscriptionHandle {
  return connection
    .subscriptionBuilder()
    .onApplied(onApplied)
    .onError(() => onError())
    .subscribe([tables.worldTile, tables.player, tables.castle]);
}

function readWorldTiles(connection: WarpkeepConnection): WarpkeepWorldTile[] {
  const rows: WarpkeepWorldTile[] = [];
  for (const row of connection.db.worldTile.iter()) {
    const occupantCastleId = toSafeNumber(row.occupantCastleId);
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
  for (const row of connection.db.player.iter()) {
    const fid = toSafeNumber(row.fid);
    if (fid === undefined || fid <= 0) continue;
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

function readCastles(connection: WarpkeepConnection): WarpkeepCastle[] {
  const rows: WarpkeepCastle[] = [];
  for (const row of connection.db.castle.iter()) {
    const castleId = toSafeNumber(row.castleId);
    const ownerFid = toSafeNumber(row.ownerFid);
    if (castleId === undefined || ownerFid === undefined || ownerFid <= 0) continue;
    rows.push({
      castleId,
      ownerFid,
      tileKey: row.tileKey,
      q: row.q,
      r: row.r,
      level: row.level,
      name: row.name
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
  return {
    tiles: readWorldTiles(connection),
    players: readPlayers(connection),
    castles,
    ...(ownCastle ? { ownCastle } : {})
  };
}

/**
 * Keeps the React-facing snapshot current after the initial narrow
 * subscription. Every callback is removed during sign-out/token replacement.
 */
export function observeWarpkeepRealm(
  connection: WarpkeepConnection,
  ownFid: number,
  onChange: (snapshot: WarpkeepRealmSnapshot) => void
) {
  const sync = () => onChange(readWarpkeepRealmSnapshot(connection, ownFid));
  connection.db.worldTile.onInsert(sync);
  connection.db.worldTile.onDelete(sync);
  connection.db.worldTile.onUpdate(sync);
  connection.db.player.onInsert(sync);
  connection.db.player.onDelete(sync);
  connection.db.player.onUpdate(sync);
  connection.db.castle.onInsert(sync);
  connection.db.castle.onDelete(sync);
  connection.db.castle.onUpdate(sync);

  return () => {
    connection.db.worldTile.removeOnInsert(sync);
    connection.db.worldTile.removeOnDelete(sync);
    connection.db.worldTile.removeOnUpdate(sync);
    connection.db.player.removeOnInsert(sync);
    connection.db.player.removeOnDelete(sync);
    connection.db.player.removeOnUpdate(sync);
    connection.db.castle.removeOnInsert(sync);
    connection.db.castle.removeOnDelete(sync);
    connection.db.castle.removeOnUpdate(sync);
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
