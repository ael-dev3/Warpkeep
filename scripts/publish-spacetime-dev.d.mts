export const GENESIS_WORLD_PUBLISH_STAGE: Readonly<Record<string, string>>;
export const INNER_KEEP_MODULE_PREDECESSOR: Readonly<Record<string, string>>;
export const INNER_KEEP_PUBLICATION_STAGE: Readonly<Record<string, string>>;
export const PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS: Readonly<Record<string, number>>;
export const RESOURCE_PUBLISH_ROLLOUT_STAGE: Readonly<Record<string, string>>;
export const WORKER_FORWARD_REPAIR: Readonly<Record<string, string>>;
export const WORKER_FORWARD_REPAIR_CHECKPOINT: Readonly<Record<string, string>>;
export const WORKER_MODULE_PREDECESSOR: Readonly<Record<string, string>>;
export const WORKER_PUBLISH_ROLLOUT_STAGE: Readonly<Record<string, string>>;
export const WORKER_V12_TABLE_CONTRACTS: Readonly<Record<string, Readonly<{
  productTypeRef: number;
  access: string;
  fields: readonly string[];
}>>>;
export const ACCESS_REQUEST_V13_TABLE_CONTRACTS: Readonly<Record<string, Readonly<{
  productTypeRef: number;
  access: string;
  fields: readonly string[];
}>>>;
export const DAILY_MARK_V14_TABLE_CONTRACTS: Readonly<Record<string, Readonly<{
  productTypeRef: number;
  access: string;
  fields: readonly string[];
}>>>;
export const INNER_KEEP_V15_TABLE_CONTRACTS: Readonly<Record<string, Readonly<{
  productTypeRef: number;
  access: string;
  fields: readonly string[];
}>>>;

export interface FoundedPublishExpectations {
  readonly expectedEnabledAllowedFidCount: number;
  readonly expectedFounderCount: number;
  readonly expectedPlayerCount: number;
  readonly expectedTermsAcceptanceCount: number;
}

export interface MigrationArtifactReceipt {
  readonly artifactPath: string;
  readonly v11TableSchemaDigest: string;
  readonly v12TableSchemaDigest: string;
  readonly v13TableSchemaDigest: string;
  readonly v14TableSchemaDigest: string;
  readonly v15TableSchemaDigest: string;
  readonly v16TableSchemaDigest: string;
  readonly v17TableSchemaDigest: string;
  readonly currentCandidateTableSchemaDigest: string;
  readonly artifactDigest: string;
}

export class SpacetimePublishContainmentError extends Error {
  readonly code: string;
  readonly nonReconcilable: true;
}
export function isSpacetimePublishContainmentError(
  error: unknown,
): error is SpacetimePublishContainmentError;

export function alphaV8AggregateChildArguments(...args: any[]): any;
export function alphaV10AggregateChildArguments(...args: any[]): any;
export function alphaV12AggregateChildArguments(...args: any[]): any;
export function accessRequestV13InspectChildArguments(...args: any[]): any;
export function attestPinnedSpacetimeCli(
  executable: string,
  spawnSyncProcess?: any,
  sourceEnvironment?: Readonly<Record<string, string | undefined>>,
): Readonly<{
  path: string;
  digest: string;
  cleanup: () => void;
}>;
export function canonicalSchemaDescribeChildArguments(...args: any[]): any;
export function createPrivatePublishSnapshot(...args: any[]): any;
export function dailyMarksV14InspectChildArguments(...args: any[]): any;
export function executeProtocolV15InactivePublicationLane(...args: any[]): Promise<any>;
export function innerKeepV15InspectChildArguments(...args: any[]): any;
export function parseCanonicalSchemaDescription(...args: any[]): any;
export function parseMigrationProofReceipt(...args: any[]): any;
export function parseMigrationProofReceiptAtExactPath(
  output: string,
  artifactPath: string,
): Readonly<MigrationArtifactReceipt>;
export function parsePublishArguments(...args: any[]): any;
export type GreaterRealmPublishSupervisorIdentity = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-greater-realm-publish-supervisor-v1';
  supervisorId: string;
  supervisorDirectory: string;
}>;
export type GreaterRealmPublishSupervisorPlan = Readonly<{
  identity: GreaterRealmPublishSupervisorIdentity;
  allocate: () => void;
  start: (...args: any[]) => Promise<any>;
  release: () => Promise<void>;
  cleanup: () => Promise<void>;
  executionState: () => Readonly<{ error?: unknown; closed?: unknown }>;
}>;
export function planGreaterRealmPublishSupervisor(
  supervisorRoot: string,
  cliConfigSourcePath: string,
  testOnlyCrash?: Readonly<{
    state: string;
    boundary: 'final-installed' | 'temporary-created' | 'linked' | 'post-unlink';
  }>,
): GreaterRealmPublishSupervisorPlan;
export function monitorSpacetimePublishChild(child: any): Promise<void>;
export function inspectGreaterRealmPublishSupervisor(
  identity: GreaterRealmPublishSupervisorIdentity,
): Readonly<{
  identity: GreaterRealmPublishSupervisorIdentity;
  status: Readonly<Record<string, unknown>>;
  processGroupExists: boolean;
  incompleteInstallZeroWrite: boolean;
  temporaries: readonly Readonly<Record<string, unknown>>[];
  phases: readonly Readonly<Record<string, unknown>>[];
  cliAuthority: Readonly<{
    cliConfigPath: string;
    cliRootDirectory: string;
    cliConfigDigest?: string;
    staged: boolean;
  }>;
}>;
export function authorizeGreaterRealmPublishExactBeforeClear(
  identity: GreaterRealmPublishSupervisorIdentity,
): boolean;
export function cleanupGreaterRealmPublishSupervisor(
  identity: GreaterRealmPublishSupervisorIdentity,
  testOnlyStopAfter?: 'config-removed' | 'root-removed' | 'prior-phases-removed',
): void;
export function planWorkerV12CodePublication(...args: any[]): any;
export function publishPostV12AggregateChildArguments(...args: any[]): any;
export function publishPreV12AggregateChildArguments(...args: any[]): any;
export function publishChildEnvironment(...args: any[]): any;
export function publishModule(
  spacetimeCommand: string,
  targetDatabase: string,
  artifactReceipt: MigrationArtifactReceipt,
  spawnProcess?: (...args: any[]) => any,
  assertCanStartWrite?: (() => void) & Readonly<{
    markSubmissionUncertain?: () => Promise<void>;
  }>,
  expectedPrivateArtifactPath?: string,
  prepareWrite?: () => Promise<void>,
  publishSupervisor?: GreaterRealmPublishSupervisorPlan,
): Promise<void>;
export function readFoundedPublishExpectations(
  source?: Record<string, string | undefined>,
): Readonly<FoundedPublishExpectations>;
export function requireCanonicalPublishCoordinates(...args: any[]): any;
export function requireEntryAgreementProductionRelease(
  releaseStatus?: string,
  dryRun?: boolean,
): void;
export function requireRealmChatV16ProductionPublishReady(): never;
export function requireGreaterRealmV17ProductionPublishReady(): never;
export function requireCurrentReviewOnlyProductionPublishReady(): never;
export function requireReviewedAdditivePublicationLane(
  receipt: MigrationArtifactReceipt,
  innerKeepModulePredecessor?: string,
  innerKeepPublicationStage?: string,
): Readonly<MigrationArtifactReceipt>;
export function runCurrentAdditiveMigrationProof(...args: any[]): any;
export function validateIssuerDeployment(...args: any[]): any;
export function verifyCanonicalDatabaseList(...args: any[]): any;
export function verifyFreshAlphaStatusV8Aggregate(...args: any[]): any;
export function verifyFreshAlphaStatusV10Aggregate(...args: any[]): any;
export function verifyFreshAlphaStatusV12Aggregate(...args: any[]): any;
export function verifyFreshAccessRequestV13Aggregate(...args: any[]): any;
export function verifyFreshPublishExactV12Aggregate(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyExactPublishV12AggregateValue(...args: any[]): any;
export function verifyFreshPublishPreV12Aggregate(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyFreshProductionV11Schema(...args: any[]): any;
export function verifyFreshProductionV12ModuleSchema(...args: any[]): any;
export function verifyFreshProductionV13ModuleSchema(...args: any[]): any;
export function verifyFreshProductionV14ModuleSchema(...args: any[]): any;
export function verifyFreshProductionV14InnerKeepPredecessor(...args: any[]): any;
export function verifyFreshActiveDailyMarksV14(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyFreshFoundedProtocolV3Aggregate(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyFreshResourceProtocolV4PrebackfillAggregate(...args: any[]): any;
export function verifyFreshResourceProtocolV4ReadyAggregate(...args: any[]): any;
export function verifyMigrationArtifactReceipt(...args: any[]): any;
export function verifyEmptyInactiveInnerKeepV15StatusOutput(...args: any[]): any;
export function verifyEmptyDailyMarksV14StatusOutput(...args: any[]): any;
export function verifyActiveDailyMarksV14StatusOutput(
  output: string,
  expectedFounderCount: number,
  expectedEnabledAllowedFidCount: number,
): any;
export function verifyPinnedCliAttestation(...args: any[]): any;
export function verifyPostPublishAlphaStatusV8Aggregate(...args: any[]): any;
export function verifyPostPublishAlphaStatusV10Aggregate(...args: any[]): any;
export function verifyPostPublishAlphaStatusV12Aggregate(...args: any[]): any;
export function verifyPostPublishAccessRequestV13Aggregate(...args: any[]): any;
export function verifyPostPublishCombinedV12Aggregate(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyPostPublishFoundedProtocolV3Aggregate(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyPostPublishProductionV12Schema(...args: any[]): any;
export function verifyPostPublishProductionV12ModuleSchema(...args: any[]): any;
export function verifyPostPublishProductionV13ModuleSchema(...args: any[]): any;
export function verifyPostPublishProductionV13ActiveModuleSchema(...args: any[]): any;
export function verifyPostPublishProductionV13SchemaFromV11(...args: any[]): any;
export function verifyPostPublishProductionV14ModuleSchema(...args: any[]): any;
export function verifyPostPublishProductionV14ActiveModuleSchema(...args: any[]): any;
export function verifyPostPublishProductionV15InactiveModuleSchema(...args: any[]): any;
export function verifyPostPublishEmptyDailyMarksV14(...args: any[]): any;
export function verifyPostPublishEmptyInactiveInnerKeepV15(...args: any[]): any;
export function verifyPostPublishActiveDailyMarksV14(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyPostPublishResourceProtocolV4PrebackfillAggregate(...args: any[]): any;
export function verifyPostPublishResourceProtocolV4ReadyAggregate(...args: any[]): any;
export function verifyPostPublishResourcePublicationCheckpoints(
  secret: string,
  expectations: FoundedPublishExpectations,
  ...args: any[]
): any;
export function verifyPrivacySafeAlphaStatusV8Output(...args: any[]): any;
export function verifyPrivacySafeAlphaStatusV10Output(...args: any[]): any;
export function verifyPrivacySafeAlphaStatusV12Output(...args: any[]): any;
export function verifyPrivacySafeAccessRequestV13AggregateOutput(...args: any[]): any;
export function verifyPrivacySafePublishPostV12Output(...args: any[]): any;
export function verifyPrivacySafePublishPreV12Output(...args: any[]): any;
export function verifyActiveAlphaStatusV12(...args: any[]): any;
export function verifyAlphaStatusV12ForStage(...args: any[]): any;
export function verifyEmptyAlphaStatusV12(...args: any[]): any;
export function verifyReturnNodeReuseRepairAlphaStatusV12(...args: any[]): any;
export function verifyExactProductionV11Schema(...args: any[]): any;
export function verifyExactProductionV12Schema(...args: any[]): any;
export function verifyExactProductionV12ModuleSchema(...args: any[]): any;
export function verifyExactProductionV13Schema(...args: any[]): any;
export function verifyExactProductionV13SchemaFromV11(...args: any[]): any;
export function verifyExactProductionV13ModuleSchema(...args: any[]): any;
export function verifyExactProductionV14Schema(...args: any[]): any;
export function verifyExactProductionV14ModuleSchema(...args: any[]): any;
export function verifyExactProductionV14InnerKeepPredecessor(...args: any[]): any;
export function verifyExactProductionV15Schema(...args: any[]): any;
export function verifyExactProductionV15ModuleSchema(...args: any[]): any;
export function verifyHistoricalPublicationAggregateUnchanged(...args: any[]): any;
export function verifyInnerKeepV14PredecessorAbi(...args: any[]): any;
export function verifyInnerKeepV15ModuleAbi(...args: any[]): any;
export function verifyWorkerV12ModuleAbi(...args: any[]): any;
export function verifyWorkerV12ModulePredecessor(...args: any[]): any;
export function verifyWorkerV13ModulePredecessor(...args: any[]): any;
export function verifyWorkerV14ModulePredecessor(...args: any[]): any;
