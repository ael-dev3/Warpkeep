import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode
} from 'react';

import {
  clearFarcasterRememberedDeviceSession,
  getFarcasterDeviceSessionControlKey,
  getFarcasterDeviceSessionStorageKey,
  getLegacyFarcasterDeviceSessionStorageKey,
  persistFarcasterRememberedDeviceSession,
  restoreFarcasterRememberedDeviceSession,
  signalFarcasterSessionTermination,
  toFarcasterOidcSession,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterRememberedDeviceSession
} from './farcasterDeviceSession';
import {
  createFarcasterAuthMachineState,
  farcasterAuthMachineReducer,
  type FarcasterAuthMachineAction,
  type FarcasterAuthMachineState,
  type FarcasterRememberedMachineSession
} from './farcasterAuthMachine';
import {
  getDefaultFarcasterSessionAuthority,
  toFarcasterAuthError
} from './farcasterAuthClient';
import {
  FARCASTER_AUTH_REQUEST_TTL_MS,
  getBrowserFarcasterAuthContext
} from './farcasterAuthContext';
import { getDefaultFarcasterOidcBridgeClient } from './farcasterOidcBridgeClient';
import { validateFarcasterOidcSessionForIdentity } from './farcasterOidcSession';
import type {
  FarcasterAuthError,
  FarcasterAuthContext,
  FarcasterAuthPhase,
  FarcasterAuthViewState,
  FarcasterOidcBridgeClient,
  FarcasterOidcSession,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from './farcasterAuthTypes';

export const FARCASTER_AUTH_POLL_INTERVAL_MS = 1_500;
const MAX_BROWSER_TIMER_DELAY_MS = 2_147_000_000;

export type FarcasterAuthorityLoader = () => Promise<FarcasterSessionAuthority>;
export type FarcasterOidcBridgeLoader = () => Promise<FarcasterOidcBridgeClient>;
export type FarcasterQrEncoder = (channelUrl: string) => Promise<string>;

export type FarcasterAuthProviderProps = Readonly<{
  children: ReactNode;
  loadAuthority?: FarcasterAuthorityLoader;
  /** Lazy injection seam for the trusted Farcaster → OIDC bridge. */
  loadBridgeClient?: FarcasterOidcBridgeLoader;
  /** Kept injectable so a challenge and SIWF request share one exact context. */
  resolveAuthContext?: () => FarcasterAuthContext;
  encodeQrCode?: FarcasterQrEncoder;
  now?: () => number;
  pollIntervalMs?: number;
  /** Injection seam for storage-denied and cross-tab lifecycle tests. */
  deviceSessionEnvironment?: FarcasterDeviceSessionEnvironment;
}>;

export type FarcasterAuthControllerValue = Readonly<{
  state: FarcasterAuthViewState;
  /** Bearer material is intentionally separate from presentation state. */
  oidcSession: FarcasterOidcSession | undefined;
  beginSignIn: () => void;
  cancelSignIn: () => void;
  retrySignIn: () => void;
  prepareQrCode: () => void;
  signOut: () => void;
  rememberDevice: boolean;
  setRememberDevice: (remember: boolean) => void;
  hasRememberedDevice: boolean;
}>;

type ControllerConfig = {
  loadAuthority: FarcasterAuthorityLoader;
  loadBridgeClient: FarcasterOidcBridgeLoader;
  resolveAuthContext: () => FarcasterAuthContext;
  encodeQrCode: FarcasterQrEncoder;
  now: () => number;
  pollIntervalMs: number;
  onBridgeAuthenticated: (
    identity: VerifiedFarcasterIdentity,
    session: FarcasterOidcSession
  ) => void;
  onSignOut: () => void;
};

type ActiveRequest = {
  generation: number;
  expiresAt: number;
  channel?: FarcasterSignInChannel;
  pollInFlight: boolean;
  qrInFlight: boolean;
};

const expiredError: FarcasterAuthError = Object.freeze({
  code: 'expired',
  message: 'The Farcaster sign-in request has expired.'
});

const invalidStatusError: FarcasterAuthError = Object.freeze({
  code: 'invalid-response',
  message: 'The Farcaster relay returned an invalid response.'
});

function defaultEncodeQrCode(channelUrl: string) {
  return import('./farcasterQrCode').then(({ encodeFarcasterQrCode }) => (
    encodeFarcasterQrCode(channelUrl)
  ));
}

function normalizePollInterval(pollIntervalMs: number | undefined) {
  return Number.isFinite(pollIntervalMs) && (pollIntervalMs as number) > 0
    ? Math.max(1, Math.floor(pollIntervalMs as number))
    : FARCASTER_AUTH_POLL_INTERVAL_MS;
}

function isActivePhase(phase: FarcasterAuthPhase) {
  return phase === 'creating-channel'
    || phase === 'awaiting-approval'
    || phase === 'verifying';
}

function canBeginFrom(phase: FarcasterAuthPhase) {
  return phase === 'anonymous' || phase === 'expired' || phase === 'error';
}

function readProviderNow(now: () => number) {
  try {
    const value = now();
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
  } catch {
    return undefined;
  }
}

function isUsableVerifiedIdentity(identity: VerifiedFarcasterIdentity) {
  return Number.isSafeInteger(identity.fid)
    && identity.fid > 0
    && Number.isFinite(identity.verifiedAt)
    && Array.isArray(identity.verifications);
}

function rememberedMachineSession(
  session: FarcasterRememberedDeviceSession | undefined
): FarcasterRememberedMachineSession | undefined {
  if (!session) {
    return undefined;
  }

  return {
    identity: {
      fid: session.identity.fid,
      ...(session.identity.username === undefined
        ? {}
        : { username: session.identity.username }),
      ...(session.identity.displayName === undefined
        ? {}
        : { displayName: session.identity.displayName }),
      ...(session.identity.pfpUrl === undefined
        ? {}
        : { pfpUrl: session.identity.pfpUrl }),
      verifications: [],
      verifiedAt: session.verifiedAt
    },
    expiresAt: session.expiresAt
  };
}

class FarcasterAuthController {
  private config: ControllerConfig;
  private mounted = false;
  private phase: FarcasterAuthPhase = 'anonymous';
  private machineGeneration = 0;
  private generationCounter = 0;
  private activeRequest: ActiveRequest | undefined;
  private pollTimer: number | undefined;
  private expiryTimer: number | undefined;
  private authorityPromise: Promise<FarcasterSessionAuthority> | undefined;
  private bridgeClientPromise: Promise<FarcasterOidcBridgeClient> | undefined;

  constructor(
    private readonly dispatch: Dispatch<FarcasterAuthMachineAction>,
    config: ControllerConfig
  ) {
    this.config = config;
  }

  configure(config: ControllerConfig) {
    this.config = config;
  }

  syncMachineState(machine: FarcasterAuthMachineState) {
    this.phase = machine.view.phase;
    this.machineGeneration = machine.generation;
    this.generationCounter = Math.max(this.generationCounter, machine.generation);
  }

  mount() {
    this.mounted = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.reconcileAfterFarcasterReturn);
      window.addEventListener('pageshow', this.reconcileAfterFarcasterReturn);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', this.reconcileAfterFarcasterReturn);
        window.removeEventListener('pageshow', this.reconcileAfterFarcasterReturn);
      }
      this.mounted = false;
      this.invalidatePrivateRequest();
    };
  }

  readonly beginSignIn = () => {
    if (!this.mounted || this.activeRequest || !canBeginFrom(this.phase)) {
      return;
    }

    const generation = this.nextGeneration();
    const expiresAt = this.readNow() + FARCASTER_AUTH_REQUEST_TTL_MS;
    this.activeRequest = {
      generation,
      expiresAt,
      pollInFlight: false,
      qrInFlight: false
    };
    this.phase = 'creating-channel';
    this.machineGeneration = generation;
    this.dispatch({ type: 'begin', generation });
    this.scheduleExpiry(generation, expiresAt);
    if (this.isCurrent(generation)) {
      void this.createChannel(generation);
    }
  };

  readonly retrySignIn = () => {
    this.beginSignIn();
  };

  readonly cancelSignIn = () => {
    if (
      !this.mounted
      || (
        !isActivePhase(this.phase)
        && this.phase !== 'expired'
        && this.phase !== 'error'
      )
    ) {
      return;
    }

    const generation = this.activeRequest?.generation ?? this.machineGeneration;
    this.invalidatePrivateRequest();
    this.phase = 'anonymous';
    this.dispatch({ type: 'cancel', generation });
  };

  readonly signOut = () => {
    if (!this.mounted || this.phase !== 'authenticated') {
      return;
    }

    const generation = this.machineGeneration;
    this.invalidatePrivateRequest();
    this.phase = 'anonymous';
    this.config.onSignOut();
    this.dispatch({ type: 'sign-out', generation });
  };

  /** Lazily load the QR encoder while a valid SIWF channel keeps polling. */
  readonly prepareQrCode = () => {
    const activeRequest = this.activeRequest;
    const channel = activeRequest?.channel;
    if (
      !this.mounted
      || !activeRequest
      || !channel
      || activeRequest.qrInFlight
      || this.phase !== 'awaiting-approval'
      || this.readNow() >= activeRequest.expiresAt
    ) {
      return;
    }

    activeRequest.qrInFlight = true;
    const generation = activeRequest.generation;
    this.dispatch({ type: 'qr-loading', generation });
    void this.encodeQrCode(generation, channel.url);
  };

  private nextGeneration() {
    this.generationCounter += 1;
    return this.generationCounter;
  }

  private isCurrent(generation: number) {
    return this.mounted
      && this.activeRequest?.generation === generation;
  }

  private readNow() {
    try {
      const now = this.config.now();
      return Number.isFinite(now) ? now : Number.POSITIVE_INFINITY;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  private isDocumentHidden() {
    return typeof document !== 'undefined' && document.hidden;
  }

  private clearPollTimer() {
    if (this.pollTimer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(this.pollTimer);
    }
    this.pollTimer = undefined;
  }

  private clearExpiryTimer() {
    if (this.expiryTimer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(this.expiryTimer);
    }
    this.expiryTimer = undefined;
  }

  private clearTimers() {
    this.clearPollTimer();
    this.clearExpiryTimer();
  }

  private invalidatePrivateRequest() {
    this.generationCounter += 1;
    this.clearTimers();
    this.activeRequest = undefined;
  }

  private async getAuthority() {
    if (!this.authorityPromise) {
      const authorityPromise = Promise.resolve().then(() => this.config.loadAuthority());
      this.authorityPromise = authorityPromise;
      void authorityPromise.catch(() => {
        if (this.authorityPromise === authorityPromise) {
          this.authorityPromise = undefined;
        }
      });
    }
    return this.authorityPromise;
  }

  private async getBridgeClient() {
    if (!this.bridgeClientPromise) {
      const bridgeClientPromise = Promise.resolve().then(() => this.config.loadBridgeClient());
      this.bridgeClientPromise = bridgeClientPromise;
      void bridgeClientPromise.catch(() => {
        if (this.bridgeClientPromise === bridgeClientPromise) {
          this.bridgeClientPromise = undefined;
        }
      });
    }
    return this.bridgeClientPromise;
  }

  private scheduleExpiry(generation: number, expiresAt: number) {
    this.clearExpiryTimer();
    const delay = expiresAt - this.readNow();
    if (!Number.isFinite(delay) || delay <= 0 || typeof window === 'undefined') {
      this.expire(generation);
      return;
    }

    this.expiryTimer = window.setTimeout(() => {
      this.expiryTimer = undefined;
      this.expire(generation);
    }, delay);
  }

  private schedulePoll(generation: number) {
    this.clearPollTimer();
    if (
      !this.isCurrent(generation)
      || this.phase !== 'awaiting-approval'
      || this.isDocumentHidden()
      || typeof window === 'undefined'
    ) {
      return;
    }

    this.pollTimer = window.setTimeout(() => {
      this.pollTimer = undefined;
      void this.poll(generation);
    }, this.config.pollIntervalMs);
  }

  private finish(
    generation: number,
    phase: 'authenticated' | 'expired' | 'error',
    action: FarcasterAuthMachineAction,
    oidcSession?: FarcasterOidcSession
  ) {
    if (!this.isCurrent(generation)) {
      return;
    }
    if (action.type === 'authenticated') {
      if (!oidcSession) {
        return;
      }
      this.config.onBridgeAuthenticated(action.identity, oidcSession);
    }
    this.invalidatePrivateRequest();
    this.phase = phase;
    this.dispatch(action);
  }

  private expire(generation: number) {
    this.finish(generation, 'expired', {
      type: 'expired',
      generation,
      error: expiredError
    });
  }

  private fail(generation: number, error: unknown, override?: FarcasterAuthError) {
    if (!this.isCurrent(generation)) {
      return;
    }
    const publicError = override ?? toFarcasterAuthError(error);
    if (publicError.code === 'expired') {
      this.finish(generation, 'expired', {
        type: 'expired',
        generation,
        error: publicError
      });
      return;
    }
    this.finish(generation, 'error', {
      type: 'failed',
      generation,
      error: publicError
    });
  }

  private async createChannel(generation: number) {
    let authority: FarcasterSessionAuthority;
    let bridgeClient: FarcasterOidcBridgeClient;
    let context: FarcasterAuthContext;
    try {
      authority = await this.getAuthority();
      if (!this.isCurrent(generation)) {
        return;
      }
      context = this.config.resolveAuthContext();
      bridgeClient = await this.getBridgeClient();
      if (!this.isCurrent(generation)) {
        return;
      }
    } catch (error) {
      this.fail(generation, error);
      return;
    }

    let channel: FarcasterSignInChannel;
    try {
      const challenge = bridgeClient.createChallenge
        ? await bridgeClient.createChallenge(context)
        : undefined;
      if (!this.isCurrent(generation)) {
        return;
      }
      channel = await authority.beginSignIn(context, challenge);
      if (!this.isCurrent(generation)) {
        return;
      }
    } catch (error) {
      this.fail(generation, error);
      return;
    }

    const activeRequest = this.activeRequest;
    if (!activeRequest || activeRequest.generation !== generation) {
      return;
    }
    const expiresAt = Math.min(activeRequest.expiresAt, channel.expiresAt);
    activeRequest.expiresAt = expiresAt;
    if (this.readNow() >= expiresAt) {
      this.expire(generation);
      return;
    }

    activeRequest.channel = channel;
    this.scheduleExpiry(generation, expiresAt);
    this.phase = 'awaiting-approval';
    this.dispatch({
      type: 'channel-ready',
      generation,
      channelUrl: channel.url,
      expiresAt
    });
    this.schedulePoll(generation);
  }

  private async encodeQrCode(generation: number, channelUrl: string) {
    try {
      const dataUrl = await this.config.encodeQrCode(channelUrl);
      if (!this.isCurrent(generation)) {
        return;
      }
      const activeRequest = this.activeRequest;
      if (
        !activeRequest
        || this.phase !== 'awaiting-approval'
        || this.readNow() >= activeRequest.expiresAt
        || typeof dataUrl !== 'string'
        || !dataUrl.trim()
      ) {
        if (activeRequest && this.readNow() >= activeRequest.expiresAt) {
          this.expire(generation);
        } else {
          this.dispatch({ type: 'qr-failed', generation });
        }
        return;
      }
      this.dispatch({ type: 'qr-ready', generation, dataUrl });
    } catch {
      if (this.isCurrent(generation)) {
        this.dispatch({ type: 'qr-failed', generation });
      }
    } finally {
      if (this.activeRequest?.generation === generation) {
        this.activeRequest.qrInFlight = false;
      }
    }
  }

  private async poll(generation: number) {
    const activeRequest = this.activeRequest;
    const channel = activeRequest?.channel;
    if (
      !this.isCurrent(generation)
      || !activeRequest
      || activeRequest.pollInFlight
      || !channel
      || this.phase !== 'awaiting-approval'
    ) {
      return;
    }
    if (this.readNow() >= activeRequest.expiresAt) {
      this.expire(generation);
      return;
    }

    activeRequest.pollInFlight = true;
    try {
      const authority = await this.getAuthority();
      if (!this.isCurrent(generation)) {
        return;
      }
      const status = await authority.getStatus(channel.channelToken);
      if (!this.isCurrent(generation)) {
        return;
      }
      if (this.readNow() >= activeRequest.expiresAt) {
        this.expire(generation);
        return;
      }

      if (status.nonce !== channel.nonce) {
        this.fail(generation, undefined, invalidStatusError);
        return;
      }

      if (status.state === 'pending') {
        activeRequest.pollInFlight = false;
        this.schedulePoll(generation);
        return;
      }

      this.phase = 'verifying';
      this.dispatch({ type: 'verifying', generation });
      const identity = await authority.verifyCompletedRequest({
        nonce: channel.nonce,
        requestId: channel.requestId,
        domain: channel.domain,
        siweUri: channel.siweUri,
        createdAt: channel.createdAt,
        expiresAt: channel.expiresAt
      }, status);
      if (!this.isCurrent(generation)) {
        return;
      }
      if (this.readNow() >= activeRequest.expiresAt) {
        this.expire(generation);
        return;
      }
      if (!isUsableVerifiedIdentity(identity)) {
        this.fail(generation, undefined, invalidStatusError);
        return;
      }

      // The relay's FID is never allowed to replace the independently
      // verified identity. A disagreement fails before any proof reaches the
      // bridge.
      if (identity.fid !== status.fid) {
        this.fail(generation, undefined, invalidStatusError);
        return;
      }

      const bridgeClient = await this.getBridgeClient();
      if (!this.isCurrent(generation)) {
        return;
      }
      const bridgeSession = await bridgeClient.exchangeCompletedSignIn({
        message: status.message,
        signature: status.signature,
        nonce: channel.nonce,
        fid: identity.fid,
        requestId: channel.requestId,
        domain: channel.domain,
        siweUri: channel.siweUri,
        expirationTime: new Date(channel.expiresAt).toISOString(),
        expiresAt: channel.expiresAt,
        identity: {
          fid: identity.fid,
          ...(identity.username === undefined ? {} : { username: identity.username }),
          ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
          ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl })
        }
      });
      if (!this.isCurrent(generation)) {
        return;
      }
      const parsedBridgeSession = validateFarcasterOidcSessionForIdentity(
        bridgeSession,
        identity.fid,
        { now: Math.floor(this.readNow()) }
      );
      if (!parsedBridgeSession) {
        this.fail(generation, undefined, invalidStatusError);
        return;
      }

      this.finish(generation, 'authenticated', {
        type: 'authenticated',
        generation,
        identity,
        assurance: 'bridge-oidc-alpha',
        expiresAt: parsedBridgeSession.session.expiresAt
      }, parsedBridgeSession.session);
    } catch (error) {
      this.fail(generation, error);
    } finally {
      if (this.activeRequest?.generation === generation) {
        this.activeRequest.pollInFlight = false;
      }
    }
  }

  private readonly reconcileAfterFarcasterReturn = () => {
    const activeRequest = this.activeRequest;
    const channel = activeRequest?.channel;
    if (!activeRequest || !channel || this.phase !== 'awaiting-approval') {
      return;
    }
    if (this.isDocumentHidden()) {
      this.clearPollTimer();
      return;
    }
    if (this.readNow() >= activeRequest.expiresAt) {
      this.expire(activeRequest.generation);
      return;
    }
    if (!activeRequest.pollInFlight) {
      this.clearPollTimer();
      void this.poll(activeRequest.generation);
    }
  };

  private readonly handleVisibilityChange = () => {
    if (this.isDocumentHidden()) {
      this.clearPollTimer();
      return;
    }
    this.reconcileAfterFarcasterReturn();
  };
}

const FarcasterAuthReactContext = createContext<FarcasterAuthControllerValue | undefined>(
  undefined
);

export function FarcasterAuthProvider({
  children,
  loadAuthority = getDefaultFarcasterSessionAuthority,
  loadBridgeClient = getDefaultFarcasterOidcBridgeClient,
  resolveAuthContext = getBrowserFarcasterAuthContext,
  encodeQrCode = defaultEncodeQrCode,
  now = Date.now,
  pollIntervalMs,
  deviceSessionEnvironment
}: FarcasterAuthProviderProps) {
  const initialRememberedSessionRef = useRef<
    FarcasterRememberedDeviceSession | null | undefined
  >(undefined);
  if (initialRememberedSessionRef.current === undefined) {
    initialRememberedSessionRef.current = restoreFarcasterRememberedDeviceSession({
      ...deviceSessionEnvironment,
      now
    }) ?? null;
  }
  const initialRememberedSession = initialRememberedSessionRef.current ?? undefined;
  const [machine, dispatch] = useReducer(
    farcasterAuthMachineReducer,
    rememberedMachineSession(initialRememberedSession),
    createFarcasterAuthMachineState
  );
  const [oidcSession, setOidcSession] = useState<FarcasterOidcSession | undefined>(() => {
    const remembered = initialRememberedSessionRef.current ?? undefined;
    initialRememberedSessionRef.current = null;
    return remembered ? toFarcasterOidcSession(remembered) : undefined;
  });
  const [rememberDevice, setRememberDeviceState] = useState(true);
  const [hasRememberedDevice, setHasRememberedDevice] = useState(Boolean(initialRememberedSession));
  const controllerRef = useRef<FarcasterAuthController | undefined>(undefined);
  const machineRef = useRef(machine);
  const rememberDeviceRef = useRef(rememberDevice);
  const oidcSessionRef = useRef(oidcSession);
  const sessionOriginRef = useRef<'live' | 'restored' | undefined>(
    initialRememberedSession ? 'restored' : undefined
  );
  machineRef.current = machine;
  rememberDeviceRef.current = rememberDevice;
  oidcSessionRef.current = oidcSession;

  const clearRememberedDevice = useCallback(() => {
    clearFarcasterRememberedDeviceSession({ ...deviceSessionEnvironment, now });
    setHasRememberedDevice(false);
  }, [deviceSessionEnvironment, now]);

  const clearInMemoryAuthoritativeSession = useCallback(() => {
    sessionOriginRef.current = undefined;
    oidcSessionRef.current = undefined;
    setOidcSession(undefined);
  }, []);

  const clearLocalAuthoritativeSession = useCallback(() => {
    clearRememberedDevice();
    clearInMemoryAuthoritativeSession();
  }, [clearInMemoryAuthoritativeSession, clearRememberedDevice]);

  const clearAuthoritativeSession = useCallback(() => {
    clearLocalAuthoritativeSession();
    signalFarcasterSessionTermination({ ...deviceSessionEnvironment, now });
  }, [clearLocalAuthoritativeSession, deviceSessionEnvironment, now]);

  const persistBridgeSession = useCallback((
    identity: VerifiedFarcasterIdentity,
    session: FarcasterOidcSession
  ) => {
    sessionOriginRef.current = 'live';
    setOidcSession(session);
    if (!rememberDeviceRef.current) {
      clearRememberedDevice();
      return;
    }
    const rememberedSession = persistFarcasterRememberedDeviceSession(identity, session, {
      ...deviceSessionEnvironment,
      now
    });
    setHasRememberedDevice(Boolean(rememberedSession));
  }, [clearRememberedDevice, deviceSessionEnvironment, now]);

  const config: ControllerConfig = {
    loadAuthority,
    loadBridgeClient,
    resolveAuthContext,
    encodeQrCode,
    now,
    pollIntervalMs: normalizePollInterval(pollIntervalMs),
    onBridgeAuthenticated: persistBridgeSession,
    onSignOut: clearAuthoritativeSession
  };

  if (!controllerRef.current) {
    controllerRef.current = new FarcasterAuthController(dispatch, config);
  }
  const controller = controllerRef.current;
  controller.configure(config);
  controller.syncMachineState(machine);

  useEffect(() => controller.mount(), [controller]);

  const setRememberDevice = useCallback((remember: boolean) => {
    const nextValue = Boolean(remember);
    setRememberDeviceState(nextValue);
    if (!nextValue) {
      clearRememberedDevice();
      return;
    }

    const current = machineRef.current.view;
    const currentOidcSession = oidcSessionRef.current;
    if (
      current.phase === 'authenticated'
      && current.assurance === 'bridge-oidc-alpha'
      && currentOidcSession
    ) {
      const session = persistFarcasterRememberedDeviceSession(
        current.identity,
        currentOidcSession,
        {
          ...deviceSessionEnvironment,
          now
        }
      );
      setHasRememberedDevice(Boolean(session));
    }
  }, [clearRememberedDevice, deviceSessionEnvironment, now]);

  useEffect(() => {
    const current = machine.view;
    if (
      current.phase !== 'authenticated'
      || current.assurance !== 'bridge-oidc-alpha'
      || current.expiresAt === undefined
    ) {
      return undefined;
    }
    const expireRememberedSession = () => {
      clearAuthoritativeSession();
      dispatch({ type: 'sign-out', generation: machine.generation });
    };
    if (typeof window === 'undefined') {
      expireRememberedSession();
      return undefined;
    }
    let timer: number | undefined;
    const scheduleExpiryCheck = () => {
      const currentTime = readProviderNow(now);
      const delay = currentTime === undefined ? Number.NaN : current.expiresAt! - currentTime;
      if (!Number.isFinite(delay) || delay <= 0) {
        expireRememberedSession();
        return;
      }
      timer = window.setTimeout(() => {
        timer = undefined;
        scheduleExpiryCheck();
      }, Math.min(delay, MAX_BROWSER_TIMER_DELAY_MS));
    };
    scheduleExpiryCheck();
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [clearAuthoritativeSession, machine, now]);

  useEffect(() => {
    const current = machine.view;
    if (
      typeof document === 'undefined'
      || current.phase !== 'authenticated'
      || current.assurance !== 'bridge-oidc-alpha'
      || current.expiresAt === undefined
    ) {
      return undefined;
    }

    const reconcileRememberedExpiry = () => {
      if (document.hidden) {
        return;
      }
      const currentTime = readProviderNow(now);
      if (currentTime !== undefined && currentTime >= current.expiresAt!) {
        clearAuthoritativeSession();
        dispatch({ type: 'sign-out', generation: machine.generation });
      }
    };

    document.addEventListener('visibilitychange', reconcileRememberedExpiry);
    window.addEventListener('focus', reconcileRememberedExpiry);
    reconcileRememberedExpiry();
    return () => {
      document.removeEventListener('visibilitychange', reconcileRememberedExpiry);
      window.removeEventListener('focus', reconcileRememberedExpiry);
    };
  }, [clearAuthoritativeSession, machine, now]);

  useEffect(() => {
    const key = getFarcasterDeviceSessionStorageKey(deviceSessionEnvironment?.basePath);
    const legacyKey = getLegacyFarcasterDeviceSessionStorageKey(deviceSessionEnvironment?.basePath);
    const controlKey = getFarcasterDeviceSessionControlKey(deviceSessionEnvironment?.basePath);
    if (typeof window === 'undefined' || !key) {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === controlKey && event.newValue !== null) {
        const current = machineRef.current;
        clearLocalAuthoritativeSession();
        if (
          current.view.phase === 'authenticated'
          && current.view.assurance === 'bridge-oidc-alpha'
        ) {
          dispatch({ type: 'sign-out', generation: current.generation });
        }
        return;
      }
      if (event.key !== null && event.key !== key && event.key !== legacyKey) {
        return;
      }
      const restored = restoreFarcasterRememberedDeviceSession({
        ...deviceSessionEnvironment,
        now
      });
      const current = machineRef.current;
      if (!restored) {
        setHasRememberedDevice(false);
        if (
          current.view.phase === 'authenticated'
          && current.view.assurance === 'bridge-oidc-alpha'
          && sessionOriginRef.current === 'restored'
        ) {
          clearInMemoryAuthoritativeSession();
          dispatch({ type: 'sign-out', generation: current.generation });
        }
        return;
      }

      setHasRememberedDevice(true);
      if (
        current.view.phase === 'authenticated'
        && current.view.assurance === 'bridge-oidc-alpha'
        && restored.identity.fid !== current.view.identity.fid
      ) {
        clearInMemoryAuthoritativeSession();
        dispatch({ type: 'sign-out', generation: current.generation });
        return;
      }
      if (current.view.phase === 'anonymous') {
        const restoredSession = rememberedMachineSession(restored);
        if (restoredSession) {
          sessionOriginRef.current = 'restored';
          setOidcSession(toFarcasterOidcSession(restored));
          dispatch({
            type: 'restore',
            identity: restoredSession.identity,
            expiresAt: restoredSession.expiresAt
          });
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [clearInMemoryAuthoritativeSession, clearLocalAuthoritativeSession, deviceSessionEnvironment, now]);

  const value = useMemo<FarcasterAuthControllerValue>(() => ({
    state: machine.view,
    oidcSession,
    beginSignIn: controller.beginSignIn,
    cancelSignIn: controller.cancelSignIn,
    retrySignIn: controller.retrySignIn,
    prepareQrCode: controller.prepareQrCode,
    signOut: controller.signOut,
    rememberDevice,
    setRememberDevice,
    hasRememberedDevice
  }), [
    controller,
    hasRememberedDevice,
    machine.view,
    oidcSession,
    rememberDevice,
    setRememberDevice
  ]);

  return (
    <FarcasterAuthReactContext.Provider value={value}>
      {children}
    </FarcasterAuthReactContext.Provider>
  );
}

export function useFarcasterAuth() {
  const context = useContext(FarcasterAuthReactContext);
  if (!context) {
    throw new Error('useFarcasterAuth must be used within FarcasterAuthProvider.');
  }
  return context;
}
