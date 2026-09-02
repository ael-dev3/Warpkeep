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
