import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ADMISSION_REQUEST_SUSPENSION_PROFILE =
  'warpkeep-admission-request-suspension-live-v1';
export const ADMISSION_REQUEST_SUSPENSION_BRIDGE =
  'https://auth.warpkeep.com';

const REQUEST_PATH = '/v2/access/request';
const STATUS_PATH = '/v2/access/status';
const BROWSER_ORIGIN = 'https://warpkeep.com';
const EXPECTED_ERROR = Object.freeze({
  code: 'admission_requests_suspended',
  message: 'New admission requests are temporarily suspended.',
});
const SHA256 = /^[0-9a-f]{64}$/u;
const MAXIMUM_BODY_BYTES = 4 * 1_024;
const REQUEST_TIMEOUT_MILLISECONDS = 8_000;

export class AdmissionRequestSuspensionVerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AdmissionRequestSuspensionVerificationError';
    this.code = code;
  }
}

function fail(code) {
  throw new AdmissionRequestSuspensionVerificationError(code);
}

function exactKeys(value, expected) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getOwnPropertySymbols(value).length === 0
    && JSON.stringify(Object.keys(value)) === JSON.stringify(expected);
}

async function boundedBody(response) {
  const advertised = response.headers.get('content-length');
  if (
    advertised !== null
    && (!/^(?:0|[1-9][0-9]*)$/u.test(advertised)
      || Number(advertised) > MAXIMUM_BODY_BYTES)
  ) fail('ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAXIMUM_BODY_BYTES) {
    bytes.fill(0);
    fail('ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID');
  } finally {
    bytes.fill(0);
  }
}

function requestHeaders(preflight) {
  return {
    origin: BROWSER_ORIGIN,
    ...(preflight
      ? {
        'access-control-request-method': 'POST',
        'access-control-request-headers':
          'authorization, content-type, x-warpkeep-expected-fid',
      }
      : { 'content-type': 'application/json' }),
  };
}

async function fetchBounded(fetchImpl, input) {
  let response;
  try {
    response = await fetchImpl(new Request(input.url, {
      method: input.method,
      headers: requestHeaders(input.method === 'OPTIONS'),
      ...(input.method === 'POST' ? { body: '{}' } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    }));
  } catch {
    return fail('ADMISSION_REQUEST_SUSPENSION_REQUEST_FAILED');
  }
  if (response.headers.has('location')) {
    fail('ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID');
  }
  return response;
}

async function requireSuspended(fetchImpl, url, method) {
  const response = await fetchBounded(fetchImpl, { url, method });
  const text = await boundedBody(response);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return fail('ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID');
  }
  if (
    response.status !== 503
    || response.headers.get('content-type') !== 'application/json; charset=utf-8'
    || response.headers.get('access-control-allow-origin') !== BROWSER_ORIGIN
    || !exactKeys(body, ['error'])
    || !exactKeys(body.error, ['code', 'message'])
    || body.error.code !== EXPECTED_ERROR.code
    || body.error.message !== EXPECTED_ERROR.message
  ) fail('ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID');
}

async function requireReadOnlyStatusAvailable(fetchImpl, url) {
  const response = await fetchBounded(fetchImpl, { url, method: 'OPTIONS' });
  const text = await boundedBody(response);
  if (
    response.status !== 204
    || text !== ''
    || response.headers.get('access-control-allow-origin') !== BROWSER_ORIGIN
    || response.headers.get('access-control-allow-methods') !== 'POST, OPTIONS'
  ) fail('ADMISSION_REQUEST_STATUS_SURFACE_UNAVAILABLE');
}

export async function verifyAdmissionRequestSuspensionLive({
  bridgeOrigin,
  fetchImpl = fetch,
}) {
  if (
    bridgeOrigin !== ADMISSION_REQUEST_SUSPENSION_BRIDGE
    || typeof fetchImpl !== 'function'
  ) fail('ADMISSION_REQUEST_SUSPENSION_INPUT_INVALID');
  await requireSuspended(fetchImpl, `${bridgeOrigin}${REQUEST_PATH}`, 'OPTIONS');
  await requireSuspended(fetchImpl, `${bridgeOrigin}${REQUEST_PATH}`, 'POST');
  await requireReadOnlyStatusAvailable(fetchImpl, `${bridgeOrigin}${STATUS_PATH}`);
  const receipt = Object.freeze({
    schemaVersion: 1,
    profile: ADMISSION_REQUEST_SUSPENSION_PROFILE,
    bridgeOrigin,
    requestPath: REQUEST_PATH,
    postStatus: 503,
    optionsStatus: 503,
    errorCode: EXPECTED_ERROR.code,
    errorMessage: EXPECTED_ERROR.message,
    statusPath: STATUS_PATH,
    statusOptionsStatus: 204,
    requestSubmissionsSuspended: true,
    readOnlyStatusAvailable: true,
  });
  const receiptSha256 = createHash('sha256')
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
  return Object.freeze({ receipt, receiptSha256 });
}

function readExpectedDigest(bindingPath) {
  const absolute = resolve(bindingPath);
  let source;
  try {
    const status = lstatSync(absolute);
    if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) {
      fail('ADMISSION_REQUEST_SUSPENSION_BINDING_INVALID');
    }
    source = readFileSync(absolute, 'utf8');
  } catch (error) {
    if (error instanceof AdmissionRequestSuspensionVerificationError) throw error;
    return fail('ADMISSION_REQUEST_SUSPENSION_BINDING_INVALID');
  }
  let binding;
  try {
    binding = JSON.parse(source);
  } catch {
    return fail('ADMISSION_REQUEST_SUSPENSION_BINDING_INVALID');
  }
  const digest = binding?.admissionRequestSuspensionReceiptDigest;
  if (!SHA256.test(digest ?? '')) {
    fail('ADMISSION_REQUEST_SUSPENSION_BINDING_INVALID');
  }
  return digest;
}

function parseArguments(values) {
  const parsed = new Map();
  for (const value of values) {
    const match = /^--(bridge|binding|expected-sha256)=(.+)$/u.exec(value);
    if (match === null || parsed.has(match[1])) {
      fail('ADMISSION_REQUEST_SUSPENSION_ARGUMENT_INVALID');
    }
    parsed.set(match[1], match[2]);
  }
  if (
    parsed.size < 1
    || parsed.size > 2
    || parsed.get('bridge') !== ADMISSION_REQUEST_SUSPENSION_BRIDGE
    || (parsed.has('binding') && parsed.has('expected-sha256'))
  ) fail('ADMISSION_REQUEST_SUSPENSION_ARGUMENT_INVALID');
  const expected = parsed.has('binding')
    ? readExpectedDigest(parsed.get('binding'))
    : parsed.get('expected-sha256');
  if (expected !== undefined && !SHA256.test(expected)) {
    fail('ADMISSION_REQUEST_SUSPENSION_ARGUMENT_INVALID');
  }
  return Object.freeze({ bridgeOrigin: parsed.get('bridge'), expected });
}

async function main() {
  const input = parseArguments(process.argv.slice(2));
  const result = await verifyAdmissionRequestSuspensionLive({
    bridgeOrigin: input.bridgeOrigin,
  });
  if (
    input.expected !== undefined
    && input.expected !== result.receiptSha256
  ) fail('ADMISSION_REQUEST_SUSPENSION_RECEIPT_MISMATCH');
  process.stdout.write(`${JSON.stringify({
    profile: ADMISSION_REQUEST_SUSPENSION_PROFILE,
    receiptSha256: result.receiptSha256,
  })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${
      error instanceof AdmissionRequestSuspensionVerificationError
        ? error.code
        : 'ADMISSION_REQUEST_SUSPENSION_VERIFICATION_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}
