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

  it('delivers one-finger pan, two-contact pinch, and stationary tap through CDP', async () => {
    const runtimeResults = [
      { type: 'boolean', value: true },
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
      { type: 'object', value: { changed: true } },
      { type: 'object', value: { x: 190, y: 350 } },
      { type: 'object', value: {
        activationCount: 1,
        trustedActivationCount: 1
      } },
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
      'touchStart', 'touchMove', 'touchMove', 'touchMove', 'touchMove', 'touchEnd',
      'touchStart', 'touchMove', 'touchMove', 'touchMove', 'touchMove', 'touchEnd',
      'touchStart', 'touchEnd'
    ]);
    expect(touchCalls[0]?.[1]?.touchPoints).toEqual([
      expect.objectContaining({ id: 61, x: 160, y: 320 })
    ]);
    expect(touchCalls[4]?.[1]?.touchPoints).toEqual([
      expect.objectContaining({ id: 61, x: 224, y: 344 })
    ]);
    expect(touchCalls[6]?.[1]?.touchPoints).toHaveLength(2);
    expect(touchCalls[10]?.[1]?.touchPoints).toHaveLength(2);
    expect(touchCalls[12]?.[1]?.touchPoints).toEqual([
      expect.objectContaining({ id: 81, x: 190, y: 350 })
    ]);
    expect(touchCalls.filter(([, params]) => params?.type === 'touchEnd')
      .every(([, params]) => Array.isArray(params?.touchPoints)
        && params.touchPoints.length === 0)).toBe(true);
    const runtimeExpressions = command.mock.calls
      .filter(([method]) => method === 'Runtime.evaluate')
      .map(([, params]) => String(params?.expression ?? ''));
    expect(runtimeExpressions[1]).toContain(
      "fixtureControl.className = 'realm-resource-occupant-marker'"
    );
    expect(runtimeExpressions[1]).toContain(
      'fixtureControl.dataset.renderedMobileTouchFixture'
    );
    expect(runtimeExpressions[1]).toContain('fixtureControl.contains(document.elementFromPoint(');
    expect(runtimeExpressions[1]).toContain('event.isTrusted');
    expect(runtimeExpressions.at(-1)).toContain('state.touchPointerDownCount >= 4');
    expect(runtimeExpressions.at(-1)).toContain('state.untrustedInputCount === 0');
    expect(runtimeExpressions.at(-1)).toContain(
      'state.fixtureActivationCount === 1'
    );
    expect(runtimeExpressions.join('\n')).not.toMatch(
      /new (?:PointerEvent|MouseEvent)|\.dispatchEvent\(/
    );
    expect(runtimeResults).toHaveLength(0);
  });

  it('retries a two-contact pinch in the opposite direction at a zoom limit', async () => {
    const runtimeResults = [
      { type: 'boolean', value: true },
      { type: 'object', value: { x: 160, y: 320 } },
      { type: 'boolean', value: true },
      { type: 'object', value: {
        primary: { x: 170, y: 330 },
        secondary: { x: 310, y: 520 }
      } },
      { type: 'boolean', value: true },
      { type: 'object', value: { changed: false } },
      { type: 'boolean', value: true },
      { type: 'object', value: { changed: true } },
      { type: 'object', value: { x: 190, y: 350 } },
      { type: 'object', value: {
        activationCount: 1,
        trustedActivationCount: 1
      } },
      { type: 'object', value: COMPLETE_EVIDENCE }
    ];
    const command = vi.fn(async (
      method: string,
      _params?: Readonly<Record<string, unknown>>
    ) => method === 'Runtime.evaluate'
      ? { result: runtimeResults.shift() }
      : {});

    await expect(applyRenderedMobileMapGestureInteraction(
      { command },
      renderedMobileMapGestureProbeCases(41_733)[0]!
    )).resolves.toEqual(COMPLETE_EVIDENCE);

    const touches = command.mock.calls.filter(([method]) => (
      method === 'Input.dispatchTouchEvent'
    ));
    expect(touches.filter(([, params]) => params?.type === 'touchStart')
      .map(([, params]) => Array.isArray(params?.touchPoints)
        ? params.touchPoints.length
        : null)).toEqual([1, 2, 2, 1]);
    expect(touches.filter(([, params]) => params?.type === 'touchEnd'))
      .toHaveLength(4);
    expect(runtimeResults).toHaveLength(0);
  });
});
