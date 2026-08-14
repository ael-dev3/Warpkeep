import {
  requireOwnerCanaryPlayerEvidence,
} from './ownerCanaryController';
import type { OwnerCanarySanitizedEvidence } from './ownerCanaryEvidence';
import type { OwnerCanaryReviewedPollPolicy } from './ownerCanaryEvidenceRuntime';

export const OWNER_CANARY_PRODUCTION_POLL_INTERVAL_MILLISECONDS = 5_000;
export const OWNER_CANARY_PRODUCTION_POLL_MAXIMUM_ATTEMPTS = 96;

/** Exact reviewed, abort-aware production cadence. No caller-selected delay. */
export function waitForOwnerCanaryProductionPoll(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (
    milliseconds !== OWNER_CANARY_PRODUCTION_POLL_INTERVAL_MILLISECONDS
    || signal.aborted
  ) return Promise.reject(new DOMException('The owner canary poll stopped.', 'AbortError'));
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      clearTimeout(timeout);
      if (error === undefined) resolve();
      else reject(error);
    };
    const onAbort = () => settle(new DOMException(
      'The owner canary poll stopped.',
      'AbortError',
    ));
    const timeout = globalThis.setTimeout(
      () => settle(),
      OWNER_CANARY_PRODUCTION_POLL_INTERVAL_MILLISECONDS,
    );
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

/** Reviewed values, exported for a future audited loader composition only. */
export const OWNER_CANARY_PRODUCTION_POLL_POLICY: OwnerCanaryReviewedPollPolicy =
  Object.freeze({
    intervalMilliseconds: OWNER_CANARY_PRODUCTION_POLL_INTERVAL_MILLISECONDS,
    maximumAttempts: OWNER_CANARY_PRODUCTION_POLL_MAXIMUM_ATTEMPTS,
    wait: waitForOwnerCanaryProductionPoll,
  });

/**
 * Branded, in-process completion acknowledgement. It deliberately performs no
 * I/O and cannot create a receipt, journal entry, handoff, or release authority.
 */
export function acknowledgeOwnerCanarySanitizedEvidenceInProcess(
  evidence: OwnerCanarySanitizedEvidence,
): void {
  void requireOwnerCanaryPlayerEvidence(evidence);
}
