import {
  WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
  safePublicHttpsImageUrl
} from '../security/publicImageUrl';
import { normalizePublicProfileText } from '../security/publicProfileText';

export const REALM_CASTLE_NAME_MAXIMUM_LENGTH = 80;
export const REALM_USERNAME_MAXIMUM_LENGTH = 64;
export const REALM_DISPLAY_NAME_MAXIMUM_LENGTH = 80;
export const REALM_PUBLIC_BIO_MAXIMUM_LENGTH = 320;
export const REALM_PUBLIC_STATUS_MAXIMUM_LENGTH = 32;
export const REALM_MARKS_POLICY_MAXIMUM_LENGTH = 128;

const CANONICAL_USERNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

/** Public database strings must already be in the canonical display form. */
export function isCanonicalRealmPublicText(
  value: unknown,
  maximumLength: number
): value is string {
  return typeof value === 'string'
    && normalizePublicProfileText(value, maximumLength) === value;
}

/**
 * Browser presentation is stricter than historical producer revisions. Drop
 * invalid optional display metadata at connection ingress instead of allowing
 * one producer-valid legacy field to revoke the whole Realm snapshot.
 */
export function sanitizeOptionalRealmPublicText(
  value: unknown,
  maximumLength: number
) {
  return value === undefined
    ? undefined
    : normalizePublicProfileText(value, maximumLength);
}

export function isCanonicalOptionalRealmPublicText(
  value: unknown,
  maximumLength: number
): value is string | undefined {
  return value === undefined || isCanonicalRealmPublicText(value, maximumLength);
}

export function isCanonicalOptionalRealmUsername(
  value: unknown
): value is string | undefined {
  return value === undefined || (
    isCanonicalRealmPublicText(value, REALM_USERNAME_MAXIMUM_LENGTH)
    && CANONICAL_USERNAME_PATTERN.test(value)
  );
}

export function sanitizeOptionalRealmUsername(value: unknown) {
  // Usernames are linking identities, not presentation copy. Never remove a
  // control or lowercase an untrusted value into a different valid handle.
  // Producer-canonical usernames pass byte-for-byte; every other value drops.
  return isCanonicalOptionalRealmUsername(value) ? value : undefined;
}

export function isCanonicalOptionalRealmProfileImageUrl(
  value: unknown,
  allowLocalObserverPlaceholder = false
): value is string | undefined {
  if (value === undefined) return true;
  if (
    allowLocalObserverPlaceholder
    && import.meta.env.DEV
    && value === WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH
  ) return true;
  return typeof value === 'string' && safePublicHttpsImageUrl(value) === value;
}

export function sanitizeOptionalRealmProfileImageUrl(value: unknown) {
  return typeof value === 'string' ? safePublicHttpsImageUrl(value) : undefined;
}
