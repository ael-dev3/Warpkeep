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
  FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS,
  clearFarcasterSessionTerminationIntent,
  getFarcasterDeviceSessionControlKey,
  purgeFarcasterBrowserBearerStorage,
  readFarcasterSessionTerminationIntent,
  signalFarcasterSessionTermination,
  type FarcasterDeviceSessionEnvironment
} from './farcasterDeviceSession';
import {
  createFarcasterAuthMachineState,
  farcasterAuthMachineReducer,
  type FarcasterAuthMachineAction,
  type FarcasterAuthMachineState
} from './farcasterAuthMachine';
import {
  getDefaultFarcasterSessionAuthority,
  toFarcasterAuthError
} from './farcasterAuthClient';
import {
  FARCASTER_AUTH_REQUEST_TTL_MS,
  getBrowserFarcasterAuthContext
} from './farcasterAuthContext';
import {
  FARCASTER_BROWSER_BINDING_METHOD,
  createFarcasterBrowserBinding,
  isCanonicalFarcasterBrowserBindingValue
} from './farcasterBrowserBinding';
import { getDefaultFarcasterOidcBridgeClient } from './farcasterOidcBridgeClient';
import { parseFarcasterOidcJwt } from './farcasterOidcSession';
import type {
  FarcasterAuthError,
  FarcasterAuthContext,
  FarcasterAuthPhase,
  FarcasterAuthViewState,
  FarcasterBrowserBinding,
  FarcasterBrowserBindingFactory,
  FarcasterBridgeSessionResponse,
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
  /** Generates the one-request browser-held S256 verifier in private memory. */
  createBrowserBinding?: FarcasterBrowserBindingFactory;
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
  refreshSession: () => void;
  signOut: () => void;
  rememberDevice: boolean;
  setRememberDevice: (remember: boolean) => void;
}>;

type ControllerConfig = {
  loadAuthority: FarcasterAuthorityLoader;
  loadBridgeClient: FarcasterOidcBridgeLoader;
  resolveAuthContext: () => FarcasterAuthContext;
  encodeQrCode: FarcasterQrEncoder;
  createBrowserBinding: FarcasterBrowserBindingFactory;
  now: () => number;
  pollIntervalMs: number;
  rememberDevice: () => boolean;
  onBeginSignIn: () => void;
  onBridgeAuthorized: (session: FarcasterOidcSession) => void;
  onBridgePending: () => void;
  onSignOut: () => void;
};

type ActiveRequest = {
  generation: number;
  expiresAt: number;
  abortController: AbortController;
  channel?: FarcasterSignInChannel;
  pollInFlight: boolean;
  qrInFlight: boolean;
  bindingVerifier?: string;
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

const SERVER_SESSION_MAX_TTL_MS = FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS;
const ACCESS_REFRESH_LEAD_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function verifiedBridgeIdentity(
  value: unknown,
  verifiedAt: number
): VerifiedFarcasterIdentity | undefined {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['fid'])
    || typeof value.fid !== 'number'
    || !Number.isSafeInteger(value.fid)
    || value.fid <= 0
  ) {
    return undefined;
  }
  return Object.freeze({
    fid: value.fid,
    verifications: Object.freeze([]),
    verifiedAt
  });
}

type MaterializedBridgeSession =
  | Readonly<{
      status: 'authorized';
      identity: VerifiedFarcasterIdentity;
      session: FarcasterOidcSession;
      sessionExpiresAt: number;
    }>
  | Readonly<{
      status: 'pending-admission';
      identity: VerifiedFarcasterIdentity;
      sessionExpiresAt: number;
    }>;

function materializeBridgeSession(
  response: FarcasterBridgeSessionResponse,
  now: number,
  issuer: string,
  audience: string,
  expectedFid?: number
): MaterializedBridgeSession | undefined {
  if (!Number.isSafeInteger(now) || now < 0 || !isRecord(response) || response.version !== 2) {
    return undefined;
  }
  const identity = verifiedBridgeIdentity(response.identity, now);
  if (
    !identity
    || (expectedFid !== undefined && identity.fid !== expectedFid)
    || !Number.isSafeInteger(response.sessionExpiresAt)
    || response.sessionExpiresAt <= now
    || response.sessionExpiresAt - now > SERVER_SESSION_MAX_TTL_MS
  ) {
    return undefined;
  }
  if (response.status === 'pending-admission') {
    if (!hasExactKeys(response, ['version', 'status', 'identity', 'sessionExpiresAt'])) {
      return undefined;
    }
    return Object.freeze({
      status: 'pending-admission',
      identity,
      sessionExpiresAt: response.sessionExpiresAt
    });
  }
  if (
    response.status !== 'authorized'
    || !hasExactKeys(response, [
      'version', 'status', 'identity', 'sessionExpiresAt', 'accessToken', 'tokenType', 'accessExpiresAt'
    ])
    || response.tokenType !== 'spacetime-access'
    || !Number.isSafeInteger(response.accessExpiresAt)
    || response.accessExpiresAt <= now
    || response.accessExpiresAt > response.sessionExpiresAt
  ) {
    return undefined;
  }
  const parsed = parseFarcasterOidcJwt(response.accessToken, {
    issuer,
    audience,
    now
  });
  if (!parsed || parsed.claims.fid !== identity.fid || parsed.session.expiresAt !== response.accessExpiresAt) {
    return undefined;
  }
  return Object.freeze({
    status: 'authorized',
    identity,
    session: parsed.session,
    sessionExpiresAt: response.sessionExpiresAt
  });
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

    this.config.onBeginSignIn();
    const generation = this.nextGeneration();
    const expiresAt = this.readNow() + FARCASTER_AUTH_REQUEST_TTL_MS;
    this.activeRequest = {
      generation,
      expiresAt,
      abortController: new AbortController(),
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
      return false;
    }

    const generation = this.activeRequest?.generation ?? this.machineGeneration;
    // A verifying exchange can have committed its HttpOnly family before the
    // aborted fetch result reaches JavaScript. Treat every explicit cancel as
    // session termination so no landed/stale cookie can silently resume later.
    this.config.onSignOut();
    this.invalidatePrivateRequest();
    this.phase = 'anonymous';
    this.dispatch({ type: 'cancel', generation });
    return true;
  };

  readonly signOut = () => {
    if (
      !this.mounted
      || (this.phase !== 'authenticated' && this.phase !== 'pending-admission')
    ) {
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
    const activeRequest = this.activeRequest;
    this.activeRequest = undefined;
    if (activeRequest) {
      activeRequest.bindingVerifier = undefined;
      activeRequest.abortController.abort();
    }
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
    phase: 'authenticated' | 'pending-admission' | 'expired' | 'error',
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
      this.config.onBridgeAuthorized(oidcSession);
    } else if (action.type === 'pending-admission') {
      this.config.onBridgePending();
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
    let binding: FarcasterBrowserBinding | undefined;
    try {
      binding = await this.config.createBrowserBinding();
      if (
        !this.isCurrent(generation)
        || binding.method !== FARCASTER_BROWSER_BINDING_METHOD
        || !isCanonicalFarcasterBrowserBindingValue(binding.verifier)
        || !isCanonicalFarcasterBrowserBindingValue(binding.challenge)
      ) {
        if (this.isCurrent(generation)) {
          throw new Error('Farcaster browser binding is unavailable.');
        }
        return;
      }
      const activeRequest = this.activeRequest;
      if (!activeRequest || activeRequest.generation !== generation) {
        return;
      }
      activeRequest.bindingVerifier = binding.verifier;
      const challengeRequest = {
        domain: context.domain,
        siweUri: context.siweUri,
        bindingChallenge: binding.challenge,
        bindingMethod: binding.method
      };
      binding = undefined;
      const challenge = await bridgeClient.createChallenge(challengeRequest, {
        signal: activeRequest.abortController.signal
      });
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
    } finally {
      binding = undefined;
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
      const bindingVerifier = activeRequest.bindingVerifier;
      if (!isCanonicalFarcasterBrowserBindingValue(bindingVerifier)) {
        this.fail(generation, undefined, invalidStatusError);
        return;
      }
      activeRequest.bindingVerifier = undefined;
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
        bindingVerifier,
        rememberDevice: this.config.rememberDevice(),
        identity: { fid: identity.fid }
      }, {
        signal: activeRequest.abortController.signal
      });
      if (!this.isCurrent(generation)) {
        return;
      }
      const resolvedSession = materializeBridgeSession(
        bridgeSession,
        Math.floor(this.readNow()),
        bridgeClient.issuer,
        bridgeClient.audience,
        identity.fid
      );
      if (!resolvedSession) {
        this.fail(generation, undefined, invalidStatusError);
        return;
      }
      if (resolvedSession.status === 'pending-admission') {
        this.finish(generation, 'pending-admission', {
          type: 'pending-admission',
          generation,
          identity: resolvedSession.identity,
          sessionExpiresAt: resolvedSession.sessionExpiresAt
        });
      } else {
        this.finish(generation, 'authenticated', {
          type: 'authenticated',
          generation,
          identity: resolvedSession.identity,
          assurance: 'bridge-oidc-alpha',
          expiresAt: resolvedSession.session.expiresAt,
          sessionExpiresAt: resolvedSession.sessionExpiresAt
        }, resolvedSession.session);
      }
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
  createBrowserBinding = createFarcasterBrowserBinding,
  now = Date.now,
  pollIntervalMs,
  deviceSessionEnvironment
}: FarcasterAuthProviderProps) {
  const [machine, dispatch] = useReducer(
    farcasterAuthMachineReducer,
    undefined,
    createFarcasterAuthMachineState
  );
  const [oidcSession, setOidcSession] = useState<FarcasterOidcSession | undefined>();
  const [rememberDevice, setRememberDeviceState] = useState(false);
  const controllerRef = useRef<FarcasterAuthController | undefined>(undefined);
  const machineRef = useRef(machine);
  const rememberDeviceRef = useRef(rememberDevice);
  const oidcSessionRef = useRef(oidcSession);
  const lifecycleGenerationRef = useRef(0);
  const authActivationGenerationRef = useRef(0);
  const authActivationFlightRef = useRef<Promise<void> | undefined>(undefined);
  // Cookie authority is fail closed until the exact logout-control record has
  // been checked. Only an explicit, externally consent-gated auth activation
  // clears it; passive lifecycle events never activate an anonymous session.
  const logoutIntentBlocksRefreshRef = useRef(true);
  const refreshFlightRef = useRef<{
    controller: AbortController;
    promise: Promise<boolean>;
    clearOnFailure: boolean;
  } | undefined>(undefined);
  machineRef.current = machine;
  rememberDeviceRef.current = rememberDevice;
  oidcSessionRef.current = oidcSession;

  const purgeBearerStorage = useCallback(() => {
    purgeFarcasterBrowserBearerStorage({ ...deviceSessionEnvironment, now });
  }, [deviceSessionEnvironment, now]);

  const abortRefresh = useCallback(() => {
    lifecycleGenerationRef.current += 1;
    refreshFlightRef.current?.controller.abort();
    refreshFlightRef.current = undefined;
  }, []);

  const invalidateAuthActivation = useCallback(() => {
    authActivationGenerationRef.current += 1;
    authActivationFlightRef.current = undefined;
    abortRefresh();
  }, [abortRefresh]);

  const clearInMemoryAuthoritativeSession = useCallback(() => {
    oidcSessionRef.current = undefined;
    setOidcSession(undefined);
  }, []);

  const clearLocalAuthoritativeSession = useCallback((signalTabs = false) => {
    if (signalTabs) logoutIntentBlocksRefreshRef.current = true;
    abortRefresh();
    clearInMemoryAuthoritativeSession();
    purgeBearerStorage();
    if (signalTabs) {
      signalFarcasterSessionTermination({ ...deviceSessionEnvironment, now });
    }
  }, [abortRefresh, clearInMemoryAuthoritativeSession, deviceSessionEnvironment, now, purgeBearerStorage]);

  const beginExplicitAuthActivation = useCallback(() => {
    abortRefresh();
    logoutIntentBlocksRefreshRef.current = false;
    // If storage is denied, this runtime still honors the explicit sign-in.
    // A later context where storage becomes available cannot recover a tombstone
    // that was never durably written; server-side revocation remains authoritative.
    clearFarcasterSessionTerminationIntent({ ...deviceSessionEnvironment, now });
  }, [abortRefresh, deviceSessionEnvironment, now]);

  const onBridgeAuthorized = useCallback((session: FarcasterOidcSession) => {
    oidcSessionRef.current = session;
    setOidcSession(session);
  }, []);

  const onBridgePending = useCallback(() => {
    clearInMemoryAuthoritativeSession();
  }, [clearInMemoryAuthoritativeSession]);

  const onSignOut = useCallback(() => {
    clearLocalAuthoritativeSession(true);
    void Promise.resolve()
      .then(() => loadBridgeClient())
      .then((client) => client.logoutSession())
      .catch(() => {
        // Local logout is immediate; an unavailable server endpoint is best effort.
      });
  }, [clearLocalAuthoritativeSession, loadBridgeClient]);

  const refreshSession = useCallback((clearOnFailure = false) => {
    if (logoutIntentBlocksRefreshRef.current) return Promise.resolve(false);
    const existing = refreshFlightRef.current;
    if (existing) {
      if (clearOnFailure) existing.clearOnFailure = true;
      return existing.promise;
    }

    const generation = lifecycleGenerationRef.current;
    const machineGeneration = machineRef.current.generation;
    const viewAtRefreshStart = machineRef.current.view;
    const expectedFid = viewAtRefreshStart.phase === 'authenticated'
      || viewAtRefreshStart.phase === 'pending-admission'
      ? viewAtRefreshStart.identity.fid
      : undefined;
    const controller = new AbortController();
    let flight: NonNullable<typeof refreshFlightRef.current>;
    const promise = Promise.resolve()
      .then(() => loadBridgeClient())
      .then(async (client) => {
        if (controller.signal.aborted || lifecycleGenerationRef.current !== generation) {
          return undefined;
        }
        return {
          client,
          response: await client.refreshSession({ signal: controller.signal })
        };
      })
      .then((result) => {
        if (!result) return false;
        const { client, response } = result;
        if (controller.signal.aborted || lifecycleGenerationRef.current !== generation) {
          return false;
        }
        const currentTime = readProviderNow(now);
        const resolved = currentTime === undefined
          ? undefined
          : materializeBridgeSession(
              response,
              currentTime,
              client.issuer,
              client.audience,
              expectedFid
            );
        if (!resolved) throw new Error('Invalid refreshed session.');

        const currentPhase = machineRef.current.view.phase;
        if (
          currentPhase !== 'anonymous'
          && currentPhase !== 'authenticated'
          && currentPhase !== 'pending-admission'
        ) {
          return false;
        }

        if (resolved.status === 'pending-admission') {
          clearInMemoryAuthoritativeSession();
          dispatch({
            type: 'session-pending',
            generation: machineGeneration,
            identity: resolved.identity,
            sessionExpiresAt: resolved.sessionExpiresAt
          });
        } else {
          oidcSessionRef.current = resolved.session;
          setOidcSession(resolved.session);
          dispatch({
            type: 'session-authorized',
            generation: machineGeneration,
            identity: resolved.identity,
            expiresAt: resolved.session.expiresAt,
            sessionExpiresAt: resolved.sessionExpiresAt
          });
        }
        return true;
      })
      .catch(() => {
        if (
          !controller.signal.aborted
          && lifecycleGenerationRef.current === generation
          && flight.clearOnFailure
        ) {
          const currentTime = readProviderNow(now);
          const currentSession = oidcSessionRef.current;
          if (currentTime === undefined || !currentSession || currentTime >= currentSession.expiresAt) {
            const current = machineRef.current;
            clearLocalAuthoritativeSession(true);
            if (current.view.phase === 'authenticated' || current.view.phase === 'pending-admission') {
              dispatch({ type: 'sign-out', generation: current.generation });
            }
          }
        }
        return false;
      })
      .finally(() => {
        if (refreshFlightRef.current === flight) refreshFlightRef.current = undefined;
      });
    flight = { controller, promise, clearOnFailure };
    refreshFlightRef.current = flight;
    return promise;
  }, [clearInMemoryAuthoritativeSession, clearLocalAuthoritativeSession, loadBridgeClient, now]);

  const config: ControllerConfig = {
    loadAuthority,
    loadBridgeClient,
    resolveAuthContext,
    encodeQrCode,
    createBrowserBinding,
    now,
    pollIntervalMs: normalizePollInterval(pollIntervalMs),
    rememberDevice: () => rememberDeviceRef.current,
    onBeginSignIn: beginExplicitAuthActivation,
    onBridgeAuthorized,
    onBridgePending,
    onSignOut
  };

  if (!controllerRef.current) {
    controllerRef.current = new FarcasterAuthController(dispatch, config);
  }
  const controller = controllerRef.current;
  controller.configure(config);
  controller.syncMachineState(machine);

  const beginConsentGatedSignIn = useCallback(() => {
    const phase = machineRef.current.view.phase;
    if (authActivationFlightRef.current || !canBeginFrom(phase)) {
      return;
    }

    // An explicit retry follows a failed/expired SIWF generation. It still
    // requires the external Terms gate, but must not probe a cookie before
    // creating the fresh request the player asked for.
    if (phase === 'error' || phase === 'expired') {
      controller.retrySignIn();
      return;
    }

    const activationGeneration = authActivationGenerationRef.current + 1;
    authActivationGenerationRef.current = activationGeneration;
    beginExplicitAuthActivation();

    let activation: Promise<void>;
    activation = refreshSession(false)
      .then((restored) => {
        if (
          authActivationGenerationRef.current !== activationGeneration
          || restored
        ) {
          return;
        }
        controller.beginSignIn();
      })
      .finally(() => {
        if (authActivationFlightRef.current === activation) {
          authActivationFlightRef.current = undefined;
        }
      });
    authActivationFlightRef.current = activation;
  }, [beginExplicitAuthActivation, controller, refreshSession]);

  const cancelConsentGatedSignIn = useCallback(() => {
    const cancelledCookiePreflight = authActivationFlightRef.current !== undefined;
    invalidateAuthActivation();
    const cancelledControllerRequest = controller.cancelSignIn();
    if (cancelledCookiePreflight && !cancelledControllerRequest) {
      // The refresh request may have reached the bridge before AbortSignal was
      // observed. Terminate any family it could have rotated so Cancel cannot
      // leave resumable server authority behind.
      onSignOut();
    }
  }, [controller, invalidateAuthActivation, onSignOut]);

  const signOut = useCallback(() => {
    invalidateAuthActivation();
    controller.signOut();
  }, [controller, invalidateAuthActivation]);

  const refreshActiveSession = useCallback(() => {
    const phase = machineRef.current.view.phase;
    if (phase === 'authenticated' || phase === 'pending-admission') {
      void refreshSession(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    const unmountController = controller.mount();
    return () => {
      invalidateAuthActivation();
      unmountController();
    };
  }, [controller, invalidateAuthActivation]);

  const setRememberDevice = useCallback((remember: boolean) => {
    setRememberDeviceState(Boolean(remember));
  }, []);

  useEffect(() => {
    purgeBearerStorage();
    const terminationStatus = readFarcasterSessionTerminationIntent({
      ...deviceSessionEnvironment,
      now
    });
    logoutIntentBlocksRefreshRef.current = terminationStatus !== 'absent'
      && terminationStatus !== 'stale';
    return abortRefresh;
  }, [abortRefresh, deviceSessionEnvironment, now, purgeBearerStorage]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const reconcile = () => {
      if (document.hidden) return;
      const current = machineRef.current.view;
      const currentSession = oidcSessionRef.current;
      const currentTime = readProviderNow(now);
      const shouldRefresh = current.phase === 'pending-admission'
        || (
          current.phase === 'authenticated'
          && (
            !currentSession
            || (
              currentTime !== undefined
              && currentSession.expiresAt - currentTime <= ACCESS_REFRESH_LEAD_MS
            )
          )
        );
      if (shouldRefresh) void refreshSession(false);
    };
    window.addEventListener('focus', reconcile);
    window.addEventListener('pageshow', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('pageshow', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [now, refreshSession]);

  useEffect(() => {
    if (!oidcSession || typeof window === 'undefined') return undefined;
    const currentTime = readProviderNow(now);
    if (currentTime === undefined || currentTime >= oidcSession.expiresAt) {
      clearInMemoryAuthoritativeSession();
      void refreshSession(true);
      return undefined;
    }
    const refreshDelay = Math.max(0, oidcSession.expiresAt - currentTime - ACCESS_REFRESH_LEAD_MS);
    const expiryDelay = oidcSession.expiresAt - currentTime;
    const refreshTimer = window.setTimeout(() => {
      void refreshSession(false);
    }, Math.min(refreshDelay, MAX_BROWSER_TIMER_DELAY_MS));
    const expiryTimer = window.setTimeout(() => {
      clearInMemoryAuthoritativeSession();
      void refreshSession(true);
    }, Math.min(expiryDelay, MAX_BROWSER_TIMER_DELAY_MS));
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(expiryTimer);
    };
  }, [clearInMemoryAuthoritativeSession, now, oidcSession, refreshSession]);

  useEffect(() => {
    const current = machine.view;
    const sessionExpiresAt = current.phase === 'authenticated' || current.phase === 'pending-admission'
      ? current.sessionExpiresAt
      : undefined;
    if (sessionExpiresAt === undefined || typeof window === 'undefined') return undefined;

    let timer: number | undefined;
    const schedule = () => {
      const currentTime = readProviderNow(now);
      const delay = currentTime === undefined ? Number.NaN : sessionExpiresAt - currentTime;
      if (!Number.isFinite(delay) || delay <= 0) {
        const latest = machineRef.current;
        clearLocalAuthoritativeSession(true);
        if (latest.view.phase === 'authenticated' || latest.view.phase === 'pending-admission') {
          dispatch({ type: 'sign-out', generation: latest.generation });
        }
        return;
      }
      timer = window.setTimeout(schedule, Math.min(delay, MAX_BROWSER_TIMER_DELAY_MS));
    };
    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [clearLocalAuthoritativeSession, machine.view, now]);

  useEffect(() => {
    const controlKey = getFarcasterDeviceSessionControlKey(deviceSessionEnvironment?.basePath);
    if (typeof window === 'undefined' || !controlKey) return undefined;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== controlKey || event.newValue === null) return;
      const current = machineRef.current;
      logoutIntentBlocksRefreshRef.current = true;
      invalidateAuthActivation();
      controller.cancelSignIn();
      clearLocalAuthoritativeSession(false);
      if (current.view.phase === 'authenticated' || current.view.phase === 'pending-admission') {
        dispatch({ type: 'sign-out', generation: current.generation });
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [clearLocalAuthoritativeSession, controller, deviceSessionEnvironment?.basePath, invalidateAuthActivation]);

  const value = useMemo<FarcasterAuthControllerValue>(() => ({
    state: machine.view,
    oidcSession,
    beginSignIn: beginConsentGatedSignIn,
    cancelSignIn: cancelConsentGatedSignIn,
    retrySignIn: beginConsentGatedSignIn,
    prepareQrCode: controller.prepareQrCode,
    refreshSession: refreshActiveSession,
    signOut,
    rememberDevice,
    setRememberDevice
  }), [
    beginConsentGatedSignIn,
    cancelConsentGatedSignIn,
    controller,
    machine.view,
    oidcSession,
    refreshActiveSession,
    rememberDevice,
    setRememberDevice,
    signOut
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
