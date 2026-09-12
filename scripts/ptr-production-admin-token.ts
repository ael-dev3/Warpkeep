export const PTR_ADMIN_TOKEN_ENDPOINT =
  'https://auth.warpkeep.com/v1/admin/ptr-token' as const;
export const PTR_ATLAS_ADMIN_TOKEN_ENDPOINT =
  'https://auth.warpkeep.com/v1/admin/ptr-atlas-token' as const;

const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_SECRET_BYTES = 512;
const MAXIMUM_RESPONSE_BYTES = 32 * 1_024;
const MAXIMUM_TOKEN_BYTES = 16 * 1_024;
const REQUEST_TIMEOUT_MILLISECONDS = 8_000;
const PTR_ADMIN_ISSUER = 'https://auth.warpkeep.com';
const PTR_ADMIN_AUDIENCE = 'warpkeep-ptr-spacetimedb';
const MAXIMUM_SUPPORTED_FID = BigInt(Number.MAX_SAFE_INTEGER);
const MAXIMUM_AUTH_EPOCH = 0xffff_ffff;
const PTR_ADMIN_CLAIM_KEYS = Object.freeze([
  'iss',
  'sub',
  'aud',
  'token_type',
  'roles',
  'ptr_owner_fid',
  'ptr_owner_auth_epoch',
  'iat',
  'nbf',
  'exp',
  'jti',
] as const);
const PTR_ATLAS_ADMIN_CLAIM_KEYS = Object.freeze([
  'iss', 'sub', 'aud', 'token_type', 'roles', 'iat', 'nbf', 'exp', 'jti',
] as const);

export class PtrProductionAdminTokenError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PtrProductionAdminTokenError';
  }
}

function fail(code: string): never {
  throw new PtrProductionAdminTokenError(code);
}

function validSecret(secret: unknown): secret is string {
  const bytes = typeof secret === 'string'
    ? Buffer.byteLength(secret, 'utf8')
    : 0;
  return typeof secret === 'string'
    && bytes >= MINIMUM_SECRET_BYTES
    && bytes <= MAXIMUM_SECRET_BYTES
    && !/[\u0000-\u0020\u007f]/u.test(secret);
}

export type PtrOwnerProvisionAuthority = Readonly<{
  ownerFid: bigint;
  ownerAuthEpoch: number;
}>;

export type PtrAtlasImportAuthority = Readonly<{
  issuer: typeof PTR_ADMIN_ISSUER;
  subject: 'service:hermes';
  audience: readonly [typeof PTR_ADMIN_AUDIENCE];
  tokenType: 'spacetime-access';
  roles: readonly ['warpkeep-admin'];
}>;

function decodeTokenPayload(token: string, code: string): Readonly<{
  record: Readonly<Record<string, unknown>>;
  payloadText: string;
}> {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) {
    fail(code);
  }
  const payloadSegment = token.split('.')[1]!;
  const payloadBytes = Buffer.from(payloadSegment, 'base64url');
  try {
    if (
      payloadBytes.byteLength < 2
      || payloadBytes.byteLength > MAXIMUM_TOKEN_BYTES
      || payloadBytes.toString('base64url') !== payloadSegment
    ) fail(code);
    const payloadText = new TextDecoder('utf-8', { fatal: true })
      .decode(payloadBytes);
    const payload = JSON.parse(payloadText) as unknown;
    if (
      payload === null
      || typeof payload !== 'object'
      || Array.isArray(payload)
      || Object.getPrototypeOf(payload) !== Object.prototype
    ) fail(code);
    return Object.freeze({
      record: payload as Readonly<Record<string, unknown>>,
      payloadText,
    });
  } catch (error) {
    if (error instanceof PtrProductionAdminTokenError && error.code === code) {
      throw error;
    }
    return fail(code);
  } finally {
    payloadBytes.fill(0);
  }
}

/** Validate the exact fresh ownerless token before opening an atlas session. */
export function readPtrAtlasImportAuthority(
  token: string,
  currentTimeSeconds: number,
): PtrAtlasImportAuthority {
  const code = 'PTR_PRODUCTION_ATLAS_ADMIN_TOKEN_CLAIMS_INVALID';
  try {
    if (
      typeof token !== 'string'
      || !Number.isSafeInteger(currentTimeSeconds)
      || currentTimeSeconds < 0
    ) fail(code);
    const { record, payloadText } = decodeTokenPayload(token, code);
    const keys = Reflect.ownKeys(record);
    if (
      JSON.stringify(record) !== payloadText
      || keys.length !== PTR_ATLAS_ADMIN_CLAIM_KEYS.length
      || keys.some(key => typeof key !== 'string'
        || !(PTR_ATLAS_ADMIN_CLAIM_KEYS as readonly string[]).includes(key))
      || record.iss !== PTR_ADMIN_ISSUER
      || record.sub !== 'service:hermes'
      || !Array.isArray(record.aud)
      || record.aud.length !== 1
      || record.aud[0] !== PTR_ADMIN_AUDIENCE
      || record.token_type !== 'spacetime-access'
      || !Array.isArray(record.roles)
      || record.roles.length !== 1
      || record.roles[0] !== 'warpkeep-admin'
      || !Number.isSafeInteger(record.iat)
      || !Number.isSafeInteger(record.nbf)
      || !Number.isSafeInteger(record.exp)
      || (record.iat as number) > currentTimeSeconds
      || (record.nbf as number) > currentTimeSeconds
      || (record.exp as number) <= currentTimeSeconds
      || record.nbf !== record.iat
      || (record.exp as number) - (record.iat as number) !== 300
      || typeof record.jti !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/u.test(record.jti)
    ) fail(code);
    return Object.freeze({
      issuer: PTR_ADMIN_ISSUER,
      subject: 'service:hermes',
      audience: Object.freeze([PTR_ADMIN_AUDIENCE] as const),
      tokenType: 'spacetime-access',
      roles: Object.freeze(['warpkeep-admin'] as const),
    });
  } catch (error) {
    if (error instanceof PtrProductionAdminTokenError && error.code === code) {
      throw error;
    }
    return fail(code);
  }
}

/**
 * Decode only the private reducer arguments from a fresh token. Signature
 * enforcement remains SpacetimeDB's responsibility on this same token.
 */
export function readPtrOwnerProvisionAuthority(
  token: string,
  expectedOwnerFid: bigint,
  currentTimeSeconds: number,
): PtrOwnerProvisionAuthority {
  try {
    if (
      typeof token !== 'string'
      || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)
      || typeof expectedOwnerFid !== 'bigint'
      || expectedOwnerFid < 1n
      || expectedOwnerFid > MAXIMUM_SUPPORTED_FID
      || !Number.isSafeInteger(currentTimeSeconds)
      || currentTimeSeconds < 0
    ) fail('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    const payloadSegment = token.split('.')[1]!;
    const payloadBytes = Buffer.from(payloadSegment, 'base64url');
    if (
      payloadBytes.byteLength < 2
      || payloadBytes.byteLength > MAXIMUM_TOKEN_BYTES
      || payloadBytes.toString('base64url') !== payloadSegment
    ) fail('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    let payload: unknown;
    let payloadText = '';
    try {
      payloadText = new TextDecoder('utf-8', { fatal: true })
        .decode(payloadBytes);
      payload = JSON.parse(payloadText);
    } finally {
      payloadBytes.fill(0);
    }
    if (
      payload === null
      || typeof payload !== 'object'
      || Array.isArray(payload)
      || Object.getPrototypeOf(payload) !== Object.prototype
    ) fail('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    const record = payload as Readonly<Record<string, unknown>>;
    const keys = Reflect.ownKeys(record);
    if (
      JSON.stringify(record) !== payloadText
      || keys.length !== PTR_ADMIN_CLAIM_KEYS.length
      || keys.some(key => (
        typeof key !== 'string'
        || !(PTR_ADMIN_CLAIM_KEYS as readonly string[]).includes(key)
      ))
    ) fail('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    const ownerFidText = record.ptr_owner_fid;
    const ownerFid = typeof ownerFidText === 'string'
      && /^[1-9][0-9]{0,15}$/u.test(ownerFidText)
      ? BigInt(ownerFidText)
      : 0n;
    const ownerAuthEpoch = record.ptr_owner_auth_epoch;
    const issuedAt = record.iat;
    const notBefore = record.nbf;
    const expiresAt = record.exp;
    if (
      record.iss !== PTR_ADMIN_ISSUER
      || record.sub !== 'service:hermes'
      || !Array.isArray(record.aud)
      || record.aud.length !== 1
      || record.aud[0] !== PTR_ADMIN_AUDIENCE
      || record.token_type !== 'spacetime-access'
      || !Array.isArray(record.roles)
      || record.roles.length !== 1
      || record.roles[0] !== 'warpkeep-admin'
      || ownerFid !== expectedOwnerFid
      || ownerFid > MAXIMUM_SUPPORTED_FID
      || !Number.isSafeInteger(ownerAuthEpoch)
      || (ownerAuthEpoch as number) < 1
      || (ownerAuthEpoch as number) > MAXIMUM_AUTH_EPOCH
      || !Number.isSafeInteger(issuedAt)
      || !Number.isSafeInteger(notBefore)
      || !Number.isSafeInteger(expiresAt)
      || (issuedAt as number) > currentTimeSeconds
      || (notBefore as number) > currentTimeSeconds
      || (expiresAt as number) <= currentTimeSeconds
      || (notBefore as number) !== (issuedAt as number)
      || (expiresAt as number) - (issuedAt as number) !== 300
      || typeof record.jti !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/u.test(record.jti)
    ) fail('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
    return Object.freeze({
      ownerFid,
      ownerAuthEpoch: ownerAuthEpoch as number,
    });
  } catch (error) {
    if (
      error instanceof PtrProductionAdminTokenError
      && error.code === 'PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID'
    ) throw error;
    return fail('PTR_PRODUCTION_ADMIN_TOKEN_CLAIMS_INVALID');
  }
}

export function takePtrProductionAdminSecret(
  environment: NodeJS.ProcessEnv,
): string {
  const secret = environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  if (!validSecret(secret)) fail('PTR_PRODUCTION_ADMIN_SECRET_INVALID');
  return secret;
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (response.body === null) fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes: Uint8Array | undefined;
  let total = 0;
  try {
    const length = response.headers.get('content-length');
    if (
      length !== null
      && (!/^(?:0|[1-9][0-9]{0,9})$/u.test(length)
        || Number(length) > MAXIMUM_RESPONSE_BYTES)
    ) fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
      }
      chunks.push(value);
      total += value.byteLength;
      if (total > MAXIMUM_RESPONSE_BYTES) {
        fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
      }
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  } finally {
    bytes?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
    try { await reader.cancel(); } catch { /* Cleanup must not reveal cause. */ }
  }
}

function exactTokenResponse(value: unknown): string {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).join(',') !== 'token,tokenType,expiresIn'
  ) fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  const record = value as Readonly<Record<string, unknown>>;
  if (
    typeof record.token !== 'string'
    || Buffer.byteLength(record.token, 'utf8') > MAXIMUM_TOKEN_BYTES
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(record.token)
    || record.tokenType !== 'spacetime-access'
    || record.expiresIn !== 300
  ) fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
  return record.token;
}

async function requestPtrAdminTokenAtEndpoint(
  secret: string,
  endpoint: typeof PTR_ADMIN_TOKEN_ENDPOINT | typeof PTR_ATLAS_ADMIN_TOKEN_ENDPOINT,
  options: Readonly<{
    fetchImpl?: typeof fetch;
    timeoutMilliseconds?: number;
  }> = {},
): Promise<string> {
  if (!validSecret(secret)) fail('PTR_PRODUCTION_ADMIN_SECRET_INVALID');
  const timeoutMilliseconds = options.timeoutMilliseconds
    ?? REQUEST_TIMEOUT_MILLISECONDS;
  if (
    !Number.isSafeInteger(timeoutMilliseconds)
    || timeoutMilliseconds < 1
    || timeoutMilliseconds > REQUEST_TIMEOUT_MILLISECONDS
  ) fail('PTR_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');
  const fetchImpl = options.fetchImpl ?? fetch;
  if (typeof fetchImpl !== 'function') {
    fail('PTR_PRODUCTION_ADMIN_TOKEN_REQUEST_INVALID');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
  const headers = new Headers({
    accept: 'application/json',
    authorization: `Bearer ${secret}`,
  });
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (
      response.status !== 200
      || response.redirected
      || response.headers.get('cache-control') !== 'no-store'
      || !/^application\/json(?:;|$)/iu.test(
        response.headers.get('content-type') ?? '',
      )
    ) fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
    const text = await readBoundedResponse(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail('PTR_PRODUCTION_ADMIN_TOKEN_RESPONSE_INVALID');
    }
    return exactTokenResponse(parsed);
  } catch (error) {
    if (error instanceof PtrProductionAdminTokenError) throw error;
    return fail('PTR_PRODUCTION_ADMIN_TOKEN_UNAVAILABLE');
  } finally {
    headers.delete('authorization');
    secret = '';
    clearTimeout(timer);
  }
}

export function requestPtrProductionAdminToken(
  secret: string,
  options: Readonly<{
    fetchImpl?: typeof fetch;
    timeoutMilliseconds?: number;
  }> = {},
): Promise<string> {
  return requestPtrAdminTokenAtEndpoint(secret, PTR_ADMIN_TOKEN_ENDPOINT, options);
}

export function requestPtrAtlasProductionAdminToken(
  secret: string,
  options: Readonly<{
    fetchImpl?: typeof fetch;
    timeoutMilliseconds?: number;
  }> = {},
): Promise<string> {
  return requestPtrAdminTokenAtEndpoint(
    secret,
    PTR_ATLAS_ADMIN_TOKEN_ENDPOINT,
    options,
  );
}
