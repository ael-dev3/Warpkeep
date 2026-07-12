import { describe, expect, it } from 'vitest';

import {
  FARCASTER_LEGACY_DEVICE_SESSION_VERSION,
  FARCASTER_REMEMBERED_DEVICE_SESSION_KIND,
  FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS,
  FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION,
  clearFarcasterRememberedDeviceSession,
  getFarcasterDeviceSessionControlKey,
  getFarcasterDeviceSessionStorageKey,
  getLegacyFarcasterDeviceSessionStorageKey,
  normalizeFarcasterDeviceSessionBasePath,
  persistFarcasterRememberedDeviceSession,
  restoreFarcasterRememberedDeviceSession,
  signalFarcasterSessionTermination,
  toFarcasterOidcSession,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';
import type {
  FarcasterOidcSession,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

const NOW = Date.UTC(2026, 6, 11, 12, 0, 0);
const ORIGIN = 'https://ael-dev3.github.io';
const BASE_PATH = '/Warpkeep/';
const ISSUER = 'https://auth.warpkeep.example';
const AUDIENCE = 'warpkeep-spacetimedb';

const identity: VerifiedFarcasterIdentity = {
  fid: 12_345,
  username: 'keeper',
  displayName: 'The Keeper',
  pfpUrl: 'https://example.com/keeper.png',
  custody: '0x1111111111111111111111111111111111111111',
  verifications: ['0x2222222222222222222222222222222222222222'],
  authMethod: 'authAddress',
  verifiedAt: NOW - 60_000
};

class MemoryStorage implements FarcasterDeviceSessionStorage {
  readonly values = new Map<string, string>();
  readonly removed: string[] = [];

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.removed.push(key);
    this.values.delete(key);
  }
}

function environment(
  storage: FarcasterDeviceSessionStorage,
  overrides: Partial<FarcasterDeviceSessionEnvironment> = {}
): FarcasterDeviceSessionEnvironment {
  return {
    storage,
    origin: ORIGIN,
    basePath: BASE_PATH,
    now: () => NOW,
    ...overrides
  };
}

function storageKey() {
  return getFarcasterDeviceSessionStorageKey(BASE_PATH)!;
}

function legacyStorageKey() {
  return getLegacyFarcasterDeviceSessionStorageKey(BASE_PATH)!;
}

function encodeSegment(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createJwt(overrides: Record<string, unknown> = {}) {
  const expiresAt = typeof overrides.exp === 'number'
    ? overrides.exp * 1_000
    : NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS;
  const payload = {
    iss: ISSUER,
    sub: `farcaster:${identity.fid}`,
    aud: [AUDIENCE],
    token_type: 'spacetime-access',
    fid: String(identity.fid),
    auth_epoch: 0,
    roles: [],
    iat: NOW / 1_000,
    nbf: NOW / 1_000,
    exp: expiresAt / 1_000,
    session_iat: NOW / 1_000,
    session_exp: expiresAt / 1_000,
    jti: 'test-session-id',
    ...overrides
  };
  return `${encodeSegment({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })}.${encodeSegment(payload)}.test_signature`;
}

function oidcSession(overrides: Partial<FarcasterOidcSession> = {}): FarcasterOidcSession {
  const jwt = overrides.jwt ?? createJwt();
  return {
    jwt,
    issuer: overrides.issuer ?? ISSUER,
    audience: overrides.audience ?? AUDIENCE,
    expiresAt: overrides.expiresAt ?? NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
  };
}

function validRecord(overrides: Record<string, unknown> = {}) {
  const oidc = oidcSession();
  return {
    version: FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION,
    kind: FARCASTER_REMEMBERED_DEVICE_SESSION_KIND,
    origin: ORIGIN,
    basePath: BASE_PATH,
    identity: {
      fid: identity.fid,
      username: identity.username,
      displayName: identity.displayName,
      pfpUrl: identity.pfpUrl
    },
    issuer: oidc.issuer,
    audience: oidc.audience,
    jwt: oidc.jwt,
    verifiedAt: identity.verifiedAt,
    rememberedAt: NOW,
    expiresAt: oidc.expiresAt,
    ...overrides
  };
}

function putRaw(storage: MemoryStorage, value: unknown, key = storageKey()) {
  storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

describe('Farcaster authoritative OIDC device-session storage', () => {
  it('uses a v2 base-path-scoped key and rejects unsafe base paths', () => {
    expect(normalizeFarcasterDeviceSessionBasePath('/Warpkeep')).toBe('/Warpkeep/');
    expect(getFarcasterDeviceSessionStorageKey(BASE_PATH))
      .toBe('warpkeep:/Warpkeep/:farcaster-device-session:v2');
    expect(getLegacyFarcasterDeviceSessionStorageKey(BASE_PATH))
      .toBe('warpkeep:/Warpkeep/:farcaster-device-session:v1');
    expect(getFarcasterDeviceSessionControlKey(BASE_PATH))
      .toBe('warpkeep:/Warpkeep/:farcaster-session-control:v1');

    for (const unsafePath of [
      '',
      'Warpkeep/',
      '//attacker.example/',
      '/../Warpkeep/',
      '/%2e%2e/Warpkeep/',
      '/Warpkeep%2Fother/',
      '/Warpkeep?fid=1',
      '/Warpkeep#realm',
      '/Warpkeep//'
    ]) {
      expect(normalizeFarcasterDeviceSessionBasePath(unsafePath)).toBeUndefined();
      expect(getFarcasterDeviceSessionStorageKey(unsafePath)).toBeUndefined();
      expect(getFarcasterDeviceSessionControlKey(unsafePath)).toBeUndefined();
    }
  });

  it('persists and restores only a strict v2 bridge-OIDC allowlist', () => {
    const storage = new MemoryStorage();
    const oidc = oidcSession();
    const record = persistFarcasterRememberedDeviceSession(
      identity,
      oidc,
      environment(storage)
    );

    expect(record).toEqual({
      ...validRecord(),
      rememberedAt: NOW
    });
    expect(Object.keys(record!)).toEqual([
      'version',
      'kind',
      'origin',
      'basePath',
      'identity',
      'issuer',
      'audience',
      'jwt',
      'verifiedAt',
      'rememberedAt',
      'expiresAt'
    ]);
    expect(Object.keys(record!.identity)).toEqual(['fid', 'username', 'displayName', 'pfpUrl']);

    const serialized = storage.values.get(storageKey())!;
    expect(serialized).toContain('"jwt"');
    for (const forbidden of [
      'custody',
      'verifications',
      'authMethod',
      'channelToken',
      'message',
      'nonce',
      'requestId',
      'admin'
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(restoreFarcasterRememberedDeviceSession(environment(storage))).toEqual(record);
    expect(toFarcasterOidcSession(record!)).toEqual(oidc);
  });

  it('cannot persist the retired identity-only call shape', () => {
    const storage = new MemoryStorage();
    expect(persistFarcasterRememberedDeviceSession(identity, environment(storage))).toBeUndefined();
    expect(storage.values.size).toBe(0);
  });

  it('purges legacy v1 prototype data instead of restoring it as shared-realm authority', () => {
    const storage = new MemoryStorage();
    putRaw(storage, {
      version: FARCASTER_LEGACY_DEVICE_SESSION_VERSION,
      kind: 'remembered-device-prototype',
      origin: ORIGIN,
      basePath: BASE_PATH,
      identity: { fid: identity.fid },
      verifiedAt: identity.verifiedAt,
      rememberedAt: NOW - 1,
      expiresAt: NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
    }, legacyStorageKey());

    expect(restoreFarcasterRememberedDeviceSession(environment(storage))).toBeUndefined();
    expect(storage.values.has(legacyStorageKey())).toBe(false);
    expect(storage.removed).toContain(legacyStorageKey());
  });

  it('does not let a legacy GitHub Pages remembered session authorize the canonical origin', () => {
    const storage = new MemoryStorage();
    const legacyPagesEnvironment = environment(storage, {
      origin: 'https://ael-dev3.github.io',
      basePath: '/Warpkeep/'
    });
    expect(persistFarcasterRememberedDeviceSession(
      identity,
      oidcSession(),
      legacyPagesEnvironment
    )).toBeDefined();

    expect(restoreFarcasterRememberedDeviceSession({
      storage,
      origin: 'https://warpkeep.com',
      basePath: '/',
      now: () => NOW
    })).toBeUndefined();
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['unknown record key', { ...validRecord(), channelToken: 'never-store-this' }],
    ['unknown identity key', { ...validRecord(), identity: { ...validRecord().identity, custody: '0xabc' } }],
    ['wrong origin', { ...validRecord(), origin: 'https://attacker.example' }],
    ['wrong base path', { ...validRecord(), basePath: '/Other/' }],
    ['insecure profile URL', {
      ...validRecord(),
      identity: { ...validRecord().identity, pfpUrl: 'http://example.com/keeper.png' }
    }],
    ['nonpositive FID', { ...validRecord(), identity: { ...validRecord().identity, fid: 0 } }],
    ['JWT issuer mismatch', { ...validRecord(), issuer: 'https://other.example' }],
    ['JWT audience mismatch', { ...validRecord(), audience: 'other-audience' }],
    ['JWT subject FID mismatch', { ...validRecord(), jwt: createJwt({ sub: 'farcaster:7' }) }],
    ['JWT FID claim mismatch', { ...validRecord(), jwt: createJwt({ fid: '7', sub: 'farcaster:7' }) }],
    ['JWT expiry differs from record', {
      ...validRecord(),
      expiresAt: NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS - 1
    }],
    ['player token has a role', { ...validRecord(), jwt: createJwt({ roles: ['warpkeep-admin'] }) }],
    ['unsigned algorithm', { ...validRecord(), jwt: `${encodeSegment({ alg: 'none' })}.${encodeSegment({})}.x` }],
    ['expired token', {
      ...validRecord(),
      jwt: createJwt({ exp: (NOW - 1_000) / 1_000 }),
      expiresAt: NOW - 1_000
    }],
    ['future remembered time', { ...validRecord(), rememberedAt: NOW + 1 }],
    ['verification after remembered time', {
      ...validRecord(),
      verifiedAt: NOW,
      rememberedAt: NOW - 1
    }]
  ])('fails closed and deletes %s', (_caseName, rawRecord) => {
    const storage = new MemoryStorage();
    putRaw(storage, rawRecord);

    expect(restoreFarcasterRememberedDeviceSession(environment(storage))).toBeUndefined();
    expect(storage.removed).toContain(storageKey());
    expect(storage.values.has(storageKey())).toBe(false);
  });

  it('does not persist an expired, wrong-identity, or overlong OIDC session', () => {
    const invalidSessions = [
      oidcSession({ expiresAt: NOW }),
      oidcSession({ jwt: createJwt({ sub: 'farcaster:7', fid: '7' }) }),
      oidcSession({ expiresAt: NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS + 1 })
    ];

    for (const candidate of invalidSessions) {
      const storage = new MemoryStorage();
      expect(persistFarcasterRememberedDeviceSession(
        identity,
        candidate,
        environment(storage)
      )).toBeUndefined();
      expect(storage.values.size).toBe(0);
    }
  });

  it('emits only a non-sensitive base-path-scoped logout signal', () => {
    const storage = new MemoryStorage();
    expect(signalFarcasterSessionTermination(environment(storage))).toBe(true);
    expect(storage.values.get(getFarcasterDeviceSessionControlKey(BASE_PATH)!))
      .toBe(`logout-v1:${NOW}`);
    expect(JSON.stringify(storage.values)).not.toContain(createJwt());
  });

  it('treats denied storage as a non-fatal absence and clears both v1 and v2 keys', () => {
    const deniedStorage: FarcasterDeviceSessionStorage = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {
        throw new Error('denied');
      }
    };
    const deniedEnvironment = environment(deniedStorage);

    expect(() => persistFarcasterRememberedDeviceSession(
      identity,
      oidcSession(),
      deniedEnvironment
    )).not.toThrow();
    expect(() => restoreFarcasterRememberedDeviceSession(deniedEnvironment)).not.toThrow();
    expect(() => clearFarcasterRememberedDeviceSession(deniedEnvironment)).not.toThrow();
  });
});
