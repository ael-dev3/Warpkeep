import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_GRAPHICS_PREFERENCE,
  WARPKEEP_GRAPHICS_PREFERENCE_KEY,
  parseGraphicsPreference,
  readGraphicsPreference,
  realmProfileForQuality,
  resolveGraphicsQuality,
  subscribeGraphicsPreference,
  titleModelProfileForQuality,
  writeGraphicsPreference
} from '../src/settings/graphicsPreference';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('graphics preference', () => {
  it('validates and persists only the versioned visual preference', () => {
    const storage = memoryStorage();
    expect(parseGraphicsPreference('obsolete')).toBe(DEFAULT_GRAPHICS_PREFERENCE);
    expect(parseGraphicsPreference('auto')).toBe(DEFAULT_GRAPHICS_PREFERENCE);
    expect(readGraphicsPreference(storage)).toBe(DEFAULT_GRAPHICS_PREFERENCE);
    writeGraphicsPreference('balanced', storage);
    expect(storage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY)).toBe('balanced');
    expect(readGraphicsPreference(storage)).toBe('balanced');
    writeGraphicsPreference(DEFAULT_GRAPHICS_PREFERENCE, storage);
    expect(storage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY)).toBeNull();
  });

  it('fails safely when storage access is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); }
    };
    expect(readGraphicsPreference(blocked)).toBe(DEFAULT_GRAPHICS_PREFERENCE);
    expect(() => writeGraphicsPreference('cinematic', blocked)).not.toThrow();
  });

  it('keeps strong desktops cinematic and normal phones within measured limits', () => {
    expect(resolveGraphicsQuality(DEFAULT_GRAPHICS_PREFERENCE, {
      width: 1_440,
      height: 900,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      maxTextureSize: 16_384
    })).toBe('cinematic');
    [
      [320, 568],
      [360, 800],
      [390, 844],
      [412, 915],
      [430, 932]
    ].forEach(([width, height]) => {
      expect(resolveGraphicsQuality(DEFAULT_GRAPHICS_PREFERENCE, {
        width,
        height,
        devicePixelRatio: 3,
        hardwareConcurrency: 8,
        deviceMemory: 4,
        maxTextureSize: 8_192
      })).toBe('balanced');
    });
    expect(resolveGraphicsQuality(DEFAULT_GRAPHICS_PREFERENCE, {
      width: 390,
      height: 844,
      devicePixelRatio: 3,
      hardwareConcurrency: 2,
      deviceMemory: 2,
      maxTextureSize: 2_048
    })).toBe('performance');
  });

  it('gives manual choices priority and maps both renderers consistently', () => {
    const constrained = {
      width: 320,
      height: 568,
      devicePixelRatio: 3,
      hardwareConcurrency: 2,
      deviceMemory: 2,
      maxTextureSize: 2_048
    };
    expect(resolveGraphicsQuality('cinematic', constrained)).toBe('cinematic');
    expect(resolveGraphicsQuality('balanced', constrained)).toBe('balanced');
    expect(resolveGraphicsQuality('performance', constrained)).toBe('performance');
    expect(titleModelProfileForQuality('cinematic')).toBe('high');
    expect(titleModelProfileForQuality('balanced')).toBe('compact');
    expect(realmProfileForQuality('cinematic')).toBe('high');
    expect(realmProfileForQuality('balanced')).toBe('balanced');
    expect(realmProfileForQuality('performance')).toBe('reduced');
  });

  it('accepts cross-tab preference changes and ignores unrelated storage', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGraphicsPreference(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).not.toHaveBeenCalled();
    window.localStorage.setItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY, 'performance');
    window.dispatchEvent(new StorageEvent('storage', {
      key: WARPKEEP_GRAPHICS_PREFERENCE_KEY,
      newValue: 'performance'
    }));
    expect(listener).toHaveBeenCalledWith('performance');
    unsubscribe();
    window.localStorage.removeItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY);
  });
});
