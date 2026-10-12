import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';

import { MAX_HERMES_ADMIN_SESSION_SECONDS } from '../spacetimedb/src/claims';
import {
  genesis002PrivateLoopbackAdminJwtTimes,
  genesis002PrivateLoopbackJwtClaims,
  runGenesis002PrivateLoopbackWithCleanup,
  verifyGenesis002PrivateLoopback,
} from '../scripts/genesis002-private-loopback-verifier';
import {
  readFreshGenesis002AdminClaims,
} from '../spacetimedb/genesis002/src/adminPolicy';

import { spacetimeIdentityFromClaims } from '../services/auth-bridge/src/spacetimeIdentity';

test('a generic audience is refused with an otherwise complete Genesis 002 admin payload', () => {
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
  readFreshGenesis002AdminClaims(adminClaims, BigInt(times.issuedAt) * 1_000_000n);
  assert.throws(() => readFreshGenesis002AdminClaims({
    ...adminClaims,
    aud: ['warpkeep-spacetimedb'],
  }, BigInt(times.issuedAt) * 1_000_000n), /INVALID_GENESIS_002_ADMIN_SESSION/);
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

test('the synthetic Hermes token uses the real bridge claims accepted unchanged by G002', () => {
  const times = genesis002PrivateLoopbackAdminJwtTimes(2_000_000_000);
  const outboundClaims = genesis002PrivateLoopbackJwtClaims({
    subject: 'service:hermes',
    roles: ['warpkeep-admin'],
    audience: 'warpkeep-genesis-002-spacetimedb',
  }, times);

  assert.equal(
    Object.prototype.hasOwnProperty.call(outboundClaims, 'hex_identity'),
    true,
  );
  const parsed = readFreshGenesis002AdminClaims(outboundClaims, BigInt(times.issuedAt) * 1_000_000n);
  assert.equal(parsed.hexIdentity, spacetimeIdentityFromClaims(parsed.issuer, parsed.subject));
  assert.ok('hex_identity' in outboundClaims);
  const { hex_identity: _identity, ...missingIdentity } = outboundClaims;
  assert.throws(() => readFreshGenesis002AdminClaims(missingIdentity, BigInt(times.issuedAt) * 1_000_000n));
});

const setupProbe = vi.hoisted(() => ({
  failure: new Error('EXPECTED_G002_CLI_ATTESTATION_FAILURE'),
  directories: [] as string[],
}));
vi.mock('../scripts/spacetime-cli-attestation.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('../scripts/spacetime-cli-attestation.mjs')>();
  return {
    ...actual,
    attestPinnedSpacetimeCli(...args: Parameters<typeof actual.attestPinnedSpacetimeCli>) {
      const directory = args[2]?.HOME;
      assert.equal(typeof directory, 'string');
      assert.equal(args[2]?.TMPDIR, directory);
      assert.ok(directory && existsSync(directory));
      setupProbe.directories.push(directory!);
      throw setupProbe.failure;
    },
  };
});

test('the real G002 verifier removes its allocated private directory when CLI attestation fails before fixtures', async () => {
  const first = setupProbe.directories.length;
  try {
    await assert.rejects(verifyGenesis002PrivateLoopback(), error => error === setupProbe.failure);
    const allocated = setupProbe.directories.slice(first);
    assert.equal(allocated.length, 1);
    assert.equal(existsSync(allocated[0]), false);
  } finally {
    for (const directory of setupProbe.directories.slice(first)) rmSync(directory, { recursive: true, force: true });
  }
});

const disposalOrder = ['transport', 'server', 'fixture', 'manifest', 'status', 'chunks', 'snapshot', 'directory'] as const;
function cleanupSteps(visit: (name: (typeof disposalOrder)[number]) => void) {
  return {
    transport: () => visit('transport'), server: () => visit('server'),
    fixture: () => visit('fixture'), manifest: () => visit('manifest'),
    status: () => visit('status'), chunks: () => visit('chunks'),
    snapshot: () => visit('snapshot'), directory: () => visit('directory'),
  };
}

test('an early transport close is memoized through concurrent callers and final disposal before the receipt resolves', async () => {
  const calls: string[] = [];
  const receipt = Object.freeze({ atlasFinalized: true });
  const result = await runGenesis002PrivateLoopbackWithCleanup(cleanupSteps(name => { calls.push(name); }), async closeTransport => {
    await Promise.all([closeTransport(), closeTransport()]);
    assert.deepEqual(calls, ['transport']);
    return receipt;
  });
  assert.equal(result, receipt);
  assert.deepEqual(calls, disposalOrder);
});

test.each(disposalOrder)('a %s cleanup failure prevents an otherwise successful G002 receipt without skipping remaining cleanup', async failedStep => {
  const calls: string[] = [];
  await assert.rejects(runGenesis002PrivateLoopbackWithCleanup(cleanupSteps(name => {
    calls.push(name);
    if (name === failedStep) throw new Error('PRIVATE_FAILURE_MUST_NOT_ESCAPE_AS_CLEANUP_MESSAGE');
  }), async () => ({ atlasFinalized: true })), error => {
    assert.equal((error as Error).message, 'GENESIS_002_LOOPBACK_CLEANUP_FAILED');
    assert.deepEqual(Object.getOwnPropertyDescriptor(error, 'cleanupFailures')?.value, [failedStep]);
    return true;
  });
  assert.deepEqual(calls, disposalOrder);
});

test('the first main failure survives transport/server cleanup failures while all allocated buffers are still zeroed', async () => {
  const failure = new Error('EXPECTED_FIRST_G002_FAILURE');
  const calls: string[] = [];
  const buffers = Object.fromEntries(['manifest', 'status', 'chunks'].map(name => [name, new Uint8Array([1, 2, 3])]));
  await assert.rejects(runGenesis002PrivateLoopbackWithCleanup(cleanupSteps(name => {
    calls.push(name);
    if (name === 'transport' || name === 'server') throw Error('EXPECTED_CLEANUP_FAILURE');
    buffers[name]?.fill(0);
  }), async () => { throw failure; }), error => error === failure);
  assert.deepEqual(calls, disposalOrder);
  assert.deepEqual(Object.getOwnPropertyDescriptor(failure, 'cleanupFailures')?.value, ['transport', 'server']);
  for (const buffer of Object.values(buffers)) assert.deepEqual([...buffer], [0, 0, 0]);
});

test('an undefined main rejection is preserved when cleanup also fails', async () => {
  let caught: unknown = Symbol('not rejected');
  try {
    await runGenesis002PrivateLoopbackWithCleanup(cleanupSteps(name => {
      if (name === 'server') throw Error('EXPECTED_CLEANUP_FAILURE');
    }), async () => { throw undefined; });
  } catch (error) { caught = error; }
  assert.equal(caught, undefined);
});
