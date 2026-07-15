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

const DESKTOP_VIEWPORT = Object.freeze({ width: 1_440, height: 900 });
const FULL_HD_VIEWPORT = Object.freeze({ width: 1_920, height: 1_080 });
const TABLET_VIEWPORT = Object.freeze({ width: 1_024, height: 768 });
const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });
const SHORT_LANDSCAPE_VIEWPORT = Object.freeze({ width: 667, height: 375 });
export const RENDERED_WEBGL_QA_CASE_COUNT = 14;
export const RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS = 112;
export const RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS = 0.015;
// Supplying `server.fs.deny` replaces Vite's defaults instead of appending to
// them. Keep Vite 8's four reviewed defaults explicitly, then add the source
// cache boundary required by the local LOD evidence route.
export const RENDERED_WEBGL_QA_VITE_FS_DENY = Object.freeze([
  '.env',
  '.env.*',
  '*.{crt,pem}',
  '**/.git/**',
  '**/.cache/**',
]);
const RENDERED_WEBGL_QA_LABEL_ANGLE_TOLERANCE_RADIANS = 0.002;
const RENDERED_WEBGL_QA_CASTLE_POINTER_ACTIVATION_CASE_ID = 'desktop-balanced';
// Castle labels attach immediately above the projected roof. This depth is
// deliberately below the interactive label and inside the rendered keep body
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
const RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS = 10_000;
const TERRAIN_PRESENTATION_BUDGETS = Object.freeze({
  high: Object.freeze({ semanticFeatureCount: 1_100, totalDetailInstanceCount: 7_000 }),
  balanced: Object.freeze({ semanticFeatureCount: 800, totalDetailInstanceCount: 5_500 }),
  reduced: Object.freeze({ semanticFeatureCount: 400, totalDetailInstanceCount: 3_000 }),
});
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
  return markedDisplaced
    ? distance >= 12 - RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS
    : distance < 12 + RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS;
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
  return Object.freeze([
    Object.freeze({
      id: 'desktop-high',
      expectedPresentationMode: 'observer',
      expectedQuality: 'high',
      interaction: 'default',
      minimumLabelCount: 14,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'high' }),
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'desktop-balanced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      minimumLabelCount: 14,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'full-hd-balanced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      minimumLabelCount: 16,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: FULL_HD_VIEWPORT,
    }),
    Object.freeze({
      id: 'tablet-balanced-inspector',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'inspector',
      minimumLabelCount: 12,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: TABLET_VIEWPORT,
    }),
    // Player chrome has different identity, action, and inspection semantics
    // from the read-only observer. Exercise the tablet docked inspector with
    // the real player HUD rather than assuming the observer case covers it.
    Object.freeze({
      id: 'tablet-balanced-player-inspector',
      expectedPlayerActionControlState: 'visible',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'inspector',
      minimumLabelCount: 12,
      url: renderedWebglQaUrl({
        mode: 'player',
        port: selectedPort,
        quality: 'balanced'
      }),
      viewport: TABLET_VIEWPORT,
    }),
    Object.freeze({
      id: 'mobile-balanced-cluster',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'cluster',
      minimumLabelCount: 10,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: MOBILE_VIEWPORT,
    }),
    Object.freeze({
      id: 'desktop-reduced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'reduced',
      interaction: 'default',
      minimumLabelCount: 10,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'reduced' }),
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'desktop-invalid-fallback',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      minimumLabelCount: 14,
      url: `${origin}${RENDERED_WEBGL_QA_ROUTE}?quality=invalid`,
      viewport: DESKTOP_VIEWPORT,
    }),
    Object.freeze({
      id: 'mobile-balanced',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'default',
      minimumLabelCount: 10,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: MOBILE_VIEWPORT,
    }),
    Object.freeze({
      id: 'mobile-reduced-inspector',
      expectedPresentationMode: 'observer',
      expectedQuality: 'reduced',
      interaction: 'inspector',
      minimumLabelCount: 8,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'reduced' }),
      viewport: MOBILE_VIEWPORT,
    }),
    Object.freeze({
      id: 'short-landscape-explore',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'explore',
      minimumLabelCount: 6,
      url: renderedWebglQaUrl({ port: selectedPort, quality: 'balanced' }),
      viewport: SHORT_LANDSCAPE_VIEWPORT,
    }),
    // This height-specific player layout retains the compact Menu/Home rail
    // alongside the right-docked Explorer. It is intentionally distinct from
    // the observer Explore case, whose read-only chrome cannot prove that
    // player controls remain usable in the same constrained viewport.
    Object.freeze({
      id: 'short-landscape-balanced-player-explore',
      expectedPlayerActionControlState: 'visible',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'explore',
      minimumLabelCount: 6,
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
      minimumLabelCount: 14,
      url: renderedWebglQaUrl({
        mode: 'player',
        port: selectedPort,
        quality: 'balanced'
      }),
      viewport: DESKTOP_VIEWPORT,
    }),
    // The player presentation owns the mobile HUD, including the compact
    // Menu/Home rail and Explore affordance. Keep this separate from observer
    // cases so a change to player-only chrome cannot be masked by the
    // intentionally read-only observer matrix.
    Object.freeze({
      id: 'mobile-balanced-player',
      expectedPresentationMode: 'player',
      expectedQuality: 'balanced',
      interaction: 'default',
      minimumLabelCount: 10,
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

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(message);
  return value;
}

/**
 * The local browser fixture derives this point from a roof-attached label but
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
    'environmentLighting',
    'exploreAccessibleCastleCount',
    'exploreCastleCount',
    'fixture',
    'focusedReadableLabelDomFocusCount',
    'focusedReadableLabelCount',
    'href',
    'interactionState',
    'individualCastleCount',
    'labelAccountingValid',
    'labelCollisionCount',
    'labelCount',
    'labelCullReasons',
    'labelEligibleCount',
    'labelClusteredCount',
    'labelClusterOverflowCount',
    'labelCastleOverlapCount',
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
    'observerBadgeState',
    'presentationMode',
    'quality',
    'raycastTargetCount',
    'readyAfterMilliseconds',
    'readyOverlayVisible',
    'recenterKeepControlState',
    'renderer',
    'presentedModelCount',
    'returnToMenuControlState',
    'semanticTerrainCellCount',
    'semanticTerrainFeatureCount',
    'semanticTerrainFeatureDrawCalls',
    'semanticTerrainKindCount',
    'status',
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
  // A cluster must leave its revealed label focused; that label is the
  // interaction surface under test. An inspector, however, can legitimately
  // reserve screen space that causes its source label to be culled by the
  // collision-safe layout. If it survives, focus can remain on either the
  // label or the newly opened inspector. Inspector activation is instead
  // proven directly by the bounded label-action evidence below the browser
  // boundary.
  const expectedFocusedReadableLabelCount = expected.interaction === 'cluster'
    ? 1
    : expected.interaction === 'inspector' ? undefined : 0;
  const expectedFocusedReadableLabelDomFocusCount = expected.interaction === 'cluster'
    ? 1
    : expected.interaction === 'inspector' ? undefined : 0;
  const expectedExploreCastleCount = expected.interaction === 'explore'
    ? candidate.castleCount
    : 0;
  const clusterInteractionEvidenceValid = expected.interaction !== 'cluster' || (
    Number.isSafeInteger(expected.clusterButtonCountBefore)
    && expected.clusterButtonCountBefore > 0
    && Number.isSafeInteger(expected.clusterMemberCountBefore)
    && expected.clusterMemberCountBefore > 0
  );
  const presentationControlsMayBeOccluded = ['inspector', 'explore'].includes(
    expected.interaction
  );
  const expectedPlayerActionControlState = expected.expectedPlayerActionControlState;
  const expectedPresentationControlStateValid = (state) => state === 'visible'
    || (presentationControlsMayBeOccluded && state === 'hidden');
  const expectedPlayerActionControlStateValid = (state) => (
    expectedPlayerActionControlState === undefined
      ? expectedPresentationControlStateValid(state)
      : state === expectedPlayerActionControlState
  );
  const terrainBudgets = TERRAIN_PRESENTATION_BUDGETS[expected.expectedQuality];
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
    candidate.semanticTerrainCellCount !== 1_261 ? 'semantic-terrain-cell-count' : '',
    candidate.semanticTerrainKindCount !== 7 ? 'semantic-terrain-kind-count' : '',
    !terrainBudgets
      || !Number.isSafeInteger(candidate.semanticTerrainFeatureCount)
      || candidate.semanticTerrainFeatureCount < 1
      || candidate.semanticTerrainFeatureCount > terrainBudgets.semanticFeatureCount
      ? 'semantic-terrain-feature-budget' : '',
    !Number.isSafeInteger(candidate.semanticTerrainFeatureDrawCalls)
      || candidate.semanticTerrainFeatureDrawCalls < 1
      || candidate.semanticTerrainFeatureDrawCalls > 5
      ? 'semantic-terrain-feature-draw-calls' : '',
    !terrainBudgets
      || !Number.isSafeInteger(candidate.totalTerrainDetailInstanceCount)
      || candidate.totalTerrainDetailInstanceCount < candidate.semanticTerrainFeatureCount
      || candidate.totalTerrainDetailInstanceCount > terrainBudgets.totalDetailInstanceCount
      ? 'total-terrain-detail-budget' : '',
    !Number.isSafeInteger(candidate.totalTerrainDetailDrawCalls)
      || candidate.totalTerrainDetailDrawCalls < candidate.semanticTerrainFeatureDrawCalls
      || candidate.totalTerrainDetailDrawCalls > 8
      ? 'total-terrain-detail-draw-calls' : '',
    !Number.isSafeInteger(candidate.labelEligibleCount)
      || candidate.labelEligibleCount < 0 ? 'label-eligible-shape' : '',
    !Number.isSafeInteger(candidate.labelPlacedCount)
      || candidate.labelPlacedCount < 0 ? 'label-placed-shape' : '',
    !Number.isSafeInteger(candidate.labelUnplacedCount)
      || candidate.labelUnplacedCount < 0 ? 'label-unplaced-shape' : '',
    candidate.labelEligibleCount !== candidate.labelPlacedCount + candidate.labelUnplacedCount
      ? 'label-coverage-total' : '',
    candidate.labelPlacedCount !== candidate.labelCount ? 'label-placement-dom' : '',
    candidate.individualCastleCount !== candidate.labelPlacedCount
      ? 'individual-label-mismatch' : '',
    !Number.isSafeInteger(candidate.presentedModelCount)
      || candidate.presentedModelCount < candidate.labelEligibleCount
      || candidate.presentedModelCount > candidate.castleCount
      ? 'presented-model-mismatch' : '',
    candidate.raycastTargetCount !== candidate.presentedModelCount
      ? 'raycast-target-mismatch' : '',
    !Number.isSafeInteger(candidate.labelClusteredCount)
      || candidate.labelClusteredCount < 0 ? 'label-clustered-shape' : '',
    !Number.isSafeInteger(candidate.labelClusterOverflowCount)
      || candidate.labelClusterOverflowCount < 0 ? 'label-cluster-overflow-shape' : '',
    candidate.labelUnplacedCount
      !== candidate.labelClusteredCount + candidate.labelClusterOverflowCount
      ? 'label-cluster-accounting' : '',
    candidate.clusterMemberCount !== candidate.labelClusteredCount
      ? 'label-cluster-membership' : '',
    candidate.labelClusteredCount > 0 && candidate.clusterButtonCount < 1
      ? 'label-cluster-affordance' : '',
    candidate.accessibleClusterButtonCount !== candidate.clusterButtonCount
      ? 'label-cluster-accessibility' : '',
    // A roof-adjacent identity is preferable to a detached badge. When a
    // constrained viewport cannot place one within the bounded attachment
    // radius, exact coverage accounting routes it to the separately exercised
    // Explore surface instead of failing or floating the control elsewhere.
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
    !Number.isSafeInteger(candidate.labelCastleOverlapCount)
      || candidate.labelCastleOverlapCount !== 0
      ? 'label-castle-overlap' : '',
    !Number.isSafeInteger(candidate.labelPlacementBindingViolationCount)
      || candidate.labelPlacementBindingViolationCount !== 0
      ? 'label-placement-binding' : '',
    !Number.isSafeInteger(candidate.labelIdentityPresentationViolationCount)
      || candidate.labelIdentityPresentationViolationCount !== 0
      ? 'label-identity-presentation' : '',
    !Number.isSafeInteger(candidate.labelHitTestViolationCount)
      || candidate.labelHitTestViolationCount !== 0
      ? 'label-hit-test' : '',
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
        > RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS
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
    candidate.labelsTextBearingCount !== candidate.labelCount ? 'label-text' : '',
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
    candidate.labelsWithinViewportCount !== candidate.labelCount ? 'label-viewport' : '',
    candidate.labelCollisionCount !== 0 ? 'label-collision' : '',
    candidate.labelLeaderMismatchCount !== 0 ? 'label-leader' : '',
    candidate.labelReservedOverlapCount !== 0 ? 'label-reserved-ui' : '',
    candidate.undersizedPrimaryControlCount !== 0
      ? `touch-target:${Array.isArray(candidate.undersizedPrimaryControlKinds)
          ? candidate.undersizedPrimaryControlKinds.join('|')
          : 'invalid'}`
      : '',
    (expected.expectedPresentationMode === 'player'
      ? !expectedPlayerActionControlStateValid(candidate.recenterKeepControlState)
      : candidate.recenterKeepControlState !== 'absent')
      ? `${expected.expectedPresentationMode}-recenter-control` : '',
    (expected.expectedPresentationMode === 'player'
      ? !expectedPlayerActionControlStateValid(candidate.returnToMenuControlState)
      : candidate.returnToMenuControlState !== 'absent')
      ? `${expected.expectedPresentationMode}-return-control` : '',
    (expected.expectedPresentationMode === 'observer'
      ? !expectedPresentationControlStateValid(candidate.observerBadgeState)
      : candidate.observerBadgeState !== 'absent')
      ? `${expected.expectedPresentationMode}-observer-badge` : '',
    (expected.expectedPresentationMode === 'observer'
      ? !expectedPresentationControlStateValid(candidate.closeQaObserverControlState)
      : candidate.closeQaObserverControlState !== 'absent')
      ? `${expected.expectedPresentationMode}-observer-close` : '',
    !clusterInteractionEvidenceValid ? 'cluster-interaction-evidence' : '',
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
    semanticTerrainCellCount: candidate.semanticTerrainCellCount,
    semanticTerrainKindCount: candidate.semanticTerrainKindCount,
    semanticTerrainFeatureCount: candidate.semanticTerrainFeatureCount,
    semanticTerrainFeatureDrawCalls: candidate.semanticTerrainFeatureDrawCalls,
    totalTerrainDetailInstanceCount: candidate.totalTerrainDetailInstanceCount,
    totalTerrainDetailDrawCalls: candidate.totalTerrainDetailDrawCalls,
  });
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
      plugins: [reactPlugin(), ...localQaPlugins],
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
  const labelCoordinateSerializationEpsilon = ${RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS};
  const labelAngleToleranceRadians = ${RENDERED_WEBGL_QA_LABEL_ANGLE_TOLERANCE_RADIANS};
  const placementBindingTolerancePixels = 1;
  const minimumIdentityFontPixels = 12;
  const minimumIdentityEffectiveOpacity = 0.9;
  const overlay = document.querySelector('[data-rendered-webgl-status]');
  const map = document.querySelector('.realm-map-screen');
  const canvas = map?.querySelector('canvas');
  const integer = (value) => /^\\d+$/.test(value ?? '') ? Number(value) : null;
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
  const placementBindingValid = (control, xProperty, yProperty) => {
    if (!mapRect) return false;
    const x = cssUnitNumber(control, xProperty, 'px');
    const y = cssUnitNumber(control, yProperty, 'px');
    const bounds = rect(control);
    const renderedX = (bounds.left + bounds.right) / 2 - mapRect.left;
    const renderedY = bounds.bottom - mapRect.top;
    return Number.isFinite(x)
      && Number.isFinite(y)
      && Math.abs(renderedX - x) <= placementBindingTolerancePixels
      && Math.abs(renderedY - y) <= placementBindingTolerancePixels;
  };
  const interiorHitTestValid = (control) => {
    const bounds = rect(control);
    const hit = document.elementFromPoint(
      (bounds.left + bounds.right) / 2,
      (bounds.top + bounds.bottom) / 2
    );
    return hit !== null && (hit === control || control.contains(hit));
  };
  const elementState = (element) => !element ? 'absent' : visible(element) ? 'visible' : 'hidden';
  const overlaps = (left, right) => left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
  const labels = [...document.querySelectorAll('button.realm-castle-label')].filter(visible);
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
        && distance <= labelMaximumAnchorDisplacement + labelCoordinateSerializationEpsilon
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
    > labelMaximumAnchorDisplacement + labelCoordinateSerializationEpsilon
    ? Math.ceil(rawClusterMaximumAnchorDisplacement)
    : Math.min(labelMaximumAnchorDisplacement, Math.ceil(rawClusterMaximumAnchorDisplacement));
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
  const activeLeaders = [...document.querySelectorAll('[data-realm-label-leader]')]
    .filter((leader) => leader.getAttribute('data-active') === 'true' && visible(leader));
  const labelAttachmentTelemetry = labels.map((label) => {
    const castleId = label.getAttribute('data-castle-id');
    const x = cssUnitNumber(label, '--realm-castle-label-x', 'px');
    const y = cssUnitNumber(label, '--realm-castle-label-y', 'px');
    const anchorX = cssUnitNumber(label, '--realm-castle-anchor-x', 'px');
    const anchorY = cssUnitNumber(label, '--realm-castle-anchor-y', 'px');
    const distance = Math.hypot(x - anchorX, y - anchorY);
    const markedDisplaced = label.getAttribute('data-displaced') === 'true';
    const matchingLeaders = activeLeaders.filter((leader) => (
      leader.getAttribute('data-castle-id') === castleId
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
      attachmentValid: Number.isFinite(distance)
        && distance <= labelMaximumAnchorDisplacement + labelCoordinateSerializationEpsilon
        && classificationValid
        && connectorValid,
      placementBindingValid: placementBindingValid(
        label,
        '--realm-castle-label-x',
        '--realm-castle-label-y'
      ),
      identityPresentationValid: identityPresentationValid(
        label,
        '.realm-castle-label__identity'
      ),
      hitTestValid: interiorHitTestValid(label)
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
  const activeLeaderIds = new Set(activeLeaders.map((leader) => leader.getAttribute('data-castle-id')));
  const displacedLabelIds = new Set(labels
    .filter((label) => label.getAttribute('data-displaced') === 'true')
    .map((label) => label.getAttribute('data-castle-id')));
  const labelLeaderMismatchCount = [...displacedLabelIds]
    .filter((castleId) => !activeLeaderIds.has(castleId)).length
    + [...activeLeaderIds].filter((castleId) => !displacedLabelIds.has(castleId)).length
    + Math.max(0, activeLeaders.length - activeLeaderIds.size);
  const reserved = [...document.querySelectorAll(
    '.realm-hud, .castle-inspection, .realm-hud__actions, '
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
    '.realm-hud__actions button, .realm-cell-navigator > button, '
      + '.realm-cell-navigator__dialog button, .realm-cell-navigator__dialog input, '
      + '.realm-cell-navigator__dialog a, '
      + '.castle-inspection button, .castle-inspection a, '
      + '[data-realm-castle-cluster]'
  )].filter(visible);
  const dialog = document.querySelector('.realm-cell-navigator__dialog');
  const inspector = document.querySelector('.castle-inspection');
  const exploreCastleButtons = [...document.querySelectorAll(
    '.realm-cell-navigator__castles button'
  )].filter(visible);
  const exploreAccessibleCastleButtons = exploreCastleButtons.filter((button) => (
    button instanceof HTMLButtonElement
    && !button.disabled
    && button.tabIndex >= 0
    && (button.getAttribute('aria-label') ?? '').trim().length > 0
    && (button.textContent ?? '').trim().length > 0
  ));
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
        : focusedReadableLabels.length > 0 ? 'cluster' : 'default',
    individualCastleCount: integer(map?.getAttribute('data-individual-castle-count')),
    presentedModelCount: integer(map?.getAttribute('data-presented-model-count')),
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
    labelsWithinViewportCount: labelRects.filter((bounds) => (
      bounds.left >= -1
      && bounds.top >= -1
      && bounds.right <= innerWidth + 1
      && bounds.bottom <= innerHeight + 1
    )).length,
    labelCollisionCount,
    labelCastleOverlapCount: integer(
      map?.getAttribute('data-label-castle-overlap-count')
    ),
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
    recenterKeepControlState: elementState(document.querySelector(
      'button[aria-label="Recenter Keep"]'
    )),
    returnToMenuControlState: elementState(document.querySelector(
      'button[aria-label="Return to Menu"]'
    )),
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
          `models=${String(value.presentedModelCount)}`
        ].join(',');
        try {
          parseRenderedWebglBrowserDom(value, expected);
          return value;
        } catch (error) {
          lastContractError = error;
          // Camera, measured labels, and responsive UI settle asynchronously.
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
          const y = bounds.top + anchorY + depth;
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

export async function applyRenderedWebglCaseInteraction(session, interaction) {
  if (interaction === 'default') return Object.freeze({});
  if (interaction === 'cluster') {
    // The accepted baseline frame already proves the mobile fixture is fully
    // rendered and collision-free. Activate its real aggregate directly: an
    // extra Show Full Realm camera animation can replace that verified layout
    // before the click, and headless animation cadence legitimately differs
    // when the QA runner owns a detached process group.
    const deadline = Date.now() + PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS;
    let lastClusterAggregate = Object.freeze({
      accessible: 0,
      clustered: 0,
      dom: 0,
      overflow: 0,
      placed: 0,
      visible: 0,
    });
    while (Date.now() < deadline) {
      const evaluation = await session.command('Runtime.evaluate', {
        expression: `(() => {
          const integer = (value) => /^\\d+$/.test(value ?? '') ? Number(value) : null;
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
          const integerAttribute = (element, name) => {
            const value = integer(element?.getAttribute(name));
            return Number.isSafeInteger(value) && value >= 0 ? value : 0;
          };
          const allClusters = [...document.querySelectorAll('[data-realm-castle-cluster]')];
          const clusters = allClusters.filter(visible);
          const accessibleClusters = clusters.filter((cluster) => (
            cluster instanceof HTMLButtonElement
            && !cluster.disabled
            && cluster.tabIndex >= 0
            && (cluster.getAttribute('aria-label') ?? '').trim().length > 0
            && (integer(cluster.getAttribute('data-cluster-count')) ?? 0) > 0
          ));
          const target = accessibleClusters[0];
          const map = document.querySelector('.realm-map-screen');
          const aggregate = {
            accessible: accessibleClusters.length,
            clustered: integerAttribute(map, 'data-label-clustered-count'),
            dom: allClusters.length,
            overflow: integerAttribute(map, 'data-label-cluster-overflow-count'),
            placed: integerAttribute(map, 'data-label-placed-count'),
            visible: clusters.length,
          };
          if (!(target instanceof HTMLButtonElement)) return { clicked: false, aggregate };
          const clusterMemberCountBefore = clusters.reduce((count, cluster) => (
            count + (integer(cluster.getAttribute('data-cluster-count')) ?? 0)
          ), 0);
          const clusterButtonCountBefore = clusters.length;
          target.focus({ preventScroll: true });
          target.click();
          return {
            clicked: true,
            aggregate,
            clusterButtonCountBefore,
            clusterMemberCountBefore
          };
        })()`,
        returnByValue: true,
      });
      const evidence = evaluation?.result?.value;
      if (
        evidence?.aggregate
        && ['accessible', 'clustered', 'dom', 'overflow', 'placed', 'visible'].every((key) => (
          Number.isSafeInteger(evidence.aggregate[key])
          && evidence.aggregate[key] >= 0
          && evidence.aggregate[key] <= 1_000
        ))
      ) {
        lastClusterAggregate = Object.freeze({ ...evidence.aggregate });
      }
      if (
        !evaluation?.exceptionDetails
        && evidence?.clicked === true
        && Number.isSafeInteger(evidence.clusterButtonCountBefore)
        && evidence.clusterButtonCountBefore > 0
        && Number.isSafeInteger(evidence.clusterMemberCountBefore)
        && evidence.clusterMemberCountBefore > 0
      ) {
        return Object.freeze({
          clusterButtonCountBefore: evidence.clusterButtonCountBefore,
          clusterMemberCountBefore: evidence.clusterMemberCountBefore,
        });
      }
      await delay(100);
    }
    throw new Error(
      'Rendered WebGL QA cluster interaction failed '
      + `(dom=${lastClusterAggregate.dom},visible=${lastClusterAggregate.visible},`
      + `accessible=${lastClusterAggregate.accessible},clustered=${lastClusterAggregate.clustered},`
      + `overflow=${lastClusterAggregate.overflow},placed=${lastClusterAggregate.placed}).`
    );
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

async function runRenderedCase(session, probeCase, state) {
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: probeCase.viewport.width,
    height: probeCase.viewport.height,
    screenWidth: probeCase.viewport.width,
    screenHeight: probeCase.viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.command('Page.navigate', { url: probeCase.url });
  const baseline = Object.freeze({ ...probeCase, interaction: 'default' });
  await waitForAcceptedRenderedDom(session, baseline, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
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
      minimumLabelCount: 1,
    });
    await waitForAcceptedRenderedDom(session, canvasActivated, state);
    await captureRenderedCasePixels(session, probeCase.viewport);
  }
  if (probeCase.interaction !== 'default') {
    const interactionEvidence = await applyRenderedWebglCaseInteraction(
      session,
      probeCase.interaction
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
      allowedUrls: new Set([
        ...cases.map((probeCase) => probeCase.url),
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
      `Warpkeep local browser QA passed: ${passedCaseCount} rendered cases, 25 journey checks, and `
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
