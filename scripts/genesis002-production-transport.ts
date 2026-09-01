import {
  DbConnection,
  type DbConnection as Genesis002DbConnection,
} from './genesis002_module_bindings';
import {
  GENESIS_002_PRODUCTION_IMPORT_REDUCERS,
  GENESIS_002_PRODUCTION_IMPORT_TARGET,
  type Genesis002ProductionImportTransport,
} from './genesis002-production-import-core';

const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 512;
const MAX_TOKEN_RESPONSE_BYTES = 32 * 1_024;
const MAX_TOKEN_BYTES = 16 * 1_024;
const TOKEN_REQUEST_TIMEOUT_MILLISECONDS = 8_000;
const OPERATION_TIMEOUT_MILLISECONDS = 15_000;
const MAX_FUTURE_SKEW_MICROS = 1_000_000n;
const MICROS_PER_MILLISECOND = 1_000n;
const MICROS_PER_SECOND = 1_000_000n;
const STATUS_PROCEDURE = 'adminGetGreaterRealmStatusV1';
const REALM_STATUS_PROCEDURE = 'getRealmStatusV1';
export const GENESIS_002_ADMIN_TOKEN_PATH =
  '/v1/admin/genesis-002-token' as const;

type RequestAdminToken = (
  bridge: string,
  secret: string,
) => Promise<string>;

function withGenesis002OperationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Genesis002ProductionTransportError(
      'GENESIS_002_PRODUCTION_OPERATION_OUTCOME_AMBIGUOUS',
    )), OPERATION_TIMEOUT_MILLISECONDS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export class Genesis002ProductionTransportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'Genesis002ProductionTransportError';
  }
}

function fail(code: string): never {
  throw new Genesis002ProductionTransportError(code);
}

function validGenesis002AdminSecret(secret: unknown): secret is string {
  const length = typeof secret === 'string'
    ? Buffer.byteLength(secret, 'utf8')
    : 0;
  return typeof secret === 'string'
    && length >= MIN_SECRET_BYTES
    && length <= MAX_SECRET_BYTES
    && !/[\u0000-\u0020\u007f]/u.test(secret);
}

async function readGenesis002TokenResponse(response: Response): Promise<string> {
  if (response.body === null) {
    fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes: Uint8Array | undefined;
  let total = 0;
  try {
    const contentLength = response.headers.get('content-length');
    if (
      contentLength !== null
      && (!/^(?:0|[1-9][0-9]{0,9})$/u.test(contentLength)
        || Number(contentLength) > MAX_TOKEN_RESPONSE_BYTES)
    ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
      }
      chunks.push(value);
      total += value.byteLength;
      if (total > MAX_TOKEN_RESPONSE_BYTES) {
        fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
      }
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  } finally {
    bytes?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
    try { await reader.cancel(); } catch { /* Cleanup must not reveal cause. */ }
  }
}

function exactGenesis002TokenResponse(
  value: unknown,
  currentTimeMilliseconds: number,
): string {
  const responseKeys = ['token', 'tokenType', 'expiresIn'];
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== responseKeys.length
    || Reflect.ownKeys(value).some(key => (
      typeof key !== 'string' || !responseKeys.includes(key)
    ))
  ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  const record = value as Readonly<Record<string, unknown>>;
  if (
    typeof record.token !== 'string'
    || Buffer.byteLength(record.token, 'utf8') > MAX_TOKEN_BYTES
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(record.token)
    || record.tokenType !== 'spacetime-access'
    || record.expiresIn !== 300
  ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  const payloadSegment = record.token.split('.')[1];
  let payloadBytes: Buffer | undefined;
  let payload: unknown;
  try {
    payloadBytes = Buffer.from(payloadSegment, 'base64url');
    payload = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes),
    );
  } catch {
    return fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  } finally {
    payloadBytes?.fill(0);
  }
  if (
    payload === null
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || Object.getPrototypeOf(payload) !== Object.prototype
  ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  const claims = payload as Readonly<Record<string, unknown>>;
  const claimKeys = Reflect.ownKeys(claims);
  const exactKeys = [
    'iss', 'sub', 'aud', 'token_type', 'roles', 'iat', 'nbf', 'exp', 'jti',
  ];
  if (
    claimKeys.length !== exactKeys.length
    || claimKeys.some(key => typeof key !== 'string' || !exactKeys.includes(key))
    || claims.iss !== 'https://auth.warpkeep.com'
    || claims.sub !== 'service:hermes'
    || !Array.isArray(claims.aud)
    || claims.aud.length !== 1
    || claims.aud[0] !== 'warpkeep-genesis-002-spacetimedb'
    || claims.token_type !== 'spacetime-access'
    || !Array.isArray(claims.roles)
    || claims.roles.length !== 1
    || claims.roles[0] !== 'warpkeep-admin'
    || typeof claims.iat !== 'number'
    || !Number.isSafeInteger(claims.iat)
    || claims.iat < 0
    || typeof claims.nbf !== 'number'
    || !Number.isSafeInteger(claims.nbf)
    || claims.nbf !== claims.iat
    || typeof claims.exp !== 'number'
    || !Number.isSafeInteger(claims.exp)
    || claims.exp - claims.iat !== 300
    || typeof claims.jti !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(claims.jti)
  ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  const currentTimeMicros = BigInt(currentTimeMilliseconds)
    * MICROS_PER_MILLISECOND;
  if (
    currentTimeMicros + MAX_FUTURE_SKEW_MICROS
      < BigInt(claims.iat) * MICROS_PER_SECOND
    || currentTimeMicros + MAX_FUTURE_SKEW_MICROS
      < BigInt(claims.nbf) * MICROS_PER_SECOND
    || currentTimeMicros >= BigInt(claims.exp) * MICROS_PER_SECOND
  ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  return record.token;
}

/** Request only the realm-scoped G002 token; no generic-admin fallback exists. */
export async function requestGenesis002AdminToken(
  bridge: string,
  secret: string,
  options: Readonly<{
    fetchImpl?: typeof fetch;
    timeoutMilliseconds?: number;
    nowMilliseconds?: () => number;
  }> = {},
): Promise<string> {
  if (!validGenesis002AdminSecret(secret)) {
    fail('GENESIS_002_PRODUCTION_ADMIN_SECRET_INVALID');
  }
  let bridgeUrl: URL;
  try {
    bridgeUrl = new URL(bridge);
  } catch {
    return fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');
  }
  if (
    bridgeUrl.protocol !== 'https:'
    || bridgeUrl.username !== ''
    || bridgeUrl.password !== ''
    || bridgeUrl.pathname !== '/'
    || bridgeUrl.search !== ''
    || bridgeUrl.hash !== ''
    || bridge !== bridgeUrl.origin
  ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');
  const timeoutMilliseconds = options.timeoutMilliseconds
    ?? TOKEN_REQUEST_TIMEOUT_MILLISECONDS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMilliseconds = options.nowMilliseconds ?? Date.now;
  if (
    !Number.isSafeInteger(timeoutMilliseconds)
    || timeoutMilliseconds < 1
    || timeoutMilliseconds > TOKEN_REQUEST_TIMEOUT_MILLISECONDS
    || typeof fetchImpl !== 'function'
    || typeof nowMilliseconds !== 'function'
  ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
  const headers = new Headers({
    accept: 'application/json',
    authorization: `Bearer ${secret}`,
  });
  try {
    const response = await fetchImpl(`${bridge}${GENESIS_002_ADMIN_TOKEN_PATH}`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (
      response.status !== 200
      || response.redirected
      || response.headers.get('cache-control') !== 'no-store'
      || !/^application\/json(?:;|$)/iu.test(
        response.headers.get('content-type') ?? '',
      )
    ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
    const source = await readGenesis002TokenResponse(response);
    let currentTimeMilliseconds: number;
    try {
      currentTimeMilliseconds = nowMilliseconds();
    } catch {
      return fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');
    }
    if (
      !Number.isSafeInteger(currentTimeMilliseconds)
      || currentTimeMilliseconds < 0
    ) fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
    }
    return exactGenesis002TokenResponse(parsed, currentTimeMilliseconds);
  } catch (error) {
    if (error instanceof Genesis002ProductionTransportError) throw error;
    return fail('GENESIS_002_PRODUCTION_ADMIN_TOKEN_UNAVAILABLE');
  } finally {
    headers.delete('authorization');
    secret = '';
    clearTimeout(timer);
  }
}

export function takeGenesis002ProductionAdminSecret(
  environment: NodeJS.ProcessEnv,
): string {
  const secret = environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  if (!validGenesis002AdminSecret(secret)) {
    fail('GENESIS_002_PRODUCTION_ADMIN_SECRET_INVALID');
  }
  return secret;
}

function connectGenesis002(
  databaseIdentity: string,
  token: string,
): Promise<Genesis002DbConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pending: Genesis002DbConnection | undefined;
    const finish = (effect: () => void) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      effect();
      return true;
    };
    const unavailable = () => {
      if (!finish(() => reject(new Genesis002ProductionTransportError(
        'GENESIS_002_PRODUCTION_CONNECTION_UNAVAILABLE',
      )))) return;
      try { pending?.disconnect(); } catch { /* Preserve the bounded error. */ }
      pending = undefined;
    };
    const timer = setTimeout(unavailable, 10_000);
    try {
      const connection = DbConnection.builder()
        .withUri(GENESIS_002_PRODUCTION_IMPORT_TARGET.uri)
        .withDatabaseName(databaseIdentity)
        .withToken(token)
        .onConnect(value => {
          if (finish(() => resolve(value))) pending = undefined;
          else {
            try { value.disconnect(); } catch { /* Connection already rejected. */ }
          }
        })
        .onConnectError(unavailable)
        .build();
      if (settled) {
        try { connection.disconnect(); } catch { /* Preserve the bounded error. */ }
      } else pending = connection;
    } catch {
      unavailable();
    }
  });
}

function disconnect(connection: Genesis002DbConnection | undefined): void {
  if (connection === undefined || connection.isDisconnectRequested) return;
  try { connection.disconnect(); } catch { /* Cleanup must not mask the result. */ }
}

type DynamicConnection = Genesis002DbConnection & Readonly<{
  procedures: Readonly<Record<string, (arguments_: unknown) => Promise<unknown>>>;
  reducers: Readonly<Record<string, (arguments_: unknown) => Promise<void>>>;
}>;

/** One serialized G002-only administrator session; failed submissions are never retried. */
export function createGenesis002ProductionTransport(input: Readonly<{
  databaseIdentity: string;
  adminSecret: string;
  requestToken?: RequestAdminToken;
  connectDatabase?: typeof connectGenesis002;
}>): Genesis002ProductionImportTransport & Readonly<{
  inspectRealm: () => Promise<unknown>;
  close: () => Promise<void>;
}> {
  if (
    !/^[0-9a-f]{64}$/u.test(input.databaseIdentity)
    || input.databaseIdentity === GENESIS_002_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
  ) fail('GENESIS_002_PRODUCTION_TARGET_INVALID');
  const secretLength = new TextEncoder().encode(input.adminSecret).byteLength;
  if (
    secretLength < MIN_SECRET_BYTES
    || secretLength > MAX_SECRET_BYTES
    || /[\u0000-\u0020\u007f]/u.test(input.adminSecret)
  ) fail('GENESIS_002_PRODUCTION_ADMIN_SECRET_INVALID');
  const requestToken_ = input.requestToken ?? requestGenesis002AdminToken;
  const connectDatabase = input.connectDatabase ?? connectGenesis002;
  let connection: Genesis002DbConnection | undefined;
  let closed = false;
  let serialized = Promise.resolve();

  const runSerialized = async <T>(operation: () => Promise<T>): Promise<T> => {
    const prior = serialized;
    let release!: () => void;
    serialized = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try {
      if (closed) fail('GENESIS_002_PRODUCTION_SESSION_CLOSED');
      return await operation();
    } finally {
      release();
    }
  };
  const requireConnection = async (): Promise<DynamicConnection> => {
    if (connection !== undefined && !connection.isDisconnectRequested) {
      return connection as DynamicConnection;
    }
    let token = '';
    try {
      token = await requestToken_(
        GENESIS_002_PRODUCTION_IMPORT_TARGET.bridge,
        input.adminSecret,
      );
      connection = await connectDatabase(input.databaseIdentity, token);
      return connection as DynamicConnection;
    } finally {
      token = '';
    }
  };
  const invalidate = () => {
    disconnect(connection);
    connection = undefined;
  };

  return Object.freeze({
    inspect: () => runSerialized(async () => {
      try {
        const active = await requireConnection();
        const procedure = active.procedures[STATUS_PROCEDURE];
        if (typeof procedure !== 'function') fail('GENESIS_002_PRODUCTION_STATUS_ABI_MISSING');
        return await withGenesis002OperationTimeout(procedure({}));
      } catch (error) {
        invalidate();
        throw error;
      }
    }),
    inspectRealm: () => runSerialized(async () => {
      try {
        const active = await requireConnection();
        const procedure = active.procedures[REALM_STATUS_PROCEDURE];
        if (typeof procedure !== 'function') fail('GENESIS_002_PRODUCTION_STATUS_ABI_MISSING');
        return await withGenesis002OperationTimeout(procedure({}));
      } catch (error) {
        invalidate();
        throw error;
      }
    }),
    prepareSubmission: () => runSerialized(async () => { void await requireConnection(); }),
    submit: (reducer, arguments_, assertCanStartWrite) => runSerialized(async () => {
      if (!Object.values(GENESIS_002_PRODUCTION_IMPORT_REDUCERS).includes(reducer)) {
        fail('GENESIS_002_PRODUCTION_REDUCER_FORBIDDEN');
      }
      try {
        const active = await requireConnection();
        const methodName = reducer.replace(/_([a-z0-9])/gu, (_match, child: string) => (
          child.toUpperCase()
        ));
        const method = active.reducers[methodName];
        if (typeof method !== 'function') fail('GENESIS_002_PRODUCTION_REDUCER_ABI_MISSING');
        assertCanStartWrite();
        await withGenesis002OperationTimeout(method(arguments_));
      } catch (error) {
        // The caller must reconcile through a newly authenticated read.
        invalidate();
        throw error;
      }
    }),
    close: () => runSerialized(async () => {
      invalidate();
      closed = true;
    }),
  });
}
