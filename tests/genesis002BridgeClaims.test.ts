// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Identity } from 'spacetimedb';
import { genesis002AdminClaims, adminClaims, ptrAtlasAdminClaims } from '../services/auth-bridge/src/jwt';
import { spacetimeIdentityFromClaims } from '../services/auth-bridge/src/spacetimeIdentity';
import { readFreshGenesis002AdminClaims } from '../spacetimedb/genesis002/src/adminPolicy';
import { requireGenesis002Admin } from '../spacetimedb/genesis002/src/auth';
import type { Genesis002Context } from '../spacetimedb/genesis002/src/population';
import type { BridgeConfig } from '../services/auth-bridge/src/config';

// Node cannot initialize the server-only SDK runtime. Keep only its error
// constructor boundary here; the actual auth function and parser remain intact.
// The separate pinned-host diagnostic verifies the real server integration.
vi.mock('spacetimedb/server', () => ({ SenderError: class SenderError extends Error {} }));

const ISSUER = 'https://auth.warpkeep.com';
const NOW = 1_800_000_000;
const context = (payload: unknown, sender: string): Genesis002Context => ({
  senderAuth: { jwt: { fullPayload: payload } },
  timestamp: { microsSinceUnixEpoch: BigInt(NOW) * 1_000_000n },
  sender: Identity.fromString(sender),
} as unknown as Genesis002Context);

describe('the actual G002 bridge claims and module authentication boundary', () => {
  it('passes the unchanged signed-payload shape through the existing parser and sender binding', () => {
    const payload = genesis002AdminClaims({ issuer: ISSUER }, NOW);
    const parsed = readFreshGenesis002AdminClaims(payload, BigInt(NOW) * 1_000_000n);
    expect(requireGenesis002Admin(context(payload, parsed.hexIdentity))).toEqual(parsed);
    expect(parsed.hexIdentity).toMatch(/^c200[0-9a-f]{60}$/u);
    expect(parsed.expiresAt - parsed.issuedAt).toBe(300);
  });

  it.each(['missing', 'extra', 'wrong issuer', 'wrong subject', 'wrong audience', 'expired'])(
    'retains the exact module claim checks: %s', kind => {
      const payload: Record<string, unknown> = { ...genesis002AdminClaims({ issuer: ISSUER }, NOW) };
      if (kind === 'missing') delete payload.hex_identity;
      if (kind === 'extra') payload.extra = true;
      if (kind === 'wrong issuer') payload.iss = 'https://other.example';
      if (kind === 'wrong subject') payload.sub = 'service:other';
      if (kind === 'wrong audience') payload.aud = ['warpkeep-spacetimedb'];
      if (kind === 'expired') payload.exp = NOW;
      expect(() => requireGenesis002Admin(context(payload, spacetimeIdentityFromClaims(ISSUER, 'service:hermes')))).toThrow('INVALID_GENESIS_002_ADMIN_SESSION');
    },
  );

  it.each([
    ['https://other.example', 'service:hermes'],
    [ISSUER, 'service:other'],
  ])('rejects an identity derived from a different principal %s / %s', (issuer, subject) => {
    const genuine = genesis002AdminClaims({ issuer: ISSUER }, NOW);
    const otherIdentity = spacetimeIdentityFromClaims(issuer, subject);
    expect(otherIdentity).not.toBe(genuine.hex_identity);
    expect(() => requireGenesis002Admin(context({ ...genuine, hex_identity: otherIdentity }, genuine.hex_identity))).toThrow('INVALID_GENESIS_002_ADMIN_SESSION');
    expect(() => requireGenesis002Admin(context(genuine, otherIdentity))).toThrow('INVALID_GENESIS_002_ADMIN_SESSION');
  });

  it.each([['', 'service:hermes'], [ISSUER, ''], ['x'.repeat(129), 'service:hermes'], [ISSUER, 'é'.repeat(65)]])(
    'rejects invalid issuer/subject byte lengths', (issuer, subject) => {
      expect(() => spacetimeIdentityFromClaims(issuer, subject)).toThrow('Invalid SpacetimeDB identity claims.');
    },
  );

  it('leaves the G001 and PTR administrator claim schemas unchanged', () => {
    const config = { issuer: ISSUER, audience: 'warpkeep-spacetimedb', ptrEnabled: true, ptrSpacetimeDb: { audience: 'warpkeep-ptr-spacetimedb', database: '1'.repeat(64) } } as BridgeConfig;
    const expected = ['aud', 'exp', 'iat', 'iss', 'jti', 'nbf', 'roles', 'sub', 'token_type'];
    expect(Object.keys(adminClaims(config, NOW)).sort()).toEqual(expected);
    expect(Object.keys(ptrAtlasAdminClaims(config, NOW)).sort()).toEqual(expected);
  });
});
