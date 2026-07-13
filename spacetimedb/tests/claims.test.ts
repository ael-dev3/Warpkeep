import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ClaimValidationError,
  MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS,
  MAX_HERMES_ADMIN_SESSION_SECONDS,
  MAX_PLAYER_SESSION_SECONDS,
  isAuthEpochResolverJwt,
  isHermesAdminJwt,
  parseFidClaim,
  readFreshAuthEpochResolverJwt,
  readFreshHermesAdminJwt,
  readFreshWarpkeepPlayerJwt,
  readWarpkeepBaseJwt,
  readWarpkeepJwt,
} from '../src/claims';

const config = {
  issuer: 'https://issuer.example.test',
  audience: 'warpkeep-spacetimedb',
  tokenType: 'spacetime-access',
} as const;

test('security authority windows stay pinned to the production limits', () => {
  assert.equal(MAX_PLAYER_SESSION_SECONDS, 600);
  assert.equal(MAX_HERMES_ADMIN_SESSION_SECONDS, 300);
  assert.equal(MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS, 60);
});

function playerPayload(overrides: Record<string, unknown> = {}) {
  const sessionIssuedAt = 1_700_000_000;
  return {
    iss: config.issuer,
    sub: 'farcaster:12345',
    aud: [config.audience],
    token_type: config.tokenType,
    auth_version: 2,
    fid: '12345',
    auth_epoch: 1,
    roles: [],
    session_iat: sessionIssuedAt,
    session_exp: sessionIssuedAt + MAX_PLAYER_SESSION_SECONDS,
    ...overrides,
  };
}

function resolverPayload(overrides: Record<string, unknown> = {}) {
  const iat = 1_700_000_000;
  return {
    iss: config.issuer,
    sub: 'service:auth-epoch-resolver',
    aud: [config.audience],
    token_type: config.tokenType,
    roles: ['warpkeep-auth-epoch-resolver'],
    resolver_fid: '12345',
    iat,
    exp: iat + MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS,
    ...overrides,
  };
}

function adminPayload(overrides: Record<string, unknown> = {}) {
  const iat = 1_700_000_000;
  return {
    iss: config.issuer,
    sub: 'service:hermes',
    aud: [config.audience],
    token_type: config.tokenType,
    roles: ['warpkeep-admin'],
    iat,
    exp: iat + MAX_HERMES_ADMIN_SESSION_SECONDS,
    ...overrides,
  };
}

test('accepts the bridge player JWT contract and preserves a bigint FID', () => {
  const claims = readWarpkeepJwt(playerPayload(), config);
  assert.equal(claims.fid, 12345n);
  assert.equal(claims.authVersion, 2);
  assert.equal(claims.authEpoch, 1);
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

test('requires a positive unsigned 32-bit auth epoch for player tokens', () => {
  for (const auth_epoch of [0, -1, 0.5, 0x1_0000_0000, '1']) {
    assert.throws(
      () => readWarpkeepJwt(playerPayload({ auth_epoch }), config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_AUTH_EPOCH',
    );
  }
});

test('requires the exact player auth contract version', () => {
  for (const auth_version of [undefined, 0, 1, 3, '2']) {
    assert.throws(
      () => readWarpkeepJwt(playerPayload({ auth_version }), config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_AUTH_VERSION',
    );
  }
});

test('requires player roles to remain exactly empty', () => {
  for (const roles of [['warpkeep-admin'], ['player'], ['player', 'player']]) {
    assert.throws(
      () => readWarpkeepJwt(playerPayload({ roles }), config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_ROLES',
    );
  }
});

test('expires player authority at the original absolute session deadline', () => {
  const expiresAt = 1_700_000_000 + MAX_PLAYER_SESSION_SECONDS;
  const valid = readFreshWarpkeepPlayerJwt(
    playerPayload(),
    BigInt(expiresAt) * 1_000_000n - 1n,
    config,
  );
  assert.equal(valid.sessionExpiresAt, expiresAt);

  for (const currentTimeMicros of [
    BigInt(expiresAt) * 1_000_000n,
    BigInt(expiresAt + 1) * 1_000_000n,
  ]) {
    assert.throws(
      () => readFreshWarpkeepPlayerJwt(playerPayload(), currentTimeMicros, config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_PLAYER_SESSION',
    );
  }
});

test('rejects player authority before the original absolute session begins', () => {
  const issuedAt = 1_700_000_000;
  assert.throws(
    () => readFreshWarpkeepPlayerJwt(
      playerPayload(),
      BigInt(issuedAt) * 1_000_000n - 1n,
      config,
    ),
    (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_PLAYER_SESSION',
  );
});

test('rejects missing, malformed, or overlong absolute player sessions', () => {
  const nowMicros = 1_700_000_001n * 1_000_000n;
  for (const payload of [
    playerPayload({ session_iat: undefined }),
    playerPayload({ session_exp: '1702592000' }),
    playerPayload({ session_exp: 1_700_000_000.5 }),
    playerPayload({ session_exp: 1_700_000_000 }),
    playerPayload({ session_exp: 1_700_000_000 + MAX_PLAYER_SESSION_SECONDS + 1 }),
  ]) {
    assert.throws(
      () => readFreshWarpkeepPlayerJwt(payload, nowMicros, config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_PLAYER_SESSION',
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

test('expires Hermes authority at reducer time even when the socket stays open', () => {
  const exp = 1_700_000_000 + MAX_HERMES_ADMIN_SESSION_SECONDS;
  const valid = readFreshHermesAdminJwt(adminPayload(), BigInt(exp) * 1_000_000n - 1n, config);
  assert.equal(valid.subject, 'service:hermes');

  for (const currentTimeMicros of [
    BigInt(exp) * 1_000_000n,
    BigInt(exp + 1) * 1_000_000n,
  ]) {
    assert.throws(
      () => readFreshHermesAdminJwt(adminPayload(), currentTimeMicros, config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_ADMIN_SESSION',
    );
  }
});

test('rejects Hermes authority before its declared issuance time', () => {
  const issuedAt = 1_700_000_000;
  assert.throws(
    () => readFreshHermesAdminJwt(
      adminPayload(),
      BigInt(issuedAt) * 1_000_000n - 1n,
      config,
    ),
    (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_ADMIN_SESSION',
  );
});

test('rejects malformed or overlong Hermes session windows', () => {
  const nowMicros = 1_700_000_001n * 1_000_000n;
  for (const payload of [
    adminPayload({ iat: undefined }),
    adminPayload({ exp: '1700000300' }),
    adminPayload({ exp: 1_700_000_000.5 }),
    adminPayload({ exp: Number.MAX_SAFE_INTEGER + 1 }),
    adminPayload({ exp: 1_700_000_000 }),
    adminPayload({ exp: 1_700_000_000 + MAX_HERMES_ADMIN_SESSION_SECONDS + 1 }),
    adminPayload({ sub: 'farcaster:12345', roles: [] }),
  ]) {
    assert.throws(
      () => readFreshHermesAdminJwt(payload, nowMicros, config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_ADMIN_SESSION',
    );
  }
});

test('accepts only the exact short-lived auth-epoch resolver principal', () => {
  const base = readWarpkeepBaseJwt(resolverPayload(), config);
  assert.equal(isAuthEpochResolverJwt(base), true);
  assert.equal(isHermesAdminJwt(base), false);

  const exp = 1_700_000_000 + MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS;
  const fresh = readFreshAuthEpochResolverJwt(
    resolverPayload(),
    BigInt(exp) * 1_000_000n - 1n,
    config,
  );
  assert.equal(fresh.subject, 'service:auth-epoch-resolver');
  assert.deepEqual(fresh.roles, ['warpkeep-auth-epoch-resolver']);
  assert.equal(fresh.resolverFid, 12345n);
});

test('rejects resolver authority before its declared issuance time', () => {
  const issuedAt = 1_700_000_000;
  assert.throws(
    () => readFreshAuthEpochResolverJwt(
      resolverPayload(),
      BigInt(issuedAt) * 1_000_000n - 1n,
      config,
    ),
    (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_AUTH_RESOLVER_SESSION',
  );
});

test('rejects resolver impersonation, role expansion, expiry, and sessions over the 60-second module ceiling', () => {
  const nowMicros = 1_700_000_001n * 1_000_000n;
  for (const payload of [
    resolverPayload({ sub: 'service:hermes' }),
    resolverPayload({ roles: ['warpkeep-admin'] }),
    resolverPayload({ roles: ['warpkeep-auth-epoch-resolver', 'warpkeep-admin'] }),
    resolverPayload({ resolver_fid: undefined }),
    resolverPayload({ resolver_fid: 12345 }),
    resolverPayload({ resolver_fid: '0' }),
    resolverPayload({ resolver_fid: '9007199254740992' }),
    resolverPayload({ iat: undefined }),
    resolverPayload({ exp: '1700000060' }),
    resolverPayload({ exp: 1_700_000_000 }),
    resolverPayload({ exp: 1_700_000_000 + MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS + 1 }),
  ]) {
    assert.throws(
      () => readFreshAuthEpochResolverJwt(payload, nowMicros, config),
      (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_AUTH_RESOLVER_SESSION',
    );
  }

  const expiresAt = 1_700_000_000 + MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS;
  assert.throws(
    () => readFreshAuthEpochResolverJwt(
      resolverPayload(),
      BigInt(expiresAt) * 1_000_000n,
      config,
    ),
    (error: unknown) => error instanceof ClaimValidationError && error.code === 'INVALID_AUTH_RESOLVER_SESSION',
  );
});
