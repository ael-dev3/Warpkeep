import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOwnerCanaryAuthClient,
  OWNER_CANARY_EXCHANGE_PATH,
  ownerCanaryAuthFailureCode,
} from '../src/owner-canary/ownerCanaryAuthClient';

const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);
const ISSUER = 'https://auth.warpkeep.example';
const AUDIENCE = 'warpkeep-spacetimedb';
const FID = 12_345;
const EXPIRES_AT = NOW + 10 * 60 * 1_000;
const QUICK_AUTH_TOKEN = 'header.payload.signature';

function segment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function playerJwt(overrides: Record<string, unknown> = {}): string {
  return `${segment({ alg: 'ES256', typ: 'JWT', kid: 'owner-canary-test' })}.${segment({
    iss: ISSUER,
    sub: `farcaster:${FID}`,
    aud: [AUDIENCE],
    token_type: 'spacetime-access',
    fid: String(FID),
    auth_version: 2,
    auth_epoch: 7,
    roles: [],
    iat: NOW / 1_000,
    nbf: NOW / 1_000,
    exp: EXPIRES_AT / 1_000,
    session_iat: NOW / 1_000,
    session_exp: EXPIRES_AT / 1_000,
    jti: 'owner-canary-test-token',
    ...overrides,
  })}.test_signature`;
}

function response(overrides: Record<string, unknown> = {}, status = 200): Response {
  return new Response(JSON.stringify({
    version: 1,
    status: 'authorized',
    accessToken: playerJwt(),
    tokenType: 'spacetime-access',
    accessExpiresAt: EXPIRES_AT,
    ...overrides,
  }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function client(fetch: typeof globalThis.fetch) {
  return createOwnerCanaryAuthClient({
    bridgeOrigin: ISSUER,
    issuer: ISSUER,
    audience: AUDIENCE,
    now: () => NOW,
    fetch,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('owner canary Quick Auth client', () => {
  it('posts one memory-only bearer to the owner endpoint and accepts only the identity-free response', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    const result = await client(fetch).exchangeQuickAuth(QUICK_AUTH_TOKEN);

    expect(result.subjectFid).toBe(FID);
    expect(result.session).toEqual({
      jwt: playerJwt(),
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresAt: EXPIRES_AT,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(`${ISSUER}${OWNER_CANARY_EXCHANGE_PATH}`);
    expect(init).toMatchObject({
      method: 'POST',
      body: '{}',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${QUICK_AUTH_TOKEN}`);
  });

  it.each([
    ['identity', { identity: { fid: FID } }],
    ['FID', { fid: FID }],
    ['wrong version', { version: 2 }],
    ['expiry mismatch', { accessExpiresAt: EXPIRES_AT - 1_000 }],
    ['wrong token subject', { accessToken: playerJwt({ fid: '67890' }) }],
  ])('rejects a response containing %s', async (_label, overrides) => {
    const error = await client(vi.fn(async () => response(overrides)))
      .exchangeQuickAuth(QUICK_AUTH_TOKEN)
      .catch((caught: unknown) => caught);
    expect(ownerCanaryAuthFailureCode(error)).toBe('invalid-response');
  });

  it.each([
    [401, 'invalid-credential'],
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [503, 'service-unavailable'],
  ] as const)('classifies HTTP %i without reading or returning its body', async (status, code) => {
    const error = await client(vi.fn(async () => response({ privateFid: FID }, status)))
      .exchangeQuickAuth(QUICK_AUTH_TOKEN)
      .catch((caught: unknown) => caught);
    expect(ownerCanaryAuthFailureCode(error)).toBe(code);
  });

  it('fails before fetch for malformed credentials or trust coordinates', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    const malformed = await client(fetch).exchangeQuickAuth('not-a-jwt')
      .catch((caught: unknown) => caught);
    expect(ownerCanaryAuthFailureCode(malformed)).toBe('invalid-credential');
    expect(fetch).not.toHaveBeenCalled();
    expect(() => createOwnerCanaryAuthClient({
      bridgeOrigin: 'https://bridge.warpkeep.example',
      issuer: ISSUER,
      fetch,
    })).toThrow();
  });

  it('keeps the deadline active while reading the response body', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new ReadableStream({
      pull() {
        return new Promise<void>(() => undefined);
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const pending = client(fetch).exchangeQuickAuth(QUICK_AUTH_TOKEN)
      .catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await pending;
    expect(ownerCanaryAuthFailureCode(error)).toBe('timeout');
  });
});
