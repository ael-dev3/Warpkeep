export type RealmPinchZoomProfile = 'standard' | 'miniapp';

const STANDARD_PINCH_ZOOM_SENSITIVITY = 0.78;
const MINI_APP_PINCH_ZOOM_SENSITIVITY = 0.46;
const MINI_APP_PINCH_ZOOM_SOFT_LIMIT = 0.12;

export function realmPinchZoomProfileForChromeMode(
  chromeMode: string | undefined
): RealmPinchZoomProfile {
  return chromeMode === 'miniapp' ? 'miniapp' : 'standard';
}

/**
 * Converts one incremental pinch scale into the camera's normalized zoom.
 * Standard browser input retains the established response exactly. Mini App
 * WebViews receive a gentler curve and smoothly compress unusually large
 * pointer batches instead of turning them into abrupt camera jumps.
 */
export function realmPinchZoomAmount(
  scaleRatio: number,
  profile: RealmPinchZoomProfile
) {
  if (!Number.isFinite(scaleRatio) || scaleRatio <= 0) return 0;
  const logarithmicDelta = Math.log(scaleRatio);
  if (profile === 'standard') {
    return logarithmicDelta * STANDARD_PINCH_ZOOM_SENSITIVITY;
  }
  const scaledDelta = logarithmicDelta * MINI_APP_PINCH_ZOOM_SENSITIVITY;
  return Math.tanh(scaledDelta / MINI_APP_PINCH_ZOOM_SOFT_LIMIT)
    * MINI_APP_PINCH_ZOOM_SOFT_LIMIT;
}
