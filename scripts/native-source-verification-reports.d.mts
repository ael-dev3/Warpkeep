export type NativeAssertion = Readonly<{ file: string; title: string; status: 'passed' | 'failed' | 'skipped' | 'todo' | 'pending' }>;
export type NativeParsedReport = Readonly<{
  kind: string; files: string[]; assertions: NativeAssertion[]; suiteCount: number;
  passed: number; failed: number; skipped: number; todo: number; pending: number;
  complete: boolean; success: boolean; runtimeFailures: readonly unknown[]; childTerminalRequired: true;
  fileFailureCount?: number; runnerTestCount?: number; nodeVersion?: string; diagnostics?: readonly string[];
  runtimeErrorScope?: string;
}>;
/** Retain reporter terminal/suite fields separately from strict raw all-leaf success. */
export type NativeVitestParsedReport = NativeParsedReport & Readonly<{
  reportSuccess: boolean; failedSuiteCount: number; pendingSuiteCount: number;
}>;
export function parseVitestReport(bytes: string | Uint8Array, options: Readonly<{ repositoryRoot: string; expectedFiles: readonly string[] }>): NativeVitestParsedReport;
export function parseNodeEvents(bytes: string | Uint8Array, options: Readonly<{ repositoryRoot: string; expectedFiles: readonly string[] }>): NativeParsedReport;
