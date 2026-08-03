import { describe, expect, it } from 'vitest';

import {
  realmPinchZoomAmount,
  realmPinchZoomProfileForChromeMode
} from '../src/components/realm/realmPinchZoom';

describe('realm pinch zoom', () => {
  it('selects the gentler profile only for the verified Mini App chrome mode', () => {
    expect(realmPinchZoomProfileForChromeMode('miniapp')).toBe('miniapp');
    expect(realmPinchZoomProfileForChromeMode('compact-web')).toBe('standard');
    expect(realmPinchZoomProfileForChromeMode('desktop-web')).toBe('standard');
    expect(realmPinchZoomProfileForChromeMode(undefined)).toBe('standard');
  });

  it('preserves the established standard browser pinch response', () => {
    expect(realmPinchZoomAmount(1.1, 'standard'))
      .toBeCloseTo(Math.log(1.1) * 0.78, 12);
    expect(realmPinchZoomAmount(0.9, 'standard'))
      .toBeCloseTo(Math.log(0.9) * 0.78, 12);
  });

  it('slows ordinary Mini App pinches and smoothly bounds delayed WebView batches', () => {
    const ordinaryStandard = realmPinchZoomAmount(1.1, 'standard');
    const ordinaryMiniApp = realmPinchZoomAmount(1.1, 'miniapp');
    const delayedMiniApp = realmPinchZoomAmount(2, 'miniapp');

    expect(ordinaryMiniApp).toBeGreaterThan(0);
    expect(ordinaryMiniApp).toBeLessThan(ordinaryStandard * 0.65);
    expect(delayedMiniApp).toBeGreaterThan(ordinaryMiniApp);
    expect(delayedMiniApp).toBeLessThan(0.12);
    expect(realmPinchZoomAmount(0.5, 'miniapp'))
      .toBeCloseTo(-delayedMiniApp, 12);
  });

  it('rejects malformed scale samples without moving the camera', () => {
    expect(realmPinchZoomAmount(0, 'miniapp')).toBe(0);
    expect(realmPinchZoomAmount(-1, 'miniapp')).toBe(0);
    expect(realmPinchZoomAmount(Number.NaN, 'miniapp')).toBe(0);
    expect(realmPinchZoomAmount(Number.POSITIVE_INFINITY, 'miniapp')).toBe(0);
  });
});
