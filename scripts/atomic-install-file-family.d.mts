export const ATOMIC_FAMILY_TRANSACTION_PREFIX: string;

export function assertNoStaleAtomicFamilyTransactions(
  destinationRoot: string,
  label?: string
): void;

export interface AtomicFamilyInput {
  bytes: Buffer;
  label?: string;
  relativePath: string;
}

export interface AtomicFamilyTransactionEntry extends AtomicFamilyInput {
  backup?: string;
  destination: string;
  index: number;
  label: string;
  stage?: string;
}

export type AtomicFamilyFailureContext =
  | { phase: 'afterPreflight'; entries: AtomicFamilyTransactionEntry[] }
  | {
      phase: 'afterStage' | 'beforePostVerify' | 'afterPostVerify';
      entries: AtomicFamilyTransactionEntry[];
      transactionRoot: string;
    }
  | {
      phase: 'afterBackup' | 'afterReplace';
      destination: string;
      entry: AtomicFamilyTransactionEntry;
      index: number;
      transactionRoot: string;
    };

export function resolveContainedPath(
  root: string,
  relativePath: string,
  label?: string
): string;

export function ensureContainedDirectory(options: {
  root: string;
  relativePath: string;
  label: string;
}): string;

export function readContainedRegularFile(options: {
  root: string;
  relativePath: string;
  label: string;
  expectedBytes?: number;
}): Buffer;

export function installAtomicFileFamily(options: {
  destinationRoot: string;
  entries: AtomicFamilyInput[];
  injectFailure?: (context: AtomicFamilyFailureContext) => void;
}): void;
