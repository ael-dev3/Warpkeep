export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE:
  'warpkeep-genesis-001-admitted-player-census-private-proof-v1';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE:
  'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL:
  'SELECT fid, enabled, auth_epoch FROM allowed_fid';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL:
  'SELECT fid FROM player_v2';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE:
  'admin_get_access_request_admission_status_v1';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS: 4096;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES: 1048576;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS: 60000;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS: 300000;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN:
  'warpkeep.genesis-001.admitted-player-census.normalized-set.v1\n';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN:
  'warpkeep.genesis-001.admitted-player-census.raw-evidence.v1\n';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN:
  'warpkeep.genesis-001.admitted-player-census.private-proof.v1\n';

export type Genesis001AdmittedPlayerCensusAggregate = Readonly<{
  allowedFids: string;
  enabledAllowedFids: string;
}>;

export type Genesis001AdmittedPlayerCensusEntry = Readonly<{
  fid: string;
  authEpoch: string;
}>;

export type Genesis001AdmittedPlayerCensusPrivateReceipt = Readonly<{
  schemaVersion: 1;
  profile: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE;
  realmId: 'GENESIS_001';
  releaseVersion: '0.3.43';
  databaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
  preparationSourceCommit: string;
  observedAt: string;
  collectionMethod: 'preferred-exact-query' | 'fallback-player-v2-status-v1';
  beforeAggregate: Genesis001AdmittedPlayerCensusAggregate;
  afterAggregate: Genesis001AdmittedPlayerCensusAggregate;
  admittedPlayerCount: string;
  entries: readonly Genesis001AdmittedPlayerCensusEntry[];
  normalizedSetDigest: string;
  rawEvidenceDigest: string;
  nonceHex: string;
  opaqueProofDigest: string;
}>;

export type Genesis001AdmittedPlayerPreferredResult =
  | Readonly<{
    outcome: 'exact-query-supported';
    output: Uint8Array;
  }>
  | Readonly<{ outcome: 'unsupported-exact-query' }>;

export type Genesis001AdmittedPlayerAdmissionStatus = Readonly<{
  admissionState: 'missing' | 'enabled' | 'disabled';
  authEpoch: number;
  requestState: 'not_requested' | 'pending' | 'resolved';
  requestCycle: bigint | undefined;
  requestedAtMicros: bigint | undefined;
}>;

export class Genesis001AdmittedPlayerCensusError extends Error {
  readonly code: string;
}

export function parseGenesis001AdmittedPlayerPreferredResult(
  output: Uint8Array,
): Readonly<{
  entries: readonly Genesis001AdmittedPlayerCensusEntry[];
  normalizedSetDigest: string;
  rawEvidenceBytes: Uint8Array;
}>;

export function collectGenesis001AdmittedPlayerCensus(input: Readonly<{
  preparationSourceCommit: string;
  observedAt: string;
  readAggregates: () =>
    | Genesis001AdmittedPlayerCensusAggregate
    | Promise<Genesis001AdmittedPlayerCensusAggregate>;
  queryPreferred: (
    sql: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL,
  ) => Genesis001AdmittedPlayerPreferredResult
    | Promise<Genesis001AdmittedPlayerPreferredResult>;
  queryFallbackFids?: (
    sql: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL,
  ) => Uint8Array | Promise<Uint8Array>;
  readAdmissionStatus?: (
    procedure: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE,
    fid: string,
  ) => Genesis001AdmittedPlayerAdmissionStatus
    | Promise<Genesis001AdmittedPlayerAdmissionStatus>;
  randomBytes: (size: 32) => Uint8Array;
}>): Promise<Genesis001AdmittedPlayerCensusPrivateReceipt>;

export function verifyGenesis001AdmittedPlayerCensusReceipt(
  value: unknown,
): Genesis001AdmittedPlayerCensusPrivateReceipt;

export function serializeGenesis001AdmittedPlayerCensusPrivateReceipt(
  value: unknown,
): Buffer;

export function projectGenesis001AdmittedPlayerCensusStablePair(
  value: unknown,
): Readonly<{
  profile: typeof GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE;
  opaqueProofDigest: string;
}>;
