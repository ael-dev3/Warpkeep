export type HegemonyGoldMineRuntimeProfile = Readonly<{
  id: 'high' | 'balanced' | 'compact';
  filename: string;
  sourceFilename: string;
  bytes: number;
  sha256: string;
  triangles: number;
  vertices: number;
  textureSize: number;
  nodeName: string;
  nodeLod: number;
  metadataNormalization: string;
  images: readonly Readonly<{ bytes: number; sha256: string }>[];
}>;

export const HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY: string;
export const HEGEMONY_GOLD_MINE_SOURCE: Readonly<{
  manifest: Readonly<{ filename: string; bytes: number; sha256: string }>;
  files: readonly Readonly<{
    id: HegemonyGoldMineRuntimeProfile['id'];
    filename: string;
    bytes: number;
    sha256: string;
  }>[];
}>;
export const HEGEMONY_GOLD_MINE_RUNTIME_PROFILES: readonly HegemonyGoldMineRuntimeProfile[];

export function sha256(bytes: Buffer): string;
export function assertHegemonyGoldMineSourceManifest(bytes: Buffer, label: string): void;
export function verifyHegemonyGoldMineRuntimeBytes(
  bytes: Buffer,
  profile: HegemonyGoldMineRuntimeProfile,
  label: string
): Promise<void>;
