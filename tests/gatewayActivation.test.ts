import { describe, expect, it } from 'vitest';
import {
  clientPointToOverlay,
  createGatewayActivationRecord,
  createGatewayClientPoint,
  createGatewayRendererPoint,
  gatewayClientPointInsideRect,
  rendererPointToClient,
  resolveGatewayActivationOrigin,
  snapshotGatewayRect
} from '../src/components/title/gatewayActivation';

const VIEWPORT = snapshotGatewayRect({
  left: 0,
  top: 0,
  width: 1_440,
  height: 900
})!;

const RENDERER_POINT = createGatewayRendererPoint({
  x: 720,
  y: 324,
  viewportWidth: 1_440,
  viewportHeight: 900,
  visible: true
});

describe('gateway activation coordinates', () => {
  it('keeps renderer, client, and client-rectangle spaces explicit and immutable', () => {
    const rendererPoint = createGatewayRendererPoint({
      x: 250,
      y: 180,
      viewportWidth: 1_000,
      viewportHeight: 600,
      visible: true
    });
    const surfaceRect = snapshotGatewayRect({
      left: 120,
      top: 80,
      width: 500,
      height: 300
    })!;
    const clientPoint = rendererPointToClient(rendererPoint, surfaceRect);

    expect(rendererPoint).toEqual({
      space: 'renderer',
      x: 250,
      y: 180,
      viewportWidth: 1_000,
      viewportHeight: 600,
      visible: true
    });
    expect(surfaceRect).toEqual({
      space: 'client-rect',
      left: 120,
      top: 80,
      width: 500,
      height: 300
    });
    expect(clientPoint).toEqual({
      space: 'client',
      x: 245,
      y: 170
    });
    expect(Object.isFrozen(rendererPoint)).toBe(true);
    expect(Object.isFrozen(surfaceRect)).toBe(true);
    expect(Object.isFrozen(clientPoint)).toBe(true);
  });

  it('maps the rendered gateway through offset and scaled surfaces at reviewed zoom bounds', () => {
    for (const scale of [0.5, 0.8, 1, 1.25, 1.5]) {
      const sourceRect = snapshotGatewayRect({
        left: 40,
        top: 24,
        width: 1_000 * scale,
        height: 600 * scale
      })!;
      const rendererPoint = createGatewayRendererPoint({
        x: 250,
        y: 180,
        viewportWidth: 1_000,
        viewportHeight: 600,
        visible: true
      });

      expect(rendererPointToClient(rendererPoint, sourceRect)).toEqual({
        space: 'client',
        x: sourceRect.left + 250 * scale,
        y: sourceRect.top + 180 * scale
      });
    }
  });

  it('always resolves the cinematic origin from the rendered gateway center', () => {
    const renderedCenter = createGatewayClientPoint(720, 324)!;
    const activation = createGatewayActivationRecord({
      input: 'pointer',
      pointerClientPoint: createGatewayClientPoint(781.25, 298.75),
      buttonRect: {
        left: 650,
        top: 270,
        width: 140,
        height: 108
      },
      rendererPoint: RENDERER_POINT,
      sourceSurfaceRect: VIEWPORT,
      gatewayClientCenter: renderedCenter,
      buttonClientCenter: createGatewayClientPoint(720.75, 323.5),
      alignmentErrorPx: 0.9,
      measurementGeneration: 17,
      ready: true
    });

    expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual(
      renderedCenter
    );
    expect(activation.pointerClientPoint).toEqual({
      space: 'client',
      x: 781.25,
      y: 298.75
    });
    expect(activation.buttonClientCenter).toEqual({
      space: 'client',
      x: 720.75,
      y: 323.5
    });
    expect(activation.measurementGeneration).toBe(17);
    expect(Object.isFrozen(activation)).toBe(true);
    expect(Object.isFrozen(activation.pointerClientPoint)).toBe(true);
    expect(Object.isFrozen(activation.gatewayClientCenter)).toBe(true);
  });

  it('uses pointer coordinates only to validate the physical hit target', () => {
    const buttonRect = snapshotGatewayRect({
      left: 600,
      top: 220,
      width: 180,
      height: 128
    })!;
    const edgePoints = [
      createGatewayClientPoint(600, 284),
      createGatewayClientPoint(780, 284),
      createGatewayClientPoint(690, 220),
      createGatewayClientPoint(690, 348)
    ];

    for (const point of edgePoints) {
      expect(gatewayClientPointInsideRect(point, buttonRect)).toBe(true);
      const activation = createGatewayActivationRecord({
        input: 'pointer',
        pointerClientPoint: point,
        buttonRect,
        rendererPoint: RENDERER_POINT,
        sourceSurfaceRect: VIEWPORT,
        gatewayClientCenter: createGatewayClientPoint(720, 324),
        ready: true
      });
      expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual({
        space: 'client',
        x: 720,
        y: 324
      });
    }

    expect(gatewayClientPointInsideRect(
      createGatewayClientPoint(780.01, 284),
      buttonRect
    )).toBe(false);
  });

  it('falls back to the renderer-to-client conversion, never the button center', () => {
    const sourceRect = snapshotGatewayRect({
      left: 120,
      top: 80,
      width: 500,
      height: 300
    })!;
    const activation = createGatewayActivationRecord({
      input: 'keyboard',
      buttonRect: {
        left: 310,
        top: 182,
        width: 144,
        height: 92
      },
      rendererPoint: createGatewayRendererPoint({
        x: 250,
        y: 300,
        viewportWidth: 1_000,
        viewportHeight: 600,
        visible: true
      }),
      sourceSurfaceRect: sourceRect,
      buttonClientCenter: createGatewayClientPoint(382, 228),
      ready: true
    });

    expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual({
      space: 'client',
      x: 245,
      y: 230
    });
  });

  it('uses a bounded viewport fallback when no valid rendered measurement exists', () => {
    for (const rendererPoint of [
      createGatewayRendererPoint({
        x: 480,
        y: 180,
        viewportWidth: 1_200,
        viewportHeight: 700,
        visible: false
      }),
      createGatewayRendererPoint({
        x: 1_201,
        y: 180,
        viewportWidth: 1_200,
        viewportHeight: 700,
        visible: true
      }),
      createGatewayRendererPoint({
        x: 480,
        y: 180,
        viewportWidth: Number.NaN,
        viewportHeight: 700,
        visible: true
      })
    ]) {
      const activation = createGatewayActivationRecord({
        input: 'keyboard',
        rendererPoint,
        sourceSurfaceRect: VIEWPORT
      });
      expect(resolveGatewayActivationOrigin(activation, VIEWPORT)).toEqual({
        space: 'client',
        x: 720,
        y: 324
      });
    }
  });

  it('converts a client origin into overlay-local coordinates explicitly', () => {
    const overlayRect = snapshotGatewayRect({
      left: 96,
      top: 64,
      width: 1_180.8,
      height: 738
    })!;

    expect(clientPointToOverlay(
      createGatewayClientPoint(686.4, 326)!,
      overlayRect
    )).toEqual({
      space: 'overlay',
      x: 590.4,
      y: 262
    });
    expect(clientPointToOverlay(
      createGatewayClientPoint(80, 326)!,
      overlayRect
    )).toBeNull();
  });
});
