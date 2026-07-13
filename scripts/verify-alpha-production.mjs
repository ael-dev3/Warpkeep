import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_FRONTEND = 'https://warpkeep.com';
const DEFAULT_BRIDGE = 'https://auth.warpkeep.com';
const DEFAULT_LEGACY_PAGES = 'https://ael-dev3.github.io/Warpkeep/';
const DEFAULT_SPACETIMEDB_URI = 'https://maincloud.spacetimedb.com';
const DEFAULT_SPACETIMEDB_DATABASE = 'warpkeep-89e4u';
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

async function verifyContainedAuthV2Preflight(frontend, bridge, pathname, fetchImpl) {
  const paused = AUTH_V2_PAUSED_PATHS.has(pathname);
  const label = `bridge ${pathname} ${paused ? 'paused check' : 'preflight'}`;
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

async function verifyAuthV2Bridge(frontend, bridge, fetchImpl) {
  const healthResponse = await fetchWithTimeout(`${bridge}/healthz`, {}, fetchImpl);
  verifyAuthV2SecurityHeaders(healthResponse, 'auth-v2 health endpoint');
  const health = await readExactJsonAtStatus(healthResponse, 'auth-v2 health endpoint', 200);
  if (
    !hasExactKeys(health, ['ok', 'service', 'securityProfile', 'publicAuthEnabled'])
    || health.ok !== true
    || health.service !== 'warpkeep-auth-bridge'
    || health.securityProfile !== AUTH_V2_SECURITY_PROFILE
    || health.publicAuthEnabled !== false
  ) {
    fail('auth-v2 health endpoint did not attest the contained Warpkeep security profile.');
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
    await verifyContainedAuthV2Preflight(frontend, bridge, pathname, fetchImpl);
  }

  const adminProbe = await fetchWithTimeout(`${bridge}/v1/admin/token`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type',
    },
  }, fetchImpl);
  verifyAuthV2SecurityHeaders(adminProbe, 'auth-v2 admin browser isolation check');
  verifyNoCors(adminProbe, 'auth-v2 admin browser isolation check');
  const adminProbePayload = await readExactJsonAtStatus(
    adminProbe,
    'auth-v2 admin browser isolation check',
    404,
  );
  verifyExactErrorPayload(
    adminProbePayload,
    'not_found',
    'Route not found.',
    'auth-v2 admin browser isolation check',
  );
  console.log('bridge: contained auth-v2 health, discovery, JWKS, retired v1, security headers, and credentialed CORS verified');
}

export async function verifyBridge(frontend, bridge, options = {}) {
  const { requireAuthV2 = false, fetchImpl = fetch } = options;
  if (requireAuthV2) {
    await verifyAuthV2Bridge(frontend, bridge, fetchImpl);
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

export function protectedAggregateChildArguments(tsxCli, protocolV2 = false) {
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    protocolV2 ? 'inspect-alpha-v2' : 'inspect-alpha',
    '--json',
  ];
}

function verifyProtectedAggregateIfConfigured(bridge, required, protocolV2 = false) {
  const secret = requiredProtectedAggregateSecret(process.env.WARPKEEP_ADMIN_TOKEN_SECRET, required);
  if (!secret) {
    console.log('alpha status: skipped (no local Hermes credential configured)');
    return;
  }
  const repositoryRoot = resolve(dirname(resolve(process.argv[1])), '..');
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = spawnSync(
    process.execPath,
    protectedAggregateChildArguments(tsxCli, protocolV2),
    protectedAggregateChildOptions(repositoryRoot, bridge, secret),
  );
  if (result.error || result.status !== 0 || result.signal) {
    fail('protected aggregate inspection failed.');
  }
  if (protocolV2) verifyExpectedAlphaV2Aggregate(result.stdout);
  else verifyExpectedAlphaAggregate(result.stdout);
  // Never mirror child-process output: even a future Hermes implementation
  // must not cause this verifier to surface a secret, JWT, or identity.
  console.log(protocolV2
    ? 'alpha status: required additive protocol-v2 aggregate state verified'
    : 'alpha status: required empty aggregate state verified');
}

export function parseProductionVerifierArguments(arguments_ = process.argv.slice(2)) {
  const allowed = new Set([
    '--require-protected-aggregate',
    '--require-additive-v2-aggregate',
    '--require-auth-v2',
  ]);
  const seen = new Set();
  for (const argument of arguments_) {
    if (!allowed.has(argument) || seen.has(argument)) {
      fail('unknown or duplicate command-line argument.');
    }
    seen.add(argument);
  }
  return Object.freeze({
    requireProtectedAggregate: seen.has('--require-protected-aggregate'),
    requireAdditiveV2Aggregate: seen.has('--require-additive-v2-aggregate'),
    requireAuthV2: seen.has('--require-auth-v2'),
  });
}

async function main() {
  const {
    requireProtectedAggregate,
    requireAdditiveV2Aggregate,
    requireAuthV2,
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
  await verifyBridge(frontend, bridge, { requireAuthV2 });
  verifyProtectedAggregateIfConfigured(
    bridge,
    requireProtectedAggregate || requireAdditiveV2Aggregate,
    requireAdditiveV2Aggregate,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Alpha production verification failed.');
    process.exitCode = 1;
  });
}
