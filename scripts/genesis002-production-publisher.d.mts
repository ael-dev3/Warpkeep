export const GENESIS_002_PRODUCTION_TARGET: Readonly<{
  uri: 'https://maincloud.spacetimedb.com';
  database: 'warpkeep-genesis-002';
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1';
  modulePath: 'spacetimedb/genesis002';
  genesis001DatabaseIdentity: string;
  deleteData: 'never';
}>;
export const GENESIS_002_PUBLISH_PROFILE:
  'warpkeep-genesis-002-production-publish-v1';
export class Genesis002ProductionPublisherError extends Error {
  readonly code: string;
  readonly publishAttempted: boolean;
}
export function genesis002PublishArguments(
  artifactPath: string,
  spacetimeCliRootDirectory: string,
  spacetimeCliConfigPath: string,
): readonly string[];
export function genesis002PublishConfirmationDigest(input: Readonly<{
  sourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  spacetimeCliConfigSha256: string;
}>): string;
export function parseGenesis002DatabaseList(output: string): string | null;
export function executeGenesis002Publish(input: Readonly<{
  sourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  spacetimeCliConfigSha256: string;
  confirmationDigest: string;
  artifactPath: string;
  spacetimeCliRootDirectory: string;
  spacetimeCliConfigPath: string;
  spacetimeExecutable: string;
  spawn?: (...arguments_: unknown[]) => unknown;
  postflight: (databaseIdentity: string) => Promise<unknown>;
  assertSourceAndArtifact: () => void;
  childEnvironment: Readonly<Record<string, string>>;
  artifactDescriptor?: number;
}>): Promise<Readonly<Record<string, unknown>>>;
export function verifyGenesis002GeneratedAbi(input: Readonly<{
  reducers: readonly string[];
  procedures: readonly string[];
  tables: readonly string[];
  publicTables: readonly string[];
}>): Readonly<{
  reducerCount: 18;
  procedureCount: 7;
  tableCount: 23;
  publicTableCount: 0;
  activationReducerCount: 0;
}>;
export function prepareGenesis002SourceBuiltArtifact(input: Readonly<{
  sourceCommit: string;
  reattestSource: () => string;
  dependencyCacheRoot: string;
  cliConfigSourcePath?: string;
  materializationParent?: string;
  executable?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  spawn?: (...arguments_: unknown[]) => unknown;
}>): Readonly<{
  sourceCommit: string;
  moduleSha256: string;
  artifactPath: string;
  publishArtifactPath: '/dev/fd/3';
  artifactDescriptor: number;
  spacetimeExecutable: string;
  spacetimeExecutableSha256: string;
  spacetimeCliConfigSha256?: string;
  spacetimeCliRootDirectory?: string;
  spacetimeCliConfigPath?: string;
  dependencyClosureDigest: string;
  moduleTreeId: string;
  childEnvironment: Readonly<Record<string, string>>;
  abi: Readonly<Record<string, number>>;
  assertSourceAndArtifact: () => void;
  assertArtifact: () => void;
  cleanup: () => void;
}>;
