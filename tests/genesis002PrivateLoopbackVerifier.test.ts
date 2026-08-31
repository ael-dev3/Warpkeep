import assert from 'node:assert/strict';
import { test } from 'vitest';

import { MAX_HERMES_ADMIN_SESSION_SECONDS } from '../spacetimedb/src/claims';
import {
  genesis002PrivateLoopbackAdminJwtTimes,
  genesis002PrivateLoopbackJwtClaims,
} from '../scripts/genesis002-private-loopback-verifier';

test('a generic audience makes the local Genesis 002 import fail', () => {
  const times = genesis002PrivateLoopbackAdminJwtTimes(2_000_000_000);
  const adminClaims = genesis002PrivateLoopbackJwtClaims({
    subject: 'service:hermes',
    roles: ['warpkeep-admin'],
    audience: 'warpkeep-genesis-002-spacetimedb',
  }, times);
  const nonAdminClaims = genesis002PrivateLoopbackJwtClaims({
    subject: 'farcaster:9900002',
    roles: [],
    audience: 'warpkeep-spacetimedb',
    fid: '9900002',
  }, times);

  assert.deepEqual(adminClaims.aud, ['warpkeep-genesis-002-spacetimedb']);
  assert.deepEqual(nonAdminClaims.aud, ['warpkeep-spacetimedb']);
  assert.notDeepEqual(nonAdminClaims.aud, adminClaims.aud);
  assert.deepEqual(nonAdminClaims.roles, []);
});

test('the synthetic Genesis 002 admin token tolerates 30 seconds of clock skew below the admin cap', () => {
  const wallClockSeconds = 2_000_000_000;
  const times = genesis002PrivateLoopbackAdminJwtTimes(wallClockSeconds);

  assert.deepEqual(times, {
    issuedAt: 1_999_999_970,
    notBefore: 1_999_999_970,
    expiresAt: 2_000_000_240,
  });
  assert.equal(times.expiresAt - times.issuedAt, 270);
  assert.ok(
    times.expiresAt - times.issuedAt < MAX_HERMES_ADMIN_SESSION_SECONDS,
  );
});
