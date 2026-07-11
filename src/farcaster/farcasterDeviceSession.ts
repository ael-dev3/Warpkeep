import type {
  FarcasterOidcSession,
  VerifiedFarcasterIdentity
} from './farcasterAuthTypes';
import { validateFarcasterOidcSessionForIdentity } from './farcasterOidcSession';

/**
 * Version 2 is the only browser record that can restore a shared-realm
 * credential. Version 1 stored display identity only and is deliberately
 * retired below instead of being treated as authority.
 */
export const FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION = 2 as const;
export const FARCASTER_REMEMBERED_DEVICE_SESSION_KIND = 'bridge-oidc-alpha' as const;
export const FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export const FARCASTER_OIDC_DEVICE_SESSION_VERSION =
  FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION;
export const FARCASTER_OIDC_DEVICE_SESSION_KIND =
  FARCASTER_REMEMBERED_DEVICE_SESSION_KIND;

const LEGACY_SESSION_VERSION = 1 as const;
const LEGACY_STORAGE_KEY_SUFFIX = ':farcaster-device-session:v1';
const STORAGE_KEY_SUFFIX = ':farcaster-device-session:v2';
const MAX_BASE_PATH_LENGTH = 256;
const MAX_ORIGIN_LENGTH = 2_048;
const MAX_PROFILE_FIELD_LENGTH = 256;
const MAX_PROFILE_URL_LENGTH = 2_048;
const MAX_STORED_RECORD_LENGTH = 32_768;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

export type FarcasterRememberedDeviceIdentity = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}>;

/**
 * Complete v2 storage allowlist. Raw SIWF proof, relay channel information,
 * custody/verification addresses, and admin/service credentials are absent by
 * construction.
 */
export type FarcasterRememberedDeviceSession = Readonly<{
  version: typeof FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION;
  kind: typeof FARCASTER_REMEMBERED_DEVICE_SESSION_KIND;
  origin: string;
  basePath: string;
  identity: FarcasterRememberedDeviceIdentity;
  issuer: string;
  audience: string;
  jwt: string;
  verifiedAt: number;
  rememberedAt: number;
  expiresAt: number;
}>;

export type FarcasterDeviceSessionStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

/** Optional runtime inputs keep this module deterministic and SSR-safe. */
export type FarcasterDeviceSessionEnvironment = Readonly<{
  storage?: FarcasterDeviceSessionStorage | null;
  origin?: string;
  basePath?: string;
  now?: () => number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readSafeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function readCurrentTime(now: (() => number) | undefined) {
  let value: number;
  try {
    value = now ? now() : Date.now();
  } catch {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    return undefined;
  }
  return Math.floor(value);
}

function readSafeOrigin(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ORIGIN_LENGTH) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:')
      || url.username !== ''
      || url.password !== ''
      || url.pathname !== '/'
      || url.search !== ''
      || url.hash !== ''
      || url.origin !== value
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Normalizes a Vite-style application base path without accepting URLs,
 * traversal, encoded delimiters, or query/hash material.
 */
export function normalizeFarcasterDeviceSessionBasePath(value: unknown) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_BASE_PATH_LENGTH
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || value.includes('?')
    || value.includes('#')
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return undefined;
  }

  const rawSegments = value.split('/');
  for (let index = 0; index < rawSegments.length; index += 1) {
    const rawSegment = rawSegments[index];
    const isBoundarySegment = index === 0 || index === rawSegments.length - 1;
    if (rawSegment === '') {
      if (isBoundarySegment) {
        continue;
      }
      return undefined;
    }

    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return undefined;
    }

    if (
      segment === ''
      || segment === '.'
      || segment === '..'
      || segment.includes('/')
      || segment.includes('\\')
      || segment.includes('?')
      || segment.includes('#')
      || CONTROL_CHARACTER_PATTERN.test(segment)
    ) {
      return undefined;
    }
  }

  return value.endsWith('/') ? value : `${value}/`;
}

/** The storage key is scoped by the deploy base path as well as browser origin. */
export function getFarcasterDeviceSessionStorageKey(
  basePath: unknown = import.meta.env.BASE_URL || '/'
) {
  const normalizedBasePath = normalizeFarcasterDeviceSessionBasePath(basePath);
  return normalizedBasePath
    ? `warpkeep:${normalizedBasePath}${STORAGE_KEY_SUFFIX}`
    : undefined;
}

/** Public only for migration tests and cross-tab cleanup; it is never authority. */
export function getLegacyFarcasterDeviceSessionStorageKey(
  basePath: unknown = import.meta.env.BASE_URL || '/'
) {
  const normalizedBasePath = normalizeFarcasterDeviceSessionBasePath(basePath);
  return normalizedBasePath
    ? `warpkeep:${normalizedBasePath}${LEGACY_STORAGE_KEY_SUFFIX}`
    : undefined;
}

function getBrowserStorage() {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function getBrowserOrigin() {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.location.origin;
  } catch {
    return undefined;
  }
}

function resolveStorage(environment: FarcasterDeviceSessionEnvironment) {
  if (hasOwn(environment as Record<string, unknown>, 'storage')) {
    return environment.storage ?? undefined;
  }
  return getBrowserStorage();
}

function resolveBasePath(environment: FarcasterDeviceSessionEnvironment) {
  return normalizeFarcasterDeviceSessionBasePath(
    environment.basePath === undefined ? import.meta.env.BASE_URL || '/' : environment.basePath
  );
}

function resolveOrigin(environment: FarcasterDeviceSessionEnvironment) {
  return readSafeOrigin(
    environment.origin === undefined ? getBrowserOrigin() : environment.origin
  );
}

function storageBasePath(environment: FarcasterDeviceSessionEnvironment) {
  return environment.basePath === undefined ? import.meta.env.BASE_URL || '/' : environment.basePath;
}

function safelyRemove(storage: FarcasterDeviceSessionStorage | undefined, key: string | undefined) {
  if (!storage || !key) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Private browsing / denied storage is an expected non-authentication failure.
  }
}

function readProfileText(value: unknown) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_PROFILE_FIELD_LENGTH
    || value !== value.trim()
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return undefined;
  }
  return value;
}

function readProfileUrl(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PROFILE_URL_LENGTH) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:')
      || url.username !== ''
      || url.password !== ''
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function readRememberedIdentity(value: unknown): FarcasterRememberedDeviceIdentity | undefined {
  if (
    !isRecord(value)
    || !hasOnlyAllowedKeys(value, ['fid', 'username', 'displayName', 'pfpUrl'])
    || typeof value.fid !== 'number'
    || !Number.isSafeInteger(value.fid)
    || value.fid <= 0
  ) {
    return undefined;
  }

  const identity: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  } = { fid: value.fid };

  if (hasOwn(value, 'username')) {
    const username = readProfileText(value.username);
    if (!username) {
      return undefined;
    }
    identity.username = username;
  }
  if (hasOwn(value, 'displayName')) {
    const displayName = readProfileText(value.displayName);
    if (!displayName) {
      return undefined;
    }
    identity.displayName = displayName;
  }
  if (hasOwn(value, 'pfpUrl')) {
    const pfpUrl = readProfileUrl(value.pfpUrl);
    if (!pfpUrl) {
      return undefined;
    }
    identity.pfpUrl = pfpUrl;
  }

  return Object.freeze(identity);
}

function copyRememberedIdentity(
  identity: VerifiedFarcasterIdentity
): FarcasterRememberedDeviceIdentity | undefined {
  if (!isRecord(identity)) {
    return undefined;
  }
  return readRememberedIdentity({
    fid: identity.fid,
    ...(identity.username === undefined ? {} : { username: identity.username }),
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl })
  });
}

function createSessionRecord(
  identity: VerifiedFarcasterIdentity,
  oidcSession: FarcasterOidcSession,
  environment: FarcasterDeviceSessionEnvironment
): FarcasterRememberedDeviceSession | undefined {
  const now = readCurrentTime(environment.now);
  const origin = resolveOrigin(environment);
  const basePath = resolveBasePath(environment);
  const publicIdentity = copyRememberedIdentity(identity);
  const verifiedAt = readSafeTimestamp(identity?.verifiedAt);
  const parsedOidc = validateFarcasterOidcSessionForIdentity(oidcSession, identity.fid, { now });

  if (
    now === undefined
    || !origin
    || !basePath
    || !publicIdentity
    || verifiedAt === undefined
    || verifiedAt > now
    || !parsedOidc
    || parsedOidc.session.expiresAt <= now
    || parsedOidc.session.expiresAt - now > FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
  ) {
    return undefined;
  }

  return Object.freeze({
    version: FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION,
    kind: FARCASTER_REMEMBERED_DEVICE_SESSION_KIND,
    origin,
    basePath,
    identity: publicIdentity,
    issuer: parsedOidc.session.issuer,
    audience: parsedOidc.session.audience,
    jwt: parsedOidc.session.jwt,
    verifiedAt,
    rememberedAt: now,
    expiresAt: parsedOidc.session.expiresAt
  });
}

function parseSessionRecord(
  value: unknown,
  expectedOrigin: string,
  expectedBasePath: string,
  now: number
): FarcasterRememberedDeviceSession | undefined {
  if (
    !isRecord(value)
    || !hasOnlyAllowedKeys(value, [
      'version',
      'kind',
      'origin',
      'basePath',
      'identity',
      'issuer',
      'audience',
      'jwt',
      'verifiedAt',
      'rememberedAt',
      'expiresAt'
    ])
    || value.version !== FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION
    || value.kind !== FARCASTER_REMEMBERED_DEVICE_SESSION_KIND
    || readSafeOrigin(value.origin) !== expectedOrigin
    || normalizeFarcasterDeviceSessionBasePath(value.basePath) !== expectedBasePath
    || value.basePath !== expectedBasePath
  ) {
    return undefined;
  }

  const identity = readRememberedIdentity(value.identity);
  const verifiedAt = readSafeTimestamp(value.verifiedAt);
  const rememberedAt = readSafeTimestamp(value.rememberedAt);
  const expiresAt = readSafeTimestamp(value.expiresAt);
  if (
    !identity
    || verifiedAt === undefined
    || rememberedAt === undefined
    || expiresAt === undefined
    || verifiedAt > rememberedAt
    || rememberedAt > now
    || expiresAt <= now
    || expiresAt - rememberedAt > FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
  ) {
    return undefined;
  }

  const parsedOidc = validateFarcasterOidcSessionForIdentity({
    jwt: value.jwt,
    issuer: value.issuer,
    audience: value.audience,
    expiresAt
  }, identity.fid, { now });
  if (!parsedOidc || parsedOidc.session.expiresAt !== expiresAt) {
    return undefined;
  }

  return Object.freeze({
    version: FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION,
    kind: FARCASTER_REMEMBERED_DEVICE_SESSION_KIND,
    origin: expectedOrigin,
    basePath: expectedBasePath,
    identity,
    issuer: parsedOidc.session.issuer,
    audience: parsedOidc.session.audience,
    jwt: parsedOidc.session.jwt,
    verifiedAt,
    rememberedAt,
    expiresAt
  });
}

/** Converts the strict persisted record into the private runtime bearer shape. */
export function toFarcasterOidcSession(
  session: FarcasterRememberedDeviceSession
): FarcasterOidcSession {
  return Object.freeze({
    jwt: session.jwt,
    issuer: session.issuer,
    audience: session.audience,
    expiresAt: session.expiresAt
  });
}

/**
 * Persists a strict v2 closed-alpha record. Storage failure is intentionally
 * non-fatal and never downgrades a current live bridge session to prototype
 * authority.
 */
export function persistFarcasterRememberedDeviceSession(
  identity: VerifiedFarcasterIdentity,
  oidcSession: FarcasterOidcSession,
  environment?: FarcasterDeviceSessionEnvironment
): FarcasterRememberedDeviceSession | undefined;
/**
 * Compatibility-only legacy call shape. It intentionally returns no record:
 * identity-only browser data can no longer authorize the shared realm.
 */
export function persistFarcasterRememberedDeviceSession(
  identity: VerifiedFarcasterIdentity,
  environment?: FarcasterDeviceSessionEnvironment
): undefined;
export function persistFarcasterRememberedDeviceSession(
  identity: VerifiedFarcasterIdentity,
  oidcSessionOrEnvironment?: FarcasterOidcSession | FarcasterDeviceSessionEnvironment,
  providedEnvironment?: FarcasterDeviceSessionEnvironment
) {
  const hasOidcSession = isRecord(oidcSessionOrEnvironment)
    && hasOnlyAllowedKeys(oidcSessionOrEnvironment, ['jwt', 'issuer', 'audience', 'expiresAt']);
  if (!hasOidcSession) {
    return undefined;
  }
  const oidcSession = oidcSessionOrEnvironment as FarcasterOidcSession;
  const environment = providedEnvironment ?? {};
  const storage = resolveStorage(environment);
  const record = createSessionRecord(identity, oidcSession, environment);
  const key = getFarcasterDeviceSessionStorageKey(storageBasePath(environment));
  if (!storage || !record || !key) {
    return undefined;
  }

  try {
    storage.setItem(key, JSON.stringify(record));
    // A fresh exchange is the only valid migration path from the v1 display
    // record, so delete it only after v2 has been written successfully.
    safelyRemove(storage, getLegacyFarcasterDeviceSessionStorageKey(storageBasePath(environment)));
    return record;
  } catch {
    return undefined;
  }
}

/**
 * Restores only an unexpired v2 OIDC record bound to this exact origin and
 * deploy base. Any v1 prototype record is purged and cannot enter the shared
 * realm. Malformed, stale, or foreign v2 values are also removed best-effort.
 */
export function restoreFarcasterRememberedDeviceSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = resolveStorage(environment);
  const basePath = resolveBasePath(environment);
  const key = getFarcasterDeviceSessionStorageKey(storageBasePath(environment));
  const legacyKey = getLegacyFarcasterDeviceSessionStorageKey(storageBasePath(environment));
  if (!storage || !basePath || !key) {
    return undefined;
  }

  // Never surface an identity-only v1 record as authority. It must be
  // replaced by a fresh Farcaster proof + bridge exchange.
  safelyRemove(storage, legacyKey);

  const origin = resolveOrigin(environment);
  const now = readCurrentTime(environment.now);
  if (!origin || now === undefined) {
    safelyRemove(storage, key);
    return undefined;
  }

  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return undefined;
  }
  if (serialized === null) {
    return undefined;
  }

  if (serialized.length === 0 || serialized.length > MAX_STORED_RECORD_LENGTH) {
    safelyRemove(storage, key);
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    safelyRemove(storage, key);
    return undefined;
  }

  const record = parseSessionRecord(parsed, origin, basePath, now);
  if (!record) {
    safelyRemove(storage, key);
  }
  return record;
}

/** Forget both current OIDC state and the retired v1 display-only state. */
export function clearFarcasterRememberedDeviceSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = resolveStorage(environment);
  if (!storage) {
    return;
  }
  const basePath = storageBasePath(environment);
  safelyRemove(storage, getFarcasterDeviceSessionStorageKey(basePath));
  safelyRemove(storage, getLegacyFarcasterDeviceSessionStorageKey(basePath));
}

/** Exposed only to make v1 fail-closed tests explicit. */
export const FARCASTER_LEGACY_DEVICE_SESSION_VERSION = LEGACY_SESSION_VERSION;
