import type {
  FarcasterAuthEntryStage
} from './farcasterAuthTypes';

const SUPPORT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUPPORT_CODE_PATTERN = /^WK-[A-HJ-NP-Z2-9]{6}$/;
const BUILD_PATTERN = /^(?:[0-9a-f]{7}|LOCAL)$/i;
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const ENTRY_STAGES = new Set<FarcasterAuthEntryStage>([
  'host_ready',
  'quick_auth_api_missing',
  'quick_auth_token_started',
  'quick_auth_token_timeout',
  'quick_auth_token_rejected',
  'quick_auth_token_invalid_shape',
  'quick_auth_host_replaced',
  'quick_auth_token_acquired',
  'bridge_client_unavailable',
  'bridge_exchange_started',
  'bridge_network_failed',
  'bridge_cors_failed',
  'bridge_exchange_timeout',
  'bridge_http_401',
  'bridge_http_403',
  'bridge_http_429',
  'bridge_http_503',
  'bridge_response_invalid',
  'client_clock_invalid',
  'access_token_invalid',
  'identity_changed',
  'session_authorized',
  'session_pending',
  'stale_result_discarded',
  'deployment_contract_mismatch'
]);

export type FarcasterAuthDiagnosticPlatform = 'mobile' | 'web' | 'unknown';
export type FarcasterAuthDiagnosticHost =
  | 'miniapp'
  | 'detecting'
  | 'recovery'
  | 'regular-web';

export type FarcasterAuthDiagnosticRandomSource = (
  target: Uint8Array<ArrayBuffer>
) => void;

export type FarcasterAuthClipboardWriter = Readonly<{
  writeText: (value: string) => Promise<void>;
}>;

function defaultRandomSource(target: Uint8Array<ArrayBuffer>) {
  globalThis.crypto.getRandomValues(target);
}

/** Creates an opaque, session-only support code with no identity or time input. */
export function createFarcasterAuthSupportCode(
  randomSource: FarcasterAuthDiagnosticRandomSource = defaultRandomSource
) {
  const bytes = new Uint8Array(new ArrayBuffer(6));
  try {
    randomSource(bytes);
    return `WK-${Array.from(
      bytes,
      (byte) => SUPPORT_ALPHABET[byte % SUPPORT_ALPHABET.length]
    ).join('')}`;
  } catch {
    return 'WK-UNAVAIL';
  } finally {
    bytes.fill(0);
  }
}

function boundedViewportAxis(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(10_000, Math.round(value))
    : undefined;
}

function safeVersion(value: unknown) {
  return typeof value === 'string' && VERSION_PATTERN.test(value)
    ? value
    : '0.0.0';
}

function safeBuild(value: unknown) {
  return typeof value === 'string' && BUILD_PATTERN.test(value)
    ? value.toLowerCase() === 'local' ? 'LOCAL' : value.toLowerCase()
    : 'LOCAL';
}

function safeSupportCode(value: unknown) {
  return typeof value === 'string' && SUPPORT_CODE_PATTERN.test(value)
    ? value
    : 'WK-UNAVAIL';
}

function safeEntryStage(value: unknown): FarcasterAuthEntryStage {
  return typeof value === 'string' && ENTRY_STAGES.has(value as FarcasterAuthEntryStage)
    ? value as FarcasterAuthEntryStage
    : 'deployment_contract_mismatch';
}

/**
 * Formats the complete allowlisted auth report. The input shape has no FID,
 * profile, token, cookie, URL, user-agent, IP, claim, or raw-error field.
 */
export function farcasterAuthSafeDiagnosticReport(input: Readonly<{
  version: unknown;
  build: unknown;
  stage: unknown;
  host: FarcasterAuthDiagnosticHost;
  platform: FarcasterAuthDiagnosticPlatform;
  viewportWidth?: unknown;
  viewportHeight?: unknown;
  online?: boolean;
  supportCode: unknown;
}>) {
  const width = boundedViewportAxis(input.viewportWidth);
  const height = boundedViewportAxis(input.viewportHeight);
  const host = input.host === 'miniapp'
    || input.host === 'detecting'
    || input.host === 'recovery'
    || input.host === 'regular-web'
    ? input.host
    : 'recovery';
  const platform = input.platform === 'mobile' || input.platform === 'web'
    ? input.platform
    : 'unknown';
  const online = input.online === true ? 'yes' : input.online === false ? 'no' : 'unknown';
  return [
    `Warpkeep Alpha ${safeVersion(input.version)}`,
    `Build: ${safeBuild(input.build)}`,
    `Entry stage: ${safeEntryStage(input.stage)}`,
    `Host: ${host}`,
    `Platform: ${platform}`,
    `Viewport: ${width !== undefined && height !== undefined ? `${width}x${height}` : 'unknown'}`,
    `Online: ${online}`,
    `Support code: ${safeSupportCode(input.supportCode)}`
  ].join('\n');
}

/** Clipboard access is user-triggered, best-effort, local, and never logged. */
export async function copyFarcasterAuthDiagnosticReport(
  report: string,
  writer?: FarcasterAuthClipboardWriter
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
