import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPtrRealmAuthClient,
  type PtrRealmAuthority,
} from '../src/ptr/ptrRealmAuthClient';
import {
  closePtrRealmConnectionSession,
  connectPtrRealm,
  createPtrRealmProcedureInvoker,
  ptrRealmConnectionFailureCode,
  type PtrRealmConnectionBuilder,
  type PtrRealmConnectionLike,
} from '../src/ptr/ptrRealmConnection';
import type { AvailablePtrRealmConfig } from '../src/ptr/ptrRealmConfig';
import { GREATER_REALM_PUBLIC_PROCEDURES } from '../src/greater-realm/greaterRealmTransport';
import {
  createPtrGreaterRealmProviderBridge,
  preflightPtrRealmView,
} from '../src/ptr/ptrGreaterRealmBridge';

const NOW = 1_788_000_000_000;
const FID = 12_345;
const DATABASE_IDENTITY = 'd'.repeat(64);
const CONFIG: AvailablePtrRealmConfig = Object.freeze({
  availability: 'available',
  enabled: true,
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  databaseIdentity: DATABASE_IDENTITY,
});

function segment(value: unknown): string {
  const binary = unescape(encodeURIComponent(JSON.stringify(value)));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function issuedAuthority(): Promise<Readonly<{
  authority: PtrRealmAuthority;
  jwt: string;
}>> {
  const issuedAt = Math.floor(NOW / 1_000);
  const expiresAt = (issuedAt + 120) * 1_000;
  const jwt = `${segment({ alg: 'ES256', typ: 'JWT', kid: 'ptr-test-key' })}.${segment({
    iss: 'https://auth.warpkeep.com',
    sub: `farcaster:${FID}`,
    aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access',
    auth_version: 2,
    realm_id: 'PTR',
    fid: String(FID),
    auth_epoch: 1,
    roles: ['warpkeep-ptr-owner'],
    iat: issuedAt,
    nbf: issuedAt,
    exp: expiresAt / 1_000,
    session_iat: issuedAt,
    session_exp: expiresAt / 1_000,
    jti: 'ptr-test-session',
  })}.test_signature`;
  const client = createPtrRealmAuthClient({
    expectedDatabaseIdentity: DATABASE_IDENTITY,
    now: () => NOW,
    fetch: vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      status: 'authorized',
      realmId: 'PTR',
      identity: { fid: FID },
      databaseIdentity: DATABASE_IDENTITY,
      accessToken: jwt,
      tokenType: 'spacetime-access',
      accessExpiresAt: expiresAt,
    }), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
    })) as typeof fetch,
  });
  return Object.freeze({
    authority: await client.exchangeQuickAuth('quick.auth.token'),
    jwt,
  });
}

type ProcedureName = keyof PtrRealmConnectionLike['procedures'];

function connectionHarness(options: Readonly<{
  connectWith?: PtrRealmConnectionLike;
  connectError?: boolean;
  autoConnect?: boolean;
  bootstrapResult?: unknown;
  bootstrapSyncError?: boolean;
}> = {}) {
  const procedureNames = [
    'getRealmAtlasBootstrapV1',
    'getRealmAtlasWindowV1',
    'getRealmAtlasChunkV1',
    'getRealmAtlasResourceLocationsV1',
    'planRealmRouteV1',
  ] as const satisfies readonly ProcedureName[];
  const procedures = Object.fromEntries(procedureNames.map(name => [
    name,
    vi.fn((input: unknown) => {
      if (name === 'getRealmAtlasBootstrapV1' && options.bootstrapSyncError) {
        throw new Error('private synchronous SDK detail');
      }
      return Promise.resolve(
        name === 'getRealmAtlasBootstrapV1' && options.bootstrapResult !== undefined
          ? options.bootstrapResult
          : Object.freeze({ name, input }),
      );
    }),
  ])) as unknown as PtrRealmConnectionLike['procedures'];
  const connection = {
    procedures,
    disconnect: vi.fn(),
    isDisconnectRequested: false,
  } as unknown as PtrRealmConnectionLike;
  let onConnect: ((connection: PtrRealmConnectionLike, identity: unknown, token: string) => void) | undefined;
  let onConnectError: ((context: unknown, error: unknown) => void) | undefined;
  let onDisconnect: ((connection: PtrRealmConnectionLike, error?: unknown) => void) | undefined;
  const builder = {
    withUri: vi.fn(function (this: PtrRealmConnectionBuilder) { return this; }),
    withDatabaseName: vi.fn(function (this: PtrRealmConnectionBuilder) { return this; }),
    withToken: vi.fn(function (this: PtrRealmConnectionBuilder) { return this; }),
    onConnect: vi.fn(function (
      this: PtrRealmConnectionBuilder,
      callback: NonNullable<typeof onConnect>,
    ) { onConnect = callback; return this; }),
    onConnectError: vi.fn(function (
      this: PtrRealmConnectionBuilder,
      callback: NonNullable<typeof onConnectError>,
    ) { onConnectError = callback; return this; }),
    onDisconnect: vi.fn(function (
      this: PtrRealmConnectionBuilder,
      callback: NonNullable<typeof onDisconnect>,
    ) { onDisconnect = callback; return this; }),
    build: vi.fn(() => {
      if (options.autoConnect !== false) queueMicrotask(() => {
        if (options.connectError) onConnectError?.({}, new Error('private transport detail'));
        else onConnect?.(
          options.connectWith ?? connection,
          Object.freeze({}),
          'SERVER_ISSUED_TOKEN_MUST_BE_IGNORED',
        );
      });
      return connection;
    }),
  } as unknown as PtrRealmConnectionBuilder;
  return {
    builder,
    connection,
    procedures,
    onDisconnect: (error?: unknown) => onDisconnect?.(connection, error),
    onConnectError: (error?: unknown) => onConnectError?.({}, error),
  };
}

function validBootstrap() {
  const regions = [
    ['T1_LOWLANDS', 'The Hegemony Lowlands'],
    ['T1_FROSTMERE', 'Frostmere Reach'],
    ['T1_SUNSCAR', 'Sunscar Expanse'],
    ['T1_MIREFEN', 'Mirefen Delta'],
    ['T1_STONEWAKE', 'Stonewake Isles'],
    ['T1_EMBERWOOD', 'Emberwood March'],
  ] as const;
  return {
    atlasId: 'PTR_ATLAS',
    publicReleaseId: `GRR-${'A'.repeat(26)}`,
    name: 'PTR Greater Realm',
    protocolVersion: 17,
    generatorVersion: 'greater-realm-v1',
    runtimePartitionVersion: 'ptr-v1',
    rendererContractVersion: 'greater-realm-renderer-v1',
    revision: 1n,
    visibleTierMax: 1,
    navigationTierMax: 1,
    foundingTierMax: 1,
    visibleRegionCount: 6,
    visibleCellCount: 600,
    visibleChunkCount: 6,
    castleCapacity: 600,
    mode: 'canary',
    regions: regions.map(([regionId, publicName], ordinal) => ({
      regionId,
      ordinal,
      publicName,
      tier: 1,
      cellCount: 100,
      passableCellCount: 100,
      chunkCount: 1,
      castleCapacity: 100,
      resourceLocationCount: 20,
      resourceNodeCount: 2_000,
      foodNodeCount: 500,
      woodNodeCount: 500,
      stoneNodeCount: 500,
      goldNodeCount: 500,
    })),
    myCastleId: BigInt(FID),
    myCellKey: 'PTR_OWNER_ANCHOR',
    myAtlasQ: 7,
    myAtlasR: -4,
    myElevation: 18,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PTR realm connection', () => {
  it('rejects structural authority forgeries before building a socket', async () => {
    const harness = connectionHarness();
    const builderFactory = vi.fn(() => harness.builder);
    const forged = Object.freeze({
      realmId: 'PTR',
      fid: FID,
      databaseIdentity: DATABASE_IDENTITY,
      expiresAt: NOW + 120_000,
    }) as PtrRealmAuthority;

    const failure = await connectPtrRealm({
      config: CONFIG,
      authority: forged,
      generation: 1,
      signal: new AbortController().signal,
      now: () => NOW,
      builderFactory,
    }).catch(error => error as unknown);

    expect(ptrRealmConnectionFailureCode(failure)).toBe('authority-unavailable');
    expect(builderFactory).not.toHaveBeenCalled();
  });

  it('builds against only the fixed PTR target and keeps both tokens out of public state', async () => {
    const { authority, jwt } = await issuedAuthority();
    const harness = connectionHarness();
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 7,
      signal: new AbortController().signal,
      now: () => NOW,
      builderFactory: () => harness.builder,
    });

    expect(harness.builder.withUri).toHaveBeenCalledWith('https://maincloud.spacetimedb.com');
    expect(harness.builder.withDatabaseName).toHaveBeenCalledWith(DATABASE_IDENTITY);
    expect(harness.builder.withToken).toHaveBeenCalledWith(jwt);
    expect(JSON.stringify(session)).toBe('{"realmId":"PTR","generation":7}');
    expect(JSON.stringify(session)).not.toContain(jwt);
    expect(JSON.stringify(session)).not.toContain('SERVER_ISSUED_TOKEN_MUST_BE_IGNORED');
    expect(session).not.toHaveProperty('connection');
    expect(session).not.toHaveProperty('reducers');
    expect(session).not.toHaveProperty('db');
  });

  it('rejects a callback socket that differs from the built generation socket', async () => {
    const { authority } = await issuedAuthority();
    const alien = {
      procedures: {},
      disconnect: vi.fn(),
      isDisconnectRequested: false,
    } as unknown as PtrRealmConnectionLike;
    const harness = connectionHarness({ connectWith: alien });

    const failure = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 8,
      signal: new AbortController().signal,
      now: () => NOW,
      builderFactory: () => harness.builder,
    }).catch(error => error as unknown);

    expect(ptrRealmConnectionFailureCode(failure)).toBe('transport-unavailable');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(alien.disconnect).toHaveBeenCalledTimes(1);
  });

  it('bounds an incomplete handshake and closes its pending socket', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { authority } = await issuedAuthority();
    const harness = connectionHarness({ autoConnect: false });
    const pending = connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 9,
      signal: new AbortController().signal,
      now: () => NOW,
      handshakeTimeoutMs: 1_000,
      builderFactory: () => harness.builder,
    });
    const outcome = pending.catch(error => error as unknown);

    await vi.advanceTimersByTimeAsync(1_000);
    const failure = await outcome;
    expect(ptrRealmConnectionFailureCode(failure)).toBe('handshake-timeout');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('allows exactly the five owner atlas procedures and re-checks liveness after results', async () => {
    const { authority } = await issuedAuthority();
    const harness = connectionHarness();
    const controller = new AbortController();
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 10,
      signal: controller.signal,
      now: () => NOW,
      builderFactory: () => harness.builder,
    });
    const invoker = createPtrRealmProcedureInvoker(session, authority, () => NOW);
    const signal = new AbortController().signal;

    await expect(invoker.call(GREATER_REALM_PUBLIC_PROCEDURES.bootstrap, {}, signal))
      .resolves.toMatchObject({ name: 'getRealmAtlasBootstrapV1' });
    await expect(invoker.call(GREATER_REALM_PUBLIC_PROCEDURES.window, {
      centerQ: 2, centerR: -3, radius: 4, expectedRevision: 11n,
    }, signal)).resolves.toMatchObject({ name: 'getRealmAtlasWindowV1' });
    await expect(invoker.call(GREATER_REALM_PUBLIC_PROCEDURES.chunk, {
      chunkHandle: 'GRK-TEST', lod: 2, expectedRevision: 11n,
    }, signal)).resolves.toMatchObject({ name: 'getRealmAtlasChunkV1' });
    await expect(invoker.call(GREATER_REALM_PUBLIC_PROCEDURES.resourceLocations, {
      chunkHandles: ['GRK-TEST'], expectedRevision: 11n,
    }, signal)).resolves.toMatchObject({ name: 'getRealmAtlasResourceLocationsV1' });
    await expect(invoker.call(GREATER_REALM_PUBLIC_PROCEDURES.planRoute, {
      originCellKey: 'A', destinationCellKey: 'B', offset: 0, limit: 10,
      expectedRevision: 11n,
    }, signal)).resolves.toMatchObject({ name: 'planRealmRouteV1' });
    await expect(invoker.call('admin_get_greater_realm_status_v1', {}, signal))
      .rejects.toThrow('PTR atlas procedure is unavailable.');

    closePtrRealmConnectionSession(session);
    await expect(invoker.call(GREATER_REALM_PUBLIC_PROCEDURES.bootstrap, {}, signal))
      .rejects.toThrow('PTR atlas procedure is unavailable.');
  });

  it('does not publish a procedure result after its session generation is closed', async () => {
    const { authority } = await issuedAuthority();
    const resultFlight = deferred<unknown>();
    const harness = connectionHarness({ bootstrapResult: resultFlight.promise });
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 15,
      signal: new AbortController().signal,
      now: () => NOW,
      builderFactory: () => harness.builder,
    });
    const pending = createPtrRealmProcedureInvoker(session, authority, () => NOW).call(
      GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
      {},
      new AbortController().signal,
    );
    const outcome = pending.catch(error => error as unknown);

    closePtrRealmConnectionSession(session);
    resultFlight.resolve(Object.freeze({ private: 'must-not-publish' }));

    await expect(outcome).resolves.toMatchObject({
      message: 'PTR atlas procedure is unavailable.',
    });
  });

  it('disconnects and emits only a fixed class when the live transport fails', async () => {
    const { authority } = await issuedAuthority();
    const harness = connectionHarness();
    const onTransportFailure = vi.fn();
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 11,
      signal: new AbortController().signal,
      now: () => NOW,
      onTransportFailure,
      builderFactory: () => harness.builder,
    });

    harness.onDisconnect(new Error('secret DB payload'));

    expect(onTransportFailure).toHaveBeenCalledWith('transport-unavailable');
    expect(JSON.stringify(onTransportFailure.mock.calls)).not.toContain('secret DB payload');
    expect(harness.connection.disconnect).not.toHaveBeenCalled();
    await expect(createPtrRealmProcedureInvoker(session, authority, () => NOW).call(
      GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
      {},
      new AbortController().signal,
    )).rejects.toThrow('PTR atlas procedure is unavailable.');
  });

  it('retires an authenticated session on a late SDK connection error', async () => {
    const { authority } = await issuedAuthority();
    const harness = connectionHarness();
    const onTransportFailure = vi.fn();
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 14,
      signal: new AbortController().signal,
      now: () => NOW,
      onTransportFailure,
      builderFactory: () => harness.builder,
    });

    harness.onConnectError(new Error('private late SDK detail'));

    expect(onTransportFailure).toHaveBeenCalledWith('transport-unavailable');
    expect(JSON.stringify(onTransportFailure.mock.calls)).not.toContain('private late SDK detail');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    await expect(createPtrRealmProcedureInvoker(session, authority, () => NOW).call(
      GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
      {},
      new AbortController().signal,
    )).rejects.toThrow('PTR atlas procedure is unavailable.');
  });

  it('contains synchronous SDK procedure failures behind the fixed transport class', async () => {
    const { authority } = await issuedAuthority();
    const harness = connectionHarness({ bootstrapSyncError: true });
    const onTransportFailure = vi.fn();
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 16,
      signal: new AbortController().signal,
      now: () => NOW,
      onTransportFailure,
      builderFactory: () => harness.builder,
    });

    const failure = await createPtrRealmProcedureInvoker(session, authority, () => NOW).call(
      GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
      {},
      new AbortController().signal,
    ).catch(error => error as unknown);

    expect(failure).toMatchObject({ message: 'PTR atlas procedure is unavailable.' });
    expect(String(failure)).not.toContain('private synchronous SDK detail');
    expect(onTransportFailure).toHaveBeenCalledWith('transport-unavailable');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('publishes only a validated virtual view anchor and presentation-only bridge', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { authority } = await issuedAuthority();
    const harness = connectionHarness({ bootstrapResult: validBootstrap() });
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 12,
      signal: new AbortController().signal,
      now: () => NOW,
      builderFactory: () => harness.builder,
    });
    const signal = new AbortController().signal;

    expect(createPtrGreaterRealmProviderBridge(session, authority, () => NOW))
      .toEqual(Object.freeze({
        phase: 'dormant',
        reason: 'connection-unavailable',
        presentationAllowed: false,
      }));
    await expect(preflightPtrRealmView(session, authority, signal, () => NOW))
      .resolves.toEqual(Object.freeze({ castleId: FID, q: 7, r: -4 }));
    const bridge = createPtrGreaterRealmProviderBridge(session, authority, () => NOW);
    expect(bridge).toMatchObject({
      phase: 'available',
      presentationAllowed: true,
      sessionGeneration: 12,
    });
    expect(bridge).not.toHaveProperty('getWorkerControl');
    expect(bridge).not.toHaveProperty('dispatchWorker');
    expect(bridge).not.toHaveProperty('recallWorker');
    expect(bridge).not.toHaveProperty('recallAllWorkers');
    expect(JSON.stringify(bridge)).not.toMatch(/fid|token|jwt|reducers|procedures|connection/iu);
  });

  it('closes the PTR session instead of synthesizing an unsafe view anchor', async () => {
    const { authority } = await issuedAuthority();
    const invalid = { ...validBootstrap(), myCastleId: BigInt(Number.MAX_SAFE_INTEGER) + 1n };
    const harness = connectionHarness({ bootstrapResult: invalid });
    const onTransportFailure = vi.fn();
    const session = await connectPtrRealm({
      config: CONFIG,
      authority,
      generation: 13,
      signal: new AbortController().signal,
      now: () => NOW,
      onTransportFailure,
      builderFactory: () => harness.builder,
    });

    await expect(preflightPtrRealmView(
      session,
      authority,
      new AbortController().signal,
      () => NOW,
    )).rejects.toThrow('PTR realm presentation is unavailable.');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(onTransportFailure).toHaveBeenCalledWith('transport-unavailable');
  });
});
