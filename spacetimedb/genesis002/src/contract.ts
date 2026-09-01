export const GENESIS_002_REALM_ID = 'GENESIS_002';
export const GENESIS_002_DATABASE_NAME = 'warpkeep-genesis-002';
export const GENESIS_002_MODULE_IDENTITY = 'warpkeep-genesis-002-sealed-v1';
export const GENESIS_002_RELEASE_VERSION = '0.4.0';
export const GENESIS_002_ATLAS_ID = 'GENESIS_002_GREATER_REALM';
export const GENESIS_002_AUDIENCE =
  'warpkeep-genesis-002-spacetimedb' as const;

export const GENESIS_002_STATUS = Object.freeze({
  realmId: GENESIS_002_REALM_ID,
  databaseName: GENESIS_002_DATABASE_NAME,
  moduleIdentity: GENESIS_002_MODULE_IDENTITY,
  releaseVersion: GENESIS_002_RELEASE_VERSION,
  launchState: 'sealed',
  admissionsOpen: false,
  accessRequestsOpen: false,
  admittedPlayers: 0n,
  founders: 0n,
} as const);

/** Atlas ingestion is the sole launch-time writer; activation remains sealed. */
export const GENESIS_002_ATLAS_POLICY = Object.freeze({
  importMutationsEnabled: true,
  activationMutationsEnabled: false,
  playerPresentationEnabled: false,
} as const);

/**
 * Complete compatibility surface for every existing Genesis admission write.
 * Any future population mutation needs an explicit, reviewed policy change.
 */
export const GENESIS_002_ADMISSION_MUTATIONS = Object.freeze([
  'access_request_submit_v1',
  'admin_allow_fid',
  'admin_allow_fid_for_access_request_v1',
  'admin_admit_founder_v1',
  'admin_admit_founder_for_access_request_v2',
  'admin_disable_fid',
  'admin_bump_auth_epoch',
  'admin_reset_access_request_v1',
  'bootstrap_player',
  'bootstrap_player_v2',
  'accept_alpha_terms_v1',
  'admin_upsert_realm_profile_v1',
] as const);

export type Genesis002AdmissionMutation =
  (typeof GENESIS_002_ADMISSION_MUTATIONS)[number];

export function isGenesis002AdmissionMutation(
  value: string,
): value is Genesis002AdmissionMutation {
  return (GENESIS_002_ADMISSION_MUTATIONS as readonly string[]).includes(value);
}
