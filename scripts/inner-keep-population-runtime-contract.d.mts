export const INNER_KEEP_POPULATION_SELECTION_RECORD: string;
export const INNER_KEEP_POPULATION_SELECTION_DIGEST: string;
export const INNER_KEEP_POPULATION_SELECTION: Readonly<Record<string, any>>;
export const INNER_KEEP_POPULATION_ACTORS: readonly Readonly<Record<string, any>>[];
export const INNER_KEEP_POPULATION_MODELS: readonly Readonly<Record<string, any>>[];
export const INNER_KEEP_POPULATION_RUNTIME_PATHS: readonly string[];

export function innerKeepPopulationSha256(bytes: Uint8Array): string;
export function calculateInnerKeepPopulationSelectionDigest(
  record: Readonly<Record<string, any>>
): string;
export function assertInnerKeepPopulationSelectionRecord(record: unknown): void;
export function assertInnerKeepPopulationRuntimeUseAuthorized(record?: unknown): void;
export function readInnerKeepPopulationGlbJson(
  bytes: Buffer,
  label: string
): Record<string, any>;
export function verifyInnerKeepPopulationGlb(
  bytes: Buffer,
  model: Readonly<Record<string, any>>,
  label: string
): Record<string, any>;
