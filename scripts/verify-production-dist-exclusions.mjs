import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const staleTransactionPrefix = '.warpkeep-family-install-';
export const allowedProductionHtmlPaths = Object.freeze([
  'index.html',
  'privacy/index.html',
  'social-contract/index.html',
  'terms/index.html',
]);
const forbiddenPathFragments = Object.freeze([
  'fullstack-local-qa.html',
  'qa-journey.html',
  'realm-observer-qa.html',
  'realm-rendered-webgl-qa.html',
  'castle-lod-visual-evidence.html',
  'realm-qa.html'
]);
const forbiddenContent = Object.freeze([
  'http://127.0.0.1:41731',
  'WarpkeepQaJourneyLab',
  'qaJourneyMain',
  'qaJourneyFixture',
  'qaJourneyScenarioManifest',
  'QA_JOURNEY_SCENARIO_MANIFEST',
  'Synthetic journey controls',
  'NOT SCANNABLE',
  'NOT%20SCANNABLE',
  'WARPKEEP QA JOURNEY LAB',
  'SYNTHETIC · LOOPBACK ONLY · NO LIVE AUTHORITY',
  'SYNTHETIC · LOOPBACK ONLY · EXTERNAL LINKS DISABLED',
  'QA_UNSCANNABLE_QR_DATA_URL',
  'Synthetic QA Keeper',
  'RealmObserverQaHarness',
  'realmObserverQaMain',
  'realmObserverFixtureSnapshot',
  'createRealmObserverFixtureRealm',
  'QA OBSERVER · READ ONLY',
  'Close QA Observer',
  'Public presentation preview',
  'violetwarden',
  'stonekeeper',
  'frontierseer',
  'RenderedWebglQaHarness',
  'realmRenderedWebglQaMain',
  'renderedWebglQaFixtureSnapshot',
  'createRenderedWebglQaFixtureRealm',
  'createRenderedWebglQaActiveWorkerRealm',
  'createRenderedWebglQaWorkerLocomotionRealm',
  'createRenderedWebglQaNorthernWorkerLocomotionRealm',
  'worker-active',
  'worker-locomotion',
  'worker-locomotion-northern',
  'readRenderedWebglQaSfxSnapshot',
  'proveRenderedWebglQaOfflineSfxCorpus',
  'emitRenderedWebglQaProbeSfx',
  '__warpkeepRenderedWebglSfxLifecycleV1',
  'realmLocalQaWorkerProjections',
  'localQaWorkerProjectionTelemetry',
  'warpkeep-local-',
  'LOCAL RENDERED WEBGL QA',
  'SYNTHETIC · 100 CASTLES · NO AUTHORITY',
  'synthetic-canonical-100',
  'castleLodVisualEvidenceMain',
  'warpkeep-local-castle-lod-source',
  'hegemony-main-castle-source.glb',
  'FullstackLocalQaApp',
  'fullstackLocalQaBootstrap',
  'fullstackLocalQaMain',
  'virtual:warpkeep-local-fullstack-bootstrap',
  'data-local-fullstack-',
  'entry-agreement-continuity=',
  'persistent-worker-reentry=',
  'worker-private-seams=',
  'LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF',
  'LOCAL_QA_SYNTHETIC_MESSAGE',
  'Disposable full-stack QA',
  'profiles.example.com/warpkeep-local-keeper.png',
  'i.imgur.com/warpkeep-local-keeper.png',
  '/dev/fullstack-local-qa.html',
  // The browser release is deliberately independent of the disabled,
  // machine-bound QA observer service. A Pages-only candidate must never ship
  // its endpoint, procedure, or configuration names to player JavaScript.
  'QA_OBSERVER_ENABLED',
  'qa_observer_get_realm_attestation_v2',
  'qa_observer_get_realm_snapshot_v1',
  '/v1/qa/challenge',
  '/v1/qa/realm-snapshot'
]);
const applicationProductionCsp =
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: https://auth.warpkeep.com https://relay.farcaster.xyz https://mainnet.optimism.io https://maincloud.spacetimedb.com wss://maincloud.spacetimedb.com https://imagedelivery.net https://wrpcd.net https://res.cloudinary.com https://i.imgur.com https://lh3.googleusercontent.com https://i.seadn.io; worker-src 'self' blob:; manifest-src 'none'";
const legalProductionCsp =
  "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'";
export const expectedProductionCspByPath = Object.freeze({
  'index.html': applicationProductionCsp,
  'privacy/index.html': legalProductionCsp,
  'social-contract/index.html': legalProductionCsp,
  'terms/index.html': legalProductionCsp,
});

function parseMetaAttributes(tag) {
  const attributes = new Map();
  const source = tag.replace(/^<meta\b/i, '').replace(/\/?>$/u, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (attributes.has(name)) {
      throw new Error('Production document contains a duplicate meta attribute.');
    }
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function verifyExactProductionCsp(relativePath, document) {
  const policies = [...document.matchAll(/<meta\b[^>]*>/giu)]
    .map((match) => parseMetaAttributes(match[0]))
    .filter((attributes) => (
      attributes.get('http-equiv')?.toLowerCase() === 'content-security-policy'
    ));
  if (policies.length !== 1) {
    throw new Error(`Production document ${relativePath} must contain one exact CSP meta.`);
  }
  const attributes = policies[0];
  if (attributes.get('content') !== expectedProductionCspByPath[relativePath]) {
    throw new Error(`Production document ${relativePath} CSP changed without review.`);
  }
  const hasProductionMarker = attributes.has('data-warpkeep-production-csp');
  if (hasProductionMarker !== (relativePath === 'index.html')) {
    throw new Error(`Production document ${relativePath} CSP marker was invalid.`);
  }
}

function filesUnder(directory, outputRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.name.startsWith(staleTransactionPrefix)) {
      const relativePath = relative(outputRoot, path).replaceAll('\\', '/');
      throw new Error(`Unresolved atomic-family transaction state leaked into production output: ${relativePath}`);
    }
    return entry.isDirectory() ? filesUnder(path, outputRoot) : [path];
  });
}

export function verifyProductionDistExclusions(outputDirectory = dist) {
  const outputRoot = resolve(outputDirectory);
  const outputFiles = filesUnder(outputRoot, outputRoot);
  const htmlPaths = outputFiles
    .map((path) => relative(outputRoot, path).replaceAll('\\', '/'))
    .filter((path) => path.toLowerCase().endsWith('.html'))
    .sort();
  if (
    htmlPaths.length !== allowedProductionHtmlPaths.length
    || allowedProductionHtmlPaths.some((path, index) => htmlPaths[index] !== path)
  ) {
    throw new Error(
      `Production HTML output must match the exact reviewed allowlist; received ${JSON.stringify(htmlPaths)}.`
    );
  }

  for (const htmlPath of allowedProductionHtmlPaths) {
    verifyExactProductionCsp(
      htmlPath,
      readFileSync(resolve(outputRoot, htmlPath), 'utf8'),
    );
  }
  const productionIndex = readFileSync(resolve(outputRoot, 'index.html'), 'utf8');
  const productionScriptSource = productionIndex.match(/(?:^|[;\s])script-src\s+([^;]+)/)?.[1];
  const productionScriptSourceTokens = productionScriptSource?.trim().split(/\s+/);
  const requiredProductionScriptSourceTokens = Object.freeze([
    "'self'",
    "'wasm-unsafe-eval'",
    "'unsafe-eval'"
  ]);
  if (
    productionScriptSourceTokens?.length !== requiredProductionScriptSourceTokens.length
    || !requiredProductionScriptSourceTokens.every(
      (token, index) => productionScriptSourceTokens?.[index] === token
    )
  ) {
    throw new Error('Production document CSP must keep the SDK eval exception narrow.');
  }
  if (/(?:^|[;\s])https:(?:[;\s]|$)|(?:^|[;\s])wss?:(?:[;\s]|$)/.test(productionIndex)) {
    throw new Error('Production document CSP permits an unrestricted network scheme.');
  }
  if (/localhost|127\.0\.0\.1|\[::1\]/.test(productionIndex)) {
    throw new Error('Production document CSP contains a loopback network exception.');
  }

  for (const path of outputFiles) {
    const relativePath = relative(outputRoot, path).replaceAll('\\', '/');
    if (forbiddenPathFragments.some((fragment) => relativePath.includes(fragment))) {
      throw new Error(`Local QA entry leaked into production output: ${relativePath}`);
    }
    const mustScanRegardlessOfSize = /\.(?:css|html|js|json|mjs|txt)$/i.test(relativePath);
    if (statSync(path).size > 10 * 1024 * 1024 && !mustScanRegardlessOfSize) continue;
    const content = readFileSync(path, 'utf8');
    const leaked = forbiddenContent.find((marker) => content.includes(marker));
    if (leaked) throw new Error(`Local QA marker ${JSON.stringify(leaked)} leaked into ${relativePath}.`);
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  verifyProductionDistExclusions();
  console.log('Verified local QA entries, observer routes, and broker coordinates are absent from production output.');
}
