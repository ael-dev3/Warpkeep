import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type {
  AccessRequestAuthentication,
  AccessRequestStatus,
  AccessRequestViewState,
  FarcasterAuthViewState,
  FarcasterOidcBridgeClient
} from './farcasterAuthTypes';

type AccessRequestControllerOptions = Readonly<{
  authState: FarcasterAuthViewState;
  authGeneration: number;
  loadBridgeClient: () => Promise<FarcasterOidcBridgeClient>;
  loadQuickAuthToken?: () => Promise<string | null>;
}>;

export type AccessRequestController = Readonly<{
  state: AccessRequestViewState;
  requestAccess: () => void;
  retryStatus: () => void;
}>;

const IDLE: AccessRequestViewState = Object.freeze({ phase: 'idle' });
const LOADING: AccessRequestViewState = Object.freeze({ phase: 'loading' });
const SUBMITTING: AccessRequestViewState = Object.freeze({ phase: 'submitting' });
const CONFIRMATION_PENDING: AccessRequestViewState = Object.freeze({
  phase: 'confirmation-pending'
});
const RETRYABLE_ERROR: AccessRequestViewState = Object.freeze({
  phase: 'error',
  retryable: true
});

function projectStatus(status: AccessRequestStatus): AccessRequestViewState {
  if (status.status === 'requested') {
    return Object.freeze({
      phase: 'requested',
      requestedAt: status.requestedAt
    });
  }
  if (status.status === 'already-admitted') {
    return Object.freeze({ phase: 'already-admitted' });
  }
  return Object.freeze({ phase: 'not-requested' });
}

/**
 * Run one bridge operation with an authentication value that exists only in
 * this call stack. Quick Auth material never enters React state or context.
 */
async function withAccessAuthentication<T>(
  loadQuickAuthToken: (() => Promise<string | null>) | undefined,
  operation: (authentication: AccessRequestAuthentication) => Promise<T>
): Promise<T> {
  if (!loadQuickAuthToken) {
    return operation(Object.freeze({ mode: 'pending-session' }));
  }

  let token = await loadQuickAuthToken();
  if (!token) throw new Error('ACCESS_AUTH_UNAVAILABLE');
  try {
    return await operation(Object.freeze({ mode: 'quick-auth', token }));
  } finally {
    token = '';
  }
}

export function useAccessRequest({
  authState,
  authGeneration,
  loadBridgeClient,
  loadQuickAuthToken
}: AccessRequestControllerOptions): AccessRequestController {
  const [state, setState] = useState<AccessRequestViewState>(IDLE);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const statusAttemptRef = useRef(0);
  const stateRef = useRef(state);
  const loadedKeyRef = useRef<string | undefined>(undefined);
  const activeControllerRef = useRef<AbortController | undefined>(undefined);
  const committedLifecycleKeyRef = useRef<string | undefined>(undefined);
  const committedStatusCheckAttemptKeyRef = useRef<string | undefined>(undefined);
  stateRef.current = state;

  const pendingFid = authState.phase === 'pending-admission'
    ? authState.identity.fid
    : undefined;
  const lifecycleKey = pendingFid === undefined
    ? undefined
    : `${authGeneration}:${pendingFid}`;

  useEffect(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = undefined;

    if (!lifecycleKey) {
      loadedKeyRef.current = undefined;
      committedLifecycleKeyRef.current = undefined;
      committedStatusCheckAttemptKeyRef.current = undefined;
      setState(IDLE);
      return undefined;
    }

    if (
      committedLifecycleKeyRef.current !== undefined
      && committedLifecycleKeyRef.current !== lifecycleKey
    ) {
      committedLifecycleKeyRef.current = undefined;
      committedStatusCheckAttemptKeyRef.current = undefined;
    }

    const attemptKey = `${lifecycleKey}:${statusAttempt}`;
    if (loadedKeyRef.current === attemptKey) return undefined;
    loadedKeyRef.current = attemptKey;
    stateRef.current = LOADING;
    setState(LOADING);

    const controller = new AbortController();
    activeControllerRef.current = controller;
    let disposed = false;

    // Deferring one microtask prevents React Strict Mode's probe effect from
    // producing a real duplicate request while retaining normal cancellation.
    void Promise.resolve().then(async () => {
      if (disposed || controller.signal.aborted) return;
      try {
        const client = await loadBridgeClient();
        const getStatus = client.getAccessRequestStatus.bind(client);
        const status = await withAccessAuthentication(
          loadQuickAuthToken,
          authentication => getStatus(authentication, {
            signal: controller.signal
          })
        );
        if (!disposed && !controller.signal.aborted) {
          const committedStatusCheck =
            committedStatusCheckAttemptKeyRef.current === attemptKey;
          const committedNotRequested = (
            status.status === 'not-requested'
            && committedLifecycleKeyRef.current === lifecycleKey
          );
          if (committedNotRequested && committedStatusCheck) {
            // A deliberate, successful status-only reconciliation can prove
            // that an ambiguous submission did not settle. Only that exact
            // authority result may reopen the action in the same lifecycle.
            committedLifecycleKeyRef.current = undefined;
          }
          if (committedStatusCheck) {
            committedStatusCheckAttemptKeyRef.current = undefined;
          }
          const projected = committedNotRequested && !committedStatusCheck
            ? CONFIRMATION_PENDING
            : projectStatus(status);
          stateRef.current = projected;
          setState(projected);
        }
      } catch {
        if (!disposed && !controller.signal.aborted) {
          if (committedStatusCheckAttemptKeyRef.current === attemptKey) {
            committedStatusCheckAttemptKeyRef.current = undefined;
          }
          const projected =
            committedLifecycleKeyRef.current === lifecycleKey
              ? CONFIRMATION_PENDING
              : RETRYABLE_ERROR;
          stateRef.current = projected;
          setState(projected);
        }
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = undefined;
        }
      }
    });

    return () => {
      disposed = true;
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = undefined;
      }
      if (loadedKeyRef.current === attemptKey) {
        loadedKeyRef.current = undefined;
      }
    };
  }, [
    lifecycleKey,
    loadBridgeClient,
    loadQuickAuthToken,
    statusAttempt
  ]);

  const retryStatus = useCallback(() => {
    const currentPhase = stateRef.current.phase;
    if (
      !lifecycleKey
      || (
        currentPhase !== 'error'
        && currentPhase !== 'confirmation-pending'
      )
    ) return;
    const nextAttempt = statusAttemptRef.current + 1;
    statusAttemptRef.current = nextAttempt;
    committedStatusCheckAttemptKeyRef.current =
      currentPhase === 'confirmation-pending'
        ? `${lifecycleKey}:${nextAttempt}`
        : undefined;
    stateRef.current = LOADING;
    setState(LOADING);
    activeControllerRef.current?.abort();
    loadedKeyRef.current = undefined;
    setStatusAttempt(nextAttempt);
  }, [lifecycleKey]);

  const requestAccess = useCallback(() => {
    const currentPhase = stateRef.current.phase;
    if (
      !lifecycleKey
      || committedLifecycleKeyRef.current === lifecycleKey
      || (
        currentPhase !== 'not-requested'
        && currentPhase !== 'error'
      )
    ) return;
    // The exact authorization lifecycle owns the optimistic commitment, not
    // whichever menu or Mini App component currently presents it. Seal the
    // gesture before any asynchronous work so remounts and transport errors
    // cannot turn one petition into another clickable submission.
    committedLifecycleKeyRef.current = lifecycleKey;
    committedStatusCheckAttemptKeyRef.current = undefined;
    const controller = new AbortController();
    activeControllerRef.current?.abort();
    activeControllerRef.current = controller;
    stateRef.current = SUBMITTING;
    setState(SUBMITTING);

    void (async () => {
      try {
        const client = await loadBridgeClient();
        const submit = client.requestAccess.bind(client);
        const getStatus = client.getAccessRequestStatus.bind(client);
        let status: AccessRequestStatus;
        try {
          status = await withAccessAuthentication(
            loadQuickAuthToken,
            authentication => submit(authentication, {
              signal: controller.signal
            })
          );
        } catch {
          if (controller.signal.aborted) return;
          // The submit may have committed after the response path failed.
          // Reconcile exactly once; never blindly resubmit.
          status = await withAccessAuthentication(
            loadQuickAuthToken,
            authentication => getStatus(authentication, {
              signal: controller.signal
            })
          );
        }
        if (!controller.signal.aborted) {
          // The automatic fallback answers only whether the first call might
          // have settled. Even an immediate not-requested response does not
          // reopen the gesture; the player must choose a later status-only
          // check before another submission can ever become available.
          const projected = status.status === 'not-requested'
            ? CONFIRMATION_PENDING
            : projectStatus(status);
          stateRef.current = projected;
          setState(projected);
        }
      } catch {
        if (!controller.signal.aborted) {
          stateRef.current = CONFIRMATION_PENDING;
          setState(CONFIRMATION_PENDING);
        }
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = undefined;
        }
      }
    })();
  }, [
    lifecycleKey,
    loadBridgeClient,
    loadQuickAuthToken
  ]);

  return useMemo(
    () => Object.freeze({ state, requestAccess, retryStatus }),
    [requestAccess, retryStatus, state]
  );
}
