import { chmod, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DevtoolsPipeSession,
  analyzeRenderedWebglPngScreenshot,
  attestStableHeadlessChromeExecutable,
  cleanupRenderedWebglProbeResources,
  controlledRendererRecoveryWarningKind,
  createLoopbackViteServer,
  exactChromeExecutableIdentity,
  readReviewedChromeExecutableIdentity,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe,
  terminateHeadlessChromeProcessGroup,
} from './rendered-webgl-browser-probe.mjs';
import { localFullstackBootstrapVitePlugin } from './local-fullstack-bootstrap-vite-plugin.mjs';
import {
  LOCAL_FULLSTACK_PROFILE_URL,
  LocalFullstackRuntimeError,
  startDisposableLocalFullstackSpacetime,
} from './local-fullstack-spacetime.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const FULLSTACK_ROUTE = '/dev/fullstack-local-qa.html';
const PERSISTENT_WORKER_REENTRY_SEARCH =
  '?persistent-worker-reentry=delayed-private-v1';
const WORKER_PRIVATE_SEAM_MATRIX_SEARCH =
  '?worker-private-seams=continuity-matrix-v1';
const RESTORED_CURRENT_AGREEMENT_SEARCH =
  '?entry-agreement-continuity=restored-current-v1';
const RELEASE_PRIVATE_WORKER_READS_EVENT =
  'warpkeep-local-release-private-worker-reads';
const SET_PRIVATE_WORKER_SEAM_EVENT =
  'warpkeep-local-set-private-worker-seam';
const RELEASE_PRIVATE_WORKER_SEAM_EVENT =
  'warpkeep-local-release-private-worker-seam';
const RESTORE_TIMEOUT_VISIBILITY_EVENT =
  'warpkeep-local-restore-timeout-visibility';
const REFRESH_ACCESS_EVENT = 'warpkeep-local-refresh-access';
const VIEWPORT = Object.freeze({ width: 1_440, height: 900 });

export function safeBrowserRuntimeExceptionCode(exceptionDetails) {
  if (!exceptionDetails || typeof exceptionDetails !== 'object') return '';
  const description = typeof exceptionDetails.exception?.description === 'string'
    ? exceptionDetails.exception.description
    : typeof exceptionDetails.text === 'string'
      ? exceptionDetails.text
      : '';
  const reference = /\bReferenceError: ([A-Za-z_$][A-Za-z0-9_$]{0,63}) is not defined\b/
    .exec(description);
  if (reference) return `reference-${reference[1]}`;
  const invalidRead = /\bTypeError: Cannot read properties of (?:undefined|null) \(reading '([A-Za-z_$][A-Za-z0-9_$]{0,63})'\)/
    .exec(description);
  if (invalidRead) return `invalid-read-${invalidRead[1]}`;
  return 'runtime-exception';
}

const TITLE_GATEWAY_CASES = Object.freeze([
  Object.freeze({
    id: 'desktop-keyboard',
    input: 'keyboard',
    mobile: false,
    reducedMotion: false,
    deviceScaleFactor: 1,
    viewport: VIEWPORT,
  }),
  Object.freeze({
    id: 'desktop-pointer',
    input: 'pointer',
    mobile: false,
    reducedMotion: false,
    deviceScaleFactor: 1,
    viewport: VIEWPORT,
  }),
  Object.freeze({
    id: 'mobile-portrait-touch',
    input: 'touch',
    mobile: true,
    reducedMotion: false,
    deviceScaleFactor: 3,
    viewport: Object.freeze({ width: 390, height: 844 }),
  }),
  Object.freeze({
    id: 'tablet-pointer',
    input: 'pointer',
    mobile: false,
    reducedMotion: false,
    deviceScaleFactor: 1.5,
    viewport: Object.freeze({ width: 1_024, height: 768 }),
  }),
  Object.freeze({
    id: 'short-landscape-touch',
    input: 'touch',
    mobile: true,
    reducedMotion: false,
    deviceScaleFactor: 2,
    viewport: Object.freeze({ width: 667, height: 375 }),
  }),
  Object.freeze({
    id: 'desktop-offset-scaled-keyboard',
    input: 'keyboard',
    mobile: false,
    reducedMotion: false,
    deviceScaleFactor: 1.25,
    titleTransform: Object.freeze({
      translateX: 96,
      translateY: 54,
      scale: 0.82,
    }),
    viewport: VIEWPORT,
  }),
  Object.freeze({
    id: 'desktop-offset-scaled-pointer',
    input: 'pointer',
    mobile: false,
    reducedMotion: false,
    activationFraction: Object.freeze({ x: 0.72, y: 0.34 }),
    deviceScaleFactor: 2,
    titleTransform: Object.freeze({
      translateX: 72,
      translateY: 42,
      scale: 0.86,
    }),
    viewport: VIEWPORT,
  }),
  Object.freeze({
    id: 'desktop-reduced-keyboard',
    input: 'keyboard',
    mobile: false,
    reducedMotion: true,
    deviceScaleFactor: 1,
    viewport: VIEWPORT,
  }),
  Object.freeze({
    id: 'desktop-resize-pointer',
    input: 'pointer',
    mobile: false,
    reducedMotion: false,
    deviceScaleFactor: 1,
    resizeViewport: Object.freeze({ width: 1_024, height: 768 }),
    viewport: VIEWPORT,
  }),
]);
const COMMAND_TIMEOUT_MILLISECONDS = 125_000;
const PRESENTATION_TIMEOUT_MILLISECONDS = 120_000;
const SCREENSHOT_MAXIMUM_BYTES = 8 * 1_024 * 1_024;
const TITLE_GATEWAY_CASE_TIMEOUT_MILLISECONDS = 30_000;
const TITLE_GATEWAY_FRAME_LIMIT = 360;
const CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS = 256;

export class LocalFullstackBrowserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocalFullstackBrowserError';
  }
}

function exactLoopbackOrigin(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:'
      && parsed.hostname === '127.0.0.1'
      && parsed.port !== ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.username === ''
      && parsed.password === ''
      ? parsed.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export function isAllowedLocalFullstackBrowserUrl(
  value,
  viteOrigin,
  spacetimeOrigin,
) {
  if (typeof value !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === 'data:') return true;
  if (parsed.protocol === 'blob:') {
    return parsed.origin === viteOrigin || parsed.origin === spacetimeOrigin;
  }
  if (value === LOCAL_FULLSTACK_PROFILE_URL) return true;
  const comparableOrigin = parsed.protocol === 'ws:'
    ? `http://${parsed.host}`
    : parsed.origin;
  const allowedOrigin = [viteOrigin, spacetimeOrigin].includes(comparableOrigin);
  return allowedOrigin
    && parsed.hostname === '127.0.0.1'
    && parsed.username === ''
    && parsed.password === ''
    && ['http:', 'ws:'].includes(parsed.protocol);
}

function exactNavigationUrl(value, expectedUrl) {
  if (value === 'about:blank' || value === expectedUrl) return true;
  try {
    const actual = new URL(value);
    const expected = new URL(expectedUrl);
    return actual.origin === expected.origin
      && actual.pathname === expected.pathname
      && (
        actual.search === expected.search
        || actual.search === PERSISTENT_WORKER_REENTRY_SEARCH
        || actual.search === WORKER_PRIVATE_SEAM_MATRIX_SEARCH
        || actual.search === RESTORED_CURRENT_AGREEMENT_SEARCH
      )
      && actual.username === ''
      && actual.password === ''
      && ['', '#menu', '#realm'].includes(actual.hash);
  } catch {
    return false;
  }
}

function navigationViolationCategory(value, expectedUrl) {
  if (typeof value !== 'string') return 'navigation-invalid';
  if (value.startsWith('chrome-error://')) return 'navigation-chrome-error';
  try {
    const actual = new URL(value);
    const expected = new URL(expectedUrl);
    return actual.origin === expected.origin
      ? 'navigation-unexpected-local'
      : 'navigation-external';
  } catch {
    return 'navigation-invalid';
  }
}

async function captureCredibleScreenshot(session) {
  const result = await session.command('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  });
  if (
    typeof result?.data !== 'string'
    || result.data.length < 64
    || result.data.length > Math.ceil(SCREENSHOT_MAXIMUM_BYTES * 4 / 3) + 8
  ) throw new Error('Disposable full-stack screenshot failed.');
  const bytes = Buffer.from(result.data, 'base64');
  try {
    return analyzeRenderedWebglPngScreenshot(bytes, VIEWPORT);
  } finally {
    bytes.fill(0);
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function validateTitleGatewayDepartureFocusObservation(value, probeCase) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.stage !== 'complete'
    || !Array.isArray(value.frames)
    || value.frames.length < (probeCase.reducedMotion ? 4 : 12)
    || value.frames.length > TITLE_GATEWAY_FRAME_LIMIT
    || value.initialHistoryLength + 1 !== value.finalHistoryLength
    || value.finalHash !== '#menu'
    || !Number.isFinite(value.activationTarget?.x)
    || !Number.isFinite(value.activationTarget?.y)
    || !Number.isFinite(value.gatewayCenter?.x)
    || !Number.isFinite(value.gatewayCenter?.y)
    || value.finalPhase !== 'menu'
    || value.finalSequence !== value.initialSequence + 1
    || value.finalMenuInteractive !== true
    || value.finalGatewayPresent !== false
  ) {
    const safeLifecycleTuple = [
      value?.stage === 'complete',
      Array.isArray(value?.frames),
      Array.isArray(value?.frames)
        && value.frames.length >= (probeCase.reducedMotion ? 4 : 12),
      Array.isArray(value?.frames)
        && value.frames.length <= TITLE_GATEWAY_FRAME_LIMIT,
      value?.initialHistoryLength + 1 === value?.finalHistoryLength,
      value?.finalHash === '#menu',
      Number.isFinite(value?.activationTarget?.x)
        && Number.isFinite(value?.activationTarget?.y),
      Number.isFinite(value?.gatewayCenter?.x)
        && Number.isFinite(value?.gatewayCenter?.y),
      value?.finalPhase === 'menu',
      value?.finalSequence === value?.initialSequence + 1,
      value?.finalMenuInteractive === true,
      value?.finalGatewayPresent === false,
    ].map((entry) => entry ? '1' : '0').join('');
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: lifecycle-${safeLifecycleTuple}.`
    );
  }

  const phases = [];
  for (const frame of value.frames) {
    if (
      frame === null
      || typeof frame !== 'object'
      || Array.isArray(frame)
      || !Number.isFinite(frame.time)
      || !Number.isSafeInteger(frame.sequence)
      || !Number.isSafeInteger(frame.viewportWidth)
      || !Number.isSafeInteger(frame.viewportHeight)
      || !Number.isFinite(frame.devicePixelRatio)
      || frame.devicePixelRatio <= 0
    ) {
      throw new LocalFullstackBrowserError(
        `Title gateway departure focus failed at ${probeCase.id}: frame-shape.`
      );
    }
    if (phases.at(-1) !== frame.phase) phases.push(frame.phase);
  }
  if (
    phases.length !== 3
    || phases[0] !== 'title'
    || phases[1] !== 'transitioning-to-menu'
    || phases[2] !== 'menu'
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: phase-sequence.`
    );
  }

  const titleFrames = value.frames.filter((frame) => frame.phase === 'title');
  const departureFrames = value.frames.filter(
    (frame) => frame.phase === 'transitioning-to-menu'
  );
  const retainedGatewayFrames = departureFrames.filter(
    (frame) => frame.gatewayPresent
  );
  const menuFrames = value.frames.filter((frame) => frame.phase === 'menu');
  const expectedMotion = probeCase.reducedMotion ? 'reduced' : 'standard';
  if (
    titleFrames.length < 1
    || departureFrames.length < (probeCase.reducedMotion ? 1 : 6)
    || retainedGatewayFrames.length < 1
    || menuFrames.length < 2
    || !titleFrames.some((frame) => (
      frame.gatewayInteractive === 'true'
      && frame.gatewayVisible === 'true'
      && frame.anchorHidden === false
      && frame.anchorInert === false
      && frame.anchorDisplay !== 'none'
      && frame.buttonDisabled === false
      && frame.buttonTabIndex === 0
      && frame.hitGateway === true
    ))
    || departureFrames.some((frame) => (
      frame.sequence !== value.initialSequence + 1
      || frame.overlayCount !== 1
      || frame.overlayMotion !== expectedMotion
      || !Number.isFinite(frame.overlayOriginX)
      || !Number.isFinite(frame.overlayOriginY)
      || !Number.isFinite(frame.overlayOriginPercentX)
      || !Number.isFinite(frame.overlayOriginPercentY)
    ))
    || menuFrames.some((frame) => frame.sequence !== value.initialSequence + 1)
    || value.frames.some((frame) => (
      Math.abs(frame.devicePixelRatio - probeCase.deviceScaleFactor) > 0.01
    ))
    || value.frames.some((frame) => frame.overflow)
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: frame-lifecycle.`
    );
  }

  const originTolerance = probeCase.mobile ? 3 : 2;
  const frozenOrigin = departureFrames[0];
  // The client-space gateway point remains frozen. Its normalized CSS
  // percentage must be allowed to change when a mid-transition resize changes
  // the overlay dimensions so the same client point can be reprojected.
  if (
    !frozenOrigin
    || Math.abs(frozenOrigin.overlayOriginX - value.gatewayCenter.x) > originTolerance
    || Math.abs(frozenOrigin.overlayOriginY - value.gatewayCenter.y) > originTolerance
    || departureFrames.some((frame) => (
      Math.abs(frame.overlayOriginX - frozenOrigin.overlayOriginX) > 0.01
      || Math.abs(frame.overlayOriginY - frozenOrigin.overlayOriginY) > 0.01
    ))
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: frozen-gateway-origin.`
    );
  }
  if (
    probeCase.activationFraction
    && Math.hypot(
      value.activationTarget.x - value.gatewayCenter.x,
      value.activationTarget.y - value.gatewayCenter.y
    ) <= originTolerance * 2
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: pointer-origin-separation.`
    );
  }

  const frozenTransforms = new Set(
    retainedGatewayFrames.map((frame) => frame.anchorTransform)
  );
  if (
    frozenTransforms.size !== 1
    || frozenTransforms.has('')
    || retainedGatewayFrames.some((frame) => (
      frame.titlePhase !== 'departing'
      || frame.gatewayInteractive !== 'false'
      || frame.gatewayVisible !== 'false'
      || frame.gatewayPointerEvents !== 'none'
      || frame.anchorHidden !== true
      || frame.anchorInert !== true
      || frame.anchorAriaHidden !== 'true'
      || frame.anchorVisible !== 'false'
      || frame.anchorDisplay !== 'none'
      || frame.anchorWidth !== 0
      || frame.anchorHeight !== 0
      || frame.buttonDisabled !== true
      || frame.buttonTabIndex !== -1
      || frame.buttonPointerEvents !== 'none'
      || frame.buttonFocusVisible !== false
      || frame.activeTarget === 'gateway'
      || frame.hitGateway !== false
      || frame.titleScreenAriaHidden !== 'true'
      || frame.titleScreenInert !== true
    ))
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: retired-gateway.`
    );
  }

  if (probeCase.input === 'keyboard') {
    if (
      departureFrames.some((frame) => (
        frame.activeTarget !== 'departure-landmark'
        || frame.landmarkActive !== 'true'
        || frame.landmarkAriaHidden !== 'false'
        || frame.landmarkAriaLive !== 'polite'
        || frame.landmarkRole !== 'status'
      ))
      || value.finalActiveTarget !== 'menu-command'
    ) {
      throw new LocalFullstackBrowserError(
        `Title gateway departure focus failed at ${probeCase.id}: keyboard-focus.`
      );
    }
  } else if (
    departureFrames.some((frame) => frame.activeTarget === 'gateway')
    || value.finalActiveTarget === 'gateway'
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: pointer-focus.`
    );
  }

  const expectedViewport = probeCase.resizeViewport ?? probeCase.viewport;
  const finalFrame = value.frames.at(-1);
  if (
    finalFrame.viewportWidth !== expectedViewport.width
    || finalFrame.viewportHeight !== expectedViewport.height
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: viewport.`
    );
  }
  if (probeCase.resizeViewport) {
    const observedInitialViewport = value.frames.some((frame) => (
      frame.viewportWidth === probeCase.viewport.width
      && frame.viewportHeight === probeCase.viewport.height
    ));
    const observedResizedDeparture = departureFrames.some((frame) => (
      frame.viewportWidth === probeCase.resizeViewport.width
      && frame.viewportHeight === probeCase.resizeViewport.height
    ));
    if (!observedInitialViewport || !observedResizedDeparture) {
      throw new LocalFullstackBrowserError(
        `Title gateway departure focus failed at ${probeCase.id}: departure-resize.`
      );
    }
  }

  return Object.freeze({
    frameCount: value.frames.length,
    id: probeCase.id,
    input: probeCase.input,
    reducedMotion: probeCase.reducedMotion,
    resized: probeCase.resizeViewport !== undefined,
  });
}

async function setTitleGatewayCaseEnvironment(session, probeCase) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: probeCase.viewport.width,
    height: probeCase.viewport.height,
    screenWidth: probeCase.viewport.width,
    screenHeight: probeCase.viewport.height,
    deviceScaleFactor: probeCase.deviceScaleFactor,
    mobile: probeCase.mobile,
  });
  await session.command('Emulation.setTouchEmulationEnabled', {
    enabled: probeCase.input === 'touch',
    ...(probeCase.input === 'touch' ? { maxTouchPoints: 1 } : {}),
  });
  await session.command('Emulation.setEmulatedMedia', {
    features: [{
      name: 'prefers-reduced-motion',
      value: probeCase.reducedMotion ? 'reduce' : 'no-preference',
    }],
  });
}

async function prepareTitleGatewayDepartureFocusCase(session, probeCase) {
  const titleTransform = JSON.stringify(probeCase.titleTransform ?? null);
  const activationFraction = probeCase.activationFraction
    ?? Object.freeze({ x: 0.5, y: 0.5 });
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const titleTransform = ${titleTransform};
      const deadline = performance.now() + ${TITLE_GATEWAY_CASE_TIMEOUT_MILLISECONDS};
      const waitFor = async (predicate) => {
        while (performance.now() <= deadline) {
          try {
            const value = predicate();
            if (value) return value;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return undefined;
      };
      const target = await waitFor(() => {
        const experience = document.querySelector('.warpkeep-experience');
        const title = document.querySelector('.warpkeep-title-screen');
        const gateway = document.querySelector('.warpkeep-gateway');
        const anchor = document.querySelector('.warpkeep-gateway-anchor');
        const button = document.querySelector('.warpkeep-gateway-button');
        if (
          !(experience instanceof HTMLElement)
          || !(title instanceof HTMLElement)
          || !(gateway instanceof HTMLElement)
          || !(anchor instanceof HTMLElement)
          || !(button instanceof HTMLButtonElement)
          || experience.dataset.phase !== 'title'
          || title.dataset.titlePhase !== 'active'
          || gateway.dataset.interactive !== 'true'
          || gateway.dataset.visible !== 'true'
          || anchor.hidden
          || anchor.inert
          || getComputedStyle(anchor).display === 'none'
          || button.disabled
          || button.tabIndex !== 0
        ) return undefined;
        if (titleTransform) {
          title.style.transformOrigin = '0 0';
          title.style.transform =
            'translate(' + titleTransform.translateX + 'px, '
            + titleTransform.translateY + 'px) scale(' + titleTransform.scale + ')';
        }
        const bounds = button.getBoundingClientRect();
        const x = bounds.left + bounds.width * ${activationFraction.x};
        const y = bounds.top + bounds.height * ${activationFraction.y};
        const hit = document.elementFromPoint(x, y);
        return (
          bounds.width > 0
          && bounds.height > 0
          && x >= 0
          && x <= innerWidth
          && y >= 0
          && y <= innerHeight
          && hit instanceof Element
          && (hit === button || button.contains(hit))
        ) ? {
          button,
          centerX: bounds.left + bounds.width * 0.5,
          centerY: bounds.top + bounds.height * 0.5,
          x,
          y
        } : undefined;
      });
      if (!target) return { stage: 'gateway-ready' };

      const initialExperience = document.querySelector('.warpkeep-experience');
      const initialSequence = Number(
        initialExperience?.getAttribute('data-transition-sequence')
      );
      if (!Number.isSafeInteger(initialSequence)) {
        return { stage: 'initial-sequence' };
      }
      const state = {
        done: false,
        frames: [],
        gatewayCenter: {
          x: target.centerX,
          y: target.centerY
        },
        initialHistoryLength: history.length,
        initialSequence,
        menuFrames: 0,
        target: { x: target.x, y: target.y }
      };
      Object.defineProperty(window, '__warpkeepTitleGatewayDepartureFocus', {
        configurable: true,
        value: state
      });
      const activeTarget = (gatewayButton, landmark) => {
        const active = document.activeElement;
        if (active === gatewayButton) return 'gateway';
        if (active === landmark) return 'departure-landmark';
        if (
          active instanceof HTMLButtonElement
          && active.matches('button[data-command]')
        ) return 'menu-command';
        if (active === document.body) return 'body';
        return active instanceof HTMLElement
          ? active.tagName.toLowerCase()
          : 'none';
      };
      const sampleFrame = (time) => {
        if (state.done) return;
        const experience = document.querySelector('.warpkeep-experience');
        const titleScreen = document.querySelector(
          '.warpkeep-experience__screen--title'
        );
        const title = document.querySelector('.warpkeep-title-screen');
        const gateway = document.querySelector('.warpkeep-gateway');
        const anchor = document.querySelector('.warpkeep-gateway-anchor');
        const button = document.querySelector('.warpkeep-gateway-button');
        const landmark = document.querySelector(
          '.warpkeep-experience__title-departure-focus'
        );
        const overlay = document.querySelector('.warp-transition-overlay');
        const overlayStyle = overlay instanceof HTMLElement
          ? getComputedStyle(overlay)
          : undefined;
        const anchorBounds = anchor instanceof HTMLElement
          ? anchor.getBoundingClientRect()
          : undefined;
        const hit = document.elementFromPoint(state.target.x, state.target.y);
        const hitGateway = hit instanceof Element && (
          hit.matches('.warpkeep-gateway-button')
          || hit.closest('.warpkeep-gateway-button') !== null
        );
        const phase = experience?.getAttribute('data-phase') ?? 'missing';
        const viewportWidth = innerWidth;
        const viewportHeight = innerHeight;
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body?.scrollWidth ?? 0
        );
        const documentHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0
        );
        state.frames.push({
          time,
          phase,
          sequence: Number(
            experience?.getAttribute('data-transition-sequence')
          ),
          viewportWidth,
          viewportHeight,
          devicePixelRatio,
          overflow:
            documentWidth > viewportWidth + 1
            || documentHeight > viewportHeight + 1,
          titlePhase: title?.getAttribute('data-title-phase') ?? '',
          titleScreenAriaHidden:
            titleScreen?.getAttribute('aria-hidden') ?? '',
          titleScreenInert:
            titleScreen instanceof HTMLElement ? titleScreen.inert : false,
          gatewayPresent: gateway instanceof HTMLElement,
          gatewayInteractive:
            gateway?.getAttribute('data-interactive') ?? '',
          gatewayVisible: gateway?.getAttribute('data-visible') ?? '',
          gatewayPointerEvents:
            gateway instanceof HTMLElement
              ? getComputedStyle(gateway).pointerEvents
              : '',
          anchorHidden:
            anchor instanceof HTMLElement ? anchor.hidden : false,
          anchorInert:
            anchor instanceof HTMLElement ? anchor.inert : false,
          anchorAriaHidden: anchor?.getAttribute('aria-hidden') ?? '',
          anchorVisible: anchor?.getAttribute('data-visible') ?? '',
          anchorDisplay:
            anchor instanceof HTMLElement ? getComputedStyle(anchor).display : '',
          anchorTransform:
            anchor instanceof HTMLElement ? anchor.style.transform : '',
          anchorWidth: anchorBounds?.width ?? 0,
          anchorHeight: anchorBounds?.height ?? 0,
          buttonDisabled:
            button instanceof HTMLButtonElement ? button.disabled : true,
          buttonTabIndex:
            button instanceof HTMLButtonElement ? button.tabIndex : -1,
          buttonPointerEvents:
            button instanceof HTMLElement
              ? getComputedStyle(button).pointerEvents
              : '',
          buttonFocusVisible:
            button instanceof HTMLElement && button.matches(':focus-visible'),
          activeTarget: activeTarget(button, landmark),
          hitGateway,
          landmarkActive: landmark?.getAttribute('data-active') ?? '',
          landmarkAriaHidden: landmark?.getAttribute('aria-hidden') ?? '',
          landmarkAriaLive: landmark?.getAttribute('aria-live') ?? '',
          landmarkRole: landmark?.getAttribute('role') ?? '',
          overlayCount: document.querySelectorAll(
            '.warp-transition-overlay'
          ).length,
          overlayMotion: overlay?.getAttribute('data-motion') ?? '',
          overlayOriginX: Number.parseFloat(
            overlay?.getAttribute('data-gateway-client-x') ?? ''
          ),
          overlayOriginY: Number.parseFloat(
            overlay?.getAttribute('data-gateway-client-y') ?? ''
          ),
          overlayOriginPercentX: Number.parseFloat(
            overlayStyle?.getPropertyValue('--warp-origin-x') ?? ''
          ),
          overlayOriginPercentY: Number.parseFloat(
            overlayStyle?.getPropertyValue('--warp-origin-y') ?? ''
          )
        });
        if (phase === 'menu') state.menuFrames += 1;
        if (
          state.menuFrames >= 4
          || state.frames.length >= ${TITLE_GATEWAY_FRAME_LIMIT}
        ) {
          state.done = true;
          return;
        }
        requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
      await new Promise((resolve) => requestAnimationFrame(
        () => requestAnimationFrame(resolve)
      ));
      const bounds = target.button.getBoundingClientRect();
      const x = bounds.left + bounds.width * ${activationFraction.x};
      const y = bounds.top + bounds.height * ${activationFraction.y};
      state.target = { x, y };
      state.gatewayCenter = {
        x: bounds.left + bounds.width * 0.5,
        y: bounds.top + bounds.height * 0.5
      };
      return {
        stage: 'ready',
        x,
        y
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, TITLE_GATEWAY_CASE_TIMEOUT_MILLISECONDS);
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.stage !== 'ready'
    || !Number.isFinite(value.x)
    || !Number.isFinite(value.y)
  ) {
    const safeStage = typeof value?.stage === 'string'
      && /^[a-z0-9-]{1,64}$/.test(value.stage)
      ? value.stage
      : 'unknown';
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: ${safeStage}.`
    );
  }
  return Object.freeze({ x: value.x, y: value.y });
}

async function focusTitleGatewayForKeyboard(session, probeCase) {
  await session.command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await session.command('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  const result = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const button = document.querySelector('.warpkeep-gateway-button');
      return {
        focused: button instanceof HTMLButtonElement
          && document.activeElement === button,
        focusVisible: button instanceof HTMLButtonElement
          && button.matches(':focus-visible')
      };
    })()`,
    returnByValue: true,
  });
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value?.focused !== true
    || value?.focusVisible !== true
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: keyboard-ready.`
    );
  }
}

async function dispatchTitleGatewayActivation(session, probeCase, target) {
  if (probeCase.input === 'keyboard') {
    for (let repetition = 0; repetition < 2; repetition += 1) {
      await session.command('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        text: '\r',
        unmodifiedText: '\r',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
      await session.command('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    }
    return;
  }
  if (probeCase.input === 'touch') {
    for (let repetition = 0; repetition < 2; repetition += 1) {
      await session.command('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: target.x, y: target.y }],
      });
      await session.command('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    }
    return;
  }
  await session.command('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: target.x,
    y: target.y,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });
  for (let repetition = 0; repetition < 2; repetition += 1) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: target.x,
      y: target.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'mouse',
    });
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: target.x,
      y: target.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'mouse',
    });
  }
}

async function attestTitleGatewayActivationStarted(session, probeCase) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const deadline = performance.now() + 1_500;
      while (performance.now() <= deadline) {
        const experience = document.querySelector('.warpkeep-experience');
        const phase = experience?.getAttribute('data-phase') ?? '';
        const sequence = Number(
          experience?.getAttribute('data-transition-sequence')
        );
        if (phase === 'transitioning-to-menu') {
          return { phase, sequence };
        }
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      const experience = document.querySelector('.warpkeep-experience');
      return {
        phase: experience?.getAttribute('data-phase') ?? '',
        sequence: Number(
          experience?.getAttribute('data-transition-sequence')
        )
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, 2_000);
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value?.phase !== 'transitioning-to-menu'
    || value?.sequence !== 1
  ) {
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: activation-start.`
    );
  }
}

async function collectTitleGatewayDepartureFocusCase(session, probeCase) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const state = window.__warpkeepTitleGatewayDepartureFocus;
      if (!state || !Array.isArray(state.frames)) {
        return { stage: 'missing-sampler' };
      }
      const deadline = performance.now() + ${TITLE_GATEWAY_CASE_TIMEOUT_MILLISECONDS};
      while (!state.done && performance.now() <= deadline) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      const experience = document.querySelector('.warpkeep-experience');
      const menuScreen = document.querySelector(
        '.warpkeep-experience__screen--menu'
      );
      const menuCommand = document.querySelector('button[data-command]');
      const gateway = document.querySelector('.warpkeep-gateway');
      const active = document.activeElement;
      return {
        stage: state.done ? 'complete' : 'frame-timeout',
        frames: state.frames,
        initialHistoryLength: state.initialHistoryLength,
        initialSequence: state.initialSequence,
        finalHistoryLength: history.length,
        finalHash: location.hash,
        activationTarget: state.target,
        gatewayCenter: state.gatewayCenter,
        finalPhase: experience?.getAttribute('data-phase') ?? '',
        finalSequence: Number(
          experience?.getAttribute('data-transition-sequence')
        ),
        finalMenuInteractive:
          menuScreen instanceof HTMLElement
          && menuScreen.getAttribute('aria-hidden') === 'false'
          && !menuScreen.inert
          && menuCommand instanceof HTMLButtonElement
          && !menuCommand.disabled
          && menuCommand.tabIndex === 0,
        finalActiveTarget:
          active instanceof HTMLButtonElement
          && active.matches('button[data-command]')
            ? 'menu-command'
            : active instanceof HTMLElement
              && active.matches('.warpkeep-gateway-button')
                ? 'gateway'
                : active instanceof HTMLElement
                  ? active.tagName.toLowerCase()
                  : 'none',
        finalGatewayPresent: gateway instanceof HTMLElement
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, TITLE_GATEWAY_CASE_TIMEOUT_MILLISECONDS);
  if (result?.exceptionDetails || result?.result?.type !== 'object') {
    const rawDetail = result?.exceptionDetails?.exception?.description
      ?? result?.exceptionDetails?.text
      ?? result?.result?.type
      ?? 'unknown';
    const safeDetail = String(rawDetail)
      .split('\n', 1)[0]
      .replace(/[^A-Za-z0-9 .:_()-]/g, '')
      .slice(0, 120) || 'unknown';
    throw new LocalFullstackBrowserError(
      `Title gateway departure focus failed at ${probeCase.id}: collection-${safeDetail}.`
    );
  }
  return validateTitleGatewayDepartureFocusObservation(
    result.result.value,
    probeCase
  );
}

async function exerciseTitleGatewayDepartureFocus(
  session,
  titleUrl,
  assertBrowserBoundary
) {
  const observations = [];
  for (const probeCase of TITLE_GATEWAY_CASES) {
    let stage = 'environment';
    try {
      await setTitleGatewayCaseEnvironment(session, probeCase);
      stage = 'navigation';
      await session.command('Page.navigate', { url: titleUrl });
      await delay(500);
      stage = 'preparation';
      const target = await prepareTitleGatewayDepartureFocusCase(session, probeCase);
      if (probeCase.input === 'keyboard') {
        stage = 'keyboard-focus';
        await focusTitleGatewayForKeyboard(session, probeCase);
      }
      stage = 'activation';
      await dispatchTitleGatewayActivation(session, probeCase, target);
      await attestTitleGatewayActivationStarted(session, probeCase);
      if (probeCase.resizeViewport) {
        stage = 'departure-resize';
        await delay(96);
        await session.command('Emulation.setDeviceMetricsOverride', {
          width: probeCase.resizeViewport.width,
          height: probeCase.resizeViewport.height,
          screenWidth: probeCase.resizeViewport.width,
          screenHeight: probeCase.resizeViewport.height,
          deviceScaleFactor: probeCase.deviceScaleFactor,
          mobile: probeCase.mobile,
        });
      }
      stage = 'collection';
      observations.push(
        await collectTitleGatewayDepartureFocusCase(session, probeCase)
      );
      assertBrowserBoundary?.(probeCase.id);
    } catch (error) {
      if (error instanceof LocalFullstackBrowserError) throw error;
      const safeDetail = error instanceof Error
        ? error.message
          .replace(/[^A-Za-z0-9 .:_()-]/g, '')
          .slice(0, 120)
        : '';
      throw new LocalFullstackBrowserError(
        `Title gateway departure focus failed at ${probeCase.id}: ${stage}${
          safeDetail ? `-${safeDetail}` : ''
        }.`
      );
    }
  }
  await setTitleGatewayCaseEnvironment(session, TITLE_GATEWAY_CASES[0]);
  return Object.freeze({
    caseCount: observations.length,
    frameCount: observations.reduce(
      (total, observation) => total + observation.frameCount,
      0
    ),
    observations: Object.freeze(observations),
  });
}

async function exerciseRestoredEntryAgreementContinuity(session) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const deadline = performance.now() + ${PRESENTATION_TIMEOUT_MILLISECONDS};
      const waitFor = async (predicate) => {
        while (performance.now() <= deadline) {
          try {
            const value = predicate();
            if (value) return value;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return undefined;
      };
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
      const count = (attribute) => {
        const value = document.documentElement.getAttribute(attribute) ?? '0';
        return /^(?:0|[1-9]\\d{0,9})$/.test(value) ? Number(value) : -1;
      };
      const observation = {
        checkboxInsertions: 0,
        qrInsertions: 0,
        termsDialogInsertions: 0
      };
      const inspect = (candidate) => {
        if (!(candidate instanceof Element)) return;
        const elements = [candidate, ...candidate.querySelectorAll('*')];
        for (const element of elements) {
          if (
            element.matches('[role="dialog"][aria-modal="true"]')
            && /ALPHA PARTICIPATION TERMS/i.test(element.textContent ?? '')
          ) observation.termsDialogInsertions += 1;
          if (element.matches('input[type="checkbox"]')) {
            observation.checkboxInsertions += 1;
          }
          if (element.matches('.farcaster-auth-panel__qr-frame')) {
            observation.qrInsertions += 1;
          }
        }
      };
      inspect(document.documentElement);
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;
          for (const node of mutation.addedNodes) inspect(node);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      try {
        const enterMenu = await waitFor(() => {
          const candidate = document.querySelector(
            'button[data-command="enter-realm"]'
          );
          return candidate instanceof HTMLButtonElement
            && !candidate.disabled
            && candidate.closest('[inert]') === null
            && visible(candidate)
            ? candidate
            : undefined;
        });
        if (!(enterMenu instanceof HTMLButtonElement)) {
          return { stage: 'restored-current-menu' };
        }
        enterMenu.click();
        const probe = await waitFor(() => {
          const candidate = document.querySelector(
            '[data-local-fullstack-backend]'
          );
          return (
            candidate?.getAttribute('data-local-fullstack-auth') === 'authenticated'
            && candidate.getAttribute('data-local-fullstack-backend') === 'ready'
            && candidate.getAttribute(
              'data-local-fullstack-entry-agreement-satisfied'
            ) === 'true'
          ) ? candidate : undefined;
        });
        if (!(probe instanceof HTMLOutputElement)) {
          const candidate = document.querySelector(
            '[data-local-fullstack-backend]'
          );
          return {
            stage: 'restored-current-authority',
            authPhase: candidate?.getAttribute(
              'data-local-fullstack-auth'
            ) ?? 'missing',
            backendPhase: candidate?.getAttribute(
              'data-local-fullstack-backend'
            ) ?? 'missing',
            agreementSatisfied: candidate?.getAttribute(
              'data-local-fullstack-entry-agreement-satisfied'
            ) ?? 'missing',
            refreshCount: count('data-local-fullstack-access-refresh-count'),
            entryAgreementReadCount: count(
              'data-local-fullstack-entry-agreement-read-count'
            )
          };
        }
        const realm = await waitFor(() => {
          const candidate = document.querySelector(
            'main[aria-label="Hegemony realm"]'
          );
          return candidate instanceof HTMLElement
            && visible(candidate)
            && candidate.getAttribute('data-renderer-state') === 'ready'
            ? candidate
            : undefined;
        });
        if (!(realm instanceof HTMLElement)) {
          return { stage: 'restored-current-realm' };
        }
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const html = document.documentElement.innerHTML;
        return {
          stage: 'restored-current-complete',
          acceptedCurrent: probe.getAttribute(
            'data-local-fullstack-entry-agreement-satisfied'
          ) === 'true',
          refreshCount: count('data-local-fullstack-access-refresh-count'),
          authBeginCount: count('data-local-fullstack-auth-begin-count'),
          qrEncodeCount: count('data-local-fullstack-qr-encode-count'),
          entryAgreementReadCount: count(
            'data-local-fullstack-entry-agreement-read-count'
          ),
          entryAgreementAcceptCount: count(
            'data-local-fullstack-entry-agreement-accept-count'
          ),
          termsDialogInsertions: observation.termsDialogInsertions,
          checkboxInsertions: observation.checkboxInsertions,
          qrInsertions: observation.qrInsertions,
          termsDialogAbsent: !document.querySelector(
            '[role="dialog"][aria-modal="true"]'
          ),
          checkboxAbsent: !document.querySelector('input[type="checkbox"]'),
          qrAbsent: !document.querySelector('.farcaster-auth-panel__qr-frame'),
          tokenAbsent: !/(?:LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF|LOCAL_QA_SYNTHETIC_MESSAGE|eyJ[A-Za-z0-9_-]{20,}\\.)/.test(html),
          storageEmpty: localStorage.length === 0 && sessionStorage.length === 0
        };
      } finally {
        observer.disconnect();
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, COMMAND_TIMEOUT_MILLISECONDS);
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.stage !== 'restored-current-complete'
    || value.acceptedCurrent !== true
    || value.refreshCount !== 1
    || value.authBeginCount !== 0
    || value.qrEncodeCount !== 0
    || value.entryAgreementReadCount !== 1
    || value.entryAgreementAcceptCount !== 0
    || value.termsDialogInsertions !== 0
    || value.checkboxInsertions !== 0
    || value.qrInsertions !== 0
    || value.termsDialogAbsent !== true
    || value.checkboxAbsent !== true
    || value.qrAbsent !== true
    || value.tokenAbsent !== true
    || value.storageEmpty !== true
  ) {
    const safeStage = typeof value?.stage === 'string'
      && /^[a-z0-9-]{1,64}$/.test(value.stage)
      ? value.stage
      : 'unknown';
    const safeAuthorityState = safeStage === 'restored-current-authority'
      ? ` (${[
          value?.authPhase,
          value?.backendPhase,
          value?.agreementSatisfied
        ].map((entry) => (
          typeof entry === 'string' && /^[a-z-]{1,32}$/.test(entry)
            ? entry
            : 'invalid'
        )).join('/')}/${[
          value?.refreshCount,
          value?.entryAgreementReadCount
        ].map((entry) => (
          Number.isSafeInteger(entry) && entry >= 0 && entry <= 10
            ? String(entry)
            : 'invalid'
        )).join('/')})`
      : '';
    throw new LocalFullstackBrowserError(
      `Disposable restored Terms continuity failed at ${safeStage}${
        safeAuthorityState
      }.`
    );
  }
  return Object.freeze({ ...value });
}

async function exerciseLocalFullstackJourney(session, journeyMode = 'complete') {
  if (!['complete', 'persistent-worker-reentry'].includes(journeyMode)) {
    throw new LocalFullstackBrowserError('Disposable journey mode was invalid.');
  }
  const preparePersistentWorkerReentry = journeyMode === 'persistent-worker-reentry';
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const deadline = performance.now() + ${PRESENTATION_TIMEOUT_MILLISECONDS};
      const waitFor = async (
        predicate,
        timeoutMilliseconds = ${PRESENTATION_TIMEOUT_MILLISECONDS}
      ) => {
        const predicateDeadline = Math.min(
          deadline,
          performance.now() + timeoutMilliseconds
        );
        while (performance.now() <= predicateDeadline) {
          try {
            const value = predicate();
            if (value) return value;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return undefined;
      };
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
      const buttonWithText = (text, root = document) => [...root.querySelectorAll('button')]
        .find((button) => visible(button) && (button.textContent ?? '').trim() === text);

      const enterMenu = await waitFor(() => {
        const candidate = document.querySelector(
          'button[data-command="enter-realm"]'
        );
        return candidate instanceof HTMLButtonElement
          && !candidate.disabled
          && candidate.closest('[inert]') === null
          && visible(candidate)
          ? candidate
          : undefined;
      });
      if (!(enterMenu instanceof HTMLButtonElement)) return { stage: 'menu' };
      enterMenu.click();

      const dialog = await waitFor(() => document.querySelector(
        '[role="dialog"][aria-modal="true"]'
      ));
      if (!(dialog instanceof HTMLElement)) return { stage: 'terms-dialog' };
      const checkbox = dialog.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement) || checkbox.checked) {
        return { stage: 'terms-checkbox' };
      }
      checkbox.click();
      const continueButton = [...dialog.querySelectorAll('button')].find((button) => (
        /^CONTINUE TO /.test((button.textContent ?? '').trim())
      ));
      if (!(continueButton instanceof HTMLButtonElement) || continueButton.disabled) {
        return { stage: 'terms-continue' };
      }
      continueButton.click();

      const readyProbe = await waitFor(() => {
        const probe = document.querySelector('[data-local-fullstack-backend]');
        const authPhase = probe?.getAttribute('data-local-fullstack-auth');
        const backendPhase = probe?.getAttribute('data-local-fullstack-backend');
        return (
          (authPhase === 'authenticated'
            && backendPhase === 'ready'
            && probe?.getAttribute('data-local-fullstack-workers') === '4'
            && probe?.getAttribute('data-local-fullstack-public-castles') === '7'
            && probe?.getAttribute('data-local-fullstack-public-workers') === '28'
            && probe?.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
            && probe?.getAttribute('data-local-fullstack-worker-commands') === 'true')
          || ['error', 'expired'].includes(authPhase ?? '')
          || backendPhase === 'error'
        ) ? probe : undefined;
      });
      if (
        !(readyProbe instanceof HTMLOutputElement)
        || readyProbe.getAttribute('data-local-fullstack-auth') !== 'authenticated'
        || readyProbe.getAttribute('data-local-fullstack-backend') !== 'ready'
        || readyProbe.getAttribute('data-local-fullstack-workers') !== '4'
        || readyProbe.getAttribute('data-local-fullstack-public-castles') !== '7'
        || readyProbe.getAttribute('data-local-fullstack-public-workers') !== '28'
        || readyProbe.getAttribute('data-local-fullstack-worker-private-sync') !== 'ready'
        || readyProbe.getAttribute('data-local-fullstack-worker-commands') !== 'true'
      ) {
        const probe = readyProbe ?? document.querySelector('[data-local-fullstack-auth]');
        return {
          stage: 'authority-ready',
          authPhase: probe?.getAttribute('data-local-fullstack-auth') ?? 'missing',
          backendPhase: probe?.getAttribute('data-local-fullstack-backend') ?? 'missing',
          workerCount: probe?.getAttribute('data-local-fullstack-workers') ?? 'missing',
          publicCastleCount:
            probe?.getAttribute('data-local-fullstack-public-castles') ?? 'missing',
          publicWorkerCount:
            probe?.getAttribute('data-local-fullstack-public-workers') ?? 'missing',
          workerPrivateSync:
            probe?.getAttribute('data-local-fullstack-worker-private-sync') ?? 'missing',
          workerCommands:
            probe?.getAttribute('data-local-fullstack-worker-commands') ?? 'missing'
        };
      }
      const initialDispatchSiteProjection = readyProbe.getAttribute(
        'data-local-fullstack-dispatch-sites'
      );
      const exactTargetSiteProjection = readyProbe.getAttribute(
        'data-local-fullstack-target-sites'
      );
      const exactDispatchTargetManifest = Object.freeze({
        gold: Object.freeze({ siteNumber: 2, playerLabel: 'Gold Mine 2' }),
        food: Object.freeze({ siteNumber: 2, playerLabel: 'Wheat Farm 2' }),
        wood: Object.freeze({ siteNumber: 12, playerLabel: 'Logging Camp 12' }),
        stone: Object.freeze({ siteNumber: 2, playerLabel: 'Stone Quarry 2' })
      });
      const fixtureDispatchSites = exactTargetSiteProjection?.split(';').flatMap(
        (entry) => {
          const match = /^(gold|food|wood|stone):(-?\\d+),(-?\\d+)$/.exec(entry);
          const target = match ? exactDispatchTargetManifest[match[1]] : undefined;
          return match && target
            ? [{
                resourceKind: match[1],
                q: match[2],
                r: match[3],
                siteNumber: target.siteNumber,
                playerLabel: target.playerLabel
              }]
            : [];
        }
      ) ?? [];
      if (
        fixtureDispatchSites.length !== 4
        || fixtureDispatchSites.map((site) => site.resourceKind).join(',')
          !== 'gold,food,wood,stone'
      ) return { stage: 'worker-dispatch-sites' };
      const enterAuthenticated = await waitFor(() => buttonWithText('ENTER REALM'));
      if (!(enterAuthenticated instanceof HTMLButtonElement)) {
        return { stage: 'authenticated-enter' };
      }
      enterAuthenticated.click();

      const realm = await waitFor(() => {
        const candidate = document.querySelector('main[aria-label="Hegemony realm"]');
        const map = document.querySelector('.realm-map-screen');
        return visible(candidate)
          && map?.getAttribute('data-renderer') === 'webgl'
          && map?.getAttribute('data-renderer-state') === 'ready'
          ? candidate
          : undefined;
      });
      if (!(realm instanceof HTMLElement)) return { stage: 'realm-ready' };
      const exactLifecycleCount = (name) => {
        const value = realm.getAttribute(name);
        return value !== null && /^(?:0|[1-9]\\d{0,9})$/.test(value)
          ? Number(value)
          : undefined;
      };
      const readSceneLifecycle = () => {
        if (document.querySelector('main.realm-map-screen') !== realm) return undefined;
        const generation = exactLifecycleCount('data-renderer-generation');
        const creationCount = exactLifecycleCount('data-realm-scene-creation-count');
        const disposalCount = exactLifecycleCount('data-realm-scene-disposal-count');
        const reason = realm.getAttribute('data-realm-last-scene-recreation-reason');
        if (
          generation === undefined
          || creationCount === undefined
          || disposalCount === undefined
          || realm.getAttribute('data-realm-first-ready') !== 'true'
          || realm.getAttribute('data-realm-blocking-loading-overlay-visible') !== 'false'
          || ![
            'initial-entry',
            'graphics-quality-change',
            'reduced-motion-material-change',
            'canonical-topology-change',
            'renderer-recovery',
            'explicit-retry'
          ].includes(reason ?? '')
        ) return undefined;
        return { generation, creationCount, disposalCount, reason };
      };
      const initialLifecycle = readSceneLifecycle();
      if (
        initialLifecycle === undefined
        || initialLifecycle.creationCount !== 1
        || initialLifecycle.disposalCount !== 0
        || initialLifecycle.reason !== 'initial-entry'
      ) {
        return {
          stage: 'scene-telemetry-ready',
          sceneGeneration: initialLifecycle?.generation ?? -1,
          sceneCreationCount: initialLifecycle?.creationCount ?? -1,
          sceneDisposalCount: initialLifecycle?.disposalCount ?? -1,
          sceneReason: initialLifecycle?.reason ?? 'invalid'
        };
      }
      const readDynamicPresentation = () => {
        const canvas = realm.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        if (!(canvas instanceof HTMLCanvasElement)) return undefined;
        const count = (name) => {
          const value = canvas.getAttribute(name);
          return value !== null && /^(?:0|[1-9]\\d{0,9})$/.test(value)
            ? Number(value)
            : undefined;
        };
        const dynamicReconciliations = count('data-realm-dynamic-reconciliation-count');
        const rejectedReconciliations = count('data-realm-dynamic-reconciliation-rejected');
        const workerReconciliations = count(
          'data-realm-worker-layer-reconciliation-count'
        );
        const routeReconciliations = count(
          'data-realm-route-layer-reconciliation-count'
        );
        const workerPresentedCount = count('data-realm-worker-presented-count');
        const workerAnimatedCount = count('data-realm-worker-animated-count');
        const workerPresenceCount = count('data-realm-worker-presence-count');
        const visibleRouteCount = count('data-realm-worker-visible-route-count');
        const routeMismatchCount = count('data-realm-worker-route-mismatch-count');
        const rejectedRouteCount = count('data-realm-worker-rejected-route-count');
        if ([
          dynamicReconciliations,
          rejectedReconciliations,
          workerReconciliations,
          routeReconciliations,
          workerPresentedCount,
          workerAnimatedCount,
          workerPresenceCount,
          visibleRouteCount,
          routeMismatchCount,
          rejectedRouteCount
        ].some((value) => value === undefined)) return undefined;
        return {
          dynamicReconciliations,
          rejectedReconciliations,
          workerReconciliations,
          routeReconciliations,
          workerPresentedCount,
          workerAnimatedCount,
          workerPresenceCount,
          visibleRouteCount,
          routeMismatchCount,
          rejectedRouteCount
        };
      };
      const realmPresentationIs = (expected) => {
        const activeCanvas = realm.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        return activeCanvas instanceof HTMLCanvasElement
          && activeCanvas.getAttribute('data-realm-presentation-active') === expected;
      };
      const initialDynamicPresentation = readDynamicPresentation();
      if (initialDynamicPresentation === undefined) {
        return { stage: 'dynamic-telemetry-ready' };
      }

      const lifecycleObservation = {
        blockingOverlayFrames: 0,
        blockingOverlayInsertions: 0,
        blockingOverlayVisibleTransitions: 0
      };
      const resourceRailObservation = {
        invalidSamples: 0,
        numericSamples: 0,
        observedValues: new Set()
      };
      let resourceRailObserver;
      const observedBlockingOverlays = new WeakSet();
      const isInitialLoadingOverlay = (element) => (
        element instanceof HTMLElement
        && element.matches('.realm-map-screen__loading')
        && /Surveying the bright lowlands|Preparing every canonical castle/i.test(
          element.textContent ?? ''
        )
      );
      const recordBlockingOverlay = (element) => {
        if (
          isInitialLoadingOverlay(element)
          && !observedBlockingOverlays.has(element)
        ) {
          observedBlockingOverlays.add(element);
          lifecycleObservation.blockingOverlayInsertions += 1;
        }
      };
      const lifecycleObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === 'attributes'
            && mutation.target === realm
            && realm.getAttribute('data-realm-blocking-loading-overlay-visible') === 'true'
            && isInitialLoadingOverlay(
              document.querySelector('.realm-map-screen__loading')
            )
          ) lifecycleObservation.blockingOverlayVisibleTransitions += 1;
          if (mutation.type !== 'childList') continue;
          const parentOverlay = mutation.target instanceof Element
            ? mutation.target.closest('.realm-map-screen__loading')
            : undefined;
          if (parentOverlay) recordBlockingOverlay(parentOverlay);
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            recordBlockingOverlay(node);
            for (const overlay of node.querySelectorAll('.realm-map-screen__loading')) {
              recordBlockingOverlay(overlay);
            }
          }
        }
      });
      lifecycleObserver.observe(document.documentElement, {
        attributeFilter: ['data-realm-blocking-loading-overlay-visible'],
        attributes: true,
        childList: true,
        subtree: true
      });
      let lifecycleAnimationFrame = 0;
      const sampleBlockingLoadingOverlay = () => {
        const overlay = document.querySelector('.realm-map-screen__loading');
        if (isInitialLoadingOverlay(overlay) && visible(overlay)) {
          lifecycleObservation.blockingOverlayFrames += 1;
        }
        lifecycleAnimationFrame = requestAnimationFrame(sampleBlockingLoadingOverlay);
      };
      lifecycleAnimationFrame = requestAnimationFrame(sampleBlockingLoadingOverlay);
      const settleLifecycleObservation = () => new Promise((resolve) => {
        setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 400);
      });
      const lifecycleRemainsStable = () => {
        const current = readSceneLifecycle();
        return current !== undefined
          && current.generation === initialLifecycle.generation
          && current.creationCount === initialLifecycle.creationCount
          && current.disposalCount === initialLifecycle.disposalCount
          && current.reason === initialLifecycle.reason
          && lifecycleObservation.blockingOverlayFrames === 0
          && lifecycleObservation.blockingOverlayInsertions === 0
          && lifecycleObservation.blockingOverlayVisibleTransitions === 0;
      };
      const stopLifecycleObservation = () => {
        lifecycleObserver.disconnect();
        resourceRailObserver?.disconnect();
        cancelAnimationFrame(lifecycleAnimationFrame);
      };
      try {
      let menuChurnCount = 0;
      let resourceInspectorChurnCount = 0;
      let workerInspectorChurnCount = 0;
      const dispatchedSiteKeys = [];
      const dispatchResourceKinds = [];
      const localStateCount = (name) => {
        const value = readyProbe.getAttribute(name);
        return value !== null && /^(?:0|[1-9]\\d?)$/.test(value)
          ? Number(value)
          : undefined;
      };
      const readWorkerContinuityEvidence = () => {
        const publicRevisions = readyProbe.getAttribute(
          'data-local-fullstack-public-assignment-revisions'
        ) ?? '';
        const privateRevisions = readyProbe.getAttribute(
          'data-local-fullstack-private-assignment-revisions'
        ) ?? '';
        const privateResourceRevision = readyProbe.getAttribute(
          'data-local-fullstack-private-resource-revision'
        ) ?? '';
        const routeEvidence = readyProbe.getAttribute(
          'data-local-fullstack-public-route-evidence'
        ) ?? '';
        const routes = routeEvidence.split(',').flatMap((entry) => {
          const match = /^(\\d):([a-z]+):(\\d+):(\\d+):(-?\\d+):(-?\\d+):(\\d+):(\\d+)$/
            .exec(entry);
          return match ? [{
            ordinal: Number(match[1]),
            status: match[2],
            timelineRevision: Number(match[3]),
            revision: match[4],
            worldX: Number(match[5]),
            worldZ: Number(match[6]),
            forwardProgress: Number(match[7]),
            phaseProgress: Number(match[8])
          }] : [];
        });
        return {
          publicRevisions,
          privateRevisions,
          privateResourceRevision,
          routeEvidence,
          routes
        };
      };
      const readPrivateResourceRail = () => {
        const raw = readyProbe.getAttribute(
          'data-local-fullstack-private-resource-rail'
        ) ?? '';
        const entries = raw.split(';').flatMap((entry) => {
          const match = /^(food|wood|stone|gold):(\\d+):(\\d+)$/.exec(entry);
          return match ? [{
            resource: match[1],
            available: BigInt(match[2]),
            pending: BigInt(match[3])
          }] : [];
        });
        return entries.length === 4 ? entries : undefined;
      };
      const closeResourceInspector = async () => {
        const inspector = document.querySelector([
          '.gold-mine-inspection',
          '.food-farm-inspection',
          '.logging-camp-inspection',
          '.stone-quarry-inspection'
        ].join(', '));
        if (!(inspector instanceof HTMLElement)) return true;
        const close = inspector.querySelector('button[aria-label^="CLOSE "]');
        if (!(close instanceof HTMLButtonElement)) return false;
        close.click();
        return Boolean(await waitFor(() => !document.querySelector([
          '.gold-mine-inspection',
          '.food-farm-inspection',
          '.logging-camp-inspection',
          '.stone-quarry-inspection'
        ].join(', '))));
      };
      const openRealmMenu = async () => {
        const trigger = realm.querySelector('.realm-profile-trigger');
        if (!(trigger instanceof HTMLButtonElement)) return undefined;
        const existing = document.querySelector('.realm-profile-menu__panel');
        if (existing instanceof HTMLElement) return existing;
        if (trigger.getAttribute('aria-expanded') === 'true') {
          trigger.click();
          const closed = await waitFor(() => (
            trigger.getAttribute('aria-expanded') === 'false'
          ));
          if (!closed) return undefined;
        }
        trigger.click();
        const menu = await waitFor(() => document.querySelector(
          '.realm-profile-menu__panel'
        ));
        if (menu instanceof HTMLElement) menuChurnCount += 1;
        return menu instanceof HTMLElement ? menu : undefined;
      };
      const menuAction = (menu, label) => [...menu.querySelectorAll('button')].find(
        (button) => (button.querySelector('strong')?.textContent ?? '').trim() === label
      );
      const workerFooterAction = (center, label) => [
        ...center.querySelectorAll('.worker-command-center__footer button')
      ].find((button) => (button.textContent ?? '').trim() === label);
      const openWorkers = async () => {
        const menu = await openRealmMenu();
        if (!(menu instanceof HTMLElement)) return undefined;
        const action = menuAction(menu, 'WORKERS');
        if (!(action instanceof HTMLButtonElement) || action.disabled) return undefined;
        action.click();
        const center = await waitFor(() => document.querySelector(
          '.worker-command-center'
        ));
        return center instanceof HTMLElement ? center : undefined;
      };
      const navigateToResourceSite = async (site) => {
        const menu = await openRealmMenu();
        if (!(menu instanceof HTMLElement)) return false;
        const explore = menuAction(menu, 'EXPLORE');
        if (!(explore instanceof HTMLButtonElement) || explore.disabled) return false;
        explore.click();
        const navigator = await waitFor(() => document.querySelector(
          '.realm-cell-navigator__dialog'
        ));
        if (
          !(navigator instanceof HTMLElement)
          || navigator.querySelector('.realm-cell-navigator__jump') !== null
        ) return false;
        const resourceSite = [...navigator.querySelectorAll(
          '.realm-cell-navigator__resource-site'
            + '[data-resource-kind][data-resource-state="available"]'
        )].find((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && button.getAttribute('data-resource-kind') === site.resourceKind
          && (button.querySelector('strong')?.textContent ?? '').trim()
            === site.playerLabel
          && (button.getAttribute('aria-label') ?? '')
            .startsWith('Inspect ' + site.playerLabel + ', tier ')
        ));
        if (!(resourceSite instanceof HTMLButtonElement)) return false;
        const bounds = resourceSite.getBoundingClientRect();
        if (bounds.width < 44 || bounds.height < 44) return false;
        const visibleCopy = [
          navigator.textContent ?? '',
          ...[...navigator.querySelectorAll('[aria-label]')].map((element) => (
            element.getAttribute('aria-label') ?? ''
          ))
        ].join('\\n');
        if (
          /(?:^|[\\s,(·])(?:q|r)\\s*-?\\d+\\b/iu.test(visibleCopy)
          || /\\b(?:gold:|food:|wood:|stone:)?genesis-\\d{3}-tier\\d+-(?:gold|food|wood|stone)-\\d+\\b/iu
            .test(visibleCopy)
        ) return false;
        resourceSite.click();
        return Boolean(await waitFor(() => (
          !document.querySelector('.realm-cell-navigator__dialog')
          && document.querySelector('.realm-node-worker-dispatch') instanceof HTMLElement
        )));
      };
      const dispatchWorker = async (
        ordinal,
        deployedCount,
        site,
        previousPresentation
      ) => {
        if (!await closeResourceInspector()) {
          return { error: 'worker-' + ordinal + '-inspector-close' };
        }
        if (!await navigateToResourceSite(site)) {
          return { error: 'worker-' + ordinal + '-map-navigation' };
        }
        const dispatch = await waitFor(() => document.querySelector(
          '.realm-node-worker-dispatch'
        ));
        if (!(dispatch instanceof HTMLElement)) {
          return { error: 'worker-' + ordinal + '-node-inspector' };
        }
        resourceInspectorChurnCount += 1;
        const resourceHeading = dispatch.querySelector('h3')?.textContent ?? '';
        const resourceKind = ['gold', 'food', 'wood', 'stone'].find((kind) => (
          new RegExp(kind, 'i').test(resourceHeading)
        ));
        if (resourceKind === undefined || resourceKind !== site.resourceKind) {
          return { error: 'worker-' + ordinal + '-resource-kind' };
        }
        const workerLabel = 'Worker ' + ordinal;
        const occupantWorkerLabel = 'Worker ' + String(ordinal).padStart(2, '0');
        const sendWorker = [...dispatch.querySelectorAll('button')].find((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && (button.getAttribute('aria-label') ?? '').startsWith(workerLabel + ' —')
        ));
        if (!(sendWorker instanceof HTMLButtonElement)) {
          return { error: 'worker-' + ordinal + '-dispatch-control' };
        }
        sendWorker.click();
        const deployed = await waitFor(() => (
          localStateCount('data-local-fullstack-deployed-workers') === deployedCount
          && localStateCount('data-local-fullstack-exact-dispatch-target-count')
            === deployedCount
            ? readyProbe
            : undefined
        ), 10_000);
        if (!(deployed instanceof HTMLOutputElement)) {
          return {
            error: 'worker-' + ordinal + '-dispatch-confirmation-'
              + String(
                localStateCount('data-local-fullstack-deployed-workers')
                ?? 'invalid'
              )
              + '-'
              + String(
                localStateCount(
                  'data-local-fullstack-exact-dispatch-target-count'
                ) ?? 'invalid'
              )
          };
        }
        const occupant = await waitFor(() => {
          const details = document.querySelector(
            '.realm-resource-occupant-details[data-resource-occupant-details="true"]'
          );
          return details instanceof HTMLElement
            && new RegExp(occupantWorkerLabel, 'i').test(details.textContent ?? '')
            ? details
            : undefined;
        }, 10_000);
        if (!(occupant instanceof HTMLElement)) {
          return { error: 'worker-' + ordinal + '-node-reconciliation' };
        }
        const presentation = await waitFor(() => {
          const current = readDynamicPresentation();
          return current
            && current.dynamicReconciliations
              > previousPresentation.dynamicReconciliations
            && current.workerReconciliations
              > previousPresentation.workerReconciliations
            && current.routeReconciliations
              > previousPresentation.routeReconciliations
            && current.workerPresentedCount === 28
            && current.workerAnimatedCount >= 1
            && current.visibleRouteCount >= 1
            && current.routeMismatchCount === 0
            && current.rejectedRouteCount === 0
            && current.rejectedReconciliations === 0
            ? current
            : undefined;
        }, 10_000);
        if (presentation === undefined) {
          return {
            error: 'worker-' + ordinal + '-world-reconciliation',
            presentation: readDynamicPresentation()
          };
        }
        await settleLifecycleObservation();
        if (!lifecycleRemainsStable()) {
          return { error: 'worker-' + ordinal + '-scene-lifecycle' };
        }
        if (!await closeResourceInspector()) {
          return { error: 'worker-' + ordinal + '-inspector-dismissal' };
        }
        return { site, resourceKind, presentation };
      };
      const simulateVisibilityCycle = async () => {
        const ownHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
        const ownVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
        let hidden = false;
        const restore = () => {
          if (ownHidden) Object.defineProperty(document, 'hidden', ownHidden);
          else delete document.hidden;
          if (ownVisibility) {
            Object.defineProperty(document, 'visibilityState', ownVisibility);
          } else delete document.visibilityState;
        };
        try {
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => hidden
          });
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => hidden ? 'hidden' : 'visible'
          });
          hidden = true;
          document.dispatchEvent(new Event('visibilitychange'));
          if (!document.hidden || document.visibilityState !== 'hidden') return false;
          await new Promise((resolve) => setTimeout(resolve, 96));
          hidden = false;
          document.dispatchEvent(new Event('visibilitychange'));
          if (document.hidden || document.visibilityState !== 'visible') return false;
          await new Promise((resolve) => requestAnimationFrame(() => (
            requestAnimationFrame(resolve)
          )));
          return true;
        } catch {
          return false;
        } finally {
          restore();
          document.dispatchEvent(new Event('visibilitychange'));
        }
      };

      const resourceRail = realm.querySelector('[aria-label="Your resources"]');
      const resourceControls = resourceRail?.querySelectorAll('button').length ?? 0;
      const sampleResourceRail = () => {
        const values = [...(resourceRail?.querySelectorAll(
          '.realm-resource-rail__trigger strong'
        ) ?? [])].slice(0, 4).map((element) => (
          (element.textContent ?? '').trim()
        ));
        if (
          values.length !== 4
          || values.some((value) => !/^\\d+(?:\\.\\d+)?(?:K|M|B|T)?$/.test(value))
        ) {
          resourceRailObservation.invalidSamples += 1;
          return;
        }
        resourceRailObservation.numericSamples += 1;
        resourceRailObservation.observedValues.add(values.join(','));
      };
      sampleResourceRail();
      if (resourceRail instanceof HTMLElement) {
        resourceRailObserver = new MutationObserver(sampleResourceRail);
        resourceRailObserver.observe(resourceRail, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true
        });
      }
      const pfpReady = await waitFor(() => (
        realm.querySelector('.realm-profile-trigger canvas[data-profile-image-state="ready"]')
      ));
      if (!(pfpReady instanceof HTMLCanvasElement)) return { stage: 'profile-image' };

      const realmMenu = await openRealmMenu();
      if (!(realmMenu instanceof HTMLElement)) return { stage: 'realm-menu' };
      const workersButton = menuAction(realmMenu, 'WORKERS');
      if (!(workersButton instanceof HTMLButtonElement) || workersButton.disabled) {
        return { stage: 'workers-button' };
      }
      workersButton.click();

      const commandCenter = await waitFor(() => document.querySelector(
        '.worker-command-center'
      ));
      const workerRows = commandCenter?.querySelectorAll(
        '.worker-command-center__roster > li'
      );
      if (!(commandCenter instanceof HTMLElement) || workerRows?.length !== 4) {
        return { stage: 'worker-roster' };
      }
      const firstWorker = commandCenter.querySelector(
        '.worker-command-center__worker'
      );
      if (!(firstWorker instanceof HTMLButtonElement)) return { stage: 'worker-select' };
      firstWorker.click();

      const workerPanel = await waitFor(() => document.querySelector('.worker-inspection'));
      if (!(workerPanel instanceof HTMLElement)) return { stage: 'worker-panel' };
      workerInspectorChurnCount += 1;
      if (${preparePersistentWorkerReentry}) {
        if (!/EN ROUTE|GATHERING|RETURNING/i.test(workerPanel.textContent ?? '')) {
          return { stage: 'worker-persisted-state-guidance' };
        }
      } else if (
        !/Select an available resource node in the Realm/i.test(
          workerPanel.textContent ?? ''
        )
      ) {
        return { stage: 'worker-map-guidance' };
      }
      const backToWorkers = workerPanel.querySelector('button[aria-label="Back to workers"]');
      if (!(backToWorkers instanceof HTMLButtonElement)) {
        return { stage: 'worker-panel-close' };
      }
      backToWorkers.click();
      const reopenedCommandCenter = await waitFor(() => document.querySelector(
        '.worker-command-center'
      ));
      const backToRealmMenu = reopenedCommandCenter?.querySelector(
        'button[aria-label="Back to Realm menu"]'
      );
      if (!(backToRealmMenu instanceof HTMLButtonElement)) {
        return { stage: 'worker-command-center-close' };
      }
      backToRealmMenu.click();

      const reopenedRealmMenu = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
      if (!(reopenedRealmMenu instanceof HTMLElement)) {
        return { stage: 'realm-menu-reopen' };
      }
      const settings = menuAction(reopenedRealmMenu, 'SETTINGS');
      if (!(settings instanceof HTMLButtonElement) || settings.disabled) {
        return { stage: 'settings-open' };
      }
      settings.click();
      const settingsPanel = await waitFor(() => document.querySelector(
        '.warpkeep-settings__panel'
      ));
      if (!(settingsPanel instanceof HTMLElement)) {
        return { stage: 'settings-panel' };
      }
      const settingsBack = buttonWithText('BACK TO REALM MENU', settingsPanel);
      if (!(settingsBack instanceof HTMLButtonElement)) {
        return { stage: 'settings-close' };
      }
      settingsBack.click();
      const menuAfterSettings = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
      const closeMenu = menuAfterSettings?.querySelector(
        'button[aria-label="Close Realm menu"]'
      );
      if (!(closeMenu instanceof HTMLButtonElement)) {
        return { stage: 'realm-menu-close' };
      }
      closeMenu.click();
      if (!await waitFor(() => (
        !document.querySelector('.realm-profile-menu__panel')
      ))) return { stage: 'realm-menu-close-confirmation' };

      let dispatchedDynamicPresentation = initialDynamicPresentation;
      if (${preparePersistentWorkerReentry}) {
        for (const site of fixtureDispatchSites) {
          dispatchedSiteKeys.push(
            site.resourceKind + ':' + site.q + ',' + site.r
          );
          dispatchResourceKinds.push(site.resourceKind);
        }
      } else {
        for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
          const dispatched = await dispatchWorker(
            ordinal,
            ordinal,
            fixtureDispatchSites[ordinal - 1],
            dispatchedDynamicPresentation
          );
          if ('error' in dispatched) {
            return {
              stage: dispatched.error,
              ...(dispatched.presentation ?? {})
            };
          }
          dispatchedSiteKeys.push(
            dispatched.site.resourceKind + ':' + dispatched.site.q + ',' + dispatched.site.r
          );
          dispatchResourceKinds.push(dispatched.resourceKind);
          dispatchedDynamicPresentation = dispatched.presentation;
        }
      }
      if (${preparePersistentWorkerReentry}) {
        const fourPhaseContinuity = await waitFor(() => {
          const evidence = readWorkerContinuityEvidence();
          const privateResources = readPrivateResourceRail();
          return (
            localStateCount('data-local-fullstack-deployed-workers') === 4
            && localStateCount('data-local-fullstack-recallable-workers') === 3
            && localStateCount(
              'data-local-fullstack-exact-dispatch-target-count'
            ) === 4
            && /^1:outbound:\\d+:\\d+,2:outbound:\\d+:\\d+,3:gathering:\\d+:\\d+,4:returning:\\d+:\\d+$/
              .test(evidence.publicRevisions)
            && /^1:outbound:\\d+,2:outbound:\\d+,3:gathering:\\d+,4:returning:\\d+$/
              .test(evidence.privateRevisions)
            && evidence.routes.length === 4
            && evidence.routes[0]?.status === 'outbound'
            && evidence.routes[1]?.status === 'outbound'
            && evidence.routes[2]?.status === 'gathering'
            && evidence.routes[2]?.forwardProgress === 10_000
            && evidence.routes[2]?.phaseProgress === 10_000
            && evidence.routes[3]?.status === 'returning'
            && /^\\d+$/.test(evidence.privateResourceRevision)
            && privateResources?.some((entry) => entry.available > 0n)
            && privateResources?.some((entry) => entry.pending > 0n)
          ) ? { ...evidence, privateResources } : undefined;
        }, 65_000);
        if (fourPhaseContinuity === undefined) {
          return { stage: 'persistent-worker-four-phase-arrival' };
        }
        await new Promise((resolve) => setTimeout(resolve, 1_250));
        window.dispatchEvent(new Event('online'));
        const pendingResourceRefresh = await waitFor(() => {
          const evidence = readWorkerContinuityEvidence();
          return (
            readyProbe.getAttribute(
              'data-local-fullstack-private-resource-has-pending'
            ) === 'true'
            && evidence.publicRevisions === fourPhaseContinuity.publicRevisions
            && evidence.privateRevisions === fourPhaseContinuity.privateRevisions
            && evidence.privateResourceRevision
              === fourPhaseContinuity.privateResourceRevision
          ) ? evidence : undefined;
        }, 10_000);
        if (pendingResourceRefresh === undefined) {
          return { stage: 'persistent-worker-pending-resource-refresh' };
        }
        // The read and settlement are separate server transactions. Advance
        // one copied-fixture quantum after observing pending yield so the
        // settlement timestamp cannot land on the same quantum boundary.
        await new Promise((resolve) => setTimeout(resolve, 1_250));
        const settlementAttemptBefore = Number(
          document.documentElement.getAttribute(
            'data-local-fullstack-resource-settlement-attempt'
          ) ?? '0'
        );
        if (
          !Number.isSafeInteger(settlementAttemptBefore)
          || settlementAttemptBefore < 0
        ) return { stage: 'persistent-worker-resource-settlement-baseline' };
        const visibilityCycleConfirmed = await simulateVisibilityCycle();
        if (!visibilityCycleConfirmed) {
          return { stage: 'persistent-worker-visibility-cycle' };
        }
        const settledResourceRevision = await waitFor(() => {
          const completedAttempt = Number(
            document.documentElement.getAttribute(
              'data-local-fullstack-resource-settlement-completed'
            ) ?? '0'
          );
          const revision = document.documentElement.getAttribute(
            'data-local-fullstack-resource-settlement-revision'
          ) ?? '';
          return (
            Number.isSafeInteger(completedAttempt)
            && completedAttempt > settlementAttemptBefore
            && document.documentElement.getAttribute(
              'data-local-fullstack-resource-settlement-state'
            ) === 'completed'
            && /^\\d+$/.test(revision)
            && BigInt(revision)
              > BigInt(pendingResourceRefresh.privateResourceRevision)
          ) ? revision : undefined;
        }, 20_000);
        if (settledResourceRevision === undefined) {
          return { stage: 'persistent-worker-resource-settlement' };
        }
        window.dispatchEvent(new Event('online'));
        const settledResourceRefresh = await waitFor(() => {
          const evidence = readWorkerContinuityEvidence();
          return (
            evidence.publicRevisions
              === pendingResourceRefresh.publicRevisions
            && evidence.privateRevisions
              === pendingResourceRefresh.privateRevisions
            && /^\\d+$/.test(evidence.privateResourceRevision)
            && BigInt(evidence.privateResourceRevision)
              >= BigInt(settledResourceRevision)
          ) ? evidence : undefined;
        }, 20_000);
        if (settledResourceRefresh === undefined) {
          return {
            stage: 'persistent-worker-resource-settlement-projection'
          };
        }

        const continuityBeforeProgress = await waitFor(() => {
          const evidence = readWorkerContinuityEvidence();
          return (
            localStateCount('data-local-fullstack-deployed-workers') === 4
            && localStateCount('data-local-fullstack-recallable-workers') === 3
            && /^1:outbound:\\d+:\\d+,2:outbound:\\d+:\\d+,3:gathering:\\d+:\\d+,4:returning:\\d+:\\d+$/
              .test(evidence.publicRevisions)
            && /^1:outbound:\\d+,2:outbound:\\d+,3:gathering:\\d+,4:returning:\\d+$/
              .test(evidence.privateRevisions)
            && evidence.routes.length === 4
            && evidence.routes[0]?.status === 'outbound'
            && evidence.routes[1]?.status === 'outbound'
            && evidence.routes[2]?.status === 'gathering'
            && evidence.routes[3]?.status === 'returning'
          ) ? evidence : undefined;
        }, 10_000);
        if (continuityBeforeProgress === undefined) {
          return { stage: 'persistent-worker-four-returning' };
        }
        await new Promise((resolve) => setTimeout(resolve, 640));
        const continuityAfterProgress = await waitFor(() => {
          const evidence = readWorkerContinuityEvidence();
          if (
            evidence.routes.length !== 4
            || evidence.publicRevisions !== continuityBeforeProgress.publicRevisions
            || evidence.privateRevisions !== continuityBeforeProgress.privateRevisions
          ) return undefined;
          const progressed = evidence.routes.every((route, index) => {
            const before = continuityBeforeProgress.routes[index];
            if (
              !before
              || route.ordinal !== before.ordinal
              || route.status !== before.status
              || route.timelineRevision !== before.timelineRevision
              || route.revision !== before.revision
            ) return false;
            if (route.status === 'gathering') {
              return route.forwardProgress === 10_000
                && route.phaseProgress === 10_000
                && route.worldX === before.worldX
                && route.worldZ === before.worldZ;
            }
            if (
              route.phaseProgress <= before.phaseProgress
              || (
                route.worldX === before.worldX
                && route.worldZ === before.worldZ
              )
            ) return false;
            return route.status === 'returning'
              ? route.forwardProgress < before.forwardProgress
              : route.forwardProgress > before.forwardProgress;
          });
          return progressed ? evidence : undefined;
        }, 10_000);
        if (continuityAfterProgress === undefined) {
          return { stage: 'persistent-worker-phase-aware-progress' };
        }
        await settleLifecycleObservation();
        const preparedLifecycle = readSceneLifecycle();
        const html = document.documentElement.innerHTML;
        return {
          stage: 'persistent-worker-reentry-prepared',
          deployedWorkerCount:
            localStateCount('data-local-fullstack-deployed-workers'),
          recallableWorkerCount:
            localStateCount('data-local-fullstack-recallable-workers'),
          exactDispatchTargetCount:
            localStateCount('data-local-fullstack-exact-dispatch-target-count'),
          dispatchedWorkerCount: dispatchedSiteKeys.length,
          dispatchResourceKinds: dispatchResourceKinds.join(','),
          dispatchSiteCoordinates: dispatchedSiteKeys.join(';'),
          publicAssignmentRevisions: continuityAfterProgress.publicRevisions,
          privateAssignmentRevisions: continuityAfterProgress.privateRevisions,
          privateResourceRevision:
            continuityAfterProgress.privateResourceRevision,
          privateResourceSettlementConfirmed:
            settledResourceRefresh !== undefined,
          privateResourcePendingConfirmed: pendingResourceRefresh !== undefined,
          privateResourceStoredBeforeBrowser:
            fourPhaseContinuity.privateResources.some(
              (entry) => entry.available > 0n
            ),
          privateResourcePendingBeforeBrowser:
            fourPhaseContinuity.privateResources.some(
              (entry) => entry.pending > 0n
            ),
          resourceRailNumericSamples: resourceRailObservation.numericSamples,
          resourceRailInvalidSamples: resourceRailObservation.invalidSamples,
          resourceRailDistinctValues: resourceRailObservation.observedValues.size,
          routeEvidenceBeforeProgress:
            continuityBeforeProgress.routeEvidence,
          routeEvidenceBeforeNavigation:
            continuityAfterProgress.routeEvidence,
          visibilityCycleConfirmed,
          lifecycleStable: lifecycleRemainsStable(),
          sceneGeneration: preparedLifecycle?.generation,
          sceneCreationCount: preparedLifecycle?.creationCount,
          sceneDisposalCount: preparedLifecycle?.disposalCount,
          blockingLoadingOverlayFrames: lifecycleObservation.blockingOverlayFrames,
          blockingLoadingOverlayInsertions:
            lifecycleObservation.blockingOverlayInsertions,
          blockingLoadingOverlayVisibleTransitions:
            lifecycleObservation.blockingOverlayVisibleTransitions,
          tokenAbsent: !/(?:LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF|LOCAL_QA_SYNTHETIC_MESSAGE|eyJ[A-Za-z0-9_-]{20,}\\.)/.test(html),
          storageEmpty: localStorage.length === 0 && sessionStorage.length === 0
        };
      }
      if (
        new Set(dispatchedSiteKeys).size !== 4
        || localStateCount('data-local-fullstack-recallable-workers') !== 4
      ) return { stage: 'four-worker-projection' };

      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await settleLifecycleObservation();
      if (!lifecycleRemainsStable()) return { stage: 'dispatch-scene-lifecycle' };

      const visibilityCycleConfirmed = await simulateVisibilityCycle();
      if (!visibilityCycleConfirmed) return { stage: 'visibility-cycle' };
      await settleLifecycleObservation();
      if (!lifecycleRemainsStable()) return { stage: 'visibility-scene-lifecycle' };

      const recallCenter = await openWorkers();
      if (!(recallCenter instanceof HTMLElement)) {
        return { stage: 'worker-recall-command-center' };
      }
      const firstRecallRow = [...recallCenter.querySelectorAll(
        '.worker-command-center__roster > li'
      )].find((row) => (
        (row.querySelector('.worker-command-center__identity strong')?.textContent ?? '')
          .trim() === 'Worker 1'
      ));
      const firstRecallRecord = firstRecallRow?.querySelector(
        '.worker-command-center__worker'
      );
      if (!(firstRecallRecord instanceof HTMLButtonElement)) {
        return { stage: 'worker-recall-record' };
      }
      firstRecallRecord.click();
      const activeWorkerPanel = await waitFor(() => document.querySelector(
        '.worker-inspection'
      ));
      if (
        !(activeWorkerPanel instanceof HTMLElement)
        || !/EN ROUTE|GATHERING/i.test(activeWorkerPanel.textContent ?? '')
      ) return { stage: 'active-worker-inspector' };
      workerInspectorChurnCount += 1;
      const activeWorkerBack = activeWorkerPanel.querySelector(
        'button[aria-label="Back to workers"]'
      );
      if (!(activeWorkerBack instanceof HTMLButtonElement)) {
        return { stage: 'active-worker-inspector-close' };
      }
      activeWorkerBack.click();
      const reopenedRecallCenter = await waitFor(() => document.querySelector(
        '.worker-command-center'
      ));
      const recalledWorkerRow = [...(reopenedRecallCenter?.querySelectorAll(
        '.worker-command-center__roster > li'
      ) ?? [])].find((row) => (
        (row.querySelector('.worker-command-center__identity strong')?.textContent ?? '')
          .trim() === 'Worker 1'
      ));
      const recallOne = recalledWorkerRow?.querySelector(
        '.worker-command-center__recall'
      );
      if (!(recallOne instanceof HTMLButtonElement) || recallOne.disabled) {
        return { stage: 'worker-recall-one-control' };
      }
      recallOne.click();
      const recallOneProjected = await waitFor(() => (
        localStateCount('data-local-fullstack-recallable-workers') === 3
          ? readyProbe
          : undefined
      ), 10_000);
      if (!(recallOneProjected instanceof HTMLOutputElement)) {
        return { stage: 'worker-recall-one-projection' };
      }
      const recalledOneDynamicPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.dynamicReconciliations
            > dispatchedDynamicPresentation.dynamicReconciliations
          && current.workerReconciliations
            > dispatchedDynamicPresentation.workerReconciliations
          && current.routeReconciliations
            > dispatchedDynamicPresentation.routeReconciliations
          && current.workerPresentedCount === 28
          && current.workerAnimatedCount >= 1
          && current.visibleRouteCount >= 1
          && current.routeMismatchCount === 0
          && current.rejectedRouteCount === 0
          && current.rejectedReconciliations === 0
          ? current
          : undefined;
      }, 10_000);
      if (recalledOneDynamicPresentation === undefined) {
        return {
          stage: 'recall-one-world-reconciliation',
          ...readDynamicPresentation()
        };
      }
      await settleLifecycleObservation();
      if (!lifecycleRemainsStable()) return { stage: 'recall-one-scene-lifecycle' };
      const recallOneCompleted = await waitFor(() => (
        localStateCount('data-local-fullstack-deployed-workers') === 3
          ? readyProbe
          : undefined
      ), 20_000);
      if (!(recallOneCompleted instanceof HTMLOutputElement)) {
        return { stage: 'worker-recall-one-completion' };
      }
      const currentRecallOneCenter = document.querySelector(
        '.worker-command-center'
      );
      const closeToRealmAfterRecallOne = currentRecallOneCenter instanceof HTMLElement
        ? workerFooterAction(currentRecallOneCenter, 'CLOSE TO REALM')
        : undefined;
      if (
        !(closeToRealmAfterRecallOne instanceof HTMLButtonElement)
        || closeToRealmAfterRecallOne.disabled
      ) return { stage: 'recall-one-close-to-realm' };
      closeToRealmAfterRecallOne.click();
      const recallOnePresentationResumed = await waitFor(() => (
        !document.querySelector('.worker-command-center')
        && realmPresentationIs('true')
          ? true
          : undefined
      ), 10_000);
      if (!recallOnePresentationResumed) {
        return { stage: 'recall-one-presentation-resume' };
      }
      const recallOneCompletedPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.workerPresentedCount === 28
          && current.workerAnimatedCount >= 1
          && current.visibleRouteCount === 3
          && current.routeMismatchCount === 0
          && current.rejectedRouteCount === 0
          && current.rejectedReconciliations === 0
          ? current
          : undefined;
      }, 10_000);
      if (recallOneCompletedPresentation === undefined) {
        return {
          stage: 'recall-one-completion-reconciliation',
          ...readDynamicPresentation()
        };
      }
      await settleLifecycleObservation();
      if (!lifecycleRemainsStable()) {
        return { stage: 'recall-one-completion-scene-lifecycle' };
      }

      const recallAllMenu = await openRealmMenu();
      if (!(recallAllMenu instanceof HTMLElement)) {
        return { stage: 'recall-all-menu' };
      }
      const recallAll = menuAction(recallAllMenu, 'RECALL ALL TO KEEP');
      if (!(recallAll instanceof HTMLButtonElement) || recallAll.disabled) {
        return { stage: 'recall-all-control' };
      }
      recallAll.click();
      const recallAllProjected = await waitFor(() => (
        localStateCount('data-local-fullstack-recallable-workers') === 0
          ? readyProbe
          : undefined
      ), 10_000);
      if (!(recallAllProjected instanceof HTMLOutputElement)) {
        return { stage: 'recall-all-projection' };
      }
      const recalledAllDynamicPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.dynamicReconciliations
            > recallOneCompletedPresentation.dynamicReconciliations
          && current.workerReconciliations
            > recallOneCompletedPresentation.workerReconciliations
          && current.routeReconciliations
            > recallOneCompletedPresentation.routeReconciliations
          && current.workerPresentedCount === 28
          && current.workerAnimatedCount >= 1
          // Recall All may catch every remaining wagon inside the keep-gate
          // staging distance. Those physical workers still reconcile and
          // move, but the ground ribbon intentionally begins outside the
          // private berth. The dedicated dispatch/recall progress gates above
          // and below continue to prove visible long-route traversal.
          && current.visibleRouteCount <= 3
          && current.routeMismatchCount === 0
          && current.rejectedRouteCount === 0
          && current.rejectedReconciliations === 0
          ? current
          : undefined;
      }, 10_000);
      if (recalledAllDynamicPresentation === undefined) {
        return {
          stage: 'recall-all-world-reconciliation',
          ...readDynamicPresentation()
        };
      }
      await settleLifecycleObservation();
      if (!lifecycleRemainsStable()) return { stage: 'recall-all-scene-lifecycle' };
      const allReturned = await waitFor(() => (
        localStateCount('data-local-fullstack-deployed-workers') === 0
          ? readyProbe
          : undefined
      ), 30_000);
      if (!(allReturned instanceof HTMLOutputElement)) {
        return { stage: 'recall-all-completion' };
      }
      const releasedSites = await waitFor(() => (
        readyProbe.getAttribute('data-local-fullstack-dispatch-sites')
          === initialDispatchSiteProjection
          ? true
          : undefined
      ), 10_000);
      if (!releasedSites) return { stage: 'worker-node-release' };
      const closeAfterRecallAll = recallAllMenu.querySelector(
        'button[aria-label="Close Realm menu"]'
      );
      if (closeAfterRecallAll instanceof HTMLButtonElement) closeAfterRecallAll.click();
      if (!await waitFor(() => (
        !document.querySelector('.realm-profile-menu__panel')
        && realmPresentationIs('true')
      ))) return { stage: 'recall-all-menu-close' };
      const returnedDynamicPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.dynamicReconciliations
            > recalledAllDynamicPresentation.dynamicReconciliations
          && current.workerReconciliations
            > recalledAllDynamicPresentation.workerReconciliations
          && current.routeReconciliations
            > recalledAllDynamicPresentation.routeReconciliations
          && current.workerPresentedCount === 28
          // Idle workers remain authoritative world records, but their wagons
          // are parked inside the keep and must not render on the realm map.
          && current.workerAnimatedCount === 0
          && current.workerPresenceCount === 0
          && current.visibleRouteCount === 0
          && current.routeMismatchCount === 0
          && current.rejectedRouteCount === 0
          && current.rejectedReconciliations === 0
          ? current
          : undefined;
      }, 10_000);
      if (returnedDynamicPresentation === undefined) {
        return {
          stage: 'recall-all-completion-reconciliation',
          ...readDynamicPresentation()
        };
      }
      await settleLifecycleObservation();
      if (!lifecycleRemainsStable()) {
        return { stage: 'recall-all-completion-scene-lifecycle' };
      }

      const reusedWorker = await dispatchWorker(
        1,
        1,
        fixtureDispatchSites[0],
        returnedDynamicPresentation
      );
      if ('error' in reusedWorker) {
        return {
          stage: 'reuse-' + reusedWorker.error,
          ...(reusedWorker.presentation ?? {})
        };
      }
      const nodeReuseConfirmed = (
        reusedWorker.resourceKind === fixtureDispatchSites[0].resourceKind
        && reusedWorker.site.q === fixtureDispatchSites[0].q
        && reusedWorker.site.r === fixtureDispatchSites[0].r
        && readyProbe.getAttribute('data-local-fullstack-dispatch-sites')
          !== initialDispatchSiteProjection
      );
      if (!nodeReuseConfirmed) return { stage: 'worker-node-reuse' };
      const reuseRecallCenter = await openWorkers();
      if (!(reuseRecallCenter instanceof HTMLElement)) {
        return { stage: 'reuse-recall-command-center' };
      }
      const reuseRecall = workerFooterAction(
        reuseRecallCenter,
        'RETURN ALL TO KEEP'
      );
      if (!(reuseRecall instanceof HTMLButtonElement) || reuseRecall.disabled) {
        return { stage: 'reuse-recall-control' };
      }
      reuseRecall.click();
      const reuseReturned = await waitFor(() => (
        localStateCount('data-local-fullstack-deployed-workers') === 0
          ? readyProbe
          : undefined
      ), 20_000);
      if (!(reuseReturned instanceof HTMLOutputElement)) {
        return { stage: 'reuse-return-completion' };
      }
      const reusedSiteReleasedAgain = await waitFor(() => (
        readyProbe.getAttribute('data-local-fullstack-dispatch-sites')
          === initialDispatchSiteProjection
          ? true
          : undefined
      ), 10_000);
      if (!reusedSiteReleasedAgain) return { stage: 'reuse-node-release' };
      const currentReuseRecallCenter = document.querySelector(
        '.worker-command-center'
      );
      const closeToRealmAfterReuse = currentReuseRecallCenter instanceof HTMLElement
        ? workerFooterAction(currentReuseRecallCenter, 'CLOSE TO REALM')
        : undefined;
      if (
        !(closeToRealmAfterReuse instanceof HTMLButtonElement)
        || closeToRealmAfterReuse.disabled
      ) return { stage: 'reuse-close-to-realm' };
      closeToRealmAfterReuse.click();
      const reusePresentationResumed = await waitFor(() => (
        !document.querySelector('.worker-command-center')
        && realmPresentationIs('true')
          ? true
          : undefined
      ), 10_000);
      if (!reusePresentationResumed) {
        return { stage: 'reuse-presentation-resume' };
      }
      const restoredDynamicPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.dynamicReconciliations
            > reusedWorker.presentation.dynamicReconciliations
          && current.workerReconciliations
            > reusedWorker.presentation.workerReconciliations
          && current.routeReconciliations
            > reusedWorker.presentation.routeReconciliations
          && current.workerPresentedCount === 28
          && current.workerAnimatedCount === 0
          && current.workerPresenceCount === 0
          && current.visibleRouteCount === 0
          && current.routeMismatchCount === 0
          && current.rejectedRouteCount === 0
          && current.rejectedReconciliations === 0
          ? current
          : undefined;
      }, 10_000);
      if (restoredDynamicPresentation === undefined) {
        return {
          stage: 'reuse-return-reconciliation',
          ...readDynamicPresentation()
        };
      }
      await settleLifecycleObservation();
      if (!lifecycleRemainsStable()) return { stage: 'reuse-scene-lifecycle' };

      const finalLifecycle = readSceneLifecycle();
      if (finalLifecycle === undefined) return { stage: 'scene-telemetry-final' };
      const html = document.documentElement.innerHTML;
      return {
        stage: 'complete',
        backendReady: readyProbe.getAttribute('data-local-fullstack-backend') === 'ready',
        authReady: readyProbe.getAttribute('data-local-fullstack-auth') === 'authenticated',
        resourceControls,
        workerRows: workerRows.length,
        tokenAbsent: !/(?:LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF|LOCAL_QA_SYNTHETIC_MESSAGE|eyJ[A-Za-z0-9_-]{20,}\\.)/.test(html),
        storageEmpty: localStorage.length === 0 && sessionStorage.length === 0,
        rendererReady: true,
        profileReady: true,
        dispatchedWorkerCount: dispatchedSiteKeys.length,
        distinctDispatchSiteCount: new Set(dispatchedSiteKeys).size,
        dispatchResourceKinds: dispatchResourceKinds.join(','),
        fixtureResourceKinds: fixtureDispatchSites
          .map((site) => site.resourceKind)
          .join(','),
        individualRecallConfirmed: true,
        recallAllConfirmed: true,
        returnCompletionConfirmed: true,
        releasedNodeConfirmed: true,
        nodeReuseConfirmed,
        visibilityCycleConfirmed,
        menuChurnCount,
        resourceInspectorChurnCount,
        workerInspectorChurnCount,
        initialSceneCreationCount: initialLifecycle.creationCount,
        sceneGenerationChange: finalLifecycle.generation - initialLifecycle.generation,
        sceneCreationChange: finalLifecycle.creationCount - initialLifecycle.creationCount,
        sceneDisposalChange: finalLifecycle.disposalCount - initialLifecycle.disposalCount,
        blockingLoadingOverlayFrames: lifecycleObservation.blockingOverlayFrames,
        blockingLoadingOverlayInsertions: lifecycleObservation.blockingOverlayInsertions,
        blockingLoadingOverlayVisibleTransitions:
          lifecycleObservation.blockingOverlayVisibleTransitions,
        dynamicReconciliationChange:
          restoredDynamicPresentation.dynamicReconciliations
          - initialDynamicPresentation.dynamicReconciliations,
        workerReconciliationChange:
          restoredDynamicPresentation.workerReconciliations
          - initialDynamicPresentation.workerReconciliations,
        routeReconciliationChange:
          restoredDynamicPresentation.routeReconciliations
          - initialDynamicPresentation.routeReconciliations,
        dispatchedWorldWorkerCount: dispatchedDynamicPresentation.workerPresentedCount,
        dispatchedAnimatedWorkerCount: dispatchedDynamicPresentation.workerAnimatedCount,
        dispatchedWorldPresenceCount: dispatchedDynamicPresentation.workerPresenceCount,
        dispatchedVisibleRouteCount: dispatchedDynamicPresentation.visibleRouteCount,
        returnedAnimatedWorkerCount: restoredDynamicPresentation.workerAnimatedCount,
        returnedWorldPresenceCount: restoredDynamicPresentation.workerPresenceCount,
        returnedVisibleRouteCount: restoredDynamicPresentation.visibleRouteCount
      };
      } finally {
        stopLifecycleObservation();
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, COMMAND_TIMEOUT_MILLISECONDS);
  const value = result?.result?.value;
  if (preparePersistentWorkerReentry) {
    if (
      result?.exceptionDetails
      || value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || value.stage !== 'persistent-worker-reentry-prepared'
      || value.deployedWorkerCount !== 4
      || value.recallableWorkerCount !== 3
      || value.exactDispatchTargetCount !== 4
      || value.dispatchedWorkerCount !== 4
      || value.dispatchResourceKinds !== 'gold,food,wood,stone'
      || typeof value.dispatchSiteCoordinates !== 'string'
      || !/^gold:-?\d+,-?\d+;food:-?\d+,-?\d+;wood:-?\d+,-?\d+;stone:-?\d+,-?\d+$/.test(
        value.dispatchSiteCoordinates
      )
      || typeof value.publicAssignmentRevisions !== 'string'
      || !/^1:outbound:\d+:\d+,2:outbound:\d+:\d+,3:gathering:\d+:\d+,4:returning:\d+:\d+$/.test(
        value.publicAssignmentRevisions
      )
      || typeof value.privateAssignmentRevisions !== 'string'
      || !/^1:outbound:\d+,2:outbound:\d+,3:gathering:\d+,4:returning:\d+$/.test(
        value.privateAssignmentRevisions
      )
      || typeof value.privateResourceRevision !== 'string'
      || !/^\d+$/.test(value.privateResourceRevision)
      || value.privateResourceSettlementConfirmed !== true
      || value.privateResourcePendingConfirmed !== true
      || value.privateResourceStoredBeforeBrowser !== true
      || value.privateResourcePendingBeforeBrowser !== true
      || !Number.isSafeInteger(value.resourceRailNumericSamples)
      || value.resourceRailNumericSamples < 1
      || value.resourceRailInvalidSamples !== 0
      || !Number.isSafeInteger(value.resourceRailDistinctValues)
      || value.resourceRailDistinctValues < 1
      || typeof value.routeEvidenceBeforeProgress !== 'string'
      || typeof value.routeEvidenceBeforeNavigation !== 'string'
      || !/^1:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,2:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,3:gathering:\d+:\d+:-?\d+:-?\d+:10000:10000,4:returning:\d+:\d+:-?\d+:-?\d+:\d+:\d+$/.test(
        value.routeEvidenceBeforeProgress
      )
      || !/^1:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,2:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,3:gathering:\d+:\d+:-?\d+:-?\d+:10000:10000,4:returning:\d+:\d+:-?\d+:-?\d+:\d+:\d+$/.test(
        value.routeEvidenceBeforeNavigation
      )
      || value.visibilityCycleConfirmed !== true
      || value.lifecycleStable !== true
      || !Number.isSafeInteger(value.sceneGeneration)
      || value.sceneCreationCount !== 1
      || value.sceneDisposalCount !== 0
      || value.blockingLoadingOverlayFrames !== 0
      || value.blockingLoadingOverlayInsertions !== 0
      || value.blockingLoadingOverlayVisibleTransitions !== 0
      || value.tokenAbsent !== true
      || value.storageEmpty !== true
    ) {
      const safeStage = typeof value?.stage === 'string'
        && /^[a-z0-9-]{1,64}$/.test(value.stage)
        ? value.stage
        : 'unknown';
      const safePreparedState = safeStage === 'persistent-worker-reentry-prepared'
        ? ` (${[
            value.deployedWorkerCount === 4,
            value.recallableWorkerCount === 3,
            value.exactDispatchTargetCount === 4,
            value.dispatchedWorkerCount === 4,
            value.dispatchResourceKinds === 'gold,food,wood,stone',
            typeof value.dispatchSiteCoordinates === 'string'
              && /^gold:-?\d+,-?\d+;food:-?\d+,-?\d+;wood:-?\d+,-?\d+;stone:-?\d+,-?\d+$/
                .test(value.dispatchSiteCoordinates),
            typeof value.publicAssignmentRevisions === 'string'
              && /^1:outbound:\d+:\d+,2:outbound:\d+:\d+,3:gathering:\d+:\d+,4:returning:\d+:\d+$/
                .test(value.publicAssignmentRevisions),
            typeof value.privateAssignmentRevisions === 'string'
              && /^1:outbound:\d+,2:outbound:\d+,3:gathering:\d+,4:returning:\d+$/
                .test(value.privateAssignmentRevisions),
            typeof value.privateResourceRevision === 'string'
              && /^\d+$/.test(value.privateResourceRevision),
            value.privateResourceSettlementConfirmed === true,
            value.privateResourcePendingConfirmed === true,
            value.privateResourceStoredBeforeBrowser === true,
            value.privateResourcePendingBeforeBrowser === true,
            Number.isSafeInteger(value.resourceRailNumericSamples)
              && value.resourceRailNumericSamples >= 1,
            value.resourceRailInvalidSamples === 0,
            Number.isSafeInteger(value.resourceRailDistinctValues)
              && value.resourceRailDistinctValues >= 1,
            typeof value.routeEvidenceBeforeProgress === 'string'
              && /^1:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,2:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,3:gathering:\d+:\d+:-?\d+:-?\d+:10000:10000,4:returning:\d+:\d+:-?\d+:-?\d+:\d+:\d+$/
                .test(value.routeEvidenceBeforeProgress),
            typeof value.routeEvidenceBeforeNavigation === 'string'
              && /^1:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,2:outbound:\d+:\d+:-?\d+:-?\d+:\d+:\d+,3:gathering:\d+:\d+:-?\d+:-?\d+:10000:10000,4:returning:\d+:\d+:-?\d+:-?\d+:\d+:\d+$/
                .test(value.routeEvidenceBeforeNavigation),
            value.visibilityCycleConfirmed === true,
            value.lifecycleStable === true,
            Number.isSafeInteger(value.sceneGeneration),
            value.sceneCreationCount === 1,
            value.sceneDisposalCount === 0,
            value.blockingLoadingOverlayFrames === 0
              && value.blockingLoadingOverlayInsertions === 0
              && value.blockingLoadingOverlayVisibleTransitions === 0,
            value.tokenAbsent === true,
            value.storageEmpty === true
          ].map((entry) => entry ? '1' : '0').join('')})`
        : '';
      throw new LocalFullstackBrowserError(
        `Disposable persistent Worker setup failed at ${safeStage}${
          safePreparedState
        }.`
      );
    }
    return Object.freeze(value);
  }
  if (
    result?.exceptionDetails
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.stage !== 'complete'
    || value.backendReady !== true
    || value.authReady !== true
    || value.resourceControls !== 5
    || value.workerRows !== 4
    || value.tokenAbsent !== true
    || value.storageEmpty !== true
    || value.rendererReady !== true
    || value.profileReady !== true
    || value.dispatchedWorkerCount !== 4
    || value.distinctDispatchSiteCount !== 4
    || value.dispatchResourceKinds !== 'gold,food,wood,stone'
    || value.fixtureResourceKinds !== 'gold,food,wood,stone'
    || value.individualRecallConfirmed !== true
    || value.recallAllConfirmed !== true
    || value.returnCompletionConfirmed !== true
    || value.releasedNodeConfirmed !== true
    || value.nodeReuseConfirmed !== true
    || value.visibilityCycleConfirmed !== true
    || !Number.isSafeInteger(value.menuChurnCount)
    || value.menuChurnCount < 6
    || !Number.isSafeInteger(value.resourceInspectorChurnCount)
    || value.resourceInspectorChurnCount !== 5
    || !Number.isSafeInteger(value.workerInspectorChurnCount)
    || value.workerInspectorChurnCount < 2
    || value.initialSceneCreationCount !== 1
    || value.sceneGenerationChange !== 0
    || value.sceneCreationChange !== 0
    || value.sceneDisposalChange !== 0
    || value.blockingLoadingOverlayFrames !== 0
    || value.blockingLoadingOverlayInsertions !== 0
    || value.blockingLoadingOverlayVisibleTransitions !== 0
    || !Number.isSafeInteger(value.dynamicReconciliationChange)
    || value.dynamicReconciliationChange < 7
    || !Number.isSafeInteger(value.workerReconciliationChange)
    || value.workerReconciliationChange < 7
    || !Number.isSafeInteger(value.routeReconciliationChange)
    || value.routeReconciliationChange < 7
    || value.dispatchedWorldWorkerCount !== 28
    || !Number.isSafeInteger(value.dispatchedAnimatedWorkerCount)
    || value.dispatchedAnimatedWorkerCount < 1
    || !Number.isSafeInteger(value.dispatchedWorldPresenceCount)
    || value.dispatchedWorldPresenceCount < 0
    || !Number.isSafeInteger(value.dispatchedVisibleRouteCount)
    || value.dispatchedVisibleRouteCount < 1
    || value.returnedAnimatedWorkerCount !== 0
    || value.returnedWorldPresenceCount !== 0
    || value.returnedVisibleRouteCount !== 0
  ) {
    const safeStage = typeof value?.stage === 'string'
      && /^[a-z0-9-]{1,64}$/.test(value.stage)
      ? value.stage
      : 'unknown';
    const safeAuthorityState = safeStage === 'authority-ready'
      ? ` (${['authPhase', 'backendPhase', 'workerCount'].map((key) => {
        const state = value?.[key];
        return typeof state === 'string' && /^[a-z0-9-]{1,32}$/.test(state)
          ? state
          : 'invalid';
      }).join('/')})`
      : '';
    const safeSceneState = safeStage === 'scene-telemetry-ready'
      ? ` (${['sceneGeneration', 'sceneCreationCount', 'sceneDisposalCount'].map((key) => {
        const count = value?.[key];
        return Number.isSafeInteger(count) && count >= -1 && count <= 1_000_000
          ? String(count)
          : 'invalid';
      }).join('/')}/${
        typeof value?.sceneReason === 'string'
        && /^[a-z-]{1,48}$/.test(value.sceneReason)
          ? value.sceneReason
          : 'invalid'
      })`
      : '';
    const safeDynamicState = (
      safeStage.endsWith('world-reconciliation')
      || safeStage.endsWith('completion-reconciliation')
    )
      ? ` (${[
          'dynamicReconciliations',
          'rejectedReconciliations',
          'workerReconciliations',
          'routeReconciliations',
          'workerPresentedCount',
          'workerAnimatedCount',
          'workerPresenceCount',
          'visibleRouteCount',
          'routeMismatchCount',
          'rejectedRouteCount'
        ].map((key) => {
          const count = value?.[key];
          return Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000
            ? String(count)
            : 'invalid';
        }).join('/')})`
      : '';
    const safeRuntimeException = safeBrowserRuntimeExceptionCode(
      result?.exceptionDetails
    );
    throw new LocalFullstackBrowserError(
      `Disposable browser journey failed at ${safeStage}${
        safeAuthorityState || safeSceneState || safeDynamicState
      }${safeRuntimeException ? ` (${safeRuntimeException})` : ''}.`
    );
  }
  return Object.freeze({ ...value });
}

async function exerciseHardReloadWorkerContinuity(session) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const waitFor = async (predicate, timeoutMilliseconds = 30_000) => {
        const deadline = performance.now() + timeoutMilliseconds;
        while (performance.now() <= deadline) {
          try {
            const value = predicate();
            if (value) return value;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return undefined;
      };
      const enterMenu = await waitFor(() => {
        const candidate = document.querySelector(
          'button[data-command="enter-realm"]'
        );
        if (!(candidate instanceof HTMLButtonElement) || candidate.disabled) {
          return undefined;
        }
        const style = getComputedStyle(candidate);
        const bounds = candidate.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width > 0
          && bounds.height > 0
          && candidate.closest('[inert]') === null
          ? candidate
          : undefined;
      });
      if (!(enterMenu instanceof HTMLButtonElement)) {
        return { stage: 'hard-reload-menu' };
      }
      enterMenu.click();
      let repeatedTermsVisible = false;
      const probe = await waitFor(() => {
        const repeatedTerms = document.querySelector(
          '[role="dialog"][aria-modal="true"]'
        );
        if (repeatedTerms instanceof HTMLElement) {
          repeatedTermsVisible = true;
          return repeatedTerms;
        }
        const candidate = document.querySelector(
          '[data-local-fullstack-backend]'
        );
        return (
          candidate?.getAttribute('data-local-fullstack-auth') === 'authenticated'
          && candidate.getAttribute('data-local-fullstack-backend') === 'ready'
          && candidate.getAttribute('data-local-fullstack-workers') === '4'
          && candidate.getAttribute('data-local-fullstack-public-castles') === '7'
          && candidate.getAttribute('data-local-fullstack-public-workers') === '28'
          && candidate.getAttribute(
            'data-local-fullstack-worker-private-sync'
          ) === 'ready'
          && candidate.getAttribute(
            'data-local-fullstack-worker-commands'
          ) === 'true'
        ) ? candidate : undefined;
      });
      if (repeatedTermsVisible) {
        return { stage: 'hard-reload-repeated-terms' };
      }
      if (!(probe instanceof HTMLOutputElement)) {
        const candidate = document.querySelector(
          '[data-local-fullstack-backend]'
        );
        return {
          stage: 'hard-reload-authority',
          authPhase: candidate?.getAttribute(
            'data-local-fullstack-auth'
          ) ?? 'missing',
          backendPhase: candidate?.getAttribute(
            'data-local-fullstack-backend'
          ) ?? 'missing',
          agreementSatisfied: candidate?.getAttribute(
            'data-local-fullstack-entry-agreement-satisfied'
          ) ?? 'missing',
          workerPrivateSync: candidate?.getAttribute(
            'data-local-fullstack-worker-private-sync'
          ) ?? 'missing'
        };
      }
      await new Promise((resolve) => (
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      ));
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return { stage: 'hard-reload-late-terms' };
      }
      const publicRevisions = probe.getAttribute(
        'data-local-fullstack-public-assignment-revisions'
      ) ?? '';
      const privateRevisions = probe.getAttribute(
        'data-local-fullstack-private-assignment-revisions'
      ) ?? '';
      const privateResources = (
        probe.getAttribute('data-local-fullstack-private-resource-rail') ?? ''
      ).split(';').flatMap((entry) => {
        const match = /^(food|wood|stone|gold):(\\d+):(\\d+)$/.exec(entry);
        return match ? [{
          available: BigInt(match[2]),
          pending: BigInt(match[3])
        }] : [];
      });
      if (
        !/^1:outbound:\\d+:\\d+,2:outbound:\\d+:\\d+,3:gathering:\\d+:\\d+,4:returning:\\d+:\\d+$/
          .test(publicRevisions)
        || !/^1:outbound:\\d+,2:outbound:\\d+,3:gathering:\\d+,4:returning:\\d+$/
          .test(privateRevisions)
        || privateResources.length !== 4
        || !privateResources.some((entry) => entry.available > 0n)
        || !privateResources.some((entry) => entry.pending > 0n)
      ) return { stage: 'hard-reload-persisted-state' };
      const html = document.documentElement.innerHTML;
      return {
        stage: 'hard-reload-worker-continuity-complete',
        exactCastleCount: 7,
        exactWorkerCount: 28,
        termsSkipped: true,
        storedBalanceRetained: true,
        pendingBalanceRetained: true,
        tokenAbsent: !/(?:LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF|LOCAL_QA_SYNTHETIC_MESSAGE|eyJ[A-Za-z0-9_-]{20,}\\.)/.test(html),
        storageEmpty: localStorage.length === 0 && sessionStorage.length === 0
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, COMMAND_TIMEOUT_MILLISECONDS);
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.stage !== 'hard-reload-worker-continuity-complete'
    || value.exactCastleCount !== 7
    || value.exactWorkerCount !== 28
    || value.termsSkipped !== true
    || value.storedBalanceRetained !== true
    || value.pendingBalanceRetained !== true
    || value.tokenAbsent !== true
    || value.storageEmpty !== true
  ) {
    const safeStage = typeof value?.stage === 'string'
      && /^[a-z0-9-]{1,64}$/.test(value.stage)
      ? value.stage
      : 'unknown';
    const safeAuthorityState = safeStage === 'hard-reload-authority'
      ? ` (${[
          value?.authPhase,
          value?.backendPhase,
          value?.agreementSatisfied,
          value?.workerPrivateSync
        ].map((entry) => (
          typeof entry === 'string' && /^[a-z-]{1,32}$/.test(entry)
            ? entry
            : 'invalid'
        )).join('/')})`
      : '';
    throw new LocalFullstackBrowserError(
      `Disposable hard-reload Worker continuity failed at ${safeStage}${
        safeAuthorityState
      }.`
    );
  }
  return Object.freeze({ ...value });
}

async function exercisePersistentWorkerReentry(session, preparedEvidence) {
  const expectedContinuity = JSON.stringify({
    dispatchSiteCoordinates: preparedEvidence.dispatchSiteCoordinates,
    publicAssignmentRevisions: preparedEvidence.publicAssignmentRevisions,
    privateAssignmentRevisions: preparedEvidence.privateAssignmentRevisions,
    privateResourceRevision: preparedEvidence.privateResourceRevision,
    routeEvidenceBeforeNavigation: preparedEvidence.routeEvidenceBeforeNavigation,
  });
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const expectedSetup = ${expectedContinuity};
      const deadline = performance.now() + ${PRESENTATION_TIMEOUT_MILLISECONDS};
      const waitFor = async (
        predicate,
        timeoutMilliseconds = ${PRESENTATION_TIMEOUT_MILLISECONDS}
      ) => {
        const predicateDeadline = Math.min(
          deadline,
          performance.now() + timeoutMilliseconds
        );
        while (performance.now() <= predicateDeadline) {
          try {
            const value = predicate();
            if (value) return value;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return undefined;
      };
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
      const buttonWithText = (text, root = document) => [...root.querySelectorAll('button')]
        .find((button) => visible(button) && (button.textContent ?? '').trim() === text);
      const numericAttribute = (element, name) => {
        const value = element?.getAttribute(name);
        return value !== null && /^(?:0|[1-9]\\d{0,9})$/.test(value ?? '')
          ? Number(value)
          : undefined;
      };
      const parseRouteEvidence = (routeEvidence) => (
        routeEvidence.split(',').flatMap((entry) => {
          const match = /^(\\d):([a-z]+):(\\d+):(\\d+):(-?\\d+):(-?\\d+):(\\d+):(\\d+)$/
            .exec(entry);
          return match ? [{
            ordinal: Number(match[1]),
            status: match[2],
            timelineRevision: Number(match[3]),
            revision: match[4],
            worldX: Number(match[5]),
            worldZ: Number(match[6]),
            forwardProgress: Number(match[7]),
            phaseProgress: Number(match[8])
          }] : [];
        })
      );
      const readContinuityEvidence = (probe) => {
        const publicRevisions = probe?.getAttribute(
          'data-local-fullstack-public-assignment-revisions'
        ) ?? '';
        const privateRevisions = probe?.getAttribute(
          'data-local-fullstack-private-assignment-revisions'
        ) ?? '';
        const privateResourceRevision = probe?.getAttribute(
          'data-local-fullstack-private-resource-revision'
        ) ?? '';
        const routeEvidence = probe?.getAttribute(
          'data-local-fullstack-public-route-evidence'
        ) ?? '';
        return {
          publicRevisions,
          privateRevisions,
          privateResourceRevision,
          routeEvidence,
          routes: parseRouteEvidence(routeEvidence)
        };
      };
      const routesContinueForward = (before, after) => (
        before.length === after.length
        && after.every((route, index) => {
          const prior = before[index];
          if (
            !prior
            || route.ordinal !== prior.ordinal
            || route.status !== prior.status
            || route.timelineRevision !== prior.timelineRevision
            || route.revision !== prior.revision
          ) return false;
          if (route.status === 'gathering') {
            return route.forwardProgress === 10_000
              && route.phaseProgress === 10_000
              && prior.forwardProgress === 10_000
              && prior.phaseProgress === 10_000
              && route.worldX === prior.worldX
              && route.worldZ === prior.worldZ;
          }
          if (
            route.phaseProgress <= prior.phaseProgress
            || (
              route.worldX === prior.worldX
              && route.worldZ === prior.worldZ
            )
          ) return false;
          return route.status === 'returning'
            ? route.forwardProgress < prior.forwardProgress
            : route.forwardProgress > prior.forwardProgress;
        })
      );
      const exactDispatchTargetManifest = Object.freeze({
        gold: Object.freeze({ siteNumber: 2, playerLabel: 'Gold Mine 2' }),
        food: Object.freeze({ siteNumber: 2, playerLabel: 'Wheat Farm 2' }),
        wood: Object.freeze({ siteNumber: 12, playerLabel: 'Logging Camp 12' }),
        stone: Object.freeze({ siteNumber: 2, playerLabel: 'Stone Quarry 2' })
      });
      const fixtureDispatchSites = expectedSetup.dispatchSiteCoordinates
        .split(';')
        .flatMap((entry) => {
          const match = /^(gold|food|wood|stone):(-?\\d+),(-?\\d+)$/.exec(entry);
          const target = match ? exactDispatchTargetManifest[match[1]] : undefined;
          return match && target ? [{
            resourceKind: match[1],
            q: match[2],
            r: match[3],
            siteNumber: target.siteNumber,
            playerLabel: target.playerLabel
          }] : [];
        });
      const openRealmMenu = async () => {
        const existing = document.querySelector('.realm-profile-menu__panel');
        if (existing instanceof HTMLElement) return existing;
        const trigger = document.querySelector('.realm-profile-trigger');
        if (!(trigger instanceof HTMLButtonElement)) return undefined;
        trigger.click();
        const menu = await waitFor(() => document.querySelector(
          '.realm-profile-menu__panel'
        ));
        return menu instanceof HTMLElement ? menu : undefined;
      };
      const navigateToResourceSite = async (site) => {
        const menu = await openRealmMenu();
        if (!(menu instanceof HTMLElement)) return false;
        const explore = [...menu.querySelectorAll('button')].find((button) => (
          (button.querySelector('strong')?.textContent ?? '').trim() === 'EXPLORE'
        ));
        if (!(explore instanceof HTMLButtonElement) || explore.disabled) return false;
        explore.click();
        const navigator = await waitFor(() => document.querySelector(
          '.realm-cell-navigator__dialog'
        ));
        if (
          !(navigator instanceof HTMLElement)
          || navigator.querySelector('.realm-cell-navigator__jump') !== null
        ) return false;
        const resourceSite = [...navigator.querySelectorAll(
          '.realm-cell-navigator__resource-site'
            + '[data-resource-kind][data-resource-state="available"]'
        )].find((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && button.getAttribute('data-resource-kind') === site.resourceKind
          && (button.querySelector('strong')?.textContent ?? '').trim()
            === site.playerLabel
          && (button.getAttribute('aria-label') ?? '')
            .startsWith('Inspect ' + site.playerLabel + ', tier ')
        ));
        if (!(resourceSite instanceof HTMLButtonElement)) return false;
        const bounds = resourceSite.getBoundingClientRect();
        if (bounds.width < 44 || bounds.height < 44) return false;
        resourceSite.click();
        return Boolean(await waitFor(() => (
          !document.querySelector('.realm-cell-navigator__dialog')
          && document.querySelector('.realm-node-worker-dispatch') instanceof HTMLElement
        )));
      };

      const enterMenu = await waitFor(() => {
        const candidate = document.querySelector(
          'button[data-command="enter-realm"]'
        );
        return candidate instanceof HTMLButtonElement
          && !candidate.disabled
          && candidate.closest('[inert]') === null
          && visible(candidate)
          ? candidate
          : undefined;
      });
      if (!(enterMenu instanceof HTMLButtonElement)) return { stage: 'reentry-menu' };
      enterMenu.click();

      const dialog = await waitFor(() => document.querySelector(
        '[role="dialog"][aria-modal="true"]'
      ));
      if (!(dialog instanceof HTMLElement)) return { stage: 'reentry-terms-dialog' };
      const checkbox = dialog.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement) || checkbox.checked) {
        return { stage: 'reentry-terms-checkbox' };
      }
      checkbox.click();
      const continueButton = [...dialog.querySelectorAll('button')].find((button) => (
        /^CONTINUE TO /.test((button.textContent ?? '').trim())
      ));
      if (!(continueButton instanceof HTMLButtonElement) || continueButton.disabled) {
        return { stage: 'reentry-terms-continue' };
      }
      continueButton.click();

      const publicReadyProbe = await waitFor(() => {
        const probe = document.querySelector('[data-local-fullstack-backend]');
        const authPhase = probe?.getAttribute('data-local-fullstack-auth');
        const backendPhase = probe?.getAttribute('data-local-fullstack-backend');
        const privatePhase = probe?.getAttribute(
          'data-local-fullstack-worker-private-sync'
        );
        return (
          authPhase === 'authenticated'
          && backendPhase === 'ready'
          && probe?.getAttribute('data-local-fullstack-deployed-workers') === '4'
          && probe?.getAttribute('data-local-fullstack-recallable-workers') === '3'
          && probe?.getAttribute(
            'data-local-fullstack-exact-dispatch-target-count'
          ) === '4'
          && probe?.getAttribute(
            'data-local-fullstack-public-worker-occupation-count'
          ) === '3'
          && privatePhase !== 'ready'
          && probe?.getAttribute('data-local-fullstack-worker-commands') === 'false'
          && document.documentElement.getAttribute(
            'data-local-fullstack-private-read-gate'
          ) === 'waiting'
        ) ? probe : undefined;
      });
      if (!(publicReadyProbe instanceof HTMLOutputElement)) {
        return { stage: 'reentry-public-authority' };
      }
      const reentryPublicOccupationCount = numericAttribute(
        publicReadyProbe,
        'data-local-fullstack-public-worker-occupation-count'
      );
      const preparedRoutes = parseRouteEvidence(
        expectedSetup.routeEvidenceBeforeNavigation
      );
      const freshPublicContinuity = await waitFor(() => {
        const evidence = readContinuityEvidence(publicReadyProbe);
        return (
          evidence.publicRevisions === expectedSetup.publicAssignmentRevisions
          && evidence.privateRevisions === ''
          && evidence.privateResourceRevision === ''
          && evidence.routes.length === 4
          && routesContinueForward(preparedRoutes, evidence.routes)
        ) ? evidence : undefined;
      }, 10_000);
      if (freshPublicContinuity === undefined) {
        return { stage: 'reentry-public-continuity' };
      }
      const enterAuthenticated = await waitFor(() => buttonWithText('ENTER REALM'));
      if (!(enterAuthenticated instanceof HTMLButtonElement)) {
        return { stage: 'reentry-authenticated-enter' };
      }
      enterAuthenticated.click();

      const realm = await waitFor(() => {
        const candidate = document.querySelector('main[aria-label="Hegemony realm"]');
        const map = document.querySelector('.realm-map-screen');
        return visible(candidate)
          && map?.getAttribute('data-renderer') === 'webgl'
          && map?.getAttribute('data-renderer-state') === 'ready'
          ? candidate
          : undefined;
      });
      if (!(realm instanceof HTMLElement)) return { stage: 'reentry-realm-ready' };
      const canvas = await waitFor(() => realm.querySelector(
        'canvas[data-realm-canvas-active="true"]'
      ));
      if (!(canvas instanceof HTMLCanvasElement)) {
        return { stage: 'reentry-canvas-ready' };
      }
      const initialLifecycle = {
        generation: numericAttribute(realm, 'data-renderer-generation'),
        creationCount: numericAttribute(realm, 'data-realm-scene-creation-count'),
        disposalCount: numericAttribute(realm, 'data-realm-scene-disposal-count'),
        cameraRestoreCount: numericAttribute(
          realm,
          'data-realm-camera-attestation-restore-count'
        )
      };
      if (
        initialLifecycle.generation === undefined
        || initialLifecycle.creationCount !== 1
        || initialLifecycle.disposalCount !== 0
        || initialLifecycle.cameraRestoreCount === undefined
        || realm.getAttribute('data-realm-first-ready') !== 'true'
        || realm.getAttribute('data-realm-blocking-loading-overlay-visible') !== 'false'
      ) return { stage: 'reentry-initial-lifecycle' };
      const lifecycleStable = () => (
        document.querySelector('main.realm-map-screen') === realm
        && numericAttribute(realm, 'data-renderer-generation')
          === initialLifecycle.generation
        && numericAttribute(realm, 'data-realm-scene-creation-count')
          === initialLifecycle.creationCount
        && numericAttribute(realm, 'data-realm-scene-disposal-count')
          === initialLifecycle.disposalCount
        && numericAttribute(realm, 'data-realm-camera-attestation-restore-count')
          === initialLifecycle.cameraRestoreCount
        && realm.getAttribute('data-realm-blocking-loading-overlay-visible') === 'false'
      );
      const resourceRail = realm.querySelector('[aria-label="Your resources"]');
      const resourceRailObservation = {
        invalid: 0,
        samples: 0
      };
      const sampleResourceRail = () => {
        const values = [...(resourceRail?.querySelectorAll(
          '.realm-resource-rail__trigger strong'
        ) ?? [])].slice(0, 4).map((element) => (
          (element.textContent ?? '').trim()
        ));
        if (
          values.length !== 4
          || values.some((value) => !/^\\d+(?:\\.\\d+)?(?:K|M|B|T)?$/.test(value))
        ) resourceRailObservation.invalid += 1;
        else resourceRailObservation.samples += 1;
      };
      sampleResourceRail();
      const resourceRailObserver = new MutationObserver(sampleResourceRail);
      if (resourceRail instanceof HTMLElement) {
        resourceRailObserver.observe(resourceRail, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true
        });
      }
      const dynamicPresentationReady = await waitFor(() => {
        const presented = numericAttribute(
          canvas,
          'data-realm-worker-presented-count'
        );
        const animated = numericAttribute(
          canvas,
          'data-realm-worker-animated-count'
        );
        const presence = numericAttribute(
          canvas,
          'data-realm-worker-presence-count'
        );
        const suppressedPresences = numericAttribute(
          canvas,
          'data-realm-worker-presence-suppressed-count'
        );
        const routes = numericAttribute(
          canvas,
          'data-realm-worker-visible-route-count'
        );
        const mismatches = numericAttribute(
          canvas,
          'data-realm-worker-route-mismatch-count'
        );
        const rejectedRoutes = numericAttribute(
          canvas,
          'data-realm-worker-rejected-route-count'
        );
        const rejectedReconciliations = numericAttribute(
          canvas,
          'data-realm-dynamic-reconciliation-rejected'
        );
        return (
          presented === 28
          && animated !== undefined
          && animated >= 3
          && presence !== undefined
          && presence >= 1
          && suppressedPresences !== undefined
          && presence + suppressedPresences === 3
          && routes !== undefined
          && routes >= 3
          && mismatches === 0
          && rejectedRoutes === 0
          && rejectedReconciliations === 0
        ) ? {
            presented,
            animated,
            presence,
            suppressedPresences,
            routes
          } : undefined;
      }, 15_000);
      if (dynamicPresentationReady === undefined) {
        return {
          stage: 'reentry-public-worker-presentation',
          presented: numericAttribute(
            canvas,
            'data-realm-worker-presented-count'
          ),
          animated: numericAttribute(
            canvas,
            'data-realm-worker-animated-count'
          ),
          presence: numericAttribute(
            canvas,
            'data-realm-worker-presence-count'
          ),
          suppressedPresences: numericAttribute(
            canvas,
            'data-realm-worker-presence-suppressed-count'
          ),
          routes: numericAttribute(
            canvas,
            'data-realm-worker-visible-route-count'
          ),
          mismatches: numericAttribute(
            canvas,
            'data-realm-worker-route-mismatch-count'
          ),
          rejectedRoutes: numericAttribute(
            canvas,
            'data-realm-worker-rejected-route-count'
          ),
          rejectedReconciliations: numericAttribute(
            canvas,
            'data-realm-dynamic-reconciliation-rejected'
          )
        };
      }

      const readOccupationEvidence = () => {
        const markers = [...document.querySelectorAll(
          '[data-resource-occupant-key]'
        )].filter((marker) => marker instanceof HTMLElement);
        const keys = markers.map((marker) => (
          marker.getAttribute('data-resource-occupant-key') ?? ''
        ));
        const reserved = markers.filter((marker) => (
          marker.classList.contains('realm-resource-occupant-marker--reserved')
          || marker.classList.contains('realm-resource-occupant-presence--reserved')
        ));
        const readyResourcePortraits = markers.filter((marker) => (
          marker.querySelector('canvas[data-profile-image-state="ready"]')
        ));
        const readyWorkerPortraits = [...document.querySelectorAll(
          '.realm-worker-presence-marker canvas[data-profile-image-state="ready"]'
        )];
        return {
          markerCount: markers.length,
          distinctMarkerCount: new Set(keys).size,
          reservedCount: reserved.length,
          readyResourcePortraitCount: readyResourcePortraits.length,
          readyWorkerPortraitCount: readyWorkerPortraits.length,
          readyPortraitCount:
            readyResourcePortraits.length + readyWorkerPortraits.length
        };
      };
      const profileTrigger = realm.querySelector('.realm-profile-trigger');
      if (!(profileTrigger instanceof HTMLButtonElement)) {
        return { stage: 'reentry-profile-trigger' };
      }
      profileTrigger.click();
      const exploreMenu = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
      const exploreButton = exploreMenu instanceof HTMLElement
        ? [...exploreMenu.querySelectorAll('button')].find((button) => (
            button instanceof HTMLButtonElement
            && !button.disabled
            && (button.querySelector('strong')?.textContent ?? '').trim()
              === 'EXPLORE'
          ))
        : undefined;
      if (!(exploreButton instanceof HTMLButtonElement)) {
        return { stage: 'reentry-public-resource-explore-control' };
      }
      exploreButton.click();
      const resourceNavigator = await waitFor(() => document.querySelector(
        '.realm-cell-navigator__dialog'
      ));
      if (!(resourceNavigator instanceof HTMLElement)) {
        return { stage: 'reentry-public-resource-explore' };
      }
      const expectedResourceStates = [
        ['gold', 'Gold Mine 2', 'reserved'],
        ['food', 'Wheat Farm 2', 'reserved'],
        ['wood', 'Logging Camp 12', 'occupied'],
        ['stone', 'Stone Quarry 2', 'available']
      ];
      const resourceStateTruth = expectedResourceStates.every(
        ([resourceKind, playerLabel, state]) => (
          [...resourceNavigator.querySelectorAll(
            '.realm-cell-navigator__resource-site'
          )].filter((button) => (
            button instanceof HTMLButtonElement
            && button.getAttribute('data-resource-kind') === resourceKind
            && button.getAttribute('data-resource-state') === state
            && (button.querySelector('strong')?.textContent ?? '').trim()
              === playerLabel
          )).length === 1
        )
      );
      if (!resourceStateTruth) {
        return { stage: 'reentry-public-resource-state-truth' };
      }
      const occupiedWoodSite = [...resourceNavigator.querySelectorAll(
        '.realm-cell-navigator__resource-site'
      )].find((button) => (
        button instanceof HTMLButtonElement
        && !button.disabled
        && button.getAttribute('data-resource-kind') === 'wood'
        && button.getAttribute('data-resource-state') === 'occupied'
        && (button.querySelector('strong')?.textContent ?? '').trim()
          === 'Logging Camp 12'
      ));
      if (!(occupiedWoodSite instanceof HTMLButtonElement)) {
        return { stage: 'reentry-public-occupation-navigation' };
      }
      occupiedWoodSite.click();
      if (!await waitFor(() => (
        document.querySelector('.realm-cell-navigator__dialog') === null
        && document.querySelector('.logging-camp-inspection') instanceof HTMLElement
      ))) return { stage: 'reentry-public-resource-explore-dismissal' };

      // The exact production-shaped site is intentionally well outside the
      // owner's initial keep view. Exercise the public navigator before
      // requiring its bounded screen-space portrait rather than coupling this
      // continuity proof to a synthetic nearby fixture.
      const occupationEvidence = await waitFor(() => {
        const evidence = readOccupationEvidence();
        return (
          evidence.markerCount === 1
          && evidence.distinctMarkerCount === evidence.markerCount
          && evidence.reservedCount === 0
          // The collision-bounded presentation intentionally gives one
          // occupation one visible PFP lane. It may be owned by the resource
          // marker or the moving Worker marker, but never require a duplicate.
          && evidence.readyPortraitCount >= 1
        ) ? evidence : undefined;
      }, 15_000);
      if (occupationEvidence === undefined) {
        return {
          stage: 'reentry-public-occupation-presentation',
          ...readOccupationEvidence()
        };
      }
      const woodInspector = document.querySelector('.logging-camp-inspection');
      const closeWoodInspector = woodInspector?.querySelector(
        'button[aria-label^="CLOSE "]'
      );
      if (!(closeWoodInspector instanceof HTMLButtonElement)) {
        return { stage: 'reentry-public-resource-explore-close' };
      }
      closeWoodInspector.click();
      if (!await waitFor(() => (
        document.querySelector('.logging-camp-inspection') === null
      ))) return { stage: 'reentry-public-resource-inspector-dismissal' };

      profileTrigger.click();
      const realmMenu = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
      if (!(realmMenu instanceof HTMLElement)) return { stage: 'reentry-worker-menu' };
      const menuAction = (label) => [...realmMenu.querySelectorAll('button')].find(
        (button) => (button.querySelector('strong')?.textContent ?? '').trim() === label
      );
      const workerFooterAction = (center, label) => [
        ...center.querySelectorAll('.worker-command-center__footer button')
      ].find((button) => (button.textContent ?? '').trim() === label);
      const workersButton = menuAction('WORKERS');
      const recallAllMenuButton = menuAction('RECALL ALL TO KEEP');
      if (
        !(workersButton instanceof HTMLButtonElement)
        || workersButton.disabled
        || !/4\\/4 deployed/i.test(workersButton.textContent ?? '')
        || !(recallAllMenuButton instanceof HTMLButtonElement)
        || recallAllMenuButton.disabled
        || !/synchron|read-only|recover|retry/i.test(realmMenu.textContent ?? '')
        || /EXPEDITIONS|\\bWAGON\\b/i.test(realmMenu.textContent ?? '')
      ) return {
        stage: 'reentry-read-only-worker-menu',
        workersPresent: workersButton instanceof HTMLButtonElement,
        workersEnabled: workersButton instanceof HTMLButtonElement
          && !workersButton.disabled,
        fourDeployedCopy: workersButton instanceof HTMLButtonElement
          && /4\\/4 deployed/i.test(workersButton.textContent ?? ''),
        recallAllPresent: recallAllMenuButton instanceof HTMLButtonElement,
        recallAllAvailable: recallAllMenuButton instanceof HTMLButtonElement
          && !recallAllMenuButton.disabled,
        readOnlyCopy: /synchron|read-only|recover|retry/i.test(
          realmMenu.textContent ?? ''
        ),
        legacyCopyAbsent: !/EXPEDITIONS|\\bWAGON\\b/i.test(
          realmMenu.textContent ?? ''
        ),
        deployedWorkerCount: Number(
          publicReadyProbe.getAttribute('data-local-fullstack-deployed-workers')
        ),
        recallableWorkerCount: Number(
          publicReadyProbe.getAttribute('data-local-fullstack-recallable-workers')
        )
      };
      workersButton.click();
      const commandCenter = await waitFor(() => document.querySelector(
        '.worker-command-center'
      ));
      if (!(commandCenter instanceof HTMLElement)) {
        return { stage: 'reentry-worker-command-center' };
      }
      const workerRows = commandCenter.querySelectorAll(
        '.worker-command-center__roster > li'
      );
      const recallButtons = [...commandCenter.querySelectorAll(
        '.worker-command-center__recall'
      )];
      const recallAll = workerFooterAction(
        commandCenter,
        'RETURN ALL TO KEEP'
      );
      if (
        workerRows.length !== 4
        || recallButtons.length !== 3
        || recallButtons.some((button) => !(
          button instanceof HTMLButtonElement
          && !button.disabled
        ))
        || !(recallAll instanceof HTMLButtonElement)
        || recallAll.disabled
        || !/synchron|read-only|recover|retry/i.test(commandCenter.textContent ?? '')
        || /EXPEDITIONS|\\bWAGON\\b/i.test(commandCenter.textContent ?? '')
      ) return { stage: 'reentry-read-only-worker-center' };

      const lifecycleObservation = {
        blockingOverlayFrames: 0,
        blockingOverlayInsertions: 0,
        blockingOverlayVisibleTransitions: 0
      };
      const observedBlockingOverlays = new WeakSet();
      const isInitialLoadingOverlay = (element) => (
        element instanceof HTMLElement
        && element.matches('.realm-map-screen__loading')
        && /Surveying the bright lowlands|Preparing every canonical castle/i.test(
          element.textContent ?? ''
        )
      );
      const recordBlockingOverlay = (element) => {
        if (
          isInitialLoadingOverlay(element)
          && !observedBlockingOverlays.has(element)
        ) {
          observedBlockingOverlays.add(element);
          lifecycleObservation.blockingOverlayInsertions += 1;
        }
      };
      const lifecycleObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === 'attributes'
            && mutation.target === realm
            && realm.getAttribute('data-realm-blocking-loading-overlay-visible') === 'true'
            && isInitialLoadingOverlay(
              document.querySelector('.realm-map-screen__loading')
            )
          ) lifecycleObservation.blockingOverlayVisibleTransitions += 1;
          if (mutation.type !== 'childList') continue;
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            recordBlockingOverlay(node);
            for (const overlay of node.querySelectorAll('.realm-map-screen__loading')) {
              recordBlockingOverlay(overlay);
            }
          }
        }
      });
      lifecycleObserver.observe(document.documentElement, {
        attributeFilter: ['data-realm-blocking-loading-overlay-visible'],
        attributes: true,
        childList: true,
        subtree: true
      });
      let lifecycleAnimationFrame = 0;
      const sampleBlockingLoadingOverlay = () => {
        const overlay = document.querySelector('.realm-map-screen__loading');
        if (isInitialLoadingOverlay(overlay) && visible(overlay)) {
          lifecycleObservation.blockingOverlayFrames += 1;
        }
        lifecycleAnimationFrame = requestAnimationFrame(sampleBlockingLoadingOverlay);
      };
      lifecycleAnimationFrame = requestAnimationFrame(sampleBlockingLoadingOverlay);
      const stopLifecycleObservation = () => {
        lifecycleObserver.disconnect();
        cancelAnimationFrame(lifecycleAnimationFrame);
      };
      try {
        const privateDelayStartedAt = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 3_100));
        const privateDelayMilliseconds = performance.now() - privateDelayStartedAt;
        if (
          privateDelayMilliseconds < 3_000
          || document.documentElement.getAttribute(
            'data-local-fullstack-private-read-gate'
          ) !== 'waiting'
          || publicReadyProbe.getAttribute(
            'data-local-fullstack-worker-private-sync'
          ) === 'ready'
          || publicReadyProbe.getAttribute(
            'data-local-fullstack-worker-commands'
          ) !== 'false'
          || !commandCenter.isConnected
          || !lifecycleStable()
        ) return { stage: 'reentry-private-delay' };

        window.dispatchEvent(new Event('${RELEASE_PRIVATE_WORKER_READS_EVENT}'));
        const privateReady = await waitFor(() => (
          document.documentElement.getAttribute(
            'data-local-fullstack-private-read-gate'
          ) === 'released'
          && document.documentElement.getAttribute(
            'data-local-fullstack-private-roster-failure'
          ) === 'injected'
          && publicReadyProbe.getAttribute(
            'data-local-fullstack-worker-private-sync'
          ) === 'ready'
          && publicReadyProbe.getAttribute(
            'data-local-fullstack-worker-commands'
          ) === 'true'
          && numericAttribute(
            realm,
            'data-worker-private-sync-localized-error-count'
          ) >= 1
          ? true
          : undefined
        ), 15_000);
        if (!privateReady) return { stage: 'reentry-private-retry' };
        const enabledRecallButtons = [...commandCenter.querySelectorAll(
          '.worker-command-center__recall'
        )];
        const enabledRecallAll = workerFooterAction(
          commandCenter,
          'RETURN ALL TO KEEP'
        );
        const recoveredOccupationEvidence = readOccupationEvidence();
        if (
          !commandCenter.isConnected
          || commandCenter.querySelectorAll(
            '.worker-command-center__roster > li'
          ).length !== 4
          || enabledRecallButtons.length !== 3
          || enabledRecallButtons.some((button) => !(
            button instanceof HTMLButtonElement
            && !button.disabled
          ))
          || !(enabledRecallAll instanceof HTMLButtonElement)
          || enabledRecallAll.disabled
          || recoveredOccupationEvidence.markerCount
            !== occupationEvidence.markerCount
          || recoveredOccupationEvidence.distinctMarkerCount
            !== recoveredOccupationEvidence.markerCount
          || /EXPEDITIONS|\\bWAGON\\b/i.test(commandCenter.textContent ?? '')
          || !lifecycleStable()
        ) return { stage: 'reentry-private-in-place-recovery' };

        const recoveredPrivateEvidence = readContinuityEvidence(publicReadyProbe);
        if (
          recoveredPrivateEvidence.publicRevisions
            !== expectedSetup.publicAssignmentRevisions
          || recoveredPrivateEvidence.privateRevisions
            !== expectedSetup.privateAssignmentRevisions
          || !/^\\d+$/.test(recoveredPrivateEvidence.privateResourceRevision)
          || BigInt(recoveredPrivateEvidence.privateResourceRevision)
            < BigInt(expectedSetup.privateResourceRevision)
          || !routesContinueForward(
            freshPublicContinuity.routes,
            recoveredPrivateEvidence.routes
          )
        ) return { stage: 'reentry-private-revision-continuity' };

        window.dispatchEvent(new CustomEvent(
          '${SET_PRIVATE_WORKER_SEAM_EVENT}',
          { detail: 'reconnect-gated' }
        ));
        window.dispatchEvent(new Event('${REFRESH_ACCESS_EVENT}'));
        const retainedReconnect = await waitFor(() => {
          const evidence = readContinuityEvidence(publicReadyProbe);
          const privatePhase = publicReadyProbe.getAttribute(
            'data-local-fullstack-worker-private-sync'
          );
          return (
            document.documentElement.getAttribute(
              'data-local-fullstack-access-refresh-count'
            ) === '1'
            && document.documentElement.getAttribute(
              'data-local-fullstack-private-seam'
            ) === 'reconnect-waiting'
            && ['reconnecting', 'ready'].includes(
              publicReadyProbe.getAttribute('data-local-fullstack-backend') ?? ''
            )
            && privatePhase !== 'ready'
            && publicReadyProbe.getAttribute(
              'data-local-fullstack-worker-commands'
            ) === 'false'
            && evidence.publicRevisions === expectedSetup.publicAssignmentRevisions
            && evidence.routes.length === 4
            && commandCenter.isConnected
            && lifecycleStable()
          ) ? evidence : undefined;
        }, 20_000);
        if (retainedReconnect === undefined) {
          return { stage: 'reentry-retained-reconnect' };
        }
        const reconnectControlsDisabled = await waitFor(() => {
          const staleRecallButtons = [...commandCenter.querySelectorAll(
            '.worker-command-center__recall'
          )];
          return (
            commandCenter.isConnected
            && lifecycleStable()
            && staleRecallButtons.length === 3
            && staleRecallButtons.every((button) => (
              button instanceof HTMLButtonElement && button.disabled
            ))
          );
        }, 2_000);
        if (!reconnectControlsDisabled) {
          return { stage: 'reentry-retained-reconnect-controls' };
        }
        window.dispatchEvent(new Event('${RELEASE_PRIVATE_WORKER_SEAM_EVENT}'));
        const reconnectRecovered = await waitFor(() => {
          const evidence = readContinuityEvidence(publicReadyProbe);
          return (
            document.documentElement.getAttribute(
              'data-local-fullstack-private-seam'
            ) === 'reconnect-released'
            && publicReadyProbe.getAttribute('data-local-fullstack-backend') === 'ready'
            && publicReadyProbe.getAttribute(
              'data-local-fullstack-worker-private-sync'
            ) === 'ready'
            && publicReadyProbe.getAttribute(
              'data-local-fullstack-worker-commands'
            ) === 'true'
            && evidence.publicRevisions === expectedSetup.publicAssignmentRevisions
            && evidence.privateRevisions === expectedSetup.privateAssignmentRevisions
            && routesContinueForward(retainedReconnect.routes, evidence.routes)
            && commandCenter.isConnected
            && lifecycleStable()
          ) ? evidence : undefined;
        }, 35_000);
        if (!reconnectRecovered) {
          return {
            stage: 'reentry-retained-reconnect-recovery',
            seamState: document.documentElement.getAttribute(
              'data-local-fullstack-private-seam'
            ) ?? 'missing',
            backendPhase: publicReadyProbe.getAttribute(
              'data-local-fullstack-backend'
            ) ?? 'missing',
            privatePhase: publicReadyProbe.getAttribute(
              'data-local-fullstack-worker-private-sync'
            ) ?? 'missing',
            commandsEnabled: publicReadyProbe.getAttribute(
              'data-local-fullstack-worker-commands'
            ) ?? 'missing',
            privateRevisionMatches:
              readContinuityEvidence(publicReadyProbe).privateRevisions
                === expectedSetup.privateAssignmentRevisions,
            commandCenterConnected: commandCenter.isConnected,
            lifecycleStable: lifecycleStable()
          };
        }

        const recallRemaining = workerFooterAction(
          commandCenter,
          'RETURN ALL TO KEEP'
        );
        if (!(recallRemaining instanceof HTMLButtonElement) || recallRemaining.disabled) {
          return { stage: 'reentry-recall-all-control' };
        }
        recallRemaining.click();
        const recallAllReturning = await waitFor(() => {
          const evidence = readContinuityEvidence(publicReadyProbe);
          return (
            publicReadyProbe.getAttribute(
              'data-local-fullstack-recallable-workers'
            ) === '0'
            && /^1:returning:\\d+:\\d+,2:returning:\\d+:\\d+,3:returning:\\d+:\\d+,4:returning:\\d+:\\d+$/
              .test(evidence.publicRevisions)
            && /^1:returning:\\d+,2:returning:\\d+,3:returning:\\d+,4:returning:\\d+$/
              .test(evidence.privateRevisions)
            && evidence.routes.length === 4
            && evidence.routes.every((route) => route.status === 'returning')
            && /^\\d+$/.test(evidence.privateResourceRevision)
            && BigInt(evidence.privateResourceRevision)
              > BigInt(reconnectRecovered.privateResourceRevision)
            && publicReadyProbe.getAttribute(
              'data-local-fullstack-private-resource-has-pending'
            ) === 'false'
          ) ? evidence : undefined;
        }, 10_000);
        if (recallAllReturning === undefined || !lifecycleStable()) {
          return { stage: 'reentry-recall-all-returning' };
        }
        await new Promise((resolve) => setTimeout(resolve, 640));
        const recallAllProgressed = await waitFor(() => {
          const evidence = readContinuityEvidence(publicReadyProbe);
          return evidence.routes.length === 4
            && evidence.routes.every((route, index) => (
              route.status === 'returning'
              && route.phaseProgress
                > (recallAllReturning.routes[index]?.phaseProgress ?? 10_000)
              && route.forwardProgress
                < (recallAllReturning.routes[index]?.forwardProgress ?? 0)
              && (
                route.worldX !== recallAllReturning.routes[index]?.worldX
                || route.worldZ !== recallAllReturning.routes[index]?.worldZ
              )
            ))
            ? evidence
            : undefined;
        }, 5_000);
        if (recallAllProgressed === undefined || !lifecycleStable()) {
          return { stage: 'reentry-recall-all-progress' };
        }

        const allReturned = await waitFor(() => {
          const deployed = publicReadyProbe.getAttribute(
            'data-local-fullstack-deployed-workers'
          );
          const recallable = publicReadyProbe.getAttribute(
            'data-local-fullstack-recallable-workers'
          );
          const workerPresence = numericAttribute(
            canvas,
            'data-realm-worker-presence-count'
          );
          const visibleRoutes = numericAttribute(
            canvas,
            'data-realm-worker-visible-route-count'
          );
          const presentationInactive =
            canvas.getAttribute('data-realm-presentation-active') === 'false';
          const occupations = readOccupationEvidence();
          return (
            deployed === '0'
            && recallable === '0'
            && workerPresence === 0
            // An opaque full-screen destination deliberately idles rendering.
            // Its last visual route count may remain frozen until presentation
            // resumes, but active presentation must already expose zero.
            && (
              visibleRoutes === 0
              || (
                presentationInactive
                && Number.isSafeInteger(visibleRoutes)
                && visibleRoutes >= 0
                && visibleRoutes <= 4
              )
            )
            && occupations.markerCount === 0
          ) ? true : undefined;
        }, 60_000);
        if (!allReturned) {
          const occupations = readOccupationEvidence();
          return {
            stage: 'reentry-recall-completion',
            deployedWorkerCount: Number(publicReadyProbe.getAttribute(
              'data-local-fullstack-deployed-workers'
            )),
            recallableWorkerCount: Number(publicReadyProbe.getAttribute(
              'data-local-fullstack-recallable-workers'
            )),
            workerPresenceCount: numericAttribute(
              canvas,
              'data-realm-worker-presence-count'
            ),
            visibleRouteCount: numericAttribute(
              canvas,
              'data-realm-worker-visible-route-count'
            ),
            occupationMarkerCount: occupations.markerCount,
            presentationInactive:
              canvas.getAttribute('data-realm-presentation-active') === 'false'
          };
        }

        const releasedDispatchProjection = await waitFor(() => {
          const value = publicReadyProbe.getAttribute(
            'data-local-fullstack-dispatch-sites'
          ) ?? '';
          const expectedSites = expectedSetup.dispatchSiteCoordinates.split(';');
          return expectedSites.every((site) => value.split(';').includes(site))
            ? value
            : undefined;
        }, 10_000);
        if (!releasedDispatchProjection || !lifecycleStable()) {
          return { stage: 'reentry-node-release' };
        }

        const workerCenterBack = commandCenter.querySelector(
          'button[aria-label="Back to Realm menu"]'
        );
        if (!(workerCenterBack instanceof HTMLButtonElement)) {
          return { stage: 'reentry-reuse-menu-return' };
        }
        workerCenterBack.click();
        const reuseMenu = await waitFor(() => document.querySelector(
          '.realm-profile-menu__panel'
        ));
        if (!(reuseMenu instanceof HTMLElement)) {
          return { stage: 'reentry-reuse-menu-open' };
        }
        const reuseSite = fixtureDispatchSites[0];
        if (!reuseSite || !await navigateToResourceSite(reuseSite)) {
          return { stage: 'reentry-reuse-navigation' };
        }
        const reuseDispatch = await waitFor(() => document.querySelector(
          '.realm-node-worker-dispatch'
        ));
        const reuseWorker = reuseDispatch instanceof HTMLElement
          ? [...reuseDispatch.querySelectorAll('button')].find((button) => (
              button instanceof HTMLButtonElement
              && !button.disabled
              && (button.getAttribute('aria-label') ?? '').startsWith('Worker 1 —')
            ))
          : undefined;
        if (!(reuseWorker instanceof HTMLButtonElement)) {
          return { stage: 'reentry-reuse-dispatch-control' };
        }
        reuseWorker.click();
        const reusedNode = await waitFor(() => {
          const evidence = readContinuityEvidence(publicReadyProbe);
          const details = document.querySelector(
            '.realm-resource-occupant-details[data-resource-occupant-details="true"]'
          );
          return (
            publicReadyProbe.getAttribute(
              'data-local-fullstack-deployed-workers'
            ) === '1'
            && evidence.routes.length === 1
            && details instanceof HTMLElement
          ) ? details : undefined;
        }, 10_000);
        if (!(reusedNode instanceof HTMLElement) || !lifecycleStable()) {
          return { stage: 'reentry-node-reuse' };
        }
        const reuseRecall = await waitFor(() => {
          const control = document.querySelector(
            '.realm-resource-occupant-details__recall'
          );
          return control instanceof HTMLButtonElement
            && !control.disabled
            && publicReadyProbe.getAttribute(
              'data-local-fullstack-worker-private-sync'
            ) === 'ready'
            && publicReadyProbe.getAttribute(
              'data-local-fullstack-worker-commands'
            ) === 'true'
            ? control
            : undefined;
        }, 10_000);
        if (!(reuseRecall instanceof HTMLButtonElement) || reuseRecall.disabled) {
          return { stage: 'reentry-reuse-recall' };
        }
        reuseRecall.click();
        const reuseReturned = await waitFor(() => (
          publicReadyProbe.getAttribute(
            'data-local-fullstack-deployed-workers'
          ) === '0'
          && readContinuityEvidence(publicReadyProbe).routes.length === 0
            ? true
            : undefined
        ), 20_000);
        if (!reuseReturned || !lifecycleStable()) {
          return { stage: 'reentry-reuse-completion' };
        }

        await new Promise((resolve) => (
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        ));
        if (
          !lifecycleStable()
          || lifecycleObservation.blockingOverlayFrames !== 0
          || lifecycleObservation.blockingOverlayInsertions !== 0
          || lifecycleObservation.blockingOverlayVisibleTransitions !== 0
        ) return { stage: 'reentry-final-lifecycle' };
        const ordinaryLifecycle = {
          generation: numericAttribute(realm, 'data-renderer-generation'),
          creationCount: numericAttribute(realm, 'data-realm-scene-creation-count'),
          disposalCount: numericAttribute(realm, 'data-realm-scene-disposal-count'),
          cameraRestoreCount: numericAttribute(
            realm,
            'data-realm-camera-attestation-restore-count'
          )
        };
        const activeCanvas = realm.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        const webgl = activeCanvas instanceof HTMLCanvasElement
          ? activeCanvas.getContext('webgl2') ?? activeCanvas.getContext('webgl')
          : null;
        const contextController = webgl?.getExtension('WEBGL_lose_context');
        if (!contextController) return { stage: 'reentry-context-control' };
        contextController.loseContext();
        const recoveryVisible = await waitFor(() => {
          const overlay = document.querySelector('.realm-map-screen__loading');
          return (
            realm.getAttribute('data-renderer-state') === 'recovering'
            && realm.getAttribute('data-renderer-failure') === 'context-lost'
            && realm.getAttribute('aria-busy') === 'true'
            && overlay instanceof HTMLElement
            && visible(overlay)
            && /Restoring the Realm/i.test(overlay.textContent ?? '')
          ) ? true : undefined;
        }, 10_000);
        if (!recoveryVisible) return { stage: 'reentry-context-loss' };
        await new Promise((resolve) => setTimeout(resolve, 64));
        contextController.restoreContext();
        const rendererRecovered = await waitFor(() => (
          realm.getAttribute('data-renderer-state') === 'ready'
          && realm.getAttribute('data-renderer-failure') === 'none'
          && realm.getAttribute('aria-busy') === 'false'
          && realm.getAttribute('data-realm-last-scene-recreation-reason')
            === 'renderer-recovery'
          && numericAttribute(realm, 'data-renderer-generation')
            === ordinaryLifecycle.generation + 1
          && numericAttribute(realm, 'data-realm-scene-creation-count')
            === ordinaryLifecycle.creationCount + 1
          && numericAttribute(realm, 'data-realm-scene-disposal-count')
            === ordinaryLifecycle.disposalCount + 1
          && numericAttribute(realm, 'data-realm-camera-attestation-restore-count')
            === ordinaryLifecycle.cameraRestoreCount + 1
          && realm.querySelector(
            'canvas[data-realm-canvas-active="true"]'
          ) instanceof HTMLCanvasElement
            ? true
            : undefined
        ), 30_000);
        if (!rendererRecovered) return { stage: 'reentry-context-recovery' };

        const reuseClose = document.querySelector(
          'button[aria-label^="CLOSE "]'
        );
        if (reuseClose instanceof HTMLButtonElement) reuseClose.click();
        const profileTriggerAfterRecovery = realm.querySelector(
          '.realm-profile-trigger'
        );
        if (!(profileTriggerAfterRecovery instanceof HTMLButtonElement)) {
          return { stage: 'reentry-sign-out-menu-trigger' };
        }
        profileTriggerAfterRecovery.click();
        const signOutRealmMenu = await waitFor(() => document.querySelector(
          '.realm-profile-menu__panel'
        ));
        const mainMenu = signOutRealmMenu instanceof HTMLElement
          ? [...signOutRealmMenu.querySelectorAll('button')].find((button) => (
              (button.querySelector('strong')?.textContent ?? '').trim() === 'MAIN MENU'
            ))
          : undefined;
        if (!(mainMenu instanceof HTMLButtonElement)) {
          return { stage: 'reentry-sign-out-main-menu' };
        }
        mainMenu.click();
        const menuIdentity = await waitFor(() => document.querySelector(
          '.warpkeep-menu-identity button'
        ));
        if (!(menuIdentity instanceof HTMLButtonElement)) {
          return { stage: 'reentry-sign-out-identity' };
        }
        menuIdentity.click();
        const signOut = await waitFor(() => buttonWithText('SIGN OUT'));
        if (!(signOut instanceof HTMLButtonElement) || signOut.disabled) {
          return { stage: 'reentry-sign-out-control' };
        }
        signOut.click();
        const authorityCleared = await waitFor(() => (
          publicReadyProbe.getAttribute('data-local-fullstack-auth') === 'anonymous'
          && publicReadyProbe.getAttribute('data-local-fullstack-backend') === 'idle'
          && publicReadyProbe.getAttribute(
            'data-local-fullstack-worker-private-sync'
          ) === 'not-required'
          && publicReadyProbe.getAttribute(
            'data-local-fullstack-worker-commands'
          ) === 'false'
          && !document.querySelector('main[aria-label="Hegemony realm"]')
            ? true
            : undefined
        ), 10_000);
        if (!authorityCleared) return { stage: 'reentry-sign-out-authority' };
        const html = document.documentElement.innerHTML;
        return {
          stage: 'persistent-worker-reentry-complete',
          publicWorkerCount: dynamicPresentationReady.presented,
          publicActiveWorkerCount: 4,
          publicOccupationCount: reentryPublicOccupationCount,
          visibleOccupationCount: occupationEvidence.markerCount,
          readyResourcePortraitCount:
            occupationEvidence.readyResourcePortraitCount,
          readyWorkerPortraitCount:
            occupationEvidence.readyWorkerPortraitCount,
          readyPortraitCount: occupationEvidence.readyPortraitCount,
          workerRows: workerRows.length,
          enabledRecallCountBeforePrivateReady: recallButtons.length,
          enabledRecallCountAfterPrivateReady: enabledRecallButtons.length,
          privateDelayMilliseconds: Math.floor(privateDelayMilliseconds),
          privateFailureLocalized: true,
          inPlaceRecovery: true,
          assignmentRevisionContinuity: true,
          routePoseContinuity: true,
          fourPhaseReentryConfirmed: true,
          gatheringRecallConfirmed: true,
          automaticSettlementConfirmed: true,
          recallAllConfirmed: true,
          returnProgressConfirmed: true,
          releasedNodeReuseConfirmed: true,
          retainedReconnectConfirmed: true,
          accessRefreshConfirmed: true,
          rendererRecoveryConfirmed: true,
          authorityCleared: true,
          sceneGenerationChange:
            ordinaryLifecycle.generation - initialLifecycle.generation,
          sceneCreationChange:
            ordinaryLifecycle.creationCount - initialLifecycle.creationCount,
          sceneDisposalChange:
            ordinaryLifecycle.disposalCount - initialLifecycle.disposalCount,
          cameraRestoreChange:
            ordinaryLifecycle.cameraRestoreCount - initialLifecycle.cameraRestoreCount,
          rendererRecoveryGenerationChange:
            numericAttribute(realm, 'data-renderer-generation')
            - ordinaryLifecycle.generation,
          rendererRecoveryCreationChange:
            numericAttribute(realm, 'data-realm-scene-creation-count')
            - ordinaryLifecycle.creationCount,
          rendererRecoveryDisposalChange:
            numericAttribute(realm, 'data-realm-scene-disposal-count')
            - ordinaryLifecycle.disposalCount,
          rendererRecoveryCameraRestoreChange:
            numericAttribute(realm, 'data-realm-camera-attestation-restore-count')
            - ordinaryLifecycle.cameraRestoreCount,
          blockingLoadingOverlayFrames: lifecycleObservation.blockingOverlayFrames,
          blockingLoadingOverlayInsertions:
            lifecycleObservation.blockingOverlayInsertions,
          blockingLoadingOverlayVisibleTransitions:
            lifecycleObservation.blockingOverlayVisibleTransitions,
          noLegacyExpeditions: true,
          tokenAbsent: !/(?:LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF|LOCAL_QA_SYNTHETIC_MESSAGE|eyJ[A-Za-z0-9_-]{20,}\\.)/.test(html),
          storageEmpty: localStorage.length === 0 && sessionStorage.length === 0,
          cleanupConfirmed: true
        };
      } finally {
        stopLifecycleObservation();
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, COMMAND_TIMEOUT_MILLISECONDS);
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.stage !== 'persistent-worker-reentry-complete'
    || value.publicWorkerCount !== 28
    || value.publicActiveWorkerCount !== 4
    || value.publicOccupationCount !== 3
    || value.visibleOccupationCount !== 1
    || !Number.isSafeInteger(value.readyResourcePortraitCount)
    || value.readyResourcePortraitCount < 0
    || !Number.isSafeInteger(value.readyWorkerPortraitCount)
    || value.readyWorkerPortraitCount < 0
    || !Number.isSafeInteger(value.readyPortraitCount)
    || value.readyPortraitCount < 1
    || value.readyResourcePortraitCount + value.readyWorkerPortraitCount
      !== value.readyPortraitCount
    || value.workerRows !== 4
    || value.enabledRecallCountBeforePrivateReady !== 3
    || value.enabledRecallCountAfterPrivateReady !== 3
    || !Number.isSafeInteger(value.privateDelayMilliseconds)
    || value.privateDelayMilliseconds < 3_000
    || value.privateFailureLocalized !== true
    || value.inPlaceRecovery !== true
    || value.assignmentRevisionContinuity !== true
    || value.routePoseContinuity !== true
    || value.fourPhaseReentryConfirmed !== true
    || value.gatheringRecallConfirmed !== true
    || value.automaticSettlementConfirmed !== true
    || value.recallAllConfirmed !== true
    || value.returnProgressConfirmed !== true
    || value.releasedNodeReuseConfirmed !== true
    || value.retainedReconnectConfirmed !== true
    || value.accessRefreshConfirmed !== true
    || value.rendererRecoveryConfirmed !== true
    || value.authorityCleared !== true
    || value.sceneGenerationChange !== 0
    || value.sceneCreationChange !== 0
    || value.sceneDisposalChange !== 0
    || value.cameraRestoreChange !== 0
    || value.rendererRecoveryGenerationChange !== 1
    || value.rendererRecoveryCreationChange !== 1
    || value.rendererRecoveryDisposalChange !== 1
    || value.rendererRecoveryCameraRestoreChange !== 1
    || value.blockingLoadingOverlayFrames !== 0
    || value.blockingLoadingOverlayInsertions !== 0
    || value.blockingLoadingOverlayVisibleTransitions !== 0
    || value.noLegacyExpeditions !== true
    || value.tokenAbsent !== true
    || value.storageEmpty !== true
    || value.cleanupConfirmed !== true
  ) {
    const safeStage = typeof value?.stage === 'string'
      && /^[a-z0-9-]{1,64}$/.test(value.stage)
      ? value.stage
      : 'unknown';
    const safeOccupationState = safeStage === 'reentry-public-occupation-presentation'
      ? ` (${[
          'markerCount',
          'distinctMarkerCount',
          'reservedCount',
          'readyPortraitCount'
        ].map((key) => {
          const count = value?.[key];
          return Number.isSafeInteger(count) && count >= 0 && count <= 100
            ? String(count)
            : 'invalid';
        }).join('/')})`
      : '';
    const safeWorkerPresentationState =
      safeStage === 'reentry-public-worker-presentation'
        ? ` (${[
            'presented',
            'animated',
            'presence',
            'suppressedPresences',
            'routes',
            'mismatches',
            'rejectedRoutes',
            'rejectedReconciliations'
          ].map((key) => {
            const count = value?.[key];
            return Number.isSafeInteger(count) && count >= 0 && count <= 500
              ? String(count)
              : 'invalid';
          }).join('/')})`
        : '';
    const safeCompletionState = safeStage === 'persistent-worker-reentry-complete'
      ? ` (counts:${[
          'publicWorkerCount',
          'publicActiveWorkerCount',
          'publicOccupationCount',
          'visibleOccupationCount',
          'readyResourcePortraitCount',
          'readyWorkerPortraitCount',
          'readyPortraitCount',
          'workerRows',
          'enabledRecallCountBeforePrivateReady',
          'enabledRecallCountAfterPrivateReady',
          'privateDelayMilliseconds'
        ].map((key) => {
          const count = value?.[key];
          return Number.isSafeInteger(count) && count >= 0 && count <= 60_000
            ? String(count)
            : 'invalid';
        }).join('/')};lifecycle:${[
          'sceneGenerationChange',
          'sceneCreationChange',
          'sceneDisposalChange',
          'cameraRestoreChange',
          'rendererRecoveryGenerationChange',
          'rendererRecoveryCreationChange',
          'rendererRecoveryDisposalChange',
          'rendererRecoveryCameraRestoreChange',
          'blockingLoadingOverlayFrames',
          'blockingLoadingOverlayInsertions',
          'blockingLoadingOverlayVisibleTransitions'
        ].map((key) => {
          const count = value?.[key];
          return Number.isSafeInteger(count) && count >= 0 && count <= 100
            ? String(count)
            : 'invalid';
        }).join('/')};flags:${[
          'privateFailureLocalized',
          'inPlaceRecovery',
          'assignmentRevisionContinuity',
          'routePoseContinuity',
          'fourPhaseReentryConfirmed',
          'gatheringRecallConfirmed',
          'automaticSettlementConfirmed',
          'recallAllConfirmed',
          'returnProgressConfirmed',
          'releasedNodeReuseConfirmed',
          'retainedReconnectConfirmed',
          'accessRefreshConfirmed',
          'rendererRecoveryConfirmed',
          'authorityCleared',
          'noLegacyExpeditions',
          'tokenAbsent',
          'storageEmpty',
          'cleanupConfirmed'
        ].map((key) => value?.[key] === true ? '1' : '0').join('')})`
      : '';
    const safeReconnectState = safeStage === 'reentry-retained-reconnect-recovery'
      ? ` (${[
          'seamState',
          'backendPhase',
          'privatePhase',
          'commandsEnabled'
        ].map((key) => {
          const state = value?.[key];
          return typeof state === 'string' && /^[a-z-]{1,32}$/.test(state)
            ? state
            : 'invalid';
        }).join('/')}/${[
          'privateRevisionMatches',
          'commandCenterConnected',
          'lifecycleStable'
        ].map((key) => value?.[key] === true ? 'true' : 'false').join('/')})`
      : '';
    const safeReadOnlyMenuState = safeStage === 'reentry-read-only-worker-menu'
      ? ` (flags:${[
          'workersPresent',
          'workersEnabled',
          'fourDeployedCopy',
          'recallAllPresent',
          'recallAllAvailable',
          'readOnlyCopy',
          'legacyCopyAbsent'
        ].map((key) => value?.[key] === true ? '1' : '0').join('')};counts:${[
          'deployedWorkerCount',
          'recallableWorkerCount'
        ].map((key) => {
          const count = value?.[key];
          return Number.isSafeInteger(count) && count >= 0 && count <= 4
            ? String(count)
            : 'invalid';
        }).join('/')})`
      : '';
    const safeRecallCompletionState = safeStage === 'reentry-recall-completion'
      ? ` (counts:${[
          'deployedWorkerCount',
          'recallableWorkerCount',
          'workerPresenceCount',
          'visibleRouteCount',
          'occupationMarkerCount'
        ].map((key) => {
          const count = value?.[key];
          return Number.isSafeInteger(count) && count >= 0 && count <= 100
            ? String(count)
            : 'invalid';
        }).join('/')};presentation-inactive:${
          value?.presentationInactive === true ? 'true' : 'false'
        })`
      : '';
    throw new LocalFullstackBrowserError(
      `Disposable persistent Worker re-entry failed at ${safeStage}${
        safeOccupationState
          || safeWorkerPresentationState
          || safeCompletionState
          || safeReconnectState
          || safeReadOnlyMenuState
          || safeRecallCompletionState
      }.`
    );
  }
  return Object.freeze({ ...value });
}

async function exerciseWorkerPrivateSeamMatrix(session) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const deadline = performance.now() + ${PRESENTATION_TIMEOUT_MILLISECONDS};
      const waitFor = async (predicate, timeout = ${PRESENTATION_TIMEOUT_MILLISECONDS}) => {
        const until = Math.min(deadline, performance.now() + timeout);
        while (performance.now() <= until) {
          try {
            const value = predicate();
            if (value) return value;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return undefined;
      };
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
      const buttonWithText = (text, root = document) => [...root.querySelectorAll('button')]
        .find((button) => visible(button) && (button.textContent ?? '').trim() === text);
      const numericAttribute = (element, name) => {
        const value = element?.getAttribute(name);
        return value !== null && /^(?:0|[1-9]\\d{0,9})$/.test(value ?? '')
          ? Number(value)
          : undefined;
      };
      const enterMenu = await waitFor(() => {
        const candidate = document.querySelector(
          'button[data-command="enter-realm"]'
        );
        return candidate instanceof HTMLButtonElement
          && !candidate.disabled
          && candidate.closest('[inert]') === null
          && visible(candidate)
          ? candidate
          : undefined;
      });
      if (!(enterMenu instanceof HTMLButtonElement)) return { stage: 'seams-menu' };
      enterMenu.click();
      const dialog = await waitFor(() => document.querySelector(
        '[role="dialog"][aria-modal="true"]'
      ));
      const checkbox = dialog?.querySelector('input[type="checkbox"]');
      const continueButton = dialog instanceof HTMLElement
        ? [...dialog.querySelectorAll('button')].find((button) => (
            /^CONTINUE TO /.test((button.textContent ?? '').trim())
          ))
        : undefined;
      if (
        !(checkbox instanceof HTMLInputElement)
        || !(continueButton instanceof HTMLButtonElement)
      ) return { stage: 'seams-terms' };
      checkbox.click();
      if (continueButton.disabled) return { stage: 'seams-terms-control' };
      continueButton.click();
      const probe = await waitFor(() => {
        const candidate = document.querySelector('[data-local-fullstack-backend]');
        return candidate?.getAttribute('data-local-fullstack-auth') === 'authenticated'
          && candidate.getAttribute('data-local-fullstack-backend') === 'ready'
          && candidate.getAttribute(
            'data-local-fullstack-public-assignment-revisions'
          )?.split(',').length === 4
          && document.documentElement.getAttribute(
            'data-local-fullstack-private-timeout'
          ) === 'waiting'
          ? candidate
          : undefined;
      }, 20_000);
      if (!(probe instanceof HTMLOutputElement)) {
        return { stage: 'seams-public-authority' };
      }
      const enterAuthenticated = await waitFor(() => buttonWithText('ENTER REALM'));
      if (!(enterAuthenticated instanceof HTMLButtonElement)) {
        return { stage: 'seams-authenticated-enter' };
      }
      enterAuthenticated.click();
      const realm = await waitFor(() => {
        const candidate = document.querySelector('main[aria-label="Hegemony realm"]');
        return candidate instanceof HTMLElement
          && visible(candidate)
          && candidate.getAttribute('data-renderer-state') === 'ready'
          ? candidate
          : undefined;
      }, 15_000);
      if (!(realm instanceof HTMLElement)) return { stage: 'seams-realm' };
      const resourceRail = realm.querySelector('[aria-label="Your resources"]');
      const resourceRailObservation = {
        invalid: 0,
        samples: 0
      };
      const sampleResourceRail = () => {
        const values = [...(resourceRail?.querySelectorAll(
          '.realm-resource-rail__trigger strong'
        ) ?? [])].slice(0, 4).map((element) => (
          (element.textContent ?? '').trim()
        ));
        if (
          values.length !== 4
          || values.some((value) => !/^\\d+(?:\\.\\d+)?(?:K|M|B|T)?$/.test(value))
        ) resourceRailObservation.invalid += 1;
        else resourceRailObservation.samples += 1;
      };
      sampleResourceRail();
      const resourceRailObserver = new MutationObserver(sampleResourceRail);
      if (resourceRail instanceof HTMLElement) {
        resourceRailObserver.observe(resourceRail, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true
        });
      }
      const initialLifecycle = {
        generation: numericAttribute(realm, 'data-renderer-generation'),
        creation: numericAttribute(realm, 'data-realm-scene-creation-count'),
        disposal: numericAttribute(realm, 'data-realm-scene-disposal-count')
      };
      const lifecycleStable = () => (
        document.querySelector('main[aria-label="Hegemony realm"]') === realm
        && numericAttribute(realm, 'data-renderer-generation')
          === initialLifecycle.generation
        && numericAttribute(realm, 'data-realm-scene-creation-count')
          === initialLifecycle.creation
        && numericAttribute(realm, 'data-realm-scene-disposal-count')
          === initialLifecycle.disposal
        && realm.getAttribute('data-realm-blocking-loading-overlay-visible') === 'false'
      );
      const trigger = realm.querySelector('.realm-profile-trigger');
      if (!(trigger instanceof HTMLButtonElement)) return { stage: 'seams-menu-trigger' };
      trigger.click();
      const realmMenu = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
      if (!(realmMenu instanceof HTMLElement)) return { stage: 'seams-worker-menu' };
      const timedOut = await waitFor(() => (
        document.documentElement.getAttribute(
          'data-local-fullstack-private-timeout'
        ) === 'timed-out-hidden'
        && probe.getAttribute('data-local-fullstack-worker-private-sync')
          === 'failed-localized'
        && probe.getAttribute('data-local-fullstack-worker-commands') === 'false'
        && probe.getAttribute(
          'data-local-fullstack-worker-private-failure-reason'
        ) === 'control-state-timeout'
          ? true
          : undefined
      ), 20_000);
      if (!timedOut) return { stage: 'seams-timeout' };
      const firstResourceTrigger = resourceRail?.querySelector(
        '.realm-resource-rail__trigger'
      );
      if (!(firstResourceTrigger instanceof HTMLButtonElement)) {
        return { stage: 'seams-resource-rail-trigger' };
      }
      firstResourceTrigger.click();
      const lastConfirmedTooltip = await waitFor(() => {
        const status = resourceRail?.querySelector(
          '.realm-resource-tooltip:not([hidden]) .realm-resource-tooltip__status'
        )?.textContent ?? '';
        return /Last confirmed balance/i.test(status) ? true : undefined;
      }, 5_000);
      if (!lastConfirmedTooltip) {
        return { stage: 'seams-last-confirmed-tooltip' };
      }
      window.dispatchEvent(new Event('${RESTORE_TIMEOUT_VISIBILITY_EVENT}'));
      const retry = await waitFor(() => buttonWithText(
        'RETRY WORKER CONTROLS',
        realmMenu
      ));
      if (!(retry instanceof HTMLButtonElement) || retry.disabled) {
        return { stage: 'seams-explicit-retry-control' };
      }
      retry.click();
      const timeoutRecovered = await waitFor(() => (
        document.documentElement.getAttribute(
          'data-local-fullstack-private-timeout'
        ) === 'retry-released'
        && probe.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
        && probe.getAttribute('data-local-fullstack-worker-commands') === 'true'
        && numericAttribute(
          realm,
          'data-worker-private-sync-localized-error-count'
        ) >= 1
        && lifecycleStable()
          ? true
          : undefined
      ), 15_000);
      if (!timeoutRecovered) return { stage: 'seams-timeout-recovery' };
      firstResourceTrigger.click();
      const currentTooltip = await waitFor(() => {
        const status = resourceRail?.querySelector(
          '.realm-resource-tooltip:not([hidden]) .realm-resource-tooltip__status'
        )?.textContent ?? '';
        return /\\d+ available/i.test(status) ? true : undefined;
      }, 5_000);
      if (!currentTooltip) return { stage: 'seams-current-tooltip' };
      const timeoutFailureCount = numericAttribute(
        realm,
        'data-worker-private-sync-localized-error-count'
      );
      const failureReceipts = [];
      const reasonSeamDiagnostic = () => ({
        observedReason: probe.getAttribute(
          'data-local-fullstack-worker-private-failure-reason'
        ) ?? '',
        injectedReason: document.documentElement.getAttribute(
          'data-local-fullstack-private-injected-reason'
        ) ?? '',
        privatePhase: probe.getAttribute(
          'data-local-fullstack-worker-private-sync'
        ) ?? '',
        commandsEnabled: probe.getAttribute(
          'data-local-fullstack-worker-commands'
        ) === 'true',
        localizedFailureCount: numericAttribute(
          realm,
          'data-worker-private-sync-localized-error-count'
        ) ?? 0
      });
      const exerciseReasonSeam = async (detail, expectedReason, timeout = 10_000) => {
        const before = numericAttribute(
          realm,
          'data-worker-private-sync-localized-error-count'
        ) ?? 0;
        window.dispatchEvent(new CustomEvent(
          '${SET_PRIVATE_WORKER_SEAM_EVENT}',
          { detail }
        ));
        window.dispatchEvent(new Event('online'));
        const failed = await waitFor(() => (
          probe.getAttribute('data-local-fullstack-worker-private-failure-reason')
            === expectedReason
          && probe.getAttribute('data-local-fullstack-worker-commands') === 'false'
          && ['retry-wait', 'failed-localized'].includes(
            probe.getAttribute('data-local-fullstack-worker-private-sync') ?? ''
          )
          && document.documentElement.getAttribute(
            'data-local-fullstack-private-injected-reason'
          ) === expectedReason
          && (numericAttribute(
            realm,
            'data-worker-private-sync-localized-error-count'
          ) ?? 0) > before
          && lifecycleStable()
            ? true
            : undefined
        ), timeout);
        if (!failed) return false;
        failureReceipts.push(detail + ':' + expectedReason);
        window.dispatchEvent(new Event('${RELEASE_PRIVATE_WORKER_SEAM_EVENT}'));
        window.dispatchEvent(new Event('online'));
        const recovered = Boolean(await waitFor(() => (
          probe.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
          && probe.getAttribute('data-local-fullstack-worker-commands') === 'true'
          && probe.getAttribute(
            'data-local-fullstack-worker-private-failure-reason'
          ) === ''
          && lifecycleStable()
            ? true
            : undefined
        ), 10_000));
        if (!recovered) return false;
        // React publishes the ready projection just before the provider clears
        // its in-flight guard. Give that finally block one bounded turn so the
        // next injected seam cannot be coalesced into the preceding recovery.
        await new Promise((resolve) => setTimeout(resolve, 128));
        return probe.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
          && probe.getAttribute('data-local-fullstack-worker-commands') === 'true';
      };
      const exerciseDelayedSeam = async (detail) => {
        window.dispatchEvent(new CustomEvent(
          '${SET_PRIVATE_WORKER_SEAM_EVENT}',
          { detail }
        ));
        window.dispatchEvent(new Event('online'));
        const waiting = await waitFor(() => (
          document.documentElement.getAttribute(
            'data-local-fullstack-private-seam'
          ) === detail + '-waiting'
            ? true
            : undefined
        ), 5_000);
        if (!waiting) return false;
        window.dispatchEvent(new Event('${RELEASE_PRIVATE_WORKER_SEAM_EVENT}'));
        window.dispatchEvent(new Event('online'));
        return Boolean(await waitFor(() => (
          probe.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
          && probe.getAttribute('data-local-fullstack-worker-commands') === 'true'
          && lifecycleStable()
            ? true
            : undefined
        ), 10_000));
      };

      for (const [detail, reason] of [
        ['control-malformed', 'control-state-decode-invalid'],
        ['control-wrong-caller', 'wrong-caller'],
        ['control-public-revision', 'public-private-worker-revision-mismatch'],
        ['control-status-site', 'worker-status-or-site-mismatch'],
        ['control-pending-mismatch', 'pending-total-mismatch'],
        ['control-resource-policy', 'resource-policy-mismatch'],
        ['control-worker-policy', 'worker-policy-mismatch'],
        ['control-worker-mode', 'worker-system-mode-mismatch'],
        ['control-rejected', 'procedure-rejected'],
        ['fallback-roster-missing', 'roster-decode-invalid'],
        ['fallback-resource-missing', 'resource-decode-invalid'],
        ['fallback-roster-rejected', 'procedure-rejected'],
        ['fallback-resource-rejected', 'procedure-rejected'],
        ['fallback-torn-timestamp', 'pending-total-mismatch']
      ]) {
        if (!await exerciseReasonSeam(detail, reason)) {
          return {
            stage: 'seams-' + detail,
            ...reasonSeamDiagnostic()
          };
        }
      }
      if (!await exerciseDelayedSeam('fallback-roster-delayed')) {
        return { stage: 'seams-fallback-roster-delayed' };
      }
      if (!await exerciseDelayedSeam('fallback-resource-delayed')) {
        return { stage: 'seams-fallback-resource-delayed' };
      }
      if (!await exerciseReasonSeam(
        'fallback-roster-timeout',
        'roster-timeout',
        20_000
      )) return {
        stage: 'seams-fallback-roster-timeout',
        ...reasonSeamDiagnostic()
      };
      if (!await exerciseReasonSeam(
        'fallback-resource-timeout',
        'resource-timeout',
        20_000
      )) return {
        stage: 'seams-fallback-resource-timeout',
        ...reasonSeamDiagnostic()
      };

      window.dispatchEvent(new CustomEvent(
        '${SET_PRIVATE_WORKER_SEAM_EVENT}',
        { detail: 'resource-missing' }
      ));
      window.dispatchEvent(new Event('online'));
      const resourceRecovered = await waitFor(() => (
        document.documentElement.getAttribute(
          'data-local-fullstack-private-resource-missing'
        ) === 'injected'
        && probe.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
        && probe.getAttribute('data-local-fullstack-worker-commands') === 'true'
        && numericAttribute(
          realm,
          'data-worker-private-sync-localized-error-count'
        ) > timeoutFailureCount
        && lifecycleStable()
          ? true
          : undefined
      ), 10_000);
      if (!resourceRecovered) return { stage: 'seams-resource-missing' };

      window.dispatchEvent(new CustomEvent(
        '${SET_PRIVATE_WORKER_SEAM_EVENT}',
        { detail: 'torn-pair' }
      ));
      window.dispatchEvent(new Event('online'));
      const tornRecovered = await waitFor(() => (
        document.documentElement.getAttribute(
          'data-local-fullstack-private-torn-pair'
        ) === 'injected'
        && probe.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
        && probe.getAttribute('data-local-fullstack-worker-commands') === 'true'
        && lifecycleStable()
          ? true
          : undefined
      ), 10_000);
      if (!tornRecovered) return { stage: 'seams-torn-pair' };

      const ownHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
      const ownVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      const restoreVisibility = () => {
        if (ownHidden) Object.defineProperty(document, 'hidden', ownHidden);
        else Reflect.deleteProperty(document, 'hidden');
        if (ownVisibility) {
          Object.defineProperty(document, 'visibilityState', ownVisibility);
        } else Reflect.deleteProperty(document, 'visibilityState');
      };
      window.dispatchEvent(new CustomEvent(
        '${SET_PRIVATE_WORKER_SEAM_EVENT}',
        { detail: 'visibility-gated' }
      ));
      window.dispatchEvent(new Event('online'));
      const visibilityReadStarted = await waitFor(() => (
        document.documentElement.getAttribute(
          'data-local-fullstack-private-seam'
        ) === 'visibility-waiting'
          ? true
          : undefined
      ));
      if (!visibilityReadStarted) return { stage: 'seams-visibility-start' };
      try {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => true
        });
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden'
        });
        document.dispatchEvent(new Event('visibilitychange'));
        const paused = await waitFor(() => (
          probe.getAttribute('data-local-fullstack-worker-private-sync')
            === 'stale-read-only'
          && probe.getAttribute('data-local-fullstack-worker-commands') === 'false'
            ? true
            : undefined
        ), 5_000);
        if (!paused) return { stage: 'seams-visibility-pause' };
        window.dispatchEvent(new Event('${RELEASE_PRIVATE_WORKER_SEAM_EVENT}'));
        await new Promise((resolve) => setTimeout(resolve, 96));
      } finally {
        restoreVisibility();
      }
      document.dispatchEvent(new Event('visibilitychange'));
      const visibilityRecovered = await waitFor(() => (
        document.documentElement.getAttribute(
          'data-local-fullstack-private-seam'
        ) === 'visibility-released'
        && probe.getAttribute('data-local-fullstack-worker-private-sync') === 'ready'
        && probe.getAttribute('data-local-fullstack-worker-commands') === 'true'
        && lifecycleStable()
          ? true
          : undefined
      ), 10_000);
      if (!visibilityRecovered) return { stage: 'seams-visibility-recovery' };
      resourceRailObserver.disconnect();
      const html = document.documentElement.innerHTML;
      return {
        stage: 'worker-private-seam-matrix-complete',
        timeoutExplicitRetry: true,
        failureReceiptCount: failureReceipts.length,
        distinctFailureReceiptCount: new Set(failureReceipts).size,
        independentDelaySeams: true,
        independentTimeoutSeams: true,
        resourceRailNumericSamples: resourceRailObservation.samples,
        resourceRailInvalidSamples: resourceRailObservation.invalid,
        resourceTooltipFreshness: lastConfirmedTooltip && currentTooltip,
        resourceMissingRecovered: true,
        tornPairRecovered: true,
        visibilityPauseResume: true,
        sceneGenerationChange:
          numericAttribute(realm, 'data-renderer-generation')
          - initialLifecycle.generation,
        sceneCreationChange:
          numericAttribute(realm, 'data-realm-scene-creation-count')
          - initialLifecycle.creation,
        sceneDisposalChange:
          numericAttribute(realm, 'data-realm-scene-disposal-count')
          - initialLifecycle.disposal,
        tokenAbsent: !/(?:LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF|LOCAL_QA_SYNTHETIC_MESSAGE|eyJ[A-Za-z0-9_-]{20,}\\.)/.test(html),
        storageEmpty: localStorage.length === 0 && sessionStorage.length === 0
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, COMMAND_TIMEOUT_MILLISECONDS);
  const value = result?.result?.value;
  if (
    result?.exceptionDetails
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.stage !== 'worker-private-seam-matrix-complete'
    || value.timeoutExplicitRetry !== true
    || value.failureReceiptCount !== 16
    || value.distinctFailureReceiptCount !== 16
    || value.independentDelaySeams !== true
    || value.independentTimeoutSeams !== true
    || !Number.isSafeInteger(value.resourceRailNumericSamples)
    || value.resourceRailNumericSamples < 1
    || value.resourceRailInvalidSamples !== 0
    || value.resourceTooltipFreshness !== true
    || value.resourceMissingRecovered !== true
    || value.tornPairRecovered !== true
    || value.visibilityPauseResume !== true
    || value.sceneGenerationChange !== 0
    || value.sceneCreationChange !== 0
    || value.sceneDisposalChange !== 0
    || value.tokenAbsent !== true
    || value.storageEmpty !== true
  ) {
    const safeStage = typeof value?.stage === 'string'
      && /^[a-z0-9-]{1,64}$/.test(value.stage)
      ? value.stage
      : 'unknown';
    const safeReasonState = safeStage.startsWith('seams-')
      ? ` (${[
          'observedReason',
          'injectedReason',
          'privatePhase'
        ].map((key) => {
          const state = value?.[key];
          return typeof state === 'string' && /^[a-z-]{0,64}$/.test(state)
            ? state || 'empty'
            : 'invalid';
        }).join('/')}/${
          value?.commandsEnabled === true ? 'enabled' : 'disabled'
        }/${
          Number.isSafeInteger(value?.localizedFailureCount)
          && value.localizedFailureCount >= 0
          && value.localizedFailureCount <= 1_000
            ? String(value.localizedFailureCount)
            : 'invalid'
        })`
      : '';
    throw new LocalFullstackBrowserError(
      `Disposable Worker private seam matrix failed at ${safeStage}${safeReasonState}.`
    );
  }
  return Object.freeze({ ...value });
}

export function installLocalFullstackSignalCleanup(cleanup, processTarget = process) {
  if (typeof cleanup !== 'function') throw new TypeError('Invalid signal cleanup.');
  let handling = false;
  const handlers = Object.fromEntries(['SIGINT', 'SIGTERM'].map((signal) => [
    signal,
    async () => {
      if (handling) return;
      handling = true;
      let code = signal === 'SIGINT' ? 130 : 143;
      try { await cleanup(); } catch { code = 1; }
      remove();
      processTarget.exit(code);
    },
  ]));
  const remove = () => {
    for (const [signal, handler] of Object.entries(handlers)) {
      processTarget.removeListener(signal, handler);
    }
  };
  for (const [signal, handler] of Object.entries(handlers)) {
    processTarget.on(signal, handler);
  }
  return remove;
}

export async function runLocalFullstackBrowserProbe(options = {}) {
  let runtimeRoot;
  let runtimeAllocationPromise;
  let databaseRuntime;
  let viteRuntime;
  let chromeProfile;
  let database;
  let vite;
  let provisionalVite;
  let viteStartPromise;
  let chrome;
  let devtools;
  let browserState;
  let databaseLifecycle;
  let bootstrapPlugin;
  let cleanupPromise;
  let cancelled = false;
  const cleanup = () => {
    cancelled = true;
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      let firstFailure;
      try {
        const allocatedRuntimeRoot = await runtimeAllocationPromise;
        runtimeRoot ??= allocatedRuntimeRoot;
      } catch {
        // A failed allocation has no runtime root to remove.
      }
      try {
        await viteStartPromise;
      } catch {
        // A failed or cancelled Vite constructor is contained below.
      }
      try {
        await cleanupRenderedWebglProbeResources({
          chrome,
          devtools,
          removeProfile: async () => {},
          vite: vite ?? provisionalVite,
        });
      } catch (error) {
        firstFailure = error;
      }
      try {
        bootstrapPlugin?.closeBundle?.call({});
      } catch (error) {
        firstFailure ??= error;
      }
      try {
        await (database?.close?.() ?? databaseLifecycle?.close?.());
      } catch (error) {
        firstFailure ??= error;
      }
      if (runtimeRoot) {
        try { await rm(runtimeRoot, { recursive: true, force: true }); } catch (error) {
          firstFailure ??= error;
        }
      }
      if (firstFailure) throw firstFailure;
    })();
    return cleanupPromise;
  };
  const assertRunning = () => {
    if (cancelled) throw new Error('Disposable full-stack browser startup was cancelled.');
  };
  const removeSignalCleanup = installLocalFullstackSignalCleanup(cleanup);
  let probeStage = 'runtime-allocation';
  try {
    runtimeAllocationPromise = mkdtemp(join(tmpdir(), 'warpkeep-fullstack-browser-'));
    runtimeRoot = await runtimeAllocationPromise;
    assertRunning();
    databaseRuntime = join(runtimeRoot, 'spacetime');
    viteRuntime = join(runtimeRoot, 'vite');
    chromeProfile = join(runtimeRoot, 'chrome');
    await chmod(runtimeRoot, 0o700);
    const metadata = await lstat(runtimeRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('Disposable full-stack browser root was unsafe.');
    }
    await Promise.all([
      mkdir(databaseRuntime, { mode: 0o700 }),
      mkdir(viteRuntime, { mode: 0o700 }),
      mkdir(chromeProfile, { mode: 0o700 }),
    ]);
    assertRunning();
    probeStage = 'database-start';
    database = await startDisposableLocalFullstackSpacetime({
      runtimeDirectory: databaseRuntime,
      environment: options.environment,
      spacetimeExecutable: options.spacetimeExecutable,
      onLifecycle(lifecycle) {
        databaseLifecycle = lifecycle;
      },
    });
    if (
      database.seedAttestation?.castleCount !== 7
      || database.seedAttestation.workerCount !== 28
      || database.seedAttestation.entryAgreementAcceptedCurrent !== true
      || database.seedAttestation.entryAgreementRequiredVersion
        !== '2026-07-19-hegemony-entry-agreement-v3'
      || database.seedAttestation.genericAssignments !== 0
      || database.seedAttestation.genericOccupations !== 0
      || database.seedAttestation.genericSchedules !== 0
      || database.seedAttestation.legacyExpeditions !== 0
      || database.seedAttestation.legacyOccupations !== 0
      || database.seedAttestation.legacySchedules !== 0
    ) throw new Error('Disposable production-shaped seed was invalid.');
    assertRunning();
    probeStage = 'vite-start';
    bootstrapPlugin = localFullstackBootstrapVitePlugin(database.bootstrap);
    viteStartPromise = createLoopbackViteServer(viteRuntime, [
      bootstrapPlugin,
    ]).then(async (createdVite) => {
      provisionalVite = createdVite;
      if (cancelled) {
        await createdVite.close();
        provisionalVite = undefined;
        throw new Error('Disposable full-stack browser startup was cancelled.');
      }
      vite = createdVite;
      provisionalVite = undefined;
      return createdVite;
    });
    await viteStartPromise;
    assertRunning();
    const viteOrigin = `http://127.0.0.1:${vite.port}`;
    const spacetimeOrigin = exactLoopbackOrigin(database.bootstrap.spacetimeUri);
    if (!spacetimeOrigin) throw new Error('Disposable SpacetimeDB origin was invalid.');
    const pageUrl = `${viteOrigin}${FULLSTACK_ROUTE}#menu`;
    const titleUrl = `${viteOrigin}${FULLSTACK_ROUTE}`;
    const pfpBytes = await readFile(join(
      REPOSITORY_ROOT,
      'public/images/factions/hegemony/marks/hegemony-mark-128.png'
    ));
    const pfpBody = pfpBytes.toString('base64');
    pfpBytes.fill(0);
    assertRunning();
    probeStage = 'chrome-attestation';
    const reviewedChromeIdentity = await attestStableHeadlessChromeExecutable();
    assertRunning();
    probeStage = 'chrome-launch';
    chrome = spawnHeadlessChromeProbe(chromeProfile);
    const launchedChromeIdentity = await readReviewedChromeExecutableIdentity();
    assertRunning();
    if (!exactChromeExecutableIdentity(reviewedChromeIdentity, launchedChromeIdentity)) {
      throw new Error('The reviewed Google Chrome executable changed at launch.');
    }
    let state = {
      targetId: '',
      violation: '',
      pendingFetchAction: '',
      backendDiagnostic: '',
      controlledRendererRecovery: false,
      controlledRendererWarningCount: 0,
      controlledRendererWarningThrottleSeen: false,
    };
    browserState = state;
    const createDisposableDevtools = (browserProcess, activeState) => (
      new DevtoolsPipeSession(browserProcess, (method, params, session) => {
      const state = activeState;
      if (method === 'Fetch.requestPaused') {
        const url = params?.request?.url;
        if (url === LOCAL_FULLSTACK_PROFILE_URL) {
          state.pendingFetchAction = 'profile-fulfillment';
          void session.command('Fetch.fulfillRequest', {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: 'Access-Control-Allow-Origin', value: viteOrigin },
              { name: 'Cache-Control', value: 'no-store' },
              { name: 'Content-Type', value: 'image/png' },
              { name: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
            ],
            body: pfpBody,
          }).then(() => {
            if (state.pendingFetchAction === 'profile-fulfillment') {
              state.pendingFetchAction = '';
            }
          }).catch(() => { state.violation = 'profile-fulfillment'; });
        } else if (isAllowedLocalFullstackBrowserUrl(url, viteOrigin, spacetimeOrigin)) {
          state.pendingFetchAction = 'fetch-continue';
          void session.command('Fetch.continueRequest', {
            requestId: params.requestId,
          }).then(() => {
            if (state.pendingFetchAction === 'fetch-continue') {
              state.pendingFetchAction = '';
            }
          }).catch(() => { state.violation = 'fetch-continue'; });
        } else {
          state.violation = 'fetch';
          state.pendingFetchAction = 'fetch-denial';
          void session.command('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'BlockedByClient',
          }).then(() => {
            if (state.pendingFetchAction === 'fetch-denial') {
              state.pendingFetchAction = '';
            }
          }).catch(() => {});
        }
        return;
      }
      if (method === 'Network.requestWillBeSent') {
        if (!isAllowedLocalFullstackBrowserUrl(
          params?.request?.url,
          viteOrigin,
          spacetimeOrigin,
        )) state.violation = 'network';
        return;
      }
      if (method === 'Network.webSocketCreated') {
        if (!isAllowedLocalFullstackBrowserUrl(params?.url, viteOrigin, spacetimeOrigin)) {
          state.violation = 'websocket';
        }
        return;
      }
      if (method === 'Page.frameNavigated' && !params?.frame?.parentId) {
        if (!exactNavigationUrl(params?.frame?.url, pageUrl)) {
          state.violation = navigationViolationCategory(params?.frame?.url, pageUrl);
        }
        return;
      }
      if (
        method === 'Page.windowOpen'
        || method === 'Page.downloadWillBegin'
      ) {
        state.violation = 'page-side-effect';
        return;
      }
      if (method === 'Runtime.exceptionThrown') {
        const rawDetail = params?.exceptionDetails?.exception?.description
          ?? params?.exceptionDetails?.text
          ?? 'unknown';
        const safeDetail = String(rawDetail)
          .split('\n', 1)[0]
          .replace(/[^A-Za-z0-9 .:_()-]/g, '')
          .slice(0, 96) || 'unknown';
        state.violation = `runtime-exception-${safeDetail}`;
        return;
      }
      if (
        method === 'Runtime.consoleAPICalled'
        && ['assert', 'error'].includes(params?.type)
      ) {
        state.violation = 'console-error';
        return;
      }
      if (method === 'Runtime.consoleAPICalled' && params?.type === 'info') {
        const value = params?.args?.length === 1
          && params.args[0]?.type === 'string'
          ? params.args[0].value
          : undefined;
        if (
          typeof value === 'string'
          && /^warpkeep_(?:backend|resource)_[a-z_]+(?::[a-z_]+)?$/.test(value)
          && (
            state.backendDiagnostic === ''
            || value.startsWith('warpkeep_backend_connection_failed:')
          )
        ) state.backendDiagnostic = value;
        return;
      }
      if (
        method === 'Log.entryAdded'
        && ['error', 'warning'].includes(params?.entry?.level)
      ) {
        const controlledWarningKind = state.controlledRendererRecovery
          ? controlledRendererRecoveryWarningKind(
              params.entry,
              viteOrigin,
              viteRuntime
            )
          : null;
        if (
          controlledWarningKind === 'stale-context-object-delete'
          && !state.controlledRendererWarningThrottleSeen
          && state.controlledRendererWarningCount
            < CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS
        ) {
          state.controlledRendererWarningCount += 1;
          return;
        }
        if (
          controlledWarningKind === 'stale-context-warning-throttle'
          && !state.controlledRendererWarningThrottleSeen
          && state.controlledRendererWarningCount > 0
        ) {
          state.controlledRendererWarningThrottleSeen = true;
          return;
        }
        state.violation = params.entry.level === 'warning' ? 'log-warning' : 'log-error';
        return;
      }
      if (method === 'Target.targetDestroyed' || method === 'Target.targetCrashed') {
        state.violation = params?.targetId === state.targetId ? 'target-lost' : 'target-id';
        return;
      }
      if (method === 'Target.detachedFromTarget' || method === 'Inspector.detached') {
        state.violation = 'target-detached';
        return;
      }
      if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
        const target = params?.targetInfo;
        if (target?.targetId !== state.targetId) state.violation = 'target-id';
        else if (target?.type !== 'page') state.violation = 'target-type';
        else if (target.url && !exactNavigationUrl(target.url, pageUrl)) {
          state.violation = 'target-url';
        }
      }
    }));
    const connectDisposableDevtools = async (browserProcess, activeState) => {
      const session = createDisposableDevtools(browserProcess, activeState);
      probeStage = 'devtools-open';
      await session.open();
      probeStage = 'target-selection';
      const target = selectBlankPageTarget(await session.browserCommand(
        'Target.getTargets',
        { filter: [{ type: 'page', exclude: false }, { exclude: true }] }
      ));
      activeState.targetId = target.targetId;
      probeStage = 'target-attach';
      await session.attachToPage(target.targetId);
      for (const [label, browserScope, method, parameters] of [
        ['page-domain', false, 'Page.enable'],
        ['runtime-domain', false, 'Runtime.enable'],
        ['log-domain', false, 'Log.enable'],
        ['network-domain', false, 'Network.enable'],
        ['download-denial', false, 'Page.setDownloadBehavior', { behavior: 'deny' }],
        ['target-discovery', true, 'Target.setDiscoverTargets', {
          discover: true,
          filter: [{ type: 'page', exclude: false }, { exclude: true }],
        }],
        ['fetch-interception', false, 'Fetch.enable', {
          patterns: [{ urlPattern: '*', requestStage: 'Request' }],
        }],
        ['viewport-emulation', false, 'Emulation.setDeviceMetricsOverride', {
          width: VIEWPORT.width,
          height: VIEWPORT.height,
          screenWidth: VIEWPORT.width,
          screenHeight: VIEWPORT.height,
          deviceScaleFactor: 1,
          mobile: false,
        }],
        ['motion-emulation', false, 'Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
        }],
      ]) {
        probeStage = `browser-setup-${label}`;
        try {
          await (browserScope
            ? session.browserCommand(method, parameters)
            : session.command(method, parameters));
        } catch (error) {
          throw new Error(
            `Disposable browser setup failed at ${label}.`,
            { cause: error }
          );
        }
      }
      return session;
    };
    devtools = await connectDisposableDevtools(chrome, state);
    probeStage = 'title-gateway-departure-focus';
    const titleGatewayDepartureFocus = await exerciseTitleGatewayDepartureFocus(
      devtools,
      titleUrl,
      (caseId) => {
        if (state.violation) {
          throw new LocalFullstackBrowserError(
            `Title gateway departure focus left its boundary at ${caseId}: ${
              state.violation
            }.`
          );
        }
      }
    );
    if (state.violation) {
      throw new Error(
        `Disposable title browser left its boundary: ${state.violation}.`
      );
    }
    probeStage = 'restored-current-entry-navigation';
    await devtools.command('Page.navigate', {
      url: `${viteOrigin}${FULLSTACK_ROUTE}${RESTORED_CURRENT_AGREEMENT_SEARCH}#menu`,
    });
    // Page.navigate acknowledges the request before the replacement execution
    // context is guaranteed to exist. Do not evaluate the restored-session
    // proof against the title matrix document being torn down.
    await delay(500);
    probeStage = 'restored-current-entry-continuity';
    const restoredEntryAgreementContinuity =
      await exerciseRestoredEntryAgreementContinuity(devtools);
    if (state.violation) {
      throw new Error(
        `Disposable restored Terms browser left its boundary: ${state.violation}.`
      );
    }
    probeStage = 'title-browser-stop';
    devtools.close();
    await terminateHeadlessChromeProcessGroup(chrome);
    devtools = undefined;
    chrome = undefined;
    probeStage = 'production-shaped-worker-preparation';
    const preparedSeedAttestation = await database.prepareWorkerScenario();
    if (
      preparedSeedAttestation?.castleCount !== 7
      || preparedSeedAttestation.workerCount !== 28
      || !Number.isSafeInteger(preparedSeedAttestation.ownerCastleId)
      || preparedSeedAttestation.ownerCastleId <= 0
      || !/^[1-9]\d*$/.test(preparedSeedAttestation.ownerStoredWood)
      || !/^[1-9]\d*$/.test(preparedSeedAttestation.ownerPendingWood)
      || !/^[1-9]\d*$/.test(preparedSeedAttestation.ownerResourceRevision)
      || !Array.isArray(preparedSeedAttestation.ownerWorkerRevisions)
      || preparedSeedAttestation.ownerWorkerRevisions.length !== 4
      || preparedSeedAttestation.ownerWorkerRevisions.some(
        (revision) => !/^[1-9]\d*$/.test(revision)
      )
      || preparedSeedAttestation.genericAssignments !== 4
      || preparedSeedAttestation.genericOccupations !== 3
      || preparedSeedAttestation.genericSchedules !== 4
      || preparedSeedAttestation.legacyExpeditions !== 0
      || preparedSeedAttestation.legacyOccupations !== 0
      || preparedSeedAttestation.legacySchedules !== 0
    ) throw new Error('Disposable prepared Worker seed was invalid.');
    probeStage = 'setup-browser-profile';
    chromeProfile = join(runtimeRoot, 'chrome-setup');
    await mkdir(chromeProfile, { mode: 0o700 });
    probeStage = 'setup-browser-launch';
    chrome = spawnHeadlessChromeProbe(chromeProfile);
    const setupChromeIdentity = await readReviewedChromeExecutableIdentity();
    if (!exactChromeExecutableIdentity(reviewedChromeIdentity, setupChromeIdentity)) {
      throw new Error('The reviewed Google Chrome executable changed at setup.');
    }
    state = {
      targetId: '',
      violation: '',
      pendingFetchAction: '',
      backendDiagnostic: '',
      controlledRendererRecovery: false,
      controlledRendererWarningCount: 0,
      controlledRendererWarningThrottleSeen: false,
    };
    browserState = state;
    devtools = await connectDisposableDevtools(chrome, state);
    const setupChromePid = chrome.pid;
    const setupChromeProfile = chromeProfile;
    const setupDevtoolsSession = devtools;
    const setupTargetId = state.targetId;
    probeStage = 'page-navigation';
    await devtools.command('Page.navigate', { url: pageUrl });
    await delay(500);
    probeStage = 'persistent-worker-setup';
    const persistentWorkerSetup = await exerciseLocalFullstackJourney(
      devtools,
      'persistent-worker-reentry'
    );
    const hardReloadUrl =
      `${viteOrigin}${FULLSTACK_ROUTE}${RESTORED_CURRENT_AGREEMENT_SEARCH}#menu`;
    probeStage = 'persistent-worker-hard-reload-restore-seam';
    const hardReloadSeam = await devtools.command('Runtime.evaluate', {
      expression: `(() => {
        const nextUrl = ${JSON.stringify(
          `${FULLSTACK_ROUTE}${RESTORED_CURRENT_AGREEMENT_SEARCH}#menu`
        )};
        history.replaceState(null, '', nextUrl);
        return location.href;
      })()`,
      returnByValue: true,
    });
    if (
      hardReloadSeam?.exceptionDetails
      || hardReloadSeam?.result?.value !== hardReloadUrl
    ) {
      throw new Error(
        'The persistent Worker reload did not establish its retained-session seam.'
      );
    }
    probeStage = 'persistent-worker-hard-reload-navigation';
    await devtools.command('Page.reload', { ignoreCache: true });
    // Page.reload acknowledges the navigation request before the replacement
    // execution context is guaranteed to exist. Avoid evaluating the continuity
    // journey against the context being torn down.
    await delay(500);
    probeStage = 'persistent-worker-hard-reload-continuity';
    const hardReloadWorkerContinuity =
      await exerciseHardReloadWorkerContinuity(devtools);
    if (state.violation) {
      throw new Error(
        `Disposable setup browser left its boundary: ${state.violation}.`
      );
    }
    probeStage = 'persistent-worker-isolated-browser-stop';
    devtools.close();
    await terminateHeadlessChromeProcessGroup(chrome);
    devtools = undefined;
    chrome = undefined;
    chromeProfile = join(runtimeRoot, 'chrome-reentry');
    await mkdir(chromeProfile, { mode: 0o700 });
    assertRunning();
    probeStage = 'persistent-worker-isolated-browser-launch';
    chrome = spawnHeadlessChromeProbe(chromeProfile);
    const reentryChromeIdentity = await readReviewedChromeExecutableIdentity();
    if (!exactChromeExecutableIdentity(reviewedChromeIdentity, reentryChromeIdentity)) {
      throw new Error('The reviewed Google Chrome executable changed at re-entry.');
    }
    state = {
      targetId: '',
      violation: '',
      pendingFetchAction: '',
      backendDiagnostic: '',
      controlledRendererRecovery: false,
      controlledRendererWarningCount: 0,
      controlledRendererWarningThrottleSeen: false,
    };
    browserState = state;
    devtools = await connectDisposableDevtools(chrome, state);
    const freshBrowserProcess = Number.isSafeInteger(setupChromePid)
      && Number.isSafeInteger(chrome.pid)
      && setupChromePid > 0
      && chrome.pid > 0
      && setupChromePid !== chrome.pid;
    const freshBrowserProfile = setupChromeProfile !== chromeProfile
      && setupChromeProfile === join(runtimeRoot, 'chrome-setup')
      && chromeProfile === join(runtimeRoot, 'chrome-reentry');
    const freshDevtoolsSession = setupDevtoolsSession !== devtools
      && typeof setupTargetId === 'string'
      && setupTargetId.length > 0
      && typeof state.targetId === 'string'
      && state.targetId.length > 0
      && setupTargetId !== state.targetId;
    if (
      !freshBrowserProcess
      || !freshBrowserProfile
      || !freshDevtoolsSession
    ) {
      throw new Error(
        'The persistent Worker re-entry did not establish a fresh isolated browser.'
      );
    }
    probeStage = 'persistent-worker-isolated-reentry-navigation';
    await devtools.command('Page.navigate', {
      url: `${viteOrigin}${FULLSTACK_ROUTE}${PERSISTENT_WORKER_REENTRY_SEARCH}#menu`,
    });
    await delay(500);
    probeStage = 'persistent-worker-hard-reentry';
    state.controlledRendererRecovery = true;
    state.controlledRendererWarningCount = 0;
    state.controlledRendererWarningThrottleSeen = false;
    let persistentWorkerReentry;
    try {
      persistentWorkerReentry = Object.freeze({
        ...await exercisePersistentWorkerReentry(
          devtools,
          persistentWorkerSetup
        ),
        freshBrowserProcess,
        freshBrowserProfile,
        freshDevtoolsSession,
      });
      // Let the exact, bounded stale-context diagnostics emitted by the
      // deliberate WEBGL_lose_context recovery reach CDP before closing the
      // allowance. Every unrelated warning remains fail-closed.
      await delay(100);
    } finally {
      state.controlledRendererRecovery = false;
    }
    probeStage = 'worker-private-seam-matrix-navigation';
    await devtools.command('Page.navigate', {
      url: `${viteOrigin}${FULLSTACK_ROUTE}${WORKER_PRIVATE_SEAM_MATRIX_SEARCH}#menu`,
    });
    await delay(500);
    probeStage = 'worker-private-seam-matrix';
    const workerPrivateSeamMatrix = await exerciseWorkerPrivateSeamMatrix(devtools);
    probeStage = 'normal-journey-navigation';
    await devtools.command('Page.navigate', { url: pageUrl });
    await delay(500);
    probeStage = 'browser-journey';
    const journey = await exerciseLocalFullstackJourney(devtools);
    probeStage = 'visual-capture';
    const visual = await captureCredibleScreenshot(devtools);
    if (state.violation) {
      throw new Error(`Disposable browser left its boundary: ${state.violation}.`);
    }
    return Object.freeze({
      journey,
      hardReloadWorkerContinuity,
      moduleDigest: database.moduleDigest,
      persistentWorkerReentry,
      restoredEntryAgreementContinuity,
      titleGatewayDepartureFocus,
      visual,
      workerPrivateSeamMatrix,
    });
  } catch (error) {
    if (error instanceof LocalFullstackRuntimeError) throw error;
    if (error instanceof LocalFullstackBrowserError) {
      const diagnostic = browserState?.backendDiagnostic;
      if (diagnostic) {
        throw new LocalFullstackBrowserError(
          `${error.message.replace(/\.$/, '')} (${diagnostic}).`
        );
      }
      throw error;
    }
    const boundary = browserState?.violation
      || browserState?.pendingFetchAction
      || browserState?.backendDiagnostic;
    const failureKind = error instanceof Error
      && /^[A-Za-z]+Error$/.test(error.name)
      ? error.name
      : 'failure';
    throw new LocalFullstackBrowserError(
      `Disposable browser probe failed closed at ${probeStage}${
        boundary ? ` (${boundary})` : ` (${failureKind})`
      }.`
    );
  } finally {
    try {
      await cleanup();
    } finally {
      removeSignalCleanup();
    }
  }
}

async function main() {
  if (process.argv.length !== 2) {
    process.stderr.write('Usage: local-fullstack-browser-probe\n');
    process.exitCode = 64;
    return;
  }
  try {
    const result = await runLocalFullstackBrowserProbe();
    process.stdout.write(
      'Warpkeep disposable local full-stack QA passed: one title-gateway departure/focus '
      + `matrix (${result.titleGatewayDepartureFocus.caseCount} cases, ${
        result.titleGatewayDepartureFocus.frameCount
      } frames), one restored exact-current server Terms continuity skip, `
      + 'one synthetic cold auth/bootstrap/Terms '
      + 'journey, one hard four-phase Worker re-entry from a fresh browser process '
      + '(two outbound, one gathering, one returning) with delayed/failing private '
      + 'reads and in-place control recovery, one timeout/missing/torn/visibility private-seam '
      + 'matrix, one canonical 10,000-cell browser realm, one '
      + 'Gold/Food/Wood/Stone '
      + 'four-worker dispatch, outbound individual recall, gathering Recall All, '
      + 'automatic settlement, and return-completion '
      + `lifecycle with released-node reuse, plus visual aggregate ${
        JSON.stringify(result.visual)
      }.\n`
    );
  } catch (error) {
    const detail = error instanceof LocalFullstackRuntimeError
      || error instanceof LocalFullstackBrowserError
      ? ` ${error.message}`
      : '';
    process.stderr.write(`Warpkeep disposable local full-stack QA failed closed.${detail}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
