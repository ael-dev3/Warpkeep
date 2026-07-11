import type { VerifiedFarcasterIdentity } from './farcasterAuthTypes';

/**
 * A deliberately narrow, local-only convenience record. It is not a
 * Farcaster credential, proof, or continuation of a SIWF session.
 */
export const FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION = 1 as const;
export const FARCASTER_REMEMBERED_DEVICE_SESSION_KIND =
  'remembered-device-prototype' as const;
export const FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

const STORAGE_KEY_SUFFIX = ':farcaster-device-session:v1';
const MAX_BASE_PATH_LENGTH = 256;
const MAX_ORIGIN_LENGTH = 2_048;
const MAX_PROFILE_FIELD_LENGTH = 256;
const MAX_PROFILE_URL_LENGTH = 2_048;
const MAX_STORED_RECORD_LENGTH = 8_192;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

export type FarcasterRememberedDeviceIdentity = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}>;

/**
 * The complete allowlist for data that may survive a browser restart.
 *
 * Intentionally absent: channel tokens, QR data, SIWF message/signature,
 * custody address, verification addresses, auth method, request IDs, and
 * browser/device metadata.
 */
export type FarcasterRememberedDeviceSession = Readonly<{
  version: typeof FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION;
  kind: typeof FARCASTER_REMEMBERED_DEVICE_SESSION_KIND;
  origin: string;
  basePath: string;
  identity: FarcasterRememberedDeviceIdentity;
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

function hasOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
) {
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

function safelyRemove(storage: FarcasterDeviceSessionStorage | undefined, key: string) {
  if (!storage) {
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
  const publicIdentity = {
    fid: identity.fid,
    ...(identity.username === undefined ? {} : { username: identity.username }),
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl })
  };
  return readRememberedIdentity(publicIdentity);
}

function createSessionRecord(
  identity: VerifiedFarcasterIdentity,
  environment: FarcasterDeviceSessionEnvironment
): FarcasterRememberedDeviceSession | undefined {
  const now = readCurrentTime(environment.now);
  const origin = resolveOrigin(environment);
  const basePath = resolveBasePath(environment);
  const publicIdentity = copyRememberedIdentity(identity);
  const verifiedAt = readSafeTimestamp(identity?.verifiedAt);

  if (
    now === undefined
    || !origin
    || !basePath
    || !publicIdentity
    || verifiedAt === undefined
    || verifiedAt > now
    || now > Number.MAX_SAFE_INTEGER - FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
  ) {
    return undefined;
  }

  return Object.freeze({
    version: FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION,
    kind: FARCASTER_REMEMBERED_DEVICE_SESSION_KIND,
    origin,
    basePath,
    identity: publicIdentity,
    verifiedAt,
    rememberedAt: now,
    expiresAt: now + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
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
    || expiresAt - rememberedAt !== FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
  ) {
    return undefined;
  }

  return Object.freeze({
    version: FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION,
    kind: FARCASTER_REMEMBERED_DEVICE_SESSION_KIND,
    origin: expectedOrigin,
    basePath: expectedBasePath,
    identity,
    verifiedAt,
    rememberedAt,
    expiresAt
  });
}

/**
 * Persists an explicit 30-day device-memory record. A storage failure is
 * intentionally non-fatal and does not affect the live verified session.
 */
export function persistFarcasterRememberedDeviceSession(
  identity: VerifiedFarcasterIdentity,
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = resolveStorage(environment);
  const record = createSessionRecord(identity, environment);
  const key = getFarcasterDeviceSessionStorageKey(
    environment.basePath === undefined ? import.meta.env.BASE_URL || '/' : environment.basePath
  );
  if (!storage || !record || !key) {
    return undefined;
  }

  try {
    storage.setItem(key, JSON.stringify(record));
    return record;
  } catch {
    return undefined;
  }
}

/**
 * Restores only an unexpired record bound to this exact origin and app base.
 * Any malformed, stale, or foreign-shaped value is removed best-effort.
 */
export function restoreFarcasterRememberedDeviceSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = resolveStorage(environment);
  const basePath = resolveBasePath(environment);
  const key = getFarcasterDeviceSessionStorageKey(
    environment.basePath === undefined ? import.meta.env.BASE_URL || '/' : environment.basePath
  );
  if (!storage || !basePath || !key) {
    return undefined;
  }

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

/** Forget the local prototype record without affecting any remote Farcaster state. */
export function clearFarcasterRememberedDeviceSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = resolveStorage(environment);
  const key = getFarcasterDeviceSessionStorageKey(
    environment.basePath === undefined ? import.meta.env.BASE_URL || '/' : environment.basePath
  );
  if (storage && key) {
    safelyRemove(storage, key);
  }
}
