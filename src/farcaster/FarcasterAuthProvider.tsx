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
  getFarcasterDeviceSessionStorageKey,
  persistFarcasterRememberedDeviceSession,
  restoreFarcasterRememberedDeviceSession,
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
import { FARCASTER_AUTH_REQUEST_TTL_MS } from './farcasterAuthContext';
import type {
  FarcasterAuthError,
  FarcasterAuthPhase,
  FarcasterAuthViewState,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from './farcasterAuthTypes';

export const FARCASTER_AUTH_POLL_INTERVAL_MS = 1_500;

export type FarcasterAuthorityLoader = () => Promise<FarcasterSessionAuthority>;
export type FarcasterQrEncoder = (channelUrl: string) => Promise<string>;

export type FarcasterAuthProviderProps = Readonly<{
  children: ReactNode;
  loadAuthority?: FarcasterAuthorityLoader;
  encodeQrCode?: FarcasterQrEncoder;
  now?: () => number;
  pollIntervalMs?: number;
  /** Injection seam for storage-denied and cross-tab lifecycle tests. */
  deviceSessionEnvironment?: FarcasterDeviceSessionEnvironment;
}>;

export type FarcasterAuthControllerValue = Readonly<{
  state: FarcasterAuthViewState;
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
  encodeQrCode: FarcasterQrEncoder;
  now: () => number;
  pollIntervalMs: number;
  onLiveAuthenticated: (identity: VerifiedFarcasterIdentity) => void;
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
    action: FarcasterAuthMachineAction
  ) {
    if (!this.isCurrent(generation)) {
      return;
    }
    if (action.type === 'authenticated') {
      this.config.onLiveAuthenticated(action.identity);
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
    try {
      authority = await this.getAuthority();
      if (!this.isCurrent(generation)) {
        return;
      }
    } catch (error) {
      this.fail(generation, error);
      return;
    }

    let channel: FarcasterSignInChannel;
    try {
      channel = await authority.beginSignIn();
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

      this.finish(generation, 'authenticated', {
        type: 'authenticated',
        generation,
        identity,
        assurance: 'live-client-verified'
      });
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
  encodeQrCode = defaultEncodeQrCode,
  now = Date.now,
  pollIntervalMs,
  deviceSessionEnvironment
}: FarcasterAuthProviderProps) {
  const [initialRememberedSession] = useState(() => (
    restoreFarcasterRememberedDeviceSession({ ...deviceSessionEnvironment, now })
  ));
  const [machine, dispatch] = useReducer(
    farcasterAuthMachineReducer,
    rememberedMachineSession(initialRememberedSession),
    createFarcasterAuthMachineState
  );
  const [rememberDevice, setRememberDeviceState] = useState(true);
  const [hasRememberedDevice, setHasRememberedDevice] = useState(Boolean(initialRememberedSession));
  const controllerRef = useRef<FarcasterAuthController | undefined>(undefined);
  const machineRef = useRef(machine);
  const rememberDeviceRef = useRef(rememberDevice);
  machineRef.current = machine;
  rememberDeviceRef.current = rememberDevice;

  const clearRememberedDevice = useCallback(() => {
    clearFarcasterRememberedDeviceSession({ ...deviceSessionEnvironment, now });
    setHasRememberedDevice(false);
  }, [deviceSessionEnvironment, now]);

  const persistLiveIdentity = useCallback((identity: VerifiedFarcasterIdentity) => {
    if (!rememberDeviceRef.current) {
      clearFarcasterRememberedDeviceSession({ ...deviceSessionEnvironment, now });
      setHasRememberedDevice(false);
      return;
    }
    const session = persistFarcasterRememberedDeviceSession(identity, {
      ...deviceSessionEnvironment,
      now
    });
    setHasRememberedDevice(Boolean(session));
  }, [deviceSessionEnvironment, now]);

  const config: ControllerConfig = {
    loadAuthority,
    encodeQrCode,
    now,
    pollIntervalMs: normalizePollInterval(pollIntervalMs),
    onLiveAuthenticated: persistLiveIdentity,
    onSignOut: clearRememberedDevice
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
    if (current.phase === 'authenticated') {
      const session = persistFarcasterRememberedDeviceSession(current.identity, {
        ...deviceSessionEnvironment,
        now
      });
      setHasRememberedDevice(Boolean(session));
    }
  }, [clearRememberedDevice, deviceSessionEnvironment, now]);

  useEffect(() => {
    const current = machine.view;
    if (
      current.phase !== 'authenticated'
      || current.assurance !== 'remembered-device-prototype'
      || current.expiresAt === undefined
    ) {
      return undefined;
    }
    const currentTime = readProviderNow(now);
    const delay = currentTime === undefined ? Number.NaN : current.expiresAt - currentTime;
    const expireRememberedSession = () => {
      clearRememberedDevice();
      dispatch({ type: 'sign-out', generation: machine.generation });
    };
    if (!Number.isFinite(delay) || delay <= 0 || typeof window === 'undefined') {
      expireRememberedSession();
      return undefined;
    }
    const timer = window.setTimeout(expireRememberedSession, delay);
    return () => window.clearTimeout(timer);
  }, [clearRememberedDevice, machine, now]);

  useEffect(() => {
    const current = machine.view;
    if (
      typeof document === 'undefined'
      || current.phase !== 'authenticated'
      || current.assurance !== 'remembered-device-prototype'
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
        clearRememberedDevice();
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
  }, [clearRememberedDevice, machine, now]);

  useEffect(() => {
    const key = getFarcasterDeviceSessionStorageKey(deviceSessionEnvironment?.basePath);
    if (typeof window === 'undefined' || !key) {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) {
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
          && current.view.assurance === 'remembered-device-prototype'
        ) {
          dispatch({ type: 'sign-out', generation: current.generation });
        }
        return;
      }

      setHasRememberedDevice(true);
      if (current.view.phase === 'anonymous') {
        const restoredSession = rememberedMachineSession(restored);
        if (restoredSession) {
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
  }, [deviceSessionEnvironment, now]);

  const value = useMemo<FarcasterAuthControllerValue>(() => ({
    state: machine.view,
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
