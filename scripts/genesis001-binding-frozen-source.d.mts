export const GENESIS001_FROZEN_SOURCE_COMMIT: '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
export const GENESIS001_FROZEN_SOURCE_TREE: '90deebb5faf4129282f5c35999244f540001b27d';
export const GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256: '0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9';

export class Genesis001FrozenSourceError extends Error {
  readonly code: string;
  constructor(code: string, cause?: unknown);
}

export function createGenesis001FrozenSourceMaterialization(input: Readonly<{
  repositoryRoot: string;
  destination: string;
}>): Readonly<{
  root: string;
  moduleSourceCommit: typeof GENESIS001_FROZEN_SOURCE_COMMIT;
  moduleTreeId: typeof GENESIS001_FROZEN_SOURCE_TREE;
  sourceClosureDigest: typeof GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256;
  verify(allowedUntracked?: Readonly<{
    prefixes?: readonly string[];
    files?: readonly string[];
  }>): void;
  cleanup(): void;
}>;
