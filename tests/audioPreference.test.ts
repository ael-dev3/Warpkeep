import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WARPKEEP_AUDIO_MUTED_KEY,
  readAudioMuted,
  subscribeAudioMuted,
  writeAudioMuted
} from '../src/settings/audioPreference';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

afterEach(() => {
  window.localStorage.removeItem(WARPKEEP_AUDIO_MUTED_KEY);
  vi.restoreAllMocks();
});

describe('audio preference', () => {
  it('stores only the explicit muted state and defaults safely to sound on', () => {
    const storage = memoryStorage();
    expect(readAudioMuted(storage)).toBe(false);
    writeAudioMuted(true, storage);
    expect(readAudioMuted(storage)).toBe(true);
    writeAudioMuted(false, storage);
    expect(storage.getItem(WARPKEEP_AUDIO_MUTED_KEY)).toBeNull();
  });

  it('fails safely when preference storage is unavailable', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); }
    };
    expect(readAudioMuted(blocked)).toBe(false);
    expect(() => writeAudioMuted(true, blocked)).not.toThrow();
  });

  it('synchronizes the non-secret preference across tabs only for its own key', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAudioMuted(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).not.toHaveBeenCalled();
    window.localStorage.setItem(WARPKEEP_AUDIO_MUTED_KEY, 'true');
    window.dispatchEvent(new StorageEvent('storage', { key: WARPKEEP_AUDIO_MUTED_KEY }));
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
  });
});
