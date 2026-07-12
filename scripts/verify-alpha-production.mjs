import { spawnSync } from 'node:child_process';

const DEFAULT_FRONTEND = 'https://warpkeep.com';
const DEFAULT_BRIDGE = 'https://auth.warpkeep.com';
const DEFAULT_LEGACY_PAGES = 'https://ael-dev3.github.io/Warpkeep/';
const EXPECTED_AUDIENCE = 'warpkeep-spacetimedb';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DOCUMENT_BYTES = 1_000_000;
const MAX_ASSET_BYTES = 16_000_000;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const EXPECTED_ALPHA_AGGREGATE = Object.freeze({
  worldTiles: 61n,
  allowedFids: 0n,
  enabledAllowedFids: 0n,
  players: 0n,
  castles: 0n,
});

function fail(message) {
  throw new Error(`Alpha production verification failed: ${message}`);
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

async function fetchWithTimeout(url, init = {}) {
  try {
    return await fetch(url, {
      redirect: 'manual',
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
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    fail(`${label} did not return JSON.`);
  }
  try {
    return JSON.parse(await readBoundedText(response, label, MAX_DOCUMENT_BYTES));
  } catch {
    fail(`${label} did not return JSON.`);
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

function rootAssetUrls(html, frontend) {
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
  }

  if (moduleScriptCount === 0 || assets.size === 0) {
    fail('frontend document is missing root-base application assets.');
  }
  return [...assets.values()];
}

async function verifyRootAsset(assetUrl, expectedDeployedSha) {
  const response = await fetchWithTimeout(assetUrl.href);
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
  const bytes = await readBoundedBytes(response, `frontend asset ${assetUrl.pathname}`, MAX_ASSET_BYTES);
  if (bytes.byteLength === 0) fail(`frontend asset ${assetUrl.pathname} was empty.`);

  const isJavaScript = /\.m?js$/i.test(assetUrl.pathname);
  return isJavaScript && expectedDeployedSha
    ? new TextDecoder().decode(bytes).toLowerCase().includes(expectedDeployedSha)
    : false;
}

async function verifyFrontend(frontend, expectedDeployedSha) {
  const response = await fetchWithTimeout(rootUrl(frontend));
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
  const shaMatches = await Promise.all(assets.map(asset => verifyRootAsset(asset, expectedDeployedSha)));
  if (expectedDeployedSha && !shaMatches.some(Boolean)) {
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

async function verifyBridgePreflight(bridge, frontend, pathname) {
  const preflight = await fetchWithTimeout(`${bridge}${pathname}`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
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
  });
  if (hostilePreflight.headers.has('access-control-allow-origin')) {
    fail(`bridge ${pathname} exposed browser CORS to an untrusted origin.`);
  }
}

async function verifyBridge(frontend, bridge) {
  const health = await readJson(await fetchWithTimeout(`${bridge}/healthz`), 'health endpoint');
  if (health?.ok !== true || health?.service !== 'warpkeep-auth-bridge') {
    fail('health endpoint did not identify the Warpkeep bridge.');
  }

  const discovery = await readJson(
    await fetchWithTimeout(`${bridge}/.well-known/openid-configuration`),
    'OIDC discovery'
  );
  if (discovery?.issuer !== bridge || discovery?.jwks_uri !== `${bridge}/.well-known/jwks.json`) {
    fail('OIDC discovery does not match the bridge origin.');
  }
  if (!Array.isArray(discovery?.id_token_signing_alg_values_supported)
    || !discovery.id_token_signing_alg_values_supported.includes('ES256')) {
    fail('OIDC discovery does not advertise ES256.');
  }

  const jwks = await readJson(await fetchWithTimeout(discovery.jwks_uri), 'JWKS endpoint');
  if (!Array.isArray(jwks?.keys) || jwks.keys.length !== 1) {
    fail('JWKS must contain exactly one active public signing key.');
  }
  const key = jwks.keys[0];
  if (
    key?.kty !== 'EC'
    || key?.crv !== 'P-256'
    || key?.alg !== 'ES256'
    || typeof key?.kid !== 'string'
    || key.kid.length === 0
    || typeof key?.x !== 'string'
    || typeof key?.y !== 'string'
    || typeof key?.d !== 'undefined'
  ) {
    fail('JWKS contains an invalid or private signing key.');
  }

  await verifyBridgePreflight(bridge, frontend, '/v1/farcaster/challenge');
  await verifyBridgePreflight(bridge, frontend, '/v1/farcaster/exchange');

  const adminProbe = await fetchWithTimeout(`${bridge}/v1/admin/token`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
    },
  });
  if (adminProbe.headers.has('access-control-allow-origin')) {
    fail('admin token endpoint exposed browser CORS.');
  }
  console.log('bridge: health, discovery, JWKS, and strict CORS verified');
}

function readAggregateCount(value, label) {
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  fail(`protected aggregate ${label} was invalid.`);
}

function verifyExpectedAlphaAggregate(output) {
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('protected aggregate inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('protected aggregate inspection returned an invalid status object.');
  }
  for (const [field, expected] of Object.entries(EXPECTED_ALPHA_AGGREGATE)) {
    if (readAggregateCount(status[field], field) !== expected) {
      fail(`protected aggregate ${field} did not match the required empty-alpha state.`);
    }
  }
}

function verifyProtectedAggregateIfConfigured() {
  if (!process.env.WARPKEEP_ADMIN_TOKEN_SECRET) {
    console.log('alpha status: skipped (no local Hermes credential configured)');
    return;
  }
  const tsx = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const result = spawnSync(tsx, ['scripts/hermes-admin.ts', 'inspect-alpha', '--json'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: MAX_DOCUMENT_BYTES,
    timeout: 30_000,
    killSignal: 'SIGTERM',
  });
  if (result.error || result.status !== 0 || result.signal) {
    fail('protected aggregate inspection failed.');
  }
  verifyExpectedAlphaAggregate(result.stdout);
  // Never mirror child-process output: even a future Hermes implementation
  // must not cause this verifier to surface a secret, JWT, or identity.
  console.log('alpha status: required empty aggregate state verified');
}

async function main() {
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
  await verifyBridge(frontend, bridge);
  verifyProtectedAggregateIfConfigured();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Alpha production verification failed.');
  process.exitCode = 1;
});
