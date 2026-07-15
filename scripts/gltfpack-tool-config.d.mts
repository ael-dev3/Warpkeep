export const GLTFPACK_VERSION: '1.2';

export type GltfpackToolSpec = Readonly<{
  attachment: string;
  archiveBytes: number;
  archiveSha256: string;
  binaryName: string;
  binaryBytes: number;
  binarySha256: string;
  key: string;
}>;

export function resolveGltfpackToolSpec(
  platform?: NodeJS.Platform | string,
  arch?: string
): GltfpackToolSpec;

export function gltfpackToolPaths(
  root: string,
  spec?: GltfpackToolSpec
): Readonly<{
  directory: string;
  archive: string;
  binary: string;
}>;

export function resolveGltfpackBinaryPath(
  root: string,
  spec?: GltfpackToolSpec,
  environment?: Readonly<Record<string, string | undefined>>
): string;
