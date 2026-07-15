import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LOCAL_QA_HTML_ENTRIES = Object.freeze([
  'dev/qa-journey.html',
  'dev/realm-observer-qa.html',
  'dev/realm-rendered-webgl-qa.html'
]);

const LOCAL_QA_CONNECT_SOURCES = Object.freeze([
  "'self'",
  'blob:',
  'ws://127.0.0.1:*',
  'ws://localhost:*',
  'wss://127.0.0.1:*',
  'wss://localhost:*'
]);

const LOCAL_QA_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${LOCAL_QA_CONNECT_SOURCES.join(' ')}`,
  "worker-src 'self' blob:",
  "manifest-src 'none'"
].join('; ');

describe('local QA production exclusion', () => {
  it('pins every local QA entry to the same external-origin-denying development CSP', () => {
    for (const entry of LOCAL_QA_HTML_ENTRIES) {
      const html = readFileSync(resolve(process.cwd(), entry), 'utf8');
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const policies = parsed.querySelectorAll(
        'meta[http-equiv="Content-Security-Policy"]'
      );

      expect(policies, entry).toHaveLength(1);
      expect(policies[0]?.getAttribute('content'), entry).toBe(
        LOCAL_QA_CONTENT_SECURITY_POLICY
      );
    }

    expect(LOCAL_QA_CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(LOCAL_QA_CONTENT_SECURITY_POLICY).toContain("'wasm-unsafe-eval'");
    const connectDirective = LOCAL_QA_CONTENT_SECURITY_POLICY.split('; ').find(
      (directive) => directive.startsWith('connect-src ')
    );
    expect(connectDirective?.split(' ').slice(1)).toEqual(LOCAL_QA_CONNECT_SOURCES);
    expect(LOCAL_QA_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(LOCAL_QA_CONTENT_SECURITY_POLICY).toContain("frame-src 'none'");
    expect(LOCAL_QA_CONTENT_SECURITY_POLICY).toContain("form-action 'none'");
    expect(LOCAL_QA_CONTENT_SECURITY_POLICY).toContain("base-uri 'none'");
  });

  it('keeps production independent and makes every local QA entry fail closed', () => {
    const root = process.cwd();
    const main = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
    const observerSnapshot = readFileSync(
      resolve(root, 'src/dev/realmObserverSnapshot.ts'),
      'utf8'
    );
    const observerHarness = readFileSync(
      resolve(root, 'src/dev/RealmObserverQaHarness.tsx'),
      'utf8'
    );
    const observerMain = readFileSync(
      resolve(root, 'src/dev/realmObserverQaMain.tsx'),
      'utf8'
    );
    const renderedFixture = readFileSync(
      resolve(root, 'src/dev/renderedWebglQaFixture.ts'),
      'utf8'
    );
    const renderedHarness = readFileSync(
      resolve(root, 'src/dev/RenderedWebglQaHarness.tsx'),
      'utf8'
    );
    const renderedMain = readFileSync(
      resolve(root, 'src/dev/realmRenderedWebglQaMain.tsx'),
      'utf8'
    );
    const journeyMain = readFileSync(resolve(root, 'src/dev/qaJourneyMain.tsx'), 'utf8');
    const journeyLab = readFileSync(
      resolve(root, 'src/dev/WarpkeepQaJourneyLab.tsx'),
      'utf8'
    );
    const journeyFixture = readFileSync(
      resolve(root, 'src/dev/qaJourneyFixture.ts'),
      'utf8'
    );
    const journeyManifest = readFileSync(
      resolve(root, 'src/dev/qaJourneyScenarioManifest.mjs'),
      'utf8'
    );
    const runtimeGate = readFileSync(resolve(root, 'src/dev/localQaRuntime.ts'), 'utf8');
    const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const verifier = readFileSync(
      resolve(root, 'scripts/verify-production-dist-exclusions.mjs'),
      'utf8'
    );

    expect(main).not.toMatch(/realmObserver|RealmObserver|realm-observer-qa/i);
    expect(app).not.toMatch(/realmObserver|RealmObserver|realm-observer-qa/i);
    expect(main).not.toMatch(/renderedWebgl|RenderedWebgl|realm-rendered-webgl/i);
    expect(app).not.toMatch(/renderedWebgl|RenderedWebgl|realm-rendered-webgl/i);
    expect(main).not.toMatch(/qaJourney|QaJourney|qa-journey/i);
    expect(app).not.toMatch(/qaJourney|QaJourney|qa-journey/i);
    expect(observerSnapshot).not.toMatch(
      /(?:fetchRealmObserverSnapshot|REALM_OBSERVER_SNAPSHOT_URL|127\.0\.0\.1:41731)/
    );
    expect(observerHarness).not.toMatch(/(?:loadSnapshot|fetchRealmObserverSnapshot)/);
    expect(observerMain).toContain('assertLocalQaRuntime()');
    expect(observerMain).toContain("await import('./RealmObserverQaHarness')");
    expect(observerMain).not.toMatch(/^import .*RealmObserverQaHarness/m);
    expect(renderedFixture).not.toMatch(/(?:https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie)/);
    expect(renderedHarness).not.toMatch(
      /(?:useFarcasterAuth|FarcasterAuthProvider|useWarpkeepBackend|WarpkeepSpacetimeProvider)/
    );
    expect(renderedMain).toContain('assertLocalQaRuntime()');
    expect(renderedMain).toContain("import('./RenderedWebglQaHarness')");
    expect(renderedMain).not.toMatch(/^import .*RenderedWebglQaHarness/m);
    expect(journeyMain).toContain('assertLocalQaRuntime()');
    expect(journeyMain).toContain("import('./WarpkeepQaJourneyLab')");
    expect(journeyMain).not.toMatch(/^import .*WarpkeepQaJourneyLab/m);
    expect(`${journeyLab}\n${journeyFixture}\n${journeyManifest}`).not.toMatch(
      /(?:useFarcasterAuth|FarcasterAuthProvider|useWarpkeepBackend|WarpkeepSpacetimeProvider|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|channelToken|auth\.warpkeep\.com)/
    );
    expect(journeyFixture).not.toMatch(/https:\/\/(?:warpkeep|farcaster)\./);
    expect(runtimeGate).toContain("new Set(['localhost', '127.0.0.1', '::1', '[::1]'])");
    expect(viteConfig).toContain("input: resolve(process.cwd(), 'index.html')");
    expect(viteConfig).toContain("__WARPKEEP_LOCAL_QA__: JSON.stringify(command === 'serve')");
    expect(existsSync(resolve(root, 'dev/realm-qa.html'))).toBe(false);
    expect(existsSync(resolve(root, 'src/dev/RealmQaHarness.tsx'))).toBe(false);
    expect(packageJson.scripts.build).toContain('verify-production-dist-exclusions.mjs');
    expect(verifier).toContain('http://127.0.0.1:41731');
    expect(verifier).toContain('qa-journey.html');
    expect(verifier).toContain('WarpkeepQaJourneyLab');
    expect(verifier).toContain('qaJourneyScenarioManifest');
    expect(verifier).toContain('QA_JOURNEY_SCENARIO_MANIFEST');
    expect(verifier).toContain('Synthetic journey controls');
    expect(verifier).toContain('NOT%20SCANNABLE');
    expect(verifier).toContain('WARPKEEP QA JOURNEY LAB');
    expect(verifier).toContain('realm-observer-qa.html');
    expect(verifier).toContain('realm-rendered-webgl-qa.html');
    expect(verifier).toContain('realmObserverFixtureSnapshot');
    expect(verifier).toContain('createRealmObserverFixtureRealm');
    expect(verifier).toContain('QA OBSERVER · READ ONLY');
    expect(verifier).toContain('RenderedWebglQaHarness');
    expect(verifier).toContain('createRenderedWebglQaFixtureRealm');
    expect(verifier).toContain('LOCAL RENDERED WEBGL QA');
    expect(verifier).toMatch(/mustScanRegardlessOfSize/);
  });
});
