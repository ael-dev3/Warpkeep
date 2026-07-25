import { chmod, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DevtoolsPipeSession,
  analyzeRenderedWebglPngScreenshot,
  attestStableHeadlessChromeExecutable,
  cleanupRenderedWebglProbeResources,
  createLoopbackViteServer,
  exactChromeExecutableIdentity,
  readReviewedChromeExecutableIdentity,
  selectBlankPageTarget,
  spawnHeadlessChromeProbe,
} from './rendered-webgl-browser-probe.mjs';
import { localFullstackBootstrapVitePlugin } from './local-fullstack-bootstrap-vite-plugin.mjs';
import {
  LOCAL_FULLSTACK_PROFILE_URL,
  LocalFullstackRuntimeError,
  startDisposableLocalFullstackSpacetime,
} from './local-fullstack-spacetime.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const FULLSTACK_ROUTE = '/dev/fullstack-local-qa.html';
const VIEWPORT = Object.freeze({ width: 1_440, height: 900 });
const COMMAND_TIMEOUT_MILLISECONDS = 125_000;
const PRESENTATION_TIMEOUT_MILLISECONDS = 120_000;
const SCREENSHOT_MAXIMUM_BYTES = 8 * 1_024 * 1_024;

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
      && actual.search === ''
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

async function exerciseLocalFullstackJourney(session) {
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

      const enterMenu = await waitFor(() => (
        document.querySelector('button[data-command="enter-realm"]')
      ));
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
            && probe?.getAttribute('data-local-fullstack-workers') === '4')
          || ['error', 'expired'].includes(authPhase ?? '')
          || backendPhase === 'error'
        ) ? probe : undefined;
      });
      if (
        !(readyProbe instanceof HTMLOutputElement)
        || readyProbe.getAttribute('data-local-fullstack-auth') !== 'authenticated'
        || readyProbe.getAttribute('data-local-fullstack-backend') !== 'ready'
        || readyProbe.getAttribute('data-local-fullstack-workers') !== '4'
      ) {
        const probe = readyProbe ?? document.querySelector('[data-local-fullstack-auth]');
        return {
          stage: 'authority-ready',
          authPhase: probe?.getAttribute('data-local-fullstack-auth') ?? 'missing',
          backendPhase: probe?.getAttribute('data-local-fullstack-backend') ?? 'missing',
          workerCount: probe?.getAttribute('data-local-fullstack-workers') ?? 'missing'
        };
      }
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
      const resourceRail = realm.querySelector('[aria-label="Your resources"]');
      const resourceControls = resourceRail?.querySelectorAll('button').length ?? 0;
      const pfpReady = await waitFor(() => (
        realm.querySelector('.realm-profile-trigger canvas[data-profile-image-state="ready"]')
      ));
      if (!(pfpReady instanceof HTMLCanvasElement)) return { stage: 'profile-image' };

      const menuTrigger = realm.querySelector('.realm-profile-trigger');
      if (!(menuTrigger instanceof HTMLButtonElement)) return { stage: 'realm-menu-trigger' };
      menuTrigger.click();
      const realmMenu = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
      if (!(realmMenu instanceof HTMLElement)) return { stage: 'realm-menu' };
      const workersButton = [...realmMenu.querySelectorAll('button')].find((button) => (
        (button.querySelector('strong')?.textContent ?? '').trim() === 'WORKERS'
      ));
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
      const destination = workerPanel.querySelector('select');
      if (!(destination instanceof HTMLSelectElement) || destination.options.length < 2) {
        return { stage: 'worker-destination' };
      }
      destination.value = destination.options[1].value;
      destination.dispatchEvent(new Event('change', { bubbles: true }));
      const assign = buttonWithText('ASSIGN WORKER', workerPanel);
      if (!(assign instanceof HTMLButtonElement) || assign.disabled) {
        return { stage: 'worker-assign' };
      }
      assign.click();
      const deployed = await waitFor(() => (
        document.querySelector('[data-local-fullstack-deployed-workers="1"]')
      ));
      if (!(deployed instanceof HTMLOutputElement)) return { stage: 'worker-dispatched' };

      const recallable = await waitFor(() => (
        document.querySelector('[data-local-fullstack-recallable-workers="1"]')
      ));
      if (!(recallable instanceof HTMLOutputElement)) {
        return { stage: 'worker-recall-projection' };
      }

      let recall = await waitFor(() => {
        const inspectionRecall = buttonWithText('RETURN TO KEEP');
        const rosterRecall = document.querySelector(
          '.worker-command-center__recall'
        );
        const button = inspectionRecall instanceof HTMLButtonElement
          ? inspectionRecall
          : rosterRecall;
        return button instanceof HTMLButtonElement && !button.disabled
          ? button
          : undefined;
      }, 2_000);
      if (!(recall instanceof HTMLButtonElement)) {
        const profileTrigger = realm.querySelector('.realm-profile-trigger');
        if (!(profileTrigger instanceof HTMLButtonElement)) {
          return { stage: 'worker-recall-menu-trigger' };
        }
        if (profileTrigger.getAttribute('aria-expanded') === 'true') {
          profileTrigger.click();
          const closed = await waitFor(() => (
            profileTrigger.getAttribute('aria-expanded') === 'false'
          ));
          if (!closed) return { stage: 'worker-recall-menu-close' };
        }
        profileTrigger.click();
        const refreshedMenu = await waitFor(() => document.querySelector(
          '.realm-profile-menu__panel'
        ));
        if (!(refreshedMenu instanceof HTMLElement)) {
          return { stage: 'worker-recall-menu-open' };
        }
        const refreshedWorkersButton = [...refreshedMenu.querySelectorAll('button')].find(
          (button) => (button.querySelector('strong')?.textContent ?? '').trim() === 'WORKERS'
        );
        if (
          !(refreshedWorkersButton instanceof HTMLButtonElement)
          || refreshedWorkersButton.disabled
        ) return { stage: 'worker-recall-workers-button' };
        refreshedWorkersButton.click();
        recall = await waitFor(() => {
          const candidate = document.querySelector('.worker-command-center__recall');
          return candidate instanceof HTMLButtonElement && !candidate.disabled
            ? candidate
            : undefined;
        });
      }
      if (!(recall instanceof HTMLButtonElement)) {
        const candidate = buttonWithText('RETURN TO KEEP')
          ?? document.querySelector('.worker-command-center__recall');
        return {
          stage: candidate instanceof HTMLButtonElement
            ? 'worker-recall-disabled'
            : 'worker-recall-missing'
        };
      }
      recall.click();
      const recalled = await waitFor(() => (
        document.querySelector('[data-local-fullstack-deployed-workers="0"]')
        ?? document.querySelector(
          '.worker-inspection__error, .worker-command-center__error'
        )
      ));
      if (recalled?.matches(
        '.worker-inspection__error, .worker-command-center__error'
      )) {
        return { stage: 'worker-recall-rejected' };
      }
      if (!(recalled instanceof HTMLOutputElement)) return { stage: 'worker-recalled' };

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
        dispatchConfirmed: true,
        recallConfirmed: true
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
    || value.stage !== 'complete'
    || value.backendReady !== true
    || value.authReady !== true
    || value.resourceControls !== 5
    || value.workerRows !== 4
    || value.tokenAbsent !== true
    || value.storageEmpty !== true
    || value.rendererReady !== true
    || value.profileReady !== true
    || value.dispatchConfirmed !== true
    || value.recallConfirmed !== true
  ) {
    const safeStage = typeof value?.stage === 'string'
      && /^[a-z-]{1,32}$/.test(value.stage)
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
    throw new LocalFullstackBrowserError(
      `Disposable browser journey failed at ${safeStage}${safeAuthorityState}.`
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
    const state = {
      targetId: '',
      violation: '',
      pendingFetchAction: '',
      backendDiagnostic: '',
    };
    browserState = state;
    devtools = new DevtoolsPipeSession(chrome, (method, params, session) => {
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
        || method === 'Runtime.exceptionThrown'
      ) {
        state.violation = 'page-side-effect';
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
    });
    probeStage = 'devtools-open';
    await devtools.open();
    probeStage = 'target-selection';
    const target = selectBlankPageTarget(await devtools.browserCommand('Target.getTargets', {
      filter: [{ type: 'page', exclude: false }, { exclude: true }],
    }));
    state.targetId = target.targetId;
    probeStage = 'target-attach';
    await devtools.attachToPage(target.targetId);
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
          ? devtools.browserCommand(method, parameters)
          : devtools.command(method, parameters));
      } catch (error) {
        throw new Error(`Disposable browser setup failed at ${label}.`, { cause: error });
      }
    }
    probeStage = 'page-navigation';
    await devtools.command('Page.navigate', { url: pageUrl });
    probeStage = 'browser-journey';
    const journey = await exerciseLocalFullstackJourney(devtools);
    probeStage = 'visual-capture';
    const visual = await captureCredibleScreenshot(devtools);
    if (state.violation) {
      throw new Error(`Disposable browser left its boundary: ${state.violation}.`);
    }
    return Object.freeze({
      journey,
      moduleDigest: database.moduleDigest,
      visual,
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
    throw new LocalFullstackBrowserError(
      `Disposable browser probe failed closed at ${probeStage}${
        boundary ? ` (${boundary})` : ''
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
      'Warpkeep disposable local full-stack QA passed: one synthetic auth/bootstrap/Terms '
      + 'journey, one canonical 10,000-cell browser realm, one four-worker '
      + `dispatch/recall lifecycle, and visual aggregate ${JSON.stringify(result.visual)}.\n`
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
