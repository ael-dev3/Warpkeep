import type { HexCoord } from './hexCoordinates';

/** Static presentation metadata for the shared Hegemony player-castle family. */
export const HEGEMONY_MAIN_CASTLE = {
  id: 'hegemony-main-castle',
  name: 'Hegemony Main Castle',
  initialCoord: { q: 0, r: 0 } satisfies HexCoord,
  runtimeAssetPaths: {
    high: 'models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb',
    balanced: 'models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb',
    compact: 'models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb'
  },
  landscapeBaseRuntimeAssetPaths: {
    high: 'models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb',
    balanced: 'models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb',
    compact: 'models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb'
  },
  /** Normalized runtime diameter in Realm world units (74% of one hex). */
  targetFootprintDiameter: 1.48,
  /** Authored base envelope after castle-derived normalization. */
  landscapeBaseFootprintDiameter: 2.056,
  yawRadians: 0,
  level: 1
} as const;
