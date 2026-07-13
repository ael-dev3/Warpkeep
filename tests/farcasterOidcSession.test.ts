import { describe, expect, it } from 'vitest';

import {
  FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS,
  parseFarcasterOidcJwt,
  readSafeFarcasterOidcIssuer
} from '../src/farcaster/farcasterOidcSession';

const NOW = Date.UTC(2026, 6, 12, 0, 0, 0);
const ISSUER = 'https://auth.warpkeep.example';
const AUDIENCE = 'warpkeep-spacetimedb';
const FID = 12_345;

function encode(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function token(overrides: Record<string, unknown> = {}) {
  const issuedAt = NOW / 1_000;
  return `${encode({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })}.${encode({
    iss: ISSUER,
    sub: `farcaster:${FID}`,
    aud: [AUDIENCE],
    token_type: 'spacetime-access',
    fid: String(FID),
    auth_version: 2,
    auth_epoch: 1,
    roles: [],
    iat: issuedAt,
    nbf: issuedAt,
    exp: (NOW + FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS) / 1_000,
    session_iat: issuedAt,
    session_exp: (NOW + FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS) / 1_000,
    jti: 'test-session-id',
    ...overrides
  })}.test_signature`;
}

describe('Farcaster OIDC session parser security bounds', () => {
  it('normalizes an issuer to its exact origin and rejects non-root issuer paths', () => {
    expect(readSafeFarcasterOidcIssuer('https://auth.warpkeep.example/'))
      .toBe('https://auth.warpkeep.example');
    expect(readSafeFarcasterOidcIssuer('https://auth.warpkeep.example/oidc'))
      .toBeUndefined();
    expect(readSafeFarcasterOidcIssuer('https://auth.warpkeep.example/%2e%2e/oidc'))
      .toBeUndefined();
    expect(readSafeFarcasterOidcIssuer('https://auth.warpkeep.example/oidc/..'))
      .toBeUndefined();
  });

  it('accepts the exact v2 ten-minute access contract', () => {
    expect(parseFarcasterOidcJwt(token(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      now: NOW
    })?.claims).toMatchObject({ fid: FID, issuedAt: NOW, authEpoch: 1 });
  });

  it.each([
    ['missing auth version', { auth_version: undefined }],
    ['downgraded auth version', { auth_version: 1 }],
    ['legacy epoch zero', { auth_epoch: 0 }],
    ['epoch above unsigned 32-bit', { auth_epoch: 0x1_0000_0000 }],
    ['overlong total lifetime', {
      iat: (NOW - 1_000) / 1_000,
      nbf: (NOW - 1_000) / 1_000,
      session_iat: (NOW - 1_000) / 1_000,
      exp: (NOW + FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS) / 1_000
    }],
    ['fractional expiry', { exp: (NOW + FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS) / 1_000 + 0.5 }],
    ['not-before at expiry', {
      nbf: (NOW + FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS) / 1_000
    }],
    ['not-before later than issued-at', { nbf: NOW / 1_000 + 1 }],
    ['mismatched session issued-at', { session_iat: NOW / 1_000 + 1 }],
    ['mismatched absolute session expiry', {
      session_exp: (NOW + FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS) / 1_000 - 1
    }]
  ])('rejects %s', (_caseName, overrides) => {
    expect(parseFarcasterOidcJwt(token(overrides), {
      issuer: ISSUER,
      audience: AUDIENCE,
      now: NOW
    })).toBeUndefined();
  });
});
