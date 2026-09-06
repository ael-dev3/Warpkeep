export class LocalBindingRuntimeError extends Error {
  readonly code: string;
}

export interface PreparedPtrLinuxBinding {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface PreparedPtrLinuxBindings {
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly bundleSha256: string;
  readonly dependencyClosureDigest: string;
  readonly bindings: readonly PreparedPtrLinuxBinding[];
}

export interface PreparedLinuxRealmBindings {
  readonly bundleSha256: string;
  readonly dependencyClosureDigest: string;
  readonly bindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}

export interface PreparedPairedLinuxBindings {
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly genesis002: PreparedLinuxRealmBindings;
  readonly ptr: PreparedLinuxRealmBindings;
}

export function derivePreparedPtrLinuxBindings(): Promise<PreparedPtrLinuxBindings>;
export function derivePreparedPairedLinuxBindings(): Promise<PreparedPairedLinuxBindings>;
