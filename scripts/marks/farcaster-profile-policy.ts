const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAINNET_NETWORK = 'FARCASTER_NETWORK_MAINNET';

export class FarcasterProfilePolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FarcasterProfilePolicyError';
  }
}

export type PublicRealmProfileSnapshot = Readonly<{
  fid: bigint;
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
  farcasterProfileUrl?: string;
}>;

export type PrivateWalletSnapshot = Readonly<{
  fid: bigint;
  address: string;
  addressType: 'custody' | 'verified_evm';
  source: 'snapchain_id_registry' | 'snapchain_verification';
  active: true;
}>;

export type TrustedFarcasterSnapshot = Readonly<{
  publicProfile: PublicRealmProfileSnapshot;
  privateWallets: readonly PrivateWalletSnapshot[];
}>;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function positiveSafeFid(value: unknown, expectedFid: bigint): bigint {
  const parsed = typeof value === 'bigint'
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? BigInt(value)
      : typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)
        ? BigInt(value)
        : 0n;
  if (parsed <= 0n || parsed !== expectedFid || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FarcasterProfilePolicyError('FARCASTER_PROFILE_FID_MISMATCH');
  }
  return parsed;
}

function boundedInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new FarcasterProfilePolicyError(label);
  }
  return value as number;
}

function sanitizedText(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const withoutControls = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutControls) return undefined;
  return [...withoutControls].slice(0, maximumLength).join('');
}

function sanitizedUsername(value: unknown): string | undefined {
  const username = sanitizedText(value, 64)?.toLowerCase();
  return username && USERNAME_PATTERN.test(username) ? username : undefined;
}

function sanitizedPfpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || !url.hostname
    || url.hostname.endsWith('.invalid')
  ) {
    return undefined;
  }
  url.hash = '';
  return url.href;
}

function normalizedAddress(value: unknown): string | undefined {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value) ? value.toLowerCase() : undefined;
}

function arrayFrom(value: unknown, key: string): readonly unknown[] {
  if (Array.isArray(value)) return value;
  const wrapped = record(value);
  return wrapped && Array.isArray(wrapped[key]) ? wrapped[key] : [];
}

type UserDataValue = Readonly<{ type: string; value: string; timestamp: number }>;

function parseUserDataMessages(value: unknown, expectedFid: bigint): readonly UserDataValue[] {
  const messages = arrayFrom(value, 'messages');
  const parsed: UserDataValue[] = [];
  for (const entry of messages) {
    const message = record(entry);
    const data = record(message?.data);
    if (!data) continue;
    positiveSafeFid(data.fid, expectedFid);
    if (data.network !== MAINNET_NETWORK || data.type !== 'MESSAGE_TYPE_USER_DATA_ADD') {
      throw new FarcasterProfilePolicyError('FARCASTER_USER_DATA_CONTRACT_MISMATCH');
    }
    const body = record(data.userDataBody);
    if (!body || typeof body.type !== 'string' || typeof body.value !== 'string') {
      throw new FarcasterProfilePolicyError('FARCASTER_USER_DATA_INVALID');
    }
    parsed.push(Object.freeze({
      type: body.type,
      value: body.value,
      timestamp: boundedInteger(data.timestamp, 'FARCASTER_USER_DATA_TIMESTAMP_INVALID'),
    }));
  }
  return Object.freeze(parsed);
}

function latestUserDataByType(messages: readonly UserDataValue[]): ReadonlyMap<string, string> {
  const latest = new Map<string, UserDataValue>();
  for (const message of messages) {
    const current = latest.get(message.type);
    if (!current || message.timestamp > current.timestamp) latest.set(message.type, message);
  }
  return new Map([...latest].map(([type, message]) => [type, message.value]));
}

function parseCustodyAddress(value: unknown, expectedFid: bigint): string | undefined {
  const events = arrayFrom(value, 'events');
  let latest: Readonly<{ address: string; blockNumber: number; logIndex: number }> | undefined;
  for (const entry of events) {
    const event = record(entry);
    if (!event) continue;
    positiveSafeFid(event.fid, expectedFid);
    if (event.type !== 'EVENT_TYPE_ID_REGISTER') {
      throw new FarcasterProfilePolicyError('FARCASTER_CUSTODY_EVENT_TYPE_MISMATCH');
    }
    const body = record(event.idRegisterEventBody);
    const address = normalizedAddress(body?.to);
    if (!address) continue;
    const blockNumber = boundedInteger(event.blockNumber, 'FARCASTER_CUSTODY_BLOCK_INVALID');
    const logIndex = boundedInteger(event.logIndex, 'FARCASTER_CUSTODY_LOG_INVALID');
    if (!latest || blockNumber > latest.blockNumber || (blockNumber === latest.blockNumber && logIndex > latest.logIndex)) {
      latest = Object.freeze({ address, blockNumber, logIndex });
    }
  }
  return latest?.address;
}

function parseVerifiedAddresses(value: unknown, expectedFid: bigint): readonly string[] {
  const messages = arrayFrom(value, 'messages');
  const addresses = new Set<string>();
  for (const entry of messages) {
    const message = record(entry);
    const data = record(message?.data);
    if (!data) continue;
    positiveSafeFid(data.fid, expectedFid);
    if (data.network !== MAINNET_NETWORK || data.type !== 'MESSAGE_TYPE_VERIFICATION_ADD_ETH_ADDRESS') {
      throw new FarcasterProfilePolicyError('FARCASTER_VERIFICATION_CONTRACT_MISMATCH');
    }
    const body = record(data.verificationAddEthAddressBody);
    const address = normalizedAddress(body?.address);
    if (!address) throw new FarcasterProfilePolicyError('FARCASTER_VERIFICATION_ADDRESS_INVALID');
    addresses.add(address);
  }
  return Object.freeze([...addresses].sort());
}

export function buildTrustedFarcasterSnapshot(input: Readonly<{
  fid: bigint;
  userDataResponse: unknown;
  custodyEventsResponse: unknown;
  verificationsResponse: unknown;
}>): TrustedFarcasterSnapshot {
  if (input.fid <= 0n || input.fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FarcasterProfilePolicyError('FARCASTER_PROFILE_FID_INVALID');
  }
  const values = latestUserDataByType(parseUserDataMessages(input.userDataResponse, input.fid));
  const canonicalUsername = sanitizedUsername(values.get('USER_DATA_TYPE_USERNAME'));
  const displayName = sanitizedText(values.get('USER_DATA_TYPE_DISPLAY'), 80);
  const publicBio = sanitizedText(values.get('USER_DATA_TYPE_BIO'), 320);
  const pfpUrl = sanitizedPfpUrl(values.get('USER_DATA_TYPE_PFP'));
  const custodyAddress = parseCustodyAddress(input.custodyEventsResponse, input.fid);
  const verifiedAddresses = parseVerifiedAddresses(input.verificationsResponse, input.fid);

  const wallets = new Map<string, PrivateWalletSnapshot>();
  if (custodyAddress) {
    wallets.set(custodyAddress, Object.freeze({
      fid: input.fid,
      address: custodyAddress,
      addressType: 'custody',
      source: 'snapchain_id_registry',
      active: true,
    }));
  }
  for (const address of verifiedAddresses) {
    if (wallets.has(address)) continue;
    wallets.set(address, Object.freeze({
      fid: input.fid,
      address,
      addressType: 'verified_evm',
      source: 'snapchain_verification',
      active: true,
    }));
  }

  return Object.freeze({
    publicProfile: Object.freeze({
      fid: input.fid,
      canonicalUsername,
      displayName,
      pfpUrl,
      publicBio,
      farcasterProfileUrl: canonicalUsername
        ? `https://farcaster.xyz/${encodeURIComponent(canonicalUsername)}`
        : undefined,
    }),
    privateWallets: Object.freeze([...wallets.values()]),
  });
}

export function privacySafeProfileSummary(snapshot: TrustedFarcasterSnapshot) {
  return Object.freeze({
    resolved: true,
    hasUsername: snapshot.publicProfile.canonicalUsername !== undefined,
    hasDisplayName: snapshot.publicProfile.displayName !== undefined,
    hasPfp: snapshot.publicProfile.pfpUrl !== undefined,
    hasBio: snapshot.publicProfile.publicBio !== undefined,
    privateWalletCount: snapshot.privateWallets.length,
  });
}
