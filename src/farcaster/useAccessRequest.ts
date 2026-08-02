import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  emitAccessRequestDiagnostic,
  IDLE_ACCESS_REQUEST_STATE,
  transitionAccessRequestState,
  type AccessRequestDiagnosticEvent,
  type AccessRequestStateEvent
} from './accessRequestStateMachine';
import { emitWarpkeepSfx } from '../components/audio/sfxEvents';
import type {
  AccessRequestAuthentication,
  AccessRequestStatus,
  AccessRequestStatusContext,
  AccessRequestViewState,
  FarcasterAuthViewState,
  FarcasterOidcBridgeClient
} from './farcasterAuthTypes';
import { accessRequestNoMutationReason } from './farcasterOidcBridgeClient';

const DEFAULT_MINIMUM_SUBMITTING_MILLISECONDS = 350;
const DEFAULT_MINIMUM_VERIFYING_MILLISECONDS = 160;
const MAXIMUM_PRESENTATION_DELAY_MILLISECONDS = 2_000;

type AccessRequestOperationKind =
  | 'initial-status'
  | 'manual-status'
  | 'submit';

type AccessRequestOperation = Readonly<{
  lifecycleKey: string;
  sequence: number;
  kind: AccessRequestOperationKind;
  controller: AbortController;
}>;

type AccessRequestControllerOptions = Readonly<{
  authState: FarcasterAuthViewState;
  authGeneration: number;
  loadBridgeClient: () => Promise<FarcasterOidcBridgeClient>;
  loadQuickAuthToken?: () => Promise<string | null>;
  /** Local test seam; production uses the bounded 350 ms presentation. */
  minimumSubmittingMilliseconds?: number;
  /** Local test seam for the short ambiguous-result handoff. */
  minimumVerifyingMilliseconds?: number;
  monotonicNow?: () => number;
  reportDiagnostic?: (event: AccessRequestDiagnosticEvent) => void;
  onAuthenticationIdentityChanged?: () => void;
}>;

export type AccessRequestController = Readonly<{
  state: AccessRequestViewState;
  /** True only when this activation acquired the exact lifecycle lock. */
  requestAccess: () => boolean;
  retryStatus: () => void;
}>;

function boundedPresentationDelay(value: number | undefined, fallback: number): number {
  return value !== undefined
    && Number.isFinite(value)
    && value >= 0
    && value <= MAXIMUM_PRESENTATION_DELAY_MILLISECONDS
    ? value
    : fallback;
}

function readMonotonicNow(now: () => number): number {
  const value = now();
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function waitForPresentationDelay(
  milliseconds: number,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (milliseconds <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      resolve(completed);
    };
    const abort = () => finish(false);
    const timeout = setTimeout(() => finish(true), milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function waitForMinimumPresentation(
  startedAt: number,
  minimumMilliseconds: number,
  now: () => number,
  signal: AbortSignal
): Promise<boolean> {
  const elapsed = Math.max(0, readMonotonicNow(now) - startedAt);
  return waitForPresentationDelay(
    Math.max(0, minimumMilliseconds - elapsed),
    signal
  );
}

/**
 * Run one bridge operation with an authentication value that exists only in
 * this call stack. Quick Auth material never enters React state or context.
 */
async function withAccessAuthentication<T>(
  loadQuickAuthToken: (() => Promise<string | null>) | undefined,
  shouldContinue: () => boolean,
  operation: (authentication: AccessRequestAuthentication) => Promise<T>
): Promise<T> {
  if (!shouldContinue()) throw new Error('ACCESS_AUTH_CANCELLED');
  if (!loadQuickAuthToken) {
    return operation(Object.freeze({ mode: 'pending-session' }));
  }

  let token = await loadQuickAuthToken();
  if (!token) throw new Error('ACCESS_AUTH_UNAVAILABLE');
  try {
    // Credential acquisition may outlive the identity generation that began
    // it. Revalidate before the token can reach a mutation or status client.
    if (!shouldContinue()) throw new Error('ACCESS_AUTH_CANCELLED');
    return await operation(Object.freeze({ mode: 'quick-auth', token }));
  } finally {
    token = '';
  }
}

export function useAccessRequest({
  authState,
  authGeneration,
  loadBridgeClient,
  loadQuickAuthToken,
  minimumSubmittingMilliseconds,
  minimumVerifyingMilliseconds,
  monotonicNow = () => (
    typeof performance === 'undefined' ? Date.now() : performance.now()
  ),
  reportDiagnostic = emitAccessRequestDiagnostic,
  onAuthenticationIdentityChanged
}: AccessRequestControllerOptions): AccessRequestController {
  const [state, setState] = useState<AccessRequestViewState>(
    IDLE_ACCESS_REQUEST_STATE
  );
  const stateRef = useRef<AccessRequestViewState>(IDLE_ACCESS_REQUEST_STATE);
  const stateLifecycleKeyRef = useRef<string | undefined>(undefined);
  const currentLifecycleKeyRef = useRef<string | undefined>(undefined);
  const operationSequenceRef = useRef(0);
  const activeOperationRef = useRef<AccessRequestOperation | undefined>(undefined);
  const submissionLockRef = useRef<string | undefined>(undefined);
  const duplicateDiagnosticKeyRef = useRef<string | undefined>(undefined);
  const loadBridgeClientRef = useRef(loadBridgeClient);
  const loadQuickAuthTokenRef = useRef(loadQuickAuthToken);
  const monotonicNowRef = useRef(monotonicNow);
  const reportDiagnosticRef = useRef(reportDiagnostic);
  const onAuthenticationIdentityChangedRef = useRef(
    onAuthenticationIdentityChanged
  );

  const pendingFid = authState.phase === 'pending-admission'
    ? authState.identity.fid
    : undefined;
  const lifecycleKey = pendingFid === undefined
    ? undefined
    : `${authGeneration}:${pendingFid}`;
  // Commit the latest dependencies before passive lifecycle effects or user
  // events can run. Render-time ref mutation would let an abandoned concurrent
  // render invalidate the still-committed identity.
  useLayoutEffect(() => {
    currentLifecycleKeyRef.current = lifecycleKey;
    loadBridgeClientRef.current = loadBridgeClient;
    loadQuickAuthTokenRef.current = loadQuickAuthToken;
    monotonicNowRef.current = monotonicNow;
    reportDiagnosticRef.current = reportDiagnostic;
    onAuthenticationIdentityChangedRef.current = onAuthenticationIdentityChanged;
  }, [
    lifecycleKey,
    loadBridgeClient,
    loadQuickAuthToken,
    monotonicNow,
    onAuthenticationIdentityChanged,
    reportDiagnostic
  ]);

  const minimumSubmitting = boundedPresentationDelay(
    minimumSubmittingMilliseconds,
    DEFAULT_MINIMUM_SUBMITTING_MILLISECONDS
  );
  const minimumVerifying = boundedPresentationDelay(
    minimumVerifyingMilliseconds,
    DEFAULT_MINIMUM_VERIFYING_MILLISECONDS
  );

  const diagnose = useCallback((event: AccessRequestDiagnosticEvent) => {
    try {
      reportDiagnosticRef.current(event);
    } catch {
      // Diagnostics cannot affect submission or presentation.
    }
  }, []);

  const reconcileAuthenticationIdentity = useCallback(() => {
    diagnose('request_identity_changed');
    try {
      onAuthenticationIdentityChangedRef.current?.();
    } catch {
      // Identity reconciliation cannot re-open the sealed request lifecycle.
    }
  }, [diagnose]);

  const abortActiveOperation = useCallback(() => {
    const active = activeOperationRef.current;
    if (!active) return;
    activeOperationRef.current = undefined;
    active.controller.abort();
  }, []);

  const beginOperation = useCallback((
    exactLifecycleKey: string,
    kind: AccessRequestOperationKind
  ): AccessRequestOperation => {
    abortActiveOperation();
    const operation = Object.freeze({
      lifecycleKey: exactLifecycleKey,
      sequence: operationSequenceRef.current + 1,
      kind,
      controller: new AbortController()
    });
    operationSequenceRef.current = operation.sequence;
    activeOperationRef.current = operation;
    return operation;
  }, [abortActiveOperation]);

  const isCurrentOperation = useCallback((operation: AccessRequestOperation) => (
    !operation.controller.signal.aborted
    && currentLifecycleKeyRef.current === operation.lifecycleKey
    && operationSequenceRef.current === operation.sequence
    && activeOperationRef.current === operation
  ), []);

  const finishOperation = useCallback((operation: AccessRequestOperation) => {
    if (activeOperationRef.current === operation) {
      activeOperationRef.current = undefined;
    }
  }, []);

  const applyEvent = useCallback((
    operation: AccessRequestOperation,
    event: AccessRequestStateEvent
  ): AccessRequestViewState | undefined => {
    if (!isCurrentOperation(operation)) return undefined;
    const current = stateLifecycleKeyRef.current === operation.lifecycleKey
      ? stateRef.current
      : IDLE_ACCESS_REQUEST_STATE;
    const next = transitionAccessRequestState(current, event);
    if (next !== current) {
      stateLifecycleKeyRef.current = operation.lifecycleKey;
      stateRef.current = next;
      setState(next);
    }
    return next;
  }, [isCurrentOperation]);

  const applyAuthoritativeRequestConfirmation = useCallback((
    operation: AccessRequestOperation,
    requestedAt: number,
    source: 'submit' | 'reconciliation'
  ): AccessRequestViewState | undefined => {
    const previous = stateLifecycleKeyRef.current === operation.lifecycleKey
      ? stateRef.current
      : IDLE_ACCESS_REQUEST_STATE;
    const next = applyEvent(operation, source === 'submit'
      ? { type: 'submit-confirmed', requestedAt }
      : {
          type: 'status-requested',
          context: 'post-submission',
          requestedAt
        });
    if (
      next !== previous
      && next?.phase === 'request-received'
    ) {
      try {
        emitWarpkeepSfx({ kind: 'access-request-confirmed' });
      } catch {
        // Sensory feedback cannot affect the authoritative request lifecycle.
      }
    }
    return next;
  }, [applyEvent]);

  const applyStatus = useCallback((
    operation: AccessRequestOperation,
    context: AccessRequestStatusContext,
    status: AccessRequestStatus
  ) => {
    if (status.status === 'requested') {
      if (context === 'post-submission') {
        applyAuthoritativeRequestConfirmation(
          operation,
          status.requestedAt,
          'reconciliation'
        );
      } else {
        applyEvent(operation, {
          type: 'status-requested',
          context,
          requestedAt: status.requestedAt
        });
      }
      diagnose(context === 'post-submission'
        ? 'request_reconciled_existing'
        : 'request_already_exists');
      return;
    }
    if (status.status === 'already-admitted') {
      applyEvent(operation, { type: 'already-admitted' });
      diagnose('request_already_admitted');
      return;
    }
    if (context === 'post-submission') {
      // A missing projection cannot prove that an interrupted mutation never
      // crossed its write boundary. Keep the submission sealed.
      applyEvent(operation, { type: 'status-unavailable', context });
      diagnose('request_status_unavailable');
      return;
    }
    applyEvent(operation, { type: 'status-available', context });
  }, [applyAuthoritativeRequestConfirmation, applyEvent, diagnose]);

  const startStatusRead = useCallback((
    exactLifecycleKey: string,
    expectedFid: number,
    context: AccessRequestStatusContext,
    kind: Extract<AccessRequestOperationKind, 'initial-status' | 'manual-status'>
  ): AccessRequestOperation | undefined => {
    if (currentLifecycleKeyRef.current !== exactLifecycleKey) return undefined;
    const operation = beginOperation(exactLifecycleKey, kind);
    const next = applyEvent(operation, { type: 'status-load-started', context });
    if (next?.phase !== 'loading-status') {
      finishOperation(operation);
      operation.controller.abort();
      return undefined;
    }

    // A microtask lets React Strict Mode dispose its probe effect before any
    // credential or network work begins.
    void Promise.resolve().then(async () => {
      if (!isCurrentOperation(operation)) return;
      try {
        const client = await loadBridgeClientRef.current();
        if (!isCurrentOperation(operation)) return;
        const status = await withAccessAuthentication(
          loadQuickAuthTokenRef.current,
          () => isCurrentOperation(operation),
          authentication => client.getAccessRequestStatus(authentication, {
            expectedFid,
            signal: operation.controller.signal
          })
        );
        if (!isCurrentOperation(operation)) return;
        applyStatus(operation, context, status);
      } catch (error) {
        if (!isCurrentOperation(operation)) return;
        applyEvent(operation, { type: 'status-unavailable', context });
        if (accessRequestNoMutationReason(error) === 'identity-changed') {
          reconcileAuthenticationIdentity();
        } else {
          diagnose('request_status_unavailable');
        }
      } finally {
        finishOperation(operation);
      }
    });
    return operation;
  }, [
    applyEvent,
    applyStatus,
    beginOperation,
    diagnose,
    finishOperation,
    isCurrentOperation,
    reconcileAuthenticationIdentity
  ]);

  useEffect(() => {
    abortActiveOperation();
    operationSequenceRef.current += 1;
    submissionLockRef.current = undefined;
    duplicateDiagnosticKeyRef.current = undefined;

    if (!lifecycleKey || pendingFid === undefined) {
      stateLifecycleKeyRef.current = undefined;
      stateRef.current = IDLE_ACCESS_REQUEST_STATE;
      setState(IDLE_ACCESS_REQUEST_STATE);
      return undefined;
    }

    stateLifecycleKeyRef.current = lifecycleKey;
    stateRef.current = IDLE_ACCESS_REQUEST_STATE;
    setState(IDLE_ACCESS_REQUEST_STATE);
    const operation = startStatusRead(
      lifecycleKey,
      pendingFid,
      'initial',
      'initial-status'
    );

    return () => {
      if (activeOperationRef.current?.lifecycleKey === lifecycleKey) {
        abortActiveOperation();
        operationSequenceRef.current += 1;
      } else {
        operation?.controller.abort();
      }
      // Do not release the submission lock merely because presentation
      // unmounted or a transport was aborted. A new lifecycle resets it above.
    };
  }, [abortActiveOperation, lifecycleKey, pendingFid, startStatusRead]);

  const retryStatus = useCallback(() => {
    const exactLifecycleKey = lifecycleKey;
    if (
      !exactLifecycleKey
      || currentLifecycleKeyRef.current !== exactLifecycleKey
      || stateLifecycleKeyRef.current !== exactLifecycleKey
      || pendingFid === undefined
      || stateRef.current.phase !== 'status-unavailable'
    ) return;
    startStatusRead(
      exactLifecycleKey,
      pendingFid,
      stateRef.current.context,
      'manual-status'
    );
  }, [lifecycleKey, pendingFid, startStatusRead]);

  const requestAccess = useCallback(() => {
    // Capture the exact lifecycle in this callback. A retained handler from an
    // older identity/generation must not submit for whatever identity happens
    // to be current when that stale callback is invoked.
    const exactLifecycleKey = lifecycleKey;
    const expectedFid = pendingFid;
    const currentState = stateLifecycleKeyRef.current === exactLifecycleKey
      ? stateRef.current
      : IDLE_ACCESS_REQUEST_STATE;
    if (
      !exactLifecycleKey
      || expectedFid === undefined
      || currentLifecycleKeyRef.current !== exactLifecycleKey
      || submissionLockRef.current === exactLifecycleKey
      || (
        currentState.phase !== 'request-available'
        && currentState.phase !== 'definitive-failure'
      )
    ) {
      if (exactLifecycleKey && submissionLockRef.current === exactLifecycleKey) {
        const duplicateKey = `${exactLifecycleKey}:${operationSequenceRef.current}`;
        if (duplicateDiagnosticKeyRef.current !== duplicateKey) {
          duplicateDiagnosticKeyRef.current = duplicateKey;
          diagnose('duplicate_client_activation_suppressed');
        }
      }
      return false;
    }

    // This synchronous lock is acquired before state, animation, diagnostics,
    // credential acquisition, or network work.
    submissionLockRef.current = exactLifecycleKey;
    duplicateDiagnosticKeyRef.current = undefined;
    const operation = beginOperation(exactLifecycleKey, 'submit');
    const next = applyEvent(operation, { type: 'submit-started' });
    if (next?.phase !== 'submitting') {
      finishOperation(operation);
      operation.controller.abort();
      return false;
    }
    diagnose('request_submit_started');
    const startedAt = readMonotonicNow(monotonicNowRef.current);

    void (async () => {
      let client: FarcasterOidcBridgeClient | undefined;
      let mutationInvoked = false;
      try {
        client = await loadBridgeClientRef.current();
        if (!isCurrentOperation(operation)) return;
        const status = await withAccessAuthentication(
          loadQuickAuthTokenRef.current,
          () => isCurrentOperation(operation),
          authentication => {
            mutationInvoked = true;
            return client!.requestAccess(authentication, {
              expectedFid,
              signal: operation.controller.signal
            });
          }
        );
        if (!isCurrentOperation(operation)) return;
        if (status.status === 'not-requested') {
          throw new Error('ACCESS_REQUEST_INVALID_SUBMIT_RESULT');
        }
        if (!await waitForMinimumPresentation(
          startedAt,
          minimumSubmitting,
          monotonicNowRef.current,
          operation.controller.signal
        ) || !isCurrentOperation(operation)) return;
        if (status.status === 'already-admitted') {
          applyEvent(operation, { type: 'already-admitted' });
          diagnose('request_already_admitted');
        } else {
          applyAuthoritativeRequestConfirmation(operation, status.requestedAt, 'submit');
          diagnose('request_confirmed');
        }
        return;
      } catch (error) {
        if (!isCurrentOperation(operation)) return;
        const noMutationReason = accessRequestNoMutationReason(error);
        if (noMutationReason === 'identity-changed') {
          if (!await waitForMinimumPresentation(
            startedAt,
            minimumSubmitting,
            monotonicNowRef.current,
            operation.controller.signal
          ) || !isCurrentOperation(operation)) return;
          applyEvent(operation, {
            type: 'status-unavailable',
            context: 'initial'
          });
          reconcileAuthenticationIdentity();
          return;
        }
        if (
          !mutationInvoked
          || noMutationReason === 'rate-limited'
        ) {
          if (!await waitForMinimumPresentation(
            startedAt,
            minimumSubmitting,
            monotonicNowRef.current,
            operation.controller.signal
          ) || !isCurrentOperation(operation)) return;
          applyEvent(operation, { type: 'definitive-failure' });
          if (submissionLockRef.current === exactLifecycleKey) {
            submissionLockRef.current = undefined;
          }
          diagnose('request_definitive_failure');
          return;
        }

        // The mutation may have reached authority. Start one read-only
        // reconciliation immediately, but never retry the mutation.
        const reconciliation = (async () => {
          try {
            if (!client) return undefined;
            return await withAccessAuthentication(
              loadQuickAuthTokenRef.current,
              () => isCurrentOperation(operation),
              authentication => client!.getAccessRequestStatus(authentication, {
                expectedFid,
                signal: operation.controller.signal
              })
            );
          } catch {
            return undefined;
          }
        })();

        if (!await waitForMinimumPresentation(
          startedAt,
          minimumSubmitting,
          monotonicNowRef.current,
          operation.controller.signal
        ) || !isCurrentOperation(operation)) return;
        applyEvent(operation, { type: 'submit-ambiguous' });
        diagnose('request_ambiguous');

        const [reconciled, verificationShown] = await Promise.all([
          reconciliation,
          waitForPresentationDelay(
            minimumVerifying,
            operation.controller.signal
          )
        ]);
        if (!verificationShown || !isCurrentOperation(operation)) return;
        if (reconciled) {
          applyStatus(operation, 'post-submission', reconciled);
        } else {
          applyEvent(operation, {
            type: 'status-unavailable',
            context: 'post-submission'
          });
          diagnose('request_status_unavailable');
        }
      } finally {
        finishOperation(operation);
      }
    })();
    return true;
  }, [
    applyAuthoritativeRequestConfirmation,
    applyEvent,
    applyStatus,
    beginOperation,
    diagnose,
    finishOperation,
    isCurrentOperation,
    lifecycleKey,
    minimumSubmitting,
    minimumVerifying,
    pendingFid,
    reconcileAuthenticationIdentity
  ]);

  const visibleState = lifecycleKey === undefined
    ? IDLE_ACCESS_REQUEST_STATE
    : stateLifecycleKeyRef.current === lifecycleKey
      ? state
      : Object.freeze({
          phase: 'loading-status',
          context: 'initial'
        } as const);

  return useMemo(
    () => Object.freeze({
      state: visibleState,
      requestAccess,
      retryStatus
    }),
    [requestAccess, retryStatus, visibleState]
  );
}
