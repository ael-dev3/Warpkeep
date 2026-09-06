export interface PreparedReleaseFileFact {
  readonly dev: string;
  readonly ino: string;
  readonly uid: 1000;
  readonly mode: 384 | 420;
  readonly size: number;
  readonly sha256: string;
}
export interface PreparedReleaseJournal {
  readonly schemaVersion: 1;
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly transactionId: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly candidate: Readonly<{ dev: string; ino: string; uid: 1000; mode: 448 }>;
  readonly entries: readonly Readonly<{
    path: string;
    before: Readonly<{ target: PreparedReleaseFileFact; backup: PreparedReleaseFileFact }> | null;
    after: PreparedReleaseFileFact;
  }>[];
}
export interface PreparedReleaseObservation {
  readonly path: string;
  readonly target: PreparedReleaseFileFact | null;
  readonly backup: PreparedReleaseFileFact | null;
  readonly stage: PreparedReleaseFileFact | null;
}
export class LocalReleaseRecoveryJournalError extends Error {
  readonly code: string;
  constructor(code?: string);
}
export function encodePreparedReleaseJournal(record: unknown): Uint8Array;
export function decodePreparedReleaseJournal(bytes: unknown): PreparedReleaseJournal;
export function planPreparedReleaseRollback(input: unknown): readonly Readonly<{
  path: string;
  operation: 'retain' | 'restore-backup' | 'remove-created';
}>[];
