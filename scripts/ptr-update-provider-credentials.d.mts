import type { Buffer } from 'node:buffer';
declare const providerCapability: unique symbol;
declare const g002ProviderCapability: unique symbol;
/** Credential transport only; the production factory must authenticate artifact ownership. */
export interface PtrUpdateProviderArtifact {
  readonly artifactDescriptor: number;
  readonly moduleSha256: string;
  readonly spacetimeExecutable: string;
  readonly spacetimeExecutableSha256: string;
  readonly spacetimeCliRootDirectory: string;
  readonly spacetimeCliConfigPath: string;
  readonly spacetimeCliConfigSha256: string;
  readonly assertSourceAndArtifact: () => void;
  readonly assertCliConfig: () => void;
}
export interface PtrUpdateProviderCredentials { readonly [providerCapability]: true }
export type PtrUpdateProviderRequest = { readonly operation: 'metadata' | 'schema' | 'health' | 'plan' }
  | { readonly operation: 'apply'; readonly migrationToken: string; readonly beforeSend: () => void | Promise<void> };
export function createPtrUpdateProviderCredentials(input: { readonly artifact: PtrUpdateProviderArtifact }): PtrUpdateProviderCredentials;
/** Identity is the local CLI assertion, not a server-authenticated owner proof. Health sends no authorization header. */
export function requestPtrUpdateProvider(capability: PtrUpdateProviderCredentials, input: PtrUpdateProviderRequest): Promise<Readonly<{ bytes: Buffer; claimedProviderIdentity: string }>>;
export function disposePtrUpdateProviderCredentials(capability: PtrUpdateProviderCredentials): void;

export interface G002UpdateProviderArtifact extends PtrUpdateProviderArtifact {}
export interface G002UpdateProviderCredentials { readonly [g002ProviderCapability]: true }
export type G002UpdateProviderRequest = PtrUpdateProviderRequest;
export function createG002UpdateProviderCredentials(input: { readonly artifact: G002UpdateProviderArtifact }): G002UpdateProviderCredentials;
/** Fixed G002 transport; a PTR credential capability is never accepted. */
export function requestG002UpdateProvider(capability: G002UpdateProviderCredentials, input: G002UpdateProviderRequest): Promise<Readonly<{ bytes: Buffer; claimedProviderIdentity: string }>>;
export function disposeG002UpdateProviderCredentials(capability: G002UpdateProviderCredentials): void;

/** Fixed-target observations only. This capability refuses every legacy plan/apply request. */
export type PtrInspectionProviderCredentials = PtrUpdateProviderCredentials;
export type PtrInspectionCredentialProfile = Omit<PtrUpdateProviderArtifact,
  'artifactDescriptor' | 'moduleSha256' | 'assertSourceAndArtifact'> & { readonly assertSource: () => void };
export const PTR_INSPECTION_TABLES: readonly ('access_request_v1' | 'admin_audit' | 'allowed_fid' | 'alpha_terms_acceptance_v1' | 'castle' | 'greater_realm_activation_v1' | 'greater_realm_castle_claim_v1' | 'greater_realm_castle_slot_v1' | 'greater_realm_cell_occupancy_v1' | 'greater_realm_cell_v1' | 'greater_realm_chunk_v1' | 'greater_realm_navigation_component_v1' | 'greater_realm_release_v1' | 'greater_realm_resource_node_v1' | 'mark_account_v1' | 'player' | 'player_ownership_v2' | 'player_v2' | 'ptr_owner_anchor_v1' | 'realm_atlas_v1' | 'realm_atlas_visible_region_v1' | 'realm_profile_v1' | 'realm_worker_system_v2' | 'resource_account_v1' | 'gameplay04_keep_v1' | 'gameplay04_worker_v1' | 'gameplay04_receipt_v1' | 'gameplay04_reservation_v1' | 'gameplay04_building_v1' | 'gameplay04_project_v1' | 'gameplay04_schedule_v1')[];
export const PTR_INSPECTION_PAGING: Readonly<{
  greater_realm_chunk_v1: Readonly<{ column: 'import_ordinal'; width: 16 }>;
  greater_realm_cell_v1: Readonly<{ column: 'release_ordinal'; width: 512 }>;
}>;
export type PtrInspectionProviderOperation = 'schema-v9' | 'schema-v10' | 'program' | `rows:${typeof PTR_INSPECTION_TABLES[number]}`
  | `ordinals:${keyof typeof PTR_INSPECTION_PAGING}` | `page:${keyof typeof PTR_INSPECTION_PAGING}:${number}`;
export function createPtrInspectionProviderCredentials(input: { readonly credentials: PtrInspectionCredentialProfile }): PtrInspectionProviderCredentials;
/** No SQL, destination, request body, mutation operation, or generic query is accepted. */
export function requestPtrInspectionProvider(capability: PtrInspectionProviderCredentials,
  input: { readonly operation: PtrInspectionProviderOperation }): Promise<Readonly<{ bytes: Buffer; claimedProviderIdentity: string }>>;
