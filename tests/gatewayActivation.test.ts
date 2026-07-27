import { describe, expect, it } from 'vitest';
import {
  createGatewayActivationRecord,
  resolveGatewayActivationOrigin
} from '../src/components/title/gatewayActivation';

const VIEWPORT = Object.freeze({
  left: 0,
  top: 0,
  width: 1_440,
  height: 900
});

const PROJECTION = Object.freeze({
  x: 720,
  y: 324,
  viewportWidth: 1_440,
  viewportHeight: 900,
  visible: true
});

describe('gateway activation origin', () => {
  it('freezes the activation record and preserves the exact pointer client point', () => {
    const activation = createGatewayActivationRecord({
      input: 'pointer',
      clientPoint: { x: 781.25, y: 298.75 },
      buttonRect: { left: 660, top: 270, width: 140, height: 80 },
      projection: PROJECTION,
      projectionSourceRect: VIEWPORT
    });

    expect(Object.isFrozen(activation)).toBe(true);
    expect(Object.isFrozen(activation.clientPoint)).toBe(true);
    expect(Object.isFrozen(activation.buttonRect)).toBe(true);
    expect(Object.isFrozen(activation.projection)).toBe(true);
    expect(Object.isFrozen(activation.projectionSourceRect)).toBe(true);
    expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual({
      x: 781.25,
      y: 298.75
    });
  });

  it('uses the measured viewport-space button center for keyboard activation', () => {
    const activation = createGatewayActivationRecord({
      input: 'keyboard',
      buttonRect: { left: 316, top: 184, width: 144, height: 92 },
      projection: PROJECTION,
      projectionSourceRect: VIEWPORT
    });

    expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual({
      x: 388,
      y: 230
    });
  });

  it('preserves exact pointer and touch-compatible click coordinates near every hit edge', () => {
    const buttonRect = { left: 600, top: 220, width: 180, height: 128 };
    for (const point of [
      { x: 600.5, y: 284 },
      { x: 779.5, y: 284 },
      { x: 690, y: 220.5 },
      { x: 690, y: 347.5 }
    ]) {
      const activation = createGatewayActivationRecord({
        input: 'pointer',
        clientPoint: point,
        buttonRect,
        projection: PROJECTION,
        projectionSourceRect: VIEWPORT
      });
      expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual(point);
    }
  });

  it('converts a local projection through an offset and scaled source rectangle', () => {
    const activation = createGatewayActivationRecord({
      input: 'keyboard',
      projection: {
        x: 250,
        y: 300,
        viewportWidth: 1_000,
        viewportHeight: 600,
        visible: true
      },
      projectionSourceRect: {
        left: 120,
        top: 80,
        width: 500,
        height: 300
      }
    });

    expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual({
      x: 245,
      y: 230
    });
  });

  it('keeps projection fallback aligned across reviewed browser-zoom scale bounds', () => {
    for (const scale of [0.8, 1, 1.25, 1.5]) {
      const source = {
        left: 40,
        top: 24,
        width: 1_000 * scale,
        height: 600 * scale
      };
      const activation = createGatewayActivationRecord({
        input: 'keyboard',
        projection: {
          x: 250,
          y: 180,
          viewportWidth: 1_000,
          viewportHeight: 600,
          visible: true
        },
        projectionSourceRect: source
      });
      expect(resolveGatewayActivationOrigin(activation, {
        left: 0,
        top: 0,
        width: 2_000,
        height: 1_200
      })).toEqual({
        x: source.left + 250 * scale,
        y: source.top + 180 * scale
      });
    }
  });

  it('accepts only points inside the hit target, clamps them, and rejects stale projections', () => {
    const clampedPointer = createGatewayActivationRecord({
      input: 'pointer',
      clientPoint: { x: 1_900, y: -30 },
      buttonRect: { left: -100, top: -100, width: 2_100, height: 200 },
      projection: PROJECTION,
      projectionSourceRect: VIEWPORT
    });
    expect(resolveGatewayActivationOrigin(clampedPointer, VIEWPORT)).toEqual({
      x: 1_440,
      y: 0
    });

    const outsideHitTarget = createGatewayActivationRecord({
      input: 'pointer',
      clientPoint: { x: 1_200, y: 700 },
      buttonRect: { left: 650, top: 270, width: 140, height: 90 },
      projection: PROJECTION,
      projectionSourceRect: VIEWPORT
    });
    expect(resolveGatewayActivationOrigin(outsideHitTarget, VIEWPORT)).toEqual({
      x: 720,
      y: 324
    });

    const staleProjection = {
      x: 480,
      y: 180,
      viewportWidth: 1_200,
      viewportHeight: 700,
      visible: true
    };
    for (const projection of [
      { ...staleProjection, visible: false },
      { ...staleProjection, x: staleProjection.viewportWidth + 1 },
      { ...staleProjection, viewportWidth: Number.NaN }
    ]) {
      const staleActivation = createGatewayActivationRecord({
        input: 'keyboard',
        projection,
        projectionSourceRect: VIEWPORT
      });
      expect(resolveGatewayActivationOrigin(staleActivation, VIEWPORT)).toEqual({
        x: 720,
        y: 324
      });
    }
  });
});
