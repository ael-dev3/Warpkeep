import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign as signBytes,
} from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureModule = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/production-v1',
);
const additiveV2SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v2-schema',
);
const additiveV3SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v3-schema',
);
const additiveModule = resolve(repositoryRoot, 'spacetimedb');
const command = process.env.SPACETIME_BIN || 'spacetime';
const expectedCliVersion = '2.6.1';
const expectedCliCommit = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const emptyDatabase = 'warpkeep-migration-empty';
const nonemptyDatabase = 'warpkeep-migration-nonempty';
const actualModuleDatabase = 'warpkeep-migration-actual-module';
const maximumOutputBytes = 1_000_000;
const commandTimeoutMilliseconds = 120_000;
const procedureTimeoutMilliseconds = 5_000;
const maximumProcedureResponseBytes = 16_384;
const existingTables = Object.freeze([
  'allowed_fid',
  'world_tile',
  'player',
  'castle',
  'admin_audit',
  'player_v2',
  'player_ownership_v2',
]);
const additiveV3Tables = Object.freeze([
  'realm_v1',
  'world_tile_meta_v1',
  'castle_slot_v1',
  'castle_slot_claim_v1',
  'realm_profile_v1',
  'mark_account_v1',
  'snap_burn_credit_v1',
  'fid_wallet_attribution_v1',
  'wallet_attribution_snapshot_v1',
  'snap_scan_cursor_v1',
  'snap_scan_batch_v1',
  'alpha_terms_acceptance_v1',
]);
const expectedProductTypeRefs = Object.freeze({
  allowed_fid: 0,
  world_tile: 1,
  player: 2,
  castle: 3,
  admin_audit: 4,
  player_v2: 5,
  player_ownership_v2: 6,
  realm_v1: 7,
  world_tile_meta_v1: 8,
  castle_slot_v1: 9,
  castle_slot_claim_v1: 10,
  realm_profile_v1: 11,
  mark_account_v1: 12,
  snap_burn_credit_v1: 13,
  fid_wallet_attribution_v1: 14,
  wallet_attribution_snapshot_v1: 15,
  snap_scan_cursor_v1: 16,
  snap_scan_batch_v1: 17,
  alpha_terms_acceptance_v1: 18,
});
const childEnvironmentKeys = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
]);

class MigrationProofError extends Error {}

let disposableCliCredential = null;

function fail(message) {
  throw new MigrationProofError(message);
}

function childEnvironment(source = process.env) {
  return Object.fromEntries(childEnvironmentKeys
    .filter(key => typeof source[key] === 'string' && source[key].length > 0)
    .map(key => [key, source[key]]));
}

function collectBounded(stream, onOverflow) {
  const chunks = [];
  let bytes = 0;
  stream.on('data', chunk => {
    bytes += chunk.byteLength;
    if (bytes > maximumOutputBytes) {
      onOverflow();
      return;
    }
    chunks.push(chunk);
  });
  return () => Buffer.concat(chunks).toString('utf8');
}

async function runCommand(arguments_, { token, timeout = commandTimeoutMilliseconds } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const withToken = typeof token === 'string';
    let settled = false;
    let overflow = false;
    let timedOut = false;
    let forcedSettlement;
    let deadline;
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: childEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = callback => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (forcedSettlement !== undefined) clearTimeout(forcedSettlement);
      callback();
    };
    const killForOverflow = () => {
      overflow = true;
      try { child.kill('SIGKILL'); } catch { /* The bounded failure remains generic. */ }
    };
    const readStdout = collectBounded(child.stdout, killForOverflow);
    const readStderr = collectBounded(child.stderr, killForOverflow);
    child.once('error', () => {
      if (!timedOut) finish(() => rejectPromise(new MigrationProofError('CLI process could not start.')));
    });
    child.once('close', code => finish(() => {
      if (timedOut) {
        rejectPromise(new MigrationProofError('CLI command exceeded its hard deadline.'));
        return;
      }
      const stdout = readStdout();
      const stderr = readStderr();
      if (overflow) {
        rejectPromise(new MigrationProofError('CLI output exceeded the fixed bound.'));
        return;
      }
      if (withToken && (stdout.includes(token) || stderr.includes(token))) {
        rejectPromise(new MigrationProofError('CLI exposed its disposable local credential.'));
        return;
      }
      resolvePromise({ code: code ?? 1, stdout, stderr });
    }));
    deadline = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* The deadline remains authoritative. */ }
      forcedSettlement = setTimeout(() => {
        finish(() => rejectPromise(new MigrationProofError('CLI command exceeded its hard deadline.')));
      }, 5_000);
    }, timeout);
  });
}

function configArguments(token) {
  if (
    typeof token !== 'string'
    || token.length < 32
    || disposableCliCredential?.token !== token
    || typeof disposableCliCredential.configPath !== 'string'
  ) fail('Disposable local credential was invalid.');
  return [`--config-path=${disposableCliCredential.configPath}`];
}

async function configureDisposableCliCredential(token, dataDirectory) {
  if (disposableCliCredential !== null || typeof token !== 'string' || token.length < 32) {
    fail('Disposable local credential setup was invalid.');
  }
  const configPath = join(dataDirectory, 'cli.toml');
  await writeFile(
    configPath,
    `spacetimedb_token = ${JSON.stringify(token)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
  const metadata = await stat(configPath);
  if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
    fail('Disposable local credential file permissions were invalid.');
  }
  disposableCliCredential = Object.freeze({ token, configPath });
}

function assertSafePublishArguments(arguments_) {
  if (
    arguments_.includes('--break-clients')
    || arguments_.some(value => value === '--yes' || value.startsWith('--yes='))
    || arguments_.includes('--anonymous')
    || arguments_.filter(value => value === '--delete-data=never').length !== 1
    || arguments_.some(value => value.startsWith('--delete-data=') && value !== '--delete-data=never')
  ) {
    fail('Migration proof constructed an unsafe publish command.');
  }
}

function sanitizedFailure(result) {
  return `${result.stderr}\n${result.stdout}`
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[credential-redacted]')
    .replace(/\b(?:0x)?[0-9a-f]{64}\b/gi, '[identity-redacted]')
    .replace(/\/[^\s:]+(?:\/[^\s:]+)+/g, '[path-redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

async function publish(
  server,
  token,
  modulePath,
  database,
  expectSuccess = true,
  expectedFailurePattern,
) {
  const arguments_ = [
    ...configArguments(token),
    'publish',
    '--server', server,
    '--module-path', modulePath,
    '--delete-data=never',
    '--no-config',
    database,
  ];
  assertSafePublishArguments(arguments_);
  const result = await runCommand(arguments_, { token });
  if (expectSuccess && result.code !== 0) {
    fail(`Local publish failed safely at ${database}: ${sanitizedFailure(result)}`);
  }
  if (!expectSuccess && result.code === 0) fail('Destructive rollback unexpectedly succeeded.');
  if (
    !expectSuccess
    && expectedFailurePattern instanceof RegExp
    && !expectedFailurePattern.test(`${result.stderr}\n${result.stdout}`)
  ) fail('Destructive rollback failed for an unrelated reason.');
  return result;
}

async function publishBuiltArtifact(server, token, artifactPath, database) {
  const arguments_ = [
    ...configArguments(token),
    'publish',
    '--server', server,
    '--js-path', artifactPath,
    '--delete-data=never',
    '--no-config',
    database,
  ];
  assertSafePublishArguments(arguments_);
  const result = await runCommand(arguments_, { token });
  if (result.code !== 0) {
    fail(`Local built-artifact publish failed safely at ${database}: ${sanitizedFailure(result)}`);
  }
}

async function sql(
  server,
  token,
  database,
  query,
  expectSuccess = true,
  expectedFailurePattern,
) {
  const result = await runCommand([
    ...configArguments(token),
    'sql',
    '--server', server,
    '--no-config',
    database,
    query,
  ], { token });
  const operation = query.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? 'SQL';
  const table = query.match(/\b(?:FROM|INTO)\s+([a-z0-9_]+)/i)?.[1] ?? 'fixture';
  if (expectSuccess && result.code !== 0) {
    fail(`Disposable ${operation} fixture operation failed for ${table} at ${database}: ${sanitizedFailure(result)}`);
  }
  if (!expectSuccess && result.code === 0) fail('A duplicate fixture mutation unexpectedly succeeded.');
  if (
    !expectSuccess
    && expectedFailurePattern instanceof RegExp
    && !expectedFailurePattern.test(`${result.stderr}\n${result.stdout}`)
  ) fail('A duplicate fixture mutation failed for an unrelated reason.');
  return result.stdout;
}

function countFromSql(output) {
  const normalized = output.replace(/\u001b\[[0-9;]*m/g, '').trim();
  const match = normalized.match(/(?:^|\n)\s*(\d+)\s*$/);
  if (!match) fail('Could not parse a bounded local aggregate count.');
  return BigInt(match[1]);
}

async function count(server, token, database, table) {
  if (!/^[a-z0-9_]+$/.test(table)) fail('Unsafe fixture table name.');
  return countFromSql(await sql(
    server,
    token,
    database,
    `SELECT COUNT(*) AS warpkeep_count FROM ${table}`,
  ));
}

async function describe(server, token, database) {
  const result = await runCommand([
    ...configArguments(token),
    'describe',
    '--json',
    '--server', server,
    '--no-config',
    database,
  ], { token });
  if (result.code !== 0) fail(`Could not describe disposable database ${database}.`);
  try {
    const value = JSON.parse(result.stdout);
    if (!value || typeof value !== 'object' || !Array.isArray(value.tables)) throw new Error();
    return value;
  } catch {
    fail('Disposable schema description was invalid.');
  }
}

function tableSignature(description, name) {
  const table = description.tables.find(candidate => candidate.name === name);
  if (!table || !Number.isSafeInteger(table.product_type_ref)) {
    fail(`Required table ${name} was absent from the disposable schema.`);
  }
  const rowType = description.typespace?.types?.[table.product_type_ref];
  if (!rowType) fail(`Required row type for ${name} was absent.`);
  return {
    ...table,
    rowType,
  };
}

function fieldNames(description, name) {
  const signature = tableSignature(description, name);
  const elements = signature.rowType?.Product?.elements;
  if (!Array.isArray(elements)) fail(`Required row fields for ${name} were absent.`);
  return elements.map(element => element?.name?.some);
}

function access(description, name) {
  const signature = tableSignature(description, name);
  return Object.keys(signature.table_access ?? {})[0];
}

function schemaDigest(description) {
  return createHash('sha256').update(JSON.stringify(description)).digest('hex');
}

function outputDigest(output) {
  return createHash('sha256').update(output.replace(/\r\n/g, '\n').trim()).digest('hex');
}

function assertExistingTablesUnchanged(before, after) {
  for (const name of existingTables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveSchema(before, after) {
  assertExistingTablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV3Tables].sort());

  const contracts = {
    realm_v1: {
      access: 'Public',
      fields: [
        'realm_id', 'public_name', 'seed_name', 'numeric_seed',
        'generation_version', 'authoritative_radius', 'render_radius',
        'player_capacity', 'active', 'created_at',
      ],
    },
    world_tile_meta_v1: {
      access: 'Public',
      fields: [
        'tile_key', 'realm_id', 's', 'ring', 'sector', 'terrain_kind',
        'passable', 'movement_cost', 'static_content_kind', 'generation_version',
      ],
    },
    castle_slot_v1: {
      access: 'Public',
      fields: ['slot_id', 'realm_id', 'tile_key', 'q', 'r', 'generation_version'],
    },
    castle_slot_claim_v1: {
      access: 'Private',
      fields: [
        'slot_id', 'owner_fid', 'castle_id', 'claimed_at', 'generation_version',
      ],
    },
    realm_profile_v1: {
      access: 'Public',
      fields: [
        'fid', 'canonical_username', 'display_name', 'pfp_url', 'public_bio',
        'admitted_at', 'first_authenticated_at', 'profile_updated_at',
        'public_status', 'community_stats_visible', 'total_snap_burned_micros',
        'marks_earned_micros', 'marks_spent_micros', 'marks_balance_micros',
        'marks_policy_version',
      ],
    },
    mark_account_v1: {
      access: 'Private',
      fields: [
        'fid', 'total_snap_burned_micros', 'earned_micros', 'spent_micros',
        'balance_micros', 'policy_version', 'updated_at',
      ],
    },
    snap_burn_credit_v1: {
      access: 'Private',
      fields: [
        'event_key', 'batch_id', 'chain_id', 'token_contract', 'transaction_hash',
        'log_index', 'burn_reference', 'burn_method', 'sender_address',
        'block_number', 'block_hash', 'amount_micros', 'attributed_fid',
        'attribution_policy_version', 'contract_code_hash', 'credited_at',
      ],
    },
    fid_wallet_attribution_v1: {
      access: 'Private',
      fields: [
        'snapshot_attribution_key', 'attribution_key', 'snapshot_generation',
        'fid', 'address', 'address_type', 'source', 'snapshot_at',
        'attribution_policy_version', 'active',
      ],
    },
    wallet_attribution_snapshot_v1: {
      access: 'Private',
      fields: [
        'snapshot_key', 'generation', 'snapshot_id', 'policy_version',
        'attribution_count', 'snapshot_at',
      ],
    },
    snap_scan_cursor_v1: {
      access: 'Private',
      fields: [
        'cursor_key', 'chain_id', 'token_contract', 'policy_version',
        'deployment_start_block', 'last_finalized_block',
        'last_finalized_block_hash', 'proxy_code_hash', 'implementation_address',
        'implementation_code_hash', 'wallet_snapshot_generation',
        'wallet_snapshot_id', 'scanned_at',
      ],
    },
    snap_scan_batch_v1: {
      access: 'Private',
      fields: [
        'batch_id', 'cursor_key', 'status', 'previous_finalized_block',
        'previous_finalized_block_hash', 'through_finalized_block',
        'through_finalized_block_hash', 'wallet_snapshot_generation',
        'wallet_snapshot_id', 'wallet_attribution_count', 'expected_credits',
        'expected_micros', 'applied_credits', 'applied_micros',
        'proxy_code_hash', 'implementation_address', 'implementation_code_hash',
        'started_at', 'finalized_at',
      ],
    },
    alpha_terms_acceptance_v1: {
      access: 'Private',
      fields: ['acceptance_key', 'fid', 'terms_version', 'accepted_at'],
    },
  };

  for (const [name, contract] of Object.entries(contracts)) {
    assert.deepEqual(fieldNames(after, name), contract.fields);
    assert.equal(access(after, name), contract.access);
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

async function freeLoopbackPort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPromise(new MigrationProofError('Could not reserve a loopback port.'));
        return;
      }
      server.close(error => error ? rejectPromise(error) : resolvePromise(address.port));
    });
  });
}

async function acquireDisposableIdentity(server) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${server}/v1/identity`, {
        method: 'POST',
        signal: AbortSignal.timeout(1_000),
      });
      if (!response.ok || !response.body) throw new Error();
      const advertisedLength = response.headers.get('content-length');
      if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > 4_096)) {
        throw new Error();
      }
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4_096) {
          try { await reader.cancel(); } catch { /* The bounded attempt remains invalid. */ }
          throw new Error();
        }
        chunks.push(value);
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      const value = JSON.parse(text);
      if (
        !value
        || typeof value.identity !== 'string'
        || !/^[0-9a-f]{64}$/.test(value.identity)
        || typeof value.token !== 'string'
        || value.token.split('.').length !== 3
      ) throw new Error();
      return { identity: value.identity, token: value.token };
    } catch {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
  }
  fail('Disposable loopback server did not become ready.');
}

function createEphemeralJwt(privateKey, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = signBytes('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

function serviceClaims(subject, roles, lifetimeSeconds) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  return {
    iss: 'https://auth.warpkeep.com',
    sub: subject,
    aud: ['warpkeep-spacetimedb'],
    token_type: 'spacetime-access',
    roles,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + lifetimeSeconds,
    jti: randomBytes(18).toString('base64url'),
  };
}

function resolverServiceClaims(resolverFid, roles = ['warpkeep-auth-epoch-resolver']) {
  return {
    ...serviceClaims('service:auth-epoch-resolver', roles, 15),
    resolver_fid: resolverFid,
  };
}

async function readBoundedProcedureResponse(response, credential) {
  if (!response.body) return '';
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (
      !/^\d+$/.test(advertisedLength)
      || Number(advertisedLength) > maximumProcedureResponseBytes
    )
  ) fail('Loopback procedure response exceeded its fixed bound.');

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumProcedureResponseBytes) {
      try { await reader.cancel(); } catch { /* The bounded failure remains generic. */ }
      fail('Loopback procedure response exceeded its fixed bound.');
    }
    chunks.push(value);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  if (text.includes(credential)) fail('Loopback procedure reflected an ephemeral credential.');
  return text;
}

async function callLoopbackProcedure(
  server,
  database,
  procedure,
  credential,
  body,
  expectedStatus,
) {
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(server)
    || !/^[a-z0-9-]+$/.test(database)
    || !/^[a-z0-9_]+$/.test(procedure)
  ) fail('Loopback procedure coordinates were invalid.');

  let response;
  try {
    response = await fetch(`${server}/v1/database/${database}/call/${procedure}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential}`,
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(procedureTimeoutMilliseconds),
    });
  } catch {
    fail('Loopback procedure request failed within its fixed boundary.');
  }
  const responseText = await readBoundedProcedureResponse(response, credential);
  if (response.status !== expectedStatus) {
    fail(`Loopback procedure returned status ${response.status}; expected ${expectedStatus}.`);
  }
  if (
    expectedStatus === 200
    && response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
  ) fail('Loopback procedure returned an unexpected media type.');
  return responseText;
}

async function verifyResolverHttpLifecycle(server, database, privateKey) {
  let stage = 'resolver-exact';
  try {
    const resolverCredential = createEphemeralJwt(
      privateKey,
      resolverServiceClaims('9007199254740991'),
    );
    const resolverText = await callLoopbackProcedure(
      server,
      database,
      'auth_resolver_get_fid_admission_v2',
      resolverCredential,
      '[9007199254740991]',
      200,
    );
    let resolverResult;
    try {
      resolverResult = JSON.parse(resolverText);
    } catch {
      fail('Loopback resolver response was invalid.');
    }
    try {
      assert.deepEqual(resolverResult, ['missing', 0]);
    } catch {
      fail('Loopback resolver response contract was invalid.');
    }

    stage = 'resolver-fid-mismatch';
    const mismatchedFidCredential = createEphemeralJwt(
      privateKey,
      resolverServiceClaims('12345'),
    );
    await callLoopbackProcedure(
      server,
      database,
      'auth_resolver_get_fid_admission_v2',
      mismatchedFidCredential,
      '[9007199254740991]',
      500,
    );

    stage = 'resolver-admin-denial';
    const resolverForAdminCredential = createEphemeralJwt(
      privateKey,
      resolverServiceClaims('9007199254740991'),
    );
    await callLoopbackProcedure(
      server,
      database,
      'admin_get_alpha_status_v2',
      resolverForAdminCredential,
      '[]',
      500,
    );

    stage = 'resolver-player-denial';
    const resolverForPlayerCredential = createEphemeralJwt(
      privateKey,
      resolverServiceClaims('9007199254740991'),
    );
    await callLoopbackProcedure(
      server,
      database,
      'get_my_admission_status_v2',
      resolverForPlayerCredential,
      '[]',
      500,
    );

    stage = 'resolver-expanded-role';
    const expandedRoleCredential = createEphemeralJwt(
      privateKey,
      resolverServiceClaims(
        '9007199254740991',
        ['warpkeep-auth-epoch-resolver', 'warpkeep-admin'],
      ),
    );
    await callLoopbackProcedure(
      server,
      database,
      'auth_resolver_get_fid_admission_v2',
      expandedRoleCredential,
      '[9007199254740991]',
      403,
    );

  } catch (error) {
    if (error instanceof MigrationProofError) {
      throw new MigrationProofError(`Loopback resolver lifecycle failed at ${stage}: ${error.message}`);
    }
    throw new MigrationProofError(`Loopback resolver lifecycle failed at ${stage}.`);
  }
}

export function containServerProcessErrors(serverProcess) {
  // `spawn` reports some startup failures asynchronously. Keep those failures
  // inside the proof's generic readiness boundary instead of allowing an
  // unhandled EventEmitter error to bypass `finally` cleanup.
  serverProcess.on('error', () => {});
  return serverProcess;
}

export async function stopServer(
  serverProcess,
  gracefulTimeoutMilliseconds = 5_000,
  forcedTimeoutMilliseconds = 5_000,
) {
  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;
  await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let gracefulDeadline;
    let hardDeadline;
    const finish = callback => {
      if (settled) return;
      settled = true;
      if (gracefulDeadline !== undefined) clearTimeout(gracefulDeadline);
      if (hardDeadline !== undefined) clearTimeout(hardDeadline);
      serverProcess.removeListener('close', onClose);
      callback();
    };
    const onClose = () => finish(resolvePromise);
    serverProcess.once('close', onClose);
    gracefulDeadline = setTimeout(() => {
      if (settled) return;
      hardDeadline = setTimeout(() => finish(() => rejectPromise(
        new MigrationProofError('Loopback server did not stop within its cleanup deadline.'),
      )), forcedTimeoutMilliseconds);
      try { serverProcess.kill('SIGKILL'); } catch { /* Cleanup remains best effort. */ }
    }, gracefulTimeoutMilliseconds);
    try { serverProcess.kill('SIGTERM'); } catch { /* Await close or the bounded hard deadline. */ }
  });
}

export async function cleanupMigrationProofResources(
  serverProcess,
  dataDirectory,
  gracefulTimeoutMilliseconds = 5_000,
  forcedTimeoutMilliseconds = 5_000,
  removeDirectory = rm,
) {
  let stopFailure;
  try {
    await stopServer(
      serverProcess,
      gracefulTimeoutMilliseconds,
      forcedTimeoutMilliseconds,
    );
  } catch (error) {
    stopFailure = error;
  }

  try {
    await removeDirectory(dataDirectory, { recursive: true, force: true });
  } catch (error) {
    // A live process is the primary containment failure. Do not let a second
    // cleanup error replace that signal, but still surface removal failure when
    // shutdown itself completed normally.
    if (stopFailure !== undefined) throw stopFailure;
    throw error;
  }
  if (stopFailure !== undefined) throw stopFailure;
}

async function verifyCliVersion() {
  const result = await runCommand(['--version'], { timeout: 10_000 });
  if (
    result.code !== 0
    || !result.stdout.includes(`spacetimedb tool version ${expectedCliVersion};`)
    || !result.stdout.includes(`Commit: ${expectedCliCommit}`)
  ) fail('Pinned SpacetimeDB CLI 2.6.1 was not active.');
}

async function main() {
  await verifyCliVersion();
  const port = await freeLoopbackPort();
  const server = `http://127.0.0.1:${port}`;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(server)) fail('Migration proof was not loopback-only.');
  const dataDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-stdb-migration-'));
  const publicKeyPath = join(dataDirectory, 'jwt-public.pem');
  const privateKeyPath = join(dataDirectory, 'jwt-private.pem');
  let privateKey;
  try {
    const generated = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = generated.privateKey;
    await writeFile(publicKeyPath, generated.publicKey, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await writeFile(privateKeyPath, privateKey, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    for (const keyPath of [publicKeyPath, privateKeyPath]) {
      const metadata = await stat(keyPath);
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
        fail('Ephemeral loopback signing-key permissions were invalid.');
      }
    }
  } catch (error) {
    try {
      await rm(dataDirectory, { recursive: true, force: true });
    } catch {
      fail('Ephemeral loopback signing-key cleanup failed.');
    }
    if (error instanceof MigrationProofError) throw error;
    fail('Ephemeral loopback signing-key setup failed.');
  }

  let serverProcess;
  try {
    serverProcess = containServerProcessErrors(spawn(command, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', dataDirectory,
      '--jwt-pub-key-path', publicKeyPath,
      '--jwt-priv-key-path', privateKeyPath,
      '--non-interactive',
    ], {
      cwd: repositoryRoot,
      env: childEnvironment(),
      stdio: 'ignore',
    }));
  } catch {
    try {
      await rm(dataDirectory, { recursive: true, force: true });
    } catch {
      fail('Loopback server startup cleanup failed.');
    }
    fail('Loopback server could not start.');
  }

  try {
    const owner = await acquireDisposableIdentity(server);
    await configureDisposableCliCredential(owner.token, dataDirectory);
    await publish(server, owner.token, fixtureModule, emptyDatabase);
    await publish(server, owner.token, fixtureModule, nonemptyDatabase);
    await publish(server, owner.token, fixtureModule, actualModuleDatabase);

    assert.equal(await count(server, owner.token, emptyDatabase, 'world_tile'), 61n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'world_tile'), 61n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player'), 1n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player'), 1n);

    await sql(
      server,
      owner.token,
      emptyDatabase,
      'DELETE FROM player WHERE fid = 424242',
    );
    await sql(
      server,
      owner.token,
      actualModuleDatabase,
      'DELETE FROM player WHERE fid = 424242',
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player'), 0n);

    // Advance every disposable database to the independently frozen deployed
    // seven-table checkpoint before proving the v3 append. This makes refs
    // 0-6, including their access/index contracts, the migration baseline.
    await publish(server, owner.token, additiveV2SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV2SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV2SchemaFixture, actualModuleDatabase);
    for (const database of [emptyDatabase, nonemptyDatabase, actualModuleDatabase]) {
      assert.equal(await count(server, owner.token, database, 'player_v2'), 0n);
      assert.equal(await count(server, owner.token, database, 'player_ownership_v2'), 0n);
    }

    const nonemptyLegacyBefore = outputDigest(await sql(
      server,
      owner.token,
      nonemptyDatabase,
      'SELECT * FROM player',
    ));
    const emptyWorldBefore = outputDigest(await sql(
      server,
      owner.token,
      emptyDatabase,
      'SELECT * FROM world_tile',
    ));
    const nonemptyWorldBefore = outputDigest(await sql(
      server,
      owner.token,
      nonemptyDatabase,
      'SELECT * FROM world_tile',
    ));
    const actualModuleWorldBefore = outputDigest(await sql(
      server,
      owner.token,
      actualModuleDatabase,
      'SELECT * FROM world_tile',
    ));

    const emptyBefore = await describe(server, owner.token, emptyDatabase);
    const nonemptyBefore = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleBefore = await describe(server, owner.token, actualModuleDatabase);
    assert.deepEqual(emptyBefore.tables.map(table => table.name).sort(), [
      'admin_audit', 'allowed_fid', 'castle', 'player', 'player_ownership_v2',
      'player_v2', 'world_tile',
    ]);

    await publish(server, owner.token, additiveV3SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveModule, nonemptyDatabase);
    await publish(server, owner.token, additiveModule, actualModuleDatabase);
    await verifyResolverHttpLifecycle(server, actualModuleDatabase, privateKey);
    const builtArtifactPath = join(additiveModule, 'dist', 'bundle.js');
    const builtArtifactDigest = createHash('sha256')
      .update(await readFile(builtArtifactPath))
      .digest('hex');

    const emptyAfter = await describe(server, owner.token, emptyDatabase);
    const nonemptyAfter = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleAfter = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveSchema(emptyBefore, emptyAfter);
    assertAdditiveSchema(nonemptyBefore, nonemptyAfter);
    assertAdditiveSchema(actualModuleBefore, actualModuleAfter);
    for (const name of [...existingTables, ...additiveV3Tables]) {
      assert.deepEqual(
        tableSignature(actualModuleAfter, name),
        tableSignature(emptyAfter, name),
      );
    }

    const idempotentSchemaBefore = schemaDigest(nonemptyAfter);
    await publishBuiltArtifact(
      server,
      owner.token,
      builtArtifactPath,
      nonemptyDatabase,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, nonemptyDatabase)),
      idempotentSchemaBefore,
    );

    // The actual module correctly rejects the disposable local identity at its
    // on-connect boundary. Re-publish the table-identical schema-only fixture
    // before querying preservation; this changes no table or row.
    await publish(server, owner.token, additiveV3SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV3SchemaFixture, actualModuleDatabase);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 0n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player'), 1n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player_ownership_v2'), 0n);
    for (const table of additiveV3Tables) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
      assert.equal(await count(server, owner.token, nonemptyDatabase, table), 0n);
      assert.equal(await count(server, owner.token, actualModuleDatabase, table), 0n);
    }
    assert.equal(outputDigest(await sql(
      server,
      owner.token,
      nonemptyDatabase,
      'SELECT * FROM player',
    )), nonemptyLegacyBefore);
    assert.equal(outputDigest(await sql(
      server,
      owner.token,
      emptyDatabase,
      'SELECT * FROM world_tile',
    )), emptyWorldBefore);
    assert.equal(outputDigest(await sql(
      server,
      owner.token,
      nonemptyDatabase,
      'SELECT * FROM world_tile',
    )), nonemptyWorldBefore);
    assert.equal(outputDigest(await sql(
      server,
      owner.token,
      actualModuleDatabase,
      'SELECT * FROM world_tile',
    )), actualModuleWorldBefore);

    await sql(
      server,
      owner.token,
      emptyDatabase,
      `INSERT INTO player_ownership_v2 (fid, identity) VALUES (999999, 0x${owner.identity})`,
    );
    await sql(
      server,
      owner.token,
      emptyDatabase,
      "INSERT INTO castle_slot_v1 (slot_id, realm_id, tile_key, q, r, generation_version) VALUES (999999, 'ROLLBACK_SENTINEL', 'rollback,sentinel', 99, -99, 2)",
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    const populatedV3SchemaDigest = schemaDigest(await describe(server, owner.token, emptyDatabase));

    const { identity: secondIdentity } = await acquireDisposableIdentity(server);
    await sql(
      server,
      owner.token,
      emptyDatabase,
      `INSERT INTO player_ownership_v2 (fid, identity) VALUES (999999, 0x${secondIdentity})`,
      false,
      /unique|constraint|duplicate|already exists/i,
    );
    await sql(
      server,
      owner.token,
      emptyDatabase,
      `INSERT INTO player_ownership_v2 (fid, identity) VALUES (1000000, 0x${owner.identity})`,
      false,
      /unique|constraint|duplicate|already exists/i,
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);

    await publish(
      server,
      owner.token,
      additiveV2SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV3SchemaDigest,
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    await publish(server, owner.token, additiveV3SchemaFixture, emptyDatabase);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    assert.equal(
      createHash('sha256').update(await readFile(builtArtifactPath)).digest('hex'),
      builtArtifactDigest,
    );

    console.log(
      `Additive protocol-v3 migration proof passed with SpacetimeDB ${expectedCliVersion}: `
      + 'seven deployed tables unchanged, 61-tile empty and synthetic nonempty fixtures preserved, '
      + '12 v3 tables appended with exact public/private contracts, '
      + 'exact resolver HTTP lifecycle enforced without mutation, '
      + 'prebuilt-artifact republish idempotent, populated v3 state retained, '
      + `and guarded v2 rollback refused before schema change. artifact_sha256=${builtArtifactDigest}`,
    );
  } finally {
    disposableCliCredential = null;
    await cleanupMigrationProofResources(serverProcess, dataDirectory);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof MigrationProofError
      ? error.message
      : 'Additive protocol-v3 migration proof failed closed.');
    process.exitCode = 1;
  });
}
