export class LocalReleaseCandidateLockError extends Error {
  readonly code: string;
  constructor(code: string);
}
/** Mutual exclusion only: not source provenance or verification authority. */
export function acquirePreparedReleaseCandidateLock(candidateRoot: string): Readonly<{
  assertActive(): void;
  release(): void;
}>;
