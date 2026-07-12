import {
  MAX_AUTH_EPOCH,
  MAX_SUPPORTED_FID,
  WARPKEEP_ADMIN_ROLE,
  WARPKEEP_HERMES_SUBJECT,
  WARPKEEP_JWT_CONFIG,
} from './config';

export type ClaimErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'INVALID_TOKEN_TYPE'
  | 'INVALID_SUBJECT'
  | 'INVALID_FID'
  | 'INVALID_AUTH_EPOCH'
  | 'INVALID_ROLES'
  | 'INVALID_ADMIN_SESSION';

export const MAX_HERMES_ADMIN_SESSION_SECONDS = 5 * 60;

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
    fid: bigint;
    authEpoch: number;
  }>;

type JsonRecord = Readonly<Record<string, unknown>>;

const DECIMAL_FID = /^[1-9][0-9]*$/;

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
    value < 0 ||
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
  if (!audience.includes(config.audience)) {
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
  const fid = parseFidClaim(record.fid);
  const authEpoch = parseAuthEpochClaim(record.auth_epoch);

  if (base.subject !== `farcaster:${fid.toString()}`) {
    throw new ClaimValidationError('INVALID_SUBJECT');
  }
  if (base.roles.length !== 0) {
    throw new ClaimValidationError('INVALID_ROLES');
  }

  return Object.freeze({ ...base, fid, authEpoch });
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

function readNumericDate(record: JsonRecord, key: 'iat' | 'exp'): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ClaimValidationError('INVALID_ADMIN_SESSION');
  }
  return value;
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
  const issuedAt = readNumericDate(record, 'iat');
  const expiresAt = readNumericDate(record, 'exp');
  if (
    !isHermesAdminJwt(claims)
    || currentTimeMicros < 0n
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > MAX_HERMES_ADMIN_SESSION_SECONDS
    || currentTimeMicros >= BigInt(expiresAt) * 1_000_000n
  ) {
    throw new ClaimValidationError('INVALID_ADMIN_SESSION');
  }
  return claims;
}

export function optionalDisplayClaim(
  payload: unknown,
  key: 'username' | 'display_name' | 'pfp_url',
  maxLength: number,
): string | undefined {
  if (!isRecord(payload)) return undefined;
  const value = payload[key];
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
}
