import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureModule = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/production-v1',
);
const additiveSchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v2-schema',
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
const existingTables = Object.freeze([
  'allowed_fid',
  'world_tile',
  'player',
  'castle',
  'admin_audit',
]);
const expectedProductTypeRefs = Object.freeze({
  allowed_fid: 0,
  world_tile: 1,
  player: 2,
  castle: 3,
  admin_audit: 4,
  player_v2: 5,
  player_ownership_v2: 6,
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
  assert.deepEqual(added, ['player_ownership_v2', 'player_v2']);
  assert.deepEqual(fieldNames(after, 'player_v2'), [
    'fid', 'username', 'display_name', 'pfp_url', 'joined_at', 'status',
  ]);
  assert.deepEqual(fieldNames(after, 'player_ownership_v2'), ['fid', 'identity']);
  assert.equal(access(after, 'player_v2'), 'Public');
  assert.equal(access(after, 'player_ownership_v2'), 'Private');
  assert.equal(tableSignature(after, 'player_v2').product_type_ref, expectedProductTypeRefs.player_v2);
  assert.equal(
    tableSignature(after, 'player_ownership_v2').product_type_ref,
    expectedProductTypeRefs.player_ownership_v2,
  );
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

async function stopServer(serverProcess) {
  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;
  await new Promise(resolvePromise => {
    let settled = false;
    let force;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (force !== undefined) clearTimeout(force);
      resolvePromise();
    };
    serverProcess.once('close', settle);
    try { serverProcess.kill('SIGTERM'); } catch { settle(); return; }
    force = setTimeout(() => {
      try { serverProcess.kill('SIGKILL'); } catch { /* Cleanup remains best effort. */ }
      settle();
    }, 5_000);
  });
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

  const serverProcess = spawn(command, [
    'start',
    '--listen-addr', `127.0.0.1:${port}`,
    '--in-memory',
    '--data-dir', dataDirectory,
    '--non-interactive',
  ], {
    cwd: repositoryRoot,
    env: childEnvironment(),
    stdio: 'ignore',
  });

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
      'admin_audit', 'allowed_fid', 'castle', 'player', 'world_tile',
    ]);

    await publish(server, owner.token, additiveSchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveModule, nonemptyDatabase);
    await publish(server, owner.token, additiveModule, actualModuleDatabase);
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
    for (const name of [...existingTables, 'player_v2', 'player_ownership_v2']) {
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
    await publish(server, owner.token, additiveSchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveSchemaFixture, actualModuleDatabase);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 0n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player'), 1n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player_ownership_v2'), 0n);
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
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    const partialSchemaDigest = schemaDigest(await describe(server, owner.token, emptyDatabase));

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
      fixtureModule,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      partialSchemaDigest,
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    await publish(server, owner.token, additiveSchemaFixture, emptyDatabase);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(
      createHash('sha256').update(await readFile(builtArtifactPath)).digest('hex'),
      builtArtifactDigest,
    );

    console.log(
      `Additive protocol-v2 migration proof passed with SpacetimeDB ${expectedCliVersion}: `
      + 'five legacy tables unchanged, 61-tile empty and synthetic nonempty fixtures preserved, '
      + 'v2 tables appended, prebuilt-artifact republish idempotent, partial state detected, '
      + `and guarded v1 rollback refused before schema change. artifact_sha256=${builtArtifactDigest}`,
    );
  } finally {
    disposableCliCredential = null;
    await stopServer(serverProcess);
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof MigrationProofError
    ? error.message
    : 'Additive protocol-v2 migration proof failed closed.');
  process.exitCode = 1;
});
