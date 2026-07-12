import type { FarcasterOidcSession } from './farcasterAuthTypes';

export const FARCASTER_OIDC_PLAYER_TOKEN_TYPE = 'spacetime-access' as const;
export const FARCASTER_OIDC_DEFAULT_AUDIENCE = 'warpkeep-spacetimedb' as const;
export const FARCASTER_OIDC_PLAYER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

const MAX_JWT_LENGTH = 16_384;
const MAX_ISSUER_LENGTH = 2_048;
const MAX_AUDIENCE_LENGTH = 256;
const MAX_JTI_LENGTH = 512;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const AUDIENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DECIMAL_FID_PATTERN = /^[1-9][0-9]{0,15}$/;

export type FarcasterOidcTokenClaims = Readonly<{
  fid: number;
  issuer: string;
  audience: string;
  expiresAt: number;
  issuedAt: number;
  notBefore: number;
}>;

export type ParsedFarcasterOidcSession = Readonly<{
  session: FarcasterOidcSession;
  claims: FarcasterOidcTokenClaims;
}>;

export type FarcasterOidcSessionValidationOptions = Readonly<{
  issuer?: string;
  audience?: string;
  now?: number;
  /** Local HTTP issuers are accepted only by a development build. */
  allowLocalHttp?: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function readSafeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function epochSecondsToMilliseconds(value: unknown) {
  const seconds = readSafeTimestamp(value);
  if (seconds === undefined || seconds > Math.floor(Number.MAX_SAFE_INTEGER / 1_000)) {
    return undefined;
  }
  return seconds * 1_000;
}

/** Rejects non-HTTPS issuers outside a narrow localhost development escape hatch. */
export function readSafeFarcasterOidcIssuer(
  value: unknown,
  allowLocalHttp = import.meta.env.DEV === true
) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ISSUER_LENGTH) {
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
    return value;
  } catch {
    return undefined;
  }
}

export function readSafeFarcasterOidcAudience(value: unknown) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_AUDIENCE_LENGTH
    && AUDIENCE_PATTERN.test(value)
    ? value
    : undefined;
}

function decodeBase64UrlJson(value: string) {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return undefined;
  }

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const binary = globalThis.atob(`${normalized}${'='.repeat(paddingLength)}`);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readExactAudience(value: unknown, expectedAudience?: string) {
  const audience = typeof value === 'string'
    ? value
    : Array.isArray(value) && value.length === 1 && typeof value[0] === 'string'
      ? value[0]
      : undefined;
  const safeAudience = readSafeFarcasterOidcAudience(audience);
  if (!safeAudience || (expectedAudience !== undefined && safeAudience !== expectedAudience)) {
    return undefined;
  }
  return safeAudience;
}

function readFid(value: unknown) {
  if (typeof value !== 'string' || !DECIMAL_FID_PATTERN.test(value)) {
    return undefined;
  }
  const fid = Number(value);
  return Number.isSafeInteger(fid) && fid > 0 ? fid : undefined;
}

function readPlayerClaims(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  options: FarcasterOidcSessionValidationOptions
) {
  if (
    !hasOnlyAllowedKeys(header, ['alg', 'typ', 'kid'])
    || header.alg !== 'ES256'
    || (header.typ !== undefined && header.typ !== 'JWT')
  ) {
    return undefined;
  }

  const issuer = readSafeFarcasterOidcIssuer(payload.iss, options.allowLocalHttp);
  const expectedIssuer = options.issuer === undefined
    ? undefined
    : readSafeFarcasterOidcIssuer(options.issuer, options.allowLocalHttp);
  const expectedAudience = options.audience === undefined
    ? undefined
    : readSafeFarcasterOidcAudience(options.audience);
  if (
    !issuer
    || (options.issuer !== undefined && !expectedIssuer)
    || (expectedIssuer !== undefined && issuer !== expectedIssuer)
    || (options.audience !== undefined && !expectedAudience)
  ) {
    return undefined;
  }

  const audience = readExactAudience(payload.aud, expectedAudience);
  const fid = readFid(payload.fid);
  const issuedAt = epochSecondsToMilliseconds(payload.iat);
  const notBefore = epochSecondsToMilliseconds(payload.nbf);
  const expiresAt = epochSecondsToMilliseconds(payload.exp);
  const sessionIssuedAt = epochSecondsToMilliseconds(payload.session_iat);
  const sessionExpiresAt = epochSecondsToMilliseconds(payload.session_exp);
  if (
    !audience
    || !fid
    || payload.sub !== `farcaster:${fid}`
    || payload.token_type !== FARCASTER_OIDC_PLAYER_TOKEN_TYPE
    || !Number.isSafeInteger(payload.auth_epoch)
    || (payload.auth_epoch as number) < 0
    || !Array.isArray(payload.roles)
    || payload.roles.length !== 0
    || typeof payload.jti !== 'string'
    || payload.jti.length === 0
    || payload.jti.length > MAX_JTI_LENGTH
    || issuedAt === undefined
    || notBefore === undefined
    || expiresAt === undefined
    || sessionIssuedAt !== issuedAt
    || sessionExpiresAt !== expiresAt
    || issuedAt > notBefore
    || notBefore >= expiresAt
    || BigInt(expiresAt) - BigInt(issuedAt) > BigInt(FARCASTER_OIDC_PLAYER_TOKEN_TTL_MS)
  ) {
    return undefined;
  }

  const now = options.now;
  if (
    now !== undefined
    && (
      !Number.isSafeInteger(now)
      || now < 0
      || now < notBefore
      || now >= expiresAt
    )
  ) {
    return undefined;
  }

  return Object.freeze({ fid, issuer, audience, expiresAt, issuedAt, notBefore });
}

/**
 * Decodes only enough JWT metadata to enforce the closed-alpha contract.
 * Signature verification remains the responsibility of the bridge and
 * SpacetimeDB/JWKS; this routine never treats decoded JSON as proof by itself.
 */
export function parseFarcasterOidcJwt(
  jwt: unknown,
  options: FarcasterOidcSessionValidationOptions = {}
): ParsedFarcasterOidcSession | undefined {
  if (typeof jwt !== 'string' || jwt.length === 0 || jwt.length > MAX_JWT_LENGTH || !JWT_PATTERN.test(jwt)) {
    return undefined;
  }

  const [encodedHeader, encodedPayload] = jwt.split('.');
  const header = decodeBase64UrlJson(encodedHeader);
  const payload = decodeBase64UrlJson(encodedPayload);
  if (!header || !payload) {
    return undefined;
  }

  const claims = readPlayerClaims(header, payload, options);
  if (!claims) {
    return undefined;
  }

  return Object.freeze({
    session: Object.freeze({
      jwt,
      issuer: claims.issuer,
      audience: claims.audience,
      expiresAt: claims.expiresAt
    }),
    claims
  });
}

/**
 * Validates a bridge result/object before it is used as a bearer session or
 * persisted. Exact object shape prevents an injected result from smuggling
 * proof fields into the browser session object.
 */
export function validateFarcasterOidcSession(
  value: unknown,
  options: FarcasterOidcSessionValidationOptions = {}
): ParsedFarcasterOidcSession | undefined {
  if (
    !isRecord(value)
    || !hasOnlyAllowedKeys(value, ['jwt', 'issuer', 'audience', 'expiresAt'])
  ) {
    return undefined;
  }

  const issuer = readSafeFarcasterOidcIssuer(value.issuer, options.allowLocalHttp);
  const audience = readSafeFarcasterOidcAudience(value.audience);
  const expiresAt = readSafeTimestamp(value.expiresAt);
  if (!issuer || !audience || expiresAt === undefined) {
    return undefined;
  }

  const parsed = parseFarcasterOidcJwt(value.jwt, {
    issuer: options.issuer ?? issuer,
    audience: options.audience ?? audience,
    now: options.now,
    allowLocalHttp: options.allowLocalHttp
  });
  if (
    !parsed
    || parsed.session.issuer !== issuer
    || parsed.session.audience !== audience
    || parsed.session.expiresAt !== expiresAt
  ) {
    return undefined;
  }
  return parsed;
}

export function validateFarcasterOidcSessionForIdentity(
  value: unknown,
  fid: number,
  options: FarcasterOidcSessionValidationOptions = {}
) {
  const parsed = validateFarcasterOidcSession(value, options);
  return parsed && parsed.claims.fid === fid ? parsed : undefined;
}
