import { safePublicHttpsImageUrl } from '../../src/security/publicImageUrl';

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAINNET_NETWORK = 'FARCASTER_NETWORK_MAINNET';
const USER_DATA_MESSAGE = 'MESSAGE_TYPE_USER_DATA_ADD';

export const FARCASTER_PROFILE_POLICY_VERSION = 'trusted-snapchain-profile-v1';

export const FARCASTER_PUBLIC_USER_DATA_TYPES = Object.freeze([
  'USER_DATA_TYPE_USERNAME',
  'USER_DATA_TYPE_DISPLAY',
  'USER_DATA_TYPE_BIO',
  'USER_DATA_TYPE_PFP',
] as const);

export type FarcasterPublicUserDataType = typeof FARCASTER_PUBLIC_USER_DATA_TYPES[number];

export class FarcasterPublicProfileError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FarcasterPublicProfileError';
  }
}

export type TrustedPublicFarcasterProfile = Readonly<{
  fid: bigint;
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
  farcasterProfileUrl?: string;
}>;

export type ExistingPublicProfile = Readonly<{
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
}>;

type UnknownRecord = Record<string, unknown>;
type UserDataValue = Readonly<{
  type: FarcasterPublicUserDataType;
  value: string;
  timestamp: number;
}>;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function positiveSafeFid(value: unknown, expectedFid: bigint): void {
  const parsed = typeof value === 'bigint'
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? BigInt(value)
      : typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)
        ? BigInt(value)
        : 0n;
  if (parsed !== expectedFid || parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FarcasterPublicProfileError('FARCASTER_PROFILE_FID_MISMATCH');
  }
}

function boundedTimestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new FarcasterPublicProfileError('FARCASTER_PROFILE_TIMESTAMP_INVALID');
  }
  return value as number;
}

function sanitizeText(value: unknown, maximumCharacters: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? [...cleaned].slice(0, maximumCharacters).join('') : undefined;
}

function sanitizeUsername(value: unknown): string | undefined {
  const username = sanitizeText(value, 64)?.toLowerCase();
  return username && USERNAME_PATTERN.test(username) ? username : undefined;
}

function sanitizePfpUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? safePublicHttpsImageUrl(value) : undefined;
}

function messagesFromResponse(value: unknown): readonly unknown[] {
  if (value === undefined) return [];
  const envelope = record(value);
  if (!envelope) throw new FarcasterPublicProfileError('FARCASTER_PROFILE_RESPONSE_INVALID');
  if (record(envelope.data)) return [envelope];
  if (Array.isArray(envelope.messages)) return envelope.messages;
  throw new FarcasterPublicProfileError('FARCASTER_PROFILE_RESPONSE_INVALID');
}

function parseUserData(
  value: unknown,
  expectedFid: bigint,
  expectedType: FarcasterPublicUserDataType,
): readonly UserDataValue[] {
  const parsed: UserDataValue[] = [];
  for (const entry of messagesFromResponse(value)) {
    const message = record(entry);
    const data = record(message?.data);
    const body = record(data?.userDataBody);
    if (!data || !body) throw new FarcasterPublicProfileError('FARCASTER_PROFILE_RESPONSE_INVALID');
    positiveSafeFid(data.fid, expectedFid);
    if (
      data.network !== MAINNET_NETWORK
      || data.type !== USER_DATA_MESSAGE
      || body.type !== expectedType
      || typeof body.value !== 'string'
    ) {
      throw new FarcasterPublicProfileError('FARCASTER_PROFILE_CONTRACT_MISMATCH');
    }
    parsed.push(Object.freeze({
      type: expectedType,
      value: body.value,
      timestamp: boundedTimestamp(data.timestamp),
    }));
  }
  return Object.freeze(parsed);
}

export function buildTrustedPublicFarcasterProfile(input: Readonly<{
  fid: bigint;
  responses: Readonly<Partial<Record<FarcasterPublicUserDataType, unknown>>>;
}>): TrustedPublicFarcasterProfile {
  if (input.fid <= 0n || input.fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FarcasterPublicProfileError('FARCASTER_PROFILE_FID_INVALID');
  }
  const values = new Map<FarcasterPublicUserDataType, UserDataValue>();
  for (const type of FARCASTER_PUBLIC_USER_DATA_TYPES) {
    for (const candidate of parseUserData(input.responses[type], input.fid, type)) {
      const current = values.get(type);
      if (!current || candidate.timestamp > current.timestamp) values.set(type, candidate);
    }
  }
  const canonicalUsername = sanitizeUsername(values.get('USER_DATA_TYPE_USERNAME')?.value);
  const displayName = sanitizeText(values.get('USER_DATA_TYPE_DISPLAY')?.value, 80);
  const publicBio = sanitizeText(values.get('USER_DATA_TYPE_BIO')?.value, 320);
  const pfpUrl = sanitizePfpUrl(values.get('USER_DATA_TYPE_PFP')?.value);
  return Object.freeze({
    fid: input.fid,
    canonicalUsername,
    displayName,
    pfpUrl,
    publicBio,
    farcasterProfileUrl: canonicalUsername
      ? `https://farcaster.xyz/${encodeURIComponent(canonicalUsername)}`
      : undefined,
  });
}

export function mergeWithLastKnownGood(
  resolved: TrustedPublicFarcasterProfile,
  existing: ExistingPublicProfile,
): TrustedPublicFarcasterProfile {
  const canonicalUsername = resolved.canonicalUsername
    ?? sanitizeUsername(existing.canonicalUsername);
  return Object.freeze({
    fid: resolved.fid,
    canonicalUsername,
    displayName: resolved.displayName ?? sanitizeText(existing.displayName, 80),
    pfpUrl: resolved.pfpUrl ?? sanitizePfpUrl(existing.pfpUrl),
    publicBio: resolved.publicBio ?? sanitizeText(existing.publicBio, 320),
    farcasterProfileUrl: canonicalUsername
      ? `https://farcaster.xyz/${encodeURIComponent(canonicalUsername)}`
      : undefined,
  });
}

export function profilesEqual(
  left: ExistingPublicProfile,
  right: ExistingPublicProfile,
): boolean {
  return left.canonicalUsername === right.canonicalUsername
    && left.displayName === right.displayName
    && left.pfpUrl === right.pfpUrl
    && left.publicBio === right.publicBio;
}

export function privacySafePublicProfileSummary(profile: TrustedPublicFarcasterProfile) {
  return Object.freeze({
    resolved: profile.canonicalUsername !== undefined
      || profile.displayName !== undefined
      || profile.pfpUrl !== undefined
      || profile.publicBio !== undefined,
    hasUsername: profile.canonicalUsername !== undefined,
    hasDisplayName: profile.displayName !== undefined,
    hasPfp: profile.pfpUrl !== undefined,
    hasBio: profile.publicBio !== undefined,
  });
}
