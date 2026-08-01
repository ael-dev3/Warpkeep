import type {
  AccessRequestStatusContext,
  AccessRequestViewState
} from './farcasterAuthTypes';

export type AccessRequestStateEvent =
  | Readonly<{ type: 'reset' }>
  | Readonly<{
      type: 'status-load-started';
      context: AccessRequestStatusContext;
    }>
  | Readonly<{
      type: 'status-available';
      context: AccessRequestStatusContext;
    }>
  | Readonly<{
      type: 'status-requested';
      context: AccessRequestStatusContext;
      requestedAt: number;
    }>
  | Readonly<{ type: 'already-admitted' }>
  | Readonly<{
      type: 'status-unavailable';
      context: AccessRequestStatusContext;
    }>
  | Readonly<{ type: 'submit-started' }>
  | Readonly<{ type: 'submit-ambiguous' }>
  | Readonly<{ type: 'submit-confirmed'; requestedAt: number }>
  | Readonly<{ type: 'definitive-failure' }>;

export const IDLE_ACCESS_REQUEST_STATE: AccessRequestViewState = Object.freeze({
  phase: 'idle'
});

function requestedState(
  context: AccessRequestStatusContext,
  requestedAt: number
): AccessRequestViewState {
  return context === 'post-submission'
    ? Object.freeze({ phase: 'request-received', requestedAt })
    : Object.freeze({ phase: 'already-requested', requestedAt });
}

/**
 * The sole access-request lifecycle transition table. Invalid or stale events
 * are ignored, so terminal confirmation cannot be downgraded by a later read.
 */
export function transitionAccessRequestState(
  current: AccessRequestViewState,
  event: AccessRequestStateEvent
): AccessRequestViewState {
  if (event.type === 'reset') return IDLE_ACCESS_REQUEST_STATE;

  switch (current.phase) {
    case 'idle':
      return event.type === 'status-load-started'
        ? Object.freeze({ phase: 'loading-status', context: event.context })
        : current;
    case 'loading-status':
      if (event.type === 'status-available') {
        return current.context === 'post-submission'
          ? Object.freeze({
              phase: 'status-unavailable',
              context: 'post-submission'
            })
          : Object.freeze({ phase: 'request-available' });
      }
      if (event.type === 'status-requested') {
        return requestedState(current.context, event.requestedAt);
      }
      if (event.type === 'already-admitted') {
        return Object.freeze({ phase: 'already-admitted' });
      }
      if (event.type === 'status-unavailable') {
        return Object.freeze({
          phase: 'status-unavailable',
          context: current.context
        });
      }
      return current;
    case 'request-available':
    case 'definitive-failure':
      return event.type === 'submit-started'
        ? Object.freeze({ phase: 'submitting' })
        : current;
    case 'submitting':
      if (event.type === 'submit-confirmed') {
        return Object.freeze({
          phase: 'request-received',
          requestedAt: event.requestedAt
        });
      }
      if (event.type === 'already-admitted') {
        return Object.freeze({ phase: 'already-admitted' });
      }
      if (event.type === 'definitive-failure') {
        return Object.freeze({ phase: 'definitive-failure' });
      }
      return event.type === 'submit-ambiguous'
        ? Object.freeze({ phase: 'verifying-ambiguous-result' })
        : current;
    case 'verifying-ambiguous-result':
      if (event.type === 'status-requested') {
        return requestedState('post-submission', event.requestedAt);
      }
      if (event.type === 'status-available') {
        return Object.freeze({
          phase: 'status-unavailable',
          context: 'post-submission'
        });
      }
      if (event.type === 'already-admitted') {
        return Object.freeze({ phase: 'already-admitted' });
      }
      if (event.type === 'status-unavailable') {
        return Object.freeze({
          phase: 'status-unavailable',
          context: 'post-submission'
        });
      }
      return current;
    case 'status-unavailable':
      return event.type === 'status-load-started'
        ? Object.freeze({ phase: 'loading-status', context: current.context })
        : current;
    case 'request-received':
    case 'already-requested':
    case 'already-admitted':
      return current;
  }
}

export const ACCESS_REQUEST_DIAGNOSTIC_EVENT =
  'warpkeep:access-request-diagnostic';

export type AccessRequestDiagnosticEvent =
  | 'request_submit_started'
  | 'request_confirmed'
  | 'request_already_exists'
  | 'request_already_admitted'
  | 'request_ambiguous'
  | 'request_reconciled_existing'
  | 'request_definitive_failure'
  | 'request_identity_changed'
  | 'request_status_unavailable'
  | 'duplicate_client_activation_suppressed';

/** Emits only one fixed event name; it carries no identity or request data. */
export function emitAccessRequestDiagnostic(
  event: AccessRequestDiagnosticEvent
): void {
  try {
    if (
      typeof window === 'undefined'
      || typeof window.dispatchEvent !== 'function'
      || typeof CustomEvent === 'undefined'
    ) return;
    window.dispatchEvent(new CustomEvent(ACCESS_REQUEST_DIAGNOSTIC_EVENT, {
      detail: Object.freeze({ event })
    }));
  } catch {
    // Diagnostics are deliberately unable to affect the request lifecycle.
  }
}
