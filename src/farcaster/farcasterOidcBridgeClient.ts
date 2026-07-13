import {
  isBoundedFarcasterSignature,
  type FarcasterBridgeChallenge,
  type FarcasterBridgeChallengeRequest,
  type FarcasterBridgeExchangeRequest,
  type FarcasterBridgeRequestOptions,
  type FarcasterBridgeSessionIdentity,
  type FarcasterBridgeSessionResponse,
  type FarcasterOidcBridgeClient
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
const BRIDGE_REQUEST_TIMEOUT_MS = 10_000;
const FARCASTER_SERVER_SESSION_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const NONCE_PATTERN = /^[A-Za-z0-9]{8,128}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~-]{8,256}$/;

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

export class FarcasterOidcBridgeClientError extends Error {
  override readonly name = 'FarcasterOidcBridgeClientError';

  constructor(message = 'The Hegemony verification service could not confirm this sign-in.') {
    super(message);
  }
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

function hasJsonContentType(response: Response) {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

async function readBoundedResponseText(response: Response, signal?: AbortSignal) {
  const advertisedLength = response.headers.get('content-length');
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_RESPONSE_BYTES)) {
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
    if (controller.signal.aborted || !response.ok || !hasJsonContentType(response)) {
      throw new FarcasterOidcBridgeClientError();
    }
    const responseText = await readBoundedResponseText(response, controller.signal);
    if (controller.signal.aborted || responseText.length === 0) {
      throw new FarcasterOidcBridgeClientError();
    }
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new FarcasterOidcBridgeClientError();
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
    throw new FarcasterOidcBridgeClientError();
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    callerSignal?.removeEventListener('abort', abort);
  }
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
    throw new FarcasterOidcBridgeClientError(
      'The Hegemony verification service is not configured for this deployment.'
    );
  }

  const challengeUrl = new URL('v2/farcaster/challenge', bridgeUrl);
  const exchangeUrl = new URL('v2/farcaster/exchange', bridgeUrl);
  const refreshUrl = new URL('v2/session/refresh', bridgeUrl);
  const logoutUrl = new URL('v2/session/logout', bridgeUrl);

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
      const result = await postJson(
        fetchImplementation,
        exchangeUrl,
        body,
        requestOptions?.signal
      );
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
    throw new FarcasterOidcBridgeClientError(
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
