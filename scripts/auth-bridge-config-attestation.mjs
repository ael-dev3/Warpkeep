import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_AUTH_BRIDGE_URL = 'https://auth.warpkeep.com';
export const DEFAULT_FARCASTER_RPC_PRIMARY_URL = 'https://optimism.drpc.org/';
export const DEFAULT_FARCASTER_RPC_SECONDARY_URL = 'https://optimism-rpc.publicnode.com/';

const ATTESTATION_PATH = '/v1/admin/config-attestation';
const RELEASE_ATTESTATION_PATH = '/v1/release-attestation';
const ATTESTATION_PROFILE = 'warpkeep-auth-v2';
const RELEASE_ATTESTATION_PROFILE = 'warpkeep-admission-notification-bridge-v1';
const MAX_ATTESTATION_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const PUBLIC_KEY_THUMBPRINT = /^[A-Za-z0-9_-]{43}$/u;
const PRIVATE_ATTESTATION_KEYS = Object.freeze([
  'profile',
  'digest',
  'farcasterRpcEndpointFingerprints',
  'farcasterRpcEndpointRoleFingerprints',
  'miniAppHubEndpointFingerprints',
  'signingPublicKeyThumbprint',
  'quickAuthIssuer',
  'quickAuthDomain',
  'quickAuthBrowserOrigin',
  'quickAuthExchangePath',
  'quickAuthVerifierPackage',
  'quickAuthMaxTokenBytes',
  'quickAuthMaxIssuerLifetimeSeconds',
  'accessRequestStatusPath',
  'accessRequestSubmitPath',
  'accessRequestResolverTokenTtlSeconds',
  'accessRequestResolverTimeoutMilliseconds',
  'accessRequestStatusProcedure',
  'accessRequestSubmitProcedure',
  'approvalNotificationsEnabled',
  'miniAppNotificationClientFids',
  'miniAppWebhookPath',
  'admissionNotificationPath',
  'admissionNotificationRecoveryPath',
  'admissionNotificationStatusPath',
  'publicAuthEnabled',
  'accessExpectedFidRequired',
  'qaObserverEnabled',
  'qaObserverSpacetimeDbUri',
  'qaObserverSpacetimeDbDatabase',
  'qaObserverAudience',
  'qaObserverKeyFingerprint',
  'qaObserverKeyRegisteredAt',
  'qaObserverKeyExpiresAt',
  'qaObserverMaxRegistrationLifetimeMilliseconds',
]);
const B0_PREDECESSOR_ATTESTATION_KEYS = Object.freeze(
  PRIVATE_ATTESTATION_KEYS.filter(
    key => key !== 'admissionNotificationRecoveryPath',
  ),
);
export const AUTH_BRIDGE_RELEASE_ATTESTATION_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'bridgeSourceCommit',
  'notificationDeliveryEnabled',
  'notificationTransportConfigured',
  'admissionNotificationStoreConfigured',
  'notificationClientCount',
  'notificationDeliveryContractDigest',
  'publicAuthEnabled',
  'accessExpectedFidRequired',
]);

function fail(message) {
  throw new Error(`Auth bridge configuration verification failed: ${message}`);
}

class AuthBridgePrivateAttestationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthBridgePrivateAttestationError';
    this.code = code;
  }
}

function failPrivateAttestation(code, message) {
  throw new AuthBridgePrivateAttestationError(
    code,
    `Auth bridge configuration verification failed: ${message}`,
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function exactOrderedKeys(value, expected) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(expected);
}

function exactBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} was invalid.`);
  return value;
}

function positiveSafeIntegerArray(value, label, maximumLength) {
  if (
    !Array.isArray(value)
    || value.length > maximumLength
    || value.some(entry => !Number.isSafeInteger(entry) || entry <= 0)
    || value.some((entry, index) => index > 0 && value[index - 1] >= entry)
  ) fail(`${label} was invalid.`);
  return Object.freeze([...value]);
}

function sha256Array(value, label, expectedLength) {
  if (
    !Array.isArray(value)
    || value.length !== expectedLength
    || value.some(entry => typeof entry !== 'string' || !SHA256_HEX.test(entry))
    || value.some((entry, index) => index > 0 && value[index - 1] >= entry)
  ) fail(`${label} was invalid.`);
  return Object.freeze([...value]);
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

async function readBoundedJson(response, label = 'private attestation', includeSource = false) {
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/u.test(advertisedLength) || Number(advertisedLength) > MAX_ATTESTATION_BYTES)
  ) {
    fail(`the ${label} response was too large.`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    fail(`the ${label} response was not JSON.`);
  }
  if (!response.body) fail(`the ${label} response had no body.`);

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
        fail(`the ${label} response was too large.`);
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
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(source);
    return includeSource ? Object.freeze({ value, source }) : value;
  } catch {
    fail(`the ${label} response contained invalid JSON.`);
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

function canonicalTimestampOrNull(value, label) {
  if (value === null) return null;
  if (
    typeof value !== 'string'
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail(`${label} was invalid.`);
  return value;
}

function readPrivateAttestationModes(body, b0Contract = false) {
  const currentContract = exactKeys(body, PRIVATE_ATTESTATION_KEYS);
  const predecessorContract = exactKeys(
    body,
    B0_PREDECESSOR_ATTESTATION_KEYS,
  );
  if (!currentContract && (!b0Contract || !predecessorContract)) {
    fail('the private attestation shape was invalid.');
  }
  if (
    body.profile !== ATTESTATION_PROFILE
    || typeof body.digest !== 'string'
    || !SHA256_HEX.test(body.digest)
    || typeof body.signingPublicKeyThumbprint !== 'string'
    || !PUBLIC_KEY_THUMBPRINT.test(body.signingPublicKeyThumbprint)
    || body.quickAuthIssuer !== 'https://auth.farcaster.xyz'
    || body.quickAuthDomain !== 'warpkeep.com'
    || body.quickAuthBrowserOrigin !== 'https://warpkeep.com'
    || body.quickAuthExchangePath !== '/v2/farcaster/quick-auth/exchange'
    || body.quickAuthVerifierPackage !== '@farcaster/quick-auth@0.0.8'
    || body.quickAuthMaxTokenBytes !== 8 * 1024
    || body.quickAuthMaxIssuerLifetimeSeconds !== 60 * 60
    || body.accessRequestStatusPath !== '/v2/access/status'
    || body.accessRequestSubmitPath !== '/v2/access/request'
    || body.accessRequestResolverTokenTtlSeconds !== 15
    || body.accessRequestResolverTimeoutMilliseconds !== 5_000
    || body.accessRequestStatusProcedure !== 'access_request_get_status_v1'
    || body.accessRequestSubmitProcedure !== 'access_request_submit_v1'
    || body.miniAppWebhookPath !== '/v1/farcaster/miniapp/webhook'
    || body.admissionNotificationPath !== '/v1/admin/admission-notification'
    || (currentContract
      && body.admissionNotificationRecoveryPath
        !== '/v1/admin/admission-notification-recovery')
    || body.admissionNotificationStatusPath !== '/v1/admin/admission-notification-status'
    || body.qaObserverMaxRegistrationLifetimeMilliseconds
      !== 366 * 24 * 60 * 60 * 1_000
  ) fail('the private attestation contract was invalid.');

  const hubFingerprintCount = Array.isArray(body.miniAppHubEndpointFingerprints)
    ? body.miniAppHubEndpointFingerprints.length
    : -1;
  if (hubFingerprintCount !== 0 && hubFingerprintCount !== 2) {
    fail('the notification transport attestation was invalid.');
  }
  const hubFingerprints = sha256Array(
    body.miniAppHubEndpointFingerprints,
    'the notification Hub fingerprint set',
    hubFingerprintCount,
  );
  const clientFids = positiveSafeIntegerArray(
    body.miniAppNotificationClientFids,
    'the notification client set',
    8,
  );
  const notificationTransportConfigured = hubFingerprints.length === 2
    && clientFids.length > 0;
  if (
    (hubFingerprints.length === 0) !== (clientFids.length === 0)
    || (body.approvalNotificationsEnabled === true && !notificationTransportConfigured)
  ) fail('the notification transport attestation was invalid.');

  const publicAuthEnabled = exactBoolean(
    body.publicAuthEnabled,
    'the public-auth mode',
  );
  const accessExpectedFidRequired = exactBoolean(
    body.accessExpectedFidRequired,
    'the expected-FID mode',
  );
  const notificationDeliveryEnabled = exactBoolean(
    body.approvalNotificationsEnabled,
    'the notification delivery mode',
  );
  exactBoolean(body.qaObserverEnabled, 'the QA observer mode');
  for (const [value, label] of [
    [body.qaObserverSpacetimeDbUri, 'the QA observer URI'],
    [body.qaObserverSpacetimeDbDatabase, 'the QA observer database'],
    [body.qaObserverAudience, 'the QA observer audience'],
  ]) {
    if (value !== null && (typeof value !== 'string' || value.length === 0)) {
      fail(`${label} was invalid.`);
    }
  }
  if (
    body.qaObserverKeyFingerprint !== null
    && (
      typeof body.qaObserverKeyFingerprint !== 'string'
      || !PUBLIC_KEY_THUMBPRINT.test(body.qaObserverKeyFingerprint)
    )
  ) fail('the QA observer key fingerprint was invalid.');
  canonicalTimestampOrNull(
    body.qaObserverKeyRegisteredAt,
    'the QA observer registration',
  );
  canonicalTimestampOrNull(
    body.qaObserverKeyExpiresAt,
    'the QA observer expiry',
  );

  return Object.freeze({
    notificationDeliveryEnabled,
    notificationTransportConfigured,
    notificationClientCount: clientFids.length,
    publicAuthEnabled,
    accessExpectedFidRequired,
  });
}

async function verifyAuthBridgeRpcRoleAttestationContract({
  bridgeUrl = DEFAULT_AUTH_BRIDGE_URL,
  adminToken,
  expectedPrimaryRpcUrl = DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  expectedSecondaryRpcUrl = DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  fetchImpl = fetch,
} = {}, b0Contract = false) {
  let bridgeOrigin;
  let credential;
  let primaryUrl;
  let secondaryUrl;
  try {
    bridgeOrigin = normalizeBridgeOrigin(bridgeUrl);
    if (bridgeOrigin !== new URL(DEFAULT_AUTH_BRIDGE_URL).origin) {
      fail('credentialed attestation is pinned to the canonical Warpkeep bridge.');
    }
    credential = readAdminToken(adminToken);
    primaryUrl = normalizeExpectedRpcUrl(
      expectedPrimaryRpcUrl,
      'WARPKEEP_EXPECTED_FARCASTER_RPC_PRIMARY_URL',
    );
    secondaryUrl = normalizeExpectedRpcUrl(
      expectedSecondaryRpcUrl,
      'WARPKEEP_EXPECTED_FARCASTER_RPC_SECONDARY_URL',
    );
    if (primaryUrl === secondaryUrl) {
      fail('the expected RPC roles must use distinct endpoints.');
    }
  } catch {
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_INPUT_INVALID',
      'the private attestation input was invalid.',
    );
  }

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
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_UNREACHABLE',
      'the private attestation endpoint was unreachable.',
    );
  }
  if (!(response instanceof Response)) {
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      'the private attestation response contract was invalid.',
    );
  }
  if (!response.ok || response.status !== 200) {
    if (response.status === 401 || response.status === 403) {
      failPrivateAttestation(
        'AUTH_BRIDGE_PRIVATE_ATTESTATION_AUTH_REJECTED',
        'the private attestation endpoint rejected the request.',
      );
    }
    if (response.status === 429) {
      failPrivateAttestation(
        'AUTH_BRIDGE_PRIVATE_ATTESTATION_RATE_LIMITED',
        'the private attestation endpoint rejected the request.',
      );
    }
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_HTTP_REJECTED',
      'the private attestation endpoint rejected the request.',
    );
  }
  for (const name of [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
  ]) {
    if (response.headers.has(name)) {
      failPrivateAttestation(
        'AUTH_BRIDGE_PRIVATE_ATTESTATION_HEADERS_INVALID',
        'the private attestation endpoint exposed browser CORS headers.',
      );
    }
  }
  if (response.headers.get('cache-control') !== 'no-store') {
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_HEADERS_INVALID',
      'the private attestation endpoint was cacheable.',
    );
  }

  let body;
  let modes;
  let roles;
  try {
    body = await readBoundedJson(response);
    modes = readPrivateAttestationModes(body, b0Contract);
    roles = readRoleFingerprints(body.farcasterRpcEndpointRoleFingerprints);
  } catch {
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      'the private attestation response contract was invalid.',
    );
  }
  const expectedRoles = Object.freeze({
    primary: farcasterRpcEndpointFingerprint(primaryUrl),
    secondary: farcasterRpcEndpointFingerprint(secondaryUrl),
  });
  if (
    roles.primary !== expectedRoles.primary
    || roles.secondary !== expectedRoles.secondary
  ) {
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_RPC_ROLES_INVALID',
      'the live RPC primary/secondary assignment did not match the reviewed configuration.',
    );
  }
  const legacySet = body.farcasterRpcEndpointFingerprints;
  if (
    !Array.isArray(legacySet)
    || legacySet.length !== 2
    || legacySet.some(value => typeof value !== 'string' || !SHA256_HEX.test(value))
    || JSON.stringify([...legacySet].sort())
      !== JSON.stringify([expectedRoles.primary, expectedRoles.secondary].sort())
  ) {
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_RPC_ROLES_INVALID',
      'the live RPC endpoint set did not match the reviewed configuration.',
    );
  }
  if (typeof body.digest !== 'string' || !SHA256_HEX.test(body.digest)) {
    failPrivateAttestation(
      'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      'the private attestation digest was invalid.',
    );
  }

  return Object.freeze({
    profile: ATTESTATION_PROFILE,
    digest: body.digest,
    farcasterRpcEndpointRoleFingerprints: roles,
    ...modes,
  });
}

export function verifyAuthBridgeRpcRoleAttestation(options) {
  return verifyAuthBridgeRpcRoleAttestationContract(options, false);
}

/**
 * Verifies either the exact private response emitted by the live e8bd065 B0
 * predecessor or the exact current response emitted after B0. The two shapes
 * differ only by the predecessor's deliberate absence of the not-yet-deployed
 * notification-recovery path, allowing same-source journal recovery without
 * weakening the prepared path's current-contract requirement.
 */
export function verifyAuthBridgeNotificationB0RpcRoleAttestation(
  options,
) {
  return verifyAuthBridgeRpcRoleAttestationContract(options, true);
}

const RELEASE_SECURITY_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
});

function rejectCorsOrRedirectHeaders(response, label) {
  for (const name of [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    'location',
  ]) {
    if (response.headers.has(name)) fail(`${label} exposed a forbidden response header.`);
  }
}

export function parseAuthBridgeReleaseAttestation(value) {
  if (!exactOrderedKeys(value, AUTH_BRIDGE_RELEASE_ATTESTATION_KEYS)) {
    fail('the public release attestation shape or field order was invalid.');
  }
  if (
    value.schemaVersion !== 1
    || value.profile !== RELEASE_ATTESTATION_PROFILE
    || typeof value.bridgeSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.bridgeSourceCommit)
    || value.notificationDeliveryEnabled !== true
    || value.notificationTransportConfigured !== true
    || value.admissionNotificationStoreConfigured !== true
    || value.notificationClientCount !== 1
    || typeof value.notificationDeliveryContractDigest !== 'string'
    || !SHA256_HEX.test(value.notificationDeliveryContractDigest)
    || typeof value.publicAuthEnabled !== 'boolean'
    || typeof value.accessExpectedFidRequired !== 'boolean'
  ) fail('the public release attestation contract was invalid.');
  return Object.freeze({
    schemaVersion: 1,
    profile: RELEASE_ATTESTATION_PROFILE,
    bridgeSourceCommit: value.bridgeSourceCommit,
    notificationDeliveryEnabled: true,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    notificationClientCount: 1,
    notificationDeliveryContractDigest: value.notificationDeliveryContractDigest,
    publicAuthEnabled: value.publicAuthEnabled,
    accessExpectedFidRequired: value.accessExpectedFidRequired,
  });
}

export async function verifyAuthBridgeReleaseAttestation({
  bridgeUrl = DEFAULT_AUTH_BRIDGE_URL,
  expected,
  fetchImpl = fetch,
} = {}) {
  const expectedAttestation = parseAuthBridgeReleaseAttestation(expected);
  const bridgeOrigin = normalizeBridgeOrigin(bridgeUrl);
  if (bridgeOrigin !== new URL(DEFAULT_AUTH_BRIDGE_URL).origin) {
    fail('public release attestation is pinned to the canonical Warpkeep bridge.');
  }
  let response;
  try {
    response = await fetchImpl(new URL(RELEASE_ATTESTATION_PATH, `${bridgeOrigin}/`), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch {
    fail('the public release attestation endpoint was unreachable.');
  }
  if (!response.ok || response.status !== 200) {
    fail('the public release attestation endpoint was not prepared.');
  }
  rejectCorsOrRedirectHeaders(response, 'the public release attestation endpoint');
  for (const [name, expectedValue] of Object.entries(RELEASE_SECURITY_HEADERS)) {
    if (response.headers.get(name) !== expectedValue) {
      fail('the public release attestation security headers were invalid.');
    }
  }
  const document = await readBoundedJson(
    response,
    'public release attestation',
    true,
  );
  const actual = parseAuthBridgeReleaseAttestation(document.value);
  if (
    document.source !== JSON.stringify(expectedAttestation)
    || JSON.stringify(actual) !== JSON.stringify(expectedAttestation)
  ) {
    fail('the public release attestation did not match the reviewed deployment.');
  }
  return actual;
}

export async function verifyAuthBridgePreparedConfigAttestation({
  bridgeUrl = DEFAULT_AUTH_BRIDGE_URL,
  adminToken,
  expectedPrimaryRpcUrl = DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  expectedSecondaryRpcUrl = DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  expectedReleaseAttestation,
  fetchImpl = fetch,
} = {}) {
  // Parse every mandatory expectation before either credentialed or public I/O.
  const expected = parseAuthBridgeReleaseAttestation(expectedReleaseAttestation);
  const privateAttestation = await verifyAuthBridgeRpcRoleAttestation({
    bridgeUrl,
    adminToken,
    expectedPrimaryRpcUrl,
    expectedSecondaryRpcUrl,
    fetchImpl,
  });
  if (
    privateAttestation.notificationDeliveryEnabled
      !== expected.notificationDeliveryEnabled
    || privateAttestation.notificationTransportConfigured
      !== expected.notificationTransportConfigured
    || privateAttestation.notificationClientCount !== expected.notificationClientCount
    || privateAttestation.publicAuthEnabled !== expected.publicAuthEnabled
    || privateAttestation.accessExpectedFidRequired
      !== expected.accessExpectedFidRequired
  ) fail('the private and public bridge release modes did not match.');

  const releaseAttestation = await verifyAuthBridgeReleaseAttestation({
    bridgeUrl,
    expected,
    fetchImpl,
  });
  return Object.freeze({
    releaseAttestation,
    configurationDigest: privateAttestation.digest,
    farcasterRpcEndpointRoleFingerprints:
      privateAttestation.farcasterRpcEndpointRoleFingerprints,
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
