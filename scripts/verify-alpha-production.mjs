import { spawnSync } from 'node:child_process';

const DEFAULT_FRONTEND = 'https://warpkeep.com';
const DEFAULT_BRIDGE = 'https://auth.warpkeep.com';
const EXPECTED_AUDIENCE = 'warpkeep-spacetimedb';
const REQUEST_TIMEOUT_MS = 10_000;

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

async function readJson(response, label) {
  if (!response.ok) {
    fail(`${label} returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    fail(`${label} did not return JSON.`);
  }
}

async function verifyFrontend(frontend) {
  const response = await fetchWithTimeout(`${frontend}/`);
  if (response.status !== 200) {
    fail(`frontend returned HTTP ${response.status}.`);
  }
  const html = await response.text();
  if (!html.includes('https://warpkeep.com/')) {
    fail('frontend is missing the canonical warpkeep.com metadata.');
  }
  console.log('frontend: reachable with canonical metadata');
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
    || typeof key?.d !== 'undefined'
  ) {
    fail('JWKS contains an invalid or private signing key.');
  }

  const preflight = await fetchWithTimeout(`${bridge}/v1/farcaster/challenge`, {
    method: 'OPTIONS',
    headers: {
      origin: frontend,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  if (
    preflight.status !== 204
    || preflight.headers.get('access-control-allow-origin') !== frontend
  ) {
    fail('bridge challenge CORS does not allow only the canonical frontend.');
  }

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
  console.log('bridge: health, discovery, JWKS, and CORS verified');
}

function verifyProtectedAggregateIfConfigured() {
  if (!process.env.WARPKEEP_ADMIN_TOKEN_SECRET) {
    console.log('alpha status: skipped (no local Hermes credential configured)');
    return;
  }
  const tsx = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const result = spawnSync(tsx, ['scripts/hermes-admin.ts', 'inspect-alpha'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    fail('protected aggregate inspection failed.');
  }
  // Hermes intentionally prints only the target and aggregate status; never
  // mirror its output here because it could change independently.
  console.log('alpha status: protected aggregate inspection passed');
}

async function main() {
  const frontend = httpsOrigin(process.env.WARPKEEP_FRONTEND_URL ?? DEFAULT_FRONTEND, 'WARPKEEP_FRONTEND_URL');
  const bridge = httpsOrigin(process.env.WARPKEEP_AUTH_BRIDGE_URL ?? DEFAULT_BRIDGE, 'WARPKEEP_AUTH_BRIDGE_URL');
  if (process.env.WARPKEEP_OIDC_AUDIENCE && process.env.WARPKEEP_OIDC_AUDIENCE !== EXPECTED_AUDIENCE) {
    fail(`WARPKEEP_OIDC_AUDIENCE must be ${EXPECTED_AUDIENCE}.`);
  }
  await verifyFrontend(frontend);
  await verifyBridge(frontend, bridge);
  verifyProtectedAggregateIfConfigured();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Alpha production verification failed.');
  process.exitCode = 1;
});
