export const INNER_KEEP_RABBIT_SELECTION_RECORD: string;
export const INNER_KEEP_RABBIT_SELECTION_DIGEST: string;
export const INNER_KEEP_RABBIT_RUNTIME_DIRECTORY: string;
export const INNER_KEEP_RABBIT_NESTED_MEMBERS: readonly string[];
export const INNER_KEEP_RABBIT_SELECTION: Readonly<Record<string, any>>;
export const INNER_KEEP_RABBIT_MODELS: readonly Readonly<Record<string, any>>[];
export const INNER_KEEP_RABBIT_RUNTIME_PATHS: readonly string[];

export function innerKeepRabbitSha256(bytes: Uint8Array): string;
export function calculateInnerKeepRabbitSelectionDigest(
  record: Readonly<Record<string, any>>
): string;
export function assertInnerKeepRabbitSelectionRecord(record: unknown): void;
export function assertInnerKeepRabbitRuntimeUseAuthorized(record?: unknown): void;
export function assertTrustedInnerKeepRabbitReleaseManifest(bytes: Buffer): Record<string, any>;
export function assertInnerKeepRabbitOuterManifest(bytes: Buffer): Record<string, any>;
export function assertInnerKeepRabbitRuntimeManifest(bytes: Buffer): Record<string, any>;
export function assertInnerKeepRabbitBundleManifest(bytes: Buffer): Record<string, any>;
export function readInnerKeepRabbitGlbJson(bytes: Buffer, label: string): Record<string, any>;
export function verifyInnerKeepRabbitGlb(
  bytes: Buffer,
  model: Readonly<Record<string, any>>,
  label: string
): Record<string, any>;
