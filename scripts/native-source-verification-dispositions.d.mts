import type { NativeParsedReport } from './native-source-verification-reports.mjs';
import type { NativeTestCommand } from './native-source-verification.mjs';

export const NATIVE_NAMESPACE_DISPOSITION_PROFILE: 'warpkeep-native-namespace-dispositions-linux-x64-v1';
export const NATIVE_NAMESPACE_DISPOSITION_SOURCES: readonly Readonly<{ path: string; sha256: string }>[];
export type NativeNamespaceDispositionContext = Readonly<{
  target: Readonly<{ platform: string; arch: string; uid: number; gid: number }>;
  command: NativeTestCommand;
  /** Actual sourceSnapshot facts; supplied hashes are not independently authenticated here. */
  sourceFiles: readonly Readonly<{ path: string; sha256: string }>[];
}>;
export type NativeNamespaceDispositionAssessment = Readonly<{
  profile: 'warpkeep-native-namespace-dispositions-linux-x64-v1';
  profileSatisfied: true;
  rawAllTestsPassed: false;
  rawCounts: Readonly<{ passed: number; failed: number; skipped: number; todo: number; pending: number }>;
  rawSuiteCounts: Readonly<{ total: number; failed: 0; pending: 0 }>;
  acceptedSkipped: readonly Readonly<{ file: string; title: string; status: 'skipped'; reason: string }>[];
  declaredSources: readonly Readonly<{ path: string; sha256: string }>[];
  isolation: Readonly<{ platform: 'linux'; arch: 'x64'; uid: number; gid: number;
    launcherPath: string; requiredSyntheticNetwork: '1' }>;
  childTerminalRequired: true;
  scope: string;
}>;
/** No filesystem/process effects or authentication. Unknown/changed skips and failed terminals reject.
 * Does not change raw statuses/counts/success, waive ordinary skips or mint complete source proof.
 */
export function assessNativeNamespaceDispositions(parsed: NativeParsedReport & Readonly<{
  reportSuccess: boolean; failedSuiteCount: number; pendingSuiteCount: number;
}>,
  context: NativeNamespaceDispositionContext): NativeNamespaceDispositionAssessment;
