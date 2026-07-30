import { execFile, spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
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
import { applyRenderedWebglSfxInteraction } from './rendered-webgl-sfx-lifecycle.mjs';

export {
  applyRenderedWebglSfxInteraction,
  parseRenderedWebglSfxEvidence,
} from './rendered-webgl-sfx-lifecycle.mjs';

// The journey lane is dynamically loaded during the probe. Keep its shared
// screenshot reducer in a leaf module rather than letting it import this CLI
// module while this module's top-level await is still evaluating.
export { analyzeRenderedWebglPngScreenshot };
export {
  applyNorthernReachRenderedEvidence,
  assertNorthernReachRenderedVisual,
  parseNorthernReachRenderedEvidence,
} from './northern-reach-rendered-evidence.mjs';
export {
  applyRegionalClimateRenderedEvidence,
  assertRegionalClimateRepeatedReducedMotionEvidence,
  assertRegionalClimateRenderedVisual,
  assertSunscouredSouthRenderedTarget,
  parseRegionalClimateRenderedEvidence,
  SUNSCOURED_SOUTH_RENDERED_TARGET_MANIFEST,
} from './regional-climate-rendered-evidence.mjs';

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
const TERMINATION_GRACE_MILLISECONDS = 5_000;
// Chrome's detached helpers can take longer than the signal grace to disappear
// from the process table on a memory-constrained QA host. Verification remains
// bounded and fail-closed, but does not mistake delayed reaping for a leak.
const TERMINATION_VERIFICATION_MILLISECONDS = 15_000;
const CODESIGN_TIMEOUT_MILLISECONDS = 15_000;
const CODESIGN_MAXIMUM_BYTES = 64 * 1_024;
const CONTROLLED_RENDERER_MAXIMUM_STALE_DELETE_WARNINGS = 256;
const CONTROLLED_RENDERER_STALE_DELETE_WARNING =
  /^WebGL: INVALID_OPERATION: delete(?:VertexArray)?: object does not belong to this context$/u;
const CONTROLLED_RENDERER_WARNING_THROTTLE =
  /^WebGL: too many errors, no more errors will be reported to the console for this context\.$/u;
const LOCAL_DIAGNOSTIC_CAUSE_LIMIT = 6;
const LOCAL_DIAGNOSTIC_MESSAGE_LIMIT = 320;
const LOCAL_DIAGNOSTIC_OUTPUT_LIMIT = 1_280;
const NORTHERN_REACH_REDUCED_MOTION_HOST_WAIT_MILLISECONDS = 480;
const NORTHERN_REACH_REDUCED_MOTION_EVIDENCE_TOLERANCE = 0.000_001;
const NORTHERN_REACH_REDUCED_MOTION_COOL_SAMPLE_TOLERANCE = 2;
const NORTHERN_REACH_REDUCED_MOTION_BUCKET_TOLERANCE = 1;
const RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_HASH =
  '#warpkeep-qa-terrain-shader-fallback';
const RENDERED_WEBGL_TERRAIN_MATERIAL_SOURCE = join(
  REPOSITORY_ROOT,
  'src',
  'components',
  'realm',
  'createRealmTerrainMaterial.ts'
);
const RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_NEEDLE =
  `    try {\n`
  + `      shader.vertexShader = injectRealmTerrainVertexShader(originalVertexShader);`;
const RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_REPLACEMENT =
  `    try {\n`
  + `      if (globalThis.location?.hash === ${
    JSON.stringify(RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_HASH)
  }) {\n`
  + `        throw new Error('REALM_TERRAIN_SHADER_QA_FORCED_FALLBACK');\n`
  + `      }\n`
  + `      shader.vertexShader = injectRealmTerrainVertexShader(originalVertexShader);`;

const DESKTOP_VIEWPORT = Object.freeze({ width: 1_440, height: 900 });
const FULL_HD_VIEWPORT = Object.freeze({ width: 1_920, height: 1_080 });
const TABLET_VIEWPORT = Object.freeze({ width: 1_024, height: 768 });
const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });
const SHORT_LANDSCAPE_VIEWPORT = Object.freeze({ width: 667, height: 375 });
const RENDERED_WEBGL_WORKER_LOCOMOTION_MODEL_COUNT = 3;
const RENDERED_WEBGL_WORKER_LOCOMOTION_PRESENTED_COUNT = 400;
const RENDERED_WEBGL_WORKER_LOCOMOTION_MINIMUM_VISIBLE_PROJECTION_COUNT = 1;

/**
 * Keeps opt-in local QA diagnostics useful without copying stacks, browser
 * console payloads, absolute host paths, URLs, or long opaque values into
 * terminal output. Rendered QA uses synthetic fixtures, but this boundary
 * remains defensive so future probe errors cannot accidentally widen it.
 */
function isRenderedWebglDiagnosticError(value) {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

function readRenderedWebglDiagnosticErrorProperty(error, property) {
  try {
    return error[property];
  } catch {
    return undefined;
  }
}

export function formatRenderedWebglLocalDiagnostic(value) {
  const messages = [];
  let current = value;
  while (
    isRenderedWebglDiagnosticError(current)
    && messages.length < LOCAL_DIAGNOSTIC_CAUSE_LIMIT
  ) {
    const rawMessage = readRenderedWebglDiagnosticErrorProperty(
      current,
      'message'
    );
    const rawName = readRenderedWebglDiagnosticErrorProperty(current, 'name');
    const message = (typeof rawMessage === 'string'
      ? rawMessage
      : typeof rawName === 'string'
        ? rawName
        : 'Error')
      .replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/gu, '[url]')
      .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]+/gu, '[path]')
      .replace(/~[\\/][^\s"'<>]+/gu, '[path]')
      .replace(/\/[^\s"'<>]+/gu, '[path]')
      .replace(/[A-Za-z0-9_-]{48,}/gu, '[opaque]')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, LOCAL_DIAGNOSTIC_MESSAGE_LIMIT);
    messages.push(message || 'Error');
    current = readRenderedWebglDiagnosticErrorProperty(current, 'cause');
  }
  return (messages.join(' <- ') || 'unknown')
    .slice(0, LOCAL_DIAGNOSTIC_OUTPUT_LIMIT);
}

const RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPECS = Object.freeze([
  Object.freeze({
    id: 'full-hd-high-worker-locomotion',
    fixture: 'worker-locomotion',
    climate: 'center',
    quality: 'high',
    viewport: FULL_HD_VIEWPORT,
    reducedMotion: false,
    assetProfile: 'high',
    assetPath:
      '/models/hegemony/hegemony-supply-wagon-high-4a0f762b9dadeadd.glb',
    animatedCount: 3,
    gatheringIdleCount: 1,
    modelCount: 3,
    movingCount: 2,
    maximumVisibleProjectionCount: 2,
    wheelDrivenCount: 3,
    minimumLabelCount: 4,
  }),
  Object.freeze({
    id: 'desktop-balanced-worker-locomotion',
    fixture: 'worker-locomotion',
    climate: 'center',
    quality: 'balanced',
    viewport: DESKTOP_VIEWPORT,
    reducedMotion: false,
    assetProfile: 'balanced',
    assetPath:
      '/models/hegemony/hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb',
    animatedCount: 3,
    gatheringIdleCount: 1,
    modelCount: 3,
    movingCount: 2,
    maximumVisibleProjectionCount: 2,
    wheelDrivenCount: 3,
    minimumLabelCount: 4,
  }),
  Object.freeze({
    id: 'short-landscape-reduced-worker-locomotion',
    fixture: 'worker-locomotion',
    climate: 'center',
    quality: 'reduced',
    viewport: SHORT_LANDSCAPE_VIEWPORT,
    reducedMotion: false,
    assetProfile: 'compact',
    assetPath:
      '/models/hegemony/hegemony-supply-wagon-compact-fefb5105b95d43b4.glb',
    animatedCount: 0,
    gatheringIdleCount: 1,
    modelCount: 3,
    movingCount: 2,
    maximumVisibleProjectionCount: 2,
    wheelDrivenCount: 3,
    minimumLabelCount: 1,
  }),
  Object.freeze({
    id: 'mobile-reduced-motion-worker-locomotion',
    fixture: 'worker-locomotion',
    climate: 'center',
    quality: 'reduced',
    viewport: MOBILE_VIEWPORT,
    reducedMotion: true,
    assetProfile: 'compact',
    assetPath:
      '/models/hegemony/hegemony-supply-wagon-compact-fefb5105b95d43b4.glb',
    animatedCount: 0,
    gatheringIdleCount: 1,
    modelCount: 3,
    movingCount: 2,
    maximumVisibleProjectionCount: 2,
    wheelDrivenCount: 0,
    minimumLabelCount: 4,
  }),
  Object.freeze({
    id: 'desktop-balanced-northern-worker-locomotion',
    fixture: 'worker-locomotion-northern',
    climate: 'north',
    quality: 'balanced',
    viewport: DESKTOP_VIEWPORT,
    reducedMotion: false,
    assetProfile: 'balanced',
    assetPath:
      '/models/hegemony/hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb',
    animatedCount: 4,
    gatheringIdleCount: 1,
    modelCount: 4,
    movingCount: 3,
    maximumVisibleProjectionCount: 3,
    wheelDrivenCount: 4,
    minimumLabelCount: 4,
  }),
  Object.freeze({
    id: 'desktop-balanced-southern-worker-locomotion',
    fixture: 'worker-locomotion-southern',
    climate: 'south',
    quality: 'balanced',
    viewport: DESKTOP_VIEWPORT,
    reducedMotion: false,
    assetProfile: 'balanced',
    assetPath:
      '/models/hegemony/hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb',
    animatedCount: 4,
    gatheringIdleCount: 1,
    modelCount: 4,
    movingCount: 3,
    maximumVisibleProjectionCount: 3,
    wheelDrivenCount: 4,
    minimumLabelCount: 4,
  }),
]);
const RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPEC_BY_ID = new Map(
  RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPECS.map((spec) => [spec.id, spec])
);
export const RENDERED_WEBGL_QA_CASE_COUNT = 15;
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
const RENDERED_WEBGL_QA_MAP_GESTURE_CASES = new Map([
  ['desktop-balanced-player', false],
  ['mobile-balanced-persistent-labels', true],
]);
const RENDERED_WEBGL_QA_LABEL_KEYBOARD_CASE_ID = 'desktop-high';
const RENDERED_WEBGL_QA_SFX_CASE_ID = 'desktop-balanced-player';
const RENDERED_WEBGL_QA_RESOURCE_OCCUPANT_CASE_IDS = new Set([
  'desktop-balanced',
  'desktop-balanced-player',
  'desktop-reduced',
  'mobile-reduced-inspector',
]);

function renderedWebglResourceResetUrl(value) {
  const url = new URL(value);
  url.searchParams.set('fixture', 'baseline');
  return url.toString();
}

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

export function renderedWebglTerrainShaderFallbackProbeCase(port) {
  const selectedPort = exactPort(port);
  return Object.freeze({
    id: 'desktop-balanced-terrain-shader-fallback',
    expectedPresentationMode: 'observer',
    expectedQuality: 'balanced',
    expectedTerrainShaderFallback: true,
    interaction: 'default',
    maximumLabelOverflowCount: 0,
    minimumLabelCount: 10,
    url: renderedWebglQaUrl({
      port: selectedPort,
      quality: 'balanced',
    }) + RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_HASH,
    viewport: DESKTOP_VIEWPORT,
  });
}

export function renderedWebglWorkerLocomotionProbeCases(port) {
  const selectedPort = exactPort(port);
  return Object.freeze(RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPECS.map((spec) => (
    Object.freeze({
      id: spec.id,
      expectedPresentationMode: 'player',
      expectedQuality: spec.quality,
      ...(spec.reducedMotion ? { expectedReducedMotion: true } : {}),
      interaction: 'default',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: spec.minimumLabelCount,
      url: renderedWebglQaUrl({
        fixture: spec.fixture,
        mode: 'player',
        port: selectedPort,
        quality: spec.quality,
      }),
      viewport: spec.viewport,
      workerLocomotion: Object.freeze({
        assetProfile: spec.assetProfile,
        assetPath: spec.assetPath,
        expectedAnimatedCount: spec.animatedCount,
        expectedFallbackCount: 0,
        expectedGatheringIdleCount: spec.gatheringIdleCount,
        expectedModelCount: spec.modelCount,
        expectedMovingCount: spec.movingCount,
        minimumVisibleProjectionCount:
          RENDERED_WEBGL_WORKER_LOCOMOTION_MINIMUM_VISIBLE_PROJECTION_COUNT,
        maximumVisibleProjectionCount: spec.maximumVisibleProjectionCount,
        expectedWheelDrivenCount: spec.wheelDrivenCount,
        fixtureVariant: spec.fixture,
        climate: spec.climate,
        reducedMotion: spec.reducedMotion,
      }),
    })
  )));
}

/** Compatibility selector for callers that still request the original lane. */
export function renderedWebglWorkerLocomotionProbeCase(port) {
  return renderedWebglWorkerLocomotionProbeCases(port).find((probeCase) => (
    probeCase.id === 'desktop-balanced-worker-locomotion'
  ));
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
  'desktop-balanced',
  'full-hd-balanced',
  'desktop-reduced',
]);
const RENDERED_WEBGL_QA_QUALITY_METRIC_CASE_IDS = new Set([
  'desktop-high',
  'desktop-balanced',
  'desktop-reduced',
]);
const RENDERED_WEBGL_QA_NORTHERN_REACH_CASE_IDS = new Set([
  'desktop-high',
  'desktop-balanced',
  'desktop-reduced',
  'mobile-balanced',
  'short-landscape-balanced-northern',
]);
const RENDERED_WEBGL_QA_SUNSCOURED_SOUTH_CASE_IDS = new Set([
  'desktop-high',
  'desktop-balanced',
  'desktop-reduced',
  'mobile-balanced',
  'short-landscape-explore',
]);
const RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_STEPS = 5;
const RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_DELTA = -250;
const RENDERED_WEBGL_QA_MAP_DRAG_OFFSETS = Object.freeze([
  Object.freeze({ x: 3, y: 1 }),
  Object.freeze({ x: 8, y: 2 }),
  Object.freeze({ x: 52, y: 14 }),
]);
const RENDERED_WEBGL_QA_WATER_OVERVIEW_DRAG = Object.freeze({
  x: -500,
  y: -270,
});
const RENDERED_WEBGL_QA_WATER_OVERVIEW_DRAG_COUNT = 4;
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
const RENDERED_WEBGL_QA_GRASS_BUDGETS = Object.freeze({
  high: Object.freeze({
    instances: 7_000,
    triangles: 189_000,
    drawCalls: 3,
    cacheEntries: 2_048,
  }),
  balanced: Object.freeze({
    instances: 4_000,
    triangles: 84_000,
    drawCalls: 3,
    cacheEntries: 1_024,
  }),
  reduced: Object.freeze({
    instances: 1_200,
    triangles: 18_000,
    drawCalls: 3,
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

export async function readReviewedChromeExecutableIdentity() {
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

export function exactChromeExecutableIdentity(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key])
    && Object.keys(right).length === Object.keys(left).length;
}

export async function attestStableHeadlessChromeExecutable(expectedIdentity) {
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
      expectedReducedMotion: true,
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
    // Prove the fixed northern journey from the constrained observer
    // landscape. The adjacent player case already owns the portrait-menu
    // contract; keeping the reviewed navigator visible here makes the
    // geographic selection a real accessible interaction rather than a
    // programmatic click on hidden player chrome.
    Object.freeze({
      id: 'short-landscape-balanced-northern',
      expectedPresentationMode: 'observer',
      expectedQuality: 'balanced',
      interaction: 'explore',
      maximumLabelOverflowCount: 0,
      minimumLabelCount: 1,
      url: renderedWebglQaUrl({
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
      '--mute-audio',
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
  if (![
    'Fetch.continueRequest',
    'Fetch.failRequest',
    'Fetch.fulfillRequest',
  ].includes(method)) return false;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return exactMessageKeys(value, new Set(['code', 'message']))
    && value.code === -32602
    && value.message === 'Invalid InterceptionId.';
}

const BENIGN_RUNTIME_EVALUATION_TRANSITION_MESSAGES = new Set([
  'Cannot find context with specified id',
  'Execution context was destroyed.',
  'Execution context was destroyed, most likely because of a navigation.',
  'Inspected target navigated or closed',
]);

export function isBenignRuntimeEvaluationTransitionError(method, value) {
  if (method !== 'Runtime.evaluate') return false;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return exactMessageKeys(value, new Set(['code', 'message']))
    && value.code === -32000
    && typeof value.message === 'string'
    && BENIGN_RUNTIME_EVALUATION_TRANSITION_MESSAGES.has(value.message);
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
      'inertiaPolicyValid',
      'inertiaSettled',
      'inputClean',
      'rendererGenerationStable',
      'selectionStable',
      'settled',
      'uiStable',
      'wheelMoved',
    ]))
    || candidate.dragMoved !== true
    || candidate.inertiaPolicyValid !== true
    || candidate.inertiaSettled !== true
    || candidate.inputClean !== true
    || candidate.rendererGenerationStable !== true
    || candidate.selectionStable !== true
    || candidate.settled !== true
    || candidate.uiStable !== true
    || candidate.wheelMoved !== true
  ) throw new TypeError(
    `Invalid rendered WebGL map gesture evidence (${JSON.stringify(candidate)}).`
  );
  return Object.freeze({
    dragMoved: true,
    inertiaPolicyValid: true,
    inertiaSettled: true,
    inputClean: true,
    rendererGenerationStable: true,
    selectionStable: true,
    settled: true,
    uiStable: true,
    wheelMoved: true,
  });
}

export function parseRenderedWebglPresentationBandEvidence(value) {
  const candidate = exactRecord(
    value,
    'Invalid rendered WebGL presentation-band evidence.'
  );
  const keys = [
    'cameraSynchronized',
    'closeHierarchySimplified',
    'noUiChurn',
    'overviewMacroOnly',
    'overviewOwnIdentityRetained',
    'overviewPeerIdentitySimplified',
    'sceneStable',
    'strategyHierarchyExpanded',
    'visitedAllBands',
  ];
  if (!exactMessageKeys(candidate, new Set(keys))) {
    throw new TypeError('Invalid rendered WebGL presentation-band evidence shape.');
  }
  const failures = keys.filter((key) => candidate[key] !== true);
  if (failures.length > 0) {
    throw new TypeError(
      `Invalid rendered WebGL presentation-band evidence: ${failures.join(',')}.`
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, true])));
}

export function parseRenderedWebglQualityMetrics(value) {
  const candidate = exactRecord(
    value,
    'Invalid rendered WebGL quality metrics.'
  );
  const keys = [
    'cameraMode',
    'cameraProjectionCount',
    'cameraProjectionToken',
    'cameraStateToken',
    'cameraSynchronized',
    'cameraTargetKind',
    'cameraZoom',
    'decorativeForestCacheEntries',
    'decorativeForestCacheHighWaterMark',
    'decorativeForestCacheLimit',
    'decorativeForestDrawCalls',
    'decorativeForestInstances',
    'decorativeForestMotionState',
    'decorativeForestTriangles',
    'grassAnimated',
    'grassTargetAnimationCadence',
    'grassCacheEntries',
    'grassCacheHighWaterMark',
    'grassCacheLimit',
    'grassDrawCalls',
    'grassInstances',
    'grassTriangles',
    'presentationBand',
    'quality',
    'routeDrawCalls',
    'routeSegments',
    'routeTriangles',
    'routeVisible',
    'sharedForestInstances',
    'sharedForestTriangles',
    'terrainDetailDrawCalls',
    'terrainDetailInstances',
    'terrainTriangles',
    'viewportHeight',
    'viewportWidth',
    'waterDrawCalls',
    'waterTriangles',
    'workerAnimated',
    'workerAnimationTransitions',
    'workerFallbackTriangles',
    'workerModels',
    'workerPresented',
  ];
  const numericKeys = keys.filter((key) => ![
    'cameraMode',
    'cameraProjectionToken',
    'cameraStateToken',
    'cameraSynchronized',
    'cameraTargetKind',
    'cameraZoom',
    'decorativeForestMotionState',
    'grassAnimated',
    'presentationBand',
    'quality',
  ].includes(key));
  if (
    !exactMessageKeys(candidate, new Set(keys))
    || !['high', 'balanced', 'reduced'].includes(candidate.quality)
    || !['realm', 'approach', 'keep'].includes(candidate.cameraMode)
    || !/^[0-9a-f]{8}$/u.test(candidate.cameraProjectionToken)
    || !/^[0-9a-f]{24}$/u.test(candidate.cameraStateToken)
    || ![
      'realm',
      'founding-district',
      'keep',
      'cell',
      'cell-location',
      'castle',
      'castle-location',
    ].includes(candidate.cameraTargetKind)
    || !/^(?:0|[1-9]\d*)\.\d{6}$/u.test(candidate.cameraZoom)
    || !['overview', 'strategy', 'close'].includes(candidate.presentationBand)
    || candidate.cameraSynchronized !== true
    || candidate.decorativeForestMotionState !== 'static'
    || typeof candidate.grassAnimated !== 'boolean'
    || numericKeys.some((key) => (
      !Number.isSafeInteger(candidate[key]) || candidate[key] < 0
    ))
    || candidate.viewportWidth < 1
    || candidate.viewportHeight < 1
    || candidate.decorativeForestCacheEntries
      > candidate.decorativeForestCacheHighWaterMark
    || candidate.decorativeForestCacheHighWaterMark
      > candidate.decorativeForestCacheLimit
    || candidate.grassCacheEntries > candidate.grassCacheHighWaterMark
    || candidate.grassCacheHighWaterMark > candidate.grassCacheLimit
  ) throw new TypeError('Invalid rendered WebGL quality metrics.');
  return Object.freeze(Object.fromEntries(keys.map((key) => [
    key,
    candidate[key]
  ])));
}

export function parseRenderedWebglViewportRotationEvidence(value) {
  const candidate = exactRecord(
    value,
    'Invalid rendered WebGL viewport-rotation evidence.'
  );
  const keys = [
    'cameraIntentPreserved',
    'compositionUsable',
    'focusPreserved',
    'inertiaCancelled',
    'rendererStable',
    'sameCanvas',
    'selectionPreserved',
    'viewportRotated',
  ];
  if (
    !exactMessageKeys(candidate, new Set(keys))
    || keys.some((key) => candidate[key] !== true)
  ) throw new TypeError('Invalid rendered WebGL viewport-rotation evidence.');
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, true])));
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
    'compactOverviewCullingValid',
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
  const conditionalOverviewKeys = new Set([
    'cameraNeutral',
    'cameraNeutralAfterClose',
    'cameraAnchorPopulationValid',
    'cameraIndependentAnchorCoverage',
    'cameraNeutralWhileOpen',
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
  ]);
  if (typeof candidate.compactOverviewCullingValid !== 'boolean') {
    throw new TypeError('Invalid rendered WebGL resource occupant evidence shape.');
  }
  const expectedOverviewValue = !candidate.compactOverviewCullingValid;
  const failures = keys.filter((key) => (
    key === 'compactOverviewCullingValid'
      ? false
      : conditionalOverviewKeys.has(key)
        ? candidate[key] !== expectedOverviewValue
        : candidate[key] !== true
  ));
  if (failures.length > 0) {
    throw new TypeError(
      `Invalid rendered WebGL resource occupant evidence: ${failures.join(',')}.`
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [
    key,
    candidate[key]
  ])));
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
    'foreignRecordGeneric',
    'foreignRecordPortraitReady',
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

const RENDERED_WEBGL_WORKER_LOCOMOTION_COUNT_TELEMETRY_KEYS = Object.freeze([
  'clipIdleCount',
  'clipStartCount',
  'clipStopCount',
  'clipTurnLeftCount',
  'clipTurnRightCount',
  'clipWalkCount',
  'gatheringIdleCount',
  'lateModelPhaseRestorationCount',
  'modelPhaseRestorationCount',
  'movingCount',
  'oneShotOverrunCount',
  'repeatedTurnSuppressionCount',
  'renderedClipIdleCount',
  'renderedClipStartCount',
  'renderedClipStopCount',
  'renderedClipTurnLeftCount',
  'renderedClipTurnRightCount',
  'renderedClipWalkCount',
  'reversalCount',
  'startingCount',
  'stoppingCount',
  'turningCount',
  'cruisingCount',
  'wheelDistanceMismatchCount',
  'wheelDrivenCount',
]);
const RENDERED_WEBGL_WORKER_LOCOMOTION_METRIC_TELEMETRY_KEYS = Object.freeze([
  'maximumHeadingError',
  'maximumPositionCorrection',
  'maximumSpeed',
]);
const RENDERED_WEBGL_WORKER_LOCOMOTION_TELEMETRY_KEYS = Object.freeze([
  ...RENDERED_WEBGL_WORKER_LOCOMOTION_COUNT_TELEMETRY_KEYS,
  ...RENDERED_WEBGL_WORKER_LOCOMOTION_METRIC_TELEMETRY_KEYS,
].sort());

function parseRenderedWebglWorkerLocomotionTelemetry(value, spec) {
  const candidate = exactRecord(
    value,
    'Invalid rendered WebGL Worker locomotion telemetry.'
  );
  if (!exactMessageKeys(
    candidate,
    new Set(RENDERED_WEBGL_WORKER_LOCOMOTION_TELEMETRY_KEYS)
  )) {
    throw new TypeError('Invalid rendered WebGL Worker locomotion telemetry shape.');
  }
  for (const key of RENDERED_WEBGL_WORKER_LOCOMOTION_COUNT_TELEMETRY_KEYS) {
    if (
      !Number.isSafeInteger(candidate[key])
      || candidate[key] < 0
    ) {
      throw new TypeError('Invalid rendered WebGL Worker locomotion telemetry.');
    }
  }
  for (const key of RENDERED_WEBGL_WORKER_LOCOMOTION_METRIC_TELEMETRY_KEYS) {
    if (
      !Number.isFinite(candidate[key])
      || candidate[key] < 0
    ) {
      throw new TypeError('Invalid rendered WebGL Worker locomotion telemetry.');
    }
  }
  const clipCount = [
    'clipIdleCount',
    'clipStartCount',
    'clipStopCount',
    'clipTurnLeftCount',
    'clipTurnRightCount',
    'clipWalkCount',
  ].reduce((total, key) => total + candidate[key], 0);
  const phaseCount = [
    'startingCount',
    'cruisingCount',
    'turningCount',
    'stoppingCount',
    'gatheringIdleCount',
  ].reduce((total, key) => total + candidate[key], 0);
  const renderedClipCount = [
    'renderedClipIdleCount',
    'renderedClipStartCount',
    'renderedClipStopCount',
    'renderedClipTurnLeftCount',
    'renderedClipTurnRightCount',
    'renderedClipWalkCount',
  ].reduce((total, key) => total + candidate[key], 0);
  const expectedRenderedIdleCount =
    spec.animatedCount > 0 ? spec.gatheringIdleCount : 0;
  const expectedRenderedWalkCount =
    spec.animatedCount > 0 ? spec.movingCount : 0;
  if (
    candidate.clipIdleCount !== spec.gatheringIdleCount
    || candidate.gatheringIdleCount !== spec.gatheringIdleCount
    || candidate.renderedClipIdleCount !== expectedRenderedIdleCount
    || candidate.renderedClipStartCount !== 0
    || candidate.renderedClipStopCount !== 0
    || candidate.renderedClipTurnLeftCount !== 0
    || candidate.renderedClipTurnRightCount !== 0
    || candidate.renderedClipWalkCount !== expectedRenderedWalkCount
    || renderedClipCount !== spec.animatedCount
    || candidate.maximumSpeed <= 0
    || candidate.movingCount !== spec.movingCount
    || candidate.oneShotOverrunCount !== 0
    || candidate.wheelDistanceMismatchCount !== 0
    || candidate.wheelDrivenCount !== spec.wheelDrivenCount
    || clipCount !== spec.modelCount
    || phaseCount !== spec.modelCount
  ) {
    throw new TypeError('Invalid rendered WebGL Worker locomotion telemetry contract.');
  }
  return Object.freeze(Object.fromEntries(
    RENDERED_WEBGL_WORKER_LOCOMOTION_TELEMETRY_KEYS.map((key) => [
      key,
      candidate[key],
    ])
  ));
}

/**
 * Privacy-safe frame evidence for the synthetic moving-wagon lane. Root
 * projections contain only phase plus bounded viewport coordinates; Worker
 * IDs, castle identities, routes, world coordinates, and asset URLs never
 * cross CDP. Every post-integration field is mandatory and the case metadata
 * binds the evidence to one member of the reviewed real-asset matrix.
 */
export function parseRenderedWebglWorkerLocomotionEvidence(value) {
  const candidate = exactRecord(
    value,
    'Invalid rendered WebGL Worker locomotion evidence.'
  );
  const spec = typeof candidate.caseId === 'string'
    ? RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPEC_BY_ID.get(candidate.caseId)
    : undefined;
  if (
    !exactMessageKeys(candidate, new Set([
      'approvedAssetLoaded',
      'animatedCount',
      'assetProfile',
      'caseId',
      'fallbackCount',
      'fixtureSelected',
      'modelCount',
      'movementPixels',
      'presentedCount',
      'quality',
      'readinessSatisfied',
      'reducedMotion',
      'rendererStable',
      'samples',
      'viewportHeight',
      'viewportWidth',
      'visibleProjectionCount',
      'wheelDrivenCount',
    ]))
    || spec === undefined
    || candidate.approvedAssetLoaded !== true
    || candidate.animatedCount !== spec.animatedCount
    || candidate.assetProfile !== spec.assetProfile
    || candidate.fallbackCount !== 0
    || candidate.fixtureSelected !== true
    || candidate.modelCount !== spec.modelCount
    || candidate.presentedCount !== RENDERED_WEBGL_WORKER_LOCOMOTION_PRESENTED_COUNT
    || candidate.quality !== spec.quality
    || candidate.readinessSatisfied !== true
    || candidate.reducedMotion !== spec.reducedMotion
    || candidate.rendererStable !== true
    || candidate.viewportHeight !== spec.viewport.height
    || candidate.viewportWidth !== spec.viewport.width
    || !Number.isSafeInteger(candidate.visibleProjectionCount)
    || candidate.visibleProjectionCount
      < RENDERED_WEBGL_WORKER_LOCOMOTION_MINIMUM_VISIBLE_PROJECTION_COUNT
    || candidate.visibleProjectionCount > spec.maximumVisibleProjectionCount
    || candidate.wheelDrivenCount !== spec.wheelDrivenCount
    || !Array.isArray(candidate.samples)
    || candidate.samples.length !== 32
  ) {
    throw new TypeError('Invalid rendered WebGL Worker locomotion evidence.');
  }
  const movementPixels = exactRecord(
    candidate.movementPixels,
    'Invalid rendered WebGL Worker locomotion movement evidence.'
  );
  if (
    !exactMessageKeys(movementPixels, new Set(['outbound', 'returning']))
    || !Number.isFinite(movementPixels.outbound)
    || !Number.isFinite(movementPixels.returning)
    || movementPixels.outbound <= 0.001
    || movementPixels.returning <= 0.001
    || movementPixels.outbound > RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS
    || movementPixels.returning > RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS
  ) {
    throw new TypeError('Invalid rendered WebGL Worker locomotion movement evidence.');
  }
  let previousElapsed = -1;
  const firstProjectionByPhase = new Map();
  const maximumMovementByPhase = new Map([
    ['outbound', 0],
    ['returning', 0],
  ]);
  const samples = candidate.samples.map((sampleValue, sampleIndex) => {
    const sample = exactRecord(
      sampleValue,
      'Invalid rendered WebGL Worker locomotion frame sample.'
    );
    const expectedPhase = sampleIndex < 16 ? 'outbound' : 'returning';
    if (
      !exactMessageKeys(sample, new Set([
        'elapsedMilliseconds',
        'rootProjections',
        'telemetry',
      ]))
      || !Number.isFinite(sample.elapsedMilliseconds)
      || sample.elapsedMilliseconds < 0
      || sample.elapsedMilliseconds > 10_000
      || sample.elapsedMilliseconds <= previousElapsed
      || !Array.isArray(sample.rootProjections)
      || sample.rootProjections.length !== 1
    ) {
      throw new TypeError('Invalid rendered WebGL Worker locomotion frame sample.');
    }
    previousElapsed = sample.elapsedMilliseconds;
    const rootProjections = sample.rootProjections.map((rootValue) => {
      const root = exactRecord(
        rootValue,
        'Invalid rendered WebGL Worker root projection.'
      );
      if (
        !exactMessageKeys(root, new Set(['phase', 'x', 'y']))
        || !['outbound', 'returning'].includes(root.phase)
        || !Number.isFinite(root.x)
        || !Number.isFinite(root.y)
        || root.x < 0
        || root.x > spec.viewport.width
        || root.y < 0
        || root.y > spec.viewport.height
      ) {
        throw new TypeError('Invalid rendered WebGL Worker root projection.');
      }
      const first = firstProjectionByPhase.get(root.phase);
      if (first === undefined) {
        firstProjectionByPhase.set(root.phase, Object.freeze({
          x: root.x,
          y: root.y,
        }));
      } else {
        maximumMovementByPhase.set(
          root.phase,
          Math.max(
            maximumMovementByPhase.get(root.phase) ?? 0,
            Math.hypot(root.x - first.x, root.y - first.y)
          )
        );
      }
      return Object.freeze({ phase: root.phase, x: root.x, y: root.y });
    });
    if (
      rootProjections[0]?.phase !== expectedPhase
      || new Set(rootProjections.map(({ phase }) => phase)).size
        !== rootProjections.length
    ) {
      throw new TypeError('Invalid rendered WebGL Worker locomotion phase coverage.');
    }
    return Object.freeze({
      elapsedMilliseconds: sample.elapsedMilliseconds,
      rootProjections: Object.freeze(rootProjections),
      telemetry: parseRenderedWebglWorkerLocomotionTelemetry(
        sample.telemetry,
        spec
      ),
    });
  });
  for (const phase of ['outbound', 'returning']) {
    const observed = maximumMovementByPhase.get(phase) ?? 0;
    if (
      Math.abs(observed - movementPixels[phase]) > 0.000_001
    ) {
      throw new TypeError('Invalid rendered WebGL Worker locomotion movement evidence.');
    }
  }
  return Object.freeze({
    approvedAssetLoaded: true,
    animatedCount: candidate.animatedCount,
    assetProfile: candidate.assetProfile,
    caseId: candidate.caseId,
    fallbackCount: candidate.fallbackCount,
    fixtureSelected: true,
    modelCount: candidate.modelCount,
    movementPixels: Object.freeze({
      outbound: movementPixels.outbound,
      returning: movementPixels.returning,
    }),
    presentedCount: candidate.presentedCount,
    quality: candidate.quality,
    readinessSatisfied: true,
    reducedMotion: candidate.reducedMotion,
    rendererStable: true,
    samples: Object.freeze(samples),
    viewportHeight: candidate.viewportHeight,
    viewportWidth: candidate.viewportWidth,
    visibleProjectionCount: candidate.visibleProjectionCount,
    wheelDrivenCount: candidate.wheelDrivenCount,
  });
}

/**
 * Exact aggregate proof for the reported upper-right overview composition.
 * The reviewed frame uses the active synthetic Worker fixture at 1440×900,
 * ordinary minimum zoom, and four bounded drags into the navigation clamp.
 * No coordinate, identity, route point, or screenshot leaves the local page.
 */
export function parseRenderedWebglWaterOverviewEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL Water overview evidence.');
  const expected = Object.freeze({
    cameraMode: 'realm',
    cameraStateAttested: true,
    cameraSynchronized: true,
    cameraZoom: '0.280000',
    presentationBand: 'overview',
    riverBodyCount: 12,
    riverChannelBodyCount: 12,
    riverChannelSegmentCount: 1_200,
    riverFallbackBodyCount: 0,
    riverFallbackCellCount: 0,
    riverFullCellCount: 400,
    riverFullCellTriangleCount: 2_400,
    riverBankEdgeCount: 1_601,
    riverSharedEdgeCount: 388,
    riverMouthEdgeCount: 23,
    riverIncompleteCellCount: 0,
    riverOverlappingPhysicalTriangleCount: 0,
    riverMouthConnectionCount: 12,
    routeDrawCalls: 0,
    routeSegments: 0,
    routeTriangles: 0,
    routeVisible: 0,
    waterDrawCalls: 3,
    waterNavigationIssueCount: 0,
    waterNavigationNodeCount: 1_852,
    waterNavigationOceanNodeCount: 1_452,
    waterNavigationRiverNodeCount: 400,
    waterNavigationStatus: 'exact',
    waterPresentation: 'ready',
    waterShaderFallbackCount: 0,
    waterTriangles: 21_198,
  });
  if (!exactMessageKeys(candidate, new Set(Object.keys(expected)))) {
    throw new TypeError('Invalid rendered WebGL Water overview evidence shape.');
  }
  const failures = Object.entries(expected)
    .filter(([key, expectedValue]) => candidate[key] !== expectedValue)
    .map(([key]) => key);
  if (failures.length > 0) {
    throw new TypeError(
      `Invalid rendered WebGL Water overview evidence: ${failures.map((key) => (
        `${key}=${JSON.stringify(candidate[key])}`
      )).join(',')}.`
    );
  }
  return expected;
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
    || (
      attached
        ? !['', 'about:blank'].includes(candidate.url)
        : candidate.url !== 'about:blank'
    )
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
    'canvasRealmCameraMode',
    'canvasRealmCameraPresentationBand',
    'documentWidth',
    'directExploreControlState',
    'environmentLighting',
    'exploreAccessibleCastleCount',
    'exploreAccessibleResourceSiteCount',
    'exploreAvailableResourceSiteCount',
    'exploreCastleCount',
    'exploreCoordinateJumpCount',
    'exploreResourceKindCount',
    'exploreResourceSiteCount',
    'exploreVisibleCoordinateCopyCount',
    'exploreVisibleOpaqueCopyCount',
    'fixture',
    'focusedReadableLabelDomFocusCount',
    'focusedReadableLabelCount',
    'forestDecorativeBodyCellCount',
    'forestDecorativeCacheEntries',
    'forestDecorativeCacheHighWaterMark',
    'forestDecorativeCacheLimit',
    'forestDecorativeCanopyMotionState',
    'forestDecorativeCanonicalTriangleCount',
    'forestDecorativeClearingCellCount',
    'forestDecorativeContactShadowCount',
    'forestDecorativeCoreCellCount',
    'forestDecorativeDrawCalls',
    'forestDecorativeFallbackType',
    'forestDecorativeFringeCellCount',
    'forestDecorativeGroundingMode',
    'forestDecorativeModelReady',
    'forestDecorativeOverviewHidden',
    'forestDecorativeRepackCount',
    'forestDecorativeSilhouetteCoverageRatio',
    'forestDecorativeTriangleCount',
    'forestDecorativeTreeCount',
    'forestDecorativeUsingFallback',
    'grassCacheEntries',
    'grassCacheHighWaterMark',
    'grassCacheLimit',
    'grassDrawCalls',
    'grassInstanceCount',
    'grassPaletteDisplaySrgbSaturationMax',
    'grassPaletteDisplaySrgbSaturationMin',
    'grassRepackCount',
    'grassShaderFallbackActive',
    'grassTriangleCount',
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
    'rootRealmCameraMode',
    'rootRealmCameraPresentationBand',
    'semanticTerrainCellCount',
    'semanticTerrainFeatureCount',
    'semanticTerrainFeatureDrawCalls',
    'semanticTerrainKindCount',
    'status',
    'tabbableLabelCount',
    'terrainShaderEnhanced',
    'terrainShaderFallbackActive',
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
  const exploreOpen = expected.interaction === 'explore';
  const expectedExploreCoordinateJumpCount = exploreOpen
    && expected.expectedPresentationMode === 'observer' ? 1 : 0;
  const presentationControlsMayBeOccluded = ['inspector', 'explore'].includes(
    expected.interaction
  );
  const fullScreenInspector = expected.interaction === 'inspector'
    && (
      expected.viewport.width <= 680
      || expected.viewport.height <= 600
    );
  const expectedPresentationControlStateValid = (state) => state === 'visible'
    || (presentationControlsMayBeOccluded && state === 'hidden');
  const playerPresentation = expected.expectedPresentationMode === 'player';
  const cameraPresentationBandByMode = Object.freeze({
    realm: 'overview',
    approach: 'strategy',
    keep: 'close',
  });
  const rootCameraModeValid = Object.hasOwn(
    cameraPresentationBandByMode,
    candidate.rootRealmCameraMode
  );
  const canvasCameraModeValid = Object.hasOwn(
    cameraPresentationBandByMode,
    candidate.canvasRealmCameraMode
  );
  const cameraPresentationSynchronized = rootCameraModeValid
    && canvasCameraModeValid
    && candidate.rootRealmCameraMode === candidate.canvasRealmCameraMode
    && candidate.rootRealmCameraPresentationBand
      === cameraPresentationBandByMode[candidate.rootRealmCameraMode]
    && candidate.canvasRealmCameraPresentationBand
      === cameraPresentationBandByMode[candidate.canvasRealmCameraMode]
    && candidate.rootRealmCameraPresentationBand
      === candidate.canvasRealmCameraPresentationBand;
  const exploreAggregateCounts = [
    candidate.exploreAccessibleResourceSiteCount,
    candidate.exploreAvailableResourceSiteCount,
    candidate.exploreCoordinateJumpCount,
    candidate.exploreResourceKindCount,
    candidate.exploreResourceSiteCount,
    candidate.exploreVisibleCoordinateCopyCount,
    candidate.exploreVisibleOpaqueCopyCount,
  ];
  const exploreAggregateShapeValid = exploreAggregateCounts.every((count) => (
    Number.isSafeInteger(count) && count >= 0
  ));
  const terrainBudgets = TERRAIN_PRESENTATION_BUDGETS[expected.expectedQuality];
  const forestDecorativeBudgets = RENDERED_WEBGL_QA_FOREST_DECORATIVE_BUDGETS[
    expected.expectedQuality
  ];
  const grassBudgets = RENDERED_WEBGL_QA_GRASS_BUDGETS[
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
  const forestDecorativeStructureCounts = [
    candidate.forestDecorativeCoreCellCount,
    candidate.forestDecorativeBodyCellCount,
    candidate.forestDecorativeFringeCellCount,
    candidate.forestDecorativeClearingCellCount,
  ];
  const forestDecorativeCraftedTelemetryValid =
    forestDecorativeStructureCounts.every((value) => (
      Number.isSafeInteger(value) && value >= 0
    ))
    && Number.isSafeInteger(candidate.forestDecorativeCacheLimit)
    && candidate.forestDecorativeCacheLimit === forestDecorativeBudgets?.cacheEntries
    && Number.isSafeInteger(candidate.forestDecorativeRepackCount)
    && candidate.forestDecorativeRepackCount >= 0
    && Number.isSafeInteger(candidate.forestDecorativeContactShadowCount)
    && candidate.forestDecorativeContactShadowCount === 0
    && Number.isSafeInteger(candidate.forestDecorativeCanonicalTriangleCount)
    && candidate.forestDecorativeCanonicalTriangleCount >= 0
    && Number.isFinite(candidate.forestDecorativeSilhouetteCoverageRatio)
    && candidate.forestDecorativeSilhouetteCoverageRatio >= 0
    && candidate.forestDecorativeSilhouetteCoverageRatio <= 1
    && candidate.forestDecorativeCanopyMotionState === 'static'
    && (
      candidate.forestDecorativeUsingFallback
        ? candidate.forestDecorativeFallbackType ===
          'procedural-trunk-multi-canopy-v1'
          && candidate.forestDecorativeGroundingMode ===
            'terrain-canopy-procedural-root-contact'
        : candidate.forestDecorativeFallbackType === 'none'
          && (
            forestDecorativeEmpty
              ? candidate.forestDecorativeGroundingMode === 'none'
              : candidate.forestDecorativeGroundingMode === 'terrain-canopy'
                || candidate.forestDecorativeGroundingMode ===
                  'terrain-canopy-baked-base'
          )
    );
  const grassNumericValues = [
    candidate.grassInstanceCount,
    candidate.grassTriangleCount,
    candidate.grassDrawCalls,
    candidate.grassCacheEntries,
    candidate.grassCacheLimit,
    candidate.grassCacheHighWaterMark,
    candidate.grassRepackCount,
  ];
  const grassNumericShapeValid = grassNumericValues.every((value) => (
    Number.isSafeInteger(value) && value >= 0
  ));
  const grassBudgetValid = grassNumericShapeValid
    && grassBudgets
    && candidate.grassInstanceCount <= grassBudgets.instances
    && candidate.grassTriangleCount <= grassBudgets.triangles
    && candidate.grassDrawCalls <= grassBudgets.drawCalls
    && candidate.grassCacheLimit === grassBudgets.cacheEntries
    && candidate.grassCacheEntries <= candidate.grassCacheHighWaterMark
    && candidate.grassCacheHighWaterMark <= candidate.grassCacheLimit;
  const grassPaletteEmpty = candidate.grassInstanceCount === 0
    && candidate.grassPaletteDisplaySrgbSaturationMin === 0
    && candidate.grassPaletteDisplaySrgbSaturationMax === 0;
  const grassPaletteNatural = Number.isFinite(
    candidate.grassPaletteDisplaySrgbSaturationMin
  )
    && Number.isFinite(candidate.grassPaletteDisplaySrgbSaturationMax)
    && candidate.grassPaletteDisplaySrgbSaturationMin >= 0.08
    && candidate.grassPaletteDisplaySrgbSaturationMax <= 0.58
    && candidate.grassPaletteDisplaySrgbSaturationMin
      <= candidate.grassPaletteDisplaySrgbSaturationMax;
  const grassCraftedTelemetryValid = grassBudgetValid
    && (grassPaletteEmpty || grassPaletteNatural)
    && candidate.grassShaderFallbackActive === false;
  const terrainMaterialTelemetryValid =
    expected.expectedTerrainShaderFallback === true
      ? candidate.terrainShaderEnhanced === false
        && candidate.terrainShaderFallbackActive === true
      : candidate.terrainShaderEnhanced === true
        && candidate.terrainShaderFallbackActive === false;
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
    !cameraPresentationSynchronized ? 'camera-presentation-synchronization' : '',
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
    !forestDecorativeCraftedTelemetryValid
      ? 'forest-decorative-crafted-telemetry' : '',
    !grassNumericShapeValid ? 'grass-crafted-shape' : '',
    !grassCraftedTelemetryValid ? 'grass-crafted-telemetry' : '',
    !terrainMaterialTelemetryValid ? 'terrain-material-telemetry' : '',
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
      ? 'label-count-shape'
      : fullScreenInspector
        ? candidate.labelCount !== 0 ? 'fullscreen-inspector-labels' : ''
        : candidate.labelCount < expected.minimumLabelCount ? 'label-count' : '',
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
    !exploreAggregateShapeValid ? 'explore-resource-shape' : '',
    candidate.exploreCoordinateJumpCount !== expectedExploreCoordinateJumpCount
      ? 'explore-coordinate-jump-boundary' : '',
    exploreOpen
      ? candidate.exploreResourceSiteCount < 4
        ? 'explore-resource-site-coverage' : ''
      : candidate.exploreResourceSiteCount !== 0
        ? 'closed-explore-resource-site' : '',
    exploreOpen
      && candidate.exploreAccessibleResourceSiteCount
        !== candidate.exploreResourceSiteCount
      ? 'explore-resource-site-accessibility' : '',
    exploreOpen && candidate.exploreResourceKindCount !== 4
      ? 'explore-resource-kind-coverage' : '',
    exploreOpen && candidate.exploreAvailableResourceSiteCount < 1
      ? 'explore-resource-availability' : '',
    !exploreOpen && (
      candidate.exploreAccessibleResourceSiteCount !== 0
      || candidate.exploreAvailableResourceSiteCount !== 0
      || candidate.exploreResourceKindCount !== 0
    ) ? 'closed-explore-resource-aggregate' : '',
    candidate.exploreVisibleOpaqueCopyCount !== 0
      ? 'explore-visible-opaque-copy' : '',
    (exploreOpen && expected.expectedPresentationMode === 'observer'
      ? candidate.exploreVisibleCoordinateCopyCount < 1
      : candidate.exploreVisibleCoordinateCopyCount !== 0)
      ? 'explore-visible-coordinate-copy' : '',
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
    forestDecorativeCacheLimit: candidate.forestDecorativeCacheLimit,
    forestDecorativeRepackCount: candidate.forestDecorativeRepackCount,
    forestDecorativeModelReady: candidate.forestDecorativeModelReady,
    forestDecorativeUsingFallback: candidate.forestDecorativeUsingFallback,
    forestDecorativeFallbackType: candidate.forestDecorativeFallbackType,
    forestDecorativeContactShadowCount:
      candidate.forestDecorativeContactShadowCount,
    forestDecorativeGroundingMode: candidate.forestDecorativeGroundingMode,
    forestDecorativeCanopyMotionState:
      candidate.forestDecorativeCanopyMotionState,
    forestDecorativeCoreCellCount: candidate.forestDecorativeCoreCellCount,
    forestDecorativeBodyCellCount: candidate.forestDecorativeBodyCellCount,
    forestDecorativeFringeCellCount: candidate.forestDecorativeFringeCellCount,
    forestDecorativeClearingCellCount:
      candidate.forestDecorativeClearingCellCount,
    forestDecorativeSilhouetteCoverageRatio:
      candidate.forestDecorativeSilhouetteCoverageRatio,
    forestDecorativeCanonicalTriangleCount:
      candidate.forestDecorativeCanonicalTriangleCount,
    forestDecorativeOverviewHidden: candidate.forestDecorativeOverviewHidden,
    grassInstanceCount: candidate.grassInstanceCount,
    grassTriangleCount: candidate.grassTriangleCount,
    grassDrawCalls: candidate.grassDrawCalls,
    grassCacheEntries: candidate.grassCacheEntries,
    grassCacheLimit: candidate.grassCacheLimit,
    grassCacheHighWaterMark: candidate.grassCacheHighWaterMark,
    grassRepackCount: candidate.grassRepackCount,
    grassPaletteDisplaySrgbSaturationMin:
      candidate.grassPaletteDisplaySrgbSaturationMin,
    grassPaletteDisplaySrgbSaturationMax:
      candidate.grassPaletteDisplaySrgbSaturationMax,
    grassShaderFallbackActive: candidate.grassShaderFallbackActive,
    terrainShaderEnhanced: candidate.terrainShaderEnhanced,
    terrainShaderFallbackActive: candidate.terrainShaderFallbackActive,
    semanticTerrainCellCount: candidate.semanticTerrainCellCount,
    semanticTerrainKindCount: candidate.semanticTerrainKindCount,
    semanticTerrainFeatureCount: candidate.semanticTerrainFeatureCount,
    semanticTerrainFeatureDrawCalls: candidate.semanticTerrainFeatureDrawCalls,
    totalTerrainDetailInstanceCount: candidate.totalTerrainDetailInstanceCount,
    totalTerrainDetailDrawCalls: candidate.totalTerrainDetailDrawCalls,
    rootRealmCameraMode: candidate.rootRealmCameraMode,
    canvasRealmCameraMode: candidate.canvasRealmCameraMode,
    rootRealmCameraPresentationBand: candidate.rootRealmCameraPresentationBand,
    canvasRealmCameraPresentationBand: candidate.canvasRealmCameraPresentationBand,
    exploreCoordinateJumpCount: candidate.exploreCoordinateJumpCount,
    exploreResourceSiteCount: candidate.exploreResourceSiteCount,
    exploreAccessibleResourceSiteCount:
      candidate.exploreAccessibleResourceSiteCount,
    exploreResourceKindCount: candidate.exploreResourceKindCount,
    exploreAvailableResourceSiteCount:
      candidate.exploreAvailableResourceSiteCount,
    exploreVisibleCoordinateCopyCount:
      candidate.exploreVisibleCoordinateCopyCount,
    exploreVisibleOpaqueCopyCount: candidate.exploreVisibleOpaqueCopyCount,
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
    observation.rootRealmCameraMode !== 'keep'
    || observation.canvasRealmCameraMode !== 'keep'
    || observation.rootRealmCameraPresentationBand !== 'close'
    || observation.canvasRealmCameraPresentationBand !== 'close'
    || observation.forestDecorativeOverviewHidden !== false
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

async function waitForCloseOrDelay(closed, milliseconds, wait = delay) {
  if (wait !== delay) {
    await Promise.race([closed, wait(milliseconds)]);
    return;
  }
  let timeout;
  try {
    await Promise.race([
      closed,
      new Promise((resolveDelay) => {
        timeout = setTimeout(resolveDelay, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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
  #failureMessage;
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
        const runtimeEvaluationTransition =
          isBenignRuntimeEvaluationTransitionError(
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
        // Runtime.evaluate may race the exact instant a controlled local
        // fixture replaces its document context. Reject only that sample so
        // the caller's bounded readiness loop can retry. Any adjacent method,
        // code, message, shape, external navigation, or closed target still
        // fails the entire private pipe.
        if (runtimeEvaluationTransition) {
          pending.reject(new Error(
            'Chrome DevTools runtime evaluation context transitioned.'
          ));
          return;
        }
        const errorCode = Number.isSafeInteger(message.error?.code)
          ? ` (${message.error.code})`
          : '';
        pending.reject(new Error(
          `Chrome DevTools ${pending.method} command failed${errorCode}.`
        ));
        this.#fail(
          `Chrome DevTools ${pending.method} command failed${errorCode}.`
        );
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
        this.#fail(`Chrome DevTools command ${method} timed out.`);
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
      const failureContext = this.#failureMessage
        ? ` (${this.#failureMessage})`
        : '';
      return Promise.reject(new Error(
        `Chrome DevTools page session is unavailable${failureContext}.`
      ));
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
    this.#failureMessage = message;
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
    this.#failureMessage = 'Chrome DevTools pipe closed.';
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
  const verificationMilliseconds = options.verificationMilliseconds
    ?? TERMINATION_VERIFICATION_MILLISECONDS;
  const verificationPollMilliseconds = options.verificationPollMilliseconds
    ?? 50;
  if (
    !Number.isSafeInteger(verificationMilliseconds)
    || verificationMilliseconds < 0
    || !Number.isSafeInteger(verificationPollMilliseconds)
    || verificationPollMilliseconds <= 0
  ) throw new Error('Disposable Chrome termination policy was invalid.');
  const assertStopped = options.assertProcessGroupStopped ?? ((pid) => {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return;
      throw new Error('Disposable Chrome process group could not be verified as stopped.');
    }
    throw new Error('Disposable Chrome process group remained alive.');
  });
  const leaderRunning = child.exitCode === null && child.signalCode === null;
  const closed = leaderRunning
    ? new Promise((resolveClose) => child.once('close', resolveClose))
    : Promise.resolve();
  terminate(child, 'SIGTERM');
  if (leaderRunning) {
    await waitForCloseOrDelay(closed, TERMINATION_GRACE_MILLISECONDS, wait);
  }
  // Always sweep the original Chrome process group. The leader can exit before
  // helpers that ignored SIGTERM, and an early return would orphan them.
  terminate(child, 'SIGKILL');
  if (leaderRunning) {
    await waitForCloseOrDelay(closed, TERMINATION_GRACE_MILLISECONDS, wait);
  }
  const verificationDeadline = Date.now() + verificationMilliseconds;
  while (true) {
    try {
      assertStopped(child.pid);
      break;
    } catch (error) {
      if (Date.now() >= verificationDeadline) throw error;
      // A Chrome helper can fork between the first group-wide SIGKILL and the
      // leader being reaped. Keep sweeping the original private process group
      // while verification is bounded instead of merely polling a late helper.
      terminate(child, 'SIGKILL');
      await wait(Math.min(
        verificationPollMilliseconds,
        Math.max(1, verificationDeadline - Date.now()),
      ));
    }
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

export async function createLoopbackViteServer(runtimeDirectory, localQaPlugins = []) {
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

/**
 * Local rendered-QA transform only. One exact hash deliberately makes the
 * terrain enhancement reject its pinned shader markers, exercising the
 * existing ordinary MeshStandardMaterial fallback without adding any switch
 * to production source or accepting caller-provided transform input.
 */
export function renderedWebglTerrainShaderFallbackVitePlugin() {
  return Object.freeze({
    name: 'warpkeep-local-terrain-shader-fallback',
    enforce: 'pre',
    transform(source, id) {
      const sourceId = typeof id === 'string' ? id.split('?', 1)[0] : '';
      if (sourceId !== RENDERED_WEBGL_TERRAIN_MATERIAL_SOURCE) return null;
      if (
        typeof source !== 'string'
        || source.length < 1
        || source.split(RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_NEEDLE).length !== 2
      ) {
        throw new Error('Rendered QA terrain shader fallback source contract changed.');
      }
      return Object.freeze({
        code: source.replace(
          RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_NEEDLE,
          RENDERED_WEBGL_TERRAIN_SHADER_FALLBACK_REPLACEMENT
        ),
        map: null,
      });
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
  const canvas = map?.querySelector('canvas[data-realm-canvas-active="true"]');
  const integer = (value) => /^\\d+$/.test(value ?? '') ? Number(value) : null;
  const finiteNumber = (value) => (
    typeof value === 'string'
    && value.trim() !== ''
    && Number.isFinite(Number(value))
  ) ? Number(value) : null;
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
    if (!(identity instanceof HTMLElement)) return false;
    const calmCloseCastleLabel = (
      selector === '.realm-castle-label__identity'
      && map?.getAttribute('data-realm-camera-presentation-band') === 'close'
      && control.getAttribute('data-own') !== 'true'
      && control.getAttribute('data-focused') !== 'true'
      && control.getAttribute('data-hovered') !== 'true'
      && control.getAttribute('aria-expanded') !== 'true'
      && control.getAttribute('aria-pressed') !== 'true'
      && !control.matches(':hover, :focus-visible')
    );
    if (calmCloseCastleLabel) {
      const plate = control.querySelector('.realm-castle-label__plate');
      if (!(plate instanceof HTMLElement) || !visible(plate) || visible(identity)) {
        return false;
      }
      const plateBounds = rect(plate);
      return plateBounds.width >= 6
        && plateBounds.width <= 12
        && plateBounds.height >= 6
        && plateBounds.height <= 12;
    }
    if (!visible(identity)) return false;
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
  const exploreCoordinateJumpForms = [...document.querySelectorAll(
    '.realm-cell-navigator__dialog .realm-cell-navigator__jump'
  )].filter(visible);
  const exploreResourceSiteButtons = [...document.querySelectorAll(
    '.realm-cell-navigator__resource-site[data-resource-kind][data-resource-state]'
  )].filter(visible);
  const exploreAccessibleResourceSiteButtons = exploreResourceSiteButtons.filter((button) => {
    if (
      !(button instanceof HTMLButtonElement)
      || button.disabled
      || button.tabIndex < 0
      || (button.getAttribute('aria-label') ?? '').trim().length === 0
      || (button.textContent ?? '').trim().length === 0
      || !['gold', 'food', 'wood', 'stone'].includes(
        button.getAttribute('data-resource-kind') ?? ''
      )
      || !['available', 'occupied', 'reserved', 'unavailable'].includes(
        button.getAttribute('data-resource-state') ?? ''
      )
    ) return false;
    const bounds = rect(button);
    return bounds.width >= 44 && bounds.height >= 44;
  });
  const exploreDialog = document.querySelector('.realm-cell-navigator__dialog');
  const exploreVisibleCopy = exploreDialog instanceof HTMLElement && visible(exploreDialog)
    ? [
        exploreDialog.textContent ?? '',
        ...[...exploreDialog.querySelectorAll('[aria-label]')]
          .filter(visible)
          .map((element) => element.getAttribute('aria-label') ?? '')
      ]
    : [];
  const visibleCoordinateCopyPattern =
    /(?:^|[\\s,(·])(?:q|r)\\s*-?\\d+\\b|(?:^|[\\s(·])-?\\d+\\s*,\\s*-?\\d+\\b/iu;
  const visibleOpaqueCopyPattern =
    /\\b(?:gold:|food:|wood:|stone:)?genesis-\\d{3}-tier\\d+-(?:gold|food|wood|stone)-\\d+\\b/iu;
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
    rootRealmCameraMode: map?.getAttribute('data-realm-camera-mode') ?? null,
    canvasRealmCameraMode: canvas?.getAttribute('data-realm-camera-mode') ?? null,
    rootRealmCameraPresentationBand:
      map?.getAttribute('data-realm-camera-presentation-band') ?? null,
    canvasRealmCameraPresentationBand:
      canvas?.getAttribute('data-realm-camera-presentation-band') ?? null,
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
    forestDecorativeCacheLimit: integer(
      map?.getAttribute('data-forest-decorative-cache-limit')
    ),
    forestDecorativeCacheHighWaterMark: integer(
      map?.getAttribute('data-forest-decorative-cache-high-water-mark')
    ),
    forestDecorativeRepackCount: integer(
      map?.getAttribute('data-forest-decorative-repack-count')
    ),
    forestDecorativeModelReady: exactBoolean(
      map?.getAttribute('data-forest-decorative-model-ready')
    ),
    forestDecorativeUsingFallback: exactBoolean(
      map?.getAttribute('data-forest-decorative-using-fallback')
    ),
    forestDecorativeFallbackType:
      map?.getAttribute('data-forest-decorative-fallback-type') ?? null,
    forestDecorativeContactShadowCount: integer(
      map?.getAttribute('data-forest-decorative-contact-shadow-count')
    ),
    forestDecorativeGroundingMode:
      map?.getAttribute('data-forest-decorative-grounding-mode') ?? null,
    forestDecorativeCanopyMotionState:
      map?.getAttribute('data-forest-decorative-canopy-motion-state') ?? null,
    forestDecorativeCoreCellCount: integer(
      map?.getAttribute('data-forest-decorative-core-cell-count')
    ),
    forestDecorativeBodyCellCount: integer(
      map?.getAttribute('data-forest-decorative-body-cell-count')
    ),
    forestDecorativeFringeCellCount: integer(
      map?.getAttribute('data-forest-decorative-fringe-cell-count')
    ),
    forestDecorativeClearingCellCount: integer(
      map?.getAttribute('data-forest-decorative-clearing-cell-count')
    ),
    forestDecorativeSilhouetteCoverageRatio: finiteNumber(
      map?.getAttribute('data-forest-decorative-silhouette-coverage-ratio')
    ),
    forestDecorativeCanonicalTriangleCount: integer(
      map?.getAttribute('data-forest-decorative-canonical-triangle-count')
    ),
    forestDecorativeOverviewHidden: exactBoolean(
      map?.getAttribute('data-forest-decorative-overview-hidden')
    ),
    grassInstanceCount: integer(
      map?.getAttribute('data-grass-instance-count')
    ),
    grassTriangleCount: integer(
      map?.getAttribute('data-grass-triangle-count')
    ),
    grassDrawCalls: integer(
      map?.getAttribute('data-grass-draw-calls')
    ),
    grassCacheEntries: integer(
      map?.getAttribute('data-grass-cache-entries')
    ),
    grassCacheLimit: integer(
      map?.getAttribute('data-grass-cache-limit')
    ),
    grassCacheHighWaterMark: integer(
      map?.getAttribute('data-grass-cache-high-water-mark')
    ),
    grassRepackCount: integer(
      map?.getAttribute('data-grass-repack-count')
    ),
    grassPaletteDisplaySrgbSaturationMin: finiteNumber(
      map?.getAttribute('data-grass-palette-display-srgb-saturation-min')
    ),
    grassPaletteDisplaySrgbSaturationMax: finiteNumber(
      map?.getAttribute('data-grass-palette-display-srgb-saturation-max')
    ),
    grassShaderFallbackActive: exactBoolean(
      map?.getAttribute('data-grass-shader-fallback-active')
    ),
    terrainShaderEnhanced: exactBoolean(
      map?.getAttribute('data-terrain-shader-enhanced')
    ),
    terrainShaderFallbackActive: exactBoolean(
      map?.getAttribute('data-terrain-shader-fallback-active')
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
    exploreCoordinateJumpCount: exploreCoordinateJumpForms.length,
    exploreResourceSiteCount: exploreResourceSiteButtons.length,
    exploreAccessibleResourceSiteCount: exploreAccessibleResourceSiteButtons.length,
    exploreResourceKindCount: new Set(exploreResourceSiteButtons.map((button) => (
      button.getAttribute('data-resource-kind')
    ))).size,
    exploreAvailableResourceSiteCount: exploreResourceSiteButtons.filter((button) => (
      button.getAttribute('data-resource-state') === 'available'
    )).length,
    exploreVisibleCoordinateCopyCount: exploreVisibleCopy.filter((copy) => (
      visibleCoordinateCopyPattern.test(copy)
    )).length,
    exploreVisibleOpaqueCopyCount: exploreVisibleCopy.filter((copy) => (
      visibleOpaqueCopyPattern.test(copy)
    )).length,
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
          `camera=${String(value.rootRealmCameraMode)}/${String(
            value.rootRealmCameraPresentationBand
          )}`,
          `exploreCastles=${String(value.exploreCastleCount)}`,
          `exploreAccessible=${String(value.exploreAccessibleCastleCount)}`,
          `exploreResources=${String(value.exploreResourceSiteCount)}`,
          `exploreResourceAccessible=${String(
            value.exploreAccessibleResourceSiteCount
          )}`,
          `exploreCoordinateJump=${String(value.exploreCoordinateJumpCount)}`,
          `exploreCoordinateCopy=${String(
            value.exploreVisibleCoordinateCopyCount
          )}`,
          `exploreOpaqueCopy=${String(value.exploreVisibleOpaqueCopyCount)}`
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
          `camera=${String(value.rootRealmCameraMode)}/${String(
            value.rootRealmCameraPresentationBand
          )}`,
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

async function captureRenderedCasePixels(session, viewport, analysisOptions) {
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
    const artifactName = analysisOptions?.artifactName;
    const artifactRegion = analysisOptions?.artifactRegion ?? 'northern';
    const artifactDirectory = artifactRegion === 'southern'
      ? process.env.WARPKEEP_QA_SOUTHERN_ARTIFACT_DIR
      : artifactRegion === 'northern'
        ? process.env.WARPKEEP_QA_NORTHERN_ARTIFACT_DIR
        : undefined;
    if (artifactName !== undefined) {
      if (
        typeof artifactDirectory !== 'string'
        || !isAbsolute(artifactDirectory)
        || (artifactRegion !== 'northern' && artifactRegion !== 'southern')
        || typeof artifactName !== 'string'
        || !/^[a-z0-9-]+\.png$/u.test(artifactName)
      ) {
        throw new Error('Regional climate review artifact boundary failed.');
      }
      const cacheRoot = await realpath(join(REPOSITORY_ROOT, '.cache'));
      const destinationDirectory = resolve(artifactDirectory);
      if (
        destinationDirectory !== cacheRoot
        && !destinationDirectory.startsWith(`${cacheRoot}/`)
      ) throw new Error('Regional climate review artifact boundary failed.');
      await mkdir(destinationDirectory, { mode: 0o700, recursive: true });
      const realDestinationDirectory = await realpath(destinationDirectory);
      if (
        realDestinationDirectory !== cacheRoot
        && !realDestinationDirectory.startsWith(`${cacheRoot}/`)
      ) throw new Error('Regional climate review artifact boundary failed.');
      await writeFile(
        join(realDestinationDirectory, artifactName),
        screenshotBytes,
        { flag: 'wx', mode: 0o600 }
      );
    }
    return analyzeRenderedWebglPngScreenshot(
      screenshotBytes,
      viewport,
      {
        minimumDistinctColourBuckets:
          analysisOptions?.minimumDistinctColourBuckets
      }
    );
  } finally {
    screenshotBytes.fill(0);
  }
}

function parseNorthernReachStaticFrameSignature(value) {
  const invalid = () => new TypeError(
    'Invalid Northern Reach static-frame signature.'
  );
  const keys = [
    'cameraMode',
    'cameraPresentationBand',
    'cameraStateToken',
    'cameraTargetKind',
    'canvasLastSuccessfulGeneration',
    'canvasRendererGeneration',
    'rendererGeneration',
    'rendererLastSuccessfulGeneration',
  ].sort();
  const actualKeys = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  if (
    !value || typeof value !== 'object' || Array.isArray(value)
    || actualKeys.length !== keys.length
    || actualKeys.some((key, index) => key !== keys[index])
    || !['realm', 'approach', 'keep'].includes(value.cameraMode)
    || !['overview', 'strategy', 'close'].includes(
      value.cameraPresentationBand
    )
    || !/^[0-9a-f]{24}$/u.test(value.cameraStateToken)
    || value.cameraTargetKind !== 'cell-location'
    || ![
      value.canvasLastSuccessfulGeneration,
      value.canvasRendererGeneration,
      value.rendererGeneration,
      value.rendererLastSuccessfulGeneration,
    ].every((entry) => Number.isSafeInteger(entry) && entry > 0)
    || value.rendererGeneration !== value.rendererLastSuccessfulGeneration
    || value.rendererGeneration !== value.canvasRendererGeneration
    || value.rendererGeneration !== value.canvasLastSuccessfulGeneration
  ) throw invalid();
  return Object.freeze({ ...value });
}

export async function readNorthernReachStaticFrameSignature(session) {
  if (!session || typeof session.command !== 'function') {
    throw new TypeError('Invalid Northern Reach static-frame session.');
  }
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const root=document.querySelector('.realm-map-screen');
      const canvas=root?.querySelector('canvas[data-realm-canvas-active="true"]');
      const integer=value=>typeof value==='string'&&/^[1-9]\\d*$/.test(value)
        ?Number(value):null;
      if(!(root instanceof HTMLElement)||!(canvas instanceof HTMLCanvasElement)
        ||root.dataset.rendererState!=='ready'||root.dataset.rendererFailure!=='none'
        ||canvas.dataset.realmCameraSettled!=='true')return null;
      return {
        cameraMode:root.dataset.realmCameraMode,
        cameraPresentationBand:root.dataset.realmCameraPresentationBand,
        cameraStateToken:canvas.dataset.realmCameraStateToken,
        cameraTargetKind:root.dataset.realmCameraTargetKind,
        canvasLastSuccessfulGeneration:integer(
          canvas.dataset.realmLastSuccessfulRenderedGeneration),
        canvasRendererGeneration:integer(canvas.dataset.realmRendererGeneration),
        rendererGeneration:integer(root.dataset.rendererGeneration),
        rendererLastSuccessfulGeneration:integer(
          root.dataset.rendererLastSuccessfulGeneration)
      };
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Northern Reach static-frame observation failed.');
  }
  return parseNorthernReachStaticFrameSignature(evaluation.result.value);
}

function northernReachEvidenceArraysWithinTolerance(first, repeated) {
  return Array.isArray(first)
    && Array.isArray(repeated)
    && first.length === repeated.length
    && first.every((entry, index) => (
      Number.isFinite(entry)
      && Number.isFinite(repeated[index])
      && Math.abs(entry - repeated[index])
        <= NORTHERN_REACH_REDUCED_MOTION_EVIDENCE_TOLERANCE
    ));
}

function northernReachReducedMotionVisualShapeValid(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && [
      value.clippedBlackSamples,
      value.clippedWhiteSamples,
      value.coolHighAlbedoSamples,
      value.hotYellowSamples,
    ].every((entry) => Number.isSafeInteger(entry) && entry >= 0)
    && value.clippedBlackSamples === 0
    && value.clippedWhiteSamples === 0
    && value.hotYellowSamples === 0
    && Array.isArray(value.coolSpatialBuckets)
    && value.coolSpatialBuckets.length === 9
    && value.coolSpatialBuckets.every(
      (entry) => Number.isSafeInteger(entry) && entry >= 0
    )
    && value.coolSpatialBuckets.reduce((sum, entry) => sum + entry, 0)
      === value.coolHighAlbedoSamples;
}

/**
 * Compares only anonymous screenshot aggregates and bounded scene telemetry.
 * Reduced motion should keep the same fixed northern target visually stable;
 * one quantized edge sample may move between neighbouring buckets, while
 * material identity and the rendered snow field remain effectively exact.
 */
export function assertNorthernReachRepeatedReducedMotionEvidence(
  first,
  repeated
) {
  const invalid = () => new TypeError(
    'Invalid Northern Reach repeated reduced-motion evidence.'
  );
  const firstEvidence = first?.evidence;
  const repeatedEvidence = repeated?.evidence;
  let firstSignature;
  let repeatedSignature;
  try {
    firstSignature = parseNorthernReachStaticFrameSignature(first?.signature);
    repeatedSignature = parseNorthernReachStaticFrameSignature(
      repeated?.signature
    );
  } catch {
    throw invalid();
  }
  const firstVisual = first?.visual;
  const repeatedVisual = repeated?.visual;
  const exactEvidenceFields = [
    'band',
    'quality',
    'recovered',
    'recoveryExercised',
    'region',
    'selected',
    'stable',
  ];
  const exactVisualFields = [
    'clippedBlackSamples',
    'clippedWhiteSamples',
    'hotYellowSamples',
  ];
  const exactEvidenceKeys = [
    'band',
    'coverage',
    'material',
    'quality',
    'recovered',
    'recoveryExercised',
    'region',
    'retained',
    'selected',
    'stable',
    'vertices',
  ].sort();
  const firstEvidenceKeys = firstEvidence && typeof firstEvidence === 'object'
    ? Object.keys(firstEvidence).sort()
    : [];
  const repeatedEvidenceKeys =
    repeatedEvidence && typeof repeatedEvidence === 'object'
      ? Object.keys(repeatedEvidence).sort()
      : [];
  if (
    !first || typeof first !== 'object' || Array.isArray(first)
    || !repeated || typeof repeated !== 'object' || Array.isArray(repeated)
    || Object.keys(firstSignature).some(
      (key) => firstSignature[key] !== repeatedSignature[key]
    )
    || !firstEvidence || typeof firstEvidence !== 'object'
    || !repeatedEvidence || typeof repeatedEvidence !== 'object'
    || firstEvidenceKeys.length !== exactEvidenceKeys.length
    || repeatedEvidenceKeys.length !== exactEvidenceKeys.length
    || exactEvidenceKeys.some((key, index) => (
      firstEvidenceKeys[index] !== key || repeatedEvidenceKeys[index] !== key
    ))
    || firstEvidence.quality !== 'reduced'
    || repeatedEvidence.quality !== 'reduced'
    || firstEvidence.region !== 'deep' || repeatedEvidence.region !== 'deep'
    || firstEvidence.band !== 'close' || repeatedEvidence.band !== 'close'
    || firstEvidence.stable !== true || repeatedEvidence.stable !== true
    || firstEvidence.selected !== true || repeatedEvidence.selected !== true
    || firstEvidence.recovered !== false
    || repeatedEvidence.recovered !== false
    || firstEvidence.recoveryExercised !== false
    || repeatedEvidence.recoveryExercised !== false
    || exactEvidenceFields.some(
      (key) => firstEvidence[key] !== repeatedEvidence[key]
    )
    || !Array.isArray(firstEvidence.material)
    || !Array.isArray(repeatedEvidence.material)
    || firstEvidence.material.length !== 4
    || firstEvidence.material.length !== repeatedEvidence.material.length
    || firstEvidence.material.some(
      (entry, index) => entry !== repeatedEvidence.material[index]
    )
    || !northernReachEvidenceArraysWithinTolerance(
      firstEvidence.coverage,
      repeatedEvidence.coverage
    )
    || firstEvidence.coverage.length !== 6
    || !northernReachEvidenceArraysWithinTolerance(
      firstEvidence.retained,
      repeatedEvidence.retained
    )
    || firstEvidence.retained.length !== 9
    || !northernReachEvidenceArraysWithinTolerance(
      firstEvidence.vertices,
      repeatedEvidence.vertices
    )
    || firstEvidence.vertices.length !== 4
    || !northernReachReducedMotionVisualShapeValid(firstVisual)
    || !northernReachReducedMotionVisualShapeValid(repeatedVisual)
    || exactVisualFields.some(
      (key) => firstVisual[key] !== repeatedVisual[key]
    )
    || !Number.isSafeInteger(firstVisual.coolHighAlbedoSamples)
    || !Number.isSafeInteger(repeatedVisual.coolHighAlbedoSamples)
    || Math.abs(
      firstVisual.coolHighAlbedoSamples
        - repeatedVisual.coolHighAlbedoSamples
    ) > NORTHERN_REACH_REDUCED_MOTION_COOL_SAMPLE_TOLERANCE
    || !Array.isArray(firstVisual.coolSpatialBuckets)
    || !Array.isArray(repeatedVisual.coolSpatialBuckets)
    || firstVisual.coolSpatialBuckets.length !== 9
    || repeatedVisual.coolSpatialBuckets.length !== 9
    || firstVisual.coolSpatialBuckets.some((entry, index) => (
      !Number.isSafeInteger(entry)
      || !Number.isSafeInteger(repeatedVisual.coolSpatialBuckets[index])
      || Math.abs(entry - repeatedVisual.coolSpatialBuckets[index])
        > NORTHERN_REACH_REDUCED_MOTION_BUCKET_TOLERANCE
    ))
  ) throw invalid();
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

async function readRenderedWebglCanvasCentreTarget(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('.realm-map-screen__canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const bounds = canvas.getBoundingClientRect();
      const safeCentreX = Number(
        canvas.getAttribute('data-realm-camera-safe-center-x')
      );
      const safeCentreY = Number(
        canvas.getAttribute('data-realm-camera-safe-center-y')
      );
      if (!Number.isFinite(safeCentreX) || !Number.isFinite(safeCentreY)) {
        return null;
      }
      const centre = {
        x: bounds.left + safeCentreX,
        y: bounds.top + safeCentreY,
      };
      const offsets = [
        [0, 0],
        [0, -24],
        [24, 0],
        [0, 24],
        [-24, 0],
      ];
      const target = offsets.map(([x, y]) => ({
        x: centre.x + x,
        y: centre.y + y,
      })).find(({ x, y }) => (
        x >= bounds.left + 1
        && y >= bounds.top + 1
        && x <= bounds.right - 1
        && y <= bounds.bottom - 1
        && document.elementFromPoint(x, y) === canvas
      ));
      return target ? {
        x: Math.round(target.x * 100) / 100,
        y: Math.round(target.y * 100) / 100,
      } : null;
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL canvas centre evaluation failed.');
  }
  return parseRenderedWebglCastleCanvasPointerTarget(evaluation.result.value);
}

async function waitForRenderedWebglCameraSettled(session) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const evaluation = await session.command('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.realm-map-screen');
        const canvas = root?.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        return root?.getAttribute('data-renderer-state') === 'ready'
          && canvas?.getAttribute('data-realm-camera-settled') === 'true';
      })()`,
      returnByValue: true,
    });
    if (
      !evaluation?.exceptionDetails
      && evaluation?.result?.type === 'boolean'
      && evaluation.result.value === true
    ) return;
    await delay(50);
  }
  throw new Error('Rendered WebGL camera did not settle.');
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
  // Castle hover now reconciles a foundation-bound GPU accent on the shared
  // animation frame. Let that bounded visual commit finish before sending the
  // independent press/release pair so the probe measures an ordinary settled
  // click instead of racing the immediately preceding five hover samples.
  await delay(50);
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

async function focusRenderedWebglActiveForestAnchor(session) {
  const focused = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.realm-map-screen');
      if (!(root instanceof HTMLElement)) return false;
      root.focus({ preventScroll: true });
      return document.activeElement === root;
    })()`,
    returnByValue: true,
  });
  if (
    focused?.exceptionDetails
    || focused?.result?.type !== 'boolean'
    || focused.result.value !== true
  ) throw new Error('Rendered WebGL active forest camera focus failed.');
  for (const key of [
    { code: 'ArrowRight', key: 'ArrowRight', virtualKeyCode: 39 },
    { code: 'Enter', key: 'Enter', virtualKeyCode: 13 },
  ]) {
    await session.command('Input.dispatchKeyEvent', {
      type: 'keyDown',
      code: key.code,
      key: key.key,
      windowsVirtualKeyCode: key.virtualKeyCode,
      nativeVirtualKeyCode: key.virtualKeyCode,
    });
    await session.command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      code: key.code,
      key: key.key,
      windowsVirtualKeyCode: key.virtualKeyCode,
      nativeVirtualKeyCode: key.virtualKeyCode,
    });
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const settled = await session.command('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.realm-map-screen');
        const canvas = root?.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        return root?.getAttribute('data-realm-camera-target-kind') === 'cell'
          && root?.getAttribute('data-renderer-state') === 'ready'
          && canvas?.getAttribute('data-realm-camera-settled') === 'true';
      })()`,
      returnByValue: true,
    });
    if (
      !settled?.exceptionDetails
      && settled?.result?.type === 'boolean'
      && settled.result.value === true
    ) return;
    await delay(50);
  }
  throw new Error('Rendered WebGL active forest anchor did not settle.');
}

/**
 * Establishes the same quality-independent close cell focus through the real
 * keyboard lane, then replays bounded ordinary wheel input at the camera's
 * composed safe centre. No world coordinate or identity leaves the page.
 */
export async function applyRenderedWebglActiveForestCameraInteraction(session) {
  await focusRenderedWebglActiveForestAnchor(session);
  // The camera's composed safe-viewport centre changes zoom without
  // translating focus around reserved HUD space. That makes the
  // High/Balanced/Reduced budget samples exact camera peers instead of merely
  // members of the same close band.
  const target = await readRenderedWebglCanvasCentreTarget(session);
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
    // Each ordinary wheel step must complete from the same settled anchor.
    // Dispatching the full sequence back-to-back lets quality-dependent frame
    // cadence decide which intermediate pose the next event observes.
    await waitForRenderedWebglCameraSettled(session);
  }
  return Object.freeze({
    wheelStepCount: RENDERED_WEBGL_QA_ACTIVE_FOREST_WHEEL_STEPS,
  });
}

async function readRenderedWebglQualityMetrics(session, expectedQuality) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.realm-map-screen');
      const canvas = root?.querySelector('canvas[data-realm-canvas-active="true"]');
      const overlay = document.querySelector('[data-rendered-webgl-status]');
      if (
        !(root instanceof HTMLElement)
        || !(canvas instanceof HTMLCanvasElement)
        || !(overlay instanceof HTMLElement)
      ) return null;
      const integer = (element, name) => {
        const value = element.getAttribute(name);
        return typeof value === 'string' && /^(?:0|[1-9]\\d*)$/u.test(value)
          ? Number(value)
          : null;
      };
      const cameraProjection = [...document.querySelectorAll(
        'button.realm-castle-label'
      )].map((label) => {
        const style = getComputedStyle(label);
        const x = Number.parseFloat(
          style.getPropertyValue('--realm-castle-anchor-x')
        );
        const y = Number.parseFloat(
          style.getPropertyValue('--realm-castle-anchor-y')
        );
        return Number.isFinite(x) && Number.isFinite(y)
          ? x.toFixed(3) + ',' + y.toFixed(3)
          : null;
      }).filter((value) => value !== null).sort();
      let cameraProjectionHash = 2166136261;
      const cameraProjectionPayload =
        cameraProjection.length + '|' + cameraProjection.join('|');
      for (let index = 0; index < cameraProjectionPayload.length; index += 1) {
        cameraProjectionHash ^= cameraProjectionPayload.charCodeAt(index);
        cameraProjectionHash = Math.imul(
          cameraProjectionHash,
          16777619
        ) >>> 0;
      }
      return {
        cameraMode: root.getAttribute('data-realm-camera-mode'),
        cameraProjectionCount: cameraProjection.length,
        cameraProjectionToken:
          cameraProjectionHash.toString(16).padStart(8, '0'),
        cameraStateToken:
          canvas.getAttribute('data-realm-camera-state-token'),
        cameraSynchronized:
          root.getAttribute('data-realm-camera-mode')
            === canvas.getAttribute('data-realm-camera-mode')
          && root.getAttribute('data-realm-camera-presentation-band')
            === canvas.getAttribute('data-realm-camera-presentation-band')
          && canvas.getAttribute('data-realm-camera-settled') === 'true',
        cameraTargetKind:
          root.getAttribute('data-realm-camera-target-kind'),
        cameraZoom: canvas.getAttribute('data-realm-camera-current-zoom'),
        decorativeForestCacheEntries: integer(
          root,
          'data-forest-decorative-cache-entries'
        ),
        decorativeForestCacheHighWaterMark: integer(
          root,
          'data-forest-decorative-cache-high-water-mark'
        ),
        decorativeForestCacheLimit: integer(
          root,
          'data-forest-decorative-cache-limit'
        ),
        decorativeForestDrawCalls: integer(
          root,
          'data-forest-decorative-draw-calls'
        ),
        decorativeForestInstances: integer(
          root,
          'data-forest-decorative-tree-count'
        ),
        decorativeForestMotionState:
          root.getAttribute('data-forest-decorative-canopy-motion-state'),
        decorativeForestTriangles: integer(
          root,
          'data-forest-decorative-triangle-count'
        ),
        grassAnimated:
          root.getAttribute('data-grass-animated') === 'true'
            ? true
            : root.getAttribute('data-grass-animated') === 'false'
              ? false
              : null,
        grassTargetAnimationCadence: integer(
          root,
          'data-grass-target-animation-cadence'
        ),
        grassCacheEntries: integer(root, 'data-grass-cache-entries'),
        grassCacheHighWaterMark: integer(
          root,
          'data-grass-cache-high-water-mark'
        ),
        grassCacheLimit: integer(root, 'data-grass-cache-limit'),
        grassDrawCalls: integer(root, 'data-grass-draw-calls'),
        grassInstances: integer(root, 'data-grass-instance-count'),
        grassTriangles: integer(root, 'data-grass-triangle-count'),
        presentationBand:
          root.getAttribute('data-realm-camera-presentation-band'),
        quality: overlay.getAttribute('data-quality'),
        routeDrawCalls: integer(
          canvas,
          'data-realm-worker-route-draw-call-count'
        ),
        routeSegments: integer(
          canvas,
          'data-realm-worker-visible-route-segment-count'
        ),
        routeTriangles: integer(
          canvas,
          'data-realm-worker-route-triangle-count'
        ),
        routeVisible: integer(
          canvas,
          'data-realm-worker-visible-route-count'
        ),
        sharedForestInstances: integer(root, 'data-shared-forest-tree-count'),
        sharedForestTriangles: integer(root, 'data-forest-visible-triangle-count'),
        terrainDetailDrawCalls: integer(
          root,
          'data-total-terrain-detail-draw-calls'
        ),
        terrainDetailInstances: integer(
          root,
          'data-total-terrain-detail-instance-count'
        ),
        terrainTriangles: integer(root, 'data-terrain-triangle-count'),
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
        waterDrawCalls: integer(canvas, 'data-water-draw-calls'),
        waterTriangles: integer(canvas, 'data-water-triangle-count'),
        workerAnimated: integer(canvas, 'data-realm-worker-animated-count'),
        workerAnimationTransitions: integer(
          canvas,
          'data-realm-worker-animation-transition-count'
        ),
        workerFallbackTriangles: integer(
          canvas,
          'data-realm-worker-fallback-triangle-count'
        ),
        workerModels: integer(canvas, 'data-realm-worker-model-count'),
        workerPresented: integer(canvas, 'data-realm-worker-presented-count'),
      };
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL quality metrics evaluation failed.');
  }
  const metrics = parseRenderedWebglQualityMetrics(evaluation.result.value);
  if (metrics.quality !== expectedQuality) {
    throw new Error('Rendered WebGL quality metrics tier mismatched.');
  }
  return metrics;
}

async function waitForStableRenderedWebglQualityMetrics(
  session,
  expectedQuality
) {
  const deadline = Date.now() + 5_000;
  let previousAggregate = '';
  let stableObservationCount = 0;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const metrics = await readRenderedWebglQualityMetrics(
        session,
        expectedQuality
      );
      const aggregate = JSON.stringify(metrics);
      if (aggregate === previousAggregate) stableObservationCount += 1;
      else {
        previousAggregate = aggregate;
        stableObservationCount = 1;
      }
      if (stableObservationCount >= 3) return metrics;
    } catch (error) {
      lastError = error;
      previousAggregate = '';
      stableObservationCount = 0;
    }
    await delay(100);
  }
  throw new Error('Rendered WebGL quality metrics did not settle.', {
    cause: lastError
  });
}

async function readRenderedWebglPresentationBandSnapshot(session) {
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.realm-map-screen');
      const canvas = root?.querySelector('canvas[data-realm-canvas-active="true"]');
      if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
        return null;
      }
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
      const labels = [...document.querySelectorAll('button.realm-castle-label')]
        .filter(visible);
      const readableLabelCount = labels.filter((label) => (
        visible(label.querySelector('.realm-castle-label__identity'))
      )).length;
      const collapsedLabelCount = labels.filter((label) => {
        const identity = label.querySelector('.realm-castle-label__identity');
        const plate = label.querySelector('.realm-castle-label__plate');
        return !visible(identity) && visible(plate);
      }).length;
      const ownLabels = labels.filter((label) => (
        label.getAttribute('data-own') === 'true'
      ));
      const resourceControls = [...document.querySelectorAll(
        '.realm-resource-occupant-marker[data-projected-visible="true"]'
      )].filter(visible);
      const resourcePresences = [...document.querySelectorAll(
        '.realm-resource-occupant-presence[data-projected-visible="true"]'
      )].filter(visible);
      const fixtureStatus = document.querySelector('[data-rendered-webgl-status]');
      return {
        band: root.getAttribute('data-realm-camera-presentation-band'),
        cameraSynchronized:
          root.getAttribute('data-realm-camera-mode')
            === canvas.getAttribute('data-realm-camera-mode')
          && root.getAttribute('data-realm-camera-presentation-band')
            === canvas.getAttribute('data-realm-camera-presentation-band'),
        collapsedLabelCount,
        forestOverviewHidden:
          root.getAttribute('data-forest-decorative-overview-hidden') === 'true',
        grassInstanceCount: Number(root.getAttribute('data-grass-instance-count')),
        grassOverviewHidden:
          root.getAttribute('data-grass-overview-hidden') === 'true',
        labelCount: labels.length,
        ownLabelCount: ownLabels.length,
        ownReadableLabelCount: ownLabels.filter((label) => (
          visible(label.querySelector('.realm-castle-label__identity'))
        )).length,
        readableLabelCount,
        resourceControlCount: resourceControls.length,
        resourceOwnControlCount: resourceControls.filter((control) => (
          control.getAttribute('data-occupied-by-viewer') === 'true'
        )).length,
        resourcePeerControlCount: resourceControls.filter((control) => (
          control.getAttribute('data-occupied-by-viewer') === 'false'
        )).length,
        resourcePresenceCount: resourcePresences.length,
        resourceSourceCount: Number(
          fixtureStatus?.getAttribute('data-resource-occupation-count')
        ),
        routeCount: Number(canvas.getAttribute('data-realm-worker-visible-route-count')),
        sceneCreationCount: Number(root.getAttribute('data-realm-scene-creation-count')),
        sceneDisposalCount: Number(root.getAttribute('data-realm-scene-disposal-count')),
        rendererGeneration: Number(root.getAttribute('data-renderer-generation')),
        surfaceCount: document.querySelectorAll(
          '.castle-inspection, .realm-cell-navigator__dialog, .realm-profile-menu__panel'
        ).length,
      };
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL presentation-band snapshot failed.');
  }
  const value = evaluation.result.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Rendered WebGL presentation-band snapshot failed.');
  }
  return value;
}

async function settleRenderedWebglPresentationBand(session, expectedBand, initialSnapshot) {
  let previous = initialSnapshot;
  let stableSampleCount = 0;
  for (let sample = 0; sample < 40; sample += 1) {
    await delay(50);
    const current = await readRenderedWebglPresentationBandSnapshot(session);
    const stable = current.band === expectedBand
      && previous?.band === expectedBand
      && JSON.stringify(current) === JSON.stringify(previous);
    stableSampleCount = stable ? stableSampleCount + 1 : 0;
    previous = current;
    if (stableSampleCount >= 3) return current;
  }
  return previous;
}

/**
 * Uses one active-worker page and ordinary wheel input to prove that overview,
 * strategy, and close presentation policies change content without replacing
 * the scene. Only aggregate counts and booleans cross the local CDP boundary.
 */
export async function applyRenderedWebglPresentationBandInteraction(session) {
  const target = await readRenderedWebglCastleCanvasPointerTarget(session);
  let overview = await readRenderedWebglPresentationBandSnapshot(session);
  for (let step = 0; step < 8 && overview.band !== 'overview'; step += 1) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: target.x,
      y: target.y,
      deltaX: 0,
      deltaY: 220,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
    await delay(100);
    overview = await readRenderedWebglPresentationBandSnapshot(session);
  }
  if (overview.band === 'overview') {
    overview = await settleRenderedWebglPresentationBand(session, 'overview', overview);
  }
  let strategy;
  let close;
  for (let step = 0; step < 8 && !strategy; step += 1) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: target.x,
      y: target.y,
      deltaX: 0,
      deltaY: -220,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
    await delay(100);
    const snapshot = await readRenderedWebglPresentationBandSnapshot(session);
    if (snapshot.band === 'strategy') strategy = snapshot;
  }
  if (strategy) {
    strategy = await settleRenderedWebglPresentationBand(session, 'strategy', strategy);
  }
  for (
    let refinement = 0;
    refinement < 3
      && strategy?.band === 'strategy'
      && (strategy.grassOverviewHidden || strategy.forestOverviewHidden);
    refinement += 1
  ) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: target.x,
      y: target.y,
      deltaX: 0,
      deltaY: -110,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
    await delay(150);
    const refined = await readRenderedWebglPresentationBandSnapshot(session);
    if (refined.band !== 'strategy') break;
    strategy = await settleRenderedWebglPresentationBand(session, 'strategy', refined);
  }
  for (let step = 0; step < 8 && !close; step += 1) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: target.x,
      y: target.y,
      deltaX: 0,
      deltaY: -220,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
    await delay(100);
    const snapshot = await readRenderedWebglPresentationBandSnapshot(session);
    if (snapshot.band === 'close') close = snapshot;
  }
  if (close) {
    close = await settleRenderedWebglPresentationBand(session, 'close', close);
  }
  const snapshots = [overview, strategy, close].filter(Boolean);
  const stable = snapshots.length === 3
    && snapshots.every((snapshot) => (
      snapshot.rendererGeneration === overview.rendererGeneration
      && snapshot.sceneCreationCount === overview.sceneCreationCount
      && snapshot.sceneDisposalCount === overview.sceneDisposalCount
    ));
  const evidence = {
    cameraSynchronized: snapshots.length === 3
      && snapshots.every((snapshot) => snapshot.cameraSynchronized === true),
    closeHierarchySimplified: close?.band === 'close'
      && close.labelCount >= 1
      && close.collapsedLabelCount >= 1
      && close.grassOverviewHidden === false
      && close.forestOverviewHidden === false,
    noUiChurn: snapshots.length === 3
      && snapshots.every((snapshot) => snapshot.surfaceCount === 0),
    overviewMacroOnly: overview.band === 'overview'
      && overview.grassOverviewHidden === true
      && overview.forestOverviewHidden === true
      && overview.grassInstanceCount === 0,
    overviewOwnIdentityRetained: overview.ownLabelCount === 1
      && overview.ownReadableLabelCount === 1,
    overviewPeerIdentitySimplified: overview.resourcePeerControlCount === 0
      && overview.resourceSourceCount === 2,
    sceneStable: stable,
    strategyHierarchyExpanded: strategy?.band === 'strategy'
      && strategy.labelCount >= 1
      && strategy.readableLabelCount === strategy.labelCount
      && strategy.collapsedLabelCount === 0
      && strategy.grassOverviewHidden === false
      && strategy.forestOverviewHidden === false
      && strategy.ownLabelCount === 1
      && strategy.ownReadableLabelCount === 1,
    visitedAllBands: overview.band === 'overview'
      && strategy?.band === 'strategy'
      && close?.band === 'close',
  };
  try {
    return parseRenderedWebglPresentationBandEvidence(evidence);
  } catch (error) {
    const safeSnapshot = (snapshot) => snapshot ? {
      band: snapshot.band,
      collapsedLabelCount: snapshot.collapsedLabelCount,
      forestOverviewHidden: snapshot.forestOverviewHidden,
      grassInstanceCount: snapshot.grassInstanceCount,
      grassOverviewHidden: snapshot.grassOverviewHidden,
      labelCount: snapshot.labelCount,
      ownLabelCount: snapshot.ownLabelCount,
      ownReadableLabelCount: snapshot.ownReadableLabelCount,
      readableLabelCount: snapshot.readableLabelCount,
      resourceControlCount: snapshot.resourceControlCount,
      resourceOwnControlCount: snapshot.resourceOwnControlCount,
      resourcePeerControlCount: snapshot.resourcePeerControlCount,
      resourcePresenceCount: snapshot.resourcePresenceCount,
      resourceSourceCount: snapshot.resourceSourceCount,
      routeCount: snapshot.routeCount,
    } : null;
    throw new TypeError(
      `Rendered WebGL presentation-band aggregate mismatch: ${JSON.stringify({
        overview: safeSnapshot(overview),
        strategy: safeSnapshot(strategy),
        close: safeSnapshot(close),
      })}`,
      { cause: error }
    );
  }
}

/**
 * Replays the reported upper-right overview using only ordinary camera input.
 * The synthetic active-Worker fixture keeps route reconciliation present while
 * proving that overview policy suppresses its route ribbon and retains the
 * canonical full-cell river surface without a fallback or shader failure.
 */
export async function applyRenderedWebglWaterOverviewInteraction(session) {
  const targetEvaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector(
        '.realm-map-screen canvas[data-realm-canvas-active="true"]'
      );
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const bounds = canvas.getBoundingClientRect();
      const target = {
        x: Math.round((bounds.left + bounds.right) * 50) / 100,
        y: Math.round((bounds.top + bounds.bottom) * 50) / 100,
      };
      return document.elementFromPoint(target.x, target.y) === canvas
        ? target
        : null;
    })()`,
    returnByValue: true,
  });
  if (
    targetEvaluation?.exceptionDetails
    || targetEvaluation?.result?.type !== 'object'
  ) throw new Error('Rendered WebGL Water overview target failed.');
  const target = parseRenderedWebglCastleCanvasPointerTarget(
    targetEvaluation.result.value
  );

  let overview = await readRenderedWebglPresentationBandSnapshot(session);
  for (let step = 0; step < 10 && overview.band !== 'overview'; step += 1) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: target.x,
      y: target.y,
      deltaX: 0,
      deltaY: 240,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
    await waitForRenderedWebglCameraSettled(session);
    overview = await readRenderedWebglPresentationBandSnapshot(session);
  }
  if (overview.band !== 'overview') {
    throw new Error('Rendered WebGL Water overview camera did not reach overview.');
  }

  for (
    let drag = 0;
    drag < RENDERED_WEBGL_QA_WATER_OVERVIEW_DRAG_COUNT;
    drag += 1
  ) {
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: target.x,
      y: target.y,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
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
      type: 'mouseMoved',
      x: target.x + RENDERED_WEBGL_QA_WATER_OVERVIEW_DRAG.x,
      y: target.y + RENDERED_WEBGL_QA_WATER_OVERVIEW_DRAG.y,
      button: 'left',
      buttons: 1,
      pointerType: 'mouse',
    });
    await session.command('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: target.x + RENDERED_WEBGL_QA_WATER_OVERVIEW_DRAG.x,
      y: target.y + RENDERED_WEBGL_QA_WATER_OVERVIEW_DRAG.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'mouse',
    });
    await waitForRenderedWebglCameraSettled(session);
  }

  const evidence = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const root = document.querySelector('.realm-map-screen');
      const canvas = root?.querySelector(
        'canvas[data-realm-canvas-active="true"]'
      );
      if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
        return null;
      }
      const integer = (name) => {
        const value = canvas.getAttribute(name);
        return typeof value === 'string' && /^(?:0|[1-9]\\d*)$/u.test(value)
          ? Number(value)
          : null;
      };
      const rootInteger = (name) => {
        const value = root.getAttribute(name);
        return typeof value === 'string' && /^(?:0|[1-9]\\d*)$/u.test(value)
          ? Number(value)
          : null;
      };
      const firstCameraStateToken =
        canvas.getAttribute('data-realm-camera-state-token');
      await new Promise((resolve) => requestAnimationFrame(() => (
        requestAnimationFrame(resolve)
      )));
      const secondCameraStateToken =
        canvas.getAttribute('data-realm-camera-state-token');
      return {
        cameraMode: root.getAttribute('data-realm-camera-mode'),
        cameraStateAttested:
          typeof firstCameraStateToken === 'string'
          && /^[0-9a-f]{24}$/u.test(firstCameraStateToken)
          && secondCameraStateToken === firstCameraStateToken,
        cameraSynchronized:
          root.getAttribute('data-realm-camera-mode')
            === canvas.getAttribute('data-realm-camera-mode')
          && root.getAttribute('data-realm-camera-presentation-band')
            === canvas.getAttribute('data-realm-camera-presentation-band')
          && canvas.getAttribute('data-realm-camera-settled') === 'true',
        cameraZoom: canvas.getAttribute('data-realm-camera-current-zoom'),
        presentationBand:
          root.getAttribute('data-realm-camera-presentation-band'),
        riverBodyCount: integer('data-water-river-body-count'),
        riverChannelBodyCount:
          integer('data-water-river-channel-body-count'),
        riverChannelSegmentCount:
          integer('data-water-river-channel-segment-count'),
        riverFallbackBodyCount:
          integer('data-water-river-fallback-body-count'),
        riverFallbackCellCount:
          integer('data-water-river-fallback-cell-count'),
        riverFullCellCount:
          integer('data-water-river-full-cell-count'),
        riverFullCellTriangleCount:
          integer('data-water-river-full-cell-triangle-count'),
        riverBankEdgeCount:
          integer('data-water-river-bank-edge-count'),
        riverSharedEdgeCount:
          integer('data-water-river-shared-edge-count'),
        riverMouthEdgeCount:
          integer('data-water-river-mouth-edge-count'),
        riverIncompleteCellCount:
          integer('data-water-river-incomplete-cell-count'),
        riverOverlappingPhysicalTriangleCount:
          integer('data-water-river-overlapping-physical-triangle-count'),
        riverMouthConnectionCount:
          integer('data-water-river-mouth-connection-count'),
        routeDrawCalls:
          integer('data-realm-worker-route-draw-call-count'),
        routeSegments:
          integer('data-realm-worker-visible-route-segment-count'),
        routeTriangles:
          integer('data-realm-worker-route-triangle-count'),
        routeVisible:
          integer('data-realm-worker-visible-route-count'),
        waterDrawCalls: integer('data-water-draw-calls'),
        waterNavigationIssueCount:
          rootInteger('data-water-navigation-issue-count'),
        waterNavigationNodeCount:
          rootInteger('data-water-navigation-node-count'),
        waterNavigationOceanNodeCount:
          rootInteger('data-water-navigation-ocean-node-count'),
        waterNavigationRiverNodeCount:
          rootInteger('data-water-navigation-river-node-count'),
        waterNavigationStatus:
          root.getAttribute('data-water-navigation-status'),
        waterPresentation: canvas.getAttribute('data-water-presentation'),
        waterShaderFallbackCount:
          integer('data-water-shader-fallback-count'),
        waterTriangles: integer('data-water-triangle-count'),
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evidence?.exceptionDetails || evidence?.result?.type !== 'object') {
    throw new Error('Rendered WebGL Water overview evidence failed.');
  }
  return parseRenderedWebglWaterOverviewEvidence(evidence.result.value);
}

export async function applyRenderedWebglViewportRotationInteraction(
  session,
  probeCase,
  state
) {
  const before = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.realm-map-screen');
      const canvas = root?.querySelector('canvas[data-realm-canvas-active="true"]');
      if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
        return false;
      }
      root.focus({ preventScroll: true });
      globalThis.__warpkeepRenderedViewportRotation = {
        band: root.getAttribute('data-realm-camera-presentation-band'),
        canvas,
        creationCount: root.getAttribute('data-realm-scene-creation-count'),
        disposalCount: root.getAttribute('data-realm-scene-disposal-count'),
        generation: root.getAttribute('data-renderer-generation'),
        mode: root.getAttribute('data-realm-camera-mode'),
        selectedCastleCount: document.querySelectorAll(
          'button.realm-castle-label[aria-pressed="true"]'
        ).length,
        selectedResourceCount: document.querySelectorAll(
          '[data-resource-occupant-key][data-selected="true"]'
        ).length,
        targetKind: root.getAttribute('data-realm-camera-target-kind'),
        zoom: canvas.getAttribute('data-realm-camera-zoom'),
      };
      return document.activeElement === root;
    })()`,
    returnByValue: true,
  });
  if (before?.exceptionDetails || before?.result?.value !== true) {
    throw new Error('Rendered WebGL viewport-rotation setup failed.');
  }
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{
      x: Math.floor(probeCase.viewport.width / 2),
      y: Math.floor(probeCase.viewport.height / 2),
      radiusX: 1,
      radiusY: 1,
      force: 1,
      id: 41,
    }],
  });
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: SHORT_LANDSCAPE_VIEWPORT.width,
    height: SHORT_LANDSCAPE_VIEWPORT.height,
    screenWidth: SHORT_LANDSCAPE_VIEWPORT.width,
    screenHeight: SHORT_LANDSCAPE_VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.command('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const rotatedCase = Object.freeze({
    ...probeCase,
    viewport: SHORT_LANDSCAPE_VIEWPORT,
  });
  await waitForAcceptedRenderedDom(session, rotatedCase, state);
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const before = globalThis.__warpkeepRenderedViewportRotation;
      const root = document.querySelector('.realm-map-screen');
      const canvas = root?.querySelector('canvas[data-realm-canvas-active="true"]');
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
      const inViewport = (element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= -0.5
          && bounds.top >= -0.5
          && bounds.right <= innerWidth + 0.5
          && bounds.bottom <= innerHeight + 0.5;
      };
      const primaryControls = [...document.querySelectorAll(
        '.realm-profile-trigger, .realm-resource-rail button, '
          + 'button.realm-castle-label, .realm-cell-navigator > button'
      )].filter(visible);
      const evidence = {
        cameraIntentPreserved: root?.getAttribute('data-realm-camera-mode') === before?.mode
          && root?.getAttribute('data-realm-camera-presentation-band') === before?.band
          && root?.getAttribute('data-realm-camera-target-kind') === before?.targetKind
          && canvas?.getAttribute('data-realm-camera-zoom') === before?.zoom,
        compositionUsable: document.documentElement.scrollWidth <= innerWidth
          && primaryControls.length >= 1
          && primaryControls.every((control) => {
            const bounds = control.getBoundingClientRect();
            return bounds.width >= 44 && bounds.height >= 44 && inViewport(control);
          }),
        focusPreserved: document.activeElement === root,
        inertiaCancelled: canvas?.getAttribute('data-realm-camera-inertia-active') === 'false'
          && canvas?.getAttribute('data-dragging') !== 'true'
          && !root?.hasAttribute('data-camera-interacting'),
        rendererStable: root?.getAttribute('data-renderer-generation') === before?.generation
          && root?.getAttribute('data-realm-scene-creation-count') === before?.creationCount
          && root?.getAttribute('data-realm-scene-disposal-count') === before?.disposalCount,
        sameCanvas: canvas === before?.canvas,
        selectionPreserved: document.querySelectorAll(
          'button.realm-castle-label[aria-pressed="true"]'
        ).length === before?.selectedCastleCount
          && document.querySelectorAll(
            '[data-resource-occupant-key][data-selected="true"]'
          ).length === before?.selectedResourceCount,
        viewportRotated: innerWidth === ${SHORT_LANDSCAPE_VIEWPORT.width}
          && innerHeight === ${SHORT_LANDSCAPE_VIEWPORT.height},
      };
      delete globalThis.__warpkeepRenderedViewportRotation;
      return evidence;
    })()`,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL viewport-rotation evidence failed.');
  }
  return parseRenderedWebglViewportRotationEvidence(evaluation.result.value);
}

/**
 * Exercises the exact player-facing failure lane: acquire a drag directly on a
 * castle label, cross the threshold in small increments, release without
 * activating the label, then wheel over a current direct label. Page-local
 * coordinate aggregates prove both camera changes even if projection updates
 * remount or cull an individual label between animation frames.
 */
export async function applyRenderedWebglMapGestureInteraction(
  session,
  expectedReducedMotion = false
) {
  if (typeof expectedReducedMotion !== 'boolean') {
    throw new Error('Invalid rendered WebGL map gesture motion policy.');
  }
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
        expectedReducedMotion: ${JSON.stringify(expectedReducedMotion)},
        initialInertiaCancellationCount: Number(
          canvas.getAttribute('data-realm-camera-inertia-cancellation-count')
        ),
        initialInertialReleaseCount: Number(
          canvas.getAttribute('data-realm-camera-inertial-release-count')
        ),
        initialRendererGeneration: Number(
          root.getAttribute('data-renderer-generation')
        ),
        initialSceneCreationCount: Number(
          root.getAttribute('data-realm-scene-creation-count')
        ),
        initialSelectedCastleLabelCount: document.querySelectorAll(
          'button.realm-castle-label[aria-pressed="true"]'
        ).length,
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
      state.inertiaActiveBeforeWheel = state.canvas.getAttribute(
        'data-realm-camera-inertia-active'
      ) === 'true';
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
        inertiaPolicyValid: false,
        inertiaSettled: false,
        inputClean: false,
        rendererGenerationStable: false,
        selectionStable: false,
        settled: false,
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
        inertiaPolicyValid: state.expectedReducedMotion
          ? Number(state.canvas.getAttribute(
              'data-realm-camera-inertial-release-count'
            )) === state.initialInertialReleaseCount
          : Number(state.canvas.getAttribute(
              'data-realm-camera-inertial-release-count'
            )) > state.initialInertialReleaseCount
            && (
              state.inertiaActiveBeforeWheel !== true
              || Number(state.canvas.getAttribute(
                'data-realm-camera-inertia-cancellation-count'
              )) > state.initialInertiaCancellationCount
            ),
        inertiaSettled: state.canvas.getAttribute(
          'data-realm-camera-inertia-active'
        ) === 'false',
        inputClean: state.inputClean === true
          && state.canvas.getAttribute('data-dragging') !== 'true'
          && !state.root.hasAttribute('data-camera-interacting'),
        rendererGenerationStable: Number(state.root.getAttribute(
          'data-renderer-generation'
        )) === state.initialRendererGeneration
          && Number(state.root.getAttribute(
            'data-realm-scene-creation-count'
          )) === state.initialSceneCreationCount,
        selectionStable: document.querySelectorAll(
          'button.realm-castle-label[aria-pressed="true"]'
        ).length === state.initialSelectedCastleLabelCount,
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
    const launcherEvaluation = await session.command('Runtime.evaluate', {
      expression: `(() => {
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
        return true;
      })()`,
      returnByValue: true,
    });
    if (
      launcherEvaluation?.exceptionDetails
      || launcherEvaluation?.result?.value !== true
    ) {
      throw new Error('Rendered WebGL QA player Explore launcher failed.');
    }
    const deadline = Date.now() + PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS;
    let targetReady = false;
    while (Date.now() <= deadline && !targetReady) {
      const targetEvaluation = await session.command('Runtime.evaluate', {
        expression: `(() => {
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
          const panel = document.querySelector('.realm-profile-menu__panel');
          const targets = [...(panel?.querySelectorAll('nav button') ?? [])].filter((button) => (
            button instanceof HTMLButtonElement
            && !button.disabled
            && visible(button)
            && (button.querySelector('strong')?.textContent ?? '').trim() === 'EXPLORE'
          ));
          return targets.length === 1;
        })()`,
        returnByValue: true,
      });
      if (targetEvaluation?.exceptionDetails) {
        throw new Error('Rendered WebGL QA player Explore target evaluation failed.');
      }
      targetReady = targetEvaluation?.result?.value === true;
      if (!targetReady) {
        const remaining = deadline - Date.now();
        if (remaining > 0) await delay(Math.min(40, remaining));
      }
    }
    if (!targetReady) {
      throw new Error('Rendered WebGL QA player Explore target did not settle.');
    }
    const activationEvaluation = await session.command('Runtime.evaluate', {
      expression: `(() => {
        const panel = document.querySelector('.realm-profile-menu__panel');
        const targets = [...(panel?.querySelectorAll('nav button') ?? [])].filter((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && (button.querySelector('strong')?.textContent ?? '').trim() === 'EXPLORE'
        ));
        if (targets.length !== 1) return false;
        targets[0].focus({ preventScroll: true });
        targets[0].click();
        return true;
      })()`,
      returnByValue: true,
    });
    if (
      activationEvaluation?.exceptionDetails
      || activationEvaluation?.result?.value !== true
    ) {
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
      const overviewPreferredKeys = Object.freeze([
        'gold:genesis-001-tier1-gold-11',
        'gold:genesis-001-tier1-gold-03',
        'food:genesis-001-tier1-food-004',
        'wood:genesis-001-tier1-wood-033',
        'stone:genesis-001-tier1-stone-059'
      ]);
      let overviewTargetKey = '';
      const presentationForKey = (selector, key) => (
        [...document.querySelectorAll(selector)].find((element) => (
          element.getAttribute('data-resource-occupant-key') === key
        ))
      );
      const overviewPresentation = () => (
        presentationForKey(
          '.realm-resource-occupant-presence',
          overviewTargetKey
        ) ?? presentationForKey(
          'button.realm-resource-occupant-marker',
          overviewTargetKey
        )
      );
      const cameraStateToken = () => {
        const root = document.querySelector('.realm-map-screen');
        const canvas = root?.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        return canvas?.getAttribute('data-realm-camera-state-token') ?? '';
      };
      const cameraSettledAfter = (previousToken) => {
        const root = document.querySelector('.realm-map-screen');
        const canvas = root?.querySelector(
          'canvas[data-realm-canvas-active="true"]'
        );
        const currentToken = canvas?.getAttribute(
          'data-realm-camera-state-token'
        ) ?? '';
        return root instanceof HTMLElement
          && root.getAttribute('data-realm-camera-target-kind') === 'cell-location'
          && root.getAttribute('data-renderer-state') === 'ready'
          && !root.hasAttribute('data-camera-interacting')
          && canvas instanceof HTMLCanvasElement
          && canvas.getAttribute('data-realm-camera-settled') === 'true'
          && /^[0-9a-f]{24}$/.test(currentToken)
          && currentToken !== previousToken;
      };
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
      const navigateToOccupiedSite = async (target) => {
        const previousCameraToken = cameraStateToken();
        if (!/^[0-9a-f]{24}$/.test(previousCameraToken)) return false;
        if (!await openExplore()) return false;
        if (expectedMode === 'player') {
          if (document.querySelector('.realm-cell-navigator__jump') !== null) return false;
          const matches = [...document.querySelectorAll(
            '.realm-cell-navigator__resource-site'
              + '[data-resource-kind][data-resource-state]'
          )].filter((button) => (
            button instanceof HTMLButtonElement
            && !button.disabled
            && button.getAttribute('data-resource-kind') === target.resource
            && button.getAttribute('data-resource-state') === 'occupied'
            && (button.getAttribute('aria-label') ?? '').trim().length > 0
            && visible(button)
          ));
          const resourceButton = matches[target.occurrence];
          if (!(resourceButton instanceof HTMLButtonElement)) return false;
          resourceButton.scrollIntoView({
            behavior: 'instant',
            block: 'center',
            inline: 'nearest'
          });
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const resourceBounds = resourceButton.getBoundingClientRect();
          if (
            resourceBounds.width < 44
            || resourceBounds.height < 44
            || resourceBounds.right <= 0
            || resourceBounds.bottom <= 0
            || resourceBounds.left >= innerWidth
            || resourceBounds.top >= innerHeight
          ) return false;
          resourceButton.focus({ preventScroll: true });
          resourceButton.click();
          const inspectorSelector = [
            '.gold-mine-inspection',
            '.food-farm-inspection',
            '.logging-camp-inspection',
            '.stone-quarry-inspection'
          ].join(', ');
          const inspectorReady = await waitFor(() => {
            const panel = document.querySelector(inspectorSelector);
            return panel instanceof HTMLElement && visible(panel);
          });
          const inspector = document.querySelector(inspectorSelector);
          if (!inspectorReady || !(inspector instanceof HTMLElement)) return false;
          const close = inspector.querySelector('button[aria-label^="CLOSE "]');
          if (!(close instanceof HTMLButtonElement)) return false;
          close.click();
          return waitFor(() => (
            document.querySelector('.realm-cell-navigator__dialog') === null
            && document.querySelector(inspectorSelector) === null
            && cameraSettledAfter(previousCameraToken)
          ));
        }
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
        if (
          !setInputValue(inputs[0], target.q)
          || !setInputValue(inputs[1], target.r)
        ) return false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        form.requestSubmit();
        return waitFor(() => (
          document.querySelector('.realm-cell-navigator__dialog') === null
          && cameraSettledAfter(previousCameraToken)
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
        Object.freeze({
          occurrence: 1,
          q: '20',
          r: '-22',
          resource: 'gold'
        }),
        Object.freeze({
          occurrence: 0,
          q: '-51',
          r: '57',
          resource: 'gold'
        }),
        Object.freeze({
          occurrence: 0,
          q: '-42',
          r: '57',
          resource: 'food'
        }),
        Object.freeze({
          occurrence: 0,
          q: '-41',
          r: '48',
          resource: 'wood'
        }),
        Object.freeze({
          occurrence: 0,
          q: '-52',
          r: '50',
          resource: 'stone'
        })
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
      for (const target of focusedCameraTargets) {
        if (!await navigateToOccupiedSite(target)) continue;
        // Player-mode semantic navigation intentionally waits until Explore
        // has unmounted before it recomposes the camera target. The portrait
        // canvas can therefore become ready one or two presentation frames
        // after the inspector close transition on a cold browser profile.
        // Use the same bounded settle window as the rendered presentation
        // contract rather than racing that real lifecycle with a short probe-
        // local timeout.
        markerReady = await waitFor(
          () => readyFocusedMarker() !== undefined,
          ${PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS}
        );
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
      const focusedPresence = [...document.querySelectorAll(
        '.realm-resource-occupant-presence'
      )].find((element) => (
        element.getAttribute('data-resource-occupant-key') === focusedMarkerKey
      ));
      const focusedExpected = focusedRecordByKey[focusedMarkerKey];
      const presenceLayer = document.querySelector('.realm-resource-occupant-presences');
      const controlLayer = marker?.closest('.realm-resource-occupant-markers');
      const castleLayer = document.querySelector('.realm-castle-labels');
      const worldMarkerLayer = document.querySelector(
        '.realm-map-screen__world-markers'
      );
      const hostedRecordDestination = map instanceof HTMLElement
        && map.getAttribute('data-realm-surface-presentation')
          === 'fullscreen-destination';
      const expectedRecordRole = hostedRecordDestination ? 'region' : 'dialog';
      const expectedRecordModal = hostedRecordDestination ? null : 'false';
      const markerPresent = map instanceof HTMLElement
        && map.getAttribute('data-presentation-mode') === expectedMode
        && focusedExpected !== undefined
        && marker instanceof HTMLButtonElement
        // One occupation owns one presentation lane: the focused keyboard
        // control replaces, rather than duplicates, its passive PFP marker.
        && focusedPresence === undefined;
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
      const hit = markerBounds
        ? document.elementFromPoint(
            markerBounds.left + markerBounds.width / 2,
            markerBounds.top + markerBounds.height / 2
          )
        : null;
      const markerHitTestable = marker instanceof HTMLButtonElement
        && hit instanceof Element
        && (hit === marker || marker.contains(hit));
      const layeringValid = map instanceof HTMLElement
        && worldMarkerLayer instanceof HTMLElement
        && presenceLayer instanceof HTMLElement
        && controlLayer instanceof HTMLElement
        && castleLayer instanceof HTMLElement
        && worldMarkerLayer.parentElement === map
        && presenceLayer.parentElement === worldMarkerLayer
        && controlLayer.parentElement === worldMarkerLayer
        && castleLayer.parentElement === worldMarkerLayer
        && getComputedStyle(worldMarkerLayer).display === 'contents'
        && Number.parseInt(getComputedStyle(presenceLayer).zIndex, 10) === 3
        && Number.parseInt(getComputedStyle(castleLayer).zIndex, 10) === 4
        && Number.parseInt(getComputedStyle(controlLayer).zIndex, 10) === 5;
      const markerPortraitElementPresent = markerPresent
        && marker instanceof HTMLButtonElement
        && marker.querySelectorAll('canvas[data-profile-image-state]').length === 1;
      const markerPortraitReady = markerPortraitElementPresent
        && marker instanceof HTMLButtonElement
        && marker.querySelectorAll('canvas[data-profile-image-state="ready"]').length === 1;
      if (
        !markerPresent
        || !markerProjectedVisible
        || !markerGeometryValid
        || !markerControlVisible
        || !keyboardControlCountBounded
        || !markerHitTestable
        || !layeringValid
        || !markerPortraitElementPresent
        || !markerPortraitReady
      ) {
        return {
          cameraNeutral: false,
          cameraNeutralAfterClose: false,
          cameraAnchorPopulationValid: false,
          cameraIndependentAnchorCoverage: false,
          cameraNeutralWhileOpen: false,
          compactOverviewCullingValid: false,
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
          presenceComputedVisible: false,
          presenceAvatarGeometryValid: false,
          presenceGeometryValid: false,
          presenceDelegatedActivation: false,
          presenceHitTestable: false,
          presencePointerActivatable: false,
          presencePortraitElementPresent: false,
          presencePortraitReady: false,
          presenceVisible: false,
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
        // A selected peer may legitimately move from the passive pointer lane
        // into the bounded keyboard-control lane while its record is open.
        // Both lanes use the same renderer-owned world anchor, so camera
        // neutrality must follow that canonical key rather than DOM role.
        const projectedPresence = overviewPresentation();
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
          // The inspector participates in the shared collision policy and may
          // intentionally cull the selected portrait while it covers that
          // screen region. Preserve a camera snapshot even in that case.
          occupantX: projectedPresence instanceof HTMLElement
            ? projectedPresence.style.getPropertyValue('--realm-resource-marker-x')
            : '',
          occupantY: projectedPresence instanceof HTMLElement
            ? projectedPresence.style.getPropertyValue('--realm-resource-marker-y')
            : '',
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
      const cameraProjectionStable = (before, after) => (
        independentStableAnchorCount(before, after) >= 3
      );
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
      const focusedBeforeProjection = projectionSnapshot();
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
        && panel.getAttribute('role') === expectedRecordRole
        && panel.getAttribute('aria-modal') === expectedRecordModal
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
        && (
          expectedMode === 'observer'
            ? facts.get('Castle location') === focusedExpected?.castleLocation
            : !facts.has('Castle location')
              && !/(?:^|[\\s,(·])(?:q|r)\\s*-?\\d+\\b/iu.test(
                panel?.textContent ?? ''
              )
        )
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
      const focusedDuringProjection = projectionSnapshot();
      const focusedClose = panel?.querySelector('.gold-mine-inspection__dismiss');
      if (focusedClose instanceof HTMLButtonElement) focusedClose.click();
      const focusedClosed = await waitFor(() => (
        document.querySelector(occupiedResourcePanelSelector) === null
      ));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const focusedAfterRenderer = rendererSnapshot();
      const focusedAfterProjection = projectionSnapshot();
      const focusedCameraNeutralWhileOpen = cameraProjectionStable(
        focusedBeforeProjection,
        focusedDuringProjection
      );
      const focusedCameraNeutralAfterClose = cameraProjectionStable(
        focusedBeforeProjection,
        focusedAfterProjection
      );
      const focusedCameraAnchorPopulationValid = [
        focusedBeforeProjection,
        focusedDuringProjection,
        focusedAfterProjection
      ].every((snapshot) => snapshot && snapshot.anchors.length >= 3);

      const overviewFramed = focusedClosed && await frameRealmOverview();
      let overviewPresence;
      let overviewLane = 'presence';
      const overviewPresenceReady = overviewFramed && await waitFor(() => {
        const passiveCandidate = overviewPreferredKeys
          .map((key) => presentationForKey(
            '.realm-resource-occupant-presence',
            key
          ))
          .find((element) => (
            element instanceof HTMLElement
            && element.getAttribute('data-projected-visible') === 'true'
            && visible(element)
          ));
        const controlCandidate = overviewPreferredKeys
          .map((key) => presentationForKey(
            'button.realm-resource-occupant-marker',
            key
          ))
          .find((element) => (
            element instanceof HTMLButtonElement
            && element.getAttribute('data-projected-visible') === 'true'
            && visible(element)
          ));
        // Compact viewports may truthfully have no collision-safe passive
        // portrait after controls, castle labels, and safe areas are reserved.
        // Exercise the same canonical record through its single bounded
        // control lane instead of requiring an overlapping/clipped duplicate.
        const candidate = passiveCandidate ?? controlCandidate;
        if (!(candidate instanceof HTMLElement)) return false;
        overviewLane = passiveCandidate ? 'presence' : 'control';
        overviewTargetKey = candidate.getAttribute(
          'data-resource-occupant-key'
        ) ?? '';
        overviewPresence = candidate;
        return candidate instanceof HTMLElement
          && candidate.getAttribute('data-projected-visible') === 'true'
          && visible(candidate)
          && candidate.querySelector(
            'canvas[data-profile-image-state="ready"]'
          ) instanceof HTMLCanvasElement;
      });
      const compactOverviewCullingValid = innerWidth < 600
        && !overviewPresenceReady
        && [...document.querySelectorAll(
          '[data-resource-occupant-key][data-projected-visible="true"]'
        )].filter((element) => visible(element)).length === 0;
      const overviewProjectionSettled = overviewPresenceReady
        && await waitForStableProjection();
      if (overviewProjectionSettled) {
        // Collision reconciliation may move the same canonical occupation
        // between its passive PFP and single keyboard-control lane while the
        // projection settles. Reacquire that lane before measuring or
        // activating it so the proof never clicks a detached stale element.
        const settledPresentation = overviewPresentation();
        if (settledPresentation instanceof HTMLElement) {
          overviewPresence = settledPresentation;
          overviewLane = settledPresentation.matches(
            '.realm-resource-occupant-presence'
          ) ? 'presence' : 'control';
        }
      }
      const overviewPresenceBounds = overviewPresence instanceof HTMLElement
        ? overviewPresence.getBoundingClientRect()
        : undefined;
      const overviewPresenceAvatar = overviewPresence?.querySelector(
        '.realm-castle-avatar'
      );
      const overviewPresenceAvatarBounds =
        overviewPresenceAvatar instanceof HTMLElement
          ? overviewPresenceAvatar.getBoundingClientRect()
          : undefined;
      const presenceComputedVisible = overviewPresence instanceof HTMLElement
        && visible(overviewPresence);
      const presenceGeometryValid = overviewPresenceBounds !== undefined
        && (
          overviewLane === 'presence'
            ? overviewPresenceBounds.width >= 43
              && overviewPresenceBounds.width <= 45
              && overviewPresenceBounds.height >= 43
              && overviewPresenceBounds.height <= 45
            : overviewPresenceBounds.width >= 44
              && overviewPresenceBounds.height >= 44
        )
        && overviewPresenceBounds.right > 0
        && overviewPresenceBounds.bottom > 0
        && overviewPresenceBounds.left < innerWidth
        && overviewPresenceBounds.top < innerHeight
        && overviewPresenceBounds.left >= 0
        && overviewPresenceBounds.top >= 0
        && overviewPresenceBounds.right <= innerWidth
        && overviewPresenceBounds.bottom <= innerHeight;
      const presenceAvatarGeometryValid =
        overviewPresenceAvatarBounds !== undefined
        && (
          overviewLane === 'presence'
            ? overviewPresenceAvatarBounds.width >= 31
              && overviewPresenceAvatarBounds.width <= 35
              && overviewPresenceAvatarBounds.height >= 31
              && overviewPresenceAvatarBounds.height <= 35
            : overviewPresenceAvatarBounds.width >= 39
              && overviewPresenceAvatarBounds.width <= 41
              && overviewPresenceAvatarBounds.height >= 39
              && overviewPresenceAvatarBounds.height <= 41
        );
      const presencePointerActivatable = overviewPresence instanceof HTMLElement
        && presenceLayer instanceof HTMLElement
        && controlLayer instanceof HTMLElement
        && getComputedStyle(overviewPresence).pointerEvents === 'auto'
        && getComputedStyle(overviewPresence).cursor === 'pointer'
        && (
          overviewLane === 'presence'
            ? getComputedStyle(presenceLayer).pointerEvents === 'none'
              && presenceLayer.getAttribute('aria-hidden') === 'true'
            : overviewPresence instanceof HTMLButtonElement
              && overviewPresence.closest('.realm-resource-occupant-markers')
                === controlLayer
        );
      const presencePortraitElementPresent =
        overviewPresence instanceof HTMLElement
        && overviewPresence.querySelectorAll(
          'canvas[data-profile-image-state]'
        ).length === 1;
      const presencePortraitReady = presencePortraitElementPresent
        && overviewPresence instanceof HTMLElement
        && overviewPresence.querySelectorAll(
          'canvas[data-profile-image-state="ready"]'
        ).length === 1;
      const presenceVisible = overviewPresenceReady
        && overviewPresence instanceof HTMLElement
        && overviewPresence.getAttribute('data-projected-visible') === 'true'
        && presenceComputedVisible
        && presenceGeometryValid;
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
      const presenceHitTestable = overviewPresenceDirectHit;
      const overviewMarker = presentationForKey(
        'button.realm-resource-occupant-marker',
        overviewTargetKey
      );
      const overviewPassivePresence = presentationForKey(
        '.realm-resource-occupant-presence',
        overviewTargetKey
      );
      const overviewTargetPassiveOnly = overviewProjectionSettled
        && overviewPresenceDirectHit
        && (
          overviewLane === 'presence'
            ? overviewMarker === undefined
              && overviewPassivePresence === overviewPresence
            : overviewPassivePresence === undefined
              && overviewMarker === overviewPresence
        );
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
      const overviewExpected = focusedRecordByKey[overviewTargetKey];
      const overviewResource = Object.freeze({
        food: 'Food',
        gold: 'Gold',
        stone: 'Stone',
        wood: 'Wood'
      })[overviewTargetKey.split(':')[0]];
      const overviewRecordCorrect = overviewPanelReady
        && overviewExpected !== undefined
        && overviewPanel instanceof HTMLElement
        && overviewPanel.getAttribute('role') === expectedRecordRole
        && overviewPanel.getAttribute('aria-modal') === expectedRecordModal
        && (overviewPanel.querySelector(
          '.realm-resource-occupant-details__record span'
        )?.textContent ?? '').trim() === 'PUBLIC EXPEDITION RECORD'
        && (overviewPanel.querySelector(
          '.gold-mine-inspection__title-lockup h2'
        )?.textContent ?? '').trim() === overviewExpected?.title
        && (overviewWorker?.querySelector('span')?.textContent ?? '').trim()
          === 'EXPEDITION WAGON'
        && (overviewWorker?.querySelector('strong')?.textContent ?? '').trim()
          === 'GATHERING AT SITE'
        && (overviewWorker?.querySelector('small')?.textContent ?? '').trim()
          === overviewExpected?.rate
        && (overviewIdentity?.querySelector(
          ':scope > div > span'
        )?.textContent ?? '').trim() === 'GATHERING BY'
        && (overviewIdentity?.querySelector('strong')?.textContent ?? '').trim()
          === 'QA Keeper With An Intentionally Long Display Name For Responsive Realm QA'
        && (overviewIdentity?.querySelector('small')?.textContent ?? '').trim()
          === overviewExpected?.username
        && overviewFacts.get('Resource') === overviewResource
        && overviewFacts.get('Node tier') === '1'
        && overviewFacts.get('Site state') === 'OCCUPIED · GATHERING'
        && overviewFacts.get('Home castle') === overviewExpected?.castleName
        && (
          expectedMode === 'observer'
            ? overviewFacts.get('Castle location') === overviewExpected?.castleLocation
            : !overviewFacts.has('Castle location')
              && !/(?:^|[\\s,(·])(?:q|r)\\s*-?\\d+\\b/iu.test(
                overviewPanel.textContent ?? ''
              )
        )
        && [...overviewFacts.keys()].some((label) => label.endsWith('time left'));
      const presenceDelegatedActivation = overviewTargetPassiveOnly
        && overviewPanelReady
        && overviewRecordCorrect;
      const focusedPrivacyBounded = markerPrivacyBounded
        && subtreePrivacyBounded(panel);
      const privacyBounded = focusedPrivacyBounded
        && (
          compactOverviewCullingValid
          || (
            overviewPresencePrivacyBounded
            && subtreePrivacyBounded(overviewPanel)
          )
        );
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
      const cameraNeutralWhileOpen = cameraProjectionStable(
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
      const resolvedCameraNeutralWhileOpen = compactOverviewCullingValid
        ? focusedCameraNeutralWhileOpen
        : cameraNeutralWhileOpen;
      const resolvedCameraNeutralAfterClose = compactOverviewCullingValid
        ? focusedCameraNeutralAfterClose
        : cameraNeutralAfterClose;
      const resolvedCameraIndependentAnchorCoverage = compactOverviewCullingValid
        ? focusedCameraNeutralWhileOpen && focusedCameraNeutralAfterClose
        : cameraIndependentAnchorCoverage;
      const resolvedCameraAnchorPopulationValid = compactOverviewCullingValid
        ? focusedCameraAnchorPopulationValid
        : cameraAnchorPopulationValid;
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
        cameraNeutral: compactOverviewCullingValid
          ? focusedClosed
            && overviewFramed
            && resolvedCameraNeutralWhileOpen
            && resolvedCameraNeutralAfterClose
          : closed
            && overviewFramed
            && overviewProjectionSettled
            && resolvedCameraNeutralWhileOpen
            && resolvedCameraNeutralAfterClose,
        cameraNeutralAfterClose: resolvedCameraNeutralAfterClose,
        cameraAnchorPopulationValid: resolvedCameraAnchorPopulationValid,
        cameraIndependentAnchorCoverage:
          resolvedCameraIndependentAnchorCoverage,
        cameraNeutralWhileOpen: resolvedCameraNeutralWhileOpen,
        compactOverviewCullingValid,
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
  if (
    process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1'
    && evaluation.result.value !== null
    && typeof evaluation.result.value === 'object'
  ) {
    const structuralKeys = [
      'keyboardControlCountBounded',
      'layeringValid',
      'markerControlVisible',
      'markerGeometryValid',
      'markerPortraitElementPresent',
      'markerPortraitReady',
      'markerPresent',
      'markerProjectedVisible',
      'markerHitTestable',
    ];
    const failedStructuralKeys = structuralKeys.filter(
      (key) => evaluation.result.value[key] !== true
    );
    if (failedStructuralKeys.length > 0) {
      process.stderr.write(
        `Local synthetic resource-occupant structural failures: ${
          failedStructuralKeys.join(',')
        }.\n`
      );
    }
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
          foreignRecordGeneric: false,
          foreignRecordPortraitReady: false,
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
      const centerRecallAll = [...(commandCenter?.querySelectorAll(
        '.worker-command-center__footer button'
      ) ?? [])].find((button) => (
        button instanceof HTMLButtonElement
        && !button.disabled
        && (button.textContent ?? '').trim() === 'RETURN ALL TO KEEP'
      ));
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
      const navigator = document.querySelector('.realm-cell-navigator__dialog');
      const semanticResourceButton = [...(navigator?.querySelectorAll(
        '.realm-cell-navigator__resource-site'
          + '[data-resource-kind="gold"][data-resource-state="occupied"]'
      ) ?? [])].find((button) => (
        button instanceof HTMLButtonElement
        && !button.disabled
        && (button.getAttribute('aria-label') ?? '').trim().length > 0
        && visible(button)
      ));
      if (semanticResourceButton instanceof HTMLButtonElement) {
        semanticResourceButton.scrollIntoView({
          behavior: 'instant',
          block: 'center',
          inline: 'nearest'
        });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const semanticResourceBounds =
        semanticResourceButton instanceof HTMLButtonElement
          ? semanticResourceButton.getBoundingClientRect()
          : undefined;
      const navigatorCopy = navigator instanceof HTMLElement
        ? [
            navigator.textContent ?? '',
            ...[...navigator.querySelectorAll('[aria-label]')].map((element) => (
              element.getAttribute('aria-label') ?? ''
            ))
          ].join('\\n')
        : '';
      const semanticResourceNavigationSafe = navigatorReady
        && navigator instanceof HTMLElement
        && navigator.querySelector('.realm-cell-navigator__jump') === null
        && semanticResourceButton instanceof HTMLButtonElement
        && semanticResourceBounds !== undefined
        && semanticResourceBounds.width >= 44
        && semanticResourceBounds.height >= 44
        && semanticResourceBounds.right > 0
        && semanticResourceBounds.bottom > 0
        && semanticResourceBounds.left < innerWidth
        && semanticResourceBounds.top < innerHeight
        && !/(?:^|[\\s,(·])(?:q|r)\\s*-?\\d+\\b/iu.test(navigatorCopy)
        && !/\\b(?:gold:|food:|wood:|stone:)?genesis-\\d{3}-tier\\d+-(?:gold|food|wood|stone)-\\d+\\b/iu
          .test(navigatorCopy);
      if (semanticResourceNavigationSafe) {
        semanticResourceButton.focus({ preventScroll: true });
        semanticResourceButton.click();
      }
      const semanticInspectorReady = semanticResourceNavigationSafe && await waitFor(() => (
        document.querySelector(
          '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
        ) instanceof HTMLElement
      ));
      const semanticForeignRecordReady = semanticInspectorReady && await waitFor(() => {
        const inspector = document.querySelector(
          '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
        );
        const record = inspector?.querySelector(
          '.realm-resource-occupant-details__record'
        );
        const identity = inspector?.querySelector(
          '.realm-resource-occupant-details__identity'
        );
        return (record?.querySelector('span')?.textContent ?? '').trim()
            === 'PUBLIC WORKER RECORD'
          && (record?.querySelector('strong')?.textContent ?? '').trim()
            === 'WORKER 01'
          && identity?.querySelector(
            'canvas[data-profile-image-state="ready"]'
          ) instanceof HTMLCanvasElement;
      });
      const semanticInspector = document.querySelector(
        '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
      );
      const semanticRecord = semanticInspector?.querySelector(
        '.realm-resource-occupant-details__record'
      );
      const semanticIdentity = semanticInspector?.querySelector(
        '.realm-resource-occupant-details__identity'
      );
      const foreignRecordGeneric = semanticForeignRecordReady
        && (semanticRecord?.querySelector('span')?.textContent ?? '').trim()
          === 'PUBLIC WORKER RECORD'
        && (semanticRecord?.querySelector('strong')?.textContent ?? '').trim()
          === 'WORKER 01';
      const foreignRecordPortraitReady = semanticIdentity?.querySelector(
        'canvas[data-profile-image-state="ready"]'
      ) instanceof HTMLCanvasElement;
      const foreignRecordReadOnly = foreignRecordGeneric
        && (semanticIdentity?.querySelector(':scope > div > span')?.textContent ?? '').trim()
          === 'GATHERING BY'
        && foreignRecordPortraitReady
        && semanticInspector?.querySelector(
          '.realm-resource-occupant-details__recall'
        ) === null
        && !/(?:Recall Worker|RETURN ALL TO KEEP)/i.test(
          semanticInspector?.textContent ?? ''
        );
      const privacyNodes = [commandCenter, semanticInspector].filter((node) => (
        node instanceof HTMLElement
      ));
      const privacyBounded = privacyNodes.length === 2
        && privacyNodes.every((root) => (
          [root, ...root.querySelectorAll('*')].every((element) => (
            [...element.attributes].every((attribute) => (
              !/(?:^|[-_:])(?:fid|wallet|token|proof|auth|request)(?:$|[-_:])/i
                .test(attribute.name)
              && !/(?:https?:|blob:|data:|file:)/i.test(attribute.value)
            ))
          ))
        ));
      const semanticInspectorClose = semanticInspector?.querySelector(
        '.gold-mine-inspection__dismiss'
      );
      if (semanticInspectorClose instanceof HTMLButtonElement) {
        semanticInspectorClose.click();
      }
      const semanticNavigationSettled = semanticInspectorReady && await waitFor(() => (
        document.querySelector('.realm-cell-navigator__dialog') === null
        && document.querySelector(
          '.gold-mine-inspection:has([data-resource-occupant-details="true"])'
        ) === null
        && rendererHealthy()
        && !map?.hasAttribute('data-camera-interacting')
      ));

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
        foreignRecordGeneric,
        foreignRecordPortraitReady,
        foreignRecordReadOnly,
        mobileBoundsSafe: mobileBoundsSafe
          && semanticResourceNavigationSafe
          && semanticNavigationSettled,
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
        && [...commandCenter.querySelectorAll(
          '.worker-command-center__footer button'
        )].some((button) => (
          button instanceof HTMLButtonElement
          && !button.disabled
          && (button.textContent ?? '').trim() === 'RETURN ALL TO KEEP'
        ));
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'boolean') {
    throw new Error('Rendered WebGL active Worker reconnect evaluation failed.');
  }
  return Object.freeze({ localReconnectRehydrated: evaluation.result.value === true });
}

function workerLocomotionSpecForProbeCase(probeCase) {
  const spec = typeof probeCase?.id === 'string'
    ? RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPEC_BY_ID.get(probeCase.id)
    : undefined;
  const expected = probeCase?.workerLocomotion;
  if (
    spec === undefined
    || probeCase.expectedPresentationMode !== 'player'
    || probeCase.expectedQuality !== spec.quality
    || (probeCase.expectedReducedMotion === true) !== spec.reducedMotion
    || probeCase.viewport?.width !== spec.viewport.width
    || probeCase.viewport?.height !== spec.viewport.height
    || expected?.assetProfile !== spec.assetProfile
    || expected?.assetPath !== spec.assetPath
    || expected?.expectedAnimatedCount !== spec.animatedCount
    || expected?.expectedFallbackCount !== 0
    || expected?.expectedGatheringIdleCount !== spec.gatheringIdleCount
    || expected?.expectedModelCount !== spec.modelCount
    || expected?.expectedMovingCount !== spec.movingCount
    || expected?.minimumVisibleProjectionCount
      !== RENDERED_WEBGL_WORKER_LOCOMOTION_MINIMUM_VISIBLE_PROJECTION_COUNT
    || expected?.maximumVisibleProjectionCount
      !== spec.maximumVisibleProjectionCount
    || expected?.expectedWheelDrivenCount !== spec.wheelDrivenCount
    || expected?.fixtureVariant !== spec.fixture
    || expected?.climate !== spec.climate
    || expected?.reducedMotion !== spec.reducedMotion
  ) {
    throw new TypeError('Invalid rendered WebGL Worker locomotion probe case.');
  }
  return spec;
}

export async function applyRenderedWebglWorkerLocomotionInteraction(
  session,
  probeCase
) {
  const spec = workerLocomotionSpecForProbeCase(probeCase);
  const expected = JSON.stringify({
    animatedCount: spec.animatedCount,
    assetPath: spec.assetPath,
    assetProfile: spec.assetProfile,
    caseId: spec.id,
    fallbackCount: 0,
    fixture: spec.fixture,
    modelCount: spec.modelCount,
    movingCount: spec.movingCount,
    climate: spec.climate,
    presentedCount: RENDERED_WEBGL_WORKER_LOCOMOTION_PRESENTED_COUNT,
    quality: spec.quality,
    reducedMotion: spec.reducedMotion,
    viewportHeight: spec.viewport.height,
    viewportWidth: spec.viewport.width,
    minimumVisibleProjectionCount:
      RENDERED_WEBGL_WORKER_LOCOMOTION_MINIMUM_VISIBLE_PROJECTION_COUNT,
    wheelDrivenCount: spec.wheelDrivenCount,
  });
  const evaluation = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const expected = Object.freeze(${expected});
      const telemetryAttributes = Object.freeze({
        clipIdleCount: 'data-realm-worker-clip-idle-count',
        clipStartCount: 'data-realm-worker-clip-start-count',
        clipStopCount: 'data-realm-worker-clip-stop-count',
        clipTurnLeftCount: 'data-realm-worker-clip-turn-left-count',
        clipTurnRightCount: 'data-realm-worker-clip-turn-right-count',
        clipWalkCount: 'data-realm-worker-clip-walk-count',
        gatheringIdleCount: 'data-realm-worker-locomotion-gathering-idle-count',
        lateModelPhaseRestorationCount:
          'data-realm-worker-late-model-phase-restoration-count',
        maximumHeadingError:
          'data-realm-worker-locomotion-maximum-heading-error',
        maximumPositionCorrection:
          'data-realm-worker-locomotion-maximum-position-correction',
        maximumSpeed: 'data-realm-worker-locomotion-maximum-speed',
        modelPhaseRestorationCount:
          'data-realm-worker-model-phase-restoration-count',
        movingCount: 'data-realm-worker-locomotion-moving-count',
        oneShotOverrunCount:
          'data-realm-worker-locomotion-one-shot-overrun-count',
        repeatedTurnSuppressionCount:
          'data-realm-worker-repeated-turn-suppression-count',
        renderedClipIdleCount:
          'data-realm-worker-rendered-clip-idle-count',
        renderedClipStartCount:
          'data-realm-worker-rendered-clip-start-count',
        renderedClipStopCount:
          'data-realm-worker-rendered-clip-stop-count',
        renderedClipTurnLeftCount:
          'data-realm-worker-rendered-clip-turn-left-count',
        renderedClipTurnRightCount:
          'data-realm-worker-rendered-clip-turn-right-count',
        renderedClipWalkCount:
          'data-realm-worker-rendered-clip-walk-count',
        reversalCount: 'data-realm-worker-reversal-count',
        startingCount: 'data-realm-worker-locomotion-starting-count',
        stoppingCount: 'data-realm-worker-locomotion-stopping-count',
        turningCount: 'data-realm-worker-locomotion-turning-count',
        cruisingCount: 'data-realm-worker-locomotion-cruising-count',
        wheelDistanceMismatchCount:
          'data-realm-worker-wheel-distance-mismatch-count',
        wheelDrivenCount: 'data-realm-worker-wheel-driven-count'
      });
      const waitFor = async (predicate, timeoutMilliseconds = 60_000) => {
        const deadline = performance.now() + timeoutMilliseconds;
        while (performance.now() <= deadline) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 32));
        }
        return false;
      };
      const overlay = document.querySelector('[data-rendered-webgl-status]');
      const map = document.querySelector('.realm-map-screen');
      const canvas = map?.querySelector('canvas.realm-map-screen__canvas');
      const context = canvas instanceof HTMLCanvasElement
        ? canvas.getContext('webgl2') ?? canvas.getContext('webgl')
        : null;
      const rendererHealthy = () => (
        overlay instanceof HTMLElement
        && overlay.dataset.renderer === 'webgl'
        && overlay.dataset.renderedWebglStatus === 'ready'
        && map instanceof HTMLElement
        && map.dataset.renderer === 'webgl'
        && map.dataset.rendererState === 'ready'
        && canvas instanceof HTMLCanvasElement
        && context !== null
        && !context.isContextLost()
      );
      const approvedAssetLoaded = () => performance.getEntriesByType('resource').some(
        (entry) => {
          try {
            return new URL(entry.name).pathname === expected.assetPath;
          } catch {
            return false;
          }
        }
      );
      const integerAttribute = (attribute) => {
        const value = canvas?.getAttribute(attribute);
        return typeof value === 'string' && /^(?:0|[1-9][0-9]{0,8})$/.test(value)
          ? Number(value)
          : null;
      };
      const presentationCounts = () => Object.freeze({
        animatedCount: integerAttribute('data-realm-worker-animated-count'),
        fallbackCount: integerAttribute('data-realm-worker-fallback-count'),
        modelCount: integerAttribute('data-realm-worker-model-count'),
        presentedCount: integerAttribute('data-realm-worker-presented-count'),
        wheelDrivenCount:
          integerAttribute('data-realm-worker-wheel-driven-count')
      });
      const localQaRootProjections = () => {
        if (!(map instanceof HTMLElement)) return [];
        try {
          const parsed = JSON.parse(
            map.dataset.realmLocalQaWorkerProjections ?? '[]'
          );
          if (!Array.isArray(parsed)) return [];
          return parsed.flatMap((projection) => (
            projection
            && typeof projection === 'object'
            && (projection.phase === 'outbound'
              || projection.phase === 'returning')
            && Number.isFinite(projection.x)
            && Number.isFinite(projection.y)
            && projection.x >= 0
            && projection.x <= innerWidth
            && projection.y >= 0
            && projection.y <= innerHeight
              ? [{
                  phase: projection.phase,
                  x: projection.x,
                  y: projection.y
                }]
              : []
          ));
        } catch {
          return [];
        }
      };
      const portraitRootProjections = (ownedOnly = false) => [...document.querySelectorAll(
        '.realm-worker-presence-marker[data-projected-visible="true"]'
        + '[data-phase="outbound"],'
        + '.realm-worker-presence-marker[data-projected-visible="true"]'
        + '[data-phase="returning"]'
      )].flatMap((marker) => {
        if (!(marker instanceof HTMLElement)) return [];
        if (ownedOnly && marker.dataset.ownedByViewer !== 'true') return [];
        const phase = marker.dataset.phase;
        if (phase !== 'outbound' && phase !== 'returning') return [];
        const style = getComputedStyle(marker);
        const bounds = marker.getBoundingClientRect();
        const x = Number.parseFloat(
          style.getPropertyValue('--realm-worker-presence-x')
        );
        const y = Number.parseFloat(
          style.getPropertyValue('--realm-worker-presence-y')
        );
        return (
          marker.dataset.projectedVisible === 'true'
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity || '1') > 0
          && bounds.width > 0
          && bounds.height > 0
          && Number.isFinite(x)
          && Number.isFinite(y)
          && x >= 0
          && x <= innerWidth
          && y >= 0
          && y <= innerHeight
        ) ? [{ phase, x, y }] : [];
      }).sort((left, right) => left.phase.localeCompare(right.phase));
      const visibleRootProjections = () => {
        if (expected.climate !== 'center') return portraitRootProjections(true);
        const local = localQaRootProjections();
        return local.length > 0 ? local : portraitRootProjections();
      };
      const fixtureSelected = () => (
        overlay instanceof HTMLElement
        && overlay.dataset.fixtureVariant === expected.fixture
        && overlay.dataset.presentationMode === 'player'
        && overlay.dataset.quality === expected.quality
      );
      const exactCountsReady = () => {
        const counts = presentationCounts();
        return counts.animatedCount === expected.animatedCount
          && counts.fallbackCount === expected.fallbackCount
          && counts.modelCount === expected.modelCount
          && counts.presentedCount === expected.presentedCount
          && counts.wheelDrivenCount === expected.wheelDrivenCount;
      };
      const cameraSettled = () => (
        canvas instanceof HTMLCanvasElement
        && canvas.getAttribute('data-realm-camera-settled') === 'true'
        && /^[0-9a-f]{24}$/.test(
          canvas.getAttribute('data-realm-camera-state-token') ?? ''
        )
      );
      const closeWorkerSurfaces = async () => {
        const workerBack = document.querySelector(
          '.worker-inspection__dismiss[aria-label="Back to workers"]'
        );
        if (workerBack instanceof HTMLButtonElement) workerBack.click();
        await waitFor(() => document.querySelector(
          '.worker-command-center[role="dialog"]'
        ) instanceof HTMLElement, 2_000);
        const menuBack = document.querySelector(
          '.worker-command-center button[aria-label="Back to Realm menu"]'
        );
        if (menuBack instanceof HTMLButtonElement) menuBack.click();
        await waitFor(() => document.querySelector(
          '.realm-profile-menu__panel[role="dialog"]'
        ) instanceof HTMLElement, 2_000);
        const menuClose = document.querySelector(
          '.realm-profile-menu__panel button[aria-label="Close Realm menu"]'
        );
        if (menuClose instanceof HTMLButtonElement) menuClose.click();
        return waitFor(() => (
          document.querySelector('.worker-inspection') === null
          && document.querySelector('.worker-command-center') === null
          && document.querySelector('.realm-profile-menu__panel') === null
        ), 2_000);
      };
      const locateMovingWorker = async (target) => {
        const profileTrigger = document.querySelector('.realm-profile-trigger');
        if (!(profileTrigger instanceof HTMLButtonElement)) return false;
        profileTrigger.click();
        const workersReady = await waitFor(() => (
          document.querySelector(
            '.realm-profile-menu__worker-actions button[aria-haspopup="dialog"]'
          ) instanceof HTMLButtonElement
        ), 2_000);
        if (!workersReady) return false;
        const workersButton = document.querySelector(
          '.realm-profile-menu__worker-actions button[aria-haspopup="dialog"]'
        );
        if (!(workersButton instanceof HTMLButtonElement) || workersButton.disabled) {
          return false;
        }
        workersButton.click();
        const rosterReady = await waitFor(() => (
          document.querySelector('.worker-command-center__worker')
            instanceof HTMLButtonElement
        ), 2_000);
        if (!rosterReady) return false;
        const workerButton = [...document.querySelectorAll(
          '.worker-command-center__worker'
        )].find((button) => (
          button instanceof HTMLButtonElement
          && (button.querySelector(
            '.worker-command-center__ordinal'
          )?.textContent ?? '').trim() === String(target.ordinal)
        ));
        if (!(workerButton instanceof HTMLButtonElement) || workerButton.disabled) {
          return false;
        }
        workerButton.click();
        const locateReady = await waitFor(() => (
          document.querySelector('.worker-inspection__locate')
            instanceof HTMLButtonElement
        ), 2_000);
        if (!locateReady) return false;
        const locateButton = document.querySelector('.worker-inspection__locate');
        if (!(locateButton instanceof HTMLButtonElement) || locateButton.disabled) {
          return false;
        }
        locateButton.click();
        const surfacesClosed = await closeWorkerSurfaces();
        const settled = surfacesClosed && await waitFor(() => (
          cameraSettled()
          && visibleRootProjections().some(
            ({ phase }) => phase === target.phase
          )
        ), 5_000);
        return settled
          ? canvas.getAttribute('data-realm-camera-state-token')
          : false;
      };
      const baseReadinessSatisfied = await waitFor(() => (
        rendererHealthy()
        && fixtureSelected()
        && matchMedia('(prefers-reduced-motion: reduce)').matches
          === expected.reducedMotion
        && innerWidth === expected.viewportWidth
        && innerHeight === expected.viewportHeight
        && approvedAssetLoaded()
        && exactCountsReady()
      ));
      const samples = [];
      let samplingElapsedMilliseconds = 0;
      let stable = true;
      let phaseReadinessSatisfied = baseReadinessSatisfied;
      let regionalSelectionStable = expected.climate === 'center';
      if (baseReadinessSatisfied) {
        for (const target of [
          { ordinal: 1, phase: 'outbound' },
          { ordinal: 2, phase: 'returning' }
        ]) {
          const settledCameraToken = await locateMovingWorker(target);
          if (settledCameraToken === false) {
            phaseReadinessSatisfied = false;
            break;
          }
          const phaseSamplingStartedAt = performance.now();
          for (let index = 0; index < 16; index += 1) {
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            await new Promise((resolve) => setTimeout(resolve, 32));
            const rootProjections = visibleRootProjections().filter(
              ({ phase }) => phase === target.phase
            );
            stable = stable
              && rendererHealthy()
              && cameraSettled()
              && canvas.getAttribute('data-realm-camera-state-token')
                === settledCameraToken
              && rootProjections.length === 1;
            const telemetry = Object.fromEntries(
              Object.entries(telemetryAttributes).map(([key, attribute]) => {
                const value = canvas?.getAttribute(attribute);
                if (value === null || value === undefined || value === '') {
                  return [key, null];
                }
                const parsed = Number(value);
                return [key, Number.isFinite(parsed) && parsed >= 0 ? parsed : null];
              })
            );
            const elapsedMilliseconds = (
              samplingElapsedMilliseconds
              + performance.now()
              - phaseSamplingStartedAt
            );
            samples.push({
              elapsedMilliseconds,
              rootProjections,
              telemetry
            });
          }
          samplingElapsedMilliseconds = (
            samples.at(-1)?.elapsedMilliseconds
            ?? samplingElapsedMilliseconds
          );
        }
      }
      if (phaseReadinessSatisfied && expected.climate !== 'center') {
        const beforeSelectionCameraToken = canvas?.getAttribute(
          'data-realm-camera-state-token'
        );
        const returningMarker = document.querySelector(
          '.realm-worker-presence-marker[data-projected-visible="true"]'
          + '[data-owned-by-viewer="true"][data-phase="returning"]'
        );
        if (
          typeof beforeSelectionCameraToken === 'string'
          && returningMarker instanceof HTMLButtonElement
        ) {
          returningMarker.click();
          const inspectionMounted = await waitFor(() => (
            document.querySelector('.worker-inspection') instanceof HTMLElement
          ));
          const peerMarker = document.querySelector(
            '.realm-worker-presence-marker[data-projected-visible="true"]'
            + '[data-owned-by-viewer="false"][data-phase="returning"]'
          );
          if (
            inspectionMounted
            && peerMarker instanceof HTMLButtonElement
            && peerMarker.tabIndex === 0
          ) {
            peerMarker.dispatchEvent(new PointerEvent('pointerover', {
              bubbles: true,
              pointerType: 'mouse'
            }));
          }
          const selectedRouteReady = inspectionMounted && await waitFor(() => (
            integerAttribute('data-realm-worker-selected-route-count') === 1
            && integerAttribute('data-realm-worker-visible-route-count') === 3
            && (integerAttribute(
              'data-realm-worker-visible-route-segment-count'
            ) ?? 0) > 0
            && integerAttribute('data-realm-worker-route-draw-call-count') === 3
            && integerAttribute('data-realm-worker-owned-route-count') === 1
            && integerAttribute('data-realm-worker-peer-route-count') === 1
            && (integerAttribute('data-realm-worker-route-triangle-count') ?? 0) > 0
            && integerAttribute('data-realm-worker-rejected-route-count') === 0
            && integerAttribute(
              'data-realm-worker-genuine-invalid-route-count'
            ) === 0
            && integerAttribute(
              'data-realm-worker-route-hidden-by-budget-count'
            ) === 0
            && integerAttribute(
              'data-realm-worker-route-corridor-failure-count'
            ) === 0
          ), 5_000);
          regionalSelectionStable = selectedRouteReady
            && cameraSettled()
            && canvas.getAttribute('data-realm-camera-state-token')
              === beforeSelectionCameraToken;
          const dismiss = document.querySelector(
            '.worker-inspection__dismiss[aria-label="Back to workers"]'
          );
          if (dismiss instanceof HTMLButtonElement) dismiss.click();
          await waitFor(() => document.querySelector('.worker-inspection') === null, 2_000);
        }
      }
      const readinessSatisfied = (
        baseReadinessSatisfied
        && phaseReadinessSatisfied
        && regionalSelectionStable
        && samples.length === 32
      );
      const counts = presentationCounts();
      const movementPixels = Object.fromEntries(
        ['outbound', 'returning'].map((phase) => {
          const positions = samples.flatMap(({ rootProjections }) => (
            rootProjections.filter((projection) => projection.phase === phase)
          ));
          const first = positions[0];
          const maximum = first === undefined ? 0 : Math.max(
            0,
            ...positions.map(({ x, y }) => Math.hypot(x - first.x, y - first.y))
          );
          return [phase, maximum];
        })
      );
      const finalRoots = visibleRootProjections();
      return {
        approvedAssetLoaded: approvedAssetLoaded(),
        animatedCount: counts.animatedCount,
        assetProfile: expected.assetProfile,
        caseId: expected.caseId,
        fallbackCount: counts.fallbackCount,
        fixtureSelected: fixtureSelected(),
        modelCount: counts.modelCount,
        movementPixels,
        presentedCount: counts.presentedCount,
        quality: overlay instanceof HTMLElement ? overlay.dataset.quality : null,
        readinessSatisfied,
        reducedMotion:
          matchMedia('(prefers-reduced-motion: reduce)').matches,
        rendererStable: stable && rendererHealthy(),
        samples,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
        visibleProjectionCount: finalRoots.length,
        wheelDrivenCount: counts.wheelDrivenCount
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, CDP_COMMAND_TIMEOUT_MILLISECONDS * 10);
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error('Rendered WebGL Worker locomotion evaluation failed.');
  }
  return evaluation.result.value;
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
          // The interactive lane may own every currently visible key. Zero
          // passive markers is valid only because controls are proven present
          // and the combined key sets are disjoint below.
          presenceBudgetBounded: presences.length <= maximumPresenceCount,
          rovingTabStopBounded: controls.filter((element) => (
            element instanceof HTMLButtonElement && element.tabIndex === 0
          )).length <= 1,
          uniqueVisibleKeys: new Set(presenceKeys).size === presenceKeys.length
            && new Set(controlKeys).size === controlKeys.length
            && new Set([...presenceKeys, ...controlKeys]).size
              === presenceKeys.length + controlKeys.length
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
        const passiveSelector = '.realm-resource-occupant-presence'
          + '[data-projected-visible="true"]'
          + '[data-resource-occupant-key="' + target.key + '"]';
        const controlSelector = 'button.realm-resource-occupant-marker'
          + '[data-projected-visible="true"]'
          + '[data-resource-occupant-key="' + target.key + '"]';
        const targetReady = await waitFor(() => {
          const candidate = document.querySelector(
            controlSelector + ',' + passiveSelector
          );
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
        const presentation = document.querySelector(
          controlSelector + ',' + passiveSelector
        );
        if (!targetReady || !(presentation instanceof HTMLElement)) {
          allResourceKindsExercised = false;
          continue;
        }
        observedKinds.add(presentation.dataset.resourceKind);
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

async function navigateRenderedWebglCase(session, url, state) {
  const navigation = await session.command('Page.navigate', { url });
  const loaderId = exactCdpIdentifier(
    navigation?.loaderId,
    'navigation loader id'
  );
  const deadline = Date.now() + CASE_TIMEOUT_MILLISECONDS;
  while (
    !state.loadedPageLoaderIds.has(loaderId)
    && Date.now() <= deadline
  ) {
    if (state.violation) {
      throw new Error(
        `Headless browser left the local QA boundary: ${state.violation}.`
      );
    }
    await delay(25);
  }
  if (!state.loadedPageLoaderIds.delete(loaderId)) {
    throw new Error('Rendered WebGL navigation loader did not complete.');
  }
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
  await navigateRenderedWebglCase(session, probeCase.url, state);
  await waitForAcceptedRenderedDom(session, probeCase, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
  await applyRenderedWebglOccupancyStressInteraction(session);
  await captureRenderedCasePixels(session, probeCase.viewport);
  if (state.violation) {
    throw new Error('Rendered WebGL occupancy stress left the local QA boundary.');
  }
}

async function runRenderedWorkerLocomotionCase(session, probeCase, state) {
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
      value: probeCase.expectedReducedMotion === true
        ? 'reduce'
        : 'no-preference',
    }],
  });
  await navigateRenderedWebglCase(session, probeCase.url, state);
  await waitForAcceptedRenderedDom(session, probeCase, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
  const rawEvidence =
    await applyRenderedWebglWorkerLocomotionInteraction(session, probeCase);
  let evidence;
  try {
    evidence = parseRenderedWebglWorkerLocomotionEvidence(rawEvidence);
  } catch (error) {
    if (process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1') {
      process.stderr.write(
        `Local synthetic Worker locomotion evidence: ${JSON.stringify(rawEvidence)}\n`
      );
    }
    throw error;
  }
  const finalVisual = await captureRenderedCasePixels(
    session,
    probeCase.viewport,
    { minimumDistinctColourBuckets: 4 }
  );
  if (probeCase.workerLocomotion.climate === 'north') {
    const northernReachProbe =
      await import('./northern-reach-rendered-evidence.mjs');
    northernReachProbe.assertNorthernReachRenderedVisual(
      { region: 'deep' },
      finalVisual
    );
  } else if (probeCase.workerLocomotion.climate === 'south') {
    const regionalClimateProbe =
      await import('./regional-climate-rendered-evidence.mjs');
    regionalClimateProbe.assertRegionalClimateRenderedVisual(
      { compositionBucket: 4, region: 'deep' },
      finalVisual
    );
  }
  if (state.violation) {
    throw new Error('Rendered WebGL Worker locomotion left the local QA boundary.');
  }
  return evidence;
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
  await navigateRenderedWebglCase(session, probeCase.url, state);
  await waitForAcceptedRenderedDom(session, probeCase, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
  await applyRenderedWebglPresentationBandInteraction(session);
  await navigateRenderedWebglCase(session, probeCase.url, state);
  await waitForAcceptedRenderedDom(session, probeCase, state);
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
  await navigateRenderedWebglCase(session, probeCase.url, state);
  await waitForAcceptedRenderedDom(session, probeCase, state);
  const reconnectEvidence = await applyRenderedWebglActiveWorkerReconnectInteraction(session);
  parseRenderedWebglActiveWorkerEvidence({
    ...activeEvidence,
    ...reconnectEvidence,
  });
  await captureRenderedCasePixels(session, probeCase.viewport);

  const waterOverviewCase = Object.freeze({
    ...probeCase,
    id: 'desktop-balanced-worker-water-overview',
    minimumLabelCount: 1,
    viewport: DESKTOP_VIEWPORT,
  });
  await session.command('Emulation.setDeviceMetricsOverride', {
    width: waterOverviewCase.viewport.width,
    height: waterOverviewCase.viewport.height,
    screenWidth: waterOverviewCase.viewport.width,
    screenHeight: waterOverviewCase.viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Same-URL navigation may be coalesced after the mobile reconnect check.
  // Reset through the already-accepted blank target so this exact desktop
  // camera starts from the reviewed fixture state rather than a resized,
  // previously manipulated scene.
  await navigateRenderedWebglCase(session, 'about:blank', state);
  await navigateRenderedWebglCase(session, waterOverviewCase.url, state);
  await waitForAcceptedRenderedDom(session, waterOverviewCase, state);
  await applyRenderedWebglWaterOverviewInteraction(session);
  await captureRenderedCasePixels(session, waterOverviewCase.viewport);
  if (state.violation) {
    throw new Error('Rendered WebGL active Worker case left the local QA boundary.');
  }
}

async function runRenderedCase(
  session,
  probeCase,
  state,
  onQualityMetrics,
  northernReachProbe,
  regionalClimateProbe
) {
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
      value: probeCase.expectedReducedMotion === true
        || probeCase.expectedQuality === 'reduced'
        ? 'reduce'
        : 'no-preference',
    }],
  });
  await navigateRenderedWebglCase(session, probeCase.url, state);
  const baseline = Object.freeze({ ...probeCase, interaction: 'default' });
  await waitForAcceptedRenderedDom(session, baseline, state);
  await captureRenderedCasePixels(session, probeCase.viewport);
  if (RENDERED_WEBGL_QA_RESOURCE_OCCUPANT_CASE_IDS.has(probeCase.id)) {
    await applyRenderedWebglResourceOccupantInteraction(
      session,
      probeCase.expectedPresentationMode,
      probeCase.expectedQuality === 'reduced'
    );
    // Round-trip through a second exact, allowlisted spelling of the same
    // baseline fixture. A same-URL navigation can be coalesced while the final
    // React close commit is settling, and Page.reload races the probe's strict
    // request interception in some Chrome builds.
    const resetUrl = renderedWebglResourceResetUrl(probeCase.url);
    await navigateRenderedWebglCase(session, resetUrl, state);
    await waitForAcceptedRenderedDom(session, Object.freeze({
      ...baseline,
      url: resetUrl,
    }), state);
    await navigateRenderedWebglCase(session, probeCase.url, state);
    await waitForAcceptedRenderedDom(session, baseline, state);
  }
  if (probeCase.id === RENDERED_WEBGL_QA_SFX_CASE_ID) {
    await applyRenderedWebglSfxInteraction(session);
    await waitForAcceptedRenderedDom(session, baseline, state);
  }
  if (RENDERED_WEBGL_QA_ACTIVE_FOREST_CASE_IDS.has(probeCase.id)) {
    await waitForRenderedWebglCameraSettled(session);
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
    if (RENDERED_WEBGL_QA_QUALITY_METRIC_CASE_IDS.has(probeCase.id)) {
      onQualityMetrics?.(
        await waitForStableRenderedWebglQualityMetrics(
          session,
          probeCase.expectedQuality
        )
      );
    }
    // desktop-high still owns the established keyboard lane. Restore its
    // untouched overview before exercising that independent contract.
    if (probeCase.id === RENDERED_WEBGL_QA_LABEL_KEYBOARD_CASE_ID) {
      await navigateRenderedWebglCase(session, probeCase.url, state);
      await waitForAcceptedRenderedDom(session, baseline, state);
    }
  }
  if (probeCase.id === RENDERED_WEBGL_QA_LABEL_KEYBOARD_CASE_ID) {
    await applyRenderedWebglLabelKeyboardInteraction(session);
    await waitForAcceptedRenderedDom(session, baseline, state);
  }
  if (RENDERED_WEBGL_QA_MAP_GESTURE_CASES.has(probeCase.id)) {
    await waitForRenderedWebglCameraSettled(session);
    await applyRenderedWebglMapGestureInteraction(
      session,
      RENDERED_WEBGL_QA_MAP_GESTURE_CASES.get(probeCase.id)
    );
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
  if (probeCase.id === 'mobile-balanced-player') {
    await applyRenderedWebglViewportRotationInteraction(session, probeCase, state);
    await captureRenderedCasePixels(session, SHORT_LANDSCAPE_VIEWPORT);
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
  if (RENDERED_WEBGL_QA_NORTHERN_REACH_CASE_IDS.has(probeCase.id)) {
    // The short lane intentionally opened Explore above. A full allowlisted
    // reset proves the fixed journey starts without any sheet retaining focus,
    // safe-area space, or stale map state.
    await navigateRenderedWebglCase(session, 'about:blank', state);
    await navigateRenderedWebglCase(session, probeCase.url, state);
    await waitForAcceptedRenderedDom(session, baseline, state);
    const northernRegions = probeCase.id === 'short-landscape-balanced-northern'
      ? ['overview', 'transition']
      : ['overview', 'transition', 'deep'];
    for (const region of northernRegions) {
      try {
        const recover = probeCase.id === 'desktop-balanced' && region === 'deep';
        if (recover) {
          state.controlledRendererRecovery = true;
          state.controlledRendererWarningCount = 0;
          state.controlledRendererWarningThrottleSeen = false;
        }
        let evidence;
        try {
          evidence = await northernReachProbe.applyNorthernReachRenderedEvidence(
            session,
            {
              quality: probeCase.expectedQuality,
              recover,
              region,
              viewport: probeCase.viewport
            }
          );
          if (recover) await delay(100);
        } finally {
          if (recover) state.controlledRendererRecovery = false;
        }
        if (region === 'transition' && evidence.band !== 'strategy') {
          throw new Error(
            'Northern Reach transition did not settle at the strategy band.'
          );
        }
        if (probeCase.id === 'desktop-reduced' && region === 'deep') {
          // Both pauses are host timers, outside the observed page. This keeps
          // the repeated frame proof independent of page-controlled clocks.
          await delay(NORTHERN_REACH_REDUCED_MOTION_HOST_WAIT_MILLISECONDS);
          const firstSignature = await readNorthernReachStaticFrameSignature(
            session
          );
          const firstVisual = await captureRenderedCasePixels(
            session,
            probeCase.viewport,
            {
              artifactName:
                process.env.WARPKEEP_QA_NORTHERN_ARTIFACT_DIR
                  ? `${probeCase.id}-${region}-first.png`
                  : undefined,
              minimumDistinctColourBuckets: 4
            }
          );
          northernReachProbe.assertNorthernReachRenderedVisual(
            evidence,
            firstVisual
          );
          await delay(NORTHERN_REACH_REDUCED_MOTION_HOST_WAIT_MILLISECONDS);
          const repeatedSignature = await readNorthernReachStaticFrameSignature(
            session
          );
          const repeatedVisual = await captureRenderedCasePixels(
            session,
            probeCase.viewport,
            {
              artifactName:
                process.env.WARPKEEP_QA_NORTHERN_ARTIFACT_DIR
                  ? `${probeCase.id}-${region}-repeated.png`
                  : undefined,
              minimumDistinctColourBuckets: 4
            }
          );
          northernReachProbe.assertNorthernReachRenderedVisual(
            evidence,
            repeatedVisual
          );
          // Re-read the same immutable target only after the unchanged frame
          // pair has been captured. Re-selecting between screenshots would
          // measure camera/material settling rather than temporal snow crawl.
          const repeatedEvidence =
            await northernReachProbe.applyNorthernReachRenderedEvidence(
              session,
              {
                quality: probeCase.expectedQuality,
                recover: false,
                region,
                viewport: probeCase.viewport
              }
            );
          if (process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1') {
            process.stderr.write(
              `Local synthetic Northern reduced-motion aggregates: ${
                JSON.stringify({
                  first: {
                    evidence,
                    signature: firstSignature,
                    visual: firstVisual
                  },
                  repeated: {
                    evidence: repeatedEvidence,
                    signature: repeatedSignature,
                    visual: repeatedVisual
                  }
                })
              }\n`
            );
          }
          assertNorthernReachRepeatedReducedMotionEvidence(
            { evidence, signature: firstSignature, visual: firstVisual },
            {
              evidence: repeatedEvidence,
              signature: repeatedSignature,
              visual: repeatedVisual
            }
          );
        } else {
          const visual = await captureRenderedCasePixels(
            session,
            probeCase.viewport,
            {
              artifactName: process.env.WARPKEEP_QA_NORTHERN_ARTIFACT_DIR
                ? `${probeCase.id}-${region}.png`
                : undefined,
              minimumDistinctColourBuckets: 4
            }
          );
          if (
            process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1'
          ) {
            process.stderr.write(
              `Local synthetic Northern ${probeCase.id}/${region}: ${
                JSON.stringify({ evidence, visual })
              }\n`
            );
          }
          northernReachProbe.assertNorthernReachRenderedVisual(
            evidence,
            visual
          );
        }
      } catch (error) {
        throw new Error(`Northern Reach ${region} rendered evidence failed.`, {
          cause: error
        });
      }
    }
  }
  if (RENDERED_WEBGL_QA_SUNSCOURED_SOUTH_CASE_IDS.has(probeCase.id)) {
    // Every southern journey begins from the same reviewed fixture state. This
    // prevents the preceding north, inspector, or Explore camera from defining
    // the evidence target.
    await navigateRenderedWebglCase(session, 'about:blank', state);
    await navigateRenderedWebglCase(session, probeCase.url, state);
    await waitForAcceptedRenderedDom(session, baseline, state);
    const southernRegions = probeCase.id === 'desktop-balanced'
      ? ['overview', 'transition', 'deep', 'water-edge']
      : probeCase.id === 'desktop-high' || probeCase.id === 'desktop-reduced'
        ? ['overview', 'deep']
        : probeCase.id === 'short-landscape-explore'
          ? ['transition']
          : ['deep'];
    for (const region of southernRegions) {
      try {
        const recover = probeCase.id === 'desktop-balanced' && region === 'deep';
        if (recover) {
          state.controlledRendererRecovery = true;
          state.controlledRendererWarningCount = 0;
          state.controlledRendererWarningThrottleSeen = false;
        }
        let evidence;
        try {
          evidence =
            await regionalClimateProbe.applyRegionalClimateRenderedEvidence(
              session,
              {
                quality: probeCase.expectedQuality,
                recover,
                region,
                viewport: probeCase.viewport
              }
            );
          if (recover) await delay(100);
        } finally {
          if (recover) state.controlledRendererRecovery = false;
        }
        if (region === 'transition' && evidence.band !== 'strategy') {
          throw new Error(
            'Sunscoured South transition did not settle at the strategy band.'
          );
        }
        if (probeCase.id === 'desktop-reduced' && region === 'deep') {
          await delay(NORTHERN_REACH_REDUCED_MOTION_HOST_WAIT_MILLISECONDS);
          const firstSignature = await readNorthernReachStaticFrameSignature(
            session
          );
          const firstVisual = await captureRenderedCasePixels(
            session,
            probeCase.viewport,
            {
              artifactName: process.env.WARPKEEP_QA_SOUTHERN_ARTIFACT_DIR
                ? `${probeCase.id}-${region}-first.png`
                : undefined,
              artifactRegion: 'southern',
              minimumDistinctColourBuckets: 4
            }
          );
          regionalClimateProbe.assertRegionalClimateRenderedVisual(
            evidence,
            firstVisual
          );
          await delay(NORTHERN_REACH_REDUCED_MOTION_HOST_WAIT_MILLISECONDS);
          const repeatedSignature = await readNorthernReachStaticFrameSignature(
            session
          );
          const repeatedVisual = await captureRenderedCasePixels(
            session,
            probeCase.viewport,
            {
              artifactName: process.env.WARPKEEP_QA_SOUTHERN_ARTIFACT_DIR
                ? `${probeCase.id}-${region}-repeated.png`
                : undefined,
              artifactRegion: 'southern',
              minimumDistinctColourBuckets: 4
            }
          );
          regionalClimateProbe.assertRegionalClimateRenderedVisual(
            evidence,
            repeatedVisual
          );
          const repeatedEvidence =
            await regionalClimateProbe.applyRegionalClimateRenderedEvidence(
              session,
              {
                quality: probeCase.expectedQuality,
                recover: false,
                region,
                viewport: probeCase.viewport
              }
            );
          if (process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1') {
            process.stderr.write(
              `Local synthetic South reduced-motion aggregates: ${
                JSON.stringify({
                  first: {
                    evidence,
                    signature: firstSignature,
                    visual: firstVisual
                  },
                  repeated: {
                    evidence: repeatedEvidence,
                    signature: repeatedSignature,
                    visual: repeatedVisual
                  }
                })
              }\n`
            );
          }
          regionalClimateProbe
            .assertRegionalClimateRepeatedReducedMotionEvidence(
              { evidence, signature: firstSignature, visual: firstVisual },
              {
                evidence: repeatedEvidence,
                signature: repeatedSignature,
                visual: repeatedVisual
              }
            );
        } else {
          const visual = await captureRenderedCasePixels(
            session,
            probeCase.viewport,
            {
              artifactName: process.env.WARPKEEP_QA_SOUTHERN_ARTIFACT_DIR
                ? `${probeCase.id}-${region}.png`
                : undefined,
              artifactRegion: 'southern',
              minimumDistinctColourBuckets:
                probeCase.expectedQuality === 'reduced' ? 4 : undefined
            }
          );
          if (process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1') {
            process.stderr.write(
              `Local synthetic South ${probeCase.id}/${region}: ${
                JSON.stringify({ evidence, visual })
              }\n`
            );
          }
          regionalClimateProbe.assertRegionalClimateRenderedVisual(
            evidence,
            visual
          );
        }
      } catch (error) {
        throw new Error(
          `Sunscoured South ${region} rendered evidence failed.`,
          { cause: error }
        );
      }
    }
  }
}

async function runRenderedTerrainShaderFallbackCase(
  session,
  probeCase,
  state,
  regionalClimateProbe
) {
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
  await navigateRenderedWebglCase(session, 'about:blank', state);
  await navigateRenderedWebglCase(session, probeCase.url, state);
  const accepted = await waitForAcceptedRenderedDom(session, probeCase, state);
  if (
    accepted.terrainShaderEnhanced !== false
    || accepted.terrainShaderFallbackActive !== true
  ) throw new Error('Rendered terrain shader fallback telemetry mismatched.');
  const evidence = await regionalClimateProbe.applyRegionalClimateRenderedEvidence(
    session,
    {
      quality: probeCase.expectedQuality,
      recover: false,
      region: 'deep',
      shaderFallback: true,
      viewport: probeCase.viewport,
    }
  );
  const visual = await captureRenderedCasePixels(
    session,
    probeCase.viewport,
    {
      artifactName: process.env.WARPKEEP_QA_SOUTHERN_ARTIFACT_DIR
        ? 'desktop-balanced-terrain-shader-fallback-deep.png'
        : undefined,
      artifactRegion: 'southern',
      minimumDistinctColourBuckets: 4,
    }
  );
  regionalClimateProbe.assertRegionalClimateRenderedVisual(evidence, visual);
  if (state.violation) {
    throw new Error('Rendered terrain shader fallback left the local QA boundary.');
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
  const onQualityMetrics = options?.onQualityMetrics;
  const onWorkerLocomotionEvidence = options?.onWorkerLocomotionEvidence;
  if (
    onCastleLodVisualBoundary !== undefined
    && typeof onCastleLodVisualBoundary !== 'function'
  ) throw new TypeError('Invalid castle LOD visual boundary callback.');
  if (
    onCastleLodVisualEvidence !== undefined
    && typeof onCastleLodVisualEvidence !== 'function'
  ) throw new TypeError('Invalid castle LOD visual evidence callback.');
  if (
    onQualityMetrics !== undefined
    && typeof onQualityMetrics !== 'function'
  ) throw new TypeError('Invalid rendered WebGL quality metrics callback.');
  if (
    onWorkerLocomotionEvidence !== undefined
    && typeof onWorkerLocomotionEvidence !== 'function'
  ) throw new TypeError('Invalid rendered WebGL Worker locomotion evidence callback.');
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
      castleLodVisualProbe.castleLodVisualEvidenceSourceVitePlugin(
        castleLodVisualSource
      ),
      renderedWebglTerrainShaderFallbackVitePlugin(),
    ]);
    const castleLodVisualBoundary = await castleLodVisualProbe
      .assertCastleLodVisualEvidenceLoopbackBoundary(vite.port);
    onCastleLodVisualBoundary?.(castleLodVisualBoundary);
    const cases = renderedWebglBrowserProbeCases(vite.port);
    const activeWorkerCase = renderedWebglActiveWorkerProbeCase(vite.port);
    const workerLocomotionCases =
      renderedWebglWorkerLocomotionProbeCases(vite.port);
    const occupancyStressCase = renderedWebglOccupancyStressProbeCase(vite.port);
    const terrainShaderFallbackCase =
      renderedWebglTerrainShaderFallbackProbeCase(vite.port);
    const journeyProbe = await import('./qa-journey-browser-probe.mjs');
    const northernReachProbe = await import('./northern-reach-rendered-evidence.mjs');
    const regionalClimateProbe =
      await import('./regional-climate-rendered-evidence.mjs');
    const journeyCases = journeyProbe.qaJourneyBrowserProbeCases(vite.port);
    const castleLodVisualUrl = castleLodVisualProbe.castleLodVisualEvidenceUrl(vite.port);
    const isAllowedProbeResourceUrl = (value) => (
      isAllowedRenderedWebglPageUrl(value, `http://127.0.0.1:${vite.port}`)
      || journeyProbe.isAllowedQaJourneyResourceUrl(value)
    );
    if (
      cases.length !== RENDERED_WEBGL_QA_CASE_COUNT
      || new Set(cases.map((probeCase) => probeCase.id)).size !== RENDERED_WEBGL_QA_CASE_COUNT
      || workerLocomotionCases.length
        !== RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPECS.length
      || new Set(workerLocomotionCases.map(({ id }) => id)).size
        !== RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPECS.length
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
      loadedPageLoaderIds: new Set(),
      allowedUrls: new Set([
        ...cases.map((probeCase) => probeCase.url),
        ...cases
          .filter((probeCase) => (
            RENDERED_WEBGL_QA_RESOURCE_OCCUPANT_CASE_IDS.has(probeCase.id)
          ))
          .map((probeCase) => renderedWebglResourceResetUrl(probeCase.url)),
        activeWorkerCase.url,
        ...workerLocomotionCases.map((probeCase) => probeCase.url),
        occupancyStressCase.url,
        terrainShaderFallbackCase.url,
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
      if (method === 'Page.lifecycleEvent' && params?.name === 'load') {
        let loaderId;
        try {
          loaderId = exactCdpIdentifier(
            params?.loaderId,
            'lifecycle loader id'
          );
        } catch {
          state.violation = 'page-lifecycle';
          return;
        }
        state.loadedPageLoaderIds.add(loaderId);
        if (state.loadedPageLoaderIds.size > 256) {
          state.violation = 'page-lifecycle-bound';
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
        if (targetInfo?.targetId !== state.targetId) {
          const targetUrlKind = targetInfo?.url === ''
            ? 'empty'
            : targetInfo?.url === 'about:blank'
              ? 'blank'
              : isAllowedRenderedWebglPageUrl(targetInfo?.url, loopbackOrigin)
                ? 'allowed-local'
                : typeof targetInfo?.url === 'string'
                  && targetInfo.url.startsWith('chrome-error://')
                  ? 'chrome-error'
                  : typeof targetInfo?.url === 'string'
                    && targetInfo.url.startsWith('chrome://')
                    ? `chrome-${
                      /^chrome:\/\/([a-z0-9-]+)/u.exec(targetInfo.url)?.[1]
                        ?? 'invalid'
                    }`
                    : typeof targetInfo?.url === 'string'
                      && targetInfo.url.startsWith('devtools://')
                      ? 'devtools'
                      : typeof targetInfo?.url === 'string'
                        && targetInfo.url.startsWith('about:')
                        ? 'about'
                      : typeof targetInfo?.url === 'string'
                        && /^https?:\/\//u.test(targetInfo.url)
                        ? 'external-web'
                        : typeof targetInfo?.url === 'string'
                          && targetInfo.url.startsWith('blob:')
                          ? 'blob'
                          : typeof targetInfo?.url === 'string'
                            && targetInfo.url.startsWith('data:')
                            ? 'data'
                            : 'other';
          state.violation = `target-id-${String(targetInfo?.type ?? 'invalid')}-${targetUrlKind}`;
        }
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
    await devtools.command('Page.setLifecycleEventsEnabled', {
      enabled: true,
    });
    for (const probeCase of cases) {
      try {
        await runRenderedCase(
          devtools,
          probeCase,
          state,
          onQualityMetrics,
          northernReachProbe,
          regionalClimateProbe
        );
      } catch (error) {
        throw new Error(`Rendered WebGL case ${probeCase.id} failed.`, { cause: error });
      }
    }
    try {
      await runRenderedTerrainShaderFallbackCase(
        devtools,
        terrainShaderFallbackCase,
        state,
        regionalClimateProbe
      );
    } catch (error) {
      throw new Error('Rendered terrain shader fallback case failed.', {
        cause: error,
      });
    }
    try {
      await runRenderedActiveWorkerCase(devtools, activeWorkerCase, state);
    } catch (error) {
      throw new Error('Rendered WebGL active generic Worker case failed.', {
        cause: error,
      });
    }
    for (const workerLocomotionCase of workerLocomotionCases) {
      try {
        onWorkerLocomotionEvidence?.(
          await runRenderedWorkerLocomotionCase(
            devtools,
            workerLocomotionCase,
            state
          )
        );
      } catch (error) {
        throw new Error(
          `Rendered WebGL Worker locomotion case ${workerLocomotionCase.id} failed.`,
          { cause: error }
        );
      }
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
    const workerLocomotionEvidence = [];
    const qualityMetrics = {};
    const passedCaseCount = await runRenderedWebglBrowserProbe({
      onCastleLodVisualBoundary: (boundary) => {
        castleLodVisualBoundary = boundary;
      },
      onCastleLodVisualEvidence: (evidence) => {
        castleLodVisualEvidence = evidence;
      },
      onQualityMetrics: (metrics) => {
        qualityMetrics[metrics.quality] = metrics;
      },
      onWorkerLocomotionEvidence: (evidence) => {
        workerLocomotionEvidence.push(evidence);
      },
    });
    const lodMetrics = castleLodVisualEvidence?.profiles;
    if (
      !lodMetrics
      || !castleLodVisualBoundary
      || workerLocomotionEvidence.length
        !== RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPECS.length
      || workerLocomotionEvidence.some((evidence, index) => (
        evidence.caseId
          !== RENDERED_WEBGL_WORKER_LOCOMOTION_CASE_SPECS[index]?.id
      ))
      || !['high', 'balanced', 'reduced'].every((quality) => (
        qualityMetrics[quality]?.quality === quality
      ))
      || Object.keys(qualityMetrics).length !== 3
    ) {
      throw new Error('Rendered WebGL evidence did not complete.');
    }
    const [highMetrics, balancedMetrics, reducedMetrics] = [
      qualityMetrics.high,
      qualityMetrics.balanced,
      qualityMetrics.reduced,
    ];
    // Castle label anchors legitimately follow quality-specific model/LOD
    // envelopes, so their screen-projection token may differ at one exact
    // camera. Compare the renderer-owned privacy-safe pose token instead.
    if (![balancedMetrics, reducedMetrics].every((metrics) => (
      metrics.viewportWidth === highMetrics.viewportWidth
      && metrics.viewportHeight === highMetrics.viewportHeight
      && metrics.cameraMode === highMetrics.cameraMode
      && metrics.presentationBand === highMetrics.presentationBand
      && metrics.cameraProjectionCount === highMetrics.cameraProjectionCount
      && metrics.cameraStateToken === highMetrics.cameraStateToken
      && metrics.cameraTargetKind === highMetrics.cameraTargetKind
      && metrics.cameraZoom === highMetrics.cameraZoom
    ))) {
      throw new Error('Rendered WebGL quality metrics camera comparison mismatched.');
    }
    const lodFidelitySummary = `aggregate castle LOD fidelity ${JSON.stringify(lodMetrics)}`;
    const qualityMetricsSummary =
      `High/Balanced/Reduced metrics ${JSON.stringify(qualityMetrics)}`;
    process.stdout.write(
      `Warpkeep local browser QA passed: ${passedCaseCount} rendered cases, one `
      + `terrain shader fallback check, one active generic Worker lifecycle check, six Worker `
      + `locomotion evidence checks, one all-node occupancy `
      + `stress check, 25 journey checks, and `
      + `loopback LOD boundary ${JSON.stringify(castleLodVisualBoundary)}, ${lodFidelitySummary}, `
      + `${qualityMetricsSummary}.\n`
    );
  } catch (error) {
    if (process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1') {
      process.stderr.write(
        `Local rendered WebGL QA failure: ${
          formatRenderedWebglLocalDiagnostic(error)
        }\n`
      );
    }
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
