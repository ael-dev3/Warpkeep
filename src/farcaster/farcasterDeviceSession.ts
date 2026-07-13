import { FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS } from './farcasterOidcSession';

/**
 * These identifiers are retained only so startup cleanup can remove bearer
 * records written by older clients. No current browser session is persisted.
 */
export const FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION = 2 as const;
export const FARCASTER_REMEMBERED_DEVICE_SESSION_KIND = 'bridge-oidc-alpha' as const;
export const FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS = FARCASTER_OIDC_ACCESS_TOKEN_TTL_MS;
export const FARCASTER_OIDC_DEVICE_SESSION_VERSION = FARCASTER_REMEMBERED_DEVICE_SESSION_VERSION;
export const FARCASTER_OIDC_DEVICE_SESSION_KIND = FARCASTER_REMEMBERED_DEVICE_SESSION_KIND;
export const FARCASTER_LEGACY_DEVICE_SESSION_VERSION = 1 as const;

const LEGACY_STORAGE_KEY_SUFFIX = ':farcaster-device-session:v1';
const STORAGE_KEY_SUFFIX = ':farcaster-device-session:v2';
const CONTROL_KEY_SUFFIX = ':farcaster-session-control:v1';
const CONTROL_VALUE_PATTERN = /^logout-v1:(0|[1-9]\d*)$/;
const MAX_BASE_PATH_LENGTH = 256;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

/** Matches the maximum lifetime of a server-side session family. */
export const FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export type FarcasterSessionTerminationIntentStatus =
  | 'absent'
  | 'active'
  | 'stale'
  | 'malformed'
  | 'unavailable';

export type FarcasterDeviceSessionStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
> & Partial<Pick<Storage, 'key' | 'length'>>;

/** Optional runtime inputs keep cleanup deterministic, testable, and SSR-safe. */
export type FarcasterDeviceSessionEnvironment = Readonly<{
  /** Compatibility alias for the localStorage-backed logout signal. */
  storage?: FarcasterDeviceSessionStorage | null;
  localStorage?: FarcasterDeviceSessionStorage | null;
  sessionStorage?: FarcasterDeviceSessionStorage | null;
  /** Retained only for compatibility with deterministic cleanup fixtures. */
  origin?: string;
  basePath?: string;
  now?: () => number;
}>;

/** Retired compatibility type: there is no persisted authoritative record. */
export type FarcasterRememberedDeviceSession = never;

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readCurrentTime(now: (() => number) | undefined) {
  let value: number;
  try {
    value = now ? now() : Date.now();
  } catch {
    return undefined;
  }
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
    ? Math.floor(value)
    : undefined;
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
      if (isBoundarySegment) continue;
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

export function getFarcasterDeviceSessionStorageKey(
  basePath: unknown = import.meta.env.BASE_URL || '/'
) {
  const normalizedBasePath = normalizeFarcasterDeviceSessionBasePath(basePath);
  return normalizedBasePath
    ? `warpkeep:${normalizedBasePath}${STORAGE_KEY_SUFFIX}`
    : undefined;
}

export function getLegacyFarcasterDeviceSessionStorageKey(
  basePath: unknown = import.meta.env.BASE_URL || '/'
) {
  const normalizedBasePath = normalizeFarcasterDeviceSessionBasePath(basePath);
  return normalizedBasePath
    ? `warpkeep:${normalizedBasePath}${LEGACY_STORAGE_KEY_SUFFIX}`
    : undefined;
}

/** The only retained storage write is a non-secret cross-tab logout event. */
export function getFarcasterDeviceSessionControlKey(
  basePath: unknown = import.meta.env.BASE_URL || '/'
) {
  const normalizedBasePath = normalizeFarcasterDeviceSessionBasePath(basePath);
  return normalizedBasePath
    ? `warpkeep:${normalizedBasePath}${CONTROL_KEY_SUFFIX}`
    : undefined;
}

function browserStorage(name: 'localStorage' | 'sessionStorage') {
  if (typeof window === 'undefined') return undefined;
  try {
    return window[name];
  } catch {
    return undefined;
  }
}

function localStorageFor(environment: FarcasterDeviceSessionEnvironment) {
  if (hasOwn(environment, 'localStorage')) return environment.localStorage ?? undefined;
  if (hasOwn(environment, 'storage')) return environment.storage ?? undefined;
  return browserStorage('localStorage');
}

function sessionStorageFor(environment: FarcasterDeviceSessionEnvironment) {
  if (hasOwn(environment, 'sessionStorage')) return environment.sessionStorage ?? undefined;
  return browserStorage('sessionStorage');
}

function basePathFor(environment: FarcasterDeviceSessionEnvironment) {
  return environment.basePath === undefined
    ? import.meta.env.BASE_URL || '/'
    : environment.basePath;
}

function safelyRemove(storage: FarcasterDeviceSessionStorage | undefined, key: string | undefined) {
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    // Storage denial is non-fatal; server cookies remain the sole session source.
  }
}

function purgeStorage(
  storage: FarcasterDeviceSessionStorage | undefined,
  currentKey: string | undefined,
  legacyKey: string | undefined
) {
  safelyRemove(storage, currentKey);
  safelyRemove(storage, legacyKey);

  // Also retire records left under an earlier deploy base on this origin.
  if (!storage || typeof storage.key !== 'function' || typeof storage.length !== 'number') return;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (
        key?.startsWith('warpkeep:')
        && (key.endsWith(STORAGE_KEY_SUFFIX) || key.endsWith(LEGACY_STORAGE_KEY_SUFFIX))
      ) {
        keys.push(key);
      }
    }
  } catch {
    return;
  }
  for (const key of keys) safelyRemove(storage, key);
}

/** Best-effort startup/logout purge of all retired bearer storage. */
export function purgeFarcasterBrowserBearerStorage(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const basePath = basePathFor(environment);
  const currentKey = getFarcasterDeviceSessionStorageKey(basePath);
  const legacyKey = getLegacyFarcasterDeviceSessionStorageKey(basePath);
  purgeStorage(localStorageFor(environment), currentKey, legacyKey);
  purgeStorage(sessionStorageFor(environment), currentKey, legacyKey);
}

/**
 * Persists non-secret logout intent for reload and cross-tab suppression.
 * A false result means no durable browser record exists; callers must remain
 * fail closed in memory and rely on server-side revocation for later contexts.
 */
export function signalFarcasterSessionTermination(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = localStorageFor(environment);
  const key = getFarcasterDeviceSessionControlKey(basePathFor(environment));
  const now = readCurrentTime(environment.now);
  if (!storage || !key || now === undefined) return false;
  try {
    storage.setItem(key, `logout-v1:${now}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads only the exact scoped control key. Active, malformed, and unavailable
 * states are fail-closed inputs for automatic cookie refresh. A stale record
 * cannot outlive the server session family it was created to suppress.
 */
export function readFarcasterSessionTerminationIntent(
  environment: FarcasterDeviceSessionEnvironment = {}
): FarcasterSessionTerminationIntentStatus {
  const storage = localStorageFor(environment);
  const key = getFarcasterDeviceSessionControlKey(basePathFor(environment));
  const now = readCurrentTime(environment.now);
  if (!storage || !key || now === undefined) return 'unavailable';

  let value: string | null;
  try {
    value = storage.getItem(key);
  } catch {
    return 'unavailable';
  }
  if (value === null) return 'absent';

  const match = CONTROL_VALUE_PATTERN.exec(value);
  if (!match) return 'malformed';
  const terminatedAt = Number(match[1]);
  if (!Number.isSafeInteger(terminatedAt) || terminatedAt > now) return 'malformed';
  if (now - terminatedAt < FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS) return 'active';

  // Remove only the exact control key. Failed cleanup remains deterministically stale.
  safelyRemove(storage, key);
  return 'stale';
}

/** Explicit new sign-in is the only browser action that clears logout intent. */
export function clearFarcasterSessionTerminationIntent(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = localStorageFor(environment);
  const key = getFarcasterDeviceSessionControlKey(basePathFor(environment));
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** @deprecated Bearer persistence is retired; this always purges and returns undefined. */
export function persistFarcasterRememberedDeviceSession(
  _identity?: unknown,
  _session?: unknown,
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  purgeFarcasterBrowserBearerStorage(environment);
  return undefined;
}

/** @deprecated Cookie refresh replaces storage restoration. */
export function restoreFarcasterRememberedDeviceSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  purgeFarcasterBrowserBearerStorage(environment);
  return undefined;
}

/** @deprecated No persisted object can be converted into bearer authority. */
export function toFarcasterOidcSession() {
  return undefined;
}

export function clearFarcasterRememberedDeviceSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  purgeFarcasterBrowserBearerStorage(environment);
}
