import type {
  FarcasterBridgeChallenge,
  FarcasterBridgeChallengeRequest,
  FarcasterBridgeExchangeRequest,
  FarcasterOidcBridgeClient
} from './farcasterAuthTypes';
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
const NONCE_PATTERN = /^[A-Za-z0-9]{8,128}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~-]{8,256}$/;
const HEX_SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

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

function readSafeContext(request: FarcasterBridgeChallengeRequest) {
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
  expectedContext: FarcasterBridgeChallengeRequest
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
    || typeof request.signature !== 'string'
    || !HEX_SIGNATURE_PATTERN.test(request.signature)
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
    || !isRecord(request.identity)
    || !isSafeFid(request.identity.fid)
    || request.identity.fid !== request.fid
  ) {
    return undefined;
  }

  const safeText = (value: unknown) => typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && value === value.trim()
    && !/[\u0000-\u001F\u007F]/.test(value)
    ? value
    : undefined;
  const safeUrl = (value: unknown) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
      return undefined;
    }
    try {
      const url = new URL(value);
      return url.protocol === 'https:'
        && url.username === ''
        && url.password === ''
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  };
  const username = request.identity.username === undefined
    ? undefined
    : safeText(request.identity.username);
  const displayName = request.identity.displayName === undefined
    ? undefined
    : safeText(request.identity.displayName);
  const pfpUrl = request.identity.pfpUrl === undefined
    ? undefined
    : safeUrl(request.identity.pfpUrl);
  if (
    (request.identity.username !== undefined && !username)
    || (request.identity.displayName !== undefined && !displayName)
    || (request.identity.pfpUrl !== undefined && !pfpUrl)
  ) {
    return undefined;
  }

  // Construct the body field-by-field. Unknown caller properties, including a
  // maliciously injected channelToken, cannot cross this private boundary.
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
    identity: {
      fid: request.identity.fid,
      ...(username === undefined ? {} : { username }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(pfpUrl === undefined ? {} : { pfpUrl })
    }
  };
}

function hasJsonContentType(response: Response) {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

async function readBoundedResponseText(response: Response) {
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
  body: unknown
) {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(BRIDGE_REQUEST_TIMEOUT_MS),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new FarcasterOidcBridgeClientError();
  }

  if (!response.ok || !hasJsonContentType(response)) {
    throw new FarcasterOidcBridgeClientError();
  }

  let responseText: string;
  try {
    responseText = await readBoundedResponseText(response);
  } catch {
    throw new FarcasterOidcBridgeClientError();
  }
  if (responseText.length === 0) {
    throw new FarcasterOidcBridgeClientError();
  }
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new FarcasterOidcBridgeClientError();
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
  if (!bridgeUrl || !issuer || !audience || !fetchImplementation) {
    throw new FarcasterOidcBridgeClientError(
      'The Hegemony verification service is not configured for this deployment.'
    );
  }

  const challengeUrl = new URL('v1/farcaster/challenge', bridgeUrl);
  const exchangeUrl = new URL('v1/farcaster/exchange', bridgeUrl);

  return Object.freeze({
    async createChallenge(request: FarcasterBridgeChallengeRequest) {
      const context = readSafeContext(request);
      if (!context) {
        throw new FarcasterOidcBridgeClientError();
      }
      const result = await postJson(fetchImplementation, challengeUrl, context);
      const challenge = readSafeChallenge(result, Date.now(), context);
      if (!challenge) {
        throw new FarcasterOidcBridgeClientError();
      }
      return challenge;
    },

    async exchangeCompletedSignIn(request: FarcasterBridgeExchangeRequest) {
      const body = readSafeExchangeBody(request);
      if (!body) {
        throw new FarcasterOidcBridgeClientError();
      }
      const result = await postJson(fetchImplementation, exchangeUrl, body);
      if (
        !isRecord(result)
        || !hasOnlyAllowedKeys(result, ['token', 'tokenType', 'expiresAt'])
        || typeof result.token !== 'string'
        || (result.tokenType !== undefined && result.tokenType !== 'spacetime-access')
      ) {
        throw new FarcasterOidcBridgeClientError();
      }
      const responseExpiresAt = typeof result.expiresAt === 'number'
        ? result.expiresAt
        : undefined;
      if (
        (result.expiresAt !== undefined && responseExpiresAt === undefined)
        || (responseExpiresAt !== undefined && (
          !Number.isSafeInteger(responseExpiresAt) || responseExpiresAt <= 0
        ))
      ) {
        throw new FarcasterOidcBridgeClientError();
      }
      const parsed = parseFarcasterOidcJwt(result.token, {
        issuer,
        audience,
        now: Date.now()
      });
      if (
        !parsed
        || parsed.claims.fid !== request.fid
        || (responseExpiresAt !== undefined && parsed.session.expiresAt !== responseExpiresAt)
      ) {
        throw new FarcasterOidcBridgeClientError();
      }
      return parsed.session;
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
