import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error The production verifier is an executable ESM module with named test seams.
import { allowedProductionHiddenPaths, allowedProductionHtmlPaths, expectedProductionCspByPath, verifyProductionDistExclusions } from '../scripts/verify-production-dist-exclusions.mjs';

const temporaryRoots: string[] = [];
const productionIndex = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const ownerCanaryIndex = readFileSync(resolve(process.cwd(), 'owner-canary/index.html'), 'utf8');

function writeOutput(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function createReviewedOutput() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-production-output-'));
  temporaryRoots.push(root);
  for (const htmlPath of allowedProductionHtmlPaths as readonly string[]) {
    const marker = htmlPath === 'index.html'
      ? ' data-warpkeep-production-csp'
      : htmlPath === 'owner-canary/index.html'
        ? ' data-warpkeep-owner-canary-production-csp'
        : '';
    writeOutput(
      join(root, htmlPath),
      htmlPath === 'index.html'
        ? productionIndex
        : htmlPath === 'owner-canary/index.html'
          ? ownerCanaryIndex
        : `<!doctype html><meta${marker} http-equiv="Content-Security-Policy" content="${
            expectedProductionCspByPath[htmlPath]
          }"><title>Warpkeep</title>`,
    );
  }
  const ownerCanaryPath = join(root, 'owner-canary/index.html');
  writeOutput(
    ownerCanaryPath,
    readFileSync(ownerCanaryPath, 'utf8').replace(
      '/src/owner-canary/main.tsx',
      '/assets/ownerCanary-reviewed.js',
    ),
  );
  writeOutput(
    join(root, 'assets/ownerCanary-reviewed.js'),
    'import "./ownerCanary-runtime.js";',
  );
  writeOutput(
    join(root, 'assets/ownerCanary-runtime.js'),
    'document.documentElement.dataset.ownerCanary = "v1";',
  );
  writeOutput(join(root, 'assets/app.js'), 'console.info("ordinary production fixture");');
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('production output exclusions', () => {
  it('accepts only the exact reviewed production HTML family', () => {
    expect(allowedProductionHiddenPaths).toEqual([
      '.well-known/farcaster.json',
    ]);
    expect(allowedProductionHtmlPaths).toEqual([
      'index.html',
      'owner-canary/index.html',
      'privacy/index.html',
      'social-contract/index.html',
      'terms/index.html',
    ]);
    expect(() => verifyProductionDistExclusions(createReviewedOutput())).not.toThrow();
  });

  it('rejects missing, renamed, or additional HTML output', () => {
    const missing = createReviewedOutput();
    rmSync(join(missing, 'privacy/index.html'));
    expect(() => verifyProductionDistExclusions(missing)).toThrow(/exact reviewed allowlist/i);

    const renamed = createReviewedOutput();
    writeOutput(join(renamed, 'privacy-copy/index.html'), '<!doctype html>');
    expect(() => verifyProductionDistExclusions(renamed)).toThrow(/exact reviewed allowlist/i);

    const localEntry = createReviewedOutput();
    writeOutput(join(localEntry, 'dev/fullstack-local-qa.html'), '<!doctype html>');
    expect(() => verifyProductionDistExclusions(localEntry)).toThrow(/exact reviewed allowlist/i);
  });

  it('allows only the exact manifest hidden path and rejects non-regular output', () => {
    const manifest = createReviewedOutput();
    writeOutput(
      join(manifest, '.well-known/farcaster.json'),
      '{"accountAssociation":{},"miniapp":{}}',
    );
    expect(() => verifyProductionDistExclusions(manifest)).not.toThrow();

    const hiddenLeak = createReviewedOutput();
    writeOutput(join(hiddenLeak, '.well-known/owner-secret'), 'not public');
    expect(() => verifyProductionDistExclusions(hiddenLeak)).toThrow(
      /hidden output.*exact reviewed allowlist/i,
    );

    const nestedHiddenLeak = createReviewedOutput();
    writeOutput(join(nestedHiddenLeak, 'assets/.source-map'), 'not public');
    expect(() => verifyProductionDistExclusions(nestedHiddenLeak)).toThrow(
      /hidden output.*exact reviewed allowlist/i,
    );

    const symlink = createReviewedOutput();
    symlinkSync(join(symlink, 'assets/app.js'), join(symlink, 'assets/app-link.js'));
    expect(() => verifyProductionDistExclusions(symlink)).toThrow(
      /non-regular path/i,
    );
  });

  it('requires one exact reviewed CSP meta in every production document', () => {
    const missing = createReviewedOutput();
    writeOutput(
      join(missing, 'privacy/index.html'),
      '<!doctype html><title>Warpkeep</title>',
    );
    expect(() => verifyProductionDistExclusions(missing)).toThrow(/one exact CSP meta/i);

    const duplicate = createReviewedOutput();
    const privacyPath = join(duplicate, 'privacy/index.html');
    writeOutput(
      privacyPath,
      `${readFileSync(privacyPath, 'utf8')}<meta http-equiv="Content-Security-Policy" content="${
        expectedProductionCspByPath['privacy/index.html']
      }">`,
    );
    expect(() => verifyProductionDistExclusions(duplicate)).toThrow(/one exact CSP meta/i);

    const malformed = createReviewedOutput();
    const termsPath = join(malformed, 'terms/index.html');
    writeOutput(
      termsPath,
      readFileSync(termsPath, 'utf8').replace("default-src 'none'", "default-src 'self'"),
    );
    expect(() => verifyProductionDistExclusions(malformed)).toThrow(/changed without review/i);

    const misplacedMarker = createReviewedOutput();
    const socialPath = join(misplacedMarker, 'social-contract/index.html');
    writeOutput(
      socialPath,
      readFileSync(socialPath, 'utf8').replace('<meta ', '<meta data-warpkeep-production-csp '),
    );
    expect(() => verifyProductionDistExclusions(misplacedMarker)).toThrow(/marker was invalid/i);
  });

  it('rejects normal application or Realm presentation code from the emitted owner graph', () => {
    const normalApplication = createReviewedOutput();
    writeOutput(
      join(normalApplication, 'assets/ownerCanary-reviewed.js'),
      'import "./application-private.js";',
    );
    writeOutput(
      join(normalApplication, 'assets/application-private.js'),
      'console.info("ordinary application");',
    );
    expect(() => verifyProductionDistExclusions(normalApplication)).toThrow(
      /owner canary production module graph/i,
    );

    const realmProvider = createReviewedOutput();
    writeOutput(
      join(realmProvider, 'assets/ownerCanary-runtime.js'),
      'export const leaked = "WarpkeepSpacetimeProvider";',
    );
    expect(() => verifyProductionDistExclusions(realmProvider)).toThrow(
      /owner canary production module graph/i,
    );
  });

  it.each([
    'FullstackLocalQaApp',
    'fullstackLocalQaBootstrap',
    'virtual:warpkeep-local-fullstack-bootstrap',
    'warpkeep-local-',
    'data-local-fullstack-',
    'persistent-worker-reentry=',
    'worker-private-seams=',
    'readRenderedWebglQaSfxSnapshot',
    'proveRenderedWebglQaOfflineSfxCorpus',
    'emitRenderedWebglQaProbeSfx',
    '__warpkeepRenderedWebglSfxLifecycleV1',
    'realmLocalQaWorkerProjections',
    'localQaWorkerProjectionTelemetry',
    'localQaLivingVisualTimeSeconds',
    'localQaGreaterRealmPresentationAllowed',
    'createRenderedWebglQaNorthernWorkerLocomotionRealm',
    'createRenderedWebglQaSouthernWorkerLocomotionRealm',
    'worker-locomotion-northern',
    'worker-locomotion-southern',
    'warpkeep-qa-terrain-shader-fallback',
    'REALM_TERRAIN_SHADER_QA_FORCED_FALLBACK',
    'LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF',
    'i.imgur.com/warpkeep-local-keeper.png',
  ])('rejects connected-local-QA marker %s from any production chunk', (marker) => {
    const root = createReviewedOutput();
    writeOutput(join(root, 'assets/local-leak.js'), `export const leaked = ${JSON.stringify(marker)};`);
    expect(() => verifyProductionDistExclusions(root)).toThrow(/local QA marker/i);
  });

  it('rejects the retired admission-request sample and every runtime marker', () => {
    const retiredFile = createReviewedOutput();
    writeOutput(
      join(retiredFile, 'audio/Hegemony_Empire_Admission_Request_Button.mp3'),
      'retired sample bytes',
    );
    expect(() => verifyProductionDistExclusions(retiredFile)).toThrow(
      /retired admission-request sound leaked/i,
    );

    for (const marker of [
      'Hegemony_Empire_Admission_Request_Button.mp3',
      'hegemony-empire-admission.request',
      'hegemony-admission-request',
    ]) {
      const retiredMarker = createReviewedOutput();
      writeOutput(
        join(retiredMarker, 'assets/app.js'),
        `export const retired = ${JSON.stringify(marker)};`,
      );
      expect(() => verifyProductionDistExclusions(retiredMarker)).toThrow(
        /retired admission-request sound marker/i,
      );
    }
  });
});
