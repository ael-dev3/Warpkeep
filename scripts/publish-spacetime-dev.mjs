import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const database = process.env.WARPKEEP_SPACETIMEDB_DATABASE || 'warpkeep-89e4u';
const configuredIssuer = process.env.WARPKEEP_OIDC_ISSUER;
const sourceConfigPath = join(repositoryRoot, 'spacetimedb', 'src', 'config.ts');
const command = process.env.SPACETIME_BIN || 'spacetime';
const MAX_OIDC_DOCUMENT_BYTES = 64 * 1_024;
const OIDC_REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const PUBLISH_TIMEOUT_MILLISECONDS = 2 * 60 * 1_000;
const PUBLISH_KILL_GRACE_MILLISECONDS = 5_000;
// A P-256 coordinate is exactly 32 bytes. The final base64url character must
// have zero padding bits, preventing alternate encodings of the same point.
const JWK_COORDINATE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const JWK_KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const PUBLISH_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
  'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
]);

class SafePublishError extends Error {}

function fail(message) {
  throw new SafePublishError(message);
}

function requireHttpsOrigin(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} is required.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a stable public HTTPS origin.`);
  }
  if (url.protocol !== 'https:' || url.origin !== value || url.hostname.endsWith('.invalid')) {
    fail(`${label} must be a stable public HTTPS origin.`);
  }
  return url.origin;
}

async function readBoundedJson(response, label) {
  if (!response.ok) fail(`${label} is not reachable without redirects.`);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) {
    fail(`${label} did not return exact JSON.`);
  }
  const advertisedLength = response.headers.get('content-length');
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_OIDC_DOCUMENT_BYTES)) {
    fail(`${label} exceeded the response limit.`);
  }
  if (!response.body) fail(`${label} returned no response body.`);

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OIDC_DOCUMENT_BYTES) {
        try { await reader.cancel(); } catch { /* The bounded rejection remains generic. */ }
        exceededLimit = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    fail(`${label} returned an invalid response body.`);
  } finally {
    try { reader.releaseLock(); } catch { /* No response detail may escape. */ }
  }
  if (exceededLimit) fail(`${label} exceeded the response limit.`);

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} returned invalid JSON.`);
  }
}

async function fetchOidcDocument(url, label, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MILLISECONDS),
      headers: { accept: 'application/json' },
    });
  } catch {
    fail(`${label} is not reachable without redirects.`);
  }
  return readBoundedJson(response, label);
}

export async function validateIssuerDeployment(issuer, fetchImpl = fetch) {
  const configuration = await fetchOidcDocument(
    `${issuer}/.well-known/openid-configuration`,
    'OIDC discovery',
    fetchImpl,
  );
  if (
    !configuration
    || typeof configuration !== 'object'
    || configuration.issuer !== issuer
    || configuration.jwks_uri !== `${issuer}/.well-known/jwks.json`
    || !Array.isArray(configuration.id_token_signing_alg_values_supported)
    || !configuration.id_token_signing_alg_values_supported.includes('ES256')
  ) {
    fail('OIDC discovery does not describe the configured issuer and ES256 contract.');
  }
  const document = await fetchOidcDocument(configuration.jwks_uri, 'OIDC JWKS', fetchImpl);
  if (
    !Array.isArray(document?.keys)
    || document.keys.length !== 1
    || document.keys.some(key => (
      !key
      || typeof key !== 'object'
      || 'd' in key
      || key.kty !== 'EC'
      || key.crv !== 'P-256'
      || key.alg !== 'ES256'
      || key.use !== 'sig'
      || typeof key.kid !== 'string' || !JWK_KEY_ID.test(key.kid)
      || typeof key.x !== 'string' || !JWK_COORDINATE.test(key.x)
      || typeof key.y !== 'string' || !JWK_COORDINATE.test(key.y)
    ))
  ) {
    fail('OIDC JWKS is missing one exact public-only ES256 signing key.');
  }
  try {
    await crypto.subtle.importKey(
      'jwk',
      document.keys[0],
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    fail('OIDC JWKS is missing one usable public-only ES256 signing key.');
  }
}

export function publishChildEnvironment(source = process.env) {
  return Object.freeze(Object.fromEntries(
    PUBLISH_CHILD_ENVIRONMENT_KEYS
      .filter((key) => typeof source[key] === 'string' && source[key].length > 0)
      .map((key) => [key, source[key]]),
  ));
}

export async function publishModule(
  spacetimeCommand,
  targetDatabase,
  spawnProcess = spawn,
) {
  const arguments_ = [
    'publish',
    '--server', 'maincloud',
    '--module-path', 'spacetimedb',
    '--delete-data=never',
    '--yes=remote',
    targetDatabase,
  ];
  await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timedOut = false;
    let deadline;
    let forcedKill;
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      if (forcedKill !== undefined) clearTimeout(forcedKill);
      callback();
    };

    let child;
    try {
      child = spawnProcess(spacetimeCommand, arguments_, {
        cwd: repositoryRoot,
        stdio: 'inherit',
        // The CLI uses local config/Home and standard network settings. It
        // never receives ambient Warpkeep signing, admin, RPC, or review data.
        env: publishChildEnvironment(),
      });
    } catch (error) {
      settle(() => rejectPromise(error));
      return;
    }
    child.on('error', (error) => {
      // A signal-delivery error can arrive after the deadline. Keep the forced
      // SIGKILL timer alive in that case instead of abandoning the child. Keep
      // this listener installed so a second kill-delivery error is not emitted
      // as an unhandled EventEmitter error after forced settlement.
      if (!timedOut) settle(() => rejectPromise(error));
    });
    child.once('close', (code) => settle(() => {
      if (!timedOut && code === 0) resolvePromise();
      else rejectPromise(new Error('SpacetimeDB publish did not complete successfully.'));
    }));

    deadline = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* Fall through to the forced deadline. */ }
      forcedKill = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* The outcome remains indeterminate. */ }
        // Do not wait indefinitely for a child that ignores termination or
        // withholds its close event. The CLI outcome must be inspected before
        // any operator retries the publish.
        settle(() => rejectPromise(new Error('SpacetimeDB publish exceeded its hard deadline.')));
      }, PUBLISH_KILL_GRACE_MILLISECONDS);
    }, PUBLISH_TIMEOUT_MILLISECONDS);
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) {
    fail('WARPKEEP_SPACETIMEDB_DATABASE is invalid.');
  }
  const issuer = requireHttpsOrigin(configuredIssuer, 'WARPKEEP_OIDC_ISSUER');
  const sourceConfig = await readFile(sourceConfigPath, 'utf8');
  const sourceMatch = sourceConfig.match(/^export const WARPKEEP_OIDC_ISSUER\s*=\s*'([^']+)';\s*$/m);
  if (!sourceMatch || sourceMatch[1] !== issuer) {
    fail('The module source issuer must exactly match WARPKEEP_OIDC_ISSUER before publishing.');
  }
  if (dryRun) {
    await validateIssuerDeployment(issuer);
    console.log(`Dry run: verified ${issuer}; would publish ${database} without deleting data.`);
    return;
  }
  if (process.env.WARPKEEP_PUBLISH_CONFIRM !== database) {
    fail(`Set WARPKEEP_PUBLISH_CONFIRM=${database} after reviewing the target database; publish was not attempted.`);
  }

  await validateIssuerDeployment(issuer);
  await publishModule(command, database);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof SafePublishError
      ? error.message
      : 'Non-destructive publish did not complete. The outcome may be indeterminate; inspect Maincloud before retrying.');
    process.exitCode = 1;
  });
}
