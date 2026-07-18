import {
  DbConnection,
  tables,
  type EventContext,
  type SubscriptionHandle
} from './playerModuleBindings';
import type {
  WarpkeepAdmissionStatus,
  WarpkeepCastle,
  WarpkeepFoodNodeOccupation,
  WarpkeepFoodSite,
  WarpkeepWoodNodeOccupation,
  WarpkeepWoodSite,
  WarpkeepGoldNodeOccupation,
  WarpkeepGoldSite,
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
import {
  REALM_CASTLE_NAME_MAXIMUM_LENGTH,
  REALM_DISPLAY_NAME_MAXIMUM_LENGTH,
  REALM_MARKS_POLICY_MAXIMUM_LENGTH,
  REALM_PUBLIC_BIO_MAXIMUM_LENGTH,
  REALM_PUBLIC_STATUS_MAXIMUM_LENGTH,
  isCanonicalRealmPublicText,
  sanitizeOptionalRealmProfileImageUrl,
  sanitizeOptionalRealmPublicText,
  sanitizeOptionalRealmUsername
} from './publicRealmProjectionPolicy';
import {
  decodeRealmResourceProjection,
  type ReadyRealmResourcePresentation
} from '../components/realm/realmResourcePresentation';
import {
  decodeGoldExpeditionPresentation,
  type ReadyGoldExpeditionPresentation
} from '../components/realm/realmGoldExpeditionPresentation';
import {
  decodeFoodExpeditionPresentation,
  type ReadyFoodExpeditionPresentation
} from '../components/realm/realmFoodExpeditionPresentation';
import {
  decodeWoodExpeditionPresentation,
  type ReadyWoodExpeditionPresentation
} from '../components/realm/realmWoodExpeditionPresentation';
import {
  isRealmGoldNodeOccupationPublicRecord,
  isRealmGoldSitePublicRecord
} from '../components/realm/realmGoldNodePresentation';
import {
  isRealmFoodNodeOccupationPublicRecord,
  isRealmFoodSitePublicRecord
} from '../components/realm/realmFoodNodePresentation';
import {
  isRealmWoodNodeOccupationPublicRecord,
  isRealmWoodSitePublicRecord
} from '../components/realm/realmWoodNodePresentation';

export type WarpkeepConnectionCallbacks = Readonly<{
  onDisconnected?: () => void;
}>;

export type WarpkeepConnection = DbConnection;

/**
 * Core Realm data remains available while additive feature projections are
 * applying or unavailable on an older deployment. Every handle is still
 * released as one lifecycle unit.
 */
export type WarpkeepRealmSubscription = Readonly<{
  unsubscribe: () => void;
}>;

/** Maincloud may need to wake a database before completing the authenticated handshake. */
export const CONNECTION_HANDSHAKE_TIMEOUT_MILLISECONDS = 30_000;
const GOLD_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const GOLD_PROJECTION_PENDING = 'pending' as const;
const GOLD_PROJECTION_READY = 'ready' as const;
type GoldProjectionAvailability =
  | typeof GOLD_PROJECTION_UNAVAILABLE
  | typeof GOLD_PROJECTION_PENDING
  | typeof GOLD_PROJECTION_READY;
const goldProjectionAvailability = new WeakMap<WarpkeepConnection, GoldProjectionAvailability>();
const FOOD_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const FOOD_PROJECTION_PENDING = 'pending' as const;
const FOOD_PROJECTION_READY = 'ready' as const;
type FoodProjectionAvailability =
  | typeof FOOD_PROJECTION_UNAVAILABLE
  | typeof FOOD_PROJECTION_PENDING
  | typeof FOOD_PROJECTION_READY;
const foodProjectionAvailability = new WeakMap<WarpkeepConnection, FoodProjectionAvailability>();
const WOOD_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const WOOD_PROJECTION_PENDING = 'pending' as const;
const WOOD_PROJECTION_READY = 'ready' as const;
type WoodProjectionAvailability =
  | typeof WOOD_PROJECTION_UNAVAILABLE
  | typeof WOOD_PROJECTION_PENDING
  | typeof WOOD_PROJECTION_READY;
const woodProjectionAvailability = new WeakMap<WarpkeepConnection, WoodProjectionAvailability>();
const FOREST_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const FOREST_PROJECTION_PENDING = 'pending' as const;
const FOREST_PROJECTION_READY = 'ready' as const;
type ForestProjectionAvailability =
  | typeof FOREST_PROJECTION_UNAVAILABLE
  | typeof FOREST_PROJECTION_PENDING
  | typeof FOREST_PROJECTION_READY;
/**
 * Forest metadata and instances share one subscription handle. They only
 * become readable after that paired subscription has applied in full.
 */
const forestProjectionAvailability = new WeakMap<WarpkeepConnection, ForestProjectionAvailability>();
const GOLD_SITE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const GOLD_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const FOOD_SITE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const FOOD_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const WOOD_SITE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const WOOD_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
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

function readOptionalPublicText(value: unknown, maximumLength: number) {
  return sanitizeOptionalRealmPublicText(value, maximumLength);
}

function readRequiredPublicText(value: unknown, maximumLength: number) {
  if (!isCanonicalRealmPublicText(value, maximumLength)) {
    throw new Error('Warpkeep records are unavailable.');
  }
  return value;
}

function readOptionalUsername(value: unknown) {
  return sanitizeOptionalRealmUsername(value);
}

function readOptionalProfileImageUrl(value: unknown) {
  return sanitizeOptionalRealmProfileImageUrl(value);
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

/** Read only the authenticated player's private economic and Marks projection. */
export async function readWarpkeepResourceState(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<ReadyRealmResourcePresentation> {
  if (!Number.isSafeInteger(ownFid) || ownFid <= 0) {
    throw new Error('Warpkeep resources are unavailable.');
  }
  const raw = await connection.procedures.getMyResourceStateV1({});
  const decoded = decodeRealmResourceProjection(raw, BigInt(ownFid));
  if (decoded?.status !== 'ready') {
    throw new Error('Warpkeep resources are unavailable.');
  }
  return decoded;
}

/** Settle server-authoritative yield, then fetch the exact committed view. */
export async function collectWarpkeepResources(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<ReadyRealmResourcePresentation> {
  await connection.reducers.collectResourcesV1({});
  return readWarpkeepResourceState(connection, ownFid);
}

/**
 * Read the caller-only expedition procedure. A malformed private projection
 * disables the related controls; it is never coerced into a balance, an
 * occupied node, or a server error for the otherwise-safe public Realm.
 */
export async function readWarpkeepGoldExpeditionState(
  connection: WarpkeepConnection
): Promise<ReadyGoldExpeditionPresentation | undefined> {
  const raw = await connection.procedures.getMyGoldExpeditionStateV1({});
  const decoded = decodeGoldExpeditionPresentation(raw);
  return decoded.status === 'ready' ? decoded : undefined;
}

function assertGoldExpeditionDispatchInput(siteId: string, idempotencyKey: string) {
  if (
    !GOLD_SITE_ID_PATTERN.test(siteId)
    || !GOLD_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    throw new Error('Gold expedition is unavailable.');
  }
}

/**
 * Dispatch sends only an approved public site id and a browser idempotency
 * token. Ownership, route, timing, occupancy, and reward all stay server-side.
 */
export async function dispatchWarpkeepGoldExpedition(
  connection: WarpkeepConnection,
  siteId: string,
  idempotencyKey: string
): Promise<ReadyGoldExpeditionPresentation | undefined> {
  assertGoldExpeditionDispatchInput(siteId, idempotencyKey);
  await connection.reducers.dispatchGoldExpeditionV1({ siteId, idempotencyKey });
  return readWarpkeepGoldExpeditionState(connection);
}

/**
 * Explicitly settle the authenticated caller's Gold expedition, then refresh
 * both private projections. No public occupation row or browser balance is
 * changed optimistically.
 */
export async function collectWarpkeepGoldExpedition(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<Readonly<{
  resources: ReadyRealmResourcePresentation;
  goldExpedition: ReadyGoldExpeditionPresentation | undefined;
}>> {
  await connection.reducers.collectGoldExpeditionV1({});
  const [resources, goldExpedition] = await Promise.all([
    readWarpkeepResourceState(connection, ownFid),
    readWarpkeepGoldExpeditionState(connection)
  ]);
  return Object.freeze({ resources, goldExpedition });
}

type FoodProcedureSurface = Readonly<{
  getMyFoodExpeditionStateV1?: (input: Readonly<Record<string, never>>) => Promise<unknown>;
}>;

type FoodReducerSurface = Readonly<{
  dispatchFoodExpeditionV1?: (input: Readonly<{
    siteId: string;
    idempotencyKey: string;
  }>) => Promise<unknown> | unknown;
  collectFoodExpeditionV1?: (input: Readonly<Record<string, never>>) => Promise<unknown> | unknown;
}>;

function foodProcedureSurface(connection: WarpkeepConnection) {
  return connection.procedures as unknown as FoodProcedureSurface;
}

function foodReducerSurface(connection: WarpkeepConnection) {
  return connection.reducers as unknown as FoodReducerSurface;
}

/**
 * Food remains a soft additive capability. A pre-v7 deployment or malformed
 * private procedure simply suppresses Food actions; it must never fail the
 * authenticated core Realm or independent Gold operations.
 */
export async function readWarpkeepFoodExpeditionState(
  connection: WarpkeepConnection
): Promise<ReadyFoodExpeditionPresentation | undefined> {
  const procedure = foodProcedureSurface(connection).getMyFoodExpeditionStateV1;
  if (typeof procedure !== 'function') return undefined;
  const raw = await procedure({});
  const decoded = decodeFoodExpeditionPresentation(raw);
  return decoded.status === 'ready' ? decoded : undefined;
}

function assertFoodExpeditionDispatchInput(siteId: string, idempotencyKey: string) {
  if (!FOOD_SITE_ID_PATTERN.test(siteId) || !FOOD_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new Error('Food expedition is unavailable.');
  }
}

export async function dispatchWarpkeepFoodExpedition(
  connection: WarpkeepConnection,
  siteId: string,
  idempotencyKey: string
): Promise<ReadyFoodExpeditionPresentation | undefined> {
  assertFoodExpeditionDispatchInput(siteId, idempotencyKey);
  const reducer = foodReducerSurface(connection).dispatchFoodExpeditionV1;
  if (typeof reducer !== 'function') throw new Error('Food expedition is unavailable.');
  await reducer({ siteId, idempotencyKey });
  return readWarpkeepFoodExpeditionState(connection);
}

export async function collectWarpkeepFoodExpedition(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<Readonly<{
  resources: ReadyRealmResourcePresentation;
  foodExpedition: ReadyFoodExpeditionPresentation | undefined;
}>> {
  const reducer = foodReducerSurface(connection).collectFoodExpeditionV1;
  if (typeof reducer !== 'function') throw new Error('Food expedition is unavailable.');
  await reducer({});
  const [resources, foodExpedition] = await Promise.all([
    readWarpkeepResourceState(connection, ownFid),
    readWarpkeepFoodExpeditionState(connection)
  ]);
  return Object.freeze({ resources, foodExpedition });
}

type WoodProcedureSurface = Readonly<{
  getMyWoodExpeditionStateV1?: (input: Readonly<Record<string, never>>) => Promise<unknown>;
}>;

type WoodReducerSurface = Readonly<{
  dispatchWoodExpeditionV1?: (input: Readonly<{
    siteId: string;
    idempotencyKey: string;
  }>) => Promise<unknown> | unknown;
  collectWoodExpeditionV1?: (input: Readonly<Record<string, never>>) => Promise<unknown> | unknown;
}>;

function woodProcedureSurface(connection: WarpkeepConnection) {
  return connection.procedures as unknown as WoodProcedureSurface;
}

function woodReducerSurface(connection: WarpkeepConnection) {
  return connection.reducers as unknown as WoodReducerSurface;
}

/**
 * Wood is a soft additive capability. An older deployment or malformed
 * private procedure removes Wood controls only; it cannot revoke Food, Gold,
 * or the authenticated core Realm.
 */
export async function readWarpkeepWoodExpeditionState(
  connection: WarpkeepConnection
): Promise<ReadyWoodExpeditionPresentation | undefined> {
  const procedure = woodProcedureSurface(connection).getMyWoodExpeditionStateV1;
  if (typeof procedure !== 'function') return undefined;
  const raw = await procedure({});
  const decoded = decodeWoodExpeditionPresentation(raw);
  return decoded.status === 'ready' ? decoded : undefined;
}

function assertWoodExpeditionDispatchInput(siteId: string, idempotencyKey: string) {
  if (!WOOD_SITE_ID_PATTERN.test(siteId) || !WOOD_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new Error('Wood expedition is unavailable.');
  }
}

export async function dispatchWarpkeepWoodExpedition(
  connection: WarpkeepConnection,
  siteId: string,
  idempotencyKey: string
): Promise<ReadyWoodExpeditionPresentation | undefined> {
  assertWoodExpeditionDispatchInput(siteId, idempotencyKey);
  const reducer = woodReducerSurface(connection).dispatchWoodExpeditionV1;
  if (typeof reducer !== 'function') throw new Error('Wood expedition is unavailable.');
  await reducer({ siteId, idempotencyKey });
  return readWarpkeepWoodExpeditionState(connection);
}

export async function collectWarpkeepWoodExpedition(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<Readonly<{
  resources: ReadyRealmResourcePresentation;
  woodExpedition: ReadyWoodExpeditionPresentation | undefined;
}>> {
  const reducer = woodReducerSurface(connection).collectWoodExpeditionV1;
  if (typeof reducer !== 'function') throw new Error('Wood expedition is unavailable.');
  await reducer({});
  const [resources, woodExpedition] = await Promise.all([
    readWarpkeepResourceState(connection, ownFid),
    readWarpkeepWoodExpeditionState(connection)
  ]);
  return Object.freeze({ resources, woodExpedition });
}

/**
 * Start the protocol-v3 core shared-state subscription and additive public
 * Gold/Food/Wood/forest subscriptions. The scheduler, forest seeding reducer, and every
 * private economy table remain outside the player graph. If an additive
 * schema is not deployed yet, the core Realm remains live but that visual
 * layer is empty rather than locally synthesized.
 */
export function subscribeToWarpkeepRealm(
  connection: WarpkeepConnection,
  onApplied: () => void,
  onError: () => void
): WarpkeepRealmSubscription {
  let coreApplied = false;
  goldProjectionAvailability.set(connection, GOLD_PROJECTION_PENDING);
  foodProjectionAvailability.set(connection, FOOD_PROJECTION_PENDING);
  woodProjectionAvailability.set(connection, WOOD_PROJECTION_PENDING);
  forestProjectionAvailability.set(connection, FOREST_PROJECTION_PENDING);
  const coreSubscription = connection
    .subscriptionBuilder()
    .onApplied(() => {
      coreApplied = true;
      onApplied();
    })
    .onError(() => onError())
    .subscribe([
      tables.worldTile,
      tables.worldTileMetaV1,
      tables.playerV2,
      tables.castle,
      tables.realmV1,
      tables.realmProfileV1
    ]);

  let goldSubscription: SubscriptionHandle | undefined;
  const publicTables = (connection.db ?? {}) as unknown as {
    goldSiteV1?: unknown;
    goldNodeOccupationV1?: unknown;
  };
  // A hand-built test connection or a pre-additive service can lack these
  // accessors. Do not turn that absence into a false-free node or a Realm
  // failure; the snapshot simply omits Gold until a compatible subscription
  // applies.
  if (publicTables.goldSiteV1 !== undefined && publicTables.goldNodeOccupationV1 !== undefined) {
    try {
      goldSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          goldProjectionAvailability.set(connection, GOLD_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          goldProjectionAvailability.set(connection, GOLD_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe([
          tables.goldSiteV1,
          tables.goldNodeOccupationV1
        ]);
    } catch {
      goldProjectionAvailability.set(connection, GOLD_PROJECTION_UNAVAILABLE);
      if (coreApplied) onApplied();
    }
  } else {
    goldProjectionAvailability.set(connection, GOLD_PROJECTION_UNAVAILABLE);
  }

  let foodSubscription: SubscriptionHandle | undefined;
  const foodTables = publicFoodTables(connection);
  const foodBindings = publicFoodSubscriptionTables();
  // Food must have both generated bindings and both public db accessors. A
  // missing pair means no Food nodes, never a false-free local farm and never
  // a failure of Gold/core Realm subscriptions.
  if (foodTables !== undefined && foodBindings !== undefined) {
    try {
      foodSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          foodProjectionAvailability.set(connection, FOOD_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          foodProjectionAvailability.set(connection, FOOD_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe([
          foodBindings.foodSiteV1,
          foodBindings.foodNodeOccupationV1
        ]);
    } catch {
      foodProjectionAvailability.set(connection, FOOD_PROJECTION_UNAVAILABLE);
      if (coreApplied) onApplied();
    }
  } else {
    foodProjectionAvailability.set(connection, FOOD_PROJECTION_UNAVAILABLE);
  }

  let woodSubscription: SubscriptionHandle | undefined;
  const woodTables = publicWoodTables(connection);
  const woodBindings = publicWoodSubscriptionTables();
  // Wood is independent of the Food and Gold projection pairs. If the exact
  // generated bindings or public rows are absent, no Wood marker appears;
  // the client never substitutes a local free site or interrupts core Realm.
  if (woodTables !== undefined && woodBindings !== undefined) {
    try {
      woodSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          woodProjectionAvailability.set(connection, WOOD_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          woodProjectionAvailability.set(connection, WOOD_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe([
          woodBindings.woodSiteV1,
          woodBindings.woodNodeOccupationV1
        ]);
    } catch {
      woodProjectionAvailability.set(connection, WOOD_PROJECTION_UNAVAILABLE);
      if (coreApplied) onApplied();
    }
  } else {
    woodProjectionAvailability.set(connection, WOOD_PROJECTION_UNAVAILABLE);
  }

  let forestSubscription: SubscriptionHandle | undefined;
  const forestTables = publicForestTables(connection);
  // A pre-forest service (or a deliberately narrow test double) cannot make
  // the renderer invent a local forest. It remains an empty layer until the
  // paired public tables subscribe and apply together.
  if (forestTables !== undefined) {
    try {
      forestSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          forestProjectionAvailability.set(connection, FOREST_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          forestProjectionAvailability.set(connection, FOREST_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe([
          tables.realmForestLayoutV1,
          tables.realmForestInstanceV1
        ]);
    } catch {
      forestProjectionAvailability.set(connection, FOREST_PROJECTION_UNAVAILABLE);
      if (coreApplied) onApplied();
    }
  } else {
    forestProjectionAvailability.set(connection, FOREST_PROJECTION_UNAVAILABLE);
  }

  return Object.freeze({
    unsubscribe: () => {
      goldProjectionAvailability.delete(connection);
      foodProjectionAvailability.delete(connection);
      woodProjectionAvailability.delete(connection);
      forestProjectionAvailability.delete(connection);
      try {
        try {
          try {
            goldSubscription?.unsubscribe();
          } finally {
            try {
              foodSubscription?.unsubscribe();
            } finally {
              woodSubscription?.unsubscribe();
            }
          }
        } finally {
          forestSubscription?.unsubscribe();
        }
      } finally {
        coreSubscription.unsubscribe();
      }
    }
  });
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
    const username = readOptionalUsername(row.username);
    const displayName = readOptionalPublicText(
      row.displayName,
      REALM_DISPLAY_NAME_MAXIMUM_LENGTH
    );
    const pfpUrl = readOptionalProfileImageUrl(row.pfpUrl);
    const status = readRequiredPublicText(
      row.status,
      REALM_PUBLIC_STATUS_MAXIMUM_LENGTH
    );
    rows.push({
      fid,
      ...(username === undefined ? {} : { username }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(pfpUrl === undefined ? {} : { pfpUrl }),
      status
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
    const canonicalUsername = readOptionalUsername(row.canonicalUsername);
    const displayName = readOptionalPublicText(
      row.displayName,
      REALM_DISPLAY_NAME_MAXIMUM_LENGTH
    );
    const pfpUrl = readOptionalProfileImageUrl(row.pfpUrl);
    const publicBio = readOptionalPublicText(
      row.publicBio,
      REALM_PUBLIC_BIO_MAXIMUM_LENGTH
    );
    const publicStatus = readRequiredPublicText(
      row.publicStatus,
      REALM_PUBLIC_STATUS_MAXIMUM_LENGTH
    );
    const marksPolicyVersion = readOptionalPublicText(
      row.marksPolicyVersion,
      REALM_MARKS_POLICY_MAXIMUM_LENGTH
    );
    rows.push({
      fid,
      ...(canonicalUsername === undefined ? {} : { canonicalUsername }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(pfpUrl === undefined ? {} : { pfpUrl }),
      ...(publicBio === undefined ? {} : { publicBio }),
      ...(admittedAt === undefined ? {} : { admittedAt }),
      ...(firstAuthenticatedAt === undefined ? {} : { firstAuthenticatedAt }),
      publicStatus,
      communityStatsVisible: row.communityStatsVisible,
      ...(row.totalSnapBurnedMicros === undefined
        ? {}
        : { totalSnapBurnedMicros: row.totalSnapBurnedMicros }),
      ...(row.marksEarnedMicros === undefined ? {} : { marksEarnedMicros: row.marksEarnedMicros }),
      ...(row.marksSpentMicros === undefined ? {} : { marksSpentMicros: row.marksSpentMicros }),
      ...(row.marksBalanceMicros === undefined ? {} : { marksBalanceMicros: row.marksBalanceMicros }),
      ...(marksPolicyVersion === undefined ? {} : { marksPolicyVersion })
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
    const name = readRequiredPublicText(
      row.name,
      REALM_CASTLE_NAME_MAXIMUM_LENGTH
    );
    rows.push({
      castleId,
      ownerFid,
      tileKey: row.tileKey,
      q: row.q,
      r: row.r,
      level: row.level,
      name,
      ...(foundedAt === undefined ? {} : { foundedAt })
    });
  }
  return rows.sort((left, right) => left.castleId - right.castleId);
}

type PublicGoldTableRow = Readonly<Record<string, unknown>>;

function asPublicGoldRow(value: unknown): PublicGoldTableRow | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as PublicGoldTableRow
    : undefined;
}

type PublicFoodTableRow = Readonly<Record<string, unknown>>;

function asPublicFoodRow(value: unknown): PublicFoodTableRow | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as PublicFoodTableRow
    : undefined;
}

type PublicWoodTableRow = Readonly<Record<string, unknown>>;

function asPublicWoodRow(value: unknown): PublicWoodTableRow | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as PublicWoodTableRow
    : undefined;
}

type PublicForestTableRow = Readonly<Record<string, unknown>>;

function asPublicForestRow(value: unknown): PublicForestTableRow | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as PublicForestTableRow
    : undefined;
}

type PublicForestTable = Readonly<{
  iter?: () => Iterable<unknown>;
  onInsert?: (listener: (context: EventContext) => void) => void;
  onDelete?: (listener: (context: EventContext) => void) => void;
  onUpdate?: (listener: (context: EventContext) => void) => void;
  removeOnInsert?: (listener: (context: EventContext) => void) => void;
  removeOnDelete?: (listener: (context: EventContext) => void) => void;
  removeOnUpdate?: (listener: (context: EventContext) => void) => void;
}>;

function publicForestTables(connection: WarpkeepConnection) {
  const db = connection.db as unknown as Readonly<{
    realmForestLayoutV1?: PublicForestTable;
    realmForestInstanceV1?: PublicForestTable;
  }> | undefined;
  if (!db?.realmForestLayoutV1 || !db.realmForestInstanceV1) return undefined;
  return db;
}

function publicForestLayoutRecord(value: unknown): unknown {
  const row = asPublicForestRow(value);
  if (!row) return Object.freeze({});
  // Project only the fixed public metadata columns. A malformed field remains
  // visibly malformed to the strict browser policy instead of being coerced.
  return Object.freeze({
    realmId: row.realmId,
    layoutVersion: row.layoutVersion,
    policyVersion: row.policyVersion,
    layoutDigest: row.layoutDigest,
    assetCatalogDigest: row.assetCatalogDigest,
    instanceCount: row.instanceCount
  });
}

function publicForestTreeRecord(value: unknown): unknown {
  const row = asPublicForestRow(value);
  if (!row) return Object.freeze({});
  // Do not expose seeded timestamps, reducers, or arbitrary generated row
  // fields to the renderer. The policy receives exactly its fixed-point
  // layout contract and rejects every incompatible value.
  return Object.freeze({
    treeId: row.treeId,
    realmId: row.realmId,
    tileKey: row.tileKey,
    q: row.q,
    r: row.r,
    localXMicrounits: row.localXMicrounits,
    localZMicrounits: row.localZMicrounits,
    worldXMicrounits: row.worldXMicrounits,
    worldZMicrounits: row.worldZMicrounits,
    rotationMilliDegrees: row.rotationMilliDegrees,
    scaleBasisPoints: row.scaleBasisPoints,
    speciesId: row.speciesId,
    habitat: row.habitat,
    layoutVersion: row.layoutVersion
  });
}

function publicGoldTables(connection: WarpkeepConnection) {
  const db = connection.db as unknown as {
    goldSiteV1?: {
      iter: () => Iterable<unknown>;
      onInsert?: (listener: (context: EventContext) => void) => void;
      onDelete?: (listener: (context: EventContext) => void) => void;
      onUpdate?: (listener: (context: EventContext) => void) => void;
      removeOnInsert?: (listener: (context: EventContext) => void) => void;
      removeOnDelete?: (listener: (context: EventContext) => void) => void;
      removeOnUpdate?: (listener: (context: EventContext) => void) => void;
    };
    goldNodeOccupationV1?: {
      iter: () => Iterable<unknown>;
      onInsert?: (listener: (context: EventContext) => void) => void;
      onDelete?: (listener: (context: EventContext) => void) => void;
      onUpdate?: (listener: (context: EventContext) => void) => void;
      removeOnInsert?: (listener: (context: EventContext) => void) => void;
      removeOnDelete?: (listener: (context: EventContext) => void) => void;
      removeOnUpdate?: (listener: (context: EventContext) => void) => void;
    };
  };
  if (!db.goldSiteV1 || !db.goldNodeOccupationV1) return undefined;
  return db;
}

type PublicFoodTable = Readonly<{
  iter: () => Iterable<unknown>;
  onInsert?: (listener: (context: EventContext) => void) => void;
  onDelete?: (listener: (context: EventContext) => void) => void;
  onUpdate?: (listener: (context: EventContext) => void) => void;
  removeOnInsert?: (listener: (context: EventContext) => void) => void;
  removeOnDelete?: (listener: (context: EventContext) => void) => void;
  removeOnUpdate?: (listener: (context: EventContext) => void) => void;
}>;

function publicFoodTables(connection: WarpkeepConnection) {
  const db = connection.db as unknown as Readonly<{
    foodSiteV1?: PublicFoodTable;
    foodNodeOccupationV1?: PublicFoodTable;
  }> | undefined;
  if (!db?.foodSiteV1 || !db.foodNodeOccupationV1) return undefined;
  return db;
}

function publicWoodTables(connection: WarpkeepConnection) {
  const db = connection.db as unknown as Readonly<{
    woodSiteV1?: PublicFoodTable;
    woodNodeOccupationV1?: PublicFoodTable;
  }> | undefined;
  if (!db?.woodSiteV1 || !db.woodNodeOccupationV1) return undefined;
  return db;
}

/**
 * Generated module bindings are intentionally optional at this browser
 * boundary during the additive rollout. Referencing through this narrow cast
 * lets an older deployed module leave Food absent without blocking Gold/core.
 */
function publicFoodSubscriptionTables() {
  const bindingTables = tables as unknown as Readonly<{
    foodSiteV1?: typeof tables.goldSiteV1;
    foodNodeOccupationV1?: typeof tables.goldNodeOccupationV1;
  }>;
  if (!bindingTables.foodSiteV1 || !bindingTables.foodNodeOccupationV1) return undefined;
  return bindingTables as Readonly<{
    foodSiteV1: typeof tables.goldSiteV1;
    foodNodeOccupationV1: typeof tables.goldNodeOccupationV1;
  }>;
}

/**
 * Wood has canonical player bindings. A pre-v8 server still fails only this
 * paired subscription (caught at the call site), leaving core/Gold/Food live.
 */
function publicWoodSubscriptionTables() {
  return Object.freeze({
    woodSiteV1: tables.woodSiteV1,
    woodNodeOccupationV1: tables.woodNodeOccupationV1
  });
}

/**
 * Read the additive public Gold catalog as an all-or-nothing visual
 * projection. Any malformed or duplicate row omits the complete Gold layer;
 * it must not make a potentially occupied site appear available.
 */
function readPublicGoldProjection(connection: WarpkeepConnection): Readonly<{
  sites: readonly WarpkeepGoldSite[];
  occupations: readonly WarpkeepGoldNodeOccupation[];
}> | undefined {
  if (goldProjectionAvailability.get(connection) !== GOLD_PROJECTION_READY) return undefined;
  const db = publicGoldTables(connection);
  if (!db) return undefined;
  const goldSiteTable = db.goldSiteV1;
  const goldOccupationTable = db.goldNodeOccupationV1;
  if (!goldSiteTable || !goldOccupationTable) return undefined;

  const sites: WarpkeepGoldSite[] = [];
  const siteIds = new Set<string>();
  for (const rawRow of goldSiteTable.iter()) {
    const row = asPublicGoldRow(rawRow);
    if (!row) return undefined;
    const site = {
      siteId: row.siteId,
      q: row.q,
      r: row.r,
      tier: row.tier,
      active: row.active
    };
    if (!isRealmGoldSitePublicRecord(site) || siteIds.has(site.siteId)) return undefined;
    siteIds.add(site.siteId);
    sites.push(Object.freeze({ ...site }));
  }

  const occupations: WarpkeepGoldNodeOccupation[] = [];
  const occupiedSiteIds = new Set<string>();
  for (const rawRow of goldOccupationTable.iter()) {
    const row = asPublicGoldRow(rawRow);
    if (!row) return undefined;
    const originCastleId = toSafeNumber(row.originCastleId as bigint | number | undefined);
    const occupation = {
      siteId: row.siteId,
      originCastleId,
      phase: row.phase,
      startedAtMicros: row.startedAtMicros,
      arrivesAtMicros: row.arrivesAtMicros,
      gatheringEndsAtMicros: row.gatheringEndsAtMicros,
      returnsAtMicros: row.returnsAtMicros
    };
    if (
      !isRealmGoldNodeOccupationPublicRecord(occupation)
      || occupiedSiteIds.has(occupation.siteId)
    ) return undefined;
    occupiedSiteIds.add(occupation.siteId);
    occupations.push(Object.freeze({ ...occupation }));
  }

  return Object.freeze({
    sites: Object.freeze(sites.sort((left, right) => left.siteId.localeCompare(right.siteId))),
    occupations: Object.freeze(occupations.sort((left, right) => left.siteId.localeCompare(right.siteId)))
  });
}

/**
 * All-or-nothing Food catalog projection. It has an independent availability
 * sentinel from Gold so a malformed Food row renders zero Food farms only.
 */
function readPublicFoodProjection(connection: WarpkeepConnection): Readonly<{
  sites: readonly WarpkeepFoodSite[];
  occupations: readonly WarpkeepFoodNodeOccupation[];
}> | undefined {
  if (foodProjectionAvailability.get(connection) !== FOOD_PROJECTION_READY) return undefined;
  const db = publicFoodTables(connection);
  if (!db) return undefined;
  const foodSiteTable = db.foodSiteV1;
  const foodOccupationTable = db.foodNodeOccupationV1;
  if (!foodSiteTable || !foodOccupationTable) return undefined;
  const sites: WarpkeepFoodSite[] = [];
  const siteIds = new Set<string>();
  for (const rawRow of foodSiteTable.iter()) {
    const row = asPublicFoodRow(rawRow);
    if (!row) return undefined;
    const site = {
      siteId: row.siteId,
      q: row.q,
      r: row.r,
      tier: row.tier,
      active: row.active
    };
    if (!isRealmFoodSitePublicRecord(site) || siteIds.has(site.siteId)) return undefined;
    siteIds.add(site.siteId);
    sites.push(Object.freeze({ ...site }));
  }
  const occupations: WarpkeepFoodNodeOccupation[] = [];
  const occupiedSiteIds = new Set<string>();
  for (const rawRow of foodOccupationTable.iter()) {
    const row = asPublicFoodRow(rawRow);
    if (!row) return undefined;
    const occupation = {
      siteId: row.siteId,
      originCastleId: toSafeNumber(row.originCastleId as bigint | number | undefined),
      phase: row.phase,
      startedAtMicros: row.startedAtMicros,
      arrivesAtMicros: row.arrivesAtMicros,
      gatheringEndsAtMicros: row.gatheringEndsAtMicros,
      returnsAtMicros: row.returnsAtMicros
    };
    if (!isRealmFoodNodeOccupationPublicRecord(occupation) || occupiedSiteIds.has(occupation.siteId)) {
      return undefined;
    }
    occupiedSiteIds.add(occupation.siteId);
    occupations.push(Object.freeze({ ...occupation }));
  }
  return Object.freeze({
    sites: Object.freeze(sites.sort((left, right) => left.siteId.localeCompare(right.siteId))),
    occupations: Object.freeze(occupations.sort((left, right) => left.siteId.localeCompare(right.siteId)))
  });
}

/**
 * All-or-nothing Wood catalog projection. Its availability sentinel is
 * independent: malformed Wood rows produce no Wood presentation only and can
 * never make an occupied Logging Camp look free.
 */
function readPublicWoodProjection(connection: WarpkeepConnection): Readonly<{
  sites: readonly WarpkeepWoodSite[];
  occupations: readonly WarpkeepWoodNodeOccupation[];
}> | undefined {
  if (woodProjectionAvailability.get(connection) !== WOOD_PROJECTION_READY) return undefined;
  const db = publicWoodTables(connection);
  if (!db) return undefined;
  const woodSiteTable = db.woodSiteV1;
  const woodOccupationTable = db.woodNodeOccupationV1;
  if (!woodSiteTable || !woodOccupationTable) return undefined;
  const sites: WarpkeepWoodSite[] = [];
  const siteIds = new Set<string>();
  for (const rawRow of woodSiteTable.iter()) {
    const row = asPublicWoodRow(rawRow);
    if (!row) return undefined;
    const site = {
      siteId: row.siteId,
      q: row.q,
      r: row.r,
      tier: row.tier,
      active: row.active
    };
    if (!isRealmWoodSitePublicRecord(site) || siteIds.has(site.siteId)) return undefined;
    siteIds.add(site.siteId);
    sites.push(Object.freeze({ ...site }));
  }
  const occupations: WarpkeepWoodNodeOccupation[] = [];
  const occupiedSiteIds = new Set<string>();
  for (const rawRow of woodOccupationTable.iter()) {
    const row = asPublicWoodRow(rawRow);
    if (!row) return undefined;
    const occupation = {
      siteId: row.siteId,
      originCastleId: toSafeNumber(row.originCastleId as bigint | number | undefined),
      phase: row.phase,
      startedAtMicros: row.startedAtMicros,
      arrivesAtMicros: row.arrivesAtMicros,
      gatheringEndsAtMicros: row.gatheringEndsAtMicros,
      returnsAtMicros: row.returnsAtMicros
    };
    if (!isRealmWoodNodeOccupationPublicRecord(occupation) || occupiedSiteIds.has(occupation.siteId)) {
      return undefined;
    }
    occupiedSiteIds.add(occupation.siteId);
    occupations.push(Object.freeze({ ...occupation }));
  }
  return Object.freeze({
    sites: Object.freeze(sites.sort((left, right) => left.siteId.localeCompare(right.siteId))),
    occupations: Object.freeze(occupations.sort((left, right) => left.siteId.localeCompare(right.siteId)))
  });
}

type PublicForestProjection = Readonly<{
  /** `undefined`/an array here intentionally means present-but-invalid. */
  layout: unknown;
  /** Always present once the paired forest subscription has applied. */
  trees: readonly unknown[];
}>;

const INVALID_PUBLIC_FOREST_PROJECTION: PublicForestProjection = Object.freeze({
  layout: undefined,
  trees: Object.freeze([])
});

/**
 * Read the paired public forest tables as a single visual projection. Unlike
 * the Gold catalog, malformed data is forwarded as present-invalid so the
 * policy layer can distinguish it from an old deployment without forest
 * tables. It can therefore never activate the DEV-only legacy fallback.
 */
function readPublicForestProjection(
  connection: WarpkeepConnection
): PublicForestProjection | undefined {
  if (forestProjectionAvailability.get(connection) !== FOREST_PROJECTION_READY) return undefined;
  const db = publicForestTables(connection);
  if (!db) return undefined;
  const layoutTable = db.realmForestLayoutV1;
  const treeTable = db.realmForestInstanceV1;
  if (typeof layoutTable?.iter !== 'function' || typeof treeTable?.iter !== 'function') {
    return INVALID_PUBLIC_FOREST_PROJECTION;
  }

  const layoutRows = Object.freeze([...layoutTable.iter()].map(publicForestLayoutRecord));
  const trees = Object.freeze([...treeTable.iter()].map(publicForestTreeRecord));
  // The renderer accepts exactly one metadata row and the exact canonical
  // instance count. Zero/multiple metadata rows stay as an explicit invalid
  // value instead of silently looking like a pre-v6 unavailable projection.
  const layout = layoutRows.length === 1 ? layoutRows[0] : layoutRows;
  return Object.freeze({ layout, trees });
}

export function readWarpkeepRealmSnapshot(
  connection: WarpkeepConnection,
  ownFid: number
): WarpkeepRealmSnapshot {
  const castles = readCastles(connection);
  const ownCastle = castles.find((castle) => castle.ownerFid === ownFid);
  const publicGold = readPublicGoldProjection(connection);
  const publicFood = readPublicFoodProjection(connection);
  const publicWood = readPublicWoodProjection(connection);
  const publicForest = readPublicForestProjection(connection);
  const candidate: WarpkeepRealmSnapshotCandidate = {
    tiles: readWorldTiles(connection),
    tileMetadata: readWorldTileMetadata(connection),
    players: readPlayers(connection),
    profiles: readRealmProfiles(connection),
    castles,
    activeRealms: readActiveRealms(connection),
    ...(publicGold === undefined ? {} : {
      goldSites: publicGold.sites,
      goldNodeOccupations: publicGold.occupations
    }),
    ...(publicFood === undefined ? {} : {
      foodSites: publicFood.sites,
      foodNodeOccupations: publicFood.occupations
    }),
    ...(publicWood === undefined ? {} : {
      woodSites: publicWood.sites,
      woodNodeOccupations: publicWood.occupations
    }),
    ...(publicForest === undefined ? {} : {
      forestLayout: publicForest.layout,
      forestTrees: publicForest.trees
    }),
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
  const goldTables = publicGoldTables(connection);
  goldTables?.goldSiteV1?.onInsert?.(sync);
  goldTables?.goldSiteV1?.onDelete?.(sync);
  goldTables?.goldSiteV1?.onUpdate?.(sync);
  goldTables?.goldNodeOccupationV1?.onInsert?.(sync);
  goldTables?.goldNodeOccupationV1?.onDelete?.(sync);
  goldTables?.goldNodeOccupationV1?.onUpdate?.(sync);
  const foodTables = publicFoodTables(connection);
  foodTables?.foodSiteV1?.onInsert?.(sync);
  foodTables?.foodSiteV1?.onDelete?.(sync);
  foodTables?.foodSiteV1?.onUpdate?.(sync);
  foodTables?.foodNodeOccupationV1?.onInsert?.(sync);
  foodTables?.foodNodeOccupationV1?.onDelete?.(sync);
  foodTables?.foodNodeOccupationV1?.onUpdate?.(sync);
  const woodTables = publicWoodTables(connection);
  woodTables?.woodSiteV1?.onInsert?.(sync);
  woodTables?.woodSiteV1?.onDelete?.(sync);
  woodTables?.woodSiteV1?.onUpdate?.(sync);
  woodTables?.woodNodeOccupationV1?.onInsert?.(sync);
  woodTables?.woodNodeOccupationV1?.onDelete?.(sync);
  woodTables?.woodNodeOccupationV1?.onUpdate?.(sync);
  const forestTables = publicForestTables(connection);
  forestTables?.realmForestLayoutV1?.onInsert?.(sync);
  forestTables?.realmForestLayoutV1?.onDelete?.(sync);
  forestTables?.realmForestLayoutV1?.onUpdate?.(sync);
  forestTables?.realmForestInstanceV1?.onInsert?.(sync);
  forestTables?.realmForestInstanceV1?.onDelete?.(sync);
  forestTables?.realmForestInstanceV1?.onUpdate?.(sync);

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
    goldTables?.goldSiteV1?.removeOnInsert?.(sync);
    goldTables?.goldSiteV1?.removeOnDelete?.(sync);
    goldTables?.goldSiteV1?.removeOnUpdate?.(sync);
    goldTables?.goldNodeOccupationV1?.removeOnInsert?.(sync);
    goldTables?.goldNodeOccupationV1?.removeOnDelete?.(sync);
    goldTables?.goldNodeOccupationV1?.removeOnUpdate?.(sync);
    foodTables?.foodSiteV1?.removeOnInsert?.(sync);
    foodTables?.foodSiteV1?.removeOnDelete?.(sync);
    foodTables?.foodSiteV1?.removeOnUpdate?.(sync);
    foodTables?.foodNodeOccupationV1?.removeOnInsert?.(sync);
    foodTables?.foodNodeOccupationV1?.removeOnDelete?.(sync);
    foodTables?.foodNodeOccupationV1?.removeOnUpdate?.(sync);
    woodTables?.woodSiteV1?.removeOnInsert?.(sync);
    woodTables?.woodSiteV1?.removeOnDelete?.(sync);
    woodTables?.woodSiteV1?.removeOnUpdate?.(sync);
    woodTables?.woodNodeOccupationV1?.removeOnInsert?.(sync);
    woodTables?.woodNodeOccupationV1?.removeOnDelete?.(sync);
    woodTables?.woodNodeOccupationV1?.removeOnUpdate?.(sync);
    forestTables?.realmForestLayoutV1?.removeOnInsert?.(sync);
    forestTables?.realmForestLayoutV1?.removeOnDelete?.(sync);
    forestTables?.realmForestLayoutV1?.removeOnUpdate?.(sync);
    forestTables?.realmForestInstanceV1?.removeOnInsert?.(sync);
    forestTables?.realmForestInstanceV1?.removeOnDelete?.(sync);
    forestTables?.realmForestInstanceV1?.removeOnUpdate?.(sync);
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
