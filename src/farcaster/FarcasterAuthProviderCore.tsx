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
  FARCASTER_AUTH_REQUEST_TTL_MS,
  getBrowserFarcasterAuthContext
} from './farcasterAuthContext';
import {
  FARCASTER_BROWSER_BINDING_METHOD,
  isCanonicalFarcasterBrowserBindingValue
} from './farcasterBrowserBinding';
import { parseFarcasterOidcJwt } from './farcasterOidcSession';
import { useAccessRequest } from './useAccessRequest';
import {
  clearFarcasterPresentationSession,
  persistFarcasterPresentationSession,
  readFarcasterPresentationSession
} from './farcasterPresentationSession';
import type {
  FarcasterAuthError,
  FarcasterAuthEntryStage,
  AccessRequestViewState,
  FarcasterAuthContext,
  FarcasterAuthPhase,
  FarcasterAuthViewState,
  FarcasterBrowserBinding,
  FarcasterBrowserBindingFactory,
  FarcasterBridgeSessionResponse,
  FarcasterOidcBridgeClient,
  FarcasterOidcBridgeFailureKind,
  FarcasterOidcSession,
  FarcasterQuickAuthSessionResponse,
  FarcasterQuickAuthTokenOptions,
  FarcasterQuickAuthTokenResult,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  PublicFarcasterIdentity,
  VerifiedFarcasterIdentity
} from './farcasterAuthTypes';

export const FARCASTER_AUTH_POLL_INTERVAL_MS = 1_500;
const MAX_BROWSER_TIMER_DELAY_MS = 2_147_000_000;

export type FarcasterAuthorityLoader = () => Promise<FarcasterSessionAuthority>;
export type FarcasterOidcBridgeLoader = () => Promise<FarcasterOidcBridgeClient>;
export type FarcasterQuickAuthTokenLoader = (
  options?: FarcasterQuickAuthTokenOptions
) => Promise<FarcasterQuickAuthTokenResult>;
export type FarcasterQrEncoder = (channelUrl: string) => Promise<string>;
export type FarcasterAuthErrorNormalizer = (error: unknown) => FarcasterAuthError;
export type FarcasterBridgeFailureClassifier = (
  error: unknown
) => FarcasterOidcBridgeFailureKind | null;

const NO_BRIDGE_FAILURE_CLASSIFICATION: FarcasterBridgeFailureClassifier = () => null;

export type FarcasterAuthProviderCoreProps = Readonly<{
  children: ReactNode;
  loadAuthority: FarcasterAuthorityLoader;
  loadBridgeClient: FarcasterOidcBridgeLoader;
  /** Present only after the host adapter proves an actual Mini App runtime. */
  loadQuickAuthToken?: FarcasterQuickAuthTokenLoader;
  /** Untrusted host presentation fields; retained only for a bridge-verified same FID. */
  quickAuthPresentationIdentity?: FarcasterRelayDisplayIdentity;
  normalizeAuthError: FarcasterAuthErrorNormalizer;
  /** Concrete transport details stay outside the full-stack auth core. */
  classifyBridgeFailure?: FarcasterBridgeFailureClassifier;
  /** Kept injectable so a challenge and SIWF request share one exact context. */
  resolveAuthContext?: () => FarcasterAuthContext;
  encodeQrCode: FarcasterQrEncoder;
  /** Generates the one-request browser-held S256 verifier in private memory. */
  createBrowserBinding: FarcasterBrowserBindingFactory;
  now?: () => number;
  pollIntervalMs?: number;
  /** Injection seam for storage-denied and cross-tab lifecycle tests. */
  deviceSessionEnvironment?: FarcasterDeviceSessionEnvironment;
}>;

export type FarcasterAuthControllerValue = Readonly<{
  state: FarcasterAuthViewState;
  accessRequest: AccessRequestViewState;
  /** Bearer material is intentionally separate from presentation state. */
  oidcSession: FarcasterOidcSession | undefined;
  /**
   * From an explicit player gesture, try only the existing HttpOnly session
   * family while anonymous. This never clears logout intent or starts SIWF.
   */
  restoreSession: () => Promise<boolean>;
  beginSignIn: () => void;
  cancelSignIn: () => void;
  retrySignIn: () => void;
  prepareQrCode: () => void;
  refreshSession: () => void;
  requestAccess: () => boolean;
  retryAccessRequestStatus: () => void;
  signOut: () => void;
  rememberDevice: boolean;
  setRememberDevice: (remember: boolean) => void;
}>;

type ControllerConfig = {
  loadAuthority: FarcasterAuthorityLoader;
  loadBridgeClient: FarcasterOidcBridgeLoader;
  normalizeAuthError: FarcasterAuthErrorNormalizer;
  resolveAuthContext: () => FarcasterAuthContext;
  encodeQrCode: FarcasterQrEncoder;
  createBrowserBinding: FarcasterBrowserBindingFactory;
  now: () => number;
  pollIntervalMs: number;
  rememberDevice: () => boolean;
  persistPresentationIdentity: (
    identity: FarcasterRelayDisplayIdentity,
    sessionExpiresAt: number
  ) => void;
  clearPresentationSession: () => void;
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
const QUICK_AUTH_PENDING_PRESENTATION_TTL_MS = 5 * 60 * 1_000;

class FarcasterQuickAuthPipelineError extends Error {
  override readonly name = 'FarcasterQuickAuthPipelineError';

  constructor(readonly publicError: FarcasterAuthError) {
    super(publicError.message);
  }
}

function quickAuthPublicError(
  code: FarcasterAuthError['code'],
  stage: FarcasterAuthEntryStage,
  message: string
): FarcasterAuthError {
  return Object.freeze({ code, stage, message });
}

function quickAuthTokenFailure(
  result: unknown
): FarcasterAuthError {
  const status = isRecord(result) && typeof result.status === 'string'
    ? result.status
    : 'invalid-shape';
  if (status === 'unsupported') {
    return quickAuthPublicError(
      'unknown',
      'quick_auth_api_missing',
      'This Farcaster client does not offer secure Mini App sign-in.'
    );
  }
  if (status === 'timeout') {
    return quickAuthPublicError(
      'network',
      'quick_auth_token_timeout',
      'Farcaster did not finish secure sign-in in time.'
    );
  }
  if (status === 'invalid-shape') {
    return quickAuthPublicError(
      'invalid-response',
      'quick_auth_token_invalid_shape',
      'Farcaster returned an invalid secure sign-in response.'
    );
  }
  if (status === 'host-replaced') {
    return quickAuthPublicError(
      'cancelled',
      'quick_auth_host_replaced',
      'The Farcaster Mini App changed while sign-in was in progress.'
    );
  }
  return quickAuthPublicError(
    'verification',
    'quick_auth_token_rejected',
    'Farcaster could not approve secure Mini App sign-in.'
  );
}

function quickAuthBridgeFailure(
  error: unknown,
  classifyBridgeFailure: FarcasterBridgeFailureClassifier
): FarcasterAuthError | undefined {
  const kind = classifyBridgeFailure(error);
  if (!kind) return undefined;
  if (kind === 'invalid-credential') {
    return quickAuthPublicError(
      'verification',
      'bridge_http_401',
      'The current Farcaster Mini App session was not accepted.'
    );
  }
  if (kind === 'forbidden') {
    return quickAuthPublicError(
      'bridge',
      'bridge_http_403',
      'This secure Warpkeep release could not complete sign-in.'
    );
  }
  if (kind === 'rate-limited') {
    return quickAuthPublicError(
      'bridge',
      'bridge_http_429',
      'Secure sign-in is temporarily busy.'
    );
  }
  if (kind === 'service-unavailable') {
    return quickAuthPublicError(
      'bridge',
      'bridge_http_503',
      'Secure sign-in is temporarily unavailable.'
    );
  }
  if (kind === 'timeout') {
    return quickAuthPublicError(
      'network',
      'bridge_exchange_timeout',
      'Warpkeep did not finish secure verification in time.'
    );
  }
  if (kind === 'network-or-cors') {
    return quickAuthPublicError(
      'network',
      'bridge_network_failed',
      'Warpkeep could not reach secure verification.'
    );
  }
  if (kind === 'configuration') {
    return quickAuthPublicError(
      'bridge',
      'deployment_contract_mismatch',
      'This Warpkeep release does not match secure verification.'
    );
  }
  if (kind === 'invalid-response') {
    return quickAuthPublicError(
      'invalid-response',
      'bridge_response_invalid',
      'Warpkeep received an invalid secure verification response.'
    );
  }
  if (kind === 'cancelled') {
    return quickAuthPublicError(
      'cancelled',
      'stale_result_discarded',
      'Secure sign-in was cancelled safely.'
    );
  }
  return quickAuthPublicError(
    'bridge',
    'bridge_response_invalid',
    'Warpkeep could not confirm secure sign-in.'
  );
}

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

type FarcasterRelayDisplayIdentity = Pick<
  VerifiedFarcasterIdentity,
  'fid' | 'username' | 'displayName' | 'pfpUrl'
>;

/**
 * Project a signature-verified FID plus sanitized, non-authoritative relay
 * display metadata. Verification addresses and methods stay out of React.
 */
function toPublicPostSignatureIdentity(
  identity: VerifiedFarcasterIdentity
): PublicFarcasterIdentity {
  return Object.freeze({
    fid: identity.fid,
    ...(identity.username === undefined ? {} : { username: identity.username }),
    ...(identity.displayName === undefined
      ? {}
      : { displayName: identity.displayName }),
    ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl }),
    verifications: Object.freeze([]) as readonly [],
    verifiedAt: identity.verifiedAt
  });
}

/**
 * Retain sanitized, non-authoritative relay presentation metadata only when
 * the bridge confirms the same FID. The bridge, token, and database stay
 * FID-only.
 */
function withSameFidRelayDisplayMetadata(
  authoritativeIdentity: VerifiedFarcasterIdentity,
  displayIdentity: FarcasterRelayDisplayIdentity | undefined
): VerifiedFarcasterIdentity {
  if (!displayIdentity || displayIdentity.fid !== authoritativeIdentity.fid) {
    return authoritativeIdentity;
  }
  return Object.freeze({
    ...authoritativeIdentity,
    ...(displayIdentity.username === undefined ? {} : { username: displayIdentity.username }),
    ...(displayIdentity.displayName === undefined
      ? {}
      : { displayName: displayIdentity.displayName }),
    ...(displayIdentity.pfpUrl === undefined ? {} : { pfpUrl: displayIdentity.pfpUrl })
  });
}

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

type MaterializedQuickAuthSession =
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

function materializeQuickAuthSession(
  response: FarcasterQuickAuthSessionResponse,
  now: number,
  issuer: string,
  audience: string
): MaterializedQuickAuthSession | undefined {
  if (!Number.isSafeInteger(now) || now < 0 || !isRecord(response) || response.version !== 2) {
    return undefined;
  }
  const identity = verifiedBridgeIdentity(response.identity, now);
  if (!identity) return undefined;

  if (response.status === 'pending-admission') {
    if (!hasExactKeys(response, ['version', 'status', 'identity'])) {
      return undefined;
    }
    return Object.freeze({
      status: 'pending-admission',
      identity,
      // This is a presentation/retry window, never backend authority.
      sessionExpiresAt: now + QUICK_AUTH_PENDING_PRESENTATION_TTL_MS
    });
  }

  if (
    response.status !== 'authorized'
    || !hasExactKeys(response, [
      'version',
      'status',
      'identity',
      'accessToken',
      'tokenType',
      'accessExpiresAt'
    ])
    || response.tokenType !== 'spacetime-access'
    || !Number.isSafeInteger(response.accessExpiresAt)
    || response.accessExpiresAt <= now
    || response.accessExpiresAt - now > SERVER_SESSION_MAX_TTL_MS
  ) {
    return undefined;
  }
  const parsed = parseFarcasterOidcJwt(response.accessToken, {
    issuer,
    audience,
    now
  });
  if (
    !parsed
    || parsed.claims.fid !== identity.fid
    || parsed.session.expiresAt !== response.accessExpiresAt
  ) {
    return undefined;
  }
  return Object.freeze({
    status: 'authorized',
    identity,
    session: parsed.session,
    // Quick Auth deliberately has no durable browser session family.
    sessionExpiresAt: parsed.session.expiresAt
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
    const publicError = override ?? this.config.normalizeAuthError(error);
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

      // This is the earliest safe point for profile presentation: the signed
      // request and FID have both been independently verified. Proof and
      // address material remain outside React state.
      this.dispatch({
        type: 'identity-verified',
        generation,
        identity: toPublicPostSignatureIdentity(identity)
      });

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
        this.config.clearPresentationSession();
        this.fail(generation, undefined, invalidStatusError);
        return;
      }
      const presentedIdentity = withSameFidRelayDisplayMetadata(
        resolvedSession.identity,
        identity
      );
      // A fresh verified relay result replaces any older tab presentation.
      // Cache restoration is reserved for a validated cookie refresh.
      this.config.clearPresentationSession();
      this.config.persistPresentationIdentity(
        presentedIdentity,
        resolvedSession.sessionExpiresAt
      );
      if (resolvedSession.status === 'pending-admission') {
        this.finish(generation, 'pending-admission', {
          type: 'pending-admission',
          generation,
          identity: presentedIdentity,
          sessionExpiresAt: resolvedSession.sessionExpiresAt
        });
      } else {
        this.finish(generation, 'authenticated', {
          type: 'authenticated',
          generation,
          identity: presentedIdentity,
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

export function FarcasterAuthProviderCore({
  children,
  loadAuthority,
  loadBridgeClient,
  loadQuickAuthToken,
  quickAuthPresentationIdentity,
  normalizeAuthError,
  classifyBridgeFailure = NO_BRIDGE_FAILURE_CLASSIFICATION,
  resolveAuthContext = getBrowserFarcasterAuthContext,
  encodeQrCode,
  createBrowserBinding,
  now = Date.now,
  pollIntervalMs,
  deviceSessionEnvironment
}: FarcasterAuthProviderCoreProps) {
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
  const logoutIntentReadyRef = useRef(false);
  // Cookie authority is fail closed until the exact logout-control record has
  // been checked. Only an explicit, externally consent-gated auth activation
  // clears it; passive lifecycle events never activate an anonymous session.
  const logoutIntentBlocksRefreshRef = useRef(true);
  const refreshFlightRef = useRef<{
    controller: AbortController;
    promise: Promise<boolean>;
    clearOnFailure: boolean;
  } | undefined>(undefined);
  const quickAuthFlightRef = useRef<{
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

  const clearPresentationSession = useCallback(() => {
    clearFarcasterPresentationSession({ ...deviceSessionEnvironment, now });
  }, [deviceSessionEnvironment, now]);

  const resolveCachedPresentationIdentity = useCallback((
    authoritativeIdentity: VerifiedFarcasterIdentity,
    sessionExpiresAt: number
  ) => {
    const cachedIdentity = readFarcasterPresentationSession({
      ...deviceSessionEnvironment,
      now
    });
    const sameFidCachedIdentity = cachedIdentity?.fid === authoritativeIdentity.fid
      && cachedIdentity.expiresAt <= sessionExpiresAt
      ? cachedIdentity
      : undefined;
    if (cachedIdentity && !sameFidCachedIdentity) {
      clearPresentationSession();
    }
    return withSameFidRelayDisplayMetadata(authoritativeIdentity, sameFidCachedIdentity);
  }, [clearPresentationSession, deviceSessionEnvironment, now]);

  const persistPresentationIdentity = useCallback((
    identity: FarcasterRelayDisplayIdentity,
    sessionExpiresAt: number
  ) => {
    const currentTime = readProviderNow(now);
    const hasDisplayMetadata = identity.username !== undefined
      || identity.displayName !== undefined
      || identity.pfpUrl !== undefined;
    if (
      !hasDisplayMetadata
      || currentTime === undefined
      || !Number.isSafeInteger(sessionExpiresAt)
      || sessionExpiresAt <= currentTime
      || sessionExpiresAt - currentTime > SERVER_SESSION_MAX_TTL_MS
    ) {
      return;
    }
    persistFarcasterPresentationSession({
      fid: identity.fid,
      ...(identity.username === undefined ? {} : { username: identity.username }),
      ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
      ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl }),
      expiresAt: sessionExpiresAt
    }, {
      ...deviceSessionEnvironment,
      now
    });
  }, [deviceSessionEnvironment, now]);

  const abortRefresh = useCallback(() => {
    lifecycleGenerationRef.current += 1;
    refreshFlightRef.current?.controller.abort();
    refreshFlightRef.current = undefined;
    quickAuthFlightRef.current?.controller.abort();
    quickAuthFlightRef.current = undefined;
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
    clearPresentationSession();
    if (signalTabs) {
      signalFarcasterSessionTermination({ ...deviceSessionEnvironment, now });
    }
  }, [
    abortRefresh,
    clearInMemoryAuthoritativeSession,
    clearPresentationSession,
    deviceSessionEnvironment,
    now,
    purgeBearerStorage
  ]);

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
    // Prefer display metadata already held inside this provider lifetime. A
    // cold cookie restoration may consult the tab cache only after the bridge
    // response has been validated below; cached FID never constrains authority.
    const existingDisplayIdentity = viewAtRefreshStart.phase === 'authenticated'
      || viewAtRefreshStart.phase === 'pending-admission'
      ? viewAtRefreshStart.identity
      : undefined;
    const expectedFid = existingDisplayIdentity?.fid;
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
        if (!resolved) {
          clearPresentationSession();
          throw new Error('Invalid refreshed session.');
        }
        const presentedIdentity = existingDisplayIdentity
          ? withSameFidRelayDisplayMetadata(resolved.identity, existingDisplayIdentity)
          : resolveCachedPresentationIdentity(
              resolved.identity,
              resolved.sessionExpiresAt
            );

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
            identity: presentedIdentity,
            sessionExpiresAt: resolved.sessionExpiresAt
          });
        } else {
          oidcSessionRef.current = resolved.session;
          setOidcSession(resolved.session);
          dispatch({
            type: 'session-authorized',
            generation: machineGeneration,
            identity: presentedIdentity,
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
  }, [
    clearInMemoryAuthoritativeSession,
    clearLocalAuthoritativeSession,
    clearPresentationSession,
    loadBridgeClient,
    now,
    resolveCachedPresentationIdentity
  ]);

  const activateQuickAuth = useCallback((
    clearOnFailure = false,
    showProgress = false
  ) => {
    if (!loadQuickAuthToken || logoutIntentBlocksRefreshRef.current) {
      return Promise.resolve(false);
    }
    const existing = quickAuthFlightRef.current;
    if (existing) {
      if (clearOnFailure) existing.clearOnFailure = true;
      return existing.promise;
    }

    const lifecycleGeneration = lifecycleGenerationRef.current;
    const viewAtStart = machineRef.current.view;
    const startsVisibleAttempt = showProgress && canBeginFrom(viewAtStart.phase);
    const machineGeneration = startsVisibleAttempt
      ? machineRef.current.generation + 1
      : machineRef.current.generation;
    if (startsVisibleAttempt) {
      dispatch({ type: 'begin', generation: machineGeneration });
    }

    const controller = new AbortController();
    let flight: NonNullable<typeof quickAuthFlightRef.current>;
    const promise = Promise.resolve()
      .then(async () => {
        try {
          return await loadBridgeClient();
        } catch (error) {
          const classified = quickAuthBridgeFailure(
            error,
            classifyBridgeFailure
          );
          throw new FarcasterQuickAuthPipelineError(
            classified ?? quickAuthPublicError(
              'bridge',
              'bridge_client_unavailable',
              'Warpkeep could not prepare secure verification.'
            )
          );
        }
      })
      .then(async (client) => {
        if (
          controller.signal.aborted
          || lifecycleGenerationRef.current !== lifecycleGeneration
        ) {
          return undefined;
        }

        if (typeof client.exchangeQuickAuth !== 'function') {
          throw new FarcasterQuickAuthPipelineError(quickAuthPublicError(
            'bridge',
            'deployment_contract_mismatch',
            'This Warpkeep release does not support secure Mini App sign-in.'
          ));
        }

        const exchangeOnce = async (force: boolean) => {
          if (
            controller.signal.aborted
            || lifecycleGenerationRef.current !== lifecycleGeneration
          ) {
            return undefined;
          }
          const acquisition = await loadQuickAuthToken(
            force ? { force: true } : undefined
          );
          if (
            controller.signal.aborted
            || lifecycleGenerationRef.current !== lifecycleGeneration
          ) {
            return undefined;
          }
          if (
            !isRecord(acquisition)
            || acquisition.status !== 'token'
            || typeof acquisition.token !== 'string'
            || acquisition.token.length === 0
          ) {
            throw new FarcasterQuickAuthPipelineError(
              quickAuthTokenFailure(acquisition)
            );
          }

          let token = acquisition.token;
          try {
            return await client.exchangeQuickAuth!(token, {
              signal: controller.signal
            });
          } finally {
            token = '';
          }
        };

        try {
          const response = await exchangeOnce(false);
          return response ? { client, response } : undefined;
        } catch (error) {
          // A definitive rejection may describe an SDK-cached bearer. Acquire
          // and exchange one forced-fresh token; every other failure stops.
          if (classifyBridgeFailure(error) !== 'invalid-credential') {
            throw error;
          }
          const response = await exchangeOnce(true);
          return response ? { client, response } : undefined;
        }
      })
      .then((result) => {
        if (
          controller.signal.aborted
          || lifecycleGenerationRef.current !== lifecycleGeneration
        ) {
          return false;
        }
        // A visible Mini App launch attempt must always settle. A host that
        // returns no bearer, or a bridge client without Quick Auth support,
        // is an authentication failure rather than an indefinite spinner.
        if (!result) {
          throw new Error('Quick Auth is unavailable.');
        }
        const currentTime = readProviderNow(now);
        if (currentTime === undefined) {
          throw new FarcasterQuickAuthPipelineError(quickAuthPublicError(
            'invalid-response',
            'client_clock_invalid',
            'This device could not provide a usable clock for secure sign-in.'
          ));
        }
        const resolved = materializeQuickAuthSession(
          result.response,
          currentTime,
          result.client.issuer,
          result.client.audience
        );
        if (!resolved) {
          throw new FarcasterQuickAuthPipelineError(quickAuthPublicError(
            'invalid-response',
            'access_token_invalid',
            'Warpkeep could not validate the secure access session.'
          ));
        }

        const currentView = machineRef.current.view;
        const currentIdentity = currentView.phase === 'authenticated'
          || currentView.phase === 'pending-admission'
          ? currentView.identity
          : undefined;
        if (currentIdentity && currentIdentity.fid !== resolved.identity.fid) {
          // A host account switch invalidates old private authority before the
          // new verified FID is presented.
          clearInMemoryAuthoritativeSession();
          clearPresentationSession();
        }
        const presentedIdentity = withSameFidRelayDisplayMetadata(
          resolved.identity,
          quickAuthPresentationIdentity
        );

        if (resolved.status === 'pending-admission') {
          clearInMemoryAuthoritativeSession();
          dispatch({
            type: 'session-pending',
            generation: machineGeneration,
            identity: presentedIdentity,
            sessionExpiresAt: resolved.sessionExpiresAt
          });
        } else {
          oidcSessionRef.current = resolved.session;
          setOidcSession(resolved.session);
          dispatch({
            type: 'session-authorized',
            generation: machineGeneration,
            identity: presentedIdentity,
            expiresAt: resolved.session.expiresAt,
            sessionExpiresAt: resolved.sessionExpiresAt
          });
        }
        return true;
      })
      .catch((error) => {
        if (
          controller.signal.aborted
          || lifecycleGenerationRef.current !== lifecycleGeneration
        ) {
          return false;
        }
        if (startsVisibleAttempt) {
          const publicError = error instanceof FarcasterQuickAuthPipelineError
            ? error.publicError
            : quickAuthBridgeFailure(error, classifyBridgeFailure)
              ?? normalizeAuthError(error);
          dispatch({
            type: 'failed',
            generation: machineGeneration,
            error: publicError
          });
        }
        if (flight.clearOnFailure) {
          const currentTime = readProviderNow(now);
          const currentSession = oidcSessionRef.current;
          if (
            currentTime === undefined
            || !currentSession
            || currentTime >= currentSession.expiresAt
          ) {
            const current = machineRef.current;
            clearLocalAuthoritativeSession(false);
            if (
              current.view.phase === 'authenticated'
              || current.view.phase === 'pending-admission'
            ) {
              dispatch({
                type: 'sign-out',
                generation: current.generation
              });
            }
          }
        }
        return false;
      })
      .finally(() => {
        if (quickAuthFlightRef.current === flight) {
          quickAuthFlightRef.current = undefined;
        }
      });
    flight = { controller, promise, clearOnFailure };
    quickAuthFlightRef.current = flight;
    return promise;
  }, [
    clearInMemoryAuthoritativeSession,
    clearLocalAuthoritativeSession,
    clearPresentationSession,
    classifyBridgeFailure,
    loadBridgeClient,
    loadQuickAuthToken,
    normalizeAuthError,
    now,
    quickAuthPresentationIdentity
  ]);

  const refreshAuthoritySession = useCallback((
    clearOnFailure = false,
    showProgress = false
  ) => loadQuickAuthToken
    ? activateQuickAuth(clearOnFailure, showProgress)
    : refreshSession(clearOnFailure), [
    activateQuickAuth,
    loadQuickAuthToken,
    refreshSession
  ]);

  const config: ControllerConfig = {
    loadAuthority,
    loadBridgeClient,
    normalizeAuthError,
    resolveAuthContext,
    encodeQrCode,
    createBrowserBinding,
    now,
    pollIntervalMs: normalizePollInterval(pollIntervalMs),
    rememberDevice: () => rememberDeviceRef.current,
    persistPresentationIdentity,
    clearPresentationSession,
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

    // An explicit web retry follows a failed/expired SIWF generation. Mini App
    // retries instead reacquire a fresh Quick Auth bearer below.
    if (
      !loadQuickAuthToken
      && (phase === 'error' || phase === 'expired')
    ) {
      controller.retrySignIn();
      return;
    }

    const activationGeneration = authActivationGenerationRef.current + 1;
    authActivationGenerationRef.current = activationGeneration;
    beginExplicitAuthActivation();

    let activation: Promise<void>;
    activation = (
      loadQuickAuthToken
        ? activateQuickAuth(false, true)
        : refreshSession(false)
    ).then((restored) => {
        if (
          authActivationGenerationRef.current !== activationGeneration
          || restored
          || loadQuickAuthToken
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
  }, [
    activateQuickAuth,
    beginExplicitAuthActivation,
    controller,
    loadQuickAuthToken,
    refreshSession
  ]);

  const cancelConsentGatedSignIn = useCallback(() => {
    const cancelledAuthPreflight = authActivationFlightRef.current !== undefined;
    invalidateAuthActivation();
    const cancelledControllerRequest = controller.cancelSignIn();
    if (cancelledAuthPreflight && !cancelledControllerRequest) {
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
      void refreshAuthoritySession(false);
    }
  }, [refreshAuthoritySession]);

  const restoreSession = useCallback(() => {
    if (
      machineRef.current.view.phase !== 'anonymous'
      || authActivationFlightRef.current !== undefined
    ) {
      return Promise.resolve(false);
    }
    // Unlike beginConsentGatedSignIn, this deliberately does not call
    // beginExplicitAuthActivation: an active or unavailable logout-control
    // record stays fail-closed, and a missing cookie never falls through to
    // SIWF channel or QR creation.
    return refreshAuthoritySession(false, true);
  }, [refreshAuthoritySession]);

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

  const accessRequest = useAccessRequest({
    authState: machine.view,
    authGeneration: machine.generation,
    loadBridgeClient,
    loadQuickAuthToken,
    onAuthenticationIdentityChanged: () => {
      clearInMemoryAuthoritativeSession();
      void refreshAuthoritySession(true);
    }
  });

  useEffect(() => {
    purgeBearerStorage();
    const terminationStatus = readFarcasterSessionTerminationIntent({
      ...deviceSessionEnvironment,
      now
    });
    logoutIntentBlocksRefreshRef.current = terminationStatus !== 'absent'
      && terminationStatus !== 'stale';
    logoutIntentReadyRef.current = true;
    return abortRefresh;
  }, [abortRefresh, deviceSessionEnvironment, now, purgeBearerStorage]);

  useEffect(() => {
    if (loadQuickAuthToken) return;
    quickAuthFlightRef.current?.controller.abort();
    quickAuthFlightRef.current = undefined;
  }, [loadQuickAuthToken]);

  useEffect(() => {
    if (
      !loadQuickAuthToken
      || !logoutIntentReadyRef.current
      || logoutIntentBlocksRefreshRef.current
      || machineRef.current.view.phase !== 'anonymous'
    ) {
      return;
    }
    void activateQuickAuth(false, true);
  }, [activateQuickAuth, loadQuickAuthToken]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const reconcile = () => {
      if (document.hidden) return;
      const current = machineRef.current.view;
      const currentSession = oidcSessionRef.current;
      const currentTime = readProviderNow(now);
      // Farcaster can switch the host account while this WebView is
      // backgrounded. Re-verify Quick Auth on every foreground return; the
      // coalesced flight prevents focus/pageshow/visibility bursts from
      // producing duplicate exchanges.
      const shouldRefresh = loadQuickAuthToken
        ? current.phase === 'pending-admission' || current.phase === 'authenticated'
        : current.phase === 'pending-admission'
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
      if (shouldRefresh) {
        if (loadQuickAuthToken) {
          // Host account state may have changed while the WebView was hidden.
          // Freeze private commands before acquiring and verifying a fresh host
          // bearer; the retained Realm projection remains public/read-only.
          clearInMemoryAuthoritativeSession();
        }
        void refreshAuthoritySession(Boolean(loadQuickAuthToken));
      }
    };
    window.addEventListener('focus', reconcile);
    window.addEventListener('pageshow', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('pageshow', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [
    clearInMemoryAuthoritativeSession,
    loadQuickAuthToken,
    now,
    refreshAuthoritySession
  ]);

  useEffect(() => {
    if (!oidcSession || typeof window === 'undefined') return undefined;
    const currentTime = readProviderNow(now);
    if (currentTime === undefined || currentTime >= oidcSession.expiresAt) {
      clearInMemoryAuthoritativeSession();
      void refreshAuthoritySession(true);
      return undefined;
    }
    const refreshDelay = Math.max(0, oidcSession.expiresAt - currentTime - ACCESS_REFRESH_LEAD_MS);
    const expiryDelay = oidcSession.expiresAt - currentTime;
    const refreshTimer = window.setTimeout(() => {
      void refreshAuthoritySession(false);
    }, Math.min(refreshDelay, MAX_BROWSER_TIMER_DELAY_MS));
    const expiryTimer = window.setTimeout(() => {
      clearInMemoryAuthoritativeSession();
      void refreshAuthoritySession(true);
    }, Math.min(expiryDelay, MAX_BROWSER_TIMER_DELAY_MS));
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(expiryTimer);
    };
  }, [
    clearInMemoryAuthoritativeSession,
    now,
    oidcSession,
    refreshAuthoritySession
  ]);

  useEffect(() => {
    const current = machine.view;
    const sessionExpiresAt = current.phase === 'authenticated' || current.phase === 'pending-admission'
      ? current.sessionExpiresAt
      : undefined;
    // An authenticated Quick Auth session has the same absolute deadline as
    // its in-memory OIDC token. The OIDC lifecycle above exclusively clears
    // and refreshes it so a duplicate generic timer cannot abort that flight.
    // Pending Quick Auth has no backend authority; its presentation deadline
    // below reacquires through the same coalesced Quick Auth flight.
    if (loadQuickAuthToken && current.phase === 'authenticated') return undefined;
    if (sessionExpiresAt === undefined || typeof window === 'undefined') return undefined;

    let timer: number | undefined;
    const schedule = () => {
      const currentTime = readProviderNow(now);
      const delay = currentTime === undefined ? Number.NaN : sessionExpiresAt - currentTime;
      if (!Number.isFinite(delay) || delay <= 0) {
        const latest = machineRef.current;
        if (loadQuickAuthToken) {
          if (latest.view.phase === 'pending-admission') {
            void refreshAuthoritySession(true);
          }
          return;
        }
        clearLocalAuthoritativeSession(!loadQuickAuthToken);
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
  }, [
    clearLocalAuthoritativeSession,
    loadQuickAuthToken,
    machine.view,
    now,
    refreshAuthoritySession
  ]);

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
    accessRequest: accessRequest.state,
    oidcSession,
    restoreSession,
    beginSignIn: beginConsentGatedSignIn,
    cancelSignIn: cancelConsentGatedSignIn,
    retrySignIn: beginConsentGatedSignIn,
    prepareQrCode: controller.prepareQrCode,
    refreshSession: refreshActiveSession,
    requestAccess: accessRequest.requestAccess,
    retryAccessRequestStatus: accessRequest.retryStatus,
    signOut,
    rememberDevice,
    setRememberDevice
  }), [
    beginConsentGatedSignIn,
    cancelConsentGatedSignIn,
    controller,
    accessRequest,
    machine.view,
    oidcSession,
    refreshActiveSession,
    rememberDevice,
    restoreSession,
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
