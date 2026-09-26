import { renderedWebglQaUrl } from './rendered-webgl-qa-contract.mjs';

const MOBILE_TOUCH_PROFILES = Object.freeze([
  Object.freeze({
    id: 'iphone-chromium-emulation',
    fixture: 'worker-active',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 3,
  }),
  Object.freeze({
    id: 'android-chromium-emulation',
    fixture: 'baseline',
    viewport: Object.freeze({ width: 412, height: 915 }),
    deviceScaleFactor: 2.625,
  }),
]);

const TOUCH_SETTLE_TIMEOUT_MILLISECONDS = 10_000;

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(message);
  }
  return value;
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function pointerTarget(value) {
  const candidate = exactRecord(
    value,
    'Invalid rendered mobile touch target.'
  );
  if (
    !exactKeys(candidate, ['x', 'y'])
    || !Number.isFinite(candidate.x)
    || !Number.isFinite(candidate.y)
    || candidate.x < 0
    || candidate.y < 0
    || candidate.x > 4_096
    || candidate.y > 4_096
  ) throw new TypeError('Invalid rendered mobile touch target.');
  return Object.freeze({ x: candidate.x, y: candidate.y });
}

export function parseRenderedMobileMapGestureEvidence(value) {
  const candidate = exactRecord(
    value,
    'Invalid rendered mobile map gesture evidence.'
  );
  const keys = [
    'inputClean',
    'nonCastleControlExercised',
    'panMoved',
    'pinchZoomed',
    'rendererStable',
    'selectionTapped',
    'touchEnvironmentReady',
    'viewportExact',
    'worldControlActivationSuppressed',
    'worldControlsOwnTouch',
  ];
  if (
    !exactKeys(candidate, keys)
    || keys.some((key) => candidate[key] !== true)
  ) throw new TypeError(
    `Invalid rendered mobile map gesture evidence (${JSON.stringify(candidate)}).`
  );
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, true])));
}

export function renderedMobileMapGestureProbeCases(port) {
  return Object.freeze(MOBILE_TOUCH_PROFILES.map((profile) => {
    const url = renderedWebglQaUrl({
      fixture: profile.fixture,
      mode: 'player',
      port,
      quality: 'balanced',
    });
    return Object.freeze({
      id: profile.id,
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 4,
      url,
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
    });
  }));
}

async function evaluateObject(session, expression, message) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, TOUCH_SETTLE_TIMEOUT_MILLISECONDS);
  if (
    evaluation?.exceptionDetails
    || evaluation?.result?.type !== 'object'
  ) {
    const exceptionDescription = evaluation?.exceptionDetails?.exception?.description;
    const safeException = typeof exceptionDescription === 'string'
      ? exceptionDescription.split('\n', 1)[0].slice(0, 240)
      : '';
    const resultType = typeof evaluation?.result?.type === 'string'
      ? evaluation.result.type
      : 'missing';
    throw new Error(
      `${message} (result=${resultType}${safeException ? `, ${safeException}` : ''}).`
    );
  }
  return evaluation.result.value;
}

async function waitForCameraSettled(session) {
  const settled = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const deadline = performance.now() + 5000;
      while (performance.now() <= deadline) {
        const root = document.querySelector('.realm-map-screen');
        const canvas = root?.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        if (
          root?.getAttribute('data-renderer-state') === 'ready'
          && canvas?.getAttribute('data-realm-camera-settled') === 'true'
          && canvas?.getAttribute('data-dragging') !== 'true'
          && !root?.hasAttribute('data-camera-interacting')
        ) return true;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return false;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, TOUCH_SETTLE_TIMEOUT_MILLISECONDS);
  if (
    settled?.exceptionDetails
    || settled?.result?.type !== 'boolean'
    || settled.result.value !== true
  ) throw new Error('Rendered mobile camera did not settle.');
}

function touchPoint(id, point) {
  return {
    id,
    x: point.x,
    y: point.y,
    radiusX: 1,
    radiusY: 1,
    force: 1,
  };
}

async function dispatchTouchGesture(session, start, moves = []) {
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: start,
  });
  try {
    for (const touchPoints of moves) {
      await session.command('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints,
      });
      // Let the browser deliver each change and the renderer consume a frame.
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    await session.command('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  }
}

function between(start, end, fraction) {
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
  };
}

/**
 * Exercises the game's mobile input path with browser-delivered CDP touch
 * events. Chromium emulation does not establish physical-device acceptance.
 * Coordinates remain page-local; only aggregate booleans cross the QA boundary.
 */
export async function applyRenderedMobileMapGestureInteraction(
  session,
  probeCase
) {
  if (!session || typeof session.command !== 'function') {
    throw new TypeError('Invalid rendered mobile touch session.');
  }
  const viewport = exactRecord(
    probeCase?.viewport,
    'Invalid rendered mobile touch viewport.'
  );
  if (
    !Number.isSafeInteger(viewport.width)
    || !Number.isSafeInteger(viewport.height)
    || viewport.width < 320
    || viewport.height < 568
    || !Number.isFinite(probeCase?.deviceScaleFactor)
    || probeCase.deviceScaleFactor < 1
    || probeCase.deviceScaleFactor > 4
  ) throw new TypeError('Invalid rendered mobile touch profile.');

  await waitForCameraSettled(session);
  const panStart = pointerTarget(await evaluateObject(
    session,
    `(() => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width > 0
          && bounds.height > 0;
      };
      const root = document.querySelector('.realm-map-screen');
      const canvas = root?.querySelector(
        'canvas[data-realm-canvas-active="true"]'
      );
      if (
        !(root instanceof HTMLElement)
        || !(canvas instanceof HTMLCanvasElement)
      ) return null;
      const fixtureHost = root.querySelector(
        '.realm-resource-occupant-markers'
      ) ?? root;
      // The semantic fixture intentionally culls map markers that are outside
      // the current camera. This local-only control keeps the shared production
      // selector, CSS, capture, compatibility-click, and gesture lane under
      // deterministic rendered touch input without introducing live data.
      const fixtureControl = document.createElement('button');
      fixtureControl.type = 'button';
      fixtureControl.className = 'realm-resource-occupant-marker';
      fixtureControl.dataset.projectedVisible = 'true';
      fixtureControl.dataset.renderedMobileTouchFixture = 'true';
      fixtureControl.setAttribute(
        'aria-label',
        'Synthetic mobile resource touch target'
      );
      Object.assign(fixtureControl.style, {
        opacity: '1',
        pointerEvents: 'auto',
        transform: 'none',
        visibility: 'visible',
        zIndex: '99',
      });
      fixtureControl.addEventListener('click', (event) => {
        const state = globalThis.__warpkeepRenderedMobileTouch;
        if (!state) return;
        state.fixtureActivationCount += 1;
        if (event.isTrusted) state.trustedFixtureActivationCount += 1;
      });
      fixtureHost.append(fixtureControl);
      const hostBounds = fixtureHost.getBoundingClientRect();
      const panOffsets = [
        [0.58, 0.48],
        [0.42, 0.55],
        [0.62, 0.62],
        [0.35, 0.4],
      ];
      let panTarget = null;
      for (const [x, y] of panOffsets) {
        fixtureControl.style.left = Math.round(hostBounds.width * x) + 'px';
        fixtureControl.style.top = Math.round(hostBounds.height * y) + 'px';
        const bounds = fixtureControl.getBoundingClientRect();
        const center = {
          x: bounds.left + bounds.width * 0.5,
          y: bounds.top + bounds.height * 0.5,
        };
        const end = document.elementFromPoint(center.x + 64, center.y + 24);
        const usable = center.x >= 32
          && center.x + 64 <= innerWidth - 32
          && center.y >= 48
          && center.y + 24 <= innerHeight - 48
          && fixtureControl.contains(document.elementFromPoint(
            center.x,
            center.y
          ))
          && end instanceof Element
          && root.contains(end);
        if (usable) {
          panTarget = center;
          break;
        }
      }
      if (!panTarget) {
        fixtureControl.remove();
        return null;
      }
      const visibleWorldControls = [...document.querySelectorAll(
        '.realm-castle-label, .realm-worker-presence-marker, '
          + '.realm-resource-occupant-marker'
      )].filter((control) => {
        if (!visible(control)) return false;
        const controlBounds = control.getBoundingClientRect();
        const x = controlBounds.left + controlBounds.width * 0.5;
        const y = controlBounds.top + controlBounds.height * 0.5;
        return controlBounds.width >= 32
          && controlBounds.height >= 32
          && x >= 32
          && x <= innerWidth - 32
          && y >= 48
          && y <= innerHeight - 48
          && control.contains(document.elementFromPoint(x, y));
      });
      const primaryControl = fixtureControl;
      if (!(primaryControl instanceof HTMLElement)) return null;
      const primaryControlKind = primaryControl.matches(
        '.realm-worker-presence-marker'
      ) ? 'worker' : 'resource';
      globalThis.__warpkeepRenderedMobileTouch = {
        canvas,
        fixtureActivationCount: 0,
        trustedFixtureActivationCount: 0,
        fixtureControl,
        initialCameraToken: canvas.getAttribute(
          'data-realm-camera-state-token'
        ),
        initialRendererGeneration: root.getAttribute(
          'data-renderer-generation'
        ),
        initialSceneCreationCount: root.getAttribute(
          'data-realm-scene-creation-count'
        ),
        panControlKind: primaryControlKind,
        pinchMoveCount: 0,
        pinchPhaseObserved: false,
        touchPointerDownCount: 0,
        touchPointerMoveCount: 0,
        touchPointerUpCount: 0,
        trustedTouchStartCount: 0,
        trustedTouchMoveCount: 0,
        trustedTouchEndCount: 0,
        untrustedInputCount: 0,
        root,
        worldControlsOwnTouch:
          getComputedStyle(canvas).touchAction === 'none'
          && visibleWorldControls.length >= 1
          && visibleWorldControls.every((control) => (
            getComputedStyle(control).touchAction === 'none'
          )),
      };
      const observeTouchPointer = (event) => {
        const state = globalThis.__warpkeepRenderedMobileTouch;
        if (!state) return;
        if (event.pointerType !== 'touch') return;
        if (!event.isTrusted) state.untrustedInputCount += 1;
        if (event.type === 'pointerdown') state.touchPointerDownCount += 1;
        if (event.type === 'pointermove') state.touchPointerMoveCount += 1;
        if (event.type === 'pointerup') state.touchPointerUpCount += 1;
        if (state.root.getAttribute('data-camera-interacting') === 'pinching') {
          state.pinchPhaseObserved = true;
          if (event.type === 'pointermove') state.pinchMoveCount += 1;
        }
      };
      globalThis.__warpkeepRenderedMobileTouch.pointerObserver =
        observeTouchPointer;
      const observeTouch = (event) => {
        const state = globalThis.__warpkeepRenderedMobileTouch;
        if (!state) return;
        if (!event.isTrusted) state.untrustedInputCount += 1;
        if (event.type === 'touchstart') state.trustedTouchStartCount += 1;
        if (event.type === 'touchmove') state.trustedTouchMoveCount += 1;
        if (event.type === 'touchend') state.trustedTouchEndCount += 1;
      };
      globalThis.__warpkeepRenderedMobileTouch.touchObserver = observeTouch;
      for (const eventType of ['pointerdown', 'pointermove', 'pointerup']) {
        window.addEventListener(eventType, observeTouchPointer, true);
      }
      for (const eventType of ['touchstart', 'touchmove', 'touchend']) {
        window.addEventListener(eventType, observeTouch, true);
      }
      return {
        x: Math.round(panTarget.x * 100) / 100,
        y: Math.round(panTarget.y * 100) / 100,
      };
    })()`,
    'Rendered mobile pan target evaluation failed.'
  ));

  await dispatchTouchGesture(
    session,
    [touchPoint(61, panStart)],
    [0.25, 0.5, 0.75, 1].map((fraction) => [touchPoint(61, {
      x: panStart.x + 64 * fraction,
      y: panStart.y + 24 * fraction,
    })])
  );
  await waitForCameraSettled(session);

  const pinchTargets = exactRecord(await evaluateObject(
    session,
    `(() => {
      const state = globalThis.__warpkeepRenderedMobileTouch;
      if (!state) return null;
      state.panActivationSuppressed = state.fixtureActivationCount === 0;
      const canvasBounds = state.canvas.getBoundingClientRect();
      const candidates = [
        [0.78, 0.32],
        [0.22, 0.68],
        [0.78, 0.68],
        [0.22, 0.32],
        [0.5, 0.72],
        [0.35, 0.48],
        [0.65, 0.48],
        [0.35, 0.62],
        [0.65, 0.62],
      ].map(([x, y]) => ({
        x: canvasBounds.left + canvasBounds.width * x,
        y: canvasBounds.top + canvasBounds.height * y,
      }));
      let pair = null;
      for (const primary of candidates) {
        if (document.elementFromPoint(primary.x, primary.y) !== state.canvas) {
          continue;
        }
        for (const secondary of candidates) {
          if (secondary === primary
            || document.elementFromPoint(secondary.x, secondary.y)
              !== state.canvas) continue;
          const distance = Math.hypot(
            secondary.x - primary.x,
            secondary.y - primary.y
          );
          if (distance < 96) continue;
          const dx = (secondary.x - primary.x) / distance * 26;
          const dy = (secondary.y - primary.y) / distance * 26;
          if (document.elementFromPoint(primary.x - dx, primary.y - dy)
              === state.canvas
            && document.elementFromPoint(secondary.x + dx, secondary.y + dy)
              === state.canvas) {
            pair = { primary, secondary };
            break;
          }
        }
        if (pair) break;
      }
      if (!pair) return null;
      state.pinchControlKind = 'canvas';
      state.panMoved = state.canvas.getAttribute(
        'data-realm-camera-state-token'
      ) !== state.initialCameraToken;
      state.zoomBeforePinch = Number(state.canvas.getAttribute(
        'data-realm-camera-current-zoom'
      ));
      return {
        primary: {
          x: Math.round(pair.primary.x * 100) / 100,
          y: Math.round(pair.primary.y * 100) / 100,
        },
        secondary: {
          x: Math.round(pair.secondary.x * 100) / 100,
          y: Math.round(pair.secondary.y * 100) / 100,
        },
      };
    })()`,
    'Rendered mobile pinch target evaluation failed.'
  ), 'Invalid rendered mobile pinch targets.');
  if (!exactKeys(pinchTargets, ['primary', 'secondary'])) {
    throw new TypeError('Invalid rendered mobile pinch targets.');
  }
  const primary = pointerTarget(pinchTargets.primary);
  const secondary = pointerTarget(pinchTargets.secondary);
  const distance = Math.hypot(
    secondary.x - primary.x,
    secondary.y - primary.y
  );
  if (distance < 96) throw new Error('Rendered mobile pinch baseline is too small.');
  const unitX = (secondary.x - primary.x) / distance;
  const unitY = (secondary.y - primary.y) / distance;
  const expandedPrimary = {
    x: primary.x - unitX * 26,
    y: primary.y - unitY * 26,
  };
  const expandedSecondary = {
    x: secondary.x + unitX * 26,
    y: secondary.y + unitY * 26,
  };

  await dispatchTouchGesture(
    session,
    [touchPoint(71, primary), touchPoint(72, secondary)],
    [0.25, 0.5, 0.75, 1].map((fraction) => [
      touchPoint(71, between(primary, expandedPrimary, fraction)),
      touchPoint(72, between(secondary, expandedSecondary, fraction)),
    ])
  );
  await waitForCameraSettled(session);
  const expandedPinchState = exactRecord(await evaluateObject(
    session,
    `(() => {
      const state = globalThis.__warpkeepRenderedMobileTouch;
      const currentZoom = Number(state?.canvas?.getAttribute(
        'data-realm-camera-current-zoom'
      ));
      const changed = !!state
        && Number.isFinite(currentZoom)
        && Number.isFinite(state.zoomBeforePinch)
        && Math.abs(currentZoom - state.zoomBeforePinch) >= 0.000001;
      if (state) state.expandedPinchChanged = changed;
      return { changed };
    })()`,
    'Rendered mobile pinch result evaluation failed.'
  ));
  if (!exactKeys(expandedPinchState, ['changed'])
    || typeof expandedPinchState.changed !== 'boolean') {
    throw new TypeError('Invalid rendered mobile pinch result.');
  }
  if (!expandedPinchState.changed) {
    // The initial camera may already sit at a zoom limit. Exercise the
    // opposite two-pointer direction before concluding the gesture has no effect.
    await dispatchTouchGesture(
      session,
      [touchPoint(73, expandedPrimary), touchPoint(74, expandedSecondary)],
      [0.25, 0.5, 0.75, 1].map((fraction) => [
        touchPoint(73, between(expandedPrimary, primary, fraction)),
        touchPoint(74, between(expandedSecondary, secondary, fraction)),
      ])
    );
    await waitForCameraSettled(session);
    const reversePinchState = exactRecord(await evaluateObject(
      session,
      `(() => {
        const state = globalThis.__warpkeepRenderedMobileTouch;
        const currentZoom = Number(state?.canvas?.getAttribute(
          'data-realm-camera-current-zoom'
        ));
        const changed = !!state
          && Number.isFinite(currentZoom)
          && Number.isFinite(state.zoomBeforePinch)
          && Math.abs(currentZoom - state.zoomBeforePinch) >= 0.000001;
        if (state) state.reversePinchChanged = changed;
        return { changed };
      })()`,
      'Rendered mobile reverse pinch result evaluation failed.'
    ));
    if (!exactKeys(reversePinchState, ['changed'])
      || typeof reversePinchState.changed !== 'boolean') {
      throw new TypeError('Invalid rendered mobile reverse pinch result.');
    }
  }

  const tapTarget = pointerTarget(await evaluateObject(
    session,
    `(() => {
      const state = globalThis.__warpkeepRenderedMobileTouch;
      if (!state) return null;
      const zoomAfterPinch = Number(state.canvas.getAttribute(
        'data-realm-camera-current-zoom'
      ));
      state.reversePinchChanged = !state.expandedPinchChanged
        && Number.isFinite(zoomAfterPinch)
        && Number.isFinite(state.zoomBeforePinch)
        && Math.abs(zoomAfterPinch - state.zoomBeforePinch) >= 0.000001;
      state.pinchActivationSuppressed = state.fixtureActivationCount === 0;
      const controls = [...document.querySelectorAll(
        '[data-rendered-mobile-touch-fixture="true"]'
      )].filter((control) => {
        const style = getComputedStyle(control);
        const bounds = control.getBoundingClientRect();
        const x = bounds.left + bounds.width * 0.5;
        const y = bounds.top + bounds.height * 0.5;
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width >= 32
          && bounds.height >= 32
          && x >= 32
          && x <= innerWidth - 32
          && y >= 48
          && y <= innerHeight - 48
          && control.contains(document.elementFromPoint(x, y));
      });
      const primaryControl = controls[0];
      if (!(primaryControl instanceof HTMLElement)) return null;
      state.tapControlKind = primaryControl.matches(
        '.realm-worker-presence-marker'
      ) ? 'worker' : 'resource';
      const bounds = primaryControl.getBoundingClientRect();
      return {
        x: Math.round((bounds.left + bounds.width * 0.5) * 100) / 100,
        y: Math.round((bounds.top + bounds.height * 0.5) * 100) / 100,
      };
    })()`,
    'Rendered mobile tap target evaluation failed.'
  ));
  await dispatchTouchGesture(session, [touchPoint(81, tapTarget)]);
  const tapActivation = exactRecord(await evaluateObject(
    session,
    `(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const state = globalThis.__warpkeepRenderedMobileTouch;
      if (!state) return null;
      return {
        activationCount: Number.isSafeInteger(state?.fixtureActivationCount)
          ? state.fixtureActivationCount
          : -1,
        trustedActivationCount: Number.isSafeInteger(
          state?.trustedFixtureActivationCount
        ) ? state.trustedFixtureActivationCount : -1,
      };
    })()`,
    'Rendered mobile tap activation failed.'
  ));
  if (!exactKeys(tapActivation, [
    'activationCount',
    'trustedActivationCount',
  ])
    || !Number.isSafeInteger(tapActivation.activationCount)
    || tapActivation.activationCount !== 1
    || tapActivation.trustedActivationCount !== 1) {
    throw new TypeError(
      `Invalid rendered mobile tap activation (${JSON.stringify(tapActivation)}).`
    );
  }

  const evidence = await evaluateObject(
    session,
    `(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const state = globalThis.__warpkeepRenderedMobileTouch;
      const failed = {
        inputClean: false,
        nonCastleControlExercised: false,
        panMoved: false,
        pinchZoomed: false,
        rendererStable: false,
        selectionTapped: false,
        touchEnvironmentReady: false,
        viewportExact: false,
        worldControlActivationSuppressed: false,
        worldControlsOwnTouch: false,
      };
      if (!state) return failed;
      const currentZoom = Number(state.canvas.getAttribute(
        'data-realm-camera-current-zoom'
      ));
      const result = {
        inputClean:
          state.canvas.getAttribute('data-dragging') !== 'true'
          && !state.root.hasAttribute('data-camera-interacting'),
        nonCastleControlExercised:
          ['resource', 'worker'].includes(state.panControlKind)
          && state.pinchControlKind === 'canvas'
          && ['resource', 'worker'].includes(state.tapControlKind),
        panMoved: state.panMoved === true,
        pinchZoomed: Number.isFinite(currentZoom)
          && Number.isFinite(state.zoomBeforePinch)
          && Math.abs(currentZoom - state.zoomBeforePinch) >= 0.000001
          && state.pinchPhaseObserved === true
          && state.pinchMoveCount >= 1,
        rendererStable:
          state.root.getAttribute('data-renderer-state') === 'ready'
          && state.root.getAttribute('data-renderer-failure') === 'none'
          && state.root.getAttribute('data-renderer-generation')
            === state.initialRendererGeneration
          && state.root.getAttribute('data-realm-scene-creation-count')
            === state.initialSceneCreationCount,
        selectionTapped:
          state.tapControlKind === 'resource'
          && state.fixtureActivationCount === 1
          && state.trustedFixtureActivationCount === 1,
        touchEnvironmentReady:
          navigator.maxTouchPoints >= 2
          && 'ontouchstart' in window
          && state.touchPointerDownCount >= 4
          && state.touchPointerMoveCount >= 2
          && state.touchPointerUpCount >= 4
          && state.trustedTouchStartCount >= 3
          && state.trustedTouchMoveCount >= 2
          && state.trustedTouchEndCount >= 3
          && state.untrustedInputCount === 0,
        viewportExact:
          innerWidth === ${viewport.width}
          && innerHeight === ${viewport.height}
          && Math.abs(devicePixelRatio - ${
            probeCase.deviceScaleFactor
          }) <= 0.001,
        worldControlActivationSuppressed:
          state.panActivationSuppressed === true
          && state.pinchActivationSuppressed === true,
        worldControlsOwnTouch: state.worldControlsOwnTouch === true,
      };
      if (!result.pinchZoomed) {
        result.pinchDiagnostics = {
          expandedPinchChanged: state.expandedPinchChanged === true,
          pinchMoveCount: state.pinchMoveCount,
          pinchPhaseObserved: state.pinchPhaseObserved === true,
          reversePinchChanged: state.reversePinchChanged === true,
          touchPointerDownCount: state.touchPointerDownCount,
          touchPointerMoveCount: state.touchPointerMoveCount,
          touchPointerUpCount: state.touchPointerUpCount,
          trustedTouchStartCount: state.trustedTouchStartCount,
          trustedTouchMoveCount: state.trustedTouchMoveCount,
          trustedTouchEndCount: state.trustedTouchEndCount,
          untrustedInputCount: state.untrustedInputCount,
          maxTouchPoints: navigator.maxTouchPoints,
          touchApiPresent: 'ontouchstart' in window,
          documentHasFocus: document.hasFocus(),
          documentVisible: document.visibilityState === 'visible',
          viewportExact: innerWidth === ${viewport.width}
            && innerHeight === ${viewport.height}
            && Math.abs(devicePixelRatio - ${
              probeCase.deviceScaleFactor
            }) <= 0.001,
        };
      }
      for (const eventType of ['pointerdown', 'pointermove', 'pointerup']) {
        window.removeEventListener(
          eventType,
          state.pointerObserver,
          true
        );
      }
      for (const eventType of ['touchstart', 'touchmove', 'touchend']) {
        window.removeEventListener(eventType, state.touchObserver, true);
      }
      state.fixtureControl.remove();
      delete globalThis.__warpkeepRenderedMobileTouch;
      return result;
    })()`,
    'Rendered mobile gesture evidence evaluation failed.'
  );
  if (
    evidence?.pinchZoomed === false
    && evidence?.pinchDiagnostics
    && typeof evidence.pinchDiagnostics === 'object'
  ) throw new Error(
    `Rendered mobile pinch did not change camera zoom (${JSON.stringify(
      evidence.pinchDiagnostics
    )}).`
  );
  return parseRenderedMobileMapGestureEvidence(evidence);
}
