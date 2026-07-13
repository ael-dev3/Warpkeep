import { describe, expect, it } from 'vitest';

import {
  FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS,
  clearFarcasterRememberedDeviceSession,
  clearFarcasterSessionTerminationIntent,
  getFarcasterDeviceSessionControlKey,
  getFarcasterDeviceSessionStorageKey,
  getLegacyFarcasterDeviceSessionStorageKey,
  normalizeFarcasterDeviceSessionBasePath,
  persistFarcasterRememberedDeviceSession,
  purgeFarcasterBrowserBearerStorage,
  readFarcasterSessionTerminationIntent,
  restoreFarcasterRememberedDeviceSession,
  signalFarcasterSessionTermination,
  toFarcasterOidcSession,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';

const NOW = Date.UTC(2026, 6, 11, 12, 0, 0);
const BASE_PATH = '/Warpkeep/';

class MemoryStorage implements FarcasterDeviceSessionStorage {
  readonly values = new Map<string, string>();
  readonly writes: Array<readonly [string, string]> = [];
  readonly removed: string[] = [];

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

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

describe('Farcaster browser session storage privacy', () => {
  it('keeps only scoped cleanup/control key helpers and rejects unsafe base paths', () => {
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

  it('purges v1/v2 bearer records from both storage areas, including prior deploy bases', () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const retiredKeys = [
      'warpkeep:/Warpkeep/:farcaster-device-session:v1',
      'warpkeep:/Warpkeep/:farcaster-device-session:v2',
      'warpkeep:/:farcaster-device-session:v1',
      'warpkeep:/old/:farcaster-device-session:v2'
    ];
    for (const key of retiredKeys) {
      localStorage.values.set(key, `SECRET_LOCAL_${key}`);
      sessionStorage.values.set(key, `SECRET_SESSION_${key}`);
    }
    localStorage.values.set('warpkeep:/Warpkeep/:farcaster-session-control:v1', 'logout-v1:1');
    localStorage.values.set('unrelated', 'keep');

    purgeFarcasterBrowserBearerStorage({ localStorage, sessionStorage, basePath: BASE_PATH });

    for (const key of retiredKeys) {
      expect(localStorage.values.has(key)).toBe(false);
      expect(sessionStorage.values.has(key)).toBe(false);
    }
    expect(localStorage.values.get('unrelated')).toBe('keep');
    expect(localStorage.values.get('warpkeep:/Warpkeep/:farcaster-session-control:v1'))
      .toBe('logout-v1:1');
    expect(localStorage.writes).toEqual([]);
    expect(sessionStorage.writes).toEqual([]);
  });

  it('retires persistence/restoration authority and never writes a bearer token', () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const token = 'eyJhbGciOiJFUzI1NiJ9.SECRET.signature';
    localStorage.values.set(getFarcasterDeviceSessionStorageKey(BASE_PATH)!, token);
    sessionStorage.values.set(getLegacyFarcasterDeviceSessionStorageKey(BASE_PATH)!, token);
    const environment = { localStorage, sessionStorage, basePath: BASE_PATH, now: () => NOW };

    expect(persistFarcasterRememberedDeviceSession({ fid: 1 }, { jwt: token }, environment))
      .toBeUndefined();
    expect(restoreFarcasterRememberedDeviceSession(environment)).toBeUndefined();
    expect(toFarcasterOidcSession()).toBeUndefined();
    clearFarcasterRememberedDeviceSession(environment);

    expect(localStorage.writes).toEqual([]);
    expect(sessionStorage.writes).toEqual([]);
    expect(Array.from(localStorage.values.values())).not.toContain(token);
    expect(Array.from(sessionStorage.values.values())).not.toContain(token);
  });

  it('writes only a non-secret, localStorage-only cross-tab logout signal', () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    expect(signalFarcasterSessionTermination({
      localStorage,
      sessionStorage,
      basePath: BASE_PATH,
      now: () => NOW
    })).toBe(true);

    expect(localStorage.writes).toEqual([[
      getFarcasterDeviceSessionControlKey(BASE_PATH),
      `logout-v1:${NOW}`
    ]]);
    expect(sessionStorage.writes).toEqual([]);
    const serializedWrites = JSON.stringify(localStorage.writes);
    expect(serializedWrites).not.toMatch(/jwt|bearer|accessToken|eyJ/i);
    expect(readFarcasterSessionTerminationIntent({
      localStorage,
      basePath: BASE_PATH,
      now: () => NOW
    })).toBe('active');
  });

  it('expires the exact logout tombstone with the maximum server session lifetime', () => {
    const localStorage = new MemoryStorage();
    const controlKey = getFarcasterDeviceSessionControlKey(BASE_PATH)!;
    localStorage.values.set(
      controlKey,
      `logout-v1:${NOW - FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS}`
    );
    localStorage.values.set(`${controlKey}:unrelated`, 'keep');

    expect(readFarcasterSessionTerminationIntent({
      localStorage,
      basePath: BASE_PATH,
      now: () => NOW
    })).toBe('stale');
    expect(localStorage.values.has(controlKey)).toBe(false);
    expect(localStorage.values.get(`${controlKey}:unrelated`)).toBe('keep');
    expect(localStorage.removed).toEqual([controlKey]);
  });

  it('fails closed for malformed, future, and unavailable logout control state', () => {
    const localStorage = new MemoryStorage();
    const controlKey = getFarcasterDeviceSessionControlKey(BASE_PATH)!;
    for (const malformed of [
      'logout-v1:not-a-time',
      'logout-v1:01',
      `logout-v1:${Number.MAX_SAFE_INTEGER + 1}`,
      `logout-v1:${NOW + 1}`,
      'login-v1:1'
    ]) {
      localStorage.values.set(controlKey, malformed);
      expect(readFarcasterSessionTerminationIntent({
        localStorage,
        basePath: BASE_PATH,
        now: () => NOW
      })).toBe('malformed');
      expect(localStorage.values.get(controlKey)).toBe(malformed);
    }

    expect(readFarcasterSessionTerminationIntent({
      localStorage: null,
      basePath: BASE_PATH,
      now: () => NOW
    })).toBe('unavailable');
  });

  it('clears only the exact tombstone when a new sign-in is explicit', () => {
    const localStorage = new MemoryStorage();
    const controlKey = getFarcasterDeviceSessionControlKey(BASE_PATH)!;
    localStorage.values.set(controlKey, `logout-v1:${NOW}`);
    localStorage.values.set(`${controlKey}:unrelated`, 'keep');

    expect(clearFarcasterSessionTerminationIntent({
      localStorage,
      basePath: BASE_PATH
    })).toBe(true);
    expect(localStorage.values.has(controlKey)).toBe(false);
    expect(localStorage.values.get(`${controlKey}:unrelated`)).toBe('keep');
  });

  it('treats denied storage cleanup and signaling as non-fatal', () => {
    const denied: FarcasterDeviceSessionStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); }
    };
    expect(() => purgeFarcasterBrowserBearerStorage({
      localStorage: denied,
      sessionStorage: denied,
      basePath: BASE_PATH
    })).not.toThrow();
    expect(signalFarcasterSessionTermination({
      localStorage: denied,
      basePath: BASE_PATH,
      now: () => NOW
    })).toBe(false);
    expect(readFarcasterSessionTerminationIntent({
      localStorage: denied,
      basePath: BASE_PATH,
      now: () => NOW
    })).toBe('unavailable');
    expect(clearFarcasterSessionTerminationIntent({
      localStorage: denied,
      basePath: BASE_PATH
    })).toBe(false);
  });
});
