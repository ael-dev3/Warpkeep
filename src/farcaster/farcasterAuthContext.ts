import type { FarcasterAuthContext } from './farcasterAuthTypes';

export const FARCASTER_AUTH_REQUEST_TTL_MS = 5 * 60 * 1_000;
export const FARCASTER_AUTH_NONCE_BYTES = 24;

export type FarcasterSecureRandomSource = Pick<Crypto, 'getRandomValues'>
  & Partial<Pick<Crypto, 'randomUUID'>>;

export type FarcasterAuthLocationInput = Readonly<{
  origin: string;
  host: string;
  baseUrl: string;
}>;

export type FarcasterRequestMaterial = Readonly<{
  requestId: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  expirationTime: string;
}>;

export class FarcasterAuthContextError extends Error {
  override readonly name = 'FarcasterAuthContextError';
}

function requireSecureRandomSource(
  source: FarcasterSecureRandomSource | undefined = globalThis.crypto
): FarcasterSecureRandomSource {
  if (!source || typeof source.getRandomValues !== 'function') {
    throw new FarcasterAuthContextError(
      'Secure browser randomness is unavailable for Farcaster sign-in.'
    );
  }

  return source;
}

function randomBytes(length: number, source?: FarcasterSecureRandomSource) {
  const values = new Uint8Array(length);
  requireSecureRandomSource(source).getRandomValues(values);
  return values;
}

function bytesToHex(values: Uint8Array) {
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createSecureFarcasterNonce(source?: FarcasterSecureRandomSource) {
  return bytesToHex(randomBytes(FARCASTER_AUTH_NONCE_BYTES, source));
}

export function createSecureFarcasterRequestId(source?: FarcasterSecureRandomSource) {
  const secureSource = requireSecureRandomSource(source);
  if (typeof secureSource.randomUUID === 'function') {
    const requestId = secureSource.randomUUID();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return requestId;
    }
    throw new FarcasterAuthContextError(
      'Secure browser randomness returned an invalid request identifier.'
    );
  }

  const values = randomBytes(16, secureSource);
  values[6] = (values[6] & 0x0f) | 0x40;
  values[8] = (values[8] & 0x3f) | 0x80;
  const hex = bytesToHex(values);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

export function createFarcasterRequestMaterial(
  now = Date.now(),
  source?: FarcasterSecureRandomSource
): FarcasterRequestMaterial {
  if (!Number.isFinite(now) || now < 0) {
    throw new FarcasterAuthContextError(
      'A valid current time is required for Farcaster sign-in.'
    );
  }

  const createdAt = Math.floor(now);
  const expiresAt = createdAt + FARCASTER_AUTH_REQUEST_TTL_MS;
  if (!Number.isFinite(expiresAt) || expiresAt > 8.64e15) {
    throw new FarcasterAuthContextError(
      'A valid current time is required for Farcaster sign-in.'
    );
  }
  return Object.freeze({
    requestId: createSecureFarcasterRequestId(source),
    nonce: createSecureFarcasterNonce(source),
    createdAt,
    expiresAt,
    expirationTime: new Date(expiresAt).toISOString()
  });
}

function normalizeBaseUrl(baseUrl: string) {
  if (
    typeof baseUrl !== 'string'
    || !baseUrl.startsWith('/')
    || baseUrl.startsWith('//')
    || baseUrl.includes('\\')
    || baseUrl.includes('?')
    || baseUrl.includes('#')
  ) {
    throw new FarcasterAuthContextError(
      'Warpkeep has an invalid authentication base path.'
    );
  }

  let pathSegments: string[];
  try {
    pathSegments = baseUrl.split('/').map((segment) => decodeURIComponent(segment));
  } catch {
    throw new FarcasterAuthContextError(
      'Warpkeep has an invalid authentication base path.'
    );
  }
  if (pathSegments.some((segment) => segment === '.' || segment === '..')) {
    throw new FarcasterAuthContextError(
      'Warpkeep has an invalid authentication base path.'
    );
  }

  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/** Pure helper used by tests and by the browser wrapper below. */
export function resolveFarcasterAuthContext({
  origin,
  host,
  baseUrl
}: FarcasterAuthLocationInput): FarcasterAuthContext {
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new FarcasterAuthContextError(
      'Warpkeep could not determine the current authentication origin.'
    );
  }

  if (
    (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:')
    || parsedOrigin.username !== ''
    || parsedOrigin.password !== ''
    || parsedOrigin.pathname !== '/'
    || parsedOrigin.search !== ''
    || parsedOrigin.hash !== ''
    || host === ''
    || host !== parsedOrigin.host
    || /[\s/?#]/.test(host)
  ) {
    throw new FarcasterAuthContextError(
      'Warpkeep could not determine the current authentication origin.'
    );
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const siweUri = new URL(normalizedBaseUrl, parsedOrigin.origin).toString();
  return Object.freeze({ domain: host, siweUri });
}

/** Resolve the current host and Vite base without using location.href/hash. */
export function getBrowserFarcasterAuthContext(
  baseUrl = import.meta.env.BASE_URL,
  location: Pick<Location, 'origin' | 'host'> | undefined = (
    typeof window === 'undefined' ? undefined : window.location
  )
): FarcasterAuthContext {
  if (!location) {
    throw new FarcasterAuthContextError(
      'Farcaster sign-in is only available in a browser.'
    );
  }

  return resolveFarcasterAuthContext({
    origin: location.origin,
    host: location.host,
    baseUrl
  });
}
