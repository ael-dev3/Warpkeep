import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import { useFarcasterAuth } from '../farcaster/FarcasterAuthProviderCore';
import type { VerifiedFarcasterIdentity } from '../farcaster/farcasterAuthTypes';
import { validateFarcasterOidcSession } from '../farcaster/farcasterOidcSession';
import {
  acceptWarpkeepAlphaTerms,
  bootstrapWarpkeepPlayer,
  collectWarpkeepGoldExpedition,
  collectWarpkeepFoodExpedition,
  collectWarpkeepWoodExpedition,
  collectWarpkeepStoneExpedition,
  collectWarpkeepResources,
  connectWarpkeep,
  dispatchWarpkeepGoldExpedition,
  dispatchWarpkeepFoodExpedition,
  dispatchWarpkeepWoodExpedition,
  dispatchWarpkeepStoneExpedition,
  disconnectWarpkeep,
  observeWarpkeepRealmChat,
  observeWarpkeepRealm,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
  readWarpkeepEntryAgreementStatus,
  readWarpkeepGoldExpeditionState,
  readWarpkeepFoodExpeditionState,
  readWarpkeepWoodExpeditionState,
  readWarpkeepStoneExpeditionState,
  readWarpkeepResourceState,
  readWarpkeepResourceStateV2,
  readWarpkeepWorkerControlState,
  readWarpkeepGreaterRealmWorkerControlState,
  readWarpkeepWorkerRoster,
  readWarpkeepInnerKeepProjection,
  readWarpkeepInnerKeepRequestStatus,
  startWarpkeepInnerKeepProject,
  dispatchWarpkeepWorker,
  dispatchWarpkeepGreaterRealmWorker,
  recallWarpkeepWorker,
  recallAllWarpkeepWorkers,
  returnWarpkeepLegacyExpedition,
  readWarpkeepRealmSnapshot,
  readWarpkeepRealmContinuityProjection,
  readWarpkeepRealmChat,
  readWarpkeepRealmChatHistory,
  readWarpkeepRealmChatRecent,
  reportWarpkeepRealmChatMessage,
  sendWarpkeepRealmChatMessage,
  subscribeToWarpkeepRealmChat,
  subscribeToWarpkeepRealm,
  WarpkeepLegacyRealmRetiredError,
  type WarpkeepConnection,
  type WarpkeepGreaterRealmConnectionAuthority
} from './warpkeepConnection';
import {
  createWarpkeepGreaterRealmProviderBridge,
  type GreaterRealmProviderBridge
} from './greaterRealmProviderBridge';
import {
  mergeRealmChatRecentPage,
  UNAVAILABLE_REALM_CHAT_PRESENTATION,
  type RealmChatHistoryPagePresentation,
  type RealmChatRecentPagePresentation,
  type RealmChatPresentation
} from './realmChatPresentation';
import { WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED } from '../legal/realmChatPolicy';
import {
  IDLE_WARPKEEP_BACKEND_STATE,
  NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
  type WarpkeepBackendState,
  type WarpkeepRealmContinuityProjection,
  type WarpkeepRealmSnapshot,
  type WarpkeepWorkerPrivateSyncFailureReason,
  type WarpkeepWorkerPrivateSyncStatus
} from './warpkeepBackendTypes';
import {
  isCanonicalGenesisSnapshot,
  validateCanonicalGenesisSnapshot
} from './canonicalGenesisSnapshot';
import {
  hasUsableWarpkeepBridge,
  readWarpkeepRuntimeConfig,
  type WarpkeepRuntimeConfig
} from './warpkeepConfig';
import { readCompatibleWarpkeepBackendInfo } from './warpkeepProtocol';
import type {
  ReadyRealmResourcePresentation,
  RealmEconomicResourceKey
} from '../components/realm/realmResourcePresentation';
import type { ReadyGoldExpeditionPresentation } from '../components/realm/realmGoldExpeditionPresentation';
import type { ReadyFoodExpeditionPresentation } from '../components/realm/realmFoodExpeditionPresentation';
import type { ReadyWoodExpeditionPresentation } from '../components/realm/realmWoodExpeditionPresentation';
import type { ReadyStoneExpeditionPresentation } from '../components/realm/realmStoneExpeditionPresentation';
import type {
  ReadyPublicWorkerProjection,
  ReadyWorkerProjection,
  ReadyWorkerResourceState,
  RealmWorkerResourceSite,
  WorkerControlStateDecodeResult,
  WorkerProjectionCoherenceFailure,
  WorkerRosterPresentation
} from '../components/realm/realmWorkerPresentation';
import type { ReadyGreaterRealmWorkerControlState } from '../greater-realm/greaterRealmWorkerControl';
import {
  resolveReadyPublicWorkerProjection,
  resolveReadyWorkerProjection,
  resolveReadyWorkerProjectionWithReason
} from '../components/realm/realmWorkerPresentation';
import { createExpeditionIdempotencyKey } from './expeditionIdempotencyKey';
import {
  serializeWorkerCommandFingerprint,
  workerCommandAttemptFor,
  workerCommandAttemptMatchesLifecycle,
  type WorkerCommandAttempt,
  type WorkerCommandFingerprint,
  type WorkerCommandLifecycleState
} from './workerCommandIdempotency';
import {
  WORKER_PRIVATE_SYNC_LOW_FREQUENCY_RETRY_MILLISECONDS,
  WORKER_PRIVATE_SYNC_RETRY_DELAYS_MILLISECONDS,
  workerPrivatePairRevision,
  workerPrivateSyncStatus
} from './workerPrivateSync';
import type {
  InnerKeepProjectIntent,
  InnerKeepPresentation
} from '../components/inner-keep/innerKeepPresentation';
import {
  INNER_KEEP_RESOURCE_ORDER,
  InnerKeepProjectNoCommitError,
  innerKeepQuoteAffordable
} from '../components/inner-keep/innerKeepPresentation';
import { evaluateInnerKeepPlacementDraft } from '../components/inner-keep/innerKeepPlacement';
import {
  classifyInnerKeepDefinitiveRejection,
  innerKeepCommandAttemptFor,
  innerKeepCommandAttemptWithPhase,
  reconcileInnerKeepCommandAttempt,
  type InnerKeepCommandAttempt,
  type InnerKeepDefinitiveRejection
} from './innerKeepCommandIdempotency';
import type { ReadyInnerKeepProjection } from './innerKeepProjection';

/**
 * The generation-three Realm replicates 20,000 immutable world rows before
 * SubscribeApplied. This deadline is intentionally independent from the
 * smaller private resource procedure deadline below.
 */
export const CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS = 60_000;
export const BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS = 30_000;
export const RESOURCE_OPERATION_TIMEOUT_MILLISECONDS = 15_000;
export const RESOURCE_REFRESH_INTERVAL_MILLISECONDS = 60_000;
export const GREATER_REALM_WORKER_CONTROL_POLL_INTERVAL_MILLISECONDS = 60_000;
const MAX_RETAINED_WORKER_COMMAND_ATTEMPTS = 64;
const MAX_WORKER_PROJECTION_PAIR_READ_ATTEMPTS = 2;
const TRANSPORT_RECONNECT_RETRY_DELAYS_MILLISECONDS =
  Object.freeze([250, 1_000, 4_000] as const);
const REALM_CHAT_SEND_RETRY_RETENTION_MILLISECONDS = 2 * 60 * 1_000;
export const REALM_CHAT_POLL_INTERVAL_MILLISECONDS = 2_000;
export const REALM_CHAT_POLL_MAX_BACKOFF_MILLISECONDS = 30_000;
const REALM_CHAT_REQUEST_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function realmChatPollDelayMilliseconds(failureCount: number): number {
  if (!Number.isSafeInteger(failureCount) || failureCount < 0) {
    return REALM_CHAT_POLL_MAX_BACKOFF_MILLISECONDS;
  }
  if (failureCount === 0) return REALM_CHAT_POLL_INTERVAL_MILLISECONDS;
  return Math.min(
    REALM_CHAT_POLL_MAX_BACKOFF_MILLISECONDS,
    REALM_CHAT_POLL_INTERVAL_MILLISECONDS * (2 ** Math.min(failureCount - 1, 4))
  );
}

class BackendStageOperationDeadlineError extends Error {
  constructor() {
    super('Warpkeep backend stage operation timed out.');
    this.name = 'BackendStageOperationDeadlineError';
  }
}

function withBackendStageOperationDeadline<T>(operation: Promise<T>): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(
      () => reject(new BackendStageOperationDeadlineError()),
      BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS
    );
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (deadline !== undefined) clearTimeout(deadline);
  });
}

class ResourceOperationDeadlineError extends Error {
  constructor() {
    super('Warpkeep resource operation timed out.');
    this.name = 'ResourceOperationDeadlineError';
  }
}

class WorkerPrivateSyncFailureError extends Error {
  readonly reason: WarpkeepWorkerPrivateSyncFailureReason;

  constructor(reason: WarpkeepWorkerPrivateSyncFailureReason) {
    super('Warpkeep Worker private synchronization failed.');
    this.name = 'WorkerPrivateSyncFailureError';
    this.reason = reason;
  }
}

type WarpkeepRealmActivationFailureReason =
  | 'resource_projection_failed'
  | 'resource_projection_deadline'
  | 'observer_setup_failed'
  | 'subscription_setup_failed'
  | 'subscription_failed'
  | 'canonical_readiness_timeout'
  | 'canonical_snapshot_invalid';

type WarpkeepWorkerControlStateReadResult =
  | WorkerControlStateDecodeResult
  | Readonly<{
      status: 'invalid';
      reason: WarpkeepWorkerPrivateSyncFailureReason;
    }>;

function withResourceOperationDeadline<T>(operation: Promise<T>): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(
      () => reject(new ResourceOperationDeadlineError()),
      RESOURCE_OPERATION_TIMEOUT_MILLISECONDS
    );
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (deadline !== undefined) clearTimeout(deadline);
  });
}

export type WarpkeepBackendControllerValue = Readonly<{
  state: WarpkeepBackendState;
  /** Dormant v17 procedure bridge; it never contains a connection or private row. */
  greaterRealm: GreaterRealmProviderBridge;
  /** Separate bounded stream; never participates in canonical world readiness. */
  realmChat: RealmChatPresentation;
  /** Privacy-safe status for the current caller-private Worker read pair. */
  workerPrivateSync: WarpkeepWorkerPrivateSyncStatus;
  /** True only when the explicit kill switch and all public bridge values are valid. */
  sharedAlphaAvailable: boolean;
  /**
   * True only after this provider lifetime either recorded or authoritatively
   * confirmed the current agreement for the same verified FID. This remains
   * memory-only presentation evidence; browser storage is never authority.
   */
  entryAgreementSatisfied: boolean;
  /** Recheck admission with the current, still-valid bridge session. */
  checkAgain: () => void;
  /** Record one explicit, memory-only Terms-gated entry attempt. */
  beginAlphaTermsAcceptance: () => void;
  /** Drop an unconsumed attempt when the player cancels the entry flow. */
  cancelAlphaTermsAcceptance: () => void;
  /** Disconnect immediately; the Farcaster provider clears credentials separately. */
  disconnect: () => void;
  /** Settle the caller's server-time yield and refresh the private projection. */
  collectResources: () => Promise<void>;
  /** Send a guarded Gold dispatch; public occupancy remains subscription-owned. */
  dispatchGoldExpedition: (siteId: string) => Promise<void>;
  /** Settle only the caller's Gold expedition and refresh both private views. */
  claimGoldExpedition: () => Promise<void>;
  /** Send a guarded Food dispatch; public occupancy remains subscription-owned. */
  dispatchFoodExpedition: (siteId: string) => Promise<void>;
  /** Settle only the caller's Food expedition and refresh both private views. */
  claimFoodExpedition: () => Promise<void>;
  /** Send a guarded Wood dispatch; public occupancy remains subscription-owned. */
  dispatchWoodExpedition: (siteId: string) => Promise<void>;
  /** Settle only the caller's Wood expedition and refresh both private views. */
  claimWoodExpedition: () => Promise<void>;
  /** Send a guarded Stone dispatch; public occupancy remains subscription-owned. */
  dispatchStoneExpedition: (siteId: string) => Promise<void>;
  /** Settle only the caller's Stone expedition and refresh both private views. */
  claimStoneExpedition: () => Promise<void>;
  /** Return one exact caller-owned legacy expedition and refresh all private views. */
  returnLegacyExpedition: (
    resourceKind: RealmEconomicResourceKey,
    expeditionId: string
  ) => Promise<void>;
  workerProjection?: ReadyWorkerProjection;
  workerRoster?: WorkerRosterPresentation;
  workerResourceState?: ReadyWorkerResourceState;
  dispatchWorker: (
    workerId: string,
    resourceKind: RealmEconomicResourceKey,
    siteId: string
  ) => Promise<void>;
  /** Dispatch to one selected public v17 resource location. */
  dispatchGreaterRealmWorker: (
    workerId: string,
    resourceKind: RealmEconomicResourceKey,
    locationId: string,
    expectedRevision: bigint
  ) => Promise<void>;
  recallWorker: (workerId: string) => Promise<void>;
  recallAllWorkers: () => Promise<void>;
  /** Start a new bounded read-only Worker sync burst for the active Realm. */
  retryWorkerPrivateSync: () => void;
  /** Caller-bound Inner Keep projection; absent until compatible v15 activation. */
  innerKeep?: InnerKeepPresentation;
  /** Start one exact quoted project with a retained memory-only request key. */
  startInnerKeepProject: (intent: InnerKeepProjectIntent) => Promise<void>;
  /** Reconcile private receipt plus public project without resending a command. */
  retryInnerKeepSync: () => void;
  sendRealmChatMessage: (body: string) => Promise<void>;
  reportRealmChatMessage: (
    messageId: string,
    category: string,
    details: string
  ) => Promise<void>;
  loadEarlierRealmChat: (
    beforeSequence: bigint,
    limit?: number
  ) => Promise<RealmChatHistoryPagePresentation>;
}>;

/**
 * The small client boundary is injectable for deterministic UI tests. Runtime
 * code always uses the generated-binding implementation below; this is not a
 * browser configuration surface and never accepts credentials from callers.
 */
export type WarpkeepBackendRuntime = Readonly<{
  connect: typeof connectWarpkeep;
  disconnect: typeof disconnectWarpkeep;
  readBackendInfo: typeof readWarpkeepBackendInfo;
  readAdmission: typeof readWarpkeepAdmissionStatus;
  bootstrapPlayer: typeof bootstrapWarpkeepPlayer;
  readEntryAgreementStatus?: typeof readWarpkeepEntryAgreementStatus;
  acceptAlphaTerms: typeof acceptWarpkeepAlphaTerms;
  readResourceState: typeof readWarpkeepResourceState;
  collectResources: typeof collectWarpkeepResources;
  readWorkerControlState?: (
    connection: WarpkeepConnection,
    ownFid: number
  ) => Promise<WarpkeepWorkerControlStateReadResult | undefined>;
  readGreaterRealmWorkerControlState?: typeof readWarpkeepGreaterRealmWorkerControlState;
  readWorkerRoster?: typeof readWarpkeepWorkerRoster;
  readResourceStateV2?: typeof readWarpkeepResourceStateV2;
  dispatchWorker?: typeof dispatchWarpkeepWorker;
  dispatchGreaterRealmWorker?: typeof dispatchWarpkeepGreaterRealmWorker;
  recallWorker?: typeof recallWarpkeepWorker;
  recallAllWorkers?: typeof recallAllWarpkeepWorkers;
  returnLegacyExpedition?: typeof returnWarpkeepLegacyExpedition;
  /** Optional only for older deterministic test/QA runtimes without v5 Gold. */
  readGoldExpeditionState?: typeof readWarpkeepGoldExpeditionState;
  /** Optional only for older deterministic test/QA runtimes without v5 Gold. */
  dispatchGoldExpedition?: typeof dispatchWarpkeepGoldExpedition;
  /** Optional only for older deterministic test/QA runtimes without v5 Gold. */
  collectGoldExpedition?: typeof collectWarpkeepGoldExpedition;
  /** Optional during the additive Food rollout or legacy test runtimes. */
  readFoodExpeditionState?: typeof readWarpkeepFoodExpeditionState;
  /** Optional during the additive Food rollout or legacy test runtimes. */
  dispatchFoodExpedition?: typeof dispatchWarpkeepFoodExpedition;
  /** Optional during the additive Food rollout or legacy test runtimes. */
  collectFoodExpedition?: typeof collectWarpkeepFoodExpedition;
  /** Optional during the additive Wood rollout or legacy test runtimes. */
  readWoodExpeditionState?: typeof readWarpkeepWoodExpeditionState;
  /** Optional during the additive Wood rollout or legacy test runtimes. */
  dispatchWoodExpedition?: typeof dispatchWarpkeepWoodExpedition;
  /** Optional during the additive Wood rollout or legacy test runtimes. */
  collectWoodExpedition?: typeof collectWarpkeepWoodExpedition;
  /** Optional during the additive Stone rollout or legacy test runtimes. */
  readStoneExpeditionState?: typeof readWarpkeepStoneExpeditionState;
  dispatchStoneExpedition?: typeof dispatchWarpkeepStoneExpedition;
  collectStoneExpedition?: typeof collectWarpkeepStoneExpedition;
  readInnerKeepProjection?: typeof readWarpkeepInnerKeepProjection;
  readInnerKeepRequestStatus?: typeof readWarpkeepInnerKeepRequestStatus;
  startInnerKeepProject?: typeof startWarpkeepInnerKeepProject;
  observeRealm: typeof observeWarpkeepRealm;
  readRealmSnapshot: typeof readWarpkeepRealmSnapshot;
  readRealmContinuity?: typeof readWarpkeepRealmContinuityProjection;
  subscribeRealm: typeof subscribeToWarpkeepRealm;
  observeRealmChat?: typeof observeWarpkeepRealmChat;
  readRealmChat?: typeof readWarpkeepRealmChat;
  readRealmChatRecent?: typeof readWarpkeepRealmChatRecent;
  subscribeRealmChat?: typeof subscribeToWarpkeepRealmChat;
  sendRealmChatMessage?: typeof sendWarpkeepRealmChatMessage;
  reportRealmChatMessage?: typeof reportWarpkeepRealmChatMessage;
  readRealmChatHistory?: typeof readWarpkeepRealmChatHistory;
}>;

export const DEFAULT_WARPKEEP_BACKEND_RUNTIME: WarpkeepBackendRuntime = Object.freeze({
  connect: connectWarpkeep,
  disconnect: disconnectWarpkeep,
  readBackendInfo: readWarpkeepBackendInfo,
  readAdmission: readWarpkeepAdmissionStatus,
  bootstrapPlayer: bootstrapWarpkeepPlayer,
  readEntryAgreementStatus: readWarpkeepEntryAgreementStatus,
  acceptAlphaTerms: acceptWarpkeepAlphaTerms,
  readResourceState: readWarpkeepResourceState,
  collectResources: collectWarpkeepResources,
  readWorkerControlState: readWarpkeepWorkerControlState,
  readGreaterRealmWorkerControlState: readWarpkeepGreaterRealmWorkerControlState,
  readWorkerRoster: readWarpkeepWorkerRoster,
  readResourceStateV2: readWarpkeepResourceStateV2,
  dispatchWorker: dispatchWarpkeepWorker,
  dispatchGreaterRealmWorker: dispatchWarpkeepGreaterRealmWorker,
  recallWorker: recallWarpkeepWorker,
  recallAllWorkers: recallAllWarpkeepWorkers,
  returnLegacyExpedition: returnWarpkeepLegacyExpedition,
  readGoldExpeditionState: readWarpkeepGoldExpeditionState,
  dispatchGoldExpedition: dispatchWarpkeepGoldExpedition,
  collectGoldExpedition: collectWarpkeepGoldExpedition,
  readFoodExpeditionState: readWarpkeepFoodExpeditionState,
  dispatchFoodExpedition: dispatchWarpkeepFoodExpedition,
  collectFoodExpedition: collectWarpkeepFoodExpedition,
  readWoodExpeditionState: readWarpkeepWoodExpeditionState,
  dispatchWoodExpedition: dispatchWarpkeepWoodExpedition,
  collectWoodExpedition: collectWarpkeepWoodExpedition,
  readStoneExpeditionState: readWarpkeepStoneExpeditionState,
  dispatchStoneExpedition: dispatchWarpkeepStoneExpedition,
  collectStoneExpedition: collectWarpkeepStoneExpedition,
  readInnerKeepProjection: readWarpkeepInnerKeepProjection,
  readInnerKeepRequestStatus: readWarpkeepInnerKeepRequestStatus,
  startInnerKeepProject: startWarpkeepInnerKeepProject,
  observeRealm: observeWarpkeepRealm,
  readRealmSnapshot: readWarpkeepRealmSnapshot,
  readRealmContinuity: readWarpkeepRealmContinuityProjection,
  subscribeRealm: subscribeToWarpkeepRealm,
  observeRealmChat: observeWarpkeepRealmChat,
  readRealmChat: readWarpkeepRealmChat,
  readRealmChatRecent: readWarpkeepRealmChatRecent,
  subscribeRealmChat: subscribeToWarpkeepRealmChat,
  sendRealmChatMessage: sendWarpkeepRealmChatMessage,
  reportRealmChatMessage: reportWarpkeepRealmChatMessage,
  readRealmChatHistory: readWarpkeepRealmChatHistory
});

export type WarpkeepSpacetimeProviderProps = Readonly<{
  children: ReactNode;
  config?: WarpkeepRuntimeConfig;
  runtime?: WarpkeepBackendRuntime;
}>;

const WarpkeepBackendContext = createContext<WarpkeepBackendControllerValue | undefined>(
  undefined
);

function presentationIdentity(
  state: ReturnType<typeof useFarcasterAuth>['state'],
  bridgeFid: number | undefined
): VerifiedFarcasterIdentity | undefined {
  return state.phase === 'authenticated'
    && state.assurance === 'bridge-oidc-alpha'
    && bridgeFid !== undefined
    // The browser identity is display metadata. It must at least agree with
    // the FID embedded in the token that SpacetimeDB validates.
    && state.identity.fid === bridgeFid
    ? state.identity
    : undefined;
}

type ExpeditionDispatchAttempt = Readonly<{
  generation: number;
  siteId: string;
  idempotencyKey: string;
}>;

export type RealmChatSendAttempt = Readonly<{
  fid: number;
  body: string;
  requestKey: string;
  createdAtMilliseconds: number;
}>;

export function realmChatSendAttemptFor(
  retained: RealmChatSendAttempt | undefined,
  fid: number,
  body: string,
  nowMilliseconds: number,
  createRequestKey: () => string | undefined
): RealmChatSendAttempt | undefined {
  if (
    !Number.isSafeInteger(fid)
    || fid <= 0
    || typeof body !== 'string'
    || body.trim().length === 0
    || body.length > 2_048
    || [...body].length > 500
    || body.split(/\r?\n/).length > 8
    || new TextEncoder().encode(body).byteLength > 2_048
    || !Number.isSafeInteger(nowMilliseconds)
    || nowMilliseconds < 0
  ) return undefined;
  if (
    retained?.fid === fid
    && retained.body === body
    && nowMilliseconds >= retained.createdAtMilliseconds
    && nowMilliseconds - retained.createdAtMilliseconds
      <= REALM_CHAT_SEND_RETRY_RETENTION_MILLISECONDS
  ) return retained;
  const requestKey = createRequestKey();
  return requestKey === undefined || !REALM_CHAT_REQUEST_KEY_PATTERN.test(requestKey)
    ? undefined
    : Object.freeze({
        fid,
        body,
        requestKey,
        createdAtMilliseconds: nowMilliseconds
      });
}

function dispatchAttemptFor(
  retained: ExpeditionDispatchAttempt | undefined,
  generation: number,
  siteId: string
): ExpeditionDispatchAttempt | undefined {
  if (retained?.generation === generation && retained.siteId === siteId) return retained;
  const idempotencyKey = createExpeditionIdempotencyKey();
  return idempotencyKey === undefined
    ? undefined
    : Object.freeze({ generation, siteId, idempotencyKey });
}

type ActiveExpeditionProjection = Readonly<{
  active: boolean;
  expedition?: Readonly<{
    siteId: string;
    originCastleId: number;
  }>;
}>;

type LegacyExpeditionProjection =
  | ReadyGoldExpeditionPresentation
  | ReadyFoodExpeditionPresentation
  | ReadyWoodExpeditionPresentation
  | ReadyStoneExpeditionPresentation;

function legacyExpeditionForResource(
  source: Readonly<{
    goldExpedition?: ReadyGoldExpeditionPresentation;
    foodExpedition?: ReadyFoodExpeditionPresentation;
    woodExpedition?: ReadyWoodExpeditionPresentation;
    stoneExpedition?: ReadyStoneExpeditionPresentation;
  }>,
  resourceKind: RealmEconomicResourceKey
): LegacyExpeditionProjection | undefined {
  if (resourceKind === 'gold') return source.goldExpedition;
  if (resourceKind === 'food') return source.foodExpedition;
  if (resourceKind === 'wood') return source.woodExpedition;
  return resourceKind === 'stone' ? source.stoneExpedition : undefined;
}

function legacyExpeditionCanReturn(
  projection: LegacyExpeditionProjection | undefined,
  expeditionId: string,
  originCastleId: number
) {
  return projection?.active === true
    && projection.expedition?.expeditionId === expeditionId
    && projection.expedition.originCastleId === originCastleId
    && (
      projection.expedition.phase === 'outbound'
      || projection.expedition.phase === 'gathering'
    );
}

function legacyExpeditionReturnConfirmed(
  projection: LegacyExpeditionProjection | undefined
) {
  return projection?.active === false && projection.expedition === undefined;
}

function activeExpeditionMatchesDispatch(
  projection: ActiveExpeditionProjection | undefined,
  siteId: string,
  originCastleId: number
) {
  return projection?.active === true
    && projection.expedition?.siteId === siteId
    && projection.expedition.originCastleId === originCastleId;
}

function activeExpeditionBelongsToCastle(
  projection: ActiveExpeditionProjection | undefined,
  originCastleId: number
) {
  return projection?.active !== true
    || projection.expedition?.originCastleId === originCastleId;
}

function backendError(identity: VerifiedFarcasterIdentity | undefined): WarpkeepBackendState {
  return {
    phase: 'error',
    workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
    ...(identity ? { identity } : {})
  };
}

function resourceProjectionIsAtLeastAsNew(
  candidate: ReadyRealmResourcePresentation,
  current: ReadyRealmResourcePresentation | undefined
) {
  return current === undefined
    || candidate.revision > current.revision
    || (
      candidate.revision === current.revision
      && candidate.observedAtMicros >= current.observedAtMicros
    );
}

function sealedInnerKeepPresentation(
  presentation: InnerKeepPresentation,
  phase: 'project-submitting' | 'synchronizing',
  statusMessage: string
): InnerKeepPresentation {
  return Object.freeze({
    ...presentation,
    phase,
    commandsEnabled: false,
    statusMessage
  });
}

function workerRosterIsAtLeastAsNew(
  candidate: WorkerRosterPresentation | undefined,
  current: WorkerRosterPresentation | undefined
) {
  if (current === undefined) return true;
  if (
    candidate === undefined
    || candidate.castleId !== current.castleId
    || candidate.observedAtMicros < current.observedAtMicros
    || candidate.workers.length !== current.workers.length
  ) return false;
  const currentById = new Map(current.workers.map((worker) => [worker.workerId, worker] as const));
  return candidate.workers.every((worker) => {
    const retained = currentById.get(worker.workerId);
    return retained !== undefined
      && worker.ordinal === retained.ordinal
      && worker.revision >= retained.revision
      && worker.observedAtMicros >= retained.observedAtMicros
      && (
        worker.revision !== retained.revision
        || (
          worker.status === retained.status
          && worker.resourceKind === retained.resourceKind
          && worker.siteId === retained.siteId
        )
      );
  });
}

function workerResourceStateIsAtLeastAsNew(
  candidate: ReadyWorkerResourceState | undefined,
  current: ReadyWorkerResourceState | undefined
) {
  if (current === undefined) return true;
  return candidate !== undefined
    && candidate.fid === current.fid
    && candidate.resourcePolicyVersion === current.resourcePolicyVersion
    && candidate.workerPolicyVersion === current.workerPolicyVersion
    && candidate.workerSystemMode === current.workerSystemMode
    && candidate.revision >= current.revision
    && candidate.observedAtMicros >= current.observedAtMicros
    && candidate.settledThroughMicros >= current.settledThroughMicros;
}

function workerProjectionPairIsAtLeastAsNew(
  candidateRoster: WorkerRosterPresentation | undefined,
  candidateResourceState: ReadyWorkerResourceState | undefined,
  currentRoster: WorkerRosterPresentation | undefined,
  currentResourceState: ReadyWorkerResourceState | undefined
) {
  return workerRosterIsAtLeastAsNew(candidateRoster, currentRoster)
    && workerResourceStateIsAtLeastAsNew(candidateResourceState, currentResourceState);
}

type WarpkeepWorkerRealmAuthority = WarpkeepRealmSnapshot | WarpkeepRealmContinuityProjection;

function workerAuthorityRealmId(authority: WarpkeepWorkerRealmAuthority) {
  return 'realm' in authority ? authority.realm.realmId : authority.realmId;
}

function continuityProjectionFromCanonicalRealm(
  snapshot: WarpkeepRealmSnapshot
): WarpkeepRealmContinuityProjection {
  return Object.freeze({
    realmId: snapshot.realm.realmId,
    players: snapshot.players,
    profiles: snapshot.profiles,
    castles: snapshot.castles,
    ownCastle: snapshot.ownCastle,
    ...(snapshot.goldSites === undefined ? {} : { goldSites: snapshot.goldSites }),
    ...(snapshot.foodSites === undefined ? {} : { foodSites: snapshot.foodSites }),
    ...(snapshot.woodSites === undefined ? {} : { woodSites: snapshot.woodSites }),
    ...(snapshot.stoneSites === undefined ? {} : { stoneSites: snapshot.stoneSites }),
    ...(snapshot.workerSystem === undefined ? {} : {
      workerSystem: snapshot.workerSystem
    }),
    ...(snapshot.workerWorkers === undefined ? {} : {
      workerWorkers: snapshot.workerWorkers
    }),
    ...(snapshot.workerOccupations === undefined ? {} : {
      workerOccupations: snapshot.workerOccupations
    })
  });
}

function activeWorkerProjection(
  snapshot: WarpkeepWorkerRealmAuthority,
  roster: WorkerRosterPresentation | undefined,
  resourceState: ReadyWorkerResourceState | undefined
): ReadyWorkerProjection | undefined {
  const resourceSites = workerResourceSites(snapshot);
  if (resourceSites === undefined) return undefined;
  return resolveReadyWorkerProjection({
    realmId: workerAuthorityRealmId(snapshot),
    castleIds: snapshot.castles.map((castle) => castle.castleId),
    ownCastleId: snapshot.ownCastle.castleId,
    expectedFid: BigInt(snapshot.ownCastle.ownerFid),
    system: snapshot.workerSystem,
    workers: snapshot.workerWorkers,
    occupations: snapshot.workerOccupations,
    resourceSites,
    roster,
    resourceState
  });
}

function activePublicWorkerProjection(
  snapshot: WarpkeepWorkerRealmAuthority
): ReadyPublicWorkerProjection | undefined {
  const resourceSites = workerResourceSites(snapshot);
  if (resourceSites === undefined) return undefined;
  return resolveReadyPublicWorkerProjection({
    realmId: workerAuthorityRealmId(snapshot),
    castleIds: snapshot.castles.map((castle) => castle.castleId),
    ownCastleId: snapshot.ownCastle.castleId,
    system: snapshot.workerSystem,
    workers: snapshot.workerWorkers,
    occupations: snapshot.workerOccupations,
    resourceSites
  });
}

function activeWorkerProjectionResolution(
  snapshot: WarpkeepWorkerRealmAuthority,
  roster: WorkerRosterPresentation | undefined,
  resourceState: ReadyWorkerResourceState | undefined
) {
  const resourceSites = workerResourceSites(snapshot);
  if (resourceSites === undefined) {
    return Object.freeze({
      status: 'invalid' as const,
      reason: 'public-graph-changed' as const
    });
  }
  return resolveReadyWorkerProjectionWithReason({
    realmId: workerAuthorityRealmId(snapshot),
    castleIds: snapshot.castles.map((castle) => castle.castleId),
    ownCastleId: snapshot.ownCastle.castleId,
    expectedFid: BigInt(snapshot.ownCastle.ownerFid),
    system: snapshot.workerSystem,
    workers: snapshot.workerWorkers,
    occupations: snapshot.workerOccupations,
    resourceSites,
    roster,
    resourceState
  });
}

function workerResourceSites(
  snapshot: WarpkeepWorkerRealmAuthority
): readonly RealmWorkerResourceSite[] | undefined {
  const buckets = Object.freeze([
    Object.freeze(['food', snapshot.foodSites] as const),
    Object.freeze(['wood', snapshot.woodSites] as const),
    Object.freeze(['stone', snapshot.stoneSites] as const),
    Object.freeze(['gold', snapshot.goldSites] as const)
  ]);
  if (buckets.some(([, sites]) => sites === undefined)) return undefined;
  const result: RealmWorkerResourceSite[] = [];
  for (const [resourceKind, sites] of buckets) {
    for (const site of sites!) {
      if (typeof site.active !== 'boolean') return undefined;
      if (!site.active) continue;
      result.push(Object.freeze({
        resourceKind,
        siteId: site.siteId,
        q: site.q,
        r: site.r
      }));
    }
  }
  return Object.freeze(result);
}

/**
 * Internal-only exact change key for the public Worker graph. It is never
 * logged or exposed through backend state; it only prevents unrelated public
 * Realm notifications from resetting the bounded private-read backoff.
 */
function workerPublicSyncRevision(snapshot: WarpkeepWorkerRealmAuthority) {
  if (
    snapshot.workerSystem?.mode !== 'active'
    || snapshot.workerWorkers === undefined
    || snapshot.workerOccupations === undefined
  ) return undefined;
  return JSON.stringify({
    system: [
      snapshot.workerSystem.policyVersion,
      snapshot.workerSystem.rosterDigest,
      snapshot.workerSystem.expectedCastleCount,
      snapshot.workerSystem.expectedWorkerCount
    ],
    workers: [...snapshot.workerWorkers]
      .sort((left, right) => left.workerId.localeCompare(right.workerId))
      .map((worker) => [
        worker.workerId,
        worker.status,
        worker.resourceKind ?? '',
        worker.siteId ?? '',
        worker.timelineRevision,
        worker.revision.toString()
      ]),
    occupations: [...snapshot.workerOccupations]
      .sort((left, right) => (
        left.nodeKey.localeCompare(right.nodeKey)
        || left.workerId.localeCompare(right.workerId)
      ))
      .map((occupation) => [
        occupation.workerId,
        occupation.nodeKey,
        occupation.phase,
        occupation.timelineRevision
      ])
  });
}

type CoherentWorkerProjectionPair = Readonly<{
  roster: WorkerRosterPresentation;
  resourceState: ReadyWorkerResourceState;
  projection: ReadyWorkerProjection;
}>;

type WorkerProjectionReadResult =
  | Readonly<{ status: 'ready'; pair: CoherentWorkerProjectionPair }>
  | Readonly<{
      status: 'failed';
      reason: WarpkeepWorkerPrivateSyncFailureReason;
    }>;

type GenerationBoundWorkerValue<Value> = Readonly<{
  generation: number;
  fid: number;
  value: Value;
}>;

type GenerationBoundInnerKeepProjection = Readonly<{
  generation: number;
  fid: number;
  castleId: bigint;
  value: ReadyInnerKeepProjection;
}>;

type GenerationBoundInnerKeepFailure = Readonly<{
  generation: number;
  fid: number;
  castleId: bigint;
  value: InnerKeepDefinitiveRejection;
}>;

type CurrentBridgeCommandAuthority = Readonly<{
  fid: number;
  jwt: string;
  expiresAt: number;
}>;

type ConnectionBridgeCommandAuthority = Readonly<{
  generation: number;
  fid: number;
  jwt: string;
}>;

async function readCoherentWorkerProjectionPair(input: Readonly<{
  expectedFid: bigint;
  readControlState?: () => Promise<WarpkeepWorkerControlStateReadResult | undefined>;
  readRoster?: () => Promise<WorkerRosterPresentation | undefined>;
  readResourceState?: () => Promise<ReadyWorkerResourceState | undefined>;
  readRealm: () => WarpkeepWorkerRealmAuthority | undefined;
  retainedPair: () => Readonly<{
    roster: WorkerRosterPresentation | undefined;
    resourceState: ReadyWorkerResourceState | undefined;
  }>;
  current: () => boolean;
}>): Promise<WorkerProjectionReadResult> {
  const failed = (
    reason: WarpkeepWorkerPrivateSyncFailureReason
  ): WorkerProjectionReadResult => Object.freeze({ status: 'failed', reason });
  const validatePair = (
    roster: WorkerRosterPresentation,
    resourceState: ReadyWorkerResourceState
  ): WorkerProjectionReadResult => {
    if (!input.current()) return failed('stale-generation');
    if (resourceState.fid !== input.expectedFid) return failed('wrong-caller');
    const retained = input.retainedPair();
    if (!workerProjectionPairIsAtLeastAsNew(
      roster,
      resourceState,
      retained.roster,
      retained.resourceState
    )) return failed('public-private-worker-revision-mismatch');
    const realm = input.readRealm();
    if (realm === undefined) return failed('public-graph-changed');
    const resolution = activeWorkerProjectionResolution(realm, roster, resourceState);
    if (resolution.status === 'invalid') return failed(resolution.reason);
    return Object.freeze({
      status: 'ready',
      pair: Object.freeze({
        roster,
        resourceState,
        projection: resolution.projection
      })
    });
  };

  if (!input.current()) return failed('stale-generation');
  if (input.readControlState !== undefined) {
    let controlState: WarpkeepWorkerControlStateReadResult | undefined;
    try {
      controlState = await withResourceOperationDeadline(input.readControlState());
    } catch (error) {
      return failed(
        error instanceof ResourceOperationDeadlineError
          ? 'control-state-timeout'
          : 'procedure-rejected'
      );
    }
    if (!input.current()) return failed('stale-generation');
    if (controlState !== undefined) {
      if (controlState.status === 'invalid') return failed(controlState.reason);
      return validatePair(
        controlState.value.roster,
        controlState.value.resourceState
      );
    }
  }

  if (input.readRoster === undefined) {
    return failed('roster-procedure-unavailable');
  }
  if (input.readResourceState === undefined) {
    return failed('resource-procedure-unavailable');
  }

  let lastCoherenceFailure: WorkerProjectionCoherenceFailure | undefined;
  for (
    let attempt = 0;
    attempt < MAX_WORKER_PROJECTION_PAIR_READ_ATTEMPTS;
    attempt += 1
  ) {
    if (!input.current()) return failed('stale-generation');
    const [rosterRead, resourceRead] = await Promise.all([
      withResourceOperationDeadline(input.readRoster())
        .then((value) => Object.freeze({ status: 'ready' as const, value }))
        .catch((error: unknown) => Object.freeze({
          status: 'failed' as const,
          reason: error instanceof ResourceOperationDeadlineError
            ? 'roster-timeout' as const
            : 'procedure-rejected' as const
        })),
      withResourceOperationDeadline(input.readResourceState())
        .then((value) => Object.freeze({ status: 'ready' as const, value }))
        .catch((error: unknown) => Object.freeze({
          status: 'failed' as const,
          reason: error instanceof ResourceOperationDeadlineError
            ? 'resource-timeout' as const
            : 'procedure-rejected' as const
        }))
    ]);
    if (!input.current()) return failed('stale-generation');
    if (rosterRead.status === 'failed') return failed(rosterRead.reason);
    if (resourceRead.status === 'failed') return failed(resourceRead.reason);
    if (rosterRead.value === undefined) return failed('roster-decode-invalid');
    if (resourceRead.value === undefined) return failed('resource-decode-invalid');
    const result = validatePair(rosterRead.value, resourceRead.value);
    if (result.status === 'ready') return result;
    if (
      result.reason !== 'public-graph-changed'
      && result.reason !== 'public-private-worker-revision-mismatch'
      && result.reason !== 'worker-status-or-site-mismatch'
      && result.reason !== 'pending-total-mismatch'
    ) {
      return result;
    }
    lastCoherenceFailure = result.reason;
    // These two caller-private procedures are independent reads. A settlement
    // at a minute quantum can advance the roster between the two responses, so
    // retry the complete pair once rather than publishing a torn projection.
  }
  return failed(lastCoherenceFailure ?? 'coherent-pair-exhausted');
}

function workerCommandLifecycleState(
  roster: WorkerRosterPresentation
): WorkerCommandLifecycleState {
  return Object.freeze({
    castleId: roster.castleId,
    workers: roster.workers
  });
}

function publicWorkerCommandLifecycleState(
  realm: WarpkeepWorkerRealmAuthority
): WorkerCommandLifecycleState | undefined {
  const projection = activePublicWorkerProjection(realm);
  if (projection === undefined) return undefined;
  const workers = projection.workers.filter((worker) => worker.ownedByViewer);
  if (workers.length !== 4) return undefined;
  return Object.freeze({
    castleId: realm.ownCastle.castleId,
    workers: Object.freeze(workers.map((worker) => Object.freeze({
      workerId: worker.workerId,
      status: worker.status,
      ...(worker.resourceKind === undefined ? {} : {
        resourceKind: worker.resourceKind
      }),
      ...(worker.siteId === undefined ? {} : { siteId: worker.siteId }),
      revision: worker.revision
    })))
  });
}

/**
 * A focused React provider around the generated client bindings. It bypasses
 * the SDK's URI/database-only connection cache so a sign-out or changed bridge
 * JWT always tears down the old authenticated WebSocket before a new one opens.
 */
export function WarpkeepSpacetimeProvider({
  children,
  config: suppliedConfig,
  runtime = DEFAULT_WARPKEEP_BACKEND_RUNTIME
}: WarpkeepSpacetimeProviderProps) {
  const farcaster = useFarcasterAuth();
  const config = useMemo(
    () => suppliedConfig ?? readWarpkeepRuntimeConfig(),
    [suppliedConfig]
  );
  const parsedSession = useMemo(() => (
    farcaster.oidcSession
      ? validateFarcasterOidcSession(farcaster.oidcSession)
      : undefined
  ), [farcaster.oidcSession]);
  const bridgeFid = parsedSession?.claims.fid;
  const bridgeAuthenticatedIdentity = farcaster.state.phase === 'authenticated'
    && farcaster.state.assurance === 'bridge-oidc-alpha'
    ? farcaster.state.identity
    : undefined;
  const bridgeAuthenticationContinuityKey = farcaster.state.phase === 'authenticated'
    ? `${farcaster.state.phase}:${farcaster.state.assurance}:${farcaster.state.identity.fid}`
    : farcaster.state.phase;
  const identity = presentationIdentity(farcaster.state, bridgeFid);
  const sharedAlphaAvailable = hasUsableWarpkeepBridge(config);
  const [state, setState] = useState<WarpkeepBackendState>(IDLE_WARPKEEP_BACKEND_STATE);
  const [realmChat, setRealmChat] = useState<RealmChatPresentation>(
    UNAVAILABLE_REALM_CHAT_PRESENTATION
  );
  const [checkSequence, setCheckSequence] = useState(0);
  const [acceptedEntryAgreementFid, setAcceptedEntryAgreementFid] =
    useState<number | undefined>(undefined);
  const connectionRef = useRef<WarpkeepConnection | undefined>(undefined);
  const currentBridgeCommandAuthorityRef =
    useRef<CurrentBridgeCommandAuthority | undefined>(undefined);
  const connectionBridgeCommandAuthorityRef =
    useRef<ConnectionBridgeCommandAuthority | undefined>(undefined);
  const teardownRef = useRef<(() => void) | undefined>(undefined);
  const generationRef = useRef(0);
  const stateRef = useRef(state);
  const canonicalRealmSourceRef = useRef<string | undefined>(undefined);
  const canonicalRealmSnapshotRef = useRef<Readonly<{
    generation: number;
    value: WarpkeepRealmSnapshot;
  }> | undefined>(undefined);
  const termsAttemptRef = useRef(0);
  const completedTermsAttemptRef = useRef(0);
  const termsIntentGenerationRef = useRef(0);
  const termsIdentityFidRef = useRef<number | undefined>(undefined);
  const collectingGenerationRef = useRef<number | undefined>(undefined);
  const resourceStateRef = useRef<Readonly<{
    generation: number;
    value: ReadyRealmResourcePresentation;
  }> | undefined>(undefined);
  const goldExpeditionStateRef = useRef<Readonly<{
    generation: number;
    value: ReadyGoldExpeditionPresentation | undefined;
  }> | undefined>(undefined);
  const goldExpeditionOperationGenerationRef = useRef<number | undefined>(undefined);
  const goldDispatchAttemptRef = useRef<ExpeditionDispatchAttempt | undefined>(undefined);
  const foodExpeditionStateRef = useRef<Readonly<{
    generation: number;
    value: ReadyFoodExpeditionPresentation | undefined;
  }> | undefined>(undefined);
  const foodExpeditionOperationGenerationRef = useRef<number | undefined>(undefined);
  const foodDispatchAttemptRef = useRef<ExpeditionDispatchAttempt | undefined>(undefined);
  const woodExpeditionStateRef = useRef<Readonly<{
    generation: number;
    value: ReadyWoodExpeditionPresentation | undefined;
  }> | undefined>(undefined);
  const woodExpeditionOperationGenerationRef = useRef<number | undefined>(undefined);
  const woodDispatchAttemptRef = useRef<ExpeditionDispatchAttempt | undefined>(undefined);
  const stoneExpeditionStateRef = useRef<Readonly<{
    generation: number;
    value: ReadyStoneExpeditionPresentation | undefined;
  }> | undefined>(undefined);
  const stoneExpeditionOperationGenerationRef = useRef<number | undefined>(undefined);
  const stoneDispatchAttemptRef = useRef<ExpeditionDispatchAttempt | undefined>(undefined);
  const legacyReturnOperationGenerationRef = useRef<number | undefined>(undefined);
  const workerRosterStateRef =
    useRef<GenerationBoundWorkerValue<WorkerRosterPresentation> | undefined>(undefined);
  const workerResourceStateRef =
    useRef<GenerationBoundWorkerValue<ReadyWorkerResourceState> | undefined>(undefined);
  const workerPrivateSyncStateRef =
    useRef<GenerationBoundWorkerValue<WarpkeepWorkerPrivateSyncStatus> | undefined>(undefined);
  const greaterRealmWorkerControlStateRef =
    useRef<GenerationBoundWorkerValue<ReadyGreaterRealmWorkerControlState> | undefined>(undefined);
  const workerCommandGenerationRef = useRef<number | undefined>(undefined);
  const workerCommandAttemptsRef = useRef(new Map<string, WorkerCommandAttempt>());
  const innerKeepProjectionRef =
    useRef<GenerationBoundInnerKeepProjection | undefined>(undefined);
  const innerKeepCommandAttemptRef = useRef<InnerKeepCommandAttempt | undefined>(undefined);
  const innerKeepDefinitiveFailureRef =
    useRef<GenerationBoundInnerKeepFailure | undefined>(undefined);
  const innerKeepOperationGenerationRef = useRef<number | undefined>(undefined);
  const transportReconnectAttemptRef = useRef(0);
  const requestWorkerPrivateSyncRef = useRef<() => void>(() => undefined);
  const requestGreaterRealmWorkerControlRef = useRef<() => void>(() => undefined);
  const requestInnerKeepSyncRef = useRef<() => void>(() => undefined);
  const processTermsAttemptRef = useRef<() => void>(() => undefined);
  const realmChatSendAttemptRef = useRef<RealmChatSendAttempt | undefined>(undefined);
  currentBridgeCommandAuthorityRef.current = identity !== undefined
    && farcaster.oidcSession !== undefined
    && farcaster.oidcSession.expiresAt > Date.now()
    ? Object.freeze({
        fid: identity.fid,
        jwt: farcaster.oidcSession.jwt,
        expiresAt: farcaster.oidcSession.expiresAt
      })
    : undefined;
  stateRef.current = state;

  const runActiveTeardown = useCallback(() => {
    const teardown = teardownRef.current;
    teardownRef.current = undefined;
    teardown?.();
  }, []);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    termsAttemptRef.current = 0;
    completedTermsAttemptRef.current = 0;
    termsIntentGenerationRef.current = 0;
    termsIdentityFidRef.current = undefined;
    setAcceptedEntryAgreementFid(undefined);
    collectingGenerationRef.current = undefined;
    resourceStateRef.current = undefined;
    goldExpeditionStateRef.current = undefined;
    goldExpeditionOperationGenerationRef.current = undefined;
    goldDispatchAttemptRef.current = undefined;
    foodExpeditionStateRef.current = undefined;
    foodExpeditionOperationGenerationRef.current = undefined;
    foodDispatchAttemptRef.current = undefined;
    woodExpeditionStateRef.current = undefined;
    woodExpeditionOperationGenerationRef.current = undefined;
    woodDispatchAttemptRef.current = undefined;
    stoneExpeditionStateRef.current = undefined;
    stoneExpeditionOperationGenerationRef.current = undefined;
    stoneDispatchAttemptRef.current = undefined;
    legacyReturnOperationGenerationRef.current = undefined;
    workerRosterStateRef.current = undefined;
    workerResourceStateRef.current = undefined;
    workerPrivateSyncStateRef.current = undefined;
    greaterRealmWorkerControlStateRef.current = undefined;
    workerCommandGenerationRef.current = undefined;
    workerCommandAttemptsRef.current.clear();
    innerKeepProjectionRef.current = undefined;
    innerKeepCommandAttemptRef.current = undefined;
    innerKeepDefinitiveFailureRef.current = undefined;
    innerKeepOperationGenerationRef.current = undefined;
    connectionBridgeCommandAuthorityRef.current = undefined;
    transportReconnectAttemptRef.current = 0;
    canonicalRealmSourceRef.current = undefined;
    canonicalRealmSnapshotRef.current = undefined;
    requestWorkerPrivateSyncRef.current = () => undefined;
    requestGreaterRealmWorkerControlRef.current = () => undefined;
    requestInnerKeepSyncRef.current = () => undefined;
    processTermsAttemptRef.current = () => undefined;
    realmChatSendAttemptRef.current = undefined;
    runActiveTeardown();
    // The effect-owned teardown normally consumes the connection. Keep this
    // fail-closed fallback for any connection installed by a runtime before
    // the effect can take ownership of it.
    const orphanedConnection = connectionRef.current;
    connectionRef.current = undefined;
    if (orphanedConnection) {
      try {
        runtime.disconnect(orphanedConnection);
      } catch {
        // Local authority is still cleared below even if an injected runtime
        // cannot finish its best-effort transport teardown.
      }
    }
    setState(IDLE_WARPKEEP_BACKEND_STATE);
    setRealmChat(UNAVAILABLE_REALM_CHAT_PRESENTATION);
  }, [runActiveTeardown, runtime]);

  const retryWorkerPrivateSync = useCallback(() => {
    if (stateRef.current.legacyRealmAuthority === 'retired') {
      requestGreaterRealmWorkerControlRef.current();
    } else {
      requestWorkerPrivateSyncRef.current();
    }
  }, []);

  const retryInnerKeepSync = useCallback(() => {
    innerKeepDefinitiveFailureRef.current = undefined;
    requestInnerKeepSyncRef.current();
  }, []);

  const startInnerKeepProject = useCallback(async (
    intent: InnerKeepProjectIntent
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const realm = currentState.realm ?? currentState.realmContinuity;
    const retainedProjection = innerKeepProjectionRef.current;
    const currentBridgeAuthority = currentBridgeCommandAuthorityRef.current;
    const connectionBridgeAuthority = connectionBridgeCommandAuthorityRef.current;
    const retainedCommandAttempt = innerKeepCommandAttemptRef.current;
    const operationAlreadyInFlight = innerKeepOperationGenerationRef.current === generation;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || connection === undefined
      || fid === undefined
      || realm === undefined
      || currentState.innerKeep === undefined
      || currentState.innerKeep.phase !== 'ready'
      || currentState.innerKeep.commandsEnabled !== true
      || retainedProjection?.generation !== generation
      || retainedProjection.fid !== fid
      || retainedProjection.castleId !== BigInt(realm.ownCastle.castleId)
      || retainedProjection.value.presentation !== currentState.innerKeep
      || realm.ownCastle.ownerFid !== fid
      || document.hidden
      || currentBridgeAuthority?.fid !== fid
      || currentBridgeAuthority.expiresAt <= Date.now()
      || connectionBridgeAuthority?.generation !== generation
      || connectionBridgeAuthority.fid !== fid
      || connectionBridgeAuthority.jwt !== currentBridgeAuthority.jwt
      || runtime.startInnerKeepProject === undefined
      || innerKeepDefinitiveFailureRef.current?.generation === generation
      || operationAlreadyInFlight
    ) {
      if (retainedCommandAttempt !== undefined || operationAlreadyInFlight) {
        throw new Error('Inner Keep construction status is uncertain.');
      }
      throw new InnerKeepProjectNoCommitError(
        'Inner Keep construction is unavailable.'
      );
    }
    const existingBuilding = currentState.innerKeep.buildings.find((building) => (
      building.buildingKind === intent.buildingKind
    ));
    const placement = intent.kind === 'construct'
      ? intent.placement
      : existingBuilding?.placement;
    const placementValid = placement !== undefined && (
      intent.kind === 'upgrade'
        ? existingBuilding?.phase === 'complete'
        : existingBuilding === undefined
          && evaluateInnerKeepPlacementDraft(
            intent.buildingKind,
            placement,
            currentState.innerKeep.buildings,
          ).evaluation.valid
    );
    const quote = currentState.innerKeep.quotes.find((candidate) => (
      candidate.buildingKind === intent.buildingKind
      && candidate.available
    ));
    if (
      !placementValid
      || placement === undefined
      || quote === undefined
      || !innerKeepQuoteAffordable(quote, currentState.innerKeep.resources.available)
      || INNER_KEEP_RESOURCE_ORDER.some((resource) => (
        currentState.innerKeep!.resources.available[resource] < quote.cost[resource]
      ))
    ) throw new InnerKeepProjectNoCommitError(
      'Inner Keep construction is unavailable.'
    );
    const existingAttempt = innerKeepCommandAttemptRef.current;
    const attempt = innerKeepCommandAttemptFor(
      existingAttempt,
      retainedProjection.value.scope,
      Object.freeze({
        buildingKind: intent.buildingKind,
        placement,
        targetLevel: quote.targetLevel,
        cost: quote.cost,
        durationMicros: quote.durationMicros
      })
    );
    if (attempt === undefined) {
      throw new InnerKeepProjectNoCommitError(
        'Inner Keep construction is unavailable.'
      );
    }
    if (existingAttempt === attempt) {
      // An ambiguous request is reconciled by reads only. Never resend it from
      // a second click even though the retained key remains available.
      requestInnerKeepSyncRef.current();
      throw new Error('Inner Keep construction is awaiting Realm confirmation.');
    }

    // Install both guards before the reducer promise can execute: two clicks
    // in one event turn cannot create two request keys or two server calls.
    innerKeepOperationGenerationRef.current = generation;
    innerKeepCommandAttemptRef.current = attempt;
    const submitting = sealedInnerKeepPresentation(
      currentState.innerKeep,
      'project-submitting',
      'Submitting this exact quote to the Realm.'
    );
    innerKeepProjectionRef.current = Object.freeze({
      ...retainedProjection,
      value: Object.freeze({
        ...retainedProjection.value,
        presentation: submitting
      })
    });
    setState((latest) => (
      generationRef.current === generation
      && latest.phase === 'ready'
      && latest.identity?.fid === fid
      && latest.innerKeep === currentState.innerKeep
        ? { ...latest, innerKeep: submitting }
        : latest
    ));
    try {
      await withResourceOperationDeadline(runtime.startInnerKeepProject(
        connection,
        intent.buildingKind,
        placement,
        attempt.requestKey,
        attempt.intent.targetLevel,
        attempt.scope.projectRevision.toString(),
        attempt.scope.policyDigest,
        attempt.scope.layoutDigest
      ));
      if (
        generationRef.current !== generation
        || connectionRef.current !== connection
        || innerKeepCommandAttemptRef.current !== attempt
      ) throw new Error('Inner Keep construction is unavailable.');
      innerKeepCommandAttemptRef.current = innerKeepCommandAttemptWithPhase(
        attempt,
        'awaiting-authority'
      );
      requestInnerKeepSyncRef.current();
    } catch (error) {
      const attemptIsCurrent = (
        generationRef.current === generation
        && connectionRef.current === connection
        && innerKeepCommandAttemptRef.current?.fingerprint === attempt.fingerprint
      );
      const definitive = classifyInnerKeepDefinitiveRejection(error);
      if (attemptIsCurrent && definitive !== undefined) {
        // A reviewed SDK SenderError proves this transaction rolled back. Only
        // that exact attempt may be cleared; fixed copy replaces raw server text.
        innerKeepCommandAttemptRef.current = undefined;
        innerKeepDefinitiveFailureRef.current = Object.freeze({
          generation,
          fid,
          castleId: attempt.scope.castleId,
          value: definitive
        });
        const currentProjection = innerKeepProjectionRef.current;
        const failureBase = currentProjection?.generation === generation
          && currentProjection.fid === fid
          && currentProjection.castleId === attempt.scope.castleId
          ? currentProjection.value.presentation
          : submitting;
        const failedPresentation: InnerKeepPresentation = Object.freeze({
          ...failureBase,
          phase: 'failed',
          commandsEnabled: false,
          statusMessage: definitive.statusMessage
        });
        if (
          currentProjection?.generation === generation
          && currentProjection.fid === fid
          && currentProjection.castleId === attempt.scope.castleId
        ) {
          innerKeepProjectionRef.current = Object.freeze({
            ...currentProjection,
            value: Object.freeze({
              ...currentProjection.value,
              presentation: failedPresentation
            })
          });
        }
        setState((latest) => (
          generationRef.current === generation
          && latest.phase === 'ready'
          && latest.identity?.fid === fid
          && (latest.realm ?? latest.realmContinuity)?.ownCastle.castleId
            === realm.ownCastle.castleId
            ? { ...latest, innerKeep: failedPresentation }
            : latest
        ));
        requestInnerKeepSyncRef.current();
        throw new InnerKeepProjectNoCommitError(definitive.statusMessage);
      }
      if (attemptIsCurrent) {
        // Transport rejection can still be commit-ambiguous. Keep the exact
        // key sealed until the private receipt and public project agree. Plain
        // and unknown SenderErrors deliberately remain in this branch.
        innerKeepCommandAttemptRef.current = innerKeepCommandAttemptWithPhase(
          attempt,
          'ambiguous'
        );
        requestInnerKeepSyncRef.current();
      }
      throw new Error('Inner Keep construction status is uncertain.');
    } finally {
      if (innerKeepOperationGenerationRef.current === generation) {
        innerKeepOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const requireRealmChatCommand = useCallback(() => {
    const latest = stateRef.current;
    const connection = connectionRef.current;
    if (
      !WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED
      || latest.phase !== 'ready'
      || latest.admission !== 'ready'
      || connection === undefined
      || typeof document === 'undefined'
      || document.hidden
      || realmChat.availability !== 'ready'
      || realmChat.mode !== 'active'
    ) throw new Error('Realm Chat is unavailable.');
    return connection;
  }, [realmChat]);

  const sendRealmChatMessage = useCallback(async (body: string) => {
    const connection = requireRealmChatCommand();
    if (runtime.sendRealmChatMessage === undefined || typeof body !== 'string') {
      throw new Error('Realm Chat is unavailable.');
    }
    const latest = stateRef.current;
    const fid = latest.identity?.fid;
    if (fid === undefined) throw new Error('Realm Chat is unavailable.');
    const now = Date.now();
    const attempt = realmChatSendAttemptFor(
      realmChatSendAttemptRef.current,
      fid,
      body,
      now,
      () => globalThis.crypto?.randomUUID?.()
    );
    if (attempt === undefined) throw new Error('Realm Chat is unavailable.');
    realmChatSendAttemptRef.current = attempt;
    await withResourceOperationDeadline(
      runtime.sendRealmChatMessage(connection, attempt.requestKey, body)
    );
    if (realmChatSendAttemptRef.current === attempt) {
      realmChatSendAttemptRef.current = undefined;
    }
  }, [requireRealmChatCommand, runtime]);

  const reportRealmChatMessage = useCallback(async (
    messageId: string,
    category: string,
    details: string
  ) => {
    const connection = requireRealmChatCommand();
    if (runtime.reportRealmChatMessage === undefined) {
      throw new Error('Realm Chat is unavailable.');
    }
    await withResourceOperationDeadline(
      runtime.reportRealmChatMessage(connection, messageId, category, details)
    );
  }, [requireRealmChatCommand, runtime]);

  const loadEarlierRealmChat = useCallback(async (
    beforeSequence: bigint,
    limit = 50
  ) => {
    const connection = requireRealmChatCommand();
    if (runtime.readRealmChatHistory === undefined) {
      throw new Error('Realm Chat is unavailable.');
    }
    return withResourceOperationDeadline(
      runtime.readRealmChatHistory(connection, beforeSequence, limit)
    );
  }, [requireRealmChatCommand, runtime]);

  const collectResources = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.resources === undefined
      || connection === undefined
      || fid === undefined
      || collectingGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) return;
    collectingGenerationRef.current = generation;
    try {
      // A reducer timeout is commit-ambiguous. Tear down this generation and
      // reconcile through a fresh caller-bound read; never retry collection.
      const resources = await withResourceOperationDeadline(
        runtime.collectResources(connection, fid)
      );
      if (generationRef.current !== generation) return;
      if (resources.fid !== BigInt(fid)) {
        throw new Error('Warpkeep resource projection identity mismatch.');
      }
      const retained = resourceStateRef.current?.generation === generation
        ? resourceStateRef.current.value
        : undefined;
      if (!resourceProjectionIsAtLeastAsNew(resources, retained)) return;
      resourceStateRef.current = Object.freeze({ generation, value: resources });
      setState((latest) => {
        const latestRetained = resourceStateRef.current?.generation === generation
          ? resourceStateRef.current.value
          : undefined;
        if (
          generationRef.current !== generation
          || resources.fid !== BigInt(fid)
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || (latest.realm ?? latest.realmContinuity) === undefined
          || latest.resources === undefined
          || latest.resources.fid !== resources.fid
          || !resourceProjectionIsAtLeastAsNew(resources, latestRetained)
          || !resourceProjectionIsAtLeastAsNew(resources, latest.resources)
        ) return latest;
        return { ...latest, resources };
      });
    } catch {
      if (generationRef.current === generation) {
        // Retirement may land while an already-authorized collection is in
        // flight. Recheck current world authority so that late transport
        // failure cannot tear down the surviving castle-scoped subscriptions.
        if (stateRef.current.legacyRealmAuthority !== 'retired') {
          canonicalRealmSourceRef.current = undefined;
          runActiveTeardown();
          setState(backendError(currentState.identity));
        }
      }
    } finally {
      if (collectingGenerationRef.current === generation) {
        collectingGenerationRef.current = undefined;
      }
    }
  }, [runActiveTeardown, runtime]);

  const runWorkerCommand = useCallback(async (
    fingerprint: WorkerCommandFingerprint,
    command: (connection: WarpkeepConnection, idempotencyKey: string) => Promise<unknown>
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const privateSync = workerPrivateSyncStateRef.current;
    const currentRoster = workerRosterStateRef.current;
    const currentWorkerResources = workerResourceStateRef.current;
    const currentBridgeAuthority = currentBridgeCommandAuthorityRef.current;
    const connectionBridgeAuthority = connectionBridgeCommandAuthorityRef.current;
    if (
      currentState.phase !== 'ready' || currentState.admission !== 'ready'
      || currentState.legacyRealmAuthority === 'retired'
      || currentState.workerProjection?.mode !== 'active' || connection === undefined || fid === undefined
      || currentState.workerRoster === undefined || currentState.workerResourceState === undefined
      || currentState.workerPrivateSync.phase !== 'ready'
      || currentState.workerPrivateSync.commandsEnabled !== true
      || document.hidden
      || privateSync?.generation !== generation || privateSync.fid !== fid
      || privateSync.value.phase !== 'ready'
      || privateSync.value.commandsEnabled !== true
      || currentRoster?.generation !== generation || currentRoster.fid !== fid
      || currentWorkerResources?.generation !== generation || currentWorkerResources.fid !== fid
      || currentBridgeAuthority?.fid !== fid
      || currentBridgeAuthority.expiresAt <= Date.now()
      || connectionBridgeAuthority?.generation !== generation
      || connectionBridgeAuthority.fid !== fid
      || connectionBridgeAuthority.jwt !== currentBridgeAuthority.jwt
      || (
        runtime.readWorkerControlState === undefined
        && (runtime.readWorkerRoster === undefined || runtime.readResourceStateV2 === undefined)
      )
      || workerCommandGenerationRef.current === generation
    ) throw new Error('Worker command is unavailable.');
    const serializedFingerprint = serializeWorkerCommandFingerprint(fingerprint);
    if (
      !workerCommandAttemptsRef.current.has(serializedFingerprint)
      && workerCommandAttemptsRef.current.size >= MAX_RETAINED_WORKER_COMMAND_ATTEMPTS
    ) throw new Error('Worker command is unavailable.');
    const attempt = workerCommandAttemptFor(
      workerCommandAttemptsRef.current.get(serializedFingerprint),
      generation,
      fingerprint,
      workerCommandLifecycleState(currentState.workerRoster)
    );
    if (attempt === undefined) throw new Error('Worker command is unavailable.');
    workerCommandGenerationRef.current = generation;
    workerCommandAttemptsRef.current.set(serializedFingerprint, attempt);
    try {
      await withResourceOperationDeadline(command(connection, attempt.idempotencyKey));
      const commandIsCurrent = () => {
        const latest = stateRef.current;
        return generationRef.current === generation
          && connectionRef.current === connection
          && currentBridgeCommandAuthorityRef.current?.fid === fid
          && currentBridgeCommandAuthorityRef.current.expiresAt > Date.now()
          && connectionBridgeCommandAuthorityRef.current?.generation === generation
          && connectionBridgeCommandAuthorityRef.current.fid === fid
          && connectionBridgeCommandAuthorityRef.current.jwt
            === currentBridgeCommandAuthorityRef.current.jwt
          && !document.hidden
          && latest.phase === 'ready'
          && latest.admission === 'ready'
          && latest.identity?.fid === fid
          && latest.realm !== undefined;
      };
      const pairResult = await readCoherentWorkerProjectionPair({
        expectedFid: BigInt(fid),
        ...(runtime.readWorkerControlState === undefined ? {} : {
          readControlState: () => runtime.readWorkerControlState!(connection, fid)
        }),
        ...(runtime.readWorkerRoster === undefined ? {} : {
          readRoster: () => runtime.readWorkerRoster!(connection, fid)
        }),
        ...(runtime.readResourceStateV2 === undefined ? {} : {
          readResourceState: () => runtime.readResourceStateV2!(connection, fid)
        }),
        readRealm: () => {
          const validatedRealm = canonicalRealmSnapshotRef.current;
          return validatedRealm?.generation === generation
            ? validatedRealm.value
            : undefined;
        },
        retainedPair: () => ({
          roster: workerRosterStateRef.current?.generation === generation
            && workerRosterStateRef.current.fid === fid
            ? workerRosterStateRef.current.value
            : undefined,
          resourceState: workerResourceStateRef.current?.generation === generation
            && workerResourceStateRef.current.fid === fid
            ? workerResourceStateRef.current.value
            : undefined
        }),
        current: commandIsCurrent
      });
      if (pairResult.status === 'failed') {
        throw new WorkerPrivateSyncFailureError(pairResult.reason);
      }
      if (!commandIsCurrent()) throw new WorkerPrivateSyncFailureError('stale-generation');
      const pair = pairResult.pair;
      const { roster, resourceState } = pair;
      const retainedRoster = workerRosterStateRef.current?.generation === generation
        && workerRosterStateRef.current.fid === fid
        ? workerRosterStateRef.current.value
        : undefined;
      const retainedResourceState = workerResourceStateRef.current?.generation === generation
        && workerResourceStateRef.current.fid === fid
        ? workerResourceStateRef.current.value
        : undefined;
      if (!workerProjectionPairIsAtLeastAsNew(
        roster,
        resourceState,
        retainedRoster,
        retainedResourceState
      )) {
        throw new WorkerPrivateSyncFailureError(
          'public-private-worker-revision-mismatch'
        );
      }
      const refreshedLifecycle = workerCommandLifecycleState(roster);
      for (const [retainedFingerprint, retainedAttempt] of workerCommandAttemptsRef.current) {
        if (!workerCommandAttemptMatchesLifecycle(retainedAttempt, generation, refreshedLifecycle)) {
          workerCommandAttemptsRef.current.delete(retainedFingerprint);
        }
      }
      const readyPrivateSync = workerPrivateSyncStatus({
        phase: 'ready',
        lastSuccessGeneration: generation,
        lastSuccessRevision: workerPrivatePairRevision(roster, resourceState),
        localizedFailureCount: privateSync.value.localizedFailureCount,
        readyLatencyMilliseconds: privateSync.value.readyLatencyMilliseconds,
        commandsEnabled: true
      });
      workerRosterStateRef.current = Object.freeze({ generation, fid, value: roster });
      workerResourceStateRef.current = Object.freeze({ generation, fid, value: resourceState });
      workerPrivateSyncStateRef.current =
        Object.freeze({ generation, fid, value: readyPrivateSync });
      setState((latest) => {
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || !workerProjectionPairIsAtLeastAsNew(
            roster,
            resourceState,
            latest.workerRoster,
            latest.workerResourceState
          )
        ) return latest;
        const workerProjection = activeWorkerProjection(latest.realm, roster, resourceState);
        if (workerProjection === undefined) return latest;
        return {
          ...latest,
          workerRoster: roster,
          workerResourceState: resourceState,
          workerProjection,
          workerPrivateSync: readyPrivateSync
        };
      });
      if (workerCommandAttemptsRef.current.get(serializedFingerprint) === attempt) {
        workerCommandAttemptsRef.current.delete(serializedFingerprint);
      }
    } catch (error) {
      const retainedProjection = stateRef.current.workerProjection;
      if (
        error instanceof WorkerPrivateSyncFailureError
        && generationRef.current === generation
        && stateRef.current.identity?.fid === fid
        && stateRef.current.phase === 'ready'
      ) {
        const previousSync = workerPrivateSyncStateRef.current?.generation === generation
          && workerPrivateSyncStateRef.current.fid === fid
          ? workerPrivateSyncStateRef.current.value
          : currentState.workerPrivateSync;
        const stalePrivateSync = workerPrivateSyncStatus({
          phase: retainedProjection === undefined ? 'failed-localized' : 'stale-read-only',
          retainedStale: retainedProjection !== undefined,
          localizedFailureCount: previousSync.localizedFailureCount + 1,
          failureReason: error.reason,
          lastSuccessGeneration: previousSync.lastSuccessGeneration,
          lastSuccessRevision: previousSync.lastSuccessRevision,
          readyLatencyMilliseconds: previousSync.readyLatencyMilliseconds
        });
        workerPrivateSyncStateRef.current =
          Object.freeze({ generation, fid, value: stalePrivateSync });
        setState((latest) => (
          generationRef.current === generation
          && latest.phase === 'ready'
          && latest.identity?.fid === fid
            ? { ...latest, workerPrivateSync: stalePrivateSync }
            : latest
        ));
        // Reconcile through read-only procedures. The mutation itself is never
        // retried automatically after an ambiguous response.
        requestWorkerPrivateSyncRef.current();
      } else if (
        generationRef.current === generation
        && stateRef.current.identity?.fid === fid
        && stateRef.current.phase === 'ready'
      ) {
        // A rejected or commit-ambiguous reducer response is not evidence that
        // the retained private read is corrupt. Reconcile once without
        // disabling an otherwise coherent caller projection.
        requestWorkerPrivateSyncRef.current();
      }
      throw new Error('Worker command is unavailable.');
    } finally {
      if (workerCommandGenerationRef.current === generation) workerCommandGenerationRef.current = undefined;
    }
  }, [runtime]);

  const runWorkerRecallCommand = useCallback(async (
    fingerprint: Extract<WorkerCommandFingerprint, { kind: 'recall' | 'recall-all' }>,
    command: (
      connection: WarpkeepConnection,
      idempotencyKey: string
    ) => Promise<unknown>
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const realm = currentState.realm;
    const currentBridgeAuthority = currentBridgeCommandAuthorityRef.current;
    const connectionBridgeAuthority = connectionBridgeCommandAuthorityRef.current;
    const publicLifecycle = realm === undefined
      ? undefined
      : publicWorkerCommandLifecycleState(realm);
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || connection === undefined
      || fid === undefined
      || realm === undefined
      || realm.ownCastle.ownerFid !== fid
      || publicLifecycle === undefined
      || document.hidden
      || currentBridgeAuthority?.fid !== fid
      || currentBridgeAuthority.expiresAt <= Date.now()
      || connectionBridgeAuthority?.generation !== generation
      || connectionBridgeAuthority.fid !== fid
      || connectionBridgeAuthority.jwt !== currentBridgeAuthority.jwt
      || workerCommandGenerationRef.current === generation
    ) throw new Error('Worker command is unavailable.');

    const serializedFingerprint = serializeWorkerCommandFingerprint(fingerprint);
    if (
      !workerCommandAttemptsRef.current.has(serializedFingerprint)
      && workerCommandAttemptsRef.current.size >= MAX_RETAINED_WORKER_COMMAND_ATTEMPTS
    ) throw new Error('Worker command is unavailable.');
    const attempt = workerCommandAttemptFor(
      workerCommandAttemptsRef.current.get(serializedFingerprint),
      generation,
      fingerprint,
      publicLifecycle
    );
    if (attempt === undefined) throw new Error('Worker command is unavailable.');
    workerCommandGenerationRef.current = generation;
    workerCommandAttemptsRef.current.set(serializedFingerprint, attempt);
    try {
      await withResourceOperationDeadline(command(connection, attempt.idempotencyKey));
      // Public subscriptions own the visible return. A successful reducer
      // response never invents a local status, releases a node, or moves a
      // Worker; the retained key remains bound to this lifecycle until the
      // authoritative projection changes.
      requestWorkerPrivateSyncRef.current();
    } catch {
      // Commit-ambiguous retries are manual and reuse this exact lifecycle key.
      throw new Error('Worker command is unavailable.');
    } finally {
      if (workerCommandGenerationRef.current === generation) {
        workerCommandGenerationRef.current = undefined;
      }
    }
  }, []);

  const runGreaterRealmWorkerCommand = useCallback(async (
    fingerprint: Extract<WorkerCommandFingerprint, {
      kind: 'dispatch-v2' | 'recall' | 'recall-all';
    }>,
    command: (
      connection: WarpkeepConnection,
      idempotencyKey: string
    ) => Promise<unknown>
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const control = greaterRealmWorkerControlStateRef.current;
    const currentBridgeAuthority = currentBridgeCommandAuthorityRef.current;
    const connectionBridgeAuthority = connectionBridgeCommandAuthorityRef.current;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.legacyRealmAuthority !== 'retired'
      || connection === undefined
      || fid === undefined
      || control?.generation !== generation
      || control.fid !== fid
      || currentState.greaterRealmWorkerControl !== control.value
      || currentState.realmContinuity?.ownCastle.ownerFid !== fid
      || currentState.realmContinuity.ownCastle.castleId !== control.value.value.roster.castleId
      || document.hidden
      || currentBridgeAuthority?.fid !== fid
      || currentBridgeAuthority.expiresAt <= Date.now()
      || connectionBridgeAuthority?.generation !== generation
      || connectionBridgeAuthority.fid !== fid
      || connectionBridgeAuthority.jwt !== currentBridgeAuthority.jwt
      || workerCommandGenerationRef.current === generation
    ) throw new Error('Greater Realm Worker command is unavailable.');

    const serializedFingerprint = serializeWorkerCommandFingerprint(fingerprint);
    if (
      !workerCommandAttemptsRef.current.has(serializedFingerprint)
      && workerCommandAttemptsRef.current.size >= MAX_RETAINED_WORKER_COMMAND_ATTEMPTS
    ) throw new Error('Greater Realm Worker command is unavailable.');
    const attempt = workerCommandAttemptFor(
      workerCommandAttemptsRef.current.get(serializedFingerprint),
      generation,
      fingerprint,
      workerCommandLifecycleState(control.value.value.roster)
    );
    if (attempt === undefined) throw new Error('Greater Realm Worker command is unavailable.');
    workerCommandGenerationRef.current = generation;
    workerCommandAttemptsRef.current.set(serializedFingerprint, attempt);
    try {
      await withResourceOperationDeadline(command(connection, attempt.idempotencyKey));
      requestGreaterRealmWorkerControlRef.current();
    } catch {
      // A manual retry against the unchanged own-worker lifecycle reuses the key.
      requestGreaterRealmWorkerControlRef.current();
      throw new Error('Greater Realm Worker command is unavailable.');
    } finally {
      if (workerCommandGenerationRef.current === generation) {
        workerCommandGenerationRef.current = undefined;
      }
    }
  }, []);

  const dispatchWorker = useCallback((
    workerId: string,
    resourceKind: RealmEconomicResourceKey,
    siteId: string
  ) => {
    const projection = stateRef.current.workerProjection;
    const worker = projection?.ownedWorkers.find((candidate) => candidate.workerId === workerId);
    if (
      worker?.status !== 'idle'
      || projection?.occupations.some((occupation) => (
        occupation.nodeKey === `${resourceKind}:${siteId}`
      ))
    ) return Promise.reject(new Error('Worker command is unavailable.'));
    return runWorkerCommand({ kind: 'dispatch', workerId, resourceKind, siteId }, (connection, idempotencyKey) => {
      if (runtime.dispatchWorker === undefined) return Promise.reject(new Error('Worker command is unavailable.'));
      return runtime.dispatchWorker(connection, workerId, resourceKind, siteId, idempotencyKey);
    });
  }, [runWorkerCommand, runtime]);

  const dispatchGreaterRealmWorker = useCallback((
    workerId: string,
    resourceKind: RealmEconomicResourceKey,
    locationId: string,
    expectedRevision: bigint
  ) => {
    const control = stateRef.current.greaterRealmWorkerControl;
    const worker = control?.value.roster.workers.find(
      candidate => candidate.workerId === workerId
    );
    if (
      control?.value.resourceState.workerSystemMode !== 'active'
      || control.atlasRevision !== expectedRevision
      || worker?.status !== 'idle'
    ) return Promise.reject(new Error('Greater Realm Worker command is unavailable.'));
    return runGreaterRealmWorkerCommand({
      kind: 'dispatch-v2',
      workerId,
      resourceKind,
      locationId,
      expectedRevision
    }, (connection, idempotencyKey) => {
      if (runtime.dispatchGreaterRealmWorker === undefined) {
        return Promise.reject(new Error('Greater Realm Worker command is unavailable.'));
      }
      return runtime.dispatchGreaterRealmWorker(
        connection,
        workerId,
        resourceKind,
        locationId,
        expectedRevision,
        idempotencyKey
      );
    });
  }, [runGreaterRealmWorkerCommand, runtime]);

  const recallWorker = useCallback((workerId: string) => {
    if (stateRef.current.legacyRealmAuthority === 'retired') {
      const worker = stateRef.current.greaterRealmWorkerControl?.value.roster.workers.find(
        candidate => candidate.workerId === workerId
      );
      if (worker?.status !== 'outbound' && worker?.status !== 'gathering') {
        return Promise.reject(new Error('Worker command is unavailable.'));
      }
      return runGreaterRealmWorkerCommand(
        { kind: 'recall', workerId },
        (connection, idempotencyKey) => {
          if (runtime.recallWorker === undefined) {
            return Promise.reject(new Error('Worker command is unavailable.'));
          }
          return runtime.recallWorker(connection, workerId, idempotencyKey);
        }
      );
    }
    const realm = stateRef.current.realm;
    const worker = realm === undefined
      ? undefined
      : activePublicWorkerProjection(realm)?.workers.find(
      (candidate) => candidate.workerId === workerId
    );
    if (
      !worker?.ownedByViewer
      || (worker.status !== 'outbound' && worker.status !== 'gathering')
    ) {
      return Promise.reject(new Error('Worker command is unavailable.'));
    }
    return runWorkerRecallCommand({ kind: 'recall', workerId }, (connection, idempotencyKey) => {
      if (runtime.recallWorker === undefined) return Promise.reject(new Error('Worker command is unavailable.'));
      return runtime.recallWorker(connection, workerId, idempotencyKey);
    });
  }, [runGreaterRealmWorkerCommand, runWorkerRecallCommand, runtime]);

  const recallAllWorkers = useCallback(() => {
    if (stateRef.current.legacyRealmAuthority === 'retired') {
      const roster = stateRef.current.greaterRealmWorkerControl?.value.roster;
      const recallable = roster?.workers.some(
        worker => worker.status === 'outbound' || worker.status === 'gathering'
      );
      if (roster === undefined || !recallable) {
        return Promise.reject(new Error('Worker command is unavailable.'));
      }
      return runGreaterRealmWorkerCommand(
        { kind: 'recall-all', castleId: roster.castleId },
        (connection, idempotencyKey) => {
          if (runtime.recallAllWorkers === undefined) {
            return Promise.reject(new Error('Worker command is unavailable.'));
          }
          return runtime.recallAllWorkers(connection, idempotencyKey);
        }
      );
    }
    const realm = stateRef.current.realm;
    const castleId = realm?.ownCastle.castleId;
    const recallable = realm !== undefined && activePublicWorkerProjection(realm)?.workers.some(
      (worker) => worker.ownedByViewer
        && (worker.status === 'outbound' || worker.status === 'gathering')
    );
    if (castleId === undefined || !recallable) {
      return Promise.reject(new Error('Worker command is unavailable.'));
    }
    return runWorkerRecallCommand({ kind: 'recall-all', castleId }, (connection, idempotencyKey) => {
      if (runtime.recallAllWorkers === undefined) return Promise.reject(new Error('Worker command is unavailable.'));
      return runtime.recallAllWorkers(connection, idempotencyKey);
    });
  }, [runGreaterRealmWorkerCommand, runWorkerRecallCommand, runtime]);

  const dispatchGoldExpedition = useCallback(async (siteId: string) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const retainedExpedition = goldExpeditionStateRef.current?.generation === generation
      ? goldExpeditionStateRef.current.value
      : undefined;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.goldExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.dispatchGoldExpedition === undefined
      || retainedExpedition?.active === true
      || goldExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) {
      throw new Error('Gold expedition is unavailable.');
    }
    const attempt = dispatchAttemptFor(
      goldDispatchAttemptRef.current,
      generation,
      siteId
    );
    if (attempt === undefined) throw new Error('Gold expedition is unavailable.');
    goldDispatchAttemptRef.current = attempt;
    goldExpeditionOperationGenerationRef.current = generation;
    try {
      // This only refreshes the exact private procedure after the reducer has
      // committed. It intentionally does not edit public occupation state.
      const goldExpedition = await withResourceOperationDeadline(
        runtime.dispatchGoldExpedition(connection, siteId, attempt.idempotencyKey)
      );
      if (generationRef.current !== generation) {
        throw new Error('Gold expedition is unavailable.');
      }
      if (!activeExpeditionMatchesDispatch(
        goldExpedition,
        siteId,
        currentState.realm.ownCastle.castleId
      )) throw new Error('Gold expedition is unavailable.');
      // The exact private procedure has now proved the reducer outcome. Until
      // this point every retry reuses the same key, including after a lost
      // reducer response or a record-panel remount.
      if (goldDispatchAttemptRef.current === attempt) {
        goldDispatchAttemptRef.current = undefined;
      }
      goldExpeditionStateRef.current = Object.freeze({ generation, value: goldExpedition });
      setState((latest) => {
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
        ) return latest;
        return { ...latest, goldExpedition };
      });
    } catch (error) {
      // Reducer failures and timeouts are intentionally generic. Do not
      // expose server policy details or guess whether an ambiguous write won.
      if (generationRef.current === generation) {
        if (error instanceof ResourceOperationDeadlineError) {
          canonicalRealmSourceRef.current = undefined;
          runActiveTeardown();
          setState(backendError(currentState.identity));
        }
      }
      throw new Error('Gold expedition is unavailable.');
    } finally {
      if (goldExpeditionOperationGenerationRef.current === generation) {
        goldExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runActiveTeardown, runtime]);

  const claimGoldExpedition = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.goldExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.collectGoldExpedition === undefined
      || goldExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) {
      throw new Error('Gold expedition is unavailable.');
    }
    goldExpeditionOperationGenerationRef.current = generation;
    try {
      const settled = await withResourceOperationDeadline(
        runtime.collectGoldExpedition(connection, fid)
      );
      if (generationRef.current !== generation) {
        throw new Error('Gold expedition is unavailable.');
      }
      if (
        settled.resources.fid !== BigInt(fid)
        || !activeExpeditionBelongsToCastle(
          settled.goldExpedition,
          currentState.realm.ownCastle.castleId
        )
      ) {
        throw new Error('Gold expedition is unavailable.');
      }
      const retained = resourceStateRef.current?.generation === generation
        ? resourceStateRef.current.value
        : undefined;
      if (!resourceProjectionIsAtLeastAsNew(settled.resources, retained)) return;
      resourceStateRef.current = Object.freeze({ generation, value: settled.resources });
      goldExpeditionStateRef.current = Object.freeze({
        generation,
        value: settled.goldExpedition
      });
      setState((latest) => {
        const latestRetained = resourceStateRef.current?.generation === generation
          ? resourceStateRef.current.value
          : undefined;
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
          || latest.resources.fid !== settled.resources.fid
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latestRetained)
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latest.resources)
        ) return latest;
        return {
          ...latest,
          resources: settled.resources,
          goldExpedition: settled.goldExpedition
        };
      });
    } catch {
      throw new Error('Gold expedition is unavailable.');
    } finally {
      if (goldExpeditionOperationGenerationRef.current === generation) {
        goldExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const dispatchFoodExpedition = useCallback(async (siteId: string) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const retainedExpedition = foodExpeditionStateRef.current?.generation === generation
      ? foodExpeditionStateRef.current.value
      : undefined;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.foodExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.dispatchFoodExpedition === undefined
      || retainedExpedition?.active === true
      || foodExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) throw new Error('Food expedition is unavailable.');
    const attempt = dispatchAttemptFor(
      foodDispatchAttemptRef.current,
      generation,
      siteId
    );
    if (attempt === undefined) throw new Error('Food expedition is unavailable.');
    foodDispatchAttemptRef.current = attempt;
    foodExpeditionOperationGenerationRef.current = generation;
    try {
      const foodExpedition = await withResourceOperationDeadline(
        runtime.dispatchFoodExpedition(connection, siteId, attempt.idempotencyKey)
      );
      if (generationRef.current !== generation) {
        throw new Error('Food expedition is unavailable.');
      }
      if (!activeExpeditionMatchesDispatch(
        foodExpedition,
        siteId,
        currentState.realm.ownCastle.castleId
      )) throw new Error('Food expedition is unavailable.');
      if (foodDispatchAttemptRef.current === attempt) {
        foodDispatchAttemptRef.current = undefined;
      }
      foodExpeditionStateRef.current = Object.freeze({ generation, value: foodExpedition });
      setState((latest) => {
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
        ) return latest;
        return { ...latest, foodExpedition };
      });
    } catch (error) {
      if (generationRef.current === generation) {
        if (error instanceof ResourceOperationDeadlineError) {
          canonicalRealmSourceRef.current = undefined;
          runActiveTeardown();
          setState(backendError(currentState.identity));
        }
      }
      throw new Error('Food expedition is unavailable.');
    } finally {
      if (foodExpeditionOperationGenerationRef.current === generation) {
        foodExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runActiveTeardown, runtime]);

  const claimFoodExpedition = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.foodExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.collectFoodExpedition === undefined
      || foodExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) throw new Error('Food expedition is unavailable.');
    foodExpeditionOperationGenerationRef.current = generation;
    try {
      const settled = await withResourceOperationDeadline(
        runtime.collectFoodExpedition(connection, fid)
      );
      if (generationRef.current !== generation) throw new Error('Food expedition is unavailable.');
      if (
        settled.resources.fid !== BigInt(fid)
        || !activeExpeditionBelongsToCastle(
          settled.foodExpedition,
          currentState.realm.ownCastle.castleId
        )
      ) throw new Error('Food expedition is unavailable.');
      const retained = resourceStateRef.current?.generation === generation
        ? resourceStateRef.current.value
        : undefined;
      if (!resourceProjectionIsAtLeastAsNew(settled.resources, retained)) return;
      resourceStateRef.current = Object.freeze({ generation, value: settled.resources });
      foodExpeditionStateRef.current = Object.freeze({ generation, value: settled.foodExpedition });
      setState((latest) => {
        const latestRetained = resourceStateRef.current?.generation === generation
          ? resourceStateRef.current.value
          : undefined;
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
          || latest.resources.fid !== settled.resources.fid
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latestRetained)
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latest.resources)
        ) return latest;
        return {
          ...latest,
          resources: settled.resources,
          foodExpedition: settled.foodExpedition
        };
      });
    } catch {
      throw new Error('Food expedition is unavailable.');
    } finally {
      if (foodExpeditionOperationGenerationRef.current === generation) {
        foodExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const dispatchWoodExpedition = useCallback(async (siteId: string) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const retainedExpedition = woodExpeditionStateRef.current?.generation === generation
      ? woodExpeditionStateRef.current.value
      : undefined;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.woodExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.dispatchWoodExpedition === undefined
      || retainedExpedition?.active === true
      || woodExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) throw new Error('Wood expedition is unavailable.');
    const attempt = dispatchAttemptFor(
      woodDispatchAttemptRef.current,
      generation,
      siteId
    );
    if (attempt === undefined) throw new Error('Wood expedition is unavailable.');
    woodDispatchAttemptRef.current = attempt;
    woodExpeditionOperationGenerationRef.current = generation;
    try {
      const woodExpedition = await withResourceOperationDeadline(
        runtime.dispatchWoodExpedition(connection, siteId, attempt.idempotencyKey)
      );
      if (generationRef.current !== generation) {
        throw new Error('Wood expedition is unavailable.');
      }
      if (!activeExpeditionMatchesDispatch(
        woodExpedition,
        siteId,
        currentState.realm.ownCastle.castleId
      )) throw new Error('Wood expedition is unavailable.');
      if (woodDispatchAttemptRef.current === attempt) {
        woodDispatchAttemptRef.current = undefined;
      }
      woodExpeditionStateRef.current = Object.freeze({ generation, value: woodExpedition });
      setState((latest) => {
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
        ) return latest;
        return { ...latest, woodExpedition };
      });
    } catch (error) {
      if (generationRef.current === generation) {
        if (error instanceof ResourceOperationDeadlineError) {
          canonicalRealmSourceRef.current = undefined;
          runActiveTeardown();
          setState(backendError(currentState.identity));
        }
      }
      throw new Error('Wood expedition is unavailable.');
    } finally {
      if (woodExpeditionOperationGenerationRef.current === generation) {
        woodExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runActiveTeardown, runtime]);

  const claimWoodExpedition = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.woodExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.collectWoodExpedition === undefined
      || woodExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) throw new Error('Wood expedition is unavailable.');
    woodExpeditionOperationGenerationRef.current = generation;
    try {
      const settled = await withResourceOperationDeadline(
        runtime.collectWoodExpedition(connection, fid)
      );
      if (generationRef.current !== generation) throw new Error('Wood expedition is unavailable.');
      if (
        settled.resources.fid !== BigInt(fid)
        || !activeExpeditionBelongsToCastle(
          settled.woodExpedition,
          currentState.realm.ownCastle.castleId
        )
      ) throw new Error('Wood expedition is unavailable.');
      const retained = resourceStateRef.current?.generation === generation
        ? resourceStateRef.current.value
        : undefined;
      if (!resourceProjectionIsAtLeastAsNew(settled.resources, retained)) return;
      resourceStateRef.current = Object.freeze({ generation, value: settled.resources });
      woodExpeditionStateRef.current = Object.freeze({ generation, value: settled.woodExpedition });
      setState((latest) => {
        const latestRetained = resourceStateRef.current?.generation === generation
          ? resourceStateRef.current.value
          : undefined;
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
          || latest.resources.fid !== settled.resources.fid
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latestRetained)
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latest.resources)
        ) return latest;
        return {
          ...latest,
          resources: settled.resources,
          woodExpedition: settled.woodExpedition
        };
      });
    } catch {
      throw new Error('Wood expedition is unavailable.');
    } finally {
      if (woodExpeditionOperationGenerationRef.current === generation) {
        woodExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const dispatchStoneExpedition = useCallback(async (siteId: string) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const retainedExpedition = stoneExpeditionStateRef.current?.generation === generation
      ? stoneExpeditionStateRef.current.value
      : undefined;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.stoneExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.dispatchStoneExpedition === undefined
      || retainedExpedition?.active === true
      || stoneExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) throw new Error('Stone expedition is unavailable.');
    const attempt = dispatchAttemptFor(
      stoneDispatchAttemptRef.current,
      generation,
      siteId
    );
    if (attempt === undefined) throw new Error('Stone expedition is unavailable.');
    stoneDispatchAttemptRef.current = attempt;
    stoneExpeditionOperationGenerationRef.current = generation;
    try {
      const stoneExpedition = await withResourceOperationDeadline(
        runtime.dispatchStoneExpedition(connection, siteId, attempt.idempotencyKey)
      );
      if (generationRef.current !== generation) {
        throw new Error('Stone expedition is unavailable.');
      }
      if (!activeExpeditionMatchesDispatch(
        stoneExpedition,
        siteId,
        currentState.realm.ownCastle.castleId
      )) throw new Error('Stone expedition is unavailable.');
      if (stoneDispatchAttemptRef.current === attempt) {
        stoneDispatchAttemptRef.current = undefined;
      }
      stoneExpeditionStateRef.current = Object.freeze({ generation, value: stoneExpedition });
      setState((latest) => {
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
        ) return latest;
        return { ...latest, stoneExpedition };
      });
    } catch (error) {
      if (generationRef.current === generation && error instanceof ResourceOperationDeadlineError) {
        canonicalRealmSourceRef.current = undefined;
        runActiveTeardown();
        setState(backendError(currentState.identity));
      }
      throw new Error('Stone expedition is unavailable.');
    } finally {
      if (stoneExpeditionOperationGenerationRef.current === generation) {
        stoneExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runActiveTeardown, runtime]);

  const claimStoneExpedition = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.stoneExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.collectStoneExpedition === undefined
      || stoneExpeditionOperationGenerationRef.current === generation
      || legacyReturnOperationGenerationRef.current === generation
    ) throw new Error('Stone expedition is unavailable.');
    stoneExpeditionOperationGenerationRef.current = generation;
    try {
      const settled = await withResourceOperationDeadline(
        runtime.collectStoneExpedition(connection, fid)
      );
      if (generationRef.current !== generation) throw new Error('Stone expedition is unavailable.');
      if (
        settled.resources.fid !== BigInt(fid)
        || !activeExpeditionBelongsToCastle(
          settled.stoneExpedition,
          currentState.realm.ownCastle.castleId
        )
      ) throw new Error('Stone expedition is unavailable.');
      const retained = resourceStateRef.current?.generation === generation
        ? resourceStateRef.current.value
        : undefined;
      if (!resourceProjectionIsAtLeastAsNew(settled.resources, retained)) return;
      resourceStateRef.current = Object.freeze({ generation, value: settled.resources });
      stoneExpeditionStateRef.current = Object.freeze({ generation, value: settled.stoneExpedition });
      setState((latest) => {
        const latestRetained = resourceStateRef.current?.generation === generation
          ? resourceStateRef.current.value
          : undefined;
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm === undefined
          || latest.resources === undefined
          || latest.resources.fid !== settled.resources.fid
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latestRetained)
          || !resourceProjectionIsAtLeastAsNew(settled.resources, latest.resources)
        ) return latest;
        return {
          ...latest,
          resources: settled.resources,
          stoneExpedition: settled.stoneExpedition
        };
      });
    } catch {
      throw new Error('Stone expedition is unavailable.');
    } finally {
      if (stoneExpeditionOperationGenerationRef.current === generation) {
        stoneExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const returnLegacyExpedition = useCallback(async (
    resourceKind: RealmEconomicResourceKey,
    expeditionId: string
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    const ownCastleId = currentState.realm?.ownCastle.castleId;
    const currentExpedition = legacyExpeditionForResource(currentState, resourceKind);
    const resourceOperationRef = resourceKind === 'gold'
      ? goldExpeditionOperationGenerationRef
      : resourceKind === 'food'
        ? foodExpeditionOperationGenerationRef
        : resourceKind === 'wood'
          ? woodExpeditionOperationGenerationRef
          : stoneExpeditionOperationGenerationRef;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.realm === undefined
      || currentState.realm.workerSystem?.mode !== 'staged'
      || !currentState.realm.workerSystem.legacyDrainRequired
      || currentState.resources === undefined
      || connection === undefined
      || fid === undefined
      || ownCastleId === undefined
      || runtime.returnLegacyExpedition === undefined
      || legacyReturnOperationGenerationRef.current === generation
      || collectingGenerationRef.current === generation
      || goldExpeditionOperationGenerationRef.current === generation
      || foodExpeditionOperationGenerationRef.current === generation
      || woodExpeditionOperationGenerationRef.current === generation
      || stoneExpeditionOperationGenerationRef.current === generation
      || !legacyExpeditionCanReturn(currentExpedition, expeditionId, ownCastleId)
    ) throw new Error('Legacy expedition return is unavailable.');

    legacyReturnOperationGenerationRef.current = generation;
    resourceOperationRef.current = generation;
    try {
      const refreshed = await withResourceOperationDeadline(
        runtime.returnLegacyExpedition(
          connection,
          fid,
          resourceKind,
          expeditionId
        )
      );
      if (
        generationRef.current !== generation
        || refreshed.resources.fid !== BigInt(fid)
        || !resourceProjectionIsAtLeastAsNew(
          refreshed.resources,
          resourceStateRef.current?.generation === generation
            ? resourceStateRef.current.value
            : undefined
        )
        || !activeExpeditionBelongsToCastle(refreshed.goldExpedition, ownCastleId)
        || !activeExpeditionBelongsToCastle(refreshed.foodExpedition, ownCastleId)
        || !activeExpeditionBelongsToCastle(refreshed.woodExpedition, ownCastleId)
        || !activeExpeditionBelongsToCastle(refreshed.stoneExpedition, ownCastleId)
        || !legacyExpeditionReturnConfirmed(
          legacyExpeditionForResource(refreshed, resourceKind)
        )
      ) throw new Error('Legacy expedition return is unavailable.');

      resourceStateRef.current = Object.freeze({
        generation,
        value: refreshed.resources
      });
      goldExpeditionStateRef.current = Object.freeze({
        generation,
        value: refreshed.goldExpedition
      });
      foodExpeditionStateRef.current = Object.freeze({
        generation,
        value: refreshed.foodExpedition
      });
      woodExpeditionStateRef.current = Object.freeze({
        generation,
        value: refreshed.woodExpedition
      });
      stoneExpeditionStateRef.current = Object.freeze({
        generation,
        value: refreshed.stoneExpedition
      });
      setState((latest) => {
        if (
          generationRef.current !== generation
          || latest.phase !== 'ready'
          || latest.admission !== 'ready'
          || latest.identity?.fid !== fid
          || latest.realm?.ownCastle.castleId !== ownCastleId
          || latest.resources === undefined
          || !resourceProjectionIsAtLeastAsNew(refreshed.resources, latest.resources)
        ) return latest;
        return {
          ...latest,
          resources: refreshed.resources,
          goldExpedition: refreshed.goldExpedition,
          foodExpedition: refreshed.foodExpedition,
          woodExpedition: refreshed.woodExpedition,
          stoneExpedition: refreshed.stoneExpedition
        };
      });
    } catch (error) {
      if (
        generationRef.current === generation
        && error instanceof ResourceOperationDeadlineError
      ) {
        canonicalRealmSourceRef.current = undefined;
        runActiveTeardown();
        setState(backendError(currentState.identity));
      }
      throw new Error('Legacy expedition return is unavailable.');
    } finally {
      if (legacyReturnOperationGenerationRef.current === generation) {
        legacyReturnOperationGenerationRef.current = undefined;
      }
      if (resourceOperationRef.current === generation) {
        resourceOperationRef.current = undefined;
      }
    }
  }, [runActiveTeardown, runtime]);

  const beginAlphaTermsAcceptance = useCallback(() => {
    termsAttemptRef.current += 1;
    // Keep the checked in-memory intent for a fresh sign-in or token refresh,
    // but never send the acknowledgement over authority that has already
    // expired while a throttled browser timer still presents it as current.
    if (
      !farcaster.oidcSession
      || farcaster.oidcSession.expiresAt <= Date.now()
    ) {
      return;
    }
    processTermsAttemptRef.current();
  }, [farcaster.oidcSession]);

  const cancelAlphaTermsAcceptance = useCallback(() => {
    // Cancellation never revokes a reducer call already sent after explicit
    // acceptance, but it prevents an unconsumed pre-auth attempt from leaking
    // into a later remembered/direct-route session.
    termsAttemptRef.current = completedTermsAttemptRef.current;
    termsIntentGenerationRef.current += 1;
    setState((current) => current.phase === 'accepting-terms'
      ? {
          phase: 'awaiting-terms',
          workerPrivateSync: current.workerPrivateSync,
          identity: current.identity,
          admission: 'ready'
        }
      : current);
  }, []);

  const checkAgain = useCallback(() => {
    if (
      !sharedAlphaAvailable
      || !identity
      || !farcaster.oidcSession
      || farcaster.oidcSession.expiresAt <= Date.now()
    ) {
      return;
    }
    setCheckSequence((sequence) => sequence + 1);
  }, [farcaster.oidcSession, identity, sharedAlphaAvailable]);

  useEffect(() => {
    if (identity && termsIdentityFidRef.current === undefined) {
      // A Terms gesture normally precedes authentication, so bind the pending
      // attempt to the first verified FID without discarding it.
      termsIdentityFidRef.current = identity.fid;
    } else if (identity && termsIdentityFidRef.current !== identity.fid) {
      // Consent recorded for one identity can never authorize another identity
      // that appears without the normal sign-out/disconnect lifecycle.
      termsAttemptRef.current = 0;
      completedTermsAttemptRef.current = 0;
      termsIdentityFidRef.current = identity.fid;
      setAcceptedEntryAgreementFid(undefined);
    } else if (!identity) {
      // Access-token rotation briefly removes the parsed OIDC session while
      // the same authenticated FID remains in the Farcaster machine. Preserve
      // only that exact in-memory agreement; every definitive phase/FID change
      // still clears it before another identity can reuse it.
      const refreshingFid = bridgeAuthenticatedIdentity?.fid;
      setAcceptedEntryAgreementFid((acceptedFid) => (
        acceptedFid !== undefined && acceptedFid === refreshingFid
          ? acceptedFid
          : undefined
      ));
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    resourceStateRef.current = undefined;
    goldExpeditionStateRef.current = undefined;
    goldExpeditionOperationGenerationRef.current = undefined;
    goldDispatchAttemptRef.current = undefined;
    foodExpeditionStateRef.current = undefined;
    foodExpeditionOperationGenerationRef.current = undefined;
    foodDispatchAttemptRef.current = undefined;
    woodExpeditionStateRef.current = undefined;
    woodExpeditionOperationGenerationRef.current = undefined;
    woodDispatchAttemptRef.current = undefined;
    stoneExpeditionStateRef.current = undefined;
    stoneExpeditionOperationGenerationRef.current = undefined;
    stoneDispatchAttemptRef.current = undefined;
    legacyReturnOperationGenerationRef.current = undefined;
    workerRosterStateRef.current = undefined;
    workerResourceStateRef.current = undefined;
    workerPrivateSyncStateRef.current = undefined;
    workerCommandGenerationRef.current = undefined;
    workerCommandAttemptsRef.current.clear();
    innerKeepProjectionRef.current = undefined;
    innerKeepCommandAttemptRef.current = undefined;
    innerKeepDefinitiveFailureRef.current = undefined;
    innerKeepOperationGenerationRef.current = undefined;
    connectionBridgeCommandAuthorityRef.current = undefined;
    requestWorkerPrivateSyncRef.current = () => undefined;
    requestInnerKeepSyncRef.current = () => undefined;
    canonicalRealmSnapshotRef.current = undefined;
    const previousState = stateRef.current;
    const canonicalRealmSource = [
      config.spacetimeUri,
      config.spacetimeDatabase,
      config.issuer,
      config.audience
    ].join('\n');
    const accessTokenRefreshPending = bridgeAuthenticatedIdentity !== undefined
      && (
        farcaster.oidcSession === undefined
        || farcaster.oidcSession.expiresAt <= Date.now()
      );
    const continuityIdentity = accessTokenRefreshPending
      ? bridgeAuthenticatedIdentity
      : identity;
    const retainedReadyState = (
      previousState.phase === 'ready'
      || previousState.phase === 'reconnecting'
    )
      && previousState.identity?.fid === continuityIdentity?.fid
      && previousState.admission === 'ready'
      && previousState.realm
      && isCanonicalGenesisSnapshot(previousState.realm, continuityIdentity?.fid)
      && canonicalRealmSourceRef.current === canonicalRealmSource
      ? previousState
      : undefined;
    const retainedRetiredState = (
      previousState.phase === 'ready'
      || previousState.phase === 'reconnecting'
    )
      && previousState.identity?.fid === continuityIdentity?.fid
      && previousState.admission === 'ready'
      && previousState.legacyRealmAuthority === 'retired'
      && previousState.realm === undefined
      && canonicalRealmSourceRef.current === canonicalRealmSource
      ? previousState
      : undefined;
    const retainedContinuityState = retainedReadyState ?? retainedRetiredState;
    const retainedProjection = !accessTokenRefreshPending
      && identity !== undefined
      && retainedReadyState?.workerRoster
      && retainedReadyState.workerResourceState
      && retainedReadyState.workerResourceState.fid === BigInt(identity.fid)
      ? activeWorkerProjection(
          retainedReadyState.realm!,
          retainedReadyState.workerRoster,
          retainedReadyState.workerResourceState
        )
      : undefined;
    let retainedWorkerProjectionPair = retainedReadyState
      && retainedProjection
      && retainedReadyState.workerRoster
      && retainedReadyState.workerResourceState
      ? Object.freeze({
          source: canonicalRealmSource,
          fid: identity!.fid,
          roster: retainedReadyState.workerRoster,
          resourceState: retainedReadyState.workerResourceState,
          projection: retainedProjection
        })
      : undefined;
    if (!retainedContinuityState) canonicalRealmSourceRef.current = undefined;
    runActiveTeardown();
    const previous = connectionRef.current;
    connectionRef.current = undefined;
    if (previous) {
      try {
        runtime.disconnect(previous);
      } catch {
        // The previous generation is already invalidated and cannot publish.
      }
    }

    if (
      !sharedAlphaAvailable
      || !identity
      || !farcaster.oidcSession
      || accessTokenRefreshPending
    ) {
      if (
        sharedAlphaAvailable
        && accessTokenRefreshPending
        && continuityIdentity
        && retainedContinuityState
      ) {
        // The Farcaster machine still proves the exact bridge-authenticated
        // FID while its short-lived access token rotates. Retain only the
        // already-validated public Realm; every private value and mutation
        // authority was cleared above with the old connection generation.
        canonicalRealmSourceRef.current = canonicalRealmSource;
        setState({
          phase: 'reconnecting',
          workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
          identity: continuityIdentity,
          admission: 'ready',
          ...(retainedReadyState === undefined ? {
            legacyRealmAuthority: 'retired' as const,
            ...(retainedRetiredState?.realmContinuity === undefined ? {} : {
              realmContinuity: retainedRetiredState.realmContinuity
            })
          } : {
            legacyRealmAuthority: 'active' as const,
            realm: retainedReadyState.realm
          })
        });
      } else {
        transportReconnectAttemptRef.current = 0;
        canonicalRealmSourceRef.current = undefined;
        setState(IDLE_WARPKEEP_BACKEND_STATE);
      }
      return undefined;
    }

    if (
      farcaster.oidcSession.expiresAt <= Date.now()
      || farcaster.oidcSession.issuer !== config.issuer
      || farcaster.oidcSession.audience !== config.audience
    ) {
      transportReconnectAttemptRef.current = 0;
      canonicalRealmSourceRef.current = undefined;
      setState(backendError(identity));
      return undefined;
    }

    let active = true;
    let connection: WarpkeepConnection | undefined;
    let cleanupObserver: (() => void) | undefined;
    let subscription: ReturnType<WarpkeepBackendRuntime['subscribeRealm']> | undefined;
    let publishReadySnapshot: (() => void) | undefined;
    let activateRealm: (() => void) | undefined;
    let realmActivationPromise: Promise<void> | undefined;
    let resourceRefreshInFlight = false;
    let resourceRefreshQueuedAfterResume = false;
    let workerRefreshInFlight = false;
    let queuedWorkerCapabilityRealm: WarpkeepWorkerRealmAuthority | undefined;
    let workerPrivateSyncBurstAttempt = 0;
    let workerPrivateSyncRequiredAt: number | undefined;
    let workerPrivateSyncRetryTimeout: ReturnType<typeof setTimeout> | undefined;
    let workerPrivateSyncLastRealm: WarpkeepWorkerRealmAuthority | undefined;
    let greaterRealmWorkerRefreshInFlight = false;
    let greaterRealmWorkerRefreshInterval: ReturnType<typeof setInterval> | undefined;
    let removeGreaterRealmWorkerLifecycleListeners: (() => void) | undefined;
    let requestGreaterRealmWorkerControl = () => undefined;
    let retiredRealmContinuity: WarpkeepRealmContinuityProjection | undefined;
    let lastRequestedWorkerPublicRevision: string | undefined;
    let removeWorkerPrivateSyncLifecycleListeners: (() => void) | undefined;
    let requestWorkerPrivateSync = () => undefined;
    let innerKeepRefreshInFlight = false;
    let innerKeepRefreshQueued = false;
    let innerKeepReconciliationAttempt = 0;
    let innerKeepReconciliationTimeout: ReturnType<typeof setTimeout> | undefined;
    let requestInnerKeepSync = () => undefined;
    let realmActivated = false;
    let subscriptionApplied = false;
    let backendProtocolVersion: number | undefined;
    let readinessTimeout: ReturnType<typeof setTimeout> | undefined;
    let resourceRefreshInterval: ReturnType<typeof setInterval> | undefined;
    let resourceResumeRefreshTimeout: ReturnType<typeof setTimeout> | undefined;
    let removeResourceRefreshLifecycleListeners: (() => void) | undefined;
    let transportReconnectRetryTimeout: ReturnType<typeof setTimeout> | undefined;
    let termsAcceptancePromise: Promise<boolean> | undefined;
    let terminated = false;
    let legacyRealmRetired = false;
    const current = () => active && generationRef.current === generation;
    const terminateConnection = () => {
      // A retained transport retry may be scheduled after this generation has
      // already torn down its socket. React cleanup must still cancel it.
      if (transportReconnectRetryTimeout !== undefined) {
        clearTimeout(transportReconnectRetryTimeout);
        transportReconnectRetryTimeout = undefined;
      }
      if (terminated) {
        return;
      }
      terminated = true;
      if (readinessTimeout !== undefined) {
        clearTimeout(readinessTimeout);
        readinessTimeout = undefined;
      }
      if (resourceRefreshInterval !== undefined) {
        clearInterval(resourceRefreshInterval);
        resourceRefreshInterval = undefined;
      }
      if (resourceResumeRefreshTimeout !== undefined) {
        clearTimeout(resourceResumeRefreshTimeout);
        resourceResumeRefreshTimeout = undefined;
      }
      resourceRefreshQueuedAfterResume = false;
      removeResourceRefreshLifecycleListeners?.();
      removeResourceRefreshLifecycleListeners = undefined;
      if (workerPrivateSyncRetryTimeout !== undefined) {
        clearTimeout(workerPrivateSyncRetryTimeout);
        workerPrivateSyncRetryTimeout = undefined;
      }
      removeWorkerPrivateSyncLifecycleListeners?.();
      removeWorkerPrivateSyncLifecycleListeners = undefined;
      if (greaterRealmWorkerRefreshInterval !== undefined) {
        clearInterval(greaterRealmWorkerRefreshInterval);
        greaterRealmWorkerRefreshInterval = undefined;
      }
      greaterRealmWorkerRefreshInFlight = false;
      removeGreaterRealmWorkerLifecycleListeners?.();
      removeGreaterRealmWorkerLifecycleListeners = undefined;
      if (innerKeepReconciliationTimeout !== undefined) {
        clearTimeout(innerKeepReconciliationTimeout);
        innerKeepReconciliationTimeout = undefined;
      }
      innerKeepRefreshQueued = false;
      // Invalidate callbacks before disconnecting: an injected runtime or the
      // SDK may synchronously report onDisconnected from disconnect().
      active = false;
      if (teardownRef.current === terminateConnection) {
        teardownRef.current = undefined;
      }
      if (processTermsAttemptRef.current === processTermsAttempt) {
        processTermsAttemptRef.current = () => undefined;
      }
      if (resourceStateRef.current?.generation === generation) {
        resourceStateRef.current = undefined;
      }
      if (goldExpeditionStateRef.current?.generation === generation) {
        goldExpeditionStateRef.current = undefined;
      }
      if (goldExpeditionOperationGenerationRef.current === generation) {
        goldExpeditionOperationGenerationRef.current = undefined;
      }
      if (goldDispatchAttemptRef.current?.generation === generation) {
        goldDispatchAttemptRef.current = undefined;
      }
      if (foodExpeditionStateRef.current?.generation === generation) {
        foodExpeditionStateRef.current = undefined;
      }
      if (foodExpeditionOperationGenerationRef.current === generation) {
        foodExpeditionOperationGenerationRef.current = undefined;
      }
      if (foodDispatchAttemptRef.current?.generation === generation) {
        foodDispatchAttemptRef.current = undefined;
      }
      if (woodExpeditionStateRef.current?.generation === generation) {
        woodExpeditionStateRef.current = undefined;
      }
      if (woodExpeditionOperationGenerationRef.current === generation) {
        woodExpeditionOperationGenerationRef.current = undefined;
      }
      if (woodDispatchAttemptRef.current?.generation === generation) {
        woodDispatchAttemptRef.current = undefined;
      }
      if (stoneExpeditionStateRef.current?.generation === generation) {
        stoneExpeditionStateRef.current = undefined;
      }
      if (stoneExpeditionOperationGenerationRef.current === generation) {
        stoneExpeditionOperationGenerationRef.current = undefined;
      }
      if (stoneDispatchAttemptRef.current?.generation === generation) {
        stoneDispatchAttemptRef.current = undefined;
      }
      if (legacyReturnOperationGenerationRef.current === generation) {
        legacyReturnOperationGenerationRef.current = undefined;
      }
      if (workerRosterStateRef.current?.generation === generation) {
        workerRosterStateRef.current = undefined;
      }
      if (workerResourceStateRef.current?.generation === generation) {
        workerResourceStateRef.current = undefined;
      }
      if (workerPrivateSyncStateRef.current?.generation === generation) {
        workerPrivateSyncStateRef.current = undefined;
      }
      if (greaterRealmWorkerControlStateRef.current?.generation === generation) {
        greaterRealmWorkerControlStateRef.current = undefined;
      }
      if (workerCommandGenerationRef.current === generation) {
        workerCommandGenerationRef.current = undefined;
      }
      if (innerKeepProjectionRef.current?.generation === generation) {
        innerKeepProjectionRef.current = undefined;
      }
      if (innerKeepCommandAttemptRef.current?.scope.generation === generation) {
        innerKeepCommandAttemptRef.current = undefined;
      }
      if (innerKeepDefinitiveFailureRef.current?.generation === generation) {
        innerKeepDefinitiveFailureRef.current = undefined;
      }
      if (innerKeepOperationGenerationRef.current === generation) {
        innerKeepOperationGenerationRef.current = undefined;
      }
      if (connectionBridgeCommandAuthorityRef.current?.generation === generation) {
        connectionBridgeCommandAuthorityRef.current = undefined;
      }
      if (canonicalRealmSnapshotRef.current?.generation === generation) {
        canonicalRealmSnapshotRef.current = undefined;
      }
      for (const [fingerprint, attempt] of workerCommandAttemptsRef.current) {
        if (attempt.generation === generation) {
          workerCommandAttemptsRef.current.delete(fingerprint);
        }
      }
      if (requestWorkerPrivateSyncRef.current === requestWorkerPrivateSync) {
        requestWorkerPrivateSyncRef.current = () => undefined;
      }
      if (requestGreaterRealmWorkerControlRef.current === requestGreaterRealmWorkerControl) {
        requestGreaterRealmWorkerControlRef.current = () => undefined;
      }
      if (requestInnerKeepSyncRef.current === requestInnerKeepSync) {
        requestInnerKeepSyncRef.current = () => undefined;
      }
      const observer = cleanupObserver;
      cleanupObserver = undefined;
      try {
        observer?.();
      } catch {
        // Continue through every remaining authority cleanup boundary.
      }
      const activeSubscription = subscription;
      subscription = undefined;
      try {
        activeSubscription?.unsubscribe();
      } catch {
        // Continue to transport teardown even if the SDK handle misbehaves.
      }
      const activeConnection = connection;
      connection = undefined;
      if (connectionRef.current === activeConnection) {
        connectionRef.current = undefined;
      }
      if (activeConnection) {
        try {
          runtime.disconnect(activeConnection);
        } catch {
          // Generation invalidation and local state clearing remain mandatory.
        }
      }
    };
    teardownRef.current = terminateConnection;
    const scheduleRetainedTransportReconnect = () => {
      const latest = stateRef.current;
      const activeLegacyContinuity = latest.legacyRealmAuthority !== 'retired'
        && latest.realm !== undefined
        && isCanonicalGenesisSnapshot(latest.realm, identity?.fid);
      const retiredLegacyContinuity = latest.legacyRealmAuthority === 'retired'
        && latest.realm === undefined;
      const retryDelay = TRANSPORT_RECONNECT_RETRY_DELAYS_MILLISECONDS[
        transportReconnectAttemptRef.current
      ];
      if (
        !current()
        || retryDelay === undefined
        || identity === undefined
        || bridgeAuthenticatedIdentity?.fid !== identity.fid
        || bridgeFid !== identity.fid
        || farcaster.oidcSession === undefined
        || farcaster.oidcSession.expiresAt <= Date.now()
        || (latest.phase !== 'ready' && latest.phase !== 'reconnecting')
        || latest.identity?.fid !== identity.fid
        || latest.admission !== 'ready'
        || (!activeLegacyContinuity && !retiredLegacyContinuity)
        || canonicalRealmSourceRef.current !== canonicalRealmSource
      ) {
        return false;
      }
      transportReconnectAttemptRef.current += 1;
      const retainedPublicState: WarpkeepBackendState = {
        phase: 'reconnecting',
        workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
        identity,
        admission: 'ready',
        ...(retiredLegacyContinuity ? {
          legacyRealmAuthority: 'retired' as const,
          ...(latest.realmContinuity === undefined ? {} : {
            realmContinuity: latest.realmContinuity
          })
        } : {
          legacyRealmAuthority: 'active' as const,
          realm: latest.realm
        })
      };
      terminateConnection();
      canonicalRealmSourceRef.current = canonicalRealmSource;
      setState(retainedPublicState);
      transportReconnectRetryTimeout = setTimeout(() => {
        transportReconnectRetryTimeout = undefined;
        setCheckSequence((sequence) => sequence + 1);
      }, retryDelay);
      // terminateConnection deliberately cleared its ownership while tearing
      // down the failed socket. Reinstall it for the timer-only generation so
      // an explicit disconnect/unmount can still cancel the pending retry.
      teardownRef.current = terminateConnection;
      return true;
    };
    const fail = () => {
      if (current()) {
        transportReconnectAttemptRef.current = 0;
        canonicalRealmSourceRef.current = undefined;
        terminateConnection();
        setState(backendError(identity));
      }
    };
    const reportFailure = (message: string) => {
      if (!current()) return;
      try {
        console.info(message);
      } catch {
        // Diagnostics never interrupt generation cleanup or fail-closed state.
      }
    };
    const failRealmActivation = (reason: WarpkeepRealmActivationFailureReason) => {
      if (!current() || legacyRealmRetired) return;
      reportFailure(`warpkeep_backend_activation_failed:${reason}`);
      fail();
    };

    const reconnectingState: WarpkeepBackendState | undefined = retainedContinuityState
      ? {
          phase: 'reconnecting',
          workerPrivateSync: retainedWorkerProjectionPair
            ? workerPrivateSyncStatus({
                phase: 'stale-read-only',
                retainedStale: true,
                localizedFailureCount:
                  retainedReadyState!.workerPrivateSync.localizedFailureCount,
                lastSuccessGeneration:
                  retainedReadyState!.workerPrivateSync.lastSuccessGeneration,
                lastSuccessRevision:
                  retainedReadyState!.workerPrivateSync.lastSuccessRevision,
                readyLatencyMilliseconds:
                  retainedReadyState!.workerPrivateSync.readyLatencyMilliseconds
              })
            : NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
          identity,
          admission: 'ready',
          ...(retainedReadyState === undefined ? {
            legacyRealmAuthority: 'retired' as const,
            ...(retainedRetiredState?.realmContinuity === undefined ? {} : {
              realmContinuity: retainedRetiredState.realmContinuity
            })
          } : {
            legacyRealmAuthority: 'active' as const,
            realm: retainedReadyState.realm
          }),
          ...(retainedWorkerProjectionPair === undefined ? {} : {
            workerRoster: retainedWorkerProjectionPair.roster,
            workerResourceState: retainedWorkerProjectionPair.resourceState,
            workerProjection: retainedWorkerProjectionPair.projection
          })
        }
      : undefined;
    if (reconnectingState !== undefined) {
      workerPrivateSyncStateRef.current = Object.freeze({
        generation,
        fid: identity.fid,
        value: reconnectingState.workerPrivateSync
      });
    }

    const acknowledgePendingTerms = async (activeConnection: WarpkeepConnection) => {
      if (termsAcceptancePromise) return termsAcceptancePromise;
      const attempt = termsAttemptRef.current;
      if (attempt <= completedTermsAttemptRef.current) return false;

      const currentState = stateRef.current;
      setState({
        phase: 'accepting-terms',
        workerPrivateSync: currentState.workerPrivateSync,
        identity,
        admission: 'ready',
        ...(currentState.realm ? { realm: currentState.realm } : {})
      });
      const pending = (async () => {
        await withBackendStageOperationDeadline(
          runtime.acceptAlphaTerms(activeConnection)
        );
        if (!current()) return false;
        completedTermsAttemptRef.current = Math.max(
          completedTermsAttemptRef.current,
          attempt
        );
        setAcceptedEntryAgreementFid(identity.fid);
        return true;
      })();
      termsAcceptancePromise = pending;
      try {
        return await pending;
      } finally {
        if (termsAcceptancePromise === pending) termsAcceptancePromise = undefined;
      }
    };

    function processTermsAttempt() {
      const activeConnection = connection;
      const activate = activateRealm;
      if (!current() || !activeConnection || !activate) return;
      const intentGeneration = termsIntentGenerationRef.current;
      void acknowledgePendingTerms(activeConnection).then((accepted) => {
        if (
          !current()
          || intentGeneration !== termsIntentGenerationRef.current
          || (!accepted && completedTermsAttemptRef.current === 0)
        ) return;
        activate();
        if (termsAttemptRef.current > completedTermsAttemptRef.current) {
          processTermsAttempt();
        }
      }).catch(() => {
        reportFailure('warpkeep_backend_stage_failed:terms_acknowledgement');
        fail();
      });
    }
    processTermsAttemptRef.current = processTermsAttempt;

    const run = async () => {
      let stage = 'connect';
      setState(reconnectingState ?? {
        phase: 'connecting',
        workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
        identity
      });
      try {
        const activeConnection = await runtime.connect(config, farcaster.oidcSession!.jwt, {
          onDisconnected: () => {
            if (current() && !scheduleRetainedTransportReconnect()) fail();
          },
          onConnectionFailure: (reason) => {
            // Static, privacy-safe signal for bounded production diagnostics.
            reportFailure(`warpkeep_backend_connection_failed:${reason}`);
          }
        });
        if (!current()) {
          try {
            runtime.disconnect(activeConnection);
          } catch {
            // The stale connection cannot regain authority in this generation.
          }
          return;
        }
        connection = activeConnection;
        connectionRef.current = activeConnection;
        connectionBridgeCommandAuthorityRef.current = Object.freeze({
          generation,
          fid: identity.fid,
          jwt: farcaster.oidcSession!.jwt
        });
        // Validate here as well as at the generated-binding boundary so an
        // injected/test runtime can never accidentally bypass compatibility.
        stage = 'backend_info';
        const backendInfo = readCompatibleWarpkeepBackendInfo(
          await withBackendStageOperationDeadline(
            runtime.readBackendInfo(activeConnection)
          )
        );
        backendProtocolVersion = backendInfo.protocolVersion;
        if (!current()) return;
        if (!reconnectingState) {
          setState({
            phase: 'checking-admission',
            workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
            identity
          });
        }
        stage = 'admission';
        let admission = await withBackendStageOperationDeadline(
          runtime.readAdmission(activeConnection)
        );
        if (!current()) return;

        if (admission === 'not_admitted' || admission === 'disabled') {
          terminateConnection();
          setState({
            phase: 'denied',
            workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
            identity,
            admission
          });
          return;
        }

        if (admission === 'admitted_needs_bootstrap') {
          if (!reconnectingState) {
            setState({
              phase: 'bootstrapping',
              workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
              identity,
              admission
            });
          }
          stage = 'bootstrap';
          await withBackendStageOperationDeadline(
            runtime.bootstrapPlayer(activeConnection)
          );
          if (!current()) return;
          stage = 'admission_after_bootstrap';
          admission = await withBackendStageOperationDeadline(
            runtime.readAdmission(activeConnection)
          );
          if (!current()) return;
        }

        if (admission !== 'ready') {
          terminateConnection();
          setState({
            phase: 'denied',
            workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
            identity,
            admission
          });
          return;
        }

        const workerCapabilityIsActive = (realm: WarpkeepWorkerRealmAuthority | undefined) => (
          realm?.workerSystem?.mode === 'active'
          && realm.workerWorkers !== undefined
          && realm.workerOccupations !== undefined
          && (
            runtime.readWorkerControlState !== undefined
            || (
              runtime.readWorkerRoster !== undefined
              && runtime.readResourceStateV2 !== undefined
            )
          )
          && realm.ownCastle.ownerFid === bridgeFid
        );
        const workerCommandsAreAvailable = (
          runtime.dispatchWorker !== undefined
          && runtime.recallWorker !== undefined
          && runtime.recallAllWorkers !== undefined
        );
        const currentWorkerPrivateSync = () => {
          const retained = workerPrivateSyncStateRef.current;
          return retained?.generation === generation && retained.fid === bridgeFid
            ? retained.value
            : NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS;
        };
        const currentGenerationWorkerPair = () => ({
          roster: workerRosterStateRef.current?.generation === generation
            && workerRosterStateRef.current.fid === bridgeFid
            ? workerRosterStateRef.current.value
            : undefined,
          resourceState: workerResourceStateRef.current?.generation === generation
            && workerResourceStateRef.current.fid === bridgeFid
            ? workerResourceStateRef.current.value
            : undefined
        });
        const monotonicWorkerPair = () => {
          const currentPair = currentGenerationWorkerPair();
          if (
            currentPair.roster !== undefined
            && currentPair.resourceState !== undefined
          ) return currentPair;
          return retainedWorkerProjectionPair !== undefined
            && retainedWorkerProjectionPair.fid === bridgeFid
            && retainedWorkerProjectionPair.source === canonicalRealmSource
            ? {
                roster: retainedWorkerProjectionPair.roster,
                resourceState: retainedWorkerProjectionPair.resourceState
              }
            : currentPair;
        };
        const hasRetainedWorkerDisplay = () => (
          currentGenerationWorkerPair().roster !== undefined
          || retainedWorkerProjectionPair !== undefined
        );
        const publishWorkerPrivateSync = (
          workerPrivateSync: WarpkeepWorkerPrivateSyncStatus
        ) => {
          if (!current()) return;
          workerPrivateSyncStateRef.current = Object.freeze({
            generation,
            fid: bridgeFid!,
            value: workerPrivateSync
          });
          setState((latest) => (
            current()
            && latest.identity?.fid === bridgeFid
            && (latest.phase === 'ready' || latest.phase === 'reconnecting')
              ? { ...latest, workerPrivateSync }
              : latest
          ));
        };
        const cancelWorkerPrivateSyncRetry = () => {
          if (workerPrivateSyncRetryTimeout === undefined) return;
          clearTimeout(workerPrivateSyncRetryTimeout);
          workerPrivateSyncRetryTimeout = undefined;
        };
        const resetWorkerPrivateSyncLifecycle = () => {
          cancelWorkerPrivateSyncRetry();
          workerPrivateSyncRequiredAt = undefined;
          workerPrivateSyncBurstAttempt = 0;
          queuedWorkerCapabilityRealm = undefined;
          workerPrivateSyncLastRealm = undefined;
          lastRequestedWorkerPublicRevision = undefined;
          retainedWorkerProjectionPair = undefined;
          workerRosterStateRef.current = undefined;
          workerResourceStateRef.current = undefined;
          workerCommandGenerationRef.current = undefined;
          workerCommandAttemptsRef.current.clear();
          workerPrivateSyncStateRef.current = Object.freeze({
            generation,
            fid: bridgeFid!,
            value: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS
          });
        };
        const workerPrivateSyncMetadata = () => {
          const previous = currentWorkerPrivateSync();
          return {
            retainedStale: hasRetainedWorkerDisplay(),
            localizedFailureCount: previous.localizedFailureCount,
            lastSuccessGeneration: previous.lastSuccessGeneration,
            lastSuccessRevision: previous.lastSuccessRevision,
            readyLatencyMilliseconds: previous.readyLatencyMilliseconds
          } as const;
        };
        const scheduleWorkerPrivateSyncRetry = (
          realm: WarpkeepWorkerRealmAuthority,
          delayMilliseconds: number,
          startNewBurst = false
        ) => {
          cancelWorkerPrivateSyncRetry();
          if (!current() || document.hidden || !workerCapabilityIsActive(realm)) return;
          workerPrivateSyncRetryTimeout = setTimeout(() => {
            workerPrivateSyncRetryTimeout = undefined;
            if (!current() || document.hidden) return;
            if (startNewBurst) {
              workerPrivateSyncBurstAttempt = 0;
            }
            void refreshWorkerProjection(realm);
          }, delayMilliseconds);
        };
        const markWorkerPrivateSyncFailure = (
          realm: WarpkeepWorkerRealmAuthority,
          failureReason: WarpkeepWorkerPrivateSyncFailureReason
        ) => {
          if (!current()) return;
          const latestRealm = canonicalRealmSnapshotRef.current?.generation === generation
            ? canonicalRealmSnapshotRef.current.value
            : retiredRealmContinuity;
          if (!workerCapabilityIsActive(latestRealm)) {
            resetWorkerPrivateSyncLifecycle();
            publishWorkerPrivateSync(NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS);
            return;
          }
          if (workerPrivateSyncRequiredAt === undefined) {
            workerPrivateSyncRequiredAt = Date.now();
          }
          const localizedFailureCount =
            currentWorkerPrivateSync().localizedFailureCount + 1;
          const retryDelay = WORKER_PRIVATE_SYNC_RETRY_DELAYS_MILLISECONDS[
            workerPrivateSyncBurstAttempt - 1
          ];
          if (retryDelay !== undefined && !document.hidden) {
            publishWorkerPrivateSync(workerPrivateSyncStatus({
              phase: 'retry-wait',
              attempt: workerPrivateSyncBurstAttempt,
              ...workerPrivateSyncMetadata(),
              localizedFailureCount,
              failureReason
            }));
            scheduleWorkerPrivateSyncRetry(realm, retryDelay);
            return;
          }
          publishWorkerPrivateSync(workerPrivateSyncStatus({
            phase: document.hidden && hasRetainedWorkerDisplay()
              ? 'stale-read-only'
              : 'failed-localized',
            attempt: workerPrivateSyncBurstAttempt,
            ...workerPrivateSyncMetadata(),
            localizedFailureCount,
            failureReason
          }));
          if (!document.hidden) {
            scheduleWorkerPrivateSyncRetry(
              realm,
              WORKER_PRIVATE_SYNC_LOW_FREQUENCY_RETRY_MILLISECONDS,
              true
            );
          }
        };
        const refreshWorkerProjection = async (capabilityRealm: WarpkeepWorkerRealmAuthority) => {
          const latestCanonicalRealm =
            canonicalRealmSnapshotRef.current?.generation === generation
              ? canonicalRealmSnapshotRef.current.value
              : undefined;
          const syncRealm = latestCanonicalRealm ?? retiredRealmContinuity ?? capabilityRealm;
          if (!current()) return;
          if (!workerCapabilityIsActive(syncRealm)) {
            resetWorkerPrivateSyncLifecycle();
            publishWorkerPrivateSync(NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS);
            return;
          }
          workerPrivateSyncLastRealm = syncRealm;
          if (document.hidden) {
            publishWorkerPrivateSync(workerPrivateSyncStatus({
              phase: hasRetainedWorkerDisplay() ? 'stale-read-only' : 'failed-localized',
              attempt: workerPrivateSyncBurstAttempt,
              ...workerPrivateSyncMetadata()
            }));
            return;
          }
          if (workerRefreshInFlight) {
            // Coalesce to the newest validated public projection. No private
            // read from an older public lifecycle may regain command authority.
            queuedWorkerCapabilityRealm = syncRealm;
            const previous = currentWorkerPrivateSync();
            const retained = currentGenerationWorkerPair();
            const retainedAuthorityIsCoherent = previous.commandsEnabled
              && activeWorkerProjection(
                syncRealm,
                retained.roster,
                retained.resourceState
              ) !== undefined;
            if (!retainedAuthorityIsCoherent && workerPrivateSyncRequiredAt === undefined) {
              workerPrivateSyncRequiredAt = Date.now();
            }
            publishWorkerPrivateSync(workerPrivateSyncStatus({
              ...previous,
              phase: retainedAuthorityIsCoherent ? 'ready' : 'synchronizing',
              queuedRefresh: true,
              commandsEnabled: retainedAuthorityIsCoherent
            }));
            return;
          }
          cancelWorkerPrivateSyncRetry();
          workerRefreshInFlight = true;
          workerPrivateSyncBurstAttempt += 1;
          const previous = currentWorkerPrivateSync();
          const retained = currentGenerationWorkerPair();
          const retainedAuthorityIsCoherent = previous.commandsEnabled
            && activeWorkerProjection(
              syncRealm,
              retained.roster,
              retained.resourceState
            ) !== undefined;
          if (!retainedAuthorityIsCoherent && workerPrivateSyncRequiredAt === undefined) {
            workerPrivateSyncRequiredAt = Date.now();
          }
          publishWorkerPrivateSync(workerPrivateSyncStatus({
            phase: retainedAuthorityIsCoherent ? 'ready' : 'synchronizing',
            attempt: workerPrivateSyncBurstAttempt,
            ...workerPrivateSyncMetadata(),
            queuedRefresh: retainedAuthorityIsCoherent,
            commandsEnabled: retainedAuthorityIsCoherent
          }));
          let succeeded = false;
          try {
            const pairResult = await readCoherentWorkerProjectionPair({
              expectedFid: BigInt(bridgeFid!),
              ...(runtime.readWorkerControlState === undefined ? {} : {
                readControlState: () => runtime.readWorkerControlState!(
                  activeConnection,
                  bridgeFid!
                )
              }),
              ...(runtime.readWorkerRoster === undefined ? {} : {
                readRoster: () => runtime.readWorkerRoster!(activeConnection, bridgeFid!)
              }),
              ...(runtime.readResourceStateV2 === undefined ? {} : {
                readResourceState: () => runtime.readResourceStateV2!(
                  activeConnection,
                  bridgeFid!
                )
              }),
              readRealm: () => syncRealm,
              retainedPair: monotonicWorkerPair,
              current: () => current()
                && connectionRef.current === activeConnection
                && !document.hidden
                && syncRealm.ownCastle.ownerFid === bridgeFid
            });
            if (pairResult.status === 'failed') {
              markWorkerPrivateSyncFailure(syncRealm, pairResult.reason);
              return;
            }
            if (!current() || document.hidden) {
              markWorkerPrivateSyncFailure(syncRealm, 'stale-generation');
              return;
            }
            const pair = pairResult.pair;
            const { roster, resourceState } = pair;
            const retained = monotonicWorkerPair();
            const latestRealm = canonicalRealmSnapshotRef.current?.generation === generation
              ? canonicalRealmSnapshotRef.current.value
              : retiredRealmContinuity;
            const latestProjection = latestRealm === undefined
              ? undefined
              : activeWorkerProjection(latestRealm, roster, resourceState);
            if (
              latestRealm === undefined
              || latestProjection === undefined
              || latestRealm.ownCastle.ownerFid !== bridgeFid
              || !workerProjectionPairIsAtLeastAsNew(
                roster,
                resourceState,
                retained.roster,
                retained.resourceState
              )
            ) {
              markWorkerPrivateSyncFailure(syncRealm, 'public-graph-changed');
              return;
            }
            workerRosterStateRef.current =
              Object.freeze({ generation, fid: bridgeFid!, value: roster });
            workerResourceStateRef.current =
              Object.freeze({ generation, fid: bridgeFid!, value: resourceState });
            const previousPrivateSync = currentWorkerPrivateSync();
            const readyLatencyMilliseconds = workerPrivateSyncRequiredAt === undefined
              ? previousPrivateSync.readyLatencyMilliseconds
              : Date.now() - workerPrivateSyncRequiredAt;
            const readyPrivateSync = workerPrivateSyncStatus({
              phase: 'ready',
              attempt: workerPrivateSyncBurstAttempt,
              localizedFailureCount: previousPrivateSync.localizedFailureCount,
              lastSuccessGeneration: generation,
              lastSuccessRevision: workerPrivatePairRevision(roster, resourceState),
              readyLatencyMilliseconds,
              commandsEnabled: workerCommandsAreAvailable
            });
            const publishedPrivateSync = legacyRealmRetired
              ? workerPrivateSyncStatus({
                  ...readyPrivateSync,
                  phase: 'stale-read-only',
                  retainedStale: true,
                  commandsEnabled: false
                })
              : readyPrivateSync;
            workerPrivateSyncRequiredAt = undefined;
            workerPrivateSyncStateRef.current = Object.freeze({
              generation,
              fid: bridgeFid!,
              value: publishedPrivateSync
            });
            const refreshedLifecycle = workerCommandLifecycleState(roster);
            for (const [retainedFingerprint, retainedAttempt] of workerCommandAttemptsRef.current) {
              if (!workerCommandAttemptMatchesLifecycle(
                retainedAttempt,
                generation,
                refreshedLifecycle
              )) {
                workerCommandAttemptsRef.current.delete(retainedFingerprint);
              }
            }
            setState((latest) => {
              if (
                !current()
                || latest.phase !== 'ready'
                || latest.identity?.fid !== bridgeFid
                || (
                  latest.realm?.ownCastle.ownerFid !== bridgeFid
                  && !(
                    latest.legacyRealmAuthority === 'retired'
                    && retiredRealmContinuity?.ownCastle.ownerFid === bridgeFid
                  )
                )
                || !workerProjectionPairIsAtLeastAsNew(
                  roster,
                  resourceState,
                  latest.workerRoster,
                  latest.workerResourceState
                )
              ) return latest;
              const authority = latest.realm ?? retiredRealmContinuity;
              if (authority === undefined) return latest;
              const projection = activeWorkerProjection(authority, roster, resourceState);
              if (projection === undefined) return latest;
              return {
                ...latest,
                workerRoster: roster,
                workerResourceState: resourceState,
                workerProjection: projection,
                workerPrivateSync: publishedPrivateSync
              };
            });
            succeeded = true;
          } catch {
            // Worker v12 is additive. Localize read failures and retry only the
            // caller-private reads; the public Realm stays authoritative.
            markWorkerPrivateSyncFailure(syncRealm, 'unknown-localized');
          } finally {
            workerRefreshInFlight = false;
            const queuedRealm = queuedWorkerCapabilityRealm;
            queuedWorkerCapabilityRealm = undefined;
            if (queuedRealm !== undefined && current()) {
              cancelWorkerPrivateSyncRetry();
              workerPrivateSyncBurstAttempt = 0;
              void refreshWorkerProjection(queuedRealm);
            } else if (succeeded) {
              workerPrivateSyncBurstAttempt = 0;
            }
          }
        };
        requestWorkerPrivateSync = () => {
          if (!current()) return;
          const realm = canonicalRealmSnapshotRef.current?.generation === generation
            ? canonicalRealmSnapshotRef.current.value
            : retiredRealmContinuity ?? workerPrivateSyncLastRealm;
          if (!workerCapabilityIsActive(realm)) return;
          cancelWorkerPrivateSyncRetry();
          if (
            !currentWorkerPrivateSync().commandsEnabled
            && workerPrivateSyncRequiredAt === undefined
          ) {
            workerPrivateSyncRequiredAt = Date.now();
          }
          workerPrivateSyncBurstAttempt = 0;
          void refreshWorkerProjection(realm!);
        };
        requestWorkerPrivateSyncRef.current = requestWorkerPrivateSync;
        const handleWorkerPrivateSyncVisibilityChange = () => {
          if (document.hidden) {
            cancelWorkerPrivateSyncRetry();
            if (workerCapabilityIsActive(workerPrivateSyncLastRealm)) {
              const previous = currentWorkerPrivateSync();
              if (previous.commandsEnabled && workerPrivateSyncRequiredAt === undefined) {
                workerPrivateSyncRequiredAt = Date.now();
              }
              publishWorkerPrivateSync(workerPrivateSyncStatus({
                ...previous,
                phase: hasRetainedWorkerDisplay()
                  ? 'stale-read-only'
                  : 'failed-localized',
                queuedRefresh: false,
                retainedStale: hasRetainedWorkerDisplay(),
                commandsEnabled: false
              }));
            }
            return;
          }
          requestWorkerPrivateSync();
        };
        const handleWorkerPrivateSyncPageShow = () => {
          if (!document.hidden) requestWorkerPrivateSync();
        };
        const handleWorkerPrivateSyncOnline = () => {
          if (!document.hidden) requestWorkerPrivateSync();
        };
        document.addEventListener(
          'visibilitychange',
          handleWorkerPrivateSyncVisibilityChange
        );
        window.addEventListener('pageshow', handleWorkerPrivateSyncPageShow);
        window.addEventListener('online', handleWorkerPrivateSyncOnline);
        removeWorkerPrivateSyncLifecycleListeners = () => {
          document.removeEventListener(
            'visibilitychange',
            handleWorkerPrivateSyncVisibilityChange
          );
          window.removeEventListener('pageshow', handleWorkerPrivateSyncPageShow);
          window.removeEventListener('online', handleWorkerPrivateSyncOnline);
        };

        const clearInnerKeepProjection = () => {
          if (!current()) return;
          innerKeepProjectionRef.current = undefined;
          setState((latest) => {
            if (
              !current()
              || latest.identity?.fid !== bridgeFid
              || latest.phase !== 'ready'
              || latest.innerKeep === undefined
            ) return latest;
            const { innerKeep: _innerKeep, ...withoutInnerKeep } = latest;
            return withoutInnerKeep;
          });
        };
        const innerKeepCommandAuthorityIsCurrent = () => {
          const browserAuthority = currentBridgeCommandAuthorityRef.current;
          const connectionAuthority = connectionBridgeCommandAuthorityRef.current;
          if (browserAuthority === undefined || connectionAuthority === undefined) {
            return false;
          }
          return current()
            && !document.hidden
            && runtime.startInnerKeepProject !== undefined
            && runtime.readInnerKeepRequestStatus !== undefined
            && browserAuthority.fid === bridgeFid
            && browserAuthority.expiresAt > Date.now()
            && connectionAuthority.generation === generation
            && connectionAuthority.fid === bridgeFid
            && connectionAuthority.jwt === browserAuthority.jwt;
        };
        const publishInnerKeepProjection = (projection: ReadyInnerKeepProjection) => {
          if (!current()) return;
          const castleId = projection.scope.castleId;
          const canonicalRealm = canonicalRealmSnapshotRef.current?.generation === generation
            ? canonicalRealmSnapshotRef.current.value
            : retiredRealmContinuity;
          if (
            projection.scope.generation !== generation
            || projection.scope.fid !== bridgeFid
            || projection.scope.backendProtocolVersion !== backendProtocolVersion
            || canonicalRealm === undefined
            || castleId !== BigInt(canonicalRealm.ownCastle.castleId)
            || projection.presentation.castleId !== castleId
          ) return;
          innerKeepProjectionRef.current = Object.freeze({
            generation,
            fid: bridgeFid!,
            castleId,
            value: projection
          });
          setState((latest) => (
            current()
            && latest.phase === 'ready'
            && latest.admission === 'ready'
            && latest.identity?.fid === bridgeFid
            && (
              latest.realm?.ownCastle.castleId === canonicalRealm.ownCastle.castleId
              || (
                latest.legacyRealmAuthority === 'retired'
                && retiredRealmContinuity?.ownCastle.castleId
                  === canonicalRealm.ownCastle.castleId
              )
            )
              ? { ...latest, innerKeep: projection.presentation }
              : latest
          ));
        };
        const scheduleInnerKeepReconciliation = () => {
          if (
            !current()
            || document.hidden
            || innerKeepCommandAttemptRef.current === undefined
            || innerKeepReconciliationTimeout !== undefined
          ) return;
          const delays = [250, 1_000, 4_000] as const;
          const delay = delays[innerKeepReconciliationAttempt];
          if (delay === undefined) return;
          innerKeepReconciliationAttempt += 1;
          innerKeepReconciliationTimeout = setTimeout(() => {
            innerKeepReconciliationTimeout = undefined;
            requestInnerKeepSync();
          }, delay);
        };
        const refreshInnerKeepProjection = async (
          capabilityRealm: WarpkeepWorkerRealmAuthority
        ) => {
          if (!current()) return;
          if (runtime.readInnerKeepProjection === undefined) {
            clearInnerKeepProjection();
            return;
          }
          const currentBackendProtocolVersion = backendProtocolVersion;
          if (currentBackendProtocolVersion === undefined) {
            clearInnerKeepProjection();
            return;
          }
          const latestRealm = canonicalRealmSnapshotRef.current?.generation === generation
            ? canonicalRealmSnapshotRef.current.value
            : retiredRealmContinuity ?? capabilityRealm;
          if (
            latestRealm.ownCastle.ownerFid !== bridgeFid
            || !Number.isSafeInteger(latestRealm.ownCastle.castleId)
            || latestRealm.ownCastle.castleId <= 0
          ) {
            clearInnerKeepProjection();
            return;
          }
          if (innerKeepRefreshInFlight) {
            innerKeepRefreshQueued = true;
            return;
          }
          innerKeepRefreshInFlight = true;
          const scope = Object.freeze({
            generation,
            fid: bridgeFid!,
            castleId: BigInt(latestRealm.ownCastle.castleId),
            backendProtocolVersion: currentBackendProtocolVersion
          });
          const pendingAttempt = innerKeepCommandAttemptRef.current;
          const requestedDefinitiveFailure =
            innerKeepDefinitiveFailureRef.current?.generation === generation
            && innerKeepDefinitiveFailureRef.current.fid === bridgeFid
            && innerKeepDefinitiveFailureRef.current.castleId === scope.castleId
              ? innerKeepDefinitiveFailureRef.current
              : undefined;
          try {
            const projection = await withResourceOperationDeadline(
              runtime.readInnerKeepProjection(activeConnection, {
                scope,
                commandsAvailable: requestedDefinitiveFailure === undefined
                  && innerKeepCommandAuthorityIsCurrent(),
                ...(pendingAttempt === undefined ? {} : { pendingAttempt }),
                ...(requestedDefinitiveFailure === undefined ? {} : {
                  statusMessage: requestedDefinitiveFailure.value.statusMessage
                })
              })
            );
            if (
              !current()
              || (
                canonicalRealmSnapshotRef.current?.generation === generation
                  ? canonicalRealmSnapshotRef.current.value.ownCastle.castleId
                    !== latestRealm.ownCastle.castleId
                  : retiredRealmContinuity?.ownCastle.castleId
                    !== latestRealm.ownCastle.castleId
              )
            ) return;
            if (projection === undefined) {
              clearInnerKeepProjection();
              return;
            }
            if (
              projection.scope.generation !== scope.generation
              || projection.scope.fid !== scope.fid
              || projection.scope.castleId !== scope.castleId
              || projection.scope.backendProtocolVersion !== scope.backendProtocolVersion
            ) throw new Error('Inner Keep caller scope changed.');
            if (innerKeepDefinitiveFailureRef.current !== requestedDefinitiveFailure) {
              // A manual status check or a just-set definitive rejection queued
              // a read with newer local authority. Do not publish this stale read.
              return;
            }

            let publishable = projection;
            const currentAttempt = innerKeepCommandAttemptRef.current;
            const retainedAttemptResources = currentAttempt === undefined
              ? undefined
              : innerKeepProjectionRef.current?.generation === generation
                && innerKeepProjectionRef.current.fid === bridgeFid
                && innerKeepProjectionRef.current.castleId === scope.castleId
                  ? innerKeepProjectionRef.current.value.presentation.resources
                  : undefined;
            if (
              currentAttempt !== undefined
              && currentAttempt.scope.generation === generation
              && currentAttempt.scope.fid === bridgeFid
              && runtime.readInnerKeepRequestStatus !== undefined
            ) {
              const receipt = await withResourceOperationDeadline(
                runtime.readInnerKeepRequestStatus(
                  activeConnection,
                  scope,
                  currentAttempt.requestKey
                )
              );
              if (!current() || innerKeepCommandAttemptRef.current !== currentAttempt) return;
              if (receipt !== undefined) {
                const reconciliation = reconcileInnerKeepCommandAttempt(
                  currentAttempt,
                  receipt,
                  projection.buildings
                );
                if (reconciliation === 'confirmed') {
                  const confirmed = await withResourceOperationDeadline(
                    runtime.readInnerKeepProjection(activeConnection, {
                      scope,
                      commandsAvailable: innerKeepCommandAuthorityIsCurrent()
                    })
                  );
                  if (
                    !current()
                    || innerKeepCommandAttemptRef.current !== currentAttempt
                    || confirmed === undefined
                    || confirmed.scope.generation !== generation
                    || confirmed.scope.fid !== bridgeFid
                    || confirmed.scope.castleId !== scope.castleId
                    || confirmed.scope.backendProtocolVersion
                      !== scope.backendProtocolVersion
                  ) {
                    scheduleInnerKeepReconciliation();
                    return;
                  }
                  innerKeepCommandAttemptRef.current = undefined;
                  innerKeepReconciliationAttempt = 0;
                  publishable = confirmed;
                } else if (reconciliation === 'conflict') {
                  const failedPresentation: InnerKeepPresentation = Object.freeze({
                    ...projection.presentation,
                    phase: 'failed',
                    commandsEnabled: false,
                    statusMessage: 'The private receipt and public project disagree. Construction remains sealed.'
                  });
                  publishable = Object.freeze({
                    ...projection,
                    presentation: failedPresentation
                  });
                }
              }
            }
            if (
              currentAttempt !== undefined
              && innerKeepCommandAttemptRef.current === currentAttempt
              && retainedAttemptResources !== undefined
            ) {
              // Until private receipt and public project agree, do not let a
              // partial read make newly deducted resources look authoritative.
              publishable = Object.freeze({
                ...publishable,
                presentation: Object.freeze({
                  ...publishable.presentation,
                  resources: retainedAttemptResources
                })
              });
            } else if (requestedDefinitiveFailure !== undefined) {
              publishable = Object.freeze({
                ...publishable,
                presentation: Object.freeze({
                  ...publishable.presentation,
                  phase: 'failed',
                  commandsEnabled: false,
                  statusMessage: requestedDefinitiveFailure.value.statusMessage
                })
              });
            }
            publishInnerKeepProjection(publishable);
            if (innerKeepCommandAttemptRef.current !== undefined) {
              scheduleInnerKeepReconciliation();
            } else if (innerKeepReconciliationTimeout !== undefined) {
              clearTimeout(innerKeepReconciliationTimeout);
              innerKeepReconciliationTimeout = undefined;
            }
          } catch {
            if (!current()) return;
            const retained = innerKeepProjectionRef.current;
            if (
              retained?.generation === generation
              && retained.fid === bridgeFid
              && retained.castleId === scope.castleId
            ) {
              const pending = innerKeepCommandAttemptRef.current;
              const retainedPresentation: InnerKeepPresentation = Object.freeze({
                ...retained.value.presentation,
                phase: pending === undefined ? 'read-only' : 'synchronizing',
                commandsEnabled: false,
                statusMessage: pending === undefined
                  ? 'Inner Keep status could not be refreshed. The current view is read-only.'
                  : 'Construction remains sealed while the Realm status is uncertain.'
              });
              publishInnerKeepProjection(Object.freeze({
                ...retained.value,
                presentation: retainedPresentation
              }));
            } else {
              clearInnerKeepProjection();
            }
            scheduleInnerKeepReconciliation();
          } finally {
            innerKeepRefreshInFlight = false;
            if (innerKeepRefreshQueued && current()) {
              innerKeepRefreshQueued = false;
              const queuedRealm = canonicalRealmSnapshotRef.current?.generation === generation
                ? canonicalRealmSnapshotRef.current.value
                : retiredRealmContinuity;
              if (queuedRealm !== undefined) void refreshInnerKeepProjection(queuedRealm);
            }
          }
        };
        requestInnerKeepSync = () => {
          if (!current()) return;
          const realm = canonicalRealmSnapshotRef.current?.generation === generation
            ? canonicalRealmSnapshotRef.current.value
            : retiredRealmContinuity;
          if (realm !== undefined) void refreshInnerKeepProjection(realm);
        };
        requestInnerKeepSyncRef.current = requestInnerKeepSync;

        const refreshGreaterRealmWorkerControl = async () => {
          if (
            !current()
            || !legacyRealmRetired
            || document.hidden
            || greaterRealmWorkerRefreshInFlight
            || runtime.readGreaterRealmWorkerControlState === undefined
          ) return;
          greaterRealmWorkerRefreshInFlight = true;
          try {
            const decoded = await withResourceOperationDeadline(
              runtime.readGreaterRealmWorkerControlState(activeConnection, bridgeFid!)
            );
            if (
              !current()
              || !legacyRealmRetired
              || document.hidden
              || decoded?.status !== 'ready'
            ) return;
            const retained = greaterRealmWorkerControlStateRef.current?.generation === generation
              && greaterRealmWorkerControlStateRef.current.fid === bridgeFid
              ? greaterRealmWorkerControlStateRef.current.value
              : undefined;
            if (
              retained !== undefined
              && (
                decoded.atlasId !== retained.atlasId
                || decoded.atlasRevision !== retained.atlasRevision
                || !workerProjectionPairIsAtLeastAsNew(
                  decoded.value.roster,
                  decoded.value.resourceState,
                  retained.value.roster,
                  retained.value.resourceState
                )
              )
            ) return;
            greaterRealmWorkerControlStateRef.current = Object.freeze({
              generation,
              fid: bridgeFid!,
              value: decoded
            });
            workerRosterStateRef.current = Object.freeze({
              generation,
              fid: bridgeFid!,
              value: decoded.value.roster
            });
            workerResourceStateRef.current = Object.freeze({
              generation,
              fid: bridgeFid!,
              value: decoded.value.resourceState
            });
            const lifecycle = workerCommandLifecycleState(decoded.value.roster);
            for (const [fingerprint, attempt] of workerCommandAttemptsRef.current) {
              if (!workerCommandAttemptMatchesLifecycle(attempt, generation, lifecycle)) {
                workerCommandAttemptsRef.current.delete(fingerprint);
              }
            }
            setState((latest) => (
              current()
              && latest.phase === 'ready'
              && latest.admission === 'ready'
              && latest.legacyRealmAuthority === 'retired'
              && latest.identity?.fid === bridgeFid
                ? {
                    ...latest,
                    workerRoster: decoded.value.roster,
                    workerResourceState: decoded.value.resourceState,
                    greaterRealmWorkerControl: decoded
                  }
                : latest
            ));
          } catch {
            // Retain the last validated own-worker view as read-only continuity.
          } finally {
            greaterRealmWorkerRefreshInFlight = false;
          }
        };
        requestGreaterRealmWorkerControl = () => {
          if (current() && legacyRealmRetired) {
            void refreshGreaterRealmWorkerControl();
          }
        };
        requestGreaterRealmWorkerControlRef.current = requestGreaterRealmWorkerControl;

        const refreshRetiredContinuity = () => {
          if (!current() || !legacyRealmRetired) return;
          const previous = retiredRealmContinuity;
          try {
            const next = runtime.readRealmContinuity?.(activeConnection, bridgeFid!)
              ?? previous;
            if (
              next === undefined
              || next.ownCastle.ownerFid !== bridgeFid
              || !Number.isSafeInteger(next.ownCastle.castleId)
              || next.ownCastle.castleId <= 0
            ) return;
            retiredRealmContinuity = next;
            const roster = workerRosterStateRef.current?.generation === generation
              && workerRosterStateRef.current.fid === bridgeFid
              ? workerRosterStateRef.current.value
              : undefined;
            const workerResourceState =
              workerResourceStateRef.current?.generation === generation
              && workerResourceStateRef.current.fid === bridgeFid
                ? workerResourceStateRef.current.value
                : undefined;
            setState((latest) => {
              if (
                !current()
                || latest.phase !== 'ready'
                || latest.admission !== 'ready'
                || latest.legacyRealmAuthority !== 'retired'
                || latest.identity?.fid !== bridgeFid
              ) return latest;
              return {
                ...latest,
                realmContinuity: next,
                ...(roster === undefined ? {} : { workerRoster: roster }),
                ...(workerResourceState === undefined ? {} : { workerResourceState })
              };
            });
            if (workerPublicSyncRevision(next) !== workerPublicSyncRevision(previous ?? next)) {
              requestGreaterRealmWorkerControl();
            }
            requestInnerKeepSync();
          } catch {
            // Shared projections retain their last validated castle-scoped view.
          }
        };

        const retireLegacyRealmAuthority = () => {
          if (!current() || legacyRealmRetired) return;
          const lastCanonicalRealm = canonicalRealmSnapshotRef.current?.generation === generation
            ? canonicalRealmSnapshotRef.current.value
            : retainedReadyState?.realm;
          legacyRealmRetired = true;
          if (readinessTimeout !== undefined) {
            clearTimeout(readinessTimeout);
            readinessTimeout = undefined;
          }
          retiredRealmContinuity = lastCanonicalRealm === undefined
            ? undefined
            : continuityProjectionFromCanonicalRealm(lastCanonicalRealm);
          try {
            retiredRealmContinuity = runtime.readRealmContinuity?.(
              activeConnection,
              bridgeFid!
            ) ?? retiredRealmContinuity;
          } catch {
            // A previously validated castle-scoped projection remains safe to retain.
          }
          canonicalRealmSnapshotRef.current = undefined;
          // Only legacy expedition commands retire with Lowlands. Shared
          // account/resources, generic Workers, Marks, Chat, and Inner Keep
          // keep their current generation and castle-ID scope.
          goldExpeditionOperationGenerationRef.current = undefined;
          foodExpeditionOperationGenerationRef.current = undefined;
          woodExpeditionOperationGenerationRef.current = undefined;
          stoneExpeditionOperationGenerationRef.current = undefined;
          legacyReturnOperationGenerationRef.current = undefined;
          goldDispatchAttemptRef.current = undefined;
          foodDispatchAttemptRef.current = undefined;
          woodDispatchAttemptRef.current = undefined;
          stoneDispatchAttemptRef.current = undefined;
          canonicalRealmSourceRef.current = canonicalRealmSource;
          transportReconnectAttemptRef.current = 0;
          const currentState = stateRef.current;
          const resources = resourceStateRef.current?.generation === generation
            ? resourceStateRef.current.value
            : currentState.resources;
          const roster = workerRosterStateRef.current?.generation === generation
            && workerRosterStateRef.current.fid === bridgeFid
            ? workerRosterStateRef.current.value
            : currentState.workerRoster;
          const workerResourceState = workerResourceStateRef.current?.generation === generation
            && workerResourceStateRef.current.fid === bridgeFid
            ? workerResourceStateRef.current.value
            : currentState.workerResourceState;
          const retiredWorkerPrivateSync = NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS;
          workerPrivateSyncStateRef.current = Object.freeze({
            generation,
            fid: bridgeFid!,
            value: retiredWorkerPrivateSync
          });
          setState({
            phase: 'ready',
            workerPrivateSync: retiredWorkerPrivateSync,
            identity,
            admission: 'ready',
            legacyRealmAuthority: 'retired',
            ...(retiredRealmContinuity === undefined ? {} : {
              realmContinuity: retiredRealmContinuity
            }),
            ...(resources === undefined ? {} : { resources }),
            ...(roster === undefined ? {} : { workerRoster: roster }),
            ...(workerResourceState === undefined ? {} : { workerResourceState }),
            ...(currentState.innerKeep === undefined ? {} : {
              innerKeep: currentState.innerKeep
            })
          });
          if (
            runtime.readGreaterRealmWorkerControlState !== undefined
            && greaterRealmWorkerRefreshInterval === undefined
          ) {
            greaterRealmWorkerRefreshInterval = setInterval(
              requestGreaterRealmWorkerControl,
              GREATER_REALM_WORKER_CONTROL_POLL_INTERVAL_MILLISECONDS
            );
            const onVisibilityChange = () => {
              if (!document.hidden) requestGreaterRealmWorkerControl();
            };
            document.addEventListener('visibilitychange', onVisibilityChange);
            removeGreaterRealmWorkerLifecycleListeners = () => {
              document.removeEventListener('visibilitychange', onVisibilityChange);
            };
          }
          requestGreaterRealmWorkerControl();
          requestInnerKeepSync();
        };

        const publishCanonicalRealm = (observedSnapshot?: WarpkeepRealmSnapshot) => {
          const resources = resourceStateRef.current?.generation === generation
            ? resourceStateRef.current.value
            : undefined;
          const goldExpedition = goldExpeditionStateRef.current?.generation === generation
            ? goldExpeditionStateRef.current.value
            : undefined;
          const foodExpedition = foodExpeditionStateRef.current?.generation === generation
            ? foodExpeditionStateRef.current.value
            : undefined;
          const woodExpedition = woodExpeditionStateRef.current?.generation === generation
            ? woodExpeditionStateRef.current.value
            : undefined;
          const stoneExpedition = stoneExpeditionStateRef.current?.generation === generation
            ? stoneExpeditionStateRef.current.value
            : undefined;
          const currentWorkerRoster = workerRosterStateRef.current?.generation === generation
            && workerRosterStateRef.current.fid === bridgeFid
            ? workerRosterStateRef.current.value
            : undefined;
          const currentWorkerResourceState =
            workerResourceStateRef.current?.generation === generation
            && workerResourceStateRef.current.fid === bridgeFid
            ? workerResourceStateRef.current.value
            : undefined;
          if (
            !current()
            || legacyRealmRetired
            || !subscriptionApplied
            || backendProtocolVersion === undefined
            || resources === undefined
          ) return;
          try {
            const continuityRealm =
              canonicalRealmSnapshotRef.current?.generation === generation
                ? canonicalRealmSnapshotRef.current.value
                : retainedReadyState?.realm;
            const realm = validateCanonicalGenesisSnapshot(
              observedSnapshot ?? runtime.readRealmSnapshot(
                activeConnection,
                bridgeFid!,
                continuityRealm
              ),
              { ownFid: bridgeFid!, protocolVersion: backendProtocolVersion }
            );
            if (readinessTimeout !== undefined) {
              clearTimeout(readinessTimeout);
              readinessTimeout = undefined;
            }
            canonicalRealmSourceRef.current = canonicalRealmSource;
            canonicalRealmSnapshotRef.current = Object.freeze({
              generation,
              value: realm
            });
            const workerCapabilityActive = workerCapabilityIsActive(realm);
            const currentProjection = workerCapabilityActive
              ? activeWorkerProjection(
                  realm,
                  currentWorkerRoster,
                  currentWorkerResourceState
                )
              : undefined;
            const retainedDisplayPair = workerCapabilityActive
              && retainedWorkerProjectionPair !== undefined
              && retainedWorkerProjectionPair.fid === bridgeFid
              && retainedWorkerProjectionPair.source === canonicalRealmSource
              ? retainedWorkerProjectionPair
              : undefined;
            const retainedDisplayProjection = retainedDisplayPair !== undefined
              ? activeWorkerProjection(
                  realm,
                  retainedDisplayPair.roster,
                  retainedDisplayPair.resourceState
                )
              : undefined;
            const workerRoster = currentProjection === undefined
              ? retainedDisplayProjection === undefined
                ? undefined
                : retainedDisplayPair!.roster
              : currentWorkerRoster;
            const workerResourceState = currentProjection === undefined
              ? retainedDisplayProjection === undefined
                ? undefined
                : retainedDisplayPair!.resourceState
              : currentWorkerResourceState;
            const workerProjection = currentProjection ?? retainedDisplayProjection;
            const publicWorkerRevision = workerCapabilityActive
              ? workerPublicSyncRevision(realm)
              : undefined;
            const workerPublicRevisionChanged = publicWorkerRevision !== undefined
              && publicWorkerRevision !== lastRequestedWorkerPublicRevision;
            lastRequestedWorkerPublicRevision = publicWorkerRevision;
            const publicCommandLifecycle = publicWorkerCommandLifecycleState(realm);
            if (publicCommandLifecycle !== undefined) {
              for (
                const [fingerprint, attempt]
                of workerCommandAttemptsRef.current
              ) {
                if (!workerCommandAttemptMatchesLifecycle(
                  attempt,
                  generation,
                  publicCommandLifecycle
                )) {
                  workerCommandAttemptsRef.current.delete(fingerprint);
                }
              }
            }
            let workerPrivateSync = currentWorkerPrivateSync();
            if (!workerCapabilityActive) {
              resetWorkerPrivateSyncLifecycle();
              workerPrivateSync = NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS;
            } else if (currentProjection === undefined) {
              workerPrivateSync = workerPrivateSyncStatus({
                ...workerPrivateSync,
                phase: workerPrivateSync.phase === 'retry-wait'
                  || workerPrivateSync.phase === 'failed-localized'
                  ? workerPrivateSync.phase
                  : retainedDisplayProjection === undefined
                    ? 'synchronizing'
                    : 'stale-read-only',
                retainedStale: retainedDisplayProjection !== undefined,
                commandsEnabled: false
              });
            }
            workerPrivateSyncStateRef.current = Object.freeze({
              generation,
              fid: bridgeFid!,
              value: workerPrivateSync
            });
            const retainedInnerKeep =
              innerKeepProjectionRef.current?.generation === generation
              && innerKeepProjectionRef.current.fid === bridgeFid
              && innerKeepProjectionRef.current.castleId === BigInt(realm.ownCastle.castleId)
              && innerKeepProjectionRef.current.value.scope.backendProtocolVersion
                === backendProtocolVersion
                ? innerKeepProjectionRef.current.value.presentation
                : undefined;
            setState({
              phase: 'ready',
              workerPrivateSync,
              identity,
              admission: 'ready',
              legacyRealmAuthority: 'active',
              realm,
              resources,
              ...(goldExpedition === undefined ? {} : { goldExpedition }),
              ...(foodExpedition === undefined ? {} : { foodExpedition }),
              ...(woodExpedition === undefined ? {} : { woodExpedition }),
              ...(stoneExpedition === undefined ? {} : { stoneExpedition }),
              ...(workerRoster === undefined ? {} : { workerRoster }),
              ...(workerResourceState === undefined ? {} : { workerResourceState }),
              ...(workerProjection === undefined ? {} : { workerProjection }),
              ...(retainedInnerKeep === undefined ? {} : { innerKeep: retainedInnerKeep })
            });
            transportReconnectAttemptRef.current = 0;
            if (workerPublicRevisionChanged) requestWorkerPrivateSync();
            requestInnerKeepSync();
          } catch (error) {
            if (error instanceof WarpkeepLegacyRealmRetiredError) {
              retireLegacyRealmAuthority();
              return;
            }
            failRealmActivation('canonical_snapshot_invalid');
          }
        };
        const updateObservedRealm = (observedSnapshot: WarpkeepRealmSnapshot) => {
          // Public table listeners are installed before subscribe() to avoid a
          // post-apply race, but they have no render authority until onApplied.
          if (!subscriptionApplied) return;
          publishCanonicalRealm(observedSnapshot);
        };
        const applySubscribedRealm = () => {
          if (!current()) return;
          subscriptionApplied = true;
          if (legacyRealmRetired) {
            refreshRetiredContinuity();
            return;
          }
          publishCanonicalRealm();
        };
        publishReadySnapshot = () => publishCanonicalRealm();
        activateRealm = () => {
          if (!current()) return;
          if (realmActivated) {
            publishReadySnapshot?.();
            return;
          }
          if (realmActivationPromise !== undefined) return;
          if (!reconnectingState) {
            setState({
              phase: 'opening-realm',
              workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
              identity,
              admission: 'ready'
            });
          }
          const settleAndReadResources = async () => {
            try {
              // The existing no-input reducer derives the caller, clock,
              // rates, caps, and exact deltas entirely inside SpacetimeDB.
              // Running it as part of the private refresh removes the need
              // for a player-facing Claim action while keeping the browser
              // out of economic authority.
              return await withResourceOperationDeadline(
                runtime.collectResources(activeConnection, bridgeFid!)
              );
            } catch {
              // A timed-out reducer is commit-ambiguous. Reconcile through a
              // fresh caller-bound read instead of retrying it in the same
              // refresh; the next bounded cycle may safely attempt another
              // idempotent settlement.
              reportFailure('warpkeep_resource_settlement_reconciled');
              return withResourceOperationDeadline(
                runtime.readResourceState(activeConnection, bridgeFid!)
              );
            }
          };
          readinessTimeout = setTimeout(() => {
            failRealmActivation('canonical_readiness_timeout');
          }, CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS);
          const activation = (async () => {
            // Begin every private read and the large public subscription
            // concurrently. The core resource projection and public snapshot
            // remain mandatory; additive expedition projections fail closed
            // to unavailable controls without delaying Realm entry in series.
            type InitialResourceRead =
              | Readonly<{
                  status: 'ready';
                  value: Awaited<ReturnType<WarpkeepBackendRuntime['readResourceState']>>;
                }>
              | Readonly<{
                  status: 'failed';
                  reason: 'resource_projection_deadline' | 'resource_projection_failed';
                }>;
            let initialResourcePromise: Promise<InitialResourceRead>;
            try {
              // Realm entry remains a read-only projection so authentication
              // and subscription readiness never depend on an incidental
              // settlement attempt. The first bounded refresh below performs
              // automatic settlement within at most one minute.
              initialResourcePromise = withResourceOperationDeadline(
                runtime.readResourceState(activeConnection, bridgeFid!)
              ).then((value) => Object.freeze({ status: 'ready' as const, value }))
                .catch((error: unknown) => Object.freeze({
                  status: 'failed' as const,
                  reason: error instanceof ResourceOperationDeadlineError
                    ? 'resource_projection_deadline' as const
                    : 'resource_projection_failed' as const
                }));
            } catch {
              initialResourcePromise = Promise.resolve(Object.freeze({
                status: 'failed' as const,
                reason: 'resource_projection_failed' as const
              }));
            }
            const initialGoldExpeditionPromise = runtime.readGoldExpeditionState === undefined
              ? Promise.resolve<ReadyGoldExpeditionPresentation | undefined>(undefined)
              : withResourceOperationDeadline(
                runtime.readGoldExpeditionState(activeConnection)
              ).catch(() => undefined);
            const initialFoodExpeditionPromise = runtime.readFoodExpeditionState === undefined
              ? Promise.resolve<ReadyFoodExpeditionPresentation | undefined>(undefined)
              : withResourceOperationDeadline(
                runtime.readFoodExpeditionState(activeConnection)
              ).catch(() => undefined);
            const initialWoodExpeditionPromise = runtime.readWoodExpeditionState === undefined
              ? Promise.resolve<ReadyWoodExpeditionPresentation | undefined>(undefined)
              : withResourceOperationDeadline(
                runtime.readWoodExpeditionState(activeConnection)
              ).catch(() => undefined);
            const initialStoneExpeditionPromise = runtime.readStoneExpeditionState === undefined
              ? Promise.resolve<ReadyStoneExpeditionPresentation | undefined>(undefined)
              : withResourceOperationDeadline(
                runtime.readStoneExpeditionState(activeConnection)
              ).catch(() => undefined);
            let startedObserver: () => void;
            try {
              startedObserver = runtime.observeRealm(
                activeConnection,
                bridgeFid!,
                updateObservedRealm,
                (reason) => {
                  if (reason === 'legacy-retired') {
                    retireLegacyRealmAuthority();
                    return;
                  }
                  failRealmActivation('canonical_snapshot_invalid');
                },
                retainedReadyState?.realm,
                refreshRetiredContinuity
              );
            } catch {
              failRealmActivation('observer_setup_failed');
              return;
            }
            if (!current()) {
              // observeRealm may synchronously report a terminal error before
              // returning its cleanup handle. Close that late handle and never
              // start a subscription for the invalidated generation.
              try {
                startedObserver();
              } catch {
                // Generation authority is already revoked; cleanup remains best effort.
              }
              return;
            }
            cleanupObserver = startedObserver;
            let startedSubscription: ReturnType<WarpkeepBackendRuntime['subscribeRealm']>;
            try {
              startedSubscription = runtime.subscribeRealm(
                activeConnection,
                applySubscribedRealm,
                () => failRealmActivation('subscription_failed'),
                bridgeFid!
              );
            } catch {
              failRealmActivation('subscription_setup_failed');
              return;
            }
            if (!current()) {
              // A test runtime or SDK failure callback may fire synchronously from
              // subscribe(). The returned handle was not available to fail(), so
              // close it here instead of retaining a terminal subscription.
              startedSubscription.unsubscribe();
              return;
            }
            subscription = startedSubscription;

            const [
              initialResourceResult,
              initialGoldExpedition,
              initialFoodExpedition,
              initialWoodExpedition,
              initialStoneExpedition
            ] = await Promise.all([
              initialResourcePromise,
              initialGoldExpeditionPromise,
              initialFoodExpeditionPromise,
              initialWoodExpeditionPromise,
              initialStoneExpeditionPromise
            ]);
            if (!current()) return;
            if (initialResourceResult.status === 'failed') {
              if (legacyRealmRetired) return;
              failRealmActivation(initialResourceResult.reason);
              return;
            }
            const initialResources = initialResourceResult.value;
            resourceStateRef.current = Object.freeze({
              generation,
              value: initialResources
            });
            if (!legacyRealmRetired) {
              goldExpeditionStateRef.current = Object.freeze({
                generation,
                value: initialGoldExpedition
              });
              foodExpeditionStateRef.current = Object.freeze({
                generation,
                value: initialFoodExpedition
              });
              woodExpeditionStateRef.current = Object.freeze({
                generation,
                value: initialWoodExpedition
              });
              stoneExpeditionStateRef.current = Object.freeze({
                generation,
                value: initialStoneExpedition
              });
            }
            if (legacyRealmRetired) {
              setState((latest) => (
                current()
                && latest.phase === 'ready'
                && latest.legacyRealmAuthority === 'retired'
                && latest.identity?.fid === bridgeFid
                  ? { ...latest, resources: initialResources }
                  : latest
              ));
            }
            realmActivated = true;
            const refreshResources = async (
              queueAfterInFlight = false
            ): Promise<void> => {
              if (!current() || !realmActivated) return;
              if (resourceRefreshInFlight) {
                if (queueAfterInFlight) resourceRefreshQueuedAfterResume = true;
                return;
              }
              resourceRefreshInFlight = true;
              try {
                const readyRealm = stateRef.current.phase === 'ready'
                  ? stateRef.current.realm ?? retiredRealmContinuity
                  : undefined;
                // One no-input reducer atomically settles passive yield, all
                // active legacy expeditions, and generic worker accrual. Read
                // the optional private projections only after that commit so
                // every surface observes the same or a newer server state.
                const refreshed = await settleAndReadResources();
                if (readyRealm !== undefined) void refreshWorkerProjection(readyRealm);
                const goldRefresh = legacyRealmRetired
                  || runtime.readGoldExpeditionState === undefined
                  ? Promise.resolve<ReadyGoldExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readGoldExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const foodRefresh = legacyRealmRetired
                  || runtime.readFoodExpeditionState === undefined
                  ? Promise.resolve<ReadyFoodExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readFoodExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const woodRefresh = legacyRealmRetired
                  || runtime.readWoodExpeditionState === undefined
                  ? Promise.resolve<ReadyWoodExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readWoodExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const stoneRefresh = legacyRealmRetired
                  || runtime.readStoneExpeditionState === undefined
                  ? Promise.resolve<ReadyStoneExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readStoneExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const [
                  refreshedGoldExpedition,
                  refreshedFoodExpedition,
                  refreshedWoodExpedition,
                  refreshedStoneExpedition
                ] = await Promise.all([
                  goldRefresh,
                  foodRefresh,
                  woodRefresh,
                  stoneRefresh
                ]);
                if (!current()) return;
                if (refreshed.fid !== BigInt(bridgeFid!)) {
                  throw new Error('Warpkeep resource projection identity mismatch.');
                }
                const retained = resourceStateRef.current?.generation === generation
                  ? resourceStateRef.current.value
                  : undefined;
                if (!resourceProjectionIsAtLeastAsNew(refreshed, retained)) return;
                resourceStateRef.current = Object.freeze({ generation, value: refreshed });
                if (!legacyRealmRetired) {
                  goldExpeditionStateRef.current = Object.freeze({
                    generation,
                    value: refreshedGoldExpedition
                  });
                  foodExpeditionStateRef.current = Object.freeze({
                    generation,
                    value: refreshedFoodExpedition
                  });
                  woodExpeditionStateRef.current = Object.freeze({
                    generation,
                    value: refreshedWoodExpedition
                  });
                  stoneExpeditionStateRef.current = Object.freeze({
                    generation,
                    value: refreshedStoneExpedition
                  });
                }
                setState((latest) => {
                  const latestRetained = resourceStateRef.current?.generation === generation
                    ? resourceStateRef.current.value
                    : undefined;
                  if (
                    !current()
                    || refreshed.fid !== BigInt(bridgeFid!)
                    || latest.phase !== 'ready'
                    || latest.identity?.fid !== bridgeFid
                    || (
                      latest.realm === undefined
                      && latest.legacyRealmAuthority !== 'retired'
                    )
                    || latest.resources === undefined
                    || latest.resources.fid !== refreshed.fid
                    || !resourceProjectionIsAtLeastAsNew(refreshed, latestRetained)
                    || !resourceProjectionIsAtLeastAsNew(refreshed, latest.resources)
                  ) return latest;
                  return latest.legacyRealmAuthority === 'retired' ? {
                    ...latest,
                    resources: refreshed
                  } : {
                    ...latest,
                    resources: refreshed,
                    goldExpedition: refreshedGoldExpedition,
                    foodExpedition: refreshedFoodExpedition,
                    woodExpedition: refreshedWoodExpedition,
                    stoneExpedition: refreshedStoneExpedition
                  };
                });
                requestInnerKeepSync();
              } catch {
                reportFailure('warpkeep_resource_refresh_failed');
                if (!legacyRealmRetired) fail();
              } finally {
                resourceRefreshInFlight = false;
                if (resourceRefreshQueuedAfterResume) {
                  resourceRefreshQueuedAfterResume = false;
                  if (current() && realmActivated && !document.hidden) {
                    void refreshResources();
                  }
                }
              }
            };
            const stopResourceRefreshInterval = () => {
              if (resourceRefreshInterval === undefined) return;
              clearInterval(resourceRefreshInterval);
              resourceRefreshInterval = undefined;
            };
            const startResourceRefreshInterval = () => {
              if (
                resourceRefreshInterval !== undefined
                || document.hidden
                || !current()
                || !realmActivated
              ) return;
              resourceRefreshInterval = setInterval(() => {
                if (document.hidden) {
                  stopResourceRefreshInterval();
                  return;
                }
                void refreshResources();
              }, RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
            };
            const cancelResumeResourceRefresh = () => {
              if (resourceResumeRefreshTimeout === undefined) return;
              clearTimeout(resourceResumeRefreshTimeout);
              resourceResumeRefreshTimeout = undefined;
            };
            const scheduleResumeResourceRefresh = () => {
              if (document.hidden || !current() || !realmActivated) return;
              startResourceRefreshInterval();
              if (resourceResumeRefreshTimeout !== undefined) return;
              resourceResumeRefreshTimeout = setTimeout(() => {
                resourceResumeRefreshTimeout = undefined;
                if (document.hidden || !current() || !realmActivated) return;
                void refreshResources(true);
              }, 0);
            };
            const handleResourceVisibilityChange = () => {
              if (document.hidden) {
                stopResourceRefreshInterval();
                cancelResumeResourceRefresh();
                resourceRefreshQueuedAfterResume = false;
                return;
              }
              scheduleResumeResourceRefresh();
            };
            const handleResourcePageShow = () => {
              if (!document.hidden) scheduleResumeResourceRefresh();
            };
            document.addEventListener('visibilitychange', handleResourceVisibilityChange);
            window.addEventListener('pageshow', handleResourcePageShow);
            removeResourceRefreshLifecycleListeners = () => {
              document.removeEventListener('visibilitychange', handleResourceVisibilityChange);
              window.removeEventListener('pageshow', handleResourcePageShow);
            };
            startResourceRefreshInterval();
            // SubscribeApplied may have arrived while resources were pending.
            publishReadySnapshot?.();
          })();
          realmActivationPromise = activation;
          void activation.catch(fail).finally(() => {
            if (realmActivationPromise === activation) realmActivationPromise = undefined;
          });
        };

        stage = 'entry_agreement_status';
        const acceptedCurrentAgreement = runtime.readEntryAgreementStatus
          ? await withBackendStageOperationDeadline(
              runtime.readEntryAgreementStatus(activeConnection)
            )
          : undefined;
        if (!current()) return;
        if (acceptedCurrentAgreement === true) {
          setAcceptedEntryAgreementFid(identity.fid);
          activateRealm();
          return;
        }

        stage = 'terms_acknowledgement';
        const acceptedNow = await acknowledgePendingTerms(activeConnection);
        if (!current()) return;
        if (!acceptedNow && completedTermsAttemptRef.current === 0) {
          setState({
            phase: 'awaiting-terms',
            workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
            identity,
            admission: 'ready'
          });
          return;
        }
        activateRealm();
      } catch {
        reportFailure(`warpkeep_backend_stage_failed:${stage}`);
        if (stage === 'connect' && reconnectingState !== undefined) {
          if (scheduleRetainedTransportReconnect()) return;
        }
        fail();
      }
    };

    void run();
    return terminateConnection;
  }, [
    bridgeAuthenticationContinuityKey,
    bridgeFid,
    checkSequence,
    config,
    farcaster.oidcSession,
    identity,
    runActiveTeardown,
    runtime,
    sharedAlphaAvailable
  ]);

  useEffect(() => {
    if (
      !WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED
      || state.phase !== 'ready'
      || state.admission !== 'ready'
      || runtime.observeRealmChat === undefined
      || runtime.readRealmChat === undefined
      || runtime.readRealmChatRecent === undefined
      || runtime.subscribeRealmChat === undefined
      || typeof document === 'undefined'
    ) {
      setRealmChat(UNAVAILABLE_REALM_CHAT_PRESENTATION);
      return;
    }
    const connection = connectionRef.current;
    if (connection === undefined) {
      setRealmChat(UNAVAILABLE_REALM_CHAT_PRESENTATION);
      return;
    }
    let active = true;
    let applied = false;
    let polling = false;
    let pollFailureCount = 0;
    let afterSequence = 0n;
    let statusProjection: RealmChatPresentation = UNAVAILABLE_REALM_CHAT_PRESENTATION;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let poll: () => Promise<void>;
    setRealmChat(UNAVAILABLE_REALM_CHAT_PRESENTATION);
    const cancelPoll = () => {
      if (pollTimer !== undefined) clearTimeout(pollTimer);
      pollTimer = undefined;
    };
    const unavailable = () => {
      cancelPoll();
      statusProjection = UNAVAILABLE_REALM_CHAT_PRESENTATION;
      if (active) setRealmChat(UNAVAILABLE_REALM_CHAT_PRESENTATION);
    };
    const schedulePoll = (delay: number) => {
      cancelPoll();
      if (!active || !applied || document.hidden || statusProjection.mode !== 'active') return;
      pollTimer = setTimeout(() => { void poll(); }, delay);
    };
    const publishStatus = (projection?: RealmChatPresentation) => {
      if (!active || !applied) return;
      try {
        const status = projection ?? runtime.readRealmChat!(connection);
        statusProjection = status;
        if (status.availability !== 'ready' || status.mode !== 'active') {
          afterSequence = 0n;
          cancelPoll();
          setRealmChat(status);
          return;
        }
        setRealmChat(current => Object.freeze({
          ...status,
          messages: current.availability === 'ready'
            && current.channelKey === status.channelKey
            && current.policyVersion === status.policyVersion
            ? current.messages
            : Object.freeze([])
        }));
        schedulePoll(0);
      } catch {
        unavailable();
      }
    };
    poll = async () => {
      if (
        !active
        || !applied
        || polling
        || document.hidden
        || statusProjection.availability !== 'ready'
        || statusProjection.mode !== 'active'
      ) return;
      cancelPoll();
      polling = true;
      const requestedAfterSequence = afterSequence;
      try {
        const page: RealmChatRecentPagePresentation = await withResourceOperationDeadline(
          runtime.readRealmChatRecent!(connection, requestedAfterSequence, 128)
        );
        if (
          !active
          || document.hidden
          || statusProjection.availability !== 'ready'
          || statusProjection.mode !== 'active'
        ) return;
        if (
          page.nextAfterSequence < requestedAfterSequence
          || page.messages.some(message => message.sequence <= requestedAfterSequence)
        ) throw new Error('Realm Chat recent cursor regressed.');
        afterSequence = page.nextAfterSequence;
        pollFailureCount = 0;
        setRealmChat(current => mergeRealmChatRecentPage(statusProjection, current, page));
        schedulePoll(page.hasMore ? 0 : REALM_CHAT_POLL_INTERVAL_MILLISECONDS);
      } catch {
        if (!active) return;
        pollFailureCount += 1;
        setRealmChat(UNAVAILABLE_REALM_CHAT_PRESENTATION);
        schedulePoll(realmChatPollDelayMilliseconds(pollFailureCount));
      } finally {
        polling = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) cancelPoll();
      else {
        // Rehydrate the entire bounded live window after backgrounding. This
        // avoids presenting an apparent continuous timeline if more than one
        // cache window arrived while polling was suspended.
        afterSequence = 0n;
        schedulePoll(0);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    let cleanupObserver: (() => void) | undefined;
    let subscription: ReturnType<NonNullable<WarpkeepBackendRuntime['subscribeRealmChat']>>
      | undefined;
    try {
      cleanupObserver = runtime.observeRealmChat(
        connection,
        projection => publishStatus(projection),
        unavailable
      );
      subscription = runtime.subscribeRealmChat(
        connection,
        () => {
          applied = true;
          publishStatus();
        },
        unavailable
      );
    } catch {
      unavailable();
    }
    return () => {
      active = false;
      cancelPoll();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      try {
        cleanupObserver?.();
      } finally {
        subscription?.unsubscribe();
      }
    };
  }, [runtime, state.admission, state.identity?.fid, state.phase]);

  const greaterRealm = useMemo<GreaterRealmProviderBridge>(() => {
    const connection = connectionRef.current;
    const connectionAuthority = connectionBridgeCommandAuthorityRef.current;
    const currentAuthority = currentBridgeCommandAuthorityRef.current;
    const authenticatedConnectionPhase = state.phase === 'opening-realm'
      || state.phase === 'ready';
    if (
      !authenticatedConnectionPhase
      || state.admission !== 'ready'
      || state.identity === undefined
      || connection === undefined
      || connectionAuthority === undefined
      || currentAuthority === undefined
      || connectionAuthority.fid !== state.identity.fid
      || currentAuthority.fid !== connectionAuthority.fid
      || currentAuthority.jwt !== connectionAuthority.jwt
    ) {
      return createWarpkeepGreaterRealmProviderBridge({});
    }
    const generation = connectionAuthority.generation;
    const fid = connectionAuthority.fid;
    const jwt = connectionAuthority.jwt;
    const authority: WarpkeepGreaterRealmConnectionAuthority = Object.freeze({
      generation,
      fid,
      isCurrent: () => (
        generationRef.current === generation
        && connectionRef.current === connection
        && connectionBridgeCommandAuthorityRef.current?.generation === generation
        && connectionBridgeCommandAuthorityRef.current.fid === fid
        && connectionBridgeCommandAuthorityRef.current.jwt === jwt
        && currentBridgeCommandAuthorityRef.current?.fid === fid
        && currentBridgeCommandAuthorityRef.current.jwt === jwt
        && currentBridgeCommandAuthorityRef.current.expiresAt > Date.now()
        && (
          stateRef.current.phase === 'opening-realm'
          || stateRef.current.phase === 'ready'
        )
        && stateRef.current.admission === 'ready'
        && stateRef.current.identity?.fid === fid
      )
    });
    return createWarpkeepGreaterRealmProviderBridge({
      connection,
      authority,
      workerControls: Object.freeze({
        get: () => stateRef.current.greaterRealmWorkerControl,
        dispatch: ({ workerId, resourceKind, locationId, expectedRevision }) => (
          dispatchGreaterRealmWorker(
            workerId,
            resourceKind,
            locationId,
            expectedRevision
          )
        ),
        recall: recallWorker,
        recallAll: recallAllWorkers
      })
    });
  }, [
    bridgeAuthenticationContinuityKey,
    farcaster.oidcSession?.jwt,
    state.admission,
    state.identity?.fid,
    state.phase,
    dispatchGreaterRealmWorker,
    recallAllWorkers,
    recallWorker
  ]);

  const value = useMemo<WarpkeepBackendControllerValue>(() => ({
    state,
    greaterRealm,
    realmChat,
    workerPrivateSync: state.workerPrivateSync,
    sharedAlphaAvailable,
    entryAgreementSatisfied: acceptedEntryAgreementFid !== undefined
      && acceptedEntryAgreementFid === identity?.fid,
    checkAgain,
    beginAlphaTermsAcceptance,
    cancelAlphaTermsAcceptance,
    disconnect,
    collectResources,
    dispatchGoldExpedition,
    claimGoldExpedition,
    dispatchFoodExpedition,
    claimFoodExpedition,
    dispatchWoodExpedition,
    claimWoodExpedition,
    dispatchStoneExpedition,
    claimStoneExpedition,
    returnLegacyExpedition,
    dispatchWorker,
    dispatchGreaterRealmWorker,
    recallWorker,
    recallAllWorkers,
    retryWorkerPrivateSync,
    innerKeep: state.innerKeep,
    startInnerKeepProject,
    retryInnerKeepSync,
    sendRealmChatMessage,
    reportRealmChatMessage,
    loadEarlierRealmChat
  }), [
    acceptedEntryAgreementFid,
    beginAlphaTermsAcceptance,
    cancelAlphaTermsAcceptance,
    checkAgain,
    claimFoodExpedition,
    claimGoldExpedition,
    claimWoodExpedition,
    claimStoneExpedition,
    collectResources,
    disconnect,
    dispatchGoldExpedition,
    dispatchFoodExpedition,
    dispatchWoodExpedition,
    dispatchStoneExpedition,
    returnLegacyExpedition,
    dispatchWorker,
    dispatchGreaterRealmWorker,
    recallWorker,
    recallAllWorkers,
    retryWorkerPrivateSync,
    startInnerKeepProject,
    retryInnerKeepSync,
    realmChat,
    sendRealmChatMessage,
    reportRealmChatMessage,
    loadEarlierRealmChat,
    greaterRealm,
    identity,
    sharedAlphaAvailable,
    state
  ]);

  return (
    <WarpkeepBackendContext.Provider value={value}>
      {children}
    </WarpkeepBackendContext.Provider>
  );
}

export function useWarpkeepBackend() {
  const context = useContext(WarpkeepBackendContext);
  if (!context) {
    throw new Error('useWarpkeepBackend must be used within WarpkeepSpacetimeProvider.');
  }
  return context;
}
