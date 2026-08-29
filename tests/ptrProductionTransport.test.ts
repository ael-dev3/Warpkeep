// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  PTR_ADMIN_TOKEN_ENDPOINT,
  PtrProductionAdminTokenError,
  requestPtrProductionAdminToken,
  takePtrProductionAdminSecret,
} from '../scripts/ptr-production-admin-token';
import {
  PTR_PRODUCTION_ALLOWED_REDUCERS,
  PtrProductionTransportError,
  createPtrProductionTransport,
} from '../scripts/ptr-production-transport';

const ADMIN_SECRET = 's'.repeat(48);
const DATABASE_IDENTITY = '1'.repeat(64);
const G002_IDENTITY = '2'.repeat(64);
const ADMIN_JWT = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;

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

  it('uses only the seven atlas reducers plus owner provisioning and never suspension', async () => {
    const calls: Array<readonly [string, Readonly<Record<string, unknown>>]> = [];
    const disconnect = vi.fn();
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
    const requestToken = vi.fn(async () => ADMIN_JWT);
    const connectDatabase = vi.fn(async () => connection as never);
    const transport = createPtrProductionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      requestToken,
      connectDatabase,
    });

    await expect(transport.inspect()).resolves.toEqual({ status: 'ok' });
    for (const reducer of PTR_PRODUCTION_ALLOWED_REDUCERS) {
      await transport.submit(reducer, { exact: reducer }, vi.fn());
    }
    await expect(transport.submit(
      'admin_suspend_ptr_owner_v1' as never,
      {},
      vi.fn(),
    )).rejects.toThrow('PTR_PRODUCTION_REDUCER_FORBIDDEN');
    expect(calls.map(([name]) => name)).toEqual(PTR_PRODUCTION_ALLOWED_REDUCERS);
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
