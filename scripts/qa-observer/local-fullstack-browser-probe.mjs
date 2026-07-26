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
      const initialDispatchSiteProjection = readyProbe.getAttribute(
        'data-local-fullstack-dispatch-sites'
      );
      const fixtureDispatchSites = initialDispatchSiteProjection?.split(';').flatMap(
        (entry) => {
          const match = /^(gold|food|wood|stone):(-?\\d+),(-?\\d+)$/.exec(entry);
          return match
            ? [{ resourceKind: match[1], q: match[2], r: match[3] }]
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
      const initialDynamicPresentation = readDynamicPresentation();
      if (initialDynamicPresentation === undefined) {
        return { stage: 'dynamic-telemetry-ready' };
      }

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
      const jumpToResourceSite = async (site) => {
        const menu = await openRealmMenu();
        if (!(menu instanceof HTMLElement)) return false;
        const explore = menuAction(menu, 'EXPLORE');
        if (!(explore instanceof HTMLButtonElement) || explore.disabled) return false;
        explore.click();
        const navigator = await waitFor(() => document.querySelector(
          '.realm-cell-navigator__dialog'
        ));
        const jump = navigator?.querySelector('.realm-cell-navigator__jump');
        const qInput = jump?.querySelector('input[id$="-q"]');
        const rInput = jump?.querySelector('input[id$="-r"]');
        if (
          !(jump instanceof HTMLFormElement)
          || !(qInput instanceof HTMLInputElement)
          || !(rInput instanceof HTMLInputElement)
        ) return false;
        const setInputValue = (input, value) => {
          const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
          );
          descriptor?.set?.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setInputValue(qInput, site.q);
        setInputValue(rInput, site.r);
        jump.requestSubmit();
        const mapFocused = await waitFor(() => (
          !document.querySelector('.realm-cell-navigator__dialog')
          && document.activeElement === realm
        ));
        if (!mapFocused) return false;
        realm.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter'
        }));
        return true;
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
        if (!await jumpToResourceSite(site)) {
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
            ? readyProbe
            : undefined
        ), 10_000);
        if (!(deployed instanceof HTMLOutputElement)) {
          return { error: 'worker-' + ordinal + '-dispatch-confirmation' };
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
            && current.workerPresentedCount === 4
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
      if (!/Select an available resource node in the Realm/i.test(workerPanel.textContent ?? '')) {
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
          && current.workerPresentedCount === 4
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
      const recallOneCompletedPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.dynamicReconciliations
            > recalledOneDynamicPresentation.dynamicReconciliations
          && current.workerReconciliations
            > recalledOneDynamicPresentation.workerReconciliations
          && current.routeReconciliations
            > recalledOneDynamicPresentation.routeReconciliations
          && current.workerPresentedCount === 4
          && current.workerAnimatedCount >= 1
          && current.visibleRouteCount >= 1
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

      const backToMenuForRecallAll = reopenedRecallCenter?.querySelector(
        'button[aria-label="Back to Realm menu"]'
      );
      if (!(backToMenuForRecallAll instanceof HTMLButtonElement)) {
        return { stage: 'recall-all-menu-return' };
      }
      backToMenuForRecallAll.click();
      const recallAllMenu = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
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
          && current.workerPresentedCount === 4
          && current.workerAnimatedCount >= 1
          && current.visibleRouteCount >= 1
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
      const returnedDynamicPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.dynamicReconciliations
            > recalledAllDynamicPresentation.dynamicReconciliations
          && current.workerReconciliations
            > recalledAllDynamicPresentation.workerReconciliations
          && current.routeReconciliations
            > recalledAllDynamicPresentation.routeReconciliations
          && current.workerPresentedCount === 4
          && current.workerAnimatedCount >= 1
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
      ))) return { stage: 'recall-all-menu-close' };
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
      const reuseRecall = reuseRecallCenter.querySelector(
        '.worker-command-center__footer button'
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
      const restoredDynamicPresentation = await waitFor(() => {
        const current = readDynamicPresentation();
        return current
          && current.dynamicReconciliations
            > reusedWorker.presentation.dynamicReconciliations
          && current.workerReconciliations
            > reusedWorker.presentation.workerReconciliations
          && current.routeReconciliations
            > reusedWorker.presentation.routeReconciliations
          && current.workerPresentedCount === 4
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
      const reusedSiteReleasedAgain = await waitFor(() => (
        readyProbe.getAttribute('data-local-fullstack-dispatch-sites')
          === initialDispatchSiteProjection
          ? true
          : undefined
      ), 10_000);
      if (!reusedSiteReleasedAgain) return { stage: 'reuse-node-release' };
      const reuseBackToMenu = reuseRecallCenter.querySelector(
        'button[aria-label="Back to Realm menu"]'
      );
      if (reuseBackToMenu instanceof HTMLButtonElement) reuseBackToMenu.click();
      const reuseMenu = await waitFor(() => document.querySelector(
        '.realm-profile-menu__panel'
      ));
      const reuseCloseMenu = reuseMenu?.querySelector(
        'button[aria-label="Close Realm menu"]'
      );
      if (reuseCloseMenu instanceof HTMLButtonElement) reuseCloseMenu.click();
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
    || value.dispatchedWorldWorkerCount !== 4
    || !Number.isSafeInteger(value.dispatchedAnimatedWorkerCount)
    || value.dispatchedAnimatedWorkerCount < 1
    || !Number.isSafeInteger(value.dispatchedWorldPresenceCount)
    || value.dispatchedWorldPresenceCount < 0
    || !Number.isSafeInteger(value.dispatchedVisibleRouteCount)
    || value.dispatchedVisibleRouteCount < 1
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
    throw new LocalFullstackBrowserError(
      `Disposable browser journey failed at ${safeStage}${
        safeAuthorityState || safeSceneState || safeDynamicState
      }.`
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
      + 'journey, one canonical 10,000-cell browser realm, one Gold/Food/Wood/Stone '
      + 'four-worker dispatch, individual recall, Recall All, and return-completion '
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
