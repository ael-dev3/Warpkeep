export type HegemonyStoneQuarryRuntimeProfile = Readonly<{
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

export const HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY: string;
export const HEGEMONY_STONE_QUARRY_RUNTIME_RECORD: string;
export const HEGEMONY_STONE_QUARRY_SOURCE: Readonly<{
  packageDirectory: string;
  runtimeRoot: string;
  manifest: Readonly<{ filename: string; bytes: number; sha256: string }>;
  assetId: string;
  version: string;
  revision: string;
}>;
export const HEGEMONY_STONE_QUARRY_SOURCE_FILES: readonly Readonly<{
  id: HegemonyStoneQuarryRuntimeProfile['id'];
  filename: string;
  bytes: number;
  sha256: string;
}>[];
export const HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES: readonly HegemonyStoneQuarryRuntimeProfile[];

export function sha256(bytes: Buffer): string;
export function assertHegemonyStoneQuarrySourceManifest(bytes: Buffer, label: string): void;
export function verifyHegemonyStoneQuarryRuntimeBytes(
  bytes: Buffer,
  profile: HegemonyStoneQuarryRuntimeProfile,
  label: string
): void;
