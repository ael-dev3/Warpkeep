import { safePublicHttpsImageUrl } from '../security/publicImageUrl';
import { normalizePublicProfileText } from '../security/publicProfileText';
import {
  normalizeFarcasterDeviceSessionBasePath,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from './farcasterDeviceSession';

const PRESENTATION_SESSION_VERSION = 1 as const;
const PRESENTATION_STORAGE_KEY_SUFFIX = ':farcaster-presentation-session:v1';
const MAX_PRESENTATION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_PROFILE_FIELD_LENGTH = 256;
const MAX_PROFILE_URL_LENGTH = 2_048;
const MAX_SERIALIZED_PRESENTATION_LENGTH = 4_096;
const STORED_KEYS = new Set([
  'version',
  'fid',
  'username',
  'displayName',
  'pfpUrl',
  'expiresAt'
]);

/** Tab-local, non-authoritative profile presentation for a verified FID. */
export type FarcasterPresentationSession = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  expiresAt: number;
}>;

type StoredFarcasterPresentationSession = Readonly<{
  version: typeof PRESENTATION_SESSION_VERSION;
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  expiresAt: number;
}>;

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCurrentTime(now: (() => number) | undefined) {
  let value: number;
  try {
    value = now ? now() : Date.now();
  } catch {
    return undefined;
  }
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function basePathFor(environment: FarcasterDeviceSessionEnvironment) {
  return environment.basePath === undefined
    ? import.meta.env.BASE_URL || '/'
    : environment.basePath;
}

function sessionStorageFor(environment: FarcasterDeviceSessionEnvironment) {
  if (hasOwn(environment, 'sessionStorage')) return environment.sessionStorage ?? undefined;
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function safelyRemove(
  storage: FarcasterDeviceSessionStorage | undefined,
  key: string | undefined
) {
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function optionalProfileField(value: unknown) {
  if (value === undefined) return undefined;
  const normalized = normalizePublicProfileText(value, MAX_PROFILE_FIELD_LENGTH);
  return normalized && normalized === value ? normalized : null;
}

function optionalProfileImage(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PROFILE_URL_LENGTH) {
    return null;
  }
  return safePublicHttpsImageUrl(value) ?? null;
}

function toStoredPresentation(
  value: unknown,
  now: number
): StoredFarcasterPresentationSession | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (
    keys.some((key) => !STORED_KEYS.has(key))
    || !hasOwn(value, 'fid')
    || !hasOwn(value, 'expiresAt')
    || !Number.isSafeInteger(value.fid)
    || (value.fid as number) <= 0
    || !Number.isSafeInteger(value.expiresAt)
    || (value.expiresAt as number) <= now
    || (value.expiresAt as number) - now > MAX_PRESENTATION_SESSION_TTL_MS
  ) {
    return undefined;
  }

  if (
    hasOwn(value, 'version')
    && value.version !== PRESENTATION_SESSION_VERSION
  ) {
    return undefined;
  }

  const username = optionalProfileField(value.username);
  const displayName = optionalProfileField(value.displayName);
  const pfpUrl = optionalProfileImage(value.pfpUrl);
  if (username === null || displayName === null || pfpUrl === null) return undefined;
  if (username === undefined && displayName === undefined && pfpUrl === undefined) {
    return undefined;
  }

  return Object.freeze({
    version: PRESENTATION_SESSION_VERSION,
    fid: value.fid as number,
    ...(username === undefined ? {} : { username }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(pfpUrl === undefined ? {} : { pfpUrl }),
    expiresAt: value.expiresAt as number
  });
}

function toPublicPresentation(
  value: StoredFarcasterPresentationSession
): FarcasterPresentationSession {
  return Object.freeze({
    fid: value.fid,
    ...(value.username === undefined ? {} : { username: value.username }),
    ...(value.displayName === undefined ? {} : { displayName: value.displayName }),
    ...(value.pfpUrl === undefined ? {} : { pfpUrl: value.pfpUrl }),
    expiresAt: value.expiresAt
  });
}

export function getFarcasterPresentationSessionStorageKey(
  basePath: unknown = import.meta.env.BASE_URL || '/'
) {
  const normalizedBasePath = normalizeFarcasterDeviceSessionBasePath(basePath);
  return normalizedBasePath
    ? `warpkeep:${normalizedBasePath}${PRESENTATION_STORAGE_KEY_SUFFIX}`
    : undefined;
}

/**
 * Persists only sanitized public presentation metadata in tab-scoped storage.
 * It never writes bearer authority, proof material, or verification details.
 */
export function persistFarcasterPresentationSession(
  presentation: FarcasterPresentationSession,
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = sessionStorageFor(environment);
  const key = getFarcasterPresentationSessionStorageKey(basePathFor(environment));
  const now = readCurrentTime(environment.now);
  if (!storage || !key || now === undefined) return false;

  const stored = toStoredPresentation(presentation, now);
  if (!stored) return false;
  const serialized = JSON.stringify(stored);
  if (serialized.length > MAX_SERIALIZED_PRESENTATION_LENGTH) return false;

  try {
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

/** Reads and validates only the exact tab-local, base-path-scoped record. */
export function readFarcasterPresentationSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  const storage = sessionStorageFor(environment);
  const key = getFarcasterPresentationSessionStorageKey(basePathFor(environment));
  const now = readCurrentTime(environment.now);
  if (!storage || !key || now === undefined) return undefined;

  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return undefined;
  }
  if (serialized === null) return undefined;
  if (serialized.length === 0 || serialized.length > MAX_SERIALIZED_PRESENTATION_LENGTH) {
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
  if (!isRecord(parsed) || parsed.version !== PRESENTATION_SESSION_VERSION) {
    safelyRemove(storage, key);
    return undefined;
  }

  const stored = toStoredPresentation(parsed, now);
  if (!stored) {
    safelyRemove(storage, key);
    return undefined;
  }
  return toPublicPresentation(stored);
}

/** Removes only this deployment base's tab-local presentation record. */
export function clearFarcasterPresentationSession(
  environment: FarcasterDeviceSessionEnvironment = {}
) {
  return safelyRemove(
    sessionStorageFor(environment),
    getFarcasterPresentationSessionStorageKey(basePathFor(environment))
  );
}
