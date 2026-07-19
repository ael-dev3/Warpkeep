import {
  FARCASTER_PUBLIC_USER_DATA_TYPES,
  type FarcasterPublicUserDataType,
} from './farcaster-profile-policy';

const DEFAULT_TIMEOUT_MS = 8_000;
const MAXIMUM_RESPONSE_BYTES = 64 * 1_024;
const MAXIMUM_ATTEMPTS = 2;
const MAXIMUM_CURRENT_USER_DATA_MESSAGES = 100;
const CONTROLLED_FIXTURE_BASE_URL = 'https://profile-fixture.invalid/';

export const TRUSTED_PROFILE_MAINTENANCE_PURPOSE = 'founded-profile-maintenance';
export const TRUSTED_FOUNDER_ADMISSION_PURPOSE = 'individually-approved-founder-admission';
export type TrustedProfilePurpose =
  | typeof TRUSTED_PROFILE_MAINTENANCE_PURPOSE
  | typeof TRUSTED_FOUNDER_ADMISSION_PURPOSE;

export const TRUSTED_PRODUCTION_PROFILE_MAINTENANCE_SOURCE_ID =
  'owner-reviewed-snapchain-mainnet-maintenance-v2';
export const TRUSTED_PRODUCTION_FOUNDER_ADMISSION_SOURCE_ID =
  'owner-reviewed-snapchain-mainnet-admission-v1';
export const TRUSTED_PRODUCTION_PROFILE_SOURCE_STATUS: string = 'owner-reviewed';
export const TRUSTED_PRODUCTION_SNAPCHAIN_BASE_URL: string | undefined = 'https://rho.farcaster.xyz:3381/';

/**
 * The shared transport evidence and each approved use are versioned
 * separately. Maintenance covers already-founded public projections; founder
 * admission is permitted only as part of the independently reviewed,
 * FID-specific admission plan. A source ID for one purpose is invalid for the
 * other, so a future call site cannot silently broaden the reviewed scope.
 */
export const TRUSTED_PRODUCTION_PROFILE_SOURCE_EVIDENCE = Object.freeze({
  evidenceVersion: 'snapchain-profile-source-evidence-v2',
  repository: 'farcasterxyz/snapchain',
  commit: 'bee1d09c0a816d11e9f6fc63d539c321b084f352',
  hostnameProvenancePath: 'src/bootstrap/replication/rpc_client.rs',
  httpContractPath: 'site/docs/pages/reference/httpapi/httpapi.md',
  userDataContractPath: 'site/docs/pages/reference/httpapi/userdata.md',
  exactTlsSurfaceOwnerReviewedAt: '2026-07-14',
  approvedUses: Object.freeze({
    maintenance: Object.freeze({
      purpose: TRUSTED_PROFILE_MAINTENANCE_PURPOSE,
      sourceId: TRUSTED_PRODUCTION_PROFILE_MAINTENANCE_SOURCE_ID,
      ownerApprovalScope: 'current-founded-public-profile-maintenance',
      individualFounderApprovalRequired: false,
    }),
    founderAdmission: Object.freeze({
      purpose: TRUSTED_FOUNDER_ADMISSION_PURPOSE,
      sourceId: TRUSTED_PRODUCTION_FOUNDER_ADMISSION_SOURCE_ID,
      ownerApprovalScope: 'individually-approved-new-founder-profile-resolution',
      individualFounderApprovalRequired: true,
    }),
  }),
});
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

function approvedUse(purpose: TrustedProfilePurpose) {
  if (purpose === TRUSTED_PROFILE_MAINTENANCE_PURPOSE) {
    return TRUSTED_PRODUCTION_PROFILE_SOURCE_EVIDENCE.approvedUses.maintenance;
  }
  if (purpose === TRUSTED_FOUNDER_ADMISSION_PURPOSE) {
    return TRUSTED_PRODUCTION_PROFILE_SOURCE_EVIDENCE.approvedUses.founderAdmission;
  }
  throw new ProfileTransportError('PROFILE_SOURCE_PURPOSE_INVALID');
}

function cleanHeader(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value || value.length > 8_192 || /[\r\n]/.test(value)) {
    throw new ProfileTransportError('PROFILE_SOURCE_CREDENTIAL_INVALID');
  }
  return value;
}

export function validateProfileSource(
  source: TrustedProfileSource,
  purpose: TrustedProfilePurpose,
  controlledFixture = false,
): URL {
  const use = approvedUse(purpose);
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
  if (source.sourceId !== use.sourceId) {
    throw new ProfileTransportError('PROFILE_SOURCE_NOT_PINNED');
  }
  if (source.authorization !== undefined || source.apiKey !== undefined) {
    throw new ProfileTransportError('PROFILE_SOURCE_CREDENTIAL_UNSUPPORTED');
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

export function trustedProfileTransportAttestation(purpose: TrustedProfilePurpose) {
  const use = approvedUse(purpose);
  return Object.freeze({
    purpose: use.purpose,
    sourceId: use.sourceId,
    ownerApprovalScope: use.ownerApprovalScope,
    individualFounderApprovalRequired: use.individualFounderApprovalRequired,
    sourceStatus: TRUSTED_PRODUCTION_PROFILE_SOURCE_STATUS,
    baseUrl: TRUSTED_PRODUCTION_SNAPCHAIN_BASE_URL ?? null,
    endpointPath: TRUSTED_PROFILE_ENDPOINT_PATH,
    sourceEvidence: TRUSTED_PRODUCTION_PROFILE_SOURCE_EVIDENCE,
    userDataTypes: FARCASTER_PUBLIC_USER_DATA_TYPES,
    requestMode: 'one-current-user-data-envelope-per-fid',
    maximumCurrentUserDataMessages: MAXIMUM_CURRENT_USER_DATA_MESSAGES,
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
  purpose: TrustedProfilePurpose,
  fid: bigint,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  controlledFixture: boolean,
): Promise<unknown | undefined> {
  const base = validateProfileSource(source, purpose, controlledFixture);
  const url = new URL(TRUSTED_PROFILE_ENDPOINT_PATH, base);
  url.searchParams.set('fid', fid.toString());
  url.searchParams.set('pageSize', String(MAXIMUM_CURRENT_USER_DATA_MESSAGES));
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
  purpose: TrustedProfilePurpose;
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
  const response = await fetchOne(
    input.source,
    input.purpose,
    input.fid,
    fetchImpl,
    timeoutMs,
    controlledFixture,
  );
  if (response === undefined) return Object.freeze({});
  const envelope = response !== null && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, unknown>
    : undefined;
  const hasPageToken = envelope !== undefined
    && Object.prototype.hasOwnProperty.call(envelope, 'nextPageToken');
  if (
    !envelope
    || !Array.isArray(envelope.messages)
    || envelope.messages.length > MAXIMUM_CURRENT_USER_DATA_MESSAGES
    || (hasPageToken && envelope.nextPageToken !== '')
  ) throw new ProfileTransportError('PROFILE_SOURCE_RESPONSE_INVALID');
  return Object.freeze(Object.fromEntries(
    FARCASTER_PUBLIC_USER_DATA_TYPES.map((type): readonly [FarcasterPublicUserDataType, unknown] => [
      type,
      response,
    ]),
  ));
}
