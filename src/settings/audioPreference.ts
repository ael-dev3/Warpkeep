import type { StorageLike } from './graphicsPreference';

export const WARPKEEP_AUDIO_MUTED_KEY = 'warpkeep.audio.muted.v1';

export function readAudioMuted(storage?: StorageLike) {
  try {
    const resolvedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return resolvedStorage?.getItem(WARPKEEP_AUDIO_MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeAudioMuted(muted: boolean, storage?: StorageLike) {
  try {
    const resolvedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!resolvedStorage) return;
    if (muted) resolvedStorage.setItem(WARPKEEP_AUDIO_MUTED_KEY, 'true');
    else resolvedStorage.removeItem(WARPKEEP_AUDIO_MUTED_KEY);
  } catch {
    // Audio preferences are optional and must never make the game unusable.
  }
}

export function subscribeAudioMuted(listener: (muted: boolean) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === WARPKEEP_AUDIO_MUTED_KEY || event.key === null) {
      listener(readAudioMuted());
    }
  };
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}
