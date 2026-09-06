export interface LocalBindingWorkerResult {
  readonly schemaVersion: 1;
  readonly profile: 'warpkeep-local-binding-worker-result-v1'
    | 'warpkeep-local-binding-genesis002-worker-result-v1';
  readonly nonce: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly moduleTreeId: string;
  readonly dependencyClosureDigest: string;
  readonly bundleSha256: string;
  readonly bundleBytes: number;
  readonly handoffPath: string;
}

export function runFixedLocalBindingWorker(
  input: Readonly<Record<string, unknown>> | undefined,
): Promise<LocalBindingWorkerResult>;
