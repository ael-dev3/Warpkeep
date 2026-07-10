import { describe, expect, it } from 'vitest';
import {
  REDUCED_WARP_TRANSITION_TIMING,
  STANDARD_WARP_TRANSITION_TIMING,
  clampTransitionProgress,
  createExperienceState,
  easeGravitationalTransition,
  experienceTransitionReducer,
  getWarpTransitionDirection,
  getWarpTransitionTiming,
  isExperienceTransitioning,
  type WarpkeepExperienceAction,
  type WarpkeepExperienceState
} from '../src/components/transition/experienceTransition';

function reduce(
  state: WarpkeepExperienceState,
  ...actions: WarpkeepExperienceAction[]
): WarpkeepExperienceState {
  return actions.reduce(experienceTransitionReducer, state);
}

describe('Warpkeep experience transitions', () => {
  it('starts at the title and can explicitly initialize a direct menu visit', () => {
    expect(createExperienceState()).toEqual({ phase: 'title', transitionSequence: 0 });
    expect(createExperienceState('menu')).toEqual({ phase: 'menu', transitionSequence: 0 });
  });

  it('accepts each request once and requires an explicit completion', () => {
    const initial = createExperienceState();
    const entering = experienceTransitionReducer(initial, { type: 'request-menu' });

    expect(entering).toEqual({ phase: 'transitioning-to-menu', transitionSequence: 1 });
    expect(experienceTransitionReducer(entering, { type: 'request-menu' })).toBe(entering);

    const menu = experienceTransitionReducer(entering, { type: 'complete-menu' });
    expect(menu).toEqual({ phase: 'menu', transitionSequence: 1 });

    const returning = experienceTransitionReducer(menu, { type: 'request-title' });
    expect(returning).toEqual({ phase: 'transitioning-to-title', transitionSequence: 2 });
    expect(experienceTransitionReducer(returning, { type: 'request-title' })).toBe(returning);

    expect(experienceTransitionReducer(returning, { type: 'complete-title' })).toEqual({
      phase: 'title',
      transitionSequence: 2
    });
  });

  it('ignores impossible and stale transitions without corrupting state', () => {
    const title = createExperienceState();
    expect(experienceTransitionReducer(title, { type: 'complete-menu' })).toBe(title);
    expect(experienceTransitionReducer(title, { type: 'request-title' })).toBe(title);
    expect(experienceTransitionReducer(title, { type: 'complete-title' })).toBe(title);

    const menu = createExperienceState('menu');
    expect(experienceTransitionReducer(menu, { type: 'complete-menu' })).toBe(menu);
    expect(experienceTransitionReducer(menu, { type: 'request-menu' })).toBe(menu);
    expect(experienceTransitionReducer(menu, { type: 'complete-title' })).toBe(menu);

    const completedCycle = reduce(
      title,
      { type: 'request-menu' },
      { type: 'complete-menu' },
      { type: 'request-title' },
      { type: 'complete-title' }
    );
    expect(completedCycle.phase).toBe('title');
    expect(completedCycle.transitionSequence).toBe(2);
  });

  it('maps only active transition phases to visual directions', () => {
    expect(getWarpTransitionDirection('title')).toBeNull();
    expect(getWarpTransitionDirection('menu')).toBeNull();
    expect(getWarpTransitionDirection('transitioning-to-menu')).toBe('to-menu');
    expect(getWarpTransitionDirection('transitioning-to-title')).toBe('to-title');
    expect(isExperienceTransitioning('transitioning-to-menu')).toBe(true);
    expect(isExperienceTransitioning('transitioning-to-title')).toBe(true);
    expect(isExperienceTransitioning('title')).toBe(false);
  });
});

describe('Warpkeep transition timing and easing', () => {
  it('keeps the standard passage cinematic and the reduced path brief', () => {
    expect(STANDARD_WARP_TRANSITION_TIMING.totalMs).toBeGreaterThanOrEqual(1_700);
    expect(STANDARD_WARP_TRANSITION_TIMING.totalMs).toBeLessThanOrEqual(2_200);
    expect(STANDARD_WARP_TRANSITION_TIMING.coverAtMs).toBeLessThan(
      STANDARD_WARP_TRANSITION_TIMING.totalMs
    );
    expect(REDUCED_WARP_TRANSITION_TIMING.totalMs).toBeGreaterThanOrEqual(180);
    expect(REDUCED_WARP_TRANSITION_TIMING.totalMs).toBeLessThanOrEqual(300);
    expect(getWarpTransitionTiming(false)).toBe(STANDARD_WARP_TRANSITION_TIMING);
    expect(getWarpTransitionTiming('standard')).toBe(STANDARD_WARP_TRANSITION_TIMING);
    expect(getWarpTransitionTiming(true)).toBe(REDUCED_WARP_TRANSITION_TIMING);
    expect(getWarpTransitionTiming('reduced')).toBe(REDUCED_WARP_TRANSITION_TIMING);
  });

  it('clamps progress and provides a monotonic eased camera curve', () => {
    expect(clampTransitionProgress(-1)).toBe(0);
    expect(clampTransitionProgress(Number.NaN)).toBe(0);
    expect(clampTransitionProgress(2)).toBe(1);
    expect(easeGravitationalTransition(0)).toBe(0);
    expect(easeGravitationalTransition(1)).toBe(1);

    const samples = Array.from({ length: 21 }, (_, index) =>
      easeGravitationalTransition(index / 20)
    );
    samples.slice(1).forEach((sample, index) => {
      expect(sample).toBeGreaterThanOrEqual(samples[index]);
    });
    expect(samples[2]).toBeLessThan(0.02);
    expect(samples[18]).toBeGreaterThan(0.98);
  });
});
