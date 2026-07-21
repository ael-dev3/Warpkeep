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

  it('recovers after a loss without changing the ready history', () => {
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
    expect(transitionRealmRendererLifecycle(recovering, { type: 'ready' }).state).toBe('ready');
  });

  it('never downgrades a previously-ready renderer to static unsupported mode', () => {
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
    expect(state.state).toBe('failed');
    expect(state.state).not.toBe('static-unsupported');
    expect(state.everReady).toBe(true);
    expect(state.failure?.code).toBe('renderer-construction-failed');
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
    expect(current.state).toBe('loading');
    expect(current.generation).toBe(2);
  });

  it('classifies integrity and pairing failures as explicit non-retryable failures', () => {
    expect(classifyRealmRendererFailure(new Error('sha256 integrity mismatch'), 'loading').code)
      .toBe('castle-integrity-failed');
    expect(classifyRealmRendererFailure(new Error('landscape base pairing failed'), 'loading').code)
      .toBe('castle-pairing-failed');
    expect(classifyRealmRendererFailure(new Error('request timed out'), 'loading').code)
      .toBe('castle-compact-load-failed');
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
