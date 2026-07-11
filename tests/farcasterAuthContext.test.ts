import { describe, expect, it } from 'vitest';

import {
  FARCASTER_AUTH_NONCE_BYTES,
  FARCASTER_AUTH_REQUEST_TTL_MS,
  FarcasterAuthContextError,
  createFarcasterRequestMaterial,
  createSecureFarcasterNonce,
  createSecureFarcasterRequestId,
  getBrowserFarcasterAuthContext,
  resolveFarcasterAuthContext,
  type FarcasterSecureRandomSource
} from '../src/farcaster/farcasterAuthContext';

function deterministicRandomSource(
  value = 0xab,
  randomUUID?: () => `${string}-${string}-${string}-${string}-${string}`
): FarcasterSecureRandomSource {
  return {
    getRandomValues: ((array: Uint8Array) => {
      array.fill(value);
      return array;
    }) as Crypto['getRandomValues'],
    ...(randomUUID ? { randomUUID } : {})
  };
}

describe('Farcaster auth runtime context', () => {
  it('derives localhost, legacy Pages, and canonical-domain SIWF values without a route hash', () => {
    expect(resolveFarcasterAuthContext({
      origin: 'http://localhost:5173',
      host: 'localhost:5173',
      baseUrl: '/'
    })).toEqual({
      domain: 'localhost:5173',
      siweUri: 'http://localhost:5173/'
    });

    expect(resolveFarcasterAuthContext({
      origin: 'https://ael-dev3.github.io',
      host: 'ael-dev3.github.io',
      baseUrl: '/Warpkeep/'
    })).toEqual({
      domain: 'ael-dev3.github.io',
      siweUri: 'https://ael-dev3.github.io/Warpkeep/'
    });

    expect(getBrowserFarcasterAuthContext('/Warpkeep', {
      origin: 'https://ael-dev3.github.io',
      host: 'ael-dev3.github.io'
    }).siweUri).toBe('https://ael-dev3.github.io/Warpkeep/');

    expect(resolveFarcasterAuthContext({
      origin: 'https://warpkeep.com',
      host: 'warpkeep.com',
      baseUrl: '/'
    })).toEqual({
      domain: 'warpkeep.com',
      siweUri: 'https://warpkeep.com/'
    });
  });

  it('rejects cross-origin, credentialed, queried, and traversal-shaped inputs', () => {
    const invalidInputs = [
      {
        origin: 'https://ael-dev3.github.io',
        host: 'attacker.example',
        baseUrl: '/Warpkeep/'
      },
      {
        origin: 'https://user:secret@ael-dev3.github.io',
        host: 'ael-dev3.github.io',
        baseUrl: '/Warpkeep/'
      },
      {
        origin: 'https://ael-dev3.github.io',
        host: 'ael-dev3.github.io',
        baseUrl: 'https://attacker.example/'
      },
      {
        origin: 'https://ael-dev3.github.io',
        host: 'ael-dev3.github.io',
        baseUrl: '/Warpkeep/?fid=777'
      },
      {
        origin: 'https://ael-dev3.github.io',
        host: 'ael-dev3.github.io',
        baseUrl: '/../Warpkeep/'
      },
      {
        origin: 'https://ael-dev3.github.io',
        host: 'ael-dev3.github.io',
        baseUrl: '/%2e%2e/Warpkeep/'
      }
    ];

    for (const input of invalidInputs) {
      expect(() => resolveFarcasterAuthContext(input)).toThrow(FarcasterAuthContextError);
    }
  });
});

describe('Farcaster auth request material', () => {
  it('uses crypto-only identifiers, a 192-bit alphanumeric nonce, and a five-minute expiry', () => {
    const requestId = 'd6d120e3-f120-4fb8-9f00-29bb7d46a111' as const;
    const source = deterministicRandomSource(0xab, () => requestId);
    const createdAt = Date.UTC(2026, 6, 11, 10, 0, 0);
    const material = createFarcasterRequestMaterial(createdAt, source);

    expect(material).toEqual({
      requestId,
      nonce: 'ab'.repeat(FARCASTER_AUTH_NONCE_BYTES),
      createdAt,
      expiresAt: createdAt + FARCASTER_AUTH_REQUEST_TTL_MS,
      expirationTime: new Date(createdAt + FARCASTER_AUTH_REQUEST_TTL_MS).toISOString()
    });
    expect(material.nonce).toMatch(/^[A-Za-z0-9]{48}$/);
  });

  it('builds a standards-shaped UUID from getRandomValues when randomUUID is absent', () => {
    const source = deterministicRandomSource(0);
    expect(createSecureFarcasterRequestId(source))
      .toBe('00000000-0000-4000-8000-000000000000');
    expect(createSecureFarcasterNonce(source)).toBe('00'.repeat(FARCASTER_AUTH_NONCE_BYTES));
  });

  it('fails closed when secure randomness or a valid clock is unavailable', () => {
    expect(() => createSecureFarcasterNonce({} as FarcasterSecureRandomSource))
      .toThrow(/Secure browser randomness/i);
    expect(() => createFarcasterRequestMaterial(Number.NaN, deterministicRandomSource()))
      .toThrow(/valid current time/i);
  });
});
