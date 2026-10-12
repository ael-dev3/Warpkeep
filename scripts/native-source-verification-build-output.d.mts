export const NATIVE_BUILD_OUTPUT_PROFILE: 'warpkeep-native-build-output-v1';
export type NativeBuildVariant = 'default' | 'github-pages' | 'canonical-pages';
export type NativeBuildIdentity = Readonly<Record<'dev' | 'ino' | 'mode' | 'uid' | 'gid' | 'nlink' | 'size' | 'mtimeNs' | 'ctimeNs', string>>;
export type NativeBuildOutputFile = Readonly<{
  path: string; bytes: number; mode: number; sha256: string; identity: NativeBuildIdentity;
}>;
export type NativeBuildOutputDirectory = Readonly<{
  path: string; mode: number; identity: NativeBuildIdentity; entriesSha256: string;
}>;
export type NativeBuildOutput = Readonly<{
  schemaVersion: 1; profile: typeof NATIVE_BUILD_OUTPUT_PROFILE; variant: NativeBuildVariant;
  base: '/' | '/Warpkeep/'; outputRoot: string; repositoryIdentity: NativeBuildIdentity;
  fileCount: number; directoryCount: number; totalBytes: number;
  files: readonly NativeBuildOutputFile[]; directories: readonly NativeBuildOutputDirectory[];
  documents: readonly Readonly<{ path: string; moduleScript: string; stylesheets: readonly string[]; modulePreloads: readonly string[] }>[];
  contentManifestSha256: string; inventoryStable: true; environmentVerified: false; releaseAuthorized: false; scope: string;
}>;
export function captureNativeBuildOutput(repositoryRoot: string, variant: NativeBuildVariant): NativeBuildOutput;
