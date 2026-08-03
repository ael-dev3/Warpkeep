import { describe, expect, it } from 'vitest';

import {
  createRealmPinchZoomGesture,
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

  it('slows ordinary Mini App pinches and smoothly compresses delayed WebView batches', () => {
    const ordinaryStandard = realmPinchZoomAmount(1.1, 'standard');
    const ordinaryMiniApp = realmPinchZoomAmount(1.1, 'miniapp');
    const delayedMiniApp = realmPinchZoomAmount(2, 'miniapp');
    const deliberateLongMiniApp = realmPinchZoomAmount(4, 'miniapp');

    expect(ordinaryMiniApp).toBeGreaterThan(0);
    expect(ordinaryMiniApp).toBeLessThan(ordinaryStandard * 0.65);
    expect(delayedMiniApp).toBeGreaterThan(ordinaryMiniApp);
    expect(delayedMiniApp).toBeLessThan(realmPinchZoomAmount(2, 'standard') * 0.4);
    expect(deliberateLongMiniApp).toBeGreaterThan(delayedMiniApp);
    expect(realmPinchZoomAmount(0.5, 'miniapp'))
      .toBeCloseTo(-delayedMiniApp, 12);
  });

  it('produces the same Mini App zoom for sparse and dense event cadences', () => {
    const sparse = createRealmPinchZoomGesture();
    sparse.amount({ reset: true, scaleRatio: 1, scaleFromStart: 1 }, 'miniapp');
    const sparseAmount = sparse.amount({
      reset: false,
      scaleRatio: 1.5,
      scaleFromStart: 1.5
    }, 'miniapp');

    const dense = createRealmPinchZoomGesture();
    dense.amount({ reset: true, scaleRatio: 1, scaleFromStart: 1 }, 'miniapp');
    let denseAmount = 0;
    let previousScale = 1;
    for (let step = 1; step <= 10; step += 1) {
      const scaleFromStart = 1 + step * 0.05;
      denseAmount += dense.amount({
        reset: false,
        scaleRatio: scaleFromStart / previousScale,
        scaleFromStart
      }, 'miniapp');
      previousScale = scaleFromStart;
    }

    expect(denseAmount).toBeCloseTo(sparseAmount, 12);
    expect(sparseAmount).toBeCloseTo(realmPinchZoomAmount(1.5, 'miniapp'), 12);
  });

  it('keeps the standard gesture path exactly incremental', () => {
    const gesture = createRealmPinchZoomGesture();
    gesture.amount({ reset: true, scaleRatio: 1, scaleFromStart: 1 }, 'standard');
    const first = gesture.amount({
      reset: false,
      scaleRatio: 1.1,
      scaleFromStart: 1.1
    }, 'standard');
    const second = gesture.amount({
      reset: false,
      scaleRatio: 1.2 / 1.1,
      scaleFromStart: 1.2
    }, 'standard');

    expect(first + second).toBeCloseTo(Math.log(1.2) * 0.78, 12);
  });

  it('tracks reversals across the gesture origin without retaining drift', () => {
    const gesture = createRealmPinchZoomGesture();
    gesture.amount({ reset: true, scaleRatio: 1, scaleFromStart: 1 }, 'miniapp');
    const outward = gesture.amount({
      reset: false,
      scaleRatio: 1.3,
      scaleFromStart: 1.3
    }, 'miniapp');
    const crossedOrigin = gesture.amount({
      reset: false,
      scaleRatio: 0.8 / 1.3,
      scaleFromStart: 0.8
    }, 'miniapp');
    const returnedToOrigin = gesture.amount({
      reset: false,
      scaleRatio: 1 / 0.8,
      scaleFromStart: 1
    }, 'miniapp');

    expect(outward + crossedOrigin)
      .toBeCloseTo(realmPinchZoomAmount(0.8, 'miniapp'), 12);
    expect(outward + crossedOrigin + returnedToOrigin).toBeCloseTo(0, 12);
  });

  it('rebases safely across a profile change and an explicit cancellation reset', () => {
    const gesture = createRealmPinchZoomGesture();
    gesture.amount({ reset: true, scaleRatio: 1, scaleFromStart: 1 }, 'miniapp');
    gesture.amount({ reset: false, scaleRatio: 1.2, scaleFromStart: 1.2 }, 'miniapp');

    expect(gesture.amount({
      reset: false,
      scaleRatio: 1.1,
      scaleFromStart: 1.32
    }, 'standard')).toBeCloseTo(realmPinchZoomAmount(1.1, 'standard'), 12);
    expect(gesture.amount({
      reset: false,
      scaleRatio: 1.05,
      scaleFromStart: 1.386
    }, 'miniapp')).toBeCloseTo(realmPinchZoomAmount(1.05, 'miniapp'), 12);

    gesture.reset();
    expect(gesture.amount({
      reset: false,
      scaleRatio: 1.25,
      scaleFromStart: 1.25
    }, 'miniapp')).toBeCloseTo(realmPinchZoomAmount(1.25, 'miniapp'), 12);
  });

  it('rejects malformed scale samples without moving the camera', () => {
    expect(realmPinchZoomAmount(0, 'miniapp')).toBe(0);
    expect(realmPinchZoomAmount(-1, 'miniapp')).toBe(0);
    expect(realmPinchZoomAmount(Number.NaN, 'miniapp')).toBe(0);
    expect(realmPinchZoomAmount(Number.POSITIVE_INFINITY, 'miniapp')).toBe(0);

    const gesture = createRealmPinchZoomGesture();
    gesture.amount({ reset: true, scaleRatio: 1, scaleFromStart: 1 }, 'miniapp');
    expect(gesture.amount({
      reset: false,
      scaleRatio: Number.NaN,
      scaleFromStart: Number.NaN
    }, 'miniapp')).toBe(0);
  });
});
