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

export interface PreparedGenesis001LinuxCompilation {
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly bundleSha256: string;
  readonly dependencyClosureDigest: string;
  readonly diagnosticBindings: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}

export interface PreparedGenesis001LinuxCompatibility {
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly baselineBundleSha256: string;
  readonly frozenBundleSha256: string;
  readonly baselineDescriptorSha256: string;
  readonly frozenDescriptorSha256: string;
  readonly checkedFrozenWriters: readonly [
    'admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
    'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1',
  ];
}

export interface PreparedGenesis001CurrentLinuxBindingCheck {
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly bundleSha256: string;
  readonly dependencyClosureDigest: string;
  readonly bindingFileCount: number;
}

export function derivePreparedPtrLinuxBindings(): Promise<PreparedPtrLinuxBindings>;
export function derivePreparedPairedLinuxBindings(): Promise<PreparedPairedLinuxBindings>;
export function derivePreparedGenesis001LinuxCompilation(): Promise<PreparedGenesis001LinuxCompilation>;
export function derivePreparedGenesis001LinuxCompatibility(): Promise<PreparedGenesis001LinuxCompatibility>;
export function derivePreparedGenesis001CurrentLinuxBindingCheck(): Promise<PreparedGenesis001CurrentLinuxBindingCheck>;
