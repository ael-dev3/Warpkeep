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
