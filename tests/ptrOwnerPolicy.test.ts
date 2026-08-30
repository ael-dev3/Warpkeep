import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import {
  PTR_AUDIENCE,
  PTR_OWNER_ROLE,
  PTR_REALM_ID,
  PTR_OWNER_SINGLETON_KEY,
} from '../spacetimedb/ptr/src/contract';
import {
  PTR_OWNER_MAX_SESSION_SECONDS,
  PtrOwnerPolicyError,
  planPtrOwnerProvision,
  planPtrOwnerSuspension,
  readFreshPtrAdminClaims,
  readFreshPtrOwnerClaims,
  requirePtrOwnerAnchor,
  type PtrOwnerAnchorState,
} from '../spacetimedb/ptr/src/ownerPolicy';
import * as ownerPolicy from '../spacetimedb/ptr/src/ownerPolicy';

const OWNER_FID = 4_242n;
const OWNER_EPOCH = 1;
const SESSION_IAT = 1_000;
const SESSION_EXP = SESSION_IAT + 120;
const NOW_MICROS = 1_050_000_000n;

function ownerPayload(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    iss: 'https://auth.warpkeep.com',
    sub: `farcaster:${OWNER_FID.toString()}`,
    aud: [PTR_AUDIENCE],
    token_type: 'spacetime-access',
    roles: [PTR_OWNER_ROLE],
    auth_version: 2,
    fid: OWNER_FID.toString(),
    auth_epoch: OWNER_EPOCH,
    realm_id: PTR_REALM_ID,
    iat: SESSION_IAT,
    nbf: SESSION_IAT,
    exp: SESSION_EXP,
    session_iat: SESSION_IAT,
    session_exp: SESSION_EXP,
    ...overrides,
  };
}

function adminPayload(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    iss: 'https://auth.warpkeep.com',
    sub: 'service:hermes',
    aud: [PTR_AUDIENCE],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    ptr_owner_fid: OWNER_FID.toString(),
    ptr_owner_auth_epoch: OWNER_EPOCH,
    iat: SESSION_IAT,
    nbf: SESSION_IAT,
    exp: SESSION_IAT + 300,
    jti: 'ptr-admin-jti',
    ...overrides,
  };
}

function expectOwnerDenial(payload: unknown, nowMicros = NOW_MICROS) {
  assert.throws(
    () => readFreshPtrOwnerClaims(payload, nowMicros),
    error => {
      assert.ok(error instanceof PtrOwnerPolicyError);
      assert.equal(error.code, 'INVALID_PTR_OWNER_SESSION');
      return true;
    },
  );
}

describe('PTR owner JWT policy', () => {
  test('accepts only the exact fresh owner claim set', () => {
    assert.equal(PTR_OWNER_MAX_SESSION_SECONDS, 120);
    assert.deepEqual(readFreshPtrOwnerClaims(ownerPayload(), NOW_MICROS), {
      issuer: 'https://auth.warpkeep.com',
      subject: 'farcaster:4242',
      audience: [PTR_AUDIENCE],
      tokenType: 'spacetime-access',
      roles: [PTR_OWNER_ROLE],
      authVersion: 2,
      fid: OWNER_FID,
      authEpoch: OWNER_EPOCH,
      realmId: PTR_REALM_ID,
      sessionIssuedAt: SESSION_IAT,
      sessionExpiresAt: SESSION_EXP,
    });
  });

  test('rejects confused-deputy audience, realm, role, subject, and authority shapes', () => {
    for (const payload of [
      ownerPayload({ aud: PTR_AUDIENCE }),
      ownerPayload({ aud: [PTR_AUDIENCE, 'warpkeep-spacetimedb'] }),
      ownerPayload({ aud: ['warpkeep-spacetimedb'] }),
      ownerPayload({ realm_id: 'GENESIS_002' }),
      ownerPayload({ realm_id: undefined }),
      ownerPayload({ roles: [] }),
      ownerPayload({ roles: [PTR_OWNER_ROLE, 'warpkeep-admin'] }),
      ownerPayload({ roles: ['warpkeep-admin'] }),
      ownerPayload({ sub: 'farcaster:4243' }),
      ownerPayload({ resolver_fid: OWNER_FID.toString() }),
      ownerPayload({ request_fid: OWNER_FID.toString() }),
      ownerPayload({ device_thumbprint: 'A'.repeat(43) }),
    ]) expectOwnerDenial(payload);
  });

  test('rejects malformed identity/version/epoch values', () => {
    for (const payload of [
      ownerPayload({ auth_version: 1 }),
      ownerPayload({ fid: 0 }),
      ownerPayload({ fid: '0' }),
      ownerPayload({ fid: '01' }),
      ownerPayload({ fid: (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString() }),
      ownerPayload({ auth_epoch: 0 }),
      ownerPayload({ auth_epoch: 1.5 }),
      ownerPayload({ auth_epoch: 0x1_0000_0000 }),
    ]) expectOwnerDenial(payload);
  });

  test('enforces the absolute 120-second owner session on every call', () => {
    expectOwnerDenial(ownerPayload({ session_exp: SESSION_IAT + 121 }));
    expectOwnerDenial(ownerPayload({ session_exp: SESSION_IAT }));
    expectOwnerDenial(ownerPayload({ session_iat: SESSION_IAT + 51 }));
    expectOwnerDenial(ownerPayload({ session_iat: 1_000.5 }));
    expectOwnerDenial(ownerPayload({ session_exp: undefined }));
    expectOwnerDenial(ownerPayload(), BigInt(SESSION_EXP) * 1_000_000n);

    assert.doesNotThrow(() => readFreshPtrOwnerClaims(
      ownerPayload(),
      BigInt(SESSION_EXP) * 1_000_000n - 1n,
    ));
  });

  test('requires well-formed ordinary JWT dates without trusting them over the custom deadline', () => {
    for (const payload of [
      ownerPayload({ iat: undefined }),
      ownerPayload({ nbf: undefined }),
      ownerPayload({ exp: undefined }),
      ownerPayload({ iat: 1_000.5 }),
      ownerPayload({ nbf: 1_000.5 }),
      ownerPayload({ exp: 1_120.5 }),
      ownerPayload({ nbf: SESSION_EXP + 1 }),
      ownerPayload({ exp: SESSION_IAT }),
    ]) expectOwnerDenial(payload);

    assert.doesNotThrow(() => readFreshPtrOwnerClaims(ownerPayload({
      iat: SESSION_IAT + 10,
      nbf: SESSION_IAT,
      exp: SESSION_EXP + 10,
    }), NOW_MICROS));
  });

  test('keeps PTR administrator authority on the exact fresh Hermes principal', () => {
    assert.deepEqual(readFreshPtrAdminClaims(adminPayload(), NOW_MICROS), {
      issuer: 'https://auth.warpkeep.com',
      subject: 'service:hermes',
      audience: [PTR_AUDIENCE],
      tokenType: 'spacetime-access',
      roles: ['warpkeep-admin'],
      ownerFid: OWNER_FID,
      ownerAuthEpoch: OWNER_EPOCH,
    });
    for (const payload of [
      adminPayload({ aud: ['warpkeep-spacetimedb'] }),
      adminPayload({ aud: PTR_AUDIENCE }),
      adminPayload({ roles: ['warpkeep-admin', PTR_OWNER_ROLE] }),
      adminPayload({ sub: 'farcaster:4242' }),
      adminPayload({ exp: SESSION_IAT + 301 }),
    ]) {
      assert.throws(
        () => readFreshPtrAdminClaims(payload, NOW_MICROS),
        error => error instanceof PtrOwnerPolicyError
          && error.code === 'INVALID_PTR_ADMIN_SESSION',
      );
    }
  });

  test('rejects every malformed or duplicate PTR owner authority claim', () => {
    for (const payload of [
      adminPayload({ ptr_owner_fid: undefined }),
      adminPayload({ ptr_owner_fid: 4_242 }),
      adminPayload({ ptr_owner_fid: '' }),
      adminPayload({ ptr_owner_fid: '0' }),
      adminPayload({ ptr_owner_fid: '04242' }),
      adminPayload({ ptr_owner_fid: '+4242' }),
      adminPayload({ ptr_owner_fid: ' 4242' }),
      adminPayload({ ptr_owner_fid: '4242 ' }),
      adminPayload({ ptr_owner_fid: '4_242' }),
      adminPayload({ ptr_owner_fid: '4242.0' }),
      adminPayload({
        ptr_owner_fid: (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(),
      }),
      adminPayload({ ptr_owner_auth_epoch: undefined }),
      adminPayload({ ptr_owner_auth_epoch: '1' }),
      adminPayload({ ptr_owner_auth_epoch: 0 }),
      adminPayload({ ptr_owner_auth_epoch: 1.5 }),
      adminPayload({ ptr_owner_auth_epoch: Number.MAX_SAFE_INTEGER + 1 }),
      adminPayload({ ptr_owner_auth_epoch: 0x1_0000_0000 }),
      adminPayload({ fid: OWNER_FID.toString() }),
      adminPayload({ auth_epoch: OWNER_EPOCH }),
      adminPayload({ auth_version: 2 }),
      adminPayload({ realm_id: PTR_REALM_ID }),
      adminPayload({ session_iat: SESSION_IAT }),
      adminPayload({ session_exp: SESSION_EXP }),
    ]) {
      assert.throws(
        () => readFreshPtrAdminClaims(payload, NOW_MICROS),
        error => error instanceof PtrOwnerPolicyError
          && error.code === 'INVALID_PTR_ADMIN_SESSION',
      );
    }
  });

  test('rejects inherited, non-enumerable, symbol, and non-plain admin claims', () => {
    const inherited = Object.create(adminPayload()) as Record<string, unknown>;
    const hidden = adminPayload();
    Object.defineProperty(hidden, 'hidden_owner_authority', {
      value: OWNER_FID.toString(),
      enumerable: false,
    });
    const symbol = adminPayload() as Record<PropertyKey, unknown>;
    symbol[Symbol('owner')] = OWNER_FID.toString();
    const nullPrototype = Object.assign(Object.create(null), adminPayload());
    for (const payload of [inherited, hidden, symbol, nullPrototype]) {
      assert.throws(
        () => readFreshPtrAdminClaims(payload, NOW_MICROS),
        error => error instanceof PtrOwnerPolicyError
          && error.code === 'INVALID_PTR_ADMIN_SESSION',
      );
    }
  });

  test('keeps Hermes out of the player-only owner policy', () => {
    expectOwnerDenial(adminPayload());
  });
});

describe('PTR singleton owner policy', () => {
  const anchor: PtrOwnerAnchorState = Object.freeze({
    singletonKey: PTR_OWNER_SINGLETON_KEY,
    ownerFid: OWNER_FID,
    authEpoch: OWNER_EPOCH,
    enabled: true,
  });

  test('matches the sole enabled anchor to both FID and auth epoch', () => {
    const claims = readFreshPtrOwnerClaims(ownerPayload(), NOW_MICROS);
    assert.equal(requirePtrOwnerAnchor(claims, anchor, 1n), anchor);
  });

  test('denies an owner token carrying a changed live G001 auth epoch', () => {
    const changedEpoch = readFreshPtrOwnerClaims(
      ownerPayload({ auth_epoch: OWNER_EPOCH + 1 }),
      NOW_MICROS,
    );
    assert.throws(
      () => requirePtrOwnerAnchor(changedEpoch, anchor, 1n),
      error => error instanceof PtrOwnerPolicyError
        && error.code === 'PTR_OWNER_NOT_AUTHORIZED',
    );
  });

  test('rejects either signed provisioning mismatch before state planning', () => {
    const requirePtrOwnerProvisionBinding = (ownerPolicy as unknown as {
      requirePtrOwnerProvisionBinding?: (
        admin: ReturnType<typeof readFreshPtrAdminClaims>,
        ownerFid: bigint,
        authEpoch: number,
      ) => void;
    }).requirePtrOwnerProvisionBinding;
    assert.equal(typeof requirePtrOwnerProvisionBinding, 'function');
    const admin = readFreshPtrAdminClaims(adminPayload(), NOW_MICROS);
    assert.doesNotThrow(() => requirePtrOwnerProvisionBinding!(
      admin,
      OWNER_FID,
      OWNER_EPOCH,
    ));
    for (const [ownerFid, authEpoch] of [
      [OWNER_FID + 1n, OWNER_EPOCH],
      [OWNER_FID, OWNER_EPOCH + 1],
    ] as const) {
      assert.throws(
        () => requirePtrOwnerProvisionBinding!(admin, ownerFid, authEpoch),
        error => error instanceof PtrOwnerPolicyError
          && error.code === 'PTR_OWNER_PROVISION_INVALID',
      );
    }
  });

  test('fails the anchor check closed without revealing which credential mismatched', () => {
    const claims = readFreshPtrOwnerClaims(ownerPayload(), NOW_MICROS);
    for (const [candidate, count] of [
      [null, 0n],
      [anchor, 2n],
      [{ ...anchor, singletonKey: 'OTHER' }, 1n],
      [{ ...anchor, ownerFid: OWNER_FID + 1n }, 1n],
      [{ ...anchor, authEpoch: OWNER_EPOCH + 1 }, 1n],
      [{ ...anchor, enabled: false }, 1n],
    ] as const) {
      assert.throws(
        () => requirePtrOwnerAnchor(claims, candidate, count),
        error => error instanceof PtrOwnerPolicyError
          && error.code === 'PTR_OWNER_NOT_AUTHORIZED',
      );
    }
  });

  test('provisions exactly once and cannot replace an existing owner', () => {
    assert.deepEqual(planPtrOwnerProvision(0n, null, OWNER_FID, OWNER_EPOCH), {
      singletonKey: PTR_OWNER_SINGLETON_KEY,
      ownerFid: OWNER_FID,
      authEpoch: OWNER_EPOCH,
      enabled: true,
    });
    for (const [count, existing, fid, epoch] of [
      [1n, anchor, OWNER_FID, OWNER_EPOCH],
      [1n, anchor, OWNER_FID + 1n, OWNER_EPOCH],
      [2n, anchor, OWNER_FID, OWNER_EPOCH],
      [0n, anchor, OWNER_FID, OWNER_EPOCH],
      [1n, null, OWNER_FID, OWNER_EPOCH],
      [0n, null, 0n, OWNER_EPOCH],
      [0n, null, OWNER_FID, 0],
    ] as const) {
      assert.throws(
        () => planPtrOwnerProvision(count, existing, fid, epoch),
        error => error instanceof PtrOwnerPolicyError,
      );
    }
  });

  test('suspension is one-way and retains the immutable owner identity', () => {
    assert.deepEqual(planPtrOwnerSuspension(anchor, 1n), {
      ...anchor,
      enabled: false,
    });
    assert.throws(
      () => planPtrOwnerSuspension({ ...anchor, enabled: false }, 1n),
      error => error instanceof PtrOwnerPolicyError
        && error.code === 'PTR_OWNER_ALREADY_SUSPENDED',
    );
    assert.throws(
      () => planPtrOwnerSuspension(anchor, 2n),
      error => error instanceof PtrOwnerPolicyError
        && error.code === 'PTR_OWNER_CARDINALITY_INVALID',
    );
  });
});
