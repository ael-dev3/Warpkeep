import { DbConnection } from '../../spacetimedb/ptr/generated-bindings/index';

import {
  GREATER_REALM_PUBLIC_PROCEDURES,
  type GreaterRealmProcedureInvoker,
} from '../greater-realm/greaterRealmTransport';
import {
  isCurrentPtrRealmAuthority,
  readPtrRealmPrivateJwtForConnection,
  PTR_REALM_ID,
  type PtrRealmAuthority,
} from './ptrRealmAuthClient';
import {
  PTR_SPACETIME_URI,
  type AvailablePtrRealmConfig,
} from './ptrRealmConfig';

const DATABASE_IDENTITY = /^[a-f0-9]{64}$/u;
const DEFAULT_HANDSHAKE_TIMEOUT_MILLISECONDS = 15_000;
const MAXIMUM_HANDSHAKE_TIMEOUT_MILLISECONDS = 30_000;

export type PtrRealmConnectionFailureCode =
  | 'configuration-unavailable'
  | 'authority-unavailable'
  | 'cancelled'
  | 'handshake-timeout'
  | 'transport-unavailable';

const connectionFailureCodes = new WeakMap<Error, PtrRealmConnectionFailureCode>();

export class PtrRealmConnectionError extends Error {
  override readonly name = 'PtrRealmConnectionError';

  constructor() {
    super('PTR connection is unavailable.');
  }
}

function connectionFailure(code: PtrRealmConnectionFailureCode): PtrRealmConnectionError {
  const error = new PtrRealmConnectionError();
  connectionFailureCodes.set(error, code);
  return error;
}

export function ptrRealmConnectionFailureCode(
  error: unknown,
): PtrRealmConnectionFailureCode | null {
  return error instanceof PtrRealmConnectionError
    ? connectionFailureCodes.get(error) ?? 'transport-unavailable'
    : null;
}

export type PtrRealmConnectionLike = Pick<
  InstanceType<typeof DbConnection>,
  'procedures' | 'disconnect' | 'isDisconnectRequested'
>;

export type PtrRealmConnectionBuilder = Readonly<{
  withUri: (uri: string) => PtrRealmConnectionBuilder;
  withDatabaseName: (databaseIdentity: string) => PtrRealmConnectionBuilder;
  withToken: (token: string) => PtrRealmConnectionBuilder;
  onConnect: (callback: (
    connection: PtrRealmConnectionLike,
    identity: unknown,
    serverIssuedToken: string,
  ) => void) => PtrRealmConnectionBuilder;
  onConnectError: (callback: (context: unknown, error: unknown) => void) => PtrRealmConnectionBuilder;
  onDisconnect: (callback: (
    connection: PtrRealmConnectionLike,
    error?: unknown,
  ) => void) => PtrRealmConnectionBuilder;
  build: () => PtrRealmConnectionLike;
}>;

export type PtrRealmConnectionSession = Readonly<{
  realmId: typeof PTR_REALM_ID;
  generation: number;
}>;

type PrivateSession = {
  authority: PtrRealmAuthority;
  connection: PtrRealmConnectionLike;
  generation: number;
  signal: AbortSignal;
  active: boolean;
  notified: boolean;
  onTransportFailure?: (failure: PtrRealmConnectionFailureCode) => void;
};

const privateSessions = new WeakMap<object, PrivateSession>();

function requestDisconnect(connection: PtrRealmConnectionLike) {
  try {
    if (!connection.isDisconnectRequested) connection.disconnect();
  } catch {
    // A stale SDK socket cannot widen PTR authority or block local teardown.
  }
}

function retireSession(
  session: PtrRealmConnectionSession,
  notify: boolean,
  disconnect: boolean,
) {
  const details = privateSessions.get(session);
  if (!details || !details.active) return;
  details.active = false;
  if (disconnect) requestDisconnect(details.connection);
  if (notify && !details.notified) {
    details.notified = true;
    try {
      details.onTransportFailure?.('transport-unavailable');
    } catch {
      // Presentation diagnostics never change fail-closed teardown.
    }
  }
}

export function closePtrRealmConnectionSession(session: PtrRealmConnectionSession | undefined) {
  if (session) retireSession(session, false, true);
}

/** Internal presentation seam: malformed atlas data retires the whole PTR authority. */
export function reportPtrRealmTransportFailure(session: PtrRealmConnectionSession) {
  retireSession(session, true, true);
}

export function isCurrentPtrRealmConnectionSession(
  session: unknown,
  authority?: PtrRealmAuthority,
  now = Date.now(),
): session is PtrRealmConnectionSession {
  if (typeof session !== 'object' || session === null) return false;
  const details = privateSessions.get(session);
  if (
    !details
    || !details.active
    || details.signal.aborted
    || (authority !== undefined && details.authority !== authority)
    || !isCurrentPtrRealmAuthority(details.authority, now)
  ) return false;
  const candidate = session as Partial<PtrRealmConnectionSession>;
  return candidate.realmId === PTR_REALM_ID
    && candidate.generation === details.generation
    && Number.isSafeInteger(candidate.generation)
    && (candidate.generation ?? 0) > 0;
}

export type ConnectPtrRealmOptions = Readonly<{
  config: AvailablePtrRealmConfig;
  authority: PtrRealmAuthority;
  generation: number;
  signal: AbortSignal;
  now?: () => number;
  handshakeTimeoutMs?: number;
  onTransportFailure?: (failure: PtrRealmConnectionFailureCode) => void;
  builderFactory?: () => PtrRealmConnectionBuilder;
}>;

function validConnectionConfig(
  config: AvailablePtrRealmConfig,
  authority: PtrRealmAuthority,
) {
  return config.availability === 'available'
    && config.enabled === true
    && config.spacetimeUri === PTR_SPACETIME_URI
    && DATABASE_IDENTITY.test(config.databaseIdentity)
    && authority.databaseIdentity === config.databaseIdentity;
}

export function connectPtrRealm(
  options: ConnectPtrRealmOptions,
): Promise<PtrRealmConnectionSession> {
  const now = options.now ?? Date.now;
  const timestamp = now();
  if (
    !validConnectionConfig(options.config, options.authority)
    || !Number.isSafeInteger(options.generation)
    || options.generation < 1
    || !(options.signal instanceof AbortSignal)
    || !Number.isSafeInteger(timestamp)
    || timestamp < 0
  ) return Promise.reject(connectionFailure('configuration-unavailable'));
  if (
    options.signal.aborted
    || !isCurrentPtrRealmAuthority(options.authority, timestamp)
  ) return Promise.reject(connectionFailure(
    options.signal.aborted ? 'cancelled' : 'authority-unavailable',
  ));
  const privateJwt = readPtrRealmPrivateJwtForConnection(
    options.authority,
    timestamp,
  );
  if (!privateJwt) return Promise.reject(connectionFailure('authority-unavailable'));
  const handshakeTimeoutMs = options.handshakeTimeoutMs
    ?? DEFAULT_HANDSHAKE_TIMEOUT_MILLISECONDS;
  if (
    !Number.isSafeInteger(handshakeTimeoutMs)
    || handshakeTimeoutMs < 1
    || handshakeTimeoutMs > MAXIMUM_HANDSHAKE_TIMEOUT_MILLISECONDS
  ) {
    return Promise.reject(connectionFailure('configuration-unavailable'));
  }

  return new Promise((resolve, reject) => {
    let outcome: 'pending' | 'resolved' | 'failed' = 'pending';
    let building = true;
    let builtConnection: PtrRealmConnectionLike | undefined;
    let earlyConnection: PtrRealmConnectionLike | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<PtrRealmConnectionLike>();
    let session: PtrRealmConnectionSession | undefined;

    const clear = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      options.signal.removeEventListener('abort', abort);
    };
    const closeSeen = () => {
      for (const connection of seen) requestDisconnect(connection);
    };
    const fail = (code: PtrRealmConnectionFailureCode) => {
      if (outcome !== 'pending') return;
      outcome = 'failed';
      clear();
      closeSeen();
      reject(connectionFailure(code));
    };
    const handshakeFailed = () => outcome === 'failed';
    const abort = () => fail('cancelled');
    const accept = (connection: PtrRealmConnectionLike) => {
      seen.add(connection);
      if (outcome !== 'pending') {
        requestDisconnect(connection);
        return;
      }
      if (building) {
        if (earlyConnection && earlyConnection !== connection) {
          seen.add(earlyConnection);
          fail('transport-unavailable');
          return;
        }
        earlyConnection = connection;
        return;
      }
      if (
        connection !== builtConnection
        || options.signal.aborted
        || !isCurrentPtrRealmAuthority(options.authority, now())
      ) {
        fail(options.signal.aborted ? 'cancelled' : 'transport-unavailable');
        return;
      }
      outcome = 'resolved';
      clear();
      session = Object.freeze({
        realmId: PTR_REALM_ID,
        generation: options.generation,
      });
      privateSessions.set(session, {
        authority: options.authority,
        connection,
        generation: options.generation,
        signal: options.signal,
        active: true,
        notified: false,
        onTransportFailure: options.onTransportFailure,
      });
      resolve(session);
    };

    options.signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => fail('handshake-timeout'), handshakeTimeoutMs);

    try {
      const builderFactory = options.builderFactory
        ?? (() => DbConnection.builder() as unknown as PtrRealmConnectionBuilder);
      const builder = builderFactory()
        .withUri(PTR_SPACETIME_URI)
        .withDatabaseName(options.config.databaseIdentity)
        .withToken(privateJwt)
        .onDisconnect((connection) => {
          seen.add(connection);
          if (outcome === 'pending') {
            fail('transport-unavailable');
          } else if (outcome === 'resolved' && session) {
            retireSession(session, true, false);
          }
        })
        .onConnect((connection, _identity, _serverIssuedToken) => {
          // The server-issued SDK token is deliberately ignored and never retained.
          accept(connection);
        })
        .onConnectError((_context, _error) => {
          if (outcome === 'pending') fail('transport-unavailable');
          else if (outcome === 'resolved' && session) {
            retireSession(session, true, true);
          }
        });
      builtConnection = builder.build();
      seen.add(builtConnection);
      building = false;
      if (earlyConnection) accept(earlyConnection);
      if (handshakeFailed()) requestDisconnect(builtConnection);
    } catch {
      building = false;
      fail('transport-unavailable');
    }
  });
}

function ptrProcedureUnavailable() {
  return new Error('PTR atlas procedure is unavailable.');
}

function assertLiveInvocation(
  session: PtrRealmConnectionSession,
  authority: PtrRealmAuthority,
  signal: AbortSignal,
  now: () => number,
): PrivateSession {
  if (
    signal.aborted
    || !isCurrentPtrRealmConnectionSession(session, authority, now())
  ) throw ptrProcedureUnavailable();
  const details = privateSessions.get(session);
  if (!details) throw ptrProcedureUnavailable();
  return details;
}

function awaitInvocation<T>(
  operation: Promise<T>,
  signals: readonly AbortSignal[],
): Promise<T> {
  if (signals.some(signal => signal.aborted)) return Promise.reject(ptrProcedureUnavailable());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      for (const signal of signals) signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => finish(() => reject(ptrProcedureUnavailable()));
    for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
    void operation.then(
      value => finish(() => resolve(value)),
      () => finish(() => reject(ptrProcedureUnavailable())),
    );
  });
}

export function createPtrRealmProcedureInvoker(
  session: PtrRealmConnectionSession,
  authority: PtrRealmAuthority,
  now: () => number = Date.now,
): GreaterRealmProcedureInvoker {
  return Object.freeze({
    call: async (procedure, input, signal) => {
      const details = assertLiveInvocation(session, authority, signal, now);
      try {
        let operation: Promise<unknown>;
        switch (procedure) {
          case GREATER_REALM_PUBLIC_PROCEDURES.bootstrap:
            operation = details.connection.procedures.getRealmAtlasBootstrapV1({});
            break;
          case GREATER_REALM_PUBLIC_PROCEDURES.window:
            operation = details.connection.procedures.getRealmAtlasWindowV1({
              centerQ: input.centerQ as number,
              centerR: input.centerR as number,
              radius: input.radius as number,
              expectedRevision: input.expectedRevision as bigint,
            });
            break;
          case GREATER_REALM_PUBLIC_PROCEDURES.chunk:
            operation = details.connection.procedures.getRealmAtlasChunkV1({
              chunkHandle: input.chunkHandle as string,
              lod: input.lod as number,
              expectedRevision: input.expectedRevision as bigint,
            });
            break;
          case GREATER_REALM_PUBLIC_PROCEDURES.resourceLocations:
            operation = details.connection.procedures.getRealmAtlasResourceLocationsV1({
              chunkHandles: input.chunkHandles as string[],
              expectedRevision: input.expectedRevision as bigint,
            });
            break;
          case GREATER_REALM_PUBLIC_PROCEDURES.planRoute:
            operation = details.connection.procedures.planRealmRouteV1({
              originCellKey: input.originCellKey as string,
              destinationCellKey: input.destinationCellKey as string,
              offset: input.offset as number,
              limit: input.limit as number,
              expectedRevision: input.expectedRevision as bigint,
            });
            break;
          default:
            throw ptrProcedureUnavailable();
        }
        const result = await awaitInvocation(operation, [signal, details.signal]);
        assertLiveInvocation(session, authority, signal, now);
        return result;
      } catch {
        if (!signal.aborted && !details.signal.aborted && details.active) {
          retireSession(session, true, true);
        }
        throw ptrProcedureUnavailable();
      }
    },
  });
}
