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
  collectWarpkeepResources,
  connectWarpkeep,
  dispatchWarpkeepGoldExpedition,
  dispatchWarpkeepFoodExpedition,
  dispatchWarpkeepWoodExpedition,
  disconnectWarpkeep,
  observeWarpkeepRealm,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
  readWarpkeepGoldExpeditionState,
  readWarpkeepFoodExpeditionState,
  readWarpkeepWoodExpeditionState,
  readWarpkeepResourceState,
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
import type { ReadyRealmResourcePresentation } from '../components/realm/realmResourcePresentation';
import type { ReadyGoldExpeditionPresentation } from '../components/realm/realmGoldExpeditionPresentation';
import type { ReadyFoodExpeditionPresentation } from '../components/realm/realmFoodExpeditionPresentation';
import type { ReadyWoodExpeditionPresentation } from '../components/realm/realmWoodExpeditionPresentation';

export const CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS = 15_000;
export const RESOURCE_OPERATION_TIMEOUT_MILLISECONDS = 15_000;
export const RESOURCE_REFRESH_INTERVAL_MILLISECONDS = 60_000;

function withResourceOperationDeadline<T>(operation: Promise<T>): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(
      () => reject(new Error('Warpkeep resource operation timed out.')),
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
  dispatchGoldExpedition: (siteId: string, idempotencyKey: string) => Promise<void>;
  /** Settle only the caller's Gold expedition and refresh both private views. */
  claimGoldExpedition: () => Promise<void>;
  /** Send a guarded Food dispatch; public occupancy remains subscription-owned. */
  dispatchFoodExpedition: (siteId: string, idempotencyKey: string) => Promise<void>;
  /** Settle only the caller's Food expedition and refresh both private views. */
  claimFoodExpedition: () => Promise<void>;
  /** Send a guarded Wood dispatch; public occupancy remains subscription-owned. */
  dispatchWoodExpedition: (siteId: string, idempotencyKey: string) => Promise<void>;
  /** Settle only the caller's Wood expedition and refresh both private views. */
  claimWoodExpedition: () => Promise<void>;
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
  readGoldExpeditionState: readWarpkeepGoldExpeditionState,
  dispatchGoldExpedition: dispatchWarpkeepGoldExpedition,
  collectGoldExpedition: collectWarpkeepGoldExpedition,
  readFoodExpeditionState: readWarpkeepFoodExpeditionState,
  dispatchFoodExpedition: dispatchWarpkeepFoodExpedition,
  collectFoodExpedition: collectWarpkeepFoodExpedition,
  readWoodExpeditionState: readWarpkeepWoodExpeditionState,
  dispatchWoodExpedition: dispatchWarpkeepWoodExpedition,
  collectWoodExpedition: collectWarpkeepWoodExpedition,
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
  const foodExpeditionStateRef = useRef<Readonly<{
    generation: number;
    value: ReadyFoodExpeditionPresentation | undefined;
  }> | undefined>(undefined);
  const foodExpeditionOperationGenerationRef = useRef<number | undefined>(undefined);
  const woodExpeditionStateRef = useRef<Readonly<{
    generation: number;
    value: ReadyWoodExpeditionPresentation | undefined;
  }> | undefined>(undefined);
  const woodExpeditionOperationGenerationRef = useRef<number | undefined>(undefined);
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
    foodExpeditionStateRef.current = undefined;
    foodExpeditionOperationGenerationRef.current = undefined;
    woodExpeditionStateRef.current = undefined;
    woodExpeditionOperationGenerationRef.current = undefined;
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

  const dispatchGoldExpedition = useCallback(async (
    siteId: string,
    idempotencyKey: string
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.goldExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.dispatchGoldExpedition === undefined
      || goldExpeditionOperationGenerationRef.current === generation
    ) {
      throw new Error('Gold expedition is unavailable.');
    }
    goldExpeditionOperationGenerationRef.current = generation;
    try {
      // This only refreshes the exact private procedure after the reducer has
      // committed. It intentionally does not edit public occupation state.
      const goldExpedition = await withResourceOperationDeadline(
        runtime.dispatchGoldExpedition(connection, siteId, idempotencyKey)
      );
      if (generationRef.current !== generation) return;
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
    } catch {
      // Reducer failures and timeouts are intentionally generic. Do not
      // expose server policy details or guess whether an ambiguous write won.
      if (generationRef.current === generation) {
        throw new Error('Gold expedition is unavailable.');
      }
    } finally {
      if (goldExpeditionOperationGenerationRef.current === generation) {
        goldExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const claimGoldExpedition = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
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
      if (generationRef.current !== generation) return;
      if (settled.resources.fid !== BigInt(fid)) {
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
      if (generationRef.current === generation) {
        throw new Error('Gold expedition is unavailable.');
      }
    } finally {
      if (goldExpeditionOperationGenerationRef.current === generation) {
        goldExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const dispatchFoodExpedition = useCallback(async (
    siteId: string,
    idempotencyKey: string
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.foodExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.dispatchFoodExpedition === undefined
      || foodExpeditionOperationGenerationRef.current === generation
    ) throw new Error('Food expedition is unavailable.');
    foodExpeditionOperationGenerationRef.current = generation;
    try {
      const foodExpedition = await withResourceOperationDeadline(
        runtime.dispatchFoodExpedition(connection, siteId, idempotencyKey)
      );
      if (generationRef.current !== generation) return;
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
    } catch {
      if (generationRef.current === generation) throw new Error('Food expedition is unavailable.');
    } finally {
      if (foodExpeditionOperationGenerationRef.current === generation) {
        foodExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const claimFoodExpedition = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
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
      if (generationRef.current !== generation) return;
      if (settled.resources.fid !== BigInt(fid)) throw new Error('Food expedition is unavailable.');
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
      if (generationRef.current === generation) throw new Error('Food expedition is unavailable.');
    } finally {
      if (foodExpeditionOperationGenerationRef.current === generation) {
        foodExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const dispatchWoodExpedition = useCallback(async (
    siteId: string,
    idempotencyKey: string
  ) => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
      || currentState.woodExpedition === undefined
      || connection === undefined
      || fid === undefined
      || runtime.dispatchWoodExpedition === undefined
      || woodExpeditionOperationGenerationRef.current === generation
    ) throw new Error('Wood expedition is unavailable.');
    woodExpeditionOperationGenerationRef.current = generation;
    try {
      const woodExpedition = await withResourceOperationDeadline(
        runtime.dispatchWoodExpedition(connection, siteId, idempotencyKey)
      );
      if (generationRef.current !== generation) return;
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
    } catch {
      if (generationRef.current === generation) throw new Error('Wood expedition is unavailable.');
    } finally {
      if (woodExpeditionOperationGenerationRef.current === generation) {
        woodExpeditionOperationGenerationRef.current = undefined;
      }
    }
  }, [runtime]);

  const claimWoodExpedition = useCallback(async () => {
    const generation = generationRef.current;
    const currentState = stateRef.current;
    const connection = connectionRef.current;
    const fid = currentState.identity?.fid;
    if (
      currentState.phase !== 'ready'
      || currentState.admission !== 'ready'
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
      if (generationRef.current !== generation) return;
      if (settled.resources.fid !== BigInt(fid)) throw new Error('Wood expedition is unavailable.');
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
      if (generationRef.current === generation) throw new Error('Wood expedition is unavailable.');
    } finally {
      if (woodExpeditionOperationGenerationRef.current === generation) {
        woodExpeditionOperationGenerationRef.current = undefined;
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
    foodExpeditionStateRef.current = undefined;
    foodExpeditionOperationGenerationRef.current = undefined;
    woodExpeditionStateRef.current = undefined;
    woodExpeditionOperationGenerationRef.current = undefined;
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
      if (foodExpeditionStateRef.current?.generation === generation) {
        foodExpeditionStateRef.current = undefined;
      }
      if (foodExpeditionOperationGenerationRef.current === generation) {
        foodExpeditionOperationGenerationRef.current = undefined;
      }
      if (woodExpeditionStateRef.current?.generation === generation) {
        woodExpeditionStateRef.current = undefined;
      }
      if (woodExpeditionOperationGenerationRef.current === generation) {
        woodExpeditionOperationGenerationRef.current = undefined;
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
        await runtime.acceptAlphaTerms(activeConnection);
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
      }).catch(fail);
    }
    processTermsAttemptRef.current = processTermsAttempt;

    const run = async () => {
      setState(reconnectingState ?? { phase: 'connecting', identity });
      try {
        const activeConnection = await runtime.connect(config, farcaster.oidcSession!.jwt, {
          onDisconnected: () => {
            if (current()) fail();
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
        const backendInfo = readCompatibleWarpkeepBackendInfo(
          await runtime.readBackendInfo(activeConnection)
        );
        backendProtocolVersion = backendInfo.protocolVersion;
        if (!current()) return;
        if (!reconnectingState) {
          setState({ phase: 'checking-admission', identity });
        }
        let admission = await runtime.readAdmission(activeConnection);
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
          await runtime.bootstrapPlayer(activeConnection);
          if (!current()) return;
          admission = await runtime.readAdmission(activeConnection);
          if (!current()) return;
        }

        if (admission !== 'ready') {
          terminateConnection();
          setState({ phase: 'denied', identity, admission });
          return;
        }

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
            setState({
              phase: 'ready',
              identity,
              admission: 'ready',
              realm,
              resources,
              ...(goldExpedition === undefined ? {} : { goldExpedition }),
              ...(foodExpedition === undefined ? {} : { foodExpedition }),
              ...(woodExpedition === undefined ? {} : { woodExpedition })
            });
          } catch {
            fail();
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
          readinessTimeout = setTimeout(
            fail,
            CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS
          );
          const activation = (async () => {
            const initialResources = await runtime.readResourceState(activeConnection, bridgeFid!);
            let initialGoldExpedition: ReadyGoldExpeditionPresentation | undefined;
            if (runtime.readGoldExpeditionState !== undefined) {
              try {
                initialGoldExpedition = await withResourceOperationDeadline(
                  runtime.readGoldExpeditionState(activeConnection)
                );
              } catch {
                // Gold is an additive caller-only capability. A malformed or
                // temporarily unavailable private projection removes its
                // controls without revoking the validated public Realm.
                initialGoldExpedition = undefined;
              }
            }
            let initialFoodExpedition: ReadyFoodExpeditionPresentation | undefined;
            if (runtime.readFoodExpeditionState !== undefined) {
              try {
                initialFoodExpedition = await withResourceOperationDeadline(
                  runtime.readFoodExpeditionState(activeConnection)
                );
              } catch {
                // Food is an independent additive capability. Its private
                // procedure cannot revoke the core Realm or Gold controls.
                initialFoodExpedition = undefined;
              }
            }
            let initialWoodExpedition: ReadyWoodExpeditionPresentation | undefined;
            if (runtime.readWoodExpeditionState !== undefined) {
              try {
                initialWoodExpedition = await withResourceOperationDeadline(
                  runtime.readWoodExpeditionState(activeConnection)
                );
              } catch {
                // Wood is independently additive. A failed private procedure
                // removes only Wood controls without revoking Food/Gold/core.
                initialWoodExpedition = undefined;
              }
            }
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
            realmActivated = true;
            cleanupObserver = runtime.observeRealm(
              activeConnection,
              bridgeFid!,
              updateObservedRealm,
              fail
            );
            const refreshResources = async () => {
              if (!current() || !realmActivated || resourceRefreshInFlight) return;
              resourceRefreshInFlight = true;
              try {
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
                const [refreshed, refreshedGoldExpedition, refreshedFoodExpedition, refreshedWoodExpedition] = await Promise.all([
                  withResourceOperationDeadline(
                    runtime.readResourceState(activeConnection, bridgeFid!)
                  ),
                  goldRefresh,
                  foodRefresh,
                  woodRefresh
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
                    woodExpedition: refreshedWoodExpedition
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
            const startedSubscription = runtime.subscribeRealm(
              activeConnection,
              applySubscribedRealm,
              fail
            );
            if (!current()) {
              // A test runtime or SDK failure callback may fire synchronously from
              // subscribe(). The returned handle was not available to fail(), so
              // close it here instead of retaining a terminal subscription.
              startedSubscription.unsubscribe();
              return;
            }
            subscription = startedSubscription;
          })();
          realmActivationPromise = activation;
          void activation.catch(fail).finally(() => {
            if (realmActivationPromise === activation) realmActivationPromise = undefined;
          });
        };

        const acceptedNow = await acknowledgePendingTerms(activeConnection);
        if (!current()) return;
        if (!acceptedNow && completedTermsAttemptRef.current === 0) {
          setState({ phase: 'awaiting-terms', identity, admission: 'ready' });
          return;
        }
        activateRealm();
      } catch {
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
    claimWoodExpedition
  }), [
    beginAlphaTermsAcceptance,
    cancelAlphaTermsAcceptance,
    checkAgain,
    claimFoodExpedition,
    claimGoldExpedition,
    claimWoodExpedition,
    collectResources,
    disconnect,
    dispatchGoldExpedition,
    dispatchFoodExpedition,
    dispatchWoodExpedition,
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
