/** Read-only data comparison, not package or execution authority. */
export function assertPreparedClosureScannerNamespace(root: string, records: readonly Readonly<{
  path: string; bytes: number; sha256: string; mode: number;
}>[]): void;
