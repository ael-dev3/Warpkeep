import { describe, expect, it } from 'vitest';

import {
  TITLE_COMPACT_TIMEOUT_MS,
  TITLE_FALLBACK_MINIMUM_MS,
  TITLE_HIGH_TIMEOUT_MS,
  TITLE_REDUCED_MOTION_REVEAL_MS,
  TITLE_REVEAL_MS,
  createTitlePresentationState,
  isTitleStartupPresentationReady,
  titleTransitionProgress,
  transitionTitlePresentation
} from '../src/components/title/titlePresentationMachine';

function compilePrimary(profile: 'high' | 'compact', readyAt: number, reducedMotion = false) {
  let state = createTitlePresentationState(profile, 0, reducedMotion);
  state = transitionTitlePresentation(state, { type: 'model-loaded', requestId: 1 });
  state = transitionTitlePresentation(state, {
    type: 'model-compiled',
    requestId: 1,
    now: readyAt
  });
  return state;
}

describe('title presentation state machine', () => {
  it('exposes readiness only after a real or fallback title has a fully visible frame', () => {
    expect(isTitleStartupPresentationReady('model-loading')).toBe(false);
    expect(isTitleStartupPresentationReady('model-revealing')).toBe(false);
    expect(isTitleStartupPresentationReady('fallback-revealing')).toBe(false);
    expect(isTitleStartupPresentationReady('fallback-failed')).toBe(false);
    expect(isTitleStartupPresentationReady('model-ready')).toBe(true);
    expect(isTitleStartupPresentationReady('fallback-ready')).toBe(true);
  });

  it.each([0, 100, 9_900, 10_001])(
    'reveals an integrity-checked real model ready at %dms without a procedural stage',
    (readyAt) => {
      const state = compilePrimary('compact', readyAt);
      expect(state.phase).toBe('model-revealing');
      expect(state.activeProfile).toBe('compact');
      expect(state.fallbackLocked).toBe(false);
      expect(state.transitionStartedAt).toBe(readyAt);
    }
  );

  it('marks a pending model eligible at ten seconds without creating fallback letters', () => {
    const loading = createTitlePresentationState('compact', 0, false);
    const early = transitionTitlePresentation(loading, {
      type: 'minimum-elapsed',
      now: TITLE_FALLBACK_MINIMUM_MS - 1
    });
    const eligible = transitionTitlePresentation(early, {
      type: 'minimum-elapsed',
      now: TITLE_FALLBACK_MINIMUM_MS
    });
    expect(early).toBe(loading);
    expect(eligible.phase).toBe('model-loading');
    expect(eligible.fallbackEligible).toBe(true);
    expect(eligible.fallbackLocked).toBe(false);
  });

  it('remembers a pre-boundary error and waits until exactly ten seconds', () => {
    const loading = createTitlePresentationState('compact', 0, false);
    const failed = transitionTitlePresentation(loading, {
      type: 'model-failed',
      requestId: 1,
      now: 100,
      reason: 'network failed'
    });
    expect(failed.phase).toBe('model-failed-waiting');
    expect(failed.failure).toBe('network failed');

    const stillWaiting = transitionTitlePresentation(failed, {
      type: 'minimum-elapsed',
      now: 9_999
    });
    const fallback = transitionTitlePresentation(stillWaiting, {
      type: 'minimum-elapsed',
      now: 10_000
    });
    expect(stillWaiting.phase).toBe('model-failed-waiting');
    expect(fallback.phase).toBe('fallback-compiling');
    expect(fallback.fallbackLocked).toBe(true);
  });

  it('starts fallback immediately for a confirmed error after the boundary', () => {
    const eligible = transitionTitlePresentation(
      createTitlePresentationState('high', 0, false),
      { type: 'minimum-elapsed', now: 10_000 }
    );
    const fallback = transitionTitlePresentation(eligible, {
      type: 'model-failed',
      requestId: 1,
      now: 10_001,
      reason: 'parse failed'
    });
    expect(fallback.phase).toBe('fallback-compiling');
    expect(fallback.fallbackLocked).toBe(true);
  });

  it('uses measured, absolute compact and high startup deadlines', () => {
    expect(createTitlePresentationState('compact', 200, false).primaryDeadlineAt)
      .toBe(200 + TITLE_COMPACT_TIMEOUT_MS);
    expect(createTitlePresentationState('high', 200, false).primaryDeadlineAt)
      .toBe(200 + TITLE_HIGH_TIMEOUT_MS);

    const compact = createTitlePresentationState('compact', 0, false);
    const early = transitionTitlePresentation(compact, {
      type: 'primary-timeout',
      now: TITLE_COMPACT_TIMEOUT_MS - 1
    });
    const timedOut = transitionTitlePresentation(early, {
      type: 'primary-timeout',
      now: TITLE_COMPACT_TIMEOUT_MS
    });
    expect(early).toBe(compact);
    expect(timedOut.phase).toBe('fallback-compiling');
    expect(timedOut.failure).toMatch(/deadline/i);
  });

  it('locks fallback for the mount and ignores a late GLB result', () => {
    let state = createTitlePresentationState('compact', 0, false);
    state = transitionTitlePresentation(state, {
      type: 'primary-timeout',
      now: TITLE_COMPACT_TIMEOUT_MS
    });
    state = transitionTitlePresentation(state, { type: 'fallback-compiled', now: 16_100 });
    state = transitionTitlePresentation(state, { type: 'transition-finished' });
    expect(state.phase).toBe('fallback-ready');

    const lateLoad = transitionTitlePresentation(state, { type: 'model-loaded', requestId: 1 });
    const lateCompile = transitionTitlePresentation(lateLoad, {
      type: 'model-compiled',
      requestId: 1,
      now: 20_000
    });
    expect(lateCompile).toBe(state);
  });

  it('keeps startup unready when no fallback renderable can be created', () => {
    let state = createTitlePresentationState('compact', 0, false);
    state = transitionTitlePresentation(state, {
      type: 'primary-timeout',
      now: TITLE_COMPACT_TIMEOUT_MS
    });
    state = transitionTitlePresentation(state, {
      type: 'fallback-create-failed',
      reason: 'fallback construction failed'
    });

    expect(state.phase).toBe('fallback-failed');
    expect(state.failure).toBe('fallback construction failed');
    expect(isTitleStartupPresentationReady(state.phase)).toBe(false);
  });

  it('keeps the current real model while a different quality loads and crossfades', () => {
    let state = compilePrimary('compact', 100);
    state = transitionTitlePresentation(state, { type: 'transition-finished' });
    state = transitionTitlePresentation(state, {
      type: 'quality-requested',
      requestId: 2,
      profile: 'high'
    });
    expect(state.phase).toBe('replacement-loading');
    expect(state.activeProfile).toBe('compact');
    expect(state.candidateProfile).toBe('high');

    state = transitionTitlePresentation(state, { type: 'model-loaded', requestId: 2 });
    state = transitionTitlePresentation(state, {
      type: 'model-compiled',
      requestId: 2,
      now: 500
    });
    expect(state.phase).toBe('replacement-crossfading');
    expect(state.activeProfile).toBe('compact');
    state = transitionTitlePresentation(state, { type: 'transition-finished' });
    expect(state.phase).toBe('model-ready');
    expect(state.activeProfile).toBe('high');
    expect(state.candidateProfile).toBeNull();
  });

  it('does not fetch again for a quality tier that maps to the active profile', () => {
    let state = compilePrimary('compact', 0);
    state = transitionTitlePresentation(state, { type: 'transition-finished' });
    const unchanged = transitionTitlePresentation(state, {
      type: 'quality-requested',
      requestId: 2,
      profile: 'compact'
    });
    expect(unchanged).toBe(state);
  });

  it('does not restart an in-flight primary request for the same model profile', () => {
    const loading = createTitlePresentationState('compact', 0, false);
    const unchanged = transitionTitlePresentation(loading, {
      type: 'quality-requested',
      requestId: 2,
      profile: 'compact'
    });
    expect(unchanged).toBe(loading);
  });

  it('cancels an obsolete replacement when quality returns to the active profile', () => {
    let state = compilePrimary('compact', 0);
    state = transitionTitlePresentation(state, { type: 'transition-finished' });
    state = transitionTitlePresentation(state, {
      type: 'quality-requested',
      requestId: 2,
      profile: 'high'
    });
    state = transitionTitlePresentation(state, { type: 'model-loaded', requestId: 2 });
    state = transitionTitlePresentation(state, {
      type: 'model-compiled',
      requestId: 2,
      now: 200
    });
    expect(state.phase).toBe('replacement-crossfading');

    const reverted = transitionTitlePresentation(state, {
      type: 'quality-requested',
      requestId: 3,
      profile: 'compact'
    });
    expect(reverted.phase).toBe('model-ready');
    expect(reverted.requestId).toBe(3);
    expect(reverted.desiredProfile).toBe('compact');
    expect(reverted.activeProfile).toBe('compact');
    expect(reverted.candidateProfile).toBeNull();
    expect(reverted.transitionStartedAt).toBeNull();

    const staleCompletion = transitionTitlePresentation(reverted, {
      type: 'transition-finished'
    });
    expect(staleCompletion).toBe(reverted);
    expect(staleCompletion.activeProfile).toBe('compact');
  });

  it('retains the current model after replacement failure or replacement timeout', () => {
    let failed = compilePrimary('compact', 0);
    failed = transitionTitlePresentation(failed, { type: 'transition-finished' });
    failed = transitionTitlePresentation(failed, {
      type: 'quality-requested',
      requestId: 2,
      profile: 'high'
    });
    failed = transitionTitlePresentation(failed, {
      type: 'model-failed',
      requestId: 2,
      now: 300,
      reason: 'replacement rejected'
    });
    expect(failed.phase).toBe('model-ready');
    expect(failed.activeProfile).toBe('compact');
    expect(failed.failure).toBe('replacement rejected');

    let timedOut = transitionTitlePresentation(failed, {
      type: 'quality-requested',
      requestId: 3,
      profile: 'high'
    });
    timedOut = transitionTitlePresentation(timedOut, {
      type: 'replacement-timeout',
      requestId: 3,
      reason: 'replacement deadline'
    });
    expect(timedOut.phase).toBe('model-ready');
    expect(timedOut.activeProfile).toBe('compact');
    expect(timedOut.failure).toBe('replacement deadline');
  });

  it('uses bounded opacity-only timing for reduced motion', () => {
    const normal = compilePrimary('compact', 1_000, false);
    const reduced = compilePrimary('compact', 1_000, true);
    expect(titleTransitionProgress(normal, 1_000 + TITLE_REVEAL_MS / 2)).toBe(0.5);
    expect(titleTransitionProgress(reduced, 1_000 + TITLE_REDUCED_MOTION_REVEAL_MS / 2)).toBe(0.5);
    expect(titleTransitionProgress(reduced, 1_000 + TITLE_REDUCED_MOTION_REVEAL_MS)).toBe(1);
  });

  it('preserves reveal progress when reduced-motion preference changes mid-transition', () => {
    const reduced = compilePrimary('compact', 1_000, true);
    const halfway = 1_000 + TITLE_REDUCED_MOTION_REVEAL_MS / 2;
    expect(titleTransitionProgress(reduced, halfway)).toBe(0.5);

    const normal = transitionTitlePresentation(reduced, {
      type: 'reduced-motion-changed',
      reducedMotion: false,
      now: halfway
    });
    expect(titleTransitionProgress(normal, halfway)).toBe(0.5);
    expect(titleTransitionProgress(normal, halfway + 80)).toBeGreaterThan(0.5);

    const reducedAgain = transitionTitlePresentation(normal, {
      type: 'reduced-motion-changed',
      reducedMotion: true,
      now: halfway + 80
    });
    expect(titleTransitionProgress(reducedAgain, halfway + 80))
      .toBeCloseTo(titleTransitionProgress(normal, halfway + 80), 8);
  });

  it('is terminal after disposal and ignores strict-mode-style late work', () => {
    const loading = createTitlePresentationState('high', 0, false);
    const disposed = transitionTitlePresentation(loading, { type: 'dispose' });
    expect(disposed.phase).toBe('disposed');
    expect(transitionTitlePresentation(disposed, { type: 'model-loaded', requestId: 1 }))
      .toBe(disposed);
    expect(transitionTitlePresentation(disposed, {
      type: 'primary-timeout',
      now: TITLE_HIGH_TIMEOUT_MS
    })).toBe(disposed);
  });
});
