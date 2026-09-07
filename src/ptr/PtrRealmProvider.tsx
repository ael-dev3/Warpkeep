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
  readPtrRealmAuthorityScope,
  retirePtrRealmAuthority,
  type PtrRealmAuthClient,
  type PtrRealmAuthority,
  type PtrRealmAuthorityScope,
} from './ptrRealmAuthClient';
import {
  closePtrRealmConnectionSession,
  connectPtrRealm,
  isCurrentPtrRealmConnectionSession,
  type ConnectPtrRealmOptions,
  type PtrRealmConnectionSession,
  createPtrGameplay04Capability,
  type PtrGameplay04Capability,
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
  | 'renewing'
  | 'renewal-error'
  | 'ready'
  | 'error';

export type PtrRealmStatusCode =
  | 'ptr-unavailable'
  | 'ptr-access-unverified'
  | 'ptr-access-checking'
  | 'ptr-access-denied'
  | 'ptr-access-verified'
  | 'ptr-connecting'
  | 'ptr-renewing'
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
  gameplay04: PtrGameplay04Capability | null;
  checkAccess: () => Promise<void>;
  enter: () => Promise<void>;
  /** Arms expiry continuation only after the experience actually enters PTR. */
  setContinuationActive: (active: boolean) => void;
  /** Retries an expired active session; never rotates a still-valid lease. */
  renewSession: () => Promise<void>;
  leave: () => void;
}>;

type PtrRealmPublicSnapshot = Omit<
  PtrRealmContextValue,
  'checkAccess' | 'enter' | 'setContinuationActive' | 'renewSession' | 'leave'
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
  createGameplay04: (
    session: PtrRealmConnectionSession,
    authority: PtrRealmAuthority,
    anchor: PtrRealmViewAnchor,
    now: () => number,
  ) => PtrGameplay04Capability;
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
  createGameplay04: createPtrGameplay04Capability,
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
      case 'renewing': return 'ptr-renewing';
      case 'ready': return 'ptr-ready';
      case 'renewal-error':
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
    gameplay04: phase === 'ready' ? input.gameplay04 ?? null : null,
  });
}

function eligibleMiniAppHost(host: ReturnType<typeof useMiniAppHost>) {
  return host.state === 'miniapp'
    && host.isMiniApp === true
    && typeof host.quickAuth?.getToken === 'function';
}

type MiniAppScope = Readonly<{
  state: ReturnType<typeof useMiniAppHost>['state'];
  isMiniApp: boolean;
  quickAuth: ReturnType<typeof useMiniAppHost>['quickAuth'];
  getToken: ReturnType<typeof useMiniAppHost>['quickAuth']['getToken'];
  fid: number | null;
  clientFid: number | null;
}>;

function readMiniAppScope(host: ReturnType<typeof useMiniAppHost>): MiniAppScope {
  // Context is presentation-only: these hints can revoke an existing scope,
  // never establish identity or admission. Copy scalars so a stable facade
  // cannot rewrite the account captured by an in-flight operation.
  return Object.freeze({
    state: host.state,
    isMiniApp: host.isMiniApp,
    quickAuth: host.quickAuth,
    getToken: host.quickAuth?.getToken,
    fid: host.context?.user.fid ?? null,
    clientFid: host.context?.client.clientFid ?? null,
  });
}

function sameMiniAppScope(left: MiniAppScope, right: MiniAppScope) {
  return left.state === right.state
    && left.isMiniApp === right.isMiniApp
    && left.quickAuth === right.quickAuth
    && left.getToken === right.getToken
    && left.fid === right.fid
    && left.clientFid === right.clientFid;
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
  const hostScope = readMiniAppScope(host);
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
  const continuationRef = useRef<PtrRealmAuthorityScope | null>(null);
  const renewalFlightRef = useRef<Readonly<{
    operation: ActiveOperation;
    promise: Promise<void>;
  }> | undefined>(undefined);
  const expireAuthorityRef = useRef<(authority: PtrRealmAuthority) => void>(() => undefined);
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
    renewalFlightRef.current = undefined;
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
      expireAuthorityRef.current(authority);
      return false;
    }
    expiryTimerRef.current = setTimeout(() => {
      expireAuthorityRef.current(authority);
    }, delay);
    return true;
  }, [clearExpiryTimer]);

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
    expectedHostScope: MiniAppScope,
    configScope: AvailablePtrRealmConfig,
    runtimeScope: PtrRealmProviderRuntime,
  ) => sameMiniAppScope(readMiniAppScope(latestHostRef.current), expectedHostScope)
    && configKey(latestConfigRef.current) === configKey(configScope)
    && latestRuntimeRef.current === runtimeScope
    && latestEligibleRef.current,
  []);

  const handleTransportFailure = useCallback((generation: number) => {
    if (!mountedRef.current || generationRef.current !== generation) return;
    const renewing = snapshotRef.current.phase === 'renewing';
    if (!renewing) continuationRef.current = null;
    invalidatePrivateState(true);
    publish(publicSnapshot(renewing ? 'renewal-error' : 'error', {
      failure: 'transport-unavailable',
    }));
  }, [invalidatePrivateState, publish]);

  const checkAccess = useCallback(async () => {
    continuationRef.current = null;
    const currentConfig = latestConfigRef.current;
    const currentHost = latestHostRef.current;
    const currentHostScope = readMiniAppScope(currentHost);
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
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
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
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
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
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
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

  const connectAuthority = useCallback(async (
    authority: PtrRealmAuthority,
    operation: ActiveOperation,
    currentHostScope: MiniAppScope,
    currentConfig: AvailablePtrRealmConfig,
    currentRuntime: PtrRealmProviderRuntime,
  ) => {
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
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
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
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
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
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
      ) throw new Error();
      const gameplay04 = currentRuntime.createGameplay04(
        connectedSession, authority, viewAnchor, currentRuntime.now,
      );
      if (!operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
        || !isCurrentPtrRealmAuthority(authority, currentRuntime.now())
        || !currentRuntime.isSessionCurrent(connectedSession, authority, currentRuntime.now())) {
        throw new Error();
      }
      publish(publicSnapshot('ready', {
        presentationAuthority: ADMITTED_PRESENTATION,
        authority,
        viewAnchor: Object.freeze({ ...viewAnchor }),
        bridge,
        gameplay04,
      }));
    } catch (error) {
      if (
        !operationIsCurrent(operation)
        || !operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)
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
      throw error;
    }
  }, [
    clearExpiryTimer,
    closeActiveSession,
    handleTransportFailure,
    operationIsCurrent,
    operationScopeIsCurrent,
    publish,
    retireActiveAuthority,
  ]);

  const enter = useCallback(async () => {
    const authority = authorityRef.current;
    const currentHost = latestHostRef.current;
    const currentHostScope = readMiniAppScope(currentHost);
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
    try {
      await connectAuthority(authority, operation, currentHostScope, currentConfig, currentRuntime);
    } catch {
      if (operationIsCurrent(operation)
        && operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime)) {
        publish(publicSnapshot('error', { failure: 'transport-unavailable' }));
      }
    } finally {
      if (operationRef.current === operation) operationRef.current = undefined;
    }
  }, [
    baseline, beginOperation, closeActiveSession, connectAuthority, invalidatePrivateState,
    operationIsCurrent, operationScopeIsCurrent, publish,
  ]);

  const renewSession = useCallback((): Promise<void> => {
    if (renewalFlightRef.current) return renewalFlightRef.current.promise;
    const expectedScope = continuationRef.current;
    const currentHost = latestHostRef.current;
    const currentHostScope = readMiniAppScope(currentHost);
    const currentConfig = latestConfigRef.current;
    const currentRuntime = latestRuntimeRef.current;
    if (!mountedRef.current || !expectedScope) return Promise.resolve();
    if (currentConfig.availability !== 'available'
      || !latestEligibleRef.current || !eligibleMiniAppHost(currentHost)) {
      continuationRef.current = null;
      invalidatePrivateState(true);
      publish(baseline());
      return Promise.resolve();
    }
    // A foreground event or repeated click must not interrupt an unexpired command.
    if (authorityRef.current
      && isCurrentPtrRealmAuthority(authorityRef.current, currentRuntime.now())) {
      return Promise.resolve();
    }

    invalidatePrivateState(true);
    const operation = beginOperation();
    publish(publicSnapshot('renewing'));
    const scopeIsCurrent = () => operationIsCurrent(operation)
      && continuationRef.current === expectedScope
      && operationScopeIsCurrent(currentHostScope, currentConfig, currentRuntime);
    const deny = (verified: boolean) => {
      continuationRef.current = null;
      invalidatePrivateState(true);
      publish(publicSnapshot('not-admitted', verified ? {
        presentationAuthority: NOT_ADMITTED_PRESENTATION,
      } : { failure: 'host-unverified' }));
    };
    const promise = Promise.resolve().then(async () => {
      let quickAuthToken: string | undefined;
      let connecting = false;
      try {
        if (!scopeIsCurrent()) return;
        const acquisition = await currentHost.quickAuth.getToken({ force: true });
        if (!scopeIsCurrent()) return;
        if (acquisition.status !== 'token') {
          if (acquisition.status === 'host-replaced') {
            continuationRef.current = null;
            invalidatePrivateState(true);
            publish(publicSnapshot('unavailable'));
          } else if (acquisition.status === 'timeout') {
            publish(publicSnapshot('renewal-error', { failure: 'access-unavailable' }));
          } else {
            deny(false);
          }
          return;
        }
        quickAuthToken = acquisition.token;
        const authority = await currentRuntime.createAuthClient(currentConfig)
          .exchangeQuickAuth(quickAuthToken, operation.controller.signal);
        quickAuthToken = undefined;
        if (!scopeIsCurrent()) {
          retirePtrRealmAuthority(authority);
          return;
        }
        const renewedScope = readPtrRealmAuthorityScope(authority, currentRuntime.now());
        if (!renewedScope) {
          retirePtrRealmAuthority(authority);
          publish(publicSnapshot('renewal-error', { failure: 'access-unavailable' }));
          return;
        }
        if (renewedScope.fid !== expectedScope.fid
          || renewedScope.databaseIdentity !== expectedScope.databaseIdentity
          || renewedScope.authEpoch !== expectedScope.authEpoch) {
          retirePtrRealmAuthority(authority);
          deny(false);
          return;
        }
        authorityRef.current = authority;
        if (!scheduleAuthorityExpiry(authority)) return;
        connecting = true;
        // No prior view, draft, quote or mutation envelope crosses this boundary.
        await connectAuthority(authority, operation, currentHostScope, currentConfig, currentRuntime);
      } catch (error) {
        if (!scopeIsCurrent()) return;
        const failure = ptrRealmAuthFailureCode(error);
        if (failure === 'forbidden' || failure === 'invalid-credential') {
          deny(failure === 'forbidden');
        } else {
          invalidatePrivateState(true);
          publish(publicSnapshot('renewal-error', {
            failure: connecting ? 'transport-unavailable' : 'access-unavailable',
          }));
        }
      } finally {
        quickAuthToken = undefined;
        if (operationRef.current === operation) operationRef.current = undefined;
        if (renewalFlightRef.current?.operation === operation) renewalFlightRef.current = undefined;
      }
    });
    renewalFlightRef.current = Object.freeze({ operation, promise });
    return promise;
  }, [
    baseline, beginOperation, connectAuthority, invalidatePrivateState,
    operationIsCurrent, operationScopeIsCurrent, publish, scheduleAuthorityExpiry,
  ]);

  const expireAuthority = useCallback((authority: PtrRealmAuthority) => {
    if (!mountedRef.current || authorityRef.current !== authority) return;
    const priorPhase = snapshotRef.current.phase;
    const continueActive = continuationRef.current !== null && priorPhase === 'ready';
    invalidatePrivateState(true);
    if (continueActive) {
      void renewSession();
    } else if (continuationRef.current && priorPhase === 'renewing') {
      // An attempt that outlives its new lease requires an explicit retry.
      publish(publicSnapshot('renewal-error', { failure: 'access-unavailable' }));
    } else {
      publish(baseline());
    }
  }, [baseline, invalidatePrivateState, publish, renewSession]);
  expireAuthorityRef.current = expireAuthority;

  const setContinuationActive = useCallback((active: boolean) => {
    if (!active) {
      continuationRef.current = null;
      if (snapshotRef.current.phase === 'renewing' || snapshotRef.current.phase === 'renewal-error') {
        invalidatePrivateState(true);
        publish(baseline());
      }
      return;
    }
    if (continuationRef.current || snapshotRef.current.phase !== 'ready') return;
    continuationRef.current = readPtrRealmAuthorityScope(
      authorityRef.current, latestRuntimeRef.current.now(),
    );
  }, [baseline, invalidatePrivateState, publish]);

  const leave = useCallback(() => {
    continuationRef.current = null;
    invalidatePrivateState(true);
    publish(baseline());
  }, [baseline, invalidatePrivateState, publish]);

  const scopeRef = useRef(Object.freeze({
    host: hostScope,
    config: configKey(config),
    runtime,
    eligible,
  }));
  useEffect(() => {
    const nextConfig = configKey(config);
    const prior = scopeRef.current;
    const changed = !sameMiniAppScope(prior.host, hostScope)
      || prior.config !== nextConfig
      || prior.runtime !== runtime
      || prior.eligible !== eligible;
    scopeRef.current = Object.freeze({ host: hostScope, config: nextConfig, runtime, eligible });
    if (changed) {
      continuationRef.current = null;
      invalidatePrivateState(true);
      publish(publicSnapshot(eligible ? 'unknown' : 'unavailable'));
    }
  }, [config, eligible, hostScope, invalidatePrivateState, publish, runtime]);

  useEffect(() => {
    const checkExpiry = () => {
      if (document.visibilityState === 'hidden') return;
      const authority = authorityRef.current;
      if (authority && !isCurrentPtrRealmAuthority(authority, latestRuntimeRef.current.now())) {
        expireAuthorityRef.current(authority);
      }
    };
    window.addEventListener('focus', checkExpiry);
    window.addEventListener('pageshow', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      window.removeEventListener('focus', checkExpiry);
      window.removeEventListener('pageshow', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      continuationRef.current = null;
      invalidatePrivateState(true);
    };
  }, [invalidatePrivateState]);

  const value = useMemo<PtrRealmContextValue>(() => Object.freeze({
    ...snapshot,
    checkAccess,
    enter,
    setContinuationActive,
    renewSession,
    leave,
  }), [checkAccess, enter, leave, renewSession, setContinuationActive, snapshot]);

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
