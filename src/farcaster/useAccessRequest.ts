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
  const stateRef = useRef(state);
  const loadedKeyRef = useRef<string | undefined>(undefined);
  const activeControllerRef = useRef<AbortController | undefined>(undefined);
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
      setState(IDLE);
      return undefined;
    }

    const attemptKey = `${lifecycleKey}:${statusAttempt}`;
    if (loadedKeyRef.current === attemptKey) return undefined;
    loadedKeyRef.current = attemptKey;
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
          setState(projectStatus(status));
        }
      } catch {
        if (!disposed && !controller.signal.aborted) {
          setState(RETRYABLE_ERROR);
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
    if (!lifecycleKey || stateRef.current.phase === 'submitting') return;
    activeControllerRef.current?.abort();
    loadedKeyRef.current = undefined;
    setStatusAttempt(attempt => attempt + 1);
  }, [lifecycleKey]);

  const requestAccess = useCallback(() => {
    if (!lifecycleKey || stateRef.current.phase !== 'not-requested') return;
    const controller = new AbortController();
    activeControllerRef.current?.abort();
    activeControllerRef.current = controller;
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
          setState(projectStatus(status));
        }
      } catch {
        if (!controller.signal.aborted) {
          setState(RETRYABLE_ERROR);
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
