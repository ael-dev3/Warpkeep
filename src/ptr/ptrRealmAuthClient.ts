export const PTR_REALM_ID = 'PTR' as const;
export const PTR_REALM_AUDIENCE = 'warpkeep-ptr-spacetimedb' as const;
export const PTR_REALM_OWNER_ROLE = 'warpkeep-ptr-owner' as const;
export const PTR_REALM_AUTH_ORIGIN = 'https://auth.warpkeep.com' as const;
export const PTR_REALM_EXCHANGE_PATH = '/v2/farcaster/ptr/exchange' as const;
export const PTR_REALM_TOKEN_TTL_MILLISECONDS = 120_000;

const MAX_QUICK_AUTH_TOKEN_BYTES = 8 * 1_024;
const MAX_RESPONSE_BYTES = 32 * 1_024;
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const DATABASE_IDENTITY = /^[a-f0-9]{64}$/u;
const DECIMAL_FID = /^[1-9][0-9]{0,15}$/u;
const BASE64URL_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export type PtrRealmAuthority = Readonly<{
  realmId: typeof PTR_REALM_ID;
  fid: number;
  databaseIdentity: string;
  expiresAt: number;
}>;

export type PtrRealmAuthFailureCode =
  | 'configuration'
  | 'invalid-credential'
  | 'forbidden'
  | 'rate-limited'
  | 'service-unavailable'
  | 'timeout'
  | 'network-or-cors'
  | 'invalid-response'
  | 'cancelled';

const failureCodes = new WeakMap<Error, PtrRealmAuthFailureCode>();
const privateCredentials = new WeakMap<object, Readonly<{
  jwt: string;
  expiresAt: number;
}>>();

export class PtrRealmAuthClientError extends Error {
  override readonly name = 'PtrRealmAuthClientError';

  constructor() {
    super('PTR authority could not be verified.');
  }
}

function failure(code: PtrRealmAuthFailureCode): PtrRealmAuthClientError {
  const error = new PtrRealmAuthClientError();
  failureCodes.set(error, code);
  return error;
}

export function ptrRealmAuthFailureCode(error: unknown): PtrRealmAuthFailureCode | null {
  return error instanceof PtrRealmAuthClientError
    ? failureCodes.get(error) ?? 'invalid-response'
    : null;
}

export type PtrRealmAuthClient = Readonly<{
  exchangeQuickAuth(token: string, signal?: AbortSignal): Promise<PtrRealmAuthority>;
}>;

export type PtrRealmAuthClientOptions = Readonly<{
  expectedDatabaseIdentity: string;
  bridgeOrigin?: string;
  timeoutMs?: number;
  now?: () => number;
  fetch?: typeof fetch;
}>;

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}

function safeBridgeOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
      && (value === url.origin || value === `${url.origin}/`)
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function safeQuickAuthToken(value: unknown): string | undefined {
  if (typeof value !== 'string' || !COMPACT_JWT.test(value)) return undefined;
  const bytes = new TextEncoder().encode(value);
  try {
    return bytes.byteLength <= MAX_QUICK_AUTH_TOKEN_BYTES ? value : undefined;
  } finally {
    bytes.fill(0);
  }
}

function decodeBase64UrlRecord(value: string): Record<string, unknown> | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return undefined;
  try {
    const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
    const binary = globalThis.atob(`${normalized}${'='.repeat((4 - normalized.length % 4) % 4)}`);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    try {
      const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : undefined;
    } finally {
      bytes.fill(0);
    }
  } catch {
    return undefined;
  }
}

function safeEpochMilliseconds(value: unknown): number | undefined {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > Math.floor(Number.MAX_SAFE_INTEGER / 1_000)
  ) return undefined;
  return value * 1_000;
}

function parsePtrJwt(jwt: unknown, now: number): Readonly<{
  fid: number;
  expiresAt: number;
}> | undefined {
  if (
    typeof jwt !== 'string'
    || jwt.length > 16_384
    || !COMPACT_JWT.test(jwt)
    || !Number.isSafeInteger(now)
    || now < 0
  ) return undefined;
  const [headerPart, payloadPart] = jwt.split('.');
  const header = headerPart ? decodeBase64UrlRecord(headerPart) : undefined;
  const payload = payloadPart ? decodeBase64UrlRecord(payloadPart) : undefined;
  if (
    !header
    || !payload
    || !exactRecord(header, ['alg', 'typ', 'kid'])
    || header.alg !== 'ES256'
    || header.typ !== 'JWT'
    || typeof header.kid !== 'string'
    || !BASE64URL_ID.test(header.kid)
    || !exactRecord(payload, [
      'iss', 'sub', 'aud', 'token_type', 'auth_version', 'realm_id', 'fid',
      'auth_epoch', 'roles', 'iat', 'nbf', 'exp', 'session_iat', 'session_exp', 'jti',
    ])
    || payload.iss !== PTR_REALM_AUTH_ORIGIN
    || !Array.isArray(payload.aud)
    || payload.aud.length !== 1
    || payload.aud[0] !== PTR_REALM_AUDIENCE
    || payload.token_type !== 'spacetime-access'
    || payload.auth_version !== 2
    || payload.realm_id !== PTR_REALM_ID
    || payload.auth_epoch !== 1
    || !Array.isArray(payload.roles)
    || payload.roles.length !== 1
    || payload.roles[0] !== PTR_REALM_OWNER_ROLE
    || typeof payload.fid !== 'string'
    || !DECIMAL_FID.test(payload.fid)
    || payload.sub !== `farcaster:${payload.fid}`
    || typeof payload.jti !== 'string'
    || !BASE64URL_ID.test(payload.jti)
  ) return undefined;
  const fid = Number(payload.fid);
  const issuedAt = safeEpochMilliseconds(payload.iat);
  const notBefore = safeEpochMilliseconds(payload.nbf);
  const expiresAt = safeEpochMilliseconds(payload.exp);
  const sessionIssuedAt = safeEpochMilliseconds(payload.session_iat);
  const sessionExpiresAt = safeEpochMilliseconds(payload.session_exp);
  if (
    !Number.isSafeInteger(fid)
    || fid <= 0
    || String(fid) !== payload.fid
    || issuedAt === undefined
    || notBefore === undefined
    || expiresAt === undefined
    || sessionIssuedAt !== issuedAt
    || sessionExpiresAt !== expiresAt
    || notBefore !== issuedAt
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > PTR_REALM_TOKEN_TTL_MILLISECONDS
    || now < notBefore
    || now >= expiresAt
  ) return undefined;
  return Object.freeze({ fid, expiresAt });
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (
    response.headers.get('cache-control') !== 'no-store'
    || response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      !== 'application/json'
  ) throw failure('invalid-response');
  const advertised = response.headers.get('content-length');
  if (
    advertised !== null
    && (!/^\d+$/u.test(advertised) || Number(advertised) > MAX_RESPONSE_BYTES)
  ) throw failure('invalid-response');
  if (!response.body) throw failure('invalid-response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let bytes: Uint8Array | undefined;
  try {
    try {
      for (;;) {
        if (signal.aborted) throw failure('cancelled');
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        length += value.byteLength;
        if (length > MAX_RESPONSE_BYTES) {
          void reader.cancel().catch(() => undefined);
          throw failure('invalid-response');
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // A cancelled response can already have released its reader.
      }
    }

    bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw failure('invalid-response');
    }
  } finally {
    bytes?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function classifyStatus(status: number): PtrRealmAuthFailureCode {
  if (status === 401) return 'invalid-credential';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate-limited';
  if (status === 503) return 'service-unavailable';
  return 'invalid-response';
}

export function createPtrRealmAuthClient(
  options: PtrRealmAuthClientOptions,
): PtrRealmAuthClient {
  const bridgeOrigin = safeBridgeOrigin(options.bridgeOrigin ?? PTR_REALM_AUTH_ORIGIN);
  const expectedDatabaseIdentity = options.expectedDatabaseIdentity;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MILLISECONDS;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (
    bridgeOrigin !== PTR_REALM_AUTH_ORIGIN
    || !DATABASE_IDENTITY.test(expectedDatabaseIdentity)
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1_000
    || timeoutMs > 30_000
    || typeof fetchImpl !== 'function'
  ) throw failure('configuration');
  const endpoint = new URL(PTR_REALM_EXCHANGE_PATH, `${bridgeOrigin}/`).toString();

  return Object.freeze({
    async exchangeQuickAuth(
      token: string,
      signal?: AbortSignal,
    ): Promise<PtrRealmAuthority> {
      let credential = safeQuickAuthToken(token);
      if (!credential) throw failure('invalid-credential');
      if (signal?.aborted) {
        credential = undefined;
        throw failure('cancelled');
      }
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const timeout = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        let response: Response;
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${credential}`,
              'content-type': 'application/json',
            },
            body: '{}',
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
          });
        } catch {
          if (signal?.aborted) throw failure('cancelled');
          if (timedOut) throw failure('timeout');
          throw failure('network-or-cors');
        } finally {
          credential = undefined;
        }
        if (!response.ok || response.status !== 200) {
          try {
            await response.body?.cancel();
          } catch {
            // Public failure classification does not depend on an error body.
          }
          throw failure(classifyStatus(response.status));
        }
        const now = (options.now ?? Date.now)();
        if (!Number.isSafeInteger(now) || now < 0) throw failure('invalid-response');
        let decoded: unknown;
        try {
          decoded = await readBoundedJson(response, controller.signal);
        } catch (error) {
          if (signal?.aborted) throw failure('cancelled');
          if (timedOut) throw failure('timeout');
          if (error instanceof PtrRealmAuthClientError) throw error;
          throw failure('invalid-response');
        }
        if (
          !exactRecord(decoded, [
            'version', 'status', 'realmId', 'identity', 'databaseIdentity',
            'accessToken', 'tokenType', 'accessExpiresAt',
          ])
          || decoded.version !== 1
          || decoded.status !== 'authorized'
          || decoded.realmId !== PTR_REALM_ID
          || decoded.databaseIdentity !== expectedDatabaseIdentity
          || decoded.tokenType !== 'spacetime-access'
          || typeof decoded.accessExpiresAt !== 'number'
          || !Number.isSafeInteger(decoded.accessExpiresAt)
          || !exactRecord(decoded.identity, ['fid'])
          || typeof decoded.identity.fid !== 'number'
          || !Number.isSafeInteger(decoded.identity.fid)
          || decoded.identity.fid <= 0
        ) throw failure('invalid-response');
        const claims = parsePtrJwt(decoded.accessToken, now);
        if (
          !claims
          || claims.fid !== decoded.identity.fid
          || claims.expiresAt !== decoded.accessExpiresAt
        ) throw failure('invalid-response');
        const authority: PtrRealmAuthority = Object.freeze({
          realmId: PTR_REALM_ID,
          fid: claims.fid,
          databaseIdentity: expectedDatabaseIdentity,
          expiresAt: claims.expiresAt,
        });
        privateCredentials.set(authority, Object.freeze({
          jwt: decoded.accessToken as string,
          expiresAt: claims.expiresAt,
        }));
        return authority;
      } finally {
        credential = undefined;
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
      }
    },
  });
}

/** Narrow connection seam: the bearer is never a React/view-state field. */
export function isCurrentPtrRealmAuthority(
  authority: unknown,
  now = Date.now(),
): authority is PtrRealmAuthority {
  if (
    typeof authority !== 'object'
    || authority === null
    || !Number.isSafeInteger(now)
    || now < 0
  ) return false;
  const credential = privateCredentials.get(authority);
  if (!credential || now >= credential.expiresAt) {
    privateCredentials.delete(authority);
    return false;
  }
  const candidate = authority as Partial<PtrRealmAuthority>;
  return candidate.realmId === PTR_REALM_ID
    && candidate.expiresAt === credential.expiresAt
    && typeof candidate.fid === 'number'
    && Number.isSafeInteger(candidate.fid)
    && candidate.fid > 0
    && typeof candidate.databaseIdentity === 'string'
    && DATABASE_IDENTITY.test(candidate.databaseIdentity);
}

/** Narrow connection seam: the bearer is never a React/view-state field. */
export function readPtrRealmPrivateJwtForConnection(
  authority: PtrRealmAuthority,
  now = Date.now(),
): string | null {
  if (!Number.isSafeInteger(now) || now < 0) return null;
  const credential = privateCredentials.get(authority);
  if (!credential || now >= credential.expiresAt) {
    privateCredentials.delete(authority);
    return null;
  }
  return credential.jwt;
}

/** One-way memory revocation for provider leave, replacement, and teardown. */
export function retirePtrRealmAuthority(authority: PtrRealmAuthority): boolean {
  return privateCredentials.delete(authority);
}
