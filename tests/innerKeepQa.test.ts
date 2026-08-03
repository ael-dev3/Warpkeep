import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { innerKeepPresentationIntegrity } from '../src/components/inner-keep/innerKeepPresentation';
import {
  INNER_KEEP_QA_CONSTRUCTION_DURATION_MICROS,
  completeSyntheticInnerKeepQaPresentation,
  createSyntheticInnerKeepQaPresentation
} from '../src/dev/innerKeepQaFixture';
import {
  INNER_KEEP_QA_SCENARIO_IDS,
  INNER_KEEP_QA_SCENARIO_MANIFEST,
  innerKeepQaScenarioById,
  readInnerKeepQaScenario
} from '../src/dev/innerKeepQaScenarioManifest.mjs';
import {
  INNER_KEEP_QA_CASE_COUNT,
  assertInnerKeepQaScenarioEvidence,
  innerKeepQaBrowserCases,
  innerKeepQaUrl
} from '../scripts/qa-observer/inner-keep-qa-contract.mjs';

const EXPECTED_SCENARIOS = Object.freeze([
  'empty',
  'completed-level-1',
  'completed-level-2',
  'completed-level-3',
  'completed-level-4',
  'completed-level-5',
  'construction-1-percent',
  'construction-50-percent',
  'construction-99-percent',
  'completion-reveal',
  'builder-busy',
  'insufficient-resources',
  'compact-quality',
  'reduced-motion',
  'missing-asset-fallback',
  '2d-fallback'
]);

function evidenceFor(
  scenarioId: (typeof INNER_KEEP_QA_SCENARIO_IDS)[number],
  overrides: Readonly<Record<string, unknown>> = {}
) {
  const scenario = innerKeepQaScenarioById(scenarioId);
  const webgl = scenario.renderMode === 'webgl';
  const constructing = [
    'constructing',
    'completion-reveal',
    'builder-busy'
  ].includes(scenario.state);
  const completed = ['complete', 'missing-asset'].includes(scenario.state);
  return {
    version: 1,
    scenario: scenario.id,
    renderMode: scenario.renderMode,
    innerKeepRenderer: scenario.renderMode,
    quality: scenario.quality,
    reducedMotion: scenario.reducedMotion,
    status: 'ready',
    progressBasisPoints: scenario.progressBasisPoints,
    canvasCount: webgl ? 1 : 0,
    rendererCount: webgl ? 1 : 0,
    webglContextCount: webgl ? 1 : 0,
    rafOwnerCount: webgl ? 1 : 0,
    maximumPendingRafCount: webgl ? 1 : 0,
    slotControlCount: 12,
    enabledSlotControlCount: 12,
    slotCount: 12,
    slotGeometryCount: webgl ? 12 : 0,
    smokeSpriteCount: constructing ? 96 : 0,
    constructionSiteCount: constructing ? 1 : 0,
    completedBuildingCount: completed ? 1 : 0,
    finalModelCount: completed && webgl ? 1 : 0,
    scaffoldPresent: constructing,
    completionRevealActive: false,
    assetFallbackCount: scenario.state === 'missing-asset' ? 2 : 0,
    builderBusyVisible: scenario.state === 'builder-busy',
    insufficientResourcesVisible: scenario.state === 'insufficient',
    levelVisible: scenario.level !== null,
    viewportWidth: 1_440,
    viewportHeight: 900,
    documentWidth: 1_440,
    documentHeight: 900,
    horizontalOverflow: false,
    verticalOverflow: false,
    ...overrides
  };
}

describe('local Inner Keep QA fixtures', () => {
  it('pins every requested scenario once and rejects arbitrary query input', () => {
    expect(INNER_KEEP_QA_SCENARIO_IDS).toEqual(EXPECTED_SCENARIOS);
    expect(INNER_KEEP_QA_SCENARIO_MANIFEST).toHaveLength(16);
    expect(INNER_KEEP_QA_CASE_COUNT).toBe(16);
    expect(new Set(INNER_KEEP_QA_SCENARIO_IDS).size).toBe(16);
    expect(readInnerKeepQaScenario('?scenario=construction-50-percent').id)
      .toBe('construction-50-percent');
    expect(readInnerKeepQaScenario('?scenario=not-reviewed').id).toBe('empty');
    expect(readInnerKeepQaScenario('?scenario=empty&extra=true').id).toBe('empty');
    expect(readInnerKeepQaScenario('?scenario=empty&scenario=completed-level-5').id)
      .toBe('empty');
  });

  it('builds integrity-valid synthetic projections with exact construction progress', () => {
    const observedAtMicros = 2_000_000_000_000_000n;
    for (const scenario of INNER_KEEP_QA_SCENARIO_MANIFEST) {
      const presentation = createSyntheticInnerKeepQaPresentation(
        scenario,
        observedAtMicros
      );
      expect(innerKeepPresentationIntegrity(presentation), scenario.id).toBe(true);
      expect(presentation.castleId).toBeTypeOf('bigint');
      expect(presentation.slots).toHaveLength(12);
      expect(presentation.catalogue).toHaveLength(4);
      expect(JSON.stringify(presentation, (_key, value) => (
        typeof value === 'bigint' ? value.toString() : value
      ))).not.toMatch(/(?:fid|token|wallet|receipt|requestKey)/i);
      if (scenario.progressBasisPoints !== null) {
        const building = presentation.buildings[0];
        expect(building?.phase).toBe('constructing');
        expect(observedAtMicros - building!.startedAtMicros!).toBe(
          INNER_KEEP_QA_CONSTRUCTION_DURATION_MICROS
            * BigInt(scenario.progressBasisPoints) / 10_000n
        );
      }
    }
  });

  it('models an authoritative construction-to-complete observation without an empty state', () => {
    const scenario = innerKeepQaScenarioById('completion-reveal');
    const constructing = createSyntheticInnerKeepQaPresentation(
      scenario,
      2_000_000_000_000_000n
    );
    const complete = completeSyntheticInnerKeepQaPresentation(constructing);
    expect(constructing.buildings).toMatchObject([{ phase: 'constructing' }]);
    expect(complete.buildings).toMatchObject([{
      completedLevel: 1,
      phase: 'complete',
      targetLevel: 1
    }]);
    expect(complete.projectRevision).toBe(constructing.projectRevision + 1n);
    expect(complete.builder).toEqual({ state: 'idle' });
    expect(innerKeepPresentationIntegrity(complete)).toBe(true);
  });
});

describe('local Inner Keep rendered evidence contract', () => {
  it('formats only the fixed numeric-loopback route and complete case matrix', () => {
    expect(innerKeepQaUrl({ port: 41734, scenario: 'completion-reveal' })).toBe(
      'http://127.0.0.1:41734/dev/inner-keep-qa.html?scenario=completion-reveal'
    );
    expect(() => innerKeepQaUrl({ port: 0 })).toThrow(/loopback port/i);
    expect(() => innerKeepQaUrl({
      port: 41734,
      scenario: 'arbitrary' as 'empty'
    })).toThrow(/scenario/i);
    const cases = innerKeepQaBrowserCases(41734);
    expect(cases.map((entry) => entry.id)).toEqual(EXPECTED_SCENARIOS);
    expect(cases.filter((entry) => entry.viewport.width === 390).map((entry) => entry.id))
      .toEqual([
        'construction-99-percent',
        'compact-quality',
        'reduced-motion',
        'missing-asset-fallback',
        '2d-fallback'
      ]);
  });

  it('requires exactly one renderer/context/RAF owner for WebGL and none for fallback', () => {
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('construction-50-percent'),
      'construction-50-percent'
    )).toMatchObject({
      canvasCount: 1,
      finalModelCount: 0,
      rendererCount: 1,
      scaffoldPresent: true,
      webglContextCount: 1
    });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('2d-fallback', {
        viewportWidth: 390,
        viewportHeight: 844,
        documentWidth: 390,
        documentHeight: 844
      }),
      '2d-fallback'
    )).toMatchObject({
      canvasCount: 0,
      rendererCount: 0,
      slotControlCount: 12,
      webglContextCount: 0
    });
    for (const override of [
      { rendererCount: 2 },
      { webglContextCount: 2 },
      { rafOwnerCount: 2 },
      { maximumPendingRafCount: 2 },
      { slotGeometryCount: 11 }
    ]) {
      expect(() => assertInnerKeepQaScenarioEvidence(
        evidenceFor('empty', override),
        'empty'
      )).toThrow(/single-renderer/i);
    }
  });

  it('proves construction, bounded reveal, completed, busy, insufficient, and missing-art states', () => {
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('completion-reveal', {
        completedBuildingCount: 1,
        completionRevealActive: true,
        constructionSiteCount: 0,
        finalModelCount: 1,
        scaffoldPresent: true
      }),
      'completion-reveal',
      'reveal'
    )).toMatchObject({ completionRevealActive: true });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('completion-reveal', {
        completedBuildingCount: 1,
        completionRevealActive: false,
        constructionSiteCount: 0,
        finalModelCount: 1,
        scaffoldPresent: false,
        smokeSpriteCount: 0
      }),
      'completion-reveal',
      'completed'
    )).toMatchObject({ finalModelCount: 1, scaffoldPresent: false });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('builder-busy'),
      'builder-busy'
    ).builderBusyVisible).toBe(true);
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('insufficient-resources'),
      'insufficient-resources'
    ).insufficientResourcesVisible).toBe(true);
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('missing-asset-fallback'),
      'missing-asset-fallback'
    ).assetFallbackCount).toBeGreaterThan(0);
  });
});

describe('local Inner Keep QA production boundary', () => {
  it('pins a loopback-only CSP, dynamic entry, and explicit production exclusion', () => {
    const root = process.cwd();
    const html = readFileSync(resolve(root, 'dev/inner-keep-qa.html'), 'utf8');
    const main = readFileSync(resolve(root, 'src/dev/innerKeepQaMain.tsx'), 'utf8');
    const harness = readFileSync(resolve(root, 'src/dev/InnerKeepQaHarness.tsx'), 'utf8');
    const fixture = readFileSync(resolve(root, 'src/dev/innerKeepQaFixture.ts'), 'utf8');
    const manifest = readFileSync(
      resolve(root, 'src/dev/innerKeepQaScenarioManifest.mjs'),
      'utf8'
    );
    const productionMain = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
    const productionApp = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
    const verifier = readFileSync(
      resolve(root, 'scripts/verify-production-dist-exclusions.mjs'),
      'utf8'
    );
    const browserProbe = readFileSync(
      resolve(root, 'scripts/qa-observer/inner-keep-browser-probe.mjs'),
      'utf8'
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const csp = parsed.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
    expect(csp).toHaveLength(1);
    expect(csp[0]?.getAttribute('content')).toContain("default-src 'none'");
    expect(csp[0]?.getAttribute('content')).toContain("connect-src 'self' blob: ws://127.0.0.1:*");
    expect(csp[0]?.getAttribute('content')).not.toMatch(/https:\/\/(?:warpkeep|farcaster|maincloud)/);
    expect(main).toContain('assertLocalQaRuntime()');
    expect(main).toContain("import('./InnerKeepQaHarness')");
    expect(main).not.toMatch(/^import .*InnerKeepQaHarness/m);
    expect(harness.match(/new THREE\.WebGLRenderer/g)).toHaveLength(1);
    expect(harness).toContain('createInnerKeepSceneLayer');
    expect(harness).toContain('data-inner-keep-qa-canvas');
    expect(`${fixture}\n${manifest}`).not.toMatch(
      /(?:useFarcasterAuth|FarcasterAuthProvider|useWarpkeepBackend|WarpkeepSpacetimeProvider|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|auth\.warpkeep\.com)/
    );
    expect(productionMain).not.toMatch(/innerKeepQa|InnerKeepQa|inner-keep-qa/i);
    expect(productionApp).not.toMatch(/innerKeepQa|InnerKeepQa|inner-keep-qa/i);
    expect(verifier).toContain('inner-keep-qa.html');
    expect(verifier).toContain('InnerKeepQaHarness');
    expect(verifier).toContain('INNER_KEEP_QA_SCENARIO_MANIFEST');
    expect(browserProbe).toContain('attestStableHeadlessChromeExecutable');
    expect(browserProbe).toContain('exactChromeExecutableIdentity');
    expect(browserProbe).toContain('DevtoolsPipeSession');
    expect(browserProbe).toContain("'Fetch.enable'");
    expect(browserProbe).toContain("'Page.captureScreenshot'");
    expect(browserProbe).toContain("'Input.dispatchKeyEvent'");
    expect(browserProbe).toContain('exerciseWebglNativeKeyboardActivation');
    expect(browserProbe).toContain('createLoopbackViteServer');
    expect(packageJson.scripts['qa:inner-keep']).toBe(
      'node scripts/qa-observer/inner-keep-browser-probe.mjs'
    );
  });
});
