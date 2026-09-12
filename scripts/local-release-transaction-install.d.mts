/** Internal rollback-capable publication only; does not mark a release prepared. */
import type { PreparedReleaseCandidateLock } from './local-release-candidate-lock.mjs';
export type PreparedReleaseTransactionInput = Readonly<{
  candidateRoot: string;
  sourceCommit: string;
  sourceTree: string;
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>;
export function installPreparedReleaseTransaction(input: PreparedReleaseTransactionInput): Readonly<{ status: 'installed-unverified'; transactionId: string }>;
/** Does not release the supplied authenticated kernel lease. */
export function installPreparedReleaseTransactionUnderLock(input: PreparedReleaseTransactionInput,
  lock: Readonly<PreparedReleaseCandidateLock>): Readonly<{ status: 'installed-unverified'; transactionId: string }>;
