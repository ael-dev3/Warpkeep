import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';
import { INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS } from './innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
} from './innerKeepPresentationLayoutPolicy';

/**
 * Presentation-only visual overscan around the detailed Inner Keep estate.
 *
 * The inner rectangle remains the only terrain used for placements, routes,
 * picking, and gameplay-adjacent clearances. This larger countryside exists
 * solely to keep a fog-softened landscape behind every supported camera pose.
 */
export const INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION =
  'inner-keep-far-countryside-presentation-v2-expanded-town';

export const INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS =
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;

export const INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS = Object.freeze([
  208,
  272,
] as const);

export const INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS = 20;
export const INNER_KEEP_FAR_COUNTRYSIDE_INNER_HEIGHT_BLEND_METERS = 24;
export const INNER_KEEP_FAR_COUNTRYSIDE_TINT_BLEND_METERS = 32;
export const INNER_KEEP_FAR_COUNTRYSIDE_MINIMUM_CAMERA_BUFFER_METERS = 16;

export const INNER_KEEP_FAR_COUNTRYSIDE_RADIAL_SEGMENTS = Object.freeze({
  high: 10,
  balanced: 8,
  reduced: 5,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

export const INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS = Object.freeze({
  high: 320,
  balanced: 192,
  reduced: 96,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

export const INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS = Object.freeze({
  high: 32,
  balanced: 20,
  reduced: 10,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

export const INNER_KEEP_FAR_COUNTRYSIDE_FIELD_PALETTE = Object.freeze([
  0x8ca566,
  0xa7b674,
  0xaa9c62,
  0x789256,
] as const);

/**
 * A deliberately strict renderer-only subset of the digest-bound camera
 * contract. It limits exploration without changing canonical camera maxima.
 */
export const INNER_KEEP_FAR_COUNTRYSIDE_CAMERA = Object.freeze({
  sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  panBoundsMeters: Object.freeze({
    x: Object.freeze([-9, 9] as const),
    z: Object.freeze([-9, 9] as const),
  }),
  panScreenTrackingRatio: 0.2,
  initialZoom: Object.freeze({ landscape: 1, portrait: 1 }),
  portrait: Object.freeze({
    positionMeters: INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.positionMeters,
    targetMeters: INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.targetMeters,
  }),
});

export function innerKeepFarCountrysideMinimumZoomForAspect(aspect: number) {
  const safeAspect = Number.isFinite(aspect) ? Math.max(0.2, aspect) : 1;
  const required = safeAspect
    < INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.maximumAspectExclusive
    ? Math.max(0.8, 0.36 / safeAspect)
    : Math.max(0.8, 0.9 / safeAspect, 0.4 * safeAspect);
  return Math.max(
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.minimum,
    Math.min(INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.maximum, required),
  );
}

export const INNER_KEEP_FAR_COUNTRYSIDE_AUTHORITY = Object.freeze({
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
  pickable: false,
  changesCanonicalLayoutDigest: false,
  sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  authoritativeTerrain: false,
  authoritativeResourceNodes: 0,
});

const INNER_KEEP_FAR_COUNTRYSIDE_DIGEST_PAYLOAD = Object.freeze({
  policyVersion: INNER_KEEP_FAR_COUNTRYSIDE_POLICY_VERSION,
  sourcePresentationLayoutDigest: INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
  innerHalfExtentsMeters: INNER_KEEP_FAR_COUNTRYSIDE_INNER_HALF_EXTENTS_METERS,
  halfExtentsMeters: INNER_KEEP_FAR_COUNTRYSIDE_HALF_EXTENTS_METERS,
  edgeFadeMeters: INNER_KEEP_FAR_COUNTRYSIDE_EDGE_FADE_METERS,
  innerHeightBlendMeters: INNER_KEEP_FAR_COUNTRYSIDE_INNER_HEIGHT_BLEND_METERS,
  tintBlendMeters: INNER_KEEP_FAR_COUNTRYSIDE_TINT_BLEND_METERS,
  minimumCameraBufferMeters: INNER_KEEP_FAR_COUNTRYSIDE_MINIMUM_CAMERA_BUFFER_METERS,
  radialSegments: INNER_KEEP_FAR_COUNTRYSIDE_RADIAL_SEGMENTS,
  fieldTuftBudgets: INNER_KEEP_FAR_COUNTRYSIDE_FIELD_TUFT_BUDGETS,
  hedgerowTreeBudgets: INNER_KEEP_FAR_COUNTRYSIDE_HEDGEROW_TREE_BUDGETS,
  fieldPalette: INNER_KEEP_FAR_COUNTRYSIDE_FIELD_PALETTE,
  camera: INNER_KEEP_FAR_COUNTRYSIDE_CAMERA,
  authority: INNER_KEEP_FAR_COUNTRYSIDE_AUTHORITY,
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

/** Stable source for the independently reviewed presentation-only digest. */
export function canonicalInnerKeepFarCountrysideDigestInput() {
  return JSON.stringify(canonicalize(INNER_KEEP_FAR_COUNTRYSIDE_DIGEST_PAYLOAD));
}

// SHA-256 of canonicalInnerKeepFarCountrysideDigestInput().
export const INNER_KEEP_FAR_COUNTRYSIDE_POLICY_DIGEST =
  '20e1a2f00edbaee520aa96f67d651721da6786e29c19d555fa7bfda161e9eacc';
