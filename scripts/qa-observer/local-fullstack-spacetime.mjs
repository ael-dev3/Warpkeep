import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign as signBytes } from 'node:crypto';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { attestPinnedSpacetimeCli } from '../spacetime-cli-attestation.mjs';

export const LOCAL_FULLSTACK_DATABASE = 'warpkeep-local-fullstack';
export const LOCAL_FULLSTACK_ISSUER = 'http://127.0.0.1';
export const LOCAL_FULLSTACK_AUDIENCE = 'warpkeep-spacetimedb';
export const LOCAL_FULLSTACK_FID = 9_900_001;
export const LOCAL_FULLSTACK_PROFILE_URL =
  'https://i.imgur.com/warpkeep-local-keeper.png';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_MODULE = join(REPOSITORY_ROOT, 'spacetimedb');
const MAXIMUM_OUTPUT_BYTES = 512 * 1_024;
const MAXIMUM_RESPONSE_BYTES = 32 * 1_024;
const COMMAND_TIMEOUT_MILLISECONDS = 120_000;
const SERVER_STOP_TIMEOUT_MILLISECONDS = 5_000;
const PROFILE_POLICY_VERSION = 'trusted-snapchain-profile-v3';
const RESOURCE_POLICY_VERSION = 'genesis-resource-yield-v1';
const WORKER_PROTOCOL_CAPABILITY = 'generic-castle-workers-v1';
const PRODUCTION_OIDC_ISSUER = 'https://auth.warpkeep.com';
const PRODUCTION_OIDC_SOURCE_DECLARATION =
  `export const WARPKEEP_OIDC_ISSUER = '${PRODUCTION_OIDC_ISSUER}';`;
const PRODUCTION_OIDC_ISSUER_BYTES = Buffer.from(PRODUCTION_OIDC_ISSUER, 'utf8');
const LOCAL_CLIENT_ARTIFACT_DIGEST = createHash('sha256')
  .update('warpkeep-disposable-local-fullstack-client-v1')
  .digest('hex');
const LOCAL_SOURCE_COMMIT = '0'.repeat(40);
const SAFE_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
]);
const COPIED_MODULE_FILES = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
]);

export class LocalFullstackRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocalFullstackRuntimeError';
  }
}

function fail(message) {
  throw new LocalFullstackRuntimeError(message);
}

function exactPrivateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    fail('Disposable runtime directory was invalid.');
  }
  return value;
}

function childEnvironment(runtimeDirectory, source = process.env) {
  const environment = Object.fromEntries(SAFE_CHILD_ENVIRONMENT_KEYS
    .filter((key) => typeof source[key] === 'string' && source[key].length > 0)
    .map((key) => [key, source[key]]));
  return Object.freeze({
    ...environment,
    CI: '1',
    HOME: runtimeDirectory,
    LANG: 'C',
    NO_COLOR: '1',
    TMPDIR: runtimeDirectory,
    XDG_CACHE_HOME: join(runtimeDirectory, 'xdg-cache'),
    XDG_CONFIG_HOME: join(runtimeDirectory, 'xdg-config'),
    XDG_DATA_HOME: join(runtimeDirectory, 'xdg-data'),
  });
}

async function freeLoopbackPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
        server.close();
        rejectPort(new LocalFullstackRuntimeError('Loopback port reservation failed.'));
        return;
      }
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

function collectBounded(stream, terminate) {
  const chunks = [];
  let byteLength = 0;
  stream.on('data', (chunk) => {
    byteLength += chunk.byteLength;
    if (byteLength > MAXIMUM_OUTPUT_BYTES) {
      terminate();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  return () => {
    if (byteLength > MAXIMUM_OUTPUT_BYTES) fail('Local CLI output exceeded its bound.');
    return Buffer.concat(chunks).toString('utf8');
  };
}

export async function runDisposableLocalFullstackCli(executable, arguments_, options) {
  return new Promise((resolveRun, rejectRun) => {
    let settled = false;
    let timedOut = false;
    let deadline;
    const child = spawn(executable, arguments_, {
      cwd: REPOSITORY_ROOT,
      detached: true,
      env: options.environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    options.onProcess?.(child);
    const terminate = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {
        try { child.kill('SIGKILL'); } catch {
          // The bounded failure remains authoritative.
        }
      }
    };
    const stdout = collectBounded(child.stdout, terminate);
    const stderr = collectBounded(child.stderr, terminate);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      options.onProcess?.(undefined, child);
      callback();
    };
    child.once('error', () => finish(() => rejectRun(
      new LocalFullstackRuntimeError('Local CLI process could not start.')
    )));
    child.once('close', (code) => finish(() => {
      try {
        if (timedOut) {
          rejectRun(new LocalFullstackRuntimeError('Local CLI command exceeded its deadline.'));
          return;
        }
        const output = `${stdout()}\n${stderr()}`;
        for (const secret of options.secrets ?? []) {
          if (typeof secret === 'string' && secret.length > 0 && output.includes(secret)) {
            rejectRun(new LocalFullstackRuntimeError('Local CLI exposed disposable authority.'));
            return;
          }
        }
        resolveRun(Object.freeze({ code: code ?? 1 }));
      } catch (error) {
        rejectRun(error instanceof LocalFullstackRuntimeError
          ? error
          : new LocalFullstackRuntimeError('Local CLI output could not be contained.'));
      }
    }));
    deadline = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeout ?? COMMAND_TIMEOUT_MILLISECONDS);
  });
}

async function readBoundedResponse(response, credential) {
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAXIMUM_RESPONSE_BYTES)
  ) fail('Local SpacetimeDB response exceeded its bound.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAXIMUM_RESPONSE_BYTES) {
      try { await reader.cancel(); } catch { /* The bounded rejection remains authoritative. */ }
      fail('Local SpacetimeDB response exceeded its bound.');
    }
    chunks.push(value);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  if (text.includes(credential)) fail('Local SpacetimeDB reflected disposable authority.');
  return text;
}

async function callLocalProcedure({
  server,
  database,
  name,
  credential,
  body = '[]',
  expectedStatus = 200,
  timeout = 30_000,
}) {
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(server)
    || database !== LOCAL_FULLSTACK_DATABASE
    || !/^[a-z0-9_]+$/.test(name)
    || typeof credential !== 'string'
    || !/^\[/.test(body)
  ) fail('Local SpacetimeDB call coordinates were invalid.');
  let response;
  try {
    response = await fetch(`${server}/v1/database/${database}/call/${name}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential}`,
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    fail('Local SpacetimeDB call failed within its boundary.');
  }
  const text = await readBoundedResponse(response, credential);
  if (response.status !== expectedStatus) {
    fail(`Local SpacetimeDB call ${name} failed safely.`);
  }
  return text;
}

async function acquireDisposableIdentity(server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${server}/v1/identity`, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(1_000),
      });
      const text = await readBoundedResponse(response, 'credential-not-yet-issued');
      const value = JSON.parse(text);
      if (
        response.status !== 200
        || typeof value?.identity !== 'string'
        || !/^[0-9a-f]{64}$/.test(value.identity)
        || typeof value?.token !== 'string'
        || value.token.split('.').length !== 3
      ) throw new Error();
      return Object.freeze({ identity: value.identity, token: value.token });
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  fail('Disposable SpacetimeDB did not become ready.');
}

function createEphemeralJwt(privateKey, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = signBytes('sha256', Buffer.from(input), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${input}.${signature}`;
}

function localServiceClaims(subject, roles, lifetimeSeconds) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  return {
    iss: LOCAL_FULLSTACK_ISSUER,
    sub: subject,
    aud: [LOCAL_FULLSTACK_AUDIENCE],
    token_type: 'spacetime-access',
    roles,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + lifetimeSeconds,
    jti: randomBytes(18).toString('base64url'),
  };
}

function localAdminClaims() {
  return localServiceClaims('service:hermes', ['warpkeep-admin'], 240);
}

function localPlayerClaims(lifetimeSeconds = 600) {
  const base = localServiceClaims(`farcaster:${LOCAL_FULLSTACK_FID}`, [], lifetimeSeconds);
  return {
    ...base,
    auth_version: 2,
    fid: String(LOCAL_FULLSTACK_FID),
    auth_epoch: 1,
    session_iat: base.iat,
    session_exp: base.exp,
  };
}

async function createLocalModule(runtimeDirectory) {
  const moduleDirectory = join(runtimeDirectory, 'module');
  await mkdir(moduleDirectory, { mode: 0o700 });
  await cp(join(SOURCE_MODULE, 'src'), join(moduleDirectory, 'src'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  for (const file of COPIED_MODULE_FILES) {
    await cp(join(SOURCE_MODULE, file), join(moduleDirectory, file), {
      errorOnExist: true,
      force: false,
    });
  }
  const sourceNodeModules = await realpath(join(SOURCE_MODULE, 'node_modules'));
  const nodeModulesMetadata = await stat(sourceNodeModules);
  if (!nodeModulesMetadata.isDirectory()) fail('Pinned module dependencies are unavailable.');
  await symlink(sourceNodeModules, join(moduleDirectory, 'node_modules'), 'dir');

  const configPath = join(moduleDirectory, 'src', 'config.ts');
  const productionConfig = await readFile(configPath, 'utf8');
  const localConfig = productionConfig
    .replace(
      PRODUCTION_OIDC_SOURCE_DECLARATION,
      `export const WARPKEEP_OIDC_ISSUER = '${LOCAL_FULLSTACK_ISSUER}';`
    );
  if (localConfig === productionConfig) {
    fail('Disposable module authority separation failed.');
  }
  await writeFile(configPath, localConfig, { encoding: 'utf8', mode: 0o600 });
  return moduleDirectory;
}

function readUnsigned(value) {
  const parsed = typeof value === 'number' && Number.isSafeInteger(value)
    ? BigInt(value)
    : typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)
      ? BigInt(value)
      : undefined;
  if (parsed === undefined || parsed < 0n) fail('Worker aggregate was invalid.');
  return parsed;
}

function parseWorkerRollout(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('Worker aggregate was invalid.');
  }
  if (!Array.isArray(value) || value.length !== 36) fail('Worker aggregate was invalid.');
  const status = Object.freeze({
    phase: value[0],
    expectedCastleCount: readUnsigned(value[3]),
    expectedWorkerCount: readUnsigned(value[4]),
    actualWorkerCount: readUnsigned(value[6]),
    rosterDigest: value[7],
    malformedWorkerGraphRows: readUnsigned(value[9]),
    resourceRosterDigest: value[14],
    canonicalResourceCatalog: value[15],
    resourceCatalogDigest: value[16],
    legacyExpeditions: readUnsigned(value[17]),
    legacyOccupations: readUnsigned(value[18]),
    legacySchedules: readUnsigned(value[19]),
  });
  if (
    !['draining', 'active'].includes(status.phase)
    || status.expectedCastleCount !== 1n
    || status.expectedWorkerCount !== 4n
    || status.actualWorkerCount !== 4n
    || typeof status.rosterDigest !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.rosterDigest)
    || status.malformedWorkerGraphRows !== 0n
    || typeof status.resourceRosterDigest !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.resourceRosterDigest)
    || status.canonicalResourceCatalog !== true
    || typeof status.resourceCatalogDigest !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.resourceCatalogDigest)
    || status.legacyExpeditions !== 0n
    || status.legacyOccupations !== 0n
    || status.legacySchedules !== 0n
  ) fail('Worker aggregate was not ready for local activation.');
  return status;
}

export async function terminateLocalFullstackProcessGroup(child, options = {}) {
  if (!child?.pid) return;
  const killProcessGroup = options.killProcessGroup
    ?? ((pid, signal) => process.kill(-pid, signal));
  const killChild = options.killChild
    ?? ((processChild, signal) => processChild.kill(signal));
  const wait = options.wait
    ?? ((milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)));
  const running = child.exitCode === null && child.signalCode === null;
  const closed = running
    ? new Promise((resolveClose) => child.once('close', resolveClose))
    : Promise.resolve();
  const send = (signal) => {
    try { killProcessGroup(child.pid, signal); } catch {
      try { killChild(child, signal); } catch { /* Already stopped. */ }
    }
  };
  send('SIGTERM');
  if (running) {
    await Promise.race([
      closed,
      wait(SERVER_STOP_TIMEOUT_MILLISECONDS),
    ]);
  }
  send('SIGKILL');
  if (running) {
    await Promise.race([
      closed,
      wait(SERVER_STOP_TIMEOUT_MILLISECONDS),
    ]);
  }
  try {
    killProcessGroup(child.pid, 0);
    fail('Disposable SpacetimeDB process group remained alive.');
  } catch (error) {
    if (error instanceof LocalFullstackRuntimeError) throw error;
    if (error?.code !== 'ESRCH') {
      fail('Disposable SpacetimeDB process group could not be verified as stopped.');
    }
  }
}

async function seedLocalRealm(server, privateKey, moduleDigest) {
  const adminCredential = () => createEphemeralJwt(privateKey, localAdminClaims());
  const callAdmin = (name, body = '[]', timeout = 30_000) => callLocalProcedure({
    server,
    database: LOCAL_FULLSTACK_DATABASE,
    name,
    credential: adminCredential(),
    body,
    timeout,
  });
  await callAdmin('admin_seed_world', '[]', 120_000);
  await callAdmin('admin_seed_genesis_forest_layout_v1');
  for (const [name, count, policy] of [
    ['admin_seed_genesis_tier_i_gold_sites_v1', 24, 'genesis-001-tier1-gold-sites-v3'],
    ['admin_seed_genesis_tier_i_food_sites_v1', 96, 'genesis-001-tier1-food-sites-v2'],
    ['admin_seed_genesis_tier_i_wood_sites_v1', 96, 'genesis-001-tier1-wood-sites-v2'],
    ['admin_seed_genesis_tier_i_stone_sites_v1', 96, 'genesis-001-tier1-stone-sites-v3'],
  ]) {
    await callAdmin(name, JSON.stringify([count, policy]), 120_000);
  }
  await callAdmin('admin_seed_genesis_water_layout_v1', '[]', 120_000);
  await callAdmin('admin_activate_genesis_water_layout_v1', '[]', 120_000);
  await callAdmin('admin_seed_genesis_water_revision_v1', '[]', 120_000);
  await callAdmin('admin_activate_genesis_water_revision_v1', '[]', 120_000);
  await callAdmin('admin_admit_founder_v1', JSON.stringify([
    LOCAL_FULLSTACK_FID,
    'disposable local full-stack browser fixture',
    'qa.warpkeeper',
    { some: 'Synthetic QA Keeper' },
    LOCAL_FULLSTACK_PROFILE_URL,
    { some: 'Synthetic loopback-only founder' },
    PROFILE_POLICY_VERSION,
  ]));
  await callAdmin('admin_stage_worker_system_v1');
  await callAdmin('admin_backfill_worker_roster_v1');
  await callAdmin('admin_begin_worker_legacy_drain_v1');
  const draining = parseWorkerRollout(await callAdmin('admin_get_worker_rollout_status_v2'));
  await callAdmin('admin_activate_worker_system_v1', JSON.stringify([
    WORKER_PROTOCOL_CAPABILITY,
    'alpha-0.3.18',
    LOCAL_CLIENT_ARTIFACT_DIGEST,
    moduleDigest,
    LOCAL_SOURCE_COMMIT,
    2,
    RESOURCE_POLICY_VERSION,
    draining.resourceCatalogDigest,
    Number(draining.expectedCastleCount),
    Number(draining.expectedWorkerCount),
    draining.rosterDigest,
    draining.resourceRosterDigest,
  ]));
  const active = parseWorkerRollout(await callAdmin('admin_get_worker_rollout_status_v2'));
  if (active.phase !== 'active') fail('Worker system did not activate locally.');
}

export async function startDisposableLocalFullstackSpacetime(options = {}) {
  if (
    options === null
    || typeof options !== 'object'
    || (options.onLifecycle !== undefined && typeof options.onLifecycle !== 'function')
  ) fail('Disposable runtime options were invalid.');
  const requestedRoot = options.runtimeDirectory;
  const runtimeDirectory = requestedRoot === undefined
    ? await mkdtemp(join(tmpdir(), 'warpkeep-local-fullstack-'))
    : exactPrivateDirectory(requestedRoot);
  await chmod(runtimeDirectory, 0o700);
  const rootMetadata = await lstat(runtimeDirectory);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    fail('Disposable runtime root was unsafe.');
  }
  const environment = childEnvironment(runtimeDirectory, options.environment);
  let cliSnapshot;
  let activeCliProcess;
  let serverProcess;
  let closePromise;
  const close = () => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      let firstFailure;
      try {
        await terminateLocalFullstackProcessGroup(activeCliProcess);
      } catch (error) {
        firstFailure = error;
      }
      try {
        await terminateLocalFullstackProcessGroup(serverProcess);
      } catch (error) {
        firstFailure ??= error;
      }
      try {
        await rm(runtimeDirectory, { recursive: true, force: true });
      } catch (error) {
        firstFailure ??= error;
      }
      try { cliSnapshot?.cleanup(); } catch (error) { firstFailure ??= error; }
      if (firstFailure) throw firstFailure;
    })();
    return closePromise;
  };
  const assertOpen = () => {
    if (closePromise) fail('Disposable SpacetimeDB startup was cancelled.');
  };
  let startupStage = 'lifecycle-registration';
  try {
    options.onLifecycle?.(Object.freeze({ close }));
    assertOpen();
    startupStage = 'cli-attestation';
    cliSnapshot = attestPinnedSpacetimeCli(
      options.spacetimeExecutable ?? process.env.SPACETIME_BIN ?? 'spacetime',
      undefined,
      environment,
    );
    assertOpen();
    startupStage = 'module-copy';
    const moduleDirectory = await createLocalModule(runtimeDirectory);
    assertOpen();
    startupStage = 'ephemeral-key-generation';
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const publicKeyPath = join(runtimeDirectory, 'jwt-public.pem');
    const privateKeyPath = join(runtimeDirectory, 'jwt-private.pem');
    startupStage = 'ephemeral-key-write';
    await writeFile(publicKeyPath, publicKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await writeFile(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    assertOpen();
    startupStage = 'loopback-port-reservation';
    const port = await freeLoopbackPort();
    assertOpen();
    const server = `http://127.0.0.1:${port}`;
    startupStage = 'spacetimedb-spawn';
    serverProcess = spawn(cliSnapshot.path, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', join(runtimeDirectory, 'database'),
      '--jwt-pub-key-path', publicKeyPath,
      '--jwt-priv-key-path', privateKeyPath,
      '--non-interactive',
    ], {
      cwd: REPOSITORY_ROOT,
      detached: true,
      env: environment,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    serverProcess.on('error', () => {});
    startupStage = 'spacetimedb-readiness';
    const owner = await acquireDisposableIdentity(server);
    assertOpen();
    const cliConfigPath = join(runtimeDirectory, 'spacetime-cli.toml');
    startupStage = 'cli-config-write';
    await writeFile(
      cliConfigPath,
      `spacetimedb_token = ${JSON.stringify(owner.token)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' }
    );
    assertOpen();
    const publishArguments = [
      `--config-path=${cliConfigPath}`,
      'publish',
      '--server', server,
      '--module-path', moduleDirectory,
      '--delete-data=never',
      '--no-config',
      LOCAL_FULLSTACK_DATABASE,
    ];
    if (
      publishArguments.includes('--break-clients')
      || publishArguments.some((value) => value.startsWith('--yes'))
      || publishArguments.filter((value) => value === '--delete-data=never').length !== 1
    ) fail('Disposable module publication arguments were unsafe.');
    startupStage = 'module-publication';
    const published = await runDisposableLocalFullstackCli(cliSnapshot.path, publishArguments, {
      environment,
      onProcess(nextProcess, completedProcess) {
        if (nextProcess) activeCliProcess = nextProcess;
        else if (activeCliProcess === completedProcess) activeCliProcess = undefined;
      },
      secrets: [owner.token],
      timeout: COMMAND_TIMEOUT_MILLISECONDS,
    });
    assertOpen();
    if (published.code !== 0) fail('Disposable module publication failed safely.');
    startupStage = 'module-artifact-attestation';
    const artifactPath = join(moduleDirectory, 'dist', 'bundle.js');
    const artifact = await readFile(artifactPath);
    assertOpen();
    const artifactText = artifact.toString('utf8');
    if (
      !artifactText.includes(LOCAL_FULLSTACK_ISSUER)
      || !artifactText.includes(LOCAL_FULLSTACK_AUDIENCE)
      // This scans generated JavaScript bytes for a forbidden build input; it
      // is deliberately not hostname or URL validation.
      || artifact.indexOf(PRODUCTION_OIDC_ISSUER_BYTES) !== -1
    ) fail('Disposable module artifact authority was not isolated.');
    const moduleDigest = createHash('sha256').update(artifact).digest('hex');
    artifact.fill(0);
    startupStage = 'realm-seed';
    await seedLocalRealm(server, privateKey, moduleDigest);
    assertOpen();
    startupStage = 'player-session-probe';
    const playerClaims = localPlayerClaims();
    const playerToken = createEphemeralJwt(privateKey, playerClaims);
    await callLocalProcedure({
      server,
      database: LOCAL_FULLSTACK_DATABASE,
      name: 'get_my_admission_status_v2',
      credential: playerToken,
    });
    assertOpen();
    return Object.freeze({
      bootstrap: Object.freeze({
        version: 1,
        spacetimeUri: server,
        database: LOCAL_FULLSTACK_DATABASE,
        issuer: LOCAL_FULLSTACK_ISSUER,
        audience: LOCAL_FULLSTACK_AUDIENCE,
        fid: LOCAL_FULLSTACK_FID,
        username: 'qa.warpkeeper',
        displayName: 'Synthetic QA Keeper',
        pfpUrl: LOCAL_FULLSTACK_PROFILE_URL,
        accessToken: playerToken,
        accessExpiresAt: playerClaims.exp * 1_000,
        sessionExpiresAt: playerClaims.exp * 1_000,
      }),
      close,
      moduleDigest,
      runtimeDirectory,
      serverProcess,
    });
  } catch (error) {
    try { await close(); } catch {
      // Preserve the original startup failure after attempting containment.
    }
    if (error instanceof LocalFullstackRuntimeError) throw error;
    fail(`Disposable SpacetimeDB startup failed closed at ${startupStage}.`);
  }
}
