export const PTR_ADMIN_TOKEN_ENDPOINT =
  'https://auth.warpkeep.com/v1/admin/ptr-token' as const;

const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_SECRET_BYTES = 512;
const MAXIMUM_RESPONSE_BYTES = 32 * 1_024;
const MAXIMUM_TOKEN_BYTES = 16 * 1_024;
const REQUEST_TIMEOUT_MILLISECONDS = 8_000;

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

export async function requestPtrProductionAdminToken(
  secret: string,
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
    const response = await fetchImpl(PTR_ADMIN_TOKEN_ENDPOINT, {
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
