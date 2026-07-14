import {
  FARCASTER_PUBLIC_USER_DATA_TYPES,
  type FarcasterPublicUserDataType,
} from './farcaster-profile-policy';

const DEFAULT_TIMEOUT_MS = 8_000;
const MAXIMUM_RESPONSE_BYTES = 64 * 1_024;
const MAXIMUM_ATTEMPTS = 2;
const CONTROLLED_FIXTURE_BASE_URL = 'https://profile-fixture.invalid/';

/**
 * Production remains intentionally unavailable until the owner supplies and
 * reviews an owned or contracted Snapchain origin. No guessed public origin is
 * operational. Adding the origin requires a reviewed code change and produces
 * a different configuration digest in every later plan.
 */
export const TRUSTED_PRODUCTION_PROFILE_SOURCE_ID = 'owner-reviewed-snapchain-mainnet-v1';
export const TRUSTED_PRODUCTION_PROFILE_SOURCE_STATUS: string = 'blocked-pending-owner-source';
export const TRUSTED_PRODUCTION_SNAPCHAIN_BASE_URL: string | undefined = undefined;
export const CONTROLLED_PROFILE_FIXTURE_SOURCE_ID = 'controlled-local-profile-fixture-v1';
export const TRUSTED_PROFILE_ENDPOINT_PATH = 'v1/userDataByFid';

export class ProfileTransportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProfileTransportError';
  }
}

export type TrustedProfileSource = Readonly<{
  sourceId: string;
  authorization?: string;
  apiKey?: string;
}>;

function cleanHeader(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value || value.length > 8_192 || /[\r\n]/.test(value)) {
    throw new ProfileTransportError('PROFILE_SOURCE_CREDENTIAL_INVALID');
  }
  return value;
}

export function validateProfileSource(
  source: TrustedProfileSource,
  controlledFixture = false,
): URL {
  if (source.authorization !== undefined && source.apiKey !== undefined) {
    throw new ProfileTransportError('PROFILE_SOURCE_CREDENTIAL_AMBIGUOUS');
  }
  cleanHeader(source.authorization);
  cleanHeader(source.apiKey);
  if (controlledFixture) {
    if (
      source.sourceId !== CONTROLLED_PROFILE_FIXTURE_SOURCE_ID
      || source.authorization !== undefined
      || source.apiKey !== undefined
    ) throw new ProfileTransportError('PROFILE_FIXTURE_SOURCE_INVALID');
    return new URL(CONTROLLED_FIXTURE_BASE_URL);
  }
  if (source.sourceId !== TRUSTED_PRODUCTION_PROFILE_SOURCE_ID) {
    throw new ProfileTransportError('PROFILE_SOURCE_NOT_PINNED');
  }
  if (
    TRUSTED_PRODUCTION_PROFILE_SOURCE_STATUS !== 'owner-reviewed'
    || TRUSTED_PRODUCTION_SNAPCHAIN_BASE_URL === undefined
  ) {
    throw new ProfileTransportError('PROFILE_SOURCE_ATTESTATION_PENDING');
  }
  let configured: URL;
  try {
    configured = new URL(TRUSTED_PRODUCTION_SNAPCHAIN_BASE_URL);
  } catch {
    throw new ProfileTransportError('PROFILE_SOURCE_CONFIGURATION_INVALID');
  }
  if (
    configured.protocol !== 'https:'
    || configured.username
    || configured.password
    || configured.search
    || configured.hash
    || !configured.hostname
  ) throw new ProfileTransportError('PROFILE_SOURCE_CONFIGURATION_INVALID');
  configured.pathname = `${configured.pathname.replace(/\/+$/, '')}/`;
  return configured;
}

export function trustedProfileTransportAttestation() {
  return Object.freeze({
    sourceId: TRUSTED_PRODUCTION_PROFILE_SOURCE_ID,
    sourceStatus: TRUSTED_PRODUCTION_PROFILE_SOURCE_STATUS,
    baseUrl: TRUSTED_PRODUCTION_SNAPCHAIN_BASE_URL ?? null,
    endpointPath: TRUSTED_PROFILE_ENDPOINT_PATH,
    userDataTypes: FARCASTER_PUBLIC_USER_DATA_TYPES,
    responseByteLimit: MAXIMUM_RESPONSE_BYTES,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    maximumAttempts: MAXIMUM_ATTEMPTS,
    redirects: 'error',
  });
}

async function boundedJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    await response.body?.cancel();
    throw new ProfileTransportError('PROFILE_SOURCE_RESPONSE_INVALID');
  }
  const announced = response.headers.get('content-length');
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > MAXIMUM_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new ProfileTransportError('PROFILE_SOURCE_RESPONSE_TOO_LARGE');
  }
  if (!response.body) throw new ProfileTransportError('PROFILE_SOURCE_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAXIMUM_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* Preserve the generic boundary. */ }
        throw new ProfileTransportError('PROFILE_SOURCE_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ProfileTransportError) throw error;
    throw new ProfileTransportError('PROFILE_SOURCE_RESPONSE_INVALID');
  } finally {
    try { reader.releaseLock(); } catch { /* Preserve the generic boundary. */ }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ProfileTransportError('PROFILE_SOURCE_RESPONSE_INVALID');
  } finally {
    bytes.fill(0);
  }
}

async function fetchOne(
  source: TrustedProfileSource,
  fid: bigint,
  type: FarcasterPublicUserDataType,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  controlledFixture: boolean,
): Promise<unknown | undefined> {
  const base = validateProfileSource(source, controlledFixture);
  const url = new URL(TRUSTED_PROFILE_ENDPOINT_PATH, base);
  url.searchParams.set('fid', fid.toString());
  url.searchParams.set('user_data_type', type);
  const headers: HeadersInit = {
    accept: 'application/json',
    ...(source.authorization ? { authorization: cleanHeader(source.authorization) as string } : {}),
    ...(source.apiKey ? { 'x-api-key': cleanHeader(source.apiKey) as string } : {}),
  };
  for (let attempt = 0; attempt < MAXIMUM_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return undefined;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
        throw new ProfileTransportError('PROFILE_SOURCE_REQUEST_FAILED');
      }
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof ProfileTransportError) throw error;
      if (attempt === 0) continue;
      throw new ProfileTransportError('PROFILE_SOURCE_REQUEST_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ProfileTransportError('PROFILE_SOURCE_REQUEST_FAILED');
}

export async function fetchPublicProfileResponses(input: Readonly<{
  source: TrustedProfileSource;
  fid: bigint;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  controlledFixture?: boolean;
}>): Promise<Readonly<Partial<Record<FarcasterPublicUserDataType, unknown>>>> {
  if (input.fid <= 0n || input.fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ProfileTransportError('PROFILE_FID_INVALID');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const controlledFixture = input.controlledFixture === true;
  if (controlledFixture && input.fetchImpl === undefined) {
    throw new ProfileTransportError('PROFILE_FIXTURE_FETCH_REQUIRED');
  }
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new ProfileTransportError('PROFILE_TIMEOUT_INVALID');
  }
  const responses = await Promise.all(FARCASTER_PUBLIC_USER_DATA_TYPES.map(async type => [
    type,
    await fetchOne(input.source, input.fid, type, fetchImpl, timeoutMs, controlledFixture),
  ] as const));
  return Object.freeze(Object.fromEntries(
    responses.filter((entry): entry is readonly [FarcasterPublicUserDataType, unknown] => entry[1] !== undefined),
  ));
}
