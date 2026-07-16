export const WARPKEEP_GRAPHICS_PREFERENCE_KEY = 'warpkeep.graphics.preference.v1';

export const GRAPHICS_PREFERENCES = [
  'auto',
  'cinematic',
  'balanced',
  'performance'
] as const;

export type GraphicsPreference = (typeof GRAPHICS_PREFERENCES)[number];
export type GraphicsQualityTier = Exclude<GraphicsPreference, 'auto'>;

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
  return isGraphicsPreference(value) ? value : 'auto';
}

export function readGraphicsPreference(
  storage?: StorageLike
): GraphicsPreference {
  try {
    const resolvedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return resolvedStorage
      ? parseGraphicsPreference(resolvedStorage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY))
      : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeGraphicsPreference(
  preference: GraphicsPreference,
  storage?: StorageLike
) {
  try {
    const resolvedStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!resolvedStorage) return;
    if (preference === 'auto') {
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
  const maxTextureSize = finitePositive(input.maxTextureSize, 8192);
  const shortestSide = Math.min(width, height);
  const drawingBufferPixels = width * height * Math.min(
    finitePositive(input.devicePixelRatio, 1),
    2.5
  ) ** 2;

  if (shortestSide < 280 || cores <= 2 || memory <= 2 || maxTextureSize < 4096) {
    return 'performance';
  }
  if (width <= 1024 || height < 680) {
    return 'balanced';
  }
  if (
    width >= 1180
    && height >= 680
    && drawingBufferPixels <= 12_000_000
    // Cinematic keeps three castle/base LOD assemblies resident. Auto-select
    // it only on clearly measured headroom; it remains an explicit setting on
    // browsers that do not expose device memory or on otherwise capable 4 GB
    // systems.
    && cores >= 6
    && memory >= 8
    && maxTextureSize >= 8192
  ) {
    return 'cinematic';
  }
  return 'balanced';
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
