import { DbConnection } from '../src/spacetime/module_bindings';
import { recordProductionAdminTokenAttempt } from './production-admin-token-budget.mjs';

/** Shared production transport primitives; no CLI or notification authority imports. */
const CONNECT_TIMEOUT_MS = 30_000;

export const OPERATION_TIMEOUT_MS = 15_000;

const MAX_ADMIN_TOKEN_RESPONSE_BYTES = 32 * 1_024;

const ADMIN_TOKEN_CLOCK_SAFETY_MILLISECONDS = 20_000;

export class HermesCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HermesCliError';
  }
}

export class HermesOperationTimeoutError extends Error {
  constructor() {
    super(
      'Warpkeep database operation timed out. A submitted mutation may still commit; '
      + 'inspect current state before retrying.',
    );
    this.name = 'HermesOperationTimeoutError';
  }
}

export async function readBoundedAdminResponse(response: Response): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_ADMIN_TOKEN_RESPONSE_BYTES)
  ) {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
  if (!response.body) fail('The Warpkeep admin bridge returned an invalid response.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ADMIN_TOKEN_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* Keep the rejection generic. */ }
        exceededLimit = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    fail('The Warpkeep admin bridge returned an invalid response.');
  } finally {
    try { reader.releaseLock(); } catch { /* Keep the rejection generic. */ }
  }
  if (exceededLimit) fail('The Warpkeep admin bridge returned an invalid response.');

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
}

export async function requestAdminToken(
  bridgeUrl: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
  budget: Readonly<{
    reservationId?: string;
    recordAttempt?: typeof recordProductionAdminTokenAttempt;
    trustedNowMs?: number;
  }> = {},
) {
  const recordAttempt = budget.recordAttempt ?? recordProductionAdminTokenAttempt;
  if (
    budget.recordAttempt === undefined
    && bridgeUrl !== 'https://auth.warpkeep.com'
  ) fail('The Warpkeep admin token budget requires the canonical production bridge.');
  const trustedNowMs = budget.recordAttempt === undefined
    ? budget.trustedNowMs ?? await readProductionAdminBridgeTrustedTime(bridgeUrl, fetchImpl)
    : budget.trustedNowMs;
  try {
    await recordAttempt(
      {
        ...(budget.reservationId === undefined
          ? {}
          : { reservationId: budget.reservationId }),
        ...(trustedNowMs === undefined ? {} : { now: () => trustedNowMs }),
      },
    );
  } catch {
    fail('The Warpkeep admin token request budget is unavailable.');
  }
  let response: Response;
  try {
    response = await fetchImpl(new URL('v1/admin/token', `${bridgeUrl}/`), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        accept: 'application/json',
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    fail('Could not reach the Warpkeep admin bridge.');
  }
  if (!response.ok) fail('The Warpkeep admin bridge rejected the request.');
  const body = await readBoundedAdminResponse(response);
  const token = body && typeof body === 'object' ? (body as { token?: unknown }).token : undefined;
  if (
    !body
    || typeof body !== 'object'
    || typeof token !== 'string'
    || token.length < 24
    || token.length > 16_384
    || token.split('.').length !== 3
    || token.split('.').some(part => !/^[A-Za-z0-9_-]+$/.test(part))
    || (body as { tokenType?: unknown }).tokenType !== 'spacetime-access'
  ) {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
  try {
    await awaitAdminTokenClockReadiness();
  } catch {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
  return token;
}

const PRODUCTION_ADMIN_BRIDGE_CLOCK_SKEW_MS = 60_000;

/**
 * The bridge's authenticated HTTPS origin supplies the cross-process quota
 * clock. A local forward/backward jump cannot prune the owner ledger early.
 */
export async function readProductionAdminBridgeTrustedTime(
  bridgeUrl: string,
  fetchImpl: typeof fetch = fetch,
  localNow: () => number = Date.now,
): Promise<number> {
  if (bridgeUrl !== 'https://auth.warpkeep.com') {
    fail('The Warpkeep admin token clock requires the canonical production bridge.');
  }
  let response: Response;
  try {
    response = await fetchImpl(new URL('healthz', `${bridgeUrl}/`), {
      method: 'GET',
      headers: { accept: 'application/json', 'cache-control': 'no-store' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail('Could not establish the Warpkeep admin token clock.');
  }
  const date = response.headers.get('date');
  const localTime = localNow();
  const trustedTime = date === null ? Number.NaN : Date.parse(date);
  if (
    !response.ok
    || date === null
    || !/^[A-Z][a-z]{2}, [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/u.test(date)
    || !Number.isSafeInteger(trustedTime)
    || new Date(trustedTime).toUTCString() !== date
    || !Number.isSafeInteger(localTime)
    || Math.abs(localTime - trustedTime) > PRODUCTION_ADMIN_BRIDGE_CLOCK_SKEW_MS
  ) fail('Could not establish the Warpkeep admin token clock.');
  try { await response.body?.cancel(); } catch { /* The trusted header is already bounded. */ }
  return trustedTime;
}

export type AdminTokenSleeper = (milliseconds: number) => Promise<void>;

export const sleepForAdminTokenReadiness: AdminTokenSleeper = milliseconds => (
  new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
);

/**
 * Maincloud and the bridge can straddle a NumericDate clock boundary. Hold a
 * freshly issued administrator token locally for one fixed elapsed-time
 * window before the first connection. No retry or wall-clock assumption is
 * involved; the module still performs every authoritative claim check.
 */
async function awaitAdminTokenClockReadiness(
  sleep: AdminTokenSleeper = sleepForAdminTokenReadiness,
): Promise<void> {
  try {
    await sleep(ADMIN_TOKEN_CLOCK_SAFETY_MILLISECONDS);
  } catch {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
}

export function withOperationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new HermesOperationTimeoutError()), OPERATION_TIMEOUT_MS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function disconnectSilently(connection: DbConnection | undefined): void {
  if (!connection || connection.isDisconnectRequested) return;
  try { connection.disconnect(); } catch { /* Preserve the generic connection boundary. */ }
}

export function connect(
  uri: string,
  database: string,
  token: string,
  builderFactory: () => ReturnType<typeof DbConnection.builder> = () => DbConnection.builder(),
): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failed = false;
    let pendingConnection: DbConnection | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      callback();
      return true;
    };
    const rejectUnavailable = () => {
      if (!settle(() => reject(new Error('Could not connect to the Warpkeep database.')))) return false;
      failed = true;
      disconnectSilently(pendingConnection);
      pendingConnection = undefined;
      return true;
    };
    timer = setTimeout(() => {
      rejectUnavailable();
    }, CONNECT_TIMEOUT_MS);
    try {
      const builder = builderFactory()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((connection) => {
          if (settle(() => resolve(connection))) pendingConnection = undefined;
          else disconnectSilently(connection);
        })
        .onConnectError(() => rejectUnavailable());
      const builtConnection = builder.build();
      if (failed) disconnectSilently(builtConnection);
      else if (!settled) pendingConnection = builtConnection;
    } catch {
      rejectUnavailable();
    }
  });
}

function fail(message: string): never { throw new HermesCliError(message); }
