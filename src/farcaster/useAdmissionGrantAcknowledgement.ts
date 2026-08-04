import { useEffect, useRef, useState } from 'react';

import type {
  AdmissionGrantAcknowledgementViewState,
  FarcasterAuthViewState,
  FarcasterOidcBridgeClient,
  FarcasterQuickAuthTokenOptions,
  FarcasterQuickAuthTokenResult
} from './farcasterAuthTypes';
import { withAccessAuthentication } from './useAccessRequest';

// Farcaster delivery permits a 15-second provider response. Keep one final
// acknowledgement attempt beyond that settlement window without approaching
// the shared 12-per-five-minute access-request envelope.
const RETRY_DELAYS_MILLISECONDS = Object.freeze([0, 1_000, 3_000, 7_000, 9_000]);
const FINALIZATION_WAIT_MILLISECONDS = 10 * 60 * 1_000;
const ADMISSION_GRANT_NOTIFICATION_ID_PATTERN =
  /^warpkeep-access-grant-v3-i[A-Za-z0-9_-]{22}$/;

type AdmissionGrantAcknowledgementOptions = Readonly<{
  available: boolean;
  notificationId?: string;
  readTicket?: () => string | undefined;
  authState: FarcasterAuthViewState;
  authGeneration: number;
  loadBridgeClient: () => Promise<FarcasterOidcBridgeClient>;
  loadQuickAuthToken?: (
    options?: FarcasterQuickAuthTokenOptions
  ) => Promise<FarcasterQuickAuthTokenResult>;
  onCapabilityConsumed?: (expectedTicket: string) => void;
}>;

const IDLE_STATE: AdmissionGrantAcknowledgementViewState = Object.freeze({
  phase: 'idle'
});

function wait(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (milliseconds <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Exchanges a memory-only notification capability only after the Mini App has
 * a bridge-verified pending identity. The capability never enters context,
 * storage, history state, diagnostics, or presentation.
 */
export function useAdmissionGrantAcknowledgement({
  available,
  notificationId,
  readTicket,
  authState,
  authGeneration,
  loadBridgeClient,
  loadQuickAuthToken,
  onCapabilityConsumed
}: AdmissionGrantAcknowledgementOptions): AdmissionGrantAcknowledgementViewState {
  const [state, setState] = useState<AdmissionGrantAcknowledgementViewState>(
    IDLE_STATE
  );
  const stateRef = useRef<AdmissionGrantAcknowledgementViewState>(IDLE_STATE);
  const operationGenerationRef = useRef(0);
  const finalizationDeadlineRef = useRef<number | undefined>(undefined);
  const finalizationFidRef = useRef<number | undefined>(undefined);
  const publish = (next: AdmissionGrantAcknowledgementViewState) => {
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    operationGenerationRef.current += 1;
    const operationGeneration = operationGenerationRef.current;
    if (!available || authState.phase !== 'pending-admission') {
      if (
        authState.phase === 'pending-admission'
        && stateRef.current.phase === 'finalizing'
      ) {
        const deadline = finalizationDeadlineRef.current;
        if (
          deadline === undefined
          || finalizationFidRef.current !== authState.identity.fid
        ) {
          finalizationDeadlineRef.current = undefined;
          finalizationFidRef.current = undefined;
          publish(Object.freeze({ phase: 'stale' }));
          return undefined;
        }
        const remaining = Math.max(0, deadline - Date.now());
        const timer = globalThis.setTimeout(() => {
          if (
            operationGenerationRef.current === operationGeneration
            && stateRef.current.phase === 'finalizing'
          ) {
            finalizationDeadlineRef.current = undefined;
            finalizationFidRef.current = undefined;
            publish(Object.freeze({ phase: 'confirmed-pending' }));
          }
        }, remaining);
        return () => globalThis.clearTimeout(timer);
      }
      finalizationDeadlineRef.current = undefined;
      finalizationFidRef.current = undefined;
      publish(IDLE_STATE);
      return undefined;
    }

    const controller = new AbortController();
    const expectedFid = authState.identity.fid;
    finalizationDeadlineRef.current = undefined;
    finalizationFidRef.current = undefined;
    const ticket = readTicket?.();
    if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
      try {
        onCapabilityConsumed?.(ticket ?? '');
      } catch {
        // Invalid local capability material is still safe to forget.
      }
      publish(Object.freeze({ phase: 'stale' }));
      return () => controller.abort();
    }
    if (
      typeof notificationId !== 'string'
      || !ADMISSION_GRANT_NOTIFICATION_ID_PATTERN.test(notificationId)
    ) {
      // The SDK exposes one immutable launch-context snapshot. A reused
      // WebView may therefore reveal the new fragment before Farcaster opens
      // a fresh notification context. Retain the one-use ticket in memory and
      // fail closed until the exact notification is reopened.
      publish(Object.freeze({ phase: 'awaiting-notification-context' }));
      return () => controller.abort();
    }
    const isCurrent = () => (
      !controller.signal.aborted
      && operationGenerationRef.current === operationGeneration
    );
    publish(Object.freeze({ phase: 'acknowledging' }));

    void (async () => {
      for (const delay of RETRY_DELAYS_MILLISECONDS) {
        if (!await wait(delay, controller.signal) || !isCurrent()) return;
        try {
          const client = await loadBridgeClient();
          if (!isCurrent()) return;
          const acknowledgeAdmissionGrant = client.acknowledgeAdmissionGrant;
          const result = await withAccessAuthentication(
            loadQuickAuthToken,
            isCurrent,
            authentication => acknowledgeAdmissionGrant(authentication, {
              ticket,
              notificationId,
              expectedFid,
              signal: controller.signal
            })
          );
          if (!isCurrent()) return;
          if (result.status === 'accepted' || result.status === 'already-admitted') {
            finalizationFidRef.current = expectedFid;
            finalizationDeadlineRef.current = Date.now() + FINALIZATION_WAIT_MILLISECONDS;
            try {
              onCapabilityConsumed?.(ticket);
            } catch {
              // Capability cleanup cannot change the server acknowledgement.
            }
            publish(Object.freeze({ phase: 'finalizing' }));
            return;
          }
          if (result.status === 'stale') {
            finalizationDeadlineRef.current = undefined;
            finalizationFidRef.current = undefined;
            try {
              onCapabilityConsumed?.(ticket);
            } catch {
              // A stale capability is still safe to forget locally.
            }
            publish(Object.freeze({ phase: 'stale' }));
            return;
          }
          // A provider receipt may still be settling into the Durable Object
          // immediately after a fast notification launch. Retry only within
          // this small bounded schedule; never resubmit the access request.
        } catch {
          // Quick Auth, network, and bridge availability share the same bounded
          // retry envelope. No mutation is repeated after an accepted reply.
        }
      }
      if (isCurrent()) {
        finalizationDeadlineRef.current = undefined;
        finalizationFidRef.current = undefined;
        publish(Object.freeze({ phase: 'temporary-error' }));
      }
    })();

    return () => controller.abort();
  }, [
    authGeneration,
    authState,
    loadBridgeClient,
    loadQuickAuthToken,
    onCapabilityConsumed,
    available,
    notificationId,
    readTicket
  ]);

  return state;
}
