import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterOidcBridgeClientError,
  createFarcasterOidcBridgeClient,
  type FarcasterOidcBridgeFetch
} from '../src/farcaster/farcasterOidcBridgeClient';
import type { FarcasterBridgeExchangeRequest } from '../src/farcaster/farcasterAuthTypes';

const NOW = Date.UTC(2026, 6, 11, 12, 0, 0);
const ISSUER = 'https://auth.warpkeep.example';
const AUDIENCE = 'warpkeep-spacetimedb';
const FID = 12_345;
const EXPIRY = NOW + 30 * 24 * 60 * 60 * 1_000;

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
    jti: 'bridge-test-token',
    ...overrides
  })}.test_signature`;
}

function response(body: unknown, ok = true) {
  return {
    ok,
    text: async () => JSON.stringify(body)
  };
}

function exchangeRequest(): FarcasterBridgeExchangeRequest {
  return {
    message: 'ael-dev3.github.io wants you to sign in with your Ethereum account',
    signature: `0x${'ab'.repeat(65)}`,
    nonce: 'ab'.repeat(24),
    fid: FID,
    requestId: 'd6d120e3-f120-4fb8-9f00-29bb7d46a111',
    domain: 'ael-dev3.github.io',
    siweUri: 'https://ael-dev3.github.io/Warpkeep/',
    expirationTime: new Date(NOW + 5 * 60 * 1_000).toISOString(),
    expiresAt: NOW + 5 * 60 * 1_000,
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

    await expect(bridge.createChallenge!({
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/'
    })).resolves.toEqual({
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
      referrerPolicy: 'no-referrer'
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/'
    });
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
    expect(JSON.stringify(body)).not.toContain('PRIVATE_RELAY_CHANNEL_TOKEN');
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
});
