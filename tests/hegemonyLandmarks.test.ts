import { describe, expect, it } from 'vitest';

import { HEGEMONY_FRONTIER_KEEP } from '../src/game/map/hegemonyLandmarks';

describe('Hegemony landmark presentation metadata', () => {
  it('starts the Frontier Keep at the central cell and names a separate runtime asset', () => {
    expect(HEGEMONY_FRONTIER_KEEP.initialCoord).toEqual({ q: 0, r: 0 });
    expect(HEGEMONY_FRONTIER_KEEP.runtimeAssetPath).toBe('models/hegemony-frontier-keep.runtime.glb');
  });
});
