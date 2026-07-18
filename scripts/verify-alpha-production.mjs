import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_FRONTEND = 'https://warpkeep.com';
const DEFAULT_BRIDGE = 'https://auth.warpkeep.com';
const DEFAULT_LEGACY_PAGES = 'https://ael-dev3.github.io/Warpkeep/';
const DEFAULT_SPACETIMEDB_URI = 'https://maincloud.spacetimedb.com';
const DEFAULT_SPACETIMEDB_DATABASE = 'warpkeep-89e4u';
const CANONICAL_SPACETIMEDB_DATABASE_IDENTITY = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const EXPECTED_AUDIENCE = 'warpkeep-spacetimedb';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DOCUMENT_BYTES = 1_000_000;
const MAX_ASSET_BYTES = 16_000_000;
const MAX_ROOT_ASSET_COUNT = 16;
const MAX_ROOT_ASSET_TOTAL_BYTES = 24_000_000;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const JWK_COORDINATE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const JWK_KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const AUTH_V2_SECURITY_PROFILE = 'warpkeep-auth-v2';
const AUTH_V2_CLAIMS = Object.freeze([
  'sub',
  'aud',
  'fid',
  'token_type',
  'auth_version',
  'auth_epoch',
  'roles',
  'session_iat',
  'session_exp',
]);
const AUTH_V2_CREDENTIAL_PATHS = Object.freeze([
  '/v2/farcaster/challenge',
  '/v2/farcaster/exchange',
  '/v2/session/refresh',
  '/v2/session/logout',
]);
const AUTH_V2_PAUSED_PATHS = new Set(AUTH_V2_CREDENTIAL_PATHS.slice(0, 3));
const AUTH_V2_SERVER_ONLY_ADMIN_PATHS = Object.freeze([
  '/v1/admin/token',
  '/v1/admin/auth-epoch-probe',
  '/v1/admin/config-attestation',
]);
const AUTH_V2_SECURITY_HEADERS = Object.freeze({
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
const AUTH_V2_CORS_HEADERS = new Set([
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-max-age',
]);
const EXPECTED_ALPHA_AGGREGATE = Object.freeze({
  worldTiles: 61n,
  allowedFids: 0n,
  enabledAllowedFids: 0n,
  players: 0n,
  castles: 0n,
});
const EXPECTED_ALPHA_V2_AGGREGATE = Object.freeze({
  worldTiles: 61n,
  legacyPlayers: 0n,
  playersV2: 0n,
  playerOwnershipsV2: 0n,
  consistentPlayerPairsV2: 0n,
  orphanedPlayerRowsV2: 0n,
  orphanedOwnershipRowsV2: 0n,
  castles: 0n,
  allowedFids: 0n,
  enabledAllowedFids: 0n,
  protocolVersion: 2n,
  worldSeed: 3_445_214_658n,
});
const EXPECTED_ALPHA_V2_KEYS = Object.freeze([
  ...Object.keys(EXPECTED_ALPHA_V2_AGGREGATE),
  'auditEntries',
  'worldSeedName',
].sort());
const EXPECTED_WORLD_SEED_NAME = 'HEGEMONY_GENESIS_001';
const EXPECTED_WORLD_SEED = 3_445_214_658;
const MAX_U64 = (1n << 64n) - 1n;
const RESOURCE_V4_POLICY_VERSION = 'genesis-resource-yield-v1';
const RESOURCE_V4_AGGREGATE_KEYS = Object.freeze([
  'allowedFids',
  'castles',
  'markAccounts',
  'missingResourceAccounts',
  'orphanedResourceAccounts',
  'protocolVersion',
  'resourceAccounts',
  'resourceInvariantViolations',
  'resourcePolicyVersion',
].sort());

export const PROTECTED_AGGREGATE_STAGE = Object.freeze({
  LEGACY: 'legacy',
  ADDITIVE_V2: 'additive-v2',
  ADDITIVE_V3_PRESEED: 'additive-v3-preseed',
  GENESIS_V3_SEEDED_EMPTY: 'genesis-v3-seeded-empty',
  GENESIS_V3_FOUNDED: 'genesis-v3-founded',
  GENESIS_GENERATION_V3_FOUNDED: 'genesis-generation-v3-founded',
});

const V3_STATE_COUNT_FIELDS = Object.freeze([
  'worldTiles',
  'occupiedWorldTiles',
  'worldTileMeta',
  'realms',
  'castleSlots',
  'castleSlotClaims',
  'legacyPlayers',
  'playersV2',
  'playerOwnershipsV2',
  'castles',
  'realmProfiles',
  'markAccounts',
  'snapBurnCredits',
  'walletAttributions',
  'walletAttributionSnapshots',
  'scanCursors',
  'scanBatches',
  'alphaTermsAcceptances',
  'allowedFids',
  'enabledAllowedFids',
]);

const V3_ZERO_INVARIANT_FIELDS = Object.freeze([
  'orphanedPlayerRowsV2',
  'orphanedOwnershipRowsV2',
  'orphanedCastleClaims',
  'orphanedCastles',
  'orphanedRealmProfiles',
  'orphanedMarkAccounts',
  'orphanedBurnCredits',
  'orphanedTermsAcceptances',
  'founderStateGaps',
  'markAccountInvariantViolations',
  'publicMarkProjectionViolations',
  'duplicateBurnReferences',
  'burnAccountReconciliationViolations',
  'ambiguousActiveWalletAddresses',
  'staticWorldDriftViolations',
  'termsAcceptanceInvariantViolations',
]);

const EXPECTED_ALPHA_V3_KEYS = Object.freeze([
  ...V3_STATE_COUNT_FIELDS,
  ...V3_ZERO_INVARIANT_FIELDS,
  'auditEntries',
  'protocolVersion',
  'worldSeed',
  'worldSeedName',
].sort());

const EXPECTED_ALPHA_V3_PRESEED_COUNTS = Object.freeze({
  worldTiles: 61n,
  occupiedWorldTiles: 0n,
  worldTileMeta: 0n,
  realms: 0n,
  castleSlots: 0n,
  castleSlotClaims: 0n,
  legacyPlayers: 0n,
  playersV2: 0n,
  playerOwnershipsV2: 0n,
  castles: 0n,
  realmProfiles: 0n,
  markAccounts: 0n,
  snapBurnCredits: 0n,
  walletAttributions: 0n,
  walletAttributionSnapshots: 0n,
  scanCursors: 0n,
  scanBatches: 0n,
  alphaTermsAcceptances: 0n,
  allowedFids: 0n,
  enabledAllowedFids: 0n,
});

const EXPECTED_ALPHA_V3_SEEDED_EMPTY_COUNTS = Object.freeze({
  ...EXPECTED_ALPHA_V3_PRESEED_COUNTS,
  worldTiles: 1_261n,
  worldTileMeta: 1_261n,
  realms: 1n,
  castleSlots: 100n,
});
const EXPECTED_GENESIS_GENERATION_V3_COUNTS = Object.freeze({
  ...EXPECTED_ALPHA_V3_SEEDED_EMPTY_COUNTS,
  worldTiles: 10_000n,
  worldTileMeta: 10_000n,
});
const MAX_GENESIS_FOUNDER_COUNT = 100;
// Keep aligned with the immutable version history in entryAgreementPolicy.ts.
const MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER = 2;
const MAX_ENTRY_AGREEMENT_ACCEPTANCE_COUNT =
  MAX_GENESIS_FOUNDER_COUNT * MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER;

function fail(message) {
  throw new Error(`Alpha production verification failed: ${message}`);
}

export async function validateProductionSigningKey(key) {
  if (
    key?.kty !== 'EC'
    || key?.crv !== 'P-256'
    || key?.alg !== 'ES256'
    || key?.use !== 'sig'
    || typeof key?.kid !== 'string' || !JWK_KEY_ID.test(key.kid)
    || typeof key?.x !== 'string' || !JWK_COORDINATE.test(key.x)
    || typeof key?.y !== 'string' || !JWK_COORDINATE.test(key.y)
    || typeof key?.d !== 'undefined'
  ) {
    fail('JWKS contains an invalid or private signing key.');
  }
  try {
    await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    fail('JWKS contains an unusable public signing key.');
  }
}

function httpsOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS origin.`);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.hostname.endsWith('.invalid')
  ) {
    fail(`${label} must be a stable public HTTPS origin.`);
  }
  return parsed.origin;
}

function httpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL.`);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.hostname.endsWith('.invalid')
  ) {
    fail(`${label} must be a stable public HTTPS URL.`);
  }
  return parsed.href;
}

function rootUrl(origin) {
  return new URL('/', origin).href;
}

function httpOriginFor(httpsOriginValue) {
  const url = new URL(httpsOriginValue);
  url.protocol = 'http:';
  return url.origin;
}

function defaultWwwOrigin(frontend) {
  const url = new URL(frontend);
  url.hostname = `www.${url.hostname.replace(/^www\./i, '')}`;
  return url.origin;
}

function readExpectedDeployedSha() {
  const candidates = [
    ['WARPKEEP_EXPECTED_DEPLOYED_SHA', process.env.WARPKEEP_EXPECTED_DEPLOYED_SHA],
    // This is a public Vite value. Supporting it directly lets the deploy job
    // verify the artifact it just built without duplicating its public SHA.
    ['VITE_WARPKEEP_BUILD_SHA', process.env.VITE_WARPKEEP_BUILD_SHA],
  ].filter(([, value]) => typeof value === 'string' && value.trim().length > 0);

  if (candidates.length === 0) return undefined;

  const normalized = candidates.map(([label, value]) => {
    const sha = value.trim().toLowerCase();
    if (!FULL_SHA_PATTERN.test(sha)) {
      fail(`${label} must be a full Git commit SHA when configured.`);
    }
    return sha;
  });
  if (new Set(normalized).size !== 1) {
    fail('WARPKEEP_EXPECTED_DEPLOYED_SHA and VITE_WARPKEEP_BUILD_SHA disagree.');
  }
  return normalized[0];
}

async function fetchWithTimeout(url, init = {}, fetchImpl = fetch) {
  try {
    return await fetchImpl(url, {
      redirect: 'manual',
      cache: 'no-store',
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    fail(`could not reach ${new URL(url).origin}.`);
  }
}

async function readBoundedBytes(response, label, maximumBytes) {
  const advertisedLength = response.headers.get('content-length');
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > maximumBytes)) {
    fail(`${label} is too large.`);
  }
  if (!response.body) fail(`${label} did not include a response body.`);

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        fail(`${label} is too large.`);
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
  return bytes;
}

async function readBoundedText(response, label, maximumBytes) {
  return new TextDecoder().decode(await readBoundedBytes(response, label, maximumBytes));
}

async function readJson(response, label) {
  if (response.status !== 200) {
    fail(`${label} returned HTTP ${response.status}.`);
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) {
    fail(`${label} did not return JSON.`);
  }
  try {
    return JSON.parse(await readBoundedText(response, label, MAX_DOCUMENT_BYTES));
  } catch {
    fail(`${label} did not return JSON.`);
  }
}

async function readExactJsonAtStatus(response, label, expectedStatus) {
  if (response.status !== expectedStatus) {
    fail(`${label} returned HTTP ${response.status}.`);
  }
  if (response.headers.get('content-type') !== 'application/json; charset=utf-8') {
    fail(`${label} did not return exact JSON content metadata.`);
  }
  try {
    return JSON.parse(await readBoundedText(response, label, MAX_DOCUMENT_BYTES));
  } catch {
    fail(`${label} did not return JSON.`);
  }
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isExactStringArray(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function verifyExactErrorPayload(value, code, message, label) {
  if (
    !hasExactKeys(value, ['error'])
    || !hasExactKeys(value.error, ['code', 'message'])
    || value.error.code !== code
    || value.error.message !== message
  ) {
    fail(`${label} did not return the expected fail-closed error.`);
  }
}

function verifyAuthV2SecurityHeaders(response, label) {
  for (const [name, expected] of Object.entries(AUTH_V2_SECURITY_HEADERS)) {
    if (response.headers.get(name) !== expected) {
      fail(`${label} did not return the exact ${name} security header.`);
    }
  }
  if (response.headers.has('set-cookie')) {
    fail(`${label} unexpectedly attempted to set a cookie.`);
  }
}

function exactCommaHeader(response, name, expected) {
  const values = (response.headers.get(name) ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const expectedValues = expected.map(value => value.toLowerCase());
  return values.length === expectedValues.length
    && values.every(value => expectedValues.includes(value))
    && new Set(values).size === values.length;
}

function verifyExactCredentialedCors(response, frontend, label) {
  const corsHeaders = [...response.headers.keys()]
    .filter(name => name.startsWith('access-control-'));
  if (
    corsHeaders.length !== AUTH_V2_CORS_HEADERS.size
    || corsHeaders.some(name => !AUTH_V2_CORS_HEADERS.has(name))
    || response.headers.get('access-control-allow-origin') !== frontend
    || response.headers.get('access-control-allow-credentials') !== 'true'
    || !exactCommaHeader(response, 'access-control-allow-methods', ['POST', 'OPTIONS'])
    || !exactCommaHeader(response, 'access-control-allow-headers', ['content-type'])
    || response.headers.get('access-control-max-age') !== '600'
    || !exactCommaHeader(response, 'vary', ['Origin'])
  ) {
    fail(`${label} did not return exact credentialed browser CORS.`);
  }
}

function verifyNoCors(response, label) {
  if ([...response.headers.keys()].some(name => name.startsWith('access-control-'))) {
    fail(`${label} exposed browser CORS to an untrusted origin.`);
  }
}

function attributesForTags(html, tagName) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? [];
  return tags.map(tag => {
    const attributes = new Map();
    for (const match of tag.matchAll(/\s([A-Za-z_:][A-Za-z0-9:_.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? '');
    }
    return attributes;
  });
}

function hasCanonicalMetadata(html, frontend) {
  const root = rootUrl(frontend);
  const canonicalLink = attributesForTags(html, 'link').some(attributes => (
    attributes.get('rel')?.split(/\s+/).map(value => value.toLowerCase()).includes('canonical')
    && attributes.get('href') === root
  ));
  const openGraphUrl = attributesForTags(html, 'meta').some(attributes => (
    attributes.get('property')?.toLowerCase() === 'og:url'
    && attributes.get('content') === root
  ));
  return canonicalLink && openGraphUrl;
}

export function rootAssetUrls(html, frontend) {
  const assets = new Map();
  let moduleScriptCount = 0;
  const allTags = [
    ...attributesForTags(html, 'script').map(attributes => ['script', attributes]),
    ...attributesForTags(html, 'link').map(attributes => ['link', attributes]),
  ];

  for (const [tagName, attributes] of allTags) {
    const source = tagName === 'script' ? attributes.get('src') : attributes.get('href');
    if (!source) continue;

    let url;
    try {
      url = new URL(source, rootUrl(frontend));
    } catch {
      fail('frontend document contains an invalid root asset URL.');
    }
    if (url.origin === frontend && url.pathname.startsWith('/Warpkeep/')) {
      fail('frontend still references the legacy /Warpkeep/ project base.');
    }
    if (url.origin !== frontend || !url.pathname.startsWith('/assets/')) continue;
    if (!source.startsWith('/assets/')) {
      fail('frontend asset URLs must be root-relative /assets/ paths.');
    }
    if (tagName === 'script') {
      if (attributes.get('type') !== 'module') {
        fail('frontend root asset is not an ES module script.');
      }
      moduleScriptCount += 1;
    }
    assets.set(url.href, url);
    if (assets.size > MAX_ROOT_ASSET_COUNT) {
      fail('frontend document contains too many root application assets.');
    }
  }

  if (moduleScriptCount === 0 || assets.size === 0) {
    fail('frontend document is missing root-base application assets.');
  }
  return [...assets.values()];
}

async function verifyRootAsset(
  assetUrl,
  expectedDeployedSha,
  maximumBytes,
  fetchImpl = fetch,
) {
  const response = await fetchWithTimeout(assetUrl.href, {}, fetchImpl);
  if (response.status !== 200) {
    fail(`frontend asset ${assetUrl.pathname} returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (/\.m?js$/i.test(assetUrl.pathname) && !/(?:java|ecma)script/.test(contentType)) {
    fail(`frontend JavaScript asset ${assetUrl.pathname} had an invalid content type.`);
  }
  if (/\.css$/i.test(assetUrl.pathname) && !contentType.startsWith('text/css')) {
    fail(`frontend stylesheet ${assetUrl.pathname} had an invalid content type.`);
  }
  const bytes = await readBoundedBytes(response, `frontend asset ${assetUrl.pathname}`, maximumBytes);
  if (bytes.byteLength === 0) fail(`frontend asset ${assetUrl.pathname} was empty.`);

  const isJavaScript = /\.m?js$/i.test(assetUrl.pathname);
  return Object.freeze({
    byteLength: bytes.byteLength,
    shaMatches: Boolean(isJavaScript && expectedDeployedSha
      && new TextDecoder().decode(bytes).toLowerCase().includes(expectedDeployedSha)),
  });
}

export async function verifyRootAssets(
  assets,
  expectedDeployedSha,
  verifyAsset = verifyRootAsset,
) {
  let totalBytes = 0;
  let shaMatches = false;
  for (const asset of assets) {
    const remainingBytes = MAX_ROOT_ASSET_TOTAL_BYTES - totalBytes;
    if (remainingBytes <= 0) {
      fail('frontend root application assets exceeded their cumulative byte limit.');
    }
    const maximumBytes = Math.min(MAX_ASSET_BYTES, remainingBytes);
    const result = await verifyAsset(asset, expectedDeployedSha, maximumBytes);
    if (
      result === null
      || typeof result !== 'object'
      || !Number.isSafeInteger(result.byteLength)
      || result.byteLength <= 0
      || result.byteLength > maximumBytes
      || typeof result.shaMatches !== 'boolean'
    ) {
      fail('frontend root application asset verification returned an invalid result.');
    }
    totalBytes += result.byteLength;
    shaMatches ||= result.shaMatches;
  }
  return Object.freeze({ totalBytes, shaMatches });
}

export async function verifyFrontend(frontend, expectedDeployedSha, fetchImpl = fetch) {
  const response = await fetchWithTimeout(rootUrl(frontend), {}, fetchImpl);
  if (response.status !== 200) {
    fail(`frontend returned HTTP ${response.status}.`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
    fail('frontend root did not return HTML.');
  }
  const html = await readBoundedText(response, 'frontend document', MAX_DOCUMENT_BYTES);
  if (!/\bid\s*=\s*(?:"root"|'root')/i.test(html)) {
    fail('frontend document is missing its application root.');
  }
  if (!hasCanonicalMetadata(html, frontend)) {
    fail('frontend is missing canonical warpkeep.com metadata.');
  }

  const assets = rootAssetUrls(html, frontend);
  const result = await verifyRootAssets(
    assets,
    expectedDeployedSha,
    (asset, expectedSha, maximumBytes) => verifyRootAsset(
      asset,
      expectedSha,
      maximumBytes,
      fetchImpl,
    ),
  );
  if (expectedDeployedSha && !result.shaMatches) {
    fail('frontend assets did not contain the expected deployed build SHA.');
  }
  console.log(`frontend: canonical root and ${assets.length} root-base asset${assets.length === 1 ? '' : 's'} verified${expectedDeployedSha ? ' with expected build SHA' : ''}`);
}

async function verifyRedirect(from, to, label) {
  const response = await fetchWithTimeout(from);
  if (!REDIRECT_STATUS_CODES.has(response.status)) {
    fail(`${label} returned HTTP ${response.status} instead of redirecting.`);
  }
  const location = response.headers.get('location');
  if (!location) fail(`${label} did not include a redirect location.`);

  let redirectedTo;
  try {
    redirectedTo = new URL(location, from);
  } catch {
    fail(`${label} returned an invalid redirect location.`);
  }
  if (redirectedTo.href !== new URL(to).href) {
    fail(`${label} did not redirect to the canonical frontend root.`);
  }
}

async function verifyFrontendRedirects(frontend, www, legacyPages) {
  const canonicalRoot = rootUrl(frontend);
  await verifyRedirect(rootUrl(httpOriginFor(frontend)), canonicalRoot, 'HTTP frontend');
  await verifyRedirect(rootUrl(www), canonicalRoot, 'www frontend');
  await verifyRedirect(legacyPages, canonicalRoot, 'legacy GitHub Pages frontend');
  console.log('frontend: HTTP, www, and legacy Pages redirects verified');
}

function allowMethods(response) {
  return new Set((response.headers.get('access-control-allow-methods') ?? '')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(Boolean));
}

function allowHeaders(response) {
  return new Set((response.headers.get('access-control-allow-headers') ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean));
}

async function verifyBridgePreflight(bridge, frontend, pathname, fetchImpl) {
  const preflight = await fetchWithTimeout(`${bridge}${pathname}`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  }, fetchImpl);
  const methods = allowMethods(preflight);
  const headers = allowHeaders(preflight);
  const vary = new Set((preflight.headers.get('vary') ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean));
  if (
    preflight.status !== 204
    || preflight.headers.get('access-control-allow-origin') !== frontend
    || methods.size !== 2
    || !methods.has('POST')
    || !methods.has('OPTIONS')
    || headers.size !== 1
    || !headers.has('content-type')
    || !vary.has('origin')
  ) {
    fail(`bridge ${pathname} CORS does not allow the canonical frontend exactly.`);
  }

  const hostilePreflight = await fetchWithTimeout(`${bridge}${pathname}`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://not-warpkeep.invalid',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  }, fetchImpl);
  if (hostilePreflight.headers.has('access-control-allow-origin')) {
    fail(`bridge ${pathname} exposed browser CORS to an untrusted origin.`);
  }
}

async function verifyAuthV2Preflight(
  frontend,
  bridge,
  pathname,
  expectedPublicAuthEnabled,
  fetchImpl,
) {
  const paused = !expectedPublicAuthEnabled && AUTH_V2_PAUSED_PATHS.has(pathname);
  const label = `bridge ${pathname} ${paused
    ? 'paused check'
    : expectedPublicAuthEnabled
      ? 'enabled preflight'
      : 'preflight'}`;
  const preflight = await fetchWithTimeout(`${bridge}${pathname}`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  }, fetchImpl);
  verifyAuthV2SecurityHeaders(preflight, label);
  verifyExactCredentialedCors(preflight, frontend, label);
  if (paused) {
    const payload = await readExactJsonAtStatus(preflight, label, 503);
    verifyExactErrorPayload(
      payload,
      'public_auth_paused',
      'Farcaster sign-in is temporarily paused for security hardening.',
      label,
    );
  } else {
    if (preflight.status !== 204 || preflight.headers.has('content-type')) {
      fail(`${label} did not return an empty HTTP 204 response.`);
    }
  }

  const hostileLabel = `bridge ${pathname} hostile-origin check`;
  const hostile = await fetchWithTimeout(`${bridge}${pathname}`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://not-warpkeep.invalid',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  }, fetchImpl);
  verifyAuthV2SecurityHeaders(hostile, hostileLabel);
  verifyNoCors(hostile, hostileLabel);
  if (paused) {
    const payload = await readExactJsonAtStatus(hostile, hostileLabel, 503);
    verifyExactErrorPayload(
      payload,
      'public_auth_paused',
      'Farcaster sign-in is temporarily paused for security hardening.',
      hostileLabel,
    );
  } else {
    const payload = await readExactJsonAtStatus(hostile, hostileLabel, 403);
    verifyExactErrorPayload(
      payload,
      'origin_not_allowed',
      'This browser origin is not allowed.',
      hostileLabel,
    );
  }
}

async function verifyRetiredLegacyAuthPath(frontend, bridge, pathname, fetchImpl) {
  const label = `retired bridge ${pathname}`;
  const response = await fetchWithTimeout(`${bridge}${pathname}`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  }, fetchImpl);
  verifyAuthV2SecurityHeaders(response, label);
  if (response.headers.has('access-control-allow-credentials')) {
    fail(`${label} unexpectedly allowed credentialed browser access.`);
  }
  const payload = await readExactJsonAtStatus(response, label, 410);
  verifyExactErrorPayload(
    payload,
    'legacy_auth_retired',
    'This authentication protocol has been retired.',
    label,
  );
}

async function verifyAuthV2AdminBrowserIsolation(frontend, bridge, fetchImpl) {
  const checks = Object.freeze([
    Object.freeze({
      name: 'allowed-origin GET',
      method: 'GET',
      headers: Object.freeze({ origin: frontend }),
    }),
    Object.freeze({
      name: 'allowed-origin preflight',
      method: 'OPTIONS',
      headers: Object.freeze({
        origin: frontend,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      }),
    }),
    Object.freeze({
      name: 'hostile-origin preflight',
      method: 'OPTIONS',
      headers: Object.freeze({
        origin: 'https://not-warpkeep.invalid',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      }),
    }),
  ]);

  for (const pathname of AUTH_V2_SERVER_ONLY_ADMIN_PATHS) {
    for (const check of checks) {
      const label = `auth-v2 admin browser isolation ${pathname} ${check.name}`;
      const response = await fetchWithTimeout(`${bridge}${pathname}`, {
        method: check.method,
        headers: check.headers,
      }, fetchImpl);
      verifyAuthV2SecurityHeaders(response, label);
      verifyNoCors(response, label);
      const payload = await readExactJsonAtStatus(response, label, 404);
      verifyExactErrorPayload(payload, 'not_found', 'Route not found.', label);
    }
  }
}

async function verifyAuthV2Bridge(frontend, bridge, expectedPublicAuthEnabled, fetchImpl) {
  const healthResponse = await fetchWithTimeout(`${bridge}/healthz`, {}, fetchImpl);
  verifyAuthV2SecurityHeaders(healthResponse, 'auth-v2 health endpoint');
  const health = await readExactJsonAtStatus(healthResponse, 'auth-v2 health endpoint', 200);
  if (
    !hasExactKeys(health, ['ok', 'service', 'securityProfile', 'publicAuthEnabled'])
    || health.ok !== true
    || health.service !== 'warpkeep-auth-bridge'
    || health.securityProfile !== AUTH_V2_SECURITY_PROFILE
    || health.publicAuthEnabled !== expectedPublicAuthEnabled
  ) {
    fail(expectedPublicAuthEnabled
      ? 'auth-v2 health endpoint did not attest the enabled Warpkeep security profile.'
      : 'auth-v2 health endpoint did not attest the contained Warpkeep security profile.');
  }

  const discoveryResponse = await fetchWithTimeout(
    `${bridge}/.well-known/openid-configuration`,
    {},
    fetchImpl,
  );
  verifyAuthV2SecurityHeaders(discoveryResponse, 'auth-v2 OIDC discovery');
  const discovery = await readExactJsonAtStatus(discoveryResponse, 'auth-v2 OIDC discovery', 200);
  if (
    discovery?.issuer !== bridge
    || discovery?.jwks_uri !== `${bridge}/.well-known/jwks.json`
    || !isExactStringArray(discovery?.subject_types_supported, ['public'])
    || !isExactStringArray(discovery?.id_token_signing_alg_values_supported, ['ES256'])
    || !isExactStringArray(discovery?.claims_supported, AUTH_V2_CLAIMS)
  ) {
    fail('auth-v2 OIDC discovery did not advertise the exact required profile and claims.');
  }

  const jwksResponse = await fetchWithTimeout(discovery.jwks_uri, {}, fetchImpl);
  verifyAuthV2SecurityHeaders(jwksResponse, 'auth-v2 JWKS endpoint');
  const jwks = await readExactJsonAtStatus(jwksResponse, 'auth-v2 JWKS endpoint', 200);
  if (!hasExactKeys(jwks, ['keys']) || !Array.isArray(jwks.keys) || jwks.keys.length !== 1) {
    fail('auth-v2 JWKS must contain exactly one active public signing key.');
  }
  await validateProductionSigningKey(jwks.keys[0]);

  for (const pathname of ['/v1/farcaster/challenge', '/v1/farcaster/exchange']) {
    await verifyRetiredLegacyAuthPath(frontend, bridge, pathname, fetchImpl);
  }
  for (const pathname of AUTH_V2_CREDENTIAL_PATHS) {
    await verifyAuthV2Preflight(
      frontend,
      bridge,
      pathname,
      expectedPublicAuthEnabled,
      fetchImpl,
    );
  }

  await verifyAuthV2AdminBrowserIsolation(frontend, bridge, fetchImpl);
  console.log(expectedPublicAuthEnabled
    ? 'bridge: enabled auth-v2 read-only health, discovery, JWKS, retired v1, security headers, and credentialed CORS verified'
    : 'bridge: contained auth-v2 health, discovery, JWKS, retired v1, security headers, and credentialed CORS verified');
}

export async function verifyBridge(frontend, bridge, options = {}) {
  const {
    requireAuthV2 = false,
    requireAuthV2Enabled = false,
    fetchImpl = fetch,
  } = options;
  if (requireAuthV2 && requireAuthV2Enabled) {
    fail('paused and enabled auth-v2 verification modes are mutually exclusive.');
  }
  if (requireAuthV2 || requireAuthV2Enabled) {
    await verifyAuthV2Bridge(frontend, bridge, requireAuthV2Enabled, fetchImpl);
    return;
  }

  const health = await readJson(await fetchWithTimeout(`${bridge}/healthz`, {}, fetchImpl), 'health endpoint');
  if (health?.ok !== true || health?.service !== 'warpkeep-auth-bridge') {
    fail('health endpoint did not identify the Warpkeep bridge.');
  }

  const discovery = await readJson(
    await fetchWithTimeout(`${bridge}/.well-known/openid-configuration`, {}, fetchImpl),
    'OIDC discovery'
  );
  if (discovery?.issuer !== bridge || discovery?.jwks_uri !== `${bridge}/.well-known/jwks.json`) {
    fail('OIDC discovery does not match the bridge origin.');
  }
  if (!Array.isArray(discovery?.id_token_signing_alg_values_supported)
    || !discovery.id_token_signing_alg_values_supported.includes('ES256')) {
    fail('OIDC discovery does not advertise ES256.');
  }

  const jwks = await readJson(await fetchWithTimeout(discovery.jwks_uri, {}, fetchImpl), 'JWKS endpoint');
  if (!Array.isArray(jwks?.keys) || jwks.keys.length !== 1) {
    fail('JWKS must contain exactly one active public signing key.');
  }
  const key = jwks.keys[0];
  await validateProductionSigningKey(key);

  await verifyBridgePreflight(bridge, frontend, '/v1/farcaster/challenge', fetchImpl);
  await verifyBridgePreflight(bridge, frontend, '/v1/farcaster/exchange', fetchImpl);

  const adminProbe = await fetchWithTimeout(`${bridge}/v1/admin/token`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
    },
  }, fetchImpl);
  if (adminProbe.headers.has('access-control-allow-origin')) {
    fail('admin token endpoint exposed browser CORS.');
  }
  console.log('bridge: legacy-compatible health, discovery, JWKS, and strict CORS verified (auth-v2 gate not requested)');
}

function readAggregateCount(value, label) {
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  fail(`protected aggregate ${label} was invalid.`);
}

export function verifyExpectedAlphaAggregate(output) {
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('protected aggregate inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('protected aggregate inspection returned an invalid status object.');
  }
  const expectedKeys = Object.keys(EXPECTED_ALPHA_AGGREGATE).sort();
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail('protected aggregate inspection returned unexpected fields.');
  }
  for (const [field, expected] of Object.entries(EXPECTED_ALPHA_AGGREGATE)) {
    if (readAggregateCount(status[field], field) !== expected) {
      fail(`protected aggregate ${field} did not match the required empty-alpha state.`);
    }
  }
}

export function verifyExpectedAlphaV2Aggregate(output) {
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('protocol-v2 aggregate inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('protocol-v2 aggregate inspection returned an invalid status object.');
  }
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== EXPECTED_ALPHA_V2_KEYS.length
    || actualKeys.some((key, index) => key !== EXPECTED_ALPHA_V2_KEYS[index])
  ) {
    fail('protocol-v2 aggregate inspection returned unexpected fields.');
  }
  for (const [field, expected] of Object.entries(EXPECTED_ALPHA_V2_AGGREGATE)) {
    if (readAggregateCount(status[field], field) !== expected) {
      fail(`protocol-v2 aggregate ${field} did not match the required additive migration state.`);
    }
  }
  readAggregateCount(status.auditEntries, 'auditEntries');
  if (status.worldSeedName !== EXPECTED_WORLD_SEED_NAME) {
    fail('protocol-v2 aggregate worldSeedName did not match the required generation state.');
  }
}

function readCanonicalV3Count(value, label) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) {
    fail(`protocol-v3 aggregate ${label} was not a canonical decimal string.`);
  }
  if (value.length > 20) {
    fail(`protocol-v3 aggregate ${label} exceeded the u64 range.`);
  }
  const count = BigInt(value);
  if (count > MAX_U64) {
    fail(`protocol-v3 aggregate ${label} exceeded the u64 range.`);
  }
  return count;
}

function readExpectedFounderCount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_GENESIS_FOUNDER_COUNT) {
    fail('protocol-v3 founded aggregate expected founder count was invalid.');
  }
  return BigInt(value);
}

function readExpectedFoundedMutableCount(value, label, founders) {
  if (!Number.isSafeInteger(value) || value < 0 || BigInt(value) > founders) {
    fail(`protocol-v3 founded aggregate expected ${label} was invalid.`);
  }
  return BigInt(value);
}

function readExpectedTermsAcceptanceCount(value, players) {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || BigInt(value)
      > players * BigInt(MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER)
  ) {
    fail('protocol-v3 founded aggregate expected entry-agreement row count was invalid.');
  }
  return BigInt(value);
}

function expectedV3StateCounts(
  stage,
  expectedFounderCount,
  expectedPlayerCount = 0,
  expectedTermsAcceptanceCount = 0,
) {
  if (
    stage !== PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED
    && stage !== PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED
    && (expectedPlayerCount !== 0 || expectedTermsAcceptanceCount !== 0)
  ) {
    fail('protocol-v3 authenticated count expectations require the founded aggregate stage.');
  }
  if (stage === PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED) {
    return EXPECTED_ALPHA_V3_PRESEED_COUNTS;
  }
  if (stage === PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY) {
    return EXPECTED_ALPHA_V3_SEEDED_EMPTY_COUNTS;
  }
  if (
    stage === PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED
    || stage === PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED
  ) {
    const founders = readExpectedFounderCount(expectedFounderCount);
    const players = readExpectedFoundedMutableCount(
      expectedPlayerCount,
      'player count',
      founders,
    );
    const termsAcceptances = readExpectedTermsAcceptanceCount(
      expectedTermsAcceptanceCount,
      players,
    );
    return Object.freeze({
      ...(stage === PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED
        ? EXPECTED_GENESIS_GENERATION_V3_COUNTS
        : EXPECTED_ALPHA_V3_SEEDED_EMPTY_COUNTS),
      occupiedWorldTiles: founders,
      castleSlotClaims: founders,
      playersV2: players,
      playerOwnershipsV2: players,
      castles: founders,
      realmProfiles: founders,
      markAccounts: founders,
      alphaTermsAcceptances: termsAcceptances,
      allowedFids: founders,
      enabledAllowedFids: founders,
    });
  }
  fail('protocol-v3 aggregate verification stage was invalid.');
}

export function verifyExpectedAlphaV3Aggregate(
  output,
  stage,
  expectedFounderCount,
  expectedPlayerCount = 0,
  expectedTermsAcceptanceCount = 0,
) {
  const expectedCounts = expectedV3StateCounts(
    stage,
    expectedFounderCount,
    expectedPlayerCount,
    expectedTermsAcceptanceCount,
  );
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('protocol-v3 aggregate inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('protocol-v3 aggregate inspection returned an invalid status object.');
  }
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== EXPECTED_ALPHA_V3_KEYS.length
    || actualKeys.some((key, index) => key !== EXPECTED_ALPHA_V3_KEYS[index])
  ) {
    fail('protocol-v3 aggregate inspection returned unexpected fields.');
  }

  for (const field of V3_STATE_COUNT_FIELDS) {
    const count = readCanonicalV3Count(status[field], field);
    if (count !== expectedCounts[field]) {
      fail(`protocol-v3 aggregate ${field} did not match the required rollout stage.`);
    }
  }
  for (const field of V3_ZERO_INVARIANT_FIELDS) {
    if (readCanonicalV3Count(status[field], field) !== 0n) {
      fail(`protocol-v3 aggregate invariant ${field} was nonzero.`);
    }
  }
  readCanonicalV3Count(status.auditEntries, 'auditEntries');

  if (typeof status.protocolVersion !== 'number' || status.protocolVersion !== 3) {
    fail('protocol-v3 aggregate protocolVersion was invalid.');
  }
  if (typeof status.worldSeed !== 'number' || status.worldSeed !== EXPECTED_WORLD_SEED) {
    fail('protocol-v3 aggregate worldSeed was invalid.');
  }
  if (typeof status.worldSeedName !== 'string' || status.worldSeedName !== EXPECTED_WORLD_SEED_NAME) {
    fail('protocol-v3 aggregate worldSeedName was invalid.');
  }
}

/**
 * Verify one exact counts-only procedure-v4 resource checkpoint. The procedure
 * version is v4 while the deployed backend protocol deliberately remains 3 for
 * the additive, backend-first rollout.
 */
function verifyExpectedAlphaV4ResourceAggregate(
  output,
  expectedFounderCount,
  resourcesReady,
  requiredState,
) {
  if (!Number.isSafeInteger(expectedFounderCount) || expectedFounderCount < 1 || expectedFounderCount > MAX_GENESIS_FOUNDER_COUNT) {
    fail('resource procedure-v4 aggregate expected founder count was invalid.');
  }
  const founders = BigInt(expectedFounderCount);
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('resource procedure-v4 aggregate inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('resource procedure-v4 aggregate inspection returned an invalid status object.');
  }
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== RESOURCE_V4_AGGREGATE_KEYS.length
    || actualKeys.some((key, index) => key !== RESOURCE_V4_AGGREGATE_KEYS[index])
  ) {
    fail('resource procedure-v4 aggregate inspection returned unexpected fields.');
  }

  const expectedCounts = Object.freeze({
    allowedFids: founders,
    castles: founders,
    markAccounts: founders,
    resourceAccounts: resourcesReady ? founders : 0n,
    missingResourceAccounts: resourcesReady ? 0n : founders,
    orphanedResourceAccounts: 0n,
    resourceInvariantViolations: 0n,
  });
  for (const [field, expected] of Object.entries(expectedCounts)) {
    const value = status[field];
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) {
      fail(`resource procedure-v4 aggregate ${field} was not a canonical decimal string.`);
    }
    if (value.length > 20 || BigInt(value) > MAX_U64) {
      fail(`resource procedure-v4 aggregate ${field} exceeded the u64 range.`);
    }
    if (BigInt(value) !== expected) {
      fail(`resource procedure-v4 aggregate ${field} did not match the required ${requiredState} state.`);
    }
  }
  if (typeof status.protocolVersion !== 'number' || status.protocolVersion !== 3) {
    fail('resource procedure-v4 aggregate protocolVersion was invalid.');
  }
  if (status.resourcePolicyVersion !== RESOURCE_V4_POLICY_VERSION) {
    fail('resource procedure-v4 aggregate resourcePolicyVersion was invalid.');
  }
}

export function verifyExpectedAlphaV4ResourcePrebackfillAggregate(
  output,
  expectedFounderCount,
) {
  return verifyExpectedAlphaV4ResourceAggregate(
    output,
    expectedFounderCount,
    false,
    'pre-backfill',
  );
}

/**
 * Independently verify the read-only resource checkpoint after the separately
 * approved backfill has completed. This proves only aggregate readiness; it
 * intentionally rejects identity- and balance-shaped output.
 */
export function verifyExpectedAlphaV4ResourceReadyAggregate(
  output,
  expectedFounderCount,
) {
  return verifyExpectedAlphaV4ResourceAggregate(
    output,
    expectedFounderCount,
    true,
    'post-backfill ready',
  );
}

export function protectedAggregateChildEnvironment(bridge) {
  return Object.freeze({
    WARPKEEP_SPACETIMEDB_URI: process.env.WARPKEEP_SPACETIMEDB_URI ?? DEFAULT_SPACETIMEDB_URI,
    WARPKEEP_SPACETIMEDB_DATABASE: process.env.WARPKEEP_SPACETIMEDB_DATABASE ?? DEFAULT_SPACETIMEDB_DATABASE,
    WARPKEEP_AUTH_BRIDGE_URL: bridge,
    WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
  });
}

export function protectedAggregateChildOptions(repositoryRoot, bridge, secret) {
  return {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: protectedAggregateChildEnvironment(bridge),
    input: secret,
    maxBuffer: MAX_DOCUMENT_BYTES,
    timeout: 30_000,
    // This child is read-only. SIGKILL makes the synchronous timeout a hard
    // bound even if a compromised/deadlocked child were to ignore SIGTERM.
    killSignal: 'SIGKILL',
  };
}

export function requiredProtectedAggregateSecret(secret, required) {
  if (typeof secret === 'string' && secret.length > 0) return secret;
  if (required) fail('protected aggregate inspection was required but no local Hermes credential was configured.');
  return undefined;
}

function normalizeProtectedAggregateStage(stageOrProtocolV2 = false) {
  if (typeof stageOrProtocolV2 === 'boolean') {
    return stageOrProtocolV2
      ? PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2
      : PROTECTED_AGGREGATE_STAGE.LEGACY;
  }
  if (Object.values(PROTECTED_AGGREGATE_STAGE).includes(stageOrProtocolV2)) {
    return stageOrProtocolV2;
  }
  fail('protected aggregate verification stage was invalid.');
}

export function protectedAggregateChildArguments(tsxCli, stageOrProtocolV2 = false) {
  const stage = normalizeProtectedAggregateStage(stageOrProtocolV2);
  const command = stage === PROTECTED_AGGREGATE_STAGE.LEGACY
    ? 'inspect-alpha'
    : stage === PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2
      ? 'inspect-alpha-v2'
      : 'inspect-alpha-v3';
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    command,
    '--json',
  ];
}

export function resourceV4AggregateChildArguments(tsxCli) {
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    'inspect-alpha-v4',
    '--json',
  ];
}

export function resourceV4ReadyAggregateChildEnvironment(
  bridge,
  source = process.env,
) {
  if (bridge !== DEFAULT_BRIDGE) {
    fail('resource procedure-v4 production verification requires the canonical Warpkeep bridge.');
  }
  if (
    source.WARPKEEP_SPACETIMEDB_URI !== undefined
    && source.WARPKEEP_SPACETIMEDB_URI !== DEFAULT_SPACETIMEDB_URI
  ) {
    fail('resource procedure-v4 production verification rejects a remapped SpacetimeDB URI.');
  }
  if (
    source.WARPKEEP_SPACETIMEDB_DATABASE !== undefined
    && source.WARPKEEP_SPACETIMEDB_DATABASE !== CANONICAL_SPACETIMEDB_DATABASE_IDENTITY
  ) {
    fail('resource procedure-v4 production verification requires the immutable production database identity.');
  }
  return Object.freeze({
    WARPKEEP_SPACETIMEDB_URI: DEFAULT_SPACETIMEDB_URI,
    WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_SPACETIMEDB_DATABASE_IDENTITY,
    WARPKEEP_AUTH_BRIDGE_URL: DEFAULT_BRIDGE,
    WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
  });
}

export function resourceV4ReadyAggregateChildOptions(
  repositoryRoot,
  bridge,
  secret,
  source = process.env,
) {
  return resourceV4ReadyAggregateChildOptionsFromEnvironment(
    repositoryRoot,
    secret,
    resourceV4ReadyAggregateChildEnvironment(bridge, source),
  );
}

function resourceV4ReadyAggregateChildOptionsFromEnvironment(
  repositoryRoot,
  secret,
  environment,
) {
  const secretBytes = typeof secret === 'string'
    ? new TextEncoder().encode(secret).byteLength
    : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('resource procedure-v4 production verification requires a local 32-to-512-byte Hermes credential.');
  }
  return {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: environment,
    input: secret,
    maxBuffer: MAX_DOCUMENT_BYTES,
    timeout: 30_000,
    killSignal: 'SIGKILL',
  };
}

function verifyProtectedAggregateIfConfigured(
  bridge,
  required,
  stage = PROTECTED_AGGREGATE_STAGE.LEGACY,
  expectedFounderCount,
  expectedPlayerCount = 0,
  expectedTermsAcceptanceCount = 0,
) {
  const normalizedStage = normalizeProtectedAggregateStage(stage);
  const secret = requiredProtectedAggregateSecret(process.env.WARPKEEP_ADMIN_TOKEN_SECRET, required);
  if (!secret) {
    console.log('alpha status: skipped (no local Hermes credential configured)');
    return;
  }
  const repositoryRoot = resolve(dirname(resolve(process.argv[1])), '..');
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = spawnSync(
    process.execPath,
    protectedAggregateChildArguments(tsxCli, normalizedStage),
    protectedAggregateChildOptions(repositoryRoot, bridge, secret),
  );
  if (result.error || result.status !== 0 || result.signal) {
    fail('protected aggregate inspection failed.');
  }
  if (normalizedStage === PROTECTED_AGGREGATE_STAGE.LEGACY) {
    verifyExpectedAlphaAggregate(result.stdout);
  } else if (normalizedStage === PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2) {
    verifyExpectedAlphaV2Aggregate(result.stdout);
  } else {
    verifyExpectedAlphaV3Aggregate(
      result.stdout,
      normalizedStage,
      expectedFounderCount,
      expectedPlayerCount,
      expectedTermsAcceptanceCount,
    );
  }
  // Never mirror child-process output: even a future Hermes implementation
  // must not cause this verifier to surface a secret, JWT, or identity.
  const successMessage = {
    [PROTECTED_AGGREGATE_STAGE.LEGACY]: 'alpha status: required empty aggregate state verified',
    [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2]: 'alpha status: required additive protocol-v2 aggregate state verified',
    [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED]: 'alpha status: required additive protocol-v3 preseed aggregate state verified',
    [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY]: 'alpha status: required Genesis protocol-v3 seeded-empty aggregate state verified',
    [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED]: 'alpha status: required Genesis protocol-v3 founded aggregate state verified',
    [PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED]: 'alpha status: required Genesis generation-v3 10,000-cell founded aggregate state verified',
  }[normalizedStage];
  console.log(successMessage);
}

export function verifyPostBackfillResourceAggregateCheckpoints(
  bridge,
  expectedFounderCount,
  expectedPlayerCount,
  expectedTermsAcceptanceCount,
  secret,
  spawn = spawnSync,
  repositoryRoot = resolve(dirname(resolve(process.argv[1])), '..'),
  sourceEnvironment = process.env,
  foundedStage = PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
) {
  const requiredSecret = requiredProtectedAggregateSecret(secret, true);
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const childEnvironment = resourceV4ReadyAggregateChildEnvironment(
    bridge,
    sourceEnvironment,
  );
  const childOptions = resourceV4ReadyAggregateChildOptionsFromEnvironment(
    repositoryRoot,
    requiredSecret,
    childEnvironment,
  );
  const foundedResult = spawn(
    process.execPath,
    protectedAggregateChildArguments(
      tsxCli,
      foundedStage,
    ),
    childOptions,
  );
  if (foundedResult.error || foundedResult.status !== 0 || foundedResult.signal) {
    fail('post-backfill founded protocol-v3 aggregate inspection failed.');
  }
  verifyExpectedAlphaV3Aggregate(
    foundedResult.stdout,
    foundedStage,
    expectedFounderCount,
    expectedPlayerCount,
    expectedTermsAcceptanceCount,
  );
  console.log(
    foundedStage === PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED
      ? 'alpha status: required Genesis generation-v3 10,000-cell founded aggregate state verified'
      : 'alpha status: required Genesis protocol-v3 founded aggregate state verified',
  );

  const resourceResult = spawn(
    process.execPath,
    resourceV4AggregateChildArguments(tsxCli),
    childOptions,
  );
  if (resourceResult.error || resourceResult.status !== 0 || resourceResult.signal) {
    fail('resource procedure-v4 ready aggregate inspection failed.');
  }
  verifyExpectedAlphaV4ResourceReadyAggregate(resourceResult.stdout, expectedFounderCount);
  // Never mirror the child output. The accepted contract is counts-only, but
  // this remains safe if a future child regresses and emits private material.
  console.log('alpha status: required resource procedure-v4 ready aggregate state verified');
}

export function parseProductionVerifierArguments(arguments_ = process.argv.slice(2)) {
  const allowed = new Set([
    '--require-protected-aggregate',
    '--require-additive-v2-aggregate',
    '--require-additive-v3-preseed-aggregate',
    '--require-genesis-v3-seeded-empty-aggregate',
    '--require-genesis-v3-founded-aggregate',
    '--require-genesis-generation-v3-founded-aggregate',
    '--require-resource-v4-ready-aggregate',
    '--require-auth-v2',
    '--require-auth-v2-enabled',
  ]);
  const seen = new Set();
  let expectedFounderCount;
  let expectedPlayerCount;
  let expectedTermsAcceptanceCount;
  for (const argument of arguments_) {
    if (argument.startsWith('--expected-founder-count=')) {
      if (expectedFounderCount !== undefined) {
        fail('unknown or duplicate command-line argument.');
      }
      const value = argument.slice('--expected-founder-count='.length);
      if (!/^(?:[1-9]|[1-9]\d|100)$/.test(value)) {
        fail('expected founder count must be a canonical integer from 1 through 100.');
      }
      expectedFounderCount = Number(value);
      continue;
    }
    if (argument.startsWith('--expected-player-count=')) {
      if (expectedPlayerCount !== undefined) {
        fail('unknown or duplicate command-line argument.');
      }
      const value = argument.slice('--expected-player-count='.length);
      if (!/^(?:0|[1-9]|[1-9]\d|100)$/.test(value)) {
        fail('expected player count must be a canonical integer from 0 through 100.');
      }
      expectedPlayerCount = Number(value);
      continue;
    }
    if (argument.startsWith('--expected-terms-acceptance-count=')) {
      if (expectedTermsAcceptanceCount !== undefined) {
        fail('unknown or duplicate command-line argument.');
      }
      const value = argument.slice('--expected-terms-acceptance-count='.length);
      if (
        !/^(?:0|[1-9]\d{0,2})$/.test(value)
        || Number(value) > MAX_ENTRY_AGREEMENT_ACCEPTANCE_COUNT
      ) {
        fail(
          'expected Terms acceptance count must be a canonical integer from 0 through '
          + MAX_ENTRY_AGREEMENT_ACCEPTANCE_COUNT + '.',
        );
      }
      expectedTermsAcceptanceCount = Number(value);
      continue;
    }
    if (!allowed.has(argument) || seen.has(argument)) {
      fail('unknown or duplicate command-line argument.');
    }
    seen.add(argument);
  }
  if (seen.has('--require-auth-v2') && seen.has('--require-auth-v2-enabled')) {
    fail('paused and enabled auth-v2 verification modes are mutually exclusive.');
  }
  const versionedAggregateStages = [
    ['--require-additive-v2-aggregate', PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2],
    ['--require-additive-v3-preseed-aggregate', PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED],
    ['--require-genesis-v3-seeded-empty-aggregate', PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY],
    ['--require-genesis-v3-founded-aggregate', PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED],
    ['--require-genesis-generation-v3-founded-aggregate', PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED],
  ].filter(([flag]) => seen.has(flag));
  if (versionedAggregateStages.length > 1) {
    fail('versioned aggregate verification stages are mutually exclusive.');
  }
  const aggregateStage = versionedAggregateStages[0]?.[1]
    ?? PROTECTED_AGGREGATE_STAGE.LEGACY;
  const requiresFoundedAggregate = seen.has('--require-genesis-v3-founded-aggregate')
    || seen.has('--require-genesis-generation-v3-founded-aggregate');
  const requiresResourceV4ReadyAggregate = seen.has('--require-resource-v4-ready-aggregate');
  if (requiresResourceV4ReadyAggregate && !requiresFoundedAggregate) {
    fail('the resource procedure-v4 ready aggregate requires the founded protocol-v3 aggregate stage.');
  }
  if (requiresFoundedAggregate !== (expectedFounderCount !== undefined)) {
    fail('the founded aggregate stage and expected founder count must be supplied together.');
  }
  if (
    !requiresFoundedAggregate
    && (expectedPlayerCount !== undefined || expectedTermsAcceptanceCount !== undefined)
  ) {
    fail('authenticated count expectations require the founded aggregate stage.');
  }
  if (
    requiresResourceV4ReadyAggregate
    && (expectedPlayerCount === undefined || expectedTermsAcceptanceCount === undefined)
  ) {
    fail('the resource procedure-v4 ready aggregate requires explicit player and Terms acceptance counts.');
  }
  const foundedPlayerCount = expectedPlayerCount ?? 0;
  const foundedTermsAcceptanceCount = expectedTermsAcceptanceCount ?? 0;
  if (
    requiresFoundedAggregate
    && (
      foundedPlayerCount > expectedFounderCount
    )
  ) {
    fail('authenticated count expectations cannot exceed the expected founder count.');
  }
  if (
    foundedTermsAcceptanceCount
      > foundedPlayerCount * MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER
  ) {
    fail('the expected Terms acceptance count exceeds the supported immutable row history.');
  }
  return Object.freeze({
    requireProtectedAggregate: seen.has('--require-protected-aggregate'),
    requireAdditiveV2Aggregate: seen.has('--require-additive-v2-aggregate'),
    requireAdditiveV3PreseedAggregate: seen.has('--require-additive-v3-preseed-aggregate'),
    requireGenesisV3SeededEmptyAggregate: seen.has('--require-genesis-v3-seeded-empty-aggregate'),
    requireGenesisV3FoundedAggregate: requiresFoundedAggregate,
    requireGenesisGenerationV3FoundedAggregate: seen.has(
      '--require-genesis-generation-v3-founded-aggregate',
    ),
    requireResourceV4ReadyAggregate: requiresResourceV4ReadyAggregate,
    expectedFounderCount,
    expectedPlayerCount: foundedPlayerCount,
    expectedTermsAcceptanceCount: foundedTermsAcceptanceCount,
    requireAuthV2: seen.has('--require-auth-v2'),
    requireAuthV2Enabled: seen.has('--require-auth-v2-enabled'),
    aggregateStage,
  });
}

async function main() {
  const {
    requireProtectedAggregate,
    requireAdditiveV2Aggregate,
    requireAdditiveV3PreseedAggregate,
    requireGenesisV3SeededEmptyAggregate,
    requireGenesisV3FoundedAggregate,
    requireGenesisGenerationV3FoundedAggregate,
    requireResourceV4ReadyAggregate,
    expectedFounderCount,
    expectedPlayerCount,
    expectedTermsAcceptanceCount,
    requireAuthV2,
    requireAuthV2Enabled,
    aggregateStage,
  } = parseProductionVerifierArguments();
  const frontend = httpsOrigin(process.env.WARPKEEP_FRONTEND_URL ?? DEFAULT_FRONTEND, 'WARPKEEP_FRONTEND_URL');
  const bridge = httpsOrigin(process.env.WARPKEEP_AUTH_BRIDGE_URL ?? DEFAULT_BRIDGE, 'WARPKEEP_AUTH_BRIDGE_URL');
  const www = httpsOrigin(process.env.WARPKEEP_WWW_URL ?? defaultWwwOrigin(frontend), 'WARPKEEP_WWW_URL');
  const legacyPages = httpsUrl(process.env.WARPKEEP_LEGACY_PAGES_URL ?? DEFAULT_LEGACY_PAGES, 'WARPKEEP_LEGACY_PAGES_URL');
  const expectedDeployedSha = readExpectedDeployedSha();
  if (process.env.WARPKEEP_OIDC_AUDIENCE && process.env.WARPKEEP_OIDC_AUDIENCE !== EXPECTED_AUDIENCE) {
    fail(`WARPKEEP_OIDC_AUDIENCE must be ${EXPECTED_AUDIENCE}.`);
  }
  await verifyFrontend(frontend, expectedDeployedSha);
  await verifyFrontendRedirects(frontend, www, legacyPages);
  await verifyBridge(frontend, bridge, { requireAuthV2, requireAuthV2Enabled });
  if (requireResourceV4ReadyAggregate) {
    verifyPostBackfillResourceAggregateCheckpoints(
      bridge,
      expectedFounderCount,
      expectedPlayerCount,
      expectedTermsAcceptanceCount,
      process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
      spawnSync,
      resolve(dirname(resolve(process.argv[1])), '..'),
      process.env,
      aggregateStage,
    );
  } else {
    verifyProtectedAggregateIfConfigured(
      bridge,
      requireProtectedAggregate
        || requireAdditiveV2Aggregate
        || requireAdditiveV3PreseedAggregate
        || requireGenesisV3SeededEmptyAggregate
        || requireGenesisV3FoundedAggregate
        || requireGenesisGenerationV3FoundedAggregate,
      aggregateStage,
      expectedFounderCount,
      expectedPlayerCount,
      expectedTermsAcceptanceCount,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Alpha production verification failed.');
    process.exitCode = 1;
  });
}
