const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const ATTRIBUTION_KEY_PATTERN = /^[a-f0-9]{64}$/;

export const FARCASTER_PROFILE_POLICY_VERSION = 'trusted-snapchain-profile-v1';
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

function normalizedPfpUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > 2_048) throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');
  }
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.hostname === ''
    || url.hostname.endsWith('.invalid')
  ) {
    throw new ProfileAuthorityPolicyError('PROFILE_PFP_URL_INVALID');
  }
  url.hash = '';
  return url.href;
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
