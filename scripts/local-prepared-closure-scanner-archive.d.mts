/** Validates archive data, not source, package or execution authority. */
export function derivePreparedClosureScannerArchiveFiles(archive: Buffer, integrity: string): readonly Readonly<{
  path: string; bytes: Buffer;
}>[];
