import { describe, expect, it } from 'vitest';

import {
  FARCASTER_OIDC_PLAYER_TOKEN_TTL_MS,
  parseFarcasterOidcJwt
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
    auth_epoch: 0,
    roles: [],
    iat: issuedAt,
    nbf: issuedAt,
    exp: (NOW + FARCASTER_OIDC_PLAYER_TOKEN_TTL_MS) / 1_000,
    jti: 'test-session-id',
    ...overrides
  })}.test_signature`;
}

describe('Farcaster OIDC session parser security bounds', () => {
  it('accepts the exact thirty-day issuer contract', () => {
    expect(parseFarcasterOidcJwt(token(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      now: NOW
    })?.claims).toMatchObject({ fid: FID, issuedAt: NOW });
  });

  it.each([
    ['overlong total lifetime', {
      iat: (NOW - 1_000) / 1_000,
      nbf: (NOW - 1_000) / 1_000,
      exp: (NOW + FARCASTER_OIDC_PLAYER_TOKEN_TTL_MS) / 1_000
    }],
    ['fractional expiry', { exp: (NOW + FARCASTER_OIDC_PLAYER_TOKEN_TTL_MS) / 1_000 + 0.5 }],
    ['not-before at expiry', {
      nbf: (NOW + FARCASTER_OIDC_PLAYER_TOKEN_TTL_MS) / 1_000
    }]
  ])('rejects %s', (_caseName, overrides) => {
    expect(parseFarcasterOidcJwt(token(overrides), {
      issuer: ISSUER,
      audience: AUDIENCE,
      now: NOW
    })).toBeUndefined();
  });
});
