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
const EXPIRY = NOW + 30 * 24 * 60 * 60 * 1_000;
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
    auth_epoch: 0,
    roles: [],
    iat: NOW / 1_000,
    nbf: NOW / 1_000,
    exp: EXPIRY / 1_000,
    session_iat: NOW / 1_000,
    session_exp: EXPIRY / 1_000,
    jti: 'bridge-test-token',
    ...overrides
  })}.test_signature`;
}

function response(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
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
    identity: {
      fid: FID,
      username: 'keeper',
      displayName: 'The Keeper',
      pfpUrl: 'https://example.com/keeper.png'
    }
  };
}

function createFetch(...responses: unknown[]) {
  return vi.fn(async () => response(responses.shift())) as unknown as FarcasterOidcBridgeFetch;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Farcaster OIDC bridge client', () => {
  it('fails closed when a public bridge URL or exact issuer is unavailable', () => {
    expect(() => createFarcasterOidcBridgeClient({
      fetch: createFetch({ token: createJwt() })
    })).toThrow(FarcasterOidcBridgeClientError);
    expect(() => createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      fetch: createFetch({ token: createJwt() })
    })).toThrow(FarcasterOidcBridgeClientError);
  });

  it('permits localhost HTTP only when an explicit development client opts in', () => {
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

  it('loads a context-bound bridge challenge without accepting arbitrary relay state', async () => {
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
    const bridge = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example/',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });

    const challengeRequest = {
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/',
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256' as const,
      bindingVerifier: 'MUST_NOT_CROSS_CHALLENGE_BOUNDARY'
    };
    await expect(bridge.createChallenge(challengeRequest)).resolves.toEqual({
      nonce: 'cd'.repeat(24),
      requestId: 'af351e21-b8b0-4aaf-8879-8bf3a9e0087d',
      createdAt: NOW,
      expiresAt: NOW + 5 * 60 * 1_000
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe('https://bridge.warpkeep.example/v1/farcaster/challenge');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store'
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/',
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256'
    });
    expect(String(init?.body)).not.toContain('MUST_NOT_CROSS_CHALLENGE_BOUNDARY');
  });

  it('rejects absent, downgraded, or non-canonical challenge binding before fetch', async () => {
    const fetch = createFetch({});
    const bridge = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });
    const base = {
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/'
    };
    const invalid: unknown[] = [
      base,
      { ...base, bindingChallenge: BINDING_CHALLENGE, bindingMethod: 'plain' },
      { ...base, bindingChallenge: 'A'.repeat(42), bindingMethod: 'S256' },
      { ...base, bindingChallenge: `${'A'.repeat(42)}B`, bindingMethod: 'S256' }
    ];

    for (const request of invalid) {
      await expect(bridge.createChallenge(
        request as FarcasterBridgeChallengeRequest
      )).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exchanges an explicitly constructed proof envelope and never forwards channel/private metadata', async () => {
    vi.useFakeTimers({ now: NOW });
    const fetch = createFetch({
      token: createJwt(),
      tokenType: 'spacetime-access',
      expiresAt: EXPIRY
    });
    const bridge = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });
    const request = {
      ...exchangeRequest(),
      channelToken: 'PRIVATE_RELAY_CHANNEL_TOKEN',
      custody: '0x1111111111111111111111111111111111111111',
      signatureParams: { nonce: 'do-not-forward' }
    } as FarcasterBridgeExchangeRequest & Record<string, unknown>;

    await expect(bridge.exchangeCompletedSignIn(request)).resolves.toEqual({
      jwt: createJwt(),
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresAt: EXPIRY
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual(exchangeRequest());
    expect(body).not.toHaveProperty('channelToken');
    expect(body).not.toHaveProperty('custody');
    expect(body).not.toHaveProperty('signatureParams');
    expect(body).not.toHaveProperty('bindingChallenge');
    expect(JSON.stringify(body)).not.toContain('PRIVATE_RELAY_CHANNEL_TOKEN');
  });

  it('rejects malformed or overlong signatures before sending proof data', async () => {
    vi.useFakeTimers({ now: NOW });
    const fetch = createFetch({});
    const bridge = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });

    for (const signature of ['0x', '0xabc', `0x${'ab'.repeat(4 * 1_024 + 1)}`]) {
      await expect(bridge.exchangeCompletedSignIn({
        ...exchangeRequest(),
        signature: signature as `0x${string}`
      })).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
    for (const bindingVerifier of [
      '',
      'A'.repeat(42),
      'A'.repeat(44),
      `${'A'.repeat(42)}B`
    ]) {
      await expect(bridge.exchangeCompletedSignIn({
        ...exchangeRequest(),
        bindingVerifier
      })).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('composes caller cancellation with the timeout without serializing either signal', async () => {
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('missing signal'));
          return;
        }
        const rejectAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) rejectAbort();
        else signal.addEventListener('abort', rejectAbort, { once: true });
      })
    )) as unknown as FarcasterOidcBridgeFetch;
    const bridge = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });
    const controller = new AbortController();
    const pending = bridge.exchangeCompletedSignIn(exchangeRequest(), {
      signal: controller.signal
    });
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal).not.toBe(controller.signal);
    expect(init?.signal?.aborted).toBe(false);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual(exchangeRequest());
    expect(body).not.toHaveProperty('signal');

    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    expect(init?.signal?.aborted).toBe(true);

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(bridge.exchangeCompletedSignIn(exchangeRequest(), {
      signal: preAborted.signal
    })).rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects an OIDC response whose token claims do not bind to the completed verified FID', async () => {
    vi.useFakeTimers({ now: NOW });
    const fetch = createFetch({ token: createJwt({ fid: '7', sub: 'farcaster:7' }) });
    const bridge = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://bridge.warpkeep.example',
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });

    await expect(bridge.exchangeCompletedSignIn(exchangeRequest()))
      .rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
  });

  it('rejects non-JSON and oversized bridge responses before parsing', async () => {
    vi.useFakeTimers({ now: NOW });
    const nonJson = vi.fn(async () => new Response('{}', {
      headers: { 'content-type': 'application/jsonp' }
    })) as unknown as FarcasterOidcBridgeFetch;
    const oversized = vi.fn(async () => new Response('x'.repeat(32_769), {
      headers: { 'content-type': 'application/json' }
    })) as unknown as FarcasterOidcBridgeFetch;

    for (const fetch of [nonJson, oversized]) {
      const bridge = createFarcasterOidcBridgeClient({
        bridgeUrl: 'https://bridge.warpkeep.example',
        issuer: ISSUER,
        audience: AUDIENCE,
        fetch
      });
      await expect(bridge.exchangeCompletedSignIn(exchangeRequest()))
        .rejects.toBeInstanceOf(FarcasterOidcBridgeClientError);
    }
  });
});
