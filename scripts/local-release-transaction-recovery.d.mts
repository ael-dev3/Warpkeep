/** Native restoration status only; this never grants release authority. */
export function recoverPreparedReleaseTransaction(candidateRoot: string, transactionId: string): Readonly<{
  status: 'rolled-back';
  transactionId: string;
}>;
