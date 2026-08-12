import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import type { DbConnection } from '../src/spacetime/module_bindings';
import {
  connect,
  readProductionAdminBridgeTrustedTime,
  requestAdminToken,
  withOperationTimeout,
} from './hermes-admin';
import {
  ensureProductionAdminTokenReservation,
  releaseProductionAdminTokenReservation,
  reserveProductionAdminTokenBudget,
} from './production-admin-token-budget.mjs';
import { GreaterRealmCutoverWriteNotStartedError } from './greater-realm-cutover-write-control';

type GreaterRealmProductionWritePermit = (() => void) & Readonly<{
  markSubmissionUncertain?: () => Promise<void>;
  bindWriteNotStartedError?: (error: unknown) => void;
}>;

export const GREATER_REALM_PRODUCTION_TRANSPORT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  bridge: 'https://auth.warpkeep.com',
} as const);

const MAX_SECRET_BYTES = 512;
const MIN_SECRET_BYTES = 32;
const MAXIMUM_SESSION_AGE_MS = 180_000;
const MAXIMUM_CONTINGENCY_HOLD_MS = 150_000;

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
  descriptor?: number,
): string {
  const descriptorText = environment.WARPKEEP_ADMIN_TOKEN_SECRET_FD;
  const expectedDescriptor = descriptorText === undefined
    ? 0
    : descriptorText === '3' ? 3 : -1;
  if (
    environment.WARPKEEP_ADMIN_TOKEN_SECRET !== undefined
    || expectedDescriptor < 0
    || (descriptorText === undefined) !== (environment.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN === '1')
  ) fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_STDIN_REQUIRED');
  const sourceDescriptor = descriptor ?? expectedDescriptor;
  const bytes = Buffer.alloc(MAX_SECRET_BYTES + 3);
  let total = 0;
  try {
    while (total < bytes.byteLength) {
      const count = readSync(sourceDescriptor, bytes, total, bytes.byteLength - total, null);
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

/**
 * Opens the bootstrap-provided path only at the operator's final local
 * boundary. Callers must remove the path from process.env before provenance,
 * package installation, migration proof, Git, or other child processes run.
 */
export function readGreaterRealmProductionAdminSecretFile(path: string): string {
  let descriptor: number | undefined;
  try {
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) {
      fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_INVALID');
    }
    const beforePath = lstatSync(path, { bigint: true });
    if (
      !beforePath.isFile() || beforePath.isSymbolicLink() || beforePath.nlink !== 1n
      || (beforePath.mode & 0o7777n) !== 0o600n
      || beforePath.size < BigInt(MIN_SECRET_BYTES)
      || beforePath.size > BigInt(MAX_SECRET_BYTES + 2)
      || (process.getuid !== undefined && beforePath.uid !== BigInt(process.getuid()))
    ) fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      opened.dev !== beforePath.dev || opened.ino !== beforePath.ino
      || opened.mode !== beforePath.mode || opened.nlink !== beforePath.nlink
      || opened.size !== beforePath.size || opened.mtimeNs !== beforePath.mtimeNs
      || opened.ctimeNs !== beforePath.ctimeNs
    ) fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_INVALID');
    const secret = readGreaterRealmProductionAdminSecret(
      { WARPKEEP_ADMIN_TOKEN_SECRET_FD: '3' },
      descriptor,
    );
    const after = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      after.dev !== opened.dev || after.ino !== opened.ino || after.mode !== opened.mode
      || after.nlink !== opened.nlink || after.size !== opened.size
      || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs
      || afterPath.dev !== opened.dev || afterPath.ino !== opened.ino
      || afterPath.mode !== opened.mode || afterPath.nlink !== opened.nlink
      || afterPath.size !== opened.size || afterPath.mtimeNs !== opened.mtimeNs
      || afterPath.ctimeNs !== opened.ctimeNs
    ) fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_CHANGED');
    return secret;
  } catch (error) {
    if (error instanceof GreaterRealmProductionTransportError) throw error;
    return fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
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
  submit: (
    reducer: string,
    arguments_: Readonly<Record<string, unknown>>,
    assertCanStartWrite: GreaterRealmProductionWritePermit,
  ) => Promise<void>;
  withConnection: <T>(operation: (connection: DbConnection) => Promise<T>) => Promise<T>;
  /** Pre-mint the one-use postflight credential before any external write. */
  prepareSubmission: () => Promise<void>;
  /** Force the next operation onto a newly authenticated connection. */
  invalidate: () => Promise<void>;
  close: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

export type GreaterRealmProductionTokenBudget = Readonly<{
  reserve: (
    slots: number,
    trustedNowMs: number,
  ) => Promise<Readonly<{ reservationId: string; remaining: number }>>;
  ensure: (
    reservationId: string,
    minimumRemaining: number,
    trustedNowMs: number,
  ) => Promise<Readonly<{ reservationId: string; remaining: number }>>;
  release: (
    reservationId: string,
    trustedNowMs: number,
  ) => Promise<Readonly<{ reservationId: string; released: number }>>;
}>;

const productionTokenBudget: GreaterRealmProductionTokenBudget = Object.freeze({
  reserve: (slots, trustedNowMs) => reserveProductionAdminTokenBudget({
    slots,
    now: () => trustedNowMs,
  }),
  ensure: (reservationId, minimumRemaining, trustedNowMs) => ensureProductionAdminTokenReservation({
    reservationId,
    minimumRemaining,
    now: () => trustedNowMs,
  }),
  release: (reservationId, trustedNowMs) => releaseProductionAdminTokenReservation({
    reservationId,
    now: () => trustedNowMs,
  }),
});

export function createGreaterRealmAdminTransportSession(input: Readonly<{
  adminSecret: string;
  target?: typeof GREATER_REALM_PRODUCTION_TRANSPORT_TARGET;
  requestToken?: typeof requestAdminToken;
  connectDatabase?: typeof connect;
  now?: () => number;
  tokenBudget?: GreaterRealmProductionTokenBudget;
  readTrustedTime?: typeof readProductionAdminBridgeTrustedTime;
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
  if (
    input.requestToken !== undefined
    && (input.tokenBudget === undefined || input.readTrustedTime === undefined)
  ) {
    fail('GREATER_REALM_PRODUCTION_TOKEN_BUDGET_TEST_DEPENDENCY_REQUIRED');
  }
  const tokenBudget = input.tokenBudget ?? productionTokenBudget;
  const readTrustedTime = input.readTrustedTime ?? readProductionAdminBridgeTrustedTime;
  const now = input.now ?? Date.now;
  let adminSecret: string | undefined = input.adminSecret;
  let heldPostflightToken: string | undefined;
  let heldPostflightTokenMintedAt = 0;
  let connection: DynamicConnection | undefined;
  let connectedAt = 0;
  let closing = false;
  let closed = false;
  let tail: Promise<void> = Promise.resolve();
  let tokenReservationId: string | undefined;
  let tokenReservationRemaining = 0;
  let lastTrustedBudgetTimeMs: number | undefined;

  const invalidate = (discardHeldToken = false): void => {
    disconnect(connection);
    connection = undefined;
    connectedAt = 0;
    if (discardHeldToken) {
      heldPostflightToken = undefined;
      heldPostflightTokenMintedAt = 0;
    }
  };

  const ensureReservation = async (
    minimumRemaining: number,
    trustedNowMs: number,
  ): Promise<string> => {
    lastTrustedBudgetTimeMs = trustedNowMs;
    if (tokenReservationId === undefined) {
      const reservation = await tokenBudget.reserve(
        Math.max(2, minimumRemaining),
        trustedNowMs,
      );
      tokenReservationId = reservation.reservationId;
      tokenReservationRemaining = reservation.remaining;
      return tokenReservationId;
    }
    if (tokenReservationRemaining < minimumRemaining) {
      const reservation = await tokenBudget.ensure(
        tokenReservationId,
        minimumRemaining,
        trustedNowMs,
      );
      tokenReservationRemaining = reservation.remaining;
    }
    return tokenReservationId;
  };

  const reusableConnection = (currentTime: number): boolean => (
    connection !== undefined
    && currentTime - connectedAt >= 0
    && currentTime - connectedAt < MAXIMUM_SESSION_AGE_MS
    && !connection.isDisconnectRequested
  );

  const requestFreshToken = async (): Promise<Readonly<{
    token: string;
    mintedAt: number;
  }>> => {
    const trustedNowMs = await readTrustedTime(target.bridge);
    if (!Number.isSafeInteger(trustedNowMs) || trustedNowMs < 0) {
      fail('GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID');
    }
    const reservationId = await ensureReservation(
      tokenReservationId === undefined ? 2 : 1,
      trustedNowMs,
    );
    tokenReservationRemaining = Math.max(0, tokenReservationRemaining - 1);
    const mintedAt = now();
    if (!Number.isFinite(mintedAt) || mintedAt < 0) {
      fail('GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID');
    }
    const freshToken = await requestToken(
      target.bridge,
      adminSecret!,
      undefined,
      { reservationId, trustedNowMs },
    );
    return Object.freeze({ token: freshToken, mintedAt });
  };

  const currentConnection = async (): Promise<DynamicConnection> => {
    if (closing || closed || adminSecret === undefined) {
      fail('GREATER_REALM_PRODUCTION_TRANSPORT_SESSION_CLOSED');
    }
    const currentTime = now();
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      fail('GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID');
    }
    const reusable = reusableConnection(currentTime);
    if (reusable) return connection!;
    invalidate();
    const usedHeldToken = heldPostflightToken !== undefined;
    const fresh = heldPostflightToken === undefined
      ? await requestFreshToken()
      : Object.freeze({ token: heldPostflightToken, mintedAt: heldPostflightTokenMintedAt });
    if (
      usedHeldToken
      && (
        currentTime < fresh.mintedAt
        || currentTime - fresh.mintedAt >= MAXIMUM_SESSION_AGE_MS
      )
    ) {
      heldPostflightToken = undefined;
      heldPostflightTokenMintedAt = 0;
      fail('GREATER_REALM_PRODUCTION_CONTINGENCY_TOKEN_EXPIRED');
    }
    let nextToken = fresh.token;
    heldPostflightToken = undefined;
    heldPostflightTokenMintedAt = 0;
    try {
      connection = await connectDatabase(
        target.uri,
        target.database,
        nextToken,
      ) as DynamicConnection;
    } finally {
      // The SDK connection owns the authenticated session after connect.
      // Do not retain a duplicate immutable JWT in operator state.
      nextToken = '';
    }
    connectedAt = currentTime;
    return connection;
  };

  const prepareSubmission = async (): Promise<void> => {
    await currentConnection();
    const currentTime = now();
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      fail('GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID');
    }
    if (heldPostflightToken !== undefined) {
      if (currentTime < heldPostflightTokenMintedAt) {
        fail('GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID');
      }
      if (currentTime - heldPostflightTokenMintedAt < MAXIMUM_CONTINGENCY_HOLD_MS) return;
    }
    const replacement = await requestFreshToken();
    heldPostflightToken = replacement.token;
    heldPostflightTokenMintedAt = replacement.mintedAt;
  };

  const serialized = <T>(
    operation: () => Promise<T>,
    preserveError?: (error: unknown) => boolean,
  ): Promise<T> => {
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
        const preserved = preserveError?.(error) === true;
        if (!preserved) invalidate();
        if (
          error instanceof GreaterRealmProductionTransportError
          || preserved
        ) throw error;
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
      invalidate(true);
      adminSecret = undefined;
      const reservationId = tokenReservationId;
      tokenReservationId = undefined;
      tokenReservationRemaining = 0;
      try {
        if (reservationId !== undefined) {
          if (lastTrustedBudgetTimeMs === undefined) {
            fail('GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID');
          }
          await tokenBudget.release(reservationId, lastTrustedBudgetTimeMs);
        }
      } finally {
        closed = true;
        closing = false;
      }
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
    submit: (reducerWireName, arguments_, assertCanStartWrite) => {
      if (typeof assertCanStartWrite !== 'function') {
        return Promise.reject(new GreaterRealmProductionTransportError(
          'GREATER_REALM_PRODUCTION_WRITE_CONTROL_REQUIRED',
        ));
      }
      let permitRejected = false;
      let permitError: unknown;
      return serialized(async () => {
        let reducer: ((arguments_: unknown) => Promise<unknown>) | undefined;
        try {
          const reducerName = camelCaseWireName(reducerWireName);
          await prepareSubmission();
          const activeConnection = await currentConnection();
          const candidate = activeConnection.reducers[reducerName];
          if (typeof candidate !== 'function') {
            fail('GREATER_REALM_PRODUCTION_REDUCER_UNAVAILABLE');
          }
          reducer = candidate;
        } catch (cause) {
          const error = new GreaterRealmCutoverWriteNotStartedError(
            'GREATER_REALM_PRODUCTION_SUBMISSION_PREPARATION_FAILED',
          );
          Object.defineProperty(error, 'cause', {
            value: cause,
            configurable: false,
            enumerable: false,
            writable: false,
          });
          assertCanStartWrite.bindWriteNotStartedError?.(error);
          permitRejected = true;
          permitError = error;
          throw error;
        }
        try {
          await assertCanStartWrite.markSubmissionUncertain?.();
        } catch (error) {
          permitRejected = true;
          permitError = error;
          throw error;
        }
        // Synchronous credential/SDK preparation can defer delivery of an OS
        // signal. Give the signal handlers one turn, then keep the permit check
        // immediately adjacent to the one non-repeatable reducer invocation.
        await new Promise<void>(resolveTick => setImmediate(resolveTick));
        try {
          assertCanStartWrite();
        } catch (error) {
          permitRejected = true;
          permitError = error;
          throw error;
        }
        try {
          await withOperationTimeout(reducer(arguments_));
        } catch (error) {
          // The serialized boundary preserves the pre-minted contingency while
          // invalidating this ambiguous primary connection.
          throw error;
        }
      }, error => permitRejected && error === permitError);
    },
    withConnection: <T>(operation: (connection: DbConnection) => Promise<T>) => (
      serialized(async () => operation(await currentConnection()))
    ),
    prepareSubmission: () => serialized(prepareSubmission),
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
  submit: (
    reducer: string,
    arguments_: Readonly<Record<string, unknown>>,
    assertCanStartWrite: () => void,
  ) => Promise<void>;
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
  tokenBudget?: GreaterRealmProductionTokenBudget;
  readTrustedTime?: typeof readProductionAdminBridgeTrustedTime;
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
