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
  idempotencyKey: string;
}>;

export function serializeWorkerCommandFingerprint(command: WorkerCommandFingerprint) {
  if (command.kind === 'dispatch') {
    return `dispatch\u0000${command.workerId}\u0000${command.resourceKind}\u0000${command.siteId}`;
  }
  if (command.kind === 'recall') return `recall\u0000${command.workerId}`;
  return `recall-all\u0000${command.castleId}`;
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
  createKey: () => string | undefined = createExpeditionIdempotencyKey
): WorkerCommandAttempt | undefined {
  const fingerprint = serializeWorkerCommandFingerprint(command);
  if (retained?.generation === generation && retained.fingerprint === fingerprint) {
    return retained;
  }
  const idempotencyKey = createKey();
  return idempotencyKey === undefined
    ? undefined
    : Object.freeze({ generation, fingerprint, idempotencyKey });
}
