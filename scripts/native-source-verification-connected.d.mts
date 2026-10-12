export const NATIVE_CONNECTED_MODULE_PROFILE: 'warpkeep-native-connected-module-v1';
export const NATIVE_CONNECTED_SOURCE_INPUTS: Readonly<Record<string, string>>;
export const NATIVE_CONNECTED_PREREQUISITES: Readonly<{
  requiredSourceInputs: readonly string[]; moduleRoots: readonly string[];
  migrationFixtureRoots: readonly string[]; metadataRoots: readonly string[];
  forbiddenConfigBasenames: readonly string[]; forbiddenConfigPrefixes: readonly string[];
  allowedExamplePaths: readonly string[]; forbiddenConfigDirectories: readonly string[];
  forbiddenBinBasenames: readonly string[]; requiredAbsentPaths: readonly string[];
  installedInputs: readonly Readonly<{ dependency: string; expectedVersion: string;
    sourcePackagePath: string; packagePath: string; entryPath: string }>[];
  spacetimeCliVersion: '2.6.1'; standaloneBinaryRequired: true;
  detachedLoopbackGroupEvidenceRequired: true; completeCoverage: false; productionAuthorized: false;
}>;
export type NativeConnectedModuleRecipe = Readonly<{
  profile: 'warpkeep-native-connected-module-v1'; moduleRoots: readonly string[];
  buildFixtureRoots: readonly string[]; migrationFixtureRoots: readonly string[];
  scriptPaths: readonly string[]; modulePureTests: 'separate-source-test-partition';
  completeCoverage: false; productionAuthorized: false;
}>;
export type NativeConnectedModuleTools = Readonly<{
  node: Readonly<{ path: string }>; spacetime: Readonly<{ path: string }>;
  typescript: Readonly<{ path: string }>; tsx: Readonly<{ path: string }>;
}>;
export type NativeConnectedOutputContract = Readonly<{
  kind: 'terminal' | 'genesis002-loopback-json' | 'additive-protocol-v18-receipt';
  assertionCounts: false; terminalAndCleanupRequired: true;
  schemaVersion?: 1; profile?: 'warpkeep-genesis-002-private-loopback-v1';
  tableCount?: 23; procedureCount?: 2; requiredTrueFields?: readonly string[];
  parserSourcePath?: 'scripts/spacetime-additive-migration-proof.mjs';
}>;
export type NativeConnectedModuleCommand = Readonly<{
  id: string; kind: 'terminal-check'; files: readonly string[];
  cwd: string; executable: string; args: readonly string[];
  reportPath: string; deadlineMs: number; environment: Readonly<{ SPACETIME_BIN: string }>;
  outputContract: NativeConnectedOutputContract;
  ownership: Readonly<{ separateGroupEvidenceRequired: boolean }>;
  sourcePackagePath?: string; sourceScript?: string; sourceScriptSha256?: string;
  sourcePath?: string; sourceSha256?: string; moduleRoot?: string;
  buildOutput?: Readonly<{ path: string; maximumBytes: number }>;
}>;
/** No effects or source authority. All captured inputs must match the fixed source recipe. */
export function deriveNativeConnectedModuleRecipe(paths: readonly string[],
  inputBytesByPath: Readonly<Record<string, string | Uint8Array>>): NativeConnectedModuleRecipe;
/** Direct already-attested paths only; the producer owns terminal/output parsing and detached-group proofs. */
export function nativeConnectedModuleCommands(root: string, recipe: NativeConnectedModuleRecipe,
  tools: NativeConnectedModuleTools, stem: string): readonly NativeConnectedModuleCommand[];
