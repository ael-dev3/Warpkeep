import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
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

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
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
