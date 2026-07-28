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

const menuRequest = (
  x = 640,
  y = 248,
  acceptedAt = 100
): Extract<WarpkeepExperienceAction, { type: 'request-menu' }> => ({
  type: 'request-menu',
  input: 'pointer',
  gatewayClientOrigin: { space: 'client', x, y },
  acceptedAt
});

const titleRequest = (
  x = 641,
  y = 249,
  acceptedAt = 200
): Extract<WarpkeepExperienceAction, { type: 'request-title' }> => ({
  type: 'request-title',
  input: 'history',
  gatewayClientOrigin: { space: 'client', x, y },
  acceptedAt
});

function reduce(
  state: WarpkeepExperienceState,
  ...actions: WarpkeepExperienceAction[]
): WarpkeepExperienceState {
  return actions.reduce(experienceTransitionReducer, state);
}

describe('Warpkeep experience transitions', () => {
  it('starts at the title and can explicitly initialize a direct menu visit', () => {
    expect(createExperienceState()).toEqual({
      phase: 'title',
      transitionSequence: 0,
      transitionRequest: null
    });
    expect(createExperienceState('menu')).toEqual({
      phase: 'menu',
      transitionSequence: 0,
      transitionRequest: null
    });
  });

  it('accepts one immutable request atomically and clears it only on completion', () => {
    const initial = createExperienceState();
    const action = menuRequest();
    const entering = experienceTransitionReducer(initial, action);

    expect(entering).toEqual({
      phase: 'transitioning-to-menu',
      transitionSequence: 1,
      transitionRequest: {
        sequence: 1,
        direction: 'to-menu',
        input: 'pointer',
        gatewayClientOrigin: { space: 'client', x: 640, y: 248 },
        acceptedAt: 100
      }
    });
    expect(entering.transitionRequest).not.toBe(action);
    expect(entering.transitionRequest?.gatewayClientOrigin)
      .not.toBe(action.gatewayClientOrigin);
    expect(Object.isFrozen(entering.transitionRequest)).toBe(true);
    expect(Object.isFrozen(entering.transitionRequest?.gatewayClientOrigin)).toBe(true);
    expect(experienceTransitionReducer(entering, menuRequest(100, 200, 300)))
      .toBe(entering);

    const menu = experienceTransitionReducer(entering, { type: 'complete-menu' });
    expect(menu).toEqual({
      phase: 'menu',
      transitionSequence: 1,
      transitionRequest: null
    });

    const returning = experienceTransitionReducer(menu, titleRequest());
    expect(returning).toEqual({
      phase: 'transitioning-to-title',
      transitionSequence: 2,
      transitionRequest: {
        sequence: 2,
        direction: 'to-title',
        input: 'history',
        gatewayClientOrigin: { space: 'client', x: 641, y: 249 },
        acceptedAt: 200
      }
    });
    expect(experienceTransitionReducer(returning, titleRequest(10, 20, 300)))
      .toBe(returning);

    expect(experienceTransitionReducer(returning, { type: 'complete-title' })).toEqual({
      phase: 'title',
      transitionSequence: 2,
      transitionRequest: null
    });
  });

  it('rejects invalid request coordinates and timestamps without advancing state', () => {
    const title = createExperienceState();
    expect(experienceTransitionReducer(title, {
      ...menuRequest(),
      gatewayClientOrigin: { space: 'client', x: Number.NaN, y: 248 }
    })).toBe(title);
    expect(experienceTransitionReducer(title, {
      ...menuRequest(),
      acceptedAt: -1
    })).toBe(title);
  });

  it('supports a stable realm phase without confusing it with the title-to-menu transition', () => {
    const menu = createExperienceState('menu');
    const realm = experienceTransitionReducer(menu, { type: 'request-realm' });

    expect(realm).toEqual({
      phase: 'realm',
      transitionSequence: 1,
      transitionRequest: null
    });
    expect(experienceTransitionReducer(realm, titleRequest())).toBe(realm);
    expect(experienceTransitionReducer(realm, { type: 'return-menu' })).toEqual({
      phase: 'menu',
      transitionSequence: 1,
      transitionRequest: null
    });
  });

  it('ignores impossible and stale transitions without corrupting state', () => {
    const title = createExperienceState();
    expect(experienceTransitionReducer(title, { type: 'complete-menu' })).toBe(title);
    expect(experienceTransitionReducer(title, titleRequest())).toBe(title);
    expect(experienceTransitionReducer(title, { type: 'complete-title' })).toBe(title);

    const menu = createExperienceState('menu');
    expect(experienceTransitionReducer(menu, { type: 'complete-menu' })).toBe(menu);
    expect(experienceTransitionReducer(menu, menuRequest())).toBe(menu);
    expect(experienceTransitionReducer(menu, { type: 'complete-title' })).toBe(menu);

    const completedCycle = reduce(
      title,
      menuRequest(),
      { type: 'complete-menu' },
      titleRequest(),
      { type: 'complete-title' }
    );
    expect(completedCycle.phase).toBe('title');
    expect(completedCycle.transitionSequence).toBe(2);
    expect(completedCycle.transitionRequest).toBeNull();
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
