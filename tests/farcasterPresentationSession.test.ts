import { describe, expect, it } from 'vitest';

import {
  clearFarcasterPresentationSession,
  getFarcasterPresentationSessionStorageKey,
  persistFarcasterPresentationSession,
  readFarcasterPresentationSession,
  type FarcasterPresentationSession
} from '../src/farcaster/farcasterPresentationSession';
import type { FarcasterDeviceSessionStorage } from '../src/farcaster/farcasterDeviceSession';

const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const BASE_PATH = '/Warpkeep/';
const TEST_FID = 424_242_424;

class MemoryStorage implements FarcasterDeviceSessionStorage {
  readonly values = new Map<string, string>();
  readonly writes: Array<readonly [string, string]> = [];
  readonly removed: string[] = [];

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writes.push([key, value]);
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.removed.push(key);
    this.values.delete(key);
  }
}

function presentation(
  overrides: Partial<FarcasterPresentationSession> = {}
): FarcasterPresentationSession {
  return {
    fid: TEST_FID,
    username: 'warpkeeper',
    displayName: 'Warp Keeper',
    pfpUrl: 'https://profiles.example/keeper.png',
    expiresAt: NOW + 60_000,
    ...overrides
  };
}

describe('Farcaster tab-local presentation session', () => {
  it('derives one normalized base-path-scoped key and rejects unsafe paths', () => {
    expect(getFarcasterPresentationSessionStorageKey('/Warpkeep'))
      .toBe('warpkeep:/Warpkeep/:farcaster-presentation-session:v1');
    expect(getFarcasterPresentationSessionStorageKey(BASE_PATH))
      .toBe('warpkeep:/Warpkeep/:farcaster-presentation-session:v1');

    for (const unsafePath of [
      '',
      'Warpkeep/',
      '//attacker.example/',
      '/../Warpkeep/',
      '/%2e%2e/Warpkeep/',
      '/Warpkeep%2Fother/',
      '/Warpkeep?fid=1',
      '/Warpkeep#realm'
    ]) {
      expect(getFarcasterPresentationSessionStorageKey(unsafePath)).toBeUndefined();
    }
  });

  it('writes only the exact public record to sessionStorage and round-trips it', () => {
    const sessionStorage = new MemoryStorage();
    const localStorage = new MemoryStorage();
    const environment = {
      sessionStorage,
      localStorage,
      basePath: BASE_PATH,
      now: () => NOW
    };
    const input = presentation({ pfpUrl: 'https://profiles.example/keeper.png#tracking' });

    expect(persistFarcasterPresentationSession(input, environment)).toBe(true);
    expect(localStorage.writes).toEqual([]);
    expect(sessionStorage.writes).toHaveLength(1);
    const [key, serialized] = sessionStorage.writes[0];
    expect(key).toBe(getFarcasterPresentationSessionStorageKey(BASE_PATH));
    expect(JSON.parse(serialized)).toEqual({
      version: 1,
      fid: TEST_FID,
      username: 'warpkeeper',
      displayName: 'Warp Keeper',
      pfpUrl: 'https://profiles.example/keeper.png',
      expiresAt: NOW + 60_000
    });
    expect(Object.keys(JSON.parse(serialized))).toEqual([
      'version',
      'fid',
      'username',
      'displayName',
      'pfpUrl',
      'expiresAt'
    ]);
    expect(serialized).not.toMatch(/verifiedAt|jwt|accessToken|custody|verification|signature/i);

    expect(readFarcasterPresentationSession(environment)).toEqual({
      fid: TEST_FID,
      username: 'warpkeeper',
      displayName: 'Warp Keeper',
      pfpUrl: 'https://profiles.example/keeper.png',
      expiresAt: NOW + 60_000
    });
    expect(Object.isFrozen(readFarcasterPresentationSession(environment)!)).toBe(true);
  });

  it('allows any one bounded display field while requiring positive safe FID and expiry', () => {
    for (const onlyDisplayField of [
      { username: 'warpkeeper' },
      { displayName: 'Warp Keeper' },
      { pfpUrl: 'https://profiles.example/keeper.png' }
    ]) {
      const sessionStorage = new MemoryStorage();
      expect(persistFarcasterPresentationSession({
        fid: TEST_FID,
        expiresAt: NOW + THIRTY_DAYS_MS,
        ...onlyDisplayField
      }, {
        sessionStorage,
        basePath: BASE_PATH,
        now: () => NOW
      })).toBe(true);
    }

    for (const invalid of [
      { fid: TEST_FID, expiresAt: NOW + 1 },
      presentation({ fid: 0 }),
      presentation({ fid: Number.MAX_SAFE_INTEGER + 1 }),
      presentation({ expiresAt: NOW }),
      presentation({ expiresAt: NOW + THIRTY_DAYS_MS + 1 }),
      presentation({ username: 'x'.repeat(257) }),
      presentation({ displayName: ' padded ' }),
      presentation({ pfpUrl: 'http://profiles.example/keeper.png' })
    ]) {
      const sessionStorage = new MemoryStorage();
      expect(persistFarcasterPresentationSession(
        invalid as FarcasterPresentationSession,
        { sessionStorage, basePath: BASE_PATH, now: () => NOW }
      )).toBe(false);
      expect(sessionStorage.writes).toEqual([]);
    }
  });

  it('rejects unknown, private, malformed, unsafe, oversized, and expired records', () => {
    const key = getFarcasterPresentationSessionStorageKey(BASE_PATH)!;
    const invalidRecords: readonly string[] = [
      '{not-json',
      '',
      'x'.repeat(4_097),
      JSON.stringify({
        version: 1,
        fid: TEST_FID,
        username: 'warpkeeper',
        expiresAt: NOW + 60_000,
        verifiedAt: NOW
      }),
      JSON.stringify({
        version: 1,
        fid: TEST_FID,
        username: 'warpkeeper',
        expiresAt: NOW + 60_000,
        accessToken: 'must-not-survive'
      }),
      JSON.stringify({
        version: 1,
        fid: TEST_FID,
        pfpUrl: 'https://127.0.0.1/profile.png',
        expiresAt: NOW + 60_000
      }),
      JSON.stringify({ version: 1, fid: TEST_FID, expiresAt: NOW + 60_000 }),
      JSON.stringify({
        version: 1,
        fid: TEST_FID,
        username: 'warpkeeper',
        expiresAt: NOW
      }),
      JSON.stringify({
        version: 2,
        fid: TEST_FID,
        username: 'warpkeeper',
        expiresAt: NOW + 60_000
      })
    ];

    for (const serialized of invalidRecords) {
      const sessionStorage = new MemoryStorage();
      sessionStorage.values.set(key, serialized);
      sessionStorage.values.set(`${key}:unrelated`, 'keep');

      expect(readFarcasterPresentationSession({
        sessionStorage,
        basePath: BASE_PATH,
        now: () => NOW
      })).toBeUndefined();
      expect(sessionStorage.values.has(key)).toBe(false);
      expect(sessionStorage.values.get(`${key}:unrelated`)).toBe('keep');
      expect(sessionStorage.removed).toEqual([key]);
    }
  });

  it('treats storage and clock denial as non-fatal', () => {
    const denied: FarcasterDeviceSessionStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); }
    };
    const deniedEnvironment = {
      sessionStorage: denied,
      basePath: BASE_PATH,
      now: () => NOW
    };

    expect(() => persistFarcasterPresentationSession(
      presentation(),
      deniedEnvironment
    )).not.toThrow();
    expect(persistFarcasterPresentationSession(presentation(), deniedEnvironment)).toBe(false);
    expect(readFarcasterPresentationSession(deniedEnvironment)).toBeUndefined();
    expect(clearFarcasterPresentationSession(deniedEnvironment)).toBe(false);
    expect(persistFarcasterPresentationSession(presentation(), {
      sessionStorage: new MemoryStorage(),
      basePath: BASE_PATH,
      now: () => { throw new Error('clock denied'); }
    })).toBe(false);
  });

  it('clears only the exact base-path key from sessionStorage', () => {
    const sessionStorage = new MemoryStorage();
    const localStorage = new MemoryStorage();
    const key = getFarcasterPresentationSessionStorageKey(BASE_PATH)!;
    sessionStorage.values.set(key, 'presentation');
    sessionStorage.values.set(`${key}:unrelated`, 'keep');
    localStorage.values.set(key, 'keep-local');

    expect(clearFarcasterPresentationSession({
      sessionStorage,
      localStorage,
      basePath: BASE_PATH
    })).toBe(true);
    expect(sessionStorage.values.has(key)).toBe(false);
    expect(sessionStorage.values.get(`${key}:unrelated`)).toBe('keep');
    expect(localStorage.values.get(key)).toBe('keep-local');
    expect(sessionStorage.removed).toEqual([key]);
  });
});
