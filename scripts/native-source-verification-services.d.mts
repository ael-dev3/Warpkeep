export const NATIVE_SERVICE_CHECKS_PROFILE: 'warpkeep-native-service-checks-v1';
/** Exact source-owned package/lock/config byte identities; no caller exemptions. */
export const NATIVE_SERVICE_SOURCE_INPUTS: Readonly<Record<string, string>>;
export const NATIVE_SERVICE_PREREQUISITES: Readonly<{
  serviceRoots: readonly string[];
  forbiddenConfigBasenames: readonly string[];
  forbiddenConfigPrefixes: readonly string[];
  allowedExamplePaths: readonly string[];
  forbiddenConfigDirectories: readonly string[];
  requiredSourceInputs: readonly string[];
  installedInputs: readonly Readonly<{ serviceRoot: string; dependency: string;
    sourcePackagePath: string; packagePath: string; entryPath: string }>[];
  completeCoverage: false; productionAuthorized: false;
}>;
export type NativeServicePartition = Readonly<{
  ordinaryVitestFiles: readonly string[]; workerdVitestFiles: readonly string[];
}>;
export type NativeServicePartitions = Readonly<{
  profile: 'warpkeep-native-service-checks-v1';
  authBridge: NativeServicePartition; releaseRecovery: NativeServicePartition;
  completeCoverage: false; productionAuthorized: false;
}>;
export type NativeServiceTools = Readonly<{
  node: Readonly<{ path: string }>; pnpm: Readonly<{ path: string }>;
  authBridge: Readonly<{ vitest: Readonly<{ path: string }> }>;
  releaseRecovery: Readonly<{ vitest: Readonly<{ path: string }>; wrangler: Readonly<{ path: string }> }>;
}>;
export type NativeServiceCommand = Readonly<{
  id: string; service: 'services/auth-bridge' | 'services/release-recovery';
  kind: 'terminal-check' | 'vitest-json'; files: readonly string[];
  cwd: string; executable: string; args: readonly string[];
  reportPath: string; deadlineMs: number; environment: Readonly<Record<string, string>>;
  script?: 'typecheck' | 'typecheck:workerd' | 'test' | 'test:workerd'; scriptSha256?: string;
  report?: Readonly<{ kind: 'vitest-json'; repositoryRoot: string;
    expectedFiles: readonly string[]; childTerminalRequired: true }>;
}>;
/** Pure derivation; caller must separately bind actual source identities and installed tools. */
export function deriveNativeServicePartitions(paths: readonly string[],
  inputBytesByPath: Readonly<Record<string, string | Uint8Array>>): NativeServicePartitions;
/** Fixed commands/report descriptors only; no process execution or acceptance proof. */
export function nativeServiceCommands(root: string, partitions: NativeServicePartitions,
  tools: NativeServiceTools, stem: string): readonly NativeServiceCommand[];
