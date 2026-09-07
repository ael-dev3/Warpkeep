export class LocalReleaseCandidateLockError extends Error {
  readonly code: string;
  constructor(code: string);
}
export interface PreparedReleaseCandidateLock {
  assertActive(): void;
  release(): void;
}
/** Mutual exclusion only: not source provenance or verification authority. */
export function acquirePreparedReleaseCandidateLock(candidateRoot: string): Readonly<PreparedReleaseCandidateLock>;
/** Requires a live matching lease minted by this module. */
export function assertPreparedReleaseCandidateLock(lease: unknown, candidateRoot: string): void;
