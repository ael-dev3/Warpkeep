export const NATIVE_VERIFICATION_PROFILE: 'warpkeep-native-source-test-partitions-v1';
export const NATIVE_SOURCE_CHECKS_PROFILE: 'warpkeep-native-source-checks-v1';
export const NAMESPACE_FILES: readonly string[];
export const REQUIRED_NATIVE_DOMAINS: readonly string[];
export type NativeTestPartitions = Readonly<{ ordinaryVitestFiles: string[]; namespaceVitestFiles: string[]; moduleFiles: string[] }>;
export type NativeTestCommand = Readonly<{ id: string; kind: 'vitest-json' | 'node-events'; files: readonly string[];
  cwd: string; executable: string; args: readonly string[]; reportPath: string; deadlineMs: number }>;
export function deriveNativeTestPartitions(paths: readonly string[], viteConfig: string | Uint8Array, modulePackage: string | Uint8Array): NativeTestPartitions;
export function nativeTestCommands(root: string, partitions: NativeTestPartitions,
  tools: Readonly<{ node: Readonly<{ path: string }>; vitest: Readonly<{ path: string }>; tsx: Readonly<{ path: string }> }>, stem: string): readonly NativeTestCommand[];
export type NativeSourceCheckCommand = Readonly<{ id: string; kind: 'terminal-check' | 'gitleaks-json'; files: readonly string[];
  cwd: string; executable: string; args: readonly string[]; reportPath: string; deadlineMs: number;
  environment: Readonly<Record<string, string>>; script?: string; scriptSha256?: string;
  buildVariant?: 'default' | 'github-pages' | 'canonical-pages' }>;
export function nativeSourceCheckCommands(root: string, tools: Readonly<{
  node: Readonly<{ path: string }>; pnpm: Readonly<{ path: string }>; gitleaks: Readonly<{ path: string }>;
}>, stem: string, packageBytes: string | Uint8Array): readonly NativeSourceCheckCommand[];
export type NativeNamespaceOwner = Readonly<{ uid: number; gid: number; pid: number; pgid: number; bootId: string; identity: string }>;
export type NativeNamespaceMember = Readonly<{ pid: number; pgid: number; identity: string }>;
export function nativeNamespaceCleanupCommand(root: string, owner: NativeNamespaceOwner, member: NativeNamespaceMember,
  signal: string): Readonly<{ executable: string; args: readonly string[] }>;
export function createNativeVerificationPlan(planPath: string): Readonly<{ path: string; sha256: string }>;
export function createNativeSourceChecksPlan(planPath: string): Readonly<{ path: string; sha256: string }>;
export function runNativeVerificationPlan(planPath: string, digest: string, stem: string): Promise<Readonly<{
  path: string; sha256: string; allRecorded: boolean; allTestsPassed: boolean; allChecksPassed: boolean; completeCoverage: false; productionAuthorized: false;
}>>;
/** This first tranche never returns a source-authority proof. */
export function requireCompleteNativeSourceVerificationEvidence(locator: string, commit: string): never;
