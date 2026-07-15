import type { HexCoord } from './hexCoordinates';

/** Static presentation metadata for the shared Hegemony player-castle family. */
export const HEGEMONY_MAIN_CASTLE = {
  id: 'hegemony-main-castle',
  name: 'Hegemony Main Castle',
  initialCoord: { q: 0, r: 0 } satisfies HexCoord,
  runtimeAssetPaths: {
    high: 'models/hegemony/hegemony-main-castle-high.glb',
    balanced: 'models/hegemony/hegemony-main-castle-balanced.glb',
    compact: 'models/hegemony/hegemony-main-castle-compact.glb'
  },
  /** Normalized runtime diameter in Realm world units (74% of one hex). */
  targetFootprintDiameter: 1.48,
  yawRadians: 0,
  level: 1
} as const;
