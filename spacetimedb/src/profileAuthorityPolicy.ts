const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const ATTRIBUTION_KEY_PATTERN = /^[a-f0-9]{64}$/;

export const FARCASTER_PROFILE_POLICY_VERSION = 'trusted-snapchain-profile-v3';
export const FARCASTER_WALLET_POLICY_VERSION = 'trusted-snapchain-current-wallet-v1';

export class ProfileAuthorityPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProfileAuthorityPolicyError';
  }
}

function normalizedText(value: string | undefined, maximumCharacters: number): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    // Strip invisible direction/isolate controls that can spoof public labels
    // while preserving ordinary Unicode letters, punctuation, and emoji.
    .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  return [...cleaned].slice(0, maximumCharacters).join('');
}

function normalizedUsername(value: string | undefined): string | undefined {
  const normalized = normalizedText(value, 64)?.toLowerCase();
  if (normalized === undefined) return undefined;
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new ProfileAuthorityPolicyError('PROFILE_USERNAME_INVALID');
  }
  return normalized;
}

function hasCanonicalPercentEncoding(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '%') continue;
    if (!/^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) return false;
    index += 2;
  }
  return true;
}

function hasUrlNormalizedDotSegment(path: string): boolean {
  return path.split('/').some(segment => (
    segment === '.'
    || segment === '..'
    || /^%2e$/i.test(segment)
    || /^(?:\.%2e|%2e\.|%2e%2e)$/i.test(segment)
  ));
}

/**
 * WHATWG treats one to four numeric-looking labels as an IPv4 address and
 * canonicalizes alternate decimal, octal, and hexadecimal spellings. The
 * module has no URL parser, so reject that entire conservative hostname shape
 * before a producer-valid value can become a browser-rejected literal IP.
 */
function hasIpv4NumberHostnameShape(hostname: string): boolean {
  const labels = hostname.split('.');
  return labels.length >= 1
    && labels.length <= 4
    && labels.every(label => (
      /^(?:0x[0-9a-f]+|0[0-7]*|[1-9][0-9]*|0)$/i.test(label)
    ));
}

function normalizedPfpUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > 2_048) throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');
  // SpacetimeDB's server runtime does not provide the browser URL constructor.
  // The trusted local resolver already canonicalizes through URL before this
  // reducer boundary, so validate that canonical HTTPS serialization using
  // deterministic string operations supported by the module runtime.
  const fragmentIndex = value.indexOf('#');
  const canonical = fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
  if (
    !canonical.startsWith('https://')
    || canonical.length > 2_048
    || /[\u0000-\u0020\u007f\\]/.test(canonical)
  ) {
    throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');
  }
  const remainder = canonical.slice('https://'.length);
  const authorityEnd = [remainder.indexOf('/'), remainder.indexOf('?')]
    .filter(index => index >= 0)
    .reduce((minimum, index) => Math.min(minimum, index), remainder.length);
  const authority = remainder.slice(0, authorityEnd);
  if (
    !authority
    || authority.includes('@')
    || authority.includes(':')
    || authority.startsWith('[')
    || authority.includes(']')
  ) {
    throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');
  }
  const hostname = authority.toLowerCase();
  if (
    !hostname
    || hostname.endsWith('.')
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.invalid')
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
    || hasIpv4NumberHostnameShape(hostname)
    || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(hostname)
    || hostname.split('.').some(label => (
      label.length > 63
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    ))
  ) throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');

  // WHATWG URL serialization always emits an absolute path after an HTTPS
  // authority and lower-cases the hostname. Normalize those two deterministic
  // cases here, then accept only a lexical path/query subset that the browser
  // preserves byte-for-byte. Ports are rejected above because the client image
  // policy rejects every non-empty parsed port.
  const rawSuffix = remainder.slice(authorityEnd);
  const suffix = rawSuffix === ''
    ? '/'
    : rawSuffix.startsWith('?')
      ? `/${rawSuffix}`
      : rawSuffix;
  const queryIndex = suffix.indexOf('?');
  const path = queryIndex === -1 ? suffix : suffix.slice(0, queryIndex);
  const query = queryIndex === -1 ? undefined : suffix.slice(queryIndex + 1);
  if (
    !/^\/[a-z0-9._~!$&'()*+,;=:@/%-]*$/i.test(path)
    || (query !== undefined && !/^[a-z0-9._~!$&()*+,;=:@/%?+-]*$/i.test(query))
    || !hasCanonicalPercentEncoding(path)
    || (query !== undefined && !hasCanonicalPercentEncoding(query))
    || hasUrlNormalizedDotSegment(path)
  ) throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');

  return `https://${hostname}${suffix}`;
}

export type TrustedPublicProfileInput = Readonly<{
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
}>;

export type TrustedPublicProfile = Readonly<{
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
}>;

/**
 * Minimum trusted public presentation required before a new founder may be
 * admitted. Optional display name and bio remain presentation-only fields.
 */
export type AdmissionReadyTrustedProfile = TrustedPublicProfile & Readonly<{
  canonicalUsername: string;
  pfpUrl: string;
}>;

/**
 * Re-applies the module's own bounds even though the local resolver already
 * sanitizes its output. The browser has no route to this policy or reducer.
 */
export function normalizeTrustedPublicProfile(
  input: TrustedPublicProfileInput,
): TrustedPublicProfile {
  return Object.freeze({
    canonicalUsername: normalizedUsername(input.canonicalUsername),
    displayName: normalizedText(input.displayName, 80),
    pfpUrl: normalizedPfpUrl(input.pfpUrl),
    publicBio: normalizedText(input.publicBio, 320),
  });
}

/**
 * Require the two durable public identity signals used to present a newly
 * admitted castle. Normalization happens before completeness checks so blank,
 * control-only, or fragment-only input cannot satisfy admission policy.
 */
export function normalizeAdmissionReadyTrustedProfile(
  input: TrustedPublicProfileInput,
): AdmissionReadyTrustedProfile {
  const normalized = normalizeTrustedPublicProfile(input);
  if (normalized.canonicalUsername === undefined) {
    throw new ProfileAuthorityPolicyError('PROFILE_ADMISSION_USERNAME_REQUIRED');
  }
  if (normalized.pfpUrl === undefined) {
    throw new ProfileAuthorityPolicyError('PROFILE_ADMISSION_PFP_REQUIRED');
  }
  return normalized as AdmissionReadyTrustedProfile;
}

/**
 * Fail-closed type guard for persisted or independently constructed profiles.
 * Presence alone is insufficient: both required fields must still equal the
 * module's canonical normalization.
 */
export function admissionProfileIsComplete(
  profile: TrustedPublicProfile,
): profile is AdmissionReadyTrustedProfile {
  let normalized: TrustedPublicProfile;
  try {
    normalized = normalizeTrustedPublicProfile(profile);
  } catch {
    return false;
  }
  return normalized.canonicalUsername !== undefined
    && normalized.pfpUrl !== undefined
    && trustedProfilesEqual(profile, normalized);
}

export function trustedProfilesEqual(
  left: TrustedPublicProfile,
  right: TrustedPublicProfile,
): boolean {
  return left.canonicalUsername === right.canonicalUsername
    && left.displayName === right.displayName
    && left.pfpUrl === right.pfpUrl
    && left.publicBio === right.publicBio;
}

export type TrustedWalletAttributionInput = Readonly<{
  attributionKey: string;
  address: string;
  addressType: string;
  source: string;
  attributionPolicyVersion: string;
  active: boolean;
}>;

export function normalizeTrustedWalletAttribution(
  input: TrustedWalletAttributionInput,
): TrustedWalletAttributionInput {
  const attributionKey = input.attributionKey.trim().toLowerCase();
  const address = input.address.trim().toLowerCase();
  if (!ATTRIBUTION_KEY_PATTERN.test(attributionKey)) {
    throw new ProfileAuthorityPolicyError('WALLET_ATTRIBUTION_KEY_INVALID');
  }
  if (!ADDRESS_PATTERN.test(address)) {
    throw new ProfileAuthorityPolicyError('WALLET_ADDRESS_INVALID');
  }
  if (input.addressType !== 'custody' && input.addressType !== 'verified_evm') {
    throw new ProfileAuthorityPolicyError('WALLET_ADDRESS_TYPE_INVALID');
  }
  if (input.source !== 'snapchain_id_registry' && input.source !== 'snapchain_verification') {
    throw new ProfileAuthorityPolicyError('WALLET_SOURCE_INVALID');
  }
  if (input.attributionPolicyVersion !== FARCASTER_WALLET_POLICY_VERSION) {
    throw new ProfileAuthorityPolicyError('WALLET_POLICY_MISMATCH');
  }
  return Object.freeze({
    attributionKey,
    address,
    addressType: input.addressType,
    source: input.source,
    attributionPolicyVersion: input.attributionPolicyVersion,
    active: input.active,
  });
}
