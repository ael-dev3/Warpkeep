import type { HexCoord } from './hexCoordinates';

/**
 * Static presentation metadata for the first rendered landmark. Its location
 * is local UI state for now; future server state can replace it without
 * changing terrain generation or the runtime model loader.
 */
export const HEGEMONY_FRONTIER_KEEP = {
  id: 'hegemony-frontier-keep',
  name: 'Hegemony Frontier Keep',
  initialCoord: { q: 0, r: 0 } satisfies HexCoord,
  runtimeAssetPath: 'models/hegemony-frontier-keep.runtime.glb'
} as const;
