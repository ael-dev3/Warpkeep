export const PTR_PRODUCTION_TARGET: Readonly<{
  uri: 'https://maincloud.spacetimedb.com';
  databaseAlias: 'warpkeep-ptr';
  moduleIdentity: 'warpkeep-ptr-owner-view-v1';
  modulePath: 'spacetimedb/ptr';
  genesis001DatabaseIdentity: string;
  deleteData: 'never';
}>;

export const PTR_PRODUCTION_PUBLISH_PROFILE:
  'warpkeep-ptr-production-publish-v1';

export type SealedRealmsPublicationLane = 'g002' | 'ptr';
export type SealedRealmsPublicationPossiblySubmittedMarker = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-sealed-realms-publication-possibly-submitted-v1';
  lane: SealedRealmsPublicationLane;
  sourceCommit: string;
  databaseUri: 'https://maincloud.spacetimedb.com';
  alias: 'warpkeep-genesis-002' | 'warpkeep-ptr';
  moduleIdentity:
    | 'warpkeep-genesis-002-sealed-v1'
    | 'warpkeep-ptr-owner-view-v1';
  release: '0.4.0' | '0.4.0-ptr.1';
  artifactDigest: string;
  toolchainDigest: string;
  publishPlanDigest: string;
  confirmationDigest: string;
  attemptNonce: string;
  markedAt: string;
  submissionState: 'possibly-submitted';
}>;
export function createSealedRealmsPublicationPossiblySubmittedMarker(
  input: Omit<SealedRealmsPublicationPossiblySubmittedMarker,
    'schemaVersion' | 'profile' | 'submissionState'>,
): SealedRealmsPublicationPossiblySubmittedMarker;
export function parseSealedRealmsPublicationPossiblySubmittedMarker(
  bytes: string | Uint8Array,
): SealedRealmsPublicationPossiblySubmittedMarker;
export function digestSealedRealmsPublicationPossiblySubmittedMarker(
  value: unknown,
): string;
export type SealedRealmsPublicationMarkerReconciliation = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-sealed-realms-publication-marker-reconciliation-v1';
  lane: SealedRealmsPublicationLane;
  markerDigest: string;
  outcome: 'adopted' | 'no-effect';
  databaseIdentity: string | null;
  publicationReceiptDigest: string | null;
  observationDigest: string;
  observedAt: string;
}>;
export function createSealedRealmsPublicationMarkerReconciliation(
  input: Readonly<{
    marker: SealedRealmsPublicationPossiblySubmittedMarker;
    markerDigest: string;
    outcome: 'adopted' | 'no-effect';
    databaseIdentity: string | null;
    publicationReceiptDigest: string | null;
    observationDigest: string;
    observedAt: string;
  }>,
): SealedRealmsPublicationMarkerReconciliation;

export class PtrProductionPublisherError extends Error {
  readonly code: string;
  readonly publishAttempted: boolean;
  constructor(code: string, publishAttempted?: boolean);
}

export type PtrProductionPublishIdentity = Readonly<{
  sourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  spacetimeCliConfigSha256: string;
}>;

export type PtrProductionPublishReceipt = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-ptr-production-publish-v1';
  databaseIdentity: string;
  databaseAlias: 'warpkeep-ptr';
  moduleIdentity: 'warpkeep-ptr-owner-view-v1';
  sourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  spacetimeCliConfigSha256: string;
  deleteData: 'never';
  outcome: 'verified';
  freshDatabase: true;
  freshStatusDigest: string;
  admissionSurfacePresent: false;
  accessRequestSurfacePresent: false;
}>;

export type PtrProductionPublishResult = Readonly<
  PtrProductionPublishReceipt & { publishReceiptDigest: string }
>;

export function ptrProductionPublishReceiptDigest(receipt: unknown): string;

export function ptrProductionPublishConfirmationDigest(
  input: PtrProductionPublishIdentity,
): string;

export function parsePtrDatabaseList(
  output: string,
  options?: Readonly<{ disallowedDatabaseIdentities?: readonly string[] }>,
): string | null;

export function ptrProductionPublishArguments(
  artifactPath: string,
  spacetimeCliRootDirectory: string,
  spacetimeCliConfigPath: string,
): readonly string[];

export function verifyPtrGeneratedAbi(input: Readonly<{
  reducers: readonly string[];
  procedures: readonly string[];
  tables: readonly string[];
  publicTables: readonly string[];
}>): Readonly<{
  reducerCount: 9;
  procedureCount: 7;
  tableCount: 0;
  publicTableCount: 0;
  ownerProvisionReducerCount: 1;
  ownerSuspendReducerCount: 1;
  atlasActivationReducerCount: 0;
}>;

type Spawn = (...arguments_: readonly unknown[]) => unknown;

export function preparePtrSourceBuiltArtifact(input: Readonly<{
  sourceCommit: string;
  reattestSource: () => string;
  dependencyCacheRoot: string;
  cliConfigSourcePath?: string;
  materializationParent?: string;
  executable?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  spawn?: Spawn;
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

export function executePtrProductionPublish(input: Readonly<
  PtrProductionPublishIdentity & {
    confirmationDigest: string;
    artifactPath: string;
    artifactDescriptor?: number;
    spacetimeCliRootDirectory: string;
    spacetimeCliConfigPath: string;
    spacetimeExecutable: string;
    childEnvironment: Readonly<Record<string, string>>;
    assertSourceAndArtifact: () => void;
    spawn?: Spawn;
    disallowedDatabaseIdentities?: readonly string[];
  }
>): Promise<PtrProductionPublishResult>;
