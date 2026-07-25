import type { RealmQuality } from '../components/realm/realmQuality';

export const RENDERED_WEBGL_QA_FIXTURE_ID = 'synthetic-canonical-100' as const;
export const RENDERED_WEBGL_QA_CASTLE_COUNT = 100;
export const RENDERED_WEBGL_QA_DEFAULT_QUALITY: RealmQuality = 'balanced';
export const RENDERED_WEBGL_QA_DEFAULT_PRESENTATION_MODE = 'observer' as const;
export const RENDERED_WEBGL_QA_DEFAULT_FIXTURE_VARIANT = 'baseline' as const;
export const RENDERED_WEBGL_QA_ACTIVE_WORKER_FIXTURE_MARKER =
  'warpkeep-local-active-worker-fixture-v1' as const;
export const RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS = 120_000;
/**
 * React may replace the map subtree during a responsive layout commit. Keep
 * the last accepted renderer result through that one bounded transition, but
 * still fail closed when the map does not return.
 */
export const RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS = 250;

export type RenderedWebglQaOptions = Readonly<{
  presentationMode: RenderedWebglQaPresentationMode;
  quality: RealmQuality;
}>;

export type RenderedWebglQaPresentationMode = 'observer' | 'player';
export type RenderedWebglQaFixtureVariant =
  | 'baseline'
  | 'occupancy-stress'
  | 'worker-active';

export type RenderedWebglQaRenderer = 'loading' | 'webgl' | 'fallback' | 'closed' | 'error';

export type RenderedWebglQaStatus = 'loading' | 'ready' | 'fallback' | 'closed' | 'error';

const RENDERED_WEBGL_QA_QUALITIES = new Set<RealmQuality>(['high', 'balanced', 'reduced']);
const RENDERED_WEBGL_QA_PRESENTATION_MODES = new Set<RenderedWebglQaPresentationMode>([
  'observer',
  'player'
]);
const RENDERED_WEBGL_QA_FIXTURE_VARIANTS = new Set<RenderedWebglQaFixtureVariant>([
  'baseline',
  'occupancy-stress',
  'worker-active'
]);

function isRealmQuality(value: string | null): value is RealmQuality {
  return value !== null && RENDERED_WEBGL_QA_QUALITIES.has(value as RealmQuality);
}

function isRenderedWebglQaPresentationMode(
  value: string | null
): value is RenderedWebglQaPresentationMode {
  return value !== null
    && RENDERED_WEBGL_QA_PRESENTATION_MODES.has(value as RenderedWebglQaPresentationMode);
}

function isRenderedWebglQaFixtureVariant(
  value: string | null
): value is RenderedWebglQaFixtureVariant {
  return value !== null
    && RENDERED_WEBGL_QA_FIXTURE_VARIANTS.has(value as RenderedWebglQaFixtureVariant);
}

function readRenderedWebglQaRequest(search: string) {
  const entries = [...new URLSearchParams(search).entries()];
  const keys = entries.map(([key]) => key);
  const acceptedShape = entries.length <= 3
    && new Set(keys).size === keys.length
    && keys.every((key) => key === 'quality' || key === 'mode' || key === 'fixture');
  const requestedQuality = acceptedShape
    ? entries.find(([key]) => key === 'quality')?.[1] ?? null
    : null;
  const requestedPresentationMode = acceptedShape
    ? entries.find(([key]) => key === 'mode')?.[1] ?? null
    : null;
  const requestedFixtureVariant = acceptedShape
    ? entries.find(([key]) => key === 'fixture')?.[1] ?? null
    : null;
  const qualityValid = requestedQuality === null || isRealmQuality(requestedQuality);
  const presentationModeValid = requestedPresentationMode === null
    || isRenderedWebglQaPresentationMode(requestedPresentationMode);
  const fixtureVariantValid = requestedFixtureVariant === null
    || isRenderedWebglQaFixtureVariant(requestedFixtureVariant);
  return Object.freeze({
    accepted: acceptedShape
      && qualityValid
      && presentationModeValid
      && fixtureVariantValid,
    requestedFixtureVariant,
    requestedPresentationMode,
    requestedQuality
  });
}

/**
 * The standalone development page accepts only reviewed quality, presentation,
 * and fixture values. Duplicate or unknown query strings cannot select a
 * route, host, identity, asset, or authority; they fall back to the balanced
 * read-only baseline fixture.
 */
export function readRenderedWebglQaOptions(search: string): RenderedWebglQaOptions {
  const {
    accepted,
    requestedPresentationMode,
    requestedQuality
  } = readRenderedWebglQaRequest(search);
  return Object.freeze({
    presentationMode: accepted && requestedPresentationMode !== null
      ? requestedPresentationMode as RenderedWebglQaPresentationMode
      : RENDERED_WEBGL_QA_DEFAULT_PRESENTATION_MODE,
    quality: accepted && requestedQuality !== null
      ? requestedQuality as RealmQuality
      : RENDERED_WEBGL_QA_DEFAULT_QUALITY
  });
}

export function readRenderedWebglQaFixtureVariant(
  search: string
): RenderedWebglQaFixtureVariant {
  const {
    accepted,
    requestedFixtureVariant
  } = readRenderedWebglQaRequest(search);
  return accepted && requestedFixtureVariant !== null
    ? requestedFixtureVariant as RenderedWebglQaFixtureVariant
    : RENDERED_WEBGL_QA_DEFAULT_FIXTURE_VARIANT;
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
