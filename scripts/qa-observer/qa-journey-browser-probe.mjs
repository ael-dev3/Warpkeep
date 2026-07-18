import { analyzeRenderedWebglPngScreenshot } from './png-visual-aggregate.mjs';
import {
  QA_JOURNEY_SCENARIO_MANIFEST,
  QA_UNSCANNABLE_QR_DATA_URL,
} from '../../src/dev/qaJourneyScenarioManifest.mjs';

const QA_JOURNEY_ROUTE = '/dev/qa-journey.html';
const DIRECT_VIEWPORT = Object.freeze({ width: 1_024, height: 720 });
const DESKTOP_VIEWPORT = Object.freeze({ width: 1_440, height: 900 });
const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });
const SHORT_LANDSCAPE_VIEWPORT = Object.freeze({ width: 667, height: 375 });
const STAGE_TIMEOUT_MILLISECONDS = 15_000;
const SCREENSHOT_MAXIMUM_BYTES = 8 * 1_024 * 1_024;

export const QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT = 22;
export const QA_JOURNEY_BROWSER_RESPONSIVE_CASE_COUNT = 2;
export const QA_JOURNEY_BROWSER_FLOW_STAGE_COUNT = 15;

export function isAllowedQaJourneyResourceUrl(value) {
  return value === QA_UNSCANNABLE_QR_DATA_URL;
}

function exactPort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError('Invalid journey QA loopback port.');
  }
  return value;
}

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  return value;
}

function exactKeys(value, expected, message) {
  const keys = Object.keys(value).sort();
  const contract = [...expected].sort();
  if (keys.length !== contract.length || keys.some((key, index) => key !== contract[index])) {
    throw new TypeError(message);
  }
}

function scenarioUrl(origin, id) {
  return `${origin}${QA_JOURNEY_ROUTE}?scenario=${encodeURIComponent(id)}`;
}

/**
 * The browser manifest is derived from the same data-only module used by the
 * React fixture. There is no second scenario list for the autonomous lane to
 * silently drift from.
 */
export function qaJourneyBrowserProbeCases(port) {
  const selectedPort = exactPort(port);
  if (
    QA_JOURNEY_SCENARIO_MANIFEST.length !== QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT
    || new Set(QA_JOURNEY_SCENARIO_MANIFEST.map(({ id }) => id)).size
      !== QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT
  ) throw new Error('Journey QA scenario manifest is invalid.');
  const origin = `http://127.0.0.1:${selectedPort}`;
  const direct = QA_JOURNEY_SCENARIO_MANIFEST.map((entry) => Object.freeze({
    id: `direct-${entry.id}`,
    expectedExternalAnchorCount: entry.externalAnchorCount,
    kind: 'direct',
    scenario: entry.id,
    landmark: entry.landmark,
    screenshot: false,
    url: scenarioUrl(origin, entry.id),
    viewport: DIRECT_VIEWPORT,
  }));
  return Object.freeze([
    ...direct,
    Object.freeze({
      id: 'mobile-terms',
      expectedExternalAnchorCount: QA_JOURNEY_SCENARIO_MANIFEST.find(
        ({ id }) => id === 'terms'
      ).externalAnchorCount,
      kind: 'responsive',
      scenario: 'terms',
      landmark: QA_JOURNEY_SCENARIO_MANIFEST.find(({ id }) => id === 'terms').landmark,
      screenshot: true,
      url: scenarioUrl(origin, 'terms'),
      viewport: MOBILE_VIEWPORT,
    }),
    Object.freeze({
      id: 'short-landscape-menu',
      expectedExternalAnchorCount: QA_JOURNEY_SCENARIO_MANIFEST.find(
        ({ id }) => id === 'menu'
      ).externalAnchorCount,
      kind: 'responsive',
      scenario: 'menu',
      landmark: QA_JOURNEY_SCENARIO_MANIFEST.find(({ id }) => id === 'menu').landmark,
      screenshot: true,
      url: scenarioUrl(origin, 'menu'),
      viewport: SHORT_LANDSCAPE_VIEWPORT,
    }),
  ]);
}

const READ_DIRECT_SCENARIO_EXPRESSION = `((expected) => {
  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest('[inert],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0
      && bounds.width > 0
      && bounds.height > 0;
  };
  const exactText = (element, text) => (element?.textContent ?? '').trim() === text;
  const landmarkCandidates = expected.role === 'navigation'
    ? [...document.querySelectorAll('nav,[role="navigation"]')].filter((element) => (
        element.getAttribute('aria-label') === expected.name
      ))
    : expected.role === 'region'
      ? [...document.querySelectorAll('section[aria-label], [role="region"]')].filter((element) => (
          element.getAttribute('aria-label') === expected.name
        ))
    : expected.role === 'main'
      ? [...document.querySelectorAll('main')].filter((element) => (
          element.getAttribute('aria-label') === expected.name
        ))
      : expected.role === 'heading'
        ? [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((element) => (
            exactText(element, expected.name)
          ))
        : [...document.querySelectorAll('[role="dialog"]')].filter((element) => {
            const labelledBy = element.getAttribute('aria-labelledby');
            const label = labelledBy ? document.getElementById(labelledBy) : null;
            return exactText(label, expected.name)
              || element.getAttribute('aria-label') === expected.name;
          });
  const root = document.querySelector('.qa-journey');
  const terms = document.querySelector(
    '.warpkeep-alpha-terms__panel[role="dialog"][aria-modal="true"]'
  );
  const externalAnchors = [...document.querySelectorAll('a[href]')].filter((anchor) => {
    try {
      return new URL(anchor.href, location.href).origin !== location.origin;
    } catch {
      return true;
    }
  });
  const externalMedia = [...document.querySelectorAll('img[src],video[src],audio[src],source[src]')]
    .filter((element) => {
      try {
        const source = element.getAttribute('src');
        return source && !source.startsWith('data:')
          && new URL(source, location.href).origin !== location.origin;
      } catch {
        return true;
      }
    });
  const surface = terms ?? landmarkCandidates.find(visible) ?? root;
  const visibleButtons = [...(surface?.querySelectorAll('button') ?? [])].filter(visible);
  const undersizedVisibleButtonCount = visibleButtons.filter((button) => {
    const bounds = button.getBoundingClientRect();
    return bounds.width < 40 || bounds.height < 40;
  }).length;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const surfaceBounds = surface?.getBoundingClientRect();
  return {
    documentWidth: document.documentElement.scrollWidth,
    externalAnchorCount: externalAnchors.length,
    externalMediaCount: externalMedia.length,
    href: location.href,
    landmarkCount: landmarkCandidates.length,
    landmarkVisibleCount: landmarkCandidates.filter(visible).length,
    modalCount: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
    rootCount: document.querySelectorAll('.qa-journey').length,
    rootScenario: root?.getAttribute('data-qa-scenario') ?? '',
    surfaceWithinViewport: Boolean(surfaceBounds)
      && surfaceBounds.left >= -1
      && surfaceBounds.right <= viewportWidth + 1
      && surfaceBounds.top >= -1
      && surfaceBounds.bottom <= viewportHeight + 1,
    termsAcceptanceUnchecked: terms
      ? terms.querySelector('input[type="checkbox"]')?.checked === false
      : true,
    undersizedVisibleButtonCount,
    viewportHeight,
    viewportWidth,
  };
})`;

export function parseQaJourneyDirectObservation(value, expected) {
  const candidate = exactRecord(value, 'Invalid journey browser DOM.');
  const probeCase = exactRecord(expected, 'Invalid journey browser case.');
  exactKeys(candidate, [
    'documentWidth',
    'externalAnchorCount',
    'externalMediaCount',
    'href',
    'landmarkCount',
    'landmarkVisibleCount',
    'modalCount',
    'rootCount',
    'rootScenario',
    'surfaceWithinViewport',
    'termsAcceptanceUnchecked',
    'undersizedVisibleButtonCount',
    'viewportHeight',
    'viewportWidth',
  ], 'Invalid journey browser DOM shape.');
  const responsive = probeCase.kind === 'responsive';
  const expectedModalCount = probeCase.scenario === 'terms' ? 1 : 0;
  const violations = [
    candidate.href !== probeCase.url ? 'href' : '',
    candidate.rootCount !== 1 ? 'root-count' : '',
    candidate.rootScenario !== probeCase.scenario ? 'scenario' : '',
    candidate.landmarkCount !== 1 ? 'landmark-count' : '',
    candidate.landmarkVisibleCount !== 1 ? 'landmark-visible' : '',
    candidate.modalCount !== expectedModalCount ? 'modal-count' : '',
    candidate.externalMediaCount !== 0 ? 'external-media' : '',
    !Number.isSafeInteger(probeCase.expectedExternalAnchorCount)
      || ![0, 1, 2].includes(probeCase.expectedExternalAnchorCount)
      || candidate.externalAnchorCount !== probeCase.expectedExternalAnchorCount
      ? 'external-anchor-count' : '',
    candidate.viewportWidth !== probeCase.viewport.width ? 'viewport-width' : '',
    candidate.viewportHeight !== probeCase.viewport.height ? 'viewport-height' : '',
    candidate.documentWidth !== probeCase.viewport.width ? 'horizontal-overflow' : '',
    candidate.termsAcceptanceUnchecked !== true ? 'terms-prechecked' : '',
    responsive && candidate.surfaceWithinViewport !== true ? 'responsive-surface' : '',
    responsive && (
      !Number.isSafeInteger(candidate.undersizedVisibleButtonCount)
      || candidate.undersizedVisibleButtonCount !== 0
    ) ? 'responsive-touch-target' : '',
  ].filter(Boolean);
  if (violations.length > 0) {
    throw new TypeError(`Invalid journey browser DOM: ${violations.join(',')}.`);
  }
  return Object.freeze({
    scenario: probeCase.scenario,
    responsive,
  });
}

const READ_FLOW_STATE_EXPRESSION = `(() => {
  const buttons = [...document.querySelectorAll('button')];
  const exactButtonCount = (text) => buttons.filter((button) => (
    (button.textContent ?? '').trim() === text
  )).length;
  const exactHeadingCount = (text) => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter((heading) => (heading.textContent ?? '').trim() === text).length;
  const terms = document.querySelector(
    '.warpkeep-alpha-terms__panel[role="dialog"][aria-modal="true"]'
  );
  const acceptance = terms?.querySelector('input[type="checkbox"]');
  const continuation = terms
    ? [...terms.querySelectorAll('button')].find((button) => (
        (button.textContent ?? '').trim().startsWith('CONTINUE TO ')
      ))
    : null;
  const continuationText = (continuation?.textContent ?? '').trim();
  const continuationKind = continuationText === 'CONTINUE TO SIGN-IN' ? 'sign-in'
    : continuationText === 'CONTINUE TO ACCESS CHECK' ? 'access-check'
      : continuationText === 'CONTINUE TO REALM' ? 'realm'
        : continuationText ? 'other' : 'absent';
  const auth = document.querySelector('[aria-label="Farcaster sign-in"]');
  const qr = auth?.querySelector('img[alt="Sign in with Farcaster QR code"]');
  const qrSource = qr?.getAttribute('src') ?? '';
  const root = document.querySelector('.qa-journey');
  return {
    admittedHeadingCount: exactHeadingCount('HEGEMONY RECORD VERIFIED'),
    authExternalLinkCount: auth
      ? [...auth.querySelectorAll('a[href]')].filter((anchor) => {
          try { return new URL(anchor.href, location.href).origin !== location.origin; }
          catch { return true; }
        }).length
      : 0,
    authPhase: auth?.getAttribute('data-phase') ?? 'absent',
    continuationDisabled: continuation instanceof HTMLButtonElement
      ? continuation.disabled : false,
    continuationKind,
    directExploreControlCount: document.querySelectorAll(
      '.realm-cell-navigator > button'
    ).length,
    enterRealmButtonCount: exactButtonCount('ENTER REALM'),
    exploreDialogCount: document.querySelectorAll(
      '.realm-cell-navigator__dialog[role="dialog"]'
    ).length,
    href: location.href,
    navigationCount: document.querySelectorAll(
      'nav[aria-label="Hegemony main menu"],[role="navigation"][aria-label="Hegemony main menu"]'
    ).length,
    pendingHeadingCount: exactHeadingCount('ENTRY NOT YET GRANTED'),
    legacyPlayerActionCount: document.querySelectorAll(
      'button[aria-label="Recenter Keep"], button[aria-label="Return to Menu"]'
    ).length,
    profileMenuCount: document.querySelectorAll(
      '.realm-profile-menu__panel[role="dialog"]'
    ).length,
    profileTriggerAvatarCount: document.querySelectorAll(
      '.realm-profile-trigger .realm-castle-avatar'
    ).length,
    profileTriggerCount: document.querySelectorAll('.realm-profile-trigger').length,
    profileTriggerTextBearingCount: [...document.querySelectorAll('.realm-profile-trigger')]
      .reduce((count, trigger) => count + [...trigger.childNodes].filter((node) => (
        node.nodeType === Node.TEXT_NODE
          ? (node.textContent ?? '').trim().length > 0
          : node instanceof Element && !node.classList.contains('realm-castle-avatar')
      )).length, 0),
    qrSafe: qr ? qrSource === ${JSON.stringify(QA_UNSCANNABLE_QR_DATA_URL)} : false,
    realmMainCount: document.querySelectorAll('main[aria-label="Hegemony realm"]').length,
    realmMenuExploreCommandCount: [...document.querySelectorAll(
      '.realm-profile-menu__panel nav button strong'
    )].filter((label) => (label.textContent ?? '').trim() === 'EXPLORE').length,
    realmMenuMainMenuCommandCount: [...document.querySelectorAll(
      '.realm-profile-menu__panel nav button strong'
    )].filter((label) => (label.textContent ?? '').trim() === 'MAIN MENU').length,
    realmMenuSettingsCommandCount: [...document.querySelectorAll(
      '.realm-profile-menu__panel nav button strong'
    )].filter((label) => (label.textContent ?? '').trim() === 'SETTINGS').length,
    realmSettingsCount: document.querySelectorAll(
      '.warpkeep-settings__panel[role="dialog"]'
    ).length,
    resourceIconCount: document.querySelectorAll('.realm-resource-rail li img').length,
    resourceItemCount: document.querySelectorAll('.realm-resource-rail li').length,
    resourceRailCount: document.querySelectorAll('.realm-resource-rail').length,
    resourceZeroValueCount: [...document.querySelectorAll('.realm-resource-rail li strong')]
      .filter((value) => (value.textContent ?? '').trim() === '0').length,
    rootScenario: root?.getAttribute('data-qa-scenario') ?? '',
    termsAcceptanceUnchecked: acceptance instanceof HTMLInputElement
      ? acceptance.checked === false : false,
    termsCount: document.querySelectorAll(
      '.warpkeep-alpha-terms__panel[role="dialog"][aria-modal="true"]'
    ).length,
  };
})()`;

const FLOW_STAGE_CONTRACT = Object.freeze({
  menu: Object.freeze({
    authPhase: 'absent', continuationKind: 'absent', enterRealmButtonCount: 1,
    navigationCount: 1, rootScenario: 'journey', termsCount: 0,
  }),
  'initial-terms': Object.freeze({
    authPhase: 'absent', continuationDisabled: true, continuationKind: 'sign-in',
    navigationCount: 1, rootScenario: 'journey', termsAcceptanceUnchecked: true, termsCount: 1,
  }),
  creating: Object.freeze({ authPhase: 'creating-channel', rootScenario: 'journey', termsCount: 0 }),
  awaiting: Object.freeze({
    authExternalLinkCount: 0, authPhase: 'awaiting-approval', qrSafe: true,
    rootScenario: 'journey', termsCount: 0,
  }),
  verifying: Object.freeze({ authPhase: 'verifying', rootScenario: 'journey', termsCount: 0 }),
  pending: Object.freeze({
    authPhase: 'pending-admission', enterRealmButtonCount: 0, pendingHeadingCount: 1,
    rootScenario: 'journey', termsCount: 0,
  }),
  admitted: Object.freeze({
    admittedHeadingCount: 1, authPhase: 'authenticated', enterRealmButtonCount: 1,
    rootScenario: 'journey', termsCount: 0,
  }),
  'final-terms': Object.freeze({
    authPhase: 'authenticated', continuationDisabled: true, continuationKind: 'realm',
    rootScenario: 'journey', termsAcceptanceUnchecked: true, termsCount: 1,
  }),
  realm: Object.freeze({
    directExploreControlCount: 0, exploreDialogCount: 0,
    authPhase: 'absent', realmMainCount: 1, rootScenario: 'realm-player',
    legacyPlayerActionCount: 0, profileMenuCount: 0, profileTriggerAvatarCount: 1,
    profileTriggerCount: 1, profileTriggerTextBearingCount: 0,
    realmMenuExploreCommandCount: 0, realmMenuMainMenuCommandCount: 0,
    realmMenuSettingsCommandCount: 0, realmSettingsCount: 0,
    resourceIconCount: 5, resourceItemCount: 5, resourceRailCount: 1,
    resourceZeroValueCount: 5, termsCount: 0,
  }),
  'realm-menu': Object.freeze({
    authPhase: 'absent', directExploreControlCount: 0, exploreDialogCount: 0,
    legacyPlayerActionCount: 0, profileMenuCount: 1, profileTriggerAvatarCount: 1,
    profileTriggerCount: 1, profileTriggerTextBearingCount: 0, realmMainCount: 1,
    realmMenuExploreCommandCount: 1, realmMenuMainMenuCommandCount: 1,
    realmMenuSettingsCommandCount: 1, realmSettingsCount: 0,
    resourceIconCount: 5, resourceItemCount: 5, resourceRailCount: 1,
    resourceZeroValueCount: 5, rootScenario: 'realm-player', termsCount: 0,
  }),
  'realm-settings': Object.freeze({
    authPhase: 'absent', directExploreControlCount: 0, exploreDialogCount: 0,
    legacyPlayerActionCount: 0, profileMenuCount: 0, profileTriggerAvatarCount: 1,
    profileTriggerCount: 1, profileTriggerTextBearingCount: 0, realmMainCount: 1,
    realmMenuExploreCommandCount: 0, realmMenuMainMenuCommandCount: 0,
    realmMenuSettingsCommandCount: 0, realmSettingsCount: 1,
    resourceIconCount: 5, resourceItemCount: 5,
    resourceRailCount: 1, resourceZeroValueCount: 5,
    rootScenario: 'realm-player', termsCount: 0,
  }),
  'realm-menu-after-settings': Object.freeze({
    authPhase: 'absent', directExploreControlCount: 0, exploreDialogCount: 0,
    legacyPlayerActionCount: 0, profileMenuCount: 1, profileTriggerAvatarCount: 1,
    profileTriggerCount: 1, profileTriggerTextBearingCount: 0, realmMainCount: 1,
    realmMenuExploreCommandCount: 1, realmMenuMainMenuCommandCount: 1,
    realmMenuSettingsCommandCount: 1, realmSettingsCount: 0,
    resourceIconCount: 5, resourceItemCount: 5,
    resourceRailCount: 1, resourceZeroValueCount: 5,
    rootScenario: 'realm-player', termsCount: 0,
  }),
  'realm-explore': Object.freeze({
    authPhase: 'absent', directExploreControlCount: 0, exploreDialogCount: 1,
    legacyPlayerActionCount: 0, profileMenuCount: 0, profileTriggerAvatarCount: 1,
    profileTriggerCount: 1, profileTriggerTextBearingCount: 0, realmMainCount: 1,
    realmMenuExploreCommandCount: 0, realmMenuMainMenuCommandCount: 0,
    realmMenuSettingsCommandCount: 0, realmSettingsCount: 0,
    resourceIconCount: 5, resourceItemCount: 5, resourceRailCount: 1,
    resourceZeroValueCount: 5, rootScenario: 'realm-player', termsCount: 0,
  }),
  'realm-menu-return': Object.freeze({
    authPhase: 'absent', directExploreControlCount: 0, exploreDialogCount: 0,
    legacyPlayerActionCount: 0, profileMenuCount: 1, profileTriggerAvatarCount: 1,
    profileTriggerCount: 1, profileTriggerTextBearingCount: 0, realmMainCount: 1,
    realmMenuExploreCommandCount: 1, realmMenuMainMenuCommandCount: 1,
    realmMenuSettingsCommandCount: 1, realmSettingsCount: 0,
    resourceIconCount: 5, resourceItemCount: 5, resourceRailCount: 1,
    resourceZeroValueCount: 5, rootScenario: 'realm-player', termsCount: 0,
  }),
  'returned-menu': Object.freeze({
    authPhase: 'absent', directExploreControlCount: 0, enterRealmButtonCount: 1,
    exploreDialogCount: 0, legacyPlayerActionCount: 0, navigationCount: 1,
    profileMenuCount: 0, profileTriggerAvatarCount: 0, profileTriggerCount: 0,
    profileTriggerTextBearingCount: 0, realmMainCount: 0,
    realmMenuExploreCommandCount: 0, realmMenuMainMenuCommandCount: 0,
    realmMenuSettingsCommandCount: 0, realmSettingsCount: 0,
    resourceIconCount: 0, resourceItemCount: 0, resourceRailCount: 0,
    resourceZeroValueCount: 0, rootScenario: 'menu', termsCount: 0,
  }),
});

export function parseQaJourneyFlowObservation(value, stage, expectedHref) {
  const candidate = exactRecord(value, 'Invalid journey browser flow DOM.');
  exactKeys(candidate, [
    'admittedHeadingCount',
    'authExternalLinkCount',
    'authPhase',
    'continuationDisabled',
    'continuationKind',
    'directExploreControlCount',
    'enterRealmButtonCount',
    'exploreDialogCount',
    'href',
    'navigationCount',
    'pendingHeadingCount',
    'legacyPlayerActionCount',
    'profileMenuCount',
    'profileTriggerAvatarCount',
    'profileTriggerCount',
    'profileTriggerTextBearingCount',
    'qrSafe',
    'realmMainCount',
    'realmMenuExploreCommandCount',
    'realmMenuMainMenuCommandCount',
    'realmMenuSettingsCommandCount',
    'realmSettingsCount',
    'resourceIconCount',
    'resourceItemCount',
    'resourceRailCount',
    'resourceZeroValueCount',
    'rootScenario',
    'termsAcceptanceUnchecked',
    'termsCount',
  ], 'Invalid journey browser flow DOM shape.');
  const contract = FLOW_STAGE_CONTRACT[stage];
  if (!contract || typeof expectedHref !== 'string') {
    throw new TypeError('Invalid journey browser flow stage.');
  }
  const validAuthPhases = new Set([
    'absent', 'anonymous', 'creating-channel', 'awaiting-approval', 'verifying',
    'pending-admission', 'authenticated', 'expired', 'error',
  ]);
  const validContinuationKinds = new Set([
    'absent', 'sign-in', 'access-check', 'realm', 'other',
  ]);
  const violations = [
    candidate.href !== expectedHref ? 'href' : '',
    !validAuthPhases.has(candidate.authPhase) ? 'auth-phase-shape' : '',
    !validContinuationKinds.has(candidate.continuationKind) ? 'continuation-shape' : '',
    ...Object.entries(contract).map(([key, expected]) => (
      candidate[key] === expected ? '' : key
    )),
  ].filter(Boolean);
  if (violations.length > 0) {
    throw new TypeError(`Invalid journey browser flow DOM: ${violations.join(',')}.`);
  }
  return Object.freeze({ stage });
}

const READ_MENU_SURFACE_EXPRESSION = `(() => {
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
  const exactText = (element, text) => (element?.textContent ?? '').trim() === text;
  const patch = document.getElementById('warpkeep-latest-patch-notes');
  const settings = document.querySelector('.warpkeep-settings__panel');
  const credits = document.querySelector('.warpkeep-credits');
  const patchTrigger = document.querySelector(
    'button[aria-controls="warpkeep-latest-patch-notes"]'
  );
  const visibleSurfaces = [patch, settings, credits].filter(visible);
  const surface = visibleSurfaces[0] ?? null;
  const surfaceBounds = surface?.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const active = document.activeElement;
  const focusTarget = surface?.contains(active) ? 'surface'
    : active === patchTrigger ? 'patch-trigger'
      : exactText(active, 'SETTINGS') ? 'settings-trigger'
        : exactText(active, 'CREDITS') ? 'credits-trigger'
          : 'other';
  const surfaceKind = visibleSurfaces.length !== 1 ? (visibleSurfaces.length ? 'multiple' : 'none')
    : surface === patch ? 'patch'
      : surface === settings ? 'settings'
        : 'credits';
  const visibleSurfaceButtons = surface
    ? [...surface.querySelectorAll('button')].filter(visible)
    : [];
  const undersizedSurfaceButtonCount = visibleSurfaceButtons.filter((button) => {
    const bounds = button.getBoundingClientRect();
    return bounds.width < 40 || bounds.height < 40;
  }).length;
  const surfaceExternalAnchorCount = surface
    ? [...surface.querySelectorAll('a[href]')].filter((anchor) => {
        try { return new URL(anchor.href, location.href).origin !== location.origin; }
        catch { return true; }
      }).length
    : 0;
  return {
    creditsPresentation: credits?.getAttribute('data-presentation') ?? 'absent',
    documentWidth: document.documentElement.scrollWidth,
    focusTarget,
    href: location.href,
    menuNavigationCount: document.querySelectorAll(
      'nav[aria-label="Hegemony main menu"],[role="navigation"][aria-label="Hegemony main menu"]'
    ).length,
    modalCount: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
    patchExpanded: patchTrigger?.getAttribute('aria-expanded') === 'true',
    surfaceExternalAnchorCount,
    surfaceKind,
    surfaceWithinViewport: !surface || Boolean(surfaceBounds)
      && surfaceBounds.left >= -1
      && surfaceBounds.right <= viewportWidth + 1
      && surfaceBounds.top >= -1
      && surfaceBounds.bottom <= viewportHeight + 1,
    undersizedSurfaceButtonCount,
    viewportHeight,
    viewportWidth,
    visibleSurfaceCount: visibleSurfaces.length,
  };
})()`;

const MENU_SURFACE_STAGE_CONTRACT = Object.freeze({
  'patch-open': Object.freeze({
    focusTarget: 'patch-trigger', modalCount: 0, patchExpanded: true,
    surfaceExternalAnchorCount: 0, surfaceKind: 'patch', visibleSurfaceCount: 1,
  }),
  'patch-closed': Object.freeze({
    focusTarget: 'patch-trigger', modalCount: 0, patchExpanded: false,
    surfaceKind: 'none', visibleSurfaceCount: 0,
  }),
  'settings-open': Object.freeze({
    focusTarget: 'surface', modalCount: 1, patchExpanded: false,
    surfaceExternalAnchorCount: 0, surfaceKind: 'settings', visibleSurfaceCount: 1,
  }),
  'settings-closed': Object.freeze({
    focusTarget: 'settings-trigger', modalCount: 0, patchExpanded: false,
    surfaceKind: 'none', visibleSurfaceCount: 0,
  }),
  'credits-open': Object.freeze({
    creditsPresentation: 'rolling', focusTarget: 'surface', modalCount: 1,
    patchExpanded: false, surfaceExternalAnchorCount: 2,
    surfaceKind: 'credits', visibleSurfaceCount: 1,
  }),
  'credits-reading': Object.freeze({
    creditsPresentation: 'reading', focusTarget: 'surface', modalCount: 1,
    patchExpanded: false, surfaceExternalAnchorCount: 2,
    surfaceKind: 'credits', visibleSurfaceCount: 1,
  }),
  'credits-closed': Object.freeze({
    creditsPresentation: 'absent', focusTarget: 'credits-trigger', modalCount: 0,
    patchExpanded: false, surfaceKind: 'none', visibleSurfaceCount: 0,
  }),
});

export function parseQaJourneyMenuSurfaceObservation(
  value,
  stage,
  expectedHref,
  viewport
) {
  const candidate = exactRecord(value, 'Invalid journey menu surface DOM.');
  exactKeys(candidate, [
    'creditsPresentation',
    'documentWidth',
    'focusTarget',
    'href',
    'menuNavigationCount',
    'modalCount',
    'patchExpanded',
    'surfaceExternalAnchorCount',
    'surfaceKind',
    'surfaceWithinViewport',
    'undersizedSurfaceButtonCount',
    'viewportHeight',
    'viewportWidth',
    'visibleSurfaceCount',
  ], 'Invalid journey menu surface DOM shape.');
  const contract = MENU_SURFACE_STAGE_CONTRACT[stage];
  if (
    !contract
    || typeof expectedHref !== 'string'
    || !viewport
    || !Number.isSafeInteger(viewport.width)
    || !Number.isSafeInteger(viewport.height)
  ) throw new TypeError('Invalid journey menu surface stage.');
  const violations = [
    candidate.href !== expectedHref ? 'href' : '',
    candidate.menuNavigationCount !== 1 ? 'menu-navigation' : '',
    candidate.viewportWidth !== viewport.width ? 'viewport-width' : '',
    candidate.viewportHeight !== viewport.height ? 'viewport-height' : '',
    candidate.documentWidth !== viewport.width ? 'horizontal-overflow' : '',
    candidate.surfaceWithinViewport !== true ? 'surface-viewport' : '',
    candidate.undersizedSurfaceButtonCount !== 0 ? 'surface-touch-target' : '',
    ...Object.entries(contract).map(([key, expected]) => (
      candidate[key] === expected ? '' : key
    )),
  ].filter(Boolean);
  if (violations.length > 0) {
    throw new TypeError(`Invalid journey menu surface DOM: ${violations.join(',')}.`);
  }
  return Object.freeze({ stage });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function setViewport(session, viewport) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function readDirectObservation(session, probeCase) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(${READ_DIRECT_SCENARIO_EXPRESSION})(${JSON.stringify(probeCase.landmark)})`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || !evaluation?.result || evaluation.result.type !== 'object') {
    throw new Error('Journey browser DOM evaluation failed.');
  }
  return evaluation.result.value;
}

async function waitForDirectObservation(session, probeCase, state) {
  const deadline = Date.now() + STAGE_TIMEOUT_MILLISECONDS;
  let lastError;
  while (Date.now() < deadline) {
    if (state.violation) throw new Error(`Journey browser left the local QA boundary: ${state.violation}.`);
    try {
      return parseQaJourneyDirectObservation(
        await readDirectObservation(session, probeCase),
        probeCase
      );
    } catch (error) {
      lastError = error;
    }
    await delay(75);
  }
  throw new Error('Journey browser direct scenario timed out.', { cause: lastError });
}

async function captureAnonymousVisualAggregate(session, viewport) {
  const result = await session.command('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  });
  if (
    typeof result?.data !== 'string'
    || result.data.length > Math.ceil(SCREENSHOT_MAXIMUM_BYTES * 4 / 3) + 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data)
  ) throw new Error('Journey browser screenshot failed.');
  const bytes = Buffer.from(result.data, 'base64');
  try {
    // Only bounded colour/luminance counts survive this call. The screenshot
    // is never written, logged, returned, or placed in an observatory report.
    analyzeRenderedWebglPngScreenshot(bytes, viewport);
  } finally {
    bytes.fill(0);
  }
}

async function readFlowObservation(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: READ_FLOW_STATE_EXPRESSION,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || !evaluation?.result || evaluation.result.type !== 'object') {
    throw new Error('Journey browser flow evaluation failed.');
  }
  return evaluation.result.value;
}

async function readMenuSurfaceObservation(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: READ_MENU_SURFACE_EXPRESSION,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || !evaluation?.result || evaluation.result.type !== 'object') {
    throw new Error('Journey menu surface evaluation failed.');
  }
  return evaluation.result.value;
}

async function waitForMenuSurfaceStage(session, stage, href, viewport, state) {
  const deadline = Date.now() + STAGE_TIMEOUT_MILLISECONDS;
  let lastError;
  while (Date.now() < deadline) {
    if (state.violation) throw new Error(`Journey browser left the local QA boundary: ${state.violation}.`);
    try {
      return parseQaJourneyMenuSurfaceObservation(
        await readMenuSurfaceObservation(session),
        stage,
        href,
        viewport
      );
    } catch (error) {
      lastError = error;
    }
    await delay(75);
  }
  throw new Error(`Journey menu ${stage} stage timed out.`, { cause: lastError });
}

async function waitForFlowStage(session, stage, href, state) {
  const deadline = Date.now() + STAGE_TIMEOUT_MILLISECONDS;
  let lastError;
  while (Date.now() < deadline) {
    if (state.violation) throw new Error(`Journey browser left the local QA boundary: ${state.violation}.`);
    try {
      return parseQaJourneyFlowObservation(await readFlowObservation(session), stage, href);
    } catch (error) {
      lastError = error;
    }
    await delay(75);
  }
  throw new Error(`Journey browser ${stage} stage timed out.`, { cause: lastError });
}

async function activateExactControl(session, selector, text) {
  const input = JSON.stringify({ selector, text });
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `((input) => {
      const targets = [...document.querySelectorAll(input.selector)].filter((element) => (
        element instanceof HTMLElement
        && (element.textContent ?? '').trim() === input.text
      ));
      if (targets.length !== 1) return false;
      const target = targets[0];
      const style = getComputedStyle(target);
      const bounds = target.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      if (
        (target instanceof HTMLButtonElement && target.disabled)
        || target.getAttribute('aria-disabled') === 'true'
        || target.closest('[inert]')
        || style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || '1') <= 0
        || bounds.width <= 0
        || bounds.height <= 0
        || bounds.left < 0
        || bounds.top < 0
        || bounds.right > window.innerWidth
        || bounds.bottom > window.innerHeight
        || !hit
        || (hit !== target && !target.contains(hit))
      ) return false;
      target.focus({ preventScroll: true });
      if (document.activeElement !== target) return false;
      target.click();
      return true;
    })(${input})`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.value !== true) {
    throw new Error('Journey browser interaction failed.');
  }
}

async function activateUniqueControl(session, selector) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const targets = [...document.querySelectorAll(${JSON.stringify(selector)})];
      if (targets.length !== 1) return false;
      const target = targets[0];
      if (!(target instanceof HTMLButtonElement) || target.disabled) return false;
      const style = getComputedStyle(target);
      const bounds = target.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      if (
        target.getAttribute('aria-disabled') === 'true'
        || target.closest('[inert]')
        || style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || '1') <= 0
        || bounds.width <= 0
        || bounds.height <= 0
        || bounds.left < 0
        || bounds.top < 0
        || bounds.right > window.innerWidth
        || bounds.bottom > window.innerHeight
        || !hit
        || (hit !== target && !target.contains(hit))
      ) return false;
      target.focus({ preventScroll: true });
      if (document.activeElement !== target) return false;
      target.click();
      return true;
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.value !== true) {
    throw new Error('Journey browser unique interaction failed.');
  }
}

async function activateRealmMenuCommand(session, label) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `((label) => {
      const targets = [...document.querySelectorAll(
        '.realm-profile-menu__panel nav button'
      )].filter((button) => (
        button instanceof HTMLButtonElement
        && !button.disabled
        && (button.querySelector('strong')?.textContent ?? '').trim() === label
      ));
      if (targets.length !== 1) return false;
      const target = targets[0];
      const style = getComputedStyle(target);
      const bounds = target.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      if (
        target.closest('[inert]')
        || style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || '1') <= 0
        || bounds.width < 44
        || bounds.height < 44
        || bounds.left < 0
        || bounds.top < 0
        || bounds.right > window.innerWidth
        || bounds.bottom > window.innerHeight
        || !hit
        || (hit !== target && !target.contains(hit))
      ) return false;
      target.focus({ preventScroll: true });
      if (document.activeElement !== target) return false;
      target.click();
      return true;
    })(${JSON.stringify(label)})`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.value !== true) {
    throw new Error('Journey browser Realm-menu interaction failed.');
  }
}

async function activateTermsAcceptance(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      const checkbox = dialog?.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement) || checkbox.checked) return false;
      const style = getComputedStyle(checkbox);
      const bounds = checkbox.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      if (
        checkbox.disabled
        || checkbox.closest('[inert]')
        || style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || '1') <= 0
        || bounds.width <= 0
        || bounds.height <= 0
        || bounds.left < 0
        || bounds.top < 0
        || bounds.right > window.innerWidth
        || bounds.bottom > window.innerHeight
        || !hit
        || (hit !== checkbox && !checkbox.contains(hit))
      ) return false;
      checkbox.focus({ preventScroll: true });
      if (document.activeElement !== checkbox) return false;
      checkbox.click();
      return checkbox.checked;
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.value !== true) {
    throw new Error('Journey browser Terms acceptance interaction failed.');
  }
}

async function runPatchNotesSurface(session, href, viewport, state) {
  const selector = 'button[aria-controls="warpkeep-latest-patch-notes"]';
  await activateUniqueControl(session, selector);
  await waitForMenuSurfaceStage(session, 'patch-open', href, viewport, state);
  await activateUniqueControl(session, selector);
  await waitForMenuSurfaceStage(session, 'patch-closed', href, viewport, state);
}

async function runDesktopMenuSurfaces(session, href, state) {
  await runPatchNotesSurface(session, href, DESKTOP_VIEWPORT, state);

  await activateExactControl(session, 'button', 'SETTINGS');
  await waitForMenuSurfaceStage(session, 'settings-open', href, DESKTOP_VIEWPORT, state);
  await activateExactControl(session, '[role="dialog"] button', 'BACK TO THE MENU');
  await waitForMenuSurfaceStage(session, 'settings-closed', href, DESKTOP_VIEWPORT, state);

  await activateExactControl(session, 'button', 'CREDITS');
  await waitForMenuSurfaceStage(session, 'credits-open', href, DESKTOP_VIEWPORT, state);
  await activateExactControl(session, '[role="dialog"] button', 'PAUSE / READ');
  await waitForMenuSurfaceStage(session, 'credits-reading', href, DESKTOP_VIEWPORT, state);
  await activateExactControl(session, '[role="dialog"] button', 'BACK TO MAIN MENU');
  await waitForMenuSurfaceStage(session, 'credits-closed', href, DESKTOP_VIEWPORT, state);
}

async function runFullJourney(session, href, realmHref, state) {
  await setViewport(session, DESKTOP_VIEWPORT);
  await session.command('Page.navigate', { url: href });
  await waitForFlowStage(session, 'menu', href, state);
  await captureAnonymousVisualAggregate(session, DESKTOP_VIEWPORT);
  await runDesktopMenuSurfaces(session, href, state);

  await activateExactControl(session, 'button', 'ENTER REALM');
  await waitForFlowStage(session, 'initial-terms', href, state);
  await activateTermsAcceptance(session);
  await activateExactControl(session, '[role="dialog"] button', 'CONTINUE TO SIGN-IN');
  await waitForFlowStage(session, 'creating', href, state);

  await activateExactControl(session, 'button', 'CREATE SYNTHETIC CHANNEL');
  await waitForFlowStage(session, 'awaiting', href, state);
  await activateExactControl(session, 'button', 'RECEIVE SYNTHETIC APPROVAL');
  await waitForFlowStage(session, 'verifying', href, state);
  await activateExactControl(session, 'button', 'COMPLETE LOCAL VERIFICATION');
  await waitForFlowStage(session, 'pending', href, state);

  await activateExactControl(session, 'button', 'CHECK AGAIN');
  await waitForFlowStage(session, 'admitted', href, state);
  await activateExactControl(session, 'button', 'ENTER REALM');
  await waitForFlowStage(session, 'final-terms', href, state);
  await activateTermsAcceptance(session);
  await activateExactControl(session, '[role="dialog"] button', 'CONTINUE TO REALM');
  await waitForFlowStage(session, 'realm', realmHref, state);

  // The local journey selector intentionally occupies the same top-left berth
  // as the product portrait. Dismiss that harness-only chrome before proving
  // the real player interaction; the top-right restore affordance remains.
  await activateExactControl(session, '.qa-journey__controls button', 'HIDE CONTROLS');
  await activateUniqueControl(session, '.realm-profile-trigger');
  await waitForFlowStage(session, 'realm-menu', realmHref, state);
  await activateRealmMenuCommand(session, 'SETTINGS');
  await waitForFlowStage(session, 'realm-settings', realmHref, state);
  await activateExactControl(
    session,
    '.warpkeep-settings__panel button',
    'BACK TO REALM MENU'
  );
  await waitForFlowStage(session, 'realm-menu-after-settings', realmHref, state);
  await activateRealmMenuCommand(session, 'EXPLORE');
  await waitForFlowStage(session, 'realm-explore', realmHref, state);
  await activateExactControl(
    session,
    '.realm-cell-navigator__dialog button',
    'CLOSE EXPLORE'
  );
  await waitForFlowStage(session, 'realm', realmHref, state);

  await activateUniqueControl(session, '.realm-profile-trigger');
  await waitForFlowStage(session, 'realm-menu-return', realmHref, state);
  await activateRealmMenuCommand(session, 'MAIN MENU');
  await waitForFlowStage(
    session,
    'returned-menu',
    realmHref.replace('scenario=realm-player', 'scenario=menu'),
    state
  );
}

/**
 * Runs inside the already-attested Chrome/Vite/CDP envelope owned by the
 * rendered probe. The caller supplies no identity, backend, network client,
 * browser profile, storage, or screenshot path.
 */
export async function runQaJourneyBrowserCases(session, cases, state) {
  if (
    !session
    || typeof session.command !== 'function'
    || !Array.isArray(cases)
    || cases.length !== QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT
      + QA_JOURNEY_BROWSER_RESPONSIVE_CASE_COUNT
    || !state
    || !(state.allowedUrls instanceof Set)
  ) throw new TypeError('Invalid journey browser probe runtime.');

  for (const probeCase of cases) {
    try {
      await setViewport(session, probeCase.viewport);
      await session.command('Page.navigate', { url: probeCase.url });
      await waitForDirectObservation(session, probeCase, state);
      if (probeCase.screenshot) {
        await captureAnonymousVisualAggregate(session, probeCase.viewport);
      }
      if (probeCase.id === 'short-landscape-menu') {
        await runPatchNotesSurface(session, probeCase.url, probeCase.viewport, state);
      }
    } catch (error) {
      throw new Error(`Journey direct case ${probeCase.id} failed.`, { cause: error });
    }
  }

  const journey = cases.find((probeCase) => probeCase.id === 'direct-journey');
  const realm = cases.find((probeCase) => probeCase.id === 'direct-realm-player');
  if (!journey || !realm) throw new Error('Journey browser full-flow case is unavailable.');
  try {
    await runFullJourney(session, journey.url, realm.url, state);
  } catch (error) {
    throw new Error('Journey full flow failed.', { cause: error });
  }
  if (state.violation) {
    throw new Error(`Journey browser left the local QA boundary: ${state.violation}.`);
  }
  return QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT
    + QA_JOURNEY_BROWSER_RESPONSIVE_CASE_COUNT
    + 1;
}
