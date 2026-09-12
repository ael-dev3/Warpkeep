export class PtrLocalBindingCacheError extends Error {
  readonly code: string;
}

export interface PtrLocalBindingCacheResult {
  readonly profile: 'warpkeep-ptr-local-binding-cache-bootstrap-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly packageCount: 15;
  readonly installedCount: number;
}

export function bootstrapPtrLocalBindingCache(): Promise<PtrLocalBindingCacheResult>;
