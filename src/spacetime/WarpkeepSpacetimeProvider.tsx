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
  stateRef.current = state;

  const runActiveTeardown = useCallback(() => {
    const teardown = teardownRef.current;
    teardownRef.current = undefined;
    teardown?.();
  }, []);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
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
    disconnect
  }), [checkAgain, disconnect, sharedAlphaAvailable, state]);

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
