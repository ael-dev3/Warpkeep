import type { FarcasterOidcSession } from '../farcaster/farcasterAuthTypes';
import {
  FARCASTER_OIDC_DEFAULT_AUDIENCE,
  parseFarcasterOidcJwt,
  readSafeFarcasterOidcAudience,
  readSafeFarcasterOidcIssuer,
} from '../farcaster/farcasterOidcSession';

export const OWNER_CANARY_AUTH_ORIGIN = 'https://auth.warpkeep.com';
export const OWNER_CANARY_EXCHANGE_PATH = '/v2/farcaster/player-canary/exchange';
const MAX_QUICK_AUTH_TOKEN_BYTES = 8 * 1_024;
const MAX_RESPONSE_BYTES = 32 * 1_024;
const DEFAULT_TIMEOUT_MS = 10_000;
const COMPACT_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SHA256 = /^[0-9a-f]{64}$/u;
const ownerCanaryPrivateSessions = new WeakSet<object>();

export type OwnerCanaryPrivateSession = Readonly<{
  session: FarcasterOidcSession;
  subjectFid: number;
}>;

/**
 * Verifies one freshly exchanged, module-branded owner session against the
 * controller's memory-only subject latch. It never returns or retains a FID.
 */
export async function verifyOwnerCanaryProductionPrivateSubject(input: Readonly<{
  privateSession: OwnerCanaryPrivateSession;
  latchedSubjectFid: number;
  reviewedAdmissionPlanDigest: string;
  signal: AbortSignal;
}>): Promise<boolean> {
  if (
    input.signal.aborted
    || typeof input.privateSession !== 'object'
    || input.privateSession === null
    || !ownerCanaryPrivateSessions.has(input.privateSession)
    || !Number.isSafeInteger(input.latchedSubjectFid)
    || input.latchedSubjectFid <= 0
    || input.privateSession.subjectFid !== input.latchedSubjectFid
    || !SHA256.test(input.reviewedAdmissionPlanDigest)
  ) return false;
  const parsed = parseFarcasterOidcJwt(input.privateSession.session.jwt, {
    issuer: OWNER_CANARY_AUTH_ORIGIN,
    audience: FARCASTER_OIDC_DEFAULT_AUDIENCE,
    now: Date.now(),
  });
  return parsed !== undefined
    && parsed.claims.fid === input.latchedSubjectFid
    && parsed.session.issuer === input.privateSession.session.issuer
    && parsed.session.audience === input.privateSession.session.audience
    && parsed.session.expiresAt === input.privateSession.session.expiresAt;
}

export type OwnerCanaryAuthFailureCode =
  | 'configuration'
  | 'invalid-credential'
  | 'forbidden'
  | 'rate-limited'
  | 'service-unavailable'
  | 'timeout'
  | 'network-or-cors'
  | 'invalid-response'
  | 'cancelled';

const failureCodes = new WeakMap<Error, OwnerCanaryAuthFailureCode>();

export class OwnerCanaryAuthClientError extends Error {
  override readonly name = 'OwnerCanaryAuthClientError';

  constructor() {
    super('The production player canary could not obtain fresh authority.');
  }
}

function failure(code: OwnerCanaryAuthFailureCode): OwnerCanaryAuthClientError {
  const error = new OwnerCanaryAuthClientError();
  failureCodes.set(error, code);
  return error;
}

export function ownerCanaryAuthFailureCode(error: unknown): OwnerCanaryAuthFailureCode | null {
  return error instanceof OwnerCanaryAuthClientError
    ? failureCodes.get(error) ?? 'invalid-response'
    : null;
}

export type OwnerCanaryAuthClient = Readonly<{
  exchangeQuickAuth(token: string, signal?: AbortSignal): Promise<OwnerCanaryPrivateSession>;
}>;

export type OwnerCanaryAuthClientOptions = Readonly<{
  bridgeOrigin?: string;
  issuer?: string;
  audience?: string;
  allowLocalHttp?: boolean;
  timeoutMs?: number;
  now?: () => number;
  fetch?: typeof fetch;
}>;

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function safeOrigin(value: unknown, allowLocalHttp: boolean): string | undefined {
  const origin = readSafeFarcasterOidcIssuer(value, allowLocalHttp);
  return origin && (value === origin || value === `${origin}/`) ? origin : undefined;
}

function safeQuickAuthToken(value: unknown): string | undefined {
  if (typeof value !== 'string' || !COMPACT_JWT_PATTERN.test(value)) return undefined;
  const bytes = new TextEncoder().encode(value);
  try {
    return bytes.byteLength <= MAX_QUICK_AUTH_TOKEN_BYTES ? value : undefined;
  } finally {
    bytes.fill(0);
  }
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw failure('invalid-response');
  }
  const advertised = response.headers.get('content-length');
  if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_RESPONSE_BYTES)) {
    throw failure('invalid-response');
  }
  if (!response.body) throw failure('invalid-response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      if (signal.aborted) throw failure('cancelled');
      let rejectAbort!: () => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(failure('cancelled'));
        signal.addEventListener('abort', rejectAbort, { once: true });
      });
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await Promise.race([reader.read(), aborted]);
      } finally {
        signal.removeEventListener('abort', rejectAbort);
      }
      const { done, value } = read;
      if (done) break;
      if (!value) continue;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw failure('invalid-response');
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled stream can already have released its reader.
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw failure('invalid-response');
  } finally {
    bytes.fill(0);
  }
}

export function createOwnerCanaryAuthClient(
  options: OwnerCanaryAuthClientOptions = {},
): OwnerCanaryAuthClient {
  const allowLocalHttp = options.allowLocalHttp === true;
  const bridgeOrigin = safeOrigin(options.bridgeOrigin ?? OWNER_CANARY_AUTH_ORIGIN, allowLocalHttp);
  const issuer = safeOrigin(options.issuer ?? OWNER_CANARY_AUTH_ORIGIN, allowLocalHttp);
  const audience = readSafeFarcasterOidcAudience(
    options.audience ?? FARCASTER_OIDC_DEFAULT_AUDIENCE,
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (
    !bridgeOrigin
    || !issuer
    || bridgeOrigin !== issuer
    || !audience
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1_000
    || timeoutMs > 30_000
  ) throw failure('configuration');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw failure('configuration');
  const endpoint = new URL(OWNER_CANARY_EXCHANGE_PATH, `${bridgeOrigin}/`).toString();

  return Object.freeze({
    async exchangeQuickAuth(token: string, signal?: AbortSignal): Promise<OwnerCanaryPrivateSession> {
      let credential = safeQuickAuthToken(token);
      if (!credential) throw failure('invalid-credential');
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const timeout = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
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
        credential = undefined;
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) throw failure('cancelled');
        if (timedOut) throw failure('timeout');
        throw failure('network-or-cors');
      } finally {
        credential = undefined;
      }

      try {
        if (!response.ok) {
          try {
            await response.body?.cancel();
          } catch {
            // Failure classification never depends on an untrusted response body.
          }
          if (response.status === 401) throw failure('invalid-credential');
          if (response.status === 403) throw failure('forbidden');
          if (response.status === 429) throw failure('rate-limited');
          if (response.status === 503) throw failure('service-unavailable');
          throw failure('invalid-response');
        }

        const now = (options.now ?? Date.now)();
        if (!Number.isSafeInteger(now) || now < 0) throw failure('invalid-response');
        let body: unknown;
        try {
          body = await readBoundedJson(response, controller.signal);
        } catch (error) {
          if (signal?.aborted) throw failure('cancelled');
          if (timedOut) throw failure('timeout');
          if (error instanceof OwnerCanaryAuthClientError) throw error;
          throw failure('invalid-response');
        }
        if (
          !exactRecord(body, ['version', 'status', 'accessToken', 'tokenType', 'accessExpiresAt'])
          || body.version !== 1
          || body.status !== 'authorized'
          || body.tokenType !== 'spacetime-access'
          || typeof body.accessToken !== 'string'
          || typeof body.accessExpiresAt !== 'number'
          || !Number.isSafeInteger(body.accessExpiresAt)
          || body.accessExpiresAt <= now
        ) throw failure('invalid-response');
        const parsed = parseFarcasterOidcJwt(body.accessToken, {
          issuer,
          audience,
          now,
          allowLocalHttp,
        });
        if (!parsed || parsed.session.expiresAt !== body.accessExpiresAt) {
          throw failure('invalid-response');
        }
        const privateSession = Object.freeze({
          session: parsed.session,
          subjectFid: parsed.claims.fid,
        });
        ownerCanaryPrivateSessions.add(privateSession);
        return privateSession;
      } finally {
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
      }
    },
  });
}
