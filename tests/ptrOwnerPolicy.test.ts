// @vitest-environment node

import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { build, type Plugin } from 'esbuild';
import { beforeAll, describe, test } from 'vitest';

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
  readFreshPtrAtlasAdminClaims,
  readFreshPtrAdminClaims,
  readFreshPtrOwnerClaims,
  requirePtrOwnerAnchor,
  type PtrOwnerAnchorState,
} from '../spacetimedb/ptr/src/ownerPolicy';
import * as ownerPolicy from '../spacetimedb/ptr/src/ownerPolicy';
import { ptrAdminClaims, ptrAtlasAdminClaims, ptrOwnerClaims } from '../services/auth-bridge/src/jwt';
import { spacetimeIdentityFromClaims } from '../services/auth-bridge/src/spacetimeIdentity';
import type { BridgeConfig } from '../services/auth-bridge/src/config';

let requirePtrOwner: (ctx: unknown) => unknown;
let requirePtrAdmin: (ctx: unknown) => unknown;
let requirePtrAtlasAdmin: (ctx: unknown) => unknown;
let requirePtrConnection: (ctx: unknown) => void;

beforeAll(async () => {
  const runtimeStub: Plugin = {
    name: 'ptr-owner-policy-test-runtime',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^spacetimedb\/server$/ }, () => ({
        path: 'spacetimedb/server',
        namespace: 'ptr-owner-policy-test-runtime',
      }));
      pluginBuild.onLoad(
        { filter: /.*/, namespace: 'ptr-owner-policy-test-runtime' },
        () => ({
          loader: 'js',
          contents: `
            export class SenderError extends Error {
              constructor(message) { super(message); this.name = 'SenderError'; }
            }
          `,
        }),
      );
    },
  };
  const result = await build({
    stdin: {
      contents: `export { requirePtrOwner, requirePtrAdmin, requirePtrAtlasAdmin, requirePtrConnection } from './spacetimedb/ptr/src/auth.ts';`,
      loader: 'ts',
      resolveDir: resolve(import.meta.dirname, '..'),
      sourcefile: 'ptr-owner-policy-test-entry.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    plugins: [runtimeStub],
  });
  const encoded = Buffer.from(result.outputFiles[0]!.text).toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}`) as {
    requirePtrOwner: (ctx: unknown) => unknown;
    requirePtrAdmin: (ctx: unknown) => unknown;
    requirePtrAtlasAdmin: (ctx: unknown) => unknown;
    requirePtrConnection: (ctx: unknown) => void;
  };
  requirePtrOwner = module.requirePtrOwner;
  requirePtrAdmin = module.requirePtrAdmin;
  requirePtrAtlasAdmin = module.requirePtrAtlasAdmin;
  requirePtrConnection = module.requirePtrConnection;
});

const OWNER_FID = 4_242n;
const OWNER_EPOCH = 1;
const PTR_DATABASE_IDENTITY = '1'.repeat(64);
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
    ptr_database_identity: PTR_DATABASE_IDENTITY,
    realm_id: PTR_REALM_ID,
    iat: SESSION_IAT,
    nbf: SESSION_IAT,
    exp: SESSION_EXP,
    session_iat: SESSION_IAT,
    session_exp: SESSION_EXP,
    jti: 'ptr-owner-jti',
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

function atlasAdminPayload(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    iss: 'https://auth.warpkeep.com',
    sub: 'service:hermes',
    aud: [PTR_AUDIENCE],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    iat: SESSION_IAT,
    nbf: SESSION_IAT,
    exp: SESSION_IAT + 300,
    jti: 'ptr-atlas-admin-jti',
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

describe('PTR original and SDK-exchanged claim interoperability', () => {
  const config = {
    issuer: 'https://auth.warpkeep.com', ptrEnabled: true,
    playerCanaryOwnerFid: OWNER_FID.toString(),
    ptrSpacetimeDb: { audience: PTR_AUDIENCE, database: PTR_DATABASE_IDENTITY },
  } as BridgeConfig;
  const profiles = [
    { name: 'atlas administrator', original: () => ptrAtlasAdminClaims(config, SESSION_IAT),
      parser: readFreshPtrAtlasAdminClaims, authorize: (ctx: unknown) => requirePtrAtlasAdmin(ctx), error: 'INVALID_PTR_ATLAS_ADMIN_SESSION' },
    { name: 'provisioning administrator', original: () => ptrAdminClaims(config, SESSION_IAT, OWNER_FID.toString(), OWNER_EPOCH),
      parser: readFreshPtrAdminClaims, authorize: (ctx: unknown) => requirePtrAdmin(ctx), error: 'INVALID_PTR_ADMIN_SESSION' },
    { name: 'owner', original: () => ptrOwnerClaims(config, SESSION_IAT, OWNER_FID.toString(), OWNER_EPOCH),
      parser: readFreshPtrOwnerClaims, authorize: (ctx: unknown) => requirePtrOwner(ctx), error: 'INVALID_PTR_OWNER_SESSION' },
  ];
  const context = (payload: unknown, sender: string, nowMicros = NOW_MICROS) => ({
    senderAuth: { jwt: { fullPayload: payload } },
    sender: { toHexString: () => sender },
    timestamp: { microsSinceUnixEpoch: nowMicros },
    databaseIdentity: { toHexString: () => PTR_DATABASE_IDENTITY },
    db: { ptrOwnerAnchorV1: { singletonKey: { find: () => ({
      singletonKey: PTR_OWNER_SINGLETON_KEY, ownerFid: OWNER_FID, authEpoch: OWNER_EPOCH, enabled: true,
    }) }, count: () => 1n } },
  });
  for (const profile of profiles) {
    test(`${profile.name} accepts the real producer and only its documented optional host identity`, () => {
      const original = profile.original();
      const identity = spacetimeIdentityFromClaims(original.iss, original.sub);
      const exchanged = { ...original, iat: 1_050, exp: 1_110, hex_identity: identity };
      assert.equal(Object.hasOwn(profile.parser(original, NOW_MICROS), 'hexIdentity'), false);
      assert.equal(profile.parser(exchanged, NOW_MICROS).hexIdentity, identity);
      assert.doesNotThrow(() => profile.authorize(context(original, identity)));
      assert.doesNotThrow(() => profile.authorize(context(exchanged, identity)));
      assert.doesNotThrow(() => requirePtrConnection(context(exchanged, identity)));
    });
    test(`${profile.name} binds a present identity to actual sender`, () => {
      const original = profile.original();
      const identity = spacetimeIdentityFromClaims(original.iss, original.sub);
      assert.throws(() => profile.authorize(context({ ...original, hex_identity: identity }, '2'.repeat(64))), { message: profile.error });
      assert.throws(() => profile.authorize(context({ ...original, hex_identity: '2'.repeat(64) }, identity)), { message: profile.error });
    });
    test(`${profile.name} rejects malformed, hidden or accessor host identities without invoking getters`, () => {
      const original = profile.original();
      const identity = spacetimeIdentityFromClaims(original.iss, original.sub);
      for (const value of [undefined, null, 42, identity.toUpperCase(), identity.slice(1), identity + '0', `0x${identity}`]) {
        assert.throws(() => profile.parser({ ...original, hex_identity: value }, NOW_MICROS), { message: profile.error });
      }
      let getterCalls = 0;
      const accessor = Object.defineProperty({ ...original }, 'hex_identity', { enumerable: true, get: () => { getterCalls++; return identity; } });
      const hidden = Object.defineProperty({ ...original }, 'hex_identity', { enumerable: false, value: identity });
      for (const value of [accessor, hidden]) assert.throws(() => profile.parser(value, NOW_MICROS), { message: profile.error });
      assert.equal(getterCalls, 0);
    });
    test(`${profile.name} retains exact base claims and rejects unrelated extras beside host identity`, () => {
      const original = profile.original();
      const exchanged = { ...original, hex_identity: spacetimeIdentityFromClaims(original.iss, original.sub) };
      const missing = { ...exchanged } as Record<string, unknown>; delete missing.jti;
      for (const value of [missing, { ...exchanged, unknown_authority: true }, { ...exchanged, aud: ['warpkeep-spacetimedb'] }, { ...exchanged, iss: 'https://other.example' }, { ...exchanged, roles: [] }]) {
        assert.throws(() => profile.parser(value, NOW_MICROS), { message: profile.error });
      }
    });
  }
  test('a fresh SDK token never extends the original owner session or changes owner isolation', () => {
    const original = ptrOwnerClaims(config, SESSION_IAT, OWNER_FID.toString(), OWNER_EPOCH);
    const identity = spacetimeIdentityFromClaims(original.iss, original.sub);
    const exchanged = { ...original, iat: SESSION_EXP, exp: SESSION_EXP + 60, hex_identity: identity };
    assert.throws(() => requirePtrOwner(context(exchanged, identity, BigInt(SESSION_EXP) * 1_000_000n)), { message: 'INVALID_PTR_OWNER_SESSION' });
    for (const changed of [
      { ...exchanged, session_exp: SESSION_IAT + 121 },
      { ...original, hex_identity: identity, ptr_database_identity: '2'.repeat(64) },
      { ...original, hex_identity: identity, auth_epoch: OWNER_EPOCH + 1 },
      { ...original, hex_identity: identity, fid: '12345' },
    ]) assert.throws(() => requirePtrOwner(context(changed, identity)));
  });
});

describe('PTR owner JWT policy', () => {
  test('mutually excludes ownerless atlas and owner-bearing provision claims', () => {
    assert.deepEqual(readFreshPtrAtlasAdminClaims(
      atlasAdminPayload(),
      NOW_MICROS,
    ), {
      issuer: 'https://auth.warpkeep.com',
      subject: 'service:hermes',
      audience: [PTR_AUDIENCE],
      tokenType: 'spacetime-access',
      roles: ['warpkeep-admin'],
    });
    assert.throws(
      () => readFreshPtrAtlasAdminClaims(adminPayload(), NOW_MICROS),
      /INVALID_PTR_ATLAS_ADMIN_SESSION/u,
    );
    assert.throws(
      () => readFreshPtrAdminClaims(atlasAdminPayload(), NOW_MICROS),
      /INVALID_PTR_ADMIN_SESSION/u,
    );
    for (const payload of [
      atlasAdminPayload({ aud: ['warpkeep-spacetimedb'] }),
      atlasAdminPayload({ aud: PTR_AUDIENCE }),
      atlasAdminPayload({ roles: [] }),
      atlasAdminPayload({ roles: ['warpkeep-admin', 'warpkeep-ptr-owner'] }),
      atlasAdminPayload({ sub: 'farcaster:4242' }),
      atlasAdminPayload({ exp: SESSION_IAT + 301 }),
      atlasAdminPayload({ exp: SESSION_IAT }),
      atlasAdminPayload({ unknown_authority: true }),
    ]) assert.throws(
      () => readFreshPtrAtlasAdminClaims(payload, NOW_MICROS),
      /INVALID_PTR_ATLAS_ADMIN_SESSION/u,
    );
  });

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
      databaseIdentity: PTR_DATABASE_IDENTITY,
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
      ownerPayload({ unknown_authority: true }),
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
      ownerPayload({ ptr_database_identity: undefined }),
      ownerPayload({ ptr_database_identity: 'A'.repeat(64) }),
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

  test('requires the complete exact signed owner claim set', () => {
    const { jti: _missingJti, ...missingJti } = ownerPayload();
    const { ptr_database_identity: _missingDatabaseIdentity, ...missingDatabaseIdentity } = ownerPayload();
    expectOwnerDenial(missingJti);
    expectOwnerDenial(missingDatabaseIdentity);
    expectOwnerDenial(ownerPayload({ arbitrary_extra_owner_claim: true }));
  });

  test('rejects missing, malformed, or unbounded owner JTIs', () => {
    for (const jti of [
      null,
      7,
      '',
      'not a base64url id',
      'a'.repeat(129),
    ]) expectOwnerDenial(ownerPayload({ jti }));
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

  test('binds a valid owner token to the immutable PTR database before anchor reads', () => {
    let findCalls = 0;
    let countCalls = 0;
    const context = (databaseIdentity: string, payload = ownerPayload()) => ({
      senderAuth: { jwt: { fullPayload: payload } },
      timestamp: { microsSinceUnixEpoch: NOW_MICROS },
      databaseIdentity: { toHexString: () => databaseIdentity },
      db: {
        ptrOwnerAnchorV1: {
          singletonKey: {
            find: () => {
              findCalls += 1;
              return anchor;
            },
          },
          count: () => {
            countCalls += 1;
            return 1n;
          },
        },
      },
    });
    assert.throws(
      () => requirePtrOwner(context('2'.repeat(64))),
      error => error instanceof Error
        && error.message === 'PTR_OWNER_NOT_AUTHORIZED',
    );
    assert.equal(findCalls, 0);
    assert.equal(countCalls, 0);

    assert.deepEqual(requirePtrOwner(context(PTR_DATABASE_IDENTITY)), {
      claims: readFreshPtrOwnerClaims(ownerPayload(), NOW_MICROS),
      anchor,
    });
    assert.equal(findCalls, 1);
    assert.equal(countCalls, 1);
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
