import { describe, expect, it } from 'vitest';

import {
  FARCASTER_REMEMBERED_DEVICE_SESSION_KIND,
  FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS,
  FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION,
  clearFarcasterRememberedDeviceSession,
  getFarcasterDeviceSessionStorageKey,
  normalizeFarcasterDeviceSessionBasePath,
  persistFarcasterRememberedDeviceSession,
  restoreFarcasterRememberedDeviceSession,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';
import type { VerifiedFarcasterIdentity } from '../src/farcaster/farcasterAuthTypes';

const NOW = Date.UTC(2026, 6, 11, 12, 0, 0);
const ORIGIN = 'https://ael-dev3.github.io';
const BASE_PATH = '/Warpkeep/';

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

function validRecord() {
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
    verifiedAt: identity.verifiedAt,
    rememberedAt: NOW - 1,
    expiresAt: NOW - 1 + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
  };
}

function putRaw(storage: MemoryStorage, value: unknown) {
  storage.setItem(storageKey(), typeof value === 'string' ? value : JSON.stringify(value));
}

describe('Farcaster remembered-device session storage', () => {
  it('uses a stable base-path-scoped key and rejects unsafe base paths', () => {
    expect(normalizeFarcasterDeviceSessionBasePath('/Warpkeep')).toBe('/Warpkeep/');
    expect(getFarcasterDeviceSessionStorageKey(BASE_PATH))
      .toBe('warpkeep:/Warpkeep/:farcaster-device-session:v1');
    expect(getFarcasterDeviceSessionStorageKey('/')).toBe('warpkeep:/:farcaster-device-session:v1');

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
    }
  });

  it('persists and restores exactly the public allowlist for thirty days', () => {
    const storage = new MemoryStorage();
    const record = persistFarcasterRememberedDeviceSession(identity, environment(storage));

    expect(record).toEqual({
      version: 1,
      kind: 'remembered-device-prototype',
      origin: ORIGIN,
      basePath: BASE_PATH,
      identity: {
        fid: identity.fid,
        username: identity.username,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl
      },
      verifiedAt: identity.verifiedAt,
      rememberedAt: NOW,
      expiresAt: NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
    });
    expect(Object.keys(record!)).toEqual([
      'version',
      'kind',
      'origin',
      'basePath',
      'identity',
      'verifiedAt',
      'rememberedAt',
      'expiresAt'
    ]);
    expect(Object.keys(record!.identity)).toEqual(['fid', 'username', 'displayName', 'pfpUrl']);

    const serialized = storage.values.get(storageKey())!;
    expect(serialized).not.toContain('custody');
    expect(serialized).not.toContain('verifications');
    expect(serialized).not.toContain('authMethod');
    expect(serialized).not.toContain('channelToken');
    expect(serialized).not.toContain('signature');
    expect(restoreFarcasterRememberedDeviceSession(environment(storage))).toEqual(record);
  });

  it('keeps only a minimal identity when optional public profile fields are absent', () => {
    const storage = new MemoryStorage();
    const minimalIdentity: VerifiedFarcasterIdentity = {
      fid: 77,
      verifications: [],
      verifiedAt: NOW - 1
    };

    const record = persistFarcasterRememberedDeviceSession(
      minimalIdentity,
      environment(storage)
    );

    expect(record?.identity).toEqual({ fid: 77 });
    expect(Object.keys(record?.identity ?? {})).toEqual(['fid']);
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['unknown record key', { ...validRecord(), channelToken: 'never-store-this' }],
    ['unknown identity key', { ...validRecord(), identity: { ...validRecord().identity, custody: '0xabc' } }],
    ['wrong origin', { ...validRecord(), origin: 'https://attacker.example' }],
    ['wrong base path', { ...validRecord(), basePath: '/Other/' }],
    ['nonpositive FID', { ...validRecord(), identity: { ...validRecord().identity, fid: 0 } }],
    ['unsafe FID', {
      ...validRecord(),
      identity: { ...validRecord().identity, fid: Number.MAX_SAFE_INTEGER + 1 }
    }],
    ['blank profile text', {
      ...validRecord(),
      identity: { ...validRecord().identity, username: '  ' }
    }],
    ['oversize profile text', {
      ...validRecord(),
      identity: { ...validRecord().identity, displayName: 'a'.repeat(257) }
    }],
    ['non-http(s) profile URL', {
      ...validRecord(),
      identity: { ...validRecord().identity, pfpUrl: 'javascript:alert(1)' }
    }],
    ['credentialed profile URL', {
      ...validRecord(),
      identity: { ...validRecord().identity, pfpUrl: 'https://user:pass@example.com/pfp.png' }
    }],
    ['oversize profile URL', {
      ...validRecord(),
      identity: { ...validRecord().identity, pfpUrl: `https://example.com/${'a'.repeat(2_048)}` }
    }],
    ['noncanonical record base path', { ...validRecord(), basePath: '/Warpkeep' }],
    ['verification after remembered time', {
      ...validRecord(),
      verifiedAt: NOW,
      rememberedAt: NOW - 1
    }],
    ['wrong thirty-day TTL', {
      ...validRecord(),
      expiresAt: NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
    }],
    ['expired record', {
      ...validRecord(),
      rememberedAt: NOW - FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS,
      expiresAt: NOW
    }],
    ['future remembered time', {
      ...validRecord(),
      rememberedAt: NOW + 1,
      expiresAt: NOW + 1 + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
    }]
  ])('fails closed and deletes %s', (_caseName, rawRecord) => {
    const storage = new MemoryStorage();
    putRaw(storage, rawRecord);

    expect(restoreFarcasterRememberedDeviceSession(environment(storage))).toBeUndefined();
    expect(storage.removed).toEqual([storageKey()]);
    expect(storage.values.has(storageKey())).toBe(false);
  });

  it('binds records to both exact origin and exact normalized base path', () => {
    const storage = new MemoryStorage();
    const record = validRecord();
    putRaw(storage, record);

    expect(restoreFarcasterRememberedDeviceSession(environment(storage, {
      origin: 'https://other.example'
    }))).toBeUndefined();
    expect(storage.removed).toEqual([storageKey()]);

    putRaw(storage, record);
    expect(restoreFarcasterRememberedDeviceSession(environment(storage, {
      basePath: '/Warpkeep'
    }))).toEqual(record);
  });

  it('does not persist malformed identity fields or a future verification timestamp', () => {
    const invalidIdentities = [
      { ...identity, fid: 0 },
      { ...identity, username: '  keeper' },
      { ...identity, displayName: 'x'.repeat(257) },
      { ...identity, pfpUrl: 'file:///private/profile.png' },
      { ...identity, verifiedAt: NOW + 1 }
    ];

    for (const invalidIdentity of invalidIdentities) {
      const storage = new MemoryStorage();
      expect(persistFarcasterRememberedDeviceSession(
        invalidIdentity,
        environment(storage)
      )).toBeUndefined();
      expect(storage.values.size).toBe(0);
    }
  });

  it('treats denied storage as a non-fatal absence and safely forgets records', () => {
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

    expect(() => persistFarcasterRememberedDeviceSession(identity, deniedEnvironment)).not.toThrow();
    expect(persistFarcasterRememberedDeviceSession(identity, deniedEnvironment)).toBeUndefined();
    expect(() => restoreFarcasterRememberedDeviceSession(deniedEnvironment)).not.toThrow();
    expect(restoreFarcasterRememberedDeviceSession(deniedEnvironment)).toBeUndefined();
    expect(() => clearFarcasterRememberedDeviceSession(deniedEnvironment)).not.toThrow();
  });

  it('forgets the base-path-scoped record without touching remote auth state', () => {
    const storage = new MemoryStorage();
    persistFarcasterRememberedDeviceSession(identity, environment(storage));

    clearFarcasterRememberedDeviceSession(environment(storage));

    expect(storage.values.has(storageKey())).toBe(false);
    expect(storage.removed).toEqual([storageKey()]);
  });
});
