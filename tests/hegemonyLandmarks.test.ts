import { describe, expect, it } from 'vitest';

import { HEGEMONY_MAIN_CASTLE } from '../src/game/map/hegemonyLandmarks';

describe('Hegemony landmark presentation metadata', () => {
  it('starts the main castle at the central cell and pins its runtime LODs', () => {
    expect(HEGEMONY_MAIN_CASTLE.initialCoord).toEqual({ q: 0, r: 0 });
    expect(HEGEMONY_MAIN_CASTLE.runtimeAssetPaths).toEqual({
      high: 'models/hegemony/hegemony-main-castle-high.glb',
      balanced: 'models/hegemony/hegemony-main-castle-balanced.glb',
      compact: 'models/hegemony/hegemony-main-castle-compact.glb'
    });
    expect(HEGEMONY_MAIN_CASTLE.targetFootprintDiameter).toBe(1.48);
  });
});
