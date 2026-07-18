export type HegemonySupplyWagonAnimation = Readonly<{
  name: string;
  channels: number;
  duration: number;
}>;

export type HegemonySupplyWagonRuntimeProfile = Readonly<{
  id: 'high' | 'balanced' | 'compact';
  filename: string;
  sourceFilename: string;
  bytes: number;
  sha256: string;
  generator: string;
  nodes: number;
  triangles: number;
  vertices: number;
  textureSize: number;
  simplify?: Readonly<{ ratio: string; error: string }>;
  images: readonly Readonly<{
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  }>[];
  meshes: number;
  primitives: number;
  materials: number;
  skins: number;
  joints: number;
  animations: readonly HegemonySupplyWagonAnimation[];
  indexComponentType: number;
  imageNames: readonly string[];
}>;

export const HEGEMONY_SUPPLY_WAGON_RELEASE: Readonly<{
  repository: string;
  tag: string;
  attachment: string;
  bytes: number;
  sha256: string;
  packageRoot: string;
}>;
export const HEGEMONY_SUPPLY_WAGON_SOURCE: Readonly<{
  filename: string;
  bytes: number;
  sha256: string;
  manifest: Readonly<{ filename: string; bytes: number; sha256: string }>;
  sha256Sums: Readonly<{ filename: string; bytes: number; sha256: string }>;
}>;
export const HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY: string;
export const HEGEMONY_SUPPLY_WAGON_REQUIRED_EXTENSIONS: readonly string[];
export const HEGEMONY_SUPPLY_WAGON_PROFILES: readonly HegemonySupplyWagonRuntimeProfile[];

export function sha256(bytes: Buffer): string;
export function verifyHegemonySupplyWagonBytes(
  bytes: Buffer,
  profile: HegemonySupplyWagonRuntimeProfile,
  label: string
): Promise<void>;
export function assertHegemonySupplyWagonSourceManifest(bytes: Buffer, label: string): void;
export function assertHegemonySupplyWagonSha256Sums(bytes: Buffer, label: string): void;
