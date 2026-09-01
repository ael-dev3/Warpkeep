import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const staleTransactionPrefix = '.warpkeep-family-install-';
export const allowedProductionHiddenPaths = Object.freeze([
  '.well-known/farcaster.json',
]);
export const allowedProductionHtmlPaths = Object.freeze([
  'index.html',
  'owner-canary/index.html',
  'privacy/index.html',
  'social-contract/index.html',
  'terms/index.html',
]);
const forbiddenPathFragments = Object.freeze([
  'fullstack-local-qa.html',
  'qa-journey.html',
  'realm-observer-qa.html',
  'realm-rendered-webgl-qa.html',
  'inner-keep-qa.html',
  'castle-lod-visual-evidence.html',
  'realm-qa.html'
]);
const retiredAdmissionSoundPathFragments = Object.freeze([
  'audio/Hegemony_Empire_Admission_Request_Button.mp3'
]);
const retiredAdmissionSoundContent = Object.freeze([
  'Hegemony_Empire_Admission_Request_Button.mp3',
  'hegemony-empire-admission.request',
  'hegemony-admission-request'
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
  'InnerKeepQaHarness',
  'innerKeepQaMain',
  'innerKeepQaScenarioManifest',
  'INNER_KEEP_QA_SCENARIO_MANIFEST',
  'LOCAL INNER KEEP QA',
  'SYNTHETIC · LOOPBACK ONLY · NO AUTHORITY',
  'realmRenderedWebglQaMain',
  'renderedWebglQaFixtureSnapshot',
  'createRenderedWebglQaFixtureRealm',
  'createRenderedWebglQaActiveWorkerRealm',
  'createRenderedWebglQaWorkerLocomotionRealm',
  'createRenderedWebglQaNorthernWorkerLocomotionRealm',
  'createRenderedWebglQaSouthernWorkerLocomotionRealm',
  'worker-active',
  'worker-locomotion',
  'worker-locomotion-northern',
  'worker-locomotion-southern',
  'warpkeep-qa-terrain-shader-fallback',
  'REALM_TERRAIN_SHADER_QA_FORCED_FALLBACK',
  'readRenderedWebglQaSfxSnapshot',
  'proveRenderedWebglQaOfflineSfxCorpus',
  'emitRenderedWebglQaProbeSfx',
  '__warpkeepRenderedWebglSfxLifecycleV1',
  'realmLocalQaWorkerProjections',
  'localQaWorkerProjectionTelemetry',
  'localQaLivingVisualTimeSeconds',
  'localQaGreaterRealmPresentationAllowed',
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
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: https://auth.warpkeep.com https://auth.farcaster.xyz https://relay.farcaster.xyz https://mainnet.optimism.io https://maincloud.spacetimedb.com wss://maincloud.spacetimedb.com https://imagedelivery.net https://wrpcd.net https://res.cloudinary.com https://i.imgur.com https://lh3.googleusercontent.com https://i.seadn.io; worker-src 'self' blob:; manifest-src 'none'";
const ownerCanaryProductionCsp =
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: https://auth.warpkeep.com https://auth.farcaster.xyz https://relay.farcaster.xyz https://maincloud.spacetimedb.com wss://maincloud.spacetimedb.com; worker-src 'self' blob:; manifest-src 'none'";
const legalProductionCsp =
  "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'";
export const expectedProductionCspByPath = Object.freeze({
  'index.html': applicationProductionCsp,
  'owner-canary/index.html': ownerCanaryProductionCsp,
  'privacy/index.html': legalProductionCsp,
  'social-contract/index.html': legalProductionCsp,
  'terms/index.html': legalProductionCsp,
});
const expectedProductionCspMarkerByPath = Object.freeze({
  'index.html': 'data-warpkeep-production-csp',
  'owner-canary/index.html': 'data-warpkeep-owner-canary-production-csp',
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
  const markerNames = Object.values(expectedProductionCspMarkerByPath);
  const actualMarkers = markerNames.filter((marker) => attributes.has(marker));
  const expectedMarker = expectedProductionCspMarkerByPath[relativePath];
  if (
    actualMarkers.length !== (expectedMarker === undefined ? 0 : 1)
    || (expectedMarker !== undefined && actualMarkers[0] !== expectedMarker)
  ) {
    throw new Error(`Production document ${relativePath} CSP marker was invalid.`);
  }
}

function filesUnder(directory, outputRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    const relativePath = relative(outputRoot, path).replaceAll('\\', '/');
    if (entry.name.startsWith(staleTransactionPrefix)) {
      throw new Error(`Unresolved atomic-family transaction state leaked into production output: ${relativePath}`);
    }
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error(`Production output contains a non-regular path: ${relativePath}`);
    }
    return entry.isDirectory() ? filesUnder(path, outputRoot) : [path];
  });
}

function ownerCanaryJavaScriptGraph(outputRoot, document) {
  const scripts = [...document.matchAll(
    /<script\b[^>]*\btype=(?:"module"|'module')[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*><\/script>/giu,
  )].map(match => match[1] ?? match[2]);
  if (scripts.length !== 1 || typeof scripts[0] !== 'string') {
    throw new Error('Owner canary production document must load one exact module entry.');
  }
  const assetsOffset = scripts[0].indexOf('assets/');
  if (assetsOffset < 0) {
    throw new Error('Owner canary production module entry must be a compiled asset.');
  }
  const entryRelative = scripts[0].slice(assetsOffset);
  if (!/^assets\/ownerCanary-[A-Za-z0-9_-]+\.js$/u.test(entryRelative)) {
    throw new Error('Owner canary production module entry name changed without review.');
  }

  const pending = [resolve(outputRoot, entryRelative)];
  const visited = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    const pathRelative = relative(outputRoot, path).replaceAll('\\', '/');
    if (
      pathRelative.startsWith('../')
      || !pathRelative.endsWith('.js')
      || !statSync(path).isFile()
    ) {
      throw new Error('Owner canary production module graph escaped the compiled asset boundary.');
    }
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+\.js)["']/gu,
    )) {
      const specifier = match[1];
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        throw new Error('Owner canary production module graph contains an external JavaScript import.');
      }
      pending.push(resolve(dirname(path), specifier));
    }
  }
  return [...visited];
}

export function verifyProductionDistExclusions(outputDirectory = dist) {
  const outputRoot = resolve(outputDirectory);
  const outputFiles = filesUnder(outputRoot, outputRoot);
  const relativeOutputPaths = outputFiles
    .map((path) => relative(outputRoot, path).replaceAll('\\', '/'));
  const hiddenPaths = relativeOutputPaths
    .filter((path) => path.split('/').some((segment) => segment.startsWith('.')))
    .sort();
  if (
    hiddenPaths.length > allowedProductionHiddenPaths.length
    || hiddenPaths.some(
      (path) => !allowedProductionHiddenPaths.includes(path),
    )
  ) {
    throw new Error(
      `Production hidden output must stay within the exact reviewed allowlist; received ${JSON.stringify(hiddenPaths)}.`,
    );
  }
  const htmlPaths = relativeOutputPaths
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
  const requiredProductionScriptSourceTokens = Object.freeze([
    "'self'",
    "'wasm-unsafe-eval'",
    "'unsafe-eval'"
  ]);
  const executableDocuments = [
    productionIndex,
    readFileSync(resolve(outputRoot, 'owner-canary/index.html'), 'utf8'),
  ];
  for (const document of executableDocuments) {
    const scriptSource = document.match(/(?:^|[;\s])script-src\s+([^;]+)/)?.[1];
    const scriptSourceTokens = scriptSource?.trim().split(/\s+/);
    if (
      scriptSourceTokens?.length !== requiredProductionScriptSourceTokens.length
      || !requiredProductionScriptSourceTokens.every(
        (token, index) => scriptSourceTokens?.[index] === token
      )
    ) {
      throw new Error('Production document CSP must keep the SDK eval exception narrow.');
    }
    if (/(?:^|[;\s])https:(?:[;\s]|$)|(?:^|[;\s])wss?:(?:[;\s]|$)/.test(document)) {
      throw new Error('Production document CSP permits an unrestricted network scheme.');
    }
    if (/localhost|127\.0\.0\.1|\[::1\]/.test(document)) {
      throw new Error('Production document CSP contains a loopback network exception.');
    }
  }
  const ownerCanaryIndex = executableDocuments[1];
  if (
    !ownerCanaryIndex.includes('<link rel="canonical" href="https://warpkeep.com/owner-canary/"')
    || !ownerCanaryIndex.includes('<meta name="referrer" content="no-referrer"')
    || !ownerCanaryIndex.includes('<meta name="robots" content="noindex, nofollow, noarchive"')
    || /(?:fc:miniapp|fc:frame|property="og:|rel="manifest")/i.test(ownerCanaryIndex)
  ) {
    throw new Error('Owner canary production document discovery boundary changed without review.');
  }
  const ownerCanaryGraph = ownerCanaryJavaScriptGraph(outputRoot, ownerCanaryIndex);
  const forbiddenOwnerCanaryGraphPath = ownerCanaryGraph.find((path) => (
    /(?:^|\/)(?:application|RealmMapScreen|InnerKeepScreen|WarpkeepTitleScreen3D|three\.module)-/u
      .test(relative(outputRoot, path).replaceAll('\\', '/'))
  ));
  const forbiddenOwnerCanaryGraphContent = [
    'WarpkeepSpacetimeProvider',
    'greaterRealmProviderBridge',
    'GreaterRealmWorldScene',
    'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED',
    'useWarpkeepBackend must be used within WarpkeepSpacetimeProvider',
  ].find(marker => ownerCanaryGraph.some(path => readFileSync(path, 'utf8').includes(marker)));
  if (forbiddenOwnerCanaryGraphPath || forbiddenOwnerCanaryGraphContent) {
    throw new Error('Owner canary production module graph imported normal application or Realm presentation code.');
  }

  for (const path of outputFiles) {
    const relativePath = relative(outputRoot, path).replaceAll('\\', '/');
    if (forbiddenPathFragments.some((fragment) => relativePath.includes(fragment))) {
      throw new Error(`Local QA entry leaked into production output: ${relativePath}`);
    }
    if (retiredAdmissionSoundPathFragments.some((fragment) => relativePath.includes(fragment))) {
      throw new Error(`Retired admission-request sound leaked into production output: ${relativePath}`);
    }
    const mustScanRegardlessOfSize = /\.(?:css|html|js|json|mjs|txt)$/i.test(relativePath);
    if (statSync(path).size > 10 * 1024 * 1024 && !mustScanRegardlessOfSize) continue;
    const content = readFileSync(path, 'utf8');
    const retiredAdmissionSoundMarker = retiredAdmissionSoundContent.find(
      (marker) => content.includes(marker)
    );
    if (retiredAdmissionSoundMarker) {
      throw new Error(
        `Retired admission-request sound marker ${JSON.stringify(retiredAdmissionSoundMarker)} leaked into ${relativePath}.`
      );
    }
    const leaked = forbiddenContent.find((marker) => content.includes(marker));
    if (leaked) throw new Error(`Local QA marker ${JSON.stringify(leaked)} leaked into ${relativePath}.`);
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  verifyProductionDistExclusions();
  console.log('Verified local QA entries, observer routes, broker coordinates, and the retired admission-request sound are absent from production output.');
}
