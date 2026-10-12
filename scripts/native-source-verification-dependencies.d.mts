export const NATIVE_ROOT_DEPENDENCY_PROFILE: 'warpkeep-native-root-dependency-archives-v1';
export const NATIVE_ROOT_DEPENDENCY_PACKAGE_PATHS: readonly string[];
export type NativeDependencyIdentity = Readonly<Record<'dev' | 'ino' | 'mode' | 'uid' | 'gid' | 'nlink' | 'size' | 'mtimeNs' | 'ctimeNs', string>>;
export type NativeDependencyArchive = Readonly<{
  packagePath: string; name: string; version: string; integrity: string; resolved: string;
  bins: readonly Readonly<{ name: string; path: string }>[];
  archiveSha256: string; archiveBytes: number; totalBytes: number;
  files: readonly Readonly<{ path: string; bytes: Buffer; archiveMode: number; mode: number; sha256: string }>[];
  directories: readonly string[]; archiveIntegrityVerified: true; installedTreeVerified: false;
  registrySignaturesVerified: false; productionAuthorized: false;
}>;
/** Pure archive data validation; never installed/source/execution authority. */
export function deriveNativeRootDependencyArchive(lockBytes: Uint8Array, packagePath: string, archiveBytes: Uint8Array): NativeDependencyArchive;
export type NativeRootDependencyAttestation = Readonly<{
  schemaVersion: 1; profile: typeof NATIVE_ROOT_DEPENDENCY_PROFILE; repositoryRoot: string; repositoryIdentity: NativeDependencyIdentity;
  lockfile: Readonly<{ path: string; bytes: number; mode: number; sha256: string; identity: NativeDependencyIdentity }>;
  rootLockRecordCount: number; selectedPackagePaths: readonly string[];
  verifiedPackages: readonly Readonly<{
    packagePath: string; name: string; version: string; resolved: string; integrity: string;
    archive: Readonly<{ path: string; bytes: number; mode: number; sha256: string; identity: NativeDependencyIdentity }>;
    archiveFileCount: number; archiveIntegrityVerified: true; installedPackageFilesVerified: true;
    packageDirectory: Readonly<{ path: string; realPath: string; kind: string; target?: string; identity: NativeDependencyIdentity }>;
    files: readonly Readonly<{ path: string; bytes: number; mode: number; archiveMode: number; sha256: string; identity: NativeDependencyIdentity; hardlinked: boolean }>[];
    directories: readonly Readonly<{ path: string; mode: number; identity: NativeDependencyIdentity; entriesSha256: string }>[];
    binLinks: readonly Readonly<Record<string, unknown>>[];
    excludedNestedInstallRoots: readonly Readonly<{ path: string; identity: NativeDependencyIdentity }>[];
  }>[];
  verifiedPackageCount: number; verifiedInstalledBytes: number;
  uncoveredRootRecords: readonly Readonly<{ path: string; reason: 'archive-not-supplied' | 'outside-fixed-root-slice' }>[];
  inventoryStable: true; rootLockFullyVerified: false; moduleDependenciesVerified: false; serviceDependenciesVerified: false;
  registrySignaturesVerified: false; auditVerified: false; environmentVerified: false; productionAuthorized: false; scope: string;
}>;
/** Actual native UID1000 read-only capture. Locators supply no expected hashes. */
export function captureNativeRootDependencyAttestation(repositoryRoot: string,
  archives: readonly Readonly<{ packagePath: string; archivePath: string }>[]): NativeRootDependencyAttestation;
