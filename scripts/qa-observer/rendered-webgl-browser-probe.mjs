import { execFile, spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { analyzeRenderedWebglPngScreenshot } from './png-visual-aggregate.mjs';
import {
  WARPKEEP_LOCAL_VITE_FS_DENY,
  warpkeepLocalPublicBoundaryPlugin,
} from './local-vite-fs-deny.mjs';
import {
  parseRenderedWebglQaObservation,
  RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS,
  RENDERED_WEBGL_QA_ROUTE,
  renderedWebglQaUrl,
} from './rendered-webgl-qa-contract.mjs';

// The journey lane is dynamically loaded during the probe. Keep its shared
// screenshot reducer in a leaf module rather than letting it import this CLI
// module while this module's top-level await is still evaluating.
export { analyzeRenderedWebglPngScreenshot };

export const RENDERED_WEBGL_QA_CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const RENDERED_WEBGL_QA_CHROME_APP = '/Applications/Google Chrome.app';
export const RENDERED_WEBGL_QA_CHROME_TEAM_ID = 'EQHXZ8M8AV';

const CODESIGN_EXECUTABLE = '/usr/bin/codesign';
const execFileAsync = promisify(execFile);

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const CASE_TIMEOUT_MILLISECONDS = RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS + 5_000;
const CDP_COMMAND_TIMEOUT_MILLISECONDS = 10_000;
const CDP_PIPE_MAXIMUM_OUTBOUND_BYTES = 512 * 1_024;
const CDP_PIPE_MAXIMUM_INBOUND_BYTES = 16 * 1_024 * 1_024;
const CDP_PIPE_MAXIMUM_PENDING_COMMANDS = 1_024;
const PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS = 5_000;
const SCREENSHOT_MAXIMUM_BYTES = 8 * 1_024 * 1_024;
const TERMINATION_GRACE_MILLISECONDS = 2_000;
const CODESIGN_TIMEOUT_MILLISECONDS = 15_000;
const CODESIGN_MAXIMUM_BYTES = 64 * 1_024;
const CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS = 256;
const CONTROLLED_RENDERER_STALE_DELETE_WARNING =
  /^WebGL: INVALID_OPERATION: delete(?:VertexArray)?: object does not belong to this context$/u;
const CONTROLLED_RENDERER_WARNING_THROTTLE =
  /^WebGL: too many errors, no more errors will be reported to the console for this context\.$/u;

const DESKTOP_VIEWPORT = Object.freeze({ width: 1_440, height: 900 });
const FULL_HD_VIEWPORT = Object.freeze({ width: 1_920, height: 1_080 });
const TABLET_VIEWPORT = Object.freeze({ width: 1_024, height: 768 });
const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });
const SHORT_LANDSCAPE_VIEWPORT = Object.freeze({ width: 667, height: 375 });
export const RENDERED_WEBGL_QA_CASE_COUNT = 14;
export const RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT = 312;
export const RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_PRESENCES = 400;
export const RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_CONTROLS = 24;
// The rendered browser lane targets the undeployed Genesis generation-v3
// candidate, not the dual-version production attestation rollout. An exact
// count prevents a complete generation-v2 surface (1,261 cells), a partial
// expansion, or a mixed snapshot from being accepted as current render proof.
export const RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_CELL_COUNT = 10_000;
// The synthetic observer activates canonical Water revision v1. Its 409
// former lake rows are presented as lowland, leaving exactly six live terrain
// kinds while the immutable authority metadata remains seven-kind.
export const RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_KIND_COUNT = 6;
// Every projection-visible keeper name is locked to its castle foundation.
// Dense overviews may overlap, but camera motion cannot aggregate, displace,
// or hide founded identities.
export const RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS = 0;
const RENDERED_WEBGL_QA_CLUSTER_MAX_ANCHOR_DISPLACEMENT_PIXELS = 112;
export const RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS = 0.015;
export const RENDERED_WEBGL_QA_VITE_FS_DENY = WARPKEEP_LOCAL_VITE_FS_DENY;
const RENDERED_WEBGL_QA_LABEL_ANGLE_TOLERANCE_RADIANS = 0.002;
const RENDERED_WEBGL_QA_CASTLE_POINTER_ACTIVATION_CASE_ID = 'desktop-balanced';
const RENDERED_WEBGL_QA_MAP_GESTURE_CASE_ID = 'desktop-balanced-player';
const RENDERED_WEBGL_QA_LABEL_KEYBOARD_CASE_ID = 'desktop-high';
const RENDERED_WEBGL_QA_RESOURCE_OCCUPANT_CASE_IDS = new Set([
  'desktop-balanced',
  'desktop-balanced-player',
  'desktop-reduced',
  'mobile-reduced-inspector',
]);

export function renderedWebglOccupancyStressProbeCase(port) {
  const selectedPort = exactPort(port);
  return Object.freeze({
    id: 'desktop-balanced-occupancy-stress',
    expectedPresentationMode: 'observer',
    expectedQuality: 'balanced',
    interaction: 'default',
    maximumLabelOverflowCount: 0,
    minimumLabelCount: 1,
    url: renderedWebglQaUrl({
      fixture: 'occupancy-stress',
      port: selectedPort,
      quality: 'balanced',
    }),
    viewport: DESKTOP_VIEWPORT,
  });
}

export function renderedWebglActiveWorkerProbeCase(port) {
  const selectedPort = exactPort(port);
  return Object.freeze({
    id: 'mobile-balanced-worker-active',
    expectedPresentationMode: 'player',
    expectedQuality: 'balanced',
    interaction: 'default',
    maximumLabelOverflowCount: 0,
    minimumLabelCount: 4,
    url: renderedWebglQaUrl({
      fixture: 'worker-active',
      mode: 'player',
      port: selectedPort,
      quality: 'balanced',
    }),
    viewport: MOBILE_VIEWPORT,
  });
}
// Interactions may change the projection-visible set, but every eligible castle
// must remain a direct label. Explore remains the complete accessible list and
// never becomes an excuse for automatic world-label overflow.
const RENDERED_WEBGL_QA_INTERACTION_MAXIMUM_LABEL_OVERFLOW_COUNT = Object.freeze({
  explore: 0,
  inspector: 0,
});
// Castle labels attach immediately below the projected foundation. This depth
// is deliberately above the interactive label and inside the rendered keep body
// at the reviewed desktop framing, so the browser must deliver a real canvas
// pointer sequence to the decoded/instanced GLB rather than invoke a DOM
// label action.
const RENDERED_WEBGL_QA_CASTLE_POINTER_DEPTH_PIXELS = 48;
const RENDERED_WEBGL_QA_CASTLE_POINTER_MOVE_OFFSETS = Object.freeze([
  Object.freeze({ x: -4, y: 0 }),
  Object.freeze({ x: -2, y: 2 }),
  Object.freeze({ x: 2, y: 2 }),
  Object.freeze({ x: 4, y: 0 }),
  Object.freeze({ x: 0, y: 0 }),
]);
const RENDERED_WEBGL_QA_ACTIVE_FOREST_CASE_IDS = new Set([
  'desktop-high',
  'full-hd-balanced',
  'desktop-reduced',
]);
const RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_STEPS = 5;
const RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_DELTA = -250;
const RENDERED_WEBGL_QA_MAP_DRAG_OFFSETS = Object.freeze([
  Object.freeze({ x: 3, y: 1 }),
  Object.freeze({ x: 8, y: 2 }),
  Object.freeze({ x: 52, y: 14 }),
]);
const RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS = 10_000;
// Camera-local decorative ecology is included once in both aggregate terrain
// instance counts and once in both aggregate draw-call counts. Attest it as a
// separate category, then subtract it before applying the unchanged ordinary
// terrain/shared-forest budgets. This prevents a decorative allowance from
// masking an ordinary terrain regression (or the reverse).
const RENDERED_WEBGL_QA_FOREST_DECORATIVE_BUDGETS = Object.freeze({
  high: Object.freeze({
    instances: 1_200,
    triangles: 320_000,
    drawCalls: 5,
    cacheEntries: 2_048,
  }),
  balanced: Object.freeze({
    instances: 600,
    triangles: 160_000,
    drawCalls: 5,
    cacheEntries: 1_024,
  }),
  reduced: Object.freeze({
    instances: 180,
    triangles: 45_000,
    drawCalls: 5,
    cacheEntries: 512,
  }),
});
const TERRAIN_PRESENTATION_BUDGETS = Object.freeze({
  high: Object.freeze({
    semanticFeatureCount: 1_310,
    totalDetailInstanceCount: 7_210,
  }),
  balanced: Object.freeze({
    semanticFeatureCount: 1_010,
    totalDetailInstanceCount: 5_710,
  }),
  reduced: Object.freeze({
    semanticFeatureCount: 610,
    totalDetailInstanceCount: 3_210,
  }),
});
const TERRAIN_PRESENTATION_MAXIMUM_SEMANTIC_DRAW_CALLS = 5;
const TERRAIN_PRESENTATION_MAXIMUM_TOTAL_DRAW_CALLS = 8;
const LABEL_CULL_REASONS = new Set([
  'associated-castle',
  'behind-camera',
  'capacity',
  'collision',
  'duplicate',
  'foreign-castle',
  'invalid-projection',
  'no-safe-placement',
  'offscreen',
  'reserved-ui',
  'unmeasured',
]);

function validLabelCullReasonAggregate(value) {
  if (typeof value !== 'string' || value.length > 256) return false;
  if (value === '') return true;
  const seenReasons = new Set();
  const entries = value.split(',');
  return entries.length <= LABEL_CULL_REASONS.size && entries.every((entry) => {
    const [reason, count, excess] = entry.split(':');
    const valid = excess === undefined
      && LABEL_CULL_REASONS.has(reason)
      && /^[1-9]\d{0,2}$/.test(count ?? '')
      && !seenReasons.has(reason);
    if (valid) seenReasons.add(reason);
    return valid;
  });
}

export function renderedWebglLabelAnchorDistanceTelemetry(distance) {
  if (!Number.isFinite(distance) || distance < 0 || distance > 10_000) {
    throw new TypeError('Invalid rendered WebGL label anchor distance.');
  }
  const violation = distance
    > RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS
      + RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS;
  return Object.freeze({
    reportedDistance: violation
      ? Math.ceil(distance)
      : Math.min(
          RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS,
          Math.ceil(distance)
        ),
    violation,
  });
}

export function renderedWebglLabelDisplacementClassificationValid(distance, markedDisplaced) {
  if (!Number.isFinite(distance) || distance < 0 || typeof markedDisplaced !== 'boolean') {
    throw new TypeError('Invalid rendered WebGL label displacement classification.');
  }
  return markedDisplaced === false
    && distance <= RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS;
}

function exactPort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError('Invalid rendered WebGL QA loopback port.');
  }
  return value;
}

function exactPrivateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new TypeError('Invalid private Chrome profile directory.');
  }
  return value;
}

export function parseHeadlessChromeCodeSignature(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > CODESIGN_MAXIMUM_BYTES) {
    throw new TypeError('Invalid reviewed Chrome code signature.');
  }
  const fields = new Map();
  for (const line of value.split(/\r?\n/u)) {
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    if (!['Executable', 'Identifier', 'TeamIdentifier'].includes(key)) continue;
    if (fields.has(key)) throw new TypeError('Invalid reviewed Chrome code signature.');
    fields.set(key, line.slice(separator + 1));
  }
  if (
    fields.size !== 3
    || fields.get('Executable') !== RENDERED_WEBGL_QA_CHROME
    || fields.get('Identifier') !== 'com.google.Chrome'
    || fields.get('TeamIdentifier') !== RENDERED_WEBGL_QA_CHROME_TEAM_ID
  ) throw new TypeError('Invalid reviewed Chrome code signature.');
  return Object.freeze({
    executable: fields.get('Executable'),
    identifier: fields.get('Identifier'),
    teamIdentifier: fields.get('TeamIdentifier'),
  });
}

export async function attestHeadlessChromeCodeSignature(options = {}) {
  const execute = options.execFileAsync ?? execFileAsync;
  const commandOptions = Object.freeze({
    encoding: 'utf8',
    env: Object.freeze({ LANG: 'C', PATH: '/usr/bin:/bin' }),
    maxBuffer: CODESIGN_MAXIMUM_BYTES,
    timeout: CODESIGN_TIMEOUT_MILLISECONDS,
    windowsHide: true,
  });
  await execute(CODESIGN_EXECUTABLE, [
    '--verify',
    '--deep',
    RENDERED_WEBGL_QA_CHROME_APP,
  ], commandOptions);
  const inspected = await execute(CODESIGN_EXECUTABLE, [
    '-dv',
    '--verbose=4',
    RENDERED_WEBGL_QA_CHROME_APP,
  ], commandOptions);
  return parseHeadlessChromeCodeSignature(inspected?.stderr);
}

async function readReviewedChromeExecutableIdentity() {
  const metadata = await lstat(RENDERED_WEBGL_QA_CHROME, { bigint: true });
  const expectedUid = typeof process.getuid === 'function'
    ? BigInt(process.getuid())
    : undefined;
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.nlink !== 1n
    || (metadata.mode & 0o002n) !== 0n
    || (expectedUid !== undefined && metadata.uid !== 0n && metadata.uid !== expectedUid)
  ) throw new Error('The reviewed Google Chrome executable is unavailable.');
  return Object.freeze({
    ctimeNs: metadata.ctimeNs.toString(),
    dev: metadata.dev.toString(),
    gid: metadata.gid.toString(),
    ino: metadata.ino.toString(),
    mode: metadata.mode.toString(),
    mtimeNs: metadata.mtimeNs.toString(),
    nlink: metadata.nlink.toString(),
    size: metadata.size.toString(),
    uid: metadata.uid.toString(),
  });
}

function exactChromeExecutableIdentity(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key])
    && Object.keys(right).length === Object.keys(left).length;
}

async function attestStableHeadlessChromeExecutable(expectedIdentity) {
  const before = await readReviewedChromeExecutableIdentity();
  if (expectedIdentity && !exactChromeExecutableIdentity(before, expectedIdentity)) {
    throw new Error('The reviewed Google Chrome executable changed before launch.');
  }
  await attestHeadlessChromeCodeSignature();
  const after = await readReviewedChromeExecutableIdentity();
  if (!exactChromeExecutableIdentity(before, after)) {
    throw new Error('The reviewed Google Chrome executable changed during attestation.');
  }
  return after;
}

/**
 * The fourth case deliberately uses a rejected fixture query. The browser page
 * must fail it closed to balanced; no caller can supply a route, origin, or
 * arbitrary query string.
 */
export function renderedWebglBrowserProbeCases(port) {
  const selectedPort = exactPort(port);
  const origin = `http://127.0.0.1:${selectedPort}`;
  // Per-case minimums catch projection/camera regressions, while exact direct
  // coverage and zero overflow forbid automatic aggregation or disappearance.
  return Object.freeze([
    Object.freeze({
      id: 'desktop-high',
      expectedPresentationMode: 'observer',
      expectedQuality: 'high',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 10,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'high' }),
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'desktop-balanced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 10,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'full-hd-balanced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 16,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: FULL_HD_VIEWPORT,
    }),
    Object.freeze({
      id: 'tablet-balanced-inspector',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'inspector',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 11,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: TABLET_VIEWPORT,
    }),
    // Player chrome has different identity, action, and inspection semantics
    // from the read-only observer. Exercise the tablet docked inspector with
    // the real player HUD rather than assuming the observer case covers it.
    Object.freeze({
      id: 'tablet-balanced-player-inspector',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'inspector',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 11,
      url: renderedWebglQaUrl({
        mode: 'player',
        port: selectedPort,
        quality: 'balanced'
      }),
      viewport: TABLET_VIEWPORT,
    }),
    Object.freeze({
      id: 'mobile-balanced-persistent-labels',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 5,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: MOBILE_VIEWPORT,
    }),
    Object.freeze({
      id: 'desktop-reduced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'reduced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 10,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'reduced' }),
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'desktop-invalid-fallback',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 10,
      url: `${origin}${RENDERED_WEBGL_QA_ROUTE}?quality=invalid`,
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'mobile-balanced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 5,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: MOBILE_VIEWPORT,
    }),
    Object.freeze({
      id: 'mobile-reduced-inspector',
      expectedPresentationMode: 'observer',
      expectedQuality: 'reduced',
      interaction: 'inspector',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 4,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'reduced' }),
      viewport: MOBILE_VIEWPORT,
    }),
    Object.freeze({
      id: 'short-landscape-explore',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'explore',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 1,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: SHORT_LANDSCAPE_VIEWPORT,
    }),
    // The constrained player lane must open Explore through the portrait menu;
    // no persistent player action rail is allowed back into the map viewport.
    Object.freeze({
      id: 'short-landscape-balanced-player-explore',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'explore',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 1,
      url: renderedWebglQaUrl({
        mode: 'player',
        port: selectedPort,
        quality: 'balanced'
      }),
      viewport: SHORT_LANDSCAPE_VIEWPORT,
    }),
    Object.freeze({
      id: 'desktop-balanced-player',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 10,
      url: renderedWebglQaUrl({
        mode: 'player',
        port: selectedPort,
        quality: 'balanced'
      }),
      viewport: DESKTOP_VIEWPORT,
    }),
    // Player chrome is intentionally distinct from the read-only observer:
    // portrait-only launcher, resource rail, and no persistent action buttons.
    Object.freeze({
      id: 'mobile-balanced-player',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 4,
      url: renderedWebglQaUrl({
        mode: 'player',
        port: selectedPort,
        quality: 'balanced'
      }),
      viewport: MOBILE_VIEWPORT,
    }),
  ]);
}

/**
 * A fixed executable and fresh explicit profile keep this process independent
 * of the signed-in browser, extensions, saved credentials, Keychain, and user
 * preferences. Flags suppress Chrome-owned background network features; CDP
 * additionally blocks every page request outside the exact loopback origin.
 * DevTools itself never listens on TCP: Chrome reads NUL-framed protocol JSON
 * from inherited fd 3 and writes replies/events to inherited fd 4.
 */
export function headlessChromeProbeContract(profileDirectory) {
  const profile = exactPrivateDirectory(profileDirectory);
  return Object.freeze({
    executable: RENDERED_WEBGL_QA_CHROME,
    args: Object.freeze([
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--disable-background-networking',
      '--disable-breakpad',
      '--disable-crash-reporter',
      `--crash-dumps-dir=${join(profile, 'crash-dumps')}`,
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-extensions',
      '--disable-field-trial-config',
      '--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions,MediaRouter,OptimizationHints,Translate',
      '--disable-search-engine-choice-screen',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--password-store=basic',
      '--safebrowsing-disable-auto-update',
      '--use-mock-keychain',
      '--window-size=1440,900',
      'about:blank',
    ]),
    options: Object.freeze({
      cwd: REPOSITORY_ROOT,
      detached: true,
      env: Object.freeze({
        BREAKPAD_DUMP_LOCATION: join(profile, 'crash-dumps'),
        HOME: profile,
        LANG: 'en_US.UTF-8',
        PATH: '/usr/bin:/bin',
        TMPDIR: profile,
      }),
      shell: false,
      stdio: Object.freeze(['ignore', 'ignore', 'ignore', 'pipe', 'pipe']),
      windowsHide: true,
    }),
  });
}

export function spawnHeadlessChromeProbe(profileDirectory, options = {}) {
  const contract = headlessChromeProbeContract(profileDirectory);
  const spawnProcess = options.spawnProcess ?? spawn;
  return spawnProcess(contract.executable, [...contract.args], { ...contract.options });
}

/**
 * Chrome reports deterministic stale-object deletion warnings while Three.js
 * tears down the deliberately lost-and-restored synthetic QA context. Accept
 * only those exact browser-rendering diagnostics from the exact private Vite
 * cache used by this loopback run. The caller still owns a hard count bound and
 * a one-shot throttle marker, so this predicate cannot suppress unrelated
 * renderer warnings.
 */
export function controlledRendererRecoveryWarningKind(
  entry,
  loopbackOrigin,
  profileDirectory
) {
  if (
    entry === null
    || typeof entry !== 'object'
    || entry.level !== 'warning'
    || entry.source !== 'rendering'
    || typeof entry.text !== 'string'
    || typeof entry.url !== 'string'
    || typeof loopbackOrigin !== 'string'
    || typeof profileDirectory !== 'string'
    || !isAbsolute(profileDirectory)
    || resolve(profileDirectory) !== profileDirectory
  ) return null;

  let sourceUrl;
  let expectedOrigin;
  try {
    sourceUrl = new URL(entry.url);
    const originUrl = new URL(loopbackOrigin);
    if (
      originUrl.protocol !== 'http:'
      || originUrl.hostname !== '127.0.0.1'
      || originUrl.origin !== loopbackOrigin
    ) return null;
    expectedOrigin = originUrl.origin;
  } catch {
    return null;
  }
  const expectedDependencyPrefix = `/@fs${profileDirectory}/vite-cache/deps/`;
  const dependencyName = sourceUrl.pathname.startsWith(expectedDependencyPrefix)
    ? sourceUrl.pathname.slice(expectedDependencyPrefix.length)
    : '';
  const queryEntries = [...sourceUrl.searchParams.entries()];
  if (
    sourceUrl.origin !== expectedOrigin
    || sourceUrl.username !== ''
    || sourceUrl.password !== ''
    || sourceUrl.hash !== ''
    || !/^three\.module-[A-Za-z0-9_-]+\.js$/u.test(dependencyName)
    || queryEntries.length !== 1
    || queryEntries[0]?.[0] !== 'v'
    || !/^[a-f0-9]{8}$/u.test(queryEntries[0]?.[1] ?? '')
  ) return null;
  if (CONTROLLED_RENDERER_STALE_DELETE_WARNING.test(entry.text)) {
    return 'stale-context-object-delete';
  }
  if (CONTROLLED_RENDERER_WARNING_THROTTLE.test(entry.text)) {
    return 'stale-context-warning-throttle';
  }
  return null;
}

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(message);
  return value;
}

export function isBenignStaleFetchInterceptionError(method, value) {
  if (method !== 'Fetch.continueRequest' && method !== 'Fetch.failRequest') return false;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return exactMessageKeys(value, new Set(['code', 'message']))
    && value.code === -32602
    && value.message === 'Invalid InterceptionId.';
}

/**
 * The local browser fixture derives this point from a foundation-attached label but
 * intentionally returns only page coordinates. Castle IDs, FIDs, names, and
 * profile data must never cross the probe boundary.
 */
export function parseRenderedWebglCastleCanvasPointerTarget(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL canvas pointer target.');
  if (
    !exactMessageKeys(candidate, new Set(['x', 'y']))
    || !Number.isFinite(candidate.x)
    || !Number.isFinite(candidate.y)
    || candidate.x < 0
    || candidate.y < 0
    || candidate.x > RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS
    || candidate.y > RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS
  ) throw new TypeError('Invalid rendered WebGL canvas pointer target.');
  return Object.freeze({ x: candidate.x, y: candidate.y });
}

export function parseRenderedWebglCastlePointerMoveState(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL canvas pointer state.');
  if (
    !exactMessageKeys(candidate, new Set([
      'canvasTarget',
      'dragging',
      'inspectorOpen',
      'navigatorOpen',
      'renderer',
      'selectedCastleLabelCount',
    ]))
    || candidate.canvasTarget !== true
    || candidate.dragging !== false
    || candidate.inspectorOpen !== false
    || candidate.navigatorOpen !== false
    || candidate.renderer !== 'webgl'
    || !Number.isSafeInteger(candidate.selectedCastleLabelCount)
    || candidate.selectedCastleLabelCount !== 0
  ) throw new TypeError('Invalid rendered WebGL canvas pointer state.');
  return Object.freeze({
    canvasTarget: true,
    dragging: false,
    inspectorOpen: false,
    navigatorOpen: false,
    renderer: 'webgl',
    selectedCastleLabelCount: 0,
  });
}

/**
 * Structural evidence for the player map's shared gesture lane. No castle ID,
 * identity, profile value, label text, or camera coordinate leaves the page.
 */
export function parseRenderedWebglMapGestureEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL map gesture evidence.');
  if (
    !exactMessageKeys(candidate, new Set([
      'dragMoved',
      'inputClean',
      'settled',
      'uiStable',
      'wheelMoved',
    ]))
    || candidate.dragMoved !== true
    || candidate.inputClean !== true
    || candidate.settled !== true
    || candidate.uiStable !== true
    || candidate.wheelMoved !== true
  ) throw new TypeError(
    `Invalid rendered WebGL map gesture evidence (${JSON.stringify(candidate)}).`
  );
  return Object.freeze({
    dragMoved: true,
    inputClean: true,
    settled: true,
    uiStable: true,
    wheelMoved: true,
  });
}

/**
 * Confirms that the local inspector lane invoked one real, accessible castle
 * label. The evidence is deliberately structural: it never carries a castle
 * ID, identity, profile field, or rendered label text across the QA boundary.
 */
export function parseRenderedWebglInspectorLabelActivationEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL inspector label evidence.');
  if (
    !exactMessageKeys(candidate, new Set(['inspectorLabelActivated']))
    || candidate.inspectorLabelActivated !== true
  ) throw new TypeError('Invalid rendered WebGL inspector label evidence.');
  return Object.freeze({ inspectorLabelActivated: true });
}

/**
 * Structural evidence for reviewed local-only legacy occupations in both
 * presentation modes. The browser compares all synthetic public values,
 * projection coordinates, and renderer lifecycle counters inside the page;
 * no castle key, username, profile URL, coordinates, or text leaves it.
 */
export function parseRenderedWebglResourceOccupantEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL resource occupant evidence.');
  const keys = [
    'cameraNeutral',
    'cameraNeutralAfterClose',
    'cameraAnchorPopulationValid',
    'cameraIndependentAnchorCoverage',
    'cameraNeutralWhileOpen',
    'factsCorrect',
    'focusedControlActivation',
    'identityRecordCorrect',
    'identityRoleCorrect',
    'identityTitleCorrect',
    'identityUsernameCorrect',
    'keyboardControlCountBounded',
    'layeringValid',
    'markerControlVisible',
    'markerGeometryValid',
    'markerPortraitReady',
    'markerPortraitElementPresent',
    'markerPresent',
    'markerProjectedVisible',
    'markerHitTestable',
    'overviewPresenceDirectHit',
    'overviewRecordCorrect',
    'overviewTargetPassiveOnly',
    'presenceComputedVisible',
    'presenceAvatarGeometryValid',
    'presenceGeometryValid',
    'presenceDelegatedActivation',
    'presenceHitTestable',
    'presencePointerActivatable',
    'presencePortraitElementPresent',
    'presencePortraitReady',
    'presenceVisible',
    'privacyBounded',
    'recordHeaderCorrect',
    'reducedMotionPreferenceCorrect',
    'publicRecordCorrect',
    'publicRecordOpened',
    'rendererStable',
    'workerRecordCorrect',
  ];
  if (!exactMessageKeys(candidate, new Set(keys))) {
    throw new TypeError('Invalid rendered WebGL resource occupant evidence shape.');
  }
  const failures = keys.filter((key) => candidate[key] !== true);
  if (failures.length > 0) {
    throw new TypeError(
      `Invalid rendered WebGL resource occupant evidence: ${failures.join(',')}.`
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, true])));
}

/**
 * Boolean-only proof for the synthetic active generic-worker lane. All
 * identity, Worker IDs, coordinates, private amounts, and DOM text are reduced
 * inside the page; only reviewed aggregate success flags cross CDP.
 */
export function parseRenderedWebglActiveWorkerEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL active Worker evidence.');
  const keys = [
    'activeFixtureSelected',
    'foreignMarkerGeneric',
    'foreignPortraitReady',
    'foreignRecordReadOnly',
    'localReconnectRehydrated',
    'mobileBoundsSafe',
    'ownerCommandCenterAvailable',
    'ownerRecallControlsAvailable',
    'ownerRosterExact',
    'privacyBounded',
    'rendererContextRecovered',
    'rendererStable',
  ];
  if (!exactMessageKeys(candidate, new Set(keys))) {
    throw new TypeError('Invalid rendered WebGL active Worker evidence shape.');
  }
  const failures = keys.filter((key) => candidate[key] !== true);
  if (failures.length > 0) {
    throw new TypeError(
      `Invalid rendered WebGL active Worker evidence: ${failures.join(',')}.`
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, true])));
}

/**
 * Boolean-only proof that the dense synthetic fixture reached the real
 * renderer, retained every source occupation, and exercised all four
 * resource-marker paths under the shared passive/control budgets.
 */
export function parseRenderedWebglOccupancyStressEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL occupancy stress evidence.');
  const keys = [
    'allNodeSourceCountExact',
    'allResourceKindsExercised',
    'controlBudgetBounded',
    'fixtureSelected',
    'legacySourceCorrect',
    'portraitPipelineReady',
    'presenceBudgetBounded',
    'rendererStable',
    'rovingTabStopBounded',
    'uniqueVisibleKeys',
  ];
  if (!exactMessageKeys(candidate, new Set(keys))) {
    throw new TypeError('Invalid rendered WebGL occupancy stress evidence shape.');
  }
  const failures = keys.filter((key) => candidate[key] !== true);
  if (failures.length > 0) {
    throw new TypeError(
      `Invalid rendered WebGL occupancy stress evidence: ${failures.join(',')}.`
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, true])));
}

/**
 * Structural evidence for the world-label roving keyboard group. No castle ID,
 * identity, label text, or projected coordinate leaves the local page.
 */
export function parseRenderedWebglLabelKeyboardEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL label keyboard evidence.');
  if (
    !exactMessageKeys(candidate, new Set([
      'arrowMoved',
      'endReached',
      'homeReached',
      'singleTabStop',
    ]))
    || candidate.arrowMoved !== true
    || candidate.endReached !== true
    || candidate.homeReached !== true
    || candidate.singleTabStop !== true
  ) throw new TypeError('Invalid rendered WebGL label keyboard evidence.');
  return Object.freeze({
    arrowMoved: true,
    endReached: true,
    homeReached: true,
    singleTabStop: true,
  });
}

export function selectBlankPageTarget(value) {
  const result = exactRecord(value, 'Invalid Chrome DevTools target list.');
  if (
    Object.keys(result).length !== 1
    || !Array.isArray(result.targetInfos)
    || result.targetInfos.length !== 1
  ) {
    throw new TypeError('Invalid Chrome DevTools target list.');
  }
  const candidate = exactBlankPageTargetInfo(
    result.targetInfos[0],
    false,
    'Invalid Chrome DevTools page target.'
  );
  return Object.freeze({
    targetId: candidate.targetId,
  });
}

function exactBlankPageTargetInfo(value, attached, message) {
  const candidate = exactRecord(value, message);
  const allowedKeys = new Set([
    'attached',
    'browserContextId',
    'canAccessOpener',
    'targetId',
    'title',
    'type',
    'url',
  ]);
  if (
    !exactMessageKeys(candidate, allowedKeys)
    || !Object.hasOwn(candidate, 'targetId')
    || !Object.hasOwn(candidate, 'type')
    || !Object.hasOwn(candidate, 'title')
    || !Object.hasOwn(candidate, 'url')
    || !Object.hasOwn(candidate, 'attached')
    || typeof candidate.targetId !== 'string'
    || !/^[A-Za-z0-9-]{1,256}$/.test(candidate.targetId)
    || candidate.type !== 'page'
    || !['', 'about:blank'].includes(candidate.title)
    || candidate.url !== 'about:blank'
    || candidate.attached !== attached
    || ('canAccessOpener' in candidate && candidate.canAccessOpener !== false)
    || ('browserContextId' in candidate && (
      typeof candidate.browserContextId !== 'string'
      || !/^[A-Za-z0-9-]{1,256}$/.test(candidate.browserContextId)
    ))
  ) throw new TypeError(message);
  return Object.freeze({
    attached,
    targetId: candidate.targetId,
  });
}

export function isAllowedRenderedWebglPageUrl(value, loopbackOrigin) {
  if (typeof value !== 'string') return false;
  let url;
  let origin;
  try {
    url = new URL(value);
    origin = new URL(loopbackOrigin);
  } catch {
    return false;
  }
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port) return false;
  if (url.protocol === 'blob:') return url.origin === loopbackOrigin;
  return !url.username
    && !url.password
    && url.hostname === '127.0.0.1'
    && url.port === origin.port
    && (url.protocol === 'http:' || url.protocol === 'ws:');
}

export function parseRenderedWebglBrowserDom(value, expected) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL browser DOM.');
  const keys = Object.keys(candidate).sort();
  const expectedKeys = [
    'accessibleClusterButtonCount',
    'castleCount',
    'closeQaObserverControlState',
    'clusterAttachmentViolationCount',
    'clusterButtonCount',
    'clusterCastleOverlapCount',
    'clusterCollisionCount',
    'clusterHitTestViolationCount',
    'clusterIdentityPresentationViolationCount',
    'clusterLeaderMismatchCount',
    'clusterMaximumAnchorDisplacement',
    'clusterMemberDistanceViolationCount',
    'clusterMemberCount',
    'clusterPlacementBindingViolationCount',
    'clusterReservedOverlapCount',
    'clusterRepresentativeAnchorViolationCount',
    'clustersWithinViewportCount',
    'documentWidth',
    'directExploreControlState',
    'environmentLighting',
    'exploreAccessibleCastleCount',
    'exploreCastleCount',
    'fixture',
    'focusedReadableLabelDomFocusCount',
    'focusedReadableLabelCount',
    'forestDecorativeCacheEntries',
    'forestDecorativeCacheHighWaterMark',
    'forestDecorativeDrawCalls',
    'forestDecorativeModelReady',
    'forestDecorativeOverviewHidden',
    'forestDecorativeTriangleCount',
    'forestDecorativeTreeCount',
    'forestDecorativeUsingFallback',
    'href',
    'hiddenFocusedLabelCount',
    'interactionState',
    'individualCastleCount',
    'inspectorProfileImageState',
    'labelAccountingValid',
    'labelCollisionCount',
    'labelCount',
    'labelCullReasons',
    'labelEligibleCount',
    'labelClusteredCount',
    'labelClusterOverflowCount',
    'labelAttachmentViolationCount',
    'labelHitTestViolationCount',
    'labelIdentityPresentationViolationCount',
    'labelLeaderMismatchCount',
    'labelMaximumAnchorDisplacement',
    'labelPlacementBindingViolationCount',
    'labelPlacedCount',
    'labelMissingIdentityCount',
    'labelReservedOverlapCount',
    'labelUnplacedCount',
    'labelsTextBearingCount',
    'labelsWithinViewportCount',
    'mapRenderer',
    'mapPresentationMode',
    'mapViewportCovered',
    'legacyPlayerActionCount',
    'observerBadgeState',
    'presentationMode',
    'profileMenuState',
    'profileTriggerAvatarCount',
    'profileTriggerCount',
    'profileTriggerState',
    'profileTriggerTextBearingCount',
    'quality',
    'raycastTargetCount',
    'readyAfterMilliseconds',
    'readyOverlayVisible',
    'renderer',
    'presentedLandscapeBaseCount',
    'presentedModelCount',
    'resourceIconCount',
    'resourceItemCount',
    'resourceRailCount',
    'resourceRailState',
    'resourceZeroValueCount',
    'semanticTerrainCellCount',
    'semanticTerrainFeatureCount',
    'semanticTerrainFeatureDrawCalls',
    'semanticTerrainKindCount',
    'status',
    'tabbableLabelCount',
    'totalTerrainDetailDrawCalls',
    'totalTerrainDetailInstanceCount',
    'undersizedPrimaryControlCount',
    'undersizedPrimaryControlKinds',
    'viewportHeight',
    'viewportWidth',
  ].sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
  ) throw new TypeError('Invalid rendered WebGL browser DOM: shape.');
  if (
    !Array.isArray(candidate.undersizedPrimaryControlKinds)
    || candidate.undersizedPrimaryControlKinds.length > 32
    || candidate.undersizedPrimaryControlKinds.some((value) => (
      typeof value !== 'string' || !/^[a-z][a-z0-9_.-]{0,160}:\d{1,4}x\d{1,4}$/.test(value)
    ))
    || candidate.undersizedPrimaryControlKinds.length !== candidate.undersizedPrimaryControlCount
  ) throw new TypeError('Invalid rendered WebGL browser DOM: touch-target-shape.');
  if (
    !validLabelCullReasonAggregate(candidate.labelCullReasons)
  ) throw new TypeError('Invalid rendered WebGL browser DOM: label-cull-reasons-shape.');
  const labelCullEntries = candidate.labelCullReasons === ''
    ? []
    : candidate.labelCullReasons.split(',').map((entry) => {
        const [reason, count] = entry.split(':');
        return { reason, count: Number(count) };
      });
  const reservedUiCullCount = labelCullEntries.find((entry) => (
    entry.reason === 'reserved-ui'
  ))?.count ?? 0;
  const labelCullPolicyValid = labelCullEntries.every((entry) => (
    entry.reason === 'reserved-ui'
  ));
  // Inspector activation can legitimately transfer focus from its permanent
  // source label into the record. Other lanes should not retain a focused
  // world identity.
  const expectedFocusedReadableLabelCount = expected.interaction === 'inspector'
    ? undefined : 0;
  const expectedFocusedReadableLabelDomFocusCount = expected.interaction === 'inspector'
    ? undefined : 0;
  const expectedExploreCastleCount = expected.interaction === 'explore'
    ? candidate.castleCount
    : 0;
  const presentationControlsMayBeOccluded = ['inspector', 'explore'].includes(
    expected.interaction
  );
  const expectedPresentationControlStateValid = (state) => state === 'visible'
    || (presentationControlsMayBeOccluded && state === 'hidden');
  const playerPresentation = expected.expectedPresentationMode === 'player';
  const terrainBudgets = TERRAIN_PRESENTATION_BUDGETS[expected.expectedQuality];
  const forestDecorativeBudgets = RENDERED_WEBGL_QA_FOREST_DECORATIVE_BUDGETS[
    expected.expectedQuality
  ];
  const forestDecorativeNumericValues = [
    candidate.forestDecorativeTreeCount,
    candidate.forestDecorativeTriangleCount,
    candidate.forestDecorativeDrawCalls,
    candidate.forestDecorativeCacheEntries,
    candidate.forestDecorativeCacheHighWaterMark,
  ];
  const forestDecorativeNumericShapeValid = forestDecorativeNumericValues.every((value) => (
    Number.isSafeInteger(value) && value >= 0
  ));
  const forestDecorativeBooleanShapeValid = [
    candidate.forestDecorativeModelReady,
    candidate.forestDecorativeUsingFallback,
    candidate.forestDecorativeOverviewHidden,
  ].every((value) => typeof value === 'boolean');
  const forestDecorativeCacheValid = forestDecorativeNumericShapeValid
    && forestDecorativeBudgets
    && candidate.forestDecorativeCacheEntries
      <= candidate.forestDecorativeCacheHighWaterMark
    && candidate.forestDecorativeCacheHighWaterMark
      <= forestDecorativeBudgets.cacheEntries;
  const forestDecorativeBudgetValid = forestDecorativeNumericShapeValid
    && forestDecorativeBudgets
    && candidate.forestDecorativeTreeCount <= forestDecorativeBudgets.instances
    && candidate.forestDecorativeTriangleCount <= forestDecorativeBudgets.triangles
    && candidate.forestDecorativeDrawCalls <= forestDecorativeBudgets.drawCalls;
  const forestDecorativeEmpty = candidate.forestDecorativeTreeCount === 0
    && candidate.forestDecorativeTriangleCount === 0
    && candidate.forestDecorativeDrawCalls === 0
    && candidate.forestDecorativeModelReady === false
    && candidate.forestDecorativeUsingFallback === false;
  const forestDecorativePresented = candidate.forestDecorativeTreeCount > 0
    && candidate.forestDecorativeTriangleCount > 0
    && candidate.forestDecorativeCacheEntries > 0
    && (
      candidate.forestDecorativeModelReady
      !== candidate.forestDecorativeUsingFallback
    )
    && (
      candidate.forestDecorativeUsingFallback
        ? candidate.forestDecorativeDrawCalls === 1
        : candidate.forestDecorativeDrawCalls > 0
    );
  const forestDecorativeStateValid = forestDecorativeNumericShapeValid
    && forestDecorativeBooleanShapeValid
    && (
      candidate.forestDecorativeOverviewHidden
        ? forestDecorativeEmpty
        : forestDecorativeEmpty || forestDecorativePresented
    );
  const ordinarySemanticFeatureCount = candidate.semanticTerrainFeatureCount
    - candidate.forestDecorativeTreeCount;
  const ordinaryTotalDetailInstanceCount = candidate.totalTerrainDetailInstanceCount
    - candidate.forestDecorativeTreeCount;
  const ordinarySemanticFeatureDrawCalls = candidate.semanticTerrainFeatureDrawCalls
    - candidate.forestDecorativeDrawCalls;
  const ordinaryTotalDetailDrawCalls = candidate.totalTerrainDetailDrawCalls
    - candidate.forestDecorativeDrawCalls;
  const violations = [
    candidate.href !== expected.url ? 'href' : '',
    candidate.status !== 'ready' ? 'status' : '',
    candidate.mapRenderer !== 'webgl' ? 'renderer' : '',
    candidate.presentationMode !== expected.expectedPresentationMode
      ? 'presentation-mode' : '',
    candidate.mapPresentationMode !== expected.expectedPresentationMode
      ? 'map-presentation-mode' : '',
    candidate.quality !== expected.expectedQuality ? 'quality' : '',
    candidate.viewportWidth !== expected.viewport.width ? 'viewport-width' : '',
    candidate.viewportHeight !== expected.viewport.height ? 'viewport-height' : '',
    candidate.documentWidth !== expected.viewport.width ? 'horizontal-overflow' : '',
    candidate.interactionState !== expected.interaction ? 'interaction' : '',
    candidate.readyOverlayVisible !== false ? 'ready-overlay-visible' : '',
    candidate.mapViewportCovered !== true ? 'map-coverage' : '',
    candidate.environmentLighting !== 'procedural' ? 'environment-lighting' : '',
    candidate.semanticTerrainCellCount !== RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_CELL_COUNT
      ? 'semantic-terrain-cell-count' : '',
    candidate.semanticTerrainKindCount !== RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_KIND_COUNT
      ? 'semantic-terrain-kind-count' : '',
    !forestDecorativeNumericShapeValid || !forestDecorativeBooleanShapeValid
      ? 'forest-decorative-shape' : '',
    !forestDecorativeBudgetValid ? 'forest-decorative-budget' : '',
    !forestDecorativeCacheValid ? 'forest-decorative-cache' : '',
    !forestDecorativeStateValid ? 'forest-decorative-state' : '',
    !terrainBudgets
      || !Number.isSafeInteger(candidate.semanticTerrainFeatureCount)
      || !Number.isSafeInteger(ordinarySemanticFeatureCount)
      || ordinarySemanticFeatureCount < 1
      || ordinarySemanticFeatureCount > terrainBudgets.semanticFeatureCount
      ? 'semantic-terrain-feature-budget' : '',
    !Number.isSafeInteger(candidate.semanticTerrainFeatureDrawCalls)
      || !Number.isSafeInteger(ordinarySemanticFeatureDrawCalls)
      || ordinarySemanticFeatureDrawCalls < 1
      || ordinarySemanticFeatureDrawCalls
        > TERRAIN_PRESENTATION_MAXIMUM_SEMANTIC_DRAW_CALLS
      ? 'semantic-terrain-feature-draw-calls' : '',
    !terrainBudgets
      || !Number.isSafeInteger(candidate.totalTerrainDetailInstanceCount)
      || !Number.isSafeInteger(ordinaryTotalDetailInstanceCount)
      || ordinaryTotalDetailInstanceCount < ordinarySemanticFeatureCount
      || ordinaryTotalDetailInstanceCount > terrainBudgets.totalDetailInstanceCount
      ? 'total-terrain-detail-budget' : '',
    !Number.isSafeInteger(candidate.totalTerrainDetailDrawCalls)
      || !Number.isSafeInteger(ordinaryTotalDetailDrawCalls)
      || ordinaryTotalDetailDrawCalls < ordinarySemanticFeatureDrawCalls
      || ordinaryTotalDetailDrawCalls > TERRAIN_PRESENTATION_MAXIMUM_TOTAL_DRAW_CALLS
      ? 'total-terrain-detail-draw-calls' : '',
    !Number.isSafeInteger(candidate.labelEligibleCount)
      || candidate.labelEligibleCount < 0 ? 'label-eligible-shape' : '',
    !Number.isSafeInteger(candidate.labelPlacedCount)
      || candidate.labelPlacedCount < 0 ? 'label-placed-shape' : '',
    !Number.isSafeInteger(candidate.labelUnplacedCount)
      || candidate.labelUnplacedCount < 0 ? 'label-unplaced-shape' : '',
    candidate.labelEligibleCount !== candidate.labelPlacedCount + candidate.labelUnplacedCount
      ? 'label-coverage-accounting' : '',
    candidate.labelUnplacedCount !== reservedUiCullCount
      ? 'label-cull-accounting' : '',
    !labelCullPolicyValid ? 'label-cull-policy' : '',
    candidate.labelPlacedCount !== candidate.labelCount ? 'label-placement-dom' : '',
    candidate.individualCastleCount !== candidate.labelPlacedCount
      ? 'individual-label-mismatch' : '',
    !Number.isSafeInteger(candidate.presentedModelCount)
      || candidate.presentedModelCount < candidate.labelEligibleCount
      || candidate.presentedModelCount > candidate.castleCount
      ? 'presented-model-mismatch' : '',
    !Number.isSafeInteger(candidate.presentedLandscapeBaseCount)
      || candidate.presentedLandscapeBaseCount !== candidate.presentedModelCount
      ? 'presented-landscape-base-mismatch' : '',
    candidate.raycastTargetCount !== candidate.presentedModelCount
      ? 'raycast-target-mismatch' : '',
    !Number.isSafeInteger(candidate.labelClusteredCount)
      || candidate.labelClusteredCount !== 0 ? 'label-clustered' : '',
    !Number.isSafeInteger(candidate.labelClusterOverflowCount)
      || candidate.labelClusterOverflowCount !== 0 ? 'label-cluster-overflow' : '',
    !Number.isSafeInteger(expected.maximumLabelOverflowCount)
      || expected.maximumLabelOverflowCount !== 0
      ? 'expected-label-overflow' : '',
    candidate.clusterMemberCount !== 0 ? 'label-cluster-membership' : '',
    candidate.clusterButtonCount !== 0 ? 'label-cluster-affordance' : '',
    candidate.accessibleClusterButtonCount !== 0 ? 'label-cluster-accessibility' : '',
    // Public fallback text means every founded castle keeps a readable direct
    // identity even while profile hydration is pending.
    candidate.labelMissingIdentityCount !== 0 ? 'label-missing-identity' : '',
    candidate.labelAccountingValid !== true ? 'label-accounting' : '',
    !Number.isSafeInteger(candidate.labelMaximumAnchorDisplacement)
      || candidate.labelMaximumAnchorDisplacement < 0
      || candidate.labelMaximumAnchorDisplacement
        > RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS
      ? 'label-anchor-displacement' : '',
    !Number.isSafeInteger(candidate.labelAttachmentViolationCount)
      || candidate.labelAttachmentViolationCount !== 0
      ? 'label-attachment' : '',
    !Number.isSafeInteger(candidate.labelPlacementBindingViolationCount)
      || candidate.labelPlacementBindingViolationCount !== 0
      ? 'label-placement-binding' : '',
    !Number.isSafeInteger(candidate.labelIdentityPresentationViolationCount)
      || candidate.labelIdentityPresentationViolationCount !== 0
      ? 'label-identity-presentation' : '',
    candidate.clustersWithinViewportCount !== candidate.clusterButtonCount
      ? 'label-cluster-viewport' : '',
    candidate.clusterCollisionCount !== 0 ? 'label-cluster-collision' : '',
    !Number.isSafeInteger(candidate.clusterRepresentativeAnchorViolationCount)
      || candidate.clusterRepresentativeAnchorViolationCount !== 0
      ? 'label-cluster-representative-anchor' : '',
    !Number.isSafeInteger(candidate.clusterCastleOverlapCount)
      || candidate.clusterCastleOverlapCount !== 0
      ? 'label-cluster-castle-overlap' : '',
    !Number.isSafeInteger(candidate.clusterMemberDistanceViolationCount)
      || candidate.clusterMemberDistanceViolationCount !== 0
      ? 'label-cluster-member-distance' : '',
    !Number.isSafeInteger(candidate.clusterMaximumAnchorDisplacement)
      || candidate.clusterMaximumAnchorDisplacement < 0
      || candidate.clusterMaximumAnchorDisplacement
        > RENDERED_WEBGL_QA_CLUSTER_MAX_ANCHOR_DISPLACEMENT_PIXELS
      ? 'label-cluster-anchor-displacement' : '',
    !Number.isSafeInteger(candidate.clusterAttachmentViolationCount)
      || candidate.clusterAttachmentViolationCount !== 0
      ? 'label-cluster-attachment' : '',
    !Number.isSafeInteger(candidate.clusterPlacementBindingViolationCount)
      || candidate.clusterPlacementBindingViolationCount !== 0
      ? 'label-cluster-placement-binding' : '',
    !Number.isSafeInteger(candidate.clusterIdentityPresentationViolationCount)
      || candidate.clusterIdentityPresentationViolationCount !== 0
      ? 'label-cluster-identity-presentation' : '',
    !Number.isSafeInteger(candidate.clusterHitTestViolationCount)
      || candidate.clusterHitTestViolationCount !== 0
      ? 'label-cluster-hit-test' : '',
    candidate.clusterLeaderMismatchCount !== 0 ? 'label-cluster-leader' : '',
    candidate.clusterReservedOverlapCount !== 0 ? 'label-cluster-reserved-ui' : '',
    !Number.isSafeInteger(candidate.labelCount)
      || candidate.labelCount < expected.minimumLabelCount ? 'label-count' : '',
    !Number.isSafeInteger(candidate.tabbableLabelCount)
      || candidate.tabbableLabelCount !== (candidate.labelCount > 0 ? 1 : 0)
      ? 'label-roving-tab-stop' : '',
    candidate.hiddenFocusedLabelCount !== 0 ? 'label-hidden-focus' : '',
    candidate.labelsTextBearingCount !== candidate.labelCount ? 'label-text' : '',
    !Number.isSafeInteger(candidate.labelsWithinViewportCount)
      || candidate.labelsWithinViewportCount !== candidate.labelCount
      ? 'label-viewport' : '',
    !Number.isSafeInteger(candidate.labelCollisionCount)
      || candidate.labelCollisionCount < 0
      || candidate.labelCollisionCount > candidate.labelCount * (candidate.labelCount - 1) / 2
      ? 'label-collision-shape' : '',
    !Number.isSafeInteger(candidate.labelHitTestViolationCount)
      || candidate.labelHitTestViolationCount !== 0
      ? 'label-hit-test' : '',
    !Number.isSafeInteger(candidate.labelReservedOverlapCount)
      || candidate.labelReservedOverlapCount !== 0
      ? 'label-reserved-ui' : '',
    !Number.isSafeInteger(candidate.focusedReadableLabelCount)
      || candidate.focusedReadableLabelCount < 0
      || candidate.focusedReadableLabelCount > candidate.labelCount
      ? 'focused-readable-label-shape' : '',
    !Number.isSafeInteger(candidate.focusedReadableLabelDomFocusCount)
      || candidate.focusedReadableLabelDomFocusCount < 0
      || candidate.focusedReadableLabelDomFocusCount > candidate.focusedReadableLabelCount
      ? 'focused-readable-label-dom-focus-shape' : '',
    expectedFocusedReadableLabelCount !== undefined
      && candidate.focusedReadableLabelCount !== expectedFocusedReadableLabelCount
      ? 'focused-readable-label' : '',
    expectedFocusedReadableLabelDomFocusCount !== undefined
      && candidate.focusedReadableLabelDomFocusCount !== expectedFocusedReadableLabelDomFocusCount
      ? 'focused-readable-label-dom-focus' : '',
    candidate.exploreCastleCount !== expectedExploreCastleCount
      ? 'explore-castle-coverage' : '',
    candidate.exploreAccessibleCastleCount !== candidate.exploreCastleCount
      ? 'explore-castle-accessibility' : '',
    candidate.inspectorProfileImageState !== (
      expected.interaction === 'inspector' ? 'ready' : 'absent'
    ) ? 'inspector-profile-image-state' : '',
    candidate.labelLeaderMismatchCount !== 0 ? 'label-leader' : '',
    candidate.undersizedPrimaryControlCount !== 0
      ? `touch-target:${Array.isArray(candidate.undersizedPrimaryControlKinds)
          ? candidate.undersizedPrimaryControlKinds.join('|')
          : 'invalid'}`
      : '',
    candidate.legacyPlayerActionCount !== 0 ? 'legacy-player-actions' : '',
    candidate.profileMenuState !== 'absent' ? 'profile-menu-dismissal' : '',
    (playerPresentation
      ? candidate.profileTriggerState !== 'visible'
      : candidate.profileTriggerState !== 'absent')
      ? `${expected.expectedPresentationMode}-profile-trigger` : '',
    candidate.profileTriggerAvatarCount !== (playerPresentation ? 1 : 0)
      ? `${expected.expectedPresentationMode}-profile-avatar` : '',
    candidate.profileTriggerCount !== (playerPresentation ? 1 : 0)
      ? `${expected.expectedPresentationMode}-profile-trigger-count` : '',
    candidate.profileTriggerTextBearingCount !== 0
      ? 'profile-trigger-text' : '',
    (playerPresentation
      ? candidate.resourceRailState !== 'visible'
      : candidate.resourceRailState !== 'absent')
      ? `${expected.expectedPresentationMode}-resource-rail` : '',
    candidate.resourceItemCount !== (playerPresentation ? 5 : 0)
      ? `${expected.expectedPresentationMode}-resource-items` : '',
    candidate.resourceRailCount !== (playerPresentation ? 1 : 0)
      ? `${expected.expectedPresentationMode}-resource-rail-count` : '',
    candidate.resourceIconCount !== (playerPresentation ? 5 : 0)
      ? `${expected.expectedPresentationMode}-resource-icons` : '',
    candidate.resourceZeroValueCount !== (playerPresentation ? 5 : 0)
      ? `${expected.expectedPresentationMode}-resource-zero-values` : '',
    (playerPresentation
      ? candidate.directExploreControlState !== 'absent'
      : !expectedPresentationControlStateValid(candidate.directExploreControlState))
      ? `${expected.expectedPresentationMode}-direct-explore` : '',
    (expected.expectedPresentationMode === 'observer'
      ? !expectedPresentationControlStateValid(candidate.observerBadgeState)
      : candidate.observerBadgeState !== 'absent')
      ? `${expected.expectedPresentationMode}-observer-badge` : '',
    (expected.expectedPresentationMode === 'observer'
      ? !expectedPresentationControlStateValid(candidate.closeQaObserverControlState)
      : candidate.closeQaObserverControlState !== 'absent')
      ? `${expected.expectedPresentationMode}-observer-close` : '',
  ].filter(Boolean);
  if (violations.length > 0) {
    throw new TypeError(`Invalid rendered WebGL browser DOM: ${violations.join(',')}.`);
  }
  const observation = parseRenderedWebglQaObservation({
    version: 1,
    fixture: candidate.fixture,
    renderer: candidate.renderer,
    presentationMode: candidate.presentationMode,
    quality: candidate.quality,
    castleCount: candidate.castleCount,
    readyAfterMilliseconds: candidate.readyAfterMilliseconds,
  });
  return Object.freeze({
    ...observation,
    environmentLighting: 'procedural',
    forestDecorativeTreeCount: candidate.forestDecorativeTreeCount,
    forestDecorativeTriangleCount: candidate.forestDecorativeTriangleCount,
    forestDecorativeDrawCalls: candidate.forestDecorativeDrawCalls,
    forestDecorativeCacheEntries: candidate.forestDecorativeCacheEntries,
    forestDecorativeCacheHighWaterMark: candidate.forestDecorativeCacheHighWaterMark,
    forestDecorativeModelReady: candidate.forestDecorativeModelReady,
    forestDecorativeUsingFallback: candidate.forestDecorativeUsingFallback,
    forestDecorativeOverviewHidden: candidate.forestDecorativeOverviewHidden,
    semanticTerrainCellCount: candidate.semanticTerrainCellCount,
    semanticTerrainKindCount: candidate.semanticTerrainKindCount,
    semanticTerrainFeatureCount: candidate.semanticTerrainFeatureCount,
    semanticTerrainFeatureDrawCalls: candidate.semanticTerrainFeatureDrawCalls,
    totalTerrainDetailInstanceCount: candidate.totalTerrainDetailInstanceCount,
    totalTerrainDetailDrawCalls: candidate.totalTerrainDetailDrawCalls,
    // Privacy-safe aggregate coverage only; castle and identity values never
    // cross the local rendered-probe boundary.
    labelEligibleCount: candidate.labelEligibleCount,
    labelPlacedCount: candidate.labelPlacedCount,
    labelUnplacedCount: candidate.labelUnplacedCount,
  });
}

/**
 * Reuse the complete rendered DOM contract, then require the camera-local
 * ecology to be materially present. This is deliberately separate from the
 * overview cases: those still have to prove a clean, zero-cost hidden state.
 */
export function parseRenderedWebglActiveForestDom(value, expected) {
  const observation = parseRenderedWebglBrowserDom(value, expected);
  if (
    observation.forestDecorativeOverviewHidden !== false
    || observation.forestDecorativeTreeCount < 1
    || observation.forestDecorativeTriangleCount < 1
    || observation.forestDecorativeCacheEntries < 1
    || observation.forestDecorativeModelReady !== true
    || observation.forestDecorativeUsingFallback !== false
  ) {
    throw new TypeError('Invalid rendered WebGL active decorative forest DOM.');
  }
  return observation;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function browserConsoleViolationCategory(arguments_) {
  const aggregate = Array.isArray(arguments_)
    ? arguments_.map((argument) => (
        typeof argument?.value === 'string' ? argument.value
          : typeof argument?.description === 'string' ? argument.description
            : ''
      )).join(' ')
    : '';
  if (/(?:content security policy|refused to|violates the following)/i.test(aggregate)) {
    return 'console-policy';
  }
  if (/(?:webassembly|wasm|compileerror)/i.test(aggregate)) return 'console-wasm';
  if (/(?:meshopt|decoder)/i.test(aggregate)) return 'console-decoder';
  if (/(?:gltf|\.glb\b)/i.test(aggregate)) return 'console-gltf';
  if (/(?:hegemony keep|castle model|integrity check)/i.test(aggregate)) return 'console-castle';
  if (/(?:dynamic import|importing a module|module script)/i.test(aggregate)) return 'console-module';
  if (/(?:securityerror|notsupportederror|domexception)/i.test(aggregate)) return 'console-dom-security';
  if (/(?:typeerror|cannot read|undefined is not|null is not)/i.test(aggregate)) {
    return 'console-type';
  }
  if (/webgl/i.test(aggregate)) return 'console-webgl';
  if (/(?:failed to load|loading failed|networkerror)/i.test(aggregate)) return 'console-load';
  if (/react/i.test(aggregate)) return 'console-react';
  return 'console-error';
}

function exactCdpIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,256}$/.test(value)) {
    throw new TypeError(`Invalid Chrome DevTools ${label}.`);
  }
  return value;
}

function exactCdpMethod(value) {
  if (
    typeof value !== 'string'
    || !/^[A-Z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(value)
  ) throw new TypeError('Invalid Chrome DevTools method.');
  return value;
}

function exactMessageKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.has(key));
}

/**
 * Strict private Chrome DevTools transport over inherited fd 3/4. Frames are
 * UTF-8 JSON terminated by one NUL byte. No debugger TCP listener, discovery
 * endpoint, WebSocket, browser profile reuse, or user browser state exists.
 */
export class DevtoolsPipeSession {
  #attachedEvent;
  #attachingTargetId;
  #child;
  #closed = true;
  #eventHandler;
  #inboundBytes = 0;
  #inboundChunks = [];
  #nextId = 1;
  #opened = false;
  #pageSessionId;
  #pending = new Map();
  #reader;
  #writer;
  #writeTail = Promise.resolve();

  constructor(child, eventHandler = () => {}) {
    if (!child || typeof child !== 'object' || typeof eventHandler !== 'function') {
      throw new TypeError('Invalid Chrome DevTools pipe transport.');
    }
    this.#child = child;
    this.#eventHandler = eventHandler;
  }

  async open() {
    if (this.#opened) throw new Error('Chrome DevTools pipe cannot be reopened.');
    const writer = this.#child.stdio?.[3];
    const reader = this.#child.stdio?.[4];
    if (
      !writer
      || typeof writer.write !== 'function'
      || typeof writer.end !== 'function'
      || typeof writer.destroy !== 'function'
      || typeof writer.on !== 'function'
      || typeof writer.off !== 'function'
      || typeof writer.once !== 'function'
      || !reader
      || typeof reader.on !== 'function'
      || typeof reader.off !== 'function'
      || typeof reader.destroy !== 'function'
      || typeof this.#child.on !== 'function'
      || typeof this.#child.off !== 'function'
    ) throw new Error('Chrome DevTools pipe is unavailable.');
    this.#writer = writer;
    this.#reader = reader;
    this.#opened = true;
    this.#closed = false;
    reader.on('data', this.#receiveData);
    reader.on('error', this.#receiveFailure);
    reader.on('end', this.#receiveEnd);
    reader.on('close', this.#receiveEnd);
    writer.on('error', this.#receiveFailure);
    writer.on('close', this.#receiveEnd);
    this.#child.on('error', this.#receiveFailure);
    this.#child.on('close', this.#receiveEnd);
  }

  #receiveData = (chunk) => {
    if (this.#closed) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;
    while (!this.#closed && offset < bytes.byteLength) {
      const delimiter = bytes.indexOf(0, offset);
      const end = delimiter < 0 ? bytes.byteLength : delimiter;
      const piece = bytes.subarray(offset, end);
      if (piece.byteLength > 0) {
        this.#inboundBytes += piece.byteLength;
        if (this.#inboundBytes > CDP_PIPE_MAXIMUM_INBOUND_BYTES) {
          this.#fail('Chrome DevTools pipe frame exceeded its bound.');
          return;
        }
        this.#inboundChunks.push(Buffer.from(piece));
      }
      if (delimiter < 0) return;
      if (this.#inboundBytes === 0) {
        this.#fail('Chrome DevTools pipe returned an empty frame.');
        return;
      }
      const frame = this.#inboundChunks.length === 1
        ? this.#inboundChunks[0]
        : Buffer.concat(this.#inboundChunks, this.#inboundBytes);
      this.#inboundChunks = [];
      this.#inboundBytes = 0;
      let message;
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(frame);
        message = JSON.parse(decoded);
      } catch {
        this.#fail('Chrome DevTools pipe returned invalid JSON.');
      } finally {
        frame.fill(0);
      }
      if (!this.#closed) {
        try {
          this.#receiveMessage(message);
        } catch {
          this.#fail('Chrome DevTools pipe returned a malformed message.');
        }
      }
      offset = delimiter + 1;
    }
  };

  #receiveFailure = () => {
    this.#fail('Chrome DevTools pipe failed.');
  };

  #receiveEnd = () => {
    this.#fail('Chrome DevTools pipe closed.');
  };

  #receiveMessage(messageValue) {
    const message = exactRecord(messageValue, 'Invalid Chrome DevTools pipe message.');
    if (Number.isSafeInteger(message.id)) {
      if (
        message.id < 1
        || !exactMessageKeys(message, new Set(['id', 'result', 'error', 'sessionId']))
        || ('result' in message) === ('error' in message)
      ) {
        this.#fail('Chrome DevTools pipe returned a malformed response.');
        return;
      }
      const pending = this.#pending.get(message.id);
      if (!pending) {
        this.#fail('Chrome DevTools pipe returned an unknown response.');
        return;
      }
      const responseSessionId = message.sessionId;
      if (
        pending.sessionId === undefined
          ? responseSessionId !== undefined
          : responseSessionId !== pending.sessionId
      ) {
        this.#fail('Chrome DevTools pipe response session mismatched.');
        return;
      }
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if ('error' in message) {
        const staleFetchInterception = isBenignStaleFetchInterceptionError(
          pending.method,
          message.error
        );
        // A paused request may be canceled by the page before Chrome consumes
        // its continue/fail command. The request no longer exists, so this
        // exact response cannot permit network access and must not tear down an
        // otherwise fail-closed local probe session.
        if (staleFetchInterception) {
          pending.resolve({});
          return;
        }
        pending.reject(new Error('Chrome DevTools command failed.'));
        this.#fail('Chrome DevTools command failed.');
        return;
      }
      if (message.result === null || typeof message.result !== 'object' || Array.isArray(message.result)) {
        pending.reject(new Error('Chrome DevTools pipe returned an invalid result.'));
        this.#fail('Chrome DevTools pipe returned an invalid result.');
        return;
      }
      pending.resolve(message.result);
      return;
    }
    if (
      !exactMessageKeys(message, new Set(['method', 'params', 'sessionId']))
      || !('method' in message)
      || ('params' in message && (
        message.params === null
        || typeof message.params !== 'object'
        || Array.isArray(message.params)
      ))
    ) {
      this.#fail('Chrome DevTools pipe returned a malformed event.');
      return;
    }
    let method;
    try {
      method = exactCdpMethod(message.method);
    } catch {
      this.#fail('Chrome DevTools pipe returned a malformed event.');
      return;
    }
    const params = message.params ?? {};
    if (method === 'Target.attachedToTarget') {
      if (message.sessionId !== undefined) {
        this.#fail('Chrome DevTools attach event session mismatched.');
        return;
      }
      this.#receiveAttachedEvent(params);
      return;
    }
    const browserEvent = method.startsWith('Target.');
    if (
      browserEvent
        ? message.sessionId !== undefined
        : message.sessionId !== this.#pageSessionId
    ) {
      this.#fail('Chrome DevTools event session mismatched.');
      return;
    }
    try {
      this.#eventHandler(method, params, this);
    } catch {
      this.#fail('Chrome DevTools event handler failed.');
    }
  }

  #receiveAttachedEvent(paramsValue) {
    const params = exactRecord(paramsValue, 'Invalid Chrome DevTools attach event.');
    if (
      Object.keys(params).length !== 3
      || !Object.hasOwn(params, 'sessionId')
      || !Object.hasOwn(params, 'targetInfo')
      || !Object.hasOwn(params, 'waitingForDebugger')
    ) {
      this.#fail('Chrome DevTools attach event was invalid.');
      return;
    }
    const targetInfo = exactBlankPageTargetInfo(
      params.targetInfo,
      true,
      'Invalid Chrome DevTools attach target.'
    );
    let sessionId;
    let targetId;
    try {
      sessionId = exactCdpIdentifier(params.sessionId, 'session ID');
      targetId = exactCdpIdentifier(targetInfo.targetId, 'target ID');
    } catch {
      this.#fail('Chrome DevTools attach event was invalid.');
      return;
    }
    if (
      this.#attachedEvent
      || !this.#attachingTargetId
      || this.#pageSessionId
      || params.waitingForDebugger !== false
      || targetId !== this.#attachingTargetId
    ) {
      this.#fail('Chrome DevTools attach event was invalid.');
      return;
    }
    this.#attachedEvent = Object.freeze({ sessionId, targetId });
  }

  async #writeFrame(frame) {
    try {
      if (this.#closed || !this.#writer) {
        throw new Error('Chrome DevTools pipe is unavailable.');
      }
      await new Promise((resolveWrite, rejectWrite) => {
        let callbackComplete = false;
        let drainComplete = false;
        let settled = false;
        const cleanup = () => {
          this.#writer?.off('drain', drained);
          this.#writer?.off('error', failed);
          this.#writer?.off('close', failed);
        };
        const resolveIfComplete = () => {
          if (settled || !callbackComplete || !drainComplete) return;
          settled = true;
          cleanup();
          resolveWrite();
        };
        const failed = () => {
          if (settled) return;
          settled = true;
          cleanup();
          rejectWrite(new Error('Chrome DevTools pipe write failed.'));
        };
        const drained = () => {
          drainComplete = true;
          resolveIfComplete();
        };
        const callback = (error) => {
          if (settled) return;
          if (error) {
            failed();
            return;
          }
          callbackComplete = true;
          resolveIfComplete();
        };
        this.#writer.on('error', failed);
        this.#writer.on('close', failed);
        let accepted;
        try {
          accepted = this.#writer.write(frame, callback);
        } catch {
          failed();
          return;
        }
        if (accepted) {
          drainComplete = true;
          resolveIfComplete();
        } else {
          this.#writer.once('drain', drained);
        }
      });
    } finally {
      frame.fill(0);
    }
  }

  #send(methodValue, paramsValue, sessionId, timeoutMilliseconds) {
    if (this.#closed || !this.#writer) {
      return Promise.reject(new Error('Chrome DevTools pipe is unavailable.'));
    }
    let method;
    let params;
    try {
      method = exactCdpMethod(methodValue);
      params = exactRecord(paramsValue, 'Invalid Chrome DevTools command parameters.');
    } catch (error) {
      return Promise.reject(error);
    }
    if (
      !Number.isSafeInteger(timeoutMilliseconds)
      || timeoutMilliseconds < 1
      || timeoutMilliseconds > CASE_TIMEOUT_MILLISECONDS
      || this.#pending.size >= CDP_PIPE_MAXIMUM_PENDING_COMMANDS
      || this.#nextId > Number.MAX_SAFE_INTEGER
    ) return Promise.reject(new Error('Chrome DevTools command contract is invalid.'));
    const id = this.#nextId++;
    const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    let encoded;
    try {
      encoded = Buffer.from(`${JSON.stringify(payload)}\0`, 'utf8');
    } catch {
      return Promise.reject(new Error('Chrome DevTools command could not be encoded.'));
    }
    if (encoded.byteLength > CDP_PIPE_MAXIMUM_OUTBOUND_BYTES) {
      encoded.fill(0);
      return Promise.reject(new Error('Chrome DevTools command exceeded its bound.'));
    }
    return new Promise((resolveCommand, rejectCommand) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.has(id)) return;
        this.#fail('Chrome DevTools command timed out.');
      }, timeoutMilliseconds);
      this.#pending.set(id, {
        method,
        resolve: resolveCommand,
        reject: rejectCommand,
        sessionId,
        timeout,
      });
      const write = this.#writeTail.then(() => this.#writeFrame(encoded));
      this.#writeTail = write.catch(() => {});
      write.catch(() => this.#fail('Chrome DevTools pipe write failed.'));
    });
  }

  browserCommand(method, params = {}, timeoutMilliseconds = CDP_COMMAND_TIMEOUT_MILLISECONDS) {
    return this.#send(method, params, undefined, timeoutMilliseconds);
  }

  command(method, params = {}, timeoutMilliseconds = CDP_COMMAND_TIMEOUT_MILLISECONDS) {
    if (!this.#pageSessionId) {
      return Promise.reject(new Error('Chrome DevTools page session is unavailable.'));
    }
    return this.#send(method, params, this.#pageSessionId, timeoutMilliseconds);
  }

  async attachToPage(targetIdValue) {
    const targetId = exactCdpIdentifier(targetIdValue, 'target ID');
    if (this.#pageSessionId || this.#attachedEvent) {
      throw new Error('Chrome DevTools page session already exists.');
    }
    this.#attachingTargetId = targetId;
    const result = await this.browserCommand('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    if (
      Object.keys(result).length !== 1
      || typeof result.sessionId !== 'string'
      || !this.#attachedEvent
      || result.sessionId !== this.#attachedEvent.sessionId
      || targetId !== this.#attachedEvent.targetId
    ) {
      this.#fail('Chrome DevTools attach response mismatched.');
      throw new Error('Chrome DevTools attach response mismatched.');
    }
    this.#pageSessionId = exactCdpIdentifier(result.sessionId, 'session ID');
    this.#attachedEvent = undefined;
    this.#attachingTargetId = undefined;
    return this.#pageSessionId;
  }

  #clearInbound() {
    for (const chunk of this.#inboundChunks) chunk.fill(0);
    this.#inboundChunks = [];
    this.#inboundBytes = 0;
  }

  #rejectPending(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #removeListeners() {
    this.#reader?.off('data', this.#receiveData);
    this.#reader?.off('error', this.#receiveFailure);
    this.#reader?.off('end', this.#receiveEnd);
    this.#reader?.off('close', this.#receiveEnd);
    this.#writer?.off('error', this.#receiveFailure);
    this.#writer?.off('close', this.#receiveEnd);
    this.#child.off('error', this.#receiveFailure);
    this.#child.off('close', this.#receiveEnd);
  }

  #fail(message) {
    if (this.#closed) return;
    const error = new Error(message);
    this.#closed = true;
    this.#removeListeners();
    this.#clearInbound();
    this.#rejectPending(error);
    this.#attachedEvent = undefined;
    this.#attachingTargetId = undefined;
    this.#pageSessionId = undefined;
    try { this.#writer?.destroy(); } catch {}
    try { this.#reader?.destroy(); } catch {}
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#removeListeners();
    this.#clearInbound();
    this.#rejectPending(new Error('Chrome DevTools pipe closed.'));
    this.#attachedEvent = undefined;
    this.#attachingTargetId = undefined;
    this.#pageSessionId = undefined;
    try { this.#writer?.end(); } catch {}
    try { this.#reader?.destroy(); } catch {}
  }
}

function terminateProcessGroup(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // An exited disposable browser needs no further action.
    }
  }
}

export async function terminateHeadlessChromeProcessGroup(child, options = {}) {
  if (!child?.pid) return;
  const terminate = options.terminateProcessGroup ?? terminateProcessGroup;
  const wait = options.wait ?? delay;
  const leaderRunning = child.exitCode === null && child.signalCode === null;
  const closed = leaderRunning
    ? new Promise((resolveClose) => child.once('close', resolveClose))
    : Promise.resolve();
  terminate(child, 'SIGTERM');
  if (leaderRunning) {
    await Promise.race([closed, wait(TERMINATION_GRACE_MILLISECONDS)]);
  }
  // Always sweep the original Chrome process group. The leader can exit before
  // helpers that ignored SIGTERM, and an early return would orphan them.
  terminate(child, 'SIGKILL');
  if (leaderRunning) {
    await Promise.race([closed, wait(TERMINATION_GRACE_MILLISECONDS)]);
  }
}

/**
 * Teardown is deliberately best-effort in sequence, not a short-circuiting
 * `finally`: an error while closing Vite must not retain the authorized source
 * buffer or owner-private Chrome profile. The first cleanup failure remains
 * observable only after every independent cleanup action was attempted.
 */
export async function cleanupRenderedWebglProbeResources(options = {}) {
  let firstFailure;
  const attempt = async (operation) => {
    try {
      await operation();
    } catch (error) {
      firstFailure ??= error;
    }
  };
  await attempt(() => options.devtools?.close());
  await attempt(() => (options.terminate ?? terminateHeadlessChromeProcessGroup)(options.chrome));
  await attempt(() => options.vite?.close());
  await attempt(() => {
    if (options.castleLodVisualSource && options.disposeCastleLodVisualEvidenceSource) {
      options.disposeCastleLodVisualEvidenceSource(options.castleLodVisualSource);
    }
  });
  await attempt(() => options.removeProfile?.());
  if (firstFailure) throw firstFailure;
}

/**
 * Middleware-mode Vite leaves the owner-created HTTP server responsible for
 * upgraded HMR sockets. Node's `closeAllConnections()` deliberately excludes
 * those sockets, so retain and destroy every accepted socket before awaiting
 * the listener close. This is deterministic teardown, not a timeout: any
 * socket that could keep the local-only server alive is explicitly closed.
 */
export async function closeRenderedWebglLoopbackServer(options = {}) {
  const httpServer = options.httpServer;
  const vite = options.vite;
  const sockets = options.sockets;
  if (
    !httpServer
    || typeof httpServer.close !== 'function'
    || typeof httpServer.closeAllConnections !== 'function'
    || !vite
    || typeof vite.close !== 'function'
    || !sockets
    || typeof sockets[Symbol.iterator] !== 'function'
  ) throw new TypeError('Invalid rendered WebGL loopback server teardown.');

  const failures = [];
  const closedHttpServer = new Promise((resolveClose, rejectClose) => {
    try {
      httpServer.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    } catch (error) {
      rejectClose(error);
    }
  });
  try {
    httpServer.closeAllConnections();
  } catch (error) {
    failures.push(error);
  }
  for (const socket of sockets) {
    try {
      if (!socket || typeof socket.destroy !== 'function') {
        throw new TypeError('Invalid rendered WebGL loopback socket.');
      }
      socket.destroy();
    } catch (error) {
      failures.push(error);
    }
  }
  const closed = await Promise.allSettled([
    closedHttpServer,
    Promise.resolve().then(() => vite.close()),
  ]);
  for (const result of closed) {
    if (result.status === 'rejected') failures.push(result.reason);
  }
  if (failures.length > 0) throw failures[0];
}

async function createLoopbackViteServer(runtimeDirectory, localQaPlugins = []) {
  const privateRuntime = exactPrivateDirectory(runtimeDirectory);
  if (!Array.isArray(localQaPlugins) || localQaPlugins.some((plugin) => (
    plugin === null || typeof plugin !== 'object' || typeof plugin.name !== 'string'
  ))) throw new TypeError('Invalid local QA Vite plugin.');
  const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  if (
    packageJson?.name !== 'warpkeep'
    || typeof packageJson.version !== 'string'
    || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(packageJson.version)
  ) throw new Error('Invalid rendered WebGL package contract.');
  let vite;
  let expectedHost;
  const sockets = new Set();
  const httpServer = createHttpServer((request, response) => {
    const remoteAddress = request.socket.remoteAddress;
    if (
      !['127.0.0.1', '::ffff:127.0.0.1'].includes(remoteAddress ?? '')
      || request.headers.host !== expectedHost
      || !['GET', 'HEAD'].includes(request.method ?? '')
      || typeof request.url !== 'string'
      || request.url.startsWith('//')
    ) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden\n');
      return;
    }
    if (!vite) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Unavailable\n');
      return;
    }
    vite.middlewares(request, response, () => {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not Found\n');
    });
  });
  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  httpServer.on('upgrade', (request, socket) => {
    if (
      !['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
      || request.headers.host !== expectedHost
    ) socket.destroy();
  });
  httpServer.maxHeadersCount = 32;
  httpServer.headersTimeout = 5_000;
  httpServer.requestTimeout = CASE_TIMEOUT_MILLISECONDS;
  await new Promise((resolveListen, rejectListen) => {
    const failed = (error) => {
      httpServer.off('listening', listening);
      rejectListen(error);
    };
    const listening = () => {
      httpServer.off('error', failed);
      resolveListen();
    };
    httpServer.once('error', failed);
    httpServer.once('listening', listening);
    httpServer.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  });
  const address = httpServer.address();
  if (address === null || typeof address === 'string' || address.address !== '127.0.0.1') {
    await closeRenderedWebglLoopbackServer({
      httpServer,
      sockets,
      vite: { close: () => undefined },
    });
    throw new Error('Vite did not bind the exact loopback interface.');
  }
  expectedHost = `127.0.0.1:${exactPort(address.port)}`;
  try {
    const [viteModule, reactPluginModule] = await Promise.all([
      import('vite'),
      import('@vitejs/plugin-react'),
    ]);
    const createViteServer = viteModule.createServer;
    const reactPlugin = reactPluginModule.default;
    vite = await createViteServer({
      root: REPOSITORY_ROOT,
      cacheDir: join(privateRuntime, 'vite-cache'),
      configFile: false,
      envFile: false,
      plugins: [warpkeepLocalPublicBoundaryPlugin(), reactPlugin(), ...localQaPlugins],
      define: {
        __WARPKEEP_LOCAL_QA__: 'true',
        __WARPKEEP_PRODUCT_VERSION__: JSON.stringify(packageJson.version),
      },
      appType: 'spa',
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        middlewareMode: true,
        port: address.port,
        strictPort: true,
        fs: {
          strict: true,
          allow: [REPOSITORY_ROOT],
          // The visual-evidence lane has one explicit in-memory source route.
          // Never let Vite's generic /@fs path expose the cached source archive
          // (or any other asset cache) merely because the repository root is
          // otherwise available to local development module resolution.
          deny: RENDERED_WEBGL_QA_VITE_FS_DENY,
        },
        hmr: {
          clientPort: address.port,
          host: '127.0.0.1',
          port: address.port,
          server: httpServer,
        },
      },
    });
  } catch (error) {
    await closeRenderedWebglLoopbackServer({
      httpServer,
      sockets,
      vite: vite ?? { close: () => undefined },
    });
    throw error;
  }
  return Object.freeze({
    port: address.port,
    async close() {
      await closeRenderedWebglLoopbackServer({ httpServer, sockets, vite });
    },
  });
}

const READ_DOM_EXPRESSION = `(() => {
  const labelMaximumAnchorDisplacement = ${RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS};
  const clusterMaximumAnchorDisplacement = ${RENDERED_WEBGL_QA_CLUSTER_MAX_ANCHOR_DISPLACEMENT_PIXELS};
  const labelCoordinateSerializationEpsilon = ${RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS};
  const labelAngleToleranceRadians = ${RENDERED_WEBGL_QA_LABEL_ANGLE_TOLERANCE_RADIANS};
  const placementBindingTolerancePixels = 1;
  const minimumIdentityFontPixels = 12;
  const minimumIdentityEffectiveOpacity = 0.9;
  const overlay = document.querySelector('[data-rendered-webgl-status]');
  const map = document.querySelector('.realm-map-screen');
  const canvas = map?.querySelector('canvas');
  const integer = (value) => /^\\d+$/.test(value ?? '') ? Number(value) : null;
  const exactBoolean = (value) => value === 'true' ? true : value === 'false' ? false : null;
  const rect = (element) => element.getBoundingClientRect();
  const mapRect = map ? rect(map) : null;
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const bounds = rect(element);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0
      && bounds.width > 0
      && bounds.height > 0;
  };
  const cssUnitNumber = (element, property, unit) => {
    const value = getComputedStyle(element).getPropertyValue(property).trim();
    if (!value.endsWith(unit)) return Number.NaN;
    const parsed = Number(value.slice(0, -unit.length));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  const normalizedAngleDifference = (left, right) => Math.abs(Math.atan2(
    Math.sin(left - right),
    Math.cos(left - right)
  ));
  const effectiveOpacity = (element) => {
    let opacity = 1;
    let current = element;
    while (current instanceof Element) {
      const parsed = Number(getComputedStyle(current).opacity || '1');
      if (!Number.isFinite(parsed)) return 0;
      opacity *= parsed;
      if (current === map) break;
      current = current.parentElement;
    }
    return opacity;
  };
  const textColourVisible = (style) => {
    const colour = String(style.color || '').replace(/\\s+/g, '').toLowerCase();
    const fill = String(style.webkitTextFillColor || style.color || '')
      .replace(/\\s+/g, '')
      .toLowerCase();
    const transparent = (value) => value === 'transparent'
      || value === 'rgba(0,0,0,0)';
    return !transparent(colour) && !transparent(fill);
  };
  const identityPresentationValid = (control, selector) => {
    const identities = control.querySelectorAll(selector);
    if (identities.length !== 1) return false;
    const identity = identities[0];
    if (!(identity instanceof HTMLElement) || !visible(identity)) return false;
    const controlBounds = rect(control);
    const identityBounds = rect(identity);
    const style = getComputedStyle(identity);
    const fontSize = Number.parseFloat(style.fontSize);
    return (identity.textContent ?? '').trim().length > 0
      && Number.isFinite(fontSize)
      && fontSize >= minimumIdentityFontPixels
      && identityBounds.width > 0
      && identityBounds.height >= fontSize - placementBindingTolerancePixels
      && identityBounds.left >= controlBounds.left - placementBindingTolerancePixels
      && identityBounds.top >= controlBounds.top - placementBindingTolerancePixels
      && identityBounds.right <= controlBounds.right + placementBindingTolerancePixels
      && identityBounds.bottom <= controlBounds.bottom + placementBindingTolerancePixels
      && effectiveOpacity(identity) >= minimumIdentityEffectiveOpacity
      && textColourVisible(style);
  };
  const transparentHitSurfaceValid = (control) => {
    const style = getComputedStyle(control);
    const colour = String(style.backgroundColor || '').replace(/\\s+/g, '').toLowerCase();
    const transparent = colour === 'transparent'
      || colour === 'rgba(0,0,0,0)'
      || /rgba\\([^,]+,[^,]+,[^,]+,0(?:\\.0+)?\\)/.test(colour);
    return transparent
      && style.backgroundImage === 'none'
      && Number.parseFloat(style.borderTopWidth) === 0
      && Number.parseFloat(style.borderRightWidth) === 0
      && Number.parseFloat(style.borderBottomWidth) === 0
      && Number.parseFloat(style.borderLeftWidth) === 0;
  };
  const placementBindingValid = (control, xProperty, yProperty, verticalEdge = 'bottom') => {
    if (!mapRect) return false;
    const x = cssUnitNumber(control, xProperty, 'px');
    const y = cssUnitNumber(control, yProperty, 'px');
    const bounds = rect(control);
    const renderedX = (bounds.left + bounds.right) / 2 - mapRect.left;
    const renderedY = (verticalEdge === 'top' ? bounds.top : bounds.bottom) - mapRect.top;
    return Number.isFinite(x)
      && Number.isFinite(y)
      && Math.abs(renderedX - x) <= placementBindingTolerancePixels
      && Math.abs(renderedY - y) <= placementBindingTolerancePixels;
  };
  const interiorHitTestValid = (control, allowWorldLabelContention = false) => {
    const bounds = rect(control);
    const hit = document.elementFromPoint(
      (bounds.left + bounds.right) / 2,
      (bounds.top + bounds.bottom) / 2
    );
    return hit !== null && (
      hit === control
      || control.contains(hit)
      // Direct foundation labels intentionally remain undisplaced. A second
      // label may therefore win the centre point in a dense overview; record
      // that through collision telemetry while still rejecting obstruction by
      // HUD, dialogs, overlays, or unrelated page content.
      || (
        allowWorldLabelContention
        && hit instanceof Element
        && hit.closest('button.realm-castle-label') !== null
      )
    );
  };
  const elementState = (element) => !element ? 'absent' : visible(element) ? 'visible' : 'hidden';
  const overlaps = (left, right) => left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
  const allLabels = [...document.querySelectorAll('button.realm-castle-label')];
  const labels = allLabels.filter(visible);
  const labelRects = labels.map(rect);
  const focusedReadableLabels = labels.filter((label) => (
    label.getAttribute('data-focused') === 'true'
    && (label.textContent ?? '').trim().length > 0
  ));
  const clusters = [...document.querySelectorAll('[data-realm-castle-cluster]')].filter(visible);
  const accessibleClusters = clusters.filter((cluster) => (
    cluster instanceof HTMLButtonElement
    && !cluster.disabled
    && cluster.tabIndex >= 0
    && (cluster.getAttribute('aria-label') ?? '').trim().length > 0
    && (integer(cluster.getAttribute('data-cluster-count')) ?? 0) > 0
  ));
  const clusterRects = clusters.map(rect);
  const activeClusterLeaders = [...document.querySelectorAll('[data-realm-cluster-leader]')]
    .filter((leader) => leader.getAttribute('data-active') === 'true' && visible(leader));
  const validClusterKey = (value) => typeof value === 'string'
    && /^cluster-\\d+-\\d+$/.test(value);
  const activeClusterLeaderKeyList = activeClusterLeaders.map((leader) => (
    leader.getAttribute('data-cluster-key')
  ));
  const displacedClusterKeyList = clusters
    .filter((cluster) => cluster.getAttribute('data-displaced') === 'true')
    .map((cluster) => cluster.getAttribute('data-cluster-key'));
  const activeClusterLeaderKeys = new Set(activeClusterLeaderKeyList.filter(validClusterKey));
  const displacedClusterKeys = new Set(displacedClusterKeyList.filter(validClusterKey));
  const clusterLeaderMismatchCount = activeClusterLeaderKeyList.filter((key) => (
    !validClusterKey(key)
  )).length
    + displacedClusterKeyList.filter((key) => !validClusterKey(key)).length
    + [...displacedClusterKeys].filter((key) => !activeClusterLeaderKeys.has(key)).length
    + [...activeClusterLeaderKeys].filter((key) => !displacedClusterKeys.has(key)).length
    + Math.max(0, activeClusterLeaderKeyList.length - activeClusterLeaderKeys.size)
    + Math.max(0, displacedClusterKeyList.length - displacedClusterKeys.size);
  const clusterMemberCount = clusters.reduce((count, cluster) => (
    count + (integer(cluster.getAttribute('data-cluster-count')) ?? 0)
  ), 0);
  const clusterAttachmentTelemetry = clusters.map((cluster) => {
    const clusterKey = cluster.getAttribute('data-cluster-key');
    const x = cssUnitNumber(cluster, '--realm-castle-cluster-x', 'px');
    const y = cssUnitNumber(cluster, '--realm-castle-cluster-y', 'px');
    const anchorX = cssUnitNumber(cluster, '--realm-castle-anchor-x', 'px');
    const anchorY = cssUnitNumber(cluster, '--realm-castle-anchor-y', 'px');
    const distance = Math.hypot(x - anchorX, y - anchorY);
    const markedDisplaced = cluster.getAttribute('data-displaced') === 'true';
    const matchingLeaders = activeClusterLeaders.filter((leader) => (
      validClusterKey(clusterKey)
      && leader.getAttribute('data-cluster-key') === clusterKey
    ));
    const leader = matchingLeaders[0];
    const expectedAngle = Math.atan2(y - anchorY, x - anchorX);
    const leaderLength = leader
      ? cssUnitNumber(leader, '--realm-castle-leader-length', 'px')
      : Number.NaN;
    const leaderAngle = leader
      ? cssUnitNumber(leader, '--realm-castle-leader-angle', 'rad')
      : Number.NaN;
    const classificationValid = markedDisplaced
      ? distance >= 12 - labelCoordinateSerializationEpsilon
      : distance < 12 + labelCoordinateSerializationEpsilon;
    const connectorValid = markedDisplaced
      ? matchingLeaders.length === 1
        && Math.abs(leaderLength - distance) <= 0.1
        && normalizedAngleDifference(leaderAngle, expectedAngle) <= labelAngleToleranceRadians
      : matchingLeaders.length === 0;
    return {
      distance,
      attachmentValid: validClusterKey(clusterKey)
        && Number.isFinite(distance)
        && distance <= clusterMaximumAnchorDisplacement + labelCoordinateSerializationEpsilon
        && classificationValid
        && connectorValid,
      placementBindingValid: placementBindingValid(
        cluster,
        '--realm-castle-cluster-x',
        '--realm-castle-cluster-y'
      ),
      identityPresentationValid: identityPresentationValid(
        cluster,
        '.realm-castle-cluster__identity'
      ),
      hitTestValid: interiorHitTestValid(cluster)
    };
  });
  const rawClusterMaximumAnchorDisplacement = clusterAttachmentTelemetry.reduce(
    (maximum, entry) => Number.isFinite(entry.distance)
      ? Math.max(maximum, entry.distance)
      : maximum,
    0
  );
  const reportedClusterMaximumAnchorDisplacement = rawClusterMaximumAnchorDisplacement
    > clusterMaximumAnchorDisplacement + labelCoordinateSerializationEpsilon
    ? Math.ceil(rawClusterMaximumAnchorDisplacement)
    : Math.min(clusterMaximumAnchorDisplacement, Math.ceil(rawClusterMaximumAnchorDisplacement));
  const clusterAttachmentViolationCount = clusterAttachmentTelemetry.filter((entry) => (
    !entry.attachmentValid
  )).length;
  const clusterPlacementBindingViolationCount = clusterAttachmentTelemetry.filter((entry) => (
    !entry.placementBindingValid
  )).length;
  const clusterIdentityPresentationViolationCount = clusterAttachmentTelemetry.filter((entry) => (
    !entry.identityPresentationValid
  )).length;
  const clusterHitTestViolationCount = clusterAttachmentTelemetry.filter((entry) => (
    !entry.hitTestValid
  )).length;
  const individualLeaderElements = [...document.querySelectorAll('[data-realm-label-leader]')];
  const labelAttachmentTelemetry = labels.map((label) => {
    const castleId = label.getAttribute('data-castle-id');
    const x = cssUnitNumber(label, '--realm-castle-label-x', 'px');
    const y = cssUnitNumber(label, '--realm-castle-label-y', 'px');
    const anchorX = cssUnitNumber(label, '--realm-castle-anchor-x', 'px');
    const anchorY = cssUnitNumber(label, '--realm-castle-anchor-y', 'px');
    const distance = Math.hypot(x - anchorX, y - anchorY);
    const controlBounds = rect(label);
    return {
      distance,
      attachmentValid: label instanceof HTMLButtonElement
        && !label.disabled
        && label.tabIndex >= -1
        && (label.getAttribute('aria-label') ?? '').trim().length > 0
        && controlBounds.width >= 44
        && controlBounds.height >= 44
        && castleId !== null
        && label.getAttribute('data-anchor') === 'foundation-base'
        && label.getAttribute('data-displaced') === 'false'
        && Number.isFinite(distance)
        && distance <= labelMaximumAnchorDisplacement + labelCoordinateSerializationEpsilon
        && transparentHitSurfaceValid(label),
      placementBindingValid: placementBindingValid(
        label,
        '--realm-castle-label-x',
        '--realm-castle-label-y',
        'top'
      ),
      identityPresentationValid: identityPresentationValid(
        label,
        '.realm-castle-label__identity'
      ),
      hitTestValid: interiorHitTestValid(label, true)
    };
  });
  const rawLabelMaximumAnchorDisplacement = labelAttachmentTelemetry.reduce(
    (maximum, entry) => Number.isFinite(entry.distance)
      ? Math.max(maximum, entry.distance)
      : maximum,
    0
  );
  const reportedLabelMaximumAnchorDisplacement = rawLabelMaximumAnchorDisplacement
    > labelMaximumAnchorDisplacement + labelCoordinateSerializationEpsilon
    ? Math.ceil(rawLabelMaximumAnchorDisplacement)
    : Math.min(labelMaximumAnchorDisplacement, Math.ceil(rawLabelMaximumAnchorDisplacement));
  const labelAttachmentViolationCount = labelAttachmentTelemetry.filter((entry) => (
    !entry.attachmentValid
  )).length;
  const labelPlacementBindingViolationCount = labelAttachmentTelemetry.filter((entry) => (
    !entry.placementBindingValid
  )).length;
  const labelIdentityPresentationViolationCount = labelAttachmentTelemetry.filter((entry) => (
    !entry.identityPresentationValid
  )).length;
  const labelHitTestViolationCount = labelAttachmentTelemetry.filter((entry) => (
    !entry.hitTestValid
  )).length;
  const labelLeaderMismatchCount = individualLeaderElements.length;
  const reserved = [...document.querySelectorAll(
    '.realm-hud, .castle-inspection, .realm-hud__actions, '
      + '.realm-profile-trigger, .realm-resource-rail, .realm-profile-menu__panel, '
      + '.realm-cell-navigator > button, .realm-cell-navigator__dialog'
  )].filter(visible).map(rect);
  let labelCollisionCount = 0;
  for (let leftIndex = 0; leftIndex < labelRects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < labelRects.length; rightIndex += 1) {
      if (overlaps(labelRects[leftIndex], labelRects[rightIndex])) labelCollisionCount += 1;
    }
  }
  let clusterCollisionCount = 0;
  for (let leftIndex = 0; leftIndex < clusterRects.length; leftIndex += 1) {
    if (labelRects.some((bounds) => overlaps(clusterRects[leftIndex], bounds))) {
      clusterCollisionCount += 1;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < clusterRects.length; rightIndex += 1) {
      if (overlaps(clusterRects[leftIndex], clusterRects[rightIndex])) clusterCollisionCount += 1;
    }
  }
  const primaryControls = [...document.querySelectorAll(
    '.realm-hud__actions button, .realm-profile-trigger, '
      + '.realm-profile-menu__panel button, .realm-cell-navigator > button, '
      + '.realm-cell-navigator__dialog button, .realm-cell-navigator__dialog input, '
      + '.realm-cell-navigator__dialog a, '
      + '.castle-inspection button, .castle-inspection a, '
      + '[data-realm-castle-cluster]'
  )].filter(visible);
  const dialog = document.querySelector('.realm-cell-navigator__dialog');
  const inspector = document.querySelector('.castle-inspection');
  const inspectorProfileImage = inspector?.querySelector(
    'canvas[data-profile-image-state]'
  );
  // Water endpoint controls intentionally share some list styling. Count only
  // the semantically named castle list so source/mouth buttons cannot inflate
  // or invalidate the exact 100-castle accessibility gate.
  const exploreCastleButtons = [...document.querySelectorAll(
    '.realm-cell-navigator__castles[aria-label="Founded castles"] > li > button'
  )].filter(visible);
  const exploreAccessibleCastleButtons = exploreCastleButtons.filter((button) => (
    button instanceof HTMLButtonElement
    && !button.disabled
    && button.tabIndex >= 0
    && (button.getAttribute('aria-label') ?? '').trim().length > 0
    && (button.textContent ?? '').trim().length > 0
  ));
  const profileTrigger = document.querySelector('.realm-profile-trigger');
  const resourceRail = document.querySelector('.realm-resource-rail');
  const resourceItems = [...(resourceRail?.querySelectorAll('li') ?? [])];
  const undersizedPrimaryControls = primaryControls.filter((control) => {
    const bounds = rect(control);
    return bounds.width < 44 || bounds.height < 44;
  });
  return {
    href: location.href,
    status: overlay?.getAttribute('data-rendered-webgl-status') ?? null,
    readyOverlayVisible: visible(overlay),
    renderer: overlay?.getAttribute('data-renderer') ?? null,
    mapRenderer: map?.getAttribute('data-renderer') ?? null,
    fixture: overlay?.getAttribute('data-fixture') ?? null,
    presentationMode: overlay?.getAttribute('data-presentation-mode') ?? null,
    mapPresentationMode: map?.getAttribute('data-presentation-mode') ?? null,
    quality: overlay?.getAttribute('data-quality') ?? null,
    castleCount: integer(overlay?.getAttribute('data-castle-count')),
    readyAfterMilliseconds: integer(overlay?.getAttribute('data-ready-after-ms')),
    environmentLighting: canvas?.getAttribute('data-environment-lighting') ?? null,
    forestDecorativeTreeCount: integer(
      map?.getAttribute('data-forest-decorative-tree-count')
    ),
    forestDecorativeTriangleCount: integer(
      map?.getAttribute('data-forest-decorative-triangle-count')
    ),
    forestDecorativeDrawCalls: integer(
      map?.getAttribute('data-forest-decorative-draw-calls')
    ),
    forestDecorativeCacheEntries: integer(
      map?.getAttribute('data-forest-decorative-cache-entries')
    ),
    forestDecorativeCacheHighWaterMark: integer(
      map?.getAttribute('data-forest-decorative-cache-high-water-mark')
    ),
    forestDecorativeModelReady: exactBoolean(
      map?.getAttribute('data-forest-decorative-model-ready')
    ),
    forestDecorativeUsingFallback: exactBoolean(
      map?.getAttribute('data-forest-decorative-using-fallback')
    ),
    forestDecorativeOverviewHidden: exactBoolean(
      map?.getAttribute('data-forest-decorative-overview-hidden')
    ),
    semanticTerrainCellCount: integer(map?.getAttribute('data-semantic-terrain-cell-count')),
    semanticTerrainKindCount: integer(map?.getAttribute('data-semantic-terrain-kind-count')),
    semanticTerrainFeatureCount: integer(map?.getAttribute('data-semantic-terrain-feature-count')),
    semanticTerrainFeatureDrawCalls: integer(
      map?.getAttribute('data-semantic-terrain-feature-draw-calls')
    ),
    totalTerrainDetailInstanceCount: integer(
      map?.getAttribute('data-total-terrain-detail-instance-count')
    ),
    totalTerrainDetailDrawCalls: integer(
      map?.getAttribute('data-total-terrain-detail-draw-calls')
    ),
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    documentWidth: Math.max(
      document.documentElement?.scrollWidth ?? 0,
      document.body?.scrollWidth ?? 0
    ),
    mapViewportCovered: Boolean(mapRect)
      && mapRect.left >= -1
      && mapRect.top >= -1
      && mapRect.right <= innerWidth + 1
      && mapRect.bottom <= innerHeight + 1
      && mapRect.width >= innerWidth - 1
      && mapRect.height >= innerHeight - 1,
    interactionState: visible(inspector)
      ? 'inspector'
      : visible(dialog)
        ? 'explore'
        : 'default',
    inspectorProfileImageState: inspectorProfileImage instanceof HTMLCanvasElement
      ? inspectorProfileImage.getAttribute('data-profile-image-state')
      : 'absent',
    individualCastleCount: integer(map?.getAttribute('data-individual-castle-count')),
    presentedModelCount: integer(map?.getAttribute('data-presented-model-count')),
    presentedLandscapeBaseCount: integer(
      map?.getAttribute('data-presented-landscape-base-count')
    ),
    raycastTargetCount: integer(map?.getAttribute('data-raycast-target-count')),
    labelCount: labels.length,
    labelCullReasons: map?.getAttribute('data-label-cull-reasons') ?? '',
    labelEligibleCount: integer(map?.getAttribute('data-label-eligible-count')),
    labelClusteredCount: integer(map?.getAttribute('data-label-clustered-count')),
    labelClusterOverflowCount: integer(map?.getAttribute('data-label-cluster-overflow-count')),
    labelAccountingValid: map?.getAttribute('data-label-accounting-valid') === 'true',
    labelMissingIdentityCount: integer(map?.getAttribute('data-label-missing-identity-count')),
    labelPlacedCount: integer(map?.getAttribute('data-label-placed-count')),
    labelUnplacedCount: integer(map?.getAttribute('data-label-unplaced-count')),
    labelsTextBearingCount: labels.filter((label) => (label.textContent ?? '').trim().length > 0).length,
    focusedReadableLabelCount: focusedReadableLabels.length,
    focusedReadableLabelDomFocusCount: focusedReadableLabels.filter((label) => (
      document.activeElement === label
    )).length,
    hiddenFocusedLabelCount: document.activeElement instanceof HTMLButtonElement
      && document.activeElement.classList.contains('realm-castle-label')
      && !visible(document.activeElement) ? 1 : 0,
    tabbableLabelCount: labels.filter((label) => label.tabIndex === 0).length,
    labelsWithinViewportCount: labelRects.filter((bounds) => (
      bounds.left >= -1
      && bounds.top >= -1
      && bounds.right <= innerWidth + 1
      && bounds.bottom <= innerHeight + 1
    )).length,
    labelCollisionCount,
    labelAttachmentViolationCount,
    labelPlacementBindingViolationCount,
    labelIdentityPresentationViolationCount,
    labelHitTestViolationCount,
    labelLeaderMismatchCount,
    labelMaximumAnchorDisplacement: reportedLabelMaximumAnchorDisplacement,
    labelReservedOverlapCount: labelRects.reduce((count, bounds) => (
      count + (reserved.some((reservedBounds) => overlaps(bounds, reservedBounds)) ? 1 : 0)
    ), 0),
    clusterButtonCount: clusters.length,
    accessibleClusterButtonCount: accessibleClusters.length,
    clusterRepresentativeAnchorViolationCount: integer(
      map?.getAttribute('data-cluster-representative-anchor-violation-count')
    ),
    clusterCastleOverlapCount: integer(
      map?.getAttribute('data-cluster-castle-overlap-count')
    ),
    clusterMemberDistanceViolationCount: integer(
      map?.getAttribute('data-cluster-member-distance-violation-count')
    ),
    clusterAttachmentViolationCount,
    clusterPlacementBindingViolationCount,
    clusterIdentityPresentationViolationCount,
    clusterHitTestViolationCount,
    clusterLeaderMismatchCount,
    clusterMaximumAnchorDisplacement: reportedClusterMaximumAnchorDisplacement,
    clusterMemberCount,
    clustersWithinViewportCount: clusterRects.filter((bounds) => (
      bounds.left >= -1
      && bounds.top >= -1
      && bounds.right <= innerWidth + 1
      && bounds.bottom <= innerHeight + 1
    )).length,
    clusterCollisionCount,
    clusterReservedOverlapCount: clusterRects.reduce((count, bounds) => (
      count + (reserved.some((reservedBounds) => overlaps(bounds, reservedBounds)) ? 1 : 0)
    ), 0),
    exploreCastleCount: exploreCastleButtons.length,
    exploreAccessibleCastleCount: exploreAccessibleCastleButtons.length,
    directExploreControlState: elementState(document.querySelector(
      '.realm-cell-navigator > button'
    )),
    legacyPlayerActionCount: document.querySelectorAll(
      'button[aria-label="Recenter Keep"], button[aria-label="Return to Menu"]'
    ).length,
    profileMenuState: elementState(document.querySelector('.realm-profile-menu__panel')),
    profileTriggerAvatarCount: profileTrigger?.querySelectorAll('.realm-castle-avatar').length ?? 0,
    profileTriggerCount: document.querySelectorAll('.realm-profile-trigger').length,
    profileTriggerState: elementState(profileTrigger),
    profileTriggerTextBearingCount: profileTrigger
      ? [...profileTrigger.childNodes].filter((node) => (
          node.nodeType === Node.TEXT_NODE
            ? (node.textContent ?? '').trim().length > 0
            : node instanceof Element && !node.classList.contains('realm-castle-avatar')
        )).length
      : 0,
    resourceIconCount: resourceItems.filter((item) => (
      item.querySelectorAll('img').length === 1
    )).length,
    resourceItemCount: resourceItems.length,
    resourceRailCount: document.querySelectorAll('.realm-resource-rail').length,
    resourceRailState: elementState(resourceRail),
    resourceZeroValueCount: resourceItems.filter((item) => (
      (item.querySelector('strong')?.textContent ?? '').trim() === '0'
    )).length,
    observerBadgeState: elementState(document.querySelector('.realm-observer-hud')),
    closeQaObserverControlState: elementState(document.querySelector(
      'button[aria-label="Close QA Observer"]'
    )),
    undersizedPrimaryControlCount: undersizedPrimaryControls.length,
    undersizedPrimaryControlKinds: undersizedPrimaryControls.map((control) => {
      const bounds = rect(control);
      const className = typeof control.className === 'string' && control.className
        ? '.' + control.className.trim().replace(/\\s+/g, '.')
        : '';
      return control.tagName.toLowerCase() + className
        + ':' + Math.round(bounds.width) + 'x' + Math.round(bounds.height);
    }),
  };
})()`;

async function readRenderedCaseDom(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: READ_DOM_EXPRESSION,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || !evaluation?.result || evaluation.result.type !== 'object') {
    throw new Error('Headless browser DOM evaluation failed.');
  }
  return evaluation.result.value;
}

async function waitForAcceptedRenderedDom(session, expected, state) {
  const deadline = Date.now() + CASE_TIMEOUT_MILLISECONDS;
  let readySeenAt;
  let lastContractError;
  let lastPresentationAggregate = '';
  while (Date.now() < deadline) {
    if (state.violation) {
      throw new Error(`Headless browser left the local QA boundary: ${state.violation}.`);
    }
    const value = await readRenderedCaseDom(session);
    if (value?.href === expected.url) {
      if (['fallback', 'error', 'closed'].includes(value.status)) {
        throw new Error('Rendered WebGL QA failed closed.');
      }
      if (value.status === 'ready') {
        readySeenAt ??= Date.now();
        const cullAggregate = validLabelCullReasonAggregate(value.labelCullReasons)
          ? value.labelCullReasons
          : 'invalid';
        lastPresentationAggregate = [
          `interaction=${String(value.interactionState)}`,
          `labels=${String(value.labelCount)}`,
          `culls=${cullAggregate}`,
          `clusters=${String(value.clusterButtonCount)}`,
          `overflow=${String(value.labelClusterOverflowCount)}`,
          `portrait=${String(value.inspectorProfileImageState)}`,
          `models=${String(value.presentedModelCount)}`,
          `bases=${String(value.presentedLandscapeBaseCount)}`,
          `terrainKinds=${String(value.semanticTerrainKindCount)}`,
          `terrainFeatures=${String(value.semanticTerrainFeatureCount)}`,
          `forestTrees=${String(value.forestDecorativeTreeCount)}`,
          `forestTriangles=${String(value.forestDecorativeTriangleCount)}`,
          `forestDraws=${String(value.forestDecorativeDrawCalls)}`,
          `exploreCastles=${String(value.exploreCastleCount)}`,
          `exploreAccessible=${String(value.exploreAccessibleCastleCount)}`
        ].join(',');
        try {
          parseRenderedWebglBrowserDom(value, expected);
          return value;
        } catch (error) {
          lastContractError = error;
          // Camera projection, direct-label coordinates, and responsive UI
          // settle asynchronously.
          // Continue until the complete visual contract is simultaneously true.
        }
        if (Date.now() - readySeenAt >= PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS) {
          const suffix = lastContractError instanceof Error ? ` ${lastContractError.message}` : '';
          throw new Error(
            `Rendered WebGL presentation contract did not settle.${suffix} (${lastPresentationAggregate})`
          );
        }
      }
    }
    await delay(100);
  }
  throw new Error('Rendered WebGL QA case timed out.');
}

async function waitForAcceptedActiveForestDom(session, expected, state) {
  const deadline = Date.now() + CASE_TIMEOUT_MILLISECONDS;
  let lastContractError;
  let lastPresentationAggregate = '';
  while (Date.now() < deadline) {
    if (state.violation) {
      throw new Error(`Headless browser left the local QA boundary: ${state.violation}.`);
    }
    const value = await readRenderedCaseDom(session);
    if (value?.href === expected.url) {
      if (['fallback', 'error', 'closed'].includes(value.status)) {
        throw new Error('Rendered WebGL QA failed closed.');
      }
      if (value.status === 'ready') {
        lastPresentationAggregate = [
          `forestHidden=${String(value.forestDecorativeOverviewHidden)}`,
          `forestTrees=${String(value.forestDecorativeTreeCount)}`,
          `forestTriangles=${String(value.forestDecorativeTriangleCount)}`,
          `forestDraws=${String(value.forestDecorativeDrawCalls)}`,
          `forestCache=${String(value.forestDecorativeCacheEntries)}`,
          `forestCacheHighWater=${String(value.forestDecorativeCacheHighWaterMark)}`,
          `forestModel=${String(value.forestDecorativeModelReady)}`,
          `forestFallback=${String(value.forestDecorativeUsingFallback)}`,
        ].join(',');
        try {
          parseRenderedWebglActiveForestDom(value, expected);
          return value;
        } catch (error) {
          lastContractError = error;
        }
      }
    }
    await delay(100);
  }
  const suffix = lastContractError instanceof Error ? ` ${lastContractError.message}` : '';
  throw new Error(
    `Rendered WebGL active forest contract did not settle.${suffix} `
      + `(${lastPresentationAggregate || 'no-active-forest-observation'})`
  );
}

async function captureRenderedCasePixels(session, viewport) {
  const result = await session.command('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  });
  if (
    typeof result?.data !== 'string'
    || result.data.length > Math.ceil(SCREENSHOT_MAXIMUM_BYTES * 4 / 3) + 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data)
  ) throw new Error('Headless browser screenshot failed.');
  const screenshotBytes = Buffer.from(result.data, 'base64');
  try {
    analyzeRenderedWebglPngScreenshot(screenshotBytes, viewport);
  } finally {
    screenshotBytes.fill(0);
  }
}

async function readRenderedWebglCastleCanvasPointerTarget(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('.realm-map-screen__canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const bounds = canvas.getBoundingClientRect();
      const depth = ${RENDERED_WEBGL_QA_CASTLE_POINTER_DEPTH_PIXELS};
      const moveOffsets = ${JSON.stringify(RENDERED_WEBGL_QA_CASTLE_POINTER_MOVE_OFFSETS)};
      const insideCanvas = (x, y) => (
        Number.isFinite(x)
        && Number.isFinite(y)
        && x >= bounds.left + 1
        && y >= bounds.top + 1
        && x <= bounds.right - 1
        && y <= bounds.bottom - 1
        && document.elementFromPoint(x, y) === canvas
      );
      const centreX = (bounds.left + bounds.right) * 0.5;
      const centreY = (bounds.top + bounds.bottom) * 0.5;
      const candidates = [...document.querySelectorAll('button.realm-castle-label')]
        .map((label) => {
          const style = getComputedStyle(label);
          const anchorX = Number.parseFloat(style.getPropertyValue('--realm-castle-anchor-x'));
          const anchorY = Number.parseFloat(style.getPropertyValue('--realm-castle-anchor-y'));
          const x = bounds.left + anchorX;
          const y = bounds.top + anchorY - depth;
          return {
            x,
            y,
            centreDistance: Math.hypot(x - centreX, y - centreY),
          };
        })
        .filter((candidate) => (
          insideCanvas(candidate.x, candidate.y)
          && moveOffsets.every((offset) => insideCanvas(
            candidate.x + offset.x,
            candidate.y + offset.y
          ))
        ))
        .sort((left, right) => left.centreDistance - right.centreDistance);
      const target = candidates[0];
      return target ? {
        x: Math.round(target.x * 100) / 100,
        y: Math.round(target.y * 100) / 100,
      } : null;
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL canvas pointer target evaluation failed.');
  }
  return parseRenderedWebglCastleCanvasPointerTarget(evaluation.result.value);
}

async function readRenderedWebglCastlePointerMoveState(session, target) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('.realm-map-screen__canvas');
      const map = document.querySelector('.realm-map-screen');
      return {
        canvasTarget: canvas instanceof HTMLCanvasElement
          && document.elementFromPoint(${target.x}, ${target.y}) === canvas,
        dragging: canvas?.getAttribute('data-dragging') === 'true',
        inspectorOpen: document.querySelector('.castle-inspection') !== null,
        navigatorOpen: document.querySelector('.realm-cell-navigator__dialog') !== null,
        renderer: map?.getAttribute('data-renderer') ?? null,
        selectedCastleLabelCount: document.querySelectorAll(
          'button.realm-castle-label[aria-pressed="true"]'
        ).length,
      };
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL canvas pointer state evaluation failed.');
  }
  return parseRenderedWebglCastlePointerMoveState(evaluation.result.value);
}

/**
 * Replays a short real-pointer path entirely on the WebGL canvas, verifies
 * that hover processing did not open or select a UI surface, then activates
 * the rendered castle with one normal pointer press/release pair.
 */
export async function applyRenderedWebglCastleCanvasInteraction(session) {
  const target = await readRenderedWebglCastleCanvasPointerTarget(session);
  for (const offset of RENDERED_WEBGL_QA_CASTLE_POINTER_MOVE_OFFSETS) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: target.x + offset.x,
      y: target.y + offset.y,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
  }
  try {
    await readRenderedWebglCastlePointerMoveState(session, target);
  } catch {
    throw new Error('Rendered WebGL QA pointer-move UI churn.');
  }
  await session.command('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: target.x,
    y: target.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
  });
  await session.command('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: target.x,
    y: target.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
  });
  return Object.freeze({
    pointerMoveCount: RENDERED_WEBGL_QA_CASTLE_POINTER_MOVE_OFFSETS.length,
  });
}

/**
 * Move from the strategic overview into a deterministic close-camera state by
 * replaying bounded ordinary wheel input on a point already proven to belong
 * to the WebGL canvas. No camera coordinates or world identity leave the page.
 */
export async function applyRenderedWebglActiveForestCameraInteraction(session) {
  const target = await readRenderedWebglCastleCanvasPointerTarget(session);
  for (
    let step = 0;
    step < RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_STEPS;
    step += 1
  ) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: target.x,
      y: target.y,
      deltaX: 0,
      deltaY: RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_DELTA,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
  }
  return Object.freeze({
    wheelStepCount: RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_STEPS,
  });
}

/**
 * Exercises the exact player-facing failure lane: acquire a drag directly on a
 * castle label, cross the threshold in small increments, release without
 * activating the label, then wheel over a current direct label. Page-local
 * coordinate aggregates prove both camera changes even if projection updates
 * remount or cull an individual label between animation frames.
 */
export async function applyRenderedWebglMapGestureInteraction(session) {
  const initialTargetEvaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.realm-map-screen');
      const canvas = document.querySelector('.realm-map-screen__canvas');
      if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return null;
      const mapBounds = root.getBoundingClientRect();
      const position = (label) => {
        const style = getComputedStyle(label);
        return {
          x: Number.parseFloat(style.getPropertyValue('--realm-castle-label-x')),
          y: Number.parseFloat(style.getPropertyValue('--realm-castle-label-y')),
        };
      };
      const labels = [...document.querySelectorAll('button.realm-castle-label')].filter((label) => {
        if (!(label instanceof HTMLButtonElement) || label.disabled) return false;
        const bounds = label.getBoundingClientRect();
        const x = bounds.left + bounds.width * 0.5;
        const y = bounds.top + bounds.height * 0.5;
        const hit = document.elementFromPoint(x, y);
        const projected = position(label);
        return label.contains(hit)
          && Number.isFinite(projected.x)
          && Number.isFinite(projected.y)
          && x + ${RENDERED_WEBGL_QA_MAP_DRAG_OFFSETS.at(-1).x} < mapBounds.right - 2
          && y + ${RENDERED_WEBGL_QA_MAP_DRAG_OFFSETS.at(-1).y} < mapBounds.bottom - 2;
      });
      const centreX = (mapBounds.left + mapBounds.right) * 0.5;
      const centreY = (mapBounds.top + mapBounds.bottom) * 0.5;
      labels.sort((left, right) => {
        const leftBounds = left.getBoundingClientRect();
        const rightBounds = right.getBoundingClientRect();
        return Math.hypot(
          leftBounds.left + leftBounds.width * 0.5 - centreX,
          leftBounds.top + leftBounds.height * 0.5 - centreY
        ) - Math.hypot(
          rightBounds.left + rightBounds.width * 0.5 - centreX,
          rightBounds.top + rightBounds.height * 0.5 - centreY
        );
      });
      const label = labels[0];
      if (!(label instanceof HTMLButtonElement) || labels.length < 2) return null;
      const labelBounds = label.getBoundingClientRect();
      const labelCentre = {
        x: labelBounds.left + labelBounds.width * 0.5,
        y: labelBounds.top + labelBounds.height * 0.5,
      };
      const labelStartPositions = Object.fromEntries(labels.flatMap((candidate) => {
        const id = candidate.getAttribute('data-castle-id');
        const projected = position(candidate);
        return id && Number.isFinite(projected.x) && Number.isFinite(projected.y)
          ? [[id, projected]]
          : [];
      }));
      globalThis.__warpkeepRenderedMapGesture = {
        canvas,
        dragMoved: false,
        inputClean: false,
        settled: false,
        labelStartPositions,
        root,
        uiStable: false,
        wheelStartPositions: null,
      };
      return {
        x: Math.round(labelCentre.x * 100) / 100,
        y: Math.round(labelCentre.y * 100) / 100,
      };
    })()`,
    returnByValue: true,
  });
  if (
    initialTargetEvaluation?.exceptionDetails
    || initialTargetEvaluation?.result?.type !== 'object'
  ) throw new Error('Rendered WebGL map gesture target evaluation failed.');
  const initialTarget = parseRenderedWebglCastleCanvasPointerTarget(
    initialTargetEvaluation.result.value
  );

  await session.command('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: initialTarget.x,
    y: initialTarget.y,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });
  await session.command('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: initialTarget.x,
    y: initialTarget.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
  });
  for (const offset of RENDERED_WEBGL_QA_MAP_DRAG_OFFSETS) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: initialTarget.x + offset.x,
      y: initialTarget.y + offset.y,
      button: 'left',
      buttons: 1,
      pointerType: 'mouse',
    });
  }
  const dragEnd = RENDERED_WEBGL_QA_MAP_DRAG_OFFSETS.at(-1);
  await session.command('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: initialTarget.x + dragEnd.x,
    y: initialTarget.y + dragEnd.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
  });

  const wheelTargetEvaluation = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const state = globalThis.__warpkeepRenderedMapGesture;
      if (!state) return null;
      const position = (label) => {
        const style = getComputedStyle(label);
        return {
          x: Number.parseFloat(style.getPropertyValue('--realm-castle-label-x')),
          y: Number.parseFloat(style.getPropertyValue('--realm-castle-label-y')),
        };
      };
      const currentLabels = [...document.querySelectorAll('button.realm-castle-label')]
        .filter((label) => {
          if (!(label instanceof HTMLButtonElement) || label.disabled) return false;
          const bounds = label.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.left + bounds.width * 0.5,
            bounds.top + bounds.height * 0.5
          );
          const projected = position(label);
          return label.contains(hit)
            && Number.isFinite(projected.x)
            && Number.isFinite(projected.y);
        });
      if (currentLabels.length < 2) return null;
      const currentPositions = Object.fromEntries(currentLabels.flatMap((label) => {
        const id = label.getAttribute('data-castle-id');
        return id ? [[id, position(label)]] : [];
      }));
      const maximumDisplacement = (before, after) => {
        let maximum = -1;
        for (const [id, point] of Object.entries(after)) {
          const prior = before?.[id];
          if (!prior) continue;
          maximum = Math.max(maximum, Math.hypot(point.x - prior.x, point.y - prior.y));
        }
        return maximum;
      };
      state.dragMoved = maximumDisplacement(state.labelStartPositions, currentPositions) >= 4;
      state.inputClean = state.canvas.getAttribute('data-dragging') !== 'true'
        && !state.root.hasAttribute('data-camera-interacting');
      state.uiStable = document.querySelector('.castle-inspection') === null
        && document.querySelector('.realm-cell-navigator__dialog') === null
        && state.root.getAttribute('data-renderer') === 'webgl';
      state.wheelStartPositions = currentPositions;
      const mapBounds = state.root.getBoundingClientRect();
      currentLabels.sort((left, right) => {
        const leftBounds = left.getBoundingClientRect();
        const rightBounds = right.getBoundingClientRect();
        return Math.hypot(
          leftBounds.left + leftBounds.width * 0.5 - (mapBounds.left + mapBounds.width * 0.5),
          leftBounds.top + leftBounds.height * 0.5 - (mapBounds.top + mapBounds.height * 0.5)
        ) - Math.hypot(
          rightBounds.left + rightBounds.width * 0.5 - (mapBounds.left + mapBounds.width * 0.5),
          rightBounds.top + rightBounds.height * 0.5 - (mapBounds.top + mapBounds.height * 0.5)
        );
      });
      const bounds = currentLabels[0].getBoundingClientRect();
      return {
        x: Math.round((bounds.left + bounds.width * 0.5) * 100) / 100,
        y: Math.round((bounds.top + bounds.height * 0.5) * 100) / 100,
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (
    wheelTargetEvaluation?.exceptionDetails
    || wheelTargetEvaluation?.result?.type !== 'object'
  ) throw new Error('Rendered WebGL map wheel target evaluation failed.');
  const wheelTarget = parseRenderedWebglCastleCanvasPointerTarget(
    wheelTargetEvaluation.result.value
  );
  await session.command('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: wheelTarget.x,
    y: wheelTarget.y,
    deltaX: 0,
    deltaY: 180,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });

  const evidenceEvaluation = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const state = globalThis.__warpkeepRenderedMapGesture;
      const failed = {
        dragMoved: false,
        inputClean: false,
        uiStable: false,
        wheelMoved: false,
      };
      if (!state) return failed;
      const position = (label) => {
        const style = getComputedStyle(label);
        return {
          x: Number.parseFloat(style.getPropertyValue('--realm-castle-label-x')),
          y: Number.parseFloat(style.getPropertyValue('--realm-castle-label-y')),
        };
      };
      const readPositions = () => Object.fromEntries(
        [...document.querySelectorAll('button.realm-castle-label')].flatMap((label) => {
          const id = label.getAttribute('data-castle-id');
          const projected = position(label);
          return id && Number.isFinite(projected.x) && Number.isFinite(projected.y)
            ? [[id, projected]]
            : [];
        })
      );
      const maximumDisplacement = (before, after) => {
        let maximum = -1;
        for (const [id, point] of Object.entries(after)) {
          const prior = before?.[id];
          if (!prior) continue;
          maximum = Math.max(maximum, Math.hypot(point.x - prior.x, point.y - prior.y));
        }
        return maximum;
      };
      let positionsAfterWheel = readPositions();
      let stableFrameCount = 0;
      for (let frameIndex = 0; frameIndex < 180 && stableFrameCount < 4; frameIndex += 1) {
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        const nextPositions = readPositions();
        const movement = maximumDisplacement(positionsAfterWheel, nextPositions);
        stableFrameCount = movement >= 0 && movement <= 0.05
          ? stableFrameCount + 1
          : 0;
        positionsAfterWheel = nextPositions;
      }
      const evidence = {
        dragMoved: state.dragMoved === true,
        inputClean: state.inputClean === true
          && state.canvas.getAttribute('data-dragging') !== 'true'
          && !state.root.hasAttribute('data-camera-interacting'),
        settled: stableFrameCount >= 4,
        uiStable: state.uiStable === true
          && document.querySelector('.castle-inspection') === null
          && document.querySelector('.realm-cell-navigator__dialog') === null
          && state.root.getAttribute('data-renderer') === 'webgl',
        wheelMoved: maximumDisplacement(
          state.wheelStartPositions,
          positionsAfterWheel
        ) >= 2,
      };
      delete globalThis.__warpkeepRenderedMapGesture;
      return evidence;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evidenceEvaluation?.exceptionDetails || evidenceEvaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL map gesture evidence evaluation failed.');
  }
  return parseRenderedWebglMapGestureEvidence(evidenceEvaluation.result.value);
}

/**
 * Exercises one available spatial arrow, Home, and End on the real rendered
 * world-label group.
 * All target choice and comparison remains page-local so no identity-bearing
 * value crosses the DevTools boundary.
 */
export async function applyRenderedWebglLabelKeyboardInteraction(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const visible = (element) => {
        if (!(element instanceof HTMLButtonElement) || element.disabled) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width > 0
          && bounds.height > 0;
      };
      const point = (button) => {
        const style = getComputedStyle(button);
        return {
          button,
          x: Number.parseFloat(style.getPropertyValue('--realm-castle-label-x')),
          y: Number.parseFloat(style.getPropertyValue('--realm-castle-label-y')),
        };
      };
      const points = [...document.querySelectorAll('button.realm-castle-label')]
        .filter(visible)
        .map(point)
        .filter((candidate) => Number.isFinite(candidate.x) && Number.isFinite(candidate.y));
      const readingOrder = [...points].sort((left, right) => (
        left.y - right.y || left.x - right.x
      ));
      const singleTabStop = () => points.filter(({ button }) => button.tabIndex === 0).length === 1;
      const start = points.find(({ button }) => button.tabIndex === 0);
      const arrow = start ? [
        { key: 'ArrowRight', available: points.some((other) => other !== start && other.x > start.x + 0.5) },
        { key: 'ArrowLeft', available: points.some((other) => other !== start && other.x < start.x - 0.5) },
        { key: 'ArrowDown', available: points.some((other) => other !== start && other.y > start.y + 0.5) },
        { key: 'ArrowUp', available: points.some((other) => other !== start && other.y < start.y - 0.5) },
      ].find((candidate) => candidate.available) : undefined;
      const dispatch = (button, key) => button.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: key,
        key,
      }));
      if (!start || !arrow || readingOrder.length < 2) return {
        arrowMoved: false,
        endReached: false,
        homeReached: false,
        singleTabStop: false,
      };
      // Start from the application's natural sole tab stop. Focusing it must
      // not manufacture or repair roving state inside the probe.
      const initialSingleTabStop = singleTabStop();
      start.button.focus({ preventScroll: true });
      const naturalStartFocused = document.activeElement === start.button
        && start.button.tabIndex === 0;
      dispatch(start.button, arrow.key);
      const arrowTarget = document.activeElement;
      const arrowMoved = arrowTarget instanceof HTMLButtonElement
        && arrowTarget !== start.button
        && points.some(({ button }) => button === arrowTarget);
      const arrowSingleTabStop = singleTabStop();
      if (arrowTarget instanceof HTMLButtonElement) dispatch(arrowTarget, 'Home');
      const homeReached = document.activeElement === readingOrder[0].button;
      const homeSingleTabStop = singleTabStop();
      if (document.activeElement instanceof HTMLButtonElement) {
        dispatch(document.activeElement, 'End');
      }
      return {
        arrowMoved,
        endReached: document.activeElement === readingOrder.at(-1).button,
        homeReached,
        singleTabStop: initialSingleTabStop && naturalStartFocused && arrowSingleTabStop
          && homeSingleTabStop && singleTabStop(),
      };
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL label keyboard evaluation failed.');
  }
  return parseRenderedWebglLabelKeyboardEvidence(evaluation.result.value);
}

export async function applyRenderedWebglCaseInteraction(
  session,
  interaction,
  presentationMode = 'observer'
) {
  if (interaction === 'default') return Object.freeze({});
  if (presentationMode !== 'observer' && presentationMode !== 'player') {
    throw new Error('Invalid rendered WebGL QA presentation mode.');
  }
  if (interaction === 'explore' && presentationMode === 'player') {
    const evaluation = await session.command('Runtime.evaluate', {
      expression: `(async () => {
        const visible = (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || '1') > 0
            && bounds.width > 0
            && bounds.height > 0;
        };
        const launcher = document.querySelector('.realm-profile-trigger');
        if (!(launcher instanceof HTMLButtonElement) || launcher.disabled || !visible(launcher)) {
          return false;
        }
        launcher.focus({ preventScroll: true });
        launcher.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const panel = document.querySelector('.realm-profile-menu__panel');
        const targets = [...(panel?.querySelectorAll('nav button') ?? [])].filter((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && visible(button)
          && (button.querySelector('strong')?.textContent ?? '').trim() === 'EXPLORE'
        ));
        if (targets.length !== 1) return false;
        targets[0].focus({ preventScroll: true });
        targets[0].click();
        return true;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation?.exceptionDetails || evaluation?.result?.value !== true) {
      throw new Error('Rendered WebGL QA player Explore interaction failed.');
    }
    return Object.freeze({});
  }
  const selector = interaction === 'inspector'
    ? 'button.realm-castle-label'
    : interaction === 'explore'
      ? '.realm-cell-navigator > button'
      : '';
  if (!selector) throw new Error('Invalid rendered WebGL QA interaction.');
  const successfulInteractionEvidence = interaction === 'inspector'
    ? '{ inspectorLabelActivated: true }'
    : 'true';
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width > 0
          && bounds.height > 0;
      };
      const target = [...document.querySelectorAll(${JSON.stringify(selector)})].find((button) => (
        button instanceof HTMLButtonElement
        && !button.disabled
        && button.tabIndex >= 0
        && (button.getAttribute('aria-label') ?? '').trim().length > 0
        && visible(button)
      ));
      if (!(target instanceof HTMLButtonElement)) return false;
      target.focus({ preventScroll: true });
      target.click();
      return ${successfulInteractionEvidence};
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails) {
    throw new Error('Rendered WebGL QA interaction failed.');
  }
  if (interaction === 'inspector') {
    return parseRenderedWebglInspectorLabelActivationEvidence(evaluation?.result?.value);
  }
  if (evaluation?.result?.value !== true) throw new Error('Rendered WebGL QA interaction failed.');
  return Object.freeze({});
}

export async function applyRenderedWebglResourceOccupantInteraction(
  session,
  presentationMode,
  expectedReducedMotion = false
) {
  if (presentationMode !== 'observer' && presentationMode !== 'player') {
    throw new Error('Invalid rendered WebGL QA presentation mode.');
  }
  if (typeof expectedReducedMotion !== 'boolean') {
    throw new Error('Invalid rendered WebGL QA reduced-motion expectation.');
  }
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const expectedMode = ${JSON.stringify(presentationMode)};
      const expectedReducedMotion = ${JSON.stringify(expectedReducedMotion)};
      const waitFor = async (
        predicate,
        timeoutMilliseconds = ${PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS}
      ) => {
        const deadline = performance.now() + timeoutMilliseconds;
        while (performance.now() <= deadline) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return false;
      };
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width >= 32
          && bounds.height >= 32;
      };
      const focusedRecordByKey = Object.freeze({
        'gold:genesis-001-tier1-gold-03': Object.freeze({
          castleLocation: 'q 2 · r -1',
          castleName: 'Synthetic Keep 002',
          rate: '1 gold / minute',
          resourceSite: 'q -51 · r 57',
          title: 'Gold Mine',
          username: '@qa-keep-002'
        }),
        'gold:genesis-001-tier1-gold-11': Object.freeze({
          castleLocation: 'q -1 · r 2',
          castleName: 'Synthetic Keep 003',
          rate: '1 gold / minute',
          resourceSite: 'q 20 · r -22',
          title: 'Gold Mine',
          username: '@qa-keep-003'
        }),
        'food:genesis-001-tier1-food-004': Object.freeze({
          castleLocation: 'q 1 · r -3',
          castleName: 'Synthetic Keep 004',
          rate: '1 food / minute',
          resourceSite: 'q -42 · r 57',
          title: 'Wheat Farm',
          username: '@qa-keep-004'
        }),
        'wood:genesis-001-tier1-wood-033': Object.freeze({
          castleLocation: 'q -2 · r -1',
          castleName: 'Synthetic Keep 005',
          rate: '1 wood / minute',
          resourceSite: 'q -41 · r 48',
          title: 'Logging Camp',
          username: '@qa-keep-005'
        }),
        'stone:genesis-001-tier1-stone-059': Object.freeze({
          castleLocation: 'q -1 · r 2',
          castleName: 'Synthetic Keep 003',
          rate: '1 stone / minute',
          resourceSite: 'q -52 · r 50',
          title: 'Stone Quarry',
          username: '@qa-keep-003'
        })
      });
      const overviewPresenceSelector = [
        '.realm-resource-occupant-presence',
        '[data-resource-kind="gold"]',
        '[data-resource-occupant-key="gold:genesis-001-tier1-gold-11"]'
      ].join('');
      const overviewMarkerSelector = [
        'button.realm-resource-occupant-marker',
        '[data-resource-occupant-source="legacy-expedition"]',
        '[data-resource-kind="gold"]',
        '[data-resource-occupant-key="gold:genesis-001-tier1-gold-11"]'
      ].join('');
      const openExplore = async () => {
        if (expectedMode === 'player') {
          const launcher = document.querySelector('.realm-profile-trigger');
          if (!(launcher instanceof HTMLButtonElement) || launcher.disabled || !visible(launcher)) {
            return false;
          }
          launcher.click();
          if (!await waitFor(() => (
            document.querySelector('.realm-profile-menu__panel') instanceof HTMLElement
          ))) return false;
          const explore = [...document.querySelectorAll(
            '.realm-profile-menu__panel nav button'
          )].find((button) => (
            button instanceof HTMLButtonElement
            && !button.disabled
            && (button.querySelector('strong')?.textContent ?? '').trim() === 'EXPLORE'
          ));
          if (!(explore instanceof HTMLButtonElement)) return false;
          explore.click();
        } else {
          const trigger = document.querySelector('.realm-cell-navigator > button');
          if (!(trigger instanceof HTMLButtonElement) || trigger.disabled || !visible(trigger)) {
            return false;
          }
          trigger.click();
        }
        return waitFor(() => (
          document.querySelector('.realm-cell-navigator__dialog') instanceof HTMLElement
        ));
      };
      const jumpToOccupiedSite = async (q, r) => {
        if (!await openExplore()) return false;
        const form = document.querySelector('.realm-cell-navigator__jump');
        const inputs = form?.querySelectorAll('input');
        if (!(form instanceof HTMLFormElement) || inputs?.length !== 2) return false;
        const setInputValue = (input, value) => {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
          )?.set;
          if (!(input instanceof HTMLInputElement) || !setter) return false;
          setter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        };
        if (!setInputValue(inputs[0], q) || !setInputValue(inputs[1], r)) return false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        form.requestSubmit();
        return waitFor(() => (
          document.querySelector('.realm-cell-navigator__dialog') === null
          && document.querySelector('.realm-map-screen') instanceof HTMLElement
          && !document.querySelector('.realm-map-screen').hasAttribute('data-camera-interacting')
        ));
      };
      const frameRealmOverview = async () => {
        if (!await openExplore()) return false;
        const realmPreset = [...document.querySelectorAll(
          '.realm-cell-navigator__presets button'
        )].find((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && (button.textContent ?? '').trim() === 'Realm'
        ));
        if (!(realmPreset instanceof HTMLButtonElement)) return false;
        realmPreset.click();
        return waitFor(() => (
          document.querySelector('.realm-cell-navigator__dialog') === null
          && document.querySelector('.realm-map-screen') instanceof HTMLElement
          && !document.querySelector('.realm-map-screen').hasAttribute('data-camera-interacting')
        ));
      };
      const focusedCameraTargets = Object.freeze([
        Object.freeze(['20', '-22']),
        Object.freeze(['-51', '57']),
        Object.freeze(['-51', '52']),
        Object.freeze(['-46', '52'])
      ]);
      let focusedMarkerKey = '';
      const readyFocusedMarker = () => {
        const candidate = [...document.querySelectorAll(
          'button.realm-resource-occupant-marker'
          + '[data-resource-occupant-source="legacy-expedition"]'
        )].find((element) => {
          if (!(element instanceof HTMLButtonElement)) return false;
          const key = element.getAttribute('data-resource-occupant-key') ?? '';
          const bounds = element.getBoundingClientRect();
          const directHit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2
          );
          return Object.hasOwn(focusedRecordByKey, key)
            && !element.disabled
            && element.tabIndex >= 0
            && visible(element)
            && (directHit === element || element.contains(directHit))
            && element.querySelector(
              'canvas[data-profile-image-state="ready"]'
            ) instanceof HTMLCanvasElement;
        });
        if (!(candidate instanceof HTMLButtonElement)) return undefined;
        focusedMarkerKey = candidate.getAttribute('data-resource-occupant-key') ?? '';
        return Object.hasOwn(focusedRecordByKey, focusedMarkerKey)
          ? candidate
          : undefined;
      };
      const openBootstrapPassivePresence = async () => {
        const candidate = [...document.querySelectorAll(
          '.realm-resource-occupant-presence[data-projected-visible="true"]'
        )].find((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const key = element.getAttribute('data-resource-occupant-key') ?? '';
          const bounds = element.getBoundingClientRect();
          const directHit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2
          );
          return Object.hasOwn(focusedRecordByKey, key)
            && visible(element)
            && directHit instanceof Element
            && (directHit === element || element.contains(directHit));
        });
        if (!(candidate instanceof HTMLElement)) return false;
        const bounds = candidate.getBoundingClientRect();
        const directHit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2
        );
        if (!(directHit instanceof HTMLElement)) return false;
        directHit.click();
        return waitFor(() => {
          const panel = document.querySelector(
            '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
          );
          return panel instanceof HTMLElement
            && visible(panel)
            && panel.querySelector(
              '.realm-resource-occupant-details__worker-art img'
            )?.complete === true;
        }, 1_200);
      };
      let markerReady = false;
      for (const [q, r] of focusedCameraTargets) {
        if (!await jumpToOccupiedSite(q, r)) continue;
        markerReady = await waitFor(() => readyFocusedMarker() !== undefined, 600);
        if (!markerReady && await openBootstrapPassivePresence()) {
          markerReady = await waitFor(() => readyFocusedMarker() !== undefined, 1_200);
        }
        if (markerReady) break;
        const bootstrapClose = document.querySelector(
          '.gold-mine-inspection:has([data-resource-occupant-details="true"]) '
          + '.gold-mine-inspection__dismiss'
        );
        if (bootstrapClose instanceof HTMLButtonElement) {
          bootstrapClose.click();
          await waitFor(() => (
            document.querySelector(
              '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
            ) === null
          ), 1_200);
        }
      }
      const map = document.querySelector('.realm-map-screen');
      const marker = [...document.querySelectorAll(
        'button.realm-resource-occupant-marker'
      )].find((element) => (
        element.getAttribute('data-resource-occupant-key') === focusedMarkerKey
      ));
      const presence = [...document.querySelectorAll(
        '.realm-resource-occupant-presence'
      )].find((element) => (
        element.getAttribute('data-resource-occupant-key') === focusedMarkerKey
      ));
      const focusedExpected = focusedRecordByKey[focusedMarkerKey];
      const presenceLayer = presence?.closest('.realm-resource-occupant-presences');
      const controlLayer = marker?.closest('.realm-resource-occupant-markers');
      const castleLayer = document.querySelector('.realm-castle-labels');
      const markerPresent = map instanceof HTMLElement
        && map.getAttribute('data-presentation-mode') === expectedMode
        && focusedExpected !== undefined
        && marker instanceof HTMLButtonElement
        && presence instanceof HTMLElement;
      const markerProjectedVisible = markerPresent
        && marker instanceof HTMLButtonElement
        && marker.getAttribute('data-projected-visible') === 'true';
      const markerBounds = marker instanceof HTMLElement
        ? marker.getBoundingClientRect()
        : undefined;
      const markerGeometryValid = markerBounds !== undefined
        && markerBounds.width >= 44
        && markerBounds.height >= 44;
      const markerControlVisible = markerReady
        && markerPresent
        && marker instanceof HTMLButtonElement
        && visible(marker);
      const keyboardControls = [...document.querySelectorAll(
        'button.realm-resource-occupant-marker'
      )];
      const keyboardControlCountBounded = keyboardControls.length >= 1
        && keyboardControls.length <= 24
        && keyboardControls.filter((control) => control.tabIndex >= 0).length === 1;
      const presenceBounds = presence instanceof HTMLElement
        ? presence.getBoundingClientRect()
        : undefined;
      const presenceAvatar = presence?.querySelector('.realm-castle-avatar');
      const presenceAvatarBounds = presenceAvatar instanceof HTMLElement
        ? presenceAvatar.getBoundingClientRect()
        : undefined;
      const presenceComputedVisible = presence instanceof HTMLElement
        && visible(presence);
      const presenceGeometryValid = presenceBounds !== undefined
        && presenceBounds.width >= 43
        && presenceBounds.width <= 45
        && presenceBounds.height >= 43
        && presenceBounds.height <= 45
        && presenceBounds.right > 0
        && presenceBounds.bottom > 0
        && presenceBounds.left < innerWidth
        && presenceBounds.top < innerHeight;
      const presenceAvatarGeometryValid = presenceAvatarBounds !== undefined
        && presenceAvatarBounds.width >= 31
        && presenceAvatarBounds.width <= 35
        && presenceAvatarBounds.height >= 31
        && presenceAvatarBounds.height <= 35;
      const presencePointerActivatable = presence instanceof HTMLElement
        && presenceLayer instanceof HTMLElement
        && getComputedStyle(presence).pointerEvents === 'auto'
        && getComputedStyle(presenceLayer).pointerEvents === 'none'
        && getComputedStyle(presence).cursor === 'pointer'
        && presenceLayer.getAttribute('aria-hidden') === 'true';
      const presenceVisible = markerPresent
        && presence instanceof HTMLElement
        && presence.getAttribute('data-projected-visible') === 'true'
        && presenceComputedVisible
        && presenceGeometryValid;
      const hit = markerBounds
        ? document.elementFromPoint(
            markerBounds.left + markerBounds.width / 2,
            markerBounds.top + markerBounds.height / 2
          )
        : null;
      const markerHitTestable = marker instanceof HTMLButtonElement
        && hit instanceof Element
        && (hit === marker || marker.contains(hit));
      const presenceHit = presenceBounds
        ? document.elementsFromPoint(
            presenceBounds.left + presenceBounds.width / 2,
            presenceBounds.top + presenceBounds.height / 2
          ).find((candidate) => (
            candidate === presence || presence?.contains(candidate)
          ))
        : undefined;
      const presenceHitTestable = presence instanceof HTMLElement
        && presenceHit instanceof HTMLElement
        && (presenceHit === presence || presence.contains(presenceHit));
      const layeringValid = map instanceof HTMLElement
        && presenceLayer instanceof HTMLElement
        && controlLayer instanceof HTMLElement
        && castleLayer instanceof HTMLElement
        && presenceLayer.parentElement === map
        && controlLayer.parentElement === map
        && castleLayer.parentElement === map
        && Number.parseInt(getComputedStyle(presenceLayer).zIndex, 10) === 3
        && Number.parseInt(getComputedStyle(castleLayer).zIndex, 10) === 4
        && Number.parseInt(getComputedStyle(controlLayer).zIndex, 10) === 5;
      const markerPortraitElementPresent = markerPresent
        && marker instanceof HTMLButtonElement
        && marker.querySelectorAll('canvas[data-profile-image-state]').length === 1;
      const markerPortraitReady = markerPortraitElementPresent
        && marker instanceof HTMLButtonElement
        && marker.querySelectorAll('canvas[data-profile-image-state="ready"]').length === 1;
      const presencePortraitElementPresent = markerPresent
        && presence instanceof HTMLElement
        && presence.querySelectorAll('canvas[data-profile-image-state]').length === 1;
      const presencePortraitReady = presencePortraitElementPresent
        && presence instanceof HTMLElement
        && presence.querySelectorAll('canvas[data-profile-image-state="ready"]').length === 1;
      if (
        !markerPresent
        || !markerProjectedVisible
        || !markerGeometryValid
        || !markerControlVisible
        || !keyboardControlCountBounded
        || !markerHitTestable
        || !layeringValid
        || !presenceVisible
        || !presenceAvatarGeometryValid
        || !presencePointerActivatable
        || !presenceHitTestable
        || !markerPortraitElementPresent
        || !markerPortraitReady
        || !presencePortraitElementPresent
        || !presencePortraitReady
      ) {
        return {
          cameraNeutral: false,
          cameraNeutralAfterClose: false,
          cameraAnchorPopulationValid: false,
          cameraIndependentAnchorCoverage: false,
          cameraNeutralWhileOpen: false,
          factsCorrect: false,
          focusedControlActivation: false,
          identityRecordCorrect: false,
          identityRoleCorrect: false,
          identityTitleCorrect: false,
          identityUsernameCorrect: false,
          keyboardControlCountBounded,
          layeringValid,
          markerControlVisible,
          markerGeometryValid,
          markerPortraitReady,
          markerPortraitElementPresent,
          markerPresent,
          markerProjectedVisible,
          markerHitTestable,
          overviewPresenceDirectHit: false,
          overviewRecordCorrect: false,
          overviewTargetPassiveOnly: false,
          presenceComputedVisible,
          presenceAvatarGeometryValid,
          presenceGeometryValid,
          presenceDelegatedActivation: false,
          presenceHitTestable,
          presencePointerActivatable,
          presencePortraitElementPresent,
          presencePortraitReady,
          presenceVisible,
          privacyBounded: false,
          recordHeaderCorrect: false,
          reducedMotionPreferenceCorrect: false,
          publicRecordCorrect: false,
          publicRecordOpened: false,
          rendererStable: false,
          workerRecordCorrect: false
        };
      }
      const rendererSnapshot = () => map instanceof HTMLElement ? [
        map.getAttribute('data-renderer'),
        map.getAttribute('data-renderer-state'),
        map.getAttribute('data-renderer-ever-ready'),
        map.getAttribute('data-renderer-recovery-attempt'),
        map.getAttribute('data-renderer-failure'),
        map.getAttribute('data-renderer-generation'),
        map.getAttribute('data-renderer-last-successful-generation'),
        map.getAttribute('data-renderer-context-loss-count'),
        map.getAttribute('data-renderer-context-restore-count'),
        map.getAttribute('data-renderer-degraded-quality')
      ].join('|') : '';
      const rendererHealthy = () => map instanceof HTMLElement
        && map.getAttribute('data-renderer') === 'webgl'
        && map.getAttribute('data-renderer-state') === 'ready'
        && map.getAttribute('data-renderer-ever-ready') === 'true'
        && map.getAttribute('data-renderer-failure') === 'none'
        && map.getAttribute('aria-busy') === 'false'
        && !map.hasAttribute('data-camera-interacting');
      const projectionSnapshot = () => {
        const projectedPresence = document.querySelector(overviewPresenceSelector);
        if (!(projectedPresence instanceof HTMLElement)) return undefined;
        const anchors = [...document.querySelectorAll(
          'button.realm-castle-label'
        )].filter((label) => (
          label instanceof HTMLButtonElement
          && label.style.getPropertyValue('--realm-castle-anchor-x') !== ''
          && label.style.getPropertyValue('--realm-castle-anchor-y') !== ''
        )).map((label) => {
          const x = Number.parseFloat(
            label.style.getPropertyValue('--realm-castle-anchor-x')
          );
          const y = Number.parseFloat(
            label.style.getPropertyValue('--realm-castle-anchor-y')
          );
          return [
            'castle:' + label.getAttribute('data-castle-id'),
            x,
            y
          ];
        }).filter((entry) => (
          Number.isFinite(entry[1])
          && Number.isFinite(entry[2])
        ));
        return {
          occupantX: projectedPresence.style.getPropertyValue('--realm-resource-marker-x'),
          occupantY: projectedPresence.style.getPropertyValue('--realm-resource-marker-y'),
          anchors
        };
      };
      const independentStableAnchorCount = (before, after) => {
        if (!before || !after) return 0;
        const afterAnchors = new Map(after.anchors.map((entry) => [entry[0], entry.slice(1)]));
        const stableAnchors = [];
        for (const [key, x, y] of before.anchors) {
          const candidate = afterAnchors.get(key);
          if (!candidate) continue;
          const beforeX = Number.parseFloat(x);
          const beforeY = Number.parseFloat(y);
          const anchorDelta = Math.hypot(
            Number.parseFloat(candidate[0]) - beforeX,
            Number.parseFloat(candidate[1]) - beforeY
          );
          if (
            !Number.isFinite(beforeX)
            || !Number.isFinite(beforeY)
            || !Number.isFinite(anchorDelta)
            || anchorDelta > 0.015
          ) continue;
          if (stableAnchors.every((anchor) => (
            Math.hypot(anchor.x - beforeX, anchor.y - beforeY) >= 8
          ))) stableAnchors.push({ x: beforeX, y: beforeY });
        }
        return stableAnchors.length;
      };
      const projectionStable = (before, after) => {
        if (
          !before
          || !after
          || before.occupantX === ''
          || before.occupantY === ''
        ) return false;
        const occupantDelta = Math.hypot(
          Number.parseFloat(before.occupantX) - Number.parseFloat(after.occupantX),
          Number.parseFloat(before.occupantY) - Number.parseFloat(after.occupantY)
        );
        if (!Number.isFinite(occupantDelta) || occupantDelta > 0.015) return false;
        return independentStableAnchorCount(before, after) >= 3;
      };
      const waitForStableProjection = async () => {
        let previous = projectionSnapshot();
        let stableFrameCount = 0;
        const deadline = performance.now() + ${PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS};
        while (performance.now() <= deadline) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const current = projectionSnapshot();
          if (projectionStable(previous, current)) stableFrameCount += 1;
          else stableFrameCount = 0;
          previous = current;
          if (stableFrameCount >= 8) return true;
        }
        return false;
      };
      const subtreePrivacyBounded = (root) => {
        if (!(root instanceof HTMLElement)) return false;
        const elements = [root, ...root.querySelectorAll('*')];
        return elements.every((element) => {
          if (
            [...element.attributes].some((attribute) => (
              /(?:^|[-_:])(?:fid|pfp|wallet|token|proof|auth|request)(?:$|[-_:])/i
                .test(attribute.name)
              || /(?:https?:|blob:|data:|file:)/i.test(attribute.value)
            ))
          ) return false;
          if (element instanceof HTMLImageElement) {
            const source = element.getAttribute('src') ?? '';
            return source.startsWith('/images/')
              && !element.hasAttribute('srcset')
              && element.crossOrigin === null;
          }
          if (element instanceof HTMLAnchorElement
            || element instanceof HTMLInputElement
            || element instanceof HTMLFormElement) return false;
          return true;
        });
      };
      const focusedBeforeRenderer = rendererSnapshot();
      const markerPrivacyBounded = subtreePrivacyBounded(marker);
      let focusedControlActivation = false;
      if (hit instanceof HTMLElement) {
        focusedControlActivation = true;
        hit.click();
      }
      const occupiedResourcePanelSelector =
        '.gold-mine-inspection:has([data-resource-occupant-details="true"])';
      const inspectionFacts = (inspection) => inspection instanceof HTMLElement
        ? new Map([...inspection.querySelectorAll(
          '.gold-mine-inspection__field, .realm-resource-occupant-details__facts > div'
        )].map((row) => [
          (row.querySelector('dt')?.textContent ?? '').trim(),
          (row.querySelector('dd')?.textContent ?? '').trim()
        ]))
        : new Map();
      const panelReady = await waitFor(() => {
        const panel = document.querySelector(occupiedResourcePanelSelector);
        return panel instanceof HTMLElement
          && visible(panel)
          && panel.querySelector(
            '.realm-resource-occupant-details__worker-art img'
          )?.complete === true
          && panel.querySelector(
            '.realm-resource-occupant-details__identity canvas[data-profile-image-state="ready"]'
          ) instanceof HTMLCanvasElement;
      });
      const panel = document.querySelector(occupiedResourcePanelSelector);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const facts = inspectionFacts(panel);
      const identity = panel?.querySelector('.realm-resource-occupant-details__identity');
      const worker = panel?.querySelector('.realm-resource-occupant-details__worker');
      const recordHeaderCorrect = panelReady
        && panel instanceof HTMLElement
        && panel.getAttribute('role') === 'dialog'
        && panel.getAttribute('aria-modal') === 'false'
        && (panel.querySelector('.realm-resource-occupant-details__record span')?.textContent ?? '').trim()
          === 'PUBLIC EXPEDITION RECORD'
        && (panel.querySelector('.gold-mine-inspection__title-lockup h2')?.textContent ?? '').trim()
          === focusedExpected?.title;
      const workerRecordCorrect =
        (worker?.querySelector('span')?.textContent ?? '').trim() === 'EXPEDITION WAGON'
        && (worker?.querySelector('strong')?.textContent ?? '').trim() === 'GATHERING AT SITE'
        && (worker?.querySelector('small')?.textContent ?? '').trim()
          === focusedExpected?.rate;
      const identityRoleCorrect =
        (identity?.querySelector(':scope > div > span')?.textContent ?? '').trim()
          === 'GATHERING BY';
      const identityTitleCorrect =
        (identity?.querySelector('strong')?.textContent ?? '').trim()
          === 'QA Keeper With An Intentionally Long Display Name For Responsive Realm QA';
      const identityUsernameCorrect =
        (identity?.querySelector('small')?.textContent ?? '').trim()
          === focusedExpected?.username;
      const identityRecordCorrect = identityRoleCorrect
        && identityTitleCorrect
        && identityUsernameCorrect;
      const factsCorrect = facts.get('Node tier') === '1'
        && facts.get('Site state') === 'OCCUPIED · GATHERING'
        && facts.get('Home castle') === focusedExpected?.castleName
        && facts.get('Castle location') === focusedExpected?.castleLocation
        && [...facts.keys()].some((label) => label.endsWith('time left'));
      const publicRecordCorrect = recordHeaderCorrect
        && workerRecordCorrect
        && identityRecordCorrect
        && factsCorrect;
      const publicRecordOpened = panelReady
        && panel instanceof HTMLElement
        && panel.querySelectorAll(
          '.realm-resource-occupant-details__identity canvas[data-profile-image-state="ready"]'
        ).length === 1;
      const focusedDuringRenderer = rendererSnapshot();
      const focusedClose = panel?.querySelector('.gold-mine-inspection__dismiss');
      if (focusedClose instanceof HTMLButtonElement) focusedClose.click();
      const focusedClosed = await waitFor(() => (
        document.querySelector(occupiedResourcePanelSelector) === null
      ));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const focusedAfterRenderer = rendererSnapshot();

      const overviewFramed = focusedClosed && await frameRealmOverview();
      const overviewPresenceReady = overviewFramed && await waitFor(() => {
        const candidate = document.querySelector(overviewPresenceSelector);
        return candidate instanceof HTMLElement
          && candidate.getAttribute('data-projected-visible') === 'true'
          && visible(candidate)
          && candidate.querySelector(
            'canvas[data-profile-image-state="ready"]'
          ) instanceof HTMLCanvasElement;
      });
      const overviewPresence = document.querySelector(overviewPresenceSelector);
      const overviewPresenceBounds = overviewPresence instanceof HTMLElement
        ? overviewPresence.getBoundingClientRect()
        : undefined;
      const overviewDirectHit = overviewPresenceBounds
        ? document.elementFromPoint(
            overviewPresenceBounds.left + overviewPresenceBounds.width / 2,
            overviewPresenceBounds.top + overviewPresenceBounds.height / 2
          )
        : null;
      const overviewPresenceDirectHit = overviewPresenceReady
        && overviewPresence instanceof HTMLElement
        && overviewDirectHit instanceof HTMLElement
        && (overviewDirectHit === overviewPresence
          || overviewPresence.contains(overviewDirectHit));
      const overviewTargetPassiveOnly = overviewPresenceDirectHit
        && document.querySelector(overviewMarkerSelector) === null;
      const overviewProjectionSettled = overviewTargetPassiveOnly
        && await waitForStableProjection();
      const beforeRenderer = rendererSnapshot();
      const beforeProjection = projectionSnapshot();
      const overviewPresencePrivacyBounded = subtreePrivacyBounded(overviewPresence);
      if (overviewTargetPassiveOnly && overviewDirectHit instanceof HTMLElement) {
        overviewDirectHit.click();
      }
      const overviewPanelReady = await waitFor(() => {
        const candidate = document.querySelector(occupiedResourcePanelSelector);
        return candidate instanceof HTMLElement
          && visible(candidate)
          && candidate.querySelector(
            '.realm-resource-occupant-details__worker-art img'
          )?.complete === true
          && candidate.querySelector(
            '.realm-resource-occupant-details__identity canvas[data-profile-image-state="ready"]'
          ) instanceof HTMLCanvasElement;
      });
      const overviewPanel = document.querySelector(occupiedResourcePanelSelector);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const overviewFacts = inspectionFacts(overviewPanel);
      const overviewIdentity = overviewPanel?.querySelector(
        '.realm-resource-occupant-details__identity'
      );
      const overviewWorker = overviewPanel?.querySelector(
        '.realm-resource-occupant-details__worker'
      );
      const overviewRecordCorrect = overviewPanelReady
        && overviewPanel instanceof HTMLElement
        && overviewPanel.getAttribute('role') === 'dialog'
        && overviewPanel.getAttribute('aria-modal') === 'false'
        && (overviewPanel.querySelector(
          '.realm-resource-occupant-details__record span'
        )?.textContent ?? '').trim() === 'PUBLIC EXPEDITION RECORD'
        && (overviewPanel.querySelector(
          '.gold-mine-inspection__title-lockup h2'
        )?.textContent ?? '').trim() === 'Gold Mine'
        && (overviewWorker?.querySelector('span')?.textContent ?? '').trim()
          === 'EXPEDITION WAGON'
        && (overviewWorker?.querySelector('strong')?.textContent ?? '').trim()
          === 'GATHERING AT SITE'
        && (overviewWorker?.querySelector('small')?.textContent ?? '').trim()
          === '1 gold / minute'
        && (overviewIdentity?.querySelector(
          ':scope > div > span'
        )?.textContent ?? '').trim() === 'GATHERING BY'
        && (overviewIdentity?.querySelector('strong')?.textContent ?? '').trim()
          === 'QA Keeper With An Intentionally Long Display Name For Responsive Realm QA'
        && (overviewIdentity?.querySelector('small')?.textContent ?? '').trim()
          === '@qa-keep-003'
        && overviewFacts.get('Resource') === 'Gold'
        && overviewFacts.get('Node tier') === '1'
        && overviewFacts.get('Site state') === 'OCCUPIED · GATHERING'
        && overviewFacts.get('Home castle') === 'Synthetic Keep 003'
        && overviewFacts.get('Castle location') === 'q -1 · r 2'
        && [...overviewFacts.keys()].some((label) => label.endsWith('time left'));
      const presenceDelegatedActivation = overviewTargetPassiveOnly
        && overviewPanelReady
        && overviewRecordCorrect;
      const privacyBounded = markerPrivacyBounded
        && subtreePrivacyBounded(panel)
        && overviewPresencePrivacyBounded
        && subtreePrivacyBounded(overviewPanel);
      const duringRenderer = rendererSnapshot();
      const duringProjection = projectionSnapshot();
      const close = overviewPanel?.querySelector('.gold-mine-inspection__dismiss');
      if (close instanceof HTMLButtonElement) close.click();
      const closed = await waitFor(() => (
        document.querySelector(occupiedResourcePanelSelector) === null
      ));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const afterRenderer = rendererSnapshot();
      const afterProjection = projectionSnapshot();
      const cameraNeutralWhileOpen = projectionStable(
        beforeProjection,
        duringProjection
      );
      const cameraNeutralAfterClose = projectionStable(
        beforeProjection,
        afterProjection
      );
      const cameraIndependentAnchorCoverage =
        independentStableAnchorCount(beforeProjection, duringProjection) >= 3
        && independentStableAnchorCount(beforeProjection, afterProjection) >= 3;
      const cameraAnchorPopulationValid = [
        beforeProjection,
        duringProjection,
        afterProjection
      ].every((snapshot) => snapshot && snapshot.anchors.length >= 3);
      const rendererStable = rendererHealthy()
        && focusedControlActivation
        && publicRecordOpened
        && focusedClosed
        && focusedBeforeRenderer !== ''
        && focusedBeforeRenderer === focusedDuringRenderer
        && focusedBeforeRenderer === focusedAfterRenderer
        && beforeRenderer !== ''
        && beforeRenderer === duringRenderer
        && beforeRenderer === afterRenderer
        && focusedBeforeRenderer === beforeRenderer;
      const reducedMotionPreferenceCorrect = matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches === expectedReducedMotion;
      return {
        cameraNeutral: closed
          && overviewFramed
          && overviewProjectionSettled
          && cameraNeutralWhileOpen
          && cameraNeutralAfterClose,
        cameraNeutralAfterClose,
        cameraAnchorPopulationValid,
        cameraIndependentAnchorCoverage,
        cameraNeutralWhileOpen,
        factsCorrect,
        focusedControlActivation,
        identityRecordCorrect,
        identityRoleCorrect,
        identityTitleCorrect,
        identityUsernameCorrect,
        keyboardControlCountBounded,
        layeringValid,
        markerControlVisible,
        markerGeometryValid,
        markerPortraitReady,
        markerPortraitElementPresent,
        markerPresent,
        markerProjectedVisible,
        markerHitTestable,
        overviewPresenceDirectHit,
        overviewRecordCorrect,
        overviewTargetPassiveOnly,
        presenceComputedVisible,
        presenceAvatarGeometryValid,
        presenceGeometryValid,
        presenceDelegatedActivation,
        presenceHitTestable,
        presencePointerActivatable,
        presencePortraitElementPresent,
        presencePortraitReady,
        presenceVisible,
        privacyBounded,
        recordHeaderCorrect,
        reducedMotionPreferenceCorrect,
        publicRecordCorrect,
        publicRecordOpened,
        rendererStable,
        workerRecordCorrect
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, CDP_COMMAND_TIMEOUT_MILLISECONDS * 6);
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL resource occupant evaluation failed.');
  }
  return parseRenderedWebglResourceOccupantEvidence(evaluation.result.value);
}

export async function applyRenderedWebglActiveWorkerInteraction(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const waitFor = async (
        predicate,
        timeoutMilliseconds = ${PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS * 2}
      ) => {
        const deadline = performance.now() + timeoutMilliseconds;
        while (performance.now() <= deadline) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return false;
      };
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width > 0
          && bounds.height > 0;
      };
      const buttonByStrongText = (root, text) => [...(root?.querySelectorAll('button') ?? [])]
        .find((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && (button.querySelector('strong')?.textContent ?? '').trim() === text
        ));
      const overlay = document.querySelector('[data-rendered-webgl-status]');
      const map = document.querySelector('.realm-map-screen');
      const rendererHealthy = () => map instanceof HTMLElement
        && map.dataset.renderer === 'webgl'
        && map.dataset.rendererState === 'ready'
        && map.dataset.rendererEverReady === 'true'
        && map.dataset.rendererFailure === 'none'
        && map.getAttribute('aria-busy') === 'false';
      const activeFixtureSelected = overlay instanceof HTMLElement
        && overlay.dataset.fixtureVariant === 'worker-active'
        && overlay.dataset.presentationMode === 'player'
        && overlay.dataset.resourceOccupationCount === '2'
        && rendererHealthy();
      const launcher = document.querySelector('.realm-profile-trigger');
      if (!(launcher instanceof HTMLButtonElement) || !visible(launcher)) {
        return {
          activeFixtureSelected,
          foreignMarkerGeneric: false,
          foreignPortraitReady: false,
          foreignRecordReadOnly: false,
          mobileBoundsSafe: false,
          ownerCommandCenterAvailable: false,
          ownerRecallControlsAvailable: false,
          ownerRosterExact: false,
          privacyBounded: false,
          rendererContextRecovered: false,
          rendererStable: false
        };
      }

      launcher.click();
      const menuReady = await waitFor(() => visible(
        document.querySelector('.realm-profile-menu__panel')
      ));
      const menu = document.querySelector('.realm-profile-menu__panel');
      const workerGroup = menu?.querySelector('[aria-label="Worker controls"]');
      const workersButton = buttonByStrongText(workerGroup, 'WORKERS');
      const menuRecallAll = buttonByStrongText(workerGroup, 'RECALL ALL TO KEEP');
      const ownerCommandCenterAvailable = menuReady
        && workersButton instanceof HTMLButtonElement
        && (workersButton.querySelector('span')?.textContent ?? '').trim()
          === '1/4 deployed · manage workers';
      const menuRecallAvailable = menuRecallAll instanceof HTMLButtonElement
        && !menuRecallAll.disabled;
      workersButton?.click();
      const commandCenterReady = await waitFor(() => visible(
        document.querySelector('.worker-command-center')
      ));
      const commandCenter = document.querySelector('.worker-command-center');
      const rosterItems = [...(commandCenter?.querySelectorAll(
        '.worker-command-center__roster > li'
      ) ?? [])];
      const workerButtons = rosterItems.map((item) => (
        item.querySelector('.worker-command-center__worker')
      ));
      const workerNames = workerButtons.map((button) => (
        (button?.querySelector('strong')?.textContent ?? '').trim()
      ));
      const workerStatuses = workerButtons.map((button) => (
        (button?.querySelector('small')?.textContent ?? '').trim()
      ));
      const ownerRosterExact = commandCenterReady
        && rosterItems.length === 4
        && workerNames.join('|') === 'Worker 1|Worker 2|Worker 3|Worker 4'
        && workerStatuses[0] === 'GATHERING GOLD'
        && workerStatuses.slice(1).every((status) => status === 'READY AT KEEP')
        && (workerButtons[0]?.querySelector(
          '.worker-command-center__amount'
        )?.textContent ?? '').trim() === '5 Gold';
      const rowRecallButtons = [...(commandCenter?.querySelectorAll(
        '.worker-command-center__recall'
      ) ?? [])].filter((button) => (
        button instanceof HTMLButtonElement && !button.disabled
      ));
      const centerRecallAll = commandCenter?.querySelector(
        '.worker-command-center__footer button'
      );
      const ownerRecallControlsAvailable = menuRecallAvailable
        && rowRecallButtons.length === 1
        && (rowRecallButtons[0]?.textContent ?? '').trim() === 'RETURN'
        && centerRecallAll instanceof HTMLButtonElement
        && !centerRecallAll.disabled
        && (centerRecallAll.textContent ?? '').trim() === 'RETURN ALL TO KEEP';
      const commandBounds = commandCenter instanceof HTMLElement
        ? commandCenter.getBoundingClientRect()
        : undefined;
      const mobileBoundsSafe = innerWidth === 390
        && innerHeight === 844
        && commandBounds !== undefined
        && commandBounds.left >= -1
        && commandBounds.top >= -1
        && commandBounds.right <= innerWidth + 1
        && commandBounds.bottom <= innerHeight + 1
        && document.documentElement.scrollWidth <= innerWidth + 1;
      const back = commandCenter?.querySelector(
        'button[aria-label="Back to Realm menu"]'
      );
      if (back instanceof HTMLButtonElement) back.click();
      await waitFor(() => visible(document.querySelector('.realm-profile-menu__panel')));
      const closeMenu = document.querySelector(
        '.realm-profile-menu__panel button[aria-label="Close Realm menu"]'
      );
      if (closeMenu instanceof HTMLButtonElement) closeMenu.click();
      await waitFor(() => document.querySelector('.realm-profile-menu__panel') === null);

      launcher.click();
      await waitFor(() => visible(document.querySelector('.realm-profile-menu__panel')));
      const explore = buttonByStrongText(
        document.querySelector('.realm-profile-menu__panel'),
        'EXPLORE'
      );
      explore?.click();
      const navigatorReady = await waitFor(() => visible(
        document.querySelector('.realm-cell-navigator__dialog')
      ));
      const jumpForm = document.querySelector('.realm-cell-navigator__jump');
      const jumpInputs = jumpForm?.querySelectorAll('input');
      const setInputValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        if (!(input instanceof HTMLInputElement) || !setter) return false;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      const jumpSubmitted = navigatorReady
        && jumpForm instanceof HTMLFormElement
        && jumpInputs?.length === 2
        && setInputValue(jumpInputs[0], '-51')
        && setInputValue(jumpInputs[1], '57');
      if (jumpSubmitted) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        jumpForm.requestSubmit();
      }
      await waitFor(() => (
        document.querySelector('.realm-cell-navigator__dialog') === null
        && rendererHealthy()
        && !map?.hasAttribute('data-camera-interacting')
      ));
      const foreignMarkerSelector = [
        'button.realm-resource-occupant-marker',
        '[data-resource-occupant-source="generic-worker"]',
        '[data-resource-kind="gold"]',
        '[data-resource-occupant-key="gold:genesis-001-tier1-gold-03"]'
      ].join('');
      const foreignMarkerReady = await waitFor(() => {
        const marker = document.querySelector(foreignMarkerSelector);
        return marker instanceof HTMLButtonElement
          && marker.dataset.projectedVisible === 'true'
          && marker.dataset.occupiedByViewer === 'false'
          && visible(marker)
          && marker.querySelector(
            'canvas[data-profile-image-state="ready"]'
          ) instanceof HTMLCanvasElement;
      });
      const foreignMarker = document.querySelector(foreignMarkerSelector);
      const foreignMarkerGeneric = foreignMarkerReady
        && foreignMarker instanceof HTMLButtonElement
        && foreignMarker.dataset.resourceOccupantSource === 'generic-worker'
        && foreignMarker.dataset.occupiedByViewer === 'false';
      const foreignPortraitReady = foreignMarker?.querySelector(
        'canvas[data-profile-image-state="ready"]'
      ) instanceof HTMLCanvasElement;
      foreignMarker?.click();
      const panelReady = await waitFor(() => visible(
        document.querySelector(
          '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
        )
      ));
      const panel = document.querySelector(
        '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
      );
      const record = panel?.querySelector('.realm-resource-occupant-details__record');
      const identity = panel?.querySelector('.realm-resource-occupant-details__identity');
      const foreignRecordReadOnly = panelReady
        && (record?.querySelector('span')?.textContent ?? '').trim()
          === 'PUBLIC WORKER RECORD'
        && (record?.querySelector('strong')?.textContent ?? '').trim()
          === 'WORKER 01'
        && (identity?.querySelector(':scope > div > span')?.textContent ?? '').trim()
          === 'GATHERING BY'
        && identity?.querySelector(
          'canvas[data-profile-image-state="ready"]'
        ) instanceof HTMLCanvasElement
        && panel?.querySelector('.realm-resource-occupant-details__recall') === null
        && !/(?:Recall Worker|RETURN ALL TO KEEP)/i.test(panel?.textContent ?? '');
      const privacyNodes = [commandCenter, foreignMarker, panel].filter((node) => (
        node instanceof HTMLElement
      ));
      const privacyBounded = privacyNodes.length === 3
        && privacyNodes.every((root) => (
          [root, ...root.querySelectorAll('*')].every((element) => (
            [...element.attributes].every((attribute) => (
              !/(?:^|[-_:])(?:fid|wallet|token|proof|auth|request)(?:$|[-_:])/i
                .test(attribute.name)
              && !/(?:https?:|blob:|data:|file:)/i.test(attribute.value)
            ))
          ))
        ));
      const dismiss = panel?.querySelector('.gold-mine-inspection__dismiss');
      if (dismiss instanceof HTMLButtonElement) dismiss.click();
      await waitFor(() => document.querySelector(
        '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
      ) === null);

      const initialGeneration = Number(map?.dataset.rendererGeneration);
      const canvas = map?.querySelector('canvas.realm-map-screen__canvas');
      const webgl = canvas instanceof HTMLCanvasElement
        ? canvas.getContext('webgl2') ?? canvas.getContext('webgl')
        : null;
      const contextController = webgl?.getExtension('WEBGL_lose_context');
      const lossDispatched = contextController !== null
        && contextController !== undefined;
      if (lossDispatched) contextController.loseContext();
      const recoveringSeen = lossDispatched && await waitFor(() => (
        map?.dataset.rendererState === 'recovering'
        && map?.dataset.rendererFailure === 'context-lost'
        && map?.getAttribute('aria-busy') === 'true'
      ));
      if (recoveringSeen) {
        await new Promise((resolve) => setTimeout(resolve, 64));
        contextController.restoreContext();
      }
      const rendererContextRecovered = recoveringSeen && await waitFor(
        () => (
          rendererHealthy()
          && Number(map?.dataset.rendererGeneration) > initialGeneration
          && map?.dataset.rendererFailure === 'none'
          && map?.getAttribute('aria-busy') === 'false'
        ),
        ${PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS * 6}
      );
      return {
        activeFixtureSelected,
        foreignMarkerGeneric,
        foreignPortraitReady,
        foreignRecordReadOnly,
        mobileBoundsSafe,
        ownerCommandCenterAvailable,
        ownerRecallControlsAvailable,
        ownerRosterExact,
        privacyBounded,
        rendererContextRecovered,
        rendererStable: rendererContextRecovered && rendererHealthy()
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, CDP_COMMAND_TIMEOUT_MILLISECONDS * 8);
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL active Worker evaluation failed.');
  }
  return evaluation.result.value;
}

export async function applyRenderedWebglActiveWorkerReconnectInteraction(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const waitFor = async (predicate) => {
        const deadline = performance.now() + ${PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS};
        while (performance.now() <= deadline) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return false;
      };
      const overlay = document.querySelector('[data-rendered-webgl-status]');
      const map = document.querySelector('.realm-map-screen');
      const launcher = document.querySelector('.realm-profile-trigger');
      if (
        !(overlay instanceof HTMLElement)
        || overlay.dataset.fixtureVariant !== 'worker-active'
        || overlay.dataset.resourceOccupationCount !== '2'
        || !(map instanceof HTMLElement)
        || map.dataset.renderer !== 'webgl'
        || map.dataset.rendererState !== 'ready'
        || !(launcher instanceof HTMLButtonElement)
      ) return false;
      launcher.click();
      const menuReady = await waitFor(() => (
        document.querySelector('.realm-profile-menu__panel') instanceof HTMLElement
      ));
      const workersButton = [...document.querySelectorAll(
        '.realm-profile-menu__worker-actions button'
      )].find((button) => (
        button instanceof HTMLButtonElement
        && !button.disabled
        && (button.querySelector('strong')?.textContent ?? '').trim() === 'WORKERS'
        && (button.querySelector('span')?.textContent ?? '').trim()
          === '1/4 deployed · manage workers'
      ));
      if (!menuReady || !(workersButton instanceof HTMLButtonElement)) return false;
      workersButton.click();
      const centerReady = await waitFor(() => (
        document.querySelectorAll('.worker-command-center__roster > li').length === 4
      ));
      const commandCenter = document.querySelector('.worker-command-center');
      return centerReady
        && commandCenter instanceof HTMLElement
        && commandCenter.querySelectorAll('.worker-command-center__recall').length === 1
        && commandCenter.querySelector(
          '.worker-command-center__footer button'
        ) instanceof HTMLButtonElement;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'boolean') {
    throw new Error('Rendered WebGL active Worker reconnect evaluation failed.');
  }
  return Object.freeze({ localReconnectRehydrated: evaluation.result.value === true });
}

export async function applyRenderedWebglOccupancyStressInteraction(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const expectedOccupationCount = ${RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT};
      const maximumPresenceCount =
        ${RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_PRESENCES};
      const maximumControlCount =
        ${RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_CONTROLS};
      const targets = Object.freeze([
        Object.freeze({
          key: 'gold:genesis-001-tier1-gold-03',
          q: '-51',
          r: '57',
          resource: 'gold'
        }),
        Object.freeze({
          key: 'food:genesis-001-tier1-food-004',
          q: '-42',
          r: '57',
          resource: 'food'
        }),
        Object.freeze({
          key: 'wood:genesis-001-tier1-wood-033',
          q: '-41',
          r: '48',
          resource: 'wood'
        }),
        Object.freeze({
          key: 'stone:genesis-001-tier1-stone-059',
          q: '-52',
          r: '50',
          resource: 'stone'
        })
      ]);
      const waitFor = async (
        predicate,
        timeoutMilliseconds = ${PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS}
      ) => {
        const deadline = performance.now() + timeoutMilliseconds;
        while (performance.now() <= deadline) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return false;
      };
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || '1') > 0
          && bounds.width > 0
          && bounds.height > 0;
      };
      const overlay = document.querySelector('[data-rendered-webgl-status]');
      const rendererSnapshot = () => {
        const activeMap = document.querySelector('.realm-map-screen');
        if (!(activeMap instanceof HTMLElement)) return '';
        return [
          activeMap.dataset.renderer,
          activeMap.dataset.rendererState,
          activeMap.dataset.rendererEverReady,
          activeMap.dataset.rendererRecoveryAttempt,
          activeMap.dataset.rendererFailure,
          activeMap.dataset.rendererGeneration,
          activeMap.dataset.rendererLastSuccessfulGeneration,
          activeMap.dataset.rendererContextLossCount,
          activeMap.dataset.rendererContextRestoreCount
        ].join('|');
      };
      const rendererHealthy = () => {
        const activeMap = document.querySelector('.realm-map-screen');
        return activeMap instanceof HTMLElement
          && activeMap.dataset.renderer === 'webgl'
          && activeMap.dataset.rendererState === 'ready'
          && activeMap.dataset.rendererEverReady === 'true'
          && activeMap.dataset.rendererRecoveryAttempt === '0'
          && activeMap.dataset.rendererFailure === 'none'
          && activeMap.dataset.rendererContextLossCount === '0'
          && activeMap.dataset.rendererContextRestoreCount === '0'
          && activeMap.dataset.rendererGeneration
            === activeMap.dataset.rendererLastSuccessfulGeneration;
      };
      const setInputValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        if (!(input instanceof HTMLInputElement) || !setter) return false;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      const jumpTo = async (q, r) => {
        const trigger = document.querySelector('.realm-cell-navigator > button');
        if (!(trigger instanceof HTMLButtonElement) || trigger.disabled || !visible(trigger)) {
          return false;
        }
        trigger.click();
        if (!await waitFor(() => (
          document.querySelector('.realm-cell-navigator__dialog') instanceof HTMLElement
        ))) return false;
        const form = document.querySelector('.realm-cell-navigator__jump');
        const inputs = form?.querySelectorAll('input');
        if (!(form instanceof HTMLFormElement) || inputs?.length !== 2) return false;
        if (!setInputValue(inputs[0], q) || !setInputValue(inputs[1], r)) return false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        form.requestSubmit();
        return waitFor(() => (
          document.querySelector('.realm-cell-navigator__dialog') === null
          && document.querySelector('.realm-map-screen') instanceof HTMLElement
          && !document.querySelector('.realm-map-screen').hasAttribute(
            'data-camera-interacting'
          )
        ));
      };
      const currentMarkerState = () => {
        const presences = [...document.querySelectorAll(
          '.realm-resource-occupant-presence[data-projected-visible="true"]'
        )].filter((element) => visible(element));
        const controls = [...document.querySelectorAll(
          'button.realm-resource-occupant-marker[data-projected-visible="true"]'
        )].filter((element) => visible(element));
        const presenceKeys = presences.map((element) => (
          element.getAttribute('data-resource-occupant-key') ?? ''
        ));
        const controlKeys = controls.map((element) => (
          element.getAttribute('data-resource-occupant-key') ?? ''
        ));
        return Object.freeze({
          controlBudgetBounded: controls.length > 0
            && controls.length <= maximumControlCount,
          legacySourceCorrect: controls.every((element) => (
            element.getAttribute('data-resource-occupant-source')
              === 'legacy-expedition'
          )),
          presenceBudgetBounded: presences.length > 0
            && presences.length <= maximumPresenceCount,
          rovingTabStopBounded: controls.filter((element) => (
            element instanceof HTMLButtonElement && element.tabIndex === 0
          )).length <= 1,
          uniqueVisibleKeys: new Set(presenceKeys).size === presenceKeys.length
            && new Set(controlKeys).size === controlKeys.length
            && controlKeys.every((key) => presenceKeys.includes(key))
        });
      };

      const fixtureSelected = overlay instanceof HTMLElement
        && overlay.dataset.fixtureVariant === 'occupancy-stress';
      const allNodeSourceCountExact = overlay instanceof HTMLElement
        && Number(overlay.dataset.resourceOccupationCount) === expectedOccupationCount;
      const initialRenderer = rendererSnapshot();
      let allResourceKindsExercised = true;
      let controlBudgetBounded = true;
      let legacySourceCorrect = true;
      let portraitPipelineReady = true;
      let presenceBudgetBounded = true;
      let rendererStable = rendererHealthy();
      let rovingTabStopBounded = true;
      let uniqueVisibleKeys = true;
      const observedKinds = new Set();

      for (const target of targets) {
        if (!await jumpTo(target.q, target.r)) {
          allResourceKindsExercised = false;
          continue;
        }
        const selector = '.realm-resource-occupant-presence'
          + '[data-projected-visible="true"]'
          + '[data-resource-occupant-key="' + target.key + '"]';
        const targetReady = await waitFor(() => {
          const candidate = document.querySelector(selector);
          return candidate instanceof HTMLElement
            && visible(candidate)
            && candidate.querySelector(
              'canvas[data-profile-image-state="ready"]'
            ) instanceof HTMLCanvasElement;
        });
        const state = currentMarkerState();
        controlBudgetBounded = controlBudgetBounded && state.controlBudgetBounded;
        legacySourceCorrect = legacySourceCorrect && state.legacySourceCorrect;
        portraitPipelineReady = portraitPipelineReady && targetReady;
        presenceBudgetBounded = presenceBudgetBounded && state.presenceBudgetBounded;
        rovingTabStopBounded = rovingTabStopBounded && state.rovingTabStopBounded;
        uniqueVisibleKeys = uniqueVisibleKeys && state.uniqueVisibleKeys;
        const presence = document.querySelector(selector);
        if (!targetReady || !(presence instanceof HTMLElement)) {
          allResourceKindsExercised = false;
          continue;
        }
        observedKinds.add(presence.dataset.resourceKind);
        rendererStable = rendererStable
          && rendererHealthy()
          && initialRenderer === rendererSnapshot();
      }

      allResourceKindsExercised = allResourceKindsExercised
        && observedKinds.size === 4
        && ['gold', 'food', 'wood', 'stone'].every((kind) => observedKinds.has(kind));
      rendererStable = rendererStable
        && initialRenderer !== ''
        && initialRenderer === rendererSnapshot()
        && rendererHealthy();
      return {
        allNodeSourceCountExact,
        allResourceKindsExercised,
        controlBudgetBounded,
        fixtureSelected,
        legacySourceCorrect,
        portraitPipelineReady,
        presenceBudgetBounded,
        rendererStable,
        rovingTabStopBounded,
        uniqueVisibleKeys
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, CDP_COMMAND_TIMEOUT_MILLISECONDS * 8);
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL occupancy stress evaluation failed.');
  }
  return parseRenderedWebglOccupancyStressEvidence(evaluation.result.value);
}

async function runRenderedOccupancyStressCase(session, probeCase, state) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: probeCase.viewport.width,
    height: probeCase.viewport.height,
    screenWidth: probeCase.viewport.width,
    screenHeight: probeCase.viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.command('Emulation.setEmulatedMedia', {
    features: [{
      name: 'prefers-reduced-motion',
      value: 'no-preference',
    }],
  });
  await session.command('Page.navigate', { url: probeCase.url });
  await waitForAcceptedRenderedDom(session, probeCase, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
  await applyRenderedWebglOccupancyStressInteraction(session);
  await captureRenderedCasePixels(session, probeCase.viewport);
  if (state.violation) {
    throw new Error('Rendered WebGL occupancy stress left the local QA boundary.');
  }
}

async function runRenderedActiveWorkerCase(session, probeCase, state) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: probeCase.viewport.width,
    height: probeCase.viewport.height,
    screenWidth: probeCase.viewport.width,
    screenHeight: probeCase.viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.command('Emulation.setEmulatedMedia', {
    features: [{
      name: 'prefers-reduced-motion',
      value: 'no-preference',
    }],
  });
  await session.command('Page.navigate', { url: probeCase.url });
  await waitForAcceptedRenderedDom(session, probeCase, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
  state.controlledRendererRecovery = true;
  state.controlledRendererWarningCount = 0;
  state.controlledRendererWarningThrottleSeen = false;
  let activeEvidence;
  try {
    activeEvidence = await applyRenderedWebglActiveWorkerInteraction(session);
    // Let the renderer's expected context-loss diagnostic reach CDP before
    // closing the narrowly-scoped rendering-warning allowance.
    await delay(100);
  } finally {
    state.controlledRendererRecovery = false;
  }
  await captureRenderedCasePixels(session, probeCase.viewport);

  // A fresh exact-loopback navigation reconstructs the synthetic projection
  // without browser storage or production authority. Requiring the same
  // complete owner roster afterward covers the browser reconnect/rehydration
  // boundary without claiming a live backend reconnect.
  await session.command('Page.navigate', { url: probeCase.url });
  await waitForAcceptedRenderedDom(session, probeCase, state);
  const reconnectEvidence = await applyRenderedWebglActiveWorkerReconnectInteraction(session);
  parseRenderedWebglActiveWorkerEvidence({
    ...activeEvidence,
    ...reconnectEvidence,
  });
  await captureRenderedCasePixels(session, probeCase.viewport);
  if (state.violation) {
    throw new Error('Rendered WebGL active Worker case left the local QA boundary.');
  }
}

async function runRenderedCase(session, probeCase, state) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: probeCase.viewport.width,
    height: probeCase.viewport.height,
    screenWidth: probeCase.viewport.width,
    screenHeight: probeCase.viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.command('Emulation.setEmulatedMedia', {
    features: [{
      name: 'prefers-reduced-motion',
      value: probeCase.expectedQuality === 'reduced' ? 'reduce' : 'no-preference',
    }],
  });
  await session.command('Page.navigate', { url: probeCase.url });
  const baseline = Object.freeze({ ...probeCase, interaction: 'default' });
  await waitForAcceptedRenderedDom(session, baseline, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
  if (RENDERED_WEBGL_QA_RESOURCE_OCCUPANT_CASE_IDS.has(probeCase.id)) {
    await applyRenderedWebglResourceOccupantInteraction(
      session,
      probeCase.expectedPresentationMode,
      probeCase.expectedQuality === 'reduced'
    );
    await session.command('Page.navigate', { url: probeCase.url });
    await waitForAcceptedRenderedDom(session, baseline, state);
  }
  if (RENDERED_WEBGL_QA_ACTIVE_FOREST_CASE_IDS.has(probeCase.id)) {
    const activeForestInteraction = await applyRenderedWebglActiveForestCameraInteraction(
      session
    );
    if (
      activeForestInteraction.wheelStepCount
      !== RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_STEPS
    ) throw new Error('Rendered WebGL active forest wheel sequence was incomplete.');
    await waitForAcceptedActiveForestDom(session, Object.freeze({
      ...baseline,
      minimumLabelCount: 1,
    }), state);
    await captureRenderedCasePixels(session, probeCase.viewport);
    // desktop-high still owns the established keyboard lane. Restore its
    // untouched overview before exercising that independent contract.
    if (probeCase.id === RENDERED_WEBGL_QA_LABEL_KEYBOARD_CASE_ID) {
      await session.command('Page.navigate', { url: probeCase.url });
      await waitForAcceptedRenderedDom(session, baseline, state);
    }
  }
  if (probeCase.id === RENDERED_WEBGL_QA_LABEL_KEYBOARD_CASE_ID) {
    await applyRenderedWebglLabelKeyboardInteraction(session);
    await waitForAcceptedRenderedDom(session, baseline, state);
  }
  if (probeCase.id === RENDERED_WEBGL_QA_MAP_GESTURE_CASE_ID) {
    await applyRenderedWebglMapGestureInteraction(session);
    await waitForAcceptedRenderedDom(session, baseline, state);
    await captureRenderedCasePixels(session, probeCase.viewport);
  }
  if (probeCase.id === RENDERED_WEBGL_QA_CASTLE_POINTER_ACTIVATION_CASE_ID) {
    const canvasInteraction = await applyRenderedWebglCastleCanvasInteraction(session);
    if (
      canvasInteraction.pointerMoveCount
      !== RENDERED_WEBGL_QA_CASTLE_POINTER_MOVE_OFFSETS.length
    ) throw new Error('Rendered WebGL canvas pointer sequence was incomplete.');
    // The inspector is available only for a castle target. Requiring it after
    // an actual canvas press/release therefore proves the decoded, instanced
    // GLB won the scene raycast over terrain; a label click cannot satisfy
    // this lane because every candidate was verified as canvas-hit before
    // input was dispatched.
    const canvasActivated = Object.freeze({
      ...probeCase,
      interaction: 'inspector',
      maximumLabelOverflowCount:
        RENDERED_WEBGL_QA_INTERACTION_MAXIMUM_LABEL_OVERFLOW_COUNT.inspector,
      minimumLabelCount: 1,
    });
    await waitForAcceptedRenderedDom(session, canvasActivated, state);
    await captureRenderedCasePixels(session, probeCase.viewport);
  }
  if (probeCase.interaction !== 'default') {
    const interactionEvidence = await applyRenderedWebglCaseInteraction(
      session,
      probeCase.interaction,
      probeCase.expectedPresentationMode
    );
    if (
      probeCase.interaction === 'inspector'
      && interactionEvidence.inspectorLabelActivated !== true
    ) throw new Error('Rendered WebGL QA inspector label activation evidence failed.');
    const interacted = Object.freeze({
      ...probeCase,
      ...interactionEvidence,
      // The baseline already proves one or more map labels before opening a
      // surface. A narrow Explore sheet may correctly reserve the full map
      // label berth; its complete accessible castle list is then the active
      // identity surface, so do not turn that intentional post-click state
      // into a timing-dependent label-count failure.
      maximumLabelOverflowCount:
        RENDERED_WEBGL_QA_INTERACTION_MAXIMUM_LABEL_OVERFLOW_COUNT[probeCase.interaction],
      minimumLabelCount: probeCase.interaction === 'explore' ? 0 : 1,
    });
    await waitForAcceptedRenderedDom(session, interacted, state);
    await captureRenderedCasePixels(session, probeCase.viewport);
  }
}

/**
 * Runs the established rendered fixture matrix. Callers continue to receive
 * the numeric rendered-case count; an optional callback receives only the
 * already-validated aggregate LOD fidelity metrics from the separate private
 * source comparison lane.
 */
export async function runRenderedWebglBrowserProbe(options = {}) {
  const onCastleLodVisualBoundary = options?.onCastleLodVisualBoundary;
  const onCastleLodVisualEvidence = options?.onCastleLodVisualEvidence;
  if (
    onCastleLodVisualBoundary !== undefined
    && typeof onCastleLodVisualBoundary !== 'function'
  ) throw new TypeError('Invalid castle LOD visual boundary callback.');
  if (
    onCastleLodVisualEvidence !== undefined
    && typeof onCastleLodVisualEvidence !== 'function'
  ) throw new TypeError('Invalid castle LOD visual evidence callback.');
  const reviewedChromeIdentity = await attestStableHeadlessChromeExecutable();
  const temporaryProfileDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-webgl-qa-'));

  let chrome;
  let castleLodVisualSource;
  let disposeCastleLodVisualEvidenceSource;
  let devtools;
  let vite;
  try {
    const profileMetadata = await lstat(temporaryProfileDirectory);
    const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (
      !profileMetadata.isDirectory()
      || profileMetadata.isSymbolicLink()
      || (expectedUid !== undefined && profileMetadata.uid !== expectedUid)
    ) throw new Error('The disposable Chrome profile path is unsafe.');
    const profileDirectory = await realpath(temporaryProfileDirectory);
    await chmod(profileDirectory, 0o700);
    const castleLodVisualProbe = await import('./castle-lod-visual-browser-probe.mjs');
    disposeCastleLodVisualEvidenceSource = castleLodVisualProbe.disposeCastleLodVisualEvidenceSource;
    castleLodVisualSource = castleLodVisualProbe.loadCastleLodVisualEvidenceSource();
    vite = await createLoopbackViteServer(profileDirectory, [
      castleLodVisualProbe.castleLodVisualEvidenceSourceVitePlugin(castleLodVisualSource)
    ]);
    const castleLodVisualBoundary = await castleLodVisualProbe
      .assertCastleLodVisualEvidenceLoopbackBoundary(vite.port);
    onCastleLodVisualBoundary?.(castleLodVisualBoundary);
    const cases = renderedWebglBrowserProbeCases(vite.port);
    const activeWorkerCase = renderedWebglActiveWorkerProbeCase(vite.port);
    const occupancyStressCase = renderedWebglOccupancyStressProbeCase(vite.port);
    const journeyProbe = await import('./qa-journey-browser-probe.mjs');
    const journeyCases = journeyProbe.qaJourneyBrowserProbeCases(vite.port);
    const castleLodVisualUrl = castleLodVisualProbe.castleLodVisualEvidenceUrl(vite.port);
    const isAllowedProbeResourceUrl = (value) => (
      isAllowedRenderedWebglPageUrl(value, `http://127.0.0.1:${vite.port}`)
      || journeyProbe.isAllowedQaJourneyResourceUrl(value)
    );
    if (
      cases.length !== RENDERED_WEBGL_QA_CASE_COUNT
      || new Set(cases.map((probeCase) => probeCase.id)).size !== RENDERED_WEBGL_QA_CASE_COUNT
    ) throw new Error('Rendered WebGL QA case manifest is invalid.');
    const loopbackOrigin = `http://127.0.0.1:${vite.port}`;
    await attestStableHeadlessChromeExecutable(reviewedChromeIdentity);
    chrome = spawnHeadlessChromeProbe(profileDirectory);
    const launchedChromeIdentity = await readReviewedChromeExecutableIdentity();
    if (!exactChromeExecutableIdentity(reviewedChromeIdentity, launchedChromeIdentity)) {
      throw new Error('The reviewed Google Chrome executable changed at launch.');
    }
    const state = {
      violation: '',
      controlledRendererRecovery: false,
      controlledRendererWarningCount: 0,
      controlledRendererWarningThrottleSeen: false,
      allowedUrls: new Set([
        ...cases.map((probeCase) => probeCase.url),
        activeWorkerCase.url,
        occupancyStressCase.url,
        ...journeyCases.map((probeCase) => probeCase.url),
        castleLodVisualUrl,
      ]),
      targetId: '',
    };
    devtools = new DevtoolsPipeSession(chrome, (method, params, session) => {
      if (method === 'Fetch.requestPaused') {
        const requestUrl = params?.request?.url;
        if (isAllowedProbeResourceUrl(requestUrl)) {
          void session.command('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {
            state.violation = 'fetch-continue';
          });
        } else {
          state.violation = 'fetch';
          void session.command('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'BlockedByClient',
          }).catch(() => {});
        }
        return;
      }
      if (method === 'Page.frameNavigated' && !params?.frame?.parentId) {
        const url = params?.frame?.url;
        if (url !== 'about:blank' && !state.allowedUrls.has(url)) {
          state.violation = 'navigation';
        }
        return;
      }
      if (method === 'Page.windowOpen' || method === 'Page.downloadWillBegin') {
        state.violation = 'page-side-effect';
        return;
      }
      if (method === 'Runtime.exceptionThrown') {
        // Record only the category. Console/error payloads are deliberately
        // neither copied into reports nor retained by the probe.
        state.violation = 'runtime-exception';
        return;
      }
      if (
        method === 'Runtime.consoleAPICalled'
        && ['assert', 'error'].includes(params?.type)
      ) {
        // Reduce synthetic console arguments immediately to a fixed category;
        // never retain their text in a report or propagate it through errors.
        state.violation = browserConsoleViolationCategory(params?.args);
        return;
      }
      if (
        method === 'Log.entryAdded'
        && ['error', 'warning'].includes(params?.entry?.level)
      ) {
        const controlledWarningKind = state.controlledRendererRecovery
          ? controlledRendererRecoveryWarningKind(
              params.entry,
              loopbackOrigin,
              profileDirectory
            )
          : null;
        if (
          controlledWarningKind === 'stale-context-object-delete'
          && !state.controlledRendererWarningThrottleSeen
          && state.controlledRendererWarningCount
            < CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS
        ) {
          state.controlledRendererWarningCount += 1;
          return;
        }
        if (
          controlledWarningKind === 'stale-context-warning-throttle'
          && !state.controlledRendererWarningThrottleSeen
          && state.controlledRendererWarningCount > 0
        ) {
          state.controlledRendererWarningThrottleSeen = true;
          return;
        }
        state.violation = params.entry.level === 'warning' ? 'log-warning' : 'log-error';
        return;
      }
      if (method === 'Target.targetDestroyed') {
        state.violation = params?.targetId === state.targetId
          ? 'target-destroyed'
          : 'target-id';
        return;
      }
      if (method === 'Target.targetCrashed') {
        state.violation = params?.targetId === state.targetId
          ? 'target-crashed'
          : 'target-id';
        return;
      }
      if (method === 'Target.detachedFromTarget') {
        state.violation = 'target-detached';
        return;
      }
      if (method === 'Inspector.detached') {
        state.violation = 'inspector-detached';
        return;
      }
      if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
        const targetInfo = params?.targetInfo;
        if (targetInfo?.targetId !== state.targetId) state.violation = 'target-id';
        else if (targetInfo?.type !== 'page') state.violation = 'target-type';
        else if (
          targetInfo.url !== ''
          && targetInfo.url !== 'about:blank'
          && !state.allowedUrls.has(targetInfo.url)
        ) {
          state.violation = isAllowedRenderedWebglPageUrl(targetInfo.url, loopbackOrigin)
            ? 'target-url-unlisted-local'
            : typeof targetInfo.url === 'string' && targetInfo.url.startsWith('chrome-error://')
              ? 'target-url-chrome-error'
              : typeof targetInfo.url === 'string' && targetInfo.url.startsWith('chrome://')
                ? 'target-url-chrome-internal'
                : typeof targetInfo.url === 'string' && /^https?:\/\//u.test(targetInfo.url)
                  ? 'target-url-external-web'
                  : typeof targetInfo.url === 'string' && targetInfo.url.startsWith('blob:')
                      ? 'target-url-blob'
                      : typeof targetInfo.url === 'string' && targetInfo.url.startsWith('data:')
                        ? 'target-url-data'
                        : 'target-url-external';
        }
        return;
      }
      if (method === 'Network.requestWillBeSent') {
        const url = params?.request?.url;
        if (!isAllowedProbeResourceUrl(url)) {
          state.violation = 'network';
        }
        return;
      }
      if (method === 'Network.webSocketCreated') {
        if (!isAllowedRenderedWebglPageUrl(params?.url, loopbackOrigin)) {
          state.violation = 'websocket';
        }
      }
    });
    await devtools.open();
    const target = selectBlankPageTarget(
      await devtools.browserCommand('Target.getTargets', {
        filter: [{ type: 'page', exclude: false }, { exclude: true }],
      })
    );
    state.targetId = target.targetId;
    await devtools.attachToPage(target.targetId);
    await Promise.all([
      devtools.command('Page.enable'),
      devtools.command('Runtime.enable'),
      devtools.command('Log.enable'),
      devtools.command('Network.enable'),
      devtools.command('Page.setDownloadBehavior', { behavior: 'deny' }),
      devtools.browserCommand('Target.setDiscoverTargets', {
        discover: true,
        filter: [{ type: 'page', exclude: false }, { exclude: true }],
      }),
      devtools.command('Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }],
      }),
    ]);
    for (const probeCase of cases) {
      try {
        await runRenderedCase(devtools, probeCase, state);
      } catch (error) {
        throw new Error(`Rendered WebGL case ${probeCase.id} failed.`, { cause: error });
      }
    }
    try {
      await runRenderedActiveWorkerCase(devtools, activeWorkerCase, state);
    } catch (error) {
      throw new Error('Rendered WebGL active generic Worker case failed.', {
        cause: error,
      });
    }
    try {
      await runRenderedOccupancyStressCase(devtools, occupancyStressCase, state);
    } catch (error) {
      throw new Error('Rendered WebGL all-node occupancy stress case failed.', {
        cause: error,
      });
    }
    try {
      await journeyProbe.runQaJourneyBrowserCases(devtools, journeyCases, state);
    } catch (error) {
      throw new Error('Synthetic journey browser lane failed.', { cause: error });
    }
    try {
      const castleLodVisualEvidence = await castleLodVisualProbe.runCastleLodVisualEvidenceBrowserCase(devtools, {
        port: vite.port,
        state,
      });
      onCastleLodVisualEvidence?.(castleLodVisualEvidence);
    } catch (error) {
      throw new Error('Local castle LOD visual evidence lane failed.', { cause: error });
    }
    if (state.violation) {
      throw new Error(`Headless browser left the local QA boundary: ${state.violation}.`);
    }
    return RENDERED_WEBGL_QA_CASE_COUNT;
  } finally {
    await cleanupRenderedWebglProbeResources({
      castleLodVisualSource,
      chrome,
      devtools,
      disposeCastleLodVisualEvidenceSource,
      removeProfile: () => rm(temporaryProfileDirectory, { recursive: true, force: true }),
      vite,
    });
  }
}

async function main() {
  if (process.argv.length !== 2) {
    process.stderr.write('Usage: rendered-webgl-browser-probe\n');
    process.exitCode = 64;
    return;
  }
  try {
    let castleLodVisualBoundary;
    let castleLodVisualEvidence;
    const passedCaseCount = await runRenderedWebglBrowserProbe({
      onCastleLodVisualBoundary: (boundary) => {
        castleLodVisualBoundary = boundary;
      },
      onCastleLodVisualEvidence: (evidence) => {
        castleLodVisualEvidence = evidence;
      },
    });
    const lodMetrics = castleLodVisualEvidence?.profiles;
    if (!lodMetrics || !castleLodVisualBoundary) {
      throw new Error('Castle LOD visual evidence did not complete.');
    }
    const lodFidelitySummary = `aggregate castle LOD fidelity ${JSON.stringify(lodMetrics)}`;
    process.stdout.write(
      `Warpkeep local browser QA passed: ${passedCaseCount} rendered cases, one active generic `
      + `Worker lifecycle check, one all-node occupancy stress check, 25 journey checks, and `
      + `loopback LOD boundary ${JSON.stringify(castleLodVisualBoundary)}, ${lodFidelitySummary}.\n`
    );
  } catch {
    process.stderr.write('Warpkeep rendered WebGL QA failed closed.\n');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// Keep the command-line entrypoint attached to module evaluation. The probe
// owns short-lived browser and server handles, and an unobserved async call
// can make shell reporting depend on host scheduling even though the exported
// runner correctly fails closed. Top-level await makes the package script's
// exit status and final aggregate line authoritative too.
if (isMain) await main();
