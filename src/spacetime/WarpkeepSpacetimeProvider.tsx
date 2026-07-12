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
  type WarpkeepBackendState
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
  const generationRef = useRef(0);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    runtime.disconnect(connectionRef.current);
    connectionRef.current = undefined;
    setState(IDLE_WARPKEEP_BACKEND_STATE);
  }, [runtime]);

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
    const previous = connectionRef.current;
    connectionRef.current = undefined;
    runtime.disconnect(previous);

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
    const current = () => active && generationRef.current === generation;
    const fail = () => {
      if (current()) {
        setState(backendError(identity));
      }
    };

    const run = async () => {
      setState({ phase: 'connecting', identity });
      try {
        const activeConnection = await runtime.connect(config, farcaster.oidcSession!.jwt, {
          onDisconnected: () => {
            if (current()) fail();
          }
        });
        if (!current()) {
          runtime.disconnect(activeConnection);
          return;
        }
        connection = activeConnection;
        connectionRef.current = activeConnection;
        // Validate here as well as at the generated-binding boundary so an
        // injected/test runtime can never accidentally bypass compatibility.
        readCompatibleWarpkeepBackendInfo(await runtime.readBackendInfo(activeConnection));
        if (!current()) return;
        setState({ phase: 'checking-admission', identity });
        let admission = await runtime.readAdmission(activeConnection);
        if (!current()) return;

        if (admission === 'not_admitted' || admission === 'disabled') {
          setState({ phase: 'denied', identity, admission });
          return;
        }

        if (admission === 'admitted_needs_bootstrap') {
          setState({ phase: 'bootstrapping', identity, admission });
          await runtime.bootstrapPlayer(activeConnection);
          if (!current()) return;
          admission = await runtime.readAdmission(activeConnection);
          if (!current()) return;
        }

        if (admission !== 'ready') {
          setState({ phase: 'denied', identity, admission });
          return;
        }

        const updateRealm = () => {
          if (!current()) return;
          setState({
            phase: 'ready',
            identity,
            admission: 'ready',
            realm: runtime.readRealmSnapshot(activeConnection, bridgeFid!)
          });
        };
        cleanupObserver = runtime.observeRealm(activeConnection, bridgeFid!, updateRealm);
        subscription = runtime.subscribeRealm(activeConnection, updateRealm, fail);
      } catch {
        fail();
      }
    };

    void run();
    return () => {
      active = false;
      cleanupObserver?.();
      subscription?.unsubscribe();
      if (connection) {
        runtime.disconnect(connection);
      }
      if (connectionRef.current === connection) {
        connectionRef.current = undefined;
      }
    };
  }, [
    bridgeFid,
    checkSequence,
    config,
    farcaster.oidcSession,
    identity,
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
