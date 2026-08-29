export const PTR_REALM_ID = 'PTR';
export const PTR_RELEASE_VERSION = '0.4.0-ptr.1';
export const PTR_DATABASE_ALIAS = 'warpkeep-ptr';
export const PTR_MODULE_IDENTITY = 'warpkeep-ptr-owner-view-v1';
export const PTR_ATLAS_ID = 'PTR_GREATER_REALM';
export const PTR_AUDIENCE = 'warpkeep-ptr-spacetimedb';
export const PTR_OWNER_ROLE = 'warpkeep-ptr-owner';
export const PTR_OWNER_SINGLETON_KEY = 'PTR_OWNER_V1';

export const PTR_STATUS = Object.freeze({
  realmId: PTR_REALM_ID,
  releaseVersion: PTR_RELEASE_VERSION,
  databaseAlias: PTR_DATABASE_ALIAS,
  moduleIdentity: PTR_MODULE_IDENTITY,
  atlasId: PTR_ATLAS_ID,
  audience: PTR_AUDIENCE,
  launchState: 'owner-only',
  admissionsOpen: false,
  accessRequestsOpen: false,
} as const);

/** Atlas import is temporary; activation and every non-atlas mutation are absent. */
export const PTR_ATLAS_POLICY = Object.freeze({
  importMutationsEnabled: true,
  activationMutationsEnabled: false,
  ownerReadEnabled: true,
} as const);

export const PTR_ADMIN_PROCEDURES = Object.freeze([
  'admin_get_greater_realm_status_v1',
] as const);

export const PTR_ADMIN_REDUCERS = Object.freeze([
  'admin_stage_greater_realm_release_v1',
  'admin_import_greater_realm_components_v1',
  'admin_import_greater_realm_regions_v1',
  'admin_import_greater_realm_chunk_v1',
  'admin_begin_greater_realm_verification_v1',
  'admin_verify_greater_realm_batch_v1',
  'admin_finalize_greater_realm_release_v1',
  'admin_provision_ptr_owner_v1',
  'admin_suspend_ptr_owner_v1',
] as const);

export const PTR_OWNER_PROCEDURES = Object.freeze([
  'get_ptr_owner_status_v1',
  'get_realm_atlas_bootstrap_v1',
  'get_realm_atlas_window_v1',
  'get_realm_atlas_chunk_v1',
  'get_realm_atlas_resource_locations_v1',
  'plan_realm_route_v1',
] as const);
