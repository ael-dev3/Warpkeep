import { describe, expect, it, vi } from 'vitest';

import {
  applyRenderedMobileMapGestureInteraction,
  parseRenderedMobileMapGestureEvidence,
  renderedMobileMapGestureProbeCases
} from '../scripts/qa-observer/rendered-mobile-map-gesture.mjs';

const COMPLETE_EVIDENCE = Object.freeze({
  inputClean: true,
  nonCastleControlExercised: true,
  panMoved: true,
  pinchZoomed: true,
  rendererStable: true,
  selectionTapped: true,
  touchEnvironmentReady: true,
  viewportExact: true,
  worldControlActivationSuppressed: true,
  worldControlsOwnTouch: true
});

describe('rendered mobile map gesture probe', () => {
  it('defines honest iPhone and Android Chromium touch-emulation profiles', () => {
    const cases = renderedMobileMapGestureProbeCases(41_733);

    expect(cases).toEqual([
      expect.objectContaining({
        id: 'iphone-chromium-emulation',
        deviceScaleFactor: 3,
        viewport: { width: 390, height: 844 }
      }),
      expect.objectContaining({
        id: 'android-chromium-emulation',
        deviceScaleFactor: 2.625,
        viewport: { width: 412, height: 915 }
      })
    ]);
    expect(cases.every(({ url }) => (
      url.startsWith('http://127.0.0.1:41733/')
      && !url.includes('touchProfile=')
    ))).toBe(true);
    expect(new Set(cases.map(({ url }) => url)).size).toBe(2);
    expect(cases[0]?.url).toContain('fixture=worker-active');
    expect(cases[1]?.url).not.toContain('fixture=');
    expect(() => renderedMobileMapGestureProbeCases(0)).toThrow(/port/i);
  });

  it('accepts only complete privacy-safe aggregate evidence', () => {
    expect(parseRenderedMobileMapGestureEvidence(COMPLETE_EVIDENCE))
      .toEqual(COMPLETE_EVIDENCE);
    expect(() => parseRenderedMobileMapGestureEvidence({
      ...COMPLETE_EVIDENCE,
      pinchZoomed: false
    })).toThrow(/mobile map gesture evidence/i);
    expect(() => parseRenderedMobileMapGestureEvidence({
      ...COMPLETE_EVIDENCE,
      castleId: 1
    })).toThrow(/mobile map gesture evidence/i);
  });

  it('replays one-finger pan, two-contact pinch, and stationary touch selection', async () => {
    const runtimeResults = [
      { type: 'object', value: { x: 160, y: 320 } },
      { type: 'boolean', value: true },
      {
        type: 'object',
        value: {
          primary: { x: 170, y: 330 },
          secondary: { x: 310, y: 520 }
        }
      },
      { type: 'boolean', value: true },
      { type: 'object', value: { x: 190, y: 350 } },
      { type: 'object', value: COMPLETE_EVIDENCE }
    ];
    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>,
      _timeoutMilliseconds?: number
    ) => {
      if (method !== 'Runtime.evaluate') return {};
      const result = runtimeResults.shift();
      if (!result) throw new Error('Unexpected Runtime.evaluate call.');
      return { result };
    });
    const probeCase = renderedMobileMapGestureProbeCases(41_733)[0]!;

    await expect(applyRenderedMobileMapGestureInteraction(
      { command },
      probeCase
    )).resolves.toEqual(COMPLETE_EVIDENCE);

    const touchCalls = command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchTouchEvent'
    ));
    expect(touchCalls.map(([, params]) => params?.type)).toEqual([
      'touchStart',
      'touchMove',
      'touchEnd',
      'touchStart',
      'touchMove',
      'touchEnd',
      'touchStart',
      'touchEnd'
    ]);
    expect(touchCalls[3]?.[1]?.touchPoints).toHaveLength(2);
    expect(touchCalls[4]?.[1]?.touchPoints).toHaveLength(2);
    const runtimeExpressions = command.mock.calls
      .filter(([method]) => method === 'Runtime.evaluate')
      .map(([, params]) => String(params?.expression ?? ''));
    expect(runtimeExpressions[0]).toContain(
      "fixtureControl.className = 'realm-resource-occupant-marker'"
    );
    expect(runtimeExpressions[0]).toContain(
      'fixtureControl.dataset.renderedMobileTouchFixture'
    );
    expect(runtimeExpressions.at(-1)).toContain(
      'state.fixtureActivationCount === 1'
    );
    expect(runtimeResults).toHaveLength(0);
  });
});
