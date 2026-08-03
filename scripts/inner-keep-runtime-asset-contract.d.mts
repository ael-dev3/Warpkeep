export const INNER_KEEP_ASSET_SELECTION_RECORD: string;
export const INNER_KEEP_ASSET_SELECTION_DIGEST: string;
export const INNER_KEEP_ASSET_PROFILES: readonly ['high', 'balanced', 'compact'];
export const INNER_KEEP_ASSET_SELECTION: Readonly<Record<string, any>>;
export const INNER_KEEP_SELECTED_ASSETS: readonly Readonly<Record<string, any>>[];
export const INNER_KEEP_SELECTED_MODELS: readonly Readonly<Record<string, any>>[];
export const INNER_KEEP_SELECTED_PREVIEWS: readonly Readonly<Record<string, any>>[];
export const INNER_KEEP_SELECTED_SOURCE_MEMBERS: readonly string[];
export const INNER_KEEP_PLANNED_RUNTIME_PATHS: readonly string[];

export function sha256(bytes: Uint8Array): string;
export function calculateInnerKeepAssetSelectionDigest(record: Readonly<Record<string, any>>): string;
export function assertInnerKeepAssetSelectionRecord(record: unknown): void;
export function assertInnerKeepRuntimeUseAuthorized(record?: unknown): void;
export function assertSafeInnerKeepArchiveMembers(
  observedPaths: readonly string[],
  expectedPaths: readonly string[],
  packageRoot: string
): void;
export function assertTrustedInnerKeepReleaseManifest(bytes: Buffer): Readonly<Record<string, any>>;
export function readInnerKeepGlbJson(bytes: Buffer, label: string): Record<string, any>;
export function verifyInnerKeepSelectedGlb(
  bytes: Buffer,
  model: Readonly<Record<string, any>>,
  label: string
): void;
export function verifyInnerKeepSelectedPreview(
  bytes: Buffer,
  preview: Readonly<Record<string, any>>,
  label: string
): void;
export function assertInnerKeepSelectedSourceManifest(
  bytes: Buffer,
  asset: Readonly<Record<string, any>>,
  label: string
): void;
