import type { RealmQuality } from './realmQuality';

export const REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY =
  'warpkeep.realm.renderer.emergency-quality.v1';

const QUALITY_RANK: Readonly<Record<RealmQuality, number>> = Object.freeze({
  high: 2,
  balanced: 1,
  reduced: 0
});

function isRealmQuality(value: unknown): value is RealmQuality {
  return value === 'high' || value === 'balanced' || value === 'reduced';
}

function browserSessionStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function nextLowerRealmRendererQuality(
  quality: RealmQuality
): RealmQuality | undefined {
  if (quality === 'high') return 'balanced';
  if (quality === 'balanced') return 'reduced';
  return undefined;
}

export function resolveRealmRendererEmergencyQuality(
  requested: RealmQuality,
  emergencyCeiling: RealmQuality | undefined
): RealmQuality {
  if (!emergencyCeiling) return requested;
  return QUALITY_RANK[requested] <= QUALITY_RANK[emergencyCeiling]
    ? requested
    : emergencyCeiling;
}

export function readRealmRendererEmergencyQuality(
  storage: Storage | undefined = browserSessionStorage()
): RealmQuality | undefined {
  if (!storage) return undefined;
  try {
    const stored = storage.getItem(REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY);
    return isRealmQuality(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Retains only the safest renderer ceiling reached in this browser tab. This
 * session-scoped guard never reads or writes the player's saved graphics
 * preference and contains no identity or device fingerprint.
 */
export function retainRealmRendererEmergencyQuality(
  proposed: RealmQuality,
  storage: Storage | undefined = browserSessionStorage()
): RealmQuality {
  const current = readRealmRendererEmergencyQuality(storage);
  const retained = current && QUALITY_RANK[current] <= QUALITY_RANK[proposed]
    ? current
    : proposed;
  try {
    storage?.setItem(REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY, retained);
  } catch {
    // The in-memory React state still protects the active Realm when storage
    // is unavailable (for example, a privacy-restricted WebView).
  }
  return retained;
}
