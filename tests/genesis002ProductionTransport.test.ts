// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import * as transportModule from '../scripts/genesis002-production-transport';

const BRIDGE = 'https://auth.warpkeep.com';
const SECRET = 's'.repeat(48);
const NOW_SECONDS = 1_800_000_000;
const NOW_MILLISECONDS = NOW_SECONDS * 1_000;
const tokenSegment = (value: unknown) => Buffer.from(JSON.stringify(value))
  .toString('base64url');
function adminJwt(overrides: Readonly<Record<string, unknown>> = {}): string {
  return [
    tokenSegment({ alg: 'ES256', typ: 'JWT' }),
    tokenSegment({
      iss: 'https://auth.warpkeep.com',
      sub: 'service:hermes',
      aud: ['warpkeep-genesis-002-spacetimedb'],
      token_type: 'spacetime-access',
      roles: ['warpkeep-admin'],
      iat: NOW_SECONDS,
      nbf: NOW_SECONDS,
      exp: NOW_SECONDS + 300,
      jti: 'transport-test-id',
      ...overrides,
    }),
    'signature',
  ].join('.');
}
const ADMIN_JWT = adminJwt();

type TokenRequestOptions = Readonly<{
  fetchImpl: typeof fetch;
  nowMilliseconds?: () => number;
}>;
const requestToken = (
  transportModule as typeof transportModule & {
    requestGenesis002AdminToken: (
      bridge: string,
      secret: string,
      options: TokenRequestOptions,
    ) => Promise<string>;
  }
).requestGenesis002AdminToken;

function response(overrides: Readonly<Record<string, unknown>> = {}): Response {
  return new Response(JSON.stringify({
    token: ADMIN_JWT,
    tokenType: 'spacetime-access',
    expiresIn: 300,
    ...overrides,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

describe('Genesis 002 production administrator transport', () => {
  it('requests only the dedicated bodyless G002 route', async () => {
    expect(requestToken).toBeTypeOf('function');
    let capturedHeaders = new Headers();
    let liveHeaders: HeadersInit | undefined;
    const fetchImpl = vi.fn(async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedHeaders = new Headers(init?.headers);
      liveHeaders = init?.headers;
      return response();
    });
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl,
      nowMilliseconds: () => NOW_MILLISECONDS,
    })).resolves.toBe(ADMIN_JWT);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BRIDGE}/v1/admin/genesis-002-token`);
    expect(String(url)).not.toContain('/v1/admin/token');
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(init).not.toHaveProperty('body');
    expect(capturedHeaders.get('authorization')).toBe(`Bearer ${SECRET}`);
    expect(capturedHeaders.has('origin')).toBe(false);
    expect(capturedHeaders.has('cookie')).toBe(false);
    expect(new Headers(liveHeaders).has('authorization')).toBe(false);
  });

  it('never falls back to the generic administrator-token response', async () => {
    expect(requestToken).toBeTypeOf('function');
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      return url.endsWith('/v1/admin/token')
        ? response()
        : new Response('{}', {
            status: 404,
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
          });
    });
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl,
      nowMilliseconds: () => NOW_MILLISECONDS,
    })).rejects.toThrow(
      'GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID',
    );
    expect(requested).toEqual([`${BRIDGE}/v1/admin/genesis-002-token`]);
  });

  it('rejects a generic-admin audience returned from the dedicated route', async () => {
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl: vi.fn(async () => response({
        token: adminJwt({ aud: ['warpkeep-spacetimedb'] }),
      })),
      nowMilliseconds: () => NOW_MILLISECONDS,
    })).rejects.toThrow('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  });

  it.each([
    ['expired', NOW_SECONDS - 301, NOW_SECONDS - 1],
    ['exactly expired', NOW_SECONDS - 300, NOW_SECONDS],
    ['beyond one-second future skew', NOW_SECONDS + 2, NOW_SECONDS + 302],
    ['far future', NOW_SECONDS + 86_400, NOW_SECONDS + 86_700],
  ])('rejects a token that is %s before returning it', async (_name, iat, exp) => {
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl: vi.fn(async () => response({
        token: adminJwt({ iat, nbf: iat, exp }),
      })),
      nowMilliseconds: () => NOW_MILLISECONDS,
    })).rejects.toThrow('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  });

  it('accepts exactly one second of future issuer clock skew', async () => {
    const iat = NOW_SECONDS + 1;
    const token = adminJwt({ iat, nbf: iat, exp: iat + 300 });
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl: vi.fn(async () => response({ token })),
      nowMilliseconds: () => NOW_MILLISECONDS,
    })).resolves.toBe(token);
  });

  it('accepts the exact response keys in any JSON member order', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      expiresIn: 300,
      tokenType: 'spacetime-access',
      token: ADMIN_JWT,
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    }));
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl,
      nowMilliseconds: () => NOW_MILLISECONDS,
    })).resolves.toBe(ADMIN_JWT);
  });

  it('rejects an invalid trusted clock result after reading the response', async () => {
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl: vi.fn(async () => response()),
      nowMilliseconds: () => Number.NaN,
    })).rejects.toThrow('GENESIS_002_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');
  });

  it('samples the trusted clock only after the bounded response reaches EOF', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      token: ADMIN_JWT,
      tokenType: 'spacetime-access',
      expiresIn: 300,
    }));
    let reads = 0;
    const boundedResponse = {
      status: 200,
      redirected: false,
      headers: new Headers({
        'content-type': 'application/json',
        'cache-control': 'no-store',
      }),
      body: {
        getReader: () => ({
          read: async () => {
            reads += 1;
            return reads === 1
              ? { done: false, value: bytes }
              : { done: true, value: undefined };
          },
          cancel: async () => undefined,
        }),
      },
    } as unknown as Response;
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl: vi.fn(async () => boundedResponse),
      nowMilliseconds: () => {
        expect(reads).toBe(2);
        return NOW_MILLISECONDS;
      },
    })).resolves.toBe(ADMIN_JWT);
  });

  it.each([
    [{ expiresIn: 299 }, 'wrong lifetime'],
    [{ tokenType: 'bearer' }, 'wrong token type'],
    [{ token: 'not-a-jwt' }, 'malformed token'],
    [{ audience: 'warpkeep-spacetimedb' }, 'unknown generic authority field'],
  ])('rejects %s responses', async (override, _name) => {
    expect(requestToken).toBeTypeOf('function');
    await expect(requestToken(BRIDGE, SECRET, {
      fetchImpl: vi.fn(async () => response(override)),
      nowMilliseconds: () => NOW_MILLISECONDS,
    })).rejects.toThrow('GENESIS_002_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  });
});
