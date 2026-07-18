import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  parseQaJourneyDirectObservation,
  parseQaJourneyFlowObservation,
  parseQaJourneyMenuSurfaceObservation,
  QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT,
  QA_JOURNEY_BROWSER_FLOW_STAGE_COUNT,
  QA_JOURNEY_BROWSER_RESPONSIVE_CASE_COUNT,
  isAllowedQaJourneyResourceUrl,
  qaJourneyBrowserProbeCases
} from '../scripts/qa-observer/qa-journey-browser-probe.mjs';
import {
  QA_JOURNEY_SCENARIO_MANIFEST,
  QA_UNSCANNABLE_QR_DATA_URL
} from '../src/dev/qaJourneyScenarioManifest.mjs';
import { QA_JOURNEY_SCENARIOS } from '../src/dev/qaJourneyFixture';

const EMPTY_FLOW = Object.freeze({
  admittedHeadingCount: 0,
  authExternalLinkCount: 0,
  authPhase: 'absent',
  continuationDisabled: false,
  continuationKind: 'absent',
  directExploreControlCount: 0,
  enterRealmButtonCount: 0,
  exploreDialogCount: 0,
  href: 'http://127.0.0.1:41733/dev/qa-journey.html?scenario=journey',
  navigationCount: 0,
  pendingHeadingCount: 0,
  legacyPlayerActionCount: 0,
  profileMenuCount: 0,
  profileTriggerAvatarCount: 0,
  profileTriggerCount: 0,
  profileTriggerTextBearingCount: 0,
  qrSafe: false,
  realmMainCount: 0,
  realmMenuExploreCommandCount: 0,
  realmMenuMainMenuCommandCount: 0,
  realmMenuSettingsCommandCount: 0,
  realmSettingsCount: 0,
  resourceIconCount: 0,
  resourceItemCount: 0,
  resourceRailCount: 0,
  resourceZeroValueCount: 0,
  rootScenario: 'journey',
  termsAcceptanceUnchecked: false,
  termsCount: 0
});

describe('real-browser synthetic journey probe', () => {
  it('measures responsive controls only inside the active scenario surface', () => {
    const source = readFileSync(
      resolve('scripts/qa-observer/qa-journey-browser-probe.mjs'),
      'utf8'
    );
    expect(source).toContain("surface?.querySelectorAll('button')");
    expect(source).not.toContain("[...document.querySelectorAll('button')].filter(visible)");
  });

  it('derives every direct browser state from the single React scenario manifest', () => {
    expect(QA_JOURNEY_SCENARIO_MANIFEST).toHaveLength(
      QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT
    );
    expect(QA_JOURNEY_SCENARIOS).toBe(QA_JOURNEY_SCENARIO_MANIFEST);
    expect(QA_JOURNEY_SCENARIO_MANIFEST[0]).toEqual(expect.objectContaining({
      id: 'journey',
      externalAnchorCount: 2,
      landmark: { role: 'region', name: 'Synthetic journey controls' }
    }));
    expect(Object.fromEntries(QA_JOURNEY_SCENARIO_MANIFEST.map((entry) => (
      [entry.id, entry.externalAnchorCount]
    )))).toEqual(expect.objectContaining({
      journey: 2,
      menu: 2,
      terms: 0,
      'admission-denied': 1,
      'realm-player': 0,
      'realm-observer': 0
    }));

    const cases = qaJourneyBrowserProbeCases(41_733);
    expect(cases).toHaveLength(
      QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT + QA_JOURNEY_BROWSER_RESPONSIVE_CASE_COUNT
    );
    expect(cases.slice(0, QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT).map(({ scenario }) => scenario))
      .toEqual(QA_JOURNEY_SCENARIO_MANIFEST.map(({ id }) => id));
    expect(cases.at(-2)).toEqual(expect.objectContaining({
      id: 'mobile-terms',
      expectedExternalAnchorCount: 0,
      scenario: 'terms',
      screenshot: true,
      url: 'http://127.0.0.1:41733/dev/qa-journey.html?scenario=terms',
      viewport: { width: 390, height: 844 }
    }));
    expect(cases.at(-1)).toEqual(expect.objectContaining({
      id: 'short-landscape-menu',
      expectedExternalAnchorCount: 2,
      scenario: 'menu',
      screenshot: true,
      url: 'http://127.0.0.1:41733/dev/qa-journey.html?scenario=menu',
      viewport: { width: 667, height: 375 }
    }));
    expect(() => qaJourneyBrowserProbeCases(0)).toThrow(/port/i);
  });

  it('allows only the fixed non-scannable QR data resource', () => {
    expect(isAllowedQaJourneyResourceUrl(QA_UNSCANNABLE_QR_DATA_URL)).toBe(true);
    expect(isAllowedQaJourneyResourceUrl('data:image/svg+xml,other')).toBe(false);
    expect(isAllowedQaJourneyResourceUrl('https://relay.farcaster.xyz/qr')).toBe(false);
  });

  it('accepts only closed, exact direct-scenario aggregate evidence', () => {
    const probeCase = qaJourneyBrowserProbeCases(41_733).find(({ id }) => (
      id === 'direct-menu'
    ))!;
    const observation = {
      documentWidth: 1_024,
      externalAnchorCount: 2,
      externalMediaCount: 0,
      href: probeCase.url,
      landmarkCount: 1,
      landmarkVisibleCount: 1,
      modalCount: 0,
      rootCount: 1,
      rootScenario: 'menu',
      surfaceWithinViewport: true,
      termsAcceptanceUnchecked: true,
      undersizedVisibleButtonCount: 0,
      viewportHeight: 720,
      viewportWidth: 1_024
    };

    expect(parseQaJourneyDirectObservation(observation, probeCase)).toEqual({
      scenario: 'menu',
      responsive: false
    });
    expect(() => parseQaJourneyDirectObservation({
      ...observation,
      privateDomText: 'must-not-survive'
    }, probeCase)).toThrow(/shape/i);
    expect(() => parseQaJourneyDirectObservation({
      ...observation,
      externalMediaCount: 1
    }, probeCase)).toThrow(/external-media/i);
    expect(() => parseQaJourneyDirectObservation({
      ...observation,
      externalAnchorCount: 1
    }, probeCase)).toThrow(/external-anchor-count/i);
    expect(() => parseQaJourneyDirectObservation({
      ...observation,
      documentWidth: 1_025
    }, probeCase)).toThrow(/horizontal-overflow/i);
  });

  it('requires all fifteen flow stages including consent and portrait-menu Realm commands', () => {
    const href = EMPTY_FLOW.href;
    const realmHref = href.replace('scenario=journey', 'scenario=realm-player');
    const stages = [
      ['menu', {
        enterRealmButtonCount: 1,
        navigationCount: 1
      }],
      ['initial-terms', {
        continuationDisabled: true,
        continuationKind: 'sign-in',
        navigationCount: 1,
        termsAcceptanceUnchecked: true,
        termsCount: 1
      }],
      ['creating', { authPhase: 'creating-channel' }],
      ['awaiting', { authPhase: 'awaiting-approval', qrSafe: true }],
      ['verifying', { authPhase: 'verifying' }],
      ['pending', {
        authPhase: 'pending-admission',
        pendingHeadingCount: 1
      }],
      ['admitted', {
        admittedHeadingCount: 1,
        authPhase: 'authenticated',
        enterRealmButtonCount: 1
      }],
      ['final-terms', {
        authPhase: 'authenticated',
        continuationDisabled: true,
        continuationKind: 'realm',
        termsAcceptanceUnchecked: true,
        termsCount: 1
      }],
      ['realm', {
        directExploreControlCount: 0,
        exploreDialogCount: 0,
        legacyPlayerActionCount: 0,
        profileMenuCount: 0,
        profileTriggerAvatarCount: 1,
        profileTriggerCount: 1,
        profileTriggerTextBearingCount: 0,
        realmMainCount: 1,
        realmMenuSettingsCommandCount: 0,
        resourceIconCount: 5,
        resourceItemCount: 5,
        resourceRailCount: 1,
        resourceZeroValueCount: 5,
        rootScenario: 'realm-player',
      }],
      ['realm-menu', {
        profileMenuCount: 1,
        profileTriggerAvatarCount: 1,
        profileTriggerCount: 1,
        realmMainCount: 1,
        realmMenuExploreCommandCount: 1,
        realmMenuMainMenuCommandCount: 1,
        realmMenuSettingsCommandCount: 1,
        resourceIconCount: 5,
        resourceItemCount: 5,
        resourceRailCount: 1,
        resourceZeroValueCount: 5,
        rootScenario: 'realm-player'
      }],
      ['realm-settings', {
        profileTriggerAvatarCount: 1,
        profileTriggerCount: 1,
        realmMainCount: 1,
        realmSettingsCount: 1,
        resourceIconCount: 5,
        resourceItemCount: 5,
        resourceRailCount: 1,
        resourceZeroValueCount: 5,
        rootScenario: 'realm-player'
      }],
      ['realm-menu-after-settings', {
        profileMenuCount: 1,
        profileTriggerAvatarCount: 1,
        profileTriggerCount: 1,
        realmMainCount: 1,
        realmMenuExploreCommandCount: 1,
        realmMenuMainMenuCommandCount: 1,
        realmMenuSettingsCommandCount: 1,
        resourceIconCount: 5,
        resourceItemCount: 5,
        resourceRailCount: 1,
        resourceZeroValueCount: 5,
        rootScenario: 'realm-player'
      }],
      ['realm-explore', {
        exploreDialogCount: 1,
        profileTriggerAvatarCount: 1,
        profileTriggerCount: 1,
        realmMainCount: 1,
        resourceIconCount: 5,
        resourceItemCount: 5,
        resourceRailCount: 1,
        resourceZeroValueCount: 5,
        rootScenario: 'realm-player'
      }],
      ['realm-menu-return', {
        profileMenuCount: 1,
        profileTriggerAvatarCount: 1,
        profileTriggerCount: 1,
        realmMainCount: 1,
        realmMenuExploreCommandCount: 1,
        realmMenuMainMenuCommandCount: 1,
        realmMenuSettingsCommandCount: 1,
        resourceIconCount: 5,
        resourceItemCount: 5,
        resourceRailCount: 1,
        resourceZeroValueCount: 5,
        rootScenario: 'realm-player'
      }],
      ['returned-menu', {
        enterRealmButtonCount: 1,
        navigationCount: 1,
        rootScenario: 'menu'
      }]
    ] as const;

    expect(stages).toHaveLength(QA_JOURNEY_BROWSER_FLOW_STAGE_COUNT);
    for (const [stage, overlay] of stages) {
      const expectedHref = stage === 'realm'
        || stage === 'realm-menu'
        || stage === 'realm-settings'
        || stage === 'realm-menu-after-settings'
        || stage === 'realm-explore'
        || stage === 'realm-menu-return'
        ? realmHref
        : stage === 'returned-menu'
          ? href.replace('scenario=journey', 'scenario=menu')
          : href;
      expect(parseQaJourneyFlowObservation({
        ...EMPTY_FLOW,
        ...overlay,
        href: expectedHref
      }, stage, expectedHref))
        .toEqual({ stage });
    }
    expect(() => parseQaJourneyFlowObservation({
      ...EMPTY_FLOW,
      realmMainCount: 1,
      profileTriggerAvatarCount: 1,
      profileTriggerCount: 1,
      resourceIconCount: 5,
      resourceItemCount: 5,
      resourceRailCount: 1,
      resourceZeroValueCount: 5,
      rootScenario: 'realm-player',
    }, 'realm', realmHref)).toThrow(/href/i);
    expect(() => parseQaJourneyFlowObservation({
      ...EMPTY_FLOW,
      authPhase: 'production-session'
    }, 'menu', href)).toThrow(/auth-phase-shape/i);
    expect(() => parseQaJourneyFlowObservation({
      ...EMPTY_FLOW,
      authPhase: 'authenticated',
      continuationDisabled: true,
      continuationKind: 'sign-in',
      termsAcceptanceUnchecked: true,
      termsCount: 1
    }, 'final-terms', href)).toThrow(/continuationKind/i);
  });

  it('pins the exact non-scannable synthetic QR and rejects a different data image', () => {
    expect(QA_UNSCANNABLE_QR_DATA_URL).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,/
    );
    const decoded = decodeURIComponent(QA_UNSCANNABLE_QR_DATA_URL.split(',', 2)[1]!);
    expect(decoded).toContain('NOT SCANNABLE');
    expect(decoded).not.toMatch(/(?:farcaster|channel|token|(?:href|src)\s*=)/i);

    const awaiting = {
      ...EMPTY_FLOW,
      authPhase: 'awaiting-approval',
      qrSafe: true
    };
    expect(parseQaJourneyFlowObservation(awaiting, 'awaiting', EMPTY_FLOW.href)).toEqual({
      stage: 'awaiting'
    });
    expect(() => parseQaJourneyFlowObservation({ ...awaiting, qrSafe: false }, 'awaiting', (
      EMPTY_FLOW.href
    ))).toThrow(/qrSafe/i);
  });

  it('attests patch notes, Settings, and Credits with focus and close-state aggregates', () => {
    const href = 'http://127.0.0.1:41733/dev/qa-journey.html?scenario=journey';
    const viewport = { width: 1_440, height: 900 } as const;
    const emptySurface = {
      creditsPresentation: 'absent',
      documentWidth: 1_440,
      focusTarget: 'other',
      href,
      menuNavigationCount: 1,
      modalCount: 0,
      patchExpanded: false,
      surfaceExternalAnchorCount: 0,
      surfaceKind: 'none',
      surfaceWithinViewport: true,
      undersizedSurfaceButtonCount: 0,
      viewportHeight: 900,
      viewportWidth: 1_440,
      visibleSurfaceCount: 0
    };
    const stages = [
      ['patch-open', {
        focusTarget: 'patch-trigger',
        patchExpanded: true,
        surfaceKind: 'patch',
        visibleSurfaceCount: 1
      }],
      ['patch-closed', { focusTarget: 'patch-trigger' }],
      ['settings-open', {
        focusTarget: 'surface',
        modalCount: 1,
        surfaceKind: 'settings',
        visibleSurfaceCount: 1
      }],
      ['settings-closed', { focusTarget: 'settings-trigger' }],
      ['credits-open', {
        creditsPresentation: 'rolling',
        focusTarget: 'surface',
        modalCount: 1,
        surfaceExternalAnchorCount: 2,
        surfaceKind: 'credits',
        visibleSurfaceCount: 1
      }],
      ['credits-reading', {
        creditsPresentation: 'reading',
        focusTarget: 'surface',
        modalCount: 1,
        surfaceExternalAnchorCount: 2,
        surfaceKind: 'credits',
        visibleSurfaceCount: 1
      }],
      ['credits-closed', { focusTarget: 'credits-trigger' }]
    ] as const;
    for (const [stage, overlay] of stages) {
      expect(parseQaJourneyMenuSurfaceObservation(
        { ...emptySurface, ...overlay }, stage, href, viewport
      )).toEqual({ stage });
    }
    expect(() => parseQaJourneyMenuSurfaceObservation({
      ...emptySurface,
      focusTarget: 'surface',
      modalCount: 1,
      surfaceKind: 'settings',
      undersizedSurfaceButtonCount: 1,
      visibleSurfaceCount: 1
    }, 'settings-open', href, viewport)).toThrow(/surface-touch-target/i);
  });

  it('reuses the one attested browser envelope and never retains screenshot or DOM payloads', () => {
    const journeySource = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/qa-journey-browser-probe.mjs'
    ), 'utf8');
    const renderedSource = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/rendered-webgl-browser-probe.mjs'
    ), 'utf8');
    const journeyCss = readFileSync(resolve(
      process.cwd(),
      'src/dev/qaJourney.css'
    ), 'utf8');

    expect(renderedSource).toContain("await import('./qa-journey-browser-probe.mjs')");
    expect(renderedSource).toContain("from './png-visual-aggregate.mjs'");
    expect(renderedSource).toContain('...journeyCases.map((probeCase) => probeCase.url)');
    expect(renderedSource).toContain(
      'await journeyProbe.runQaJourneyBrowserCases(devtools, journeyCases, state)'
    );
    expect(journeySource).toContain("session.command('Page.captureScreenshot'");
    expect(journeySource).toContain('bytes.fill(0)');
    expect(journeySource).toContain("from './png-visual-aggregate.mjs'");
    expect(journeySource).not.toContain("from './rendered-webgl-browser-probe.mjs'");
    expect(journeySource).toContain(
      'qrSource === ${JSON.stringify(QA_UNSCANNABLE_QR_DATA_URL)}'
    );
    expect(journeySource).toContain(
      "await waitForFlowStage(session, 'realm', realmHref, state)"
    );
    expect(journeySource).toContain("await activateRealmMenuCommand(session, 'EXPLORE')");
    expect(journeySource).toContain("await activateRealmMenuCommand(session, 'SETTINGS')");
    expect(journeySource).toContain("await activateRealmMenuCommand(session, 'MAIN MENU')");
    expect(journeySource).toContain('document.elementFromPoint(centerX, centerY)');
    expect(journeySource).toContain('document.activeElement !== target');
    expect(journeySource).toContain(
      'element.closest(\'[inert],[aria-hidden="true"]\')'
    );
    expect(journeyCss).toContain('min-height: 44px');
    expect(journeySource).not.toMatch(
      /(?:mkdtemp|spawnHeadlessChromeProbe|createLoopbackViteServer|writeFile|appendFile|localStorage|sessionStorage|document\.cookie|\bfetch\s*\()/
    );
  });
});
