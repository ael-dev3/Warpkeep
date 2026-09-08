/** Native restoration status only; this never grants release authority. */
export function recoverPreparedReleaseTransaction(candidateRoot: string, transactionId: string): Readonly<{
  status: 'rolled-back';
  transactionId: string;
}>;
/** Requires a genuine active matching lease; leaves it held on every outcome. */
export function recoverPreparedReleaseTransactionUnderLock(candidateRoot: string, transactionId: string,
  lease: Readonly<import('./local-release-candidate-lock.mjs').PreparedReleaseCandidateLock>): Readonly<{
  status: 'rolled-back';
  transactionId: string;
}>;
