export class Genesis002LocalBindingCacheError extends Error {
  readonly code: string;
}

export interface Genesis002LocalBindingCacheResult {
  readonly profile: 'warpkeep-genesis002-local-binding-cache-bootstrap-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly packageCount: 15;
  readonly installedCount: number;
}

export function bootstrapGenesis002LocalBindingCache(): Promise<Genesis002LocalBindingCacheResult>;
