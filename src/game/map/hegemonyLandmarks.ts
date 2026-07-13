import type { HexCoord } from './hexCoordinates';

/** Static presentation metadata for the session-bound first center keep. */
export const HEGEMONY_FRONTIER_KEEP = {
  id: 'hegemony-frontier-keep',
  name: 'Hegemony Frontier Keep',
  initialCoord: { q: 0, r: 0 } satisfies HexCoord,
  runtimeAssetPaths: {
    high: 'models/hegemony/hegemony-frontier-keep-high.glb',
    balanced: 'models/hegemony/hegemony-frontier-keep-balanced.glb',
    compact: 'models/hegemony/hegemony-frontier-keep-compact.glb'
  },
  normalizedScale: 0.78,
  yawRadians: 0,
  level: 1
} as const;
