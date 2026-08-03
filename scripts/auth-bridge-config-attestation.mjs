import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_AUTH_BRIDGE_URL = 'https://auth.warpkeep.com';
export const DEFAULT_FARCASTER_RPC_PRIMARY_URL = 'https://optimism.drpc.org/';
export const DEFAULT_FARCASTER_RPC_SECONDARY_URL = 'https://optimism-rpc.publicnode.com/';

const ATTESTATION_PATH = '/v1/admin/config-attestation';
const ATTESTATION_PROFILE = 'warpkeep-auth-v2';
const MAX_ATTESTATION_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

function fail(message) {
  throw new Error(`Auth bridge configuration verification failed: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function normalizeBridgeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('WARPKEEP_AUTH_BRIDGE_URL must be a public HTTPS origin.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
    || parsed.pathname !== '/'
  ) {
    fail('WARPKEEP_AUTH_BRIDGE_URL must be a public HTTPS origin.');
  }
  return parsed.origin;
}

export function normalizeExpectedRpcUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a public HTTPS URL.`);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
  ) {
    fail(`${label} must be a public HTTPS URL.`);
  }
  return parsed.href;
}

export function farcasterRpcEndpointFingerprint(rpcUrl) {
  return createHash('sha256')
    .update(`warpkeep-farcaster-rpc-endpoint-v1\0${rpcUrl}`)
    .digest('hex');
}

function readAdminToken(value) {
  const bytes = new TextEncoder().encode(value ?? '');
  try {
    if (bytes.byteLength < 32 || bytes.byteLength > 512) {
      fail('WARPKEEP_ADMIN_TOKEN_SECRET must contain 32 to 512 bytes.');
    }
    return value;
  } finally {
    bytes.fill(0);
  }
}

async function readBoundedJson(response) {
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/u.test(advertisedLength) || Number(advertisedLength) > MAX_ATTESTATION_BYTES)
  ) {
    fail('the private attestation response was too large.');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    fail('the private attestation response was not JSON.');
  }
  if (!response.body) fail('the private attestation response had no body.');

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ATTESTATION_BYTES) {
        await reader.cancel();
        fail('the private attestation response was too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('the private attestation response contained invalid JSON.');
  } finally {
    bytes.fill(0);
  }
}

function readRoleFingerprints(value) {
  if (
    !exactKeys(value, ['primary', 'secondary'])
    || typeof value.primary !== 'string'
    || !SHA256_HEX.test(value.primary)
    || typeof value.secondary !== 'string'
    || !SHA256_HEX.test(value.secondary)
  ) {
    fail('the private attestation did not contain two valid RPC role fingerprints.');
  }
  return Object.freeze({
    primary: value.primary,
    secondary: value.secondary,
  });
}

export async function verifyAuthBridgeRpcRoleAttestation({
  bridgeUrl = DEFAULT_AUTH_BRIDGE_URL,
  adminToken,
  expectedPrimaryRpcUrl = DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  expectedSecondaryRpcUrl = DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  fetchImpl = fetch,
} = {}) {
  const bridgeOrigin = normalizeBridgeOrigin(bridgeUrl);
  if (bridgeOrigin !== new URL(DEFAULT_AUTH_BRIDGE_URL).origin) {
    fail('credentialed attestation is pinned to the canonical Warpkeep bridge.');
  }
  const credential = readAdminToken(adminToken);
  const primaryUrl = normalizeExpectedRpcUrl(
    expectedPrimaryRpcUrl,
    'WARPKEEP_EXPECTED_FARCASTER_RPC_PRIMARY_URL',
  );
  const secondaryUrl = normalizeExpectedRpcUrl(
    expectedSecondaryRpcUrl,
    'WARPKEEP_EXPECTED_FARCASTER_RPC_SECONDARY_URL',
  );
  if (primaryUrl === secondaryUrl) fail('the expected RPC roles must use distinct endpoints.');

  let response;
  try {
    response = await fetchImpl(new URL(ATTESTATION_PATH, `${bridgeOrigin}/`), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential}`,
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch {
    fail('the private attestation endpoint was unreachable.');
  }
  if (!response.ok) fail('the private attestation endpoint rejected the request.');
  for (const name of [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
  ]) {
    if (response.headers.has(name)) {
      fail('the private attestation endpoint exposed browser CORS headers.');
    }
  }

  const body = await readBoundedJson(response);
  if (!isRecord(body) || body.profile !== ATTESTATION_PROFILE) {
    fail('the private attestation profile was invalid.');
  }
  const roles = readRoleFingerprints(body.farcasterRpcEndpointRoleFingerprints);
  const expectedRoles = Object.freeze({
    primary: farcasterRpcEndpointFingerprint(primaryUrl),
    secondary: farcasterRpcEndpointFingerprint(secondaryUrl),
  });
  if (
    roles.primary !== expectedRoles.primary
    || roles.secondary !== expectedRoles.secondary
  ) {
    fail('the live RPC primary/secondary assignment did not match the reviewed configuration.');
  }
  const legacySet = body.farcasterRpcEndpointFingerprints;
  if (
    !Array.isArray(legacySet)
    || legacySet.length !== 2
    || legacySet.some(value => typeof value !== 'string' || !SHA256_HEX.test(value))
    || JSON.stringify([...legacySet].sort())
      !== JSON.stringify([expectedRoles.primary, expectedRoles.secondary].sort())
  ) {
    fail('the live RPC endpoint set did not match the reviewed configuration.');
  }
  if (typeof body.digest !== 'string' || !SHA256_HEX.test(body.digest)) {
    fail('the private attestation digest was invalid.');
  }

  return Object.freeze({
    profile: ATTESTATION_PROFILE,
    digest: body.digest,
    farcasterRpcEndpointRoleFingerprints: roles,
  });
}

async function main() {
  const adminToken = process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  await verifyAuthBridgeRpcRoleAttestation({
    bridgeUrl: DEFAULT_AUTH_BRIDGE_URL,
    adminToken,
    expectedPrimaryRpcUrl: DEFAULT_FARCASTER_RPC_PRIMARY_URL,
    expectedSecondaryRpcUrl: DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  });
  console.log('bridge config: exact primary and secondary RPC roles verified');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error
      ? error.message
      : 'Auth bridge configuration verification failed.');
    process.exitCode = 1;
  });
}
