import { describe, expect, it, vi } from 'vitest';

import {
  applyRenderedWebglCastleCanvasInteraction,
  parseRenderedWebglCastleCanvasPointerTarget,
  parseRenderedWebglCastlePointerMoveState
} from '../scripts/qa-observer/rendered-webgl-browser-probe.mjs';

describe('rendered WebGL canvas castle activation lane', () => {
  it('accepts only bounded non-identifying canvas coordinates', () => {
    expect(parseRenderedWebglCastleCanvasPointerTarget({ x: 512.5, y: 384.25 })).toEqual({
      x: 512.5,
      y: 384.25
    });
    expect(() => parseRenderedWebglCastleCanvasPointerTarget({ x: -1, y: 384 }))
      .toThrow(/pointer target/i);
    expect(() => parseRenderedWebglCastleCanvasPointerTarget({
      x: 512,
      y: 384,
      castleId: 1
    })).toThrow(/pointer target/i);
  });

  it('fails closed unless bounded pointer moves leave the canvas UI untouched', () => {
    expect(parseRenderedWebglCastlePointerMoveState({
      canvasTarget: true,
      dragging: false,
      inspectorOpen: false,
      navigatorOpen: false,
      renderer: 'webgl',
      selectedCastleLabelCount: 0
    })).toEqual({
      canvasTarget: true,
      dragging: false,
      inspectorOpen: false,
      navigatorOpen: false,
      renderer: 'webgl',
      selectedCastleLabelCount: 0
    });
    expect(() => parseRenderedWebglCastlePointerMoveState({
      canvasTarget: true,
      dragging: false,
      inspectorOpen: true,
      navigatorOpen: false,
      renderer: 'webgl',
      selectedCastleLabelCount: 0
    })).toThrow(/pointer state/i);
  });

  it('replays one bounded canvas pointer path before the normal click pair', async () => {
    let evaluationCount = 0;
    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>
    ) => {
      if (method === 'Runtime.evaluate') {
        evaluationCount += 1;
        return evaluationCount === 1
          ? { result: { type: 'object', value: { x: 500, y: 400 } } }
          : {
              result: {
                type: 'object',
                value: {
                  canvasTarget: true,
                  dragging: false,
                  inspectorOpen: false,
                  navigatorOpen: false,
                  renderer: 'webgl',
                  selectedCastleLabelCount: 0
                }
              }
            };
      }
      return {};
    });

    await expect(applyRenderedWebglCastleCanvasInteraction({ command })).resolves.toEqual({
      pointerMoveCount: 5
    });

    const inputCalls = command.mock.calls.filter(([method]) => method === 'Input.dispatchMouseEvent');
    expect(inputCalls).toHaveLength(7);
    expect(inputCalls.slice(0, 5).map(([, params]) => params)).toEqual([
      expect.objectContaining({ type: 'mouseMoved', x: 496, y: 400 }),
      expect.objectContaining({ type: 'mouseMoved', x: 498, y: 402 }),
      expect.objectContaining({ type: 'mouseMoved', x: 502, y: 402 }),
      expect.objectContaining({ type: 'mouseMoved', x: 504, y: 400 }),
      expect.objectContaining({ type: 'mouseMoved', x: 500, y: 400 })
    ]);
    expect(inputCalls.slice(5).map(([, params]) => params)).toEqual([
      expect.objectContaining({
        type: 'mousePressed', x: 500, y: 400, button: 'left', buttons: 1, clickCount: 1
      }),
      expect.objectContaining({
        type: 'mouseReleased', x: 500, y: 400, button: 'left', buttons: 0, clickCount: 1
      })
    ]);
  });
});
