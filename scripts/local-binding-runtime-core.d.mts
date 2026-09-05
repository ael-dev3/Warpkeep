export class LocalBindingRuntimeCoreError extends Error {
  readonly code: string;
}

export function validateLocalBindingYamlManifest(source: string): Readonly<Record<string, unknown>>;

export function validateLocalBindingWorkerRequest<T extends Readonly<Record<string, unknown>>>(value: T): T;

export function parseLocalBindingWorkerResult(
  source: string,
  nonce: string,
  handoffPath: string,
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

export function deriveFixedLocalBindingRuntime(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bundleSha256: string;
  dependencyClosureDigest: string;
  bindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>>;
