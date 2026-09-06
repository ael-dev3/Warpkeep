export class LocalBindingRuntimeCoreError extends Error {
  readonly code: string;
}

export function validateLocalBindingYamlManifest(source: string): Readonly<Record<string, unknown>>;

export function validateLocalBindingWorkerRequest<T extends Readonly<Record<string, unknown>>>(value: T): T;

export function validateLocalBindingRuntimeHost(value: Readonly<{
  platform?: string;
  arch?: string;
  uid?: number;
  execPath?: string;
  execArgv?: readonly string[];
  nodeOptions?: string;
  readonly [key: string]: unknown;
}>): void;

export function deriveLocalBindingSourceGraph(root: string): Readonly<{
  root: string;
  entry: string;
  modules: readonly Readonly<Record<string, unknown>>[];
}>;

export function deriveGenesis002LocalBindingSourceGraph(root: string): Readonly<{
  root: string;
  entry: string;
  modules: readonly Readonly<Record<string, unknown>>[];
}>;

export function deriveGenesis001LocalBindingSourceGraph(root: string): Readonly<{
  root: string;
  entry: string;
  modules: readonly Readonly<Record<string, unknown>>[];
}>;

export function deriveGenesis001CompatibilitySourceGraph(root: string): Readonly<{
  root: string;
  entry: string;
  modules: readonly Readonly<Record<string, unknown>>[];
}>;

export function parseLocalBindingWorkerResult(
  source: string,
  nonce: string,
  handoffPath: string,
  workerProfile?: 'warpkeep-local-binding-worker-v1' | 'warpkeep-local-binding-genesis002-worker-v1'
    | 'warpkeep-local-binding-genesis001-worker-v1'
    | 'warpkeep-local-binding-genesis001-compatibility-worker-v1',
): Readonly<Record<string, unknown>>;

export interface LocalBindingCycle {
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly dependencyClosureDigest: string;
  readonly bundleSha256: string;
  readonly bundle: Uint8Array;
  readonly bindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}

export function assertReproducibleLocalBindingCycles<T extends LocalBindingCycle>(left: T, right: LocalBindingCycle): T;

export function runLocalBindingBoundedProcess(
  executable: string,
  args: readonly string[],
  options: Readonly<{
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    fd3?: string;
    timeout: number;
    maxOutput: number;
  }>,
): Promise<Readonly<{ stdout: string; stderr: string }>>;

export function verifyLocalBindingBootstrapSource(source: Readonly<{
  root: string;
  bootstrap: readonly Readonly<{
    path: string;
    bytes: number;
    sha256: string;
    identity: import('./local-binding-bounded-file.mjs').LocalBindingFileIdentity;
  }>[];
}>): void;

export function executeFixedLocalBindingParentCycles(context: Readonly<{
  repositoryRoot: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  source: Readonly<{
    root: string;
    commit: string;
    tree: string;
    bootstrap: readonly Readonly<{
      path: string;
      bytes: number;
      sha256: string;
      identity: import('./local-binding-bounded-file.mjs').LocalBindingFileIdentity;
    }>[];
  }>;
  graph: Readonly<Record<string, unknown>>;
  yaml: Readonly<Record<string, unknown>>;
  cli: Readonly<{ path: string; verify(): void }>;
  readBindingTree(root: string): Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]>
  verifyExecutables(): void;
}>): Promise<LocalBindingCycle>;

export function executeFixedGenesis001LocalBindingParentCycles(context: Readonly<{
  repositoryRoot: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  source: Readonly<{
    root: string;
    commit: string;
    tree: string;
    bootstrap: readonly Readonly<{
      path: string;
      bytes: number;
      sha256: string;
      identity: import('./local-binding-bounded-file.mjs').LocalBindingFileIdentity;
    }>[];
  }>;
  graph: Readonly<Record<string, unknown>>;
  yaml: Readonly<Record<string, unknown>>;
  cli: Readonly<{ path: string; verify(): void }>;
  readBindingTree(root: string): Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]>
  verifyExecutables(): void;
}>): Promise<LocalBindingCycle>;

export function executeFixedGenesis001CompatibilityParent(context: Readonly<{
  repositoryRoot: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  source: Readonly<{
    root: string; commit: string; tree: string;
    bootstrap: readonly Readonly<Record<string, unknown>>[];
  }>;
  graph: Readonly<Record<string, unknown>>;
  yaml: Readonly<Record<string, unknown>>;
  cli: Readonly<{ path: string; verify(): void }>;
  verifyExecutables(): void;
}>): Promise<Readonly<{
  sourceCommit: string;
  sourceTree: string;
  baselineBundleSha256: string;
  frozenBundleSha256: string;
  baselineDescriptorSha256: string;
  frozenDescriptorSha256: string;
  checkedFrozenWriters: readonly string[];
}>>;

export function executeFixedPairedLocalBindingParentCycles(context: Readonly<{
  repositoryRoot: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  source: Readonly<{
    root: string;
    commit: string;
    tree: string;
    bootstrap: readonly Readonly<{
      path: string;
      bytes: number;
      sha256: string;
      identity: import('./local-binding-bounded-file.mjs').LocalBindingFileIdentity;
    }>[];
  }>;
  graphs: Readonly<{ genesis002: Readonly<Record<string, unknown>>; ptr: Readonly<Record<string, unknown>> }>;
  yaml: Readonly<Record<string, unknown>>;
  cli: Readonly<{ path: string; verify(): void }>;
  readBindingTree(root: string): Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]>
  verifyExecutables(): void;
}>): Promise<Readonly<{ genesis002: LocalBindingCycle; ptr: LocalBindingCycle }>>;

export function preserveLocalBindingRuntimePrimaryAndCleanup(
  primaryError: unknown | undefined,
  cleanupError: unknown | undefined,
): void;

export function deriveFixedLocalBindingRuntime(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bundleSha256: string;
  dependencyClosureDigest: string;
  bindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>>;

export function deriveFixedPairedLocalBindingRuntime(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  genesis002: Readonly<{
    bundleSha256: string;
    dependencyClosureDigest: string;
    bindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
  }>;
  ptr: Readonly<{
    bundleSha256: string;
    dependencyClosureDigest: string;
    bindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
  }>;
}>>;

export function deriveFixedGenesis001LocalCompilation(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bundleSha256: string;
  dependencyClosureDigest: string;
  diagnosticBindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>>;

export function deriveFixedGenesis001LocalCompatibility(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  baselineBundleSha256: string;
  frozenBundleSha256: string;
  baselineDescriptorSha256: string;
  frozenDescriptorSha256: string;
  checkedFrozenWriters: readonly string[];
}>>;
