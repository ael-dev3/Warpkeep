import {
  PTR_AUDIENCE,
  PTR_OWNER_ROLE,
  PTR_OWNER_SINGLETON_KEY,
  PTR_REALM_ID,
} from './contract';

export const PTR_OWNER_MAX_SESSION_SECONDS = 120;
const PTR_ADMIN_MAX_SESSION_SECONDS = 300;
const PTR_ADMIN_IAT_SKEW_MICROS = 1_000_000n;
const WARPKEEP_OIDC_ISSUER = 'https://auth.warpkeep.com';
const WARPKEEP_TOKEN_TYPE = 'spacetime-access';
const WARPKEEP_AUTH_VERSION = 2;
const WARPKEEP_ADMIN_ROLE = 'warpkeep-admin';
const WARPKEEP_HERMES_SUBJECT = 'service:hermes';
const MAX_SUPPORTED_FID = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_AUTH_EPOCH = 0xffff_ffff;
const PTR_ADMIN_JTI = /^[A-Za-z0-9_-]{1,128}$/u;
const PTR_ADMIN_EXACT_CLAIM_KEYS = Object.freeze([
  'iss',
  'sub',
  'aud',
  'token_type',
  'roles',
  'ptr_owner_fid',
  'ptr_owner_auth_epoch',
  'iat',
  'nbf',
  'exp',
  'jti',
] as const);

export type WarpkeepBaseJwtClaims = Readonly<{
  issuer: string;
  subject: string;
  audience: readonly string[];
  tokenType: string;
  roles: readonly string[];
}>;

export type PtrOwnerPolicyErrorCode =
  | 'INVALID_PTR_OWNER_SESSION'
  | 'INVALID_PTR_ADMIN_SESSION'
  | 'PTR_OWNER_NOT_AUTHORIZED'
  | 'PTR_OWNER_ALREADY_PROVISIONED'
  | 'PTR_OWNER_PROVISION_INVALID'
  | 'PTR_OWNER_CARDINALITY_INVALID'
  | 'PTR_OWNER_ALREADY_SUSPENDED';

export class PtrOwnerPolicyError extends Error {
  constructor(readonly code: PtrOwnerPolicyErrorCode) {
    super(code);
    this.name = 'PtrOwnerPolicyError';
  }
}

export type PtrOwnerClaims = WarpkeepBaseJwtClaims & Readonly<{
  authVersion: number;
  fid: bigint;
  authEpoch: number;
  realmId: typeof PTR_REALM_ID;
  sessionIssuedAt: number;
  sessionExpiresAt: number;
}>;

export type PtrAdminClaims = WarpkeepBaseJwtClaims & Readonly<{
  ownerFid: bigint;
  ownerAuthEpoch: number;
}>;

export type PtrOwnerAnchorState = Readonly<{
  singletonKey: string;
  ownerFid: bigint;
  authEpoch: number;
  enabled: boolean;
}>;

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function strictPtrAdminRecord(payload: unknown): JsonRecord {
  if (
    payload === null
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || Object.getPrototypeOf(payload) !== Object.prototype
  ) throw new PtrOwnerPolicyError('INVALID_PTR_ADMIN_SESSION');
  const record = payload as JsonRecord;
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== PTR_ADMIN_EXACT_CLAIM_KEYS.length
    || keys.some(key => (
      typeof key !== 'string'
      || !(PTR_ADMIN_EXACT_CLAIM_KEYS as readonly string[]).includes(key)
    ))
  ) throw new PtrOwnerPolicyError('INVALID_PTR_ADMIN_SESSION');
  return record;
}

function readBaseClaims(record: JsonRecord): WarpkeepBaseJwtClaims {
  if (
    record.iss !== WARPKEEP_OIDC_ISSUER
    || record.token_type !== WARPKEEP_TOKEN_TYPE
    || typeof record.sub !== 'string'
    || record.sub.length === 0
    || !exactPtrAudience(record)
    || !Array.isArray(record.roles)
    || !record.roles.every(role => typeof role === 'string')
  ) throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
  return Object.freeze({
    issuer: WARPKEEP_OIDC_ISSUER,
    subject: record.sub,
    audience: Object.freeze([PTR_AUDIENCE]),
    tokenType: WARPKEEP_TOKEN_TYPE,
    roles: Object.freeze([...record.roles]) as readonly string[],
  });
}

function parseFidClaim(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) {
    throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
  }
  const fid = BigInt(value);
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) {
    throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
  }
  return fid;
}

function parseAuthEpochClaim(value: unknown): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > MAX_AUTH_EPOCH
  ) throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
  return value;
}

function exactPtrAudience(record: JsonRecord): boolean {
  return Array.isArray(record.aud)
    && record.aud.length === 1
    && record.aud[0] === PTR_AUDIENCE;
}

function numericDate(record: JsonRecord, key: string): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
  }
  return value as number;
}

const DISALLOWED_OWNER_AUTHORITY_KEYS = Object.freeze([
  'resolver_fid',
  'request_fid',
  'request_operation',
  'device_thumbprint',
] as const);

/** Parse the exact owner-only PTR token and recheck its absolute session time. */
export function readFreshPtrOwnerClaims(
  payload: unknown,
  currentTimeMicros: bigint,
): PtrOwnerClaims {
  try {
    if (!isRecord(payload) || !exactPtrAudience(payload)) {
      throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
    }
    const base = readBaseClaims(payload);
    const fid = parseFidClaim(payload.fid);
    const authEpoch = parseAuthEpochClaim(payload.auth_epoch);
    const issuedAt = numericDate(payload, 'iat');
    const notBefore = numericDate(payload, 'nbf');
    const expiresAt = numericDate(payload, 'exp');
    const sessionIssuedAt = numericDate(payload, 'session_iat');
    const sessionExpiresAt = numericDate(payload, 'session_exp');
    if (
      payload.auth_version !== WARPKEEP_AUTH_VERSION
      || payload.realm_id !== PTR_REALM_ID
      || base.subject !== `farcaster:${fid.toString()}`
      || base.roles.length !== 1
      || base.roles[0] !== PTR_OWNER_ROLE
      || DISALLOWED_OWNER_AUTHORITY_KEYS.some(key => payload[key] !== undefined)
      || expiresAt <= issuedAt
      || notBefore > expiresAt
      || sessionExpiresAt <= sessionIssuedAt
      || sessionExpiresAt - sessionIssuedAt > PTR_OWNER_MAX_SESSION_SECONDS
      || currentTimeMicros < 0n
      || currentTimeMicros < BigInt(sessionIssuedAt) * 1_000_000n
      || currentTimeMicros >= BigInt(sessionExpiresAt) * 1_000_000n
    ) throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
    return Object.freeze({
      ...base,
      audience: Object.freeze([...base.audience]),
      roles: Object.freeze([...base.roles]),
      authVersion: WARPKEEP_AUTH_VERSION,
      fid,
      authEpoch,
      realmId: PTR_REALM_ID,
      sessionIssuedAt,
      sessionExpiresAt,
    });
  } catch (error) {
    if (
      error instanceof PtrOwnerPolicyError
      && error.code === 'INVALID_PTR_OWNER_SESSION'
    ) throw error;
    throw new PtrOwnerPolicyError('INVALID_PTR_OWNER_SESSION');
  }
}

/** Preserve the existing exact Hermes principal under the disjoint PTR audience. */
export function readFreshPtrAdminClaims(
  payload: unknown,
  currentTimeMicros: bigint,
): PtrAdminClaims {
  try {
    const record = strictPtrAdminRecord(payload);
    const claims = readBaseClaims(record);
    const ownerFid = parseFidClaim(record.ptr_owner_fid);
    const ownerAuthEpoch = parseAuthEpochClaim(record.ptr_owner_auth_epoch);
    const issuedAt = numericDate(record, 'iat');
    const notBefore = numericDate(record, 'nbf');
    const expiresAt = numericDate(record, 'exp');
    const jti = record.jti;
    if (
      claims.subject !== WARPKEEP_HERMES_SUBJECT
      || claims.roles.length !== 1
      || claims.roles[0] !== WARPKEEP_ADMIN_ROLE
      || typeof jti !== 'string'
      || !PTR_ADMIN_JTI.test(jti)
      || currentTimeMicros < 0n
      || currentTimeMicros + PTR_ADMIN_IAT_SKEW_MICROS
        < BigInt(issuedAt) * 1_000_000n
      || currentTimeMicros + PTR_ADMIN_IAT_SKEW_MICROS
        < BigInt(notBefore) * 1_000_000n
      || expiresAt <= issuedAt
      || expiresAt <= notBefore
      || expiresAt - issuedAt > PTR_ADMIN_MAX_SESSION_SECONDS
      || currentTimeMicros >= BigInt(expiresAt) * 1_000_000n
    ) throw new PtrOwnerPolicyError('INVALID_PTR_ADMIN_SESSION');
    return Object.freeze({
      ...claims,
      audience: Object.freeze([...claims.audience]),
      roles: Object.freeze([...claims.roles]),
      ownerFid,
      ownerAuthEpoch,
    });
  } catch {
    throw new PtrOwnerPolicyError('INVALID_PTR_ADMIN_SESSION');
  }
}

/** Reject reducer arguments not cryptographically bound into the admin token. */
export function requirePtrOwnerProvisionBinding(
  admin: PtrAdminClaims,
  ownerFid: bigint,
  authEpoch: number,
): void {
  if (
    ownerFid !== admin.ownerFid
    || authEpoch !== admin.ownerAuthEpoch
  ) throw new PtrOwnerPolicyError('PTR_OWNER_PROVISION_INVALID');
}

/** Bind every owner operation to the one retained, enabled owner row. */
export function requirePtrOwnerAnchor<T extends PtrOwnerAnchorState>(
  claims: PtrOwnerClaims,
  anchor: T | null,
  rowCount: bigint,
): T {
  if (
    rowCount !== 1n
    || anchor === null
    || anchor.singletonKey !== PTR_OWNER_SINGLETON_KEY
    || !anchor.enabled
    || anchor.ownerFid !== claims.fid
    || anchor.authEpoch !== claims.authEpoch
  ) throw new PtrOwnerPolicyError('PTR_OWNER_NOT_AUTHORIZED');
  return anchor;
}

/** One-shot provisioning deliberately has no idempotent replacement branch. */
export function planPtrOwnerProvision(
  rowCount: bigint,
  existing: PtrOwnerAnchorState | null,
  ownerFid: bigint,
  authEpoch: number,
): PtrOwnerAnchorState {
  if (rowCount !== 0n || existing !== null) {
    throw new PtrOwnerPolicyError(
      rowCount > 1n
        ? 'PTR_OWNER_CARDINALITY_INVALID'
        : 'PTR_OWNER_ALREADY_PROVISIONED',
    );
  }
  if (
    ownerFid <= 0n
    || ownerFid > MAX_SUPPORTED_FID
    || !Number.isSafeInteger(authEpoch)
    || authEpoch < 1
    || authEpoch > MAX_AUTH_EPOCH
  ) throw new PtrOwnerPolicyError('PTR_OWNER_PROVISION_INVALID');
  return Object.freeze({
    singletonKey: PTR_OWNER_SINGLETON_KEY,
    ownerFid,
    authEpoch,
    enabled: true,
  });
}

/** Suspension retains the anchor and has no inverse transition. */
export function planPtrOwnerSuspension<T extends PtrOwnerAnchorState>(
  anchor: T,
  rowCount: bigint,
): T & Readonly<{ enabled: false }> {
  if (rowCount !== 1n || anchor.singletonKey !== PTR_OWNER_SINGLETON_KEY) {
    throw new PtrOwnerPolicyError('PTR_OWNER_CARDINALITY_INVALID');
  }
  if (!anchor.enabled) {
    throw new PtrOwnerPolicyError('PTR_OWNER_ALREADY_SUSPENDED');
  }
  return Object.freeze({ ...anchor, enabled: false });
}
