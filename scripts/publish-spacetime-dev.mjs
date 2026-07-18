import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, accessSync, closeSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PROTECTED_AGGREGATE_STAGE,
  protectedAggregateChildArguments,
  resourceV4AggregateChildArguments,
  verifyExpectedAlphaV3Aggregate,
  verifyExpectedAlphaV4ResourcePrebackfillAggregate,
  verifyExpectedAlphaV4ResourceReadyAggregate,
} from './verify-alpha-production.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_DATABASE = 'warpkeep-89e4u';
const CANONICAL_DATABASE_IDENTITY = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const CANONICAL_MAINCLOUD_URI = 'https://maincloud.spacetimedb.com';
const CANONICAL_BRIDGE = 'https://auth.warpkeep.com';
const PROVEN_ARTIFACT_PATH = resolve(repositoryRoot, 'spacetimedb', 'dist', 'bundle.js');
const database = process.env.WARPKEEP_SPACETIMEDB_DATABASE || CANONICAL_DATABASE;
const configuredIssuer = process.env.WARPKEEP_OIDC_ISSUER;
const sourceConfigPath = join(repositoryRoot, 'spacetimedb', 'src', 'config.ts');
const command = process.env.SPACETIME_BIN || 'spacetime';
const EXPECTED_CLI_VERSION = '2.6.1';
const EXPECTED_CLI_COMMIT = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const EXPECTED_CLI_BINARY_SHA256 = Object.freeze({
  'darwin-arm64': '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
});
const MAX_CHILD_OUTPUT_BYTES = 1_000_000;
const PREFLIGHT_TIMEOUT_MILLISECONDS = 3 * 60 * 1_000;
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
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
]);

export const RESOURCE_PUBLISH_ROLLOUT_STAGE = Object.freeze({
  PREBACKFILL: 'prebackfill',
  READY: 'ready',
});
export const GENESIS_WORLD_PUBLISH_STAGE = Object.freeze({
  PRE_EXPANSION: 'pre-expansion',
  EXPANDED: 'expanded',
});

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

export function parsePublishArguments(arguments_ = process.argv.slice(2)) {
  let dryRun = false;
  let resourceRolloutStage;
  let genesisWorldRolloutStage;
  for (const argument of arguments_) {
    if (argument === '--dry-run' && !dryRun) {
      dryRun = true;
      continue;
    }
    if (
      argument.startsWith('--resource-rollout-stage=')
      && resourceRolloutStage === undefined
    ) {
      const value = argument.slice('--resource-rollout-stage='.length);
      if (Object.values(RESOURCE_PUBLISH_ROLLOUT_STAGE).includes(value)) {
        resourceRolloutStage = value;
        continue;
      }
    }
    if (
      argument.startsWith('--genesis-world-stage=')
      && genesisWorldRolloutStage === undefined
    ) {
      const value = argument.slice('--genesis-world-stage='.length);
      if (Object.values(GENESIS_WORLD_PUBLISH_STAGE).includes(value)) {
        genesisWorldRolloutStage = value;
        continue;
      }
    }
    fail('Usage: publish-spacetime-dev.mjs [--dry-run] --resource-rollout-stage=<prebackfill|ready> --genesis-world-stage=<pre-expansion|expanded>. Unknown or duplicate arguments are rejected.');
  }
  if (resourceRolloutStage === undefined) {
    fail('An explicit resource rollout stage is required: prebackfill for the first additive publication or ready for an already-backfilled republish.');
  }
  if (genesisWorldRolloutStage === undefined) {
    fail('An explicit Genesis world stage is required: pre-expansion for the exact 1,261-cell predecessor or expanded for the exact 10,000-cell target.');
  }
  return Object.freeze({ dryRun, resourceRolloutStage, genesisWorldRolloutStage });
}

export function requireCanonicalPublishCoordinates(source = process.env) {
  if (
    (source.WARPKEEP_SPACETIMEDB_DATABASE ?? CANONICAL_DATABASE) !== CANONICAL_DATABASE
    || (source.WARPKEEP_SPACETIMEDB_URI ?? CANONICAL_MAINCLOUD_URI) !== CANONICAL_MAINCLOUD_URI
  ) {
    fail('The production publisher is pinned to the canonical existing Warpkeep database.');
  }
}

function validateFoundedPublishExpectations(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Object.keys(value).sort().join(',') !== [
      'expectedFounderCount',
      'expectedPlayerCount',
      'expectedTermsAcceptanceCount',
    ].sort().join(',')
  ) {
    fail('Exact founded protocol-v3 publication expectations are required.');
  }
  const {
    expectedFounderCount,
    expectedPlayerCount,
    expectedTermsAcceptanceCount,
  } = value;
  if (
    !Number.isSafeInteger(expectedFounderCount)
    || expectedFounderCount < 1
    || expectedFounderCount > 100
    || !Number.isSafeInteger(expectedPlayerCount)
    || expectedPlayerCount < 0
    || expectedPlayerCount > expectedFounderCount
    || !Number.isSafeInteger(expectedTermsAcceptanceCount)
    || expectedTermsAcceptanceCount < 0
    || expectedTermsAcceptanceCount > expectedPlayerCount
  ) {
    fail('Founded protocol-v3 publication expectations were invalid.');
  }
  return Object.freeze({
    expectedFounderCount,
    expectedPlayerCount,
    expectedTermsAcceptanceCount,
  });
}

export function readFoundedPublishExpectations(source = process.env) {
  const readCount = (key, minimum) => {
    const value = source[key];
    const pattern = minimum === 1
      ? /^(?:[1-9]|[1-9]\d|100)$/
      : /^(?:0|[1-9]|[1-9]\d|100)$/;
    if (typeof value !== 'string' || !pattern.test(value)) {
      fail(`${key} must be a canonical integer from ${minimum} through 100.`);
    }
    return Number(value);
  };
  return validateFoundedPublishExpectations({
    expectedFounderCount: readCount('WARPKEEP_EXPECTED_FOUNDER_COUNT', 1),
    expectedPlayerCount: readCount('WARPKEEP_EXPECTED_PLAYER_COUNT', 0),
    expectedTermsAcceptanceCount: readCount(
      'WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT',
      0,
    ),
  });
}

function foundedAggregateStageForWorldStage(genesisWorldRolloutStage) {
  if (genesisWorldRolloutStage === GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION) {
    return PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED;
  }
  if (genesisWorldRolloutStage === GENESIS_WORLD_PUBLISH_STAGE.EXPANDED) {
    return PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED;
  }
  fail('The Genesis world publication stage was invalid.');
}

function resolveExecutablePath(executable, environment) {
  const candidates = isAbsolute(executable) || executable.includes('/')
    ? [resolve(executable)]
    : (environment.PATH ?? '').split(delimiter).filter(Boolean).map(entry => join(entry, executable));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Continue until the exact executable is found or fail generically.
    }
  }
  fail('The pinned SpacetimeDB CLI executable was not found.');
}

function runBoundedSync(executable, arguments_, options, spawnSyncProcess = spawnSync) {
  const result = spawnSyncProcess(executable, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: publishChildEnvironment(),
    input: '',
    maxBuffer: MAX_CHILD_OUTPUT_BYTES,
    timeout: PREFLIGHT_TIMEOUT_MILLISECONDS,
    killSignal: 'SIGKILL',
    ...options,
  });
  if (result.error || result.status !== 0 || result.signal) {
    fail('A bounded publication preflight failed. No publish was attempted.');
  }
  return result;
}

export function verifyPinnedCliAttestation(versionOutput, digest, platform = process.platform, arch = process.arch) {
  if (
    typeof versionOutput !== 'string'
    || !versionOutput.includes(`spacetimedb tool version ${EXPECTED_CLI_VERSION};`)
    || !versionOutput.includes(`Commit: ${EXPECTED_CLI_COMMIT}`)
  ) {
    fail('The exact reviewed SpacetimeDB CLI version was not active.');
  }
  const expectedDigest = EXPECTED_CLI_BINARY_SHA256[`${platform}-${arch}`];
  if (typeof expectedDigest !== 'string' || digest !== expectedDigest) {
    fail('The exact reviewed SpacetimeDB CLI binary was not active on this platform.');
  }
}

export function attestPinnedSpacetimeCli(
  executable,
  spawnSyncProcess = spawnSync,
  sourceEnvironment = process.env,
) {
  const environment = publishChildEnvironment(sourceEnvironment);
  const executablePath = resolveExecutablePath(executable, environment);
  const digest = createHash('sha256').update(readFileSync(executablePath)).digest('hex');
  const result = runBoundedSync(
    executablePath,
    ['--version'],
    { env: environment, timeout: 10_000 },
    spawnSyncProcess,
  );
  verifyPinnedCliAttestation(result.stdout, digest);
  return executablePath;
}

export function verifyCanonicalDatabaseList(output) {
  if (typeof output !== 'string') fail('The canonical database identity could not be verified.');
  const normalized = output.replace(/\u001b\[[0-9;]*m/g, '');
  const exactEntry = new RegExp(
    `^${CANONICAL_DATABASE}\\s+\\|\\s+${CANONICAL_DATABASE_IDENTITY}$`,
  );
  const matches = normalized.split(/\r?\n/).filter(line => (
    exactEntry.test(line.trim())
  ));
  if (matches.length !== 1) {
    fail('The canonical existing Warpkeep database identity could not be verified.');
  }
}

export function attestCanonicalDatabase(executable, spawnSyncProcess = spawnSync) {
  const result = runBoundedSync(executable, [
    'list',
    '--server', CANONICAL_MAINCLOUD_URI,
    '--yes',
  ], {}, spawnSyncProcess);
  verifyCanonicalDatabaseList(result.stdout);
}

function digestArtifact(artifactPath) {
  let descriptor;
  try {
    descriptor = openSync(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) {
      fail('The proven SpacetimeDB artifact was not a regular file.');
    }
    return createHash('sha256').update(readFileSync(descriptor)).digest('hex');
  } catch (error) {
    if (error instanceof SafePublishError) throw error;
    fail('The proven SpacetimeDB artifact could not be read.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function verifyMigrationArtifactReceipt(receipt) {
  if (
    receipt === null
    || typeof receipt !== 'object'
    || Object.keys(receipt).sort().join(',') !== 'artifactDigest,artifactPath'
    || receipt.artifactPath !== PROVEN_ARTIFACT_PATH
    || !/^[0-9a-f]{64}$/.test(receipt.artifactDigest ?? '')
  ) {
    fail('The additive migration proof artifact receipt was invalid.');
  }
  const currentDigest = digestArtifact(receipt.artifactPath);
  if (currentDigest !== receipt.artifactDigest) {
    fail('The proven SpacetimeDB artifact changed after migration verification.');
  }
  return Object.freeze({
    artifactPath: receipt.artifactPath,
    artifactDigest: receipt.artifactDigest,
  });
}

export function parseMigrationProofReceipt(output) {
  if (typeof output !== 'string') {
    fail('The current additive migration proof did not produce its exact success receipt.');
  }
  const successLines = output.split(/\r?\n/).filter(line => (
    line.startsWith('Additive protocol-v4 migration proof passed with SpacetimeDB 2.6.1:')
  ));
  const digestMatches = [...output.matchAll(/\bartifact_sha256=([0-9a-f]{64})(?=\s|$)/g)];
  if (
    successLines.length !== 1
    || digestMatches.length !== 1
    || !successLines[0].endsWith(`artifact_sha256=${digestMatches[0][1]}`)
  ) {
    fail('The current additive migration proof did not produce its exact success receipt.');
  }
  return verifyMigrationArtifactReceipt({
    artifactPath: PROVEN_ARTIFACT_PATH,
    artifactDigest: digestMatches[0][1],
  });
}

export function runCurrentAdditiveMigrationProof(executable, spawnSyncProcess = spawnSync) {
  const result = runBoundedSync(process.execPath, [
    'scripts/verify-spacetime-additive-migration.mjs',
  ], {
    env: {
      ...publishChildEnvironment(),
      SPACETIME_BIN: executable,
    },
  }, spawnSyncProcess);
  return parseMigrationProofReceipt(result.stdout);
}

export function verifyFreshFoundedProtocolV3Aggregate(
  secret,
  expectations,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
) {
  const exactExpectations = validateFoundedPublishExpectations(expectations);
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh protected preflight.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const aggregateStage = foundedAggregateStageForWorldStage(genesisWorldRolloutStage);
  const result = runBoundedSync(
    process.execPath,
    protectedAggregateChildArguments(tsxCli, aggregateStage),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        // Inspect the same immutable identity passed to `spacetime publish`.
        // The human-readable database name is mutable after its list attestation
        // and therefore cannot be the final data-state authorization boundary.
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  verifyExpectedAlphaV3Aggregate(
    result.stdout,
    aggregateStage,
    exactExpectations.expectedFounderCount,
    exactExpectations.expectedPlayerCount,
    exactExpectations.expectedTermsAcceptanceCount,
  );
}

export function verifyFreshResourceProtocolV4PrebackfillAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh protected resource checkpoint.');
  }
  if (!Number.isSafeInteger(expectedFounderCount) || expectedFounderCount < 1 || expectedFounderCount > 100) {
    fail('The resource checkpoint expected founder count was invalid.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = runBoundedSync(
    process.execPath,
    resourceV4AggregateChildArguments(tsxCli),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  verifyExpectedAlphaV4ResourcePrebackfillAggregate(result.stdout, expectedFounderCount);
}

export function verifyFreshResourceProtocolV4ReadyAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh protected resource checkpoint.');
  }
  if (!Number.isSafeInteger(expectedFounderCount) || expectedFounderCount < 1 || expectedFounderCount > 100) {
    fail('The resource checkpoint expected founder count was invalid.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = runBoundedSync(
    process.execPath,
    resourceV4AggregateChildArguments(tsxCli),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  verifyExpectedAlphaV4ResourceReadyAggregate(result.stdout, expectedFounderCount);
}

export function verifyPostPublishFoundedProtocolV3Aggregate(
  secret,
  expectations,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
) {
  try {
    verifyFreshFoundedProtocolV3Aggregate(
      secret,
      expectations,
      spawnSyncProcess,
      genesisWorldRolloutStage,
    );
  } catch {
    // Publication has already returned success. Never surface a preflight-style
    // "no publish attempted" message or invite an unsafe retry when only the
    // bounded post-publication inspection failed.
    fail('Post-publication protocol-v3 verification is indeterminate; a fresh read-only inspection is required before any backfill or further publication decision.');
  }
}

export function verifyPostPublishResourceProtocolV4PrebackfillAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  try {
    verifyFreshResourceProtocolV4PrebackfillAggregate(
      secret,
      expectedFounderCount,
      spawnSyncProcess,
    );
  } catch {
    // The module is already published. The operator must establish state with
    // a fresh bounded read-only inspection; neither backfill nor another
    // publication attempt is safe to suggest from this indeterminate point.
    fail('Post-publication resource procedure-v4 checkpoint is indeterminate; a fresh read-only inspection is required before any backfill or further publication decision.');
  }
}

export function verifyPostPublishResourceProtocolV4ReadyAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  try {
    verifyFreshResourceProtocolV4ReadyAggregate(
      secret,
      expectedFounderCount,
      spawnSyncProcess,
    );
  } catch {
    fail('Post-publication ready resource procedure-v4 checkpoint is indeterminate; a fresh read-only inspection is required before any further publication decision.');
  }
}

export function verifyPostPublishResourcePublicationCheckpoints(
  secret,
  expectations,
  resourceRolloutStage,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
) {
  const exactExpectations = validateFoundedPublishExpectations(expectations);
  if (!Object.values(RESOURCE_PUBLISH_ROLLOUT_STAGE).includes(resourceRolloutStage)) {
    fail('The post-publication resource rollout stage was invalid.');
  }
  verifyPostPublishFoundedProtocolV3Aggregate(
    secret,
    exactExpectations,
    spawnSyncProcess,
    genesisWorldRolloutStage,
  );
  if (resourceRolloutStage === RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL) {
    verifyPostPublishResourceProtocolV4PrebackfillAggregate(
      secret,
      exactExpectations.expectedFounderCount,
      spawnSyncProcess,
    );
  } else {
    verifyPostPublishResourceProtocolV4ReadyAggregate(
      secret,
      exactExpectations.expectedFounderCount,
      spawnSyncProcess,
    );
  }
}

export async function publishModule(
  spacetimeCommand,
  targetDatabase,
  artifactReceipt,
  spawnProcess = spawn,
) {
  if (targetDatabase !== CANONICAL_DATABASE_IDENTITY) {
    fail('The production publish target was not the pinned canonical database identity.');
  }
  const artifact = verifyMigrationArtifactReceipt(artifactReceipt);
  const arguments_ = [
    'publish',
    '--server', CANONICAL_MAINCLOUD_URI,
    '--js-path', artifact.artifactPath,
    '--delete-data=never',
    '--yes=remote',
    '--no-config',
    targetDatabase,
  ];
  await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    let outputBytes = 0;
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
        // A compatibility or break-clients prompt must see EOF and abort. The
        // bounded output is consumed without mirroring private process detail.
        stdio: ['ignore', 'pipe', 'pipe'],
        // The CLI uses local config/Home and standard network settings. It
        // never receives ambient Warpkeep signing, admin, RPC, or review data.
        env: publishChildEnvironment(),
      });
    } catch (error) {
      settle(() => rejectPromise(error));
      return;
    }
    const observeOutput = (stream) => {
      if (!stream || typeof stream.on !== 'function') return;
      stream.on('data', chunk => {
        outputBytes += chunk.byteLength;
        if (outputBytes <= MAX_CHILD_OUTPUT_BYTES || outputExceeded) return;
        outputExceeded = true;
        try { child.kill('SIGKILL'); } catch { /* The bounded failure remains generic. */ }
        forcedKill = setTimeout(() => {
          settle(() => rejectPromise(new Error('SpacetimeDB publish output exceeded its fixed bound.')));
        }, PUBLISH_KILL_GRACE_MILLISECONDS);
      });
    };
    observeOutput(child.stdout);
    observeOutput(child.stderr);
    child.on('error', (error) => {
      // A signal-delivery error can arrive after the deadline. Keep the forced
      // SIGKILL timer alive in that case instead of abandoning the child. Keep
      // this listener installed so a second kill-delivery error is not emitted
      // as an unhandled EventEmitter error after forced settlement.
      if (!timedOut) settle(() => rejectPromise(error));
    });
    child.once('close', (code) => settle(() => {
      if (!timedOut && !outputExceeded && code === 0) resolvePromise();
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
  const {
    dryRun,
    resourceRolloutStage,
    genesisWorldRolloutStage,
  } = parsePublishArguments();
  requireCanonicalPublishCoordinates();
  if (database !== CANONICAL_DATABASE) fail('The production publisher target was not canonical.');
  const issuer = requireHttpsOrigin(configuredIssuer, 'WARPKEEP_OIDC_ISSUER');
  if (issuer !== CANONICAL_BRIDGE) fail('The production issuer was not canonical.');
  const sourceConfig = await readFile(sourceConfigPath, 'utf8');
  const sourceMatch = sourceConfig.match(/^export const WARPKEEP_OIDC_ISSUER\s*=\s*'([^']+)';\s*$/m);
  if (!sourceMatch || sourceMatch[1] !== issuer) {
    fail('The module source issuer must exactly match WARPKEEP_OIDC_ISSUER before publishing.');
  }
  if (!dryRun && process.env.WARPKEEP_PUBLISH_CONFIRM !== database) {
    fail(`Set WARPKEEP_PUBLISH_CONFIRM=${database} after reviewing the target database; publish was not attempted.`);
  }
  const foundedExpectations = readFoundedPublishExpectations();
  const executable = attestPinnedSpacetimeCli(command);
  const artifactReceipt = runCurrentAdditiveMigrationProof(executable);
  if (dryRun) {
    await validateIssuerDeployment(issuer);
    console.log(`Dry run: verified the pinned CLI, current additive migration, founded-state expectation contract, explicit ${resourceRolloutStage} resource stage, explicit ${genesisWorldRolloutStage} Genesis world stage, and ${issuer}; would update the canonical existing database without deleting data.`);
    return;
  }
  await validateIssuerDeployment(issuer);
  attestCanonicalDatabase(executable);
  verifyFreshFoundedProtocolV3Aggregate(
    process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
    foundedExpectations,
    spawnSync,
    genesisWorldRolloutStage,
  );
  if (resourceRolloutStage === RESOURCE_PUBLISH_ROLLOUT_STAGE.READY) {
    verifyFreshResourceProtocolV4ReadyAggregate(
      process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
      foundedExpectations.expectedFounderCount,
    );
  }
  await publishModule(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt);
  verifyPostPublishResourcePublicationCheckpoints(
    process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
    foundedExpectations,
    resourceRolloutStage,
    spawnSync,
    genesisWorldRolloutStage,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof SafePublishError
      ? error.message
      : 'Non-destructive publish did not complete. The outcome may be indeterminate; inspect Maincloud before retrying.');
    process.exitCode = 1;
  });
}
