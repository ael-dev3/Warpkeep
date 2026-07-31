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
  ) throw new Error(message);
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

async function dispatchTouchSequence(session, points) {
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points,
  });
}

/**
 * Exercises real CDP touch input under mobile device emulation. All identity
 * and camera coordinates remain page-local; only aggregate booleans cross the
 * synthetic QA boundary.
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
        left: '58%',
        opacity: '1',
        pointerEvents: 'auto',
        top: '48%',
        transform: 'none',
        visibility: 'visible',
        zIndex: '99',
      });
      fixtureControl.addEventListener('click', () => {
        const state = globalThis.__warpkeepRenderedMobileTouch;
        if (state) state.fixtureActivationCount += 1;
      });
      fixtureHost.append(fixtureControl);
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
      const bounds = primaryControl.getBoundingClientRect();
      const primaryControlKind = primaryControl.matches(
        '.realm-worker-presence-marker'
      ) ? 'worker' : 'resource';
      globalThis.__warpkeepRenderedMobileTouch = {
        canvas,
        fixtureActivationCount: 0,
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
        root,
        worldControlsOwnTouch:
          getComputedStyle(canvas).touchAction === 'none'
          && visibleWorldControls.length >= 1
          && visibleWorldControls.every((control) => (
            getComputedStyle(control).touchAction === 'none'
          )),
      };
      return {
        x: Math.round((bounds.left + bounds.width * 0.5) * 100) / 100,
        y: Math.round((bounds.top + bounds.height * 0.5) * 100) / 100,
      };
    })()`,
    'Rendered mobile pan target evaluation failed.'
  ));

  await dispatchTouchSequence(session, [touchPoint(61, panStart)]);
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [touchPoint(61, {
      x: panStart.x + 34,
      y: panStart.y + 14,
    })],
  });
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await waitForCameraSettled(session);

  const pinchTargets = exactRecord(await evaluateObject(
    session,
    `(() => {
      const state = globalThis.__warpkeepRenderedMobileTouch;
      if (!state) return null;
      state.panActivationSuppressed = state.fixtureActivationCount === 0;
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
      const bounds = primaryControl.getBoundingClientRect();
      const primary = {
        x: bounds.left + bounds.width * 0.5,
        y: bounds.top + bounds.height * 0.5,
      };
      state.pinchControlKind = primaryControl.matches(
        '.realm-worker-presence-marker'
      ) ? 'worker' : 'resource';
      const canvasBounds = state.canvas.getBoundingClientRect();
      const candidates = [
        [0.78, 0.32],
        [0.22, 0.68],
        [0.78, 0.68],
        [0.22, 0.32],
        [0.5, 0.72],
      ].map(([x, y]) => ({
        x: canvasBounds.left + canvasBounds.width * x,
        y: canvasBounds.top + canvasBounds.height * y,
      }));
      const secondary = candidates.find((point) => (
        document.elementFromPoint(point.x, point.y) === state.canvas
        && Math.hypot(point.x - primary.x, point.y - primary.y) >= 96
      ));
      if (!secondary) return null;
      state.panMoved = state.canvas.getAttribute(
        'data-realm-camera-state-token'
      ) !== state.initialCameraToken;
      state.zoomBeforePinch = Number(state.canvas.getAttribute(
        'data-realm-camera-current-zoom'
      ));
      return {
        primary: {
          x: Math.round(primary.x * 100) / 100,
          y: Math.round(primary.y * 100) / 100,
        },
        secondary: {
          x: Math.round(secondary.x * 100) / 100,
          y: Math.round(secondary.y * 100) / 100,
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

  await dispatchTouchSequence(session, [
    touchPoint(71, primary),
    touchPoint(72, secondary),
  ]);
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      touchPoint(71, expandedPrimary),
      touchPoint(72, expandedSecondary),
    ],
  });
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await waitForCameraSettled(session);

  const tapTarget = pointerTarget(await evaluateObject(
    session,
    `(() => {
      const state = globalThis.__warpkeepRenderedMobileTouch;
      if (!state) return null;
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
  await dispatchTouchSequence(session, [touchPoint(81, tapTarget)]);
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

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
          && ['resource', 'worker'].includes(state.pinchControlKind)
          && ['resource', 'worker'].includes(state.tapControlKind),
        panMoved: state.panMoved === true,
        pinchZoomed: Number.isFinite(currentZoom)
          && Number.isFinite(state.zoomBeforePinch)
          && Math.abs(currentZoom - state.zoomBeforePinch) >= 0.000001,
        rendererStable:
          state.root.getAttribute('data-renderer-state') === 'ready'
          && state.root.getAttribute('data-renderer-failure') === 'none'
          && state.root.getAttribute('data-renderer-generation')
            === state.initialRendererGeneration
          && state.root.getAttribute('data-realm-scene-creation-count')
            === state.initialSceneCreationCount,
        selectionTapped:
          state.tapControlKind === 'resource'
          && state.fixtureActivationCount === 1,
        touchEnvironmentReady:
          navigator.maxTouchPoints >= 2
          && 'ontouchstart' in window,
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
      state.fixtureControl.remove();
      delete globalThis.__warpkeepRenderedMobileTouch;
      return result;
    })()`,
    'Rendered mobile gesture evidence evaluation failed.'
  );
  return parseRenderedMobileMapGestureEvidence(evidence);
}
