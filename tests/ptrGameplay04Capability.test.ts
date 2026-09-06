/// <reference lib="es2024.promise" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BinaryWriter } from 'spacetimedb';
import { DbConnection } from '../spacetimedb/ptr/generated-bindings';
import { createPtrRealmAuthClient } from '../src/ptr/ptrRealmAuthClient';
import {
  closePtrRealmConnectionSession, connectPtrRealm, createPtrGameplay04Capability,
  isCurrentPtrGameplay04Capability, isCurrentPtrRealmConnectionSession,
  type PtrGameplay04Capability, type PtrRealmConnectionBuilder, type PtrRealmConnectionLike,
} from '../src/ptr/ptrRealmConnection';
import { classifyGameplay04Error, Gameplay04ClientError } from '../src/ptr/gameplay04/ptrGameplay04Errors';
import type { Mutation04, ReadWire04, ResultWire04 } from '../src/ptr/gameplay04/ptrGameplay04Types';
import { EMPTY_WIRE04 } from './fixtures/gameplay04Client';

const NOW = 1_788_000_000_000;
const DATABASE_IDENTITY = 'd'.repeat(64);
const SDK_TOKEN = 'SERVER_ISSUED_TOKEN_MUST_BE_IGNORED';
const RESULT: ResultWire04 = { sequence: 1n, revision: 1n };
const base = { sequence: 1n, requestKey: `g04:1:${'a'.repeat(32)}`,
  expectedRevision: 0n, policyVersion: EMPTY_WIRE04.policyVersion };
const operations = [
  { name: 'getGameplay04KeepV1', command: undefined, input: {}, result: EMPTY_WIRE04 },
  { name: 'initializeGameplay04KeepV1', command: { kind: 'initialize', input: base }, input: base, result: RESULT },
  { name: 'dispatchGameplay04WorkerV1', command: { kind: 'dispatch', input: {
    ...base, expectedAtlasRevision: 1n, workerOrdinal: 0, locationId: 'location',
    resource: 'wood', gatheringDurationMicros: 30_000_000n,
  } }, result: RESULT },
  { name: 'recallGameplay04WorkerV1', command: { kind: 'recall', input: {
    ...base, expectedAtlasRevision: 1n, workerOrdinal: 0,
  } }, result: RESULT },
  { name: 'startGameplay04BuildingV1', command: { kind: 'build', input: {
    ...base, expectedAtlasRevision: 1n, layoutDigest: EMPTY_WIRE04.layoutDigest,
    kind: 'mill', targetLevel: 1, x: 0n, z: 0n, rotation: 0,
    expectedCost: { food: 0n, wood: 100n, stone: 50n, gold: 0n }, expectedDurationMicros: 120_000_000n,
  } }, result: RESULT },
] satisfies ReadonlyArray<{ name: keyof PtrRealmConnectionLike['procedures']; command: Mutation04 | undefined;
  input?: unknown; result: ReadWire04 | ResultWire04 }>;

function segment(value: unknown) {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function issuedAuthority() {
  const seconds = NOW / 1_000;
  const jwt = `${segment({ alg: 'ES256', typ: 'JWT', kid: 'ptr-test-key' })}.${segment({
    iss: 'https://auth.warpkeep.com', sub: 'farcaster:12345', aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access', auth_version: 2, realm_id: 'PTR', fid: '12345',
    ptr_database_identity: DATABASE_IDENTITY, auth_epoch: 1, roles: ['warpkeep-ptr-owner'],
    iat: seconds, nbf: seconds, exp: seconds + 120, session_iat: seconds,
    session_exp: seconds + 120, jti: 'ptr-test-session',
  })}.test_signature`;
  const client = createPtrRealmAuthClient({
    expectedDatabaseIdentity: DATABASE_IDENTITY, now: () => NOW,
    fetch: (async () => new Response(JSON.stringify({
      version: 1, status: 'authorized', realmId: 'PTR', databaseIdentity: DATABASE_IDENTITY,
      accessToken: jwt, tokenType: 'spacetime-access', accessExpiresAt: NOW + 120_000,
    }), { status: 200, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } })) as typeof fetch,
  });
  return { authority: await client.exchangeQuickAuth('quick.auth.token'), jwt };
}

async function setup(effect?: (name: string, input: unknown) => unknown) {
  const { authority, jwt } = await issuedAuthority();
  const calls: Array<{ name: string; input: unknown }> = [];
  const procedures = Object.fromEntries(operations.map(operation => [operation.name, (input: unknown) => {
    calls.push({ name: operation.name, input });
    return effect ? effect(operation.name, input) : Promise.resolve(operation.result);
  }])) as unknown as PtrRealmConnectionLike['procedures'];
  const connection = { procedures, disconnect: vi.fn(), isDisconnectRequested: false };
  let accept: Parameters<PtrRealmConnectionBuilder['onConnect']>[0] | undefined;
  let disconnect: Parameters<PtrRealmConnectionBuilder['onDisconnect']>[0] | undefined;
  let connectError: Parameters<PtrRealmConnectionBuilder['onConnectError']>[0] | undefined;
  const builder: PtrRealmConnectionBuilder = {
    withUri() { return this; }, withDatabaseName() { return this; }, withToken() { return this; },
    onConnect(callback) { accept = callback; return this; },
    onConnectError(callback) { connectError = callback; return this; },
    onDisconnect(callback) { disconnect = callback; return this; },
    build() { queueMicrotask(() => accept?.(connection, {}, SDK_TOKEN)); return connection; },
  };
  const controller = new AbortController();
  const onTransportFailure = vi.fn();
  const session = await connectPtrRealm({
    config: { availability: 'available', enabled: true, spacetimeUri: 'https://maincloud.spacetimedb.com',
      databaseIdentity: DATABASE_IDENTITY }, authority, generation: 7, signal: controller.signal,
    builderFactory: () => builder, onTransportFailure,
  });
  const capability = createPtrGameplay04Capability(session, authority, { q: 7, r: -4 });
  return { session, authority, jwt, capability, calls, controller, connection, builder, onTransportFailure,
    disconnect: () => disconnect?.(connection, new Error(SDK_TOKEN)),
    connectError: () => connectError?.({}, new Error(SDK_TOKEN)) };
}

function invoke(capability: PtrGameplay04Capability, command: Mutation04 | undefined, signal: AbortSignal) {
  return command ? capability.mutate(command, signal) : capability.read(signal);
}

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

describe('isolated PTR gameplay capability', () => {
  it('rejects a late read and structural capability clones', async () => {
    const readDeferred = Promise.withResolvers<ReadWire04>();
    const { capability, session, authority } = await setup(() => readDeferred.promise);
    const wire = EMPTY_WIRE04;
    const work = capability.read(new AbortController().signal);
    closePtrRealmConnectionSession(session);
    readDeferred.resolve(wire);
    await expect(work).rejects.toMatchObject({ kind: 'authority' });
    expect(isCurrentPtrGameplay04Capability({ ...capability }, authority, session.generation)).toBe(false);
    expect(capability.isCurrent()).toBe(false);
  });

  it.each(operations)('forwards only the generated $name with its exact input', async ({ name, command, result }) => {
    const { capability, calls, authority, session } = await setup();
    expect(isCurrentPtrGameplay04Capability(capability, authority, session.generation)).toBe(true);
    await expect(invoke(capability, command, new AbortController().signal)).resolves.toEqual(result);
    expect(calls).toEqual([{ name, input: command?.input ?? {} }]);
  });

  it('rejects mismatched authority, cloned session, and generation without an SDK call', async () => {
    const { capability, session, authority, calls } = await setup();
    const other = (await issuedAuthority()).authority;
    expect(isCurrentPtrGameplay04Capability(capability, other, session.generation)).toBe(false);
    expect(isCurrentPtrGameplay04Capability(capability, authority, session.generation + 1)).toBe(false);
    expect(() => createPtrGameplay04Capability(session, other, { q: 0, r: 0 }))
      .toThrow(Gameplay04ClientError);
    expect(() => createPtrGameplay04Capability({ ...session, generation: 8 }, authority, { q: 0, r: 0 }))
      .toThrow(Gameplay04ClientError);
    expect(calls).toEqual([]);
  });

  it('does not revive a closed session by borrowing another branded receiver', async () => {
    const { capability, session, authority, builder, calls } = await setup();
    const secondSession = await connectPtrRealm({
      config: { availability: 'available', enabled: true, spacetimeUri: 'https://maincloud.spacetimedb.com',
        databaseIdentity: DATABASE_IDENTITY }, authority, generation: session.generation,
      signal: new AbortController().signal, builderFactory: () => builder,
    });
    const second = createPtrGameplay04Capability(secondSession, authority, { q: 7, r: -4 });
    closePtrRealmConnectionSession(session);
    await expect(capability.read.call(second, new AbortController().signal)).rejects.toMatchObject({ kind: 'authority' });
    expect(calls).toEqual([]);
  });

  it('rejects cloned method receivers before calling the SDK', async () => {
    const { capability, calls } = await setup();
    const clone = { ...capability };
    expect(clone.isCurrent()).toBe(false);
    await expect(clone.read(new AbortController().signal)).rejects.toMatchObject({ kind: 'authority' });
    await expect(clone.mutate({ kind: 'initialize', input: base }, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'authority' });
    expect(calls).toEqual([]);
  });

  it.each(operations)('checks expiration before starting $name and after resolving', async ({ command }) => {
    const flight = Promise.withResolvers<ReadWire04 | ResultWire04>();
    const { capability, calls } = await setup(() => flight.promise);
    const work = invoke(capability, command, new AbortController().signal);
    vi.mocked(Date.now).mockReturnValue(NOW + 120_001);
    flight.resolve(command ? RESULT : EMPTY_WIRE04);
    await expect(work).rejects.toMatchObject({ kind: 'authority' });
    await expect(invoke(capability, command, new AbortController().signal)).rejects.toMatchObject({ kind: 'authority' });
    expect(calls).toHaveLength(1);
    expect(capability.isCurrent()).toBe(false);
  });

  it.each(operations.flatMap(operation => ['command', 'session'].map(abort => ({ ...operation, abort }))))
   ('suppresses $name on $abort abort and removes listeners', async ({ command, abort }) => {
      const flight = Promise.withResolvers<ReadWire04 | ResultWire04>();
      const { capability, controller, connection } = await setup(() => flight.promise);
      const commandController = new AbortController();
      const removeCommand = vi.spyOn(commandController.signal, 'removeEventListener');
      const removeSession = vi.spyOn(controller.signal, 'removeEventListener');
      const work = invoke(capability, command, commandController.signal);
      (abort === 'command' ? commandController : controller).abort();
      await expect(work).rejects.toMatchObject({ kind: 'authority' });
      flight.reject(new Error(SDK_TOKEN));
      await Promise.resolve();
      expect(removeCommand).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(removeSession).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(connection.disconnect).not.toHaveBeenCalled();
    });

  it.each(operations)('rejects pre-aborted $name without calling the SDK', async ({ command }) => {
    const { capability, calls } = await setup();
    const abort = new AbortController(); abort.abort();
    await expect(invoke(capability, command, abort.signal)).rejects.toMatchObject({ kind: 'authority' });
    expect(calls).toEqual([]);
  });

  it.each(operations.flatMap(operation => ['sync', 'async'].map(mode => ({ ...operation, mode }))))
   ('contains $mode $name failures and keeps uncertain outcome distinct', async ({ command, mode }) => {
    const { capability, connection } = await setup(() => {
      if (mode === 'sync') throw new Error(SDK_TOKEN);
      return Promise.reject(new Error(SDK_TOKEN));
    });
    const error = await invoke(capability, command, new AbortController().signal).catch(error => error);
    expect(error).toMatchObject({ kind: 'uncertain', code: undefined, message: 'PTR gameplay request is unavailable.' });
    expect(String(error)).not.toContain(SDK_TOKEN);
    expect(connection.disconnect).not.toHaveBeenCalled();
  });

  it.each(operations)('preserves exact $name server rejection without retiring the session', async ({ command }) => {
    const { capability, connection, authority, session } = await setup(() => Promise.reject('GAMEPLAY04_LOCATION_FULL'));
    await expect(invoke(capability, command, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'rejected', code: 'GAMEPLAY04_LOCATION_FULL' });
    expect(isCurrentPtrRealmConnectionSession(session, authority)).toBe(true);
    expect(connection.disconnect).not.toHaveBeenCalled();
  });

  it.each(['disconnect', 'connectError'] as const)('existing %s lifecycle still invalidates gameplay', async fail => {
    const harness = await setup(); harness[fail]();
    await expect(harness.capability.read(new AbortController().signal)).rejects.toMatchObject({ kind: 'authority' });
    expect(harness.calls).toEqual([]);
    expect(harness.onTransportFailure).toHaveBeenCalledWith('transport-unavailable');
  });

  it('rechecks authority before publishing a definitive rejection', async () => {
    const flight = Promise.withResolvers<ReadWire04>();
    const { capability, session } = await setup(() => flight.promise);
    const work = capability.read(new AbortController().signal);
    closePtrRealmConnectionSession(session);
    flight.reject('GAMEPLAY04_INPUT_INVALID');
    await expect(work).rejects.toMatchObject({ kind: 'authority', code: undefined });
  });

  it('removes listeners on success and definitive rejection without retiring the session', async () => {
    let rejected = false;
    const { capability, session, authority, controller, connection } = await setup(() => rejected
      ? Promise.reject('GAMEPLAY04_INPUT_INVALID') : Promise.resolve(EMPTY_WIRE04));
    const signal = new AbortController().signal;
    const commandRemove = vi.spyOn(signal, 'removeEventListener');
    const sessionRemove = vi.spyOn(controller.signal, 'removeEventListener');
    await capability.read(signal);
    rejected = true;
    await expect(capability.read(signal)).rejects.toMatchObject({ kind: 'rejected', code: 'GAMEPLAY04_INPUT_INVALID' });
    expect(commandRemove).toHaveBeenCalledTimes(2);
    expect(sessionRemove).toHaveBeenCalledTimes(2);
    expect(isCurrentPtrRealmConnectionSession(session, authority)).toBe(true);
    expect(connection.disconnect).not.toHaveBeenCalled();
  });

  it('exposes no transport, credentials or arbitrary sixth-operation surface', async () => {
    const { capability, jwt, calls } = await setup();
    expect(Reflect.ownKeys(capability).sort()).toEqual(['isCurrent', 'mutate', 'read', 'scope']);
    expect(capability.scope).toEqual({ generation: 7, databaseIdentity: DATABASE_IDENTITY, anchorQ: 7, anchorR: -4 });
    expect(Object.isFrozen(capability)).toBe(true);
    expect(Object.isFrozen(capability.scope)).toBe(true);
    expect(JSON.stringify(capability)).not.toContain(jwt);
    expect(JSON.stringify(capability)).not.toContain(SDK_TOKEN);
    for (const kind of ['admin_get_greater_realm_status_v1', 'dispatchWorkerV1', 'getMyInnerKeepStateV1',
      'recallAllGameplay04WorkersV1', 'toString', '__proto__']) {
      const error = await capability.mutate({ kind, input: {} } as unknown as Mutation04,
        new AbortController().signal).catch(error => error);
      expect(error).toMatchObject({ kind: 'rejected', code: undefined });
      expect(String(error)).not.toContain(jwt);
      expect(String(error)).not.toContain(SDK_TOKEN);
    }
    expect(calls).toEqual([]);
  });
});

describe('bounded procedure error classification', () => {
  it.each([
    ['GAMEPLAY04_NOT_INITIALIZED', 'not-initialized'],
    ['GAMEPLAY04_INPUT_INVALID', 'rejected'], ['GAMEPLAY04_RECEIPT_CONFLICT', 'rejected'],
    ['GAMEPLAY04_RECEIPT_EXPIRED', 'rejected'], ['GAMEPLAY04_ALREADY_INITIALIZED', 'rejected'],
    ['GAMEPLAY04_SEQUENCE_INVALID', 'rejected'], ['GAMEPLAY04_TARGET_INVALID', 'rejected'],
    ['GAMEPLAY04_WORKER_BUSY', 'rejected'], ['GAMEPLAY04_LOCATION_FULL', 'rejected'],
    ['GAMEPLAY04_BUILDER_BUSY', 'rejected'], ['GAMEPLAY04_INSUFFICIENT_RESOURCES', 'rejected'],
    ['GAMEPLAY04_BINDING_INVALID', 'uncertain'], ['GAMEPLAY04_TIMESTAMP_INVALID', 'uncertain'],
    ['GAMEPLAY04_STORED_STATE_INVALID', 'uncertain'], ['GAMEPLAY04_BINDING_MISMATCH', 'uncertain'],
    ['GAMEPLAY04_REVISION_OVERFLOW', 'uncertain'], ['GAMEPLAY04_ASSIGNMENT_REVISION_OVERFLOW', 'uncertain'],
  ])('classifies exact SDK string %s as %s', (code, kind) => {
    expect(classifyGameplay04Error(code)).toMatchObject({ kind, code });
  });

  it.each([new Error('GAMEPLAY04_INPUT_INVALID'), { code: 'GAMEPLAY04_INPUT_INVALID' },
    `GAMEPLAY04_INPUT_INVALID ${SDK_TOKEN}`, `${SDK_TOKEN} GAMEPLAY04_NOT_INITIALIZED`,
    'timeout', 'GAMEPLAY04_SIXTH_ERROR', null, 'x'.repeat(100_000),
    { get message(): string { throw new Error(SDK_TOKEN); } },
  ])('never parses arbitrary or secret-bearing failure data (%#)', input => {
    const error = classifyGameplay04Error(input);
    expect(error).toMatchObject({ kind: 'uncertain', code: undefined });
    expect(String(error)).toBe('Gameplay04ClientError: PTR gameplay request is unavailable.');
    expect(new Gameplay04ClientError('rejected', input as never).code).toBeUndefined();
  });

  it('characterizes the real generated SDK procedure rejection as a raw string', async () => {
    const socket: { protocol: string; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>;
      onmessage?: (event: { data: Uint8Array }) => void } = {
      protocol: 'v2.bsatn.spacetimedb', send: vi.fn(), close: vi.fn(),
    };
    const connection = DbConnection.builder().withUri('https://example.invalid')
      .withDatabaseName('ptr-offline-characterization').withWSFn(async () => socket as never).build();
    try {
      await vi.waitFor(() => expect(socket.onmessage).toBeTypeOf('function'));
      const work = connection.procedures.getGameplay04KeepV1({});
      // Installed v2 BSATN: ServerMessage.ProcedureResult(7), InternalError(1),
      // string, timestamp i64, duration i64, requestId u32 (first request = 0).
      const writer = new BinaryWriter(128);
      writer.writeU8(7); writer.writeU8(1); writer.writeString('GAMEPLAY04_NOT_INITIALIZED');
      writer.writeI64(0n); writer.writeI64(0n); writer.writeU32(0);
      socket.onmessage!({ data: writer.getBuffer() });
      const error = await work.catch(error => error);
      expect(error).toBe('GAMEPLAY04_NOT_INITIALIZED');
      expect(classifyGameplay04Error(error)).toMatchObject({ kind: 'not-initialized', code: error });
    } finally { connection.disconnect(); }
  });
});
