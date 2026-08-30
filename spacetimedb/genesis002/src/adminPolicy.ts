import { GENESIS_002_AUDIENCE } from './contract';

const GENESIS_002_ISSUER = 'https://auth.warpkeep.com';
const GENESIS_002_ADMIN_SUBJECT = 'service:hermes';
const GENESIS_002_ADMIN_ROLE = 'warpkeep-admin';
const GENESIS_002_TOKEN_TYPE = 'spacetime-access';
const MAX_GENESIS_002_ADMIN_LIFETIME_SECONDS = 300;
const MAX_FUTURE_SKEW_MICROS = 1_000_000n;
const JTI = /^[A-Za-z0-9_-]{1,128}$/;
const EXACT_CLAIM_KEYS = Object.freeze([
  'iss',
  'sub',
  'aud',
  'token_type',
  'roles',
  'iat',
  'nbf',
  'exp',
  'jti',
] as const);

type JsonRecord = Readonly<Record<string, unknown>>;

export type Genesis002AdminClaims = Readonly<{
  issuer: typeof GENESIS_002_ISSUER;
  subject: typeof GENESIS_002_ADMIN_SUBJECT;
  audience: readonly [typeof GENESIS_002_AUDIENCE];
  tokenType: typeof GENESIS_002_TOKEN_TYPE;
  roles: readonly [typeof GENESIS_002_ADMIN_ROLE];
  issuedAt: number;
  notBefore: number;
  expiresAt: number;
  jti: string;
}>;

export class Genesis002AdminClaimError extends Error {
  readonly code = 'INVALID_GENESIS_002_ADMIN_SESSION' as const;

  constructor() {
    super('INVALID_GENESIS_002_ADMIN_SESSION');
    this.name = 'Genesis002AdminClaimError';
  }
}

function invalid(): never {
  throw new Genesis002AdminClaimError();
}

function strictRecord(payload: unknown): JsonRecord {
  if (
    payload === null
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || Object.getPrototypeOf(payload) !== Object.prototype
  ) {
    return invalid();
  }
  const record = payload as JsonRecord;
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== EXACT_CLAIM_KEYS.length
    || keys.some(key => (
      typeof key !== 'string'
      || !(EXACT_CLAIM_KEYS as readonly string[]).includes(key)
    ))
  ) return invalid();
  return record;
}

function numericDate(record: JsonRecord, key: 'iat' | 'nbf' | 'exp'): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalid();
  }
  return value;
}

/** Parse the one short-lived non-player authority accepted by Genesis 002. */
export function readFreshGenesis002AdminClaims(
  payload: unknown,
  currentTimeMicros: bigint,
): Genesis002AdminClaims {
  const record = strictRecord(payload);
  const audience = record.aud;
  const roles = record.roles;
  const issuedAt = numericDate(record, 'iat');
  const notBefore = numericDate(record, 'nbf');
  const expiresAt = numericDate(record, 'exp');
  const jti = record.jti;
  if (
    record.iss !== GENESIS_002_ISSUER
    || record.sub !== GENESIS_002_ADMIN_SUBJECT
    || !Array.isArray(audience)
    || audience.length !== 1
    || audience[0] !== GENESIS_002_AUDIENCE
    || record.token_type !== GENESIS_002_TOKEN_TYPE
    || !Array.isArray(roles)
    || roles.length !== 1
    || roles[0] !== GENESIS_002_ADMIN_ROLE
    || typeof jti !== 'string'
    || !JTI.test(jti)
    || currentTimeMicros < 0n
    || currentTimeMicros + MAX_FUTURE_SKEW_MICROS
      < BigInt(issuedAt) * 1_000_000n
    || currentTimeMicros + MAX_FUTURE_SKEW_MICROS
      < BigInt(notBefore) * 1_000_000n
    || expiresAt <= issuedAt
    || expiresAt <= notBefore
    || expiresAt - issuedAt > MAX_GENESIS_002_ADMIN_LIFETIME_SECONDS
    || currentTimeMicros >= BigInt(expiresAt) * 1_000_000n
  ) return invalid();

  return Object.freeze({
    issuer: GENESIS_002_ISSUER,
    subject: GENESIS_002_ADMIN_SUBJECT,
    audience: Object.freeze([GENESIS_002_AUDIENCE]) as
      readonly [typeof GENESIS_002_AUDIENCE],
    tokenType: GENESIS_002_TOKEN_TYPE,
    roles: Object.freeze([GENESIS_002_ADMIN_ROLE]) as
      readonly [typeof GENESIS_002_ADMIN_ROLE],
    issuedAt,
    notBefore,
    expiresAt,
    jti,
  });
}
