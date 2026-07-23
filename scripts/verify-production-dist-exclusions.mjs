import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const staleTransactionPrefix = '.warpkeep-family-install-';
const forbiddenPathFragments = Object.freeze([
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
  'LOCAL RENDERED WEBGL QA',
  'SYNTHETIC · 100 CASTLES · NO AUTHORITY',
  'synthetic-canonical-100',
  'castleLodVisualEvidenceMain',
  'warpkeep-local-castle-lod-source',
  'hegemony-main-castle-source.glb',
  // The browser release is deliberately independent of the disabled,
  // machine-bound QA observer service. A Pages-only candidate must never ship
  // its endpoint, procedure, or configuration names to player JavaScript.
  'QA_OBSERVER_ENABLED',
  'qa_observer_get_realm_attestation_v2',
  'qa_observer_get_realm_snapshot_v1',
  '/v1/qa/challenge',
  '/v1/qa/realm-snapshot'
]);
const requiredProductionCspFragments = Object.freeze([
  'data-warpkeep-production-csp',
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  // SpacetimeDB 2.6.1 generates its typed serializers with Function during
  // connection setup. Keep this compatibility exception scoped to script-src.
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
  "script-src-attr 'none'",
  // Three.js decodes embedded GLB textures through origin-bound blob fetches.
  "connect-src 'self' blob:",
  'https://auth.warpkeep.com',
  'https://relay.farcaster.xyz',
  'https://mainnet.optimism.io',
  'https://maincloud.spacetimedb.com',
  'wss://maincloud.spacetimedb.com',
  'https://imagedelivery.net',
  'https://wrpcd.net',
  'https://res.cloudinary.com',
  'https://i.imgur.com',
  'https://lh3.googleusercontent.com',
  'https://i.seadn.io'
]);

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.name.startsWith(staleTransactionPrefix)) {
      const relativePath = relative(dist, path).replaceAll('\\', '/');
      throw new Error(`Unresolved atomic-family transaction state leaked into production output: ${relativePath}`);
    }
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const productionIndex = readFileSync(resolve(dist, 'index.html'), 'utf8');
for (const fragment of requiredProductionCspFragments) {
  if (!productionIndex.includes(fragment)) {
    throw new Error(`Production document CSP is missing ${JSON.stringify(fragment)}.`);
  }
}
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

for (const path of filesUnder(dist)) {
  const relativePath = relative(dist, path).replaceAll('\\', '/');
  if (forbiddenPathFragments.some((fragment) => relativePath.includes(fragment))) {
    throw new Error(`Local QA entry leaked into production output: ${relativePath}`);
  }
  const mustScanRegardlessOfSize = /\.(?:css|html|js|json|mjs|txt)$/i.test(relativePath);
  if (statSync(path).size > 10 * 1024 * 1024 && !mustScanRegardlessOfSize) continue;
  const content = readFileSync(path, 'utf8');
  const leaked = forbiddenContent.find((marker) => content.includes(marker));
  if (leaked) throw new Error(`Local QA marker ${JSON.stringify(leaked)} leaked into ${relativePath}.`);
}

console.log('Verified local QA entries, observer routes, and broker coordinates are absent from production output.');
