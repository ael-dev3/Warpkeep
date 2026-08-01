export type RealmRendererLifecycleState =
  | 'probing'
  | 'loading'
  | 'ready'
  | 'recovering'
  | 'static-unsupported'
  | 'static-degraded'
  | 'failed';

export type RealmRendererFailureCode =
  | 'webgl-unavailable'
  | 'renderer-construction-failed'
  | 'context-lost'
  | 'context-restore-timeout'
  | 'scene-build-timeout'
  | 'scene-rebuild-timeout'
  | 'castle-count-mismatch'
  | 'castle-prefab-assembly-failed'
  | 'castle-pairing-failed'
  | 'castle-compact-load-failed'
  | 'castle-integrity-failed'
  | 'scene-build-failed'
  | 'sync-failed';

export type RealmRendererFailure = Readonly<{
  code: RealmRendererFailureCode;
  message?: string;
  retryable: boolean;
  phase: RealmRendererLifecycleState;
  attempt?: number;
}>;

export type RealmRendererLifecycle = Readonly<{
  state: RealmRendererLifecycleState;
  attempt: number;
  /** Monotonic scene-generation identifier used to correlate DOM telemetry. */
  generation: number;
  failure?: RealmRendererFailure;
  /** Last classified failure retained while a replacement generation loads. */
  lastFailure?: RealmRendererFailure;
  everReady: boolean;
  degradedQuality?: 'compact' | 'balanced';
}>;

export const REALM_RENDERER_MAX_RECOVERY_ATTEMPTS = 2;
export const REALM_RENDERER_CONTEXT_RESTORE_TIMEOUT_MS = 8_000;
export const REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS = 30_000;
export const REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS = 20_000;
/**
 * A renderer must remain healthy for this long before a prior automatic
 * recovery budget is cleared. A single successful frame is not sufficient:
 * marginal mobile graphics stacks can publish one frame immediately before
 * losing their context again.
 */
export const REALM_RENDERER_STABILITY_WINDOW_MS = 12_000;
/** Absolute browser-session guard even when a mobile WebView stays hidden. */
export const REALM_RENDERER_RECOVERY_WALL_TIMEOUT_MS = 120_000;

export function initialRealmRendererLifecycle(): RealmRendererLifecycle {
  return Object.freeze({ state: 'probing', attempt: 0, generation: 0, everReady: false });
}

export function transitionRealmRendererLifecycle(
  current: RealmRendererLifecycle,
  event:
    | { type: 'probe-start' }
    | { type: 'webgl-unsupported'; failure?: RealmRendererFailure }
    | { type: 'static-fallback'; failure: RealmRendererFailure; generation?: number }
    | { type: 'load-start'; attempt?: number; generation?: number }
    | { type: 'ready'; degradedQuality?: 'compact' | 'balanced'; generation?: number }
    | { type: 'stable'; generation?: number }
    | { type: 'recover'; failure: RealmRendererFailure; attempt?: number; generation?: number }
    | { type: 'failed'; failure: RealmRendererFailure; generation?: number }
): RealmRendererLifecycle {
  switch (event.type) {
    case 'probe-start':
      return Object.freeze({
        ...current,
        state: 'probing',
        failure: undefined,
        lastFailure: undefined
      });
    case 'webgl-unsupported':
      // A renderer that has already presented a frame must never be
      // reclassified as a never-capable device. It enters the explicit
      // post-ready safety view with the failure preserved for player-facing
      // diagnostics instead.
      if (current.everReady) {
        const failure = {
          code: 'renderer-construction-failed' as const,
          retryable: true,
          phase: current.state,
          message: 'WebGL became unavailable after the Realm renderer was ready.'
        };
        return Object.freeze({
          ...current,
          state: 'static-degraded',
          failure,
          lastFailure: failure
        });
      }
      return Object.freeze({
        ...current,
        state: 'static-unsupported',
        failure: event.failure,
        lastFailure: event.failure,
        everReady: false
      });
    case 'static-fallback':
      if (event.generation !== undefined && event.generation !== current.generation) {
        return current;
      }
      return Object.freeze({
        ...current,
        state: 'static-degraded',
        failure: event.failure,
        lastFailure: event.failure
      });
    case 'load-start':
      return Object.freeze({
        ...current,
        state: 'loading',
        attempt: event.attempt ?? current.attempt,
        generation: event.generation ?? current.generation + 1,
        failure: undefined
      });
    case 'ready':
      // Late callbacks from a disposed scene must never publish readiness for
      // a newer scene generation. Omitting generation keeps the reducer
      // convenient for pure callers and legacy integrations.
      if (event.generation !== undefined && event.generation !== current.generation) {
        return current;
      }
      return Object.freeze({
        ...current,
        state: 'ready',
        failure: undefined,
        everReady: true,
        degradedQuality: event.degradedQuality
      });
    case 'stable':
      if (
        current.state !== 'ready'
        || (
          event.generation !== undefined
          && event.generation !== current.generation
        )
      ) {
        return current;
      }
      return Object.freeze({
        ...current,
        attempt: 0
      });
    case 'recover':
      if (event.generation !== undefined && event.generation !== current.generation) {
        return current;
      }
      return Object.freeze({
        ...current,
        state: 'recovering',
        attempt: event.attempt ?? current.attempt + 1,
        failure: event.failure,
        lastFailure: event.failure
      });
    case 'failed':
      if (event.generation !== undefined && event.generation !== current.generation) {
        return current;
      }
      return Object.freeze({
        ...current,
        state: 'failed',
        failure: event.failure,
        lastFailure: event.failure
      });
    default:
      return current;
  }
}

export function classifyRealmRendererFailure(
  error: unknown,
  phase: RealmRendererLifecycleState,
  fallbackCode: RealmRendererFailureCode = 'scene-build-failed'
): RealmRendererFailure {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown renderer failure');
  const normalized = message.toLowerCase();
  let code = fallbackCode;
  if (/integrity|sha-?256|content-addressed|digest/.test(normalized)) code = 'castle-integrity-failed';
  else if (/timeout|timed out|network|fetch|response body/.test(normalized)) {
    code = 'castle-compact-load-failed';
  } else if (/pair|landscape base|landscape-base/.test(normalized)) code = 'castle-pairing-failed';
  else if (/prefab|assembly|no renderable meshes|normalized bounds/.test(normalized)) {
    code = 'castle-prefab-assembly-failed';
  } else if (/webgl|renderer/.test(normalized)) code = 'renderer-construction-failed';
  return Object.freeze({
    code,
    message,
    retryable: ![
      'castle-integrity-failed',
      'castle-pairing-failed',
      'castle-prefab-assembly-failed'
    ].includes(code),
    phase
  });
}

export function shouldRetryRealmRenderer(
  lifecycle: RealmRendererLifecycle,
  failure: RealmRendererFailure
) {
  return failure.retryable
    && lifecycle.attempt < REALM_RENDERER_MAX_RECOVERY_ATTEMPTS;
}
