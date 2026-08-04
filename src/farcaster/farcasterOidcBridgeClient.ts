import {
  type AdmissionGrantAcknowledgementStatus,
  type AccessRequestAuthentication,
  type AccessRequestStatus,
  type FarcasterAdmissionGrantOptions,
  type FarcasterAccessRequestOptions,
  isBoundedFarcasterSignature,
  type FarcasterBridgeChallenge,
  type FarcasterBridgeChallengeRequest,
  type FarcasterBridgeExchangeRequest,
  type FarcasterBridgeRequestOptions,
  type FarcasterBridgeSessionIdentity,
  type FarcasterBridgeSessionResponse,
  type FarcasterOidcBridgeClient,
  type FarcasterOidcBridgeFailureKind,
  type FarcasterQuickAuthSessionResponse
} from './farcasterAuthTypes';
import {
  FARCASTER_BROWSER_BINDING_METHOD,
  isCanonicalFarcasterBrowserBindingValue
} from './farcasterBrowserBinding';
import {
  FARCASTER_OIDC_DEFAULT_AUDIENCE,
  parseFarcasterOidcJwt,
  readSafeFarcasterOidcAudience,
  readSafeFarcasterOidcIssuer
} from './farcasterOidcSession';
import {
  hasUsableWarpkeepBridge,
  readWarpkeepRuntimeConfig
} from '../spacetime/warpkeepConfig';

const MAX_RESPONSE_BYTES = 32_768;
const MAX_PROOF_MESSAGE_LENGTH = 8 * 1_024;
const MAX_QUICK_AUTH_TOKEN_BYTES = 8 * 1_024;
const BRIDGE_REQUEST_TIMEOUT_MS = 10_000;
const BRIDGE_EXCHANGE_TIMEOUT_MS = 20_000;
const BRIDGE_EXCHANGE_RETRY_DELAYS_MS = Object.freeze([250, 750] as const);
const FARCASTER_SERVER_SESSION_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const NONCE_PATTERN = /^[A-Za-z0-9]{8,128}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~-]{8,256}$/;
const COMPACT_JWT_PATTERN =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ADMISSION_GRANT_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ADMISSION_GRANT_NOTIFICATION_ID_PATTERN =
  /^warpkeep-access-grant-v3-i[A-Za-z0-9_-]{22}$/;
const RETRYABLE_EXCHANGE_ERROR_CODES = new Set([
  'challenge_unavailable',
  'binding_verification_unavailable',
  'verification_unavailable',
  'authorization_unavailable',
  'signing_unavailable'
]);
const ACCESS_EXPECTED_FID_HEADER = 'x-warpkeep-expected-fid';
const ACCESS_IDENTITY_CHANGED_ERROR_CODES = new Set(['access_identity_changed']);
const ACCESS_STATUS_IDENTITY_CHANGED_RESPONSES = new Map([
  [409, ACCESS_IDENTITY_CHANGED_ERROR_CODES]
] as const);
const DEFINITIVE_ACCESS_REQUEST_NO_MUTATION_CODES = new Map([
  [429, new Set(['rate_limited'])],
  [409, ACCESS_IDENTITY_CHANGED_ERROR_CODES]
] as const);

export type FarcasterOidcBridgeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type CreateFarcasterOidcBridgeClientOptions = Readonly<{
  bridgeUrl?: string;
  issuer?: string;
  audience?: string;
  /** Test/development-only escape hatch for a localhost Worker. */
  allowLocalHttp?: boolean;
  fetch?: FarcasterOidcBridgeFetch;
}>;

const bridgeFailureKinds = new WeakMap<Error, FarcasterOidcBridgeFailureKind>();

export type { FarcasterOidcBridgeFailureKind } from './farcasterAuthTypes';

export class FarcasterOidcBridgeClientError extends Error {
  override readonly name = 'FarcasterOidcBridgeClientError';

  constructor(message = 'The Hegemony verification service could not confirm this sign-in.') {
    super(message);
  }
}

function bridgeClientError(
  kind: FarcasterOidcBridgeFailureKind,
  message?: string
) {
  const error = new FarcasterOidcBridgeClientError(message);
  bridgeFailureKinds.set(error, kind);
  return error;
}

/** Returns only an allowlisted transport class; never a response body or URL. */
export function farcasterOidcBridgeFailureKind(
  error: unknown
): FarcasterOidcBridgeFailureKind | null {
  return error instanceof FarcasterOidcBridgeClientError
    ? bridgeFailureKinds.get(error) ?? 'unknown'
    : null;
}

const retryableExchangeErrors = new WeakSet<FarcasterOidcBridgeClientError>();
export type AccessRequestNoMutationReason = 'rate-limited' | 'identity-changed';

const definitiveAccessRequestNoMutationErrors = new WeakMap<
  FarcasterOidcBridgeClientError,
  AccessRequestNoMutationReason
>();

function createRetryableExchangeError() {
  const error = new FarcasterOidcBridgeClientError();
  retryableExchangeErrors.add(error);
  return error;
}

function createDefinitiveAccessRequestNoMutationError(
  reason: AccessRequestNoMutationReason
) {
  const error = new FarcasterOidcBridgeClientError();
  definitiveAccessRequestNoMutationErrors.set(error, reason);
  return error;
}

/** Returns a closed reason only for an exact pre-mutation bridge response. */
export function accessRequestNoMutationReason(
  error: unknown
): AccessRequestNoMutationReason | null {
  return error instanceof FarcasterOidcBridgeClientError
    ? definitiveAccessRequestNoMutationErrors.get(error) ?? null
    : null;
}

export function isDefinitiveAccessRequestNoMutationError(
  error: unknown
): boolean {
  return accessRequestNoMutationReason(error) !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function readSafeBridgeUrl(value: unknown, allowLocalHttp: boolean) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const isLocalHttp = allowLocalHttp
      && url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
    if (
      (url.protocol !== 'https:' && !isLocalHttp)
      || url.username !== ''
      || url.password !== ''
      || url.search !== ''
      || url.hash !== ''
    ) {
      return undefined;
    }
    return new URL(url.pathname.endsWith('/') ? url.toString() : `${url.toString()}/`);
  } catch {
    return undefined;
  }
}

function readSafeContext(
  request: Pick<FarcasterBridgeChallengeRequest, 'domain' | 'siweUri'>
) {
  if (typeof request.domain !== 'string' || request.domain === '' || /[\s/?#]/.test(request.domain)) {
    return undefined;
  }
  try {
    const uri = new URL(request.siweUri);
    if (
      (uri.protocol !== 'https:' && uri.protocol !== 'http:')
      || uri.host !== request.domain
      || uri.username !== ''
      || uri.password !== ''
      || uri.search !== ''
      || uri.hash !== ''
    ) {
      return undefined;
    }
    return Object.freeze({ domain: request.domain, siweUri: request.siweUri });
  } catch {
    return undefined;
  }
}

function readSafeChallenge(
  value: unknown,
  now: number,
  expectedContext: Pick<FarcasterBridgeChallengeRequest, 'domain' | 'siweUri'>
): FarcasterBridgeChallenge | undefined {
  if (
    !isRecord(value)
    || !hasOnlyAllowedKeys(value, [
      'nonce',
      'requestId',
      'createdAt',
      'expiresAt',
      'domain',
      'siweUri',
      'expirationTime'
    ])
    || typeof value.nonce !== 'string'
    || !NONCE_PATTERN.test(value.nonce)
    || typeof value.requestId !== 'string'
    || !REQUEST_ID_PATTERN.test(value.requestId)
    || typeof value.createdAt !== 'number'
    || !Number.isSafeInteger(value.createdAt)
    || typeof value.expiresAt !== 'number'
    || !Number.isSafeInteger(value.expiresAt)
    || value.createdAt > now + 60_000
    || value.expiresAt <= now
    || value.expiresAt <= value.createdAt
    || value.domain !== expectedContext.domain
    || value.siweUri !== expectedContext.siweUri
    || typeof value.expirationTime !== 'string'
    || Date.parse(value.expirationTime) !== value.expiresAt
  ) {
    return undefined;
  }
  return Object.freeze({
    nonce: value.nonce,
    requestId: value.requestId,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt
  });
}

function isSafeFid(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function readSafeExchangeBody(request: FarcasterBridgeExchangeRequest) {
  const context = readSafeContext(request);
  if (
    !context
    || typeof request.message !== 'string'
    || request.message.length === 0
    || request.message.length > MAX_PROOF_MESSAGE_LENGTH
    || !isBoundedFarcasterSignature(request.signature)
    || typeof request.nonce !== 'string'
    || !NONCE_PATTERN.test(request.nonce)
    || !isSafeFid(request.fid)
    || typeof request.requestId !== 'string'
    || !REQUEST_ID_PATTERN.test(request.requestId)
    || typeof request.expirationTime !== 'string'
    || !Number.isFinite(Date.parse(request.expirationTime))
    || typeof request.expiresAt !== 'number'
    || !Number.isSafeInteger(request.expiresAt)
    || request.expiresAt <= 0
    || Date.parse(request.expirationTime) !== request.expiresAt
    || !isCanonicalFarcasterBrowserBindingValue(request.bindingVerifier)
    || typeof request.rememberDevice !== 'boolean'
    || !isRecord(request.identity)
    || !isSafeFid(request.identity.fid)
    || request.identity.fid !== request.fid
  ) {
    return undefined;
  }

  // Construct the body field-by-field. Unknown caller properties, including a
  // maliciously injected channelToken or profile metadata, cannot cross this
  // private boundary.
  return {
    message: request.message,
    signature: request.signature,
    nonce: request.nonce,
    fid: request.fid,
    requestId: request.requestId,
    domain: context.domain,
    siweUri: context.siweUri,
    expirationTime: request.expirationTime,
    expiresAt: request.expiresAt,
    bindingVerifier: request.bindingVerifier,
    rememberDevice: request.rememberDevice,
    identity: { fid: request.identity.fid }
  };
}

function readSafeSessionIdentity(value: unknown): FarcasterBridgeSessionIdentity | undefined {
  if (
    !isRecord(value)
    || !hasOnlyAllowedKeys(value, ['fid'])
    || !isSafeFid(value.fid)
  ) {
    return undefined;
  }
  return Object.freeze({ fid: value.fid });
}

function readSafeSessionResponse(
  value: unknown,
  issuer: string,
  audience: string,
  now: number,
  expectedFid?: number
): FarcasterBridgeSessionResponse | undefined {
  if (!isRecord(value) || value.version !== 2) {
    return undefined;
  }
  const identity = readSafeSessionIdentity(value.identity);
  const sessionExpiresAt = typeof value.sessionExpiresAt === 'number'
    && Number.isSafeInteger(value.sessionExpiresAt)
    ? value.sessionExpiresAt
    : undefined;
  if (
    !identity
    || (expectedFid !== undefined && identity.fid !== expectedFid)
    || sessionExpiresAt === undefined
    || sessionExpiresAt <= now
    || sessionExpiresAt - now > FARCASTER_SERVER_SESSION_MAX_TTL_MS
  ) {
    return undefined;
  }

  if (value.status === 'pending-admission') {
    if (!hasOnlyAllowedKeys(value, ['version', 'status', 'identity', 'sessionExpiresAt'])) {
      return undefined;
    }
    return Object.freeze({
      version: 2,
      status: 'pending-admission',
      identity,
      sessionExpiresAt
    });
  }

  if (
    value.status !== 'authorized'
    || !hasOnlyAllowedKeys(value, [
      'version',
      'status',
      'identity',
      'sessionExpiresAt',
      'accessToken',
      'tokenType',
      'accessExpiresAt'
    ])
    || typeof value.accessToken !== 'string'
    || value.tokenType !== 'spacetime-access'
    || typeof value.accessExpiresAt !== 'number'
    || !Number.isSafeInteger(value.accessExpiresAt)
    || value.accessExpiresAt <= now
    || value.accessExpiresAt > sessionExpiresAt
  ) {
    return undefined;
  }
  const parsed = parseFarcasterOidcJwt(value.accessToken, { issuer, audience, now });
  if (
    !parsed
    || parsed.claims.fid !== identity.fid
    || parsed.session.expiresAt !== value.accessExpiresAt
  ) {
    return undefined;
  }
  return Object.freeze({
    version: 2,
    status: 'authorized',
    identity,
    sessionExpiresAt,
    accessToken: value.accessToken,
    tokenType: 'spacetime-access',
    accessExpiresAt: value.accessExpiresAt
  });
}

function readSafeQuickAuthToken(value: unknown): string | undefined {
  if (
    typeof value !== 'string'
    || !COMPACT_JWT_PATTERN.test(value)
    || new TextEncoder().encode(value).byteLength > MAX_QUICK_AUTH_TOKEN_BYTES
  ) {
    return undefined;
  }
  return value;
}

function readAccessRequestSecurity(
  value: AccessRequestAuthentication,
  expectedFid: unknown
): Readonly<{
  credentials: RequestCredentials;
  authorization?: string;
  expectedFid: string;
}> | undefined {
  if (!isSafeFid(expectedFid)) return undefined;
  const canonicalExpectedFid = String(expectedFid);
  if (!isRecord(value)) return undefined;
  if (
    value.mode === 'pending-session'
    && hasOnlyAllowedKeys(value, ['mode'])
  ) {
    return Object.freeze({
      credentials: 'include',
      expectedFid: canonicalExpectedFid
    });
  }
  if (
    value.mode === 'quick-auth'
    && hasOnlyAllowedKeys(value, ['mode', 'token'])
  ) {
    const token = readSafeQuickAuthToken(value.token);
    if (!token) return undefined;
    return Object.freeze({
      credentials: 'omit',
      authorization: token,
      expectedFid: canonicalExpectedFid
    });
  }
  return undefined;
}

function readAccessRequestStatus(value: unknown): AccessRequestStatus | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.status !== 'string') {
    return undefined;
  }
  if (
    value.status === 'not-requested'
    || value.status === 'already-admitted'
  ) {
    if (!hasOnlyAllowedKeys(value, ['version', 'status'])) return undefined;
    return Object.freeze({ version: 1, status: value.status });
  }
  if (
    value.status !== 'requested'
    || !hasOnlyAllowedKeys(value, ['version', 'status', 'requestedAt'])
    || typeof value.requestedAt !== 'number'
    || !Number.isSafeInteger(value.requestedAt)
    || value.requestedAt <= 0
    || value.requestedAt > 8_640_000_000_000_000
  ) {
    return undefined;
  }
  return Object.freeze({
    version: 1,
    status: 'requested',
    requestedAt: value.requestedAt
  });
}

function readAdmissionGrantAcknowledgement(
  value: unknown
): AdmissionGrantAcknowledgementStatus | undefined {
  if (
    !isRecord(value)
    || value.version !== 1
    || !hasOnlyAllowedKeys(value, ['version', 'status'])
    || (
      value.status !== 'accepted'
      && value.status !== 'not-ready'
      && value.status !== 'stale'
      && value.status !== 'already-admitted'
    )
  ) return undefined;
  return Object.freeze({ version: 1, status: value.status });
}

function readSafeQuickAuthSessionResponse(
  value: unknown,
  issuer: string,
  audience: string,
  now: number
): FarcasterQuickAuthSessionResponse | undefined {
  if (!isRecord(value) || value.version !== 2) {
    return undefined;
  }
  const identity = readSafeSessionIdentity(value.identity);
  if (!identity) return undefined;

  if (value.status === 'pending-admission') {
    if (!hasOnlyAllowedKeys(value, ['version', 'status', 'identity'])) {
      return undefined;
    }
    return Object.freeze({
      version: 2,
      status: 'pending-admission',
      identity
    });
  }

  if (
    value.status !== 'authorized'
    || !hasOnlyAllowedKeys(value, [
      'version',
      'status',
      'identity',
      'accessToken',
      'tokenType',
      'accessExpiresAt'
    ])
    || typeof value.accessToken !== 'string'
    || value.tokenType !== 'spacetime-access'
    || typeof value.accessExpiresAt !== 'number'
    || !Number.isSafeInteger(value.accessExpiresAt)
    || value.accessExpiresAt <= now
    || value.accessExpiresAt - now > FARCASTER_SERVER_SESSION_MAX_TTL_MS
  ) {
    return undefined;
  }
  const parsed = parseFarcasterOidcJwt(value.accessToken, {
    issuer,
    audience,
    now
  });
  if (
    !parsed
    || parsed.claims.fid !== identity.fid
    || parsed.session.expiresAt !== value.accessExpiresAt
  ) {
    return undefined;
  }
  return Object.freeze({
    version: 2,
    status: 'authorized',
    identity,
    accessToken: value.accessToken,
    tokenType: 'spacetime-access',
    accessExpiresAt: value.accessExpiresAt
  });
}

function hasJsonContentType(response: Response) {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function isRetryableBridgeErrorEnvelope(value: unknown, allowedCodes: ReadonlySet<string>) {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value, ['error']) || !isRecord(value.error)) {
    return false;
  }
  const error = value.error;
  return hasOnlyAllowedKeys(error, ['code', 'message'])
    && typeof error.code === 'string'
    && allowedCodes.has(error.code)
    && typeof error.message === 'string'
    && error.message.length > 0
    && error.message.length <= 256;
}

async function readBoundedResponseText(response: Response, signal?: AbortSignal) {
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength !== null
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_RESPONSE_BYTES)
  ) {
    throw new FarcasterOidcBridgeClientError();
  }
  if (!response.body) {
    throw new FarcasterOidcBridgeClientError();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation remains a generic bridge failure.
        }
        throw new FarcasterOidcBridgeClientError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Keep the public failure generic even when cancellation fails.
        }
        throw new FarcasterOidcBridgeClientError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new FarcasterOidcBridgeClientError();
  }
}

async function postJson(
  fetchImplementation: FarcasterOidcBridgeFetch,
  url: URL,
  body: unknown,
  callerSignal?: AbortSignal,
  timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS,
  retryableErrorCodes?: ReadonlySet<string>,
  requestSecurity: Readonly<{
    credentials: RequestCredentials;
    authorization?: string;
    expectedFid?: string;
  }> = Object.freeze({ credentials: 'include' }),
  definitiveNoMutationResponses?: ReadonlyMap<number, ReadonlySet<string>>
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timeoutExpired = false;
  let responseReceived = false;
  try {
    if (callerSignal?.aborted) {
      throw bridgeClientError('cancelled');
    }
    callerSignal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => {
      timeoutExpired = true;
      controller.abort();
    }, timeoutMs);
    const response = await fetchImplementation(url, {
      method: 'POST',
      mode: 'cors',
      credentials: requestSecurity.credentials,
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(requestSecurity.authorization === undefined
          ? {}
          : { authorization: `Bearer ${requestSecurity.authorization}` }),
        ...(requestSecurity.expectedFid === undefined
          ? {}
          : { [ACCESS_EXPECTED_FID_HEADER]: requestSecurity.expectedFid })
      },
      body: JSON.stringify(body)
    });
    responseReceived = true;
    if (controller.signal.aborted) {
      throw bridgeClientError(
        timeoutExpired ? 'timeout' : 'cancelled'
      );
    }
    if (!response.ok) {
      let retryable = false;
      let definitiveNoMutation = false;
      let definitiveNoMutationReason: AccessRequestNoMutationReason | null = null;
      const definitiveCodes = definitiveNoMutationResponses?.get(response.status);
      if (
        (
          (response.status === 503 && retryableErrorCodes)
          || definitiveCodes !== undefined
        )
        && hasJsonContentType(response)
      ) {
        const responseText = await readBoundedResponseText(response, controller.signal);
        try {
          const parsed = JSON.parse(responseText) as unknown;
          retryable = response.status === 503
            && retryableErrorCodes !== undefined
            && isRetryableBridgeErrorEnvelope(parsed, retryableErrorCodes);
          definitiveNoMutation = definitiveCodes !== undefined
            && isRetryableBridgeErrorEnvelope(parsed, definitiveCodes);
          if (definitiveNoMutation) {
            definitiveNoMutationReason = response.status === 409
              ? 'identity-changed'
              : 'rate-limited';
          }
        } catch {
          retryable = false;
          definitiveNoMutation = false;
          definitiveNoMutationReason = null;
        }
      }
      if (retryable) throw createRetryableExchangeError();
      if (definitiveNoMutation && definitiveNoMutationReason) {
        throw createDefinitiveAccessRequestNoMutationError(
          definitiveNoMutationReason
        );
      }
      throw bridgeClientError(
        response.status === 401
          ? 'invalid-credential'
          : response.status === 403
            ? 'forbidden'
            : response.status === 429
              ? 'rate-limited'
              : response.status === 503
                ? 'service-unavailable'
                : 'invalid-response'
      );
    }
    if (!hasJsonContentType(response)) {
      throw bridgeClientError('invalid-response');
    }
    const responseText = await readBoundedResponseText(response, controller.signal);
    if (controller.signal.aborted || responseText.length === 0) {
      throw bridgeClientError(
        timeoutExpired ? 'timeout' : 'invalid-response'
      );
    }
    try {
      return JSON.parse(responseText) as unknown;
    } catch {
      throw bridgeClientError('invalid-response');
    }
  } catch (error) {
    // Rejecting on status, MIME, length, JSON, or caller cancellation must
    // also stop any unread response body. Otherwise an invalid bridge can keep
    // streaming after the UI has already failed closed.
    controller.abort();
    if (
      error instanceof FarcasterOidcBridgeClientError
      && !bridgeFailureKinds.has(error)
    ) {
      if (timeoutExpired) throw bridgeClientError('timeout');
      if (callerSignal?.aborted) throw bridgeClientError('cancelled');
    }
    if (error instanceof FarcasterOidcBridgeClientError) {
      throw error;
    }
    if (timeoutExpired) throw bridgeClientError('timeout');
    if (callerSignal?.aborted) throw bridgeClientError('cancelled');
    throw bridgeClientError(
      responseReceived ? 'invalid-response' : 'network-or-cors'
    );
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    callerSignal?.removeEventListener('abort', abort);
  }
}

async function postNoContent(
  fetchImplementation: FarcasterOidcBridgeFetch,
  url: URL,
  body: unknown,
  callerSignal?: AbortSignal
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (callerSignal?.aborted) {
      throw new FarcasterOidcBridgeClientError();
    }
    callerSignal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(abort, BRIDGE_REQUEST_TIMEOUT_MS);
    const response = await fetchImplementation(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (controller.signal.aborted || response.status !== 204) {
      throw new FarcasterOidcBridgeClientError();
    }
  } catch {
    // A non-204 logout response may carry an unbounded body. Terminate its
    // transport before returning the generic local logout failure.
    controller.abort();
    throw new FarcasterOidcBridgeClientError();
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    callerSignal?.removeEventListener('abort', abort);
  }
}

function waitForExchangeRetry(
  delayMilliseconds: number,
  monotonicDeadline: number,
  wallDeadline: number,
  signal?: AbortSignal
) {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new FarcasterOidcBridgeClientError());
    };
    if (
      signal?.aborted
      || readExchangeRemainingMilliseconds(monotonicDeadline, wallDeadline) <= delayMilliseconds
    ) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delayMilliseconds);
  });
}

function readMonotonicMilliseconds() {
  const now = globalThis.performance?.now();
  if (typeof now !== 'number' || !Number.isFinite(now) || now < 0) {
    throw new FarcasterOidcBridgeClientError();
  }
  return now;
}

function readExchangeRemainingMilliseconds(
  monotonicDeadline: number,
  wallDeadline: number
) {
  const remaining = Math.min(
    monotonicDeadline - readMonotonicMilliseconds(),
    wallDeadline - Date.now()
  );
  return Number.isFinite(remaining) ? remaining : 0;
}

/**
 * Creates a browser bridge client. Its URL and exact issuer must be explicitly
 * configured; absence is a fail-closed condition, never a fallback to local
 * Farcaster-only authority.
 */
export function createFarcasterOidcBridgeClient(
  options: CreateFarcasterOidcBridgeClientOptions = {}
): FarcasterOidcBridgeClient {
  const allowLocalHttp = options.allowLocalHttp ?? import.meta.env.DEV === true;
  const bridgeUrl = readSafeBridgeUrl(options.bridgeUrl, allowLocalHttp);
  const issuer = readSafeFarcasterOidcIssuer(options.issuer, allowLocalHttp);
  const audience = readSafeFarcasterOidcAudience(
    options.audience ?? FARCASTER_OIDC_DEFAULT_AUDIENCE
  );
  const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (
    !bridgeUrl
    || !issuer
    || bridgeUrl.origin !== issuer
    || !audience
    || !fetchImplementation
  ) {
    throw bridgeClientError(
      'configuration',
      'The Hegemony verification service is not configured for this deployment.'
    );
  }

  const challengeUrl = new URL('v2/farcaster/challenge', bridgeUrl);
  const exchangeUrl = new URL('v2/farcaster/exchange', bridgeUrl);
  const quickAuthExchangeUrl = new URL(
    'v2/farcaster/quick-auth/exchange',
    bridgeUrl
  );
  const refreshUrl = new URL('v2/session/refresh', bridgeUrl);
  const logoutUrl = new URL('v2/session/logout', bridgeUrl);
  const accessStatusUrl = new URL('v2/access/status', bridgeUrl);
  const accessRequestUrl = new URL('v2/access/request', bridgeUrl);
  const admissionGrantUrl = new URL(
    'v2/access/admission-grant-context',
    bridgeUrl
  );

  return Object.freeze({
    issuer,
    audience,
    async createChallenge(
      request: FarcasterBridgeChallengeRequest,
      requestOptions?: FarcasterBridgeRequestOptions
    ) {
      const context = readSafeContext(request);
      if (
        !context
        || request.bindingMethod !== FARCASTER_BROWSER_BINDING_METHOD
        || !isCanonicalFarcasterBrowserBindingValue(request.bindingChallenge)
      ) {
        throw new FarcasterOidcBridgeClientError();
      }
      const body = {
        domain: context.domain,
        siweUri: context.siweUri,
        bindingChallenge: request.bindingChallenge,
        bindingMethod: FARCASTER_BROWSER_BINDING_METHOD
      };
      const result = await postJson(
        fetchImplementation,
        challengeUrl,
        body,
        requestOptions?.signal
      );
      const challenge = readSafeChallenge(result, Date.now(), context);
      if (!challenge) {
        throw new FarcasterOidcBridgeClientError();
      }
      return challenge;
    },

    async exchangeCompletedSignIn(
      request: FarcasterBridgeExchangeRequest,
      requestOptions?: FarcasterBridgeRequestOptions
    ) {
      const body = readSafeExchangeBody(request);
      if (!body) {
        throw new FarcasterOidcBridgeClientError();
      }
      const initialWallRemaining = request.expiresAt - Date.now();
      const exchangeBudget = Math.min(
        BRIDGE_EXCHANGE_TIMEOUT_MS,
        initialWallRemaining
      );
      const monotonicDeadline = readMonotonicMilliseconds() + exchangeBudget;
      if (
        !Number.isFinite(monotonicDeadline)
        || !Number.isFinite(exchangeBudget)
        || exchangeBudget <= 0
      ) {
        throw new FarcasterOidcBridgeClientError();
      }
      let result: unknown;
      for (let attempt = 0; ; attempt += 1) {
        const remainingMilliseconds = readExchangeRemainingMilliseconds(
          monotonicDeadline,
          request.expiresAt
        );
        if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
          throw new FarcasterOidcBridgeClientError();
        }
        try {
          result = await postJson(
            fetchImplementation,
            exchangeUrl,
            body,
            requestOptions?.signal,
            remainingMilliseconds,
            RETRYABLE_EXCHANGE_ERROR_CODES
          );
          break;
        } catch (error) {
          const retryDelay = BRIDGE_EXCHANGE_RETRY_DELAYS_MS[attempt];
          if (!(error instanceof FarcasterOidcBridgeClientError)) {
            throw error;
          }
          // Retry provenance is a one-shot internal capability. Consume it
          // before any branch so an exhausted error can never escape and be
          // replayed through a later injected transport.
          if (!retryableExchangeErrors.delete(error)) {
            throw error;
          }
          if (retryDelay === undefined) {
            throw new FarcasterOidcBridgeClientError();
          }
          await waitForExchangeRetry(
            retryDelay,
            monotonicDeadline,
            request.expiresAt,
            requestOptions?.signal
          );
        }
      }
      const session = readSafeSessionResponse(
        result,
        issuer,
        audience,
        Date.now(),
        request.fid
      );
      if (!session) {
        throw new FarcasterOidcBridgeClientError();
      }
      return session;
    },

    async exchangeQuickAuth(
      token: string,
      requestOptions?: FarcasterBridgeRequestOptions
    ) {
      const boundedToken = readSafeQuickAuthToken(token);
      if (!boundedToken) {
        throw bridgeClientError('invalid-credential');
      }
      const result = await postJson(
        fetchImplementation,
        quickAuthExchangeUrl,
        {},
        requestOptions?.signal,
        BRIDGE_REQUEST_TIMEOUT_MS,
        undefined,
        Object.freeze({
          credentials: 'omit',
          authorization: boundedToken
        })
      );
      const session = readSafeQuickAuthSessionResponse(
        result,
        issuer,
        audience,
        Date.now()
      );
      if (!session) {
        throw bridgeClientError('invalid-response');
      }
      return session;
    },

    async refreshSession(requestOptions?: FarcasterBridgeRequestOptions) {
      const result = await postJson(
        fetchImplementation,
        refreshUrl,
        {},
        requestOptions?.signal
      );
      const session = readSafeSessionResponse(
        result,
        issuer,
        audience,
        Date.now()
      );
      if (!session) {
        throw new FarcasterOidcBridgeClientError();
      }
      return session;
    },

    async getAccessRequestStatus(
      authentication: AccessRequestAuthentication,
      requestOptions: FarcasterAccessRequestOptions
    ) {
      const requestSecurity = readAccessRequestSecurity(
        authentication,
        requestOptions?.expectedFid
      );
      if (!requestSecurity) throw new FarcasterOidcBridgeClientError();
      const result = await postJson(
        fetchImplementation,
        accessStatusUrl,
        {},
        requestOptions?.signal,
        BRIDGE_REQUEST_TIMEOUT_MS,
        undefined,
        requestSecurity,
        ACCESS_STATUS_IDENTITY_CHANGED_RESPONSES
      );
      const status = readAccessRequestStatus(result);
      if (!status) throw new FarcasterOidcBridgeClientError();
      return status;
    },

    async requestAccess(
      authentication: AccessRequestAuthentication,
      requestOptions: FarcasterAccessRequestOptions
    ) {
      const requestSecurity = readAccessRequestSecurity(
        authentication,
        requestOptions?.expectedFid
      );
      if (!requestSecurity) throw new FarcasterOidcBridgeClientError();
      const result = await postJson(
        fetchImplementation,
        accessRequestUrl,
        {},
        requestOptions?.signal,
        BRIDGE_REQUEST_TIMEOUT_MS,
        undefined,
        requestSecurity,
        DEFINITIVE_ACCESS_REQUEST_NO_MUTATION_CODES
      );
      const status = readAccessRequestStatus(result);
      if (!status) throw new FarcasterOidcBridgeClientError();
      return status;
    },

    async acknowledgeAdmissionGrant(
      authentication: AccessRequestAuthentication,
      requestOptions: FarcasterAdmissionGrantOptions
    ) {
      const requestSecurity = readAccessRequestSecurity(
        authentication,
        requestOptions?.expectedFid
      );
      if (
        !requestSecurity
        || typeof requestOptions?.ticket !== 'string'
        || !ADMISSION_GRANT_TICKET_PATTERN.test(requestOptions.ticket)
        || typeof requestOptions?.notificationId !== 'string'
        || !ADMISSION_GRANT_NOTIFICATION_ID_PATTERN.test(
          requestOptions.notificationId
        )
      ) throw new FarcasterOidcBridgeClientError();
      const result = await postJson(
        fetchImplementation,
        admissionGrantUrl,
        {
          ticket: requestOptions.ticket,
          notificationId: requestOptions.notificationId
        },
        requestOptions.signal,
        BRIDGE_REQUEST_TIMEOUT_MS,
        undefined,
        requestSecurity,
        ACCESS_STATUS_IDENTITY_CHANGED_RESPONSES
      );
      const status = readAdmissionGrantAcknowledgement(result);
      if (!status) throw new FarcasterOidcBridgeClientError();
      return status;
    },

    async logoutSession(requestOptions?: FarcasterBridgeRequestOptions) {
      await postNoContent(fetchImplementation, logoutUrl, {}, requestOptions?.signal);
    }
  });
}

let defaultBridgeClient: FarcasterOidcBridgeClient | undefined;

/** Lazy default so anonymous title/menu visitors never touch bridge config or network. */
export async function getDefaultFarcasterOidcBridgeClient() {
  const runtimeConfig = readWarpkeepRuntimeConfig();
  // Defense in depth for callers outside the menu: a configured URL is not
  // sufficient to begin SIWF. The default bridge loader refuses before any
  // Farcaster channel is created unless the explicit shared-alpha switch and
  // exact public bridge/issuer configuration are active.
  if (!hasUsableWarpkeepBridge(runtimeConfig)) {
    throw bridgeClientError(
      'configuration',
      'The shared Hegemony frontier is not enabled for this deployment.'
    );
  }
  defaultBridgeClient ??= createFarcasterOidcBridgeClient({
    bridgeUrl: runtimeConfig.bridgeUrl,
    issuer: runtimeConfig.issuer,
    audience: runtimeConfig.audience,
    allowLocalHttp: runtimeConfig.allowLocalHttp
  });
  return defaultBridgeClient;
}
