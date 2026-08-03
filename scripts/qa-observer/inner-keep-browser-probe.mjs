import { chmod, lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DevtoolsPipeSession,
  attestStableHeadlessChromeExecutable,
  cleanupRenderedWebglProbeResources,
  createLoopbackViteServer,
  exactChromeExecutableIdentity,
  formatRenderedWebglLocalDiagnostic,
  isAllowedRenderedWebglPageUrl,
  readReviewedChromeExecutableIdentity,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe,
} from './rendered-webgl-browser-probe.mjs';
import {
  INNER_KEEP_QA_CASE_COUNT,
  INNER_KEEP_QA_MAX_READY_MILLISECONDS,
  assertInnerKeepQaScenarioEvidence,
  innerKeepQaBrowserCases,
} from './inner-keep-qa-contract.mjs';

const CDP_TIMEOUT_MILLISECONDS = 10_000;
const POLL_MILLISECONDS = 40;
const SCREENSHOT_CASES = new Set([
  'empty',
  'construction-50-percent',
  'compact-quality',
  'missing-asset-fallback',
  '2d-fallback',
]);

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function runtimeValue(result) {
  const candidate = result?.result;
  if (
    !candidate
    || typeof candidate !== 'object'
    || candidate.type !== 'object'
    || !Object.hasOwn(candidate, 'value')
    || result.exceptionDetails !== undefined
  ) throw new Error('Inner Keep QA browser returned invalid aggregate evidence.');
  return candidate.value;
}

function evidenceExpression(expectedLevel) {
  return `(() => {
    const root = document.querySelector('[data-inner-keep-qa-scenario]');
    const screen = document.querySelector('.inner-keep');
    if (!(root instanceof HTMLElement) || !(screen instanceof HTMLElement)) return null;
    const integer = (name) => {
      const value = root.getAttribute(name);
      return value !== null && /^(?:0|[1-9]\\d*)$/.test(value) ? Number(value) : -1;
    };
    const progressValue = root.getAttribute('data-inner-keep-qa-progress-bps');
    const progressBasisPoints = progressValue === 'none'
      ? null
      : progressValue !== null && /^(?:0|[1-9]\\d*)$/.test(progressValue)
        ? Number(progressValue)
        : -1;
    const bodyText = document.body?.innerText ?? '';
    const documentWidth = Math.max(
      document.documentElement?.scrollWidth ?? 0,
      document.body?.scrollWidth ?? 0
    );
    const documentHeight = Math.max(
      document.documentElement?.scrollHeight ?? 0,
      document.body?.scrollHeight ?? 0
    );
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const expectedLevel = ${expectedLevel === null ? 'null' : JSON.stringify(expectedLevel)};
    return {
      version: 1,
      scenario: root.getAttribute('data-inner-keep-qa-scenario'),
      renderMode: root.getAttribute('data-inner-keep-qa-render-mode'),
      innerKeepRenderer: screen.getAttribute('data-inner-keep-renderer'),
      quality: root.getAttribute('data-inner-keep-qa-quality'),
      reducedMotion: root.getAttribute('data-inner-keep-qa-reduced-motion') === 'true',
      status: root.getAttribute('data-inner-keep-qa-status'),
      progressBasisPoints,
      canvasCount: document.querySelectorAll('canvas[data-inner-keep-qa-canvas]').length,
      rendererCount: integer('data-inner-keep-qa-renderer-count'),
      webglContextCount: integer('data-inner-keep-qa-webgl-context-count'),
      rafOwnerCount: integer('data-inner-keep-qa-raf-owner-count'),
      maximumPendingRafCount: integer('data-inner-keep-qa-maximum-pending-raf-count'),
      slotControlCount: document.querySelectorAll('[data-inner-keep-slot-id]').length,
      enabledSlotControlCount:
        document.querySelectorAll('[data-inner-keep-slot-id]:not(:disabled)').length,
      slotCount: integer('data-inner-keep-qa-slot-count'),
      slotGeometryCount: integer('data-inner-keep-qa-slot-geometry-count'),
      smokeSpriteCount: integer('data-inner-keep-qa-smoke-sprite-count'),
      constructionSiteCount: integer('data-inner-keep-qa-construction-site-count'),
      completedBuildingCount: integer('data-inner-keep-qa-completed-building-count'),
      finalModelCount: integer('data-inner-keep-qa-final-model-count'),
      scaffoldPresent: root.getAttribute('data-inner-keep-qa-scaffold-present') === 'true',
      completionRevealActive:
        root.getAttribute('data-inner-keep-qa-completion-reveal-active') === 'true',
      assetFallbackCount: document.querySelectorAll('.inner-keep-building-art-fallback').length,
      builderBusyVisible: bodyText.includes('BUILDER OCCUPIED'),
      insufficientResourcesVisible: bodyText.includes('Not enough Food.'),
      levelVisible: expectedLevel === null || bodyText.includes('Level ' + expectedLevel),
      viewportWidth,
      viewportHeight,
      documentWidth,
      documentHeight,
      horizontalOverflow: documentWidth > viewportWidth + 1,
      verticalOverflow: documentHeight > viewportHeight + 1
    };
  })()`;
}

async function readEvidence(session, probeCase) {
  const result = await session.command('Runtime.evaluate', {
    expression: evidenceExpression(probeCase.scenario.level),
    returnByValue: true,
  });
  return runtimeValue(result);
}

async function waitForEvidence(session, probeCase, phase = 'steady') {
  const deadline = Date.now() + INNER_KEEP_QA_MAX_READY_MILLISECONDS;
  let lastFailure;
  while (Date.now() < deadline) {
    try {
      const value = await readEvidence(session, probeCase);
      return assertInnerKeepQaScenarioEvidence(value, probeCase.id, phase);
    } catch (error) {
      lastFailure = error;
      await delay(POLL_MILLISECONDS);
    }
  }
  throw new Error('Inner Keep QA browser readiness deadline exceeded.', {
    cause: lastFailure,
  });
}

function assertPngCapture(value, viewport) {
  if (
    typeof value !== 'string'
    || value.length < 4_096
    || value.length > 16 * 1_024 * 1_024
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)
  ) throw new Error('Inner Keep QA screenshot capture was invalid.');
  const bytes = Buffer.from(value, 'base64');
  try {
    if (
      bytes.byteLength < 33
      || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) !== viewport.width
      || bytes.readUInt32BE(20) !== viewport.height
    ) throw new Error('Inner Keep QA screenshot dimensions mismatched.');
  } finally {
    bytes.fill(0);
  }
}

async function captureSyntheticScreenshot(session, viewport) {
  const result = await session.command('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  }, CDP_TIMEOUT_MILLISECONDS * 2);
  if (Object.keys(result ?? {}).length !== 1) {
    throw new Error('Inner Keep QA screenshot response was invalid.');
  }
  assertPngCapture(result.data, viewport);
}

async function assertReducedMotionSettles(session) {
  const expression = `document.querySelector('[data-inner-keep-qa-scenario]')
    ?.getAttribute('data-inner-keep-qa-requested-raf-count') ?? null`;
  await delay(250);
  const first = runtimeValue(await session.command('Runtime.evaluate', {
    expression: `({ value: ${expression} })`,
    returnByValue: true,
  }))?.value;
  await delay(350);
  const second = runtimeValue(await session.command('Runtime.evaluate', {
    expression: `({ value: ${expression} })`,
    returnByValue: true,
  }))?.value;
  if (!/^(?:0|[1-9]\d*)$/u.test(first ?? '') || first !== second) {
    throw new Error('Inner Keep reduced-motion presentation retained an animation loop.');
  }
}

async function observeCompletionReveal(session, probeCase) {
  const clicked = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const control = document.querySelector('[data-inner-keep-qa-complete="true"]');
      if (!(control instanceof HTMLButtonElement) || control.disabled) return { clicked: false };
      control.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  });
  if (runtimeValue(clicked)?.clicked !== true) {
    throw new Error('Inner Keep completion reveal control was unavailable.');
  }
  const revealed = await waitForEvidence(session, probeCase, 'reveal');
  await captureSyntheticScreenshot(session, probeCase.viewport);
  const completed = await waitForEvidence(session, probeCase, 'completed');
  return Object.freeze({ revealed, completed });
}

async function exerciseFunctionalFallback(session) {
  const activated = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const control = document.querySelector('[data-inner-keep-slot-id]');
      if (!(control instanceof HTMLButtonElement) || control.disabled) {
        return { activated: false, panelVisible: false, retainedFallback: false };
      }
      control.click();
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      return {
        activated: true,
        panelVisible: document.querySelector('.inner-keep-panel') !== null,
        retainedFallback:
          document.querySelector('.inner-keep')?.getAttribute('data-inner-keep-renderer')
            === 'fallback'
          && document.querySelectorAll('canvas[data-inner-keep-qa-canvas]').length === 0
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = runtimeValue(activated);
  if (
    value?.activated !== true
    || value.panelVisible !== true
    || value.retainedFallback !== true
  ) throw new Error('Inner Keep functional fallback interaction failed.');
}

async function exerciseWebglNativeKeyboardActivation(session) {
  const focused = runtimeValue(await session.command('Runtime.evaluate', {
    expression: `(() => {
      const control = document.querySelector(
        '[data-inner-keep-slot-id="inner-keep-slot-m01"]'
      );
      if (!(control instanceof HTMLButtonElement) || control.disabled) return null;
      control.focus({ preventScroll: true });
      return {
        active: document.activeElement === control,
        pointerEvents: getComputedStyle(control).pointerEvents,
        renderer: document.querySelector('.inner-keep')
          ?.getAttribute('data-inner-keep-renderer') ?? null
      };
    })()`,
    returnByValue: true,
  }));
  if (
    focused?.active !== true
    || focused.pointerEvents !== 'none'
    || focused.renderer !== 'webgl'
  ) throw new Error('Inner Keep WebGL semantic site index was unavailable.');

  await session.command('Input.dispatchKeyEvent', {
    code: 'Enter',
    key: 'Enter',
    nativeVirtualKeyCode: 13,
    type: 'keyDown',
    windowsVirtualKeyCode: 13,
  });
  await session.command('Input.dispatchKeyEvent', {
    code: 'Enter',
    key: 'Enter',
    nativeVirtualKeyCode: 13,
    type: 'keyUp',
    windowsVirtualKeyCode: 13,
  });

  const deadline = Date.now() + CDP_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const activation = runtimeValue(await session.command('Runtime.evaluate', {
      expression: `(() => {
        const control = document.querySelector(
          '[data-inner-keep-slot-id="inner-keep-slot-m01"]'
        );
        const panel = document.querySelector('.inner-keep-panel');
        return {
          panelLabel: panel?.getAttribute('aria-label') ?? null,
          selected: control?.getAttribute('aria-pressed') === 'true'
        };
      })()`,
      returnByValue: true,
    }));
    if (activation?.selected === true && activation.panelLabel === 'West Courtyard') return;
    await delay(POLL_MILLISECONDS);
  }
  throw new Error('Inner Keep WebGL native Enter activation did not open the site.');
}

async function navigateCase(session, probeCase) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: probeCase.viewport.height,
    mobile: probeCase.viewport.width <= 480,
    screenHeight: probeCase.viewport.height,
    screenWidth: probeCase.viewport.width,
    width: probeCase.viewport.width,
  });
  await session.command('Emulation.setEmulatedMedia', {
    features: [{
      name: 'prefers-reduced-motion',
      value: probeCase.scenario.reducedMotion ? 'reduce' : 'no-preference',
    }],
  });
  await session.command('Page.navigate', { url: probeCase.url });
}

export async function runInnerKeepBrowserProbe(options = {}) {
  const onEvidence = options.onEvidence;
  if (onEvidence !== undefined && typeof onEvidence !== 'function') {
    throw new TypeError('Invalid Inner Keep QA evidence callback.');
  }
  const reviewedChromeIdentity = await attestStableHeadlessChromeExecutable();
  const temporaryProfile = await mkdtemp(join(tmpdir(), 'warpkeep-inner-keep-qa-'));
  let chrome;
  let devtools;
  let vite;
  try {
    const metadata = await lstat(temporaryProfile);
    const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || (expectedUid !== undefined && metadata.uid !== expectedUid)
    ) throw new Error('The disposable Inner Keep Chrome profile is unsafe.');
    const profileDirectory = await realpath(temporaryProfile);
    await chmod(profileDirectory, 0o700);
    vite = await createLoopbackViteServer(profileDirectory);
    const loopbackOrigin = `http://127.0.0.1:${vite.port}`;
    const cases = innerKeepQaBrowserCases(vite.port);
    if (
      cases.length !== INNER_KEEP_QA_CASE_COUNT
      || new Set(cases.map((probeCase) => probeCase.id)).size !== INNER_KEEP_QA_CASE_COUNT
    ) throw new Error('Inner Keep QA case manifest was invalid.');

    await attestStableHeadlessChromeExecutable(reviewedChromeIdentity);
    chrome = spawnHeadlessChromeProbe(profileDirectory);
    const launchedIdentity = await readReviewedChromeExecutableIdentity();
    if (!exactChromeExecutableIdentity(reviewedChromeIdentity, launchedIdentity)) {
      throw new Error('The reviewed Google Chrome executable changed at launch.');
    }
    const allowedUrls = new Set(cases.map((probeCase) => probeCase.url));
    const state = { targetId: '', violation: '' };
    devtools = new DevtoolsPipeSession(chrome, (method, params, session) => {
      if (method === 'Fetch.requestPaused') {
        const requestId = params?.requestId;
        const url = params?.request?.url;
        if (typeof requestId !== 'string') {
          state.violation = 'fetch-shape';
          return;
        }
        if (isAllowedRenderedWebglPageUrl(url, loopbackOrigin)) {
          void session.command('Fetch.continueRequest', { requestId }).catch(() => {
            state.violation = 'fetch-continue';
          });
        } else {
          state.violation = 'fetch';
          void session.command('Fetch.failRequest', {
            errorReason: 'BlockedByClient',
            requestId,
          }).catch(() => {});
        }
        return;
      }
      if (method === 'Page.frameNavigated' && !params?.frame?.parentId) {
        const url = params?.frame?.url;
        if (url !== 'about:blank' && !allowedUrls.has(url)) state.violation = 'navigation';
        return;
      }
      if (method === 'Network.requestWillBeSent') {
        if (!isAllowedRenderedWebglPageUrl(params?.request?.url, loopbackOrigin)) {
          state.violation = 'network';
        }
        return;
      }
      if (method === 'Network.webSocketCreated') {
        if (!isAllowedRenderedWebglPageUrl(params?.url, loopbackOrigin)) {
          state.violation = 'websocket';
        }
        return;
      }
      if (
        method === 'Runtime.exceptionThrown'
        || (method === 'Runtime.consoleAPICalled' && ['assert', 'error'].includes(params?.type))
        || (method === 'Log.entryAdded' && ['warning', 'error'].includes(params?.entry?.level))
      ) {
        state.violation = 'browser-runtime';
        return;
      }
      if (method === 'Page.windowOpen' || method === 'Page.downloadWillBegin') {
        state.violation = 'page-side-effect';
        return;
      }
      if (
        method === 'Target.targetCrashed'
        || method === 'Target.detachedFromTarget'
        || method === 'Inspector.detached'
      ) state.violation = 'browser-target';
    });
    await devtools.open();
    const target = selectBlankPageTarget(await devtools.browserCommand(
      'Target.getTargets',
      { filter: [{ type: 'page', exclude: false }, { exclude: true }] }
    ));
    state.targetId = target.targetId;
    await devtools.attachToPage(target.targetId);
    await Promise.all([
      devtools.command('Page.enable'),
      devtools.command('Runtime.enable'),
      devtools.command('Log.enable'),
      devtools.command('Network.enable'),
      devtools.command('Page.setDownloadBehavior', { behavior: 'deny' }),
      devtools.command('Fetch.enable', {
        patterns: [{ requestStage: 'Request', urlPattern: '*' }],
      }),
    ]);

    for (const probeCase of cases) {
      await navigateCase(devtools, probeCase);
      const evidence = await waitForEvidence(devtools, probeCase);
      if (probeCase.id === '2d-fallback') {
        await exerciseFunctionalFallback(devtools);
      }
      if (SCREENSHOT_CASES.has(probeCase.id)) {
        await captureSyntheticScreenshot(devtools, probeCase.viewport);
      }
      if (probeCase.id === 'empty') {
        await exerciseWebglNativeKeyboardActivation(devtools);
      }
      if (probeCase.id === 'completion-reveal') {
        await observeCompletionReveal(devtools, probeCase);
      }
      if (probeCase.id === 'reduced-motion') {
        await assertReducedMotionSettles(devtools);
      }
      if (state.violation) {
        throw new Error(`Inner Keep QA left its local boundary: ${state.violation}.`);
      }
      onEvidence?.(Object.freeze({
        scenario: evidence.scenario,
        renderMode: evidence.renderMode,
        responsive: !evidence.horizontalOverflow && !evidence.verticalOverflow,
      }));
    }
    return cases.length;
  } finally {
    await cleanupRenderedWebglProbeResources({
      chrome,
      devtools,
      removeProfile: () => rm(temporaryProfile, { force: true, recursive: true }),
      vite,
    });
  }
}

async function main() {
  if (process.argv.length !== 2) {
    process.stderr.write('Usage: inner-keep-browser-probe\n');
    process.exitCode = 64;
    return;
  }
  try {
    const passed = await runInnerKeepBrowserProbe();
    process.stdout.write(
      `Warpkeep local Inner Keep QA passed ${passed} synthetic cases with `
      + 'single-renderer, construction, completion, fallback, and responsive evidence.\n'
    );
  } catch (error) {
    if (process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1') {
      process.stderr.write(
        `Local Inner Keep QA failure: ${formatRenderedWebglLocalDiagnostic(error)}\n`
      );
    }
    process.stderr.write('Warpkeep Inner Keep rendered QA failed closed.\n');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
