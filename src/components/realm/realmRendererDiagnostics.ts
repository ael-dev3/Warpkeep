import type {
  GraphicsPreference,
  GraphicsQualityTier
} from '../../settings/graphicsPreference';
import type {
  RealmRendererFailure,
  RealmRendererFailureCode
} from './realmRendererRecovery';

export const WARPKEEP_RENDERER_SUPPORT_URL = 'https://farcaster.xyz/0xael.eth';

export type RealmRendererCapacityBand =
  | 'limited'
  | 'moderate'
  | 'standard'
  | 'unknown';

export type RealmRendererCompatibilitySnapshot = Readonly<{
  webgl2: 'available' | 'previously-available' | 'unavailable' | 'unknown';
  viewport: 'compact' | 'standard' | 'wide';
  pixelDensity: 'standard' | 'dense' | 'very-dense';
  capacity: RealmRendererCapacityBand;
}>;

export type RealmRendererDiagnostic = Readonly<{
  reference: `WK-GFX-${string}`;
  title: string;
  explanation: string;
  likelyCause: string;
  automaticResponse: string;
  suggestedAction: string;
}>;

export type RealmRendererClipboardWriter = Readonly<{
  writeText: (value: string) => Promise<void>;
}>;

type DiagnosticCatalogEntry = RealmRendererDiagnostic & Readonly<{
  rebalanceQuality: boolean;
  staticFallback: boolean;
}>;

const DIAGNOSTIC_CATALOG = Object.freeze({
  'webgl-unavailable': Object.freeze({
    reference: 'WK-GFX-001',
    title: 'WebGL 2 is unavailable',
    explanation: 'This browser did not provide the WebGL 2 graphics interface required by the 3D Realm.',
    likelyCause: 'Hardware acceleration may be disabled, the browser or embedded view may block WebGL 2, or the device may use an older graphics implementation.',
    automaticResponse: 'Warpkeep keeps the canonical Realm available in its lightweight 2D safety view and will probe 3D again only when you choose Retry.',
    suggestedAction: 'Update the browser and operating system, enable hardware acceleration when available, close other graphics-heavy apps, then retry.',
    rebalanceQuality: false,
    staticFallback: true
  }),
  'renderer-construction-failed': Object.freeze({
    reference: 'WK-GFX-002',
    title: 'The 3D renderer could not start',
    explanation: 'WebGL 2 was detected, but the browser could not finish creating a stable Realm renderer.',
    likelyCause: 'The device may be short on graphics memory or contexts, an embedded browser may have a smaller graphics budget, or the graphics process may have restarted.',
    automaticResponse: 'Warpkeep releases the incomplete renderer and retries with a lighter session-only graphics profile before using the 2D safety view.',
    suggestedAction: 'Keep this tab visible, close other graphics-heavy tabs or apps, and retry after the device has recovered memory.',
    rebalanceQuality: true,
    staticFallback: true
  }),
  'context-lost': Object.freeze({
    reference: 'WK-GFX-003',
    title: 'The graphics device was interrupted',
    explanation: 'The browser reported that Warpkeep’s active WebGL 2 context was lost. Server-owned progress and Realm authority were not changed.',
    likelyCause: 'Common causes include app switching, device sleep, memory pressure, a browser graphics-process reset, thermal pressure, or an unstable device graphics driver.',
    automaticResponse: 'Warpkeep pauses input, waits briefly for the exact context to return, then rebuilds the scene one tier lighter for this browser session.',
    suggestedAction: 'Leave Warpkeep visible while it repairs itself. If recovery repeats, update the browser and operating system and close other graphics-heavy apps.',
    rebalanceQuality: true,
    staticFallback: true
  }),
  'context-restore-timeout': Object.freeze({
    reference: 'WK-GFX-004',
    title: 'The graphics context did not return',
    explanation: 'The browser did not restore the interrupted WebGL 2 context inside Warpkeep’s bounded recovery window.',
    likelyCause: 'The graphics process may still be restarting, the embedded view may have exhausted its context budget, or the device may not be able to restore this context reliably.',
    automaticResponse: 'Warpkeep retires the stalled generation and attempts a fresh, lighter renderer before falling back to the 2D safety view.',
    suggestedAction: 'Allow the automatic retry to finish. If it cannot, return to the menu, close other apps, and try the Realm again.',
    rebalanceQuality: true,
    staticFallback: true
  }),
  'scene-build-timeout': Object.freeze({
    reference: 'WK-GFX-013',
    title: 'The first 3D scene took too long',
    explanation: 'WebGL 2 was available, but the initial Realm scene did not become ready inside its bounded construction window.',
    likelyCause: 'Asset decoding, CPU work, graphics memory pressure, thermal throttling, app backgrounding, or a constrained embedded browser may have stalled the first scene.',
    automaticResponse: 'Warpkeep disposes the stalled generation exactly once, tries a fresh lighter session-only renderer when its retry budget allows, then enters the 2D safety view.',
    suggestedAction: 'Keep the page foregrounded during recovery. Updating the browser or operating system can improve older graphics and WebView implementations.',
    rebalanceQuality: true,
    staticFallback: true
  }),
  'scene-rebuild-timeout': Object.freeze({
    reference: 'WK-GFX-005',
    title: 'The replacement 3D scene took too long',
    explanation: 'The browser had already started the 3D Realm, but a replacement scene did not become ready inside its bounded rebuild window.',
    likelyCause: 'The browser graphics process may still be recovering, or asset decoding, graphics memory pressure, thermal throttling, app backgrounding, or a constrained embedded view may have stalled the rebuild.',
    automaticResponse: 'Warpkeep disposes the stalled generation exactly once, tries a fresh lighter session-only renderer when its retry budget allows, then enters the 2D safety view.',
    suggestedAction: 'Keep the page foregrounded during recovery. Updating the browser or operating system can improve older graphics and WebView implementations.',
    rebalanceQuality: true,
    staticFallback: true
  }),
  'castle-count-mismatch': Object.freeze({
    reference: 'WK-GFX-006',
    title: 'The castle presentation was incomplete',
    explanation: 'The completed 3D scene did not contain every castle required by the validated Realm snapshot.',
    likelyCause: 'A model may have failed during assembly, a renderer callback may have arrived out of order, or the device may have dropped work under pressure.',
    automaticResponse: 'Warpkeep rejects the incomplete generation, retries within a bounded lighter profile, and never publishes a partial scene as ready.',
    suggestedAction: 'Let the retry complete. If this reference repeats, contact the developer so the release assets can be checked.',
    rebalanceQuality: true,
    staticFallback: true
  }),
  'castle-prefab-assembly-failed': Object.freeze({
    reference: 'WK-GFX-007',
    title: 'A castle model could not be assembled',
    explanation: 'A required castle asset loaded but did not satisfy Warpkeep’s renderable-model contract.',
    likelyCause: 'The release asset may be incompatible with the current client, partially cached, or unsupported by this browser’s model-decoding path.',
    automaticResponse: 'Warpkeep blocks the incomplete 3D presentation and retains the canonical Realm in the 2D safety view.',
    suggestedAction: 'Retry once to refresh the asset path. If the same reference returns, contact the developer with the safe diagnostic report below.',
    rebalanceQuality: false,
    staticFallback: true
  }),
  'castle-pairing-failed': Object.freeze({
    reference: 'WK-GFX-008',
    title: 'Castle presentation assets did not pair',
    explanation: 'The castle and its authored landscape base could not be paired into one validated presentation.',
    likelyCause: 'A stale cache or mismatched release asset may have crossed the deployment boundary.',
    automaticResponse: 'Warpkeep refuses to display the mismatched 3D asset and uses the canonical 2D safety view instead.',
    suggestedAction: 'Reload the latest Warpkeep release. If this reference remains, contact the developer rather than repeatedly retrying.',
    rebalanceQuality: false,
    staticFallback: true
  }),
  'castle-compact-load-failed': Object.freeze({
    reference: 'WK-GFX-009',
    title: 'The required castle model did not load',
    explanation: 'The smallest mandatory castle asset could not be fetched and decoded within its bounded loading contract.',
    likelyCause: 'The connection may have changed, the browser cache may be unhealthy, memory may be constrained, or the embedded view may have interrupted the request.',
    automaticResponse: 'Warpkeep retries the controlled load, releases failed work, and keeps the Realm usable in the 2D safety view if the asset remains unavailable.',
    suggestedAction: 'Check the connection, keep Warpkeep foregrounded, and retry. Repeated failures should be reported with the reference below.',
    rebalanceQuality: false,
    staticFallback: true
  }),
  'castle-integrity-failed': Object.freeze({
    reference: 'WK-GFX-010',
    title: 'A Realm asset failed integrity verification',
    explanation: 'A downloaded castle asset did not match the content digest reviewed for this Warpkeep release.',
    likelyCause: 'A stale or damaged cache, incomplete delivery, or release-asset drift may have changed the received bytes.',
    automaticResponse: 'Warpkeep fails closed for the unverified 3D asset and shows only the locally generated canonical 2D safety view.',
    suggestedAction: 'Do not keep retrying. Reload once, then contact the developer if the same integrity reference remains.',
    rebalanceQuality: false,
    staticFallback: true
  }),
  'scene-build-failed': Object.freeze({
    reference: 'WK-GFX-011',
    title: 'The 3D Realm could not be assembled',
    explanation: 'The browser accepted WebGL 2, but an unexpected failure stopped this scene generation before it became ready.',
    likelyCause: 'Graphics memory pressure, an older WebGL implementation, asset decoding, or a browser graphics-process reset can interrupt scene construction.',
    automaticResponse: 'Warpkeep retires the failed generation and retries at a lighter session-only tier before using the 2D safety view.',
    suggestedAction: 'Allow the automatic repair to finish. If this reference repeats, update the browser and contact the developer with the report below.',
    rebalanceQuality: true,
    staticFallback: true
  }),
  'sync-failed': Object.freeze({
    reference: 'WK-GFX-012',
    title: 'The visual Realm could not synchronize',
    explanation: 'The renderer could not reconcile its presentation with the already validated client snapshot.',
    likelyCause: 'A stale renderer generation or interrupted browser lifecycle may have prevented the visual update from settling.',
    automaticResponse: 'Warpkeep discards the visual generation without mutating server-owned state and preserves the canonical 2D safety view.',
    suggestedAction: 'Retry the 3D view once. If this reference returns, contact the developer so the presentation boundary can be reviewed.',
    rebalanceQuality: false,
    staticFallback: true
  })
} satisfies Readonly<Record<RealmRendererFailureCode, DiagnosticCatalogEntry>>);

function finitePositive(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function capacityBand(
  hardwareConcurrency: number | undefined,
  deviceMemory: number | undefined
): RealmRendererCapacityBand {
  const cores = finitePositive(hardwareConcurrency);
  const memory = finitePositive(deviceMemory);
  if (cores === undefined && memory === undefined) return 'unknown';
  if ((cores !== undefined && cores <= 2) || (memory !== undefined && memory <= 2)) {
    return 'limited';
  }
  if ((cores !== undefined && cores <= 4) || (memory !== undefined && memory <= 4)) {
    return 'moderate';
  }
  return 'standard';
}

/**
 * Builds a deliberately coarse, local-only compatibility snapshot. Exact
 * processor, memory, viewport, renderer, driver, user-agent, and identity
 * values are neither retained nor returned, so the report cannot become a
 * device fingerprint or private support log.
 */
export function readRealmRendererCompatibilitySnapshot(input: Readonly<{
  webgl2Available?: boolean;
  webgl2PreviouslyAvailable?: boolean;
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}> = {}): RealmRendererCompatibilitySnapshot {
  const width = finitePositive(input.width)
    ?? (typeof window === 'undefined' ? 1280 : finitePositive(window.innerWidth) ?? 1280);
  const height = finitePositive(input.height)
    ?? (typeof window === 'undefined' ? 720 : finitePositive(window.innerHeight) ?? 720);
  const density = finitePositive(input.devicePixelRatio)
    ?? (typeof window === 'undefined' ? 1 : finitePositive(window.devicePixelRatio) ?? 1);
  const navigatorWithMemory = typeof navigator === 'undefined'
    ? undefined
    : navigator as Navigator & { deviceMemory?: number };
  const cores = input.hardwareConcurrency ?? navigatorWithMemory?.hardwareConcurrency;
  const memory = input.deviceMemory ?? navigatorWithMemory?.deviceMemory;
  const shortestSide = Math.min(width, height);
  return Object.freeze({
    webgl2: input.webgl2Available === false
      ? 'unavailable'
      : input.webgl2PreviouslyAvailable
        ? 'previously-available'
        : input.webgl2Available === true
          ? 'available'
          : 'unknown',
    viewport: shortestSide <= 600 ? 'compact' : width >= 1440 ? 'wide' : 'standard',
    pixelDensity: density > 2.5 ? 'very-dense' : density > 1.5 ? 'dense' : 'standard',
    capacity: capacityBand(cores, memory)
  });
}

export function realmRendererDiagnostic(
  failure: RealmRendererFailure | undefined
): RealmRendererDiagnostic {
  return DIAGNOSTIC_CATALOG[failure?.code ?? 'scene-build-failed'];
}

export function shouldRebalanceRealmRendererQuality(
  failure: RealmRendererFailure
) {
  return DIAGNOSTIC_CATALOG[failure.code].rebalanceQuality;
}

export function canUseStaticRealmFallback(failure: RealmRendererFailure) {
  return DIAGNOSTIC_CATALOG[failure.code].staticFallback;
}

export function realmRendererCompatibilityExplanation(
  snapshot: RealmRendererCompatibilitySnapshot
) {
  const graphics = snapshot.webgl2 === 'unavailable'
    ? 'WebGL 2 is currently unavailable or blocked.'
    : snapshot.webgl2 === 'previously-available'
      ? 'WebGL 2 was available before this interruption.'
      : snapshot.webgl2 === 'available'
        ? 'WebGL 2 is available to this browser.'
        : 'WebGL 2 availability could not be confirmed.';
  const capacity = snapshot.capacity === 'limited'
    ? 'The browser reports limited CPU or memory headroom.'
    : snapshot.capacity === 'moderate'
      ? 'The browser reports moderate CPU or memory headroom.'
      : snapshot.capacity === 'standard'
        ? 'The browser reports ordinary CPU and memory headroom.'
        : 'The browser does not expose enough capacity information to classify this device.';
  return `${graphics} ${capacity} Browsers do not expose a trustworthy graphics-driver version, so Warpkeep cannot safely identify a specific driver fault.`;
}

function boundedInteger(value: number | undefined, minimum = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const bounded = Math.trunc(value);
  return bounded >= minimum && bounded <= 1_000_000_000
    ? bounded
    : undefined;
}

function boundedDevicePixelRatio(value: number | undefined) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value <= 0
    || value > 16
  ) return 'unknown';
  return String(Math.round(value * 1_000) / 1_000);
}

function boundedCssPixels(value: number | undefined) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value <= 0
    || value > 1_000_000
  ) return undefined;
  return String(Math.round(value * 1_000) / 1_000);
}

function boundedVersion(value: string) {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
    ? value
    : 'unknown';
}

function boundedBuildSha(value: string) {
  const candidate = value.trim();
  return /^(?:[0-9a-f]{7}|[0-9a-f]{40})$/i.test(candidate)
    ? candidate.toLowerCase()
    : candidate === 'LOCAL'
      ? candidate
      : 'unknown';
}

function boundedGraphicsPreference(value: GraphicsPreference) {
  return value === 'auto'
    || value === 'cinematic'
    || value === 'balanced'
    || value === 'performance'
    ? value
    : 'auto';
}

function boundedGraphicsQuality(value: GraphicsQualityTier) {
  return value === 'cinematic' || value === 'balanced' || value === 'performance'
    ? value
    : 'performance';
}

/**
 * Produces the complete, allowlisted support payload. It accepts no identity,
 * URL, user-agent, raw exception, or Realm-state fields, so those values cannot
 * accidentally cross the user-triggered clipboard boundary.
 */
export function realmRendererSafeDiagnosticReport(input: Readonly<{
  version: string;
  buildSha: string;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  selectedQuality: GraphicsPreference;
  resolvedQuality: GraphicsQualityTier;
  maxTextureSize?: number;
  drawingBufferWidth?: number;
  drawingBufferHeight?: number;
  failureCode?: RealmRendererFailureCode;
  generation: number;
  contextLossCount?: number;
  contextRestoreCount?: number;
}>) {
  const viewportWidth = boundedCssPixels(input.viewportWidth);
  const viewportHeight = boundedCssPixels(input.viewportHeight);
  const maxTextureSize = boundedInteger(input.maxTextureSize, 1);
  const drawingBufferWidth = boundedInteger(input.drawingBufferWidth, 1);
  const drawingBufferHeight = boundedInteger(input.drawingBufferHeight, 1);
  return [
    `warpkeep_version=${boundedVersion(input.version)}`,
    `build_sha=${boundedBuildSha(input.buildSha)}`,
    `viewport_css_px=${viewportWidth !== undefined && viewportHeight !== undefined
      ? `${viewportWidth}x${viewportHeight}`
      : 'unknown'}`,
    `device_pixel_ratio=${boundedDevicePixelRatio(input.devicePixelRatio)}`,
    `selected_quality=${boundedGraphicsPreference(input.selectedQuality)}`,
    `resolved_quality=${boundedGraphicsQuality(input.resolvedQuality)}`,
    `webgl_max_texture_size=${maxTextureSize ?? 'unknown'}`,
    `drawing_buffer_px=${drawingBufferWidth !== undefined && drawingBufferHeight !== undefined
      ? `${drawingBufferWidth}x${drawingBufferHeight}`
      : 'unknown'}`,
    `context_loss_count=${boundedInteger(input.contextLossCount) ?? 0}`,
    `context_restore_count=${boundedInteger(input.contextRestoreCount) ?? 0}`,
    `renderer_generation=${boundedInteger(input.generation) ?? 0}`,
    `failure_code=${input.failureCode ?? 'none'}`
  ].join('\n');
}

/**
 * Clipboard access is best-effort and user initiated. A blocked or missing
 * Clipboard API returns false so the caller can reveal a selectable local
 * fallback; diagnostics are never sent, logged, or persisted here.
 */
export async function copyRealmRendererDiagnosticReport(
  report: string,
  writer?: RealmRendererClipboardWriter
) {
  let resolvedWriter = writer;
  if (!resolvedWriter) {
    try {
      resolvedWriter = typeof navigator === 'undefined'
        ? undefined
        : navigator.clipboard;
    } catch {
      resolvedWriter = undefined;
    }
  }
  if (!resolvedWriter || typeof resolvedWriter.writeText !== 'function') return false;
  try {
    await resolvedWriter.writeText(report);
    return true;
  } catch {
    return false;
  }
}
