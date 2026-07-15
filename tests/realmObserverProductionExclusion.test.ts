import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('local QA production exclusion', () => {
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
    expect(`${journeyLab}\n${journeyFixture}`).not.toMatch(
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
