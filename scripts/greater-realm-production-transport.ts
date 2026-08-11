import { readSync } from 'node:fs';

import type { DbConnection } from '../src/spacetime/module_bindings';
import {
  connect,
  requestAdminToken,
  withOperationTimeout,
} from './hermes-admin';

export const GREATER_REALM_PRODUCTION_TRANSPORT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  bridge: 'https://auth.warpkeep.com',
} as const);

const MAX_SECRET_BYTES = 512;
const MIN_SECRET_BYTES = 32;
const MAXIMUM_SESSION_AGE_MS = 180_000;
const ADMIN_TOKEN_WINDOW_MS = 300_000;
const ADMIN_TOKEN_WINDOW_MAXIMUM = 6;

export class GreaterRealmProductionTransportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionTransportError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmProductionTransportError(code);
}

export function requireGreaterRealmProductionTransportTarget(
  environment: Readonly<Record<string, string | undefined>>,
): typeof GREATER_REALM_PRODUCTION_TRANSPORT_TARGET {
  const overrides = Object.freeze({
    uri: environment.WARPKEEP_SPACETIMEDB_URI,
    database: environment.WARPKEEP_SPACETIMEDB_DATABASE,
    bridge: environment.WARPKEEP_AUTH_BRIDGE_URL,
  });
  if (
    (overrides.uri !== undefined
      && overrides.uri !== GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.uri)
    || (overrides.database !== undefined
      && overrides.database !== GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.database)
    || (overrides.bridge !== undefined
      && overrides.bridge !== GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.bridge)
  ) fail('GREATER_REALM_PRODUCTION_TRANSPORT_TARGET_OVERRIDE_REJECTED');
  return GREATER_REALM_PRODUCTION_TRANSPORT_TARGET;
}

/** The administrator secret is accepted only on a bounded private pipe. */
export function readGreaterRealmProductionAdminSecret(
  environment: Readonly<Record<string, string | undefined>>,
  descriptor = 0,
): string {
  if (
    environment.WARPKEEP_ADMIN_TOKEN_SECRET !== undefined
    || environment.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN !== '1'
  ) fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_STDIN_REQUIRED');
  const bytes = Buffer.alloc(MAX_SECRET_BYTES + 3);
  let total = 0;
  try {
    while (total < bytes.byteLength) {
      const count = readSync(descriptor, bytes, total, bytes.byteLength - total, null);
      if (count === 0) break;
      total += count;
    }
    const newlineBytes = bytes.subarray(Math.max(0, total - 2), total)
      .equals(Buffer.from('\r\n', 'ascii'))
      ? 2
      : bytes[total - 1] === 0x0a ? 1 : 0;
    const secretBytes = bytes.subarray(0, total - newlineBytes);
    if (
      secretBytes.byteLength < MIN_SECRET_BYTES
      || secretBytes.byteLength > MAX_SECRET_BYTES
    ) fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_LENGTH_INVALID');
    let secret: string;
    try {
      secret = new TextDecoder('utf-8', { fatal: true }).decode(secretBytes);
    } catch {
      fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_ENCODING_INVALID');
    }
    if (/[\u0000-\u0020\u007f]/u.test(secret)) {
      fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_CONTROL_CHARACTER_REJECTED');
    }
    return secret;
  } finally {
    bytes.fill(0);
  }
}

function camelCaseWireName(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
    fail('GREATER_REALM_PRODUCTION_TRANSPORT_WIRE_NAME_INVALID');
  }
  return value.replace(/_([a-z0-9])/gu, (_match, child: string) => child.toUpperCase());
}

function disconnect(connection: DbConnection | undefined): void {
  if (connection === undefined || connection.isDisconnectRequested) return;
  try { connection.disconnect(); } catch { /* Preserve the bounded generic result. */ }
}

type DynamicConnection = DbConnection & Readonly<{
  procedures: Readonly<Record<string, (arguments_: unknown) => Promise<unknown>>>;
  reducers: Readonly<Record<string, (arguments_: unknown) => Promise<void>>>;
}>;

/**
 * One owner-scoped, serialized administrator session. A reducer call is never
 * retried. Any operation failure invalidates the connection, so the caller's
 * next explicit reconciliation read obtains one new token and connection.
 */
export type GreaterRealmProductionAdminSession = Readonly<{
  inspect: (statusProcedure: string) => Promise<unknown>;
  submit: (reducer: string, arguments_: Readonly<Record<string, unknown>>) => Promise<void>;
  withConnection: <T>(operation: (connection: DbConnection) => Promise<T>) => Promise<T>;
  /** Force the next operation onto a newly authenticated connection. */
  invalidate: () => Promise<void>;
  close: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

export function createGreaterRealmAdminTransportSession(input: Readonly<{
  adminSecret: string;
  target?: typeof GREATER_REALM_PRODUCTION_TRANSPORT_TARGET;
  requestToken?: typeof requestAdminToken;
  connectDatabase?: typeof connect;
  now?: () => number;
}>): GreaterRealmProductionAdminSession {
  if (
    typeof input.adminSecret !== 'string'
    || new TextEncoder().encode(input.adminSecret).byteLength < MIN_SECRET_BYTES
    || new TextEncoder().encode(input.adminSecret).byteLength > MAX_SECRET_BYTES
  ) fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_LENGTH_INVALID');
  const target = input.target ?? GREATER_REALM_PRODUCTION_TRANSPORT_TARGET;
  if (
    target.uri !== GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.uri
    || target.database !== GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.database
    || target.bridge !== GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.bridge
  ) fail('GREATER_REALM_PRODUCTION_TRANSPORT_TARGET_OVERRIDE_REJECTED');
  const requestToken = input.requestToken ?? requestAdminToken;
  const connectDatabase = input.connectDatabase ?? connect;
  const now = input.now ?? Date.now;
  let adminSecret: string | undefined = input.adminSecret;
  let token: string | undefined;
  let connection: DynamicConnection | undefined;
  let connectedAt = 0;
  let closing = false;
  let closed = false;
  let tail: Promise<void> = Promise.resolve();
  const tokenRequestTimes: number[] = [];

  const invalidate = (): void => {
    disconnect(connection);
    connection = undefined;
    token = undefined;
    connectedAt = 0;
  };

  const currentConnection = async (): Promise<DynamicConnection> => {
    if (closing || closed || adminSecret === undefined) {
      fail('GREATER_REALM_PRODUCTION_TRANSPORT_SESSION_CLOSED');
    }
    const currentTime = now();
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      fail('GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID');
    }
    if (
      connection !== undefined
      && currentTime - connectedAt >= 0
      && currentTime - connectedAt < MAXIMUM_SESSION_AGE_MS
      && !connection.isDisconnectRequested
    ) return connection;
    invalidate();
    while (
      tokenRequestTimes.length > 0
      && currentTime - tokenRequestTimes[0]! >= ADMIN_TOKEN_WINDOW_MS
    ) tokenRequestTimes.shift();
    if (tokenRequestTimes.length >= ADMIN_TOKEN_WINDOW_MAXIMUM) {
      fail('GREATER_REALM_PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED');
    }
    tokenRequestTimes.push(currentTime);
    token = await requestToken(target.bridge, adminSecret);
    connection = await connectDatabase(target.uri, target.database, token) as DynamicConnection;
    connectedAt = currentTime;
    return connection;
  };

  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closing || closed) {
      return Promise.reject(new GreaterRealmProductionTransportError(
        'GREATER_REALM_PRODUCTION_TRANSPORT_SESSION_CLOSED',
      ));
    }
    const result = tail.then(async () => {
      if (closing || closed) fail('GREATER_REALM_PRODUCTION_TRANSPORT_SESSION_CLOSED');
      try {
        return await operation();
      } catch (error) {
        invalidate();
        if (error instanceof GreaterRealmProductionTransportError) throw error;
        fail('GREATER_REALM_PRODUCTION_TRANSPORT_UNAVAILABLE');
      }
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closing = true;
    try {
      await tail;
    } finally {
      invalidate();
      adminSecret = undefined;
      tokenRequestTimes.length = 0;
      closed = true;
      closing = false;
    }
  };

  return Object.freeze({
    inspect: (statusProcedure: string) => serialized(async () => {
      const procedureName = camelCaseWireName(statusProcedure);
      const activeConnection = await currentConnection();
      const procedure = activeConnection.procedures[procedureName];
      if (typeof procedure !== 'function') {
        fail('GREATER_REALM_PRODUCTION_STATUS_PROCEDURE_UNAVAILABLE');
      }
      return withOperationTimeout(procedure({}));
    }),
    submit: (reducerWireName, arguments_) => serialized(async () => {
      const reducerName = camelCaseWireName(reducerWireName);
      const activeConnection = await currentConnection();
      const reducer = activeConnection.reducers[reducerName];
      if (typeof reducer !== 'function') {
        fail('GREATER_REALM_PRODUCTION_REDUCER_UNAVAILABLE');
      }
      await withOperationTimeout(reducer(arguments_));
    }),
    withConnection: <T>(operation: (connection: DbConnection) => Promise<T>) => (
      serialized(async () => operation(await currentConnection()))
    ),
    invalidate: () => serialized(async () => invalidate()),
    close,
    dispose: close,
  });
}

export function bindGreaterRealmProductionStatusTransport(
  session: GreaterRealmProductionAdminSession,
  statusProcedure: string,
): Readonly<{
  inspect: () => Promise<unknown>;
  submit: (reducer: string, arguments_: Readonly<Record<string, unknown>>) => Promise<void>;
}> {
  // Validate before any token request.
  camelCaseWireName(statusProcedure);
  return Object.freeze({
    inspect: () => session.inspect(statusProcedure),
    submit: session.submit,
  });
}

/** Convenience owner for one status procedure; callers must close it. */
export function createGreaterRealmFreshAdminTransport(input: Readonly<{
  adminSecret: string;
  statusProcedure: string;
  target?: typeof GREATER_REALM_PRODUCTION_TRANSPORT_TARGET;
  requestToken?: typeof requestAdminToken;
  connectDatabase?: typeof connect;
  now?: () => number;
}>): ReturnType<typeof bindGreaterRealmProductionStatusTransport> & Readonly<{
  close: () => Promise<void>;
  dispose: () => Promise<void>;
}> {
  const session = createGreaterRealmAdminTransportSession(input);
  return Object.freeze({
    ...bindGreaterRealmProductionStatusTransport(session, input.statusProcedure),
    close: session.close,
    dispose: session.dispose,
  });
}

export const greaterRealmProductionTransportTestSeams = Object.freeze({
  camelCaseWireName,
});
