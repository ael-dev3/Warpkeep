export type NativeAssertion = Readonly<{ file: string; title: string; status: 'passed' | 'failed' | 'skipped' | 'todo' | 'pending' }>;
export type NativeParsedReport = Readonly<{
  kind: string; files: string[]; assertions: NativeAssertion[]; suiteCount: number;
  passed: number; failed: number; skipped: number; todo: number; pending: number;
  complete: boolean; success: boolean; runtimeFailures: readonly unknown[]; childTerminalRequired: true;
  fileFailureCount?: number; runnerTestCount?: number; nodeVersion?: string; diagnostics?: readonly string[];
  runtimeErrorScope?: string;
}>;
export function parseVitestReport(bytes: string | Uint8Array, options: Readonly<{ repositoryRoot: string; expectedFiles: readonly string[] }>): NativeParsedReport;
export function parseNodeEvents(bytes: string | Uint8Array, options: Readonly<{ repositoryRoot: string; expectedFiles: readonly string[] }>): NativeParsedReport;
