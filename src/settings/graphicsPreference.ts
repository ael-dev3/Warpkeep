export const WARPKEEP_GRAPHICS_PREFERENCE_KEY = 'warpkeep.graphics.preference.v1';

export const GRAPHICS_PREFERENCES = [
  'auto',
  'cinematic',
  'balanced',
  'performance'
] as const;

export type GraphicsPreference = (typeof GRAPHICS_PREFERENCES)[number];
export type GraphicsQualityTier = Exclude<GraphicsPreference, 'auto'>;

/** Hardware-aware unless the player explicitly chooses a fixed profile. */
export const DEFAULT_GRAPHICS_PREFERENCE: GraphicsPreference = 'auto';

export type GraphicsCapabilityInput = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTextureSize?: number;
  /**
   * A verified embedded mobile host whose memory signal may be absent. This
   * is presentation context only and never participates in authentication or
   * admission authority.
   */
  conservativeEmbeddedMobile?: boolean;
}>;

export type WebGL2Capability = Readonly<{
  available: boolean;
  maxTextureSize?: number;
}>;

let cachedWebGL2Capability: WebGL2Capability | undefined;

/**
 * Probe the renderer contract once without mutating the context. The Realm
 * and title renderer must share this capability result so a feature probe can
 * never consume or deliberately lose the context that a real scene needs.
 */
export function probeWebGL2Capability(): WebGL2Capability {
  // A successful probe is stable enough to share across title and Realm.
  // A negative probe can be transient (context pressure, background restore,
  // browser lifecycle), so leave it uncached for an explicit/manual retry.
  if (cachedWebGL2Capability?.available === true) return cachedWebGL2Capability;
  if (typeof document === 'undefined') return Object.freeze({ available: false });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) {
      return Object.freeze({ available: false });
    }
    let maxTextureSize: number | undefined;
    try {
      const measured = context.getParameter(context.MAX_TEXTURE_SIZE);
      if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) {
        maxTextureSize = measured;
      }
    } catch {
      // A context can be usable even when a non-essential capability query is
      // blocked by the browser; quality resolution handles an unknown size.
    }
    cachedWebGL2Capability = Object.freeze({ available: true, maxTextureSize });
  } catch {
    return Object.freeze({ available: false });
  }
  return cachedWebGL2Capability ?? Object.freeze({ available: false });
}

/** Test-only reset; production callers should retain the shared probe cache. */
export function resetWebGL2CapabilityForTests() {
  cachedWebGL2Capability = undefined;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isGraphicsPreference(value: unknown): value is GraphicsPreference {
  return typeof value === 'string'
    && GRAPHICS_PREFERENCES.includes(value as GraphicsPreference);
}

export function parseGraphicsPreference(value: unknown): GraphicsPreference {
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

function finitePositive(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function resolveGraphicsQuality(
  preference: GraphicsPreference,
  input: GraphicsCapabilityInput
): GraphicsQualityTier {
  if (preference !== 'auto') return preference;

  const width = finitePositive(input.width, 1280);
  const height = finitePositive(input.height, 720);
  const cores = finitePositive(input.hardwareConcurrency, 4);
  const memory = finitePositive(input.deviceMemory, 4);
  // Unknown GPU capability is not evidence of Cinematic headroom. Keep an
  // unreported or failed WebGL2 probe on the broadly compatible Balanced path;
  // explicit player choices still take precedence above.
  const maxTextureSize = finitePositive(input.maxTextureSize, 4096);
  const minimumTextureCapability = input.maxTextureSize !== undefined
    && Number.isFinite(input.maxTextureSize)
    && input.maxTextureSize > 0
    && maxTextureSize <= 4096;
  const shortestSide = Math.min(width, height);
  const drawingBufferPixels = width * height * Math.min(
    finitePositive(input.devicePixelRatio, 1),
    2.5
  ) ** 2;
  const memorySignalReliable = input.deviceMemory !== undefined
    && Number.isFinite(input.deviceMemory)
    && input.deviceMemory > 0;
  const compactEmbeddedViewport = shortestSide <= 768
    && Math.max(width, height) <= 1_440;

  // Several mobile WebViews omit `deviceMemory` even when their reported CPU
  // and texture limits look ordinary. Begin verified Mini App phones on the
  // lowest-risk profile until the player explicitly chooses otherwise. An
  // explicit Balanced or Cinematic preference already returned above.
  if (
    input.conservativeEmbeddedMobile === true
    && compactEmbeddedViewport
    && !memorySignalReliable
  ) {
    return 'performance';
  }

  // 4096 is the WebGL 2 minimum, so it is evidence of a minimum-capability
  // implementation rather than Balanced headroom. Start those devices on the
  // lightest profile before they need renderer recovery.
  if (shortestSide < 280 || cores <= 2 || memory <= 2 || minimumTextureCapability) {
    return 'performance';
  }
  if (width <= 1024 || height < 680) return 'balanced';
  if (
    width >= 1180
    && height >= 680
    && drawingBufferPixels <= 12_000_000
    && cores >= 6
    && memory >= 8
    && input.maxTextureSize !== undefined
    && Number.isFinite(input.maxTextureSize)
    && maxTextureSize >= 8192
  ) return 'cinematic';
  return 'balanced';
}

export function browserGraphicsCapabilities(): GraphicsCapabilityInput {
  const navigatorWithMemory = typeof navigator === 'undefined'
    ? undefined
    : navigator as Navigator & { deviceMemory?: number };
  const maxTextureSize = probeWebGL2Capability().maxTextureSize;
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
