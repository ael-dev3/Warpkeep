import { spawn, type ChildProcess } from 'node:child_process';
import {
  generateKeyPairSync,
  randomBytes,
  sign as signBytes,
} from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createGenesis002GreaterRealmRuntimeRelease,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
} from './atlas/greater-realm-runtime-release-test-fixture';
import {
  executeGenesis002ProductionImport,
} from './genesis002-production-import-core';
import {
  createGenesis002ProductionTransport,
} from './genesis002-production-transport';
import { DbConnection } from './genesis002_module_bindings';
import { GENESIS_002_AUDIENCE } from '../spacetimedb/genesis002/src/contract';
import { attestPinnedSpacetimeCli } from './spacetime-cli-attestation.mjs';
import {
  runDisposableLocalFullstackCli,
  terminateLocalFullstackProcessGroup,
} from './qa-observer/local-fullstack-spacetime.mjs';

const DATABASE_ALIAS = 'warpkeep-genesis-002-loopback';
const DATABASE_IDENTITY = '2'.repeat(64);
const MODULE_SOURCE_COMMIT = GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT;
const MODULE_SHA256 = '3'.repeat(64);
const MODULE_TREE_ID = '4'.repeat(40);
const DEPENDENCY_CLOSURE_DIGEST = '5'.repeat(64);
const SPACETIME_EXECUTABLE_SHA256 = '6'.repeat(64);
const ADMIN_SECRET = 'loopback-only-genesis-002-admin-secret';
const MAXIMUM_RESPONSE_BYTES = 64 * 1_024;
const COMMAND_TIMEOUT_MILLISECONDS = 120_000;
const CONNECTION_TIMEOUT_MILLISECONDS = 8_000;

export const GENESIS_002_PRIVATE_LOOPBACK_TABLES = Object.freeze([
  'access_request_v1',
  'admin_audit',
  'allowed_fid',
  'alpha_terms_acceptance_v1',
  'castle',
  'greater_realm_activation_v1',
  'greater_realm_castle_claim_v1',
  'greater_realm_castle_slot_v1',
  'greater_realm_cell_occupancy_v1',
  'greater_realm_cell_v1',
  'greater_realm_chunk_v1',
  'greater_realm_navigation_component_v1',
  'greater_realm_release_v1',
  'greater_realm_resource_node_v1',
  'mark_account_v1',
  'player',
  'player_ownership_v2',
  'player_v2',
  'realm_atlas_v1',
  'realm_atlas_visible_region_v1',
  'realm_profile_v1',
  'realm_worker_system_v2',
  'resource_account_v1',
] as const);

export const GENESIS_002_PRIVATE_LOOPBACK_PROCEDURES = Object.freeze([
  Object.freeze({ name: 'access_request_get_status_v_1', arguments: [] }),
  Object.freeze({ name: 'access_request_submit_v_1', arguments: [] }),
  Object.freeze({ name: 'admin_get_greater_realm_import_plan_v_1', arguments: [] }),
  Object.freeze({ name: 'admin_get_greater_realm_status_v_1', arguments: [] }),
  Object.freeze({ name: 'auth_resolver_get_fid_admission_v_2', arguments: ['1'] }),
  Object.freeze({ name: 'get_my_admission_status_v_2', arguments: [] }),
  Object.freeze({ name: 'get_realm_status_v1', arguments: [] }),
] as const);

export class Genesis002PrivateLoopbackError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'Genesis002PrivateLoopbackError';
  }
}

function fail(code: string): never {
  throw new Genesis002PrivateLoopbackError(code);
}

export function genesis002PrivateLoopbackAdminJwtTimes(
  wallClockSeconds: number,
) {
  const issuedAt = wallClockSeconds - 30;
  return Object.freeze({
    issuedAt,
    notBefore: issuedAt,
    expiresAt: wallClockSeconds + 240,
  });
}

function safeEnvironment(runtimeDirectory: string) {
  const inherited = Object.fromEntries([
    'PATH',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS',
    'SYSTEMROOT',
    'COMSPEC',
    'PATHEXT',
  ].filter(key => typeof process.env[key] === 'string')
    .map(key => [key, process.env[key]!])) as Record<string, string>;
  return Object.freeze({
    ...inherited,
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

async function freeLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        rejectPort(new Error('loopback address unavailable'));
        return;
      }
      server.close(error => (
        error === undefined ? resolvePort(address.port) : rejectPort(error)
      ));
    });
  });
}

async function boundedText(response: Response, secret: string): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAXIMUM_RESPONSE_BYTES) {
    fail('GENESIS_002_LOOPBACK_RESPONSE_OVERSIZED');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  bytes.fill(0);
  if (text.includes(secret)) fail('GENESIS_002_LOOPBACK_CREDENTIAL_REFLECTED');
  return text;
}

async function acquireOwner(server: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${server}/v1/identity`, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(1_000),
      });
      const text = await boundedText(response, 'credential-not-issued');
      const value = JSON.parse(text) as Record<string, unknown>;
      if (
        response.status === 200
        && typeof value.identity === 'string'
        && /^[0-9a-f]{64}$/u.test(value.identity)
        && typeof value.token === 'string'
        && value.token.split('.').length === 3
      ) return Object.freeze({ identity: value.identity, token: value.token });
    } catch {
      // The private server may still be starting.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  fail('GENESIS_002_LOOPBACK_SERVER_UNAVAILABLE');
}

function jwt(privateKey: string, input: Readonly<{
  subject: string;
  roles: readonly string[];
  audience: string;
  fid?: string;
}>) {
  // Give the disposable credential enough backward clock tolerance for the
  // local transaction clock while staying strictly below the admin time cap.
  const times = genesis002PrivateLoopbackAdminJwtTimes(
    Math.floor(Date.now() / 1_000),
  );
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
    .toString('base64url');
  const payload = Buffer.from(JSON.stringify(genesis002PrivateLoopbackJwtClaims(
    input,
    times,
  ))).toString('base64url');
  const signed = `${header}.${payload}`;
  const signature = signBytes('sha256', Buffer.from(signed), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signed}.${signature}`;
}

export function genesis002PrivateLoopbackJwtClaims(
  input: Readonly<{
    subject: string;
    roles: readonly string[];
    audience: string;
    fid?: string;
  }>,
  times: Readonly<{
    issuedAt: number;
    notBefore: number;
    expiresAt: number;
  }>,
) {
  return Object.freeze({
    iss: 'https://auth.warpkeep.com',
    sub: input.subject,
    aud: Object.freeze([input.audience]),
    token_type: 'spacetime-access',
    roles: input.roles,
    iat: times.issuedAt,
    nbf: times.notBefore,
    exp: times.expiresAt,
    jti: randomBytes(18).toString('base64url'),
    ...(input.fid === undefined ? {} : {
      auth_version: 2,
      fid: input.fid,
      auth_epoch: 1,
      session_iat: times.issuedAt,
      session_exp: times.issuedAt + 300,
    }),
  });
}

function connect(
  server: string,
  database: string,
  token: string | undefined,
): Promise<InstanceType<typeof DbConnection>> {
  return new Promise((resolveConnection, rejectConnection) => {
    let pending: InstanceType<typeof DbConnection> | undefined;
    const timeout = setTimeout(() => {
      try { pending?.disconnect(); } catch { /* Preserve the bounded error. */ }
      rejectConnection(new Error('connection deadline'));
    }, CONNECTION_TIMEOUT_MILLISECONDS);
    let builder = DbConnection.builder()
      .withUri(server)
      .withDatabaseName(database)
      .onConnect(value => {
        clearTimeout(timeout);
        resolveConnection(value);
      })
      .onConnectError((_context, error) => {
        clearTimeout(timeout);
        rejectConnection(error);
      });
    if (token !== undefined) builder = builder.withToken(token);
    pending = builder.build();
  });
}

async function requireConnectionRejected(
  server: string,
  token: string | undefined,
  code: string,
) {
  let connection: InstanceType<typeof DbConnection> | undefined;
  try {
    connection = await connect(server, DATABASE_ALIAS, token);
  } catch {
    return;
  } finally {
    try { connection?.disconnect(); } catch { /* Preserve the assertion. */ }
  }
  fail(code);
}

async function cli(
  executable: string,
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>>,
  expected: 'success' | 'rejected',
) {
  const result = await runDisposableLocalFullstackCli(
    executable,
    [...arguments_],
    {
      environment,
      timeout: COMMAND_TIMEOUT_MILLISECONDS,
    },
  );
  if (
    (expected === 'success' && result.code !== 0)
    || (expected === 'rejected' && result.code === 0)
  ) fail('GENESIS_002_LOOPBACK_CLI_OUTCOME_INVALID');
}

async function probeCliDenials(input: Readonly<{
  executable: string;
  server: string;
  environment: Readonly<Record<string, string>>;
  nonAdminConfigPath: string;
}>) {
  const anonymous = ['--anonymous', '--server', input.server, '--no-config'];
  const nonAdmin = [
    `--config-path=${input.nonAdminConfigPath}`,
    '--server', input.server,
    '--no-config',
  ];
  for (const table of GENESIS_002_PRIVATE_LOOPBACK_TABLES) {
    const query = `SELECT * FROM ${table}`;
    await cli(
      input.executable,
      ['sql', ...anonymous, DATABASE_ALIAS, query],
      input.environment,
      'rejected',
    );
    await cli(
      input.executable,
      ['sql', ...nonAdmin, DATABASE_ALIAS, query],
      input.environment,
      'rejected',
    );
  }
  for (const prefix of [anonymous, nonAdmin]) {
    await cli(
      input.executable,
      [
        'subscribe', ...prefix,
        '--num-updates', '1',
        '--timeout', '3',
        '--print-initial-update',
        DATABASE_ALIAS,
        'SELECT * FROM realm_atlas_v1',
      ],
      input.environment,
      'rejected',
    );
    for (const procedure of GENESIS_002_PRIVATE_LOOPBACK_PROCEDURES) {
      await cli(
        input.executable,
        ['call', ...prefix, DATABASE_ALIAS, procedure.name, ...procedure.arguments],
        input.environment,
        'rejected',
      );
    }
  }
}

export async function verifyGenesis002PrivateLoopback() {
  const runtimeDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-g002-private-loopback-'));
  chmodSync(runtimeDirectory, 0o700);
  const environment = safeEnvironment(runtimeDirectory);
  const cliSnapshot = attestPinnedSpacetimeCli(
    process.env.SPACETIME_BIN ?? 'spacetime',
    undefined,
    environment,
  );
  let serverProcess: ChildProcess | undefined;
  let transport: ReturnType<typeof createGenesis002ProductionTransport> | undefined;
  const fixture = createGreaterRealmRuntimeReleaseFixtureSource();
  const artifacts = createGenesis002GreaterRealmRuntimeRelease({
    source: fixture,
    sourceCommit: MODULE_SOURCE_COMMIT,
    releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
  });
  try {
    verifyGenesis002GreaterRealmRuntimeReleaseArtifacts(artifacts);
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const publicKeyPath = join(runtimeDirectory, 'jwt-public.pem');
    const privateKeyPath = join(runtimeDirectory, 'jwt-private.pem');
    writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const port = await freeLoopbackPort();
    const server = `http://127.0.0.1:${port}`;
    serverProcess = spawn(cliSnapshot.path, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', join(runtimeDirectory, 'database'),
      '--jwt-pub-key-path', publicKeyPath,
      '--jwt-priv-key-path', privateKeyPath,
      '--non-interactive',
    ], {
      detached: true,
      env: environment,
      shell: false,
      stdio: 'ignore',
    });
    serverProcess.on('error', () => {});
    const owner = await acquireOwner(server);
    const ownerConfigPath = join(runtimeDirectory, 'owner-cli.toml');
    writeFileSync(
      ownerConfigPath,
      `spacetimedb_token = ${JSON.stringify(owner.token)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    await cli(cliSnapshot.path, [
      `--config-path=${ownerConfigPath}`,
      'publish',
      '--server', server,
      '--module-path', 'spacetimedb/genesis002',
      '--delete-data=never',
      '--no-config',
      DATABASE_ALIAS,
    ], environment, 'success');

    const nonAdminToken = jwt(privateKey, {
      subject: 'farcaster:9900002',
      roles: [],
      audience: 'warpkeep-spacetimedb',
      fid: '9900002',
    });
    const activeTransport = createGenesis002ProductionTransport({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      requestToken: async () => jwt(privateKey, {
        subject: 'service:hermes',
        roles: ['warpkeep-admin'],
        audience: GENESIS_002_AUDIENCE,
      }),
      connectDatabase: async (_databaseIdentity, token) => (
        connect(server, DATABASE_ALIAS, token)
      ),
    });
    transport = activeTransport;
    const importTransport = Object.freeze({
      inspect: () => activeTransport.inspect(),
      prepareSubmission: () => activeTransport.prepareSubmission!(),
      submit: async (...arguments_: Parameters<typeof activeTransport.submit>) => {
        await activeTransport.submit(...arguments_);
      },
    });
    const receipt = await executeGenesis002ProductionImport({
      artifacts,
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_CLOSURE_DIGEST,
      spacetimeExecutableSha256: SPACETIME_EXECUTABLE_SHA256,
      importEpoch: 1n,
      publicName: 'Genesis 002 loopback atlas',
      transport: importTransport,
      assertCanStartWrite: () => undefined,
      testOnlyVerifyArtifacts: verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
    });
    if (
      receipt.atlasWritesClosedByFinalization !== true
      || receipt.zeroPopulationBoundary !== true
      || receipt.activationMutationsEnabled !== false
      || receipt.playerPresentationEnabled !== false
    ) fail('GENESIS_002_LOOPBACK_FINALIZATION_INVALID');
    await activeTransport.close();
    transport = undefined;

    await requireConnectionRejected(
      server,
      undefined,
      'GENESIS_002_LOOPBACK_ANONYMOUS_CONNECTION_OPEN',
    );
    await requireConnectionRejected(
      server,
      nonAdminToken,
      'GENESIS_002_LOOPBACK_NON_ADMIN_CONNECTION_OPEN',
    );
    const nonAdminConfigPath = join(runtimeDirectory, 'non-admin-cli.toml');
    writeFileSync(
      nonAdminConfigPath,
      `spacetimedb_token = ${JSON.stringify(nonAdminToken)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    await probeCliDenials({
      executable: cliSnapshot.path,
      server,
      environment,
      nonAdminConfigPath,
    });
    return Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-genesis-002-private-loopback-v1',
      atlasFinalized: true,
      tableCount: GENESIS_002_PRIVATE_LOOPBACK_TABLES.length,
      procedureCount: GENESIS_002_PRIVATE_LOOPBACK_PROCEDURES.length,
      anonymousConnectionRejected: true,
      nonAdminConnectionRejected: true,
      anonymousSqlRejected: true,
      nonAdminSqlRejected: true,
      anonymousSubscriptionRejected: true,
      nonAdminSubscriptionRejected: true,
      anonymousProceduresRejected: true,
      nonAdminProceduresRejected: true,
    });
  } finally {
    try { await transport?.close(); } catch { /* Preserve the first failure. */ }
    await terminateLocalFullstackProcessGroup(serverProcess);
    fixture.grid.clearIndex?.();
    artifacts.manifestBytes.fill(0);
    artifacts.statusBytes.fill(0);
    for (const chunk of artifacts.chunks) chunk.bytes.fill(0);
    cliSnapshot.cleanup();
    rmSync(runtimeDirectory, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(await verifyGenesis002PrivateLoopback())}\n`);
  } catch (error) {
    process.stderr.write(`${
      error instanceof Genesis002PrivateLoopbackError
        ? error.code
        : 'GENESIS_002_PRIVATE_LOOPBACK_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}
