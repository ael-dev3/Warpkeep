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
  WarpkeepStoneNodeOccupation,
  WarpkeepStoneSite,
  WarpkeepGoldNodeOccupation,
  WarpkeepGoldSite,
  WarpkeepPlayer,
  WarpkeepRealm,
  WarpkeepRealmProfile,
  WarpkeepRealmSnapshot,
  WarpkeepRealmSnapshotCandidate,
  WarpkeepWaterBody,
  WarpkeepWaterCell,
  WarpkeepWaterLayout,
  WarpkeepWaterRevision,
  WarpkeepRealmEnvironment,
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
  decodeStoneExpeditionPresentation,
  type ReadyStoneExpeditionPresentation
} from '../components/realm/realmStoneExpeditionPresentation';
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
import {
  isRealmStoneNodeOccupationPublicRecord,
  isRealmStoneSitePublicRecord
} from '../components/realm/realmStoneNodePresentation';
import {
  decodeRealmWorkerOccupations,
  decodeRealmWorkerPublicRows,
  decodeRealmWorkerSystem,
  decodeWorkerResourceState,
  decodeWorkerRoster,
  type ReadyWorkerResourceState,
  type WorkerRosterPresentation
} from '../components/realm/realmWorkerPresentation';
import {
  REALM_FOOD_SITE_COUNT,
  REALM_GOLD_SITE_COUNT,
  REALM_WOOD_SITE_COUNT,
  REALM_STONE_SITE_COUNT,
  isCanonicalRealmFoodSiteCatalog,
  isCanonicalRealmGoldSiteCatalog,
  isCanonicalRealmWoodSiteCatalog,
  isCanonicalRealmStoneSiteCatalog
} from '../components/realm/realmResourceSiteCatalogPolicy';
import { GENESIS_FOREST_LAYOUT_V1_TREE_COUNT } from '../../spacetimedb/src/forestLayoutContract';
import { GENESIS_WATER_BODIES_V1, GENESIS_WATER_CELLS_V1 } from '../../spacetimedb/src/waterWorld';

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
const STONE_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const STONE_PROJECTION_PENDING = 'pending' as const;
const STONE_PROJECTION_READY = 'ready' as const;
type StoneProjectionAvailability =
  | typeof STONE_PROJECTION_UNAVAILABLE
  | typeof STONE_PROJECTION_PENDING
  | typeof STONE_PROJECTION_READY;
const stoneProjectionAvailability = new WeakMap<WarpkeepConnection, StoneProjectionAvailability>();
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
const WATER_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const WATER_PROJECTION_PENDING = 'pending' as const;
const WATER_PROJECTION_READY = 'ready' as const;
type WaterProjectionAvailability =
  | typeof WATER_PROJECTION_UNAVAILABLE
  | typeof WATER_PROJECTION_PENDING
  | typeof WATER_PROJECTION_READY;
const waterProjectionAvailability = new WeakMap<WarpkeepConnection, WaterProjectionAvailability>();
const WORKER_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const WORKER_PROJECTION_PENDING = 'pending' as const;
const WORKER_PROJECTION_READY = 'ready' as const;
type WorkerProjectionAvailability = typeof WORKER_PROJECTION_UNAVAILABLE | typeof WORKER_PROJECTION_PENDING | typeof WORKER_PROJECTION_READY;
const workerProjectionAvailability = new WeakMap<WarpkeepConnection, WorkerProjectionAvailability>();
const GOLD_SITE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const GOLD_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const FOOD_SITE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const FOOD_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const WOOD_SITE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const WOOD_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const STONE_SITE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const STONE_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const WORKER_ID_PATTERN = /^genesis-001-castle-[1-9][0-9]*-worker-0[1-4]$/;
const WORKER_IDEMPOTENCY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
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

/**
 * Authenticated, idempotent current-entry-agreement acknowledgement; callers
 * must retain the one-box gesture intent in memory only.
 */
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

/** Read the generic worker's caller-private roster; public rows never carry cargo. */
export async function readWarpkeepWorkerRoster(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<WorkerRosterPresentation | undefined> {
  if (!Number.isSafeInteger(ownFid) || ownFid <= 0) return undefined;
  const procedure = (connection.procedures as unknown as {
    getMyWorkerRosterV1?: (input: Readonly<Record<string, never>>) => Promise<unknown>;
  }).getMyWorkerRosterV1;
  if (typeof procedure !== 'function') return undefined;
  return decodeWorkerRoster(await procedure({}), BigInt(ownFid));
}

/** v2 balances are the only resource values consumed by the active worker rail. */
export async function readWarpkeepResourceStateV2(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<ReadyWorkerResourceState | undefined> {
  if (!Number.isSafeInteger(ownFid) || ownFid <= 0) return undefined;
  const procedure = (connection.procedures as unknown as {
    getMyResourceStateV2?: (input: Readonly<Record<string, never>>) => Promise<unknown>;
  }).getMyResourceStateV2;
  if (typeof procedure !== 'function') return undefined;
  return decodeWorkerResourceState(await procedure({}), BigInt(ownFid));
}

function workerReducerSurface(connection: WarpkeepConnection) {
  return connection.reducers as unknown as {
    dispatchWorkerV1?: (input: Readonly<{ workerId: string; resourceKind: string; siteId: string; idempotencyKey: string }>) => Promise<unknown> | unknown;
    recallWorkerV1?: (input: Readonly<{ workerId: string; idempotencyKey: string }>) => Promise<unknown> | unknown;
    recallAllWorkersV1?: (input: Readonly<{ idempotencyKey: string }>) => Promise<unknown> | unknown;
  };
}

function assertWorkerIdempotency(workerId: string, idempotencyKey: string) {
  if (!WORKER_ID_PATTERN.test(workerId) || !WORKER_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new Error('Worker command is unavailable.');
  }
}

export async function dispatchWarpkeepWorker(
  connection: WarpkeepConnection,
  workerId: string,
  resourceKind: string,
  siteId: string,
  idempotencyKey: string
) {
  assertWorkerIdempotency(workerId, idempotencyKey);
  if (!/^(food|wood|stone|gold)$/.test(resourceKind) || !/^[a-z0-9][a-z0-9:_-]{0,95}$/i.test(siteId)) {
    throw new Error('Worker command is unavailable.');
  }
  const reducer = workerReducerSurface(connection).dispatchWorkerV1;
  if (typeof reducer !== 'function') throw new Error('Worker command is unavailable.');
  await reducer({ workerId, resourceKind, siteId, idempotencyKey });
}

export async function recallWarpkeepWorker(connection: WarpkeepConnection, workerId: string, idempotencyKey: string) {
  assertWorkerIdempotency(workerId, idempotencyKey);
  const reducer = workerReducerSurface(connection).recallWorkerV1;
  if (typeof reducer !== 'function') throw new Error('Worker command is unavailable.');
  await reducer({ workerId, idempotencyKey });
}

export async function recallAllWarpkeepWorkers(connection: WarpkeepConnection, idempotencyKey: string) {
  if (!WORKER_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) throw new Error('Worker command is unavailable.');
  const reducer = workerReducerSurface(connection).recallAllWorkersV1;
  if (typeof reducer !== 'function') throw new Error('Worker command is unavailable.');
  await reducer({ idempotencyKey });
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

type StoneProcedureSurface = Readonly<{
  getMyStoneExpeditionStateV1?: (input: Readonly<Record<string, never>>) => Promise<unknown>;
}>;

type StoneReducerSurface = Readonly<{
  dispatchStoneExpeditionV1?: (input: Readonly<{
    siteId: string;
    idempotencyKey: string;
  }>) => Promise<unknown> | unknown;
  collectStoneExpeditionV1?: (input: Readonly<Record<string, never>>) => Promise<unknown> | unknown;
}>;

function stoneProcedureSurface(connection: WarpkeepConnection) {
  return connection.procedures as unknown as StoneProcedureSurface;
}

function stoneReducerSurface(connection: WarpkeepConnection) {
  return connection.reducers as unknown as StoneReducerSurface;
}

/** Stone is an independent additive capability, like Food and Wood. */
export async function readWarpkeepStoneExpeditionState(
  connection: WarpkeepConnection
): Promise<ReadyStoneExpeditionPresentation | undefined> {
  const procedure = stoneProcedureSurface(connection).getMyStoneExpeditionStateV1;
  if (typeof procedure !== 'function') return undefined;
  const raw = await procedure({});
  const decoded = decodeStoneExpeditionPresentation(raw);
  return decoded.status === 'ready' ? decoded : undefined;
}

function assertStoneExpeditionDispatchInput(siteId: string, idempotencyKey: string) {
  if (!STONE_SITE_ID_PATTERN.test(siteId) || !STONE_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new Error('Stone expedition is unavailable.');
  }
}

export async function dispatchWarpkeepStoneExpedition(
  connection: WarpkeepConnection,
  siteId: string,
  idempotencyKey: string
): Promise<ReadyStoneExpeditionPresentation | undefined> {
  assertStoneExpeditionDispatchInput(siteId, idempotencyKey);
  const reducer = stoneReducerSurface(connection).dispatchStoneExpeditionV1;
  if (typeof reducer !== 'function') throw new Error('Stone expedition is unavailable.');
  await reducer({ siteId, idempotencyKey });
  return readWarpkeepStoneExpeditionState(connection);
}

export async function collectWarpkeepStoneExpedition(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<Readonly<{
  resources: ReadyRealmResourcePresentation;
  stoneExpedition: ReadyStoneExpeditionPresentation | undefined;
}>> {
  const reducer = stoneReducerSurface(connection).collectStoneExpeditionV1;
  if (typeof reducer !== 'function') throw new Error('Stone expedition is unavailable.');
  await reducer({});
  const [resources, stoneExpedition] = await Promise.all([
    readWarpkeepResourceState(connection, ownFid),
    readWarpkeepStoneExpeditionState(connection)
  ]);
  return Object.freeze({ resources, stoneExpedition });
}

/**
 * Start the protocol-v3 core shared-state subscription and additive public
 * Gold/Food/Wood/Stone/forest subscriptions. The scheduler, forest seeding reducer, and every
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
  stoneProjectionAvailability.set(connection, STONE_PROJECTION_PENDING);
  forestProjectionAvailability.set(connection, FOREST_PROJECTION_PENDING);
  waterProjectionAvailability.set(connection, WATER_PROJECTION_PENDING);
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

  let stoneSubscription: SubscriptionHandle | undefined;
  const stoneTables = publicStoneTables(connection);
  const stoneBindings = publicStoneSubscriptionTables();
  if (stoneTables !== undefined && stoneBindings !== undefined) {
    try {
      stoneSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          stoneProjectionAvailability.set(connection, STONE_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          stoneProjectionAvailability.set(connection, STONE_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe([
          stoneBindings.stoneSiteV1,
          stoneBindings.stoneNodeOccupationV1
        ]);
    } catch {
      stoneProjectionAvailability.set(connection, STONE_PROJECTION_UNAVAILABLE);
      if (coreApplied) onApplied();
    }
  } else {
    stoneProjectionAvailability.set(connection, STONE_PROJECTION_UNAVAILABLE);
  }

  let workerSubscription: SubscriptionHandle | undefined;
  const workerTables = publicWorkerTables(connection);
  if (workerTables !== undefined) {
    try {
      workerSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          workerProjectionAvailability.set(connection, WORKER_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          workerProjectionAvailability.set(connection, WORKER_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe([
          tables.realmWorkerSystemV1,
          tables.castleWorkerV1,
          tables.workerNodeOccupationV1
        ]);
    } catch {
      workerProjectionAvailability.set(connection, WORKER_PROJECTION_UNAVAILABLE);
      if (coreApplied) onApplied();
    }
  } else {
    workerProjectionAvailability.set(connection, WORKER_PROJECTION_UNAVAILABLE);
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

  let waterSubscription: SubscriptionHandle | undefined;
  const waterTables = publicWaterTables(connection);
  // Water is a single atomic public projection. A missing or older schema
  // leaves the conservative terrain/sky fallback active; it never invents a
  // shoreline from browser-local coordinates.
  if (waterTables !== undefined) {
    try {
      const waterSubscriptionTables = [
        tables.realmWaterLayoutV1,
        tables.realmWaterBodyV1,
        tables.realmWaterCellV1,
        tables.realmEnvironmentV1,
        ...(waterTables.realmWaterRevisionV1 === undefined
          ? []
          : [tables.realmWaterRevisionV1])
      ];
      waterSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          waterProjectionAvailability.set(connection, WATER_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          waterProjectionAvailability.set(connection, WATER_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe(waterSubscriptionTables);
    } catch {
      waterProjectionAvailability.set(connection, WATER_PROJECTION_UNAVAILABLE);
      if (coreApplied) onApplied();
    }
  } else {
    waterProjectionAvailability.set(connection, WATER_PROJECTION_UNAVAILABLE);
  }

  return Object.freeze({
    unsubscribe: () => {
      goldProjectionAvailability.delete(connection);
      foodProjectionAvailability.delete(connection);
      woodProjectionAvailability.delete(connection);
      stoneProjectionAvailability.delete(connection);
      workerProjectionAvailability.delete(connection);
      forestProjectionAvailability.delete(connection);
      waterProjectionAvailability.delete(connection);
      try {
        try {
          try {
            goldSubscription?.unsubscribe();
          } finally {
            try {
              foodSubscription?.unsubscribe();
            } finally {
              try {
                woodSubscription?.unsubscribe();
              } finally {
                try {
                  stoneSubscription?.unsubscribe();
                } finally {
                  workerSubscription?.unsubscribe();
                }
              }
            }
          }
        } finally {
          try {
            forestSubscription?.unsubscribe();
          } finally {
            waterSubscription?.unsubscribe();
          }
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

type PublicStoneTableRow = Readonly<Record<string, unknown>>;

function asPublicStoneRow(value: unknown): PublicStoneTableRow | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as PublicStoneTableRow
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

type PublicWaterTable = PublicForestTable;

function publicWaterTables(connection: WarpkeepConnection) {
  const db = connection.db as unknown as Readonly<{
    realmWaterLayoutV1?: PublicWaterTable;
    realmWaterBodyV1?: PublicWaterTable;
    realmWaterCellV1?: PublicWaterTable;
    realmEnvironmentV1?: PublicWaterTable;
    realmWaterRevisionV1?: PublicWaterTable;
  }> | undefined;
  if (
    !db?.realmWaterLayoutV1
    || !db.realmWaterBodyV1
    || !db.realmWaterCellV1
    || !db.realmEnvironmentV1
  ) return undefined;
  return db;
}

function publicWaterLayoutRecord(value: unknown): unknown {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
  if (!row) return Object.freeze({});
  return Object.freeze({
    realmId: row.realmId,
    layoutVersion: row.layoutVersion,
    policyVersion: row.policyVersion,
    generationVersion: row.generationVersion,
    canonicalLandCellCount: row.canonicalLandCellCount,
    oceanCellCount: row.oceanCellCount,
    lakeCellCount: row.lakeCellCount,
    lakeBodyCount: row.lakeBodyCount,
    riverCount: row.riverCount,
    riverCellCount: row.riverCellCount,
    seaLevelMilli: row.seaLevelMilli,
    seaLevelPolicyVersion: row.seaLevelPolicyVersion,
    fogStartDepthCells: row.fogStartDepthCells,
    fogFullDepthCells: row.fogFullDepthCells,
    hiddenBufferCells: row.hiddenBufferCells,
    layoutDigest: row.layoutDigest,
    sourceCommit: row.sourceCommit,
    activated: row.activated
  }) as Partial<WarpkeepWaterLayout>;
}

function publicWaterBodyRecord(value: unknown): unknown {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
  if (!row) return Object.freeze({});
  return Object.freeze({
    bodyId: row.bodyId,
    realmId: row.realmId,
    regime: row.regime,
    cellCount: row.cellCount,
    sourceCellKey: row.sourceCellKey,
    mouthCellKey: row.mouthCellKey,
    surfaceLevelMilli: row.surfaceLevelMilli,
    // SpacetimeDB's generated camel-case form lowers the acronym in Q15.
    // Keep that wire spelling confined to this adapter; Realm presentation
    // continues to use the reviewed domain-field names.
    flowDirectionXQ15: row.flowDirectionXq15,
    flowDirectionZQ15: row.flowDirectionZq15,
    wavePreset: row.wavePreset,
    ordinal: row.ordinal,
    seed: row.seed,
    generationVersion: row.generationVersion,
    layoutVersion: row.layoutVersion
  }) as Partial<WarpkeepWaterBody>;
}

function publicWaterCellRecord(value: unknown): unknown {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
  if (!row) return Object.freeze({});
  return Object.freeze({
    cellKey: row.cellKey,
    realmId: row.realmId,
    q: row.q,
    r: row.r,
    regime: row.regime,
    bodyId: row.bodyId,
    depthCells: row.depthCells,
    elevationMilli: row.elevationMilli,
    surfaceLevelMilli: row.surfaceLevelMilli,
    ring: row.ring,
    s: row.s,
    underlyingTileKey: row.underlyingTileKey,
    riverOrdinal: row.riverOrdinal,
    riverOrder: row.riverOrder,
    downstreamWaterCellKey: row.downstreamWaterCellKey,
    flowAccumulation: row.flowAccumulation,
    depthClass: row.depthClass,
    oceanDepth: row.oceanDepth,
    bankSeed: row.bankSeed,
    generationVersion: row.generationVersion,
    fogBand: row.fogBand,
    layoutVersion: row.layoutVersion
  }) as Partial<WarpkeepWaterCell>;
}

function publicRealmEnvironmentRecord(value: unknown): unknown {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
  if (!row) return Object.freeze({});
  return Object.freeze({
    realmId: row.realmId,
    environmentEpoch: row.environmentEpoch,
    waterLayoutVersion: row.waterLayoutVersion,
    seaLevelMilli: row.seaLevelMilli,
    sunDirectionXMicro: row.sunDirectionXMicro,
    sunDirectionYMicro: row.sunDirectionYMicro,
    sunDirectionZMicro: row.sunDirectionZMicro,
    updatedAt: row.updatedAt
  }) as Partial<WarpkeepRealmEnvironment>;
}

function publicWaterRevisionRecord(value: unknown): unknown {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
  if (!row) return Object.freeze({});
  return Object.freeze({
    realmId: row.realmId,
    revisionVersion: row.revisionVersion,
    policyVersion: row.policyVersion,
    baseLayoutVersion: row.baseLayoutVersion,
    baseLayoutDigest: row.baseLayoutDigest,
    oceanBodyCount: row.oceanBodyCount,
    riverBodyCount: row.riverBodyCount,
    enabledBodyCount: row.enabledBodyCount,
    oceanCellCount: row.oceanCellCount,
    riverCellCount: row.riverCellCount,
    enabledCellCount: row.enabledCellCount,
    lakeBodyCount: row.lakeBodyCount,
    lakeCellCount: row.lakeCellCount,
    riverWidthCells: row.riverWidthCells,
    navigationFogBoundaryDepthCells: row.navigationFogBoundaryDepthCells,
    hiddenBufferCells: row.hiddenBufferCells,
    revisionDigest: row.revisionDigest,
    sourceCommit: row.sourceCommit,
    activated: row.activated
  }) as Partial<WarpkeepWaterRevision>;
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

function publicStoneTables(connection: WarpkeepConnection) {
  const db = connection.db as unknown as Readonly<{
    stoneSiteV1?: PublicFoodTable;
    stoneNodeOccupationV1?: PublicFoodTable;
  }> | undefined;
  if (!db?.stoneSiteV1 || !db.stoneNodeOccupationV1) return undefined;
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
 * Stone has canonical player bindings. A pre-v10 server fails only this paired
 * subscription, leaving the core, Gold, Food, and Wood projections live.
 */
function publicStoneSubscriptionTables() {
  return Object.freeze({
    stoneSiteV1: tables.stoneSiteV1,
    stoneNodeOccupationV1: tables.stoneNodeOccupationV1
  });
}

type PublicWorkerTable = PublicFoodTable;
function publicWorkerTables(connection: WarpkeepConnection) {
  const db = connection.db as unknown as Readonly<{
    realmWorkerSystemV1?: PublicWorkerTable;
    castleWorkerV1?: PublicWorkerTable;
    workerNodeOccupationV1?: PublicWorkerTable;
  }> | undefined;
  if (!db?.realmWorkerSystemV1 || !db.castleWorkerV1 || !db.workerNodeOccupationV1) return undefined;
  return db;
}

function publicWorkerRecord(value: unknown): unknown {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
  if (!row) return Object.freeze({});
  return Object.freeze({
    workerId: row.workerId,
    originCastleId: row.originCastleId,
    ordinal: row.ordinal,
    status: row.status,
    resourceKind: row.resourceKind,
    siteId: row.siteId,
    startedAtMicros: row.startedAtMicros,
    arrivesAtMicros: row.arrivesAtMicros,
    gatheringEndsAtMicros: row.gatheringEndsAtMicros,
    returnStartedAtMicros: row.returnStartedAtMicros,
    returnsAtMicros: row.returnsAtMicros,
    routeSteps: row.routeSteps,
    returnStartProgressBasisPoints: row.returnStartProgressBasisPoints,
    timelineRevision: row.timelineRevision,
    revision: row.revision
  });
}

function publicWorkerOccupationRecord(value: unknown): unknown {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
  if (!row) return Object.freeze({});
  return Object.freeze({
    nodeKey: row.nodeKey,
    resourceKind: row.resourceKind,
    siteId: row.siteId,
    workerId: row.workerId,
    workerOrdinal: row.workerOrdinal,
    originCastleId: row.originCastleId,
    phase: row.phase,
    startedAtMicros: row.startedAtMicros,
    arrivesAtMicros: row.arrivesAtMicros,
    gatheringEndsAtMicros: row.gatheringEndsAtMicros,
    timelineRevision: row.timelineRevision
  });
}

function readPublicWorkerProjection(
  connection: WarpkeepConnection,
  castles: readonly WarpkeepCastle[],
  ownCastleId: number
) {
  if (workerProjectionAvailability.get(connection) !== WORKER_PROJECTION_READY) return undefined;
  const db = publicWorkerTables(connection);
  if (!db) return undefined;
  const systems = readBoundedPublicForestRows(
    db.realmWorkerSystemV1!.iter(),
    1,
    (value) => value
  );
  if (systems?.length !== 1) return undefined;
  const system = decodeRealmWorkerSystem(systems[0]);
  const castleNames = new Map(castles.map((castle) => [castle.castleId, castle.name] as const));
  const rawWorkers = readBoundedPublicForestRows(
    db.castleWorkerV1!.iter(),
    castles.length * 4,
    publicWorkerRecord
  );
  if (rawWorkers === undefined) return undefined;
  const workers = decodeRealmWorkerPublicRows(
    rawWorkers,
    castleNames,
    ownCastleId
  );
  const rawOccupations = readBoundedPublicForestRows(
    db.workerNodeOccupationV1!.iter(),
    castles.length * 4,
    publicWorkerOccupationRecord
  );
  if (rawOccupations === undefined) return undefined;
  const occupations = decodeRealmWorkerOccupations(
    rawOccupations
  );
  if (!system || !workers || !occupations) return undefined;
  return Object.freeze({ system, workers, occupations });
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
    if (sites.length === REALM_GOLD_SITE_COUNT) return undefined;
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
  if (!isCanonicalRealmGoldSiteCatalog(sites)) return undefined;

  const occupations: WarpkeepGoldNodeOccupation[] = [];
  const occupiedSiteIds = new Set<string>();
  for (const rawRow of goldOccupationTable.iter()) {
    if (occupations.length === REALM_GOLD_SITE_COUNT) return undefined;
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
    if (sites.length === REALM_FOOD_SITE_COUNT) return undefined;
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
  if (!isCanonicalRealmFoodSiteCatalog(sites)) return undefined;
  const occupations: WarpkeepFoodNodeOccupation[] = [];
  const occupiedSiteIds = new Set<string>();
  for (const rawRow of foodOccupationTable.iter()) {
    if (occupations.length === REALM_FOOD_SITE_COUNT) return undefined;
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
    if (sites.length === REALM_WOOD_SITE_COUNT) return undefined;
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
  if (!isCanonicalRealmWoodSiteCatalog(sites)) return undefined;
  const occupations: WarpkeepWoodNodeOccupation[] = [];
  const occupiedSiteIds = new Set<string>();
  for (const rawRow of woodOccupationTable.iter()) {
    if (occupations.length === REALM_WOOD_SITE_COUNT) return undefined;
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

/** All-or-nothing Stone Quarry catalog projection. */
function readPublicStoneProjection(connection: WarpkeepConnection): Readonly<{
  sites: readonly WarpkeepStoneSite[];
  occupations: readonly WarpkeepStoneNodeOccupation[];
}> | undefined {
  if (stoneProjectionAvailability.get(connection) !== STONE_PROJECTION_READY) return undefined;
  const db = publicStoneTables(connection);
  if (!db) return undefined;
  const stoneSiteTable = db.stoneSiteV1;
  const stoneOccupationTable = db.stoneNodeOccupationV1;
  if (!stoneSiteTable || !stoneOccupationTable) return undefined;
  const sites: WarpkeepStoneSite[] = [];
  const siteIds = new Set<string>();
  for (const rawRow of stoneSiteTable.iter()) {
    if (sites.length === REALM_STONE_SITE_COUNT) return undefined;
    const row = asPublicStoneRow(rawRow);
    if (!row) return undefined;
    const site = {
      siteId: row.siteId,
      q: row.q,
      r: row.r,
      tier: row.tier,
      active: row.active
    };
    if (!isRealmStoneSitePublicRecord(site) || siteIds.has(site.siteId)) return undefined;
    siteIds.add(site.siteId);
    sites.push(Object.freeze({ ...site }));
  }
  if (!isCanonicalRealmStoneSiteCatalog(sites)) return undefined;
  const occupations: WarpkeepStoneNodeOccupation[] = [];
  const occupiedSiteIds = new Set<string>();
  for (const rawRow of stoneOccupationTable.iter()) {
    if (occupations.length === REALM_STONE_SITE_COUNT) return undefined;
    const row = asPublicStoneRow(rawRow);
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
    if (!isRealmStoneNodeOccupationPublicRecord(occupation) || occupiedSiteIds.has(occupation.siteId)) {
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
 * Read no more than one overflow sentinel from an untrusted public iterator.
 * A malformed subscription must not force the browser to allocate or sort an
 * attacker-sized projection before exact forest cardinality is checked.
 */
function readBoundedPublicForestRows(
  iterable: Iterable<unknown>,
  expectedCount: number,
  project: (value: unknown) => unknown
): readonly unknown[] | undefined {
  const rows: unknown[] = [];
  for (const value of iterable) {
    if (rows.length === expectedCount) return undefined;
    rows.push(project(value));
  }
  return Object.freeze(rows);
}

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

  const layoutRows = readBoundedPublicForestRows(
    layoutTable.iter(),
    1,
    publicForestLayoutRecord
  );
  if (layoutRows === undefined) return INVALID_PUBLIC_FOREST_PROJECTION;
  const trees = readBoundedPublicForestRows(
    treeTable.iter(),
    GENESIS_FOREST_LAYOUT_V1_TREE_COUNT,
    publicForestTreeRecord
  );
  if (trees === undefined) return INVALID_PUBLIC_FOREST_PROJECTION;
  // The renderer accepts exactly one metadata row and the exact canonical
  // instance count. Zero/multiple metadata rows stay as an explicit invalid
  // value instead of silently looking like a pre-v6 unavailable projection.
  const layout = layoutRows.length === 1 ? layoutRows[0] : layoutRows;
  return Object.freeze({ layout, trees });
}

type PublicWaterProjection = Readonly<{
  layout: unknown;
  bodies: readonly unknown[];
  cells: readonly unknown[];
  realmEnvironment: unknown;
  waterRevision?: unknown;
}>;

function readPublicWaterProjection(
  connection: WarpkeepConnection
): PublicWaterProjection | undefined {
  if (waterProjectionAvailability.get(connection) !== WATER_PROJECTION_READY) return undefined;
  const db = publicWaterTables(connection);
  if (!db) return undefined;
  const layoutRows = readBoundedPublicForestRows(db.realmWaterLayoutV1!.iter!(), 1, publicWaterLayoutRecord);
  const bodies = readBoundedPublicForestRows(
    db.realmWaterBodyV1!.iter!(),
    GENESIS_WATER_BODIES_V1.length,
    publicWaterBodyRecord
  );
  const cells = readBoundedPublicForestRows(
    db.realmWaterCellV1!.iter!(),
    GENESIS_WATER_CELLS_V1.length,
    publicWaterCellRecord
  );
  const environmentRows = readBoundedPublicForestRows(
    db.realmEnvironmentV1!.iter!(),
    1,
    publicRealmEnvironmentRecord
  );
  let waterRevision: unknown;
  if (db.realmWaterRevisionV1 !== undefined) {
    const revisionRows = typeof db.realmWaterRevisionV1.iter === 'function'
      ? readBoundedPublicForestRows(
        db.realmWaterRevisionV1.iter(),
        1,
        publicWaterRevisionRecord
      )
      : undefined;
    waterRevision = revisionRows === undefined || revisionRows.length > 1
      ? Object.freeze({})
      : revisionRows[0];
  }
  if (
    layoutRows === undefined
    || bodies === undefined
    || cells === undefined
    || environmentRows === undefined
  ) {
    return Object.freeze({
      layout: Object.freeze({}),
      bodies: Object.freeze([]),
      cells: Object.freeze([]),
      realmEnvironment: Object.freeze({}),
      ...(waterRevision === undefined ? {} : { waterRevision })
    });
  }
  return Object.freeze({
    layout: layoutRows.length === 1 ? layoutRows[0] : layoutRows,
    bodies,
    cells,
    realmEnvironment: environmentRows.length === 1 ? environmentRows[0] : environmentRows,
    ...(waterRevision === undefined ? {} : { waterRevision })
  });
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
  const publicStone = readPublicStoneProjection(connection);
  const publicForest = readPublicForestProjection(connection);
  const publicWater = readPublicWaterProjection(connection);
  const publicWorkers = ownCastle === undefined
    ? undefined
    : readPublicWorkerProjection(connection, castles, ownCastle.castleId);
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
    ...(publicStone === undefined ? {} : {
      stoneSites: publicStone.sites,
      stoneNodeOccupations: publicStone.occupations
    }),
    ...(publicForest === undefined ? {} : {
      forestLayout: publicForest.layout,
      forestTrees: publicForest.trees
    }),
    ...(publicWater === undefined ? {} : {
      waterLayout: publicWater.layout,
      waterBodies: publicWater.bodies,
      waterCells: publicWater.cells,
      realmEnvironment: publicWater.realmEnvironment,
      ...(publicWater.waterRevision === undefined ? {} : {
        waterRevision: publicWater.waterRevision
      })
    }),
    ...(publicWorkers === undefined ? {} : {
      workerSystem: publicWorkers.system,
      workerWorkers: publicWorkers.workers,
      workerOccupations: publicWorkers.occupations
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
  const stoneTables = publicStoneTables(connection);
  stoneTables?.stoneSiteV1?.onInsert?.(sync);
  stoneTables?.stoneSiteV1?.onDelete?.(sync);
  stoneTables?.stoneSiteV1?.onUpdate?.(sync);
  stoneTables?.stoneNodeOccupationV1?.onInsert?.(sync);
  stoneTables?.stoneNodeOccupationV1?.onDelete?.(sync);
  stoneTables?.stoneNodeOccupationV1?.onUpdate?.(sync);
  const workerTables = publicWorkerTables(connection);
  workerTables?.realmWorkerSystemV1?.onInsert?.(sync);
  workerTables?.realmWorkerSystemV1?.onDelete?.(sync);
  workerTables?.realmWorkerSystemV1?.onUpdate?.(sync);
  workerTables?.castleWorkerV1?.onInsert?.(sync);
  workerTables?.castleWorkerV1?.onDelete?.(sync);
  workerTables?.castleWorkerV1?.onUpdate?.(sync);
  workerTables?.workerNodeOccupationV1?.onInsert?.(sync);
  workerTables?.workerNodeOccupationV1?.onDelete?.(sync);
  workerTables?.workerNodeOccupationV1?.onUpdate?.(sync);
  const forestTables = publicForestTables(connection);
  forestTables?.realmForestLayoutV1?.onInsert?.(sync);
  forestTables?.realmForestLayoutV1?.onDelete?.(sync);
  forestTables?.realmForestLayoutV1?.onUpdate?.(sync);
  forestTables?.realmForestInstanceV1?.onInsert?.(sync);
  forestTables?.realmForestInstanceV1?.onDelete?.(sync);
  forestTables?.realmForestInstanceV1?.onUpdate?.(sync);
  const waterTables = publicWaterTables(connection);
  waterTables?.realmWaterLayoutV1?.onInsert?.(sync);
  waterTables?.realmWaterLayoutV1?.onDelete?.(sync);
  waterTables?.realmWaterLayoutV1?.onUpdate?.(sync);
  waterTables?.realmWaterBodyV1?.onInsert?.(sync);
  waterTables?.realmWaterBodyV1?.onDelete?.(sync);
  waterTables?.realmWaterBodyV1?.onUpdate?.(sync);
  waterTables?.realmWaterCellV1?.onInsert?.(sync);
  waterTables?.realmWaterCellV1?.onDelete?.(sync);
  waterTables?.realmWaterCellV1?.onUpdate?.(sync);
  waterTables?.realmEnvironmentV1?.onInsert?.(sync);
  waterTables?.realmEnvironmentV1?.onDelete?.(sync);
  waterTables?.realmEnvironmentV1?.onUpdate?.(sync);
  waterTables?.realmWaterRevisionV1?.onInsert?.(sync);
  waterTables?.realmWaterRevisionV1?.onDelete?.(sync);
  waterTables?.realmWaterRevisionV1?.onUpdate?.(sync);

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
    stoneTables?.stoneSiteV1?.removeOnInsert?.(sync);
    stoneTables?.stoneSiteV1?.removeOnDelete?.(sync);
    stoneTables?.stoneSiteV1?.removeOnUpdate?.(sync);
    stoneTables?.stoneNodeOccupationV1?.removeOnInsert?.(sync);
    stoneTables?.stoneNodeOccupationV1?.removeOnDelete?.(sync);
    stoneTables?.stoneNodeOccupationV1?.removeOnUpdate?.(sync);
    workerTables?.realmWorkerSystemV1?.removeOnInsert?.(sync);
    workerTables?.realmWorkerSystemV1?.removeOnDelete?.(sync);
    workerTables?.realmWorkerSystemV1?.removeOnUpdate?.(sync);
    workerTables?.castleWorkerV1?.removeOnInsert?.(sync);
    workerTables?.castleWorkerV1?.removeOnDelete?.(sync);
    workerTables?.castleWorkerV1?.removeOnUpdate?.(sync);
    workerTables?.workerNodeOccupationV1?.removeOnInsert?.(sync);
    workerTables?.workerNodeOccupationV1?.removeOnDelete?.(sync);
    workerTables?.workerNodeOccupationV1?.removeOnUpdate?.(sync);
    forestTables?.realmForestLayoutV1?.removeOnInsert?.(sync);
    forestTables?.realmForestLayoutV1?.removeOnDelete?.(sync);
    forestTables?.realmForestLayoutV1?.removeOnUpdate?.(sync);
    forestTables?.realmForestInstanceV1?.removeOnInsert?.(sync);
    forestTables?.realmForestInstanceV1?.removeOnDelete?.(sync);
    forestTables?.realmForestInstanceV1?.removeOnUpdate?.(sync);
    waterTables?.realmWaterLayoutV1?.removeOnInsert?.(sync);
    waterTables?.realmWaterLayoutV1?.removeOnDelete?.(sync);
    waterTables?.realmWaterLayoutV1?.removeOnUpdate?.(sync);
    waterTables?.realmWaterBodyV1?.removeOnInsert?.(sync);
    waterTables?.realmWaterBodyV1?.removeOnDelete?.(sync);
    waterTables?.realmWaterBodyV1?.removeOnUpdate?.(sync);
    waterTables?.realmWaterCellV1?.removeOnInsert?.(sync);
    waterTables?.realmWaterCellV1?.removeOnDelete?.(sync);
    waterTables?.realmWaterCellV1?.removeOnUpdate?.(sync);
    waterTables?.realmEnvironmentV1?.removeOnInsert?.(sync);
    waterTables?.realmEnvironmentV1?.removeOnDelete?.(sync);
    waterTables?.realmEnvironmentV1?.removeOnUpdate?.(sync);
    waterTables?.realmWaterRevisionV1?.removeOnInsert?.(sync);
    waterTables?.realmWaterRevisionV1?.removeOnDelete?.(sync);
    waterTables?.realmWaterRevisionV1?.removeOnUpdate?.(sync);
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
