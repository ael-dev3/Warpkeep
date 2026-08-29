import { describe, expect, it, vi } from 'vitest';

import {
  PTR_REALM_AUDIENCE,
  PTR_REALM_ID,
  createPtrRealmAuthClient,
  isCurrentPtrRealmAuthority,
  ptrRealmAuthFailureCode,
  readPtrRealmPrivateJwtForConnection,
} from '../src/ptr/ptrRealmAuthClient';

const NOW = 1_800_000_000_000;
const FID = 12_345;
const DATABASE = '1'.repeat(64);
const TOKEN = 'quick.auth.token';

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function ptrJwt(overrides: Readonly<Record<string, unknown>> = {}): string {
  const issuedAt = NOW / 1_000;
  return [
    base64Url({ alg: 'ES256', typ: 'JWT', kid: 'warpkeep-test' }),
    base64Url({
      iss: 'https://auth.warpkeep.com',
      sub: `farcaster:${FID}`,
      aud: [PTR_REALM_AUDIENCE],
      token_type: 'spacetime-access',
      auth_version: 2,
      realm_id: PTR_REALM_ID,
      fid: String(FID),
      auth_epoch: 1,
      roles: ['warpkeep-ptr-owner'],
      iat: issuedAt,
      nbf: issuedAt,
      exp: issuedAt + 120,
      session_iat: issuedAt,
      session_exp: issuedAt + 120,
      jti: 'A'.repeat(24),
      ...overrides,
    }),
    'signature',
  ].join('.');
}

function body(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    version: 1,
    status: 'authorized',
    realmId: PTR_REALM_ID,
    identity: { fid: FID },
    databaseIdentity: DATABASE,
    accessToken: ptrJwt(),
    tokenType: 'spacetime-access',
    accessExpiresAt: NOW + 120_000,
    ...overrides,
  };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    ...init,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...init.headers,
    },
  });
}

describe('PTR realm auth client', () => {
  it('exchanges one Quick Auth bearer for an opaque exact PTR authority', async () => {
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => jsonResponse(body()));
    const client = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE,
      fetch: fetchImpl as typeof fetch,
      now: () => NOW,
    });

    const authority = await client.exchangeQuickAuth(TOKEN);

    expect(authority).toEqual({
      realmId: PTR_REALM_ID,
      fid: FID,
      databaseIdentity: DATABASE,
      expiresAt: NOW + 120_000,
    });
    expect(Object.isFrozen(authority)).toBe(true);
    expect(JSON.stringify(authority)).not.toContain(ptrJwt());
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(true);
    expect(isCurrentPtrRealmAuthority({ ...authority }, NOW)).toBe(false);
    expect(readPtrRealmPrivateJwtForConnection(authority, NOW)).toBe(ptrJwt());
    expect(isCurrentPtrRealmAuthority(authority, NOW + 120_000)).toBe(false);
    expect(readPtrRealmPrivateJwtForConnection(authority, NOW + 120_000)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://auth.warpkeep.com/v2/farcaster/ptr/exchange',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    );
    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(request.headers).toEqual({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    });
  });

  it('rejects response, target, identity, and JWT authority drift', async () => {
    const invalidBodies = [
      body({ extra: true }),
      body({ realmId: 'GENESIS_001' }),
      body({ databaseIdentity: '2'.repeat(64) }),
      body({ identity: { fid: FID + 1 } }),
      body({ accessExpiresAt: NOW + 119_000 }),
      body({ accessToken: ptrJwt({ aud: ['warpkeep-spacetimedb'] }) }),
      body({ accessToken: ptrJwt({ roles: [] }) }),
      body({ accessToken: ptrJwt({ realm_id: 'GENESIS_002' }) }),
      body({ accessToken: ptrJwt({ session_exp: NOW / 1_000 + 121 }) }),
      body({ accessToken: ptrJwt({ sub: `farcaster:${FID + 1}` }) }),
    ];
    for (const candidate of invalidBodies) {
      const client = createPtrRealmAuthClient({
        expectedDatabaseIdentity: DATABASE,
        fetch: vi.fn(async () => jsonResponse(candidate)),
        now: () => NOW,
      });
      await expect(client.exchangeQuickAuth(TOKEN)).rejects.toSatisfy(
        (error: unknown) => ptrRealmAuthFailureCode(error) === 'invalid-response',
      );
    }
  });

  it('fails closed on unsafe configuration, credentials, cacheability, and status', async () => {
    expect(() => createPtrRealmAuthClient({
      expectedDatabaseIdentity: 'ptr-alias',
    })).toThrow();
    const invalidCredential = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE,
      fetch: vi.fn(),
    });
    await expect(invalidCredential.exchangeQuickAuth('not a jwt')).rejects.toSatisfy(
      (error: unknown) => ptrRealmAuthFailureCode(error) === 'invalid-credential',
    );

    for (const response of [
      jsonResponse(body(), { headers: { 'cache-control': 'public' } }),
      jsonResponse(body(), { headers: { 'content-type': 'text/plain' } }),
      jsonResponse(body(), { status: 403 }),
      jsonResponse(body(), { status: 503 }),
    ]) {
      const client = createPtrRealmAuthClient({
        expectedDatabaseIdentity: DATABASE,
        fetch: vi.fn(async () => response),
        now: () => NOW,
      });
      await expect(client.exchangeQuickAuth(TOKEN)).rejects.toBeInstanceOf(Error);
    }
  });

  it('classifies aborts without publishing or retaining a usable authority', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('private transport detail')));
    }));
    const client = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE,
      fetch: fetchImpl as typeof fetch,
      timeoutMs: 10_000,
    });
    const pending = client.exchangeQuickAuth(TOKEN, controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy(
      (error: unknown) => ptrRealmAuthFailureCode(error) === 'cancelled',
    );
  });

  it('never starts a credentialed request for an already-cancelled exchange', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const client = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE,
      fetch: fetchImpl,
    });

    await expect(client.exchangeQuickAuth(TOKEN, controller.signal)).rejects.toSatisfy(
      (error: unknown) => ptrRealmAuthFailureCode(error) === 'cancelled',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cleans up its timeout after an early transport failure', async () => {
    vi.useFakeTimers();
    try {
      const client = createPtrRealmAuthClient({
        expectedDatabaseIdentity: DATABASE,
        fetch: vi.fn(async () => { throw new Error('private transport detail'); }),
      });

      await expect(client.exchangeQuickAuth(TOKEN)).rejects.toSatisfy(
        (error: unknown) => ptrRealmAuthFailureCode(error) === 'network-or-cors',
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeroes streamed response chunks after parsing bearer authority', async () => {
    const responseBytes = new TextEncoder().encode(JSON.stringify(body()));
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(responseBytes);
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
    });
    const client = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE,
      fetch: vi.fn(async () => response),
      now: () => NOW,
    });

    await expect(client.exchangeQuickAuth(TOKEN)).resolves.toMatchObject({
      realmId: PTR_REALM_ID,
      fid: FID,
    });
    expect(responseBytes.every(byte => byte === 0)).toBe(true);
  });

  it('zeroes accumulated response chunks when a later chunk exceeds the bound', async () => {
    const firstChunk = new TextEncoder().encode('{"accessToken":"private-token",');
    const oversizedChunk = new Uint8Array(32 * 1_024);
    oversizedChunk.fill(65);
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(firstChunk);
        controller.enqueue(oversizedChunk);
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
    });
    const client = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE,
      fetch: vi.fn(async () => response),
      now: () => NOW,
    });

    await expect(client.exchangeQuickAuth(TOKEN)).rejects.toSatisfy(
      (error: unknown) => ptrRealmAuthFailureCode(error) === 'invalid-response',
    );
    expect(firstChunk.every(byte => byte === 0)).toBe(true);
    expect(oversizedChunk.every(byte => byte === 0)).toBe(true);
  });
});
