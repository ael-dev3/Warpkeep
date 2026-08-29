import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useMiniAppHost } from '../farcaster/miniapp';
import type { GreaterRealmProviderBridge } from '../spacetime/greaterRealmProviderBridge';
import {
  createPtrRealmAuthClient,
  isCurrentPtrRealmAuthority,
  ptrRealmAuthFailureCode,
  retirePtrRealmAuthority,
  type PtrRealmAuthClient,
  type PtrRealmAuthority,
} from './ptrRealmAuthClient';
import {
  closePtrRealmConnectionSession,
  connectPtrRealm,
  isCurrentPtrRealmConnectionSession,
  type ConnectPtrRealmOptions,
  type PtrRealmConnectionSession,
} from './ptrRealmConnection';
import {
  readPtrRealmConfig,
  type AvailablePtrRealmConfig,
  type PtrRealmConfig,
} from './ptrRealmConfig';
import {
  createPtrGreaterRealmProviderBridge,
  preflightPtrRealmView,
  type PtrRealmViewAnchor,
} from './ptrGreaterRealmBridge';

export type PtrRealmPhase =
  | 'unavailable'
  | 'unknown'
  | 'checking'
  | 'not-admitted'
  | 'admitted'
  | 'connecting'
  | 'ready'
  | 'error';

export type PtrRealmStatusCode =
  | 'ptr-unavailable'
  | 'ptr-access-unverified'
  | 'ptr-access-checking'
  | 'ptr-access-denied'
  | 'ptr-access-verified'
  | 'ptr-connecting'
  | 'ptr-ready'
  | 'ptr-access-unavailable'
  | 'ptr-transport-unavailable';

export type PtrRealmProviderFailure =
  | 'host-unverified'
  | 'access-unavailable'
  | 'transport-unavailable';

export type PtrRealmPresentationAuthority = Readonly<{
  source: 'server-verified';
  admission: 'admitted' | 'not-admitted';
}>;

export type PtrRealmContextValue = Readonly<{
  phase: PtrRealmPhase;
  statusCode: PtrRealmStatusCode;
  failure: PtrRealmProviderFailure | null;
  presentationAuthority: PtrRealmPresentationAuthority | null;
  /** Opaque WeakMap-branded authority. It has no bearer field. */
  authority: PtrRealmAuthority | null;
  viewAnchor: PtrRealmViewAnchor | null;
  bridge: GreaterRealmProviderBridge | null;
  checkAccess: () => Promise<void>;
  enter: () => Promise<void>;
  leave: () => void;
}>;

type PtrRealmPublicSnapshot = Omit<
  PtrRealmContextValue,
  'checkAccess' | 'enter' | 'leave'
>;

export type PtrRealmProviderRuntime = Readonly<{
  now: () => number;
  createAuthClient: (config: AvailablePtrRealmConfig) => PtrRealmAuthClient;
  connect: (options: ConnectPtrRealmOptions) => Promise<PtrRealmConnectionSession>;
  preflight: (
    session: PtrRealmConnectionSession,
    authority: PtrRealmAuthority,
    signal: AbortSignal,
    now: () => number,
  ) => Promise<PtrRealmViewAnchor>;
  createBridge: (
    session: PtrRealmConnectionSession,
    authority: PtrRealmAuthority,
    now: () => number,
  ) => GreaterRealmProviderBridge;
  isSessionCurrent: (
    session: unknown,
    authority: PtrRealmAuthority,
    now: number,
  ) => boolean;
  closeSession: (session: PtrRealmConnectionSession | undefined) => void;
}>;

const DEFAULT_PTR_REALM_PROVIDER_RUNTIME: PtrRealmProviderRuntime = Object.freeze({
  now: Date.now,
  createAuthClient: config => createPtrRealmAuthClient({
    expectedDatabaseIdentity: config.databaseIdentity,
  }),
  connect: connectPtrRealm,
  preflight: preflightPtrRealmView,
  createBridge: createPtrGreaterRealmProviderBridge,
  isSessionCurrent: isCurrentPtrRealmConnectionSession,
  closeSession: closePtrRealmConnectionSession,
});

const ADMITTED_PRESENTATION: PtrRealmPresentationAuthority = Object.freeze({
  source: 'server-verified',
  admission: 'admitted',
});
const NOT_ADMITTED_PRESENTATION: PtrRealmPresentationAuthority = Object.freeze({
  source: 'server-verified',
  admission: 'not-admitted',
});

function publicSnapshot(
  phase: PtrRealmPhase,
  input: Partial<PtrRealmPublicSnapshot> = {},
): PtrRealmPublicSnapshot {
  const statusCode: PtrRealmStatusCode = (() => {
    switch (phase) {
      case 'unavailable': return 'ptr-unavailable';
      case 'unknown': return 'ptr-access-unverified';
      case 'checking': return 'ptr-access-checking';
      case 'not-admitted': return 'ptr-access-denied';
      case 'admitted': return 'ptr-access-verified';
      case 'connecting': return 'ptr-connecting';
      case 'ready': return 'ptr-ready';
      case 'error': return input.failure === 'transport-unavailable'
        ? 'ptr-transport-unavailable'
        : 'ptr-access-unavailable';
    }
  })();
  return Object.freeze({
    phase,
    statusCode,
    failure: input.failure ?? null,
    presentationAuthority: input.presentationAuthority ?? null,
    authority: input.authority ?? null,
    viewAnchor: input.viewAnchor ?? null,
    bridge: input.bridge ?? null,
  });
}

function eligibleMiniAppHost(host: ReturnType<typeof useMiniAppHost>) {
  return host.state === 'miniapp'
    && host.isMiniApp === true
    && typeof host.quickAuth?.getToken === 'function';
}

function configKey(config: PtrRealmConfig) {
  return config.availability === 'available'
    ? `available:${config.databaseIdentity}:${config.spacetimeUri}`
    : 'unavailable';
}

function validViewAnchor(anchor: PtrRealmViewAnchor, authority: PtrRealmAuthority) {
  return Number.isSafeInteger(anchor.castleId)
    && anchor.castleId === authority.fid
    && Number.isSafeInteger(anchor.q)
    && anchor.q >= -0x8000_0000
    && anchor.q <= 0x7fff_ffff
    && Number.isSafeInteger(anchor.r)
    && anchor.r >= -0x8000_0000
    && anchor.r <= 0x7fff_ffff;
}

type ActiveOperation = Readonly<{
  generation: number;
  controller: AbortController;
}>;

type ActiveSession = Readonly<{
  session: PtrRealmConnectionSession;
  runtime: PtrRealmProviderRuntime;
}>;

const PtrRealmContext = createContext<PtrRealmContextValue | null>(null);

export type PtrRealmProviderProps = Readonly<{
  children: ReactNode;
  config?: PtrRealmConfig;
  /** Test/runtime injection; production uses the exact generated PTR bindings. */
  runtime?: PtrRealmProviderRuntime;
}>;

export function PtrRealmProvider({
  children,
  config: suppliedConfig,
  runtime: suppliedRuntime,
}: PtrRealmProviderProps) {
  const host = useMiniAppHost();
  const environmentConfig = useMemo(() => readPtrRealmConfig(), []);
  const config = suppliedConfig ?? environmentConfig;
  const runtime = suppliedRuntime ?? DEFAULT_PTR_REALM_PROVIDER_RUNTIME;
  const eligible = config.availability === 'available' && eligibleMiniAppHost(host);

  const [snapshot, setSnapshot] = useState<PtrRealmPublicSnapshot>(() => publicSnapshot(
    eligible ? 'unknown' : 'unavailable',
  ));
  const snapshotRef = useRef(snapshot);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const operationRef = useRef<ActiveOperation | undefined>(undefined);
  const sessionRef = useRef<ActiveSession | undefined>(undefined);
  const authorityRef = useRef<PtrRealmAuthority | undefined>(undefined);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestHostRef = useRef(host);
  const latestConfigRef = useRef(config);
  const latestRuntimeRef = useRef(runtime);
  const latestEligibleRef = useRef(eligible);
  latestHostRef.current = host;
  latestConfigRef.current = config;
  latestRuntimeRef.current = runtime;
  latestEligibleRef.current = eligible;

  const publish = useCallback((next: PtrRealmPublicSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const closeActiveSession = useCallback(() => {
    const active = sessionRef.current;
    sessionRef.current = undefined;
    if (active) active.runtime.closeSession(active.session);
  }, []);

  const retireActiveAuthority = useCallback(() => {
    const authority = authorityRef.current;
    authorityRef.current = undefined;
    if (authority) retirePtrRealmAuthority(authority);
  }, []);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current !== undefined) clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = undefined;
  }, []);

  const invalidatePrivateState = useCallback((closeSession: boolean) => {
    generationRef.current += 1;
    operationRef.current?.controller.abort();
    operationRef.current = undefined;
    clearExpiryTimer();
    if (closeSession) closeActiveSession();
    retireActiveAuthority();
  }, [clearExpiryTimer, closeActiveSession, retireActiveAuthority]);

  const baseline = useCallback(() => publicSnapshot(
    latestEligibleRef.current ? 'unknown' : 'unavailable',
  ), []);

  const scheduleAuthorityExpiry = useCallback((authority: PtrRealmAuthority) => {
    clearExpiryTimer();
    const delay = authority.expiresAt - latestRuntimeRef.current.now();
    if (!Number.isSafeInteger(delay) || delay <= 0) {
      invalidatePrivateState(true);
      publish(baseline());
      return false;
    }
    expiryTimerRef.current = setTimeout(() => {
      if (authorityRef.current !== authority) return;
      invalidatePrivateState(true);
      publish(baseline());
    }, delay);
    return true;
  }, [baseline, clearExpiryTimer, invalidatePrivateState, publish]);

  const beginOperation = useCallback((): ActiveOperation => {
    generationRef.current += 1;
    operationRef.current?.controller.abort();
    const operation = Object.freeze({
      generation: generationRef.current,
      controller: new AbortController(),
    });
    operationRef.current = operation;
    return operation;
  }, []);

  const operationIsCurrent = useCallback((operation: ActiveOperation) => (
    mountedRef.current
    && operationRef.current === operation
    && generationRef.current === operation.generation
    && !operation.controller.signal.aborted
  ), []);

  const operationScopeIsCurrent = useCallback((
    hostScope: ReturnType<typeof useMiniAppHost>,
    configScope: AvailablePtrRealmConfig,
    runtimeScope: PtrRealmProviderRuntime,
  ) => latestHostRef.current === hostScope
    && configKey(latestConfigRef.current) === configKey(configScope)
    && latestRuntimeRef.current === runtimeScope
    && latestEligibleRef.current,
  []);

  const handleTransportFailure = useCallback((generation: number) => {
    if (!mountedRef.current || generationRef.current !== generation) return;
    invalidatePrivateState(true);
    publish(publicSnapshot('error', { failure: 'transport-unavailable' }));
  }, [invalidatePrivateState, publish]);

  const checkAccess = useCallback(async () => {
    const currentConfig = latestConfigRef.current;
    const currentHost = latestHostRef.current;
    const currentRuntime = latestRuntimeRef.current;
    if (
      currentConfig.availability !== 'available'
      || !latestEligibleRef.current
      || !eligibleMiniAppHost(currentHost)
    ) {
      invalidatePrivateState(true);
      publish(publicSnapshot('unavailable'));
      return;
    }

    invalidatePrivateState(true);
    const operation = beginOperation();
    publish(publicSnapshot('checking'));
    let quickAuthToken: string | undefined;
    try {
      const acquisition = await currentHost.quickAuth.getToken({ force: true });
      if (
        !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHost, currentConfig, currentRuntime)
      ) return;
      if (acquisition.status !== 'token') {
        if (acquisition.status === 'host-replaced') {
          invalidatePrivateState(true);
          publish(publicSnapshot('unavailable'));
        } else if (acquisition.status === 'timeout') {
          publish(publicSnapshot('error', { failure: 'access-unavailable' }));
        } else {
          publish(publicSnapshot('not-admitted', { failure: 'host-unverified' }));
        }
        return;
      }
      quickAuthToken = acquisition.token;
      const authority = await currentRuntime
        .createAuthClient(currentConfig)
        .exchangeQuickAuth(quickAuthToken, operation.controller.signal);
      quickAuthToken = undefined;
      if (
        !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHost, currentConfig, currentRuntime)
      ) {
        retirePtrRealmAuthority(authority);
        return;
      }
      if (!isCurrentPtrRealmAuthority(authority, currentRuntime.now())) {
        retirePtrRealmAuthority(authority);
        publish(publicSnapshot('error', { failure: 'access-unavailable' }));
        return;
      }
      authorityRef.current = authority;
      if (!scheduleAuthorityExpiry(authority)) return;
      publish(publicSnapshot('admitted', {
        presentationAuthority: ADMITTED_PRESENTATION,
        authority,
      }));
    } catch (error) {
      if (
        !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHost, currentConfig, currentRuntime)
      ) return;
      const failure = ptrRealmAuthFailureCode(error);
      if (failure === 'forbidden') {
        publish(publicSnapshot('not-admitted', {
          presentationAuthority: NOT_ADMITTED_PRESENTATION,
        }));
      } else if (failure === 'invalid-credential') {
        publish(publicSnapshot('not-admitted', { failure: 'host-unverified' }));
      } else if (failure !== 'cancelled') {
        publish(publicSnapshot('error', { failure: 'access-unavailable' }));
      }
    } finally {
      quickAuthToken = undefined;
      if (operationRef.current === operation) operationRef.current = undefined;
    }
  }, [
    beginOperation,
    invalidatePrivateState,
    operationIsCurrent,
    operationScopeIsCurrent,
    publish,
    scheduleAuthorityExpiry,
  ]);

  const enter = useCallback(async () => {
    const authority = authorityRef.current;
    const currentHost = latestHostRef.current;
    const currentConfig = latestConfigRef.current;
    const currentRuntime = latestRuntimeRef.current;
    if (
      snapshotRef.current.phase !== 'admitted'
      || !authority
      || currentConfig.availability !== 'available'
      || !latestEligibleRef.current
      || !isCurrentPtrRealmAuthority(authority, currentRuntime.now())
    ) {
      invalidatePrivateState(true);
      publish(baseline());
      return;
    }

    closeActiveSession();
    const operation = beginOperation();
    publish(publicSnapshot('connecting', {
      presentationAuthority: ADMITTED_PRESENTATION,
      authority,
    }));
    let connectedSession: PtrRealmConnectionSession | undefined;
    try {
      connectedSession = await currentRuntime.connect({
        config: currentConfig,
        authority,
        generation: operation.generation,
        signal: operation.controller.signal,
        now: currentRuntime.now,
        onTransportFailure: () => handleTransportFailure(operation.generation),
      });
      if (
        !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHost, currentConfig, currentRuntime)
      ) {
        currentRuntime.closeSession(connectedSession);
        retirePtrRealmAuthority(authority);
        return;
      }
      if (!currentRuntime.isSessionCurrent(
        connectedSession,
        authority,
        currentRuntime.now(),
      )) throw new Error();
      sessionRef.current = Object.freeze({
        session: connectedSession,
        runtime: currentRuntime,
      });
      const viewAnchor = await currentRuntime.preflight(
        connectedSession,
        authority,
        operation.controller.signal,
        currentRuntime.now,
      );
      if (
        !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHost, currentConfig, currentRuntime)
      ) {
        if (sessionRef.current?.session === connectedSession) {
          sessionRef.current = undefined;
        }
        currentRuntime.closeSession(connectedSession);
        retirePtrRealmAuthority(authority);
        return;
      }
      if (
        !validViewAnchor(viewAnchor, authority)
        || !currentRuntime.isSessionCurrent(
          connectedSession,
          authority,
          currentRuntime.now(),
        )
      ) throw new Error();
      const bridge = currentRuntime.createBridge(
        connectedSession,
        authority,
        currentRuntime.now,
      );
      if (
        bridge.phase !== 'available'
        || bridge.presentationAllowed !== true
        || bridge.sessionGeneration !== connectedSession.generation
        || !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHost, currentConfig, currentRuntime)
      ) throw new Error();
      publish(publicSnapshot('ready', {
        presentationAuthority: ADMITTED_PRESENTATION,
        authority,
        viewAnchor: Object.freeze({ ...viewAnchor }),
        bridge,
      }));
    } catch {
      if (
        !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHost, currentConfig, currentRuntime)
      ) {
        if (connectedSession) {
          if (sessionRef.current?.session === connectedSession) {
            sessionRef.current = undefined;
          }
          currentRuntime.closeSession(connectedSession);
        }
        retirePtrRealmAuthority(authority);
        return;
      }
      closeActiveSession();
      clearExpiryTimer();
      retireActiveAuthority();
      publish(publicSnapshot('error', { failure: 'transport-unavailable' }));
    } finally {
      if (operationRef.current === operation) operationRef.current = undefined;
    }
  }, [
    baseline,
    beginOperation,
    clearExpiryTimer,
    closeActiveSession,
    handleTransportFailure,
    invalidatePrivateState,
    operationIsCurrent,
    operationScopeIsCurrent,
    publish,
    retireActiveAuthority,
  ]);

  const leave = useCallback(() => {
    invalidatePrivateState(true);
    publish(baseline());
  }, [baseline, invalidatePrivateState, publish]);

  const scopeRef = useRef(Object.freeze({
    host,
    config: configKey(config),
    runtime,
    eligible,
  }));
  useEffect(() => {
    const nextConfig = configKey(config);
    const prior = scopeRef.current;
    const changed = prior.host !== host
      || prior.config !== nextConfig
      || prior.runtime !== runtime
      || prior.eligible !== eligible;
    scopeRef.current = Object.freeze({ host, config: nextConfig, runtime, eligible });
    if (changed) {
      invalidatePrivateState(true);
      publish(publicSnapshot(eligible ? 'unknown' : 'unavailable'));
    }
  }, [config, eligible, host, invalidatePrivateState, publish, runtime]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidatePrivateState(true);
    };
  }, [invalidatePrivateState]);

  const value = useMemo<PtrRealmContextValue>(() => Object.freeze({
    ...snapshot,
    checkAccess,
    enter,
    leave,
  }), [checkAccess, enter, leave, snapshot]);

  return (
    <PtrRealmContext.Provider value={value}>
      {children}
    </PtrRealmContext.Provider>
  );
}

export function usePtrRealm(): PtrRealmContextValue {
  const value = useContext(PtrRealmContext);
  if (!value) throw new Error('usePtrRealm must be used within PtrRealmProvider.');
  return value;
}
