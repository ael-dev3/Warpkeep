// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import type { BridgeConfig } from '../services/auth-bridge/src/config';
import { ptrAdminClaims } from '../services/auth-bridge/src/jwt';

import {
  PTR_ADMIN_TOKEN_ENDPOINT,
  PtrProductionAdminTokenError,
  readPtrOwnerProvisionAuthority,
  requestPtrProductionAdminToken,
  takePtrProductionAdminSecret,
} from '../scripts/ptr-production-admin-token';
import {
  PTR_PRODUCTION_ALLOWED_REDUCERS,
  PtrProductionTransportError,
  createPtrProductionTransport,
} from '../scripts/ptr-production-transport';
import { readFreshPtrAdminClaims } from '../spacetimedb/ptr/src/ownerPolicy';

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
    const oldToken = adminJwt({ ptr_owner_auth_epoch: 1, jti: 'old-session' });
    const freshToken = adminJwt({ ptr_owner_auth_epoch: 7, jti: 'fresh-session' });
    const oldDisconnect = vi.fn();
    const freshDisconnect = vi.fn();
    const ownerReducer = vi.fn(async () => undefined);
    const oldConnection = {
      isDisconnectRequested: false,
      disconnect: oldDisconnect,
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({ status: 'old' })) },
      reducers: {},
    };
    const freshConnection = {
      isDisconnectRequested: false,
      disconnect: freshDisconnect,
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({ status: 'fresh' })) },
      reducers: { adminProvisionPtrOwnerV1: ownerReducer },
    };
    const requestToken = vi.fn()
      .mockResolvedValueOnce(oldToken)
      .mockResolvedValueOnce(freshToken);
    const connectDatabase = vi.fn()
      .mockResolvedValueOnce(oldConnection as never)
      .mockResolvedValueOnce(freshConnection as never);
    const transport = createPtrProductionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });

    await expect(transport.inspect()).resolves.toEqual({ status: 'old' });
    const assertCanStartWrite = vi.fn();
    await expect(transport.provisionOwner(
      BigInt(OWNER_FID),
      assertCanStartWrite,
    )).resolves.toEqual({ ownerFid: BigInt(OWNER_FID), ownerAuthEpoch: 7 });

    expect(oldDisconnect).toHaveBeenCalledOnce();
    expect(requestToken).toHaveBeenCalledTimes(2);
    expect(connectDatabase.mock.calls).toEqual([
      [DATABASE_IDENTITY, oldToken],
      [DATABASE_IDENTITY, freshToken],
    ]);
    expect(ownerReducer).toHaveBeenCalledWith({
      ownerFid: BigInt(OWNER_FID),
      authEpoch: 7,
    });
    expect(assertCanStartWrite).toHaveBeenCalledOnce();
    expect(requestToken.mock.invocationCallOrder[1])
      .toBeLessThan(connectDatabase.mock.invocationCallOrder[1]!);
    expect(connectDatabase.mock.invocationCallOrder[1])
      .toBeLessThan(ownerReducer.mock.invocationCallOrder[0]!);
    await transport.close();
  });

  it('rejects a token/expected-owner mismatch before connection or mutation', async () => {
    const disconnect = vi.fn();
    const ownerReducer = vi.fn();
    const requestToken = vi.fn()
      .mockResolvedValueOnce(adminJwt({ ptr_owner_auth_epoch: 1 }))
      .mockResolvedValueOnce(adminJwt({ ptr_owner_fid: '987654321' }));
    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false,
      disconnect,
      procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({})) },
      reducers: { adminProvisionPtrOwnerV1: ownerReducer },
    }) as never);
    const transport = createPtrProductionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase,
      nowSeconds: () => NOW_SECONDS,
    });
    await transport.inspect();
    await expect(transport.provisionOwner(BigInt(OWNER_FID), vi.fn()))
      .rejects.toThrow('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    expect(connectDatabase).toHaveBeenCalledTimes(1);
    expect(ownerReducer).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
    await transport.close();
  });

  it('disconnects the fresh owner session when the reducer ABI is absent', async () => {
    const disconnect = vi.fn();
    const transport = createPtrProductionTransport({
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
    const requestToken = vi.fn(async () => ADMIN_JWT);
    const connectDatabase = vi.fn(async () => connection as never);
    const transport = createPtrProductionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase,
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
    expect(connectDatabase).toHaveBeenCalledWith(DATABASE_IDENTITY, ADMIN_JWT);
    await transport.close();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('rejects realm collisions before token issuance and disconnects after ambiguity', async () => {
    const requestToken = vi.fn(async () => ADMIN_JWT);
    expect(() => createPtrProductionTransport({
      databaseIdentity: G002_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase: vi.fn(),
    })).toThrow('PTR_PRODUCTION_TARGET_INVALID');
    expect(requestToken).not.toHaveBeenCalled();

    const disconnect = vi.fn();
    const transport = createPtrProductionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
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
      requestToken: vi.fn(async () => ADMIN_JWT),
      connectDatabase,
    };
    const transport = createPtrProductionTransport(transportInput);
    transportInput.databaseIdentity = mutatedIdentity;
    await expect(transport.inspect()).resolves.toEqual({ status: 'ok' });
    expect(connectDatabase).toHaveBeenCalledWith(originalIdentity, ADMIN_JWT);
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
