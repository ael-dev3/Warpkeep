import type { RealmEconomicResourceKey } from '../components/realm/realmResourcePresentation';
import { createExpeditionIdempotencyKey } from './expeditionIdempotencyKey';

export type WorkerCommandFingerprint =
  | Readonly<{
      kind: 'dispatch';
      workerId: string;
      resourceKind: RealmEconomicResourceKey;
      siteId: string;
    }>
  | Readonly<{ kind: 'recall'; workerId: string }>
  | Readonly<{ kind: 'recall-all'; castleId: number }>;

export type WorkerCommandAttempt = Readonly<{
  generation: number;
  fingerprint: string;
  lifecycleFingerprint: string;
  idempotencyKey: string;
}>;

export type WorkerCommandLifecycleState = Readonly<{
  castleId: number;
  workers: readonly Readonly<{
    workerId: string;
    status: string;
    resourceKind?: RealmEconomicResourceKey;
    siteId?: string;
    revision: bigint;
  }>[];
}>;

export function serializeWorkerCommandFingerprint(command: WorkerCommandFingerprint) {
  if (command.kind === 'dispatch') {
    return `dispatch\u0000${command.workerId}\u0000${command.resourceKind}\u0000${command.siteId}`;
  }
  if (command.kind === 'recall') return `recall\u0000${command.workerId}`;
  return `recall-all\u0000${command.castleId}`;
}

function workerLifecycleRecord(
  worker: WorkerCommandLifecycleState['workers'][number]
) {
  return [
    worker.workerId,
    worker.status,
    worker.resourceKind ?? '',
    worker.siteId ?? '',
    worker.revision.toString()
  ].join('\u0000');
}

/**
 * Bind a retained retry key to the exact authoritative worker lifecycle that
 * first issued it. Once a private roster refresh observes any later revision
 * or state, reusing the old receipt can no longer describe the current
 * command and must fail closed to a fresh key.
 */
export function workerCommandLifecycleFingerprint(
  command: WorkerCommandFingerprint,
  state: WorkerCommandLifecycleState
): string | undefined {
  if (!Number.isSafeInteger(state.castleId) || state.castleId <= 0) return undefined;
  if (command.kind === 'recall-all') {
    if (command.castleId !== state.castleId || state.workers.length === 0) return undefined;
    const workers = [...state.workers].sort((left, right) => (
      left.workerId.localeCompare(right.workerId)
    ));
    if (new Set(workers.map((worker) => worker.workerId)).size !== workers.length) return undefined;
    return workers.map(workerLifecycleRecord).join('\u0001');
  }
  const matches = state.workers.filter((worker) => worker.workerId === command.workerId);
  return matches.length === 1 ? workerLifecycleRecord(matches[0]!) : undefined;
}

export function workerCommandAttemptMatchesLifecycle(
  attempt: WorkerCommandAttempt,
  generation: number,
  state: WorkerCommandLifecycleState
) {
  return attempt.generation === generation
    && workerCommandLifecycleFingerprint(
      deserializeWorkerCommandFingerprint(attempt.fingerprint),
      state
    ) === attempt.lifecycleFingerprint;
}

function deserializeWorkerCommandFingerprint(fingerprint: string): WorkerCommandFingerprint {
  const fields = fingerprint.split('\u0000');
  if (fields[0] === 'dispatch' && fields.length === 4) {
    return {
      kind: 'dispatch',
      workerId: fields[1]!,
      resourceKind: fields[2] as RealmEconomicResourceKey,
      siteId: fields[3]!
    };
  }
  if (fields[0] === 'recall' && fields.length === 2) {
    return { kind: 'recall', workerId: fields[1]! };
  }
  if (fields[0] === 'recall-all' && fields.length === 2) {
    return { kind: 'recall-all', castleId: Number(fields[1]) };
  }
  return { kind: 'recall-all', castleId: Number.NaN };
}

/**
 * Commit-ambiguous retries reuse a key only for the exact same command.
 * Changing worker, resource, site, command kind, castle, or connection
 * generation necessarily creates a fresh server receipt identity.
 */
export function workerCommandAttemptFor(
  retained: WorkerCommandAttempt | undefined,
  generation: number,
  command: WorkerCommandFingerprint,
  lifecycleState: WorkerCommandLifecycleState,
  createKey: () => string | undefined = createExpeditionIdempotencyKey
): WorkerCommandAttempt | undefined {
  const fingerprint = serializeWorkerCommandFingerprint(command);
  const lifecycleFingerprint = workerCommandLifecycleFingerprint(command, lifecycleState);
  if (lifecycleFingerprint === undefined) return undefined;
  if (
    retained?.generation === generation
    && retained.fingerprint === fingerprint
    && retained.lifecycleFingerprint === lifecycleFingerprint
  ) {
    return retained;
  }
  const idempotencyKey = createKey();
  return idempotencyKey === undefined
    ? undefined
    : Object.freeze({ generation, fingerprint, lifecycleFingerprint, idempotencyKey });
}
