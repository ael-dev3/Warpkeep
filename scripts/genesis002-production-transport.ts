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
const OPERATION_TIMEOUT_MILLISECONDS = 15_000;
const STATUS_PROCEDURE = 'adminGetGreaterRealmStatusV1';
const REALM_STATUS_PROCEDURE = 'getRealmStatusV1';

type RequestAdminToken = (
  bridge: string,
  secret: string,
) => Promise<string>;

async function requestGenesis002AdminToken(
  bridge: string,
  secret: string,
): Promise<string> {
  // Keep the large legacy Hermes mutation surface out of the G002 module load.
  // The default live path still delegates token issuance and its persistent
  // attempt budget to the existing production-reviewed implementation.
  const hermes = await import('./hermes-admin');
  return hermes.requestAdminToken(bridge, secret);
}

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

export function takeGenesis002ProductionAdminSecret(
  environment: NodeJS.ProcessEnv,
): string {
  const secret = environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  const length = typeof secret === 'string'
    ? new TextEncoder().encode(secret).byteLength
    : 0;
  if (
    typeof secret !== 'string'
    || length < MIN_SECRET_BYTES
    || length > MAX_SECRET_BYTES
    || /[\u0000-\u0020\u007f]/u.test(secret)
  ) fail('GENESIS_002_PRODUCTION_ADMIN_SECRET_INVALID');
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
