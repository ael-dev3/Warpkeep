export const SEALED_REALMS_PRIVATE_STATE_VERSION: 'sealed-realms-v1';
export const SEALED_REALMS_PRIVATE_ROOT_NAMES: readonly ['audit', 'runtime', 'cache'];

export class SealedRealmsProductionPrivateStateError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type SealedRealmsProductionPrivateState = Readonly<{
  write: (input: Readonly<{
    root: 'audit' | 'runtime' | 'cache';
    relativePath: string;
    bytes: Uint8Array;
  }>) => Readonly<{ byteLength: number }>;
  read: (input: Readonly<{
    root: 'audit' | 'runtime' | 'cache';
    relativePath: string;
  }>) => Buffer;
  list: (input: Readonly<{
    root: 'audit' | 'runtime' | 'cache';
    relativeDirectory?: string;
  }>) => readonly string[];
  exists: (input: Readonly<{
    root: 'audit' | 'runtime' | 'cache';
    relativePath: string;
  }>) => boolean;
  append: (input: Readonly<{
    root: 'audit' | 'runtime' | 'cache';
    relativePath: string;
    bytes: Uint8Array;
  }>) => Readonly<{ byteLength: number }>;
  remove: (input: Readonly<{
    root: 'audit' | 'runtime' | 'cache';
    relativePath: string;
  }>) => void;
  writeFamily: (input: Readonly<{
    root: 'audit' | 'runtime' | 'cache';
    relativeDirectory: string;
    members: readonly Readonly<{ basename: string; bytes: Uint8Array }>[];
  }>) => Readonly<{ members: readonly string[] }>;
}>;

export function createSealedRealmsProductionPrivateState(input: Readonly<{
  reportedHome: string;
  testOnlyOwnerUid?: number;
  testOnlyFsync?: (path: string) => void;
  testOnlyAllowPlatformMode?: true;
  testOnlyRace?: (phase: string, path: string) => void;
}>): SealedRealmsProductionPrivateState;

export function assertSealedRealmsProductionPrivateState(
  capability: unknown,
): SealedRealmsProductionPrivateState;
