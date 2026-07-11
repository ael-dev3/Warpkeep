import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ClaimValidationError,
  isHermesAdminJwt,
  parseFidClaim,
  readWarpkeepBaseJwt,
  readWarpkeepJwt,
} from '../src/claims';

const config = {
  issuer: 'https://issuer.example.test',
  audience: 'warpkeep-spacetimedb',
  tokenType: 'spacetime-access',
} as const;

function playerPayload(overrides: Record<string, unknown> = {}) {
  return {
    iss: config.issuer,
    sub: 'farcaster:12345',
    aud: [config.audience],
    token_type: config.tokenType,
    fid: '12345',
    auth_epoch: 0,
    roles: [],
    ...overrides,
  };
}

test('accepts the bridge player JWT contract and preserves a bigint FID', () => {
  const claims = readWarpkeepJwt(playerPayload(), config);
  assert.equal(claims.fid, 12345n);
  assert.equal(claims.authEpoch, 0);
  assert.deepEqual(claims.audience, [config.audience]);
});

test('requires the exact issuer, audience, token type, and subject/FID pair', () => {
  for (const [payload, code] of [
    [playerPayload({ iss: 'https://other.example.test' }), 'INVALID_ISSUER'],
    [playerPayload({ aud: ['another-audience'] }), 'INVALID_AUDIENCE'],
    [playerPayload({ token_type: 'browser-session' }), 'INVALID_TOKEN_TYPE'],
    [playerPayload({ sub: 'farcaster:999' }), 'INVALID_SUBJECT'],
  ] as const) {
    assert.throws(
      () => readWarpkeepJwt(payload, config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === code,
    );
  }
});

test('rejects unsafe, malformed, and non-positive FID claims', () => {
  for (const value of ['0', '-1', '001', '12.5', 'abc', '9007199254740992']) {
    assert.throws(
      () => parseFidClaim(value),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_FID',
    );
  }
});

test('requires an unsigned 32-bit auth epoch for player tokens', () => {
  for (const auth_epoch of [-1, 0.5, 0x1_0000_0000, '0']) {
    assert.throws(
      () => readWarpkeepJwt(playerPayload({ auth_epoch }), config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_AUTH_EPOCH',
    );
  }
});

test('allows the short-lived admin shape without a player FID', () => {
  const claims = readWarpkeepBaseJwt(
    {
      iss: config.issuer,
      sub: 'service:hermes',
      aud: [config.audience],
      token_type: config.tokenType,
      roles: ['warpkeep-admin'],
    },
    config,
  );
  assert.equal(claims.subject, 'service:hermes');
  assert.deepEqual(claims.roles, ['warpkeep-admin']);
  assert.equal(isHermesAdminJwt(claims), true);
});

test('rejects a player-shaped token even when it carries an admin-looking role', () => {
  const playerClaims = readWarpkeepBaseJwt(
    playerPayload({ roles: ['warpkeep-admin'] }),
    config,
  );
  const overprivilegedServiceClaims = readWarpkeepBaseJwt(
    {
      iss: config.issuer,
      sub: 'service:hermes',
      aud: [config.audience],
      token_type: config.tokenType,
      roles: ['warpkeep-admin', 'another-role'],
    },
    config,
  );

  assert.equal(isHermesAdminJwt(playerClaims), false);
  assert.equal(isHermesAdminJwt(overprivilegedServiceClaims), false);
});
