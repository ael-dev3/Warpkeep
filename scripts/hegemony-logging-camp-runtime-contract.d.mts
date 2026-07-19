export type HegemonyLoggingCampRuntimeProfile = Readonly<{
  id: 'high' | 'balanced' | 'compact';
  sourceFilename: string;
  filename: string;
  bytes: number;
  sha256: string;
  triangles: number;
  vertices: number;
  tier: string;
  nodeName: string;
  meshName: string;
  nodeLod: number;
  positionMin: readonly number[];
  positionMax: readonly number[];
}>;

export const HEGEMONY_LOGGING_CAMP_RUNTIME_DIRECTORY: string;
export const HEGEMONY_LOGGING_CAMP_RUNTIME_RECORD: string;
export const HEGEMONY_LOGGING_CAMP_SOURCE: Readonly<{
  packageDirectory: string;
  runtimeRoot: string;
  manifest: Readonly<{ filename: string; bytes: number; sha256: string }>;
  files: readonly Readonly<{
    id: HegemonyLoggingCampRuntimeProfile['id'];
    filename: string;
    bytes: number;
    sha256: string;
  }>[];
  assetId: string;
  version: string;
  revision: string;
}>;
export const HEGEMONY_LOGGING_CAMP_RUNTIME_PROFILES: readonly HegemonyLoggingCampRuntimeProfile[];

export function sha256(bytes: Buffer): string;
export function assertHegemonyLoggingCampSourceManifest(bytes: Buffer, label: string): void;
export function verifyHegemonyLoggingCampRuntimeBytes(
  bytes: Buffer,
  profile: HegemonyLoggingCampRuntimeProfile,
  label: string
): void;
