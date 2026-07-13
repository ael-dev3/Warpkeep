import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterOidcBridgeClientError,
  createFarcasterOidcBridgeClient,
  type FarcasterOidcBridgeFetch
} from '../src/farcaster/farcasterOidcBridgeClient';
import type {
  FarcasterBridgeChallengeRequest,
  FarcasterBridgeExchangeRequest
} from '../src/farcaster/farcasterAuthTypes';

const NOW = Date.UTC(2026, 6, 11, 12, 0, 0);
const ISSUER = 'https://auth.warpkeep.example';
const AUDIENCE = 'warpkeep-spacetimedb';
const FID = 12_345;
const ACCESS_EXPIRY = NOW + 10 * 60 * 1_000;
const SESSION_EXPIRY = NOW + 30 * 24 * 60 * 60 * 1_000;
const BINDING_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

function encodeSegment(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createJwt(overrides: Record<string, unknown> = {}) {
  return `${encodeSegment({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })}.${encodeSegment({
    iss: ISSUER,
    sub: `farcaster:${FID}`,
    aud: [AUDIENCE],
    token_type: 'spacetime-access',
    fid: String(FID),
    auth_version: 2,
    auth_epoch: 1,
    roles: [],
    iat: NOW / 1_000,
    nbf: NOW / 1_000,
    exp: ACCESS_EXPIRY / 1_000,
    session_iat: NOW / 1_000,
    session_exp: ACCESS_EXPIRY / 1_000,
    jti: 'bridge-test-token',
    ...overrides
  })}.test_signature`;
}

const identity = Object.freeze({
  fid: FID
});

function authorized(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    status: 'authorized',
    identity,
    sessionExpiresAt: SESSION_EXPIRY,
    accessToken: createJwt(),
    tokenType: 'spacetime-access',
    accessExpiresAt: ACCESS_EXPIRY,
    ...overrides
  };
}

function pending(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    status: 'pending-admission',
    identity,
    sessionExpiresAt: SESSION_EXPIRY,
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function createFetch(...entries: Array<unknown | Response>) {
  return vi.fn(async () => {
    const entry = entries.shift();
    return entry instanceof Response ? entry : jsonResponse(entry);
  }) as unknown as FarcasterOidcBridgeFetch;
}

function exchangeRequest(): FarcasterBridgeExchangeRequest {
  return {
    message: 'ael-dev3.github.io wants you to sign in with your Ethereum account',
    signature: `0x${'ab'.repeat(96)}`,
    nonce: 'ab'.repeat(24),
    fid: FID,
    requestId: 'd6d120e3-f120-4fb8-9f00-29bb7d46a111',
    domain: 'ael-dev3.github.io',
    siweUri: 'https://ael-dev3.github.io/Warpkeep/',
    expirationTime: new Date(NOW + 5 * 60 * 1_000).toISOString(),
    expiresAt: NOW + 5 * 60 * 1_000,
    bindingVerifier: BINDING_VERIFIER,
    rememberDevice: true,
    identity
  };
}

function createBridge(fetch: FarcasterOidcBridgeFetch) {
  return createFarcasterOidcBridgeClient({
    bridgeUrl: ISSUER,
    issuer: ISSUER,
    audience: AUDIENCE,
    fetch
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Farcaster OIDC bridge v2 client', () => {
  it('fails closed without an exact bridge URL and issuer', () => {
    expect(() => createFarcasterOidcBridgeClient({ fetch: createFetch({}) }))
      .toThrow(FarcasterOidcBridgeClientError);
    expect(() => createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      fetch: createFetch({})
    })).toThrow(FarcasterOidcBridgeClientError);
  });

  it('rejects a non-root issuer and any credentialed bridge on a different origin before fetch', async () => {
    const fetch = createFetch(authorized(), new Response(null, { status: 204 }));
    expect(() => createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://auth.warpkeep.example',
      issuer: 'https://auth.warpkeep.example/oidc',
      audience: AUDIENCE,
      fetch
    })).toThrow(FarcasterOidcBridgeClientError);
    expect(() => createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    })).toThrow(FarcasterOidcBridgeClientError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('permits localhost HTTP only when explicitly enabled', () => {
    expect(() => createFarcasterOidcBridgeClient({
      bridgeUrl: 'http://localhost:8787',
      issuer: 'http://localhost:8787',
      allowLocalHttp: false,
      fetch: createFetch({})
    })).toThrow(FarcasterOidcBridgeClientError);
    expect(() => createFarcasterOidcBridgeClient({
      bridgeUrl: 'http://localhost:8787',
      issuer: 'http://localhost:8787',
      allowLocalHttp: true,
      fetch: createFetch({})
    })).not.toThrow();
  });

  it('posts a context-bound challenge to v2 with cookie credentials', async () => {
    vi.useFakeTimers({ now: NOW });
    const fetch = createFetch({
      nonce: 'cd'.repeat(24),
      requestId: 'af351e21-b8b0-4aaf-8879-8bf3a9e0087d',
      createdAt: NOW,
      expiresAt: NOW + 5 * 60 * 1_000,
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/',
      expirationTime: new Date(NOW + 5 * 60 * 1_000).toISOString()
    });
    const bridge = createBridge(fetch);
    const request = {
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/',
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256' as const,
      bindingVerifier: 'MUST_NOT_CROSS_CHALLENGE_BOUNDARY'
    };

    await expect(bridge.createChallenge(request)).resolves.toEqual({
      nonce: 'cd'.repeat(24),
      requestId: 'af351e21-b8b0-4aaf-8879-8bf3a9e0087d',
      createdAt: NOW,
      expiresAt: NOW + 5 * 60 * 1_000
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe('https://auth.warpkeep.example/v2/farcaster/challenge');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store'
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      domain: request.domain,
      siweUri: request.siweUri,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256'
    });
    expect(String(init?.body)).not.toContain('MUST_NOT_CROSS_CHALLENGE_BOUNDARY');
  });

  it('rejects an absent, downgraded, or non-canonical challenge binding before fetch', async () => {
    const fetch = createFetch({});
    const bridge = createBridge(fetch);
    const base = { domain: 'ael-dev3.github.io', siweUri: 'https://ael-dev3.github.io/Warpkeep/' };
    const invalid: unknown[] = [
      base,
      { ...base, bindingChallenge: BINDING_CHALLENGE, bindingMethod: 'plain' },
      { ...base, bindingChallenge: 'A'.repeat(42), bindingMethod: 'S256' },
      { ...base, bindingChallenge: `${'A'.repeat(42)}B`, bindingMethod: 'S256' }
    ];
    for (const request of invalid) {
      await expect(bridge.createChallenge(request as FarcasterBridgeChallengeRequest))
        .rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exchanges the strict proof envelope, including rememberDevice, without private relay state', async () => {
    vi.useFakeTimers({ now: NOW });
    const fetch = createFetch(authorized());
    const bridge = createBridge(fetch);
    const request = {
      ...exchangeRequest(),
      rememberDevice: false,
      identity: {
        fid: FID,
        username: 'MUST_NOT_CROSS_PROFILE_BOUNDARY',
        displayName: 'Must Not Cross Profile Boundary',
        pfpUrl: 'https://tracking.example/profile.png?fid=12345'
      },
      channelToken: 'PRIVATE_RELAY_CHANNEL_TOKEN',
      custody: '0x1111111111111111111111111111111111111111',
      signatureParams: { nonce: 'do-not-forward' }
    } as FarcasterBridgeExchangeRequest & Record<string, unknown>;

    await expect(bridge.exchangeCompletedSignIn(request)).resolves.toEqual(authorized());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe('https://auth.warpkeep.example/v2/farcaster/exchange');
    expect(init?.credentials).toBe('include');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ ...exchangeRequest(), rememberDevice: false });
    expect(JSON.stringify(body)).not.toContain('PRIVATE_RELAY_CHANNEL_TOKEN');
    expect(JSON.stringify(body)).not.toContain('MUST_NOT_CROSS_PROFILE_BOUNDARY');
    expect(JSON.stringify(body)).not.toContain('tracking.example');
    expect(body.identity).toEqual({ fid: FID });
    expect(body).not.toHaveProperty('custody');
    expect(body).not.toHaveProperty('signatureParams');
    expect(body).not.toHaveProperty('bindingChallenge');
  });

  it('accepts the exact pending-admission variant without token keys', async () => {
    vi.useFakeTimers({ now: NOW });
    const bridge = createBridge(createFetch(pending()));
    const result = await bridge.exchangeCompletedSignIn(exchangeRequest());
    expect(result).toEqual(pending());
    expect(result.status).toBe('pending-admission');
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('tokenType');
    expect(result).not.toHaveProperty('accessExpiresAt');
  });

  it('refreshes with an empty body and the same exact response union', async () => {
    vi.useFakeTimers({ now: NOW });
    const fetch = createFetch(authorized(), pending());
    const bridge = createBridge(fetch);
    await expect(bridge.refreshSession()).resolves.toEqual(authorized());
    await expect(bridge.refreshSession()).resolves.toEqual(pending());

    for (const [url, init] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).toBe('https://auth.warpkeep.example/v2/session/refresh');
      expect(init?.credentials).toBe('include');
      expect(JSON.parse(String(init?.body))).toEqual({});
    }
  });

  it('logs out with an empty POST body and requires status 204', async () => {
    const fetch = createFetch(new Response(null, { status: 204 }));
    await expect(createBridge(fetch).logoutSession()).resolves.toBeUndefined();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe('https://auth.warpkeep.example/v2/session/logout');
    expect(init?.credentials).toBe('include');
    expect(JSON.parse(String(init?.body))).toEqual({});

    const wrongStatus = createBridge(createFetch(jsonResponse({ ok: true }, 200)));
    await expect(wrongStatus.logoutSession()).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
  });

  it('rejects response smuggling, invalid session deadlines, and invalid v2 access claims', async () => {
    vi.useFakeTimers({ now: NOW });
    const invalidResponses = [
      pending({ accessToken: createJwt() }),
      authorized({ extra: true }),
      authorized({ identity: { ...identity, custody: `0x${'11'.repeat(20)}` } }),
      authorized({ identity: { ...identity, username: 'must-not-return' } }),
      authorized({ sessionExpiresAt: NOW }),
      authorized({ sessionExpiresAt: SESSION_EXPIRY + 1 }),
      authorized({ accessExpiresAt: SESSION_EXPIRY + 1 }),
      authorized({ accessToken: createJwt({ auth_version: 1 }) }),
      authorized({ accessToken: createJwt({ auth_epoch: 0 }) }),
      authorized({ accessToken: createJwt({ fid: '7', sub: 'farcaster:7' }) }),
      authorized({ accessToken: createJwt({ session_iat: NOW / 1_000 + 1 }) }),
      authorized({ accessToken: createJwt({ exp: ACCESS_EXPIRY / 1_000 + 1 }) })
    ];
    for (const value of invalidResponses) {
      const bridge = createBridge(createFetch(value));
      await expect(bridge.exchangeCompletedSignIn(exchangeRequest()))
        .rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
  });

  it('rejects malformed proof data before fetch', async () => {
    const fetch = createFetch({});
    const bridge = createBridge(fetch);
    for (const signature of ['0x', '0xabc', `0x${'ab'.repeat(4 * 1_024 + 1)}`]) {
      await expect(bridge.exchangeCompletedSignIn({
        ...exchangeRequest(),
        signature: signature as `0x${string}`
      })).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
    await expect(bridge.exchangeCompletedSignIn({
      ...exchangeRequest(),
      rememberDevice: undefined as unknown as boolean
    })).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('composes caller cancellation without serializing the signal', async () => {
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const rejectAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal?.aborted) rejectAbort();
        else signal?.addEventListener('abort', rejectAbort, { once: true });
      })
    )) as unknown as FarcasterOidcBridgeFetch;
    const bridge = createBridge(fetch);
    const controller = new AbortController();
    const request = exchangeRequest();
    const result = bridge.exchangeCompletedSignIn(request, { signal: controller.signal });
    await Promise.resolve();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.signal).not.toBe(controller.signal);
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(String(init?.body)).not.toContain('signal');
    controller.abort();
    await expect(result).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
  });

  it('rejects non-JSON and oversized responses before parsing', async () => {
    vi.useFakeTimers({ now: NOW });
    const responses = [
      new Response('{}', { headers: { 'content-type': 'application/jsonp' } }),
      new Response('x'.repeat(32_769), { headers: { 'content-type': 'application/json' } })
    ];
    for (const result of responses) {
      await expect(createBridge(createFetch(result)).refreshSession())
        .rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
  });
});
