const EXPECTED_CANONICAL_ORIGIN = 'https://warpkeep.com';
const EXPECTED_REPOSITORY_URL = 'https://github.com/ael-dev3/Warpkeep';
const EXPECTED_AUDIENCE = 'warpkeep-spacetimedb';
const EXPECTED_BRIDGE = 'https://auth.warpkeep.com';
const EXPECTED_SPACETIMEDB_URI = 'https://maincloud.spacetimedb.com';
const EXPECTED_SPACETIMEDB_DATABASE = 'warpkeep-89e4u';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function fail(message) {
  throw new Error(`Pages deployment configuration is invalid: ${message}`);
}

function exactHttpsOrigin(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} is required when shared alpha is enabled.`);
  }

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

function exactBoolean(value, label) {
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  fail(`${label} must be exactly true or false.`);
}

function main() {
  if (process.env.DEPLOY_BASE !== '/') {
    fail('DEPLOY_BASE must be /.');
  }
  if (process.env.VITE_WARPKEEP_RELEASE_CHANNEL !== 'alpha') {
    fail('VITE_WARPKEEP_RELEASE_CHANNEL must be alpha.');
  }
  if (!SHA_PATTERN.test(process.env.VITE_WARPKEEP_BUILD_SHA ?? '')) {
    fail('VITE_WARPKEEP_BUILD_SHA must be the full Git commit SHA.');
  }
  if (process.env.VITE_WARPKEEP_REPOSITORY_URL !== EXPECTED_REPOSITORY_URL) {
    fail('VITE_WARPKEEP_REPOSITORY_URL must identify the Warpkeep repository.');
  }
  if (process.env.VITE_WARPKEEP_CANONICAL_ORIGIN !== EXPECTED_CANONICAL_ORIGIN) {
    fail('VITE_WARPKEEP_CANONICAL_ORIGIN must be https://warpkeep.com.');
  }

  const sharedAlphaEnabled = exactBoolean(
    process.env.VITE_WARPKEEP_SHARED_ALPHA_ENABLED,
    'VITE_WARPKEEP_SHARED_ALPHA_ENABLED'
  );
  if (!sharedAlphaEnabled) {
    console.log('Pages deployment validation passed with shared alpha disabled.');
    return;
  }

  const bridge = exactHttpsOrigin(
    process.env.VITE_WARPKEEP_AUTH_BRIDGE_URL,
    'VITE_WARPKEEP_AUTH_BRIDGE_URL'
  );
  const issuer = exactHttpsOrigin(
    process.env.VITE_WARPKEEP_OIDC_ISSUER,
    'VITE_WARPKEEP_OIDC_ISSUER'
  );
  if (bridge !== EXPECTED_BRIDGE || issuer !== EXPECTED_BRIDGE) {
    fail(`the bridge URL and OIDC issuer must both be ${EXPECTED_BRIDGE}.`);
  }
  if (process.env.VITE_WARPKEEP_OIDC_AUDIENCE !== EXPECTED_AUDIENCE) {
    fail(`VITE_WARPKEEP_OIDC_AUDIENCE must be ${EXPECTED_AUDIENCE}.`);
  }
  if (process.env.VITE_SPACETIMEDB_URI !== EXPECTED_SPACETIMEDB_URI) {
    fail(`VITE_SPACETIMEDB_URI must be ${EXPECTED_SPACETIMEDB_URI}.`);
  }
  if (process.env.VITE_SPACETIMEDB_DATABASE !== EXPECTED_SPACETIMEDB_DATABASE) {
    fail(`VITE_SPACETIMEDB_DATABASE must be ${EXPECTED_SPACETIMEDB_DATABASE}.`);
  }

  console.log('Pages deployment validation passed with shared alpha enabled.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Pages deployment configuration is invalid.');
  process.exitCode = 1;
}
