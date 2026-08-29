import {
  DbConnection,
  type DbConnection as PtrDbConnection,
} from '../spacetimedb/ptr/generated-bindings';
import {
  requestPtrProductionAdminToken,
} from './ptr-production-admin-token';

export const PTR_PRODUCTION_TRANSPORT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  genesis001DatabaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
} as const);

export const PTR_PRODUCTION_ALLOWED_REDUCERS = Object.freeze([
  'admin_stage_greater_realm_release_v1',
  'admin_import_greater_realm_components_v1',
  'admin_import_greater_realm_regions_v1',
  'admin_import_greater_realm_chunk_v1',
  'admin_begin_greater_realm_verification_v1',
  'admin_verify_greater_realm_batch_v1',
  'admin_finalize_greater_realm_release_v1',
  'admin_provision_ptr_owner_v1',
] as const);

const SHA256 = /^[0-9a-f]{64}$/u;
const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_SECRET_BYTES = 512;
const CONNECT_TIMEOUT_MILLISECONDS = 10_000;
const OPERATION_TIMEOUT_MILLISECONDS = 15_000;

type PtrProductionReducer = typeof PTR_PRODUCTION_ALLOWED_REDUCERS[number];
type RequestToken = (secret: string) => Promise<string>;
type DynamicConnection = PtrDbConnection & Readonly<{
  procedures: Readonly<Record<string, (arguments_: unknown) => Promise<unknown>>>;
  reducers: Readonly<Record<string, (arguments_: unknown) => Promise<void>>>;
}>;

export class PtrProductionTransportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PtrProductionTransportError';
  }
}

function fail(code: string): never {
  throw new PtrProductionTransportError(code);
}

function operationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PtrProductionTransportError(
      'PTR_PRODUCTION_OPERATION_OUTCOME_AMBIGUOUS',
    )), OPERATION_TIMEOUT_MILLISECONDS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function connectPtrProduction(
  databaseIdentity: string,
  token: string,
): Promise<PtrDbConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pending: PtrDbConnection | undefined;
    const finish = (effect: () => void): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      effect();
      return true;
    };
    const unavailable = () => {
      if (!finish(() => reject(new PtrProductionTransportError(
        'PTR_PRODUCTION_CONNECTION_UNAVAILABLE',
      )))) return;
      try { pending?.disconnect(); } catch { /* Preserve the bounded error. */ }
      pending = undefined;
    };
    const timer = setTimeout(unavailable, CONNECT_TIMEOUT_MILLISECONDS);
    try {
      const connection = DbConnection.builder()
        .withUri(PTR_PRODUCTION_TRANSPORT_TARGET.uri)
        .withDatabaseName(databaseIdentity)
        .withToken(token)
        .onConnect(value => {
          if (finish(() => resolve(value))) pending = undefined;
          else {
            try { value.disconnect(); } catch { /* Connection was rejected. */ }
          }
        })
        .onConnectError(unavailable)
        .build();
      if (settled) {
        try { connection.disconnect(); } catch { /* Preserve the error. */ }
      } else pending = connection;
    } catch {
      unavailable();
    }
  });
}

function disconnect(connection: PtrDbConnection | undefined): void {
  if (connection === undefined || connection.isDisconnectRequested) return;
  try { connection.disconnect(); } catch { /* Cleanup cannot mask the result. */ }
}

function validSecret(secret: string): boolean {
  const length = Buffer.byteLength(secret, 'utf8');
  return length >= MINIMUM_SECRET_BYTES
    && length <= MAXIMUM_SECRET_BYTES
    && !/[\u0000-\u0020\u007f]/u.test(secret);
}

function validTarget(
  databaseIdentity: string,
  disallowedDatabaseIdentities: readonly string[],
): boolean {
  return SHA256.test(databaseIdentity)
    && databaseIdentity !== PTR_PRODUCTION_TRANSPORT_TARGET.genesis001DatabaseIdentity
    && disallowedDatabaseIdentities.every(identity => SHA256.test(identity))
    && !disallowedDatabaseIdentities.includes(databaseIdentity);
}

export type PtrProductionTransport = Readonly<{
  inspect: () => Promise<unknown>;
  prepareSubmission: () => Promise<void>;
  submit: (
    reducer: PtrProductionReducer,
    arguments_: Readonly<Record<string, unknown>>,
    assertCanStartWrite: () => void,
  ) => Promise<void>;
  close: () => Promise<void>;
}>;

/** A single serialized administrator session with no retry after mutation. */
export function createPtrProductionTransport(input: Readonly<{
  databaseIdentity: string;
  adminSecret: string;
  disallowedDatabaseIdentities: readonly string[];
  requestToken?: RequestToken;
  connectDatabase?: typeof connectPtrProduction;
}>): PtrProductionTransport {
  const databaseIdentity = input.databaseIdentity;
  const suppliedAdminSecret = input.adminSecret;
  const disallowedDatabaseIdentities = input.disallowedDatabaseIdentities;
  const requestToken = input.requestToken ?? requestPtrProductionAdminToken;
  const connectDatabase = input.connectDatabase ?? connectPtrProduction;
  if (
    !Array.isArray(disallowedDatabaseIdentities)
    || !validTarget(databaseIdentity, disallowedDatabaseIdentities)
    || !validSecret(suppliedAdminSecret)
  ) fail('PTR_PRODUCTION_TARGET_INVALID');
  let adminSecret = suppliedAdminSecret;
  let connection: PtrDbConnection | undefined;
  let closed = false;
  let serialized = Promise.resolve();

  const runSerialized = async <T>(operation: () => Promise<T>): Promise<T> => {
    const prior = serialized;
    let release!: () => void;
    serialized = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try {
      if (closed) fail('PTR_PRODUCTION_SESSION_CLOSED');
      return await operation();
    } finally {
      release();
    }
  };
  const invalidate = (): void => {
    disconnect(connection);
    connection = undefined;
  };
  const requireConnection = async (): Promise<DynamicConnection> => {
    if (connection !== undefined && !connection.isDisconnectRequested) {
      return connection as DynamicConnection;
    }
    let token = '';
    try {
      token = await requestToken(adminSecret);
      connection = await connectDatabase(databaseIdentity, token);
      return connection as DynamicConnection;
    } finally {
      token = '';
    }
  };

  return Object.freeze({
    inspect: () => runSerialized(async () => {
      try {
        const active = await requireConnection();
        const procedure = active.procedures.adminGetGreaterRealmStatusV1;
        if (typeof procedure !== 'function') {
          fail('PTR_PRODUCTION_STATUS_ABI_MISSING');
        }
        return await operationTimeout(procedure({}));
      } catch (error) {
        invalidate();
        if (error instanceof PtrProductionTransportError) throw error;
        return fail('PTR_PRODUCTION_INSPECTION_UNAVAILABLE');
      }
    }),
    prepareSubmission: () => runSerialized(async () => {
      try {
        void await requireConnection();
      } catch (error) {
        invalidate();
        if (error instanceof PtrProductionTransportError) throw error;
        return fail('PTR_PRODUCTION_CONNECTION_UNAVAILABLE');
      }
    }),
    submit: (reducer, arguments_, assertCanStartWrite) => runSerialized(async () => {
      if (!PTR_PRODUCTION_ALLOWED_REDUCERS.includes(reducer)) {
        fail('PTR_PRODUCTION_REDUCER_FORBIDDEN');
      }
      try {
        const active = await requireConnection();
        const methodName = reducer.replace(
          /_([a-z0-9])/gu,
          (_match, child: string) => child.toUpperCase(),
        );
        const method = active.reducers[methodName];
        if (typeof method !== 'function') {
          fail('PTR_PRODUCTION_REDUCER_ABI_MISSING');
        }
        assertCanStartWrite();
        await operationTimeout(method(arguments_));
      } catch (error) {
        invalidate();
        if (error instanceof PtrProductionTransportError) throw error;
        return fail('PTR_PRODUCTION_OPERATION_OUTCOME_AMBIGUOUS');
      }
    }),
    close: async () => {
      const prior = serialized;
      await prior;
      if (closed) return;
      closed = true;
      adminSecret = '';
      invalidate();
    },
  });
}
