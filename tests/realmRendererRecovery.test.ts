import { describe, expect, it } from 'vitest';

import {
  classifyRealmRendererFailure,
  initialRealmRendererLifecycle,
  REALM_RENDERER_MAX_RECOVERY_ATTEMPTS,
  shouldRetryRealmRenderer,
  transitionRealmRendererLifecycle
} from '../src/components/realm/realmRendererRecovery';

describe('Realm renderer recovery lifecycle', () => {
  it('keeps no-WebGL devices in the explicit static mode', () => {
    const initial = initialRealmRendererLifecycle();
    const state = transitionRealmRendererLifecycle(initial, {
      type: 'webgl-unsupported',
      failure: {
        code: 'webgl-unavailable',
        retryable: false,
        phase: 'probing'
      }
    });
    expect(state.state).toBe('static-unsupported');
    expect(state.everReady).toBe(false);
  });

  it('clears a recovery attempt only after the ready generation proves stable', () => {
    const ready = transitionRealmRendererLifecycle(initialRealmRendererLifecycle(), {
      type: 'ready'
    });
    const recovering = transitionRealmRendererLifecycle(ready, {
      type: 'recover',
      attempt: 1,
      failure: { code: 'context-lost', retryable: true, phase: 'ready' }
    });
    expect(recovering.state).toBe('recovering');
    expect(recovering.everReady).toBe(true);
    const restored = transitionRealmRendererLifecycle(recovering, { type: 'ready' });
    expect(restored.state).toBe('ready');
    expect(restored.attempt).toBe(1);
    const stable = transitionRealmRendererLifecycle(restored, { type: 'stable' });
    expect(stable.state).toBe('ready');
    expect(stable.attempt).toBe(0);
  });

  it('moves a previously-ready renderer into the explicit degraded static mode', () => {
    const ready = transitionRealmRendererLifecycle(initialRealmRendererLifecycle(), {
      type: 'ready'
    });
    const state = transitionRealmRendererLifecycle(ready, {
      type: 'webgl-unsupported',
      failure: {
        code: 'webgl-unavailable',
        retryable: false,
        phase: 'probing'
      }
    });
    expect(state.state).toBe('static-degraded');
    expect(state.state).not.toBe('static-unsupported');
    expect(state.everReady).toBe(true);
    expect(state.failure?.code).toBe('renderer-construction-failed');
    expect(state.lastFailure).toBe(state.failure);
  });

  it('preserves an explicit terminal failure in the post-ready static fallback', () => {
    const ready = transitionRealmRendererLifecycle(initialRealmRendererLifecycle(), {
      type: 'ready'
    });
    const failure = {
      code: 'scene-rebuild-timeout' as const,
      retryable: true,
      phase: 'loading' as const,
      message: 'Synthetic bounded rebuild timeout.'
    };
    const state = transitionRealmRendererLifecycle(ready, {
      type: 'static-fallback',
      failure
    });

    expect(state).toMatchObject({
      state: 'static-degraded',
      everReady: true,
      failure,
      lastFailure: failure
    });
  });

  it('increments the generation when a scene load begins', () => {
    const initial = initialRealmRendererLifecycle();
    const first = transitionRealmRendererLifecycle(initial, {
      type: 'load-start',
      attempt: 0
    });
    const second = transitionRealmRendererLifecycle(first, {
      type: 'load-start',
      attempt: 1,
      generation: 9
    });
    expect(first.generation).toBe(1);
    expect(second.generation).toBe(9);
  });

  it('ignores readiness, recovery, and failure callbacks from retired generations', () => {
    const first = transitionRealmRendererLifecycle(initialRealmRendererLifecycle(), {
      type: 'load-start',
      generation: 1
    });
    const current = transitionRealmRendererLifecycle(first, {
      type: 'load-start',
      generation: 2
    });
    expect(transitionRealmRendererLifecycle(current, {
      type: 'ready',
      generation: 1
    })).toBe(current);
    expect(transitionRealmRendererLifecycle(current, {
      type: 'recover',
      generation: 1,
      failure: { code: 'context-lost', retryable: true, phase: 'loading' }
    })).toBe(current);
    expect(transitionRealmRendererLifecycle(current, {
      type: 'failed',
      generation: 1,
      failure: { code: 'scene-build-failed', retryable: true, phase: 'loading' }
    })).toBe(current);
    expect(transitionRealmRendererLifecycle(current, {
      type: 'static-fallback',
      generation: 1,
      failure: {
        code: 'scene-rebuild-timeout',
        retryable: true,
        phase: 'loading'
      }
    })).toBe(current);
    expect(transitionRealmRendererLifecycle(current, {
      type: 'stable',
      generation: 1
    })).toBe(current);
    expect(current.state).toBe('loading');
    expect(current.generation).toBe(2);
  });

  it('classifies integrity and pairing failures as explicit non-retryable failures', () => {
    expect(classifyRealmRendererFailure(new Error('sha256 integrity mismatch'), 'loading'))
      .toMatchObject({ code: 'castle-integrity-failed', retryable: false });
    expect(classifyRealmRendererFailure(new Error('landscape base pairing failed'), 'loading').code)
      .toBe('castle-pairing-failed');
    expect(classifyRealmRendererFailure(
      new Error('Hegemony keep compact prefab contains no renderable meshes.'),
      'loading'
    )).toMatchObject({
      code: 'castle-prefab-assembly-failed',
      retryable: false
    });
    expect(classifyRealmRendererFailure(new Error('request timed out'), 'loading').code)
      .toBe('castle-compact-load-failed');
    expect(classifyRealmRendererFailure(
      new Error('landscape-base request timed out while fetching the compact asset'),
      'loading'
    )).toMatchObject({
      code: 'castle-compact-load-failed',
      retryable: true
    });
  });

  it('bounds automatic retries and leaves manual retry available', () => {
    const current = {
      ...initialRealmRendererLifecycle(),
      state: 'recovering' as const,
      attempt: REALM_RENDERER_MAX_RECOVERY_ATTEMPTS,
      everReady: true
    };
    expect(shouldRetryRealmRenderer(current, {
      code: 'scene-build-failed',
      retryable: true,
      phase: 'recovering'
    })).toBe(false);
  });
});
