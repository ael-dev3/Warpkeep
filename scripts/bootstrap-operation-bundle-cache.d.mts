export class OperationBundleCacheError extends Error {
  readonly code: string;
}

export interface OperationBundleCacheBootstrapResult {
  readonly profile: 'warpkeep-operation-bundle-cache-bootstrap-linux-x64-v1';
  readonly packageCount: 2;
  readonly installedCount: number;
}

export function bootstrapOperationBundleCache(): Promise<Readonly<OperationBundleCacheBootstrapResult>>;
export function bootstrapRecoveryBundleCache(): Promise<Readonly<{
  profile: 'warpkeep-recovery-bundle-cache-bootstrap-linux-x64-v1';
  packageCount: 3;
  installedCount: number;
}>>;
