import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('local observer production exclusion', () => {
  it('keeps the production root independent and makes exclusion a mandatory build check', () => {
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
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const verifier = readFileSync(
      resolve(root, 'scripts/verify-production-dist-exclusions.mjs'),
      'utf8'
    );

    expect(main).not.toMatch(/realmObserver|RealmObserver|realm-observer-qa/i);
    expect(app).not.toMatch(/realmObserver|RealmObserver|realm-observer-qa/i);
    expect(observerSnapshot).not.toMatch(
      /(?:fetchRealmObserverSnapshot|REALM_OBSERVER_SNAPSHOT_URL|127\.0\.0\.1:41731)/
    );
    expect(observerHarness).not.toMatch(/(?:loadSnapshot|fetchRealmObserverSnapshot)/);
    expect(packageJson.scripts.build).toContain('verify-production-dist-exclusions.mjs');
    expect(verifier).toContain('http://127.0.0.1:41731');
    expect(verifier).toContain('realm-observer-qa.html');
    expect(verifier).toContain('realmObserverFixtureSnapshot');
    expect(verifier).toContain('createRealmObserverFixtureRealm');
    expect(verifier).toContain('QA OBSERVER · READ ONLY');
  });
});
