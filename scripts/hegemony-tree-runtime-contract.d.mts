export type HegemonyTreeLod = 'high' | 'balanced' | 'compact';

export type HegemonyTreeRuntimeModel = Readonly<{
  id: HegemonyTreeLod;
  filename: string;
  sourceFilename: string;
  path: string;
  sourcePath: string;
  bytes: number;
  sha256: string;
  triangles: number;
  uploadedVertices: number;
  normalizedFootprintDiameter: number;
  lod?: string;
}>;

export type HegemonyTreeRuntimeAsset = Readonly<{
  id: string;
  slug: string;
  name: string;
  sourceDirectory: string;
  biomes: readonly string[];
  evergreen: boolean;
  weight: number;
  models: readonly HegemonyTreeRuntimeModel[];
  [key: string]: unknown;
}>;

export type HegemonyTreeRuntimeProfile = HegemonyTreeRuntimeModel & Readonly<{
  assetId: string;
  assetName: string;
  sourceDirectory: string;
}>;

export const HEGEMONY_TREE_RUNTIME_DIRECTORY: string;
export const HEGEMONY_TREE_RUNTIME_RECORD: string;
export const HEGEMONY_TREE_TARGET_VISUAL_HEIGHT: number;
export const HEGEMONY_TREE_RUNTIME_BUNDLE: Readonly<{
  filename: string;
  bytes: number;
  sha256: string;
  bundleRoot: string;
  runtimeRoot: string;
}>;
export const HEGEMONY_TREE_RUNTIME_MANIFEST: Readonly<{
  assets: readonly HegemonyTreeRuntimeAsset[];
  [key: string]: unknown;
}>;
export const HEGEMONY_TREE_RUNTIME_ASSETS: readonly HegemonyTreeRuntimeAsset[];
export const HEGEMONY_TREE_RUNTIME_PROFILES: readonly HegemonyTreeRuntimeProfile[];

export function sha256(bytes: Buffer): string;
export function readHegemonyTreeGlbJson(bytes: Buffer, label: string): unknown;
export function verifyHegemonyTreeRuntimeBytes(
  bytes: Buffer,
  profile: HegemonyTreeRuntimeModel,
  label: string
): void;
export function assertHegemonyTreeBundleManifest(bytes: Buffer, label: string): void;
export function assertHegemonyTreeSourceManifest(
  bytes: Buffer,
  asset: HegemonyTreeRuntimeAsset,
  label: string
): void;
export function assertHegemonyTreeSourceCatalog(
  bytes: Buffer,
  expected: Readonly<{ bytes: number; sha256: string }>,
  label: string
): void;
