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
  connectWarpkeep,
  disconnectWarpkeep,
  observeWarpkeepRealm,
  readWarpkeepBackendInfo,
  readWarpkeepAdmissionStatus,
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
  hasUsableWarpkeepBridge,
  readWarpkeepRuntimeConfig,
  type WarpkeepRuntimeConfig
} from './warpkeepConfig';
import { readCompatibleWarpkeepBackendInfo } from './warpkeepProtocol';

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
  const termsAttemptRef = useRef(0);
  const completedTermsAttemptRef = useRef(0);
  const termsIntentGenerationRef = useRef(0);
  const termsIdentityFidRef = useRef<number | undefined>(undefined);
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
    const previousState = stateRef.current;
    const retainedReadyState = (
      previousState.phase === 'ready'
      || previousState.phase === 'reconnecting'
    )
      && previousState.identity?.fid === identity?.fid
      && previousState.admission === 'ready'
      && previousState.realm
      ? previousState
      : undefined;
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
      setState(IDLE_WARPKEEP_BACKEND_STATE);
      return undefined;
    }

    if (
      farcaster.oidcSession.expiresAt <= Date.now()
      || farcaster.oidcSession.issuer !== config.issuer
      || farcaster.oidcSession.audience !== config.audience
    ) {
      setState(backendError(identity));
      return undefined;
    }

    let active = true;
    let connection: WarpkeepConnection | undefined;
    let cleanupObserver: (() => void) | undefined;
    let subscription: ReturnType<WarpkeepBackendRuntime['subscribeRealm']> | undefined;
    let publishReadySnapshot: (() => void) | undefined;
    let activateRealm: (() => void) | undefined;
    let realmActivated = false;
    let termsAcceptancePromise: Promise<boolean> | undefined;
    let terminated = false;
    const current = () => active && generationRef.current === generation;
    const terminateConnection = () => {
      if (terminated) {
        return;
      }
      terminated = true;
      // Invalidate callbacks before disconnecting: an injected runtime or the
      // SDK may synchronously report onDisconnected from disconnect().
      active = false;
      if (teardownRef.current === terminateConnection) {
        teardownRef.current = undefined;
      }
      if (processTermsAttemptRef.current === processTermsAttempt) {
        processTermsAttemptRef.current = () => undefined;
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
        readCompatibleWarpkeepBackendInfo(await runtime.readBackendInfo(activeConnection));
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

        const updateRealm = (observedSnapshot?: WarpkeepRealmSnapshot) => {
          if (!current()) return;
          setState({
            phase: 'ready',
            identity,
            admission: 'ready',
            realm: observedSnapshot
              ?? runtime.readRealmSnapshot(activeConnection, bridgeFid!)
          });
        };
        publishReadySnapshot = () => updateRealm();
        activateRealm = () => {
          if (!current()) return;
          if (realmActivated) {
            publishReadySnapshot?.();
            return;
          }
          realmActivated = true;
          cleanupObserver = runtime.observeRealm(activeConnection, bridgeFid!, updateRealm);
          const startedSubscription = runtime.subscribeRealm(activeConnection, updateRealm, fail);
          if (!current()) {
            // A test runtime or SDK failure callback may fire synchronously from
            // subscribe(). The returned handle was not available to fail(), so
            // close it here instead of retaining a terminal subscription.
            startedSubscription.unsubscribe();
            return;
          }
          subscription = startedSubscription;
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
    disconnect
  }), [
    beginAlphaTermsAcceptance,
    cancelAlphaTermsAcceptance,
    checkAgain,
    disconnect,
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
