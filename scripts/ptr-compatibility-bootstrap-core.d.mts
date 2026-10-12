export const PTR_BOOTSTRAP_TARGET: string;
export const PTR_BOOTSTRAP_PROVIDER_OWNER: string;
export class PtrCompatibilityBootstrapError extends Error { readonly code: string; constructor(code: string); }
export interface PtrBootstrapBinding {
  readonly sourceCommit: string; readonly sourceTree: string; readonly databaseIdentity: string;
  readonly candidateProgram: string; readonly candidateSha256: string; readonly candidateDescriptionDigest: string;
  readonly moduleTreeId: string; readonly dependencyClosureDigest: string; readonly cliDigest: string; readonly cliConfigDigest: string;
}
export interface PtrBootstrapInspection {
  readonly profile: 'warpkeep-ptr-compatibility-bootstrap-v1'; readonly binding: PtrBootstrapBinding;
  readonly metadata: Readonly<{ databaseIdentity: string; providerOwnerIdentity: string; hostType: 'Js' }>;
  readonly priorV9Digest: string; readonly preservation: any;
  readonly plan: Readonly<{ token: string; planDigest: string; observation: any }>;
  readonly programBefore: null; readonly rowsBefore: null; readonly transportPolicy: 'BreakClients';
  readonly planTokenScope: 'authenticated-provider-pre-publish-opaque-token-verified-by-server';
  readonly preRowEqualityObserved: false; readonly productionAuthorized: false; readonly globalReleaseAuthority: false;
  readonly inspectionDigest: string;
}
export function parsePtrBootstrapMetadata(bytes: Uint8Array, claimedProviderIdentity: string): PtrBootstrapInspection['metadata'];
export function createPtrBootstrapInspection(input: Readonly<{ binding: PtrBootstrapBinding; metadataBytes: Uint8Array;
  claimedProviderIdentity: string; priorV9: Uint8Array; priorV10: Uint8Array; candidateDefinition: any; planBytes: Uint8Array }>): PtrBootstrapInspection;
export function validatePtrBootstrapInspection(record: unknown): PtrBootstrapInspection;
export interface PtrBootstrapAfter { readonly state: any; readonly installedV9: Uint8Array; readonly installedV10: Uint8Array; }
export function classifyPtrBootstrapAfter(record: PtrBootstrapInspection, input: PtrBootstrapAfter): Readonly<{
  outcome: 'observed-bootstrap-candidate'; candidateProgram: string; fullPrivateAfterSnapshotDigest: string; tableCount: number;
  owner: any; atlas: any; addedTablesObservedEmpty: true; programBefore: null; rowsBefore: null; preRowEqualityObserved: false;
  preservationBasis: 'reviewed-schema-boundary-and-provider-token-bound-additive-migration'; atomicDatabaseSnapshot: false;
  retryAuthorized: false; usableOwnerPtrVerified: false; productionAuthorized: false; globalReleaseAuthority: false }>;
export interface PtrBootstrapJournal { present(kind: 'submission', key: string): boolean;
  write(kind: 'inspection' | 'submission', key: string, value: unknown): unknown; }
export function performPtrBootstrapOnce(dependencies: Readonly<{ assert(): void; journal: PtrBootstrapJournal;
  observeBefore(): Promise<PtrBootstrapInspection>; apply(token: string, beforeSend: () => void): Promise<Uint8Array>;
  observeAfter(): Promise<PtrBootstrapAfter> }>): Promise<Readonly<{ inspectionDigest: string | null; submissionMarked: boolean; submissionSlotPresent: boolean | null;
  acknowledgementReceived: boolean; acknowledgementError: string | null; result: ReturnType<typeof classifyPtrBootstrapAfter> | null;
  error: string | null; candidateInstallationObserved: boolean; submissionOutcome: 'uncertain' | null;
  retryAuthorized: false; preRowEqualityObserved: false; productionAuthorized: false; globalReleaseAuthority: false }>>;
