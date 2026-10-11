// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import type { BridgeConfig } from '../services/auth-bridge/src/config';
import { ptrAdminClaims, ptrAtlasAdminClaims } from '../services/auth-bridge/src/jwt';

import {
  PTR_ADMIN_TOKEN_ENDPOINT,
  PTR_ATLAS_ADMIN_TOKEN_ENDPOINT,
  PtrProductionAdminTokenError,
  readPtrAtlasImportAuthority,
  readPtrOwnerProvisionAuthority,
  requestPtrAtlasProductionAdminToken,
  requestPtrProductionAdminToken,
  takePtrProductionAdminSecret,
} from '../scripts/ptr-production-admin-token';
import {
  PTR_PRODUCTION_ALLOWED_REDUCERS,
  PtrProductionTransportError,
  createPtrAtlasImportTransport,
  createPtrOwnerProvisionTransport,
} from '../scripts/ptr-production-transport';
import { readFreshPtrAdminClaims } from '../spacetimedb/ptr/src/ownerPolicy';
import { DbConnection } from '../spacetimedb/ptr/generated-bindings';

const ADMIN_SECRET = 's'.repeat(48);
const DATABASE_IDENTITY = '1'.repeat(64);
const G002_IDENTITY = '2'.repeat(64);
const ADMIN_JWT = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;
const OWNER_FID = '123456789';
const NOW_SECONDS = 1_800_000_000;

function jwtFromClaims(claims: unknown): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value))
    .toString('base64url');
  return `${encode({ alg: 'ES256', typ: 'JWT', kid: 'key-1' })}.${encode(claims)}.${'c'.repeat(86)}`;
}

function adminJwt(overrides: Readonly<Record<string, unknown>> = {}): string {
  return jwtFromClaims({
    iss: 'https://auth.warpkeep.com',
    sub: 'service:hermes',
    aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    ptr_owner_fid: OWNER_FID,
    ptr_owner_auth_epoch: 7,
    iat: NOW_SECONDS,
    nbf: NOW_SECONDS,
    exp: NOW_SECONDS + 300,
    jti: 'ptr-admin-jti',
    ...overrides,
  });
}

function atlasJwt(overrides: Readonly<Record<string, unknown>> = {}): string {
  return jwtFromClaims({
    iss: 'https://auth.warpkeep.com',
    sub: 'service:hermes',
    aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    iat: NOW_SECONDS,
    nbf: NOW_SECONDS,
    exp: NOW_SECONDS + 300,
    jti: 'ptr-atlas-admin-jti',
    ...overrides,
  });
}

function tokenResponse(overrides: Partial<Response> = {}): Response {
  const response = new Response(JSON.stringify({
    token: ADMIN_JWT,
    tokenType: 'spacetime-access',
    expiresIn: 300,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
  return Object.assign(response, overrides);
}

describe('PTR production admin token and transport', () => {
  it('disconnects an unbound late default connection even after its timeout has settled', async () => {
    vi.useFakeTimers(); let connected!: (value: never) => void;
    const builder = { withUri() { return this; }, withDatabaseName() { return this; }, withToken() { return this; },
      withWSFn() { return this; }, onConnect(callback: typeof connected) { connected = callback; return this; },
      onConnectError() { return this; }, build() { return { disconnect: vi.fn() }; } };
    const spy = vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as never);
    const disconnect = vi.fn();
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => NOW_SECONDS, requestToken: async () => atlasJwt() });
    try {
      const pending = transport.inspect().then(() => 'unexpected-success', error => error.code);
      await vi.advanceTimersByTimeAsync(10000);
      expect(await pending).toBe('PTR_PRODUCTION_CONNECTION_UNAVAILABLE');
      connected({ identity: { toHexString: () => G002_IDENTITY }, isDisconnectRequested: false, disconnect } as never);
      expect(disconnect).toHaveBeenCalledOnce(); await transport.close();
    } finally { spy.mockRestore(); vi.useRealTimers(); }
  });
  it('renews the actual 60-second exchange while the original token is still fresh', async () => {
    let now = NOW_SECONDS;
    const disconnect = vi.fn(), inspect = vi.fn(async () => ({}));
    const connectDatabase = vi.fn(async (_database, _token, session) => {
      session({ issuedAt: now, expiresAt: now + 60, hexIdentity: DATABASE_IDENTITY });
      return { isDisconnectRequested: false, disconnect, procedures: { adminGetGreaterRealmStatusV1: inspect } } as never;
    });
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now,
      requestToken: async () => atlasJwt({ iat: now, nbf: now, exp: now + 300 }), connectDatabase });
    await transport.inspect(); now += 29; await transport.inspect(); expect(connectDatabase).toHaveBeenCalledTimes(1);
    now += 1; await transport.inspect(); expect(connectDatabase).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledOnce(); await transport.close();
  });

  it('rejects an exchanged session consumed by readback before the durable callback', async () => {
    let now = NOW_SECONDS;
    const marker = vi.fn(), reducer = vi.fn(async () => undefined), disconnect = vi.fn();
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now, requestToken: async () => atlasJwt(),
      connectDatabase: async (_database, _token, session) => {
        session?.({ issuedAt: NOW_SECONDS, expiresAt: NOW_SECONDS + 60, hexIdentity: DATABASE_IDENTITY });
        return { isDisconnectRequested: false, disconnect, procedures: { adminGetGreaterRealmStatusV1: async () => ({}) },
          reducers: { adminImportGreaterRealmRegionsV1: reducer } } as never;
      } });
    await expect(transport.submit('admin_import_greater_realm_regions_v1', {}, marker, async () => { now += 31; }))
      .rejects.toThrow('PTR_PRODUCTION_TOKEN_REFRESH_REQUIRED');
    expect(marker).not.toHaveBeenCalled(); expect(reducer).not.toHaveBeenCalled(); await transport.close();
  });
  it.each(['atlas', 'owner'] as const)('disconnects a late %s connection after close without starting a command', async kind => {
    let finish!: (connection: never) => void, notify!: () => void;
    const pending = new Promise<never>(resolve => { finish = resolve; });
    const connecting = new Promise<void>(resolve => { notify = resolve; });
    const disconnect = vi.fn(), command = vi.fn(async () => ({})), assertCanStartWrite = vi.fn();
    const options = {
      databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => NOW_SECONDS,
      requestToken: async () => kind === 'atlas' ? atlasJwt() : adminJwt(),
      connectDatabase: vi.fn(async () => { notify(); return await pending; }),
    };
    const transport = kind === 'atlas' ? createPtrAtlasImportTransport(options) : createPtrOwnerProvisionTransport(options);
    const operation = 'inspect' in transport ? transport.inspect() : transport.provisionOwner(BigInt(OWNER_FID), assertCanStartWrite);
    const outcome = operation.then(() => 'unexpected-success', error => error.code);
    await connecting;
    const closing = transport.close();
    finish({ isDisconnectRequested: false, disconnect,
      procedures: { adminGetGreaterRealmStatusV1: command }, reducers: { adminProvisionPtrOwnerV1: command } } as never);
    await closing;
    expect(await outcome).toBe(kind === 'atlas' ? 'PTR_PRODUCTION_SESSION_CLOSED' : 'PTR_PRODUCTION_CONNECTION_UNAVAILABLE');
    expect(disconnect).toHaveBeenCalledOnce(); expect(command).not.toHaveBeenCalled();
    expect(assertCanStartWrite).not.toHaveBeenCalled();
  });

  it.each([
    { iat: NOW_SECONDS + 6, nbf: NOW_SECONDS + 6, exp: NOW_SECONDS + 306 },
    { iat: NOW_SECONDS + 3, nbf: NOW_SECONDS + 3, exp: NOW_SECONDS + 303, roles: [] },
    { iat: NOW_SECONDS - 300, nbf: NOW_SECONDS - 300, exp: NOW_SECONDS },
  ])('rejects invalid atlas claims without waiting or connecting: %j', async overrides => {
    vi.useFakeTimers(); vi.setSystemTime(NOW_SECONDS * 1_000);
    const connectDatabase = vi.fn();
    const transport = createPtrAtlasImportTransport({
      databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], connectDatabase: connectDatabase as never,
      requestToken: async () => atlasJwt(overrides),
    });
    try {
      await expect(transport.inspect()).rejects.toThrow('PTR_PRODUCTION_ATLAS_ADMIN_TOKEN_CLAIMS_INVALID');
      expect(connectDatabase).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { await transport.close(); vi.useRealTimers(); }
  });

  it.each(['clock-stalled', 'expired', 'closed'] as const)('rechecks atlas authority after waiting: %s', async mode => {
    vi.useFakeTimers(); vi.setSystemTime(NOW_SECONDS * 1_000);
    const connectDatabase = vi.fn();
    const transport = createPtrAtlasImportTransport({
      databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], connectDatabase: connectDatabase as never,
      requestToken: async () => atlasJwt({ iat: NOW_SECONDS + 3, nbf: NOW_SECONDS + 3, exp: NOW_SECONDS + 303 }),
      ...(mode === 'clock-stalled' ? { nowSeconds: () => NOW_SECONDS } : {}),
    });
    try {
      const outcome = transport.inspect().then(() => 'unexpected-success', error => error.code);
      await vi.advanceTimersByTimeAsync(2_000);
      const closing = mode === 'closed' ? transport.close() : undefined;
      if (mode === 'expired') vi.setSystemTime((NOW_SECONDS + 301) * 1_000);
      await vi.advanceTimersByTimeAsync(3_000);
      await closing;
      expect(await outcome).toBe(mode === 'closed' ? 'PTR_PRODUCTION_SESSION_CLOSED' : 'PTR_PRODUCTION_ATLAS_ADMIN_TOKEN_CLAIMS_INVALID');
      expect(connectDatabase).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { await transport.close(); vi.useRealTimers(); }
  });

  it('waits for owner token activation before connecting or permitting a reducer', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW_SECONDS * 1_000);
    const reducer = vi.fn(async () => undefined), assertCanStartWrite = vi.fn();
    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false, disconnect: vi.fn(),
      reducers: { adminProvisionPtrOwnerV1: reducer },
    }) as never);
    const transport = createPtrOwnerProvisionTransport({
      databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], connectDatabase,
      requestToken: async () => adminJwt({ iat: NOW_SECONDS + 5, nbf: NOW_SECONDS + 5, exp: NOW_SECONDS + 305 }),
    });
    try {
      const outcome = transport.provisionOwner(BigInt(OWNER_FID), assertCanStartWrite);
      await vi.advanceTimersByTimeAsync(4_000);
      expect(connectDatabase).not.toHaveBeenCalled(); expect(assertCanStartWrite).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(outcome).resolves.toEqual({ ownerFid: BigInt(OWNER_FID), ownerAuthEpoch: 7 });
      expect(connectDatabase).toHaveBeenCalledOnce(); expect(assertCanStartWrite).toHaveBeenCalledOnce();
      expect(reducer).toHaveBeenCalledOnce();
    } finally { await transport.close(); vi.useRealTimers(); }
  });

  it('waits for a slightly future atlas token before connecting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SECONDS * 1_000);
    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false,
      disconnect: vi.fn(),
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({})) },
    }) as never);
    const transport = createPtrAtlasImportTransport({
      databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], connectDatabase,
      requestToken: async () => atlasJwt({ iat: NOW_SECONDS + 3, nbf: NOW_SECONDS + 3, exp: NOW_SECONDS + 303 }),
    });
    try {
      const result = transport.inspect();
      const outcome = result.then(value => ({ value }), error => ({ error }));
      await vi.advanceTimersByTimeAsync(2_000);
      expect(connectDatabase).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await outcome).toEqual({ value: {} });
      expect(connectDatabase).toHaveBeenCalledOnce();
    } finally { await transport.close(); vi.useRealTimers(); }
  });

  it('separates exact ownerless atlas and owner-bearing transport authority', async () => {
    expect(PTR_ATLAS_ADMIN_TOKEN_ENDPOINT)
      .toBe('https://auth.warpkeep.com/v1/admin/ptr-atlas-token');
    expect(readPtrAtlasImportAuthority(atlasJwt(), NOW_SECONDS)).toEqual({
      expiresAt: NOW_SECONDS + 300,
      issuer: 'https://auth.warpkeep.com',
      subject: 'service:hermes',
      audience: ['warpkeep-ptr-spacetimedb'],
      tokenType: 'spacetime-access',
      roles: ['warpkeep-admin'],
    });
    expect(() => readPtrAtlasImportAuthority(adminJwt(), NOW_SECONDS))
      .toThrow('PTR_PRODUCTION_ATLAS_ADMIN_TOKEN_CLAIMS_INVALID');

    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false,
      disconnect: vi.fn(),
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({})) },
      reducers: { adminProvisionPtrOwnerV1: vi.fn(async () => undefined) },
    }) as never);
    const atlas = createPtrAtlasImportTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken: vi.fn(async () => atlasJwt()),
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });
    const owner = createPtrOwnerProvisionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken: vi.fn(async () => adminJwt()),
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });
    expect(Object.keys(atlas)).toEqual(['inspect', 'prepareSubmission', 'submit', 'close']);
    expect(Object.keys(owner)).toEqual(['provisionOwner', 'close']);
    expect(atlas).not.toHaveProperty('provisionOwner');
    expect(owner).not.toHaveProperty('inspect');
    expect(owner).not.toHaveProperty('submit');
    await atlas.close();
    await owner.close();

    const wrongAtlas = createPtrAtlasImportTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken: vi.fn(async () => adminJwt()),
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });
    await expect(wrongAtlas.inspect())
      .rejects.toThrow('PTR_PRODUCTION_ATLAS_ADMIN_TOKEN_CLAIMS_INVALID');
    const wrongOwner = createPtrOwnerProvisionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken: vi.fn(async () => atlasJwt()),
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });
    await expect(wrongOwner.provisionOwner(BigInt(OWNER_FID), vi.fn()))
      .rejects.toThrow('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    await wrongAtlas.close();
    await wrongOwner.close();
  });

  it('requests the ownerless atlas token from its dedicated endpoint', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify({
      token: atlasJwt(), tokenType: 'spacetime-access', expiresIn: 300,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    }));
    await expect(requestPtrAtlasProductionAdminToken(ADMIN_SECRET, { fetchImpl }))
      .resolves.toBe(atlasJwt());
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(PTR_ATLAS_ADMIN_TOKEN_ENDPOINT);
  });

  it('requests one five-minute token using bodyless, credentialless, no-store semantics', async () => {
    let capturedHeaders = new Headers();
    let liveHeaders: HeadersInit | undefined;
    const fetchImpl = vi.fn(async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedHeaders = new Headers(init?.headers);
      liveHeaders = init?.headers;
      return tokenResponse();
    });
    await expect(requestPtrProductionAdminToken(ADMIN_SECRET, { fetchImpl }))
      .resolves.toBe(ADMIN_JWT);
    expect(PTR_ADMIN_TOKEN_ENDPOINT)
      .toBe('https://auth.warpkeep.com/v1/admin/ptr-token');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    if (init === undefined) throw new Error('missing request init');
    expect(url).toBe(PTR_ADMIN_TOKEN_ENDPOINT);
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(init).not.toHaveProperty('body');
    expect(capturedHeaders).toEqual(new Headers({
      accept: 'application/json',
      authorization: `Bearer ${ADMIN_SECRET}`,
    }));
    expect(capturedHeaders.has('origin')).toBe(false);
    expect(capturedHeaders.has('cookie')).toBe(false);
    expect(capturedHeaders.has('proxy-authorization')).toBe(false);
    expect(new Headers(liveHeaders).has('authorization')).toBe(false);
  });

  it('fails closed on malformed, cacheable, oversized, or wrong-lifetime responses', async () => {
    const cases = [
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }),
      new Response(JSON.stringify({
        token: ADMIN_JWT,
        tokenType: 'spacetime-access',
        expiresIn: 299,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }),
      new Response(JSON.stringify({
        token: ADMIN_JWT,
        tokenType: 'spacetime-access',
        expiresIn: 300,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'public' },
      }),
      new Response('x'.repeat(40_000), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }),
    ];
    for (const response of cases) {
      await expect(requestPtrProductionAdminToken(ADMIN_SECRET, {
        fetchImpl: vi.fn(async () => response),
      })).rejects.toBeInstanceOf(PtrProductionAdminTokenError);
    }
  });

  it('zeroes every privileged response chunk on success and oversize failure', async () => {
    const body = new TextEncoder().encode(JSON.stringify({
      token: ADMIN_JWT,
      tokenType: 'spacetime-access',
      expiresIn: 300,
    }));
    const first = body.slice(0, 17);
    const second = body.slice(17);
    const successfulResponse = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(first);
        controller.enqueue(second);
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
    await expect(requestPtrProductionAdminToken(ADMIN_SECRET, {
      fetchImpl: vi.fn(async () => successfulResponse),
    })).resolves.toBe(ADMIN_JWT);
    expect([...first]).toEqual(new Array(first.byteLength).fill(0));
    expect([...second]).toEqual(new Array(second.byteLength).fill(0));

    const oversized = new Uint8Array(32 * 1_024 + 1).fill(0x78);
    const oversizedResponse = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
    await expect(requestPtrProductionAdminToken(ADMIN_SECRET, {
      fetchImpl: vi.fn(async () => oversizedResponse),
    })).rejects.toThrow('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
    expect([...oversized]).toEqual(new Array(oversized.byteLength).fill(0));
  });

  it('deletes the protected secret from the environment even when invalid', () => {
    const valid: NodeJS.ProcessEnv = { WARPKEEP_ADMIN_TOKEN_SECRET: ADMIN_SECRET };
    expect(takePtrProductionAdminSecret(valid)).toBe(ADMIN_SECRET);
    expect(valid).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
    const invalid: NodeJS.ProcessEnv = { WARPKEEP_ADMIN_TOKEN_SECRET: 'short' };
    expect(() => takePtrProductionAdminSecret(invalid))
      .toThrow('PTR_PRODUCTION_ADMIN_SECRET_INVALID');
    expect(invalid).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
  });

  it('strictly derives only the fresh private owner binding from the admin JWT', () => {
    expect(readPtrOwnerProvisionAuthority(
      adminJwt(),
      BigInt(OWNER_FID),
      NOW_SECONDS,
    )).toEqual({ ownerFid: BigInt(OWNER_FID), ownerAuthEpoch: 7 });

    const malformed = [
      adminJwt({ ptr_owner_fid: '0123456789' }),
      adminJwt({ ptr_owner_fid: '987654321' }),
      adminJwt({ ptr_owner_auth_epoch: '7' }),
      adminJwt({ ptr_owner_auth_epoch: 0 }),
      adminJwt({ ptr_owner_auth_epoch: 0x1_0000_0000 }),
      adminJwt({ ptr_owner_auth_epoch: 7.5 }),
      adminJwt({ exp: NOW_SECONDS }),
      adminJwt({ iat: NOW_SECONDS + 1, nbf: NOW_SECONDS + 1 }),
      adminJwt({ token_type: 'admin' }),
      adminJwt({ fid: OWNER_FID }),
      `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`,
    ];
    const duplicatePayload = Buffer.from(JSON.stringify({
      iss: 'https://auth.warpkeep.com',
      sub: 'service:hermes',
      aud: ['warpkeep-ptr-spacetimedb'],
      token_type: 'spacetime-access',
      roles: ['warpkeep-admin'],
      ptr_owner_fid: OWNER_FID,
      ptr_owner_auth_epoch: 7,
      iat: NOW_SECONDS,
      nbf: NOW_SECONDS,
      exp: NOW_SECONDS + 300,
      jti: 'ptr-admin-jti',
    }).replace('"ptr_owner_auth_epoch":7',
      '"ptr_owner_auth_epoch":6,"ptr_owner_auth_epoch":7'))
      .toString('base64url');
    malformed.push(`${Buffer.from('{}').toString('base64url')}.${duplicatePayload}.${'c'.repeat(86)}`);
    for (const token of malformed) {
      expect(() => readPtrOwnerProvisionAuthority(
        token,
        BigInt(OWNER_FID),
        NOW_SECONDS,
      )).toThrow('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    }
  });

  it('keeps the real bridge issuer, local decoder, and PTR verifier on one token contract', () => {
    const issuerClaims = ptrAdminClaims({
      issuer: 'https://auth.warpkeep.com',
      ptrEnabled: true,
      playerCanaryOwnerFid: OWNER_FID,
      ptrSpacetimeDb: {
        database: DATABASE_IDENTITY,
        audience: 'warpkeep-ptr-spacetimedb',
      },
    } as BridgeConfig, NOW_SECONDS, OWNER_FID, 7);

    expect(issuerClaims.token_type).toBe('spacetime-access');
    expect(readPtrOwnerProvisionAuthority(
      jwtFromClaims(issuerClaims),
      BigInt(OWNER_FID),
      NOW_SECONDS,
    )).toEqual({ ownerFid: BigInt(OWNER_FID), ownerAuthEpoch: 7 });
    expect(readFreshPtrAdminClaims(
      issuerClaims,
      BigInt(NOW_SECONDS) * 1_000_000n,
    )).toMatchObject({
      tokenType: 'spacetime-access',
      ownerFid: BigInt(OWNER_FID),
      ownerAuthEpoch: 7,
    });
  });

  it('forces a fresh token and connection immediately before owner provision', async () => {
    const freshToken = adminJwt({ ptr_owner_auth_epoch: 7, jti: 'fresh-session' });
    const freshDisconnect = vi.fn();
    const ownerReducer = vi.fn(async () => undefined);
    const freshConnection = {
      isDisconnectRequested: false,
      disconnect: freshDisconnect,
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({ status: 'fresh' })) },
      reducers: { adminProvisionPtrOwnerV1: ownerReducer },
    };
    const requestToken = vi.fn().mockResolvedValueOnce(freshToken);
    const connectDatabase = vi.fn().mockResolvedValueOnce(freshConnection as never);
    const transport = createPtrOwnerProvisionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });

    const assertCanStartWrite = vi.fn();
    await expect(transport.provisionOwner(
      BigInt(OWNER_FID),
      assertCanStartWrite,
    )).resolves.toEqual({ ownerFid: BigInt(OWNER_FID), ownerAuthEpoch: 7 });

    expect(requestToken).toHaveBeenCalledOnce();
    expect(connectDatabase.mock.calls).toEqual([
      [DATABASE_IDENTITY, freshToken],
    ]);
    expect(ownerReducer).toHaveBeenCalledWith({
      ownerFid: BigInt(OWNER_FID),
      authEpoch: 7,
    });
    expect(assertCanStartWrite).toHaveBeenCalledOnce();
    expect(requestToken.mock.invocationCallOrder[0])
      .toBeLessThan(connectDatabase.mock.invocationCallOrder[0]!);
    expect(connectDatabase.mock.invocationCallOrder[0])
      .toBeLessThan(ownerReducer.mock.invocationCallOrder[0]!);
    await transport.close();
  });

  it('rejects a token/expected-owner mismatch before connection or mutation', async () => {
    const disconnect = vi.fn();
    const ownerReducer = vi.fn();
    const requestToken = vi.fn()
      .mockResolvedValueOnce(adminJwt({ ptr_owner_fid: '987654321' }));
    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false,
      disconnect,
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({})) },
      reducers: { adminProvisionPtrOwnerV1: ownerReducer },
    }) as never);
    const transport = createPtrOwnerProvisionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });
    await expect(transport.provisionOwner(BigInt(OWNER_FID), vi.fn()))
      .rejects.toThrow('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    expect(connectDatabase).not.toHaveBeenCalled();
    expect(ownerReducer).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
    await transport.close();
  });

  it('disconnects the fresh owner session when the reducer ABI is absent', async () => {
    const disconnect = vi.fn();
    const transport = createPtrOwnerProvisionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken: vi.fn(async () => adminJwt()),
      connectDatabase: vi.fn(async () => ({
        isDisconnectRequested: false,
        disconnect,
        procedures: {},
        reducers: {},
      }) as never),
      nowSeconds: () => NOW_SECONDS,
    });
    await expect(transport.provisionOwner(BigInt(OWNER_FID), vi.fn()))
      .rejects.toThrow('PTR_PRODUCTION_REDUCER_ABI_MISSING');
    expect(disconnect).toHaveBeenCalledOnce();
    await transport.close();
  });

  it('keeps generic submit to seven atlas reducers and rejects owner provisioning at runtime', async () => {
    const calls: Array<readonly [string, Readonly<Record<string, unknown>>]> = [];
    const disconnect = vi.fn();
    const ownerProvision = vi.fn(async () => undefined);
    const connection = {
      isDisconnectRequested: false,
      disconnect,
      procedures: {
        adminGetGreaterRealmStatusV1: vi.fn(async () => ({ status: 'ok' })),
      },
      reducers: Object.fromEntries(
        PTR_PRODUCTION_ALLOWED_REDUCERS.map(name => [
          name.replace(/_([a-z0-9])/gu, (_match, child: string) => child.toUpperCase()),
          vi.fn(async (arguments_: Readonly<Record<string, unknown>>) => {
            calls.push([name, arguments_]);
          }),
        ]),
      ),
    };
    connection.reducers.adminProvisionPtrOwnerV1 = ownerProvision;
    const requestToken = vi.fn(async () => atlasJwt());
    const connectDatabase = vi.fn(async () => connection as never);
    const transport = createPtrAtlasImportTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });
    if (false) {
      // @ts-expect-error Owner provisioning is exclusively fresh-token bound.
      void transport.submit('admin_provision_ptr_owner_v1', {}, vi.fn());
    }

    await expect(transport.inspect()).resolves.toEqual({ status: 'ok' });
    for (const reducer of PTR_PRODUCTION_ALLOWED_REDUCERS) {
      await transport.submit(reducer, { exact: reducer }, vi.fn());
    }
    await expect(transport.submit(
      'admin_provision_ptr_owner_v1' as never,
      { ownerFid: BigInt(OWNER_FID), authEpoch: 7 },
      vi.fn(),
    )).rejects.toThrow('PTR_PRODUCTION_REDUCER_FORBIDDEN');
    await expect(transport.submit(
      'admin_suspend_ptr_owner_v1' as never,
      {},
      vi.fn(),
    )).rejects.toThrow('PTR_PRODUCTION_REDUCER_FORBIDDEN');
    expect(calls.map(([name]) => name)).toEqual(PTR_PRODUCTION_ALLOWED_REDUCERS);
    expect(ownerProvision).not.toHaveBeenCalled();
    expect(PTR_PRODUCTION_ALLOWED_REDUCERS).toEqual([
      'admin_stage_greater_realm_release_v1',
      'admin_import_greater_realm_components_v1',
      'admin_import_greater_realm_regions_v1',
      'admin_import_greater_realm_chunk_v1',
      'admin_begin_greater_realm_verification_v1',
      'admin_verify_greater_realm_batch_v1',
      'admin_finalize_greater_realm_release_v1',
    ]);
    expect(PTR_PRODUCTION_ALLOWED_REDUCERS).not.toContain(
      'admin_suspend_ptr_owner_v1',
    );
    expect(connectDatabase).toHaveBeenCalledWith(DATABASE_IDENTITY, atlasJwt(), expect.any(Function));
    await transport.close();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('rejects realm collisions before token issuance and disconnects after ambiguity', async () => {
    const requestToken = vi.fn(async () => atlasJwt());
    expect(() => createPtrAtlasImportTransport({
      databaseIdentity: G002_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase: vi.fn(),
    })).toThrow('PTR_PRODUCTION_TARGET_INVALID');
    expect(requestToken).not.toHaveBeenCalled();

    const disconnect = vi.fn();
    const transport = createPtrAtlasImportTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      nowSeconds: () => NOW_SECONDS,
      connectDatabase: vi.fn(async () => ({
        isDisconnectRequested: false,
        disconnect,
        procedures: {
          adminGetGreaterRealmStatusV1: vi.fn(async () => {
            throw new Error('private network diagnostic');
          }),
        },
        reducers: {},
      }) as never),
    });
    let diagnostic = '';
    try {
      await transport.inspect();
    } catch (error) {
      diagnostic = error instanceof Error ? error.message : String(error);
    }
    expect(diagnostic).toBe('PTR_PRODUCTION_INSPECTION_UNAVAILABLE');
    expect(diagnostic).not.toContain('private network diagnostic');
    expect(disconnect).toHaveBeenCalledOnce();
    await transport.close();
  });

  it('copies nonsecret connection inputs so returned closures retain no input object', async () => {
    const originalIdentity = DATABASE_IDENTITY;
    const mutatedIdentity = '3'.repeat(64);
    const disconnect = vi.fn();
    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false,
      disconnect,
      procedures: {
        adminGetGreaterRealmStatusV1: vi.fn(async () => ({ status: 'ok' })),
      },
      reducers: {},
    }) as never);
    const transportInput = {
      databaseIdentity: originalIdentity,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken: vi.fn(async () => atlasJwt()),
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    };
    const transport = createPtrAtlasImportTransport(transportInput);
    transportInput.databaseIdentity = mutatedIdentity;
    await expect(transport.inspect()).resolves.toEqual({ status: 'ok' });
    expect(connectDatabase).toHaveBeenCalledWith(originalIdentity, atlasJwt(), expect.any(Function));
    await transport.close();
  });

  it('exports only stable error codes even when dependencies contain secrets or FIDs', () => {
    const error = new PtrProductionTransportError(
      'PTR_PRODUCTION_CONNECTION_UNAVAILABLE',
    );
    expect(error.message).toBe('PTR_PRODUCTION_CONNECTION_UNAVAILABLE');
    expect(JSON.stringify(error)).not.toContain(ADMIN_SECRET);
    expect(JSON.stringify(error)).not.toContain('123456789');
  });
});

describe('recovery readback at the actual serialized write boundary', () => {
  it.each(['changed', 'failure', 'closed'] as const)('prevents marker and reducer on %s readback', async mutation => {
    const reducer = vi.fn(async () => undefined), beforeSend = vi.fn();
    let transport: ReturnType<typeof createPtrAtlasImportTransport>;
    const connection = { isDisconnectRequested: false, disconnect: vi.fn(),
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => {
        if (mutation === 'failure') throw new Error('provider failed');
        if (mutation === 'closed') void transport.close();
        return { changed: mutation === 'changed' };
      }) }, reducers: { adminImportGreaterRealmComponentsV1: reducer } };
    transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], requestToken: async () => atlasJwt(),
      connectDatabase: async () => connection as never, nowSeconds: () => NOW_SECONDS });
    await expect(transport.submit('admin_import_greater_realm_components_v1', {}, beforeSend, value => {
      if ((value as any).changed) throw new Error('changed status');
    })).rejects.toThrow();
    expect(beforeSend).not.toHaveBeenCalled(); expect(reducer).not.toHaveBeenCalled();
    await transport.close();
  });
  it('checks fresh status after connection activation before persisting the marker and sending', async () => {
    const events: string[] = [];
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], requestToken: async () => { events.push('token'); return atlasJwt(); },
      connectDatabase: async () => ({ isDisconnectRequested: false, disconnect: vi.fn(),
        procedures: { adminGetGreaterRealmStatusV1: async () => { events.push('read'); return {}; } },
        reducers: { adminImportGreaterRealmComponentsV1: async () => { events.push('reducer'); } } }) as never,
      nowSeconds: () => NOW_SECONDS });
    await transport.submit('admin_import_greater_realm_components_v1', {}, () => { events.push('marker'); }, () => { events.push('validate'); });
    expect(events).toEqual(['token', 'read', 'validate', 'marker', 'reducer']); await transport.close();
  });
});

describe('atlas connection renewal before expiry', () => {
  it.each(['reject', 'expire'] as const)('awaits component-prefix verification before marking: %s', async mode => {
    let now = NOW_SECONDS; const marker = vi.fn(), reducer = vi.fn(async () => undefined);
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now, requestToken: async () => atlasJwt(),
      connectDatabase: async () => ({ isDisconnectRequested: false, disconnect: vi.fn(),
        procedures: { adminGetGreaterRealmStatusV1: async () => ({}) }, reducers: { adminImportGreaterRealmComponentsV1: reducer } }) as never });
    await expect(transport.submit('admin_import_greater_realm_components_v1', {}, marker, async () => {
      await Promise.resolve();
      if (mode === 'reject') throw new Error('component prefix changed');
      now += 301;
    })).rejects.toThrow();
    expect(marker).not.toHaveBeenCalled(); expect(reducer).not.toHaveBeenCalled(); await transport.close();
  });
  it.each([240, 301])('refreshes the session at +%s seconds before marking or submitting', async elapsed => {
    let now = NOW_SECONDS, minted: Record<string, unknown> = {}, requests = 0, disconnects = 0;
    const events: string[] = [];
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now,
      requestToken: async () => { requests++; minted = { iat: now, nbf: now, exp: now + 300 }; return atlasJwt(minted); },
      connectDatabase: async () => {
        const claims = { ...JSON.parse(Buffer.from(atlasJwt(minted).split('.')[1]!, 'base64url').toString()) };
        return { isDisconnectRequested: false, disconnect: () => { disconnects++; },
          procedures: { adminGetGreaterRealmStatusV1: async () => ({}) },
          reducers: { adminImportGreaterRealmComponentsV1: async () => {
            expect(Number(claims.exp)).toBeGreaterThan(now); events.push('reducer');
          } } } as never;
      } });
    await transport.inspect(); now += elapsed;
    await transport.submit('admin_import_greater_realm_components_v1', {}, () => { events.push('marker'); });
    expect(requests).toBe(2); expect(disconnects).toBe(1); expect(events).toEqual(['marker', 'reducer']);
    await transport.close();
  });
  it('does not mark or submit if renewal fails', async () => {
    let now = NOW_SECONDS, requests = 0; const marker = vi.fn(), reducer = vi.fn(async () => undefined);
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now,
      requestToken: async () => { if (++requests > 1) throw new Error('unavailable'); return atlasJwt(); },
      connectDatabase: async () => ({ isDisconnectRequested: false, disconnect: vi.fn(),
        procedures: { adminGetGreaterRealmStatusV1: async () => ({}) }, reducers: { adminImportGreaterRealmComponentsV1: reducer } }) as never });
    await transport.inspect(); now += 301;
    await expect(transport.submit('admin_import_greater_realm_components_v1', {}, marker)).rejects.toThrow();
    expect(marker).not.toHaveBeenCalled(); expect(reducer).not.toHaveBeenCalled(); await transport.close();
  });
  it('rejects expiry during the awaited recovery read before marking', async () => {
    let now = NOW_SECONDS; const marker = vi.fn(), reducer = vi.fn(async () => undefined);
    const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now, requestToken: async () => atlasJwt(),
      connectDatabase: async () => ({ isDisconnectRequested: false, disconnect: vi.fn(),
        procedures: { adminGetGreaterRealmStatusV1: async () => { now += 301; return {}; } },
        reducers: { adminImportGreaterRealmComponentsV1: reducer } }) as never });
    await expect(transport.submit('admin_import_greater_realm_components_v1', {}, marker, () => {}))
      .rejects.toThrow('PTR_PRODUCTION_TOKEN_REFRESH_REQUIRED');
    expect(marker).not.toHaveBeenCalled(); expect(reducer).not.toHaveBeenCalled(); await transport.close();
  });
});

it('closes a late atlas connection if its authority expires while connecting', async () => {
  let now = NOW_SECONDS; const disconnect = vi.fn(), marker = vi.fn(), reducer = vi.fn(async () => undefined);
  const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
    disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now, requestToken: async () => atlasJwt(),
    connectDatabase: async () => { now += 301; return { isDisconnectRequested: false, disconnect,
      procedures: {}, reducers: { adminImportGreaterRealmComponentsV1: reducer } } as never; } });
  await expect(transport.submit('admin_import_greater_realm_components_v1', {}, marker)).rejects.toThrow('PTR_PRODUCTION_TOKEN_REFRESH_REQUIRED');
  expect(disconnect).toHaveBeenCalledOnce(); expect(marker).not.toHaveBeenCalled(); expect(reducer).not.toHaveBeenCalled();
  await transport.close();
});
it('prevents reducer transmission if the durable callback consumes the remaining token lifetime', async () => {
  let now = NOW_SECONDS; const reducer = vi.fn(async () => undefined);
  const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
    disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => now, requestToken: async () => atlasJwt(),
    connectDatabase: async () => ({ isDisconnectRequested: false, disconnect: vi.fn(), procedures: {},
      reducers: { adminImportGreaterRealmComponentsV1: reducer } }) as never });
  await expect(transport.submit('admin_import_greater_realm_components_v1', {}, () => { now += 301; }))
    .rejects.toThrow('PTR_PRODUCTION_TOKEN_EXPIRED_BEFORE_SEND');
  expect(reducer).not.toHaveBeenCalled(); await transport.close();
});

it.each(['invalid', 'throws'] as const)('cleans up a returned connection when the subsequent clock %s', async mode => {
  let connected = false; const disconnect = vi.fn(), marker = vi.fn(), reducer = vi.fn(async () => undefined);
  const transport = createPtrAtlasImportTransport({ databaseIdentity: DATABASE_IDENTITY, adminSecret: ADMIN_SECRET,
    disallowedDatabaseIdentities: [G002_IDENTITY], nowSeconds: () => {
      if (connected) { if (mode === 'throws') throw new Error('clock failed'); return NaN; }
      return NOW_SECONDS;
    }, requestToken: async () => atlasJwt(), connectDatabase: async () => { connected = true;
      return { isDisconnectRequested: false, disconnect, procedures: {}, reducers: { adminImportGreaterRealmComponentsV1: reducer } } as never;
    } });
  await expect(transport.submit('admin_import_greater_realm_components_v1', {}, marker)).rejects.toThrow();
  expect(disconnect).toHaveBeenCalledOnce(); expect(marker).not.toHaveBeenCalled(); expect(reducer).not.toHaveBeenCalled();
  await transport.close();
});
