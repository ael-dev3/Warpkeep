export type HegemonyWheatFarmRuntimeProfile = Readonly<{
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

export const HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY: string;
export const HEGEMONY_WHEAT_FARM_RUNTIME_RECORD: string;
export const HEGEMONY_WHEAT_FARM_SOURCE: Readonly<{
  packageDirectory: string;
  runtimeRoot: string;
  manifest: Readonly<{ filename: string; bytes: number; sha256: string }>;
  assetId: string;
  version: string;
  revision: string;
}>;
export const HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES: readonly HegemonyWheatFarmRuntimeProfile[];

export function sha256(bytes: Buffer): string;
export function assertHegemonyWheatFarmSourceManifest(bytes: Buffer, label: string): void;
export function verifyHegemonyWheatFarmRuntimeBytes(
  bytes: Buffer,
  profile: HegemonyWheatFarmRuntimeProfile,
  label: string
): void;
