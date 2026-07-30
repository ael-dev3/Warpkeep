import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  LOCAL_FULLSTACK_QA_DATABASE,
  LOCAL_FULLSTACK_QA_AUDIENCE,
  LOCAL_FULLSTACK_QA_ISSUER,
  LOCAL_FULLSTACK_QA_PROFILE_URL,
  localFullstackQaRuntimeConfig,
  readLocalFullstackQaBootstrap,
} from '../src/dev/fullstackLocalQaBootstrap';
import { hasUsableWarpkeepBridge } from '../src/spacetime/warpkeepConfig';
// @ts-expect-error The development-only Vite plugin is an executable ESM module.
import { LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID, localFullstackBootstrapVitePlugin } from '../scripts/qa-observer/local-fullstack-bootstrap-vite-plugin.mjs';
// @ts-expect-error The development-only browser probe is an executable ESM module.
import { installLocalFullstackSignalCleanup, isAllowedLocalFullstackBrowserUrl, safeBrowserRuntimeExceptionCode } from '../scripts/qa-observer/local-fullstack-browser-probe.mjs';
// @ts-expect-error The disposable SpacetimeDB launcher is an executable ESM module.
import { runDisposableLocalFullstackCli, startDisposableLocalFullstackSpacetime, terminateLocalFullstackProcessGroup } from '../scripts/qa-observer/local-fullstack-spacetime.mjs';

const NOW = 1_800_000_000_000;
const TEST_ACCESS_TOKEN = `${'a'.repeat(43)}.${'b'.repeat(43)}.${'c'.repeat(86)}`;
const VALID_BOOTSTRAP = Object.freeze({
  version: 1,
  spacetimeUri: 'http://127.0.0.1:3000',
  database: LOCAL_FULLSTACK_QA_DATABASE,
  issuer: LOCAL_FULLSTACK_QA_ISSUER,
  audience: LOCAL_FULLSTACK_QA_AUDIENCE,
  fid: 9_900_001,
  username: 'qa.warpkeeper',
  displayName: 'Synthetic QA Keeper',
  pfpUrl: LOCAL_FULLSTACK_QA_PROFILE_URL,
  accessToken: TEST_ACCESS_TOKEN,
  accessExpiresAt: NOW + 5 * 60 * 1_000,
  sessionExpiresAt: NOW + 10 * 60 * 1_000,
});
const PLUGIN_NOW = Date.now();
const VALID_PLUGIN_BOOTSTRAP = Object.freeze({
  ...VALID_BOOTSTRAP,
  accessExpiresAt: PLUGIN_NOW + 5 * 60 * 1_000,
  sessionExpiresAt: PLUGIN_NOW + 10 * 60 * 1_000,
});

function changedBootstrap(overrides: Record<string, unknown>) {
  return { ...VALID_BOOTSTRAP, ...overrides };
}

function changedPluginBootstrap(overrides: Record<string, unknown>) {
  return { ...VALID_PLUGIN_BOOTSTRAP, ...overrides };
}

describe('privacy-safe browser runtime diagnostics', () => {
  it('exposes only bounded exception categories and identifiers', () => {
    expect(safeBrowserRuntimeExceptionCode({
      exception: { description: 'ReferenceError: canvas is not defined' },
    })).toBe('reference-canvas');
    expect(safeBrowserRuntimeExceptionCode({
      exception: {
        description: "TypeError: Cannot read properties of undefined (reading 'status')",
      },
    })).toBe('invalid-read-status');
    expect(safeBrowserRuntimeExceptionCode({
      exception: { description: 'Error: secret-like diagnostic must stay private' },
    })).toBe('runtime-exception');
    expect(safeBrowserRuntimeExceptionCode(undefined)).toBe('');
  });
});

function importSpecifiers(source: string) {
  return [
    ...source.matchAll(
      /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
    ),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]!);
}

function resolveSourceImport(importer: string, specifier: string) {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(importer), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
    resolve(base, 'index.js'),
    resolve(base, 'index.mjs'),
  ];
  return candidates.find((candidate) => (
    existsSync(candidate) && statSync(candidate).isFile()
  ));
}

function sourceGraph(entry: string, forbidLocalBootstrap = false) {
  const root = resolve(process.cwd(), 'src');
  const pending = [resolve(root, entry)];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    if (forbidLocalBootstrap) {
      expect(source).not.toContain(LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID);
    }
    for (const specifier of importSpecifiers(source)) {
      const dependency = resolveSourceImport(path, specifier);
      if (dependency?.startsWith(`${root}/`)) pending.push(dependency);
    }
  }
  return visited;
}

describe('disposable connected local QA bootstrap', () => {
  it('accepts one exact, short-lived loopback authority and activates only that runtime', () => {
    const candidate = { ...VALID_BOOTSTRAP };
    const bootstrap = readLocalFullstackQaBootstrap(candidate, NOW);
    const config = localFullstackQaRuntimeConfig(bootstrap);

    expect(bootstrap).toEqual(VALID_BOOTSTRAP);
    expect(Object.isFrozen(bootstrap)).toBe(true);
    expect(config).toEqual({
      spacetimeUri: 'http://127.0.0.1:3000',
      spacetimeDatabase: LOCAL_FULLSTACK_QA_DATABASE,
      bridgeUrl: LOCAL_FULLSTACK_QA_ISSUER,
      issuer: LOCAL_FULLSTACK_QA_ISSUER,
      audience: LOCAL_FULLSTACK_QA_AUDIENCE,
      publicConfigValid: true,
      sharedAlphaEnabled: true,
      allowLocalHttp: true,
    });
    expect(hasUsableWarpkeepBridge(config)).toBe(true);
  });

  it.each([
    ['an extra field', changedBootstrap({ unexpected: true })],
    ['a missing field', (() => {
      const { displayName: _displayName, ...missing } = VALID_BOOTSTRAP;
      return missing;
    })()],
    ['Maincloud', changedBootstrap({
      spacetimeUri: 'https://maincloud.spacetimedb.com',
    })],
    ['localhost', changedBootstrap({
      spacetimeUri: 'http://localhost:3000',
    })],
    ['a LAN address', changedBootstrap({
      spacetimeUri: 'http://192.168.1.20:3000',
    })],
    ['a portless loopback address', changedBootstrap({
      spacetimeUri: 'http://127.0.0.1',
    })],
    ['a path-bearing loopback address', changedBootstrap({
      spacetimeUri: 'http://127.0.0.1:3000/database',
    })],
    ['a slash-normalized loopback address', changedBootstrap({
      spacetimeUri: 'http://127.0.0.1:3000/',
    })],
    ['a production database', changedBootstrap({
      database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    })],
    ['a production issuer', changedBootstrap({
      issuer: 'https://auth.warpkeep.com',
    })],
    ['another audience', changedBootstrap({
      audience: 'another-audience',
    })],
    ['a profile URL outside the fixture', changedBootstrap({
      pfpUrl: 'https://i.imgur.com/another-profile.png',
    })],
    ['a malformed username', changedBootstrap({
      username: 'production-user',
    })],
    ['a malformed bearer', changedBootstrap({
      accessToken: 'not-a-jwt',
    })],
    ['an expired bearer', changedBootstrap({
      accessExpiresAt: NOW,
    })],
    ['an overlong bearer lifetime', changedBootstrap({
      accessExpiresAt: NOW + 10 * 60 * 1_000 + 1,
      sessionExpiresAt: NOW + 10 * 60 * 1_000 + 1,
    })],
    ['a session shorter than the bearer', changedBootstrap({
      sessionExpiresAt: NOW + 60_000,
    })],
  ])('rejects %s before creating browser runtime configuration', (_label, value) => {
    expect(() => readLocalFullstackQaBootstrap(value, NOW)).toThrow(
      'Disposable full-stack QA bootstrap is invalid.'
    );
  });

  it('exposes the bootstrap through one exact virtual module and destroys its source', () => {
    const plugin = localFullstackBootstrapVitePlugin(VALID_PLUGIN_BOOTSTRAP);
    const resolved = plugin.resolveId?.call({} as never, LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID);
    expect(plugin.name).toBe('warpkeep-local-fullstack-bootstrap');
    expect(plugin.enforce).toBe('pre');
    expect(resolved).toBe(`\0${LOCAL_FULLSTACK_BOOTSTRAP_MODULE_ID}`);
    expect(plugin.resolveId?.call({} as never, 'virtual:other')).toBeNull();
    expect(plugin.load?.call({} as never, 'virtual:other')).toBeNull();
    expect(plugin.load?.call({} as never, resolved as string)).toContain(TEST_ACCESS_TOKEN);

    plugin.closeBundle?.call({} as never);
    expect(plugin.load?.call({} as never, resolved as string)).toBe('');
  });

  it.each([
    ['an extra field', changedPluginBootstrap({ unexpected: true })],
    ['a missing field', (() => {
      const { issuer: _issuer, ...missing } = VALID_PLUGIN_BOOTSTRAP;
      return missing;
    })()],
    ['a short bearer', changedPluginBootstrap({ accessToken: 'a.b.c' })],
    ['Maincloud', changedPluginBootstrap({
      spacetimeUri: 'https://maincloud.spacetimedb.com',
    })],
    ['a production database', changedPluginBootstrap({
      database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    })],
    ['a production issuer', changedPluginBootstrap({
      issuer: 'https://auth.warpkeep.com',
    })],
    ['another audience', changedPluginBootstrap({
      audience: 'another-audience',
    })],
  ])('refuses to serialize %s into the virtual authority module', (_label, value) => {
    expect(() => localFullstackBootstrapVitePlugin(value)).toThrow(
      'Invalid disposable full-stack bootstrap.'
    );
  });
});

describe('disposable connected local QA dependency and network boundaries', () => {
  it('keeps every production entry dependency outside local QA source', () => {
    const graph = sourceGraph('main.tsx', true);
    expect(graph.size).toBeGreaterThan(10);
    expect([...graph]).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/src\/dev\//),
      ])
    );
  });

  it('keeps the local auth state machine transitively independent of production network clients', () => {
    const graph = sourceGraph('dev/fullstackLocalQaMain.tsx');
    expect([...graph]).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/FarcasterAuthProviderCore\.tsx$/),
      expect.stringMatching(/\/FullstackLocalQaApp\.tsx$/),
    ]));
    expect([...graph]).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/\/FarcasterAuthProvider\.tsx$/),
      expect.stringMatching(/\/farcasterAuthClient\.ts$/),
      expect.stringMatching(/\/farcasterOidcBridgeClient\.ts$/),
      expect.stringMatching(/\/farcasterQrCode\.ts$/),
    ]));
  });

  it('does not directly couple local QA to publishers, operators, or Farcaster network clients', () => {
    const paths = [
      'src/farcaster/FarcasterAuthProviderCore.tsx',
      'src/dev/fullstackLocalQaMain.tsx',
      'src/dev/FullstackLocalQaApp.tsx',
      'src/dev/fullstackLocalQaBootstrap.ts',
      'scripts/qa-observer/local-fullstack-bootstrap-vite-plugin.mjs',
      'scripts/qa-observer/local-fullstack-browser-probe.mjs',
      'scripts/qa-observer/local-fullstack-spacetime.mjs',
    ];
    const forbidden = /(?:publish-spacetime-dev|hermes-admin|marks-operator|profiles-operator|services\/auth-bridge|farcasterAuthClient|farcasterOidcBridgeClient)/;

    for (const relativePath of paths) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(importSpecifiers(source), relativePath).not.toEqual(
        expect.arrayContaining([expect.stringMatching(forbidden)])
      );
    }
  });

  it('checks the built module for forbidden authority bytes, not with URL validation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-spacetime.mjs'),
      'utf8'
    );
    expect(source).toContain(
      'artifact.indexOf(PRODUCTION_OIDC_ISSUER_BYTES) !== -1'
    );
    expect(source).not.toContain(
      "artifactText.includes('https://auth.warpkeep.com')"
    );
  });

  it('shortens worker timing only inside the disposable copied module', () => {
    const launcherSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-spacetime.mjs'),
      'utf8'
    );
    const workerPolicySource = readFileSync(
      resolve(process.cwd(), 'spacetimedb/src/castleWorkerPolicy.ts'),
      'utf8'
    );
    expect(launcherSource).toContain(
      "'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 30_000_000n;'"
    );
    expect(launcherSource).toContain(
      "'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 1_000_000n;'"
    );
    expect(launcherSource).toContain(
      "'export const CASTLE_WORKER_GATHER_QUANTUM_MICROS = 1_000_000n;'"
    );
    expect(launcherSource).toContain(
      'qa: `export const ${symbol} = 60_000_000n;`'
    );
    expect(launcherSource).toContain('const rewriteCopiedConstant = async');
    expect(launcherSource).toContain(
      "const path = join(moduleDirectory, 'src', file);"
    );
    expect(workerPolicySource).toContain(
      'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 30_000_000n;'
    );
    expect(workerPolicySource).toContain(
      'export const CASTLE_WORKER_GATHER_QUANTUM_MICROS = 60_000_000n;'
    );
    expect(workerPolicySource).not.toContain(
      'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 1_000_000n;'
    );
  });

  it('allows browser requests only to the two numeric-loopback origins and exact profile fixture', () => {
    const viteOrigin = 'http://127.0.0.1:4173';
    const spacetimeOrigin = 'http://127.0.0.1:3000';
    for (const url of [
      `${viteOrigin}/dev/fullstack-local-qa.html`,
      `${viteOrigin}/src/dev/fullstackLocalQaMain.tsx`,
      `${spacetimeOrigin}/v1/database/warpkeep-local-fullstack`,
      'ws://127.0.0.1:3000/v1/database/warpkeep-local-fullstack/subscribe',
      LOCAL_FULLSTACK_QA_PROFILE_URL,
      'data:image/svg+xml,%3Csvg%2F%3E',
      `blob:${viteOrigin}/00000000-0000-4000-8000-000000000001`,
    ]) {
      expect(
        isAllowedLocalFullstackBrowserUrl(url, viteOrigin, spacetimeOrigin),
        url
      ).toBe(true);
    }

    for (const url of [
      'https://maincloud.spacetimedb.com/v1/database/warpkeep',
      'https://auth.warpkeep.com/v1/oidc/token',
      'https://relay.farcaster.xyz/v1/channel',
      'http://localhost:4173/dev/fullstack-local-qa.html',
      'http://192.168.1.20:3000/',
      'wss://127.0.0.1:3000/subscribe',
      'https://i.imgur.com/another-profile.png',
    ]) {
      expect(
        isAllowedLocalFullstackBrowserUrl(url, viteOrigin, spacetimeOrigin),
        url
      ).toBe(false);
    }
  });

  it('runs the title departure and focus frame matrix inside the existing local-only browser', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );

    for (const caseId of [
      'desktop-pointer',
      'mobile-portrait-touch',
      'tablet-pointer',
      'short-landscape-touch',
      'desktop-offset-scaled-keyboard',
      'desktop-offset-scaled-pointer',
      'desktop-keyboard',
      'desktop-reduced-keyboard',
      'desktop-resize-pointer',
    ]) expect(browserSource).toContain(caseId);
    for (const evidence of [
      'requestAnimationFrame(sampleFrame)',
      "frame.phase === 'transitioning-to-menu'",
      "frame.activeTarget !== 'departure-landmark'",
      "frame.overlayMotion !== expectedMotion",
      '!Number.isFinite(frame.overlayOriginX)',
      '!Number.isFinite(frame.overlayOriginY)',
      'Math.abs(frame.devicePixelRatio - probeCase.deviceScaleFactor) > 0.01',
      "frame.gatewayInteractive !== 'false'",
      'frame.buttonFocusVisible !== false',
      'frame.hitGateway !== false',
      "frame.anchorDisplay !== 'none'",
      "getComputedStyle(anchor).display === 'none'",
      'frame.overflow',
      'frozenTransforms.size !== 1',
      "Input.dispatchKeyEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchTouchEvent",
      'title.style.transformOrigin',
      'probeCase.activationFraction',
      'frozen-gateway-origin',
      'pointer-origin-separation',
    ]) expect(browserSource).toContain(evidence);
    expect(browserSource).toContain(
      'await exerciseTitleGatewayDepartureFocus('
    );
    expect(browserSource).toContain(
      "probeStage = 'title-gateway-departure-focus'"
    );
    expect(browserSource).toContain(
      'value.finalSequence !== value.initialSequence + 1'
    );
    expect(browserSource).toContain(
      'value.initialHistoryLength + 1 !== value.finalHistoryLength'
    );
  });

  it('exercises worker dispatch through the map-first resource inspector', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );
    const appSource = readFileSync(
      resolve(process.cwd(), 'src/dev/FullstackLocalQaApp.tsx'),
      'utf8'
    );

    expect(browserSource).toContain("'.realm-node-worker-dispatch'");
    expect(browserSource).toContain('navigateToResourceSite');
    expect(browserSource).toContain(
      "'.realm-cell-navigator__resource-site'"
    );
    expect(browserSource).toContain(
      '[data-resource-kind][data-resource-state="available"]'
    );
    expect(browserSource).toContain(
      "navigator.querySelector('.realm-cell-navigator__jump') !== null"
    );
    expect(browserSource).toContain('bounds.width < 44 || bounds.height < 44');
    expect(browserSource).not.toContain(
      "const jump = navigator?.querySelector('.realm-cell-navigator__jump')"
    );
    expect(browserSource).toContain(
      'for (let ordinal = 1; ordinal <= 4; ordinal += 1)'
    );
    for (const label of [
      'Gold Mine 2',
      'Wheat Farm 2',
      'Logging Camp 12',
      'Stone Quarry 2',
    ]) expect(browserSource).toContain(label);
    expect(browserSource).toContain(
      "=== site.playerLabel"
    );
    expect(browserSource).toContain(
      ".startsWith('Inspect ' + site.playerLabel + ', tier ')"
    );
    expect(browserSource).not.toContain('data-site-id');
    expect(browserSource).not.toContain('data-site-key');
    expect(browserSource).toContain('new Set(dispatchedSiteKeys).size !== 4');
    expect(browserSource).toContain(
      "value.dispatchResourceKinds !== 'gold,food,wood,stone'"
    );
    expect(browserSource).toContain(
      "value.fixtureResourceKinds !== 'gold,food,wood,stone'"
    );
    expect(browserSource).toContain(
      "'.realm-resource-occupant-details[data-resource-occupant-details=\"true\"]'"
    );
    expect(browserSource).not.toContain("workerPanel.querySelector('select')");
    expect(browserSource).not.toContain("buttonWithText('ASSIGN WORKER'");
    expect(appSource).toContain('data-local-fullstack-dispatch-q');
    expect(appSource).toContain('data-local-fullstack-dispatch-r');
    expect(appSource).toContain('data-local-fullstack-dispatch-sites');
    expect(appSource).toContain('data-local-fullstack-worker-private-sync');
    expect(appSource).toContain('data-local-fullstack-worker-commands');
    expect(appSource).toContain(
      'data-local-fullstack-exact-dispatch-target-count'
    );
    expect(appSource).toContain('realm?.workerWorkers?.filter');
    expect(browserSource).toContain(
      "getAttribute('data-local-fullstack-worker-private-sync') === 'ready'"
    );
    expect(browserSource).toContain(
      "getAttribute('data-local-fullstack-worker-commands') === 'true'"
    );
    expect(browserSource).toContain(
      'current.workerAnimatedCount === 0'
    );
    expect(browserSource).toContain(
      'value.returnedAnimatedWorkerCount !== 0'
    );
    expect(appSource).toContain('LOCAL_FULLSTACK_DISPATCH_TARGETS');
    expect(appSource).toContain('exactAvailableSite(');
    expect(appSource).toContain('worker.siteId === target.siteId');
    expect(browserSource).not.toContain('genesis-001-tier1-gold-02');
    expect(browserSource).not.toContain('genesis-001-tier1-food-002');
    expect(browserSource).not.toContain('genesis-001-tier1-wood-012');
    expect(browserSource).not.toContain('genesis-001-tier1-stone-002');
  });

  it('proves restored exact-current entry without Terms, QR, or client acceptance authority', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );
    const appSource = readFileSync(
      resolve(process.cwd(), 'src/dev/FullstackLocalQaApp.tsx'),
      'utf8'
    );
    const spacetimeSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-spacetime.mjs'),
      'utf8'
    );

    for (const source of [appSource, browserSource]) {
      expect(source).toContain(
        '?entry-agreement-continuity=restored-current-v1'
      );
    }
    expect(appSource).toContain('let authorized = restoredSession;');
    expect(appSource).toContain(
      'data-local-fullstack-entry-agreement-satisfied'
    );
    expect(appSource).toContain('data-local-fullstack-auth-begin-count');
    expect(appSource).toContain('data-local-fullstack-qr-encode-count');
    expect(appSource).toContain(
      'data-local-fullstack-entry-agreement-read-count'
    );
    expect(appSource).toContain(
      'data-local-fullstack-entry-agreement-accept-count'
    );
    expect(spacetimeSource).toContain(
      "await callPlayer('get_my_entry_agreement_status_v1')"
    );
    expect(spacetimeSource).toContain(
      'entryAgreementAcceptedCurrent: currentEntryAgreement[1]'
    );
    expect(browserSource).toContain(
      'await exerciseRestoredEntryAgreementContinuity(devtools)'
    );
    expect(browserSource).toContain('value.refreshCount !== 1');
    expect(browserSource).toContain('value.authBeginCount !== 0');
    expect(browserSource).toContain('value.qrEncodeCount !== 0');
    expect(browserSource).toContain('value.entryAgreementReadCount !== 1');
    expect(browserSource).toContain('value.entryAgreementAcceptCount !== 0');
    expect(browserSource).toContain('value.termsDialogInsertions !== 0');
    expect(browserSource).toContain('value.checkboxInsertions !== 0');
    expect(browserSource).toContain('value.qrInsertions !== 0');
    expect(browserSource).toContain(
      "value.stage !== 'restored-current-complete'"
    );
    expect(browserSource).toContain(
      "value.acceptedCurrent !== true"
    );
    expect(browserSource).toContain(
      "return { stage: 'hard-reload-repeated-terms' };"
    );
    expect(browserSource).toContain('termsSkipped: true');
    expect(browserSource).toContain('value.termsSkipped !== true');
    expect(
      browserSource.match(/candidate\.closest\('\[inert\]'\) === null/g)
    ).toHaveLength(5);
    expect(browserSource).toContain(
      "'one synthetic cold auth/bootstrap/Terms '"
    );
  });

  it('hard-reenters the persistent Worker realm while private reads delay and retry', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );
    const appSource = readFileSync(
      resolve(process.cwd(), 'src/dev/FullstackLocalQaApp.tsx'),
      'utf8'
    );

    for (const marker of [
      '?persistent-worker-reentry=delayed-private-v1',
      'data-local-fullstack-private-read-gate',
      'data-local-fullstack-private-roster-failure',
      'warpkeep-local-release-private-worker-reads',
    ]) {
      expect(appSource).toContain(marker);
      expect(browserSource).toContain(marker);
    }
    expect(appSource).toContain('function privateReadGate(');
    expect(appSource).toContain('const initialPrivateReadGate = privateReadGate(');
    expect(appSource).toContain('await initialPrivateReadGate;');
    expect(appSource).toContain('if (firstRosterRead)');
    expect(appSource).toContain(
      'return instrumentedRuntime;'
    );
    expect(appSource).toContain(
      'const LOCAL_FULLSTACK_BACKEND_RUNTIME = createLocalFullstackBackendRuntime();'
    );
    expect(appSource).not.toContain(
      'useMemo(() => createLocalFullstackBackendRuntime(), [])'
    );
    expect(browserSource).toContain(
      "'persistent-worker-reentry'"
    );
    expect(browserSource).toContain(
      'url: `${viteOrigin}${FULLSTACK_ROUTE}${PERSISTENT_WORKER_REENTRY_SEARCH}#menu`'
    );
    expect(browserSource).toContain(
      '...await exercisePersistentWorkerReentry('
    );
    expect(browserSource).toContain(
      "probeStage = 'persistent-worker-isolated-browser-stop'"
    );
    expect(browserSource).toContain(
      "probeStage = 'persistent-worker-hard-reload-restore-seam'"
    );
    expect(browserSource).toContain(
      'history.replaceState(null'
    );
    expect(browserSource).toContain(
      'hardReloadSeam?.result?.value !== hardReloadUrl'
    );
    expect(browserSource).toContain(
      "probeStage = 'persistent-worker-isolated-browser-launch'"
    );
    expect(browserSource).toContain(
      "chromeProfile = join(runtimeRoot, 'chrome-reentry');"
    );
    expect(browserSource).toContain(
      'await terminateHeadlessChromeProcessGroup(chrome);'
    );
    expect(browserSource).toContain('const setupChromePid = chrome.pid;');
    expect(browserSource).toContain('setupChromePid !== chrome.pid');
    expect(browserSource).toContain(
      "setupChromeProfile === join(runtimeRoot, 'chrome-setup')"
    );
    expect(browserSource).toContain(
      "chromeProfile === join(runtimeRoot, 'chrome-reentry')"
    );
    expect(browserSource).toContain('setupDevtoolsSession !== devtools');
    expect(browserSource).toContain('setupTargetId !== state.targetId');
    expect(browserSource).toContain(
      'The persistent Worker re-entry did not establish a fresh isolated browser.'
    );
    expect(browserSource).toContain('freshBrowserProcess,');
    expect(browserSource).toContain('freshBrowserProfile,');
    expect(browserSource).toContain('freshDevtoolsSession,');
    expect(browserSource).toContain(
      'controlledRendererRecoveryWarningKind('
    );
    expect(browserSource).toContain(
      'params.entry,\n              viteOrigin,\n              viteRuntime'
    );
    expect(browserSource).not.toContain(
      'params.entry,\n              viteOrigin,\n              chromeProfile'
    );
    expect(browserSource).toContain(
      'state.controlledRendererRecovery = false;'
    );
    expect(browserSource).toContain(
      'CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS'
    );
    expect(browserSource).toContain('persistentWorkerSetup');
    expect(browserSource).toContain(
      'await new Promise((resolve) => setTimeout(resolve, 3_100));'
    );
    expect(browserSource).toContain(
      "window.dispatchEvent(new Event('${RELEASE_PRIVATE_WORKER_READS_EVENT}'));"
    );
    expect(browserSource).toContain(
      "stage: 'reentry-read-only-worker-menu'"
    );
    expect(browserSource).toContain('recallAllAvailable:');
    expect(browserSource).toContain(
      'enabledRecallCountBeforePrivateReady: recallButtons.length'
    );
    expect(browserSource).not.toContain(
      'disabledRecallCountBeforePrivateReady'
    );
    expect(browserSource).toContain(
      "stage: 'reentry-private-in-place-recovery'"
    );
    expect(browserSource).toContain(
      "'data-realm-camera-attestation-restore-count'"
    );
    for (const evidence of [
      'data-local-fullstack-public-assignment-revisions',
      'data-local-fullstack-private-assignment-revisions',
      'data-local-fullstack-private-resource-revision',
      'data-local-fullstack-private-resource-has-pending',
      'data-local-fullstack-public-route-evidence',
    ]) {
      expect(appSource).toContain(evidence);
      expect(browserSource).toContain(evidence);
    }
    expect(browserSource).toContain(
      "stage: 'persistent-worker-four-phase-arrival'"
    );
    expect(browserSource).toContain(
      "stage: 'persistent-worker-pending-resource-refresh'"
    );
    expect(appSource).toContain(
      "'data-local-fullstack-resource-settlement-attempt'"
    );
    expect(appSource).toContain(
      "'data-local-fullstack-resource-settlement-completed'"
    );
    expect(appSource).toContain(
      "'data-local-fullstack-resource-settlement-revision'"
    );
    expect(browserSource).toContain(
      "window.dispatchEvent(new Event('online'))"
    );
    expect(browserSource).toContain(
      "stage: 'persistent-worker-resource-settlement'"
    );
    expect(browserSource).toContain(
      "stage: 'persistent-worker-resource-settlement-projection'"
    );
    expect(browserSource).toContain(
      '&& /^\\\\d+$/.test(revision)'
    );
    expect(browserSource).toContain(
      "stage: 'persistent-worker-four-returning'"
    );
    expect(browserSource).toContain(
      "stage: 'persistent-worker-phase-aware-progress'"
    );
    expect(browserSource).toContain(
      "stage: 'reentry-private-revision-continuity'"
    );
    expect(browserSource).toContain(
      'value.fourPhaseReentryConfirmed !== true'
    );
    expect(browserSource).toContain(
      "stage: 'reentry-recall-all-progress'"
    );
    expect(browserSource).toContain(
      "safeStage === 'reentry-recall-completion'"
    );
    expect(browserSource).toContain("'occupationMarkerCount'");
    expect(browserSource).toContain(
      "canvas.getAttribute('data-realm-presentation-active') === 'false'"
    );
    expect(browserSource.match(
      /workerFooterAction\(\s*[^,]+,\s*'RETURN ALL TO KEEP'\s*\)/g
    )).toHaveLength(4);
    expect(browserSource.match(
      /document\.querySelector\(\s*'\.worker-command-center'\s*\)/g
    )?.length).toBeGreaterThanOrEqual(2);
    expect(browserSource.match(/realmPresentationIs\('true'\)/g)).toHaveLength(3);
    expect(browserSource.match(/\bprofileTrigger\.click\(\)/g)).toHaveLength(2);
    expect(browserSource).not.toContain(
      "&& canvas.getAttribute('data-realm-presentation-active') === 'true'"
    );
    expect(browserSource).not.toContain(
      "querySelector(\n          '.worker-command-center__footer button'"
    );
    expect(browserSource).toContain(
      'value.gatheringRecallConfirmed !== true'
    );
    expect(browserSource).toContain(
      'value.automaticSettlementConfirmed !== true'
    );
    expect(browserSource).toContain(
      "stage: 'reentry-node-reuse'"
    );
    expect(browserSource).toContain("getExtension('WEBGL_lose_context')");
    expect(browserSource).toContain("'renderer-recovery'");
    expect(browserSource).toContain(
      "stage: 'reentry-sign-out-authority'"
    );
    expect(browserSource).toContain(
      'value.rendererRecoveryGenerationChange !== 1'
    );
    expect(browserSource).toContain('value.authorityCleared !== true');
    expect(browserSource).toContain('/EXPEDITIONS|\\\\bWAGON\\\\b/i');
    expect(browserSource).toContain(
      'const journey = await exerciseLocalFullstackJourney(devtools);'
    );
  });

  it('runs every deterministic private Worker failure seam in the same local-only runner', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );
    const appSource = readFileSync(
      resolve(process.cwd(), 'src/dev/FullstackLocalQaApp.tsx'),
      'utf8'
    );

    for (const marker of [
      '?worker-private-seams=continuity-matrix-v1',
      'resource-missing',
      'torn-pair',
      'visibility-gated',
      'data-local-fullstack-private-resource-missing',
      'data-local-fullstack-private-torn-pair',
      'data-local-fullstack-private-timeout',
      'warpkeep-local-restore-timeout-visibility',
    ]) {
      expect(appSource).toContain(marker);
      expect(browserSource).toContain(marker);
    }
    expect(appSource).toContain('timeout-retry');
    expect(browserSource).toContain("'RETRY WORKER CONTROLS'");
    expect(browserSource).toContain(
      "stage: 'worker-private-seam-matrix-complete'"
    );
    expect(browserSource).toContain(
      'const workerPrivateSeamMatrix = await exerciseWorkerPrivateSeamMatrix(devtools);'
    );
    expect(appSource).toContain(
      "const LOCAL_REFRESH_ACCESS_EVENT = 'warpkeep-local-refresh-access';"
    );
    expect(browserSource).toContain("{ detail: 'reconnect-gated' }");
    expect(browserSource).toContain(
      "stage: 'reentry-retained-reconnect-recovery'"
    );
  });

  it('starts from one production-shaped persisted seven-castle Worker graph before Chrome', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );
    const spacetimeSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-spacetime.mjs'),
      'utf8'
    );
    const appSource = readFileSync(
      resolve(process.cwd(), 'src/dev/FullstackLocalQaApp.tsx'),
      'utf8'
    );

    for (const evidence of [
      'LOCAL_FULLSTACK_FOUNDER_COUNT = 7',
      'LOCAL_FULLSTACK_WORKER_COUNT = LOCAL_FULLSTACK_FOUNDER_COUNT * 4',
      'for (const founder of LOCAL_FULLSTACK_FOUNDERS)',
      "await callPlayer('bootstrap_player_v2')",
      "await callPlayer('accept_alpha_terms_v1'",
      "await callPlayer('get_my_worker_control_state_v1')",
      "await callPlayer('dispatch_worker_v1'",
      "await callPlayer('collect_resources_v1')",
      "await callPlayer('recall_worker_v1'",
      'preparedRollout.genericAssignments !== 4n',
      'preparedRollout.genericOccupations !== 3n',
      'preparedRollout.genericSchedules !== 4n',
      'preparedRollout.legacyExpeditions !== 0n',
      'preparedRollout.legacyOccupations !== 0n',
      'preparedRollout.legacySchedules !== 0n',
      'seedAttestation',
    ]) expect(spacetimeSource).toContain(evidence);
    expect(browserSource.indexOf(
      'database = await startDisposableLocalFullstackSpacetime({'
    )).toBeLessThan(browserSource.indexOf(
      "probeStage = 'chrome-launch'"
    ));
    expect(browserSource).toContain(
      'database.seedAttestation?.castleCount !== 7'
    );
    expect(browserSource).toContain(
      'database.seedAttestation.workerCount !== 28'
    );
    expect(browserSource).toContain(
      "await devtools.command('Page.reload', { ignoreCache: true });"
    );
    expect(browserSource).toContain(
      'await exerciseHardReloadWorkerContinuity(devtools)'
    );
    expect(browserSource).toContain(
      "candidate.getAttribute('data-local-fullstack-public-castles') === '7'"
    );
    expect(browserSource).toContain(
      "candidate.getAttribute('data-local-fullstack-public-workers') === '28'"
    );
    for (const evidence of [
      'data-local-fullstack-public-castles',
      'data-local-fullstack-public-workers',
      'data-local-fullstack-private-resource-rail',
      'data-local-fullstack-target-sites',
    ]) expect(appSource).toContain(evidence);
  });

  it('records privacy-safe atomic and compatibility failure reasons without payloads', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );
    const appSource = readFileSync(
      resolve(process.cwd(), 'src/dev/FullstackLocalQaApp.tsx'),
      'utf8'
    );

    for (const seam of [
      'control-malformed',
      'control-wrong-caller',
      'control-public-revision',
      'control-status-site',
      'control-pending-mismatch',
      'control-resource-policy',
      'control-worker-policy',
      'control-worker-mode',
      'control-rejected',
      'fallback-roster-delayed',
      'fallback-resource-delayed',
      'fallback-roster-missing',
      'fallback-resource-missing',
      'fallback-roster-rejected',
      'fallback-resource-rejected',
      'fallback-roster-timeout',
      'fallback-resource-timeout',
      'fallback-torn-timestamp',
    ]) {
      expect(appSource).toContain(seam);
      expect(browserSource).toContain(seam);
    }
    for (const reason of [
      'control-state-timeout',
      'control-state-decode-invalid',
      'wrong-caller',
      'public-private-worker-revision-mismatch',
      'worker-status-or-site-mismatch',
      'pending-total-mismatch',
      'resource-policy-mismatch',
      'worker-policy-mismatch',
      'worker-system-mode-mismatch',
      'procedure-rejected',
      'roster-decode-invalid',
      'resource-decode-invalid',
      'roster-timeout',
      'resource-timeout',
    ]) expect(browserSource).toContain(reason);
    expect(appSource).toContain(
      'data-local-fullstack-worker-private-failure-reason'
    );
    expect(browserSource).toContain(
      "probe.getAttribute('data-local-fullstack-worker-private-failure-reason')"
    );
    expect(browserSource).toContain('value.failureReceiptCount !== 16');
    expect(browserSource).toContain('value.resourceRailInvalidSamples !== 0');
    expect(browserSource).toContain('value.resourceTooltipFreshness !== true');
    expect(browserSource).toContain('LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF');
    expect(browserSource).not.toContain(
      'data-local-fullstack-private-procedure-payload'
    );
  });

  it('gates connected worker updates on a stable post-ready scene lifecycle', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );

    for (const attribute of [
      'data-renderer-generation',
      'data-realm-scene-creation-count',
      'data-realm-scene-disposal-count',
      'data-realm-last-scene-recreation-reason',
      'data-realm-first-ready',
      'data-realm-blocking-loading-overlay-visible',
      'data-realm-dynamic-reconciliation-count',
      'data-realm-worker-layer-reconciliation-count',
      'data-realm-route-layer-reconciliation-count',
      'data-realm-worker-presented-count',
      'data-realm-worker-animated-count',
      'data-realm-worker-presence-count',
      'data-realm-worker-visible-route-count',
    ]) expect(browserSource).toContain(attribute);
    expect(browserSource).toContain('new MutationObserver');
    expect(browserSource).toContain('requestAnimationFrame(sampleBlockingLoadingOverlay)');
    expect(browserSource).toContain("stage: 'dispatch-scene-lifecycle'");
    expect(browserSource).toContain("stage: 'recall-one-scene-lifecycle'");
    expect(browserSource).toContain("stage: 'recall-all-scene-lifecycle'");
    expect(browserSource).toContain("stage: 'recall-one-world-reconciliation'");
    expect(browserSource).toContain("stage: 'recall-all-world-reconciliation'");
    expect(browserSource).toContain('current.visibleRouteCount <= 3');
    expect(browserSource).toContain(
      "stage: 'recall-all-completion-scene-lifecycle'"
    );
    expect(browserSource).toContain("stage: 'visibility-scene-lifecycle'");
    expect(browserSource).toContain("document.dispatchEvent(new Event('visibilitychange'))");
    expect(browserSource).toContain("menuAction(recallAllMenu, 'RECALL ALL TO KEEP')");
    expect(browserSource).toContain(
      "localStateCount('data-local-fullstack-deployed-workers') === 0"
    );
    expect(browserSource).toContain('value.dispatchedWorkerCount !== 4');
    expect(browserSource).toContain('value.distinctDispatchSiteCount !== 4');
    expect(browserSource).toContain('value.individualRecallConfirmed !== true');
    expect(browserSource).toContain('value.recallAllConfirmed !== true');
    expect(browserSource).toContain('value.returnCompletionConfirmed !== true');
    expect(browserSource).toContain('value.releasedNodeConfirmed !== true');
    expect(browserSource).toContain('value.nodeReuseConfirmed !== true');
    expect(browserSource).toContain('value.visibilityCycleConfirmed !== true');
    expect(browserSource).toContain("stage: 'worker-node-reuse'");
    expect(browserSource).toContain("stage: 'reuse-scene-lifecycle'");
    expect(browserSource).toContain('value.initialSceneCreationCount !== 1');
    expect(browserSource).toContain('value.sceneGenerationChange !== 0');
    expect(browserSource).toContain('value.sceneCreationChange !== 0');
    expect(browserSource).toContain('value.sceneDisposalChange !== 0');
    expect(browserSource).toContain('value.blockingLoadingOverlayFrames !== 0');
    expect(browserSource).toContain('value.blockingLoadingOverlayInsertions !== 0');
    expect(browserSource).toContain(
      'value.blockingLoadingOverlayVisibleTransitions !== 0'
    );
  });
});

describe('disposable connected local QA cleanup lifecycle', () => {
  it('awaits one shared cleanup job when a signal races another signal and final cleanup', async () => {
    const processTarget = new EventEmitter() as EventEmitter & {
      exit: ReturnType<typeof vi.fn>;
    };
    processTarget.exit = vi.fn();

    let releaseCleanup!: () => void;
    const startCleanupJob = vi.fn(() => new Promise<void>((resolveCleanup) => {
      releaseCleanup = resolveCleanup;
    }));
    let sharedCleanup: Promise<void> | undefined;
    const cleanup = () => {
      sharedCleanup ??= startCleanupJob();
      return sharedCleanup;
    };

    const remove = installLocalFullstackSignalCleanup(cleanup, processTarget);
    const interrupt = processTarget.listeners('SIGINT')[0] as () => Promise<void>;
    const terminate = processTarget.listeners('SIGTERM')[0] as () => Promise<void>;
    expect(interrupt).toBeTypeOf('function');
    expect(terminate).toBeTypeOf('function');

    const signalCleanup = terminate();
    const finalCleanup = cleanup();
    const concurrentSignal = interrupt();
    let signalSettled = false;
    void signalCleanup.then(() => {
      signalSettled = true;
    });
    await Promise.resolve();

    expect(startCleanupJob).toHaveBeenCalledOnce();
    expect(signalSettled).toBe(false);
    expect(processTarget.exit).not.toHaveBeenCalled();
    expect(processTarget.listenerCount('SIGINT')).toBe(1);
    expect(processTarget.listenerCount('SIGTERM')).toBe(1);

    releaseCleanup();
    await Promise.all([signalCleanup, finalCleanup, concurrentSignal]);
    expect(processTarget.exit).toHaveBeenCalledOnce();
    expect(processTarget.exit).toHaveBeenCalledWith(143);
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
    remove();
  });

  it('publishes a shared close lifecycle before CLI attestation or process spawn', async () => {
    const runtimeDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-lifecycle-test-'));
    let firstClose: Promise<void> | undefined;
    let secondClose: Promise<void> | undefined;
    try {
      await expect(startDisposableLocalFullstackSpacetime({
        runtimeDirectory,
        spacetimeExecutable: resolve(runtimeDirectory, 'must-not-run'),
        onLifecycle(lifecycle: Readonly<{ close: () => Promise<void> }>) {
          firstClose = lifecycle.close();
          secondClose = lifecycle.close();
        },
      })).rejects.toThrow('Disposable SpacetimeDB startup was cancelled.');

      expect(firstClose).toBeDefined();
      expect(secondClose).toBe(firstClose);
      await Promise.all([firstClose!, secondClose!]);
      expect(existsSync(runtimeDirectory)).toBe(false);
    } finally {
      rmSync(runtimeDirectory, { force: true, recursive: true });
    }
  });

  it('contains an exception thrown by lifecycle registration', async () => {
    const runtimeDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-lifecycle-test-'));
    try {
      await expect(startDisposableLocalFullstackSpacetime({
        runtimeDirectory,
        onLifecycle() {
          throw new Error('CALLER_DETAIL_MUST_NOT_ESCAPE');
        },
      })).rejects.toThrow(
        'Disposable SpacetimeDB startup failed closed at lifecycle-registration.'
      );
      expect(existsSync(runtimeDirectory)).toBe(false);
    } finally {
      rmSync(runtimeDirectory, { force: true, recursive: true });
    }
  });

  it('turns bounded CLI output overflow into a contained promise rejection', async () => {
    await expect(runDisposableLocalFullstackCli(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(600000));'],
      {
        environment: {
          HOME: tmpdir(),
          PATH: process.env.PATH ?? '',
          TMPDIR: tmpdir(),
        },
        timeout: 5_000,
      },
    )).rejects.toThrow('Local CLI output exceeded its bound.');
  });

  it('accepts only ESRCH as proof that a disposable process group stopped', async () => {
    const stopped = Object.assign(new Error('missing'), { code: 'ESRCH' });
    const unverifiable = Object.assign(new Error('denied'), { code: 'EPERM' });
    const child = {
      exitCode: 0,
      kill: vi.fn(),
      pid: 42_100,
      signalCode: null,
    };
    const stoppedKill = vi.fn((_pid: number, signal: NodeJS.Signals | 0) => {
      if (signal === 0) throw stopped;
    });
    await expect(terminateLocalFullstackProcessGroup(child, {
      killProcessGroup: stoppedKill,
    })).resolves.toBeUndefined();

    const unverifiableKill = vi.fn((_pid: number, signal: NodeJS.Signals | 0) => {
      if (signal === 0) throw unverifiable;
    });
    await expect(terminateLocalFullstackProcessGroup(child, {
      killProcessGroup: unverifiableKill,
    })).rejects.toThrow('could not be verified as stopped');
  });

  it('keeps lifecycle registration and every finally path ordered around shared promises', () => {
    const root = process.cwd();
    const spacetimeSource = readFileSync(
      resolve(root, 'scripts/qa-observer/local-fullstack-spacetime.mjs'),
      'utf8'
    );
    const browserSource = readFileSync(
      resolve(root, 'scripts/qa-observer/local-fullstack-browser-probe.mjs'),
      'utf8'
    );
    const spacetimeStart = spacetimeSource.slice(
      spacetimeSource.indexOf(
        'export async function startDisposableLocalFullstackSpacetime'
      )
    );
    const browserStart = browserSource.slice(
      browserSource.indexOf('export async function runLocalFullstackBrowserProbe')
    );

    const lifecycleRegistration = spacetimeStart.indexOf('options.onLifecycle?.');
    const cliAttestation = spacetimeStart.indexOf(
      'cliSnapshot = attestPinnedSpacetimeCli'
    );
    const databaseSpawn = spacetimeStart.indexOf('serverProcess = spawn(');
    expect(lifecycleRegistration).toBeGreaterThan(-1);
    expect(lifecycleRegistration).toBeLessThan(cliAttestation);
    expect(lifecycleRegistration).toBeLessThan(databaseSpawn);
    expect(spacetimeStart).toMatch(
      /let closePromise;\s+const close = \(\) => \{\s+if \(closePromise\) return closePromise;/
    );
    expect(spacetimeStart).toContain('try { await close(); } catch {');
    expect(spacetimeStart).toContain('let activeCliProcess;');
    expect(spacetimeStart).toContain(
      'await terminateLocalFullstackProcessGroup(activeCliProcess);'
    );
    expect(spacetimeSource).toMatch(
      /const child = spawn\(executable, arguments_, \{[\s\S]*?detached: true,[\s\S]*?options\.onProcess\?\.\(child\);/
    );
    expect(spacetimeSource).toContain(
      'options.onProcess?.(undefined, child);'
    );

    const cleanupDeclaration = browserStart.indexOf('let cleanupPromise;');
    const cleanupGuard = browserStart.indexOf(
      'if (cleanupPromise) return cleanupPromise;'
    );
    const signalRegistration = browserStart.indexOf(
      'installLocalFullstackSignalCleanup(cleanup)'
    );
    const runtimeAllocation = browserStart.indexOf(
      "runtimeAllocationPromise = mkdtemp(join(tmpdir(), 'warpkeep-fullstack-browser-'))"
    );
    const databaseStart = browserStart.indexOf(
      'startDisposableLocalFullstackSpacetime({'
    );
    const lifecycleCapture = browserStart.indexOf(
      'databaseLifecycle = lifecycle;'
    );
    const chromeSpawn = browserStart.indexOf('chrome = spawnHeadlessChromeProbe(');
    const removeSignals = browserStart.lastIndexOf('removeSignalCleanup();');
    const awaitCleanup = browserStart.lastIndexOf('await cleanup();');
    expect(cleanupDeclaration).toBeGreaterThan(-1);
    expect(cleanupGuard).toBeGreaterThan(cleanupDeclaration);
    expect(signalRegistration).toBeLessThan(runtimeAllocation);
    expect(signalRegistration).toBeLessThan(databaseStart);
    expect(lifecycleCapture).toBeGreaterThan(databaseStart);
    expect(lifecycleCapture).toBeLessThan(chromeSpawn);
    expect(browserStart).toContain(
      'await (database?.close?.() ?? databaseLifecycle?.close?.())'
    );
    expect(awaitCleanup).toBeGreaterThan(chromeSpawn);
    expect(removeSignals).toBeGreaterThan(awaitCleanup);
  });
});
