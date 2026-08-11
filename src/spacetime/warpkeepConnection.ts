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
  WarpkeepRealmContinuityProjection,
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
import {
  isCanonicalGenesisSnapshot,
  validateCanonicalGenesisSnapshot
} from './canonicalGenesisSnapshot';
import {
  matchesCanonicalRealm,
  matchesGenerationV2Realm
} from '../../spacetimedb/src/world';
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
  type ReadyRealmResourcePresentation,
  type RealmEconomicResourceKey
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
  decodeWorkerControlState,
  decodeWorkerResourceState,
  decodeWorkerRoster,
  type WorkerControlStateDecodeResult,
  type ReadyWorkerResourceState,
  type WorkerRosterPresentation
} from '../components/realm/realmWorkerPresentation';
import {
  decodeGreaterRealmWorkerControlState,
  type GreaterRealmWorkerControlDecodeResult
} from '../greater-realm/greaterRealmWorkerControl';
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
import {
  decodeInnerKeepPrivateState,
  decodeInnerKeepRequestStatus,
  resolveReadyInnerKeepProjection,
  type InnerKeepBuildingCatalogRow,
  type InnerKeepBuildingRow,
  type InnerKeepBuildLevelRow,
  type InnerKeepLayoutRow,
  type InnerKeepPublicRows,
  type InnerKeepReadScope,
  type InnerKeepSlotRow,
  type ReadyInnerKeepProjection
} from './innerKeepProjection';
import {
  INNER_KEEP_REQUEST_KEY_PATTERN,
  type InnerKeepCommandAttempt,
  type InnerKeepRequestReceipt
} from './innerKeepCommandIdempotency';
import {
  INNER_KEEP_PROJECT_REVISION_MAX,
  innerKeepPlacementTransformIntegrity,
  type InnerKeepPlacementTransform,
  isInnerKeepBuildingKind
} from '../components/inner-keep/innerKeepPresentation';
import { INNER_KEEP_POLICY_DIGEST } from '../../spacetimedb/src/innerKeepPolicy';
import { INNER_KEEP_LAYOUT_V1_DIGEST } from '../components/inner-keep/innerKeepLayoutV1';
import {
  decodeRealmChatHistoryPage,
  decodeRealmChatRecentPage,
  decodeRealmChatStatusProjection,
  type RealmChatHistoryPagePresentation,
  type RealmChatRecentPagePresentation,
  type RealmChatPresentation
} from './realmChatPresentation';
import {
  GREATER_REALM_PUBLIC_PROCEDURES,
  type GreaterRealmProcedureInvoker
} from '../greater-realm/greaterRealmTransport';

export type WarpkeepConnectionFailureReason =
  | 'handshake_timeout'
  | 'token_exchange_unauthorized'
  | 'token_exchange_forbidden'
  | 'token_exchange_unavailable'
  | 'token_exchange_failed'
  | 'transport_failed'
  | 'setup_failed';

export type WarpkeepConnectionCallbacks = Readonly<{
  onDisconnected?: () => void;
  /** Privacy-safe failure class only; raw transport errors and credentials stay internal. */
  onConnectionFailure?: (reason: WarpkeepConnectionFailureReason) => void;
}>;

export type WarpkeepConnection = DbConnection;

export type WarpkeepGreaterRealmConnectionAuthority = Readonly<{
  /** Monotonic provider-owned socket generation; never sourced from the server. */
  generation: number;
  /** The verified caller on the exact authenticated socket generation. */
  fid: number;
  /** Rechecked before invocation and after every procedure result. */
  isCurrent: () => boolean;
}>;

/**
 * Core Realm data remains available while additive feature projections are
 * applying or unavailable on an older deployment. Every handle is still
 * released as one lifecycle unit.
 */
export type WarpkeepRealmSubscription = Readonly<{
  unsubscribe: () => void;
}>;

/** Chat remains a separate small subscription so messages never rebuild the world snapshot. */
export type WarpkeepRealmChatSubscription = Readonly<{
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
const INNER_KEEP_PROJECTION_UNAVAILABLE = 'unavailable' as const;
const INNER_KEEP_PROJECTION_PENDING = 'pending' as const;
const INNER_KEEP_PROJECTION_READY = 'ready' as const;
type InnerKeepProjectionAvailability =
  | typeof INNER_KEEP_PROJECTION_UNAVAILABLE
  | typeof INNER_KEEP_PROJECTION_PENDING
  | typeof INNER_KEEP_PROJECTION_READY;
const innerKeepProjectionAvailability =
  new WeakMap<WarpkeepConnection, InnerKeepProjectionAvailability>();
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
const GREATER_REALM_LOCATION_ID_PATTERN = /^GRL-[A-Z2-7]{26}$/;
const U64_MAXIMUM = (1n << 64n) - 1n;
const LEGACY_EXPEDITION_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,95}$/i;
const REALM_CHAT_REQUEST_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REALM_CHAT_MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REALM_CHAT_REPORT_CATEGORIES = new Set([
  'threat_or_harm',
  'harassment_or_hate',
  'personal_information',
  'sexual_exploitation',
  'fraud_or_malware',
  'illegal_trade',
  'spam_or_disruption',
  'other'
]);
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

/** Reduce SDK/browser errors to a bounded signal that cannot contain bearer material. */
export function classifyWarpkeepConnectionFailure(
  error: unknown
): WarpkeepConnectionFailureReason {
  const message = error instanceof Error ? error.message : '';
  if (!message.startsWith('Failed to verify token:')) return 'transport_failed';
  if (/unauthorized/i.test(message)) return 'token_exchange_unauthorized';
  if (/forbidden/i.test(message)) return 'token_exchange_forbidden';
  if (/service unavailable|bad gateway|gateway timeout|internal server error/i.test(message)) {
    return 'token_exchange_unavailable';
  }
  return 'token_exchange_failed';
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
    const rejectUnavailable = (reason: WarpkeepConnectionFailureReason) => {
      if (!settle(() => reject(new Error('Warpkeep records are unavailable.')))) return false;
      failed = true;
      disconnectWarpkeep(pendingConnection);
      pendingConnection = undefined;
      try {
        callbacks.onConnectionFailure?.(reason);
      } catch {
        // Diagnostics never change the fail-closed connection outcome.
      }
      return true;
    };

    timeout = setTimeout(() => {
      rejectUnavailable('handshake_timeout');
    }, CONNECTION_HANDSHAKE_TIMEOUT_MILLISECONDS);
    try {
      const builder = createWarpkeepConnectionBuilder(config, bridgeJwt, callbacks)
        .onConnect((connection, _identity, _serverIssuedToken) => {
          // Never persist or log `_serverIssuedToken`; it is not Warpkeep authority.
          if (settle(() => resolve(connection))) pendingConnection = undefined;
          else disconnectWarpkeep(connection);
        })
        .onConnectError((_context, error) => {
          rejectUnavailable(classifyWarpkeepConnectionFailure(error));
        });
      const builtConnection = builder.build();
      if (failed) disconnectWarpkeep(builtConnection);
      else if (!settled) pendingConnection = builtConnection;
    } catch {
      rejectUnavailable('setup_failed');
    }
  });
}

function greaterRealmConnectionAbortReason(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('GREATER_REALM_CONNECTION_REQUEST_CANCELLED');
  error.name = 'AbortError';
  return error;
}

function awaitGreaterRealmConnectionOperation<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) return Promise.reject(greaterRealmConnectionAbortReason(signal));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => finish(() => reject(greaterRealmConnectionAbortReason(signal)));
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
  });
}

function assertGreaterRealmConnectionAuthority(
  authority: WarpkeepGreaterRealmConnectionAuthority,
  signal: AbortSignal
) {
  if (signal.aborted) throw greaterRealmConnectionAbortReason(signal);
  if (
    !Number.isSafeInteger(authority.generation)
    || authority.generation < 1
    || !Number.isSafeInteger(authority.fid)
    || authority.fid < 1
    || !authority.isCurrent()
  ) {
    throw new Error('GREATER_REALM_CONNECTION_GENERATION_STALE');
  }
}

/**
 * Exact authenticated v17 player seam. It intentionally has no generic SDK
 * escape hatch: only the five reviewed public atlas procedures are callable,
 * and a stale provider generation can neither start nor publish a result.
 */
export function createWarpkeepGreaterRealmProcedureInvoker(
  connection: WarpkeepConnection,
  authority: WarpkeepGreaterRealmConnectionAuthority
): GreaterRealmProcedureInvoker {
  return Object.freeze({
    call: async (procedure, input, signal) => {
      assertGreaterRealmConnectionAuthority(authority, signal);
      let operation: Promise<unknown>;
      switch (procedure) {
        case GREATER_REALM_PUBLIC_PROCEDURES.bootstrap:
          operation = connection.procedures.getRealmAtlasBootstrapV1({});
          break;
        case GREATER_REALM_PUBLIC_PROCEDURES.window:
          operation = connection.procedures.getRealmAtlasWindowV1({
            centerQ: input.centerQ as number,
            centerR: input.centerR as number,
            radius: input.radius as number,
            expectedRevision: input.expectedRevision as bigint
          });
          break;
        case GREATER_REALM_PUBLIC_PROCEDURES.chunk:
          operation = connection.procedures.getRealmAtlasChunkV1({
            chunkHandle: input.chunkHandle as string,
            lod: input.lod as number,
            expectedRevision: input.expectedRevision as bigint
          });
          break;
        case GREATER_REALM_PUBLIC_PROCEDURES.resourceLocations:
          operation = connection.procedures.getRealmAtlasResourceLocationsV1({
            expectedRevision: input.expectedRevision as bigint,
            chunkHandles: input.chunkHandles as string[]
          });
          break;
        case GREATER_REALM_PUBLIC_PROCEDURES.planRoute:
          operation = connection.procedures.planRealmRouteV1({
            originCellKey: input.originCellKey as string,
            destinationCellKey: input.destinationCellKey as string,
            offset: input.offset as number,
            limit: input.limit as number,
            expectedRevision: input.expectedRevision as bigint
          });
          break;
        default:
          throw new Error('GREATER_REALM_PUBLIC_PROCEDURE_NOT_ALLOWED');
      }
      const result = await awaitGreaterRealmConnectionOperation(operation, signal);
      assertGreaterRealmConnectionAuthority(authority, signal);
      return result;
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

function isMissingEntryAgreementStatusProcedure(error: unknown): boolean {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : '';
  const normalized = message.trim().toLowerCase();
  const namesProcedure = normalized.includes('get_my_entry_agreement_status_v1')
    || normalized.includes('getmyentryagreementstatusv1');
  const identifiesMissingProcedure = /\b(no such|unknown|unrecognized|not found|does not exist|not registered)\b/.test(
    normalized
  ) && normalized.includes('procedure');
  return identifiesMissingProcedure && (namesProcedure || normalized.length < 96);
}

/**
 * Ask the authenticated module whether this caller already accepted the exact
 * agreement compiled into the browser. `undefined` means only that the
 * additive procedure is absent on an older deployment; malformed, mismatched,
 * and unavailable responses remain hard failures.
 */
export async function readWarpkeepEntryAgreementStatus(
  connection: WarpkeepConnection
): Promise<boolean | undefined> {
  const procedure = (connection.procedures as unknown as {
    getMyEntryAgreementStatusV1?: (
      input: Readonly<Record<string, never>>
    ) => Promise<unknown>;
  }).getMyEntryAgreementStatusV1;
  if (typeof procedure !== 'function') return undefined;

  let raw: unknown;
  try {
    raw = await procedure({});
  } catch (error) {
    if (isMissingEntryAgreementStatusProcedure(error)) return undefined;
    throw error;
  }
  if (
    raw === null
    || typeof raw !== 'object'
    || Array.isArray(raw)
    || Object.keys(raw).length !== 2
    || !Object.prototype.hasOwnProperty.call(raw, 'requiredVersion')
    || !Object.prototype.hasOwnProperty.call(raw, 'acceptedCurrent')
    || (raw as { requiredVersion?: unknown }).requiredVersion
      !== WARPKEEP_ALPHA_TERMS_VERSION
    || typeof (raw as { acceptedCurrent?: unknown }).acceptedCurrent !== 'boolean'
  ) {
    throw new Error('Warpkeep entry agreement status is unavailable.');
  }
  return (raw as { acceptedCurrent: boolean }).acceptedCurrent;
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

/**
 * Prefer the additive one-transaction caller-private control projection.
 * `undefined` means only that the connected module does not expose the
 * procedure; malformed and wrong-caller payloads remain explicit fail-closed
 * decode results.
 */
export async function readWarpkeepWorkerControlState(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<WorkerControlStateDecodeResult | undefined> {
  if (!Number.isSafeInteger(ownFid) || ownFid <= 0) {
    return Object.freeze({ status: 'invalid', reason: 'wrong-caller' });
  }
  const procedure = (connection.procedures as unknown as {
    getMyWorkerControlStateV1?: (
      input: Readonly<Record<string, never>>
    ) => Promise<unknown>;
  }).getMyWorkerControlStateV1;
  if (typeof procedure !== 'function') return undefined;
  try {
    return decodeWorkerControlState(await procedure({}), BigInt(ownFid));
  } catch (error) {
    // A client generated from the additive successor still exposes this
    // accessor while connected to the exact predecessor module. Fall back only
    // for a narrowly recognizable missing-procedure response; policy failures,
    // malformed output, and all other rejections remain fail-closed.
    const message = typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
    const normalized = message.trim().toLowerCase();
    const namesAtomicProcedure = normalized.includes('get_my_worker_control_state_v1')
      || normalized.includes('getmyworkercontrolstatev1');
    const identifiesMissingProcedure = /\b(no such|unknown|unrecognized|not found|does not exist|not registered)\b/.test(
      normalized
    ) && normalized.includes('procedure');
    if (identifiesMissingProcedure && (namesAtomicProcedure || normalized.length < 96)) {
      return undefined;
    }
    throw error;
  }
}

/** Read the current v17 atlas-bound Worker view without private topology. */
export async function readWarpkeepGreaterRealmWorkerControlState(
  connection: WarpkeepConnection,
  ownFid: number
): Promise<GreaterRealmWorkerControlDecodeResult | undefined> {
  if (!Number.isSafeInteger(ownFid) || ownFid <= 0) {
    return Object.freeze({ status: 'invalid', reason: 'wrong-caller' });
  }
  const procedure = (connection.procedures as unknown as {
    getMyWorkerControlStateV2?: (
      input: Readonly<Record<string, never>>
    ) => Promise<unknown>;
  }).getMyWorkerControlStateV2;
  if (typeof procedure !== 'function') return undefined;
  return decodeGreaterRealmWorkerControlState(
    await procedure({}),
    BigInt(ownFid)
  );
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

function missingInnerKeepProcedure(error: unknown, wireName: string, accessorName: string) {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : '';
  const normalized = message.trim().toLowerCase();
  const namesProcedure = normalized.includes(wireName)
    || normalized.includes(accessorName.toLowerCase());
  return /\b(no such|unknown|unrecognized|not found|does not exist|not registered)\b/.test(
    normalized
  ) && normalized.includes('procedure') && (namesProcedure || normalized.length < 96);
}

type PublicInnerKeepTable<Row> = Readonly<{
  iter: () => IterableIterator<Row>;
}>;

type PublicInnerKeepCastleTable<Row> = PublicInnerKeepTable<Row> & Readonly<{
  byCastle: Readonly<{
    filter: (castleId: bigint) => IterableIterator<Row>;
  }>;
}>;

type PublicInnerKeepSdkBuildingRow = Readonly<{
  buildingKey: string;
  castleId: bigint;
  buildingKind: string;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: number;
  completedLevel: number;
  targetLevel: number;
  phase: string;
  startedAtMicros: bigint;
  completesAtMicros: bigint;
  revision: bigint;
  policyVersion: string;
}>;

type PublicInnerKeepTables = Readonly<{
  innerKeepLayoutV1: PublicInnerKeepTable<InnerKeepLayoutRow>;
  innerKeepSlotV1: PublicInnerKeepTable<InnerKeepSlotRow>;
  innerKeepBuildingCatalogV1: PublicInnerKeepTable<InnerKeepBuildingCatalogRow>;
  innerKeepBuildLevelV1: PublicInnerKeepTable<InnerKeepBuildLevelRow>;
  castleInnerKeepBuildingV1: PublicInnerKeepCastleTable<PublicInnerKeepSdkBuildingRow>;
}>;

function publicInnerKeepTables(
  connection: WarpkeepConnection
): PublicInnerKeepTables | undefined {
  const candidate = (connection.db ?? {}) as unknown as Partial<PublicInnerKeepTables>;
  const values = [
    candidate.innerKeepLayoutV1,
    candidate.innerKeepSlotV1,
    candidate.innerKeepBuildingCatalogV1,
    candidate.innerKeepBuildLevelV1,
    candidate.castleInnerKeepBuildingV1
  ];
  return values.every((table) => typeof table?.iter === 'function')
    && typeof candidate.castleInnerKeepBuildingV1?.byCastle?.filter === 'function'
    ? candidate as PublicInnerKeepTables
    : undefined;
}

function subscribedInnerKeepCastleId(
  connection: WarpkeepConnection,
  ownFid: number | undefined
): bigint | undefined {
  if (!Number.isSafeInteger(ownFid) || ownFid === undefined || ownFid <= 0) {
    return undefined;
  }
  const castleTable = connection.db?.castle as unknown as Readonly<{
    ownerFid?: Readonly<{
      find?: (fid: bigint) => Readonly<{
        castleId?: unknown;
        ownerFid?: unknown;
      }> | null;
    }>;
  }> | undefined;
  const ownerIndex = castleTable?.ownerFid;
  if (typeof ownerIndex?.find !== 'function') return undefined;
  const fid = BigInt(ownFid);
  const row = ownerIndex.find(fid);
  return row?.ownerFid === fid
    && typeof row.castleId === 'bigint'
    && row.castleId > 0n
    ? row.castleId
    : undefined;
}

function boundedTableRows<Row>(
  table: PublicInnerKeepTable<Row>,
  maximum: number
): readonly Row[] | undefined {
  const rows: Row[] = [];
  for (const row of table.iter()) {
    if (rows.length >= maximum) return undefined;
    rows.push(row);
  }
  return Object.freeze(rows);
}

function projectPublicInnerKeepBuildingRow(
  row: PublicInnerKeepSdkBuildingRow
): InnerKeepBuildingRow {
  // Generated SpacetimeDB rows are flat. Keep that ABI shape at the connection
  // boundary and expose only the explicit browser projection consumed by the
  // placement/idempotency policy.
  return Object.freeze({
    buildingKey: row.buildingKey,
    castleId: row.castleId,
    buildingKind: row.buildingKind as InnerKeepBuildingRow['buildingKind'],
    placement: Object.freeze({
      localXMicrounits: row.localXMicrounits,
      localZMicrounits: row.localZMicrounits,
      rotationMilliDegrees: row.rotationMilliDegrees
    }),
    completedLevel: row.completedLevel,
    targetLevel: row.targetLevel,
    phase: row.phase as InnerKeepBuildingRow['phase'],
    startedAtMicros: row.startedAtMicros,
    completesAtMicros: row.completesAtMicros,
    revision: row.revision,
    policyVersion: row.policyVersion
  });
}

function readPublicInnerKeepRows(
  connection: WarpkeepConnection,
  scope: InnerKeepReadScope
): InnerKeepPublicRows | undefined {
  if (innerKeepProjectionAvailability.get(connection) !== INNER_KEEP_PROJECTION_READY) {
    return undefined;
  }
  const publicTables = publicInnerKeepTables(connection);
  if (publicTables === undefined) return undefined;
  const layouts = boundedTableRows(publicTables.innerKeepLayoutV1, 2);
  const slots = boundedTableRows(publicTables.innerKeepSlotV1, 1);
  const catalogue = boundedTableRows(publicTables.innerKeepBuildingCatalogV1, 7);
  const levels = boundedTableRows(publicTables.innerKeepBuildLevelV1, 31);
  if (
    layouts === undefined
    || slots === undefined
    || catalogue === undefined
    || levels === undefined
  ) throw new Error('Inner Keep public policy is unavailable.');
  const buildings: InnerKeepBuildingRow[] = [];
  for (const row of publicTables.castleInnerKeepBuildingV1.byCastle.filter(scope.castleId)) {
    if (buildings.length >= 7) throw new Error('Inner Keep public projects are unavailable.');
    buildings.push(projectPublicInnerKeepBuildingRow(row));
  }
  return Object.freeze({
    layouts,
    slots,
    catalogue,
    levels,
    buildings: Object.freeze(buildings)
  });
}

/**
 * Read the caller-only Builder/resource state and combine it with the exact
 * applied public v15 policy graph. Older/inactive modules return no feature;
 * malformed active state fails closed without widening private table access.
 */
export async function readWarpkeepInnerKeepProjection(
  connection: WarpkeepConnection,
  input: Readonly<{
    scope: InnerKeepReadScope;
    commandsAvailable: boolean;
    pendingAttempt?: InnerKeepCommandAttempt;
    statusMessage?: string;
  }>
): Promise<ReadyInnerKeepProjection | undefined> {
  const rows = readPublicInnerKeepRows(connection, input.scope);
  if (rows === undefined) return undefined;
  const procedure = (connection.procedures as unknown as {
    getMyInnerKeepStateV1?: (
      params: Readonly<Record<string, never>>
    ) => Promise<unknown>;
  }).getMyInnerKeepStateV1;
  if (typeof procedure !== 'function') return undefined;
  let raw: unknown;
  try {
    raw = await procedure({});
  } catch (error) {
    if (missingInnerKeepProcedure(
      error,
      'get_my_inner_keep_state_v1',
      'getMyInnerKeepStateV1'
    )) return undefined;
    throw error;
  }
  const privateState = decodeInnerKeepPrivateState(raw, input.scope);
  if (privateState === 'unavailable') return undefined;
  if (privateState === undefined) throw new Error('Inner Keep private state is unavailable.');
  const projection = resolveReadyInnerKeepProjection({
    scope: input.scope,
    privateState,
    rows,
    commandsAvailable: input.commandsAvailable,
    ...(input.pendingAttempt === undefined ? {} : {
      pendingAttempt: input.pendingAttempt
    }),
    ...(input.statusMessage === undefined ? {} : {
      statusMessage: input.statusMessage
    })
  });
  if (projection === undefined) throw new Error('Inner Keep projection is unavailable.');
  return projection;
}

/** Read one caller-bound private receipt for commit-ambiguous reconciliation. */
export async function readWarpkeepInnerKeepRequestStatus(
  connection: WarpkeepConnection,
  scope: InnerKeepReadScope,
  requestKey: string
): Promise<InnerKeepRequestReceipt | undefined> {
  if (!INNER_KEEP_REQUEST_KEY_PATTERN.test(requestKey)) {
    throw new Error('Inner Keep request status is unavailable.');
  }
  const procedure = (connection.procedures as unknown as {
    getMyInnerKeepRequestStatusV1?: (
      params: Readonly<{ requestKey: string }>
    ) => Promise<unknown>;
  }).getMyInnerKeepRequestStatusV1;
  if (typeof procedure !== 'function') return undefined;
  let raw: unknown;
  try {
    raw = await procedure({ requestKey });
  } catch (error) {
    if (missingInnerKeepProcedure(
      error,
      'get_my_inner_keep_request_status_v1',
      'getMyInnerKeepRequestStatusV1'
    )) return undefined;
    throw error;
  }
  const receipt = decodeInnerKeepRequestStatus(raw, scope);
  if (receipt === undefined) throw new Error('Inner Keep request status is unavailable.');
  return receipt;
}

/** The browser binds its reviewed policy/target/revision; the server still derives all economics. */
export async function startWarpkeepInnerKeepProject(
  connection: WarpkeepConnection,
  buildingKind: string,
  placement: InnerKeepPlacementTransform,
  requestKey: string,
  expectedTargetLevel: number,
  expectedProjectRevision: string,
  expectedPolicyDigest: string,
  expectedLayoutDigest: string
) {
  if (
    !isInnerKeepBuildingKind(buildingKind)
    || !innerKeepPlacementTransformIntegrity(placement)
    || !INNER_KEEP_REQUEST_KEY_PATTERN.test(requestKey)
    || !Number.isSafeInteger(expectedTargetLevel)
    || expectedTargetLevel < 1
    || expectedTargetLevel > 5
    || expectedProjectRevision.length > INNER_KEEP_PROJECT_REVISION_MAX.toString().length
    || !/^(?:0|[1-9][0-9]*)$/.test(expectedProjectRevision)
    || BigInt(expectedProjectRevision) > INNER_KEEP_PROJECT_REVISION_MAX
    || expectedPolicyDigest !== INNER_KEEP_POLICY_DIGEST
    || expectedLayoutDigest !== INNER_KEEP_LAYOUT_V1_DIGEST
  ) throw new Error('Inner Keep construction is unavailable.');
  const reducer = (connection.reducers as unknown as {
    innerKeepStartProjectV1?: (input: Readonly<{
      buildingKind: string;
      localXMicrounits: bigint;
      localZMicrounits: bigint;
      rotationMilliDegrees: number;
      requestKey: string;
      expectedTargetLevel: number;
      expectedProjectRevision: string;
      expectedPolicyDigest: string;
      expectedLayoutDigest: string;
    }>) => Promise<unknown> | unknown;
  }).innerKeepStartProjectV1;
  if (typeof reducer !== 'function') throw new Error('Inner Keep construction is unavailable.');
  await reducer({
    buildingKind,
    localXMicrounits: placement.localXMicrounits,
    localZMicrounits: placement.localZMicrounits,
    rotationMilliDegrees: placement.rotationMilliDegrees,
    requestKey,
    expectedTargetLevel,
    expectedProjectRevision,
    expectedPolicyDigest,
    expectedLayoutDigest
  });
}

function workerReducerSurface(connection: WarpkeepConnection) {
  return connection.reducers as unknown as {
    dispatchWorkerV1?: (input: Readonly<{ workerId: string; resourceKind: string; siteId: string; idempotencyKey: string }>) => Promise<unknown> | unknown;
    dispatchGreaterRealmWorkerV1?: (input: Readonly<{
      workerId: string;
      resourceKind: string;
      locationId: string;
      expectedRevision: bigint;
      idempotencyKey: string;
    }>) => Promise<unknown> | unknown;
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

/** Dispatch by public location; capacity ordinal and route stay server-owned. */
export async function dispatchWarpkeepGreaterRealmWorker(
  connection: WarpkeepConnection,
  workerId: string,
  resourceKind: string,
  locationId: string,
  expectedRevision: bigint,
  idempotencyKey: string
) {
  assertWorkerIdempotency(workerId, idempotencyKey);
  if (
    !/^(food|wood|stone|gold)$/.test(resourceKind)
    || !GREATER_REALM_LOCATION_ID_PATTERN.test(locationId)
    || typeof expectedRevision !== 'bigint'
    || expectedRevision < 0n
    || expectedRevision > U64_MAXIMUM
  ) throw new Error('Greater Realm Worker command is unavailable.');
  const reducer = workerReducerSurface(connection).dispatchGreaterRealmWorkerV1;
  if (typeof reducer !== 'function') {
    throw new Error('Greater Realm Worker command is unavailable.');
  }
  await reducer({
    workerId,
    resourceKind,
    locationId,
    expectedRevision,
    idempotencyKey
  });
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
 * Requests an owner-bound early return, then reconciles every private legacy
 * projection and the authoritative v1 balance after the reducer commits.
 * Nothing in this boundary mutates public occupation optimistically.
 */
export async function returnWarpkeepLegacyExpedition(
  connection: WarpkeepConnection,
  ownFid: number,
  resourceKind: RealmEconomicResourceKey,
  expeditionId: string
) {
  if (
    !Number.isSafeInteger(ownFid)
    || ownFid <= 0
    || !/^(gold|food|wood|stone)$/.test(resourceKind)
    || !LEGACY_EXPEDITION_ID_PATTERN.test(expeditionId)
  ) {
    throw new Error('Legacy expedition return is unavailable.');
  }
  await connection.reducers.returnLegacyExpeditionV1({
    resourceKind,
    expeditionId
  });
  const [
    resources,
    goldExpedition,
    foodExpedition,
    woodExpedition,
    stoneExpedition
  ] = await Promise.all([
    readWarpkeepResourceState(connection, ownFid),
    readWarpkeepGoldExpeditionState(connection),
    readWarpkeepFoodExpeditionState(connection),
    readWarpkeepWoodExpeditionState(connection),
    readWarpkeepStoneExpeditionState(connection)
  ]);
  return Object.freeze({
    resources,
    goldExpedition,
    foodExpedition,
    woodExpedition,
    stoneExpedition
  });
}

/**
 * Start the protocol-v3 core shared-state subscription and additive public
 * Gold/Food/Wood/Stone/forest/Inner Keep subscriptions. Schedulers, receipts,
 * Builder authority, forest seeding reducers, and every
 * private economy table remain outside the player graph. If an additive
 * schema is not deployed yet, the core Realm remains live but that visual
 * layer is empty rather than locally synthesized.
 */
export function subscribeToWarpkeepRealm(
  connection: WarpkeepConnection,
  onApplied: () => void,
  onError: () => void,
  ownFid?: number
): WarpkeepRealmSubscription {
  let coreApplied = false;
  goldProjectionAvailability.set(connection, GOLD_PROJECTION_PENDING);
  foodProjectionAvailability.set(connection, FOOD_PROJECTION_PENDING);
  woodProjectionAvailability.set(connection, WOOD_PROJECTION_PENDING);
  stoneProjectionAvailability.set(connection, STONE_PROJECTION_PENDING);
  workerProjectionAvailability.set(connection, WORKER_PROJECTION_PENDING);
  forestProjectionAvailability.set(connection, FOREST_PROJECTION_PENDING);
  waterProjectionAvailability.set(connection, WATER_PROJECTION_PENDING);
  innerKeepProjectionAvailability.set(connection, INNER_KEEP_PROJECTION_PENDING);
  let innerKeepSubscription: SubscriptionHandle | undefined;
  let innerKeepSubscriptionStarted = false;
  let subscriptionClosed = false;
  const innerKeepTables = publicInnerKeepTables(connection);
  const startInnerKeepSubscription = () => {
    if (subscriptionClosed || innerKeepSubscriptionStarted) return;
    innerKeepSubscriptionStarted = true;
    const castleId = subscribedInnerKeepCastleId(connection, ownFid);
    if (innerKeepTables === undefined || castleId === undefined) {
      innerKeepProjectionAvailability.set(connection, INNER_KEEP_PROJECTION_UNAVAILABLE);
      return;
    }
    try {
      innerKeepSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          innerKeepProjectionAvailability.set(connection, INNER_KEEP_PROJECTION_READY);
          if (coreApplied) onApplied();
        })
        .onError(() => {
          innerKeepProjectionAvailability.set(connection, INNER_KEEP_PROJECTION_UNAVAILABLE);
          if (coreApplied) onApplied();
        })
        .subscribe([
          tables.innerKeepLayoutV1,
          tables.innerKeepSlotV1,
          tables.innerKeepBuildingCatalogV1,
          tables.innerKeepBuildLevelV1,
          tables.castleInnerKeepBuildingV1.where((row) => row.castleId.eq(castleId))
        ]);
    } catch {
      innerKeepProjectionAvailability.set(connection, INNER_KEEP_PROJECTION_UNAVAILABLE);
    }
  };
  const coreSubscription = connection
    .subscriptionBuilder()
    .onApplied(() => {
      coreApplied = true;
      startInnerKeepSubscription();
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
      subscriptionClosed = true;
      goldProjectionAvailability.delete(connection);
      foodProjectionAvailability.delete(connection);
      woodProjectionAvailability.delete(connection);
      stoneProjectionAvailability.delete(connection);
      workerProjectionAvailability.delete(connection);
      forestProjectionAvailability.delete(connection);
      waterProjectionAvailability.delete(connection);
      innerKeepProjectionAvailability.delete(connection);
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
            try {
              waterSubscription?.unsubscribe();
            } finally {
              innerKeepSubscription?.unsubscribe();
            }
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
      ...(row.marksEarnedMicros === undefined ? {} : { marksEarnedMicros: row.marksEarnedMicros }),
      ...(row.marksSpentMicros === undefined ? {} : { marksSpentMicros: row.marksSpentMicros }),
      ...(row.marksBalanceMicros === undefined ? {} : { marksBalanceMicros: row.marksBalanceMicros }),
      ...(marksPolicyVersion === undefined ? {} : { marksPolicyVersion })
    });
  }
  return rows.sort((left, right) => left.fid - right.fid);
}

function publicRealmRow(row: ReturnType<WarpkeepConnection['db']['realmV1']['iter']> extends IterableIterator<infer Row>
  ? Row
  : never): WarpkeepRealm {
  return {
    realmId: row.realmId,
    publicName: row.publicName,
    seedName: row.seedName,
    numericSeed: row.numericSeed,
    generationVersion: row.generationVersion,
    authoritativeRadius: row.authoritativeRadius,
    renderRadius: row.renderRadius,
    playerCapacity: row.playerCapacity,
    active: row.active
  };
}

function readPublicRealmRows(connection: WarpkeepConnection): WarpkeepRealm[] {
  const rows: WarpkeepRealm[] = [];
  for (const row of connection.db.realmV1.iter()) {
    // The legacy authority is a singleton. Bound malformed projections before
    // copying or sorting any attacker-influenced table contents in the browser.
    if (rows.length === 2) break;
    rows.push(publicRealmRow(row));
  }
  return rows.sort((left, right) => left.realmId.localeCompare(right.realmId));
}

export type WarpkeepLegacyRealmAuthorityStatus = 'active' | 'retired' | 'invalid';

/**
 * Classify only the exact public v1 singleton. An inactive but otherwise
 * canonical generation is the reviewed v17 cutover signal; absence,
 * duplicates, or altered immutable fields remain corruption/incompleteness.
 */
export function readWarpkeepLegacyRealmAuthorityStatus(
  connection: WarpkeepConnection
): WarpkeepLegacyRealmAuthorityStatus {
  const rows = readPublicRealmRows(connection);
  if (rows.length !== 1) return 'invalid';
  const row = rows[0]!;
  const activeShape = { ...row, active: true };
  if (
    !matchesCanonicalRealm(activeShape)
    && !matchesGenerationV2Realm(activeShape)
  ) return 'invalid';
  return row.active ? 'active' : 'retired';
}

export class WarpkeepLegacyRealmRetiredError extends Error {
  readonly code = 'WARPKEEP_LEGACY_REALM_RETIRED';

  constructor() {
    super('WARPKEEP_LEGACY_REALM_RETIRED');
    this.name = 'WarpkeepLegacyRealmRetiredError';
  }
}

function readActiveRealms(connection: WarpkeepConnection): WarpkeepRealm[] {
  return readPublicRealmRows(connection).filter((row) => row.active);
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
): Readonly<{
  system: NonNullable<ReturnType<typeof decodeRealmWorkerSystem>>;
  workers?: NonNullable<ReturnType<typeof decodeRealmWorkerPublicRows>>;
  occupations?: NonNullable<ReturnType<typeof decodeRealmWorkerOccupations>>;
}> | undefined {
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
  if (!system) return undefined;
  const castleNames = new Map(castles.map((castle) => [castle.castleId, castle.name] as const));
  const rawWorkers = readBoundedPublicForestRows(
    db.castleWorkerV1!.iter(),
    castles.length * 4,
    publicWorkerRecord
  );
  if (rawWorkers === undefined) return Object.freeze({ system });
  const workers = decodeRealmWorkerPublicRows(
    rawWorkers,
    castleNames,
    ownCastleId
  );
  if (!workers) return Object.freeze({ system });
  const rawOccupations = readBoundedPublicForestRows(
    db.workerNodeOccupationV1!.iter(),
    castles.length * 4,
    publicWorkerOccupationRecord
  );
  if (rawOccupations === undefined) return Object.freeze({ system });
  const occupations = decodeRealmWorkerOccupations(
    rawOccupations
  );
  // A validated system row is the minimum fail-closed authority signal. If
  // either public detail table degrades, retain only that mode instead of
  // collapsing an active deployment into the legacy presentation path.
  if (!occupations) return Object.freeze({ system });
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

function sameCanonicalCoreForRetainedProjection(
  candidate: Pick<
    WarpkeepRealmSnapshotCandidate,
    'activeRealms' | 'tileMetadata' | 'tiles'
  >,
  retained: WarpkeepRealmSnapshot | undefined,
  ownFid: number
) {
  if (
    retained === undefined
    || !isCanonicalGenesisSnapshot(retained, ownFid)
    || candidate.activeRealms.length !== 1
    || candidate.tiles.length !== retained.tiles.length
    || candidate.tileMetadata.length !== retained.tileMetadata.length
  ) return false;
  const realm = candidate.activeRealms[0]!;
  const previousRealm = retained.realm;
  return realm.realmId === previousRealm.realmId
    && realm.publicName === previousRealm.publicName
    && realm.seedName === previousRealm.seedName
    && realm.numericSeed === previousRealm.numericSeed
    && realm.generationVersion === previousRealm.generationVersion
    && realm.authoritativeRadius === previousRealm.authoritativeRadius
    && realm.renderRadius === previousRealm.renderRadius
    && realm.playerCapacity === previousRealm.playerCapacity
    && realm.active === previousRealm.active;
}

function freezePublicRows<Row extends object>(rows: readonly Row[]): readonly Readonly<Row>[] {
  return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

/**
 * Read only the shared castle/profile/worker projections whose authority is
 * independent of legacy world geometry. This is the fresh-login and
 * post-cutover scope for resources, Marks, generic Workers, and Inner Keep.
 */
export function readWarpkeepRealmContinuityProjection(
  connection: WarpkeepConnection,
  ownFid: number
): WarpkeepRealmContinuityProjection {
  const status = readWarpkeepLegacyRealmAuthorityStatus(connection);
  if (status === 'invalid') {
    throw new Error('Warpkeep Realm continuity records are unavailable.');
  }
  const realm = readPublicRealmRows(connection)[0]!;
  const castles = readCastles(connection);
  const ownCastles = castles.filter((castle) => castle.ownerFid === ownFid);
  if (ownCastles.length !== 1) {
    throw new Error('Warpkeep Realm continuity records are unavailable.');
  }
  const ownCastle = ownCastles[0]!;
  const publicGold = readPublicGoldProjection(connection);
  const publicFood = readPublicFoodProjection(connection);
  const publicWood = readPublicWoodProjection(connection);
  const publicStone = readPublicStoneProjection(connection);
  const publicWorkers = readPublicWorkerProjection(connection, castles, ownCastle.castleId);
  return Object.freeze({
    realmId: realm.realmId,
    players: freezePublicRows(readPlayers(connection)),
    profiles: freezePublicRows(readRealmProfiles(connection)),
    castles: freezePublicRows(castles),
    ownCastle: Object.freeze({ ...ownCastle }),
    ...(publicGold === undefined ? {} : { goldSites: publicGold.sites }),
    ...(publicFood === undefined ? {} : { foodSites: publicFood.sites }),
    ...(publicWood === undefined ? {} : { woodSites: publicWood.sites }),
    ...(publicStone === undefined ? {} : { stoneSites: publicStone.sites }),
    ...(publicWorkers === undefined ? {} : {
      workerSystem: publicWorkers.system,
      ...(publicWorkers.workers === undefined ? {} : {
        workerWorkers: publicWorkers.workers
      }),
      ...(publicWorkers.occupations === undefined ? {} : {
        workerOccupations: publicWorkers.occupations
      })
    })
  });
}

/**
 * During a same-source reconnect, the core subscription applies before each
 * additive public projection. Preserve only the last validated projection
 * whose new subscription is still pending; an explicit unavailable/ready
 * result always replaces it. This prevents full → omitted → full topology
 * churn without turning stale retained data into permanent authority.
 */
export function readWarpkeepRealmSnapshot(
  connection: WarpkeepConnection,
  ownFid: number,
  retainedSnapshot?: WarpkeepRealmSnapshot
): WarpkeepRealmSnapshot {
  if (readWarpkeepLegacyRealmAuthorityStatus(connection) === 'retired') {
    throw new WarpkeepLegacyRealmRetiredError();
  }
  const castles = readCastles(connection);
  const ownCastle = castles.find((castle) => castle.ownerFid === ownFid);
  const tiles = readWorldTiles(connection);
  const tileMetadata = readWorldTileMetadata(connection);
  const activeRealms = readActiveRealms(connection);
  const retained = sameCanonicalCoreForRetainedProjection({
    activeRealms,
    tileMetadata,
    tiles
  }, retainedSnapshot, ownFid)
    ? retainedSnapshot
    : undefined;
  const publicGold = readPublicGoldProjection(connection);
  const publicFood = readPublicFoodProjection(connection);
  const publicWood = readPublicWoodProjection(connection);
  const publicStone = readPublicStoneProjection(connection);
  const publicForest = readPublicForestProjection(connection);
  const publicWater = readPublicWaterProjection(connection);
  const publicWorkers = ownCastle === undefined
    ? undefined
    : readPublicWorkerProjection(connection, castles, ownCastle.castleId);
  const retainedGold = publicGold === undefined
    && goldProjectionAvailability.get(connection) === GOLD_PROJECTION_PENDING
    && retained?.goldSites !== undefined
    && retained.goldNodeOccupations !== undefined
    ? Object.freeze({
        sites: retained.goldSites,
        occupations: retained.goldNodeOccupations
      })
    : undefined;
  const retainedFood = publicFood === undefined
    && foodProjectionAvailability.get(connection) === FOOD_PROJECTION_PENDING
    && retained?.foodSites !== undefined
    && retained.foodNodeOccupations !== undefined
    ? Object.freeze({
        sites: retained.foodSites,
        occupations: retained.foodNodeOccupations
      })
    : undefined;
  const retainedWood = publicWood === undefined
    && woodProjectionAvailability.get(connection) === WOOD_PROJECTION_PENDING
    && retained?.woodSites !== undefined
    && retained.woodNodeOccupations !== undefined
    ? Object.freeze({
        sites: retained.woodSites,
        occupations: retained.woodNodeOccupations
      })
    : undefined;
  const retainedStone = publicStone === undefined
    && stoneProjectionAvailability.get(connection) === STONE_PROJECTION_PENDING
    && retained?.stoneSites !== undefined
    && retained.stoneNodeOccupations !== undefined
    ? Object.freeze({
        sites: retained.stoneSites,
        occupations: retained.stoneNodeOccupations
      })
    : undefined;
  const retainedForest = publicForest === undefined
    && forestProjectionAvailability.get(connection) === FOREST_PROJECTION_PENDING
    && retained?.forestLayout !== undefined
    && retained.forestTrees !== undefined
    ? Object.freeze({
        layout: retained.forestLayout,
        trees: retained.forestTrees
      })
    : undefined;
  const retainedWater = publicWater === undefined
    && waterProjectionAvailability.get(connection) === WATER_PROJECTION_PENDING
    && retained?.waterLayout !== undefined
    && retained.waterBodies !== undefined
    && retained.waterCells !== undefined
    && retained.realmEnvironment !== undefined
    ? Object.freeze({
        layout: retained.waterLayout,
        bodies: retained.waterBodies,
        cells: retained.waterCells,
        realmEnvironment: retained.realmEnvironment,
        ...(retained.waterRevision === undefined ? {} : {
          waterRevision: retained.waterRevision
        })
      })
    : undefined;
  const retainedWorkers = publicWorkers === undefined
    && workerProjectionAvailability.get(connection) === WORKER_PROJECTION_PENDING
    && retained?.workerSystem !== undefined
    ? Object.freeze({
        system: retained.workerSystem,
        ...(retained.workerWorkers === undefined ? {} : {
          workers: retained.workerWorkers
        }),
        ...(retained.workerOccupations === undefined ? {} : {
          occupations: retained.workerOccupations
        })
      })
    : undefined;
  const effectiveGold = publicGold ?? retainedGold;
  const effectiveFood = publicFood ?? retainedFood;
  const effectiveWood = publicWood ?? retainedWood;
  const effectiveStone = publicStone ?? retainedStone;
  const effectiveForest = publicForest ?? retainedForest;
  const effectiveWater = publicWater ?? retainedWater;
  const effectiveWorkers = publicWorkers ?? retainedWorkers;
  const candidate: WarpkeepRealmSnapshotCandidate = {
    tiles,
    tileMetadata,
    players: readPlayers(connection),
    profiles: readRealmProfiles(connection),
    castles,
    activeRealms,
    ...(effectiveGold === undefined ? {} : {
      goldSites: effectiveGold.sites,
      goldNodeOccupations: effectiveGold.occupations
    }),
    ...(effectiveFood === undefined ? {} : {
      foodSites: effectiveFood.sites,
      foodNodeOccupations: effectiveFood.occupations
    }),
    ...(effectiveWood === undefined ? {} : {
      woodSites: effectiveWood.sites,
      woodNodeOccupations: effectiveWood.occupations
    }),
    ...(effectiveStone === undefined ? {} : {
      stoneSites: effectiveStone.sites,
      stoneNodeOccupations: effectiveStone.occupations
    }),
    ...(effectiveForest === undefined ? {} : {
      forestLayout: effectiveForest.layout,
      forestTrees: effectiveForest.trees
    }),
    ...(effectiveWater === undefined ? {} : {
      waterLayout: effectiveWater.layout,
      waterBodies: effectiveWater.bodies,
      waterCells: effectiveWater.cells,
      realmEnvironment: effectiveWater.realmEnvironment,
      ...(effectiveWater.waterRevision === undefined ? {} : {
        waterRevision: effectiveWater.waterRevision
      })
    }),
    ...(effectiveWorkers === undefined ? {} : {
      workerSystem: effectiveWorkers.system,
      ...(effectiveWorkers.workers === undefined ? {} : {
        workerWorkers: effectiveWorkers.workers
      }),
      ...(effectiveWorkers.occupations === undefined ? {} : {
        workerOccupations: effectiveWorkers.occupations
      })
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
  onError: (reason?: 'legacy-retired' | 'invalid') => void,
  retainedSnapshot?: WarpkeepRealmSnapshot,
  onRetiredProjectionChange?: () => void
) {
  let active = true;
  let legacyRetired = false;
  let latestTransactionEventId: string | undefined;
  let continuitySnapshot = retainedSnapshot;
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
    if (legacyRetired) {
      onRetiredProjectionChange?.();
      return;
    }
    try {
      const snapshot = readWarpkeepRealmSnapshot(
        connection,
        ownFid,
        continuitySnapshot
      );
      continuitySnapshot = snapshot;
      onChange(snapshot);
    } catch (error) {
      // A post-ready canonical violation must revoke the browser's renderer
      // authority instead of escaping the SDK callback with stale ready state.
      if (error instanceof WarpkeepLegacyRealmRetiredError) {
        legacyRetired = true;
        onError('legacy-retired');
        return;
      }
      active = false;
      onError('invalid');
    }
  };
  const goldTables = publicGoldTables(connection);
  const foodTables = publicFoodTables(connection);
  const woodTables = publicWoodTables(connection);
  const stoneTables = publicStoneTables(connection);
  const workerTables = publicWorkerTables(connection);
  const forestTables = publicForestTables(connection);
  const waterTables = publicWaterTables(connection);
  const innerKeepTables = publicInnerKeepTables(connection);
  type ObserverTable = Readonly<{
    onInsert?: (callback: typeof sync) => void;
    onDelete?: (callback: typeof sync) => void;
    onUpdate?: (callback: typeof sync) => void;
    removeOnInsert?: (callback: typeof sync) => void;
    removeOnDelete?: (callback: typeof sync) => void;
    removeOnUpdate?: (callback: typeof sync) => void;
  }>;
  const listenerCleanups: Array<() => void> = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    for (let index = listenerCleanups.length - 1; index >= 0; index -= 1) {
      try {
        listenerCleanups[index]?.();
      } catch {
        // One generated listener must not strand any other table listener.
      }
    }
    listenerCleanups.length = 0;
  };
  const registerTable = (candidate: unknown) => {
    const table = candidate as ObserverTable;
    const pairs = [
      ['onInsert', 'removeOnInsert'],
      ['onDelete', 'removeOnDelete'],
      ['onUpdate', 'removeOnUpdate']
    ] as const;
    for (const [addName, removeName] of pairs) {
      const add = table?.[addName];
      const remove = table?.[removeName];
      if (add === undefined && remove === undefined) continue;
      if (typeof add !== 'function' || typeof remove !== 'function') {
        throw new Error('Warpkeep Realm observer surface is incomplete.');
      }
      listenerCleanups.push(() => remove.call(table, sync));
      // Register rollback before invoking the generated SDK. A defensive SDK
      // wrapper can attach the callback and then throw; cleanup must still
      // remove that partially installed listener.
      add.call(table, sync);
      if (!active) throw new Error('Warpkeep Realm observer became inactive during setup.');
    }
  };
  const observedTables: readonly unknown[] = [
    connection.db.worldTile,
    connection.db.worldTileMetaV1,
    connection.db.playerV2,
    connection.db.castle,
    connection.db.realmV1,
    connection.db.realmProfileV1,
    goldTables?.goldSiteV1,
    goldTables?.goldNodeOccupationV1,
    foodTables?.foodSiteV1,
    foodTables?.foodNodeOccupationV1,
    woodTables?.woodSiteV1,
    woodTables?.woodNodeOccupationV1,
    stoneTables?.stoneSiteV1,
    stoneTables?.stoneNodeOccupationV1,
    workerTables?.realmWorkerSystemV1,
    workerTables?.castleWorkerV1,
    workerTables?.workerNodeOccupationV1,
    forestTables?.realmForestLayoutV1,
    forestTables?.realmForestInstanceV1,
    waterTables?.realmWaterLayoutV1,
    waterTables?.realmWaterBodyV1,
    waterTables?.realmWaterCellV1,
    waterTables?.realmEnvironmentV1,
    waterTables?.realmWaterRevisionV1,
    innerKeepTables?.innerKeepLayoutV1,
    innerKeepTables?.innerKeepSlotV1,
    innerKeepTables?.innerKeepBuildingCatalogV1,
    innerKeepTables?.innerKeepBuildLevelV1,
    innerKeepTables?.castleInnerKeepBuildingV1
  ];
  try {
    for (const table of observedTables) {
      if (table !== undefined) registerTable(table);
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}

export function readWarpkeepRealmChat(
  connection: WarpkeepConnection
): RealmChatPresentation {
  return decodeRealmChatStatusProjection({
    statusRows: connection.db.realmChatStatusV1.iter()
  });
}

/** Subscribe only to body-free Chat readiness; message bodies remain private. */
export function subscribeToWarpkeepRealmChat(
  connection: WarpkeepConnection,
  onApplied: () => void,
  onError: () => void
): WarpkeepRealmChatSubscription {
  const subscription = connection
    .subscriptionBuilder()
    .onApplied(onApplied)
    .onError(onError)
    .subscribe([tables.realmChatStatusV1]);
  return Object.freeze({ unsubscribe: () => subscription.unsubscribe() });
}

export function observeWarpkeepRealmChat(
  connection: WarpkeepConnection,
  onChange: (chat: RealmChatPresentation) => void,
  onError: () => void
) {
  let active = true;
  let latestTransactionEventId: string | undefined;
  const sync = (context: EventContext) => {
    if (
      !active
      || context.event.tag === 'SubscribeApplied'
      || context.event.id === latestTransactionEventId
    ) return;
    latestTransactionEventId = context.event.id;
    try {
      onChange(readWarpkeepRealmChat(connection));
    } catch {
      active = false;
      onError();
    }
  };
  type ObserverTable = Readonly<{
    onInsert?: (callback: typeof sync) => void;
    onDelete?: (callback: typeof sync) => void;
    onUpdate?: (callback: typeof sync) => void;
    removeOnInsert?: (callback: typeof sync) => void;
    removeOnDelete?: (callback: typeof sync) => void;
    removeOnUpdate?: (callback: typeof sync) => void;
  }>;
  const listenerCleanups: Array<() => void> = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    for (let index = listenerCleanups.length - 1; index >= 0; index -= 1) {
      try {
        listenerCleanups[index]?.();
      } catch {
        // One generated listener must not strand the paired Chat listeners.
      }
    }
    listenerCleanups.length = 0;
  };
  const registerTable = (candidate: unknown) => {
    const table = candidate as ObserverTable;
    const pairs = [
      ['onInsert', 'removeOnInsert'],
      ['onDelete', 'removeOnDelete'],
      ['onUpdate', 'removeOnUpdate']
    ] as const;
    for (const [addName, removeName] of pairs) {
      const add = table?.[addName];
      const remove = table?.[removeName];
      if (add === undefined && remove === undefined) continue;
      if (typeof add !== 'function' || typeof remove !== 'function') {
        throw new Error('Warpkeep Realm Chat observer surface is incomplete.');
      }
      listenerCleanups.push(() => remove.call(table, sync));
      add.call(table, sync);
      if (!active) throw new Error('Warpkeep Realm Chat observer became inactive during setup.');
    }
  };
  try {
    registerTable(connection.db.realmChatStatusV1);
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}

export async function readWarpkeepRealmChatRecent(
  connection: WarpkeepConnection,
  afterSequence: bigint,
  limit: number
): Promise<RealmChatRecentPagePresentation> {
  if (
    afterSequence < 0n
    || afterSequence > (1n << 64n) - 1n
    || !Number.isInteger(limit)
    || limit < 1
    || limit > 128
  ) {
    throw new Error('Realm Chat recent messages are unavailable.');
  }
  const page = await connection.procedures.getRealmChatRecentV1({
    afterSequence,
    limit
  });
  const decoded = decodeRealmChatRecentPage(page);
  if (
    decoded.messages.length > limit
    || decoded.nextAfterSequence < afterSequence
    || decoded.messages.some(message => message.sequence <= afterSequence)
    || (decoded.messages.length === 0 && decoded.nextAfterSequence !== afterSequence)
  ) throw new Error('Realm Chat recent messages are unavailable.');
  return decoded;
}

export async function sendWarpkeepRealmChatMessage(
  connection: WarpkeepConnection,
  requestKey: string,
  body: string
): Promise<void> {
  if (
    !REALM_CHAT_REQUEST_KEY_PATTERN.test(requestKey)
    || typeof body !== 'string'
    || body.length === 0
    || body.length > 2_048
    || [...body].length > 500
    || body.split(/\r?\n/).length > 8
    || new TextEncoder().encode(body).byteLength > 2_048
  ) throw new Error('Realm Chat command is unavailable.');
  await connection.reducers.sendRealmChatMessageV1({ requestKey, body });
}

export async function reportWarpkeepRealmChatMessage(
  connection: WarpkeepConnection,
  messageId: string,
  category: string,
  details: string
): Promise<void> {
  if (
    !REALM_CHAT_MESSAGE_ID_PATTERN.test(messageId)
    || !REALM_CHAT_REPORT_CATEGORIES.has(category)
    || typeof details !== 'string'
    || details.length > 512
    || [...details].length > 250
    || new TextEncoder().encode(details).byteLength > 512
  ) throw new Error('Realm Chat command is unavailable.');
  await connection.reducers.reportRealmChatMessageV1({ messageId, category, details });
}

export async function readWarpkeepRealmChatHistory(
  connection: WarpkeepConnection,
  beforeSequence: bigint,
  limit: number
): Promise<RealmChatHistoryPagePresentation> {
  if (beforeSequence <= 0n || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Realm Chat history is unavailable.');
  }
  const page = await connection.procedures.getRealmChatHistoryV1({
    beforeSequence,
    limit
  });
  return decodeRealmChatHistoryPage(page);
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
