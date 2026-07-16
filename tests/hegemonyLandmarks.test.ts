import { describe, expect, it } from 'vitest';

import { HEGEMONY_MAIN_CASTLE } from '../src/game/map/hegemonyLandmarks';

describe('Hegemony landmark presentation metadata', () => {
  it('starts the main castle at the central cell and pins its runtime LODs', () => {
    expect(HEGEMONY_MAIN_CASTLE.initialCoord).toEqual({ q: 0, r: 0 });
    expect(HEGEMONY_MAIN_CASTLE.runtimeAssetPaths).toEqual({
      high: 'models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb',
      balanced: 'models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb',
      compact: 'models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb'
    });
    expect(HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths).toEqual({
      high: 'models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb',
      balanced: 'models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb',
      compact: 'models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb'
    });
    expect(HEGEMONY_MAIN_CASTLE.targetFootprintDiameter).toBe(1.48);
    expect(HEGEMONY_MAIN_CASTLE.landscapeBaseFootprintDiameter).toBe(2.056);
  });
});
