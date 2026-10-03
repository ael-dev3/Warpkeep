import type { PtrRawV10Definition } from './ptr-artifact-description.mjs';
import type { AuthBridgeRpcRoleAttestation } from './auth-bridge-config-attestation.mjs';
import type { comparePtrUpdateDefinitions } from './ptr-update-definition-policy.mjs';
import type { parseExistingUpdatePlan } from './sealed-realms-existing-update-protocol.mjs';
export const PTR_INITIAL_OWNER_UPDATE_TARGET: 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
export class PtrInitialOwnerUpdateError extends Error { readonly code: string; constructor(code: string); }
export type PtrInitialOwnerUpdateBinding = Readonly<{
  sourceCommit: string; sourceTree: string; databaseIdentity: typeof PTR_INITIAL_OWNER_UPDATE_TARGET;
  candidateProgram: string; candidateSha256: string; candidateDescriptionDigest: string; moduleTreeId: string;
  dependencyClosureDigest: string; cliDigest: string; cliConfigDigest: string;
}>;
export type PtrInitialOwnerUpdateSnapshot = Readonly<{
  program: string; schemaDigest: string; definitionPolicy: 'warpkeep-raw-module-v9-no-views-rls-defaults-v1';
  tables: readonly Readonly<{ name: string; count: number; rowsDigest: string; schemaDigest: string; installedTableSchemaDigest: string }>[];
  owner: Readonly<{ state: 'enabled' | 'disabled' | 'ownerless' | 'unrecognized'; enabled: boolean | null; authEpoch: number | null }>;
  atlas: Readonly<{ state: 'absent' | 'unrecognized' }> | Readonly<{ state: string; verificationPhase: string; importEpoch: string; atlasSourceCommit: string;
    releaseDigest: string; fullImportStatusAuthority: false }>;
}>;
export type PtrInitialOwnerUpdateInspection = Readonly<{
  profile: 'warpkeep-ptr-initial-owner-module-update-v1'; binding: PtrInitialOwnerUpdateBinding;
  before: PtrInitialOwnerUpdateSnapshot; configuration: AuthBridgeRpcRoleAttestation | null;
  preservation: ReturnType<typeof comparePtrUpdateDefinitions>; candidateTableNames: readonly string[];
  plan: ReturnType<typeof parseExistingUpdatePlan> & Readonly<{ observation: { AutoMigrate: { break_clients: false; major_version_upgrade: false; migrate_plan: string; token: string } } }>; inspectionDigest: string; productionAuthorized: false;
  globalReleaseAuthority: false; ownerAuthTokenVerified: false;
}>;
export function createPtrInitialOwnerUpdateInspection(input: Readonly<{
  binding: PtrInitialOwnerUpdateBinding; before: PtrInitialOwnerUpdateSnapshot; configuration: AuthBridgeRpcRoleAttestation | null;
  priorV10: Uint8Array; candidateDefinition: PtrRawV10Definition; planBytes: Uint8Array;
}>): PtrInitialOwnerUpdateInspection;
export function assertPtrInitialOwnerUpdatePreflight(record: PtrInitialOwnerUpdateInspection, input: Readonly<{
  binding: PtrInitialOwnerUpdateBinding; state: PtrInitialOwnerUpdateSnapshot; configuration: AuthBridgeRpcRoleAttestation | null;
  priorV10: Uint8Array; candidateDefinition: PtrRawV10Definition; planBytes: Uint8Array;
}>): Readonly<{ inspectionDigest: string; exactPreflightObserved: true; productionAuthorized: false }>;
export function classifyPtrInitialOwnerUpdateObservation(record: PtrInitialOwnerUpdateInspection, input: Readonly<{
  state: PtrInitialOwnerUpdateSnapshot; configuration: AuthBridgeRpcRoleAttestation | null; installedV10: Uint8Array;
}>): Readonly<{
  productionAuthorized: false; globalReleaseAuthority: false; ownerAuthTokenVerified: false;
  retryAuthorized: false; atomicDatabaseSnapshot: false;
}> & (Readonly<{ outcome: 'not-observed-applied'; submissionOutcome: 'uncertain' }> | Readonly<{
  outcome: 'observed-preserved-candidate'; installedStateDigest: string; currentConfigurationDigest: string | null; privateConfigurationPreservationObserved: boolean; candidateProgram: string; usableOwnerPtrVerified: false;
}>);

export function validatePtrInitialOwnerUpdateInspection(record: unknown): PtrInitialOwnerUpdateInspection;
