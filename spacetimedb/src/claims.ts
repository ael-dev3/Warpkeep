import {
  MAX_AUTH_EPOCH,
  MAX_SUPPORTED_FID,
  WARPKEEP_ADMIN_ROLE,
  WARPKEEP_AUTH_EPOCH_RESOLVER_ROLE,
  WARPKEEP_AUTH_EPOCH_RESOLVER_SUBJECT,
  WARPKEEP_AUTH_VERSION,
  WARPKEEP_HERMES_SUBJECT,
  WARPKEEP_JWT_CONFIG,
  WARPKEEP_QA_SNAPSHOT_RESOLVER_ROLE,
  WARPKEEP_QA_SNAPSHOT_RESOLVER_SUBJECT,
} from './config';

export type ClaimErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'INVALID_TOKEN_TYPE'
  | 'INVALID_SUBJECT'
  | 'INVALID_FID'
  | 'INVALID_AUTH_VERSION'
  | 'INVALID_AUTH_EPOCH'
  | 'INVALID_ROLES'
  | 'INVALID_PLAYER_SESSION'
  | 'INVALID_ADMIN_SESSION'
  | 'INVALID_AUTH_RESOLVER_SESSION'
  | 'INVALID_QA_SNAPSHOT_RESOLVER_SESSION';

export const MAX_PLAYER_SESSION_SECONDS = 10 * 60;
export const MAX_HERMES_ADMIN_SESSION_SECONDS = 5 * 60;
export const MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS = 60;
/** The bridge intends to issue this internal principal for only 15 seconds. */
export const QA_SNAPSHOT_RESOLVER_ISSUANCE_SECONDS = 15;
/** The module independently enforces the same exact 15-second ceiling. */
export const MAX_QA_SNAPSHOT_RESOLVER_SESSION_SECONDS = 15;

export class ClaimValidationError extends Error {
  readonly code: ClaimErrorCode;

  constructor(code: ClaimErrorCode) {
    super(code);
    this.name = 'ClaimValidationError';
    this.code = code;
  }
}

export type WarpkeepJwtConfig = Readonly<{
  issuer: string;
  audience: string;
  tokenType: string;
}>;

export type WarpkeepBaseJwtClaims = Readonly<{
  issuer: string;
  subject: string;
  audience: readonly string[];
  tokenType: string;
  roles: readonly string[];
}>;

export type WarpkeepJwtClaims = WarpkeepBaseJwtClaims &
  Readonly<{
    authVersion: number;
    fid: bigint;
    authEpoch: number;
    sessionIssuedAt: number;
    sessionExpiresAt: number;
  }>;

export type AuthEpochResolverJwtClaims = WarpkeepBaseJwtClaims &
  Readonly<{
    resolverFid: bigint;
  }>;

export type QaSnapshotResolverJwtClaims = WarpkeepBaseJwtClaims &
  Readonly<{
    deviceThumbprint: string;
  }>;

type JsonRecord = Readonly<Record<string, unknown>>;

const DECIMAL_FID = /^[1-9][0-9]*$/;
const QA_DEVICE_THUMBPRINT = /^[A-Za-z0-9_-]{43}$/;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function expectRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) {
    throw new ClaimValidationError('AUTH_REQUIRED');
  }

  return value;
}

function expectString(record: JsonRecord, key: string, code: ClaimErrorCode): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ClaimValidationError(code);
  }

  return value;
}

function readAudience(record: JsonRecord): readonly string[] {
  const value = record.aud;
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(entry => typeof entry === 'string' && entry.length > 0)
  ) {
    return value as readonly string[];
  }

  throw new ClaimValidationError('INVALID_AUDIENCE');
}

function readRoles(record: JsonRecord): readonly string[] {
  const value = record.roles;
  if (!Array.isArray(value) || !value.every(role => typeof role === 'string')) {
    throw new ClaimValidationError('INVALID_ROLES');
  }

  return value as readonly string[];
}

/**
 * Parse the FID exactly as issued by the bridge. A JS-safe upper bound keeps
 * every comparison and table argument lossless while still storing it as u64.
 */
export function parseFidClaim(value: unknown): bigint {
  if (typeof value !== 'string' || !DECIMAL_FID.test(value)) {
    throw new ClaimValidationError('INVALID_FID');
  }

  const fid = BigInt(value);
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new ClaimValidationError('INVALID_FID');
  }

  return fid;
}

export function parseAuthEpochClaim(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_AUTH_EPOCH
  ) {
    throw new ClaimValidationError('INVALID_AUTH_EPOCH');
  }

  return value;
}

/** Validate the non-player claims shared by player and administrator tokens. */
export function readWarpkeepBaseJwt(
  payload: unknown,
  config: WarpkeepJwtConfig = WARPKEEP_JWT_CONFIG,
): WarpkeepBaseJwtClaims {
  const record = expectRecord(payload);
  const issuer = expectString(record, 'iss', 'INVALID_ISSUER');
  if (issuer !== config.issuer) {
    throw new ClaimValidationError('INVALID_ISSUER');
  }

  const audience = readAudience(record);
  // Warpkeep tokens are deliberately single-audience. A token that also names
  // another service weakens the confused-deputy boundary even when Warpkeep is
  // present, so an array must contain exactly our one audience.
  if (audience.length !== 1 || audience[0] !== config.audience) {
    throw new ClaimValidationError('INVALID_AUDIENCE');
  }

  const tokenType = expectString(record, 'token_type', 'INVALID_TOKEN_TYPE');
  if (tokenType !== config.tokenType) {
    throw new ClaimValidationError('INVALID_TOKEN_TYPE');
  }

  return Object.freeze({
    issuer,
    subject: expectString(record, 'sub', 'INVALID_SUBJECT'),
    audience,
    tokenType,
    roles: readRoles(record),
  });
}

/**
 * Validate the complete Farcaster player claim contract. The subject/FID
 * equality is important: it prevents a correctly signed token for one
 * Farcaster account from naming another account in a custom claim.
 */
export function readWarpkeepJwt(
  payload: unknown,
  config: WarpkeepJwtConfig = WARPKEEP_JWT_CONFIG,
): WarpkeepJwtClaims {
  const base = readWarpkeepBaseJwt(payload, config);
  const record = expectRecord(payload);
  if (record.auth_version !== WARPKEEP_AUTH_VERSION) {
    throw new ClaimValidationError('INVALID_AUTH_VERSION');
  }
  const authVersion = WARPKEEP_AUTH_VERSION;
  const fid = parseFidClaim(record.fid);
  const authEpoch = parseAuthEpochClaim(record.auth_epoch);
  const sessionIssuedAt = readNumericDate(record, 'session_iat', 'INVALID_PLAYER_SESSION');
  const sessionExpiresAt = readNumericDate(record, 'session_exp', 'INVALID_PLAYER_SESSION');

  if (base.subject !== `farcaster:${fid.toString()}`) {
    throw new ClaimValidationError('INVALID_SUBJECT');
  }
  if (base.roles.length !== 0) {
    throw new ClaimValidationError('INVALID_ROLES');
  }
  if (
    sessionExpiresAt <= sessionIssuedAt
    || sessionExpiresAt - sessionIssuedAt > MAX_PLAYER_SESSION_SECONDS
  ) {
    throw new ClaimValidationError('INVALID_PLAYER_SESSION');
  }

  return Object.freeze({
    ...base,
    authVersion,
    fid,
    authEpoch,
    sessionIssuedAt,
    sessionExpiresAt,
  });
}

/**
 * Hermes is a service principal, never a Farcaster player. Requiring exactly
 * this one role prevents a player-shaped token from becoming an admin merely
 * because a bridge bug or future role expansion adds an admin-looking value.
 */
export function isHermesAdminJwt(claims: WarpkeepBaseJwtClaims): boolean {
  return (
    claims.subject === WARPKEEP_HERMES_SUBJECT &&
    claims.roles.length === 1 &&
    claims.roles[0] === WARPKEEP_ADMIN_ROLE
  );
}

/** The resolver is a single-purpose service principal, never an administrator. */
export function isAuthEpochResolverJwt(claims: WarpkeepBaseJwtClaims): boolean {
  return (
    claims.subject === WARPKEEP_AUTH_EPOCH_RESOLVER_SUBJECT &&
    claims.roles.length === 1 &&
    claims.roles[0] === WARPKEEP_AUTH_EPOCH_RESOLVER_ROLE
  );
}

/** The QA snapshot resolver is one exact bridge-internal, read-only principal. */
export function isQaSnapshotResolverJwt(claims: WarpkeepBaseJwtClaims): boolean {
  return (
    claims.subject === WARPKEEP_QA_SNAPSHOT_RESOLVER_SUBJECT &&
    claims.roles.length === 1 &&
    claims.roles[0] === WARPKEEP_QA_SNAPSHOT_RESOLVER_ROLE
  );
}

function readNumericDate(
  record: JsonRecord,
  key: 'iat' | 'exp' | 'session_iat' | 'session_exp',
  code: ClaimErrorCode,
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ClaimValidationError(code);
  }
  return value;
}

/**
 * SpacetimeDB may replace the original browser token with a short-lived
 * connection token. These custom claims preserve and enforce the bridge's
 * absolute player-session deadline on every module call.
 */
export function readFreshWarpkeepPlayerJwt(
  payload: unknown,
  currentTimeMicros: bigint,
  config: WarpkeepJwtConfig = WARPKEEP_JWT_CONFIG,
): WarpkeepJwtClaims {
  const claims = readWarpkeepJwt(payload, config);
  if (
    currentTimeMicros < 0n
    || currentTimeMicros < BigInt(claims.sessionIssuedAt) * 1_000_000n
    || currentTimeMicros >= BigInt(claims.sessionExpiresAt) * 1_000_000n
  ) {
    throw new ClaimValidationError('INVALID_PLAYER_SESSION');
  }
  return claims;
}

/**
 * SpacetimeDB authenticates a WebSocket once. Recheck the short-lived Hermes
 * session against authoritative reducer time so an already-open admin socket
 * cannot retain authority after its JWT expires.
 */
export function readFreshHermesAdminJwt(
  payload: unknown,
  currentTimeMicros: bigint,
  config: WarpkeepJwtConfig = WARPKEEP_JWT_CONFIG,
): WarpkeepBaseJwtClaims {
  const claims = readWarpkeepBaseJwt(payload, config);
  const record = expectRecord(payload);
  const issuedAt = readNumericDate(record, 'iat', 'INVALID_ADMIN_SESSION');
  const expiresAt = readNumericDate(record, 'exp', 'INVALID_ADMIN_SESSION');
  if (
    !isHermesAdminJwt(claims)
    || currentTimeMicros < 0n
    || currentTimeMicros < BigInt(issuedAt) * 1_000_000n
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > MAX_HERMES_ADMIN_SESSION_SECONDS
    || currentTimeMicros >= BigInt(expiresAt) * 1_000_000n
  ) {
    throw new ClaimValidationError('INVALID_ADMIN_SESSION');
  }
  return claims;
}

/** Validate the exact resolver principal, one-FID binding, and tiny authority window. */
export function readFreshAuthEpochResolverJwt(
  payload: unknown,
  currentTimeMicros: bigint,
  config: WarpkeepJwtConfig = WARPKEEP_JWT_CONFIG,
): AuthEpochResolverJwtClaims {
  let claims: WarpkeepBaseJwtClaims;
  let issuedAt: number;
  let expiresAt: number;
  let resolverFid: bigint;

  try {
    claims = readWarpkeepBaseJwt(payload, config);
    const record = expectRecord(payload);
    issuedAt = readNumericDate(record, 'iat', 'INVALID_AUTH_RESOLVER_SESSION');
    expiresAt = readNumericDate(record, 'exp', 'INVALID_AUTH_RESOLVER_SESSION');
    resolverFid = parseFidClaim(record.resolver_fid);
  } catch (error) {
    if (
      error instanceof ClaimValidationError &&
      error.code === 'INVALID_AUTH_RESOLVER_SESSION'
    ) {
      throw error;
    }
    throw new ClaimValidationError('INVALID_AUTH_RESOLVER_SESSION');
  }

  if (
    !isAuthEpochResolverJwt(claims) ||
    currentTimeMicros < 0n ||
    currentTimeMicros < BigInt(issuedAt) * 1_000_000n ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_AUTH_EPOCH_RESOLVER_SESSION_SECONDS ||
    currentTimeMicros >= BigInt(expiresAt) * 1_000_000n
  ) {
    throw new ClaimValidationError('INVALID_AUTH_RESOLVER_SESSION');
  }
  return Object.freeze({ ...claims, resolverFid });
}

/**
 * Validate the exact bridge-only QA snapshot resolver at authoritative module
 * time. Player, admission-resolver, and administrator-shaped custom claims are
 * forbidden so this principal can never be interpreted as another authority.
 */
export function readFreshQaSnapshotResolverJwt(
  payload: unknown,
  currentTimeMicros: bigint,
  config: WarpkeepJwtConfig = WARPKEEP_JWT_CONFIG,
): QaSnapshotResolverJwtClaims {
  let claims: WarpkeepBaseJwtClaims;
  let issuedAt: number;
  let expiresAt: number;
  let deviceThumbprint: string;

  try {
    claims = readWarpkeepBaseJwt(payload, config);
    const record = expectRecord(payload);
    issuedAt = readNumericDate(record, 'iat', 'INVALID_QA_SNAPSHOT_RESOLVER_SESSION');
    expiresAt = readNumericDate(record, 'exp', 'INVALID_QA_SNAPSHOT_RESOLVER_SESSION');
    deviceThumbprint = expectString(
      record,
      'device_thumbprint',
      'INVALID_QA_SNAPSHOT_RESOLVER_SESSION',
    );
    if (
      !QA_DEVICE_THUMBPRINT.test(deviceThumbprint)
      || record.fid !== undefined
      || record.auth_version !== undefined
      || record.auth_epoch !== undefined
      || record.session_iat !== undefined
      || record.session_exp !== undefined
      || record.resolver_fid !== undefined
    ) {
      throw new ClaimValidationError('INVALID_QA_SNAPSHOT_RESOLVER_SESSION');
    }
  } catch (error) {
    if (
      error instanceof ClaimValidationError &&
      error.code === 'INVALID_QA_SNAPSHOT_RESOLVER_SESSION'
    ) {
      throw error;
    }
    throw new ClaimValidationError('INVALID_QA_SNAPSHOT_RESOLVER_SESSION');
  }

  if (
    !isQaSnapshotResolverJwt(claims)
    || currentTimeMicros < 0n
    || currentTimeMicros < BigInt(issuedAt) * 1_000_000n
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > MAX_QA_SNAPSHOT_RESOLVER_SESSION_SECONDS
    || currentTimeMicros >= BigInt(expiresAt) * 1_000_000n
  ) {
    throw new ClaimValidationError('INVALID_QA_SNAPSHOT_RESOLVER_SESSION');
  }
  return Object.freeze({ ...claims, deviceThumbprint });
}
