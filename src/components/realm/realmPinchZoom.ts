export type RealmPinchZoomProfile = 'standard' | 'miniapp';

const STANDARD_PINCH_ZOOM_SENSITIVITY = 0.78;
const MINI_APP_PINCH_ZOOM_SENSITIVITY = 0.46;
const MINI_APP_PINCH_ZOOM_SOFTNESS = 0.12;

export type RealmPinchZoomSample = Readonly<{
  reset: boolean;
  /** Multiplicative distance change since the previous pointer sample. */
  scaleRatio: number;
  /** Multiplicative distance change since the gesture began. */
  scaleFromStart: number;
}>;

export type RealmPinchZoomGesture = Readonly<{
  amount: (
    sample: RealmPinchZoomSample,
    profile: RealmPinchZoomProfile
  ) => number;
  reset: () => void;
}>;

export function realmPinchZoomProfileForChromeMode(
  chromeMode: string | undefined
): RealmPinchZoomProfile {
  return chromeMode === 'miniapp' ? 'miniapp' : 'standard';
}

/**
 * Converts a pinch scale into the camera's normalized zoom.
 * Standard browser input retains the established response exactly. Mini App
 * WebViews receive a gentler curve that smoothly compresses unusually large
 * changes without imposing a hard limit on a deliberate long gesture.
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
  return Math.asinh(scaledDelta / MINI_APP_PINCH_ZOOM_SOFTNESS)
    * MINI_APP_PINCH_ZOOM_SOFTNESS;
}

/**
 * Makes Mini App zoom independent of WebView pointer-event cadence. Mini App
 * samples describe the total gesture and this adapter applies only the change
 * since the previous total. Standard browsers continue to consume the exact
 * established incremental ratio.
 */
export function createRealmPinchZoomGesture(): RealmPinchZoomGesture {
  let previousProfile: RealmPinchZoomProfile | null = null;
  let previousMiniAppTotal = 0;

  const reset = () => {
    previousProfile = null;
    previousMiniAppTotal = 0;
  };

  const amount = (
    sample: RealmPinchZoomSample,
    profile: RealmPinchZoomProfile
  ) => {
    if (sample.reset) {
      reset();
      return 0;
    }
    if (profile === 'standard') {
      previousProfile = profile;
      previousMiniAppTotal = 0;
      return realmPinchZoomAmount(sample.scaleRatio, profile);
    }
    if (!Number.isFinite(sample.scaleFromStart) || sample.scaleFromStart <= 0) {
      return 0;
    }

    const total = realmPinchZoomAmount(sample.scaleFromStart, profile);
    const delta = previousProfile === profile
      ? total - previousMiniAppTotal
      : previousProfile === null
        ? total
        : realmPinchZoomAmount(sample.scaleRatio, profile);
    previousProfile = profile;
    previousMiniAppTotal = total;
    return Number.isFinite(delta) ? delta : 0;
  };

  return Object.freeze({ amount, reset });
}
