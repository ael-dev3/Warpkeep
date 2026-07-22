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

import { useFarcasterAuth } from '../farcaster/FarcasterAuthProvider';
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
  observeWarpkeepRealm,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
  readWarpkeepGoldExpeditionState,
  readWarpkeepFoodExpeditionState,
  readWarpkeepWoodExpeditionState,
  readWarpkeepStoneExpeditionState,
  readWarpkeepResourceState,
  readWarpkeepResourceStateV2,
  readWarpkeepWorkerRoster,
  dispatchWarpkeepWorker,
  recallWarpkeepWorker,
  recallAllWarpkeepWorkers,
  readWarpkeepRealmSnapshot,
  subscribeToWarpkeepRealm,
  type WarpkeepConnection
} from './warpkeepConnection';
import {
  IDLE_WARPKEEP_BACKEND_STATE,
  type WarpkeepBackendState,
  type WarpkeepRealmSnapshot
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
  ReadyWorkerProjection,
  ReadyWorkerResourceState,
  WorkerRosterPresentation
} from '../components/realm/realmWorkerPresentation';
import { resolveReadyWorkerProjection } from '../components/realm/realmWorkerPresentation';
import { createExpeditionIdempotencyKey } from './expeditionIdempotencyKey';
import {
  serializeWorkerCommandFingerprint,
  workerCommandAttemptFor,
  workerCommandAttemptMatchesLifecycle,
  type WorkerCommandAttempt,
  type WorkerCommandFingerprint,
  type WorkerCommandLifecycleState
} from './workerCommandIdempotency';

/**
 * The generation-three Realm replicates 20,000 immutable world rows before
 * SubscribeApplied. This deadline is intentionally independent from the
 * smaller private resource procedure deadline below.
 */
export const CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS = 60_000;
export const BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS = 30_000;
export const RESOURCE_OPERATION_TIMEOUT_MILLISECONDS = 15_000;
export const RESOURCE_REFRESH_INTERVAL_MILLISECONDS = 60_000;
const MAX_RETAINED_WORKER_COMMAND_ATTEMPTS = 64;

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

type WarpkeepRealmActivationFailureReason =
  | 'resource_projection_failed'
  | 'resource_projection_deadline'
  | 'observer_setup_failed'
  | 'subscription_setup_failed'
  | 'subscription_failed'
  | 'canonical_readiness_timeout'
  | 'canonical_snapshot_invalid';

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
  /** True only when the explicit kill switch and all public bridge values are valid. */
  sharedAlphaAvailable: boolean;
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
  workerProjection?: ReadyWorkerProjection;
  workerRoster?: WorkerRosterPresentation;
  workerResourceState?: ReadyWorkerResourceState;
  dispatchWorker: (
    workerId: string,
    resourceKind: RealmEconomicResourceKey,
    siteId: string
  ) => Promise<void>;
  recallWorker: (workerId: string) => Promise<void>;
  recallAllWorkers: () => Promise<void>;
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
  acceptAlphaTerms: typeof acceptWarpkeepAlphaTerms;
  readResourceState: typeof readWarpkeepResourceState;
  collectResources: typeof collectWarpkeepResources;
  readWorkerRoster?: typeof readWarpkeepWorkerRoster;
  readResourceStateV2?: typeof readWarpkeepResourceStateV2;
  dispatchWorker?: typeof dispatchWarpkeepWorker;
  recallWorker?: typeof recallWarpkeepWorker;
  recallAllWorkers?: typeof recallAllWarpkeepWorkers;
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
  observeRealm: typeof observeWarpkeepRealm;
  readRealmSnapshot: typeof readWarpkeepRealmSnapshot;
  subscribeRealm: typeof subscribeToWarpkeepRealm;
}>;

const DEFAULT_WARPKEEP_BACKEND_RUNTIME: WarpkeepBackendRuntime = Object.freeze({
  connect: connectWarpkeep,
  disconnect: disconnectWarpkeep,
  readBackendInfo: readWarpkeepBackendInfo,
  readAdmission: readWarpkeepAdmissionStatus,
  bootstrapPlayer: bootstrapWarpkeepPlayer,
  acceptAlphaTerms: acceptWarpkeepAlphaTerms,
  readResourceState: readWarpkeepResourceState,
  collectResources: collectWarpkeepResources,
  readWorkerRoster: readWarpkeepWorkerRoster,
  readResourceStateV2: readWarpkeepResourceStateV2,
  dispatchWorker: dispatchWarpkeepWorker,
  recallWorker: recallWarpkeepWorker,
  recallAllWorkers: recallAllWarpkeepWorkers,
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
  observeRealm: observeWarpkeepRealm,
  readRealmSnapshot: readWarpkeepRealmSnapshot,
  subscribeRealm: subscribeToWarpkeepRealm
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

function activeWorkerProjection(
  snapshot: WarpkeepRealmSnapshot,
  roster: WorkerRosterPresentation | undefined,
  resourceState: ReadyWorkerResourceState | undefined
): ReadyWorkerProjection | undefined {
  return resolveReadyWorkerProjection({
    realmId: snapshot.realm.realmId,
    castleIds: snapshot.castles.map((castle) => castle.castleId),
    ownCastleId: snapshot.ownCastle.castleId,
    system: snapshot.workerSystem,
    workers: snapshot.workerWorkers,
    occupations: snapshot.workerOccupations,
    roster,
    resourceState
  });
}

function workerCommandLifecycleState(
  roster: WorkerRosterPresentation
): WorkerCommandLifecycleState {
  return Object.freeze({
    castleId: roster.castleId,
    workers: roster.workers
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
  const identity = presentationIdentity(farcaster.state, bridgeFid);
  const sharedAlphaAvailable = hasUsableWarpkeepBridge(config);
  const [state, setState] = useState<WarpkeepBackendState>(IDLE_WARPKEEP_BACKEND_STATE);
  const [checkSequence, setCheckSequence] = useState(0);
  const connectionRef = useRef<WarpkeepConnection | undefined>(undefined);
  const teardownRef = useRef<(() => void) | undefined>(undefined);
  const generationRef = useRef(0);
  const stateRef = useRef(state);
  const canonicalRealmSourceRef = useRef<string | undefined>(undefined);
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
  const workerRosterStateRef = useRef<Readonly<{ generation: number; value: WorkerRosterPresentation | undefined }> | undefined>(undefined);
  const workerResourceStateRef = useRef<Readonly<{ generation: number; value: ReadyWorkerResourceState | undefined }> | undefined>(undefined);
  const workerCommandGenerationRef = useRef<number | undefined>(undefined);
  const workerCommandAttemptsRef = useRef(new Map<string, WorkerCommandAttempt>());
  const processTermsAttemptRef = useRef<() => void>(() => undefined);
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
    workerRosterStateRef.current = undefined;
    workerResourceStateRef.current = undefined;
    workerCommandGenerationRef.current = undefined;
    workerCommandAttemptsRef.current.clear();
    canonicalRealmSourceRef.current = undefined;
    processTermsAttemptRef.current = () => undefined;
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
  }, [runActiveTeardown, runtime]);

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
          || latest.realm === undefined
          || latest.resources === undefined
          || latest.resources.fid !== resources.fid
          || !resourceProjectionIsAtLeastAsNew(resources, latestRetained)
          || !resourceProjectionIsAtLeastAsNew(resources, latest.resources)
        ) return latest;
        return { ...latest, resources };
      });
    } catch {
      if (generationRef.current === generation) {
        canonicalRealmSourceRef.current = undefined;
        runActiveTeardown();
        setState(backendError(currentState.identity));
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
    if (
      currentState.phase !== 'ready' || currentState.admission !== 'ready'
      || currentState.workerProjection?.mode !== 'active' || connection === undefined || fid === undefined
      || currentState.workerRoster === undefined || currentState.workerResourceState === undefined
      || runtime.readWorkerRoster === undefined || runtime.readResourceStateV2 === undefined
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
      const [roster, resourceState] = await Promise.all([
        withResourceOperationDeadline(runtime.readWorkerRoster(connection, fid)),
        withResourceOperationDeadline(runtime.readResourceStateV2(connection, fid))
      ]);
      if (generationRef.current !== generation || roster === undefined || resourceState === undefined) {
        throw new Error('Worker command is unavailable.');
      }
      const retainedRoster = workerRosterStateRef.current?.generation === generation
        ? workerRosterStateRef.current.value
        : undefined;
      const retainedResourceState = workerResourceStateRef.current?.generation === generation
        ? workerResourceStateRef.current.value
        : undefined;
      if (!workerProjectionPairIsAtLeastAsNew(
        roster,
        resourceState,
        retainedRoster,
        retainedResourceState
      )) throw new Error('Worker command is unavailable.');
      const refreshedLifecycle = workerCommandLifecycleState(roster);
      for (const [retainedFingerprint, retainedAttempt] of workerCommandAttemptsRef.current) {
        if (!workerCommandAttemptMatchesLifecycle(retainedAttempt, generation, refreshedLifecycle)) {
          workerCommandAttemptsRef.current.delete(retainedFingerprint);
        }
      }
      workerRosterStateRef.current = Object.freeze({ generation, value: roster });
      workerResourceStateRef.current = Object.freeze({ generation, value: resourceState });
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
        return {
          ...latest,
          workerRoster: roster,
          workerResourceState: resourceState,
          ...(workerProjection === undefined
            ? { workerProjection: undefined }
            : { workerProjection })
        };
      });
      if (workerCommandAttemptsRef.current.get(serializedFingerprint) === attempt) {
        workerCommandAttemptsRef.current.delete(serializedFingerprint);
      }
    } catch {
      throw new Error('Worker command is unavailable.');
    } finally {
      if (workerCommandGenerationRef.current === generation) workerCommandGenerationRef.current = undefined;
    }
  }, [runtime]);

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

  const recallWorker = useCallback((workerId: string) => {
    const worker = stateRef.current.workerProjection?.ownedWorkers.find(
      (candidate) => candidate.workerId === workerId
    );
    if (worker?.status !== 'outbound' && worker?.status !== 'gathering') {
      return Promise.reject(new Error('Worker command is unavailable.'));
    }
    return runWorkerCommand({ kind: 'recall', workerId }, (connection, idempotencyKey) => {
      if (runtime.recallWorker === undefined) return Promise.reject(new Error('Worker command is unavailable.'));
      return runtime.recallWorker(connection, workerId, idempotencyKey);
    });
  }, [runWorkerCommand, runtime]);

  const recallAllWorkers = useCallback(() => {
    const castleId = stateRef.current.realm?.ownCastle.castleId;
    const recallable = stateRef.current.workerProjection?.ownedWorkers.some((worker) => (
      worker.status === 'outbound' || worker.status === 'gathering'
    ));
    if (castleId === undefined || !recallable) {
      return Promise.reject(new Error('Worker command is unavailable.'));
    }
    return runWorkerCommand({ kind: 'recall-all', castleId }, (connection, idempotencyKey) => {
      if (runtime.recallAllWorkers === undefined) return Promise.reject(new Error('Worker command is unavailable.'));
      return runtime.recallAllWorkers(connection, idempotencyKey);
    });
  }, [runWorkerCommand, runtime]);

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

  const beginAlphaTermsAcceptance = useCallback(() => {
    termsAttemptRef.current += 1;
    processTermsAttemptRef.current();
  }, []);

  const cancelAlphaTermsAcceptance = useCallback(() => {
    // Cancellation never revokes a reducer call already sent after explicit
    // acceptance, but it prevents an unconsumed pre-auth attempt from leaking
    // into a later remembered/direct-route session.
    termsAttemptRef.current = completedTermsAttemptRef.current;
    termsIntentGenerationRef.current += 1;
    setState((current) => current.phase === 'accepting-terms'
      ? {
          phase: 'awaiting-terms',
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
    workerRosterStateRef.current = undefined;
    workerResourceStateRef.current = undefined;
    workerCommandGenerationRef.current = undefined;
    workerCommandAttemptsRef.current.clear();
    const previousState = stateRef.current;
    const canonicalRealmSource = [
      config.spacetimeUri,
      config.spacetimeDatabase,
      config.issuer,
      config.audience
    ].join('\n');
    const retainedReadyState = (
      previousState.phase === 'ready'
      || previousState.phase === 'reconnecting'
    )
      && previousState.identity?.fid === identity?.fid
      && previousState.admission === 'ready'
      && previousState.realm
      && isCanonicalGenesisSnapshot(previousState.realm, identity?.fid)
      && canonicalRealmSourceRef.current === canonicalRealmSource
      ? previousState
      : undefined;
    if (!retainedReadyState) canonicalRealmSourceRef.current = undefined;
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

    if (!sharedAlphaAvailable || !identity || !farcaster.oidcSession) {
      canonicalRealmSourceRef.current = undefined;
      setState(IDLE_WARPKEEP_BACKEND_STATE);
      return undefined;
    }

    if (
      farcaster.oidcSession.expiresAt <= Date.now()
      || farcaster.oidcSession.issuer !== config.issuer
      || farcaster.oidcSession.audience !== config.audience
    ) {
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
    let workerRefreshInFlight = false;
    let queuedWorkerCapabilityRealm: WarpkeepRealmSnapshot | undefined;
    let realmActivated = false;
    let subscriptionApplied = false;
    let backendProtocolVersion: number | undefined;
    let readinessTimeout: ReturnType<typeof setTimeout> | undefined;
    let resourceRefreshInterval: ReturnType<typeof setInterval> | undefined;
    let termsAcceptancePromise: Promise<boolean> | undefined;
    let terminated = false;
    const current = () => active && generationRef.current === generation;
    const terminateConnection = () => {
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
      if (workerRosterStateRef.current?.generation === generation) {
        workerRosterStateRef.current = undefined;
      }
      if (workerResourceStateRef.current?.generation === generation) {
        workerResourceStateRef.current = undefined;
      }
      if (workerCommandGenerationRef.current === generation) {
        workerCommandGenerationRef.current = undefined;
      }
      for (const [fingerprint, attempt] of workerCommandAttemptsRef.current) {
        if (attempt.generation === generation) {
          workerCommandAttemptsRef.current.delete(fingerprint);
        }
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
    const fail = () => {
      if (current()) {
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
      if (!current()) return;
      reportFailure(`warpkeep_backend_activation_failed:${reason}`);
      fail();
    };

    const reconnectingState: WarpkeepBackendState | undefined = retainedReadyState
      ? {
          phase: 'reconnecting',
          identity,
          admission: 'ready',
          realm: retainedReadyState.realm
        }
      : undefined;

    const acknowledgePendingTerms = async (activeConnection: WarpkeepConnection) => {
      if (termsAcceptancePromise) return termsAcceptancePromise;
      const attempt = termsAttemptRef.current;
      if (attempt <= completedTermsAttemptRef.current) return false;

      const currentState = stateRef.current;
      setState({
        phase: 'accepting-terms',
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
      setState(reconnectingState ?? { phase: 'connecting', identity });
      try {
        const activeConnection = await runtime.connect(config, farcaster.oidcSession!.jwt, {
          onDisconnected: () => {
            if (current()) fail();
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
          setState({ phase: 'checking-admission', identity });
        }
        stage = 'admission';
        let admission = await withBackendStageOperationDeadline(
          runtime.readAdmission(activeConnection)
        );
        if (!current()) return;

        if (admission === 'not_admitted' || admission === 'disabled') {
          terminateConnection();
          setState({ phase: 'denied', identity, admission });
          return;
        }

        if (admission === 'admitted_needs_bootstrap') {
          if (!reconnectingState) {
            setState({ phase: 'bootstrapping', identity, admission });
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
          setState({ phase: 'denied', identity, admission });
          return;
        }

        const refreshWorkerProjection = async (capabilityRealm: WarpkeepRealmSnapshot) => {
          if (
            !current()
            || capabilityRealm.workerSystem === undefined
            || capabilityRealm.workerWorkers === undefined
            || capabilityRealm.workerOccupations === undefined
            || runtime.readWorkerRoster === undefined
            || runtime.readResourceStateV2 === undefined
          ) return;
          if (workerRefreshInFlight) {
            // Coalesce to the newest validated public projection. Dropping a
            // later lifecycle while an older private pair is pending could
            // otherwise hide Workers until the next periodic refresh.
            queuedWorkerCapabilityRealm = capabilityRealm;
            return;
          }
          workerRefreshInFlight = true;
          try {
            const [roster, resourceState] = await Promise.all([
              withResourceOperationDeadline(
                runtime.readWorkerRoster(activeConnection, bridgeFid!)
              ),
              withResourceOperationDeadline(
                runtime.readResourceStateV2(activeConnection, bridgeFid!)
              )
            ]);
            if (!current()) return;
            if (roster === undefined || resourceState === undefined) return;
            const retainedRoster = workerRosterStateRef.current?.generation === generation
              ? workerRosterStateRef.current.value
              : undefined;
            const retainedResourceState = workerResourceStateRef.current?.generation === generation
              ? workerResourceStateRef.current.value
              : undefined;
            if (!workerProjectionPairIsAtLeastAsNew(
              roster,
              resourceState,
              retainedRoster,
              retainedResourceState
            )) return;
            const projection = activeWorkerProjection(capabilityRealm, roster, resourceState);
            if (projection === undefined) return;
            workerRosterStateRef.current = Object.freeze({ generation, value: roster });
            workerResourceStateRef.current = Object.freeze({ generation, value: resourceState });
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
                || latest.realm === undefined
                || !workerProjectionPairIsAtLeastAsNew(
                  roster,
                  resourceState,
                  latest.workerRoster,
                  latest.workerResourceState
                )
              ) return latest;
              const latestProjection = activeWorkerProjection(latest.realm, roster, resourceState);
              if (latestProjection === undefined) return latest;
              return {
                ...latest,
                workerRoster: roster,
                workerResourceState: resourceState,
                workerProjection: latestProjection
              };
            });
          } catch {
            // v12 is additive. An absent, rejected, or slow worker procedure
            // must never delay or revoke the already-authoritative v11 Realm.
          } finally {
            workerRefreshInFlight = false;
            const queuedRealm = queuedWorkerCapabilityRealm;
            queuedWorkerCapabilityRealm = undefined;
            if (queuedRealm !== undefined && current()) {
              void refreshWorkerProjection(queuedRealm);
            }
          }
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
          const workerRoster = workerRosterStateRef.current?.generation === generation
            ? workerRosterStateRef.current.value
            : undefined;
          const workerResourceState = workerResourceStateRef.current?.generation === generation
            ? workerResourceStateRef.current.value
            : undefined;
          if (
            !current()
            || !subscriptionApplied
            || backendProtocolVersion === undefined
            || resources === undefined
          ) return;
          try {
            const realm = validateCanonicalGenesisSnapshot(
              observedSnapshot ?? runtime.readRealmSnapshot(activeConnection, bridgeFid!),
              { ownFid: bridgeFid!, protocolVersion: backendProtocolVersion }
            );
            if (readinessTimeout !== undefined) {
              clearTimeout(readinessTimeout);
              readinessTimeout = undefined;
            }
            canonicalRealmSourceRef.current = canonicalRealmSource;
            const workerProjection = activeWorkerProjection(
              realm,
              workerRoster,
              workerResourceState
            );
            setState({
              phase: 'ready',
              identity,
              admission: 'ready',
              realm,
              resources,
              ...(goldExpedition === undefined ? {} : { goldExpedition }),
              ...(foodExpedition === undefined ? {} : { foodExpedition }),
              ...(woodExpedition === undefined ? {} : { woodExpedition }),
              ...(stoneExpedition === undefined ? {} : { stoneExpedition }),
              ...(workerRoster === undefined ? {} : { workerRoster }),
              ...(workerResourceState === undefined ? {} : { workerResourceState }),
              ...(workerProjection === undefined ? {} : { workerProjection })
            });
            void refreshWorkerProjection(realm);
          } catch {
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
            setState({ phase: 'opening-realm', identity, admission: 'ready' });
          }
          readinessTimeout = setTimeout(() => {
            failRealmActivation('canonical_readiness_timeout');
          }, CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS);
          const activation = (async () => {
            // Begin every private read and the large public subscription
            // concurrently. The core resource projection and public snapshot
            // remain mandatory; additive expedition projections fail closed
            // to unavailable controls without delaying Realm entry in series.
            let initialResourceRead: ReturnType<WarpkeepBackendRuntime['readResourceState']>;
            try {
              initialResourceRead = runtime.readResourceState(activeConnection, bridgeFid!);
            } catch {
              failRealmActivation('resource_projection_failed');
              return;
            }
            const initialResourcePromise = withResourceOperationDeadline(
              initialResourceRead
            ).catch((error: unknown) => {
              failRealmActivation(error instanceof ResourceOperationDeadlineError
                ? 'resource_projection_deadline'
                : 'resource_projection_failed');
              throw error;
            });
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
            // A synchronous observer/subscription exception can terminate this
            // generation before the await below. Pre-handle the same promise so
            // its eventual rejection cannot escape as an unhandled rejection;
            // awaiting it still preserves the normal fail-closed path.
            void initialResourcePromise.catch(() => undefined);
            let startedObserver: () => void;
            try {
              startedObserver = runtime.observeRealm(
                activeConnection,
                bridgeFid!,
                updateObservedRealm,
                () => failRealmActivation('canonical_snapshot_invalid')
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
                () => failRealmActivation('subscription_failed')
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
              initialResources,
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
            resourceStateRef.current = Object.freeze({
              generation,
              value: initialResources
            });
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
            realmActivated = true;
            const refreshResources = async () => {
              if (!current() || !realmActivated || resourceRefreshInFlight) return;
              resourceRefreshInFlight = true;
              try {
                const readyRealm = stateRef.current.phase === 'ready'
                  ? stateRef.current.realm
                  : undefined;
                if (readyRealm !== undefined) void refreshWorkerProjection(readyRealm);
                const goldRefresh = runtime.readGoldExpeditionState === undefined
                  ? Promise.resolve<ReadyGoldExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readGoldExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const foodRefresh = runtime.readFoodExpeditionState === undefined
                  ? Promise.resolve<ReadyFoodExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readFoodExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const woodRefresh = runtime.readWoodExpeditionState === undefined
                  ? Promise.resolve<ReadyWoodExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readWoodExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const stoneRefresh = runtime.readStoneExpeditionState === undefined
                  ? Promise.resolve<ReadyStoneExpeditionPresentation | undefined>(undefined)
                  : withResourceOperationDeadline(
                    runtime.readStoneExpeditionState(activeConnection)
                  ).catch(() => undefined);
                const [refreshed, refreshedGoldExpedition, refreshedFoodExpedition, refreshedWoodExpedition, refreshedStoneExpedition] = await Promise.all([
                  withResourceOperationDeadline(
                    runtime.readResourceState(activeConnection, bridgeFid!)
                  ),
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
                setState((latest) => {
                  const latestRetained = resourceStateRef.current?.generation === generation
                    ? resourceStateRef.current.value
                    : undefined;
                  if (
                    !current()
                    || refreshed.fid !== BigInt(bridgeFid!)
                    || latest.phase !== 'ready'
                    || latest.identity?.fid !== bridgeFid
                    || latest.realm === undefined
                    || latest.resources === undefined
                    || latest.resources.fid !== refreshed.fid
                    || !resourceProjectionIsAtLeastAsNew(refreshed, latestRetained)
                    || !resourceProjectionIsAtLeastAsNew(refreshed, latest.resources)
                  ) return latest;
                  return {
                    ...latest,
                    resources: refreshed,
                    goldExpedition: refreshedGoldExpedition,
                    foodExpedition: refreshedFoodExpedition,
                    woodExpedition: refreshedWoodExpedition,
                    stoneExpedition: refreshedStoneExpedition
                  };
                });
              } catch {
                fail();
              } finally {
                resourceRefreshInFlight = false;
              }
            };
            resourceRefreshInterval = setInterval(() => {
              void refreshResources();
            }, RESOURCE_REFRESH_INTERVAL_MILLISECONDS);
            // SubscribeApplied may have arrived while resources were pending.
            publishReadySnapshot?.();
          })();
          realmActivationPromise = activation;
          void activation.catch(fail).finally(() => {
            if (realmActivationPromise === activation) realmActivationPromise = undefined;
          });
        };

        stage = 'terms_acknowledgement';
        const acceptedNow = await acknowledgePendingTerms(activeConnection);
        if (!current()) return;
        if (!acceptedNow && completedTermsAttemptRef.current === 0) {
          setState({ phase: 'awaiting-terms', identity, admission: 'ready' });
          return;
        }
        activateRealm();
      } catch {
        reportFailure(`warpkeep_backend_stage_failed:${stage}`);
        fail();
      }
    };

    void run();
    return terminateConnection;
  }, [
    bridgeFid,
    checkSequence,
    config,
    farcaster.oidcSession,
    identity,
    runActiveTeardown,
    runtime,
    sharedAlphaAvailable
  ]);

  const value = useMemo<WarpkeepBackendControllerValue>(() => ({
    state,
    sharedAlphaAvailable,
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
    dispatchWorker,
    recallWorker,
    recallAllWorkers
  }), [
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
    dispatchWorker,
    recallWorker,
    recallAllWorkers,
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
