import { describe, expect, it } from 'vitest';

import {
  IDLE_ACCESS_REQUEST_STATE,
  transitionAccessRequestState
} from '../src/farcaster/accessRequestStateMachine';

describe('access-request monotonic state machine', () => {
  it('follows the available, submitting, and received path', () => {
    const loading = transitionAccessRequestState(IDLE_ACCESS_REQUEST_STATE, {
      type: 'status-load-started',
      context: 'initial'
    });
    const available = transitionAccessRequestState(loading, {
      type: 'status-available',
      context: 'initial'
    });
    const submitting = transitionAccessRequestState(available, {
      type: 'submit-started'
    });
    expect(transitionAccessRequestState(submitting, {
      type: 'submit-confirmed',
      requestedAt: 1_785_414_896_000
    })).toEqual({
      phase: 'request-received',
      requestedAt: 1_785_414_896_000
    });
  });

  it('cannot downgrade either terminal requested state with stale status or errors', () => {
    const received = {
      phase: 'request-received' as const,
      requestedAt: 1_785_414_896_000
    };
    const restored = {
      phase: 'already-requested' as const,
      requestedAt: 1_785_414_896_000
    };
    for (const terminal of [received, restored]) {
      expect(transitionAccessRequestState(terminal, {
        type: 'status-available',
        context: 'initial'
      })).toBe(terminal);
      expect(transitionAccessRequestState(terminal, {
        type: 'status-unavailable',
        context: 'initial'
      })).toBe(terminal);
      expect(transitionAccessRequestState(terminal, {
        type: 'status-load-started',
        context: 'initial'
      })).toBe(terminal);
    }
  });

  it('allows only an explicit authoritative recheck to leave a requested presentation', () => {
    for (const terminal of [
      { phase: 'request-received' as const, requestedAt: 1_785_414_896_000 },
      { phase: 'already-requested' as const, requestedAt: 1_785_414_896_000 }
    ]) {
      expect(transitionAccessRequestState(terminal, {
        type: 'status-recheck-started'
      })).toEqual({ phase: 'loading-status', context: 'initial' });
    }
  });

  it('keeps a missing ambiguous reconciliation unavailable rather than reopening', () => {
    const verifying = { phase: 'verifying-ambiguous-result' as const };
    const unavailable = transitionAccessRequestState(verifying, {
      type: 'status-available',
      context: 'post-submission'
    });
    expect(unavailable).toEqual({
      phase: 'status-unavailable',
      context: 'post-submission'
    });
  });

  it('allows a definitive pre-write failure to begin one deliberate retry', () => {
    expect(transitionAccessRequestState(
      { phase: 'definitive-failure' },
      { type: 'submit-started' }
    )).toEqual({ phase: 'submitting' });
  });
});
