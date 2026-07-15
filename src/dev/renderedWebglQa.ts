import type { RealmQuality } from '../components/realm/realmQuality';

export const RENDERED_WEBGL_QA_FIXTURE_ID = 'synthetic-canonical-100' as const;
export const RENDERED_WEBGL_QA_CASTLE_COUNT = 100;
export const RENDERED_WEBGL_QA_DEFAULT_QUALITY: RealmQuality = 'balanced';
export const RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS = 120_000;
/**
 * React may replace the map subtree during a responsive layout commit. Keep
 * the last accepted renderer result through that one bounded transition, but
 * still fail closed when the map does not return.
 */
export const RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS = 250;

export type RenderedWebglQaOptions = Readonly<{
  quality: RealmQuality;
}>;

export type RenderedWebglQaRenderer = 'loading' | 'webgl' | 'fallback' | 'closed' | 'error';

export type RenderedWebglQaStatus = 'loading' | 'ready' | 'fallback' | 'closed' | 'error';

const RENDERED_WEBGL_QA_QUALITIES = new Set<RealmQuality>(['high', 'balanced', 'reduced']);

function isRealmQuality(value: string | null): value is RealmQuality {
  return value !== null && RENDERED_WEBGL_QA_QUALITIES.has(value as RealmQuality);
}

/**
 * The standalone development page accepts one intentionally small presentation
 * option. Duplicate or unknown query strings cannot select a route, host,
 * identity, asset, or authority; they fall back to the reviewed balanced
 * fixture.
 */
export function readRenderedWebglQaOptions(search: string): RenderedWebglQaOptions {
  const entries = [...new URLSearchParams(search).entries()];
  const requestedQuality = entries.length === 1 && entries[0]?.[0] === 'quality'
    ? entries[0][1]
    : null;
  return Object.freeze({
    quality: isRealmQuality(requestedQuality)
      ? requestedQuality
      : RENDERED_WEBGL_QA_DEFAULT_QUALITY
  });
}

export function renderedWebglQaStatusForRenderer(
  renderer: RenderedWebglQaRenderer
): RenderedWebglQaStatus {
  if (renderer === 'webgl') return 'ready';
  return renderer;
}

/**
 * A WebGL marker is accepted only when it arrived inside the bounded local
 * readiness window. Invalid clocks and excessively slow starts fail closed.
 */
export function renderedWebglQaRendererForReadyTiming(
  renderer: RenderedWebglQaRenderer,
  readyAfterMilliseconds: number | undefined
): RenderedWebglQaRenderer {
  return renderer === 'webgl' && readyAfterMilliseconds === undefined
    ? 'error'
    : renderer;
}

/**
 * The overlay exposes only a bounded local duration. It is not retained by the
 * page, written to storage, or associated with an identity or machine key.
 */
export function boundedRenderedWebglQaReadyMilliseconds(startedAt: number, now: number) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return undefined;
  const elapsed = Math.round(now - startedAt);
  return elapsed >= 0 && elapsed <= RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS
    ? elapsed
    : undefined;
}
