export const WARPKEEP_GRAPHICS_PREFERENCE_KEY = 'warpkeep.graphics.preference.v1';

export const GRAPHICS_PREFERENCES = [
  'cinematic',
  'balanced',
  'performance'
] as const;

export type GraphicsPreference = (typeof GRAPHICS_PREFERENCES)[number];
export type GraphicsQualityTier = GraphicsPreference;

/** The deliberate visual default; lower tiers remain explicit player opt-downs. */
export const DEFAULT_GRAPHICS_PREFERENCE: GraphicsPreference = 'cinematic';

export type GraphicsCapabilityInput = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTextureSize?: number;
}>;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isGraphicsPreference(value: unknown): value is GraphicsPreference {
  return typeof value === 'string'
    && GRAPHICS_PREFERENCES.includes(value as GraphicsPreference);
}

export function parseGraphicsPreference(value: unknown): GraphicsPreference {
  // `auto` was the stored v1 default. Treat it as the new deliberate default
  // instead of retaining capability-driven quality changes for existing players.
  if (value === 'auto') return DEFAULT_GRAPHICS_PREFERENCE;
  return isGraphicsPreference(value) ? value : DEFAULT_GRAPHICS_PREFERENCE;
}

export function readGraphicsPreference(
  storage?: StorageLike
): GraphicsPreference {
  try {
    const resolvedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return resolvedStorage
      ? parseGraphicsPreference(resolvedStorage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY))
      : DEFAULT_GRAPHICS_PREFERENCE;
  } catch {
    return DEFAULT_GRAPHICS_PREFERENCE;
  }
}

export function writeGraphicsPreference(
  preference: GraphicsPreference,
  storage?: StorageLike
) {
  try {
    const resolvedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!resolvedStorage) return;
    if (preference === DEFAULT_GRAPHICS_PREFERENCE) {
      resolvedStorage.removeItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY);
    } else {
      resolvedStorage.setItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY, preference);
    }
  } catch {
    // A blocked/full storage area must never make the menu unusable.
  }
}

export function resolveGraphicsQuality(
  preference: GraphicsPreference,
  _input?: GraphicsCapabilityInput
): GraphicsQualityTier {
  // Quality is intentionally player-directed. The renderer retains bounded
  // pixel and buffer budgets, while Balanced and Performance remain available
  // when a device benefits from an explicit opt-down.
  return preference;
}

export function browserGraphicsCapabilities(): GraphicsCapabilityInput {
  const navigatorWithMemory = typeof navigator === 'undefined'
    ? undefined
    : navigator as Navigator & { deviceMemory?: number };
  let maxTextureSize: number | undefined;
  if (typeof document !== 'undefined') {
    try {
      const probe = document.createElement('canvas');
      const context = probe.getContext('webgl2');
      maxTextureSize = context?.getParameter(context.MAX_TEXTURE_SIZE) as number | undefined;
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      maxTextureSize = undefined;
    }
  }
  return {
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    hardwareConcurrency: navigatorWithMemory?.hardwareConcurrency,
    deviceMemory: navigatorWithMemory?.deviceMemory,
    maxTextureSize
  };
}

export function subscribeGraphicsPreference(listener: (preference: GraphicsPreference) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === WARPKEEP_GRAPHICS_PREFERENCE_KEY || event.key === null) {
      listener(readGraphicsPreference());
    }
  };
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

export function titleModelProfileForQuality(
  quality: GraphicsQualityTier
): 'high' | 'compact' {
  return quality === 'cinematic' ? 'high' : 'compact';
}

export function realmProfileForQuality(quality: GraphicsQualityTier) {
  if (quality === 'cinematic') return 'high' as const;
  if (quality === 'balanced') return 'balanced' as const;
  return 'reduced' as const;
}
