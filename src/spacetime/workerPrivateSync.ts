import type {
  ReadyWorkerResourceState,
  WorkerRosterPresentation
} from '../components/realm/realmWorkerPresentation';
import type {
  WarpkeepWorkerPrivateSyncFailureReason,
  WarpkeepWorkerPrivateSyncPhase,
  WarpkeepWorkerPrivateSyncStatus
} from './warpkeepBackendTypes';

export const WORKER_PRIVATE_SYNC_FAILURE_REASONS: readonly WarpkeepWorkerPrivateSyncFailureReason[] =
  Object.freeze([
    'roster-procedure-unavailable',
    'resource-procedure-unavailable',
    'control-state-procedure-unavailable',
    'roster-timeout',
    'resource-timeout',
    'control-state-timeout',
    'procedure-rejected',
    'roster-decode-invalid',
    'resource-decode-invalid',
    'control-state-decode-invalid',
    'wrong-caller',
    'stale-generation',
    'public-graph-changed',
    'public-private-worker-revision-mismatch',
    'worker-status-or-site-mismatch',
    'pending-total-mismatch',
    'resource-policy-mismatch',
    'worker-policy-mismatch',
    'worker-system-mode-mismatch',
    'coherent-pair-exhausted',
    'unknown-localized'
  ]);

/** Initial attempt plus these three deterministic retries form one bounded burst. */
export const WORKER_PRIVATE_SYNC_RETRY_DELAYS_MILLISECONDS =
  Object.freeze([250, 1_000, 4_000] as const);

/** After a failed burst, keep retrying reads slowly while the Realm is active. */
export const WORKER_PRIVATE_SYNC_LOW_FREQUENCY_RETRY_MILLISECONDS = 30_000;

export function workerPrivateSyncStatus(input: Readonly<{
  phase: WarpkeepWorkerPrivateSyncPhase;
  attempt?: number;
  queuedRefresh?: boolean;
  retainedStale?: boolean;
  localizedFailureCount?: number;
  commandsEnabled?: boolean;
  failureReason?: WarpkeepWorkerPrivateSyncFailureReason;
  lastSuccessGeneration?: number;
  lastSuccessRevision?: string;
  readyLatencyMilliseconds?: number;
}>): WarpkeepWorkerPrivateSyncStatus {
  return Object.freeze({
    phase: input.phase,
    attempt: input.attempt ?? 0,
    queuedRefresh: input.queuedRefresh ?? false,
    retainedStale: input.retainedStale ?? false,
    localizedFailureCount: input.localizedFailureCount ?? 0,
    // Keep one fail-closed invariant for every consumer: a command-capable
    // pair is always in the ready phase. Background reads may remain ready
    // only while the retained pair still validates against latest public truth.
    commandsEnabled: input.phase === 'ready' && input.commandsEnabled === true,
    ...(input.phase === 'ready' || input.phase === 'not-required' || input.failureReason === undefined
      ? {}
      : { failureReason: input.failureReason }),
    ...(input.lastSuccessGeneration === undefined
      ? {}
      : { lastSuccessGeneration: input.lastSuccessGeneration }),
    ...(input.lastSuccessRevision === undefined
      ? {}
      : { lastSuccessRevision: input.lastSuccessRevision }),
    ...(input.readyLatencyMilliseconds === undefined
      ? {}
      : { readyLatencyMilliseconds: Math.max(0, Math.round(input.readyLatencyMilliseconds)) })
  });
}

/**
 * Aggregate freshness marker only. It contains no FID, balance, worker ID, or
 * procedure data and is suitable for privacy-bounded lifecycle telemetry.
 */
export function workerPrivatePairRevision(
  roster: WorkerRosterPresentation,
  resourceState: ReadyWorkerResourceState
) {
  const latestWorkerRevision = roster.workers.reduce(
    (latest, worker) => worker.revision > latest ? worker.revision : latest,
    0n
  );
  return `resource:${resourceState.revision};roster:${latestWorkerRevision}`;
}
