export type WarpkeepExperiencePhase =
  | 'title'
  | 'transitioning-to-menu'
  | 'menu'
  | 'realm'
  | 'transitioning-to-title';

export type WarpkeepExperienceAction =
  | { type: 'request-menu' }
  | { type: 'complete-menu' }
  | { type: 'request-realm' }
  | { type: 'return-menu' }
  | { type: 'request-title' }
  | { type: 'complete-title' };

export type WarpkeepStableExperiencePhase = Extract<WarpkeepExperiencePhase, 'title' | 'menu' | 'realm'>;

export type WarpTransitionDirection = 'to-menu' | 'to-title';

export type WarpTransitionMotion = 'standard' | 'reduced';

export type WarpkeepExperienceState = {
  phase: WarpkeepExperiencePhase;
  /**
   * Advances only when a new transition is accepted. It is suitable for a
   * React `key` when a CSS transition needs to restart from its first frame.
   */
  transitionSequence: number;
};

export type WarpTransitionTiming = Readonly<{
  totalMs: number;
  coverAtMs: number;
  intakeEndMs: number;
  focusEndMs: number;
}>;

export const STANDARD_WARP_TRANSITION_TIMING: WarpTransitionTiming = Object.freeze({
  totalMs: 2_000,
  coverAtMs: 1_240,
  intakeEndMs: 250,
  focusEndMs: 700
});

export const REDUCED_WARP_TRANSITION_TIMING: WarpTransitionTiming = Object.freeze({
  totalMs: 240,
  coverAtMs: 120,
  intakeEndMs: 60,
  focusEndMs: 120
});

export function createExperienceState(
  phase: WarpkeepStableExperiencePhase = 'title'
): WarpkeepExperienceState {
  return { phase, transitionSequence: 0 };
}

/**
 * Pure experience state machine. Returning the existing object for ignored
 * actions makes repeated input cheap and lets callers distinguish an accepted
 * transition without maintaining a second lock.
 */
export function experienceTransitionReducer(
  state: WarpkeepExperienceState,
  action: WarpkeepExperienceAction
): WarpkeepExperienceState {
  switch (action.type) {
    case 'request-menu':
      if (state.phase !== 'title') return state;
      return {
        phase: 'transitioning-to-menu',
        transitionSequence: state.transitionSequence + 1
      };

    case 'complete-menu':
      if (state.phase !== 'transitioning-to-menu') return state;
      return { ...state, phase: 'menu' };

    case 'request-realm':
      if (state.phase !== 'menu') return state;
      return {
        phase: 'realm',
        transitionSequence: state.transitionSequence + 1
      };

    case 'return-menu':
      if (state.phase !== 'realm') return state;
      return { ...state, phase: 'menu' };

    case 'request-title':
      if (state.phase !== 'menu') return state;
      return {
        phase: 'transitioning-to-title',
        transitionSequence: state.transitionSequence + 1
      };

    case 'complete-title':
      if (state.phase !== 'transitioning-to-title') return state;
      return { ...state, phase: 'title' };
  }
}

export function isExperienceTransitioning(phase: WarpkeepExperiencePhase): boolean {
  return phase === 'transitioning-to-menu' || phase === 'transitioning-to-title';
}

export function getWarpTransitionDirection(
  phase: WarpkeepExperiencePhase
): WarpTransitionDirection | null {
  if (phase === 'transitioning-to-menu') return 'to-menu';
  if (phase === 'transitioning-to-title') return 'to-title';
  return null;
}

export function getWarpTransitionTiming(
  reducedMotion: boolean | WarpTransitionMotion
): WarpTransitionTiming {
  return reducedMotion === true || reducedMotion === 'reduced'
    ? REDUCED_WARP_TRANSITION_TIMING
    : STANDARD_WARP_TRANSITION_TIMING;
}

export function clampTransitionProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

/**
 * Quintic smootherstep: a restrained initial pull, accelerating passage, and
 * a zero-velocity arrival. This is useful for imperative camera/group motion;
 * the DOM veil itself stays CSS-driven.
 */
export function easeGravitationalTransition(progress: number): number {
  const t = clampTransitionProgress(progress);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
