export class LocalBindingRuntimeCoreError extends Error {
  readonly code: string;
}

export const localBindingRuntimeTestSeams: Readonly<{
  createGenesis001CurrentFixedGitBoundary(
    operationRoot: string,
    baseEnvironment: Readonly<Record<string, string | undefined>>,
    expectedGitIdentity?: import('./local-binding-bounded-file.mjs').LocalBindingFileIdentity,
  ): Readonly<{
    git(cwd: string, args: readonly string[], maxBuffer?: number): string;
    read(cwd: string, args: readonly string[], maxBuffer?: number): Buffer;
    chmod(path: string, mode: number): void;
    prepare(root: string): void;
    attest(root: string): void;
  }>;
  initializeGenesis001CurrentIndependentSnapshot(
    input: Readonly<{ repositoryRoot: string; root: string; commit: string; tree: string }>,
    boundary: Readonly<{
      git(cwd: string, args: readonly string[], maxBuffer?: number): string;
      chmod(path: string, mode: number): void;
      prepare?(root: string): void;
      attest(root: string): void;
    }>,
  ): Readonly<{
    root: string;
    commit: string;
    tree: string;
    kind: 'independent-clone';
  }>;
  runLocalBindingRuntimeLifecycle<T>(input: Readonly<{
    execute(): T | Promise<T>;
    cleanupCli(): void;
    retainDiagnosticsOnCleanupFailure: boolean;
    cleanupSuccess(): void;
  }>): Promise<T>;
  withAllRealmParentExecutors<T extends Readonly<Record<string, unknown>>>(
    context: T,
    executors: Readonly<{
      current(context: unknown): Promise<unknown>;
      compatibility(context: unknown): Promise<unknown>;
      paired(context: unknown): Promise<unknown>;
    }>,
  ): T;
}>;

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

export function deriveGenesis001CurrentLocalBindingSourceGraph(root: string): Readonly<{
  root: string;
  entry: string;
  modules: readonly Readonly<Record<string, unknown>>[];
}>;

export function deriveGenesis001CompatibilitySourceGraph(root: string): Readonly<{
  root: string;
  entry: string;
  modules: readonly Readonly<Record<string, unknown>>[];
}>;

export function deriveOperationBundlePackageSourceGraph(root: string): Readonly<{
  root: string;
  entry: 'scripts/local-operation-bundle-packages.ts';
  modules: readonly Readonly<Record<string, unknown>>[];
}>;

export function captureFixedOperationBundleSource(input: Readonly<{
  repositoryRoot: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  gitIdentity: import('./local-binding-bounded-file.mjs').LocalBindingFileIdentity;
}>): Readonly<{
  root: string;
  commit: string;
  tree: string;
  kind: 'independent-clone';
  bootstrap: readonly Readonly<{
    path: string;
    bytes: number;
    sha256: string;
    identity: import('./local-binding-bounded-file.mjs').LocalBindingFileIdentity;
  }>[];
  git(cwd: string, args: readonly string[], maxBuffer?: number): string;
  gitBuffer(cwd: string, args: readonly string[], maxBuffer?: number): Buffer;
  materialize(destination: string): Readonly<{
    root: string; commit: string; tree: string; kind: 'independent-clone';
  }>;
  verify(): void;
  verifyMaterialization(destination: string): void;
}>;

export function parseLocalBindingWorkerResult(
  source: string,
  nonce: string,
  handoffPath: string,
  workerProfile?: 'warpkeep-local-binding-worker-v1' | 'warpkeep-local-binding-genesis002-worker-v1'
    | 'warpkeep-local-binding-genesis001-worker-v1'
    | 'warpkeep-local-binding-genesis001-current-worker-v1'
    | 'warpkeep-local-binding-genesis001-compatibility-worker-v1',
): Readonly<Record<string, unknown>>;

export function parseGenesis001CurrentCommittedBindingListing(listing: Buffer): readonly Readonly<{
  object: string;
  path: string;
  sourcePath: string;
  size: number;
}>[];

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
    containProcessGroup?: boolean;
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

export function executeFixedGenesis001CurrentBindingParentCycles(context: Readonly<{
  repositoryRoot: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  source: Readonly<{
    root: string;
    commit: string;
    tree: string;
    bootstrap: readonly Readonly<Record<string, unknown>>[];
  }>;
  graph: Readonly<Record<string, unknown>>;
  yaml: Readonly<Record<string, unknown>>;
  cli: Readonly<{ path: string; verify(): void }>;
  readBindingTree(root: string): Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]>
  readCommittedBindings(): readonly Readonly<{ path: string; bytes: Uint8Array }>[]
    | Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]>
  recordBindingMismatch?(
    expected: readonly Readonly<{ path: string; bytes: Uint8Array }>[],
    actual: readonly Readonly<{ path: string; bytes: Uint8Array }>[],
  ): void;
  verifyExecutables(): void;
}>): Promise<LocalBindingCycle & Readonly<{ bindingFileCount: number }>>;

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

export function executeFixedAllRealmLocalBindingParentCycles(context: Readonly<{
  repositoryRoot: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  source: Readonly<{
    root: string;
    commit: string;
    tree: string;
    bootstrap: readonly Readonly<Record<string, unknown>>[];
  }>;
  graphs: Readonly<{
    genesis001Current: Readonly<Record<string, unknown>>;
    genesis001Compatibility: Readonly<Record<string, unknown>>;
    genesis002: Readonly<Record<string, unknown>>;
    ptr: Readonly<Record<string, unknown>>;
  }>;
  yaml: Readonly<Record<string, unknown>>;
  cli: Readonly<{ path: string; verify(): void }>;
  readBindingTree(root: string): Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]>;
  readCommittedBindings(): readonly Readonly<{ path: string; bytes: Uint8Array }>[]
    | Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]>
  recordBindingMismatch?(
    expected: readonly Readonly<{ path: string; bytes: Uint8Array }>[],
    actual: readonly Readonly<{ path: string; bytes: Uint8Array }>[],
  ): void;
  verifyExecutables(): void;
}>): Promise<Readonly<{
  current: LocalBindingCycle & Readonly<{ bindingFileCount: number }>;
  compatibility: Readonly<{
    sourceCommit: string;
    sourceTree: string;
    baselineBundleSha256: string;
    frozenBundleSha256: string;
    baselineDescriptorSha256: string;
    frozenDescriptorSha256: string;
    checkedFrozenWriters: readonly string[];
  }>;
  paired: Readonly<{ genesis002: LocalBindingCycle; ptr: LocalBindingCycle }>;
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

export function deriveFixedGenesis001CurrentBindingCheck(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bundleSha256: string;
  dependencyClosureDigest: string;
  bindingFileCount: number;
}>>;

export function deriveFixedAllRealmLocalBindingRuntime(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  genesis001: Readonly<{
    current: Readonly<{
      bundleSha256: string;
      dependencyClosureDigest: string;
      bindingFileCount: number;
    }>;
    compatibility: Readonly<{
      baselineBundleSha256: string;
      frozenBundleSha256: string;
      baselineDescriptorSha256: string;
      frozenDescriptorSha256: string;
      checkedFrozenWriters: readonly [
        'admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
        'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1',
      ];
    }>;
  }>;
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
