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

export type HegemonySupplyWagonWheelSemantics = Readonly<{
  nodeNames: readonly string[];
  renderNodeNames: readonly string[];
  axleNodeNames: readonly string[];
  suspensionNodeNames: readonly string[];
  localAxleAxis: string;
  authoredWorldAxleAxis: string;
  authoredRadiusMeters: number;
  authoredFootprintMeters: number;
  preparedFootprint: number;
  preparedRadius: number;
}>;

export type HegemonySupplyWagonClipAudit = Readonly<{
  name: string;
  duration: number;
  trackFamily: string;
  hasRootTranslation: boolean;
  hasRootRotation: boolean;
  routeConflictingRootMotion: boolean;
  wheelNodesAnimated: boolean;
  usable: boolean;
  hRootVerticalBobLocalZ: readonly number[];
}>;

export type HegemonySupplyWagonSemanticAudit = Readonly<{
  profile: string;
  generator: string;
  coordinateSystem: Readonly<{ up: string; forward: string }>;
  skinName: string;
  jointNames: readonly string[];
  wheelSemantics: HegemonySupplyWagonWheelSemantics;
  trackFamilies: Readonly<Record<string, Readonly<{
    trackNames: readonly string[];
    affectedNodes: readonly string[];
  }>>>;
  clips: readonly HegemonySupplyWagonClipAudit[];
  routeRootTranslationTracks: readonly string[];
  routeRootRotationTracks: readonly string[];
  compatibleRigAndClipContract: boolean;
}>;

export type HegemonySupplyWagonAggregateAudit = Readonly<
  Omit<HegemonySupplyWagonSemanticAudit, 'profile' | 'generator'>
  & {
    profiles: readonly Readonly<{ profile: string; generator: string }>[];
  }
>;

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
export const HEGEMONY_SUPPLY_WAGON_RIG_JOINT_NAMES: readonly string[];
export const HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS:
  HegemonySupplyWagonWheelSemantics;
export const HEGEMONY_SUPPLY_WAGON_PROFILES: readonly HegemonySupplyWagonRuntimeProfile[];

export function sha256(bytes: Buffer): string;
export function verifyHegemonySupplyWagonBytes(
  bytes: Buffer,
  profile: HegemonySupplyWagonRuntimeProfile,
  label: string
): Promise<void>;
export function auditHegemonySupplyWagonBytes(
  bytes: Buffer,
  profile: HegemonySupplyWagonRuntimeProfile,
  label: string
): Promise<HegemonySupplyWagonSemanticAudit>;
export function aggregateHegemonySupplyWagonAudits(
  audits: readonly HegemonySupplyWagonSemanticAudit[],
  label?: string
): HegemonySupplyWagonAggregateAudit;
export function assertHegemonySupplyWagonSourceManifest(bytes: Buffer, label: string): void;
export function assertHegemonySupplyWagonSha256Sums(bytes: Buffer, label: string): void;
