import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign as signBytes,
} from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION,
  ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION,
  formatAdditiveMigrationProofReceipt,
} from './spacetime-additive-migration-proof.mjs';
import {
  canonicalTableSchemaBoundaryDigest,
} from './spacetime-table-schema-attestation.mjs';

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
const additiveV4SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v4-schema',
);
const additiveV5SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v5-schema',
);
const additiveV6SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v6-schema',
);
const additiveV7SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v7-schema',
);
const additiveV8SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v8-schema',
);
const additiveV9SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v9-schema',
);
const additiveV10SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v10-schema',
);
const additiveV11SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v11-schema',
);
const additiveV12SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v12-schema',
);
const additiveV13SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v13-schema',
);
const additiveV14SchemaFixture = resolve(
  repositoryRoot,
  'spacetimedb/migration-fixtures/additive-v14-schema',
);
const additiveModule = resolve(repositoryRoot, 'spacetimedb');
const command = process.env.SPACETIME_BIN || 'spacetime';
const expectedCliVersion = ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION;
const expectedCliCommit = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const emptyDatabase = 'warpkeep-migration-empty';
const nonemptyDatabase = 'warpkeep-migration-nonempty';
const actualModuleDatabase = 'warpkeep-migration-actual-module';
const resourceLifecycleDatabase = 'warpkeep-migration-resource-lifecycle';
const expeditionLifecycleDatabase = 'warpkeep-migration-expedition-lifecycle';
const workerRolloutV11Database = 'warpkeep-migration-worker-rollout-v11';
const worldExpansionDatabase = 'warpkeep-migration-world-expansion';
const waterLifecycleDatabase = 'warpkeep-migration-water-lifecycle';
const populatedWaterStoneMigrationDatabase = 'warpkeep-migration-populated-water-stone';
const dailyMarksMigrationDatabase = 'warpkeep-migration-daily-marks-v14';
const maximumOutputBytes = 1_000_000;
const commandTimeoutMilliseconds = 120_000;
const procedureTimeoutMilliseconds = 5_000;
const maximumProcedureResponseBytes = 16_384;
const actualModuleFounderFid = 730_001;
const actualModuleOtherFid = 730_002;
// A JS-safe, intentionally absent loopback-only identity. It is never admitted
// and is used only to prove the private v13 access-request lifecycle.
const syntheticMissingAccessRequestFid = '9007199254740991';
const syntheticSecondAccessRequestFid = '9007199254740990';
const historicalEntryAgreementVersions = Object.freeze([
  '2026-07-19-hegemony-entry-agreement-v3',
  '2026-07-19-hegemony-entry-agreement-v2',
  '2026-07-18-hegemony-entry-agreement-v1',
  '2026-07-14',
]);
const alphaTermsVersion = '2026-07-31-hegemony-entry-agreement-v4';
const resourcePolicyVersion = 'genesis-resource-yield-v1';
const marksPolicyVersion = 'admitted-daily-mark-v1';
const profilePolicyVersion = 'trusted-snapchain-profile-v3';
const resourceQuantumMicros = 600_000_000n;
const expeditionScheduleWaitMilliseconds = 12 * 60 * 1_000;
const maximumU64 = (1n << 64n) - 1n;
const workerLegacyDrainCapability = 'genesis-001-worker-legacy-drain-v1';
const workerProtocolCapability = 'generic-castle-workers-v1';
const workerPolicyVersion = 'genesis-001-castle-workers-v1';
const workerResourceKinds = Object.freeze(['food', 'wood', 'stone', 'gold']);
const workerRehearsalSourceCommit = '1111111111111111111111111111111111111111';
const workerRehearsalClientArtifactDigest =
  '2222222222222222222222222222222222222222222222222222222222222222';
const legacyExpeditionMinuteMicros = 60_000_000n;
const startingResourceBalances = Object.freeze({
  food: 0n,
  wood: 0n,
  stone: 0n,
  gold: 0n,
});
const terrainResourceRates = Object.freeze({
  // Tier-I Gold comes exclusively from the separately bounded wagon
  // authority. Terrain settlement deliberately cannot mint Gold anymore.
  lowland: Object.freeze({ food: 8n, wood: 5n, stone: 3n, gold: 0n }),
  meadow: Object.freeze({ food: 10n, wood: 4n, stone: 2n, gold: 0n }),
  forest: Object.freeze({ food: 5n, wood: 10n, stone: 3n, gold: 0n }),
  heath: Object.freeze({ food: 5n, wood: 6n, stone: 5n, gold: 0n }),
  ridge: Object.freeze({ food: 3n, wood: 4n, stone: 10n, gold: 0n }),
  lake: Object.freeze({ food: 10n, wood: 4n, stone: 2n, gold: 0n }),
  'ancient-stone': Object.freeze({ food: 3n, wood: 4n, stone: 8n, gold: 0n }),
});
const expeditionResources = Object.freeze([
  Object.freeze({
    kind: 'gold',
    siteId: 'genesis-001-tier1-gold-07',
    routeSteps: 18n,
    siteCount: 24n,
    sitePolicyVersion: 'genesis-001-tier1-gold-sites-v3',
    seedReducer: 'admin_seed_genesis_tier_i_gold_sites_v1',
    dispatchReducer: 'dispatch_gold_expedition_v1',
    collectReducer: 'collect_gold_expedition_v1',
    stateProcedure: 'get_my_gold_expedition_state_v1',
    siteTable: 'gold_site_v1',
    occupationTable: 'gold_node_occupation_v1',
    expeditionTable: 'gold_expedition_v1',
    idempotencyTable: 'gold_expedition_idempotency_v1',
    scheduleTable: 'gold_expedition_schedule_v_1',
  }),
  Object.freeze({
    kind: 'food',
    siteId: 'genesis-001-tier1-food-006',
    routeSteps: 18n,
    siteCount: 96n,
    sitePolicyVersion: 'genesis-001-tier1-food-sites-v2',
    seedReducer: 'admin_seed_genesis_tier_i_food_sites_v1',
    dispatchReducer: 'dispatch_food_expedition_v1',
    collectReducer: 'collect_food_expedition_v1',
    stateProcedure: 'get_my_food_expedition_state_v1',
    siteTable: 'food_site_v1',
    occupationTable: 'food_node_occupation_v1',
    expeditionTable: 'food_expedition_v1',
    idempotencyTable: 'food_expedition_idempotency_v1',
    scheduleTable: 'food_expedition_schedule_v_1',
  }),
  Object.freeze({
    kind: 'wood',
    siteId: 'genesis-001-tier1-wood-012',
    routeSteps: 22n,
    siteCount: 96n,
    sitePolicyVersion: 'genesis-001-tier1-wood-sites-v2',
    seedReducer: 'admin_seed_genesis_tier_i_wood_sites_v1',
    dispatchReducer: 'dispatch_wood_expedition_v1',
    collectReducer: 'collect_wood_expedition_v1',
    stateProcedure: 'get_my_wood_expedition_state_v1',
    siteTable: 'wood_site_v1',
    occupationTable: 'wood_node_occupation_v1',
    expeditionTable: 'wood_expedition_v1',
    idempotencyTable: 'wood_expedition_idempotency_v1',
    scheduleTable: 'wood_expedition_schedule_v_1',
  }),
  Object.freeze({
    kind: 'stone',
    siteId: 'genesis-001-tier1-stone-007',
    routeSteps: 22n,
    siteCount: 96n,
    sitePolicyVersion: 'genesis-001-tier1-stone-sites-v3',
    seedReducer: 'admin_seed_genesis_tier_i_stone_sites_v1',
    dispatchReducer: 'dispatch_stone_expedition_v1',
    collectReducer: 'collect_stone_expedition_v1',
    stateProcedure: 'get_my_stone_expedition_state_v1',
    siteTable: 'stone_site_v1',
    occupationTable: 'stone_node_occupation_v1',
    expeditionTable: 'stone_expedition_v1',
    idempotencyTable: 'stone_expedition_idempotency_v1',
    scheduleTable: 'stone_expedition_schedule_v_1',
  }),
]);
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
const additiveV4Tables = Object.freeze([
  'resource_account_v1',
]);
const additiveV5Tables = Object.freeze([
  'gold_site_v1',
  'gold_node_occupation_v1',
  'gold_expedition_v1',
  'gold_expedition_idempotency_v1',
  'gold_expedition_schedule_v_1',
]);
const additiveV6Tables = Object.freeze([
  'realm_forest_layout_v1',
  'realm_forest_instance_v1',
]);
const additiveV7Tables = Object.freeze([
  'food_site_v1',
  'food_node_occupation_v1',
  'food_expedition_v1',
  'food_expedition_idempotency_v1',
  'food_expedition_schedule_v_1',
]);
const additiveV8Tables = Object.freeze([
  'wood_site_v1',
  'wood_node_occupation_v1',
  'wood_expedition_v1',
  'wood_expedition_idempotency_v1',
  'wood_expedition_schedule_v_1',
]);
const additiveV9Tables = Object.freeze([
  'realm_water_layout_v1',
  'realm_water_body_v1',
  'realm_water_cell_v1',
  'realm_environment_v1',
]);
const additiveV10Tables = Object.freeze([
  'stone_site_v1',
  'stone_node_occupation_v1',
  'stone_expedition_v1',
  'stone_expedition_idempotency_v1',
  'stone_expedition_schedule_v_1',
]);
const additiveV11Tables = Object.freeze([
  'realm_water_revision_v1',
]);
const additiveV12Tables = Object.freeze([
  'realm_worker_system_v1',
  'castle_worker_v1',
  'worker_assignment_v1',
  'worker_node_occupation_v1',
  'worker_command_idempotency_v1',
  'worker_assignment_schedule_v_1',
]);
const additiveV13Tables = Object.freeze([
  'access_request_v1',
]);
const additiveV14Tables = Object.freeze([
  'daily_mark_grant_v1',
  'daily_mark_schedule_v_1',
]);
const deployedV3Tables = Object.freeze([
  ...existingTables,
  ...additiveV3Tables,
]);
const deployedV4Tables = Object.freeze([
  ...deployedV3Tables,
  ...additiveV4Tables,
]);
const deployedV5Tables = Object.freeze([
  ...deployedV4Tables,
  ...additiveV5Tables,
]);
const deployedV6Tables = Object.freeze([
  ...deployedV5Tables,
  ...additiveV6Tables,
]);
const deployedV7Tables = Object.freeze([
  ...deployedV6Tables,
  ...additiveV7Tables,
]);
const deployedV8Tables = Object.freeze([
  ...deployedV7Tables,
  ...additiveV8Tables,
]);
const deployedV9Tables = Object.freeze([
  ...deployedV8Tables,
  ...additiveV9Tables,
]);
const deployedV10Tables = Object.freeze([
  ...deployedV9Tables,
  ...additiveV10Tables,
]);
const deployedV11Tables = Object.freeze([
  ...deployedV10Tables,
  ...additiveV11Tables,
]);
const deployedV12Tables = Object.freeze([
  ...deployedV11Tables,
  ...additiveV12Tables,
]);
const deployedV13Tables = Object.freeze([
  ...deployedV12Tables,
  ...additiveV13Tables,
]);
const deployedV14Tables = Object.freeze([
  ...deployedV13Tables,
  ...additiveV14Tables,
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
  resource_account_v1: 19,
  gold_site_v1: 20,
  gold_node_occupation_v1: 21,
  gold_expedition_v1: 22,
  gold_expedition_idempotency_v1: 23,
  gold_expedition_schedule_v_1: 24,
  realm_forest_layout_v1: 25,
  realm_forest_instance_v1: 26,
  food_site_v1: 27,
  food_node_occupation_v1: 28,
  food_expedition_v1: 29,
  food_expedition_idempotency_v1: 30,
  food_expedition_schedule_v_1: 31,
  wood_site_v1: 32,
  wood_node_occupation_v1: 33,
  wood_expedition_v1: 34,
  wood_expedition_idempotency_v1: 35,
  wood_expedition_schedule_v_1: 36,
  realm_water_layout_v1: 37,
  realm_water_body_v1: 38,
  realm_water_cell_v1: 39,
  realm_environment_v1: 40,
  stone_site_v1: 41,
  stone_node_occupation_v1: 42,
  stone_expedition_v1: 43,
  stone_expedition_idempotency_v1: 44,
  stone_expedition_schedule_v_1: 45,
  realm_water_revision_v1: 46,
  realm_worker_system_v1: 47,
  castle_worker_v1: 48,
  worker_assignment_v1: 49,
  worker_node_occupation_v1: 50,
  worker_command_idempotency_v1: 51,
  worker_assignment_schedule_v_1: 52,
  access_request_v1: 53,
  daily_mark_grant_v1: 54,
  daily_mark_schedule_v_1: 55,
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
    .replace(
      new RegExp(`\\b(?:${actualModuleFounderFid}|${actualModuleOtherFid})\\b`, 'g'),
      '[local-founder-redacted]',
    )
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

async function assertFixtureOwnershipCount(server, token, database, fid, expectedCount) {
  if (!Number.isSafeInteger(fid) || !Number.isSafeInteger(expectedCount) || fid < 0 || expectedCount < 0) {
    fail('Fixture ownership assertion bounds were invalid.');
  }
  await callLoopbackReducer(
    server,
    database,
    'fixture_assert_player_ownership_v9',
    token,
    JSON.stringify([fid, expectedCount]),
    200,
  );
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

function projectedTableSchemaBoundaryDigest(description, tableNames) {
  const selected = new Set(tableNames);
  return canonicalTableSchemaBoundaryDigest({
    ...description,
    tables: description.tables.filter(table => selected.has(table?.name)),
  }, tableNames);
}

function outputDigest(output) {
  return createHash('sha256').update(output.replace(/\r\n/g, '\n').trim()).digest('hex');
}

async function tableRowDigests(server, token, database, tables) {
  const digests = {};
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/.test(table)) fail('Unsafe fixture table name.');
    const queries = table === 'world_tile'
      ? [
          'q <= -44',
          'q >= -43 AND q <= -29',
          'q >= -28 AND q <= -14',
          'q >= -13 AND q <= 0',
          'q >= 1 AND q <= 15',
          'q >= 16 AND q <= 30',
          'q >= 31 AND q <= 45',
          'q >= 46',
        ].map(predicate => `SELECT * FROM ${table} WHERE ${predicate}`)
      : table === 'world_tile_meta_v1'
        ? Array.from(
            { length: 8 },
            (_, index) => (
              `SELECT * FROM ${table} WHERE ring >= ${index * 8} `
              + `AND ring <= ${index * 8 + 7}`
            ),
          )
        : [`SELECT * FROM ${table}`];
    const partitions = [];
    for (const query of queries) {
      partitions.push(await sql(server, token, database, query));
    }
    digests[table] = outputDigest(partitions.join('\0'));
  }
  return Object.freeze(digests);
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

function assertAdditiveV3Schema(before, after) {
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

function assertDeployedV3TablesUnchanged(before, after) {
  for (const name of deployedV3Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV4Schema(before, after) {
  assertDeployedV3TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV4Tables].sort());
  assert.deepEqual(fieldNames(after, 'resource_account_v1'), [
    'fid', 'castle_id', 'realm_id', 'food', 'wood', 'stone', 'gold',
    'settled_through_micros', 'revision', 'policy_version', 'created_at',
    'updated_at',
  ]);
  assert.equal(access(after, 'resource_account_v1'), 'Private');
  assert.equal(
    tableSignature(after, 'resource_account_v1').product_type_ref,
    expectedProductTypeRefs.resource_account_v1,
  );
}

function assertDeployedV4TablesUnchanged(before, after) {
  for (const name of deployedV4Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV5Schema(before, after) {
  assertDeployedV4TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV5Tables].sort());

  const contracts = {
    gold_site_v1: {
      access: 'Public',
      fields: ['site_id', 'q', 'r', 'tier', 'active'],
    },
    gold_node_occupation_v1: {
      access: 'Public',
      fields: [
        'site_id', 'origin_castle_id', 'phase', 'started_at_micros',
        'arrives_at_micros', 'gathering_ends_at_micros', 'returns_at_micros',
      ],
    },
    gold_expedition_v1: {
      access: 'Private',
      fields: [
        'expedition_id', 'fid', 'origin_castle_id', 'site_id', 'phase',
        'started_at_micros', 'arrives_at_micros', 'gathering_ends_at_micros',
        'returns_at_micros', 'settled_through_micros', 'accrued_gold',
        'credited_gold', 'policy_version', 'created_at', 'updated_at',
      ],
    },
    gold_expedition_idempotency_v1: {
      access: 'Private',
      fields: ['request_key', 'fid', 'site_id', 'expedition_id', 'created_at'],
    },
    gold_expedition_schedule_v_1: {
      access: 'Public',
      fields: ['schedule_id', 'scheduled_at', 'origin_castle_id', 'site_id', 'stage'],
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

function assertDeployedV5TablesUnchanged(before, after) {
  for (const name of deployedV5Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV6Schema(before, after) {
  assertDeployedV5TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV6Tables].sort());

  const contracts = {
    realm_forest_layout_v1: {
      access: 'Public',
      fields: [
        'realm_id', 'layout_version', 'policy_version', 'layout_digest',
        'asset_catalog_digest', 'instance_count', 'seeded_at',
      ],
    },
    realm_forest_instance_v1: {
      access: 'Public',
      fields: [
        'tree_id', 'realm_id', 'tile_key', 'q', 'r',
        'local_x_microunits', 'local_z_microunits',
        'world_x_microunits', 'world_z_microunits',
        'rotation_milli_degrees', 'scale_basis_points', 'species_id',
        'habitat', 'layout_version',
      ],
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

function assertDeployedV6TablesUnchanged(before, after) {
  for (const name of deployedV6Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV7Schema(before, after) {
  assertDeployedV6TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV7Tables].sort());

  const contracts = {
    food_site_v1: {
      access: 'Public',
      fields: ['site_id', 'q', 'r', 'tier', 'active'],
    },
    food_node_occupation_v1: {
      access: 'Public',
      fields: [
        'site_id', 'origin_castle_id', 'phase', 'started_at_micros',
        'arrives_at_micros', 'gathering_ends_at_micros', 'returns_at_micros',
      ],
    },
    food_expedition_v1: {
      access: 'Private',
      fields: [
        'expedition_id', 'fid', 'origin_castle_id', 'site_id', 'phase',
        'started_at_micros', 'arrives_at_micros', 'gathering_ends_at_micros',
        'returns_at_micros', 'settled_through_micros', 'accrued_food',
        'credited_food', 'policy_version', 'created_at', 'updated_at',
      ],
    },
    food_expedition_idempotency_v1: {
      access: 'Private',
      fields: ['request_key', 'fid', 'site_id', 'expedition_id', 'created_at'],
    },
    food_expedition_schedule_v_1: {
      access: 'Public',
      fields: ['schedule_id', 'scheduled_at', 'origin_castle_id', 'site_id', 'stage'],
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

function assertDeployedV7TablesUnchanged(before, after) {
  for (const name of deployedV7Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV8Schema(before, after) {
  assertDeployedV7TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV8Tables].sort());

  const contracts = {
    wood_site_v1: {
      access: 'Public',
      fields: ['site_id', 'q', 'r', 'tier', 'active'],
    },
    wood_node_occupation_v1: {
      access: 'Public',
      fields: [
        'site_id', 'origin_castle_id', 'phase', 'started_at_micros',
        'arrives_at_micros', 'gathering_ends_at_micros', 'returns_at_micros',
      ],
    },
    wood_expedition_v1: {
      access: 'Private',
      fields: [
        'expedition_id', 'fid', 'origin_castle_id', 'site_id', 'phase',
        'started_at_micros', 'arrives_at_micros', 'gathering_ends_at_micros',
        'returns_at_micros', 'settled_through_micros', 'accrued_wood',
        'credited_wood', 'policy_version', 'created_at', 'updated_at',
      ],
    },
    wood_expedition_idempotency_v1: {
      access: 'Private',
      fields: ['request_key', 'fid', 'site_id', 'expedition_id', 'created_at'],
    },
    wood_expedition_schedule_v_1: {
      access: 'Public',
      fields: ['schedule_id', 'scheduled_at', 'origin_castle_id', 'site_id', 'stage'],
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

function assertDeployedV8TablesUnchanged(before, after) {
  for (const name of deployedV8Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV9Schema(before, after) {
  assertDeployedV8TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV9Tables].sort());

  const contracts = {
    realm_water_layout_v1: {
      access: 'Public',
      fields: [
        'realm_id', 'layout_version', 'policy_version', 'generation_version',
        'canonical_land_cell_count', 'ocean_cell_count', 'lake_cell_count',
        'lake_body_count', 'river_count', 'river_cell_count', 'sea_level_milli',
        'sea_level_policy_version', 'fog_start_depth_cells', 'fog_full_depth_cells',
        'hidden_buffer_cells', 'layout_digest', 'source_commit', 'activated',
        'seeded_at', 'activated_at',
      ],
    },
    realm_water_body_v1: {
      access: 'Public',
      fields: [
        'body_id', 'realm_id', 'regime', 'cell_count', 'source_cell_key',
        'mouth_cell_key', 'surface_level_milli', 'flow_direction_xq_15',
        'flow_direction_zq_15', 'wave_preset', 'ordinal', 'seed',
        'generation_version', 'layout_version',
      ],
    },
    realm_water_cell_v1: {
      access: 'Public',
      fields: [
        'cell_key', 'realm_id', 'q', 'r', 'regime', 'body_id', 'depth_cells',
        'elevation_milli', 'surface_level_milli', 'ring', 's',
        'underlying_tile_key', 'river_ordinal', 'river_order',
        'downstream_water_cell_key', 'flow_accumulation', 'depth_class',
        'ocean_depth', 'bank_seed', 'generation_version', 'fog_band',
        'layout_version',
      ],
    },
    realm_environment_v1: {
      access: 'Public',
      fields: [
        'realm_id', 'environment_epoch', 'water_layout_version', 'sea_level_milli',
        'sun_direction_x_micro', 'sun_direction_y_micro', 'sun_direction_z_micro',
        'updated_at',
      ],
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

function assertDeployedV9TablesUnchanged(before, after) {
  for (const name of deployedV9Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV10Schema(before, after) {
  assertDeployedV9TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV10Tables].sort());

  const contracts = {
    stone_site_v1: {
      access: 'Public',
      fields: ['site_id', 'q', 'r', 'tier', 'active'],
    },
    stone_node_occupation_v1: {
      access: 'Public',
      fields: [
        'site_id', 'origin_castle_id', 'phase', 'started_at_micros',
        'arrives_at_micros', 'gathering_ends_at_micros', 'returns_at_micros',
      ],
    },
    stone_expedition_v1: {
      access: 'Private',
      fields: [
        'expedition_id', 'fid', 'origin_castle_id', 'site_id', 'phase',
        'started_at_micros', 'arrives_at_micros', 'gathering_ends_at_micros',
        'returns_at_micros', 'settled_through_micros', 'accrued_stone',
        'credited_stone', 'policy_version', 'created_at', 'updated_at',
      ],
    },
    stone_expedition_idempotency_v1: {
      access: 'Private',
      fields: ['request_key', 'fid', 'site_id', 'expedition_id', 'created_at'],
    },
    stone_expedition_schedule_v_1: {
      access: 'Public',
      fields: ['schedule_id', 'scheduled_at', 'origin_castle_id', 'site_id', 'stage'],
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

function assertDeployedV10TablesUnchanged(before, after) {
  for (const name of deployedV10Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV11Schema(before, after) {
  assertDeployedV10TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV11Tables].sort());
  assert.deepEqual(fieldNames(after, 'realm_water_revision_v1'), [
    'realm_id', 'revision_version', 'policy_version', 'base_layout_version',
    'base_layout_digest', 'ocean_body_count', 'river_body_count',
    'enabled_body_count', 'ocean_cell_count', 'river_cell_count',
    'enabled_cell_count', 'lake_body_count', 'lake_cell_count',
    'river_width_cells', 'navigation_fog_boundary_depth_cells',
    'hidden_buffer_cells', 'revision_digest', 'source_commit', 'activated',
    'seeded_at', 'activated_at',
  ]);
  assert.equal(access(after, 'realm_water_revision_v1'), 'Public');
  assert.equal(
    tableSignature(after, 'realm_water_revision_v1').product_type_ref,
    expectedProductTypeRefs.realm_water_revision_v1,
  );
}

function assertDeployedV11TablesUnchanged(before, after) {
  for (const name of deployedV11Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV12Schema(before, after) {
  assertDeployedV11TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV12Tables].sort());
  const contracts = {
    realm_worker_system_v1: {
      access: 'Public',
      fields: [
        'realm_id', 'policy_version', 'workers_per_castle', 'expected_castle_count',
        'expected_worker_count', 'roster_digest', 'mode', 'legacy_drain_required',
        'created_at', 'activated_at',
      ],
    },
    castle_worker_v1: {
      access: 'Public',
      fields: [
        'worker_id', 'origin_castle_id', 'ordinal', 'status', 'resource_kind',
        'site_id', 'started_at_micros', 'arrives_at_micros',
        'gathering_ends_at_micros', 'return_started_at_micros',
        'returns_at_micros', 'route_steps', 'return_start_progress_basis_points',
        'timeline_revision', 'revision',
      ],
    },
    worker_assignment_v1: {
      access: 'Private',
      fields: [
        'assignment_id', 'worker_id', 'fid', 'origin_castle_id', 'resource_kind',
        'site_id', 'phase', 'started_at_micros', 'arrives_at_micros',
        'gathering_ends_at_micros', 'return_started_at_micros',
        'returns_at_micros', 'route_steps', 'return_start_progress_basis_points',
        'settled_through_micros', 'accrued_amount', 'materialized_amount',
        'timeline_revision', 'policy_version', 'created_at', 'updated_at',
      ],
    },
    worker_node_occupation_v1: {
      access: 'Public',
      fields: [
        'node_key', 'resource_kind', 'site_id', 'worker_id', 'worker_ordinal',
        'origin_castle_id', 'phase', 'started_at_micros', 'arrives_at_micros',
        'gathering_ends_at_micros', 'timeline_revision',
      ],
    },
    worker_command_idempotency_v1: {
      access: 'Private',
      fields: [
        'request_key', 'fid', 'worker_id', 'command_kind', 'resource_kind',
        'site_id', 'assignment_id', 'result_revision', 'created_at',
      ],
    },
    worker_assignment_schedule_v_1: {
      access: 'Private',
      fields: [
        'schedule_id', 'scheduled_at', 'assignment_id', 'worker_id',
        'timeline_revision', 'stage',
      ],
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

function assertDeployedV12TablesUnchanged(before, after) {
  for (const name of deployedV12Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV13Schema(before, after) {
  assertDeployedV12TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV13Tables]);
  assert.deepEqual(fieldNames(after, 'access_request_v1'), [
    'fid',
    'request_cycle',
    'requested_at',
  ]);
  assert.equal(access(after, 'access_request_v1'), 'Private');
  assert.equal(
    tableSignature(after, 'access_request_v1').product_type_ref,
    expectedProductTypeRefs.access_request_v1,
  );
}

function assertDeployedV13TablesUnchanged(before, after) {
  for (const name of deployedV13Tables) {
    assert.deepEqual(tableSignature(after, name), tableSignature(before, name));
    assert.equal(
      tableSignature(after, name).product_type_ref,
      expectedProductTypeRefs[name],
    );
  }
}

function assertAdditiveV14Schema(before, after) {
  assertDeployedV13TablesUnchanged(before, after);
  const beforeNames = new Set(before.tables.map(table => table.name));
  const added = after.tables
    .map(table => table.name)
    .filter(name => !beforeNames.has(name))
    .sort();
  assert.deepEqual(added, [...additiveV14Tables].sort());
  const contracts = {
    daily_mark_grant_v1: {
      access: 'Private',
      fields: [
        'grant_key', 'fid', 'utc_day', 'amount_micros', 'policy_version',
        'granted_at',
      ],
    },
    daily_mark_schedule_v_1: {
      access: 'Private',
      fields: ['schedule_id', 'scheduled_at', 'policy_version'],
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

function accessRequestServiceClaims(requestFid, requestOperation) {
  const canonicalRequestFid = typeof requestFid === 'number'
    && Number.isSafeInteger(requestFid)
    ? String(requestFid)
    : requestFid;
  if (
    typeof canonicalRequestFid !== 'string'
    || !/^[1-9][0-9]{0,15}$/.test(canonicalRequestFid)
    || BigInt(canonicalRequestFid) > BigInt(Number.MAX_SAFE_INTEGER)
  ) fail('Disposable access-request resolver FID was invalid.');
  if (requestOperation !== 'status' && requestOperation !== 'submit') {
    fail('Disposable access-request resolver operation was invalid.');
  }
  return {
    ...serviceClaims(
      'service:access-request-resolver',
      ['warpkeep-access-request-resolver'],
      15,
    ),
    // Production resolver FIDs are canonical decimal-string JWT claims.
    request_fid: canonicalRequestFid,
    request_operation: requestOperation,
  };
}

function adminServiceClaims() {
  return serviceClaims('service:hermes', ['warpkeep-admin'], 240);
}

function playerClaims(
  fid,
  subject = `farcaster:${fid}`,
  authEpoch = 1,
  lifetimeSeconds = 240,
) {
  if (
    !Number.isSafeInteger(fid)
    || fid <= 0
    || !Number.isSafeInteger(authEpoch)
    || authEpoch <= 0
    || !Number.isSafeInteger(lifetimeSeconds)
    || lifetimeSeconds <= 0
    || lifetimeSeconds > 600
  ) fail('Disposable player claim was invalid.');
  const base = serviceClaims(subject, [], lifetimeSeconds);
  return {
    ...base,
    auth_version: 2,
    fid: String(fid),
    auth_epoch: authEpoch,
    session_iat: base.iat,
    session_exp: base.exp,
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
  expectJsonSuccess = true,
  timeoutMilliseconds = procedureTimeoutMilliseconds,
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
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
  } catch {
    fail('Loopback procedure request failed within its fixed boundary.');
  }
  const responseText = await readBoundedProcedureResponse(response, credential);
  if (response.status !== expectedStatus) {
    fail(
      `Loopback procedure ${procedure} returned status ${response.status}; expected ${expectedStatus}.`,
    );
  }
  if (
    expectedStatus === 200
    && expectJsonSuccess
    && response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
  ) fail('Loopback procedure returned an unexpected media type.');
  return responseText;
}

async function callLoopbackReducer(
  server,
  database,
  reducer,
  credential,
  body,
  expectedStatus,
  timeoutMilliseconds = procedureTimeoutMilliseconds,
) {
  return callLoopbackProcedure(
    server,
    database,
    reducer,
    credential,
    body,
    expectedStatus,
    false,
    timeoutMilliseconds,
  );
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

function readCanonicalUnsigned(value, maximum, label) {
  let parsed;
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    parsed = BigInt(value);
  } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    parsed = BigInt(value);
  } else {
    fail(`Loopback ${label} was not a canonical unsigned integer.`);
  }
  if (parsed > maximum) fail(`Loopback ${label} exceeded its integer bound.`);
  return parsed;
}

function parseLoopbackJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`Loopback ${label} response was invalid.`);
  }
}

function parseLoopbackOption(value, label, parseSome) {
  // SpacetimeDB's procedure and reducer JSON surfaces have used direct,
  // variant-tagged, and compact-array option representations. Accept only the
  // exact shapes of those encodings, then validate the contained scalar.
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.length === 1) return parseSome(value[0]);
    if (
      value.length === 2
      && (value[0] === 0 || (typeof value[0] === 'string' && value[0].toLowerCase() === 'some'))
    ) return parseSome(value[1]);
    if (
      value.length === 2
      && (value[0] === 1 || (typeof value[0] === 'string' && value[0].toLowerCase() === 'none'))
      && (value[1] === null || (Array.isArray(value[1]) && value[1].length === 0))
    ) return undefined;
    fail(`Loopback ${label} option was invalid.`);
  }
  if (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 1
  ) {
    if (Object.hasOwn(value, 'some')) return parseSome(value.some);
    if (Object.hasOwn(value, 'none') && Array.isArray(value.none) && value.none.length === 0) {
      return undefined;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const tag = typeof value.tag === 'string' ? value.tag.toLowerCase() : undefined;
    if (tag === 'some' && Object.keys(value).length === 2 && Object.hasOwn(value, 'value')) {
      return parseSome(value.value);
    }
    if (
      tag === 'none'
      && (Object.keys(value).length === 1
        || (Object.keys(value).length === 2 && Object.hasOwn(value, 'value')))
    ) return undefined;
  }
  try {
    return parseSome(value);
  } catch (error) {
    if (error instanceof MigrationProofError) throw error;
    fail(`Loopback ${label} option was invalid.`);
  }
}

function parseAccessRequestStatus(text, label) {
  const value = parseLoopbackJson(text, label);
  if (
    !Array.isArray(value)
    || value.length !== 2
    || !['not_requested', 'requested', 'already_admitted'].includes(value[0])
  ) fail(`Loopback ${label} response contract was invalid.`);
  const requestedAtMicros = parseLoopbackOption(
    value[1],
    `${label} timestamp`,
    item => readCanonicalUnsigned(item, maximumU64, `${label} timestamp`),
  );
  if (
    (value[0] === 'requested') !== (requestedAtMicros !== undefined)
  ) fail(`Loopback ${label} timestamp presence was invalid.`);
  return Object.freeze({
    status: value[0],
    requestedAtMicros,
  });
}

function parseAdminAccessRequestResetStatus(text) {
  const value = parseLoopbackJson(text, 'access-request reset status');
  if (
    !Array.isArray(value)
    || value.length !== 5
    || !['enabled', 'disabled'].includes(value[0])
    || !['not_requested', 'pending', 'resolved'].includes(value[2])
  ) fail('Loopback access-request reset status contract was invalid.');
  const authEpochBigInt = readCanonicalUnsigned(
    value[1],
    0xffff_ffffn,
    'access-request reset auth epoch',
  );
  if (authEpochBigInt < 1n) {
    fail('Loopback access-request reset auth epoch was invalid.');
  }
  const requestCycle = parseLoopbackOption(
    value[3],
    'access-request reset cycle',
    item => readCanonicalUnsigned(item, maximumU64, 'access-request reset cycle'),
  );
  const requestedAtMicros = parseLoopbackOption(
    value[4],
    'access-request reset timestamp',
    item => readCanonicalUnsigned(item, maximumU64, 'access-request reset timestamp'),
  );
  if ((requestCycle === undefined) !== (requestedAtMicros === undefined)) {
    fail('Loopback access-request reset tuple was incomplete.');
  }
  const expectedRequestState = requestCycle === undefined
    ? 'not_requested'
    : value[0] === 'disabled' && requestCycle === authEpochBigInt + 1n
      ? 'pending'
      : 'resolved';
  if (value[2] !== expectedRequestState) {
    fail('Loopback access-request reset state was inconsistent.');
  }
  return Object.freeze({
    admissionState: value[0],
    authEpoch: Number(authEpochBigInt),
    requestState: value[2],
    requestCycle,
    requestedAtMicros,
  });
}

function parseAdminAccessRequestPage(text) {
  const value = parseLoopbackJson(text, 'access-request admin page');
  if (
    !Array.isArray(value)
    || value.length !== 6
    || !Array.isArray(value[0])
    || typeof value[3] !== 'boolean'
  ) fail('Loopback access-request admin page contract was invalid.');
  const entries = value[0].map(entry => {
    if (
      !Array.isArray(entry)
      || entry.length !== 4
      || !['missing', 'disabled', 'enabled'].includes(entry[2])
      || !['pending', 'resolved'].includes(entry[3])
      || (entry[2] === 'enabled' && entry[3] === 'pending')
    ) fail('Loopback access-request admin entry contract was invalid.');
    return Object.freeze({
      fid: readCanonicalUnsigned(entry[0], maximumU64, 'access-request admin FID'),
      requestedAtMicros: readCanonicalUnsigned(
        entry[1],
        maximumU64,
        'access-request admin timestamp',
      ),
      admissionState: entry[2],
      requestState: entry[3],
    });
  });
  return Object.freeze({
    entries: Object.freeze(entries),
    nextRequestedAtMicros: parseLoopbackOption(
      value[1],
      'access-request admin timestamp cursor',
      item => readCanonicalUnsigned(
        item,
        maximumU64,
        'access-request admin timestamp cursor',
      ),
    ),
    nextFid: parseLoopbackOption(
      value[2],
      'access-request admin FID cursor',
      item => readCanonicalUnsigned(item, maximumU64, 'access-request admin FID cursor'),
    ),
    hasMore: value[3],
    totalRequests: readCanonicalUnsigned(
      value[4],
      maximumU64,
      'access-request admin total',
    ),
    pendingRequests: readCanonicalUnsigned(
      value[5],
      maximumU64,
      'access-request admin pending total',
    ),
  });
}

/**
 * Exercise the complete request lifecycle against one disposable populated
 * v13 database. Every request call gets a new exact 15-second FID-bound
 * principal; output contains neither the synthetic FID nor a timestamp.
 */
async function verifyAccessRequestHttpLifecycle(server, database, privateKey) {
  let stage = 'request-status';
  const requestCredential = (
    operation,
    fid = syntheticMissingAccessRequestFid,
  ) => createEphemeralJwt(
    privateKey,
    accessRequestServiceClaims(fid, operation),
  );
  const submitConcurrentBatch = async (fid, concurrency, label) => {
    const texts = await Promise.all(Array.from({ length: concurrency }, () => (
      callLoopbackProcedure(
        server,
        database,
        'access_request_submit_v1',
        requestCredential('submit', fid),
        '[]',
        200,
      )
    )));
    const results = texts.map((text, index) => parseAccessRequestStatus(
      text,
      `${label} access-request status ${index + 1}`,
    ));
    const first = results[0];
    if (!first || first.status !== 'requested' || first.requestedAtMicros === undefined) {
      fail(`Loopback ${label} access-request batch omitted its canonical result.`);
    }
    for (const result of results) assert.deepEqual(result, first);
    return first;
  };
  try {
    const initial = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_get_status_v1',
        requestCredential('status'),
        '[]',
        200,
      ),
      'initial access-request status',
    );
    assert.deepEqual(initial, {
      status: 'not_requested',
      requestedAtMicros: undefined,
    });

    stage = 'request-submit';
    const submitted = await submitConcurrentBatch(
      syntheticMissingAccessRequestFid,
      2,
      'two-call concurrent',
    );
    if (submitted.requestedAtMicros === undefined || submitted.requestedAtMicros <= 0n) {
      fail('Loopback access-request submission omitted its database timestamp.');
    }

    stage = 'request-ten-call-concurrency';
    const tenCallResult = await submitConcurrentBatch(
      syntheticMissingAccessRequestFid,
      10,
      'ten-call concurrent',
    );
    assert.deepEqual(tenCallResult, submitted);

    stage = 'request-fifty-call-concurrency';
    const fiftyCallResult = await submitConcurrentBatch(
      syntheticMissingAccessRequestFid,
      50,
      'fifty-call concurrent',
    );
    assert.deepEqual(fiftyCallResult, submitted);

    stage = 'request-second-fid';
    const secondSubmitted = await submitConcurrentBatch(
      syntheticSecondAccessRequestFid,
      2,
      'second-FID concurrent',
    );
    if (
      secondSubmitted.requestedAtMicros === undefined
      || secondSubmitted.requestedAtMicros <= 0n
    ) fail('Loopback second-FID access request omitted its database timestamp.');

    stage = 'request-final-status';
    const finalStatus = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_get_status_v1',
        requestCredential('status'),
        '[]',
        200,
      ),
      'final access-request status',
    );
    assert.deepEqual(finalStatus, submitted);

    stage = 'request-admin-denial';
    await callLoopbackProcedure(
      server,
      database,
      'admin_list_access_requests_v1',
      requestCredential('status'),
      '[0,0,100,false]',
      500,
    );

    stage = 'request-metadata-denial';
    await callLoopbackProcedure(
      server,
      database,
      'get_alpha_backend_info',
      requestCredential('status'),
      '[]',
      500,
    );

    stage = 'request-gameplay-denial';
    await callLoopbackProcedure(
      server,
      database,
      'get_my_resource_state_v1',
      requestCredential('status'),
      '[]',
      500,
    );

    stage = 'request-admin-listing';
    const page = parseAdminAccessRequestPage(await callLoopbackProcedure(
      server,
      database,
      'admin_list_access_requests_v1',
      createEphemeralJwt(privateKey, adminServiceClaims()),
      '[0,0,100,false]',
      200,
    ));
    assert.equal(page.nextRequestedAtMicros, undefined);
    assert.equal(page.nextFid, undefined);
    assert.equal(page.hasMore, false);
    assert.equal(page.totalRequests, 2n);
    assert.equal(page.pendingRequests, 2n);
    assert.deepEqual(
      [...page.entries].sort((left, right) => Number(left.fid - right.fid)),
      [
        {
          fid: BigInt(syntheticSecondAccessRequestFid),
          requestedAtMicros: secondSubmitted.requestedAtMicros,
          admissionState: 'missing',
          requestState: 'pending',
        },
        {
          fid: BigInt(syntheticMissingAccessRequestFid),
          requestedAtMicros: submitted.requestedAtMicros,
          admissionState: 'missing',
          requestState: 'pending',
        },
      ],
    );

    stage = 'request-auth-resolver';
    const admission = parseLoopbackJson(await callLoopbackProcedure(
      server,
      database,
      'auth_resolver_get_fid_admission_v2',
      createEphemeralJwt(
        privateKey,
        resolverServiceClaims(syntheticMissingAccessRequestFid),
      ),
      `[${syntheticMissingAccessRequestFid}]`,
      200,
    ), 'access-request admission');
    assert.deepEqual(admission, ['missing', 0]);
  } catch (error) {
    if (error instanceof MigrationProofError) {
      throw new MigrationProofError(
        `Loopback access-request lifecycle failed at ${stage}: ${error.message}`,
      );
    }
    throw new MigrationProofError(`Loopback access-request lifecycle failed at ${stage}.`);
  }
}

function parseExpeditionState(text, resource) {
  const value = parseLoopbackJson(text, `${resource.kind} expedition state`);
  if (!Array.isArray(value) || value.length !== 15 || typeof value[0] !== 'boolean') {
    fail(`Loopback ${resource.kind} expedition-state response contract was invalid.`);
  }
  const parseString = item => {
    if (typeof item !== 'string' || item.length === 0) {
      fail(`Loopback ${resource.kind} expedition string was invalid.`);
    }
    return item;
  };
  const parseUnsigned = item => readCanonicalUnsigned(
    item,
    maximumU64,
    `${resource.kind} expedition integer`,
  );
  const state = Object.freeze({
    active: value[0],
    expeditionId: parseLoopbackOption(value[1], 'expedition ID', parseString),
    siteId: parseLoopbackOption(value[2], 'expedition site', parseString),
    originCastleId: parseLoopbackOption(value[3], 'expedition castle', parseUnsigned),
    phase: parseLoopbackOption(value[4], 'expedition phase', parseString),
    startedAtMicros: parseLoopbackOption(value[5], 'expedition start', parseUnsigned),
    arrivesAtMicros: parseLoopbackOption(value[6], 'expedition arrival', parseUnsigned),
    gatheringEndsAtMicros: parseLoopbackOption(value[7], 'expedition expiry', parseUnsigned),
    returnsAtMicros: parseLoopbackOption(value[8], 'expedition return', parseUnsigned),
    accrued: readCanonicalUnsigned(value[9], maximumU64, `${resource.kind} accrued resource`),
    pending: readCanonicalUnsigned(value[10], maximumU64, `${resource.kind} pending resource`),
    credited: readCanonicalUnsigned(value[11], maximumU64, `${resource.kind} credited resource`),
    ratePerMinute: readCanonicalUnsigned(value[12], maximumU64, `${resource.kind} rate`),
    gatheringDurationMicros: readCanonicalUnsigned(
      value[13],
      maximumU64,
      `${resource.kind} gathering duration`,
    ),
    policyVersion: parseLoopbackOption(value[14], 'expedition policy', parseString),
  });
  if (
    state.active
      ? state.expeditionId === undefined
        || state.siteId === undefined
        || state.originCastleId === undefined
        || state.phase === undefined
        || state.startedAtMicros === undefined
        || state.arrivesAtMicros === undefined
        || state.gatheringEndsAtMicros === undefined
        || state.returnsAtMicros === undefined
        || state.policyVersion === undefined
      : state.expeditionId !== undefined
        || state.siteId !== undefined
        || state.originCastleId !== undefined
        || state.phase !== undefined
        || state.startedAtMicros !== undefined
        || state.arrivesAtMicros !== undefined
        || state.gatheringEndsAtMicros !== undefined
        || state.returnsAtMicros !== undefined
        || state.policyVersion !== undefined
        || state.accrued !== 0n
        || state.pending !== 0n
        || state.credited !== 0n
  ) fail(`Loopback ${resource.kind} expedition-state presence contract was invalid.`);
  return state;
}

function parseResourceState(text) {
  const value = parseLoopbackJson(text, 'resource-state');
  if (!Array.isArray(value) || value.length !== 17) {
    fail('Loopback resource-state response contract was invalid.');
  }
  const terrainKind = value[16];
  if (
    typeof value[14] !== 'string'
    || typeof value[15] !== 'string'
    || typeof terrainKind !== 'string'
    || !Object.hasOwn(terrainResourceRates, terrainKind)
  ) fail('Loopback resource-state policy contract was invalid.');
  return Object.freeze({
    fid: readCanonicalUnsigned(value[0], maximumU64, 'resource-state FID'),
    balances: Object.freeze({
      food: readCanonicalUnsigned(value[1], maximumU64, 'resource-state balance'),
      wood: readCanonicalUnsigned(value[2], maximumU64, 'resource-state balance'),
      stone: readCanonicalUnsigned(value[3], maximumU64, 'resource-state balance'),
      gold: readCanonicalUnsigned(value[4], maximumU64, 'resource-state balance'),
    }),
    pending: Object.freeze({
      food: readCanonicalUnsigned(value[5], maximumU64, 'resource-state pending balance'),
      wood: readCanonicalUnsigned(value[6], maximumU64, 'resource-state pending balance'),
      stone: readCanonicalUnsigned(value[7], maximumU64, 'resource-state pending balance'),
      gold: readCanonicalUnsigned(value[8], maximumU64, 'resource-state pending balance'),
    }),
    marksBalanceMicros: readCanonicalUnsigned(
      value[9],
      (1n << 128n) - 1n,
      'resource-state Marks balance',
    ),
    observedAtMicros: readCanonicalUnsigned(value[10], maximumU64, 'resource-state observation'),
    settledThroughMicros: readCanonicalUnsigned(value[11], maximumU64, 'resource-state cursor'),
    nextCollectAtMicros: readCanonicalUnsigned(value[12], maximumU64, 'resource-state boundary'),
    revision: readCanonicalUnsigned(value[13], maximumU64, 'resource-state revision'),
    resourcePolicyVersion: value[14],
    marksPolicyVersion: value[15],
    terrainKind,
  });
}

const workerRolloutStatusFields = Object.freeze([
  'phase',
  'systemRows',
  'systemConfigValid',
  'expectedCastleCount',
  'expectedWorkerCount',
  'actualCastleCount',
  'actualWorkerCount',
  'rosterDigest',
  'expectedRosterDigest',
  'malformedWorkerGraphRows',
  'resourceAccounts',
  'missingResourceAccounts',
  'orphanedResourceAccounts',
  'resourceInvariantViolations',
  'resourceRosterDigest',
  'canonicalResourceCatalog',
  'resourceCatalogDigest',
  'legacyExpeditions',
  'legacyOccupations',
  'legacySchedules',
  'legacyGoldExpeditions',
  'legacyFoodExpeditions',
  'legacyWoodExpeditions',
  'legacyStoneExpeditions',
  'legacyGoldOccupations',
  'legacyFoodOccupations',
  'legacyWoodOccupations',
  'legacyStoneOccupations',
  'legacyGoldSchedules',
  'legacyFoodSchedules',
  'legacyWoodSchedules',
  'legacyStoneSchedules',
  'genericAssignments',
  'genericOccupations',
  'genericSchedules',
  'genericCommandReceipts',
]);

const workerRolloutStringFields = new Set([
  'phase',
  'rosterDigest',
  'expectedRosterDigest',
  'resourceRosterDigest',
  'resourceCatalogDigest',
]);
const workerRolloutBooleanFields = new Set([
  'systemConfigValid',
  'canonicalResourceCatalog',
]);

function parseWorkerRolloutStatus(text) {
  const value = parseLoopbackJson(text, 'worker rollout status');
  if (!Array.isArray(value) || value.length !== workerRolloutStatusFields.length) {
    fail('Loopback worker-rollout response contract was invalid.');
  }
  const status = {};
  for (const [index, field] of workerRolloutStatusFields.entries()) {
    const entry = value[index];
    if (workerRolloutStringFields.has(field)) {
      if (typeof entry !== 'string') fail('Loopback worker-rollout metadata was invalid.');
      status[field] = entry;
    } else if (workerRolloutBooleanFields.has(field)) {
      if (typeof entry !== 'boolean') fail('Loopback worker-rollout flag was invalid.');
      status[field] = entry;
    } else {
      status[field] = readCanonicalUnsigned(
        entry,
        maximumU64,
        `worker-rollout ${field}`,
      );
    }
  }
  if (
    !['absent', 'staged', 'draining', 'active', 'invalid'].includes(status.phase)
    || status.legacyExpeditions !== status.legacyGoldExpeditions
      + status.legacyFoodExpeditions
      + status.legacyWoodExpeditions
      + status.legacyStoneExpeditions
    || status.legacyOccupations !== status.legacyGoldOccupations
      + status.legacyFoodOccupations
      + status.legacyWoodOccupations
      + status.legacyStoneOccupations
    || status.legacySchedules !== status.legacyGoldSchedules
      + status.legacyFoodSchedules
      + status.legacyWoodSchedules
      + status.legacyStoneSchedules
  ) fail('Loopback worker-rollout aggregate was inconsistent.');
  return Object.freeze(status);
}

function parseWorkerRoster(text) {
  const value = parseLoopbackJson(text, 'worker roster');
  if (!Array.isArray(value) || value.length !== 4 || !Array.isArray(value[3])) {
    fail('Loopback worker-roster response contract was invalid.');
  }
  const castleId = readCanonicalUnsigned(value[1], maximumU64, 'worker-roster castle');
  if (value[3].length !== 4) fail('Loopback worker roster did not contain four workers.');
  const workers = value[3].map((row, index) => {
    if (
      !Array.isArray(row)
      || row.length !== 10
      || typeof row[0] !== 'string'
      || row[0] !== `genesis-001-castle-${castleId}-worker-${String(index + 1).padStart(2, '0')}`
      || readCanonicalUnsigned(row[1], 4n, 'worker ordinal') !== BigInt(index + 1)
      || !['idle', 'outbound', 'gathering', 'returning'].includes(row[2])
    ) fail('Loopback worker-roster row was invalid.');
    return Object.freeze({
      workerId: row[0],
      ordinal: readCanonicalUnsigned(row[1], 4n, 'worker ordinal'),
      status: row[2],
    });
  });
  return Object.freeze({ castleId, workers: Object.freeze(workers) });
}

function parseWorkerControlState(text) {
  const value = parseLoopbackJson(text, 'worker control state');
  if (!Array.isArray(value) || value.length !== 17 || !Array.isArray(value[3])) {
    fail('Loopback worker-control response contract was invalid.');
  }
  const fid = readCanonicalUnsigned(value[0], maximumU64, 'worker-control FID');
  const castleId = readCanonicalUnsigned(value[1], maximumU64, 'worker-control castle');
  const observedAtMicros = readCanonicalUnsigned(
    value[2],
    maximumU64,
    'worker-control observation',
  );
  if (value[3].length !== 4) {
    fail('Loopback worker-control state did not contain four workers.');
  }
  const pending = { food: 0n, wood: 0n, stone: 0n, gold: 0n };
  const parseString = (item) => {
    if (typeof item !== 'string' || item.length === 0 || item.length > 160) {
      fail('Loopback worker-control string was invalid.');
    }
    return item;
  };
  const workers = value[3].map((row, index) => {
    if (!Array.isArray(row) || row.length !== 10) {
      fail('Loopback worker-control row was invalid.');
    }
    const workerId = parseString(row[0]);
    const ordinal = readCanonicalUnsigned(row[1], 4n, 'worker-control ordinal');
    const status = row[2];
    const resourceKind = parseLoopbackOption(
      row[3],
      'worker-control resource kind',
      parseString,
    );
    const siteId = parseLoopbackOption(
      row[4],
      'worker-control site',
      parseString,
    );
    const accruedAmount = readCanonicalUnsigned(
      row[5],
      maximumU64,
      'worker-control accrued amount',
    );
    const materializedAmount = readCanonicalUnsigned(
      row[6],
      maximumU64,
      'worker-control materialized amount',
    );
    const availableAmount = readCanonicalUnsigned(
      row[7],
      maximumU64,
      'worker-control available amount',
    );
    const workerObservedAtMicros = readCanonicalUnsigned(
      row[8],
      maximumU64,
      'worker-control row observation',
    );
    const revision = readCanonicalUnsigned(
      row[9],
      maximumU64,
      'worker-control revision',
    );
    if (
      workerId !== `genesis-001-castle-${castleId}-worker-${String(index + 1).padStart(2, '0')}`
      || ordinal !== BigInt(index + 1)
      || !['idle', 'outbound', 'gathering', 'returning'].includes(status)
      || workerObservedAtMicros !== observedAtMicros
      || materializedAmount > accruedAmount
      || availableAmount !== accruedAmount - materializedAmount
      || (status === 'idle' && (
        resourceKind !== undefined
        || siteId !== undefined
        || accruedAmount !== 0n
        || materializedAmount !== 0n
      ))
      || (status !== 'idle' && (
        resourceKind === undefined
        || !workerResourceKinds.includes(resourceKind)
        || siteId === undefined
      ))
    ) fail('Loopback worker-control row violated the exact authority contract.');
    if (resourceKind !== undefined) pending[resourceKind] += availableAmount;
    return Object.freeze({
      workerId,
      ordinal,
      status,
      resourceKind,
      siteId,
      availableAmount,
      revision,
    });
  });
  const balances = Object.freeze({
    food: readCanonicalUnsigned(value[4], maximumU64, 'worker-control balance'),
    wood: readCanonicalUnsigned(value[5], maximumU64, 'worker-control balance'),
    stone: readCanonicalUnsigned(value[6], maximumU64, 'worker-control balance'),
    gold: readCanonicalUnsigned(value[7], maximumU64, 'worker-control balance'),
  });
  const returnedPending = Object.freeze({
    food: readCanonicalUnsigned(value[8], maximumU64, 'worker-control pending balance'),
    wood: readCanonicalUnsigned(value[9], maximumU64, 'worker-control pending balance'),
    stone: readCanonicalUnsigned(value[10], maximumU64, 'worker-control pending balance'),
    gold: readCanonicalUnsigned(value[11], maximumU64, 'worker-control pending balance'),
  });
  const settledThroughMicros = readCanonicalUnsigned(
    value[12],
    maximumU64,
    'worker-control cursor',
  );
  const revision = readCanonicalUnsigned(
    value[13],
    maximumU64,
    'worker-control resource revision',
  );
  if (
    workerResourceKinds.some(kind => returnedPending[kind] !== pending[kind])
    || settledThroughMicros > observedAtMicros
    || value[14] !== resourcePolicyVersion
    || value[15] !== workerPolicyVersion
    || value[16] !== 'active'
  ) fail('Loopback worker-control aggregate violated the exact authority contract.');
  return Object.freeze({
    fid,
    castleId,
    observedAtMicros,
    workers: Object.freeze(workers),
    balances,
    pending: returnedPending,
    settledThroughMicros,
    revision,
  });
}

function assertResourceState(
  state,
  { balances, pending, revision, expectedFid = BigInt(actualModuleFounderFid) },
) {
  if (
    state.fid !== expectedFid
    || state.balances.food !== balances.food
    || state.balances.wood !== balances.wood
    || state.balances.stone !== balances.stone
    || state.balances.gold !== balances.gold
    || state.pending.food !== pending.food
    || state.pending.wood !== pending.wood
    || state.pending.stone !== pending.stone
    || state.pending.gold !== pending.gold
    || state.marksBalanceMicros !== 0n
    || state.revision !== revision
    || state.resourcePolicyVersion !== resourcePolicyVersion
    || state.marksPolicyVersion !== marksPolicyVersion
    || state.settledThroughMicros > state.observedAtMicros
    || state.nextCollectAtMicros <= state.observedAtMicros
  ) fail('Loopback resource-state values violated the exact authority contract.');
}

function parseAdminResourceStatus(text) {
  const value = parseLoopbackJson(text, 'resource aggregate');
  if (
    !Array.isArray(value)
    || value.length !== 9
    || value[7] !== 3
    || value[8] !== resourcePolicyVersion
  ) fail('Loopback resource aggregate contract was invalid.');
  return Object.freeze({
    allowedFids: readCanonicalUnsigned(value[0], maximumU64, 'resource aggregate'),
    castles: readCanonicalUnsigned(value[1], maximumU64, 'resource aggregate'),
    markAccounts: readCanonicalUnsigned(value[2], maximumU64, 'resource aggregate'),
    resourceAccounts: readCanonicalUnsigned(value[3], maximumU64, 'resource aggregate'),
    missingResourceAccounts: readCanonicalUnsigned(value[4], maximumU64, 'resource aggregate'),
    orphanedResourceAccounts: readCanonicalUnsigned(value[5], maximumU64, 'resource aggregate'),
    resourceInvariantViolations: readCanonicalUnsigned(value[6], maximumU64, 'resource aggregate'),
  });
}

function parseAdminDailyMarksStatus(text) {
  const value = parseLoopbackJson(text, 'daily Marks aggregate');
  if (
    !Array.isArray(value)
    || value.length !== 21
    || value[0] !== marksPolicyVersion
    || typeof value[16] !== 'boolean'
    || typeof value[18] !== 'boolean'
    || typeof value[19] !== 'boolean'
    || typeof value[20] !== 'boolean'
  ) fail('Loopback daily Marks aggregate contract was invalid.');
  const countAt = (index, label) => readCanonicalUnsigned(
    value[index],
    maximumU64,
    `daily Marks ${label}`,
  );
  return Object.freeze({
    utcDay: countAt(1, 'UTC day'),
    allowedFids: countAt(2, 'allowed count'),
    enabledAllowedFids: countAt(3, 'enabled count'),
    markAccounts: countAt(4, 'account count'),
    dailyAccounts: countAt(5, 'daily-account count'),
    legacyZeroAccounts: countAt(6, 'legacy-account count'),
    invalidAccounts: countAt(7, 'invalid-account count'),
    realmProfiles: countAt(8, 'profile count'),
    profileProjectionViolations: countAt(9, 'projection violation count'),
    missingFounderState: countAt(10, 'founder-state gap count'),
    grants: countAt(11, 'grant count'),
    currentDayGrants: countAt(12, 'current-day grant count'),
    grantInvariantViolations: countAt(13, 'grant violation count'),
    grantAccountReconciliationViolations: countAt(14, 'reconciliation violation count'),
    scheduleRows: countAt(15, 'schedule count'),
    scheduleConfigValid: value[16],
    legacyCompatibilityRows: countAt(17, 'legacy compatibility count'),
    readyForBackfill: value[18],
    readyForActivation: value[19],
    active: value[20],
  });
}

function parseAdminWaterLayoutStatus(text) {
  const value = parseLoopbackJson(text, 'Water layout aggregate');
  if (
    !Array.isArray(value)
    || value.length !== 16
    || typeof value[0] !== 'boolean'
    || typeof value[1] !== 'boolean'
    || typeof value[3] !== 'string'
    || !/^[0-9a-f]{64}$/.test(value[3])
    || typeof value[15] !== 'string'
    || !/^[0-9a-f]{40}$/.test(value[15])
  ) fail('Loopback Water layout aggregate contract was invalid.');

  return Object.freeze({
    ready: value[0],
    activated: value[1],
    layoutVersion: readCanonicalUnsigned(value[2], 0xffff_ffffn, 'Water layout version'),
    layoutDigest: value[3],
    canonicalLandCellCount: readCanonicalUnsigned(
      value[4],
      0xffff_ffffn,
      'Water canonical land count',
    ),
    oceanCellCount: readCanonicalUnsigned(value[5], 0xffff_ffffn, 'Water ocean count'),
    lakeCellCount: readCanonicalUnsigned(value[6], 0xffff_ffffn, 'Water lake count'),
    lakeBodyCount: readCanonicalUnsigned(value[7], 0xffff_ffffn, 'Water lake-body count'),
    riverCount: readCanonicalUnsigned(value[8], 0xffff_ffffn, 'Water river count'),
    riverCellCount: readCanonicalUnsigned(value[9], 0xffff_ffffn, 'Water river-cell count'),
    waterBodies: readCanonicalUnsigned(value[10], maximumU64, 'Water body count'),
    canonicalWaterBodies: readCanonicalUnsigned(
      value[11],
      maximumU64,
      'Water canonical body count',
    ),
    waterCells: readCanonicalUnsigned(value[12], maximumU64, 'Water cell count'),
    canonicalWaterCells: readCanonicalUnsigned(
      value[13],
      maximumU64,
      'Water canonical cell count',
    ),
    environmentRows: readCanonicalUnsigned(value[14], maximumU64, 'Water environment count'),
    sourceCommit: value[15],
  });
}

function canonicalWaterStatus(status) {
  return Object.freeze({
    layoutVersion: status.layoutVersion,
    layoutDigest: status.layoutDigest,
    canonicalLandCellCount: status.canonicalLandCellCount,
    oceanCellCount: status.oceanCellCount,
    lakeCellCount: status.lakeCellCount,
    lakeBodyCount: status.lakeBodyCount,
    riverCount: status.riverCount,
    riverCellCount: status.riverCellCount,
    canonicalWaterBodies: status.canonicalWaterBodies,
    canonicalWaterCells: status.canonicalWaterCells,
    sourceCommit: status.sourceCommit,
  });
}

function parseAdminWaterRevisionStatus(text) {
  const value = parseLoopbackJson(text, 'Water revision aggregate');
  if (
    !Array.isArray(value)
    || value.length !== 20
    || typeof value[0] !== 'boolean'
    || typeof value[1] !== 'boolean'
    || typeof value[3] !== 'string'
    || value[3].length === 0
    || typeof value[5] !== 'string'
    || !/^[0-9a-f]{64}$/.test(value[5])
    || typeof value[18] !== 'string'
    || !/^[0-9a-f]{64}$/.test(value[18])
    || typeof value[19] !== 'string'
    || !/^[0-9a-f]{40}$/.test(value[19])
  ) fail('Loopback Water revision aggregate contract was invalid.');

  const unsigned = (item, label, maximum = 0xffff_ffffn) => (
    readCanonicalUnsigned(item, maximum, `Water revision ${label}`)
  );
  return Object.freeze({
    ready: value[0],
    activated: value[1],
    revisionVersion: unsigned(value[2], 'version'),
    policyVersion: value[3],
    baseLayoutVersion: unsigned(value[4], 'base layout version'),
    baseLayoutDigest: value[5],
    oceanBodyCount: unsigned(value[6], 'ocean body count'),
    riverBodyCount: unsigned(value[7], 'river body count'),
    enabledBodyCount: unsigned(value[8], 'enabled body count'),
    oceanCellCount: unsigned(value[9], 'ocean cell count'),
    riverCellCount: unsigned(value[10], 'river cell count'),
    enabledCellCount: unsigned(value[11], 'enabled cell count'),
    lakeBodyCount: unsigned(value[12], 'lake body count'),
    lakeCellCount: unsigned(value[13], 'lake cell count'),
    riverWidthCells: unsigned(value[14], 'river width'),
    navigationFogBoundaryDepthCells: unsigned(value[15], 'fog boundary'),
    hiddenBufferCells: unsigned(value[16], 'hidden buffer'),
    revisionRows: unsigned(value[17], 'row count', maximumU64),
    revisionDigest: value[18],
    sourceCommit: value[19],
  });
}

function canonicalWaterRevisionStatus(status) {
  return Object.freeze({
    revisionVersion: status.revisionVersion,
    policyVersion: status.policyVersion,
    baseLayoutVersion: status.baseLayoutVersion,
    baseLayoutDigest: status.baseLayoutDigest,
    oceanBodyCount: status.oceanBodyCount,
    riverBodyCount: status.riverBodyCount,
    enabledBodyCount: status.enabledBodyCount,
    oceanCellCount: status.oceanCellCount,
    riverCellCount: status.riverCellCount,
    enabledCellCount: status.enabledCellCount,
    lakeBodyCount: status.lakeBodyCount,
    lakeCellCount: status.lakeCellCount,
    riverWidthCells: status.riverWidthCells,
    navigationFogBoundaryDepthCells: status.navigationFogBoundaryDepthCells,
    hiddenBufferCells: status.hiddenBufferCells,
    revisionDigest: status.revisionDigest,
    sourceCommit: status.sourceCommit,
  });
}

function assertAdminResourceStatus(status, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (status[key] !== value) fail('Loopback resource aggregate values were invalid.');
  }
}

async function countForFid(server, token, database, table, fid = actualModuleFounderFid) {
  if (!/^[a-z0-9_]+$/.test(table) || !Number.isSafeInteger(fid) || fid <= 0) {
    fail('Unsafe caller-bound fixture count.');
  }
  const column = table === 'castle' || table === 'castle_slot_claim_v1'
    ? 'owner_fid'
    : 'fid';
  return countFromSql(await privateSql(
    server,
    token,
    database,
    `SELECT COUNT(*) AS warpkeep_count FROM ${table} WHERE ${column} = ${fid}`,
  ));
}

async function actionCount(server, token, database, action) {
  if (!/^[a-z0-9_]+$/.test(action)) fail('Unsafe audit fixture action.');
  return countFromSql(await privateSql(
    server,
    token,
    database,
    `SELECT COUNT(*) AS warpkeep_count FROM admin_audit WHERE action = '${action}'`,
  ));
}

async function callerRowDigest(server, token, database, table) {
  if (!/^[a-z0-9_]+$/.test(table)) fail('Unsafe caller-bound fixture table.');
  return outputDigest(await privateSql(
    server,
    token,
    database,
    `SELECT * FROM ${table} WHERE fid = ${actualModuleFounderFid}`,
  ));
}

async function founderAuthorityDigest(server, token, database) {
  const queries = Object.freeze({
    castle: `SELECT * FROM castle WHERE owner_fid = ${actualModuleFounderFid}`,
    claim: `SELECT * FROM castle_slot_claim_v1 WHERE owner_fid = ${actualModuleFounderFid}`,
    profile: `SELECT * FROM realm_profile_v1 WHERE fid = ${actualModuleFounderFid}`,
    marks: `SELECT * FROM mark_account_v1 WHERE fid = ${actualModuleFounderFid}`,
    resources: `SELECT * FROM resource_account_v1 WHERE fid = ${actualModuleFounderFid}`,
  });
  const digests = {};
  for (const [name, query] of Object.entries(queries)) {
    digests[name] = outputDigest(await privateSql(server, token, database, query));
  }
  return outputDigest(JSON.stringify(digests));
}

async function founderGameplayAuthorityDigest(server, token, database) {
  const queries = Object.freeze({
    castle: `SELECT * FROM castle WHERE owner_fid = ${actualModuleFounderFid}`,
    claim: `SELECT * FROM castle_slot_claim_v1 WHERE owner_fid = ${actualModuleFounderFid}`,
    marks: `SELECT * FROM mark_account_v1 WHERE fid = ${actualModuleFounderFid}`,
    resources: `SELECT * FROM resource_account_v1 WHERE fid = ${actualModuleFounderFid}`,
  });
  const digests = {};
  for (const [name, query] of Object.entries(queries)) {
    digests[name] = outputDigest(await privateSql(server, token, database, query));
  }
  return outputDigest(JSON.stringify(digests));
}

async function founderReapplicationRetainedStateDigest(server, token, database) {
  const fid = actualModuleFounderFid;
  const queries = Object.freeze({
    player: `SELECT * FROM player WHERE fid = ${fid}`,
    playerV2: `SELECT * FROM player_v2 WHERE fid = ${fid}`,
    ownership: `SELECT * FROM player_ownership_v2 WHERE fid = ${fid}`,
    castle: `SELECT * FROM castle WHERE owner_fid = ${fid}`,
    claim: `SELECT * FROM castle_slot_claim_v1 WHERE owner_fid = ${fid}`,
    profile: `SELECT * FROM realm_profile_v1 WHERE fid = ${fid}`,
    marks: `SELECT * FROM mark_account_v1 WHERE fid = ${fid}`,
    terms: `SELECT * FROM alpha_terms_acceptance_v1 WHERE fid = ${fid}`,
    resources: `SELECT * FROM resource_account_v1 WHERE fid = ${fid}`,
    dailyMarks: `SELECT * FROM daily_mark_grant_v1 WHERE fid = ${fid}`,
    legacyGold: `SELECT * FROM gold_expedition_v1 WHERE fid = ${fid}`,
    legacyGoldReceipts: `SELECT * FROM gold_expedition_idempotency_v1 WHERE fid = ${fid}`,
    legacyGoldOccupations: 'SELECT * FROM gold_node_occupation_v1',
    legacyGoldSchedules: 'SELECT * FROM gold_expedition_schedule_v_1',
    legacyFood: `SELECT * FROM food_expedition_v1 WHERE fid = ${fid}`,
    legacyFoodReceipts: `SELECT * FROM food_expedition_idempotency_v1 WHERE fid = ${fid}`,
    legacyFoodOccupations: 'SELECT * FROM food_node_occupation_v1',
    legacyFoodSchedules: 'SELECT * FROM food_expedition_schedule_v_1',
    legacyWood: `SELECT * FROM wood_expedition_v1 WHERE fid = ${fid}`,
    legacyWoodReceipts: `SELECT * FROM wood_expedition_idempotency_v1 WHERE fid = ${fid}`,
    legacyWoodOccupations: 'SELECT * FROM wood_node_occupation_v1',
    legacyWoodSchedules: 'SELECT * FROM wood_expedition_schedule_v_1',
    legacyStone: `SELECT * FROM stone_expedition_v1 WHERE fid = ${fid}`,
    legacyStoneReceipts: `SELECT * FROM stone_expedition_idempotency_v1 WHERE fid = ${fid}`,
    legacyStoneOccupations: 'SELECT * FROM stone_node_occupation_v1',
    legacyStoneSchedules: 'SELECT * FROM stone_expedition_schedule_v_1',
    workers: 'SELECT * FROM castle_worker_v1',
    workerAssignments: `SELECT * FROM worker_assignment_v1 WHERE fid = ${fid}`,
    workerOccupations: 'SELECT * FROM worker_node_occupation_v1',
    workerSchedules: 'SELECT * FROM worker_assignment_schedule_v_1',
    workerReceipts: `SELECT * FROM worker_command_idempotency_v1 WHERE fid = ${fid}`,
  });
  const digests = {};
  for (const [name, query] of Object.entries(queries)) {
    digests[name] = outputDigest(await privateSql(server, token, database, query));
  }
  return outputDigest(JSON.stringify(digests));
}

async function privateSql(server, token, database, query) {
  const result = await runCommand([
    ...configArguments(token),
    'sql',
    '--server', server,
    '--no-config',
    database,
    query,
  ], { token });
  if (result.code !== 0) {
    // Private rows may contain caller identity, balances, or timestamps. Never
    // surface either stream, even on a disposable-loopback proof failure.
    fail('Disposable private SQL fixture operation failed.');
  }
  return result.stdout;
}

async function tryPrivateSqlMutation(server, token, database, query) {
  const result = await runCommand([
    ...configArguments(token),
    'sql',
    '--server', server,
    '--no-config',
    database,
    query,
  ], { token });
  return result.code === 0;
}

async function readActualResourceState(server, database, credential) {
  return parseResourceState(await callLoopbackProcedure(
    server,
    database,
    'get_my_resource_state_v1',
    credential,
    '[]',
    200,
  ));
}

async function readActualExpeditionState(server, database, credential, resource) {
  return parseExpeditionState(await callLoopbackProcedure(
    server,
    database,
    resource.stateProcedure,
    credential,
    '[]',
    200,
    true,
    10_000,
  ), resource);
}

async function readActualWorkerRolloutStatus(server, database, credential) {
  return parseWorkerRolloutStatus(await callLoopbackProcedure(
    server,
    database,
    'admin_get_worker_rollout_status_v2',
    credential,
    '[]',
    200,
  ));
}

async function readActualWorkerRoster(server, database, credential) {
  return parseWorkerRoster(await callLoopbackProcedure(
    server,
    database,
    'get_my_worker_roster_v1',
    credential,
    '[]',
    200,
  ));
}

async function readActualWorkerControlState(server, database, credential) {
  return parseWorkerControlState(await callLoopbackProcedure(
    server,
    database,
    'get_my_worker_control_state_v1',
    credential,
    '[]',
    200,
  ));
}

async function waitForActualWorkerRoster(
  server,
  database,
  credentialFactory,
  predicate,
) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const roster = await readActualWorkerRoster(
      server,
      database,
      credentialFactory(),
    );
    if (predicate(roster)) return roster;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
  }
  fail('Actual Worker roster did not reach its bounded target state.');
}

async function waitForActualExpeditionState(
  server,
  database,
  credentialFactory,
  resource,
  predicate,
) {
  const deadline = Date.now() + expeditionScheduleWaitMilliseconds;
  let consecutiveTransportFailures = 0;
  while (Date.now() < deadline) {
    try {
      const state = await readActualExpeditionState(
        server,
        database,
        credentialFactory(),
        resource,
      );
      consecutiveTransportFailures = 0;
      if (predicate(state)) return state;
    } catch (error) {
      if (
        !(error instanceof MigrationProofError)
        || error.message !== 'Loopback procedure request failed within its fixed boundary.'
        || ++consecutiveTransportFailures > 3
      ) throw error;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 5_000));
  }
  fail(`Actual ${resource.kind} schedule did not reach its bounded target state.`);
}

async function readActualAdminResourceStatus(server, database, credential) {
  return parseAdminResourceStatus(await callLoopbackProcedure(
    server,
    database,
    'admin_get_alpha_status_v4',
    credential,
    '[]',
    200,
  ));
}

async function readActualAdminDailyMarksStatus(server, database, credential) {
  return parseAdminDailyMarksStatus(await callLoopbackProcedure(
    server,
    database,
    'admin_get_daily_marks_status_v1',
    credential,
    '[]',
    200,
  ));
}

async function prepareOneQuantumFixture(server, database, ownerCredential) {
  await callLoopbackReducer(
    server,
    database,
    'fixture_rewind_resource_one_quantum',
    ownerCredential,
    JSON.stringify([actualModuleFounderFid]),
    200,
  );
}

async function verifyActualModuleResourceLifecycle(server, database, privateKey, ownerToken) {
  let stage = 'seed';
  let activeModule = 'actual';
  const actualArtifactPath = join(additiveModule, 'dist', 'bundle.js');
  // Keep inspection on the complete v14 candidate schema. Reverting to a
  // predecessor fixture after Stone is appended would be destructive.
  const inspectionArtifactPath = join(additiveV14SchemaFixture, 'dist', 'bundle.js');
  const useActualModule = async () => {
    if (activeModule === 'actual') return;
    await publishBuiltArtifact(server, ownerToken, actualArtifactPath, database);
    activeModule = 'actual';
  };
  const usePrivateInspectionModule = async () => {
    if (activeModule === 'inspection') return;
    // The real module deliberately rejects the server's disposable owner token
    // at on-connect. Swap to the table-identical schema-only artifact solely
    // for bounded owner SQL, then republish the exact real artifact before any
    // reducer/procedure call. Both artifacts use `--delete-data=never`.
    await publishBuiltArtifact(server, ownerToken, inspectionArtifactPath, database);
    activeModule = 'inspection';
  };
  const adminCredential = () => createEphemeralJwt(privateKey, adminServiceClaims());
  const playerCredential = () => createEphemeralJwt(
    privateKey,
    playerClaims(actualModuleFounderFid, `farcaster:${actualModuleFounderFid}`, 2),
  );
  try {
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_world',
      adminCredential(),
      '[]',
      200,
      120_000,
    );
    await usePrivateInspectionModule();
    if (
      await count(server, ownerToken, database, 'world_tile') !== 10_000n
      || await count(server, ownerToken, database, 'realm_v1') !== 1n
      || await count(server, ownerToken, database, 'world_tile_meta_v1') !== 10_000n
      || await count(server, ownerToken, database, 'castle_slot_v1') !== 100n
    ) fail('Actual module seed did not create the exact canonical world.');

    // The forest reducer plans every canonical instance before it writes any
    // of them. Corrupt one known foliage tile in this disposable fixture to
    // prove a seed rejection cannot leave a partial public forest behind.
    stage = 'forest-atomic-rejection';
    await privateSql(
      server,
      ownerToken,
      database,
      "UPDATE world_tile_meta_v1 SET passable = false WHERE tile_key = '-19,7'",
    );
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_forest_layout_v1',
      adminCredential(),
      '[]',
      530,
    );
    await usePrivateInspectionModule();
    if (
      await count(server, ownerToken, database, 'realm_forest_layout_v1') !== 0n
      || await count(server, ownerToken, database, 'realm_forest_instance_v1') !== 0n
      || await actionCount(server, ownerToken, database, 'seed_genesis_forest_layout_v1') !== 0n
    ) fail('Rejected forest seed left partial state or an audit record.');
    await privateSql(
      server,
      ownerToken,
      database,
      "UPDATE world_tile_meta_v1 SET passable = true WHERE tile_key = '-19,7'",
    );

    stage = 'forest-seed';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_forest_layout_v1',
      adminCredential(),
      '[]',
      200,
    );
    await usePrivateInspectionModule();
    if (
      await count(server, ownerToken, database, 'realm_forest_layout_v1') !== 1n
      || await count(server, ownerToken, database, 'realm_forest_instance_v1') !== 210n
      || await actionCount(server, ownerToken, database, 'seed_genesis_forest_layout_v1') !== 1n
    ) fail('Actual module forest seed was incomplete.');
    const seededForestDigest = outputDigest(await privateSql(
      server,
      ownerToken,
      database,
      'SELECT * FROM realm_forest_layout_v1',
    ));
    const seededForestInstancesDigest = outputDigest(await privateSql(
      server,
      ownerToken,
      database,
      'SELECT * FROM realm_forest_instance_v1',
    ));
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_forest_layout_v1',
      adminCredential(),
      '[]',
      200,
    );
    await usePrivateInspectionModule();
    if (
      await actionCount(server, ownerToken, database, 'seed_genesis_forest_layout_v1') !== 1n
      || outputDigest(await privateSql(
        server,
        ownerToken,
        database,
        'SELECT * FROM realm_forest_layout_v1',
      )) !== seededForestDigest
      || outputDigest(await privateSql(
        server,
        ownerToken,
        database,
        'SELECT * FROM realm_forest_instance_v1',
      )) !== seededForestInstancesDigest
    ) fail('Exact forest seed rerun was not a complete no-op.');

    stage = 'atomic-founder-empty-fixture';
    for (const table of [
      'allowed_fid',
      'castle',
      'castle_slot_claim_v1',
      'realm_profile_v1',
      'mark_account_v1',
      'resource_account_v1',
    ]) {
      if (await countForFid(server, ownerToken, database, table) !== 0n) {
        fail('Actual module founder fixture was not empty.');
      }
    }
    stage = 'atomic-founder-legacy-rejection';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_allow_fid',
      adminCredential(),
      JSON.stringify([actualModuleFounderFid, 'legacy first-time admission must fail']),
      530,
    );
    await usePrivateInspectionModule();
    for (const table of [
      'allowed_fid',
      'castle',
      'castle_slot_claim_v1',
      'realm_profile_v1',
      'mark_account_v1',
      'resource_account_v1',
    ]) {
      if (await countForFid(server, ownerToken, database, table) !== 0n) {
        fail('Rejected legacy first-time admission changed founder state.');
      }
    }
    if (await actionCount(server, ownerToken, database, 'allow_fid') !== 0n) {
      fail('Rejected legacy first-time admission changed audit history.');
    }

    stage = 'atomic-founder-invalid-profile-rollback';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_admit_founder_v1',
      adminCredential(),
      JSON.stringify([
        actualModuleOtherFid,
        'invalid local profile must fail before writes',
        'migration.invalid',
        { some: 'Migration Invalid' },
        'http://profiles.example.com/invalid.png',
        { some: 'Disposable invalid profile fixture' },
        profilePolicyVersion,
      ]),
      530,
    );
    await usePrivateInspectionModule();
    for (const table of [
      'allowed_fid',
      'castle',
      'castle_slot_claim_v1',
      'realm_profile_v1',
      'mark_account_v1',
      'resource_account_v1',
    ]) {
      if (await countForFid(server, ownerToken, database, table, actualModuleOtherFid) !== 0n) {
        fail('Rejected profiled admission changed founder state.');
      }
    }
    if (await actionCount(server, ownerToken, database, 'admit_founder_v1') !== 0n) {
      fail('Rejected profiled admission changed audit history.');
    }

    stage = 'atomic-founder-profiled-commit';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_admit_founder_v1',
      adminCredential(),
      JSON.stringify([
        actualModuleFounderFid,
        'local additive migration proof',
        'migration.founder',
        { some: 'Migration Founder' },
        'https://profiles.example.com/migration-founder.png',
        { some: 'Disposable local founder fixture' },
        profilePolicyVersion,
      ]),
      200,
    );
    await usePrivateInspectionModule();
    for (const table of [
      'allowed_fid',
      'castle',
      'castle_slot_claim_v1',
      'realm_profile_v1',
      'mark_account_v1',
      'resource_account_v1',
    ]) {
      if (await countForFid(server, ownerToken, database, table) !== 1n) {
        fail('Actual module founder transaction was incomplete.');
      }
    }
    if (
      await countForFid(server, ownerToken, database, 'player_v2') !== 0n
      || await countForFid(server, ownerToken, database, 'player_ownership_v2') !== 0n
    ) fail('Actual module admission unexpectedly bootstrapped a player.');
    stage = 'atomic-founder-profile-postcondition';
    const completeProfileProjection = (await privateSql(
      server,
      ownerToken,
      database,
      `SELECT canonical_username, pfp_url FROM realm_profile_v1 WHERE fid = ${actualModuleFounderFid}`,
    )).replace(/\u001b\[[0-9;]*m/g, '');
    if (
      !completeProfileProjection.includes('migration.founder')
      || !completeProfileProjection.includes('https://profiles.example.com/migration-founder.png')
      || await actionCount(server, ownerToken, database, 'admit_founder_v1') !== 1n
    ) fail('Actual module profiled admission did not persist its reviewed projection exactly once.');

    stage = 'atomic-founder-repeat-admission-rollback';
    const founderAuthorityBeforeRepeatedAdmission = await founderAuthorityDigest(
      server,
      ownerToken,
      database,
    );
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_admit_founder_v1',
      adminCredential(),
      JSON.stringify([
        actualModuleFounderFid,
        'repeated local admission must fail',
        'migration.changed',
        { some: 'Migration Changed' },
        'https://profiles.example.com/migration-changed.png',
        { some: 'Repeated admission must not rewrite profile state' },
        profilePolicyVersion,
      ]),
      530,
    );
    await usePrivateInspectionModule();
    if (
      await founderAuthorityDigest(server, ownerToken, database)
        !== founderAuthorityBeforeRepeatedAdmission
      || await actionCount(server, ownerToken, database, 'admit_founder_v1') !== 1n
    ) fail('Repeated profiled admission changed founder state or audit history.');

    stage = 'atomic-founder-profile-clear-preserves-authority';
    const founderGameplayAuthorityBeforeClear = await founderGameplayAuthorityDigest(
      server,
      ownerToken,
      database,
    );
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_upsert_realm_profile_v1',
      adminCredential(),
      JSON.stringify([
        actualModuleFounderFid,
        { none: [] },
        { some: 'Rejected Clear Fixture' },
        { none: [] },
        { some: 'Required castle identity must remain complete' },
        profilePolicyVersion,
      ]),
      200,
    );
    await usePrivateInspectionModule();
    const clearedProfileProjection = (await privateSql(
      server,
      ownerToken,
      database,
      `SELECT canonical_username, display_name, pfp_url FROM realm_profile_v1 WHERE fid = ${actualModuleFounderFid}`,
    )).replace(/\u001b\[[0-9;]*m/g, '');
    if (
      clearedProfileProjection.includes('migration.founder')
      || clearedProfileProjection.includes('migration-founder.png')
      || !clearedProfileProjection.includes('Rejected Clear Fixture')
      || await founderGameplayAuthorityDigest(server, ownerToken, database)
        !== founderGameplayAuthorityBeforeClear
      || await actionCount(server, ownerToken, database, 'profile_snapshot_v1') !== 1n
    ) fail('Trusted profile clear changed permanent gameplay authority.');

    stage = 'atomic-founder-legacy-reenable';
    const founderAuthorityBeforeReenable = await founderAuthorityDigest(
      server,
      ownerToken,
      database,
    );
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_disable_fid',
      adminCredential(),
      JSON.stringify([actualModuleFounderFid, 'local complete-founder re-enable proof']),
      200,
    );
    await usePrivateInspectionModule();
    const disabledFounderCount = countFromSql(await privateSql(
      server,
      ownerToken,
      database,
      `SELECT COUNT(*) AS warpkeep_count FROM allowed_fid WHERE fid = ${actualModuleFounderFid} AND enabled = false`,
    ));
    if (
      disabledFounderCount !== 1n
      || await founderAuthorityDigest(server, ownerToken, database) !== founderAuthorityBeforeReenable
    ) fail('Local disable changed permanent founder authority state.');

    stage = 'disabled-founder-access-request';
    const disabledRequestCredential = operation => createEphemeralJwt(
      privateKey,
      accessRequestServiceClaims(actualModuleFounderFid, operation),
    );
    await useActualModule();
    const disabledInitialStatus = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_get_status_v1',
        disabledRequestCredential('status'),
        '[]',
        200,
      ),
      'disabled founder initial access-request status',
    );
    assert.deepEqual(disabledInitialStatus, {
      status: 'not_requested',
      requestedAtMicros: undefined,
    });
    const disabledSubmitted = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_submit_v1',
        disabledRequestCredential('submit'),
        '[]',
        200,
      ),
      'disabled founder submitted access-request status',
    );
    assert.equal(disabledSubmitted.status, 'requested');
    if (
      disabledSubmitted.requestedAtMicros === undefined
      || disabledSubmitted.requestedAtMicros <= 0n
    ) fail('Disabled founder access request omitted its database timestamp.');
    const disabledDuplicate = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_submit_v1',
        disabledRequestCredential('submit'),
        '[]',
        200,
      ),
      'disabled founder duplicate access-request status',
    );
    assert.deepEqual(disabledDuplicate, disabledSubmitted);
    const disabledPendingPage = parseAdminAccessRequestPage(await callLoopbackProcedure(
      server,
      database,
      'admin_list_access_requests_v1',
      adminCredential(),
      '[0,0,100,false]',
      200,
    ));
    assert.deepEqual(disabledPendingPage, {
      entries: [{
        fid: BigInt(actualModuleFounderFid),
        requestedAtMicros: disabledSubmitted.requestedAtMicros,
        admissionState: 'disabled',
        requestState: 'pending',
      }],
      nextRequestedAtMicros: undefined,
      nextFid: undefined,
      hasMore: false,
      totalRequests: 1n,
      pendingRequests: 1n,
    });
    await usePrivateInspectionModule();
    if (
      await founderAuthorityDigest(server, ownerToken, database)
        !== founderAuthorityBeforeReenable
    ) fail('Disabled founder access request changed permanent founder authority state.');

    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_allow_fid',
      adminCredential(),
      JSON.stringify([actualModuleFounderFid, 'local complete-founder re-enable proof']),
      200,
    );
    await usePrivateInspectionModule();
    const reenabledFounderCount = countFromSql(await privateSql(
      server,
      ownerToken,
      database,
      `SELECT COUNT(*) AS warpkeep_count FROM allowed_fid WHERE fid = ${actualModuleFounderFid} AND enabled = true`,
    ));
    if (
      reenabledFounderCount !== 1n
      || await founderAuthorityDigest(server, ownerToken, database) !== founderAuthorityBeforeReenable
      || await actionCount(server, ownerToken, database, 'allow_fid') !== 1n
    ) fail('Legacy allow did not preserve and re-enable exactly one complete founder graph.');

    await useActualModule();
    const reenabledRequestStatus = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_get_status_v1',
        disabledRequestCredential('status'),
        '[]',
        200,
      ),
      're-enabled founder access-request status',
    );
    assert.deepEqual(reenabledRequestStatus, {
      status: 'already_admitted',
      requestedAtMicros: undefined,
    });
    const noPendingAfterReenable = parseAdminAccessRequestPage(await callLoopbackProcedure(
      server,
      database,
      'admin_list_access_requests_v1',
      adminCredential(),
      '[0,0,100,false]',
      200,
    ));
    assert.deepEqual(noPendingAfterReenable, {
      entries: [],
      nextRequestedAtMicros: undefined,
      nextFid: undefined,
      hasMore: false,
      totalRequests: 1n,
      pendingRequests: 0n,
    });

    stage = 'bootstrap-presentation-independent-authority';
    await useActualModule();
    const presentationIndependentStatus = parseLoopbackJson(await callLoopbackProcedure(
      server,
      database,
      'admin_get_alpha_status_v3',
      adminCredential(),
      '[]',
      200,
    ), 'incomplete founder profile aggregate');
    if (
      !Array.isArray(presentationIndependentStatus)
      || presentationIndependentStatus.length !== 40
      || readCanonicalUnsigned(
        presentationIndependentStatus[29],
        maximumU64,
        'founder profile gap aggregate',
      ) !== 0n
    ) fail('Repairable profile presentation was folded into founder authority health.');
    await callLoopbackReducer(
      server,
      database,
      'bootstrap_player_v2',
      playerCredential(),
      '[]',
      200,
    );
    await usePrivateInspectionModule();
    if (
      await countForFid(server, ownerToken, database, 'player_v2') !== 1n
      || await countForFid(server, ownerToken, database, 'player_ownership_v2') !== 1n
    ) fail('Structurally valid founder did not bootstrap independently of presentation.');
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_upsert_realm_profile_v1',
      adminCredential(),
      JSON.stringify([
        actualModuleFounderFid,
        { some: 'migration.founder' },
        { some: 'Migration Founder' },
        { some: 'https://profiles.example.com/migration-founder.png' },
        { some: 'Disposable local founder fixture' },
        profilePolicyVersion,
      ]),
      200,
    );
    await usePrivateInspectionModule();
    if (await actionCount(server, ownerToken, database, 'profile_snapshot_v1') !== 2n) {
      fail('Exact-admin profile repair did not produce one audit transition.');
    }

    stage = 'bootstrap-gate';
    await useActualModule();
    await callLoopbackProcedure(
      server,
      database,
      'get_my_resource_state_v1',
      playerCredential(),
      '[]',
      500,
    );
    await callLoopbackReducer(
      server,
      database,
      'bootstrap_player_v2',
      playerCredential(),
      '[]',
      200,
    );
    await usePrivateInspectionModule();
    if (
      await countForFid(server, ownerToken, database, 'player_v2') !== 1n
      || await countForFid(server, ownerToken, database, 'player_ownership_v2') !== 1n
    ) fail('Actual module bootstrap was incomplete.');

    stage = 'forest-non-admin-rejection';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_forest_layout_v1',
      playerCredential(),
      '[]',
      530,
    );
    await usePrivateInspectionModule();
    if (
      await actionCount(server, ownerToken, database, 'seed_genesis_forest_layout_v1') !== 1n
      || outputDigest(await privateSql(
        server,
        ownerToken,
        database,
        'SELECT * FROM realm_forest_layout_v1',
      )) !== seededForestDigest
      || outputDigest(await privateSql(
        server,
        ownerToken,
        database,
        'SELECT * FROM realm_forest_instance_v1',
      )) !== seededForestInstancesDigest
    ) fail('Non-admin forest seed attempt changed the canonical layout.');

    stage = 'bootstrap-renewal';
    const ownershipAfterBootstrap = await callerRowDigest(
      server,
      ownerToken,
      database,
      'player_ownership_v2',
    );
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'bootstrap_player_v2',
      playerCredential(),
      '[]',
      200,
    );
    await usePrivateInspectionModule();
    if (
      await countForFid(server, ownerToken, database, 'player_ownership_v2') !== 1n
      || await callerRowDigest(server, ownerToken, database, 'player_ownership_v2')
      !== ownershipAfterBootstrap
    ) fail('Actual module token renewal changed caller identity binding.');
    await useActualModule();
    const invalidSubjectCredential = createEphemeralJwt(
      privateKey,
      playerClaims(actualModuleFounderFid, `farcaster:${actualModuleOtherFid}`, 2),
    );
    await callLoopbackProcedure(
      server,
      database,
      'get_my_resource_state_v1',
      invalidSubjectCredential,
      '[]',
      403,
    );

    stage = 'terms-gate';
    await callLoopbackProcedure(
      server,
      database,
      'get_my_resource_state_v1',
      playerCredential(),
      '[]',
      500,
    );
    await callLoopbackReducer(
      server,
      database,
      'accept_alpha_terms_v1',
      playerCredential(),
      JSON.stringify([alphaTermsVersion, false]),
      530,
    );
    for (const historicalVersion of historicalEntryAgreementVersions) {
      await callLoopbackReducer(
        server,
        database,
        'accept_alpha_terms_v1',
        playerCredential(),
        JSON.stringify([historicalVersion, true]),
        530,
      );
    }
    await usePrivateInspectionModule();
    if (await countForFid(server, ownerToken, database, 'alpha_terms_acceptance_v1') !== 0n) {
      fail('Rejected or historical entry-agreement fixture changed consent state.');
    }
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'accept_alpha_terms_v1',
      playerCredential(),
      JSON.stringify([alphaTermsVersion, true]),
      200,
    );
    await usePrivateInspectionModule();
    if (await countForFid(server, ownerToken, database, 'alpha_terms_acceptance_v1') !== 1n) {
      fail('Accepted terms fixture was not recorded exactly once.');
    }

    stage = 'resource-read';
    await useActualModule();
    const initial = await readActualResourceState(server, database, playerCredential());
    assertResourceState(initial, {
      balances: startingResourceBalances,
      pending: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
      revision: 0n,
    });
    if (initial.nextCollectAtMicros - initial.settledThroughMicros !== resourceQuantumMicros) {
      fail('Actual module resource boundary was not one exact quantum.');
    }

    stage = 'resource-collect';
    await usePrivateInspectionModule();
    const marksBeforeCollect = await callerRowDigest(
      server,
      ownerToken,
      database,
      'mark_account_v1',
    );
    const resourceBeforeCollect = await callerRowDigest(
      server,
      ownerToken,
      database,
      'resource_account_v1',
    );
    await prepareOneQuantumFixture(
      server,
      database,
      ownerToken,
    );
    await useActualModule();
    const pending = await readActualResourceState(server, database, playerCredential());
    const rates = terrainResourceRates[pending.terrainKind];
    assertResourceState(pending, {
      balances: startingResourceBalances,
      pending: rates,
      revision: 0n,
    });
    if (pending.settledThroughMicros + resourceQuantumMicros !== initial.settledThroughMicros) {
      fail('Disposable timestamp fixture did not rewind exactly one quantum.');
    }
    const expectedBalances = Object.freeze({
      food: startingResourceBalances.food + rates.food,
      wood: startingResourceBalances.wood + rates.wood,
      stone: startingResourceBalances.stone + rates.stone,
      gold: startingResourceBalances.gold + rates.gold,
    });
    await callLoopbackReducer(
      server,
      database,
      'collect_resources_v1',
      playerCredential(),
      '[]',
      200,
    );
    const collected = await readActualResourceState(server, database, playerCredential());
    assertResourceState(collected, {
      balances: expectedBalances,
      pending: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
      revision: 1n,
    });
    if (collected.settledThroughMicros !== initial.settledThroughMicros) {
      fail('Actual module collection cursor was invalid.');
    }
    await usePrivateInspectionModule();
    if (await callerRowDigest(server, ownerToken, database, 'mark_account_v1') !== marksBeforeCollect) {
      fail('Actual resource collection changed the independent Marks account.');
    }
    const resourceAfterCollect = await callerRowDigest(
      server,
      ownerToken,
      database,
      'resource_account_v1',
    );
    if (
      resourceAfterCollect === resourceBeforeCollect
    ) fail('Actual resource collection did not persist the positive-quantum settlement.');

    stage = 'legacy-backfill';
    const marksBeforeBackfill = await callerRowDigest(
      server,
      ownerToken,
      database,
      'mark_account_v1',
    );
    await privateSql(
      server,
      ownerToken,
      database,
      `DELETE FROM resource_account_v1 WHERE fid = ${actualModuleFounderFid}`,
    );
    if (await countForFid(server, ownerToken, database, 'resource_account_v1') !== 0n) {
      fail('Legacy missing-resource fixture was not created.');
    }
    await useActualModule();
    await callLoopbackProcedure(
      server,
      database,
      'get_my_resource_state_v1',
      playerCredential(),
      '[]',
      500,
    );
    assertAdminResourceStatus(
      await readActualAdminResourceStatus(server, database, adminCredential()),
      {
        allowedFids: 1n,
        castles: 1n,
        markAccounts: 1n,
        resourceAccounts: 0n,
        missingResourceAccounts: 1n,
        orphanedResourceAccounts: 0n,
        resourceInvariantViolations: 0n,
      },
    );
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_resource_accounts_v1',
      adminCredential(),
      JSON.stringify([2, resourcePolicyVersion]),
      530,
    );
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_resource_accounts_v1',
      adminCredential(),
      JSON.stringify([1, 'unsupported-resource-policy']),
      530,
    );
    await usePrivateInspectionModule();
    if (
      await countForFid(server, ownerToken, database, 'resource_account_v1') !== 0n
      || await actionCount(server, ownerToken, database, 'backfill_resource_accounts_v1') !== 0n
    ) fail('Rejected resource backfill changed private state or audit history.');
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_resource_accounts_v1',
      adminCredential(),
      JSON.stringify([1, resourcePolicyVersion]),
      200,
    );
    await usePrivateInspectionModule();
    if (
      await countForFid(server, ownerToken, database, 'resource_account_v1') !== 1n
      || await actionCount(server, ownerToken, database, 'backfill_resource_accounts_v1') !== 1n
      || await callerRowDigest(server, ownerToken, database, 'mark_account_v1') !== marksBeforeBackfill
    ) fail('Guarded resource backfill did not create exactly one isolated account.');
    await useActualModule();
    assertAdminResourceStatus(
      await readActualAdminResourceStatus(server, database, adminCredential()),
      {
        allowedFids: 1n,
        castles: 1n,
        markAccounts: 1n,
        resourceAccounts: 1n,
        missingResourceAccounts: 0n,
        orphanedResourceAccounts: 0n,
        resourceInvariantViolations: 0n,
      },
    );
    const backfilledState = await readActualResourceState(
      server,
      database,
      playerCredential(),
    );
    assertResourceState(backfilledState, {
      balances: startingResourceBalances,
      pending: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
      revision: 0n,
    });
    await usePrivateInspectionModule();
    const backfilledResourceDigest = await callerRowDigest(
      server,
      ownerToken,
      database,
      'resource_account_v1',
    );
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_resource_accounts_v1',
      adminCredential(),
      JSON.stringify([1, resourcePolicyVersion]),
      200,
    );
    await usePrivateInspectionModule();
    if (
      await actionCount(server, ownerToken, database, 'backfill_resource_accounts_v1') !== 1n
      || await callerRowDigest(server, ownerToken, database, 'resource_account_v1')
        !== backfilledResourceDigest
    ) fail('Exact resource backfill rerun was not a complete no-op.');

    stage = 'conflict-rejection';
    const conflictCreated = await tryPrivateSqlMutation(
      server,
      ownerToken,
      database,
      `UPDATE resource_account_v1 SET policy_version = 'conflicting-local-policy' WHERE fid = ${actualModuleFounderFid}`,
    );
    if (!conflictCreated) fail('Disposable SQL could not create a bounded resource conflict.');
    const conflictingResourceDigest = await callerRowDigest(
      server,
      ownerToken,
      database,
      'resource_account_v1',
    );
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_resource_accounts_v1',
      adminCredential(),
      JSON.stringify([1, resourcePolicyVersion]),
      530,
    );
    await usePrivateInspectionModule();
    if (
      await actionCount(server, ownerToken, database, 'backfill_resource_accounts_v1') !== 1n
      || await callerRowDigest(server, ownerToken, database, 'resource_account_v1')
      !== conflictingResourceDigest
    ) fail('Rejected conflicting resource state was mutated or audited.');
    await useActualModule();
    assertAdminResourceStatus(
      await readActualAdminResourceStatus(server, database, adminCredential()),
      {
        allowedFids: 1n,
        castles: 1n,
        markAccounts: 1n,
        resourceAccounts: 1n,
        missingResourceAccounts: 0n,
        orphanedResourceAccounts: 0n,
        resourceInvariantViolations: 1n,
      },
    );
    return 'one-quantum';
  } catch (error) {
    if (error instanceof MigrationProofError) {
      throw new MigrationProofError(
        `Actual-module resource lifecycle failed at ${stage}: ${error.message}`,
      );
    }
    throw new MigrationProofError(`Actual-module resource lifecycle failed at ${stage}.`);
  }
}

/**
 * Exercise the real compiled Gold/Food/Wood/Stone dispatch boundary and the shortest
 * real Gold scheduler lifecycle on an isolated loopback database. The pinned
 * standalone server has no virtual clock, so this waits for the canonical Gold
 * arrival and one positive whole-minute collection without rewriting any
 * candidate-created timestamp.
 */
async function verifyActualModuleExpeditionLifecycles(
  server,
  database,
  privateKey,
  ownerToken,
) {
  let stage = 'seed-world';
  let activeModule = 'actual';
  const actualArtifactPath = join(additiveModule, 'dist', 'bundle.js');
  // Reusing the candidate fixture preserves the complete v14 suffix during
  // SQL inspection; publishing any predecessor would request a downgrade.
  const inspectionArtifactPath = join(additiveV14SchemaFixture, 'dist', 'bundle.js');
  const useActualModule = async () => {
    if (activeModule === 'actual') return;
    await publishBuiltArtifact(server, ownerToken, actualArtifactPath, database);
    activeModule = 'actual';
  };
  const useInspectionModule = async () => {
    if (activeModule === 'inspection') return;
    await publishBuiltArtifact(server, ownerToken, inspectionArtifactPath, database);
    activeModule = 'inspection';
  };
  const adminCredential = () => createEphemeralJwt(privateKey, adminServiceClaims());
  const rotatingPlayerCredential = fid => {
    let credential;
    let refreshAt = 0;
    return () => {
      if (credential === undefined || Date.now() >= refreshAt) {
        credential = createEphemeralJwt(privateKey, playerClaims(
          fid,
          `farcaster:${fid}`,
          1,
          540,
        ));
        refreshAt = Date.now() + 7 * 60 * 1_000;
      }
      return credential;
    };
  };
  const founderCredential = rotatingPlayerCredential(actualModuleFounderFid);
  const contenderCredential = rotatingPlayerCredential(actualModuleOtherFid);
  const disabledRequestCredential = operation => createEphemeralJwt(
    privateKey,
    accessRequestServiceClaims(actualModuleFounderFid, operation),
  );
  const primaryKey = resource => `migration-${resource.kind}-primary-0001`;
  const contenderKey = resource => `migration-${resource.kind}-contender-0001`;
  const goldResource = expeditionResources.find(resource => resource.kind === 'gold');
  if (goldResource === undefined) fail('Actual Gold expedition proof configuration was missing.');

  try {
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_world',
      adminCredential(),
      '[]',
      200,
      120_000,
    );

    stage = 'founders';
    for (const [fid, username] of [
      [actualModuleFounderFid, 'migration.expedition.one'],
      [actualModuleOtherFid, 'migration.expedition.two'],
    ]) {
      await callLoopbackReducer(
        server,
        database,
        'admin_admit_founder_v1',
        adminCredential(),
        JSON.stringify([
          fid,
          'disposable compiled expedition lifecycle proof',
          username,
          { some: username === 'migration.expedition.one'
            ? 'Migration Expedition One'
            : 'Migration Expedition Two' },
          `https://profiles.example.com/${username}.png`,
          { some: 'Disposable loopback-only expedition fixture' },
          profilePolicyVersion,
        ]),
        200,
      );
    }
    for (const credential of [founderCredential(), contenderCredential()]) {
      await callLoopbackReducer(
        server,
        database,
        'bootstrap_player_v2',
        credential,
        '[]',
        200,
      );
      await callLoopbackReducer(
        server,
        database,
        'accept_alpha_terms_v1',
        credential,
        JSON.stringify([alphaTermsVersion, true]),
        200,
      );
    }

    stage = 'site-seed';
    for (const resource of expeditionResources) {
      await callLoopbackReducer(
        server,
        database,
        resource.seedReducer,
        adminCredential(),
        JSON.stringify([Number(resource.siteCount), resource.sitePolicyVersion]),
        200,
        120_000,
      );
    }
    await useInspectionModule();
    for (const resource of expeditionResources) {
      if (await count(server, ownerToken, database, resource.siteTable) !== resource.siteCount) {
        fail(`Actual ${resource.kind} catalog seed was incomplete.`);
      }
    }

    stage = 'dispatch';
    await useActualModule();
    for (const resource of expeditionResources) {
      await callLoopbackReducer(
        server,
        database,
        resource.dispatchReducer,
        founderCredential(),
        JSON.stringify([resource.siteId, primaryKey(resource)]),
        200,
      );
    }

    stage = 'idempotent-replay-and-concurrent-reservation';
    await Promise.all(expeditionResources.flatMap(resource => [
      callLoopbackReducer(
        server,
        database,
        resource.dispatchReducer,
        founderCredential(),
        JSON.stringify([resource.siteId, primaryKey(resource)]),
        200,
      ),
      callLoopbackReducer(
        server,
        database,
        resource.dispatchReducer,
        contenderCredential(),
        JSON.stringify([resource.siteId, contenderKey(resource)]),
        530,
      ),
    ]));
    // Do not republish the inspection fixture while candidate-created
    // schedules are live: scheduled reducer lineage is module-version-bound.
    // Candidate procedures prove the immediate owner/contender state here;
    // exact private row counts are inspected only after executable checks end.
    for (const resource of expeditionResources) {
      const founderState = await readActualExpeditionState(
        server,
        database,
        founderCredential(),
        resource,
      );
      const contenderState = await readActualExpeditionState(
        server,
        database,
        contenderCredential(),
        resource,
      );
      if (
        !founderState.active
        || founderState.phase !== 'outbound'
        || founderState.siteId !== resource.siteId
        || contenderState.active
      ) fail(`Actual ${resource.kind} dispatch replay or reservation was not atomic.`);
    }

    stage = 'canonical-schedule';
    for (const resource of expeditionResources) {
      const dispatched = await readActualExpeditionState(
        server,
        database,
        founderCredential(),
        resource,
      );
      const travelMicros = resource.routeSteps * 30_000_000n;
      if (
        !dispatched.active
        || dispatched.phase !== 'outbound'
        || dispatched.siteId !== resource.siteId
        || dispatched.arrivesAtMicros - dispatched.startedAtMicros !== travelMicros
        || dispatched.gatheringEndsAtMicros - dispatched.arrivesAtMicros
          !== dispatched.gatheringDurationMicros
        || dispatched.returnsAtMicros - dispatched.gatheringEndsAtMicros !== travelMicros
        || dispatched.ratePerMinute !== 1n
      ) fail(`Actual ${resource.kind} dispatch timeline was not server canonical.`);
    }

    stage = 'premature-collection-no-op';
    const balancesBeforeCollection = (await readActualResourceState(
      server,
      database,
      founderCredential(),
    )).balances;
    for (const resource of expeditionResources) {
      await callLoopbackReducer(
        server,
        database,
        resource.collectReducer,
        founderCredential(),
        '[]',
        200,
      );
    }
    const balancesAfterCollection = (await readActualResourceState(
      server,
      database,
      founderCredential(),
    )).balances;
    assert.deepEqual(balancesAfterCollection, balancesBeforeCollection);
    for (const resource of expeditionResources) {
      const state = await readActualExpeditionState(
        server,
        database,
        founderCredential(),
        resource,
      );
      if (
        !state.active
        || state.phase !== 'outbound'
        || state.accrued !== 0n
        || state.credited !== 0n
        || state.pending !== 0n
      ) fail(`Actual ${resource.kind} premature collection was not a no-op.`);
    }
    for (const resource of expeditionResources) {
      await callLoopbackReducer(
        server,
        database,
        resource.collectReducer,
        founderCredential(),
        '[]',
        200,
      );
    }
    const balancesAfterReplayCollection = (await readActualResourceState(
      server,
      database,
      founderCredential(),
    )).balances;
    assert.deepEqual(balancesAfterReplayCollection, balancesBeforeCollection);

    stage = 'actual-gold-arrival';
    const arrivedGold = await waitForActualExpeditionState(
      server,
      database,
      founderCredential,
      goldResource,
      candidate => candidate.active && candidate.phase === 'gathering',
    );
    if (arrivedGold.siteId !== goldResource.siteId) {
      fail('Actual Gold arrival changed its canonical site.');
    }

    stage = 'actual-gold-collection';
    await waitForActualExpeditionState(
      server,
      database,
      founderCredential,
      goldResource,
      candidate => candidate.active
        && candidate.phase === 'gathering'
        && candidate.pending > 0n,
    );
    const balancesBeforeGoldCollection = (await readActualResourceState(
      server,
      database,
      founderCredential(),
    )).balances;
    await callLoopbackReducer(
      server,
      database,
      goldResource.collectReducer,
      founderCredential(),
      '[]',
      200,
    );
    const balancesAfterGoldCollection = (await readActualResourceState(
      server,
      database,
      founderCredential(),
    )).balances;
    const collectedGold = await readActualExpeditionState(
      server,
      database,
      founderCredential(),
      goldResource,
    );
    if (
      !collectedGold.active
      || collectedGold.phase !== 'gathering'
      || collectedGold.accrued === 0n
      || collectedGold.credited !== collectedGold.accrued
      || collectedGold.pending !== 0n
      || balancesAfterGoldCollection.gold <= balancesBeforeGoldCollection.gold
    ) fail('Actual Gold collection did not credit a positive whole-minute award.');
    await callLoopbackReducer(
      server,
      database,
      goldResource.collectReducer,
      founderCredential(),
      '[]',
      200,
    );
    const balancesAfterGoldReplay = (await readActualResourceState(
      server,
      database,
      founderCredential(),
    )).balances;
    assert.deepEqual(balancesAfterGoldReplay, balancesAfterGoldCollection);

    stage = 'post-gold-collection-shape';
    await useInspectionModule();
    for (const resource of expeditionResources) {
      const scheduleCount = await count(server, ownerToken, database, resource.scheduleTable);
      if (
        await count(server, ownerToken, database, resource.expeditionTable) !== 1n
        || await count(server, ownerToken, database, resource.occupationTable) !== 1n
        || await count(server, ownerToken, database, resource.idempotencyTable) !== 1n
        || scheduleCount < 2n
        || scheduleCount > 3n
      ) fail(`Actual ${resource.kind} expedition shape was not preserved.`);
    }
    if (
      await count(server, ownerToken, database, goldResource.scheduleTable) !== 2n
      || countFromSql(await privateSql(
        server,
        ownerToken,
        database,
        `SELECT COUNT(*) AS warpkeep_count FROM ${goldResource.occupationTable} WHERE phase = 'gathering'`,
      )) !== 1n
    ) fail('Actual Gold arrival/collection shape was not preserved.');

    stage = 'worker-stage-backfill-and-drain-start';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_stage_worker_system_v1',
      adminCredential(),
      '[]',
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_worker_roster_v1',
      adminCredential(),
      '[]',
      200,
    );
    // The exact four-worker backfill is intentionally idempotent.
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_worker_roster_v1',
      adminCredential(),
      '[]',
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'admin_begin_worker_legacy_drain_v1',
      adminCredential(),
      '[]',
      200,
    );
    const draining = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      draining.phase !== 'draining'
      || draining.expectedCastleCount !== 2n
      || draining.expectedWorkerCount !== 8n
      || draining.actualWorkerCount !== 8n
      || draining.legacyExpeditions !== 4n
      || draining.legacyOccupations !== 4n
      || draining.legacySchedules < 8n
      || draining.legacySchedules > 12n
      || draining.genericAssignments !== 0n
      || draining.malformedWorkerGraphRows !== 0n
    ) fail('Actual Worker drain did not start from the reviewed aggregate.');

    const moduleArtifactDigest = createHash('sha256')
      .update(await readFile(actualArtifactPath))
      .digest('hex');
    const activationArguments = [
      workerProtocolCapability,
      'alpha-0.3.18',
      workerRehearsalClientArtifactDigest,
      moduleArtifactDigest,
      workerRehearsalSourceCommit,
      2,
      resourcePolicyVersion,
      draining.resourceCatalogDigest,
      Number(draining.expectedCastleCount),
      Number(draining.expectedWorkerCount),
      draining.rosterDigest,
      draining.resourceRosterDigest,
    ];
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_worker_system_v1',
      adminCredential(),
      JSON.stringify(activationArguments),
      530,
    );

    stage = 'owner-legacy-return';
    const goldBeforeReturn = await readActualExpeditionState(
      server,
      database,
      founderCredential(),
      goldResource,
    );
    if (!goldBeforeReturn.active || goldBeforeReturn.expeditionId === undefined) {
      fail('Actual owner legacy return lacked an exact private expedition.');
    }
    await callLoopbackReducer(
      server,
      database,
      'return_legacy_expedition_v1',
      founderCredential(),
      JSON.stringify(['gold', goldBeforeReturn.expeditionId]),
      200,
    );
    // Lost-response retry: the already-absent exact expedition is a no-op.
    await callLoopbackReducer(
      server,
      database,
      'return_legacy_expedition_v1',
      founderCredential(),
      JSON.stringify(['gold', goldBeforeReturn.expeditionId]),
      200,
    );
    const goldAfterReturn = await readActualExpeditionState(
      server,
      database,
      founderCredential(),
      goldResource,
    );
    if (goldAfterReturn.active) fail('Actual owner legacy return did not close Gold.');

    stage = 'operator-legacy-drain';
    const beforeOperatorDrain = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      beforeOperatorDrain.phase !== 'draining'
      || beforeOperatorDrain.legacyGoldExpeditions !== 0n
      || beforeOperatorDrain.legacyFoodExpeditions !== 1n
      || beforeOperatorDrain.legacyWoodExpeditions !== 1n
      || beforeOperatorDrain.legacyStoneExpeditions !== 1n
    ) fail('Actual owner return did not preserve the remaining drain graph.');
    const completeDrainArguments = [
      workerLegacyDrainCapability,
      workerRehearsalSourceCommit,
      moduleArtifactDigest,
      Number(beforeOperatorDrain.expectedCastleCount),
      Number(beforeOperatorDrain.expectedWorkerCount),
      beforeOperatorDrain.rosterDigest,
      beforeOperatorDrain.resourceRosterDigest,
      beforeOperatorDrain.resourceCatalogDigest,
      Number(beforeOperatorDrain.legacyGoldExpeditions),
      Number(beforeOperatorDrain.legacyFoodExpeditions),
      Number(beforeOperatorDrain.legacyWoodExpeditions),
      Number(beforeOperatorDrain.legacyStoneExpeditions),
      Number(beforeOperatorDrain.legacyGoldOccupations),
      Number(beforeOperatorDrain.legacyFoodOccupations),
      Number(beforeOperatorDrain.legacyWoodOccupations),
      Number(beforeOperatorDrain.legacyStoneOccupations),
      Number(beforeOperatorDrain.legacyGoldSchedules),
      Number(beforeOperatorDrain.legacyFoodSchedules),
      Number(beforeOperatorDrain.legacyWoodSchedules),
      Number(beforeOperatorDrain.legacyStoneSchedules),
    ];
    await callLoopbackReducer(
      server,
      database,
      'admin_complete_worker_legacy_drain_v1',
      adminCredential(),
      JSON.stringify(completeDrainArguments),
      200,
    );
    // Ambiguous-success retry uses the original reviewed nonzero envelope and
    // must remain mutation-free when the authoritative graph is already zero.
    await callLoopbackReducer(
      server,
      database,
      'admin_complete_worker_legacy_drain_v1',
      adminCredential(),
      JSON.stringify(completeDrainArguments),
      200,
    );
    const drained = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      drained.phase !== 'draining'
      || drained.legacyExpeditions !== 0n
      || drained.legacyOccupations !== 0n
      || drained.legacySchedules !== 0n
      || drained.genericAssignments !== 0n
    ) fail('Actual operator legacy drain did not reach exact zero.');
    const postDrainActivationArguments = [
      workerProtocolCapability,
      'alpha-0.3.18',
      workerRehearsalClientArtifactDigest,
      moduleArtifactDigest,
      workerRehearsalSourceCommit,
      2,
      resourcePolicyVersion,
      drained.resourceCatalogDigest,
      Number(drained.expectedCastleCount),
      Number(drained.expectedWorkerCount),
      drained.rosterDigest,
      drained.resourceRosterDigest,
    ];

    stage = 'generic-worker-activation';
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_worker_system_v1',
      adminCredential(),
      JSON.stringify(postDrainActivationArguments),
      200,
    );
    const active = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      active.phase !== 'active'
      || active.actualWorkerCount !== 8n
      || active.legacyExpeditions !== 0n
      || active.legacyOccupations !== 0n
      || active.legacySchedules !== 0n
    ) fail('Actual Worker activation did not preserve the zero cutover.');

    stage = 'generic-worker-recall-and-node-reuse';
    const roster = await readActualWorkerRoster(
      server,
      database,
      founderCredential(),
    );
    const initialControl = await readActualWorkerControlState(
      server,
      database,
      founderCredential(),
    );
    if (
      initialControl.fid !== BigInt(actualModuleFounderFid)
      || initialControl.castleId !== roster.castleId
      || initialControl.workers.some((worker, index) => (
        worker.workerId !== roster.workers[index]?.workerId
        || worker.status !== 'idle'
      ))
    ) fail('Actual atomic Worker control state did not match the activated roster.');
    const [workerOne, workerTwo, workerThree, workerFour] = roster.workers;
    await callLoopbackReducer(
      server,
      database,
      'dispatch_worker_v1',
      founderCredential(),
      JSON.stringify([
        workerOne.workerId,
        'gold',
        goldResource.siteId,
        'migration-worker-dispatch-0001',
      ]),
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'recall_worker_v1',
      founderCredential(),
      JSON.stringify([workerOne.workerId, 'migration-worker-recall-0001']),
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'recall_worker_v1',
      founderCredential(),
      JSON.stringify([workerOne.workerId, 'migration-worker-recall-0001']),
      200,
    );
    await waitForActualWorkerRoster(
      server,
      database,
      founderCredential,
      candidate => candidate.workers[0]?.status === 'idle',
    );
    const workerDestinations = [
      [workerOne, expeditionResources[1]],
      [workerTwo, goldResource],
      [workerThree, expeditionResources[2]],
      [workerFour, expeditionResources[3]],
    ];
    for (const [worker, resource] of workerDestinations) {
      await callLoopbackReducer(
        server,
        database,
        'dispatch_worker_v1',
        founderCredential(),
        JSON.stringify([
          worker.workerId,
          resource.kind,
          resource.siteId,
          `migration-worker-${resource.kind}-0002`,
        ]),
        200,
      );
    }
    const fourAssigned = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      fourAssigned.genericAssignments !== 4n
      || fourAssigned.genericOccupations !== 4n
      || fourAssigned.genericSchedules !== 4n
    ) fail('Actual Worker flexible assignment did not create four exact leases.');
    const assignedControl = await readActualWorkerControlState(
      server,
      database,
      founderCredential(),
    );
    if (
      assignedControl.castleId !== roster.castleId
      || assignedControl.workers.some(worker => worker.status === 'idle')
    ) fail('Actual atomic Worker control state did not preserve four assignments.');
    await callLoopbackReducer(
      server,
      database,
      'recall_all_workers_v1',
      founderCredential(),
      JSON.stringify(['migration-worker-recall-all-0001']),
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'recall_all_workers_v1',
      founderCredential(),
      JSON.stringify(['migration-worker-recall-all-0001']),
      200,
    );
    const reconnectedRoster = await waitForActualWorkerRoster(
      server,
      database,
      founderCredential,
      candidate => candidate.workers.every(worker => worker.status === 'idle'),
    );
    if (reconnectedRoster.workers.length !== 4) {
      fail('Actual Worker reconnect did not preserve the complete roster.');
    }
    const reconnectedControl = await readActualWorkerControlState(
      server,
      database,
      founderCredential(),
    );
    if (
      reconnectedControl.castleId !== roster.castleId
      || reconnectedControl.workers.some(worker => worker.status !== 'idle')
    ) fail('Actual atomic Worker control state did not preserve the recalled roster.');
    const finalWorkerStatus = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      finalWorkerStatus.phase !== 'active'
      || finalWorkerStatus.genericAssignments !== 0n
      || finalWorkerStatus.genericOccupations !== 0n
      || finalWorkerStatus.genericSchedules !== 0n
    ) fail('Actual Worker return completion did not release every node.');

    // An enabled founder with no request has no deletion receipt. If a
    // concurrent administrator disables that founder after status inspection,
    // the stale reset must fail rather than claim the other action as its own.
    stage = 'enabled-no-request-reset-status';
    await useActualModule();
    const enabledNoRequestStatus = parseAdminAccessRequestResetStatus(
      await callLoopbackProcedure(
        server,
        database,
        'admin_get_access_request_reset_status_v1',
        adminCredential(),
        JSON.stringify([actualModuleOtherFid]),
        200,
      ),
    );
    if (
      enabledNoRequestStatus.admissionState !== 'enabled'
      || enabledNoRequestStatus.requestState !== 'not_requested'
      || enabledNoRequestStatus.requestCycle !== undefined
      || enabledNoRequestStatus.requestedAtMicros !== undefined
    ) fail('Enabled/no-request stale-reset fixture was invalid.');
    await useInspectionModule();
    const resetAuditBeforeConcurrentDisable = await actionCount(
      server,
      ownerToken,
      database,
      'reset_access_request_v1',
    );
    stage = 'enabled-no-request-concurrent-disable';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_disable_fid',
      adminCredential(),
      JSON.stringify([actualModuleOtherFid, 'disposable concurrent reset guard']),
      200,
    );
    stage = 'enabled-no-request-stale-reset-rejection';
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      adminCredential(),
      JSON.stringify([
        actualModuleOtherFid,
        true,
        enabledNoRequestStatus.authEpoch,
        { none: [] },
        { none: [] },
        'disposable stale enabled-no-request reset',
      ]),
      530,
    );
    await useInspectionModule();
    if (
      await actionCount(server, ownerToken, database, 'reset_access_request_v1')
      !== resetAuditBeforeConcurrentDisable
    ) fail('Rejected enabled/no-request reset created an audit receipt.');
    stage = 'enabled-no-request-founder-restore';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_allow_fid',
      adminCredential(),
      JSON.stringify([actualModuleOtherFid, 'restore concurrent reset guard fixture']),
      200,
    );

    stage = 'founded-access-request-reset';
    stage = 'founded-reset-admin-denial';
    await callLoopbackProcedure(
      server,
      database,
      'admin_get_access_request_reset_status_v1',
      disabledRequestCredential('status'),
      JSON.stringify([actualModuleFounderFid]),
      500,
    );
    stage = 'founded-reset-initial-status';
    let resetStatusBefore = parseAdminAccessRequestResetStatus(
      await callLoopbackProcedure(
        server,
        database,
        'admin_get_access_request_reset_status_v1',
        adminCredential(),
        JSON.stringify([actualModuleFounderFid]),
        200,
      ),
    );
    if (
      resetStatusBefore.admissionState === 'enabled'
      && resetStatusBefore.requestState === 'not_requested'
    ) {
      stage = 'founded-reset-fixture-disable';
      await callLoopbackReducer(
        server,
        database,
        'admin_disable_fid',
        adminCredential(),
        JSON.stringify([actualModuleFounderFid, 'prepare resolved reset fixture']),
        200,
      );
      stage = 'founded-reset-fixture-request';
      const preparedRequest = parseAccessRequestStatus(
        await callLoopbackProcedure(
          server,
          database,
          'access_request_submit_v1',
          disabledRequestCredential('submit'),
          '[]',
          200,
        ),
        'prepared founder reset request',
      );
      if (preparedRequest.status !== 'requested') {
        fail('Founded reset fixture could not prepare a request.');
      }
      stage = 'founded-reset-fixture-readmit';
      await callLoopbackReducer(
        server,
        database,
        'admin_allow_fid',
        adminCredential(),
        JSON.stringify([actualModuleFounderFid, 'prepare resolved reset fixture']),
        200,
      );
      stage = 'founded-reset-fixture-status';
      resetStatusBefore = parseAdminAccessRequestResetStatus(
        await callLoopbackProcedure(
          server,
          database,
          'admin_get_access_request_reset_status_v1',
          adminCredential(),
          JSON.stringify([actualModuleFounderFid]),
          200,
        ),
      );
    }
    if (
      resetStatusBefore.admissionState !== 'enabled'
      || resetStatusBefore.requestState !== 'resolved'
      || resetStatusBefore.requestCycle === undefined
      || resetStatusBefore.requestedAtMicros === undefined
      || resetStatusBefore.requestCycle > BigInt(Number.MAX_SAFE_INTEGER)
      || resetStatusBefore.requestedAtMicros > BigInt(Number.MAX_SAFE_INTEGER)
    ) fail('Founded reset did not begin from the exact resolved-request state.');
    stage = 'founded-reset-arguments';
    const resetArguments = status => JSON.stringify([
      actualModuleFounderFid,
      status.admissionState === 'enabled',
      status.authEpoch,
      { some: Number(status.requestCycle) },
      { some: Number(status.requestedAtMicros) },
      'disposable exact founder reapplication reset',
    ]);
    const firstResetArguments = resetArguments(resetStatusBefore);
    stage = 'founded-reset-reducer-denial';
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      disabledRequestCredential('submit'),
      firstResetArguments,
      530,
    );
    stage = 'founded-reset-retained-before';
    await useInspectionModule();
    const retainedBeforeReset = await founderReapplicationRetainedStateDigest(
      server,
      ownerToken,
      database,
    );
    stage = 'founded-reset-first-commit';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      adminCredential(),
      firstResetArguments,
      200,
    );
    stage = 'founded-reset-first-postcondition';
    const resetStatusAfter = parseAdminAccessRequestResetStatus(
      await callLoopbackProcedure(
        server,
        database,
        'admin_get_access_request_reset_status_v1',
        adminCredential(),
        JSON.stringify([actualModuleFounderFid]),
        200,
      ),
    );
    if (
      resetStatusAfter.admissionState !== 'disabled'
      || resetStatusAfter.authEpoch !== resetStatusBefore.authEpoch
      || resetStatusAfter.requestState !== 'not_requested'
      || resetStatusAfter.requestCycle !== undefined
      || resetStatusAfter.requestedAtMicros !== undefined
    ) {
      fail(
        'Founded reset postcondition was invalid: '
        + `admission=${resetStatusAfter.admissionState}, `
        + `epoch_preserved=${resetStatusAfter.authEpoch === resetStatusBefore.authEpoch}, `
        + `request=${resetStatusAfter.requestState}, `
        + `tuple_absent=${resetStatusAfter.requestCycle === undefined
          && resetStatusAfter.requestedAtMicros === undefined}.`,
      );
    }
    stage = 'founded-reset-first-preservation';
    await useInspectionModule();
    if (
      await countForFid(server, ownerToken, database, 'access_request_v1') !== 0n
      || await actionCount(server, ownerToken, database, 'reset_access_request_v1') !== 1n
      || await founderReapplicationRetainedStateDigest(server, ownerToken, database)
        !== retainedBeforeReset
    ) fail('Founded reset changed retained player state or missed its exact audit.');

    // The deleted request tuple makes an ambiguous-response retry a no-op. A
    // new request independently blocks the stale tuple before any mutation.
    stage = 'founded-reset-exact-deletion-retry';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      adminCredential(),
      firstResetArguments,
      200,
    );
    stage = 'founded-reset-exact-deletion-retry-audit';
    await useInspectionModule();
    if (await actionCount(server, ownerToken, database, 'reset_access_request_v1') !== 1n) {
      fail('Exact founded reset deletion retry duplicated its audit.');
    }
    stage = 'founded-reset-fresh-request';
    await useActualModule();
    const postResetRequest = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_submit_v1',
        disabledRequestCredential('submit'),
        '[]',
        200,
      ),
      'post-reset founder access request',
    );
    if (
      postResetRequest.status !== 'requested'
      || postResetRequest.requestedAtMicros === undefined
    ) fail('Founded reset did not permit one fresh request.');
    stage = 'founded-reset-stale-rejection';
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      adminCredential(),
      firstResetArguments,
      530,
    );
    stage = 'founded-reset-pending-status';
    const pendingResetStatus = parseAdminAccessRequestResetStatus(
      await callLoopbackProcedure(
        server,
        database,
        'admin_get_access_request_reset_status_v1',
        adminCredential(),
        JSON.stringify([actualModuleFounderFid]),
        200,
      ),
    );
    if (
      pendingResetStatus.admissionState !== 'disabled'
      || pendingResetStatus.requestState !== 'pending'
      || pendingResetStatus.requestCycle === undefined
      || pendingResetStatus.requestedAtMicros !== postResetRequest.requestedAtMicros
      || pendingResetStatus.requestCycle > BigInt(Number.MAX_SAFE_INTEGER)
      || pendingResetStatus.requestedAtMicros > BigInt(Number.MAX_SAFE_INTEGER)
    ) fail('Stale founded reset damaged the fresh request.');

    // Exercise the live owner-canary shape as well: already disabled with one
    // pending request. It deletes only that exact tuple and remains retry-safe.
    stage = 'disabled-pending-reset-arguments';
    const pendingResetArguments = resetArguments(pendingResetStatus);
    stage = 'disabled-pending-reset-commit';
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      adminCredential(),
      pendingResetArguments,
      200,
    );
    stage = 'disabled-pending-reset-retry';
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      adminCredential(),
      pendingResetArguments,
      200,
    );
    stage = 'disabled-pending-reset-preservation';
    await useInspectionModule();
    if (
      await countForFid(server, ownerToken, database, 'access_request_v1') !== 0n
      || await actionCount(server, ownerToken, database, 'reset_access_request_v1') !== 2n
      || await founderReapplicationRetainedStateDigest(server, ownerToken, database)
        !== retainedBeforeReset
    ) fail('Disabled pending-request reset changed retained state or retry history.');

    stage = 'disabled-pending-reset-reapplication';
    await useActualModule();
    const finalFreshRequest = parseAccessRequestStatus(
      await callLoopbackProcedure(
        server,
        database,
        'access_request_submit_v1',
        disabledRequestCredential('submit'),
        '[]',
        200,
      ),
      'final fresh founder access request',
    );
    if (
      finalFreshRequest.status !== 'requested'
      || finalFreshRequest.requestedAtMicros === undefined
    ) fail('Disabled pending-request reset did not permit reapplication.');
    stage = 'same-cycle-stale-reset-rejection';
    await callLoopbackReducer(
      server,
      database,
      'admin_reset_access_request_v1',
      adminCredential(),
      pendingResetArguments,
      530,
    );
    stage = 'same-cycle-fresh-request-status';
    const sameCycleFreshStatus = parseAdminAccessRequestResetStatus(
      await callLoopbackProcedure(
        server,
        database,
        'admin_get_access_request_reset_status_v1',
        adminCredential(),
        JSON.stringify([actualModuleFounderFid]),
        200,
      ),
    );
    if (
      sameCycleFreshStatus.requestState !== 'pending'
      || sameCycleFreshStatus.requestCycle !== pendingResetStatus.requestCycle
      || sameCycleFreshStatus.requestedAtMicros !== finalFreshRequest.requestedAtMicros
    ) fail('Timestamp-bound stale reset damaged a same-cycle fresh request.');
    stage = 'final-founder-readmission';
    await callLoopbackReducer(
      server,
      database,
      'admin_allow_fid',
      adminCredential(),
      JSON.stringify([actualModuleFounderFid, 'restore disposable founder after reset proof']),
      200,
    );
    stage = 'final-founder-readmission-status';
    const finalResetStatus = parseAdminAccessRequestResetStatus(
      await callLoopbackProcedure(
        server,
        database,
        'admin_get_access_request_reset_status_v1',
        adminCredential(),
        JSON.stringify([actualModuleFounderFid]),
        200,
      ),
    );
    if (
      finalResetStatus.admissionState !== 'enabled'
      || finalResetStatus.authEpoch !== pendingResetStatus.authEpoch + 1
      || finalResetStatus.requestState !== 'resolved'
      || finalResetStatus.requestCycle !== pendingResetStatus.requestCycle
      || finalResetStatus.requestedAtMicros !== finalFreshRequest.requestedAtMicros
    ) fail('Final founder re-admission did not resolve the exact fresh request epoch.');

    return 'v11/v12-compatible four-resource legacy drain, exact zero activation, atomic four-worker control, dispatch, recall one/all, reconnect, and node reuse';
  } catch (error) {
    if (error instanceof MigrationProofError) {
      throw new MigrationProofError(
        `Actual-module expedition lifecycle failed at ${stage}: ${error.message}`,
      );
    }
    const internalFailureClass = error instanceof ReferenceError
      ? 'reference invariant'
      : error instanceof TypeError
        ? 'type invariant'
        : 'unexpected internal invariant';
    throw new MigrationProofError(
      `Actual-module expedition lifecycle failed at ${stage}: ${internalFailureClass}.`,
    );
  }
}

async function verifyActualModuleWorkerRolloutFromV11(
  server,
  database,
  privateKey,
) {
  const fid = 730_003;
  const adminCredential = () => createEphemeralJwt(privateKey, adminServiceClaims());
  let playerAuthEpoch = 1;
  const playerCredential = () => createEphemeralJwt(
    privateKey,
    playerClaims(fid, `farcaster:${fid}`, playerAuthEpoch, 540),
  );
  const completedProductionAt = (state, observedAtMicros) => {
    if (
      !state.active
      || state.arrivesAtMicros === undefined
      || state.ratePerMinute === 0n
      || state.gatheringDurationMicros === 0n
      || observedAtMicros < state.arrivesAtMicros
    ) return 0n;
    const elapsed = observedAtMicros - state.arrivesAtMicros;
    const gatheringMicros = elapsed < state.gatheringDurationMicros
      ? elapsed
      : state.gatheringDurationMicros;
    const accrued = (
      gatheringMicros / legacyExpeditionMinuteMicros
    ) * state.ratePerMinute;
    if (accrued < state.credited) {
      fail('Populated v11 expedition credit cursor exceeded production.');
    }
    return accrued - state.credited;
  };
  const readSafeSettlementSnapshot = async () => {
    const seedGold = await readActualExpeditionState(
      server,
      database,
      playerCredential(),
      expeditionResources[0],
    );
    if (!seedGold.active || seedGold.arrivesAtMicros === undefined) {
      fail('Populated v11 settlement window lacked an active Gold expedition.');
    }
    for (let attempt = 0; attempt < 70; attempt += 1) {
      const timing = await readActualResourceState(
        server,
        database,
        playerCredential(),
      );
      const elapsed = timing.observedAtMicros - seedGold.arrivesAtMicros;
      if (
        elapsed >= 0n
        && elapsed % legacyExpeditionMinuteMicros <= 8_000_000n
      ) {
        const states = {};
        for (const resource of expeditionResources) {
          states[resource.kind] = await readActualExpeditionState(
            server,
            database,
            playerCredential(),
            resource,
          );
        }
        const confirmation = await readActualResourceState(
          server,
          database,
          playerCredential(),
        );
        const confirmationElapsed =
          confirmation.observedAtMicros - seedGold.arrivesAtMicros;
        if (
          confirmationElapsed >= 0n
          && confirmationElapsed % legacyExpeditionMinuteMicros <= 15_000_000n
          && expeditionResources.every(resource => {
            const state = states[resource.kind];
            return state?.active === true
              && state.pending === completedProductionAt(
                state,
                confirmation.observedAtMicros,
              );
          })
        ) {
          return Object.freeze({
            states: Object.freeze(states),
          });
        }
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
    }
    fail('Populated v11 settlement window could not be bounded safely.');
  };
  const actualArtifactPath = join(additiveModule, 'dist', 'bundle.js');
  const moduleArtifactDigest = createHash('sha256')
    .update(await readFile(actualArtifactPath))
    .digest('hex');
  let stage = 'preactivation';
  try {
    stage = 'daily-marks-v14-rollout';
    const dailyMarksBefore = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksBefore.allowedFids !== 1n
      || dailyMarksBefore.enabledAllowedFids !== 1n
      || dailyMarksBefore.markAccounts !== 1n
      || dailyMarksBefore.dailyAccounts !== 0n
      || dailyMarksBefore.legacyZeroAccounts !== 1n
      || dailyMarksBefore.invalidAccounts !== 0n
      || dailyMarksBefore.realmProfiles !== 1n
      || dailyMarksBefore.profileProjectionViolations !== 0n
      || dailyMarksBefore.missingFounderState !== 0n
      || dailyMarksBefore.grants !== 0n
      || dailyMarksBefore.currentDayGrants !== 0n
      || dailyMarksBefore.grantInvariantViolations !== 0n
      || dailyMarksBefore.grantAccountReconciliationViolations !== 0n
      || dailyMarksBefore.scheduleRows !== 0n
      || !dailyMarksBefore.scheduleConfigValid
      || dailyMarksBefore.legacyCompatibilityRows !== 0n
      || !dailyMarksBefore.readyForBackfill
      || dailyMarksBefore.readyForActivation
      || dailyMarksBefore.active
    ) fail('Populated v11 daily Marks predecessor aggregate was not exact.');
    // Exercise the publication-to-backfill interleaving explicitly: a player
    // may accept the current agreement after v14 is published but before the
    // operator migrates the frozen-zero predecessor account. That transition
    // must retain the predecessor projection and keep backfill ready.
    const agreementBeforeAcceptance = parseLoopbackJson(
      await callLoopbackProcedure(
        server,
        database,
        'get_my_entry_agreement_status_v1',
        playerCredential(),
        '[]',
        200,
      ),
      'pre-backfill entry-agreement status',
    );
    if (
      !Array.isArray(agreementBeforeAcceptance)
      || agreementBeforeAcceptance.length !== 2
      || agreementBeforeAcceptance[0] !== alphaTermsVersion
      || agreementBeforeAcceptance[1] !== false
    ) fail('Historical agreement evidence incorrectly authorized the v14 projection.');
    await callLoopbackReducer(
      server,
      database,
      'accept_alpha_terms_v1',
      playerCredential(),
      JSON.stringify([alphaTermsVersion, true]),
      200,
    );
    const agreementAfterAcceptance = parseLoopbackJson(
      await callLoopbackProcedure(
        server,
        database,
        'get_my_entry_agreement_status_v1',
        playerCredential(),
        '[]',
        200,
      ),
      'accepted pre-backfill entry-agreement status',
    );
    if (
      !Array.isArray(agreementAfterAcceptance)
      || agreementAfterAcceptance.length !== 2
      || agreementAfterAcceptance[0] !== alphaTermsVersion
      || agreementAfterAcceptance[1] !== true
    ) fail('Current agreement evidence did not authorize the v14 projection.');
    const dailyMarksAfterAcceptance = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksAfterAcceptance.utcDay !== dailyMarksBefore.utcDay
      || dailyMarksAfterAcceptance.dailyAccounts !== 0n
      || dailyMarksAfterAcceptance.legacyZeroAccounts !== 1n
      || dailyMarksAfterAcceptance.profileProjectionViolations !== 0n
      || dailyMarksAfterAcceptance.grants !== 0n
      || dailyMarksAfterAcceptance.scheduleRows !== 0n
      || !dailyMarksAfterAcceptance.readyForBackfill
      || dailyMarksAfterAcceptance.readyForActivation
      || dailyMarksAfterAcceptance.active
    ) fail('Agreement acceptance broke the frozen daily Marks predecessor.');
    await callLoopbackReducer(
      server,
      database,
      'admin_backfill_daily_mark_accounts_v1',
      adminCredential(),
      '[1]',
      200,
    );
    const dailyMarksBackfilled = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksBackfilled.utcDay !== dailyMarksBefore.utcDay
      || dailyMarksBackfilled.dailyAccounts !== 1n
      || dailyMarksBackfilled.legacyZeroAccounts !== 0n
      || dailyMarksBackfilled.grants !== 0n
      || dailyMarksBackfilled.scheduleRows !== 0n
      || !dailyMarksBackfilled.readyForActivation
      || dailyMarksBackfilled.active
    ) fail('Populated v11 daily Marks backfill was not exact.');
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_daily_marks_v1',
      adminCredential(),
      JSON.stringify([1, 1, Number(dailyMarksBackfilled.utcDay)]),
      200,
    );
    const dailyMarksActive = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksActive.utcDay !== dailyMarksBackfilled.utcDay
      || dailyMarksActive.dailyAccounts !== 1n
      || dailyMarksActive.legacyZeroAccounts !== 0n
      || dailyMarksActive.grants !== 1n
      || dailyMarksActive.currentDayGrants !== 1n
      || dailyMarksActive.grantInvariantViolations !== 0n
      || dailyMarksActive.grantAccountReconciliationViolations !== 0n
      || dailyMarksActive.scheduleRows !== 1n
      || !dailyMarksActive.scheduleConfigValid
      || !dailyMarksActive.active
    ) fail('Populated v11 daily Marks activation was not exact.');

    // A revocation retains its immutable same-day receipt and balance, but the
    // recovery checkpoint must compare only the currently enabled admission
    // set. Prove both an active-schedule retry while revoked and idempotent
    // re-entry without issuing a second receipt or Mark.
    await callLoopbackReducer(
      server,
      database,
      'admin_disable_fid',
      adminCredential(),
      JSON.stringify([fid, 'v14 revoked-receipt recovery proof']),
      200,
    );
    const dailyMarksRevoked = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksRevoked.utcDay !== dailyMarksActive.utcDay
      || dailyMarksRevoked.allowedFids !== 1n
      || dailyMarksRevoked.enabledAllowedFids !== 0n
      || dailyMarksRevoked.dailyAccounts !== 1n
      || dailyMarksRevoked.grants !== 1n
      || dailyMarksRevoked.currentDayGrants !== 0n
      || dailyMarksRevoked.grantInvariantViolations !== 0n
      || dailyMarksRevoked.grantAccountReconciliationViolations !== 0n
      || dailyMarksRevoked.profileProjectionViolations !== 0n
      || !dailyMarksRevoked.active
    ) fail('Same-day revoked daily Mark receipt was not eligibility-scoped.');
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_daily_marks_v1',
      adminCredential(),
      JSON.stringify([1, 0, Number(dailyMarksRevoked.utcDay)]),
      200,
    );
    const dailyMarksRevokedRetry = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksRevokedRetry.grants !== 1n
      || dailyMarksRevokedRetry.currentDayGrants !== 0n
      || dailyMarksRevokedRetry.enabledAllowedFids !== 0n
      || !dailyMarksRevokedRetry.active
    ) fail('Revoked daily Marks activation recovery was not idempotent.');
    await callLoopbackReducer(
      server,
      database,
      'admin_allow_fid',
      adminCredential(),
      JSON.stringify([fid, 'v14 same-day re-enable proof']),
      200,
    );
    playerAuthEpoch = 2;
    const dailyMarksReenabled = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksReenabled.utcDay !== dailyMarksRevoked.utcDay
      || dailyMarksReenabled.enabledAllowedFids !== 1n
      || dailyMarksReenabled.dailyAccounts !== 1n
      || dailyMarksReenabled.grants !== 1n
      || dailyMarksReenabled.currentDayGrants !== 1n
      || dailyMarksReenabled.grantInvariantViolations !== 0n
      || dailyMarksReenabled.grantAccountReconciliationViolations !== 0n
      || dailyMarksReenabled.profileProjectionViolations !== 0n
      || !dailyMarksReenabled.active
    ) fail('Same-day daily Marks re-entry was not exactly-once.');
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_daily_marks_v1',
      adminCredential(),
      JSON.stringify([1, 1, Number(dailyMarksReenabled.utcDay)]),
      200,
    );
    const dailyMarksReenabledRetry = await readActualAdminDailyMarksStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      dailyMarksReenabledRetry.grants !== 1n
      || dailyMarksReenabledRetry.currentDayGrants !== 1n
      || dailyMarksReenabledRetry.enabledAllowedFids !== 1n
      || !dailyMarksReenabledRetry.active
    ) fail('Re-enabled daily Marks activation recovery was not idempotent.');
    stage = 'preactivation';
    const absent = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      absent.phase !== 'absent'
      || absent.actualCastleCount !== 1n
      || absent.actualWorkerCount !== 0n
      || absent.legacyExpeditions !== 4n
      || absent.legacyOccupations !== 4n
      || absent.legacySchedules !== 8n
    ) fail('Populated v11 Worker predecessor did not survive v12 publication.');

    stage = 'stage-backfill-drain';
    for (const reducer of [
      'admin_stage_worker_system_v1',
      'admin_backfill_worker_roster_v1',
      'admin_backfill_worker_roster_v1',
      'admin_begin_worker_legacy_drain_v1',
    ]) {
      await callLoopbackReducer(
        server,
        database,
        reducer,
        adminCredential(),
        '[]',
        200,
      );
    }
    const draining = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      draining.phase !== 'draining'
      || draining.expectedCastleCount !== 1n
      || draining.expectedWorkerCount !== 4n
      || draining.actualWorkerCount !== 4n
      || draining.legacyExpeditions !== 4n
      || draining.legacyOccupations !== 4n
      || draining.legacySchedules !== 8n
      || draining.malformedWorkerGraphRows !== 0n
    ) fail('Populated v11 Worker predecessor did not stage exactly four workers.');
    const activationArguments = [
      workerProtocolCapability,
      'alpha-0.3.18',
      workerRehearsalClientArtifactDigest,
      moduleArtifactDigest,
      workerRehearsalSourceCommit,
      2,
      resourcePolicyVersion,
      draining.resourceCatalogDigest,
      Number(draining.expectedCastleCount),
      Number(draining.expectedWorkerCount),
      draining.rosterDigest,
      draining.resourceRosterDigest,
    ];
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_worker_system_v1',
      adminCredential(),
      JSON.stringify(activationArguments),
      530,
    );

    stage = 'owner-early-return';
    const settlementSnapshot = await readSafeSettlementSnapshot();
    const goldState = settlementSnapshot.states.gold;
    if (
      !goldState.active
      || goldState.phase !== 'gathering'
      || goldState.expeditionId === undefined
      || goldState.pending <= 0n
    ) fail('Populated v11 Gold state did not retain exact completed production.');
    await callLoopbackReducer(
      server,
      database,
      'return_legacy_expedition_v1',
      playerCredential(),
      JSON.stringify(['gold', goldState.expeditionId]),
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'return_legacy_expedition_v1',
      playerCredential(),
      JSON.stringify(['gold', goldState.expeditionId]),
      200,
    );

    stage = 'confirmed-final-drain';
    const beforeDrain = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    const drainArguments = [
      workerLegacyDrainCapability,
      workerRehearsalSourceCommit,
      moduleArtifactDigest,
      Number(beforeDrain.expectedCastleCount),
      Number(beforeDrain.expectedWorkerCount),
      beforeDrain.rosterDigest,
      beforeDrain.resourceRosterDigest,
      beforeDrain.resourceCatalogDigest,
      Number(beforeDrain.legacyGoldExpeditions),
      Number(beforeDrain.legacyFoodExpeditions),
      Number(beforeDrain.legacyWoodExpeditions),
      Number(beforeDrain.legacyStoneExpeditions),
      Number(beforeDrain.legacyGoldOccupations),
      Number(beforeDrain.legacyFoodOccupations),
      Number(beforeDrain.legacyWoodOccupations),
      Number(beforeDrain.legacyStoneOccupations),
      Number(beforeDrain.legacyGoldSchedules),
      Number(beforeDrain.legacyFoodSchedules),
      Number(beforeDrain.legacyWoodSchedules),
      Number(beforeDrain.legacyStoneSchedules),
    ];
    await callLoopbackReducer(
      server,
      database,
      'admin_complete_worker_legacy_drain_v1',
      adminCredential(),
      JSON.stringify(drainArguments),
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'admin_complete_worker_legacy_drain_v1',
      adminCredential(),
      JSON.stringify(drainArguments),
      200,
    );
    const resources = await readActualResourceState(
      server,
      database,
      playerCredential(),
    );
    if (
      expeditionResources.some(resource => {
        const state = settlementSnapshot.states[resource.kind];
        return state.pending <= 0n
          || completedProductionAt(state, resources.observedAtMicros)
            !== state.pending
          || resources.balances[resource.kind] !== state.pending;
      })
    ) fail('Populated v11 cutover did not settle the exact bounded production.');
    const drained = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      drained.legacyExpeditions !== 0n
      || drained.legacyOccupations !== 0n
      || drained.legacySchedules !== 0n
    ) fail('Populated v11 cutover did not remove every legacy lifecycle row.');
    const postDrainActivationArguments = [
      workerProtocolCapability,
      'alpha-0.3.18',
      workerRehearsalClientArtifactDigest,
      moduleArtifactDigest,
      workerRehearsalSourceCommit,
      2,
      resourcePolicyVersion,
      drained.resourceCatalogDigest,
      Number(drained.expectedCastleCount),
      Number(drained.expectedWorkerCount),
      drained.rosterDigest,
      drained.resourceRosterDigest,
    ];

    stage = 'activation';
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_worker_system_v1',
      adminCredential(),
      JSON.stringify(postDrainActivationArguments),
      200,
    );
    const active = await readActualWorkerRolloutStatus(
      server,
      database,
      adminCredential(),
    );
    if (active.phase !== 'active' || active.actualWorkerCount !== 4n) {
      fail('Populated v11 cutover did not activate the exact roster.');
    }

    stage = 'dispatch-recall-reuse-reconnect';
    const roster = await readActualWorkerRoster(
      server,
      database,
      playerCredential(),
    );
    const initialControl = await readActualWorkerControlState(
      server,
      database,
      playerCredential(),
    );
    if (
      initialControl.fid !== BigInt(fid)
      || initialControl.castleId !== roster.castleId
      || initialControl.workers.some((worker, index) => (
        worker.workerId !== roster.workers[index]?.workerId
        || worker.status !== 'idle'
      ))
    ) fail('Populated v11 atomic Worker control state did not match the activated roster.');
    const firstWorker = roster.workers[0];
    const secondWorker = roster.workers[1];
    await callLoopbackReducer(
      server,
      database,
      'dispatch_worker_v1',
      playerCredential(),
      JSON.stringify([
        firstWorker.workerId,
        'gold',
        expeditionResources[0].siteId,
        'migration-v11-worker-dispatch-01',
      ]),
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'recall_worker_v1',
      playerCredential(),
      JSON.stringify([firstWorker.workerId, 'migration-v11-worker-recall-01']),
      200,
    );
    await waitForActualWorkerRoster(
      server,
      database,
      playerCredential,
      candidate => candidate.workers[0]?.status === 'idle',
    );
    await callLoopbackReducer(
      server,
      database,
      'dispatch_worker_v1',
      playerCredential(),
      JSON.stringify([
        secondWorker.workerId,
        'gold',
        expeditionResources[0].siteId,
        'migration-v11-worker-reuse-001',
      ]),
      200,
    );
    await callLoopbackReducer(
      server,
      database,
      'recall_all_workers_v1',
      playerCredential(),
      JSON.stringify(['migration-v11-worker-recall-all']),
      200,
    );
    await waitForActualWorkerRoster(
      server,
      database,
      playerCredential,
      candidate => candidate.workers.every(worker => worker.status === 'idle'),
    );
    const reconnected = await readActualWorkerRoster(
      server,
      database,
      playerCredential(),
    );
    if (reconnected.workers.length !== 4) {
      fail('Populated v11 Worker reconnect lost roster state.');
    }
    const reconnectedControl = await readActualWorkerControlState(
      server,
      database,
      playerCredential(),
    );
    if (
      reconnectedControl.castleId !== roster.castleId
      || reconnectedControl.workers.some(worker => worker.status !== 'idle')
    ) fail('Populated v11 atomic Worker control state did not preserve reconnect.');
    return 'populated v11 publication, four-resource exact cutover, activation, atomic control, recall, node reuse, and reconnect';
  } catch (error) {
    if (error instanceof MigrationProofError) {
      throw new MigrationProofError(
        `Populated v11 Worker rollout failed at ${stage}: ${error.message}`,
      );
    }
    throw new MigrationProofError(`Populated v11 Worker rollout failed at ${stage}.`);
  }
}

async function generationV2PreservationDigests(server, ownerToken, database) {
  const queries = Object.freeze({
    occupiedWorld: "SELECT * FROM world_tile WHERE key = '0,0'",
    metadata: 'SELECT * FROM world_tile_meta_v1 WHERE generation_version = 2',
    slots: 'SELECT * FROM castle_slot_v1',
    castles: 'SELECT * FROM castle',
    claims: 'SELECT * FROM castle_slot_claim_v1',
    admissions: 'SELECT * FROM allowed_fid',
    profiles: 'SELECT * FROM realm_profile_v1',
    marks: 'SELECT * FROM mark_account_v1',
    resources: 'SELECT * FROM resource_account_v1',
    realmCreatedAt: "SELECT created_at FROM realm_v1 WHERE realm_id = 'GENESIS_001'",
  });
  const digests = {};
  for (const [name, query] of Object.entries(queries)) {
    digests[name] = outputDigest(await sql(server, ownerToken, database, query));
  }
  return Object.freeze(digests);
}

async function readActualWaterLayoutStatus(server, database, credential) {
  return parseAdminWaterLayoutStatus(await callLoopbackProcedure(
    server,
    database,
    'admin_inspect_genesis_water_layout_v1',
    credential,
    '[]',
    200,
    true,
    30_000,
  ));
}

async function readActualWaterRevisionStatus(server, database, credential) {
  return parseAdminWaterRevisionStatus(await callLoopbackProcedure(
    server,
    database,
    'admin_inspect_genesis_water_revision_v_1',
    credential,
    '[]',
    200,
    true,
    30_000,
  ));
}

async function waterStateDigests(server, ownerToken, database) {
  return Object.freeze({
    layout: outputDigest(await sql(
      server,
      ownerToken,
      database,
      'SELECT * FROM realm_water_layout_v1',
    )),
    bodies: outputDigest(await sql(
      server,
      ownerToken,
      database,
      'SELECT body_id, realm_id, regime, cell_count, source_cell_key, mouth_cell_key, layout_version FROM realm_water_body_v1',
    )),
    cells: outputDigest(await sql(
      server,
      ownerToken,
      database,
      'SELECT cell_key, realm_id, regime, body_id, underlying_tile_key, downstream_water_cell_key, layout_version FROM realm_water_cell_v1',
    )),
    environment: outputDigest(await sql(
      server,
      ownerToken,
      database,
      'SELECT * FROM realm_environment_v1',
    )),
  });
}

async function waterRevisionStateDigest(server, ownerToken, database) {
  return outputDigest(await sql(
    server,
    ownerToken,
    database,
    'SELECT * FROM realm_water_revision_v1',
  ));
}

/**
 * Exercise the real Water administration boundary on an isolated loopback
 * database. The digest is learned from the candidate's aggregate procedure,
 * then held exact across seed and activation; the proof does not duplicate a
 * mutable Water artifact digest in this script.
 */
async function verifyActualModuleWaterLifecycle(server, database, privateKey, ownerToken) {
  let stage = 'publish';
  let activeModule = 'actual';
  const actualArtifactPath = join(additiveModule, 'dist', 'bundle.js');
  const inspectionArtifactPath = join(additiveV14SchemaFixture, 'dist', 'bundle.js');
  const adminCredential = () => createEphemeralJwt(privateKey, adminServiceClaims());
  const useActualModule = async () => {
    if (activeModule === 'actual') return;
    await publishBuiltArtifact(server, ownerToken, actualArtifactPath, database);
    activeModule = 'actual';
  };
  const useInspectionModule = async () => {
    if (activeModule === 'inspection') return;
    await publishBuiltArtifact(server, ownerToken, inspectionArtifactPath, database);
    activeModule = 'inspection';
  };

  try {
    await publishBuiltArtifact(server, ownerToken, actualArtifactPath, database);
    stage = 'seed-world';
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_world',
      adminCredential(),
      '[]',
      200,
      120_000,
    );

    stage = 'revision-base-precondition';
    await callLoopbackProcedure(
      server,
      database,
      'admin_inspect_genesis_water_revision_v_1',
      adminCredential(),
      '[]',
      500,
      false,
      30_000,
    );
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_water_revision_v1',
      adminCredential(),
      '[]',
      530,
      30_000,
    );

    stage = 'inspect-empty';
    const empty = await readActualWaterLayoutStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      empty.ready
      || empty.activated
      || empty.layoutVersion !== 1n
      || empty.canonicalLandCellCount !== 10_000n
      || empty.oceanCellCount !== 2_871n
      || empty.lakeCellCount !== 409n
      || empty.riverCount !== 12n
      || empty.riverCellCount < 360n
      || empty.riverCellCount > 480n
      || empty.canonicalWaterBodies !== 1n + empty.lakeBodyCount + empty.riverCount
      || empty.canonicalWaterCells
        !== empty.oceanCellCount + empty.lakeCellCount + empty.riverCellCount
      || empty.waterBodies !== 0n
      || empty.waterCells !== 0n
      || empty.environmentRows !== 0n
    ) fail('Actual Water empty aggregate did not match its bounded canonical contract.');
    const canonical = canonicalWaterStatus(empty);

    stage = 'activation-before-seed';
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_genesis_water_layout_v1',
      adminCredential(),
      '[]',
      530,
      30_000,
    );
    const afterRejectedActivation = await readActualWaterLayoutStatus(
      server,
      database,
      adminCredential(),
    );
    assert.deepEqual(afterRejectedActivation, empty);

    stage = 'seed';
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_water_layout_v1',
      adminCredential(),
      '[]',
      200,
      120_000,
    );
    const seeded = await readActualWaterLayoutStatus(server, database, adminCredential());
    if (
      !seeded.ready
      || seeded.activated
      || seeded.waterBodies !== seeded.canonicalWaterBodies
      || seeded.waterCells !== seeded.canonicalWaterCells
      || seeded.environmentRows !== 1n
    ) fail('Actual Water seed did not reach its complete inert state.');
    assert.deepEqual(canonicalWaterStatus(seeded), canonical);

    await useInspectionModule();
    if (
      await count(server, ownerToken, database, 'world_tile') !== 10_000n
      || await count(server, ownerToken, database, 'realm_water_layout_v1') !== 1n
      || await count(server, ownerToken, database, 'realm_water_body_v1')
        !== seeded.canonicalWaterBodies
      || await count(server, ownerToken, database, 'realm_water_cell_v1')
        !== seeded.canonicalWaterCells
      || await count(server, ownerToken, database, 'realm_environment_v1') !== 1n
      || await actionCount(server, ownerToken, database, 'seed_genesis_water_layout_v1') !== 1n
    ) fail('Actual Water seed did not persist its exact durable row shape.');
    const seededDigests = await waterStateDigests(server, ownerToken, database);

    stage = 'revision-inert-base-rejection';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_water_revision_v1',
      adminCredential(),
      '[]',
      530,
      30_000,
    );
    await useInspectionModule();
    if (
      await count(server, ownerToken, database, 'realm_water_revision_v1') !== 0n
      || await actionCount(server, ownerToken, database, 'seed_genesis_water_revision_v1') !== 0n
    ) fail('Rejected Water revision seed mutated or audited the inert v1 base.');
    assert.deepEqual(
      await waterStateDigests(server, ownerToken, database),
      seededDigests,
    );

    stage = 'seed-idempotence';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_water_layout_v1',
      adminCredential(),
      '[]',
      200,
      120_000,
    );
    const seededRetry = await readActualWaterLayoutStatus(server, database, adminCredential());
    assert.deepEqual(seededRetry, seeded);

    await useInspectionModule();
    if (
      await actionCount(server, ownerToken, database, 'seed_genesis_water_layout_v1') !== 1n
    ) fail('Actual Water seed retry changed its durable row shape.');
    assert.deepEqual(
      await waterStateDigests(server, ownerToken, database),
      seededDigests,
    );

    stage = 'activate';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_genesis_water_layout_v1',
      adminCredential(),
      '[]',
      200,
      30_000,
    );
    const activated = await readActualWaterLayoutStatus(server, database, adminCredential());
    if (!activated.ready || !activated.activated) {
      fail('Actual Water activation did not expose the reviewed layout.');
    }
    assert.deepEqual(canonicalWaterStatus(activated), canonical);

    await useInspectionModule();
    const activatedDigests = await waterStateDigests(server, ownerToken, database);
    if (
      activatedDigests.layout === seededDigests.layout
      || activatedDigests.bodies !== seededDigests.bodies
      || activatedDigests.cells !== seededDigests.cells
      || activatedDigests.environment !== seededDigests.environment
      || await actionCount(server, ownerToken, database, 'activate_genesis_water_layout_v1') !== 1n
    ) fail('Actual Water activation changed data outside its layout gate.');

    stage = 'activation-idempotence';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_genesis_water_layout_v1',
      adminCredential(),
      '[]',
      200,
      30_000,
    );
    const activatedRetry = await readActualWaterLayoutStatus(
      server,
      database,
      adminCredential(),
    );
    assert.deepEqual(activatedRetry, activated);

    await useInspectionModule();
    assert.deepEqual(
      await waterStateDigests(server, ownerToken, database),
      activatedDigests,
    );
    if (
      await actionCount(server, ownerToken, database, 'seed_genesis_water_layout_v1') !== 1n
      || await actionCount(server, ownerToken, database, 'activate_genesis_water_layout_v1') !== 2n
      || countFromSql(await sql(
        server,
        ownerToken,
        database,
        "SELECT COUNT(*) AS warpkeep_count FROM realm_water_body_v1 WHERE regime = 'ocean'",
      )) !== 1n
      || countFromSql(await sql(
        server,
        ownerToken,
        database,
        "SELECT COUNT(*) AS warpkeep_count FROM realm_water_body_v1 WHERE regime = 'lake'",
      )) !== activated.lakeBodyCount
      || countFromSql(await sql(
        server,
        ownerToken,
        database,
        "SELECT COUNT(*) AS warpkeep_count FROM realm_water_body_v1 WHERE regime = 'river'",
      )) !== activated.riverCount
      || countFromSql(await sql(
        server,
        ownerToken,
        database,
        "SELECT COUNT(*) AS warpkeep_count FROM realm_water_cell_v1 WHERE regime = 'ocean'",
      )) !== activated.oceanCellCount
      || countFromSql(await sql(
        server,
        ownerToken,
        database,
        "SELECT COUNT(*) AS warpkeep_count FROM realm_water_cell_v1 WHERE regime = 'lake'",
      )) !== activated.lakeCellCount
      || countFromSql(await sql(
        server,
        ownerToken,
        database,
        "SELECT COUNT(*) AS warpkeep_count FROM realm_water_cell_v1 WHERE regime = 'river'",
      )) !== activated.riverCellCount
    ) fail('Actual Water activated topology did not retain its exact aggregate shape.');

    stage = 'revision-inspect-empty';
    const revisionAuditBaseline = await count(
      server,
      ownerToken,
      database,
      'admin_audit',
    );
    const emptyRevisionDigest = await waterRevisionStateDigest(
      server,
      ownerToken,
      database,
    );
    await useActualModule();
    const emptyRevision = await readActualWaterRevisionStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      emptyRevision.ready
      || emptyRevision.activated
      || emptyRevision.revisionVersion !== 2n
      || emptyRevision.policyVersion !== 'genesis-001-ocean-river-only-v1'
      || emptyRevision.baseLayoutVersion !== activated.layoutVersion
      || emptyRevision.baseLayoutDigest !== activated.layoutDigest
      || emptyRevision.oceanBodyCount !== 1n
      || emptyRevision.riverBodyCount !== 12n
      || emptyRevision.enabledBodyCount !== 13n
      || emptyRevision.oceanCellCount !== 2_871n
      || emptyRevision.riverCellCount !== 400n
      || emptyRevision.enabledCellCount !== 3_271n
      || emptyRevision.lakeBodyCount !== 0n
      || emptyRevision.lakeCellCount !== 0n
      || emptyRevision.riverWidthCells !== 1n
      || emptyRevision.navigationFogBoundaryDepthCells !== 5n
      || emptyRevision.hiddenBufferCells !== 2n
      || emptyRevision.revisionRows !== 0n
    ) fail('Actual Water revision empty aggregate was not exact.');
    const canonicalRevision = canonicalWaterRevisionStatus(emptyRevision);

    stage = 'revision-admin-denial';
    const resolverCredential = () => createEphemeralJwt(
      privateKey,
      resolverServiceClaims('9007199254740991'),
    );
    await callLoopbackProcedure(
      server,
      database,
      'admin_inspect_genesis_water_revision_v_1',
      resolverCredential(),
      '[]',
      500,
      false,
      30_000,
    );
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_water_revision_v1',
      resolverCredential(),
      '[]',
      530,
      30_000,
    );
    await useInspectionModule();
    if (
      await count(server, ownerToken, database, 'realm_water_revision_v1') !== 0n
      || await count(server, ownerToken, database, 'admin_audit') !== revisionAuditBaseline
    ) fail('Rejected non-admin Water revision calls mutated durable state.');
    assert.deepEqual(await waterStateDigests(server, ownerToken, database), activatedDigests);

    stage = 'revision-seed';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_water_revision_v1',
      adminCredential(),
      '[]',
      200,
      30_000,
    );
    const seededRevision = await readActualWaterRevisionStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      !seededRevision.ready
      || seededRevision.activated
      || seededRevision.revisionRows !== 1n
    ) fail('Actual Water revision seed did not reach its inert singleton state.');
    assert.deepEqual(canonicalWaterRevisionStatus(seededRevision), canonicalRevision);
    await useInspectionModule();
    const seededRevisionDigest = await waterRevisionStateDigest(
      server,
      ownerToken,
      database,
    );
    if (
      seededRevisionDigest === emptyRevisionDigest
      || await count(server, ownerToken, database, 'realm_water_revision_v1') !== 1n
      || await count(server, ownerToken, database, 'admin_audit') !== revisionAuditBaseline + 1n
      || await actionCount(server, ownerToken, database, 'seed_genesis_water_revision_v1') !== 1n
      || await actionCount(server, ownerToken, database, 'activate_genesis_water_revision_v1') !== 0n
    ) fail('Actual Water revision seed escaped its one-row, one-audit boundary.');
    assert.deepEqual(await waterStateDigests(server, ownerToken, database), activatedDigests);

    stage = 'revision-seed-idempotence';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_seed_genesis_water_revision_v1',
      adminCredential(),
      '[]',
      200,
      30_000,
    );
    assert.deepEqual(
      await readActualWaterRevisionStatus(server, database, adminCredential()),
      seededRevision,
    );
    await useInspectionModule();
    if (
      await waterRevisionStateDigest(server, ownerToken, database) !== seededRevisionDigest
      || await count(server, ownerToken, database, 'admin_audit') !== revisionAuditBaseline + 1n
    ) fail('Actual Water revision seed retry was not a durable no-op.');
    assert.deepEqual(await waterStateDigests(server, ownerToken, database), activatedDigests);

    stage = 'revision-activate';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_genesis_water_revision_v1',
      adminCredential(),
      '[]',
      200,
      30_000,
    );
    const activatedRevision = await readActualWaterRevisionStatus(
      server,
      database,
      adminCredential(),
    );
    if (
      !activatedRevision.ready
      || !activatedRevision.activated
      || activatedRevision.revisionRows !== 1n
    ) fail('Actual Water revision activation did not expose the reviewed policy.');
    assert.deepEqual(canonicalWaterRevisionStatus(activatedRevision), canonicalRevision);
    await useInspectionModule();
    const activatedRevisionDigest = await waterRevisionStateDigest(
      server,
      ownerToken,
      database,
    );
    if (
      activatedRevisionDigest === seededRevisionDigest
      || await count(server, ownerToken, database, 'realm_water_revision_v1') !== 1n
      || await count(server, ownerToken, database, 'admin_audit') !== revisionAuditBaseline + 2n
      || await actionCount(server, ownerToken, database, 'activate_genesis_water_revision_v1') !== 1n
    ) fail('Actual Water revision activation escaped its one-row, one-audit boundary.');
    assert.deepEqual(await waterStateDigests(server, ownerToken, database), activatedDigests);

    stage = 'revision-activation-idempotence';
    await useActualModule();
    await callLoopbackReducer(
      server,
      database,
      'admin_activate_genesis_water_revision_v1',
      adminCredential(),
      '[]',
      200,
      30_000,
    );
    assert.deepEqual(
      await readActualWaterRevisionStatus(server, database, adminCredential()),
      activatedRevision,
    );
    await useInspectionModule();
    if (
      await waterRevisionStateDigest(server, ownerToken, database)
        !== activatedRevisionDigest
      || await count(server, ownerToken, database, 'admin_audit')
        !== revisionAuditBaseline + 2n
      || await actionCount(server, ownerToken, database, 'seed_genesis_water_revision_v1') !== 1n
      || await actionCount(server, ownerToken, database, 'activate_genesis_water_revision_v1') !== 1n
    ) fail('Actual Water revision activation retry was not a durable no-op.');
    assert.deepEqual(await waterStateDigests(server, ownerToken, database), activatedDigests);

    return `${activated.canonicalWaterBodies} bodies and ${activated.canonicalWaterCells} cells plus one Water revision seeded inert, activated, and retried without topology drift`;
  } catch (error) {
    if (error instanceof MigrationProofError) {
      throw new MigrationProofError(
        `Actual-module Water lifecycle failed at ${stage}: ${error.message}`,
      );
    }
    throw new MigrationProofError(`Actual-module Water lifecycle failed at ${stage}.`);
  }
}

async function verifyGenesisWorldExpansionLifecycle(
  server,
  database,
  privateKey,
  ownerToken,
) {
  const actualArtifactPath = join(additiveModule, 'dist', 'bundle.js');
  // The inspection fixture must retain every Gold, shared-forest, Food, and
  // Wood append. Reverting to an earlier protocol after publishing the
  // candidate would correctly be rejected as a destructive schema downgrade.
  const fixtureArtifactPath = join(additiveV8SchemaFixture, 'dist', 'bundle.js');
  const inspectionArtifactPath = join(additiveV14SchemaFixture, 'dist', 'bundle.js');
  const adminCredential = () => createEphemeralJwt(privateKey, adminServiceClaims());

  await publishBuiltArtifact(server, ownerToken, fixtureArtifactPath, database);
  await callLoopbackReducer(
    server,
    database,
    'fixture_seed_genesis_generation_v2',
    adminCredential(),
    '[]',
    200,
    120_000,
  );
  if (
    await count(server, ownerToken, database, 'world_tile') !== 1_261n
    || await count(server, ownerToken, database, 'world_tile_meta_v1') !== 1_261n
    || await count(server, ownerToken, database, 'realm_v1') !== 1n
    || await count(server, ownerToken, database, 'castle_slot_v1') !== 100n
    || await count(server, ownerToken, database, 'castle') !== 1n
    || await count(server, ownerToken, database, 'castle_slot_claim_v1') !== 1n
    || await count(server, ownerToken, database, 'allowed_fid') !== 1n
    || await count(server, ownerToken, database, 'realm_profile_v1') !== 1n
    || await count(server, ownerToken, database, 'mark_account_v1') !== 1n
    || await count(server, ownerToken, database, 'resource_account_v1') !== 0n
  ) fail('Generation-v2 expansion fixture was incomplete.');
  const predecessorDigests = await generationV2PreservationDigests(
    server,
    ownerToken,
    database,
  );

  await publishBuiltArtifact(server, ownerToken, actualArtifactPath, database);
  await callLoopbackReducer(
    server,
    database,
    'admin_seed_world',
    adminCredential(),
    '[]',
    530,
  );
  // The auth-neutral v11 schema fixture preserves the complete suffix for
  // owner SQL inspection without invoking the real module's on-connect policy.
  await publishBuiltArtifact(server, ownerToken, inspectionArtifactPath, database);
  assert.deepEqual(
    await generationV2PreservationDigests(server, ownerToken, database),
    predecessorDigests,
  );
  if (
    await count(server, ownerToken, database, 'world_tile') !== 1_261n
    || await count(server, ownerToken, database, 'world_tile_meta_v1') !== 1_261n
    || await count(server, ownerToken, database, 'admin_audit') !== 0n
  ) fail('Routine world seeding mutated the generation-v2 predecessor.');

  await publishBuiltArtifact(server, ownerToken, actualArtifactPath, database);
  const startedAt = Date.now();
  await callLoopbackReducer(
    server,
    database,
    'admin_expand_genesis_world_v3',
    adminCredential(),
    JSON.stringify([1_261, 1_261, 2]),
    200,
    120_000,
  );
  const durationMilliseconds = Date.now() - startedAt;

  await publishBuiltArtifact(server, ownerToken, inspectionArtifactPath, database);
  if (
    await count(server, ownerToken, database, 'world_tile') !== 10_000n
    || await count(server, ownerToken, database, 'world_tile_meta_v1') !== 10_000n
    || await count(server, ownerToken, database, 'realm_v1') !== 1n
    || await count(server, ownerToken, database, 'castle_slot_v1') !== 100n
    || await count(server, ownerToken, database, 'castle') !== 1n
    || await count(server, ownerToken, database, 'castle_slot_claim_v1') !== 1n
    || await actionCount(server, ownerToken, database, 'expand_world_v3') !== 1n
    || countFromSql(await sql(
      server,
      ownerToken,
      database,
      "SELECT COUNT(*) AS warpkeep_count FROM realm_v1 WHERE realm_id = 'GENESIS_001' AND generation_version = 3 AND authoritative_radius = 58 AND render_radius = 60 AND player_capacity = 100 AND active = true",
    )) !== 1n
  ) fail('Generation-v3 expansion did not reach the exact target state.');
  assert.deepEqual(
    await generationV2PreservationDigests(server, ownerToken, database),
    predecessorDigests,
  );
  const targetRealmDigest = outputDigest(await sql(
    server,
    ownerToken,
    database,
    'SELECT * FROM realm_v1',
  ));

  await publishBuiltArtifact(server, ownerToken, actualArtifactPath, database);
  await callLoopbackReducer(
    server,
    database,
    'admin_expand_genesis_world_v3',
    adminCredential(),
    JSON.stringify([10_000, 10_000, 3]),
    200,
    120_000,
  );
  await publishBuiltArtifact(server, ownerToken, inspectionArtifactPath, database);
  if (
    await count(server, ownerToken, database, 'world_tile') !== 10_000n
    || await count(server, ownerToken, database, 'world_tile_meta_v1') !== 10_000n
    || await actionCount(server, ownerToken, database, 'expand_world_v3') !== 1n
    || outputDigest(await sql(server, ownerToken, database, 'SELECT * FROM realm_v1'))
      !== targetRealmDigest
  ) fail('Generation-v3 expansion retry was not a true no-op.');
  assert.deepEqual(
    await generationV2PreservationDigests(server, ownerToken, database),
    predecessorDigests,
  );
  return durationMilliseconds;
}

export function containServerProcessErrors(serverProcess) {
  // `spawn` reports some startup failures asynchronously. Keep those failures
  // inside the proof's startup path instead of allowing an unhandled
  // EventEmitter error to bypass `finally` cleanup.
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

export function installMigrationProofSignalCleanup(
  cleanup,
  processTarget = process,
) {
  if (
    typeof cleanup !== 'function'
    || typeof processTarget?.on !== 'function'
    || typeof processTarget?.removeListener !== 'function'
    || typeof processTarget?.exit !== 'function'
  ) fail('Migration proof signal cleanup setup was invalid.');

  let handled = false;
  const handlers = {
    SIGINT: () => handleSignal('SIGINT'),
    SIGTERM: () => handleSignal('SIGTERM'),
  };
  const remove = () => {
    processTarget.removeListener('SIGINT', handlers.SIGINT);
    processTarget.removeListener('SIGTERM', handlers.SIGTERM);
  };
  const handleSignal = signal => {
    if (handled) return;
    handled = true;
    let exitCode = signal === 'SIGINT' ? 130 : 143;
    try {
      cleanup();
    } catch {
      exitCode = 1;
    }
    remove();
    processTarget.exit(exitCode);
  };

  processTarget.on('SIGINT', handlers.SIGINT);
  processTarget.on('SIGTERM', handlers.SIGTERM);
  return remove;
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
  let dataDirectory;
  let serverProcess;
  const removeSignalCleanup = installMigrationProofSignalCleanup(() => {
    disposableCliCredential = null;
    let stopFailed = false;
    if (
      serverProcess !== undefined
      && serverProcess.exitCode === null
      && serverProcess.signalCode === null
    ) {
      try {
        if (!serverProcess.kill('SIGKILL')) stopFailed = true;
      } catch {
        stopFailed = true;
      }
    }
    let removalFailed = false;
    try {
      if (typeof dataDirectory === 'string') {
        rmSync(dataDirectory, { recursive: true, force: true });
      }
    } catch {
      removalFailed = true;
    }
    if (stopFailed || removalFailed) {
      fail('Interrupted migration proof cleanup failed.');
    }
  });
  try {
    dataDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-stdb-migration-'));
  } catch {
    removeSignalCleanup();
    fail('Private migration proof directory setup failed.');
  }
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
      try {
        await rm(dataDirectory, { recursive: true, force: true });
      } catch {
        fail('Ephemeral loopback signing-key cleanup failed.');
      }
    } finally {
      removeSignalCleanup();
    }
    if (error instanceof MigrationProofError) throw error;
    fail('Ephemeral loopback signing-key setup failed.');
  }

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
      try {
        await rm(dataDirectory, { recursive: true, force: true });
      } catch {
        fail('Loopback server startup cleanup failed.');
      }
    } finally {
      removeSignalCleanup();
    }
    fail('Loopback server could not start.');
  }

  try {
    const owner = await acquireDisposableIdentity(server);
    await configureDisposableCliCredential(owner.token, dataDirectory);
    await publish(server, owner.token, fixtureModule, emptyDatabase);
    await publish(server, owner.token, fixtureModule, nonemptyDatabase);
    await publish(server, owner.token, fixtureModule, actualModuleDatabase);
    await publish(server, owner.token, fixtureModule, resourceLifecycleDatabase);

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
    await sql(
      server,
      owner.token,
      resourceLifecycleDatabase,
      'DELETE FROM player WHERE fid = 424242',
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player'), 0n);

    // Advance every disposable database to the independently frozen deployed
    // seven-table checkpoint before proving the v3 append. This makes refs
    // 0-6, including their access/index contracts, the migration baseline.
    await publish(server, owner.token, additiveV2SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV2SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV2SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV2SchemaFixture, resourceLifecycleDatabase);
    for (const database of [
      emptyDatabase,
      nonemptyDatabase,
      actualModuleDatabase,
      resourceLifecycleDatabase,
    ]) {
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

    const emptyV2 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV2 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV2 = await describe(server, owner.token, actualModuleDatabase);
    assert.deepEqual(emptyV2.tables.map(table => table.name).sort(), [
      'admin_audit', 'allowed_fid', 'castle', 'player', 'player_ownership_v2',
      'player_v2', 'world_tile',
    ]);

    // Freeze the currently deployed v3 schema as an independent checkpoint on
    // every database before the resource authority is introduced.
    await publish(server, owner.token, additiveV3SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV3SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV3SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV3SchemaFixture, resourceLifecycleDatabase);

    const emptyV3 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV3 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV3 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV3Schema(emptyV2, emptyV3);
    assertAdditiveV3Schema(nonemptyV2, nonemptyV3);
    assertAdditiveV3Schema(actualModuleV2, actualModuleV3);
    for (const name of deployedV3Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV3, name),
        tableSignature(emptyV3, name),
      );
    }
    for (const database of [
      emptyDatabase,
      nonemptyDatabase,
      actualModuleDatabase,
      resourceLifecycleDatabase,
    ]) {
      for (const table of additiveV3Tables) {
        assert.equal(await count(server, owner.token, database, table), 0n);
      }
    }
    await sql(
      server,
      owner.token,
      emptyDatabase,
      "INSERT INTO castle_slot_v1 (slot_id, realm_id, tile_key, q, r, generation_version) VALUES (999999, 'MIGRATION_SENTINEL', 'migration,sentinel', 99, -99, 2)",
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    const emptyV3Rows = await tableRowDigests(
      server,
      owner.token,
      emptyDatabase,
      deployedV3Tables,
    );
    const nonemptyV3Rows = await tableRowDigests(
      server,
      owner.token,
      nonemptyDatabase,
      deployedV3Tables,
    );
    const actualModuleV3Rows = await tableRowDigests(
      server,
      owner.token,
      actualModuleDatabase,
      deployedV3Tables,
    );

    // First freeze the exact v4 resource-authority shape on every database.
    // This establishes ref 19 independently before the Gold expedition
    // append, while every publish remains `--delete-data=never`.
    await publish(server, owner.token, additiveV4SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV4SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV4SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV4SchemaFixture, resourceLifecycleDatabase);

    const emptyV4 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV4 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV4 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV4Schema(emptyV3, emptyV4);
    assertAdditiveV4Schema(nonemptyV3, nonemptyV4);
    assertAdditiveV4Schema(actualModuleV3, actualModuleV4);
    for (const name of deployedV4Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV4, name),
        tableSignature(emptyV4, name),
      );
    }

    // Freeze refs 20-24 before the forest append. This fixture stage proves
    // that protocol-v5 remains intact independently of the current module.
    await publish(server, owner.token, additiveV5SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV5SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV5SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV5SchemaFixture, resourceLifecycleDatabase);

    const emptyV5 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV5 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV5 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV5Schema(emptyV4, emptyV5);
    assertAdditiveV5Schema(nonemptyV4, nonemptyV5);
    assertAdditiveV5Schema(actualModuleV4, actualModuleV5);
    for (const name of deployedV5Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV5, name),
        tableSignature(emptyV5, name),
      );
    }
    for (const table of [...additiveV4Tables, ...additiveV5Tables]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }
    // Protocol-v6 adds only the two public shared-forest tables at refs 25
    // and 26. Freeze that checkpoint on every disposable database before the
    // Food append, so the v6 -> v7 proof cannot accidentally skip a protocol.
    await publish(server, owner.token, additiveV6SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV6SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV6SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV6SchemaFixture, resourceLifecycleDatabase);

    const emptyV6 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV6 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV6 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV6Schema(emptyV5, emptyV6);
    assertAdditiveV6Schema(nonemptyV5, nonemptyV6);
    assertAdditiveV6Schema(actualModuleV5, actualModuleV6);
    for (const name of deployedV6Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV6, name),
        tableSignature(emptyV6, name),
      );
    }
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }
    const emptyV6Rows = await tableRowDigests(
      server,
      owner.token,
      emptyDatabase,
      deployedV6Tables,
    );
    const nonemptyV6Rows = await tableRowDigests(
      server,
      owner.token,
      nonemptyDatabase,
      deployedV6Tables,
    );
    const actualModuleV6Rows = await tableRowDigests(
      server,
      owner.token,
      actualModuleDatabase,
      deployedV6Tables,
    );

    // Protocol-v7 appends the independent Tier-I Food expedition tables at
    // refs 27-31. Freeze the predecessor protocol before the Wood rollout so
    // v7 row and schema preservation are independently observable.
    await publish(server, owner.token, additiveV7SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV7SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV7SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV7SchemaFixture, resourceLifecycleDatabase);
    const emptyV7 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV7 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV7 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV7Schema(emptyV6, emptyV7);
    assertAdditiveV7Schema(nonemptyV6, nonemptyV7);
    assertAdditiveV7Schema(actualModuleV6, actualModuleV7);
    for (const name of deployedV7Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV7, name),
        tableSignature(emptyV7, name),
      );
    }
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }

    const emptyV7Rows = await tableRowDigests(
      server,
      owner.token,
      emptyDatabase,
      deployedV7Tables,
    );
    const nonemptyV7Rows = await tableRowDigests(
      server,
      owner.token,
      nonemptyDatabase,
      deployedV7Tables,
    );
    const actualModuleV7Rows = await tableRowDigests(
      server,
      owner.token,
      actualModuleDatabase,
      deployedV7Tables,
    );

    // Protocol-v8 appends the independent Tier-I Wood expedition tables at
    // refs 32-36. Every prior v7 table must retain both exact type refs and
    // rows before the real candidate is exercised on populated databases.
    await publish(server, owner.token, additiveV8SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV8SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV8SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV8SchemaFixture, resourceLifecycleDatabase);
    const emptyV8 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV8 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV8 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV8Schema(emptyV7, emptyV8);
    assertAdditiveV8Schema(nonemptyV7, nonemptyV8);
    assertAdditiveV8Schema(actualModuleV7, actualModuleV8);
    for (const name of deployedV8Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV8, name),
        tableSignature(emptyV8, name),
      );
    }
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }

    // Freeze the reviewed v9 water suffix at refs 37-40 before the Stone
    // append, exercising the predecessor on both empty and populated state.
    await publish(server, owner.token, additiveV9SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV9SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV9SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV9SchemaFixture, resourceLifecycleDatabase);
    const emptyV9 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV9 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV9 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV9Schema(emptyV8, emptyV9);
    assertAdditiveV9Schema(nonemptyV8, nonemptyV9);
    assertAdditiveV9Schema(actualModuleV8, actualModuleV9);
    for (const name of deployedV9Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV9, name),
        tableSignature(emptyV9, name),
      );
    }

    // A separate v9 database carries one typed row in every Water table. It
    // advances through populated v10 Stone state before the v11 revision so
    // the newest append proves preservation of both deployed subsystems.
    await publish(
      server,
      owner.token,
      additiveV9SchemaFixture,
      populatedWaterStoneMigrationDatabase,
    );
    const populatedWaterV9 = await describe(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
    );
    for (const name of deployedV9Tables) {
      assert.deepEqual(tableSignature(populatedWaterV9, name), tableSignature(emptyV9, name));
    }
    await callLoopbackReducer(
      server,
      populatedWaterStoneMigrationDatabase,
      'fixture_seed_water_sentinel_v9',
      owner.token,
      '[]',
      200,
    );
    await callLoopbackReducer(
      server,
      populatedWaterStoneMigrationDatabase,
      'fixture_seed_water_sentinel_v9',
      owner.token,
      '[]',
      530,
    );
    for (const table of additiveV9Tables) {
      assert.equal(await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        table,
      ), 1n);
    }
    const populatedWaterV9Rows = await tableRowDigests(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
      additiveV9Tables,
    );

    // Freeze v10 through an auth-neutral fixture first. This proves Stone's
    // exact refs and makes the table-identical inspection artifact available
    // before any lifecycle lane swaps away from the real module.
    await publish(server, owner.token, additiveV10SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV10SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV10SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV10SchemaFixture, resourceLifecycleDatabase);
    const emptyV10 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV10 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV10 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV10Schema(emptyV9, emptyV10);
    assertAdditiveV10Schema(nonemptyV9, nonemptyV10);
    assertAdditiveV10Schema(actualModuleV9, actualModuleV10);
    for (const name of deployedV10Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV10, name),
        tableSignature(emptyV10, name),
      );
    }
    await publish(
      server,
      owner.token,
      additiveV10SchemaFixture,
      populatedWaterStoneMigrationDatabase,
    );
    const populatedWaterStoneV10 = await describe(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
    );
    assertAdditiveV10Schema(populatedWaterV9, populatedWaterStoneV10);
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        additiveV9Tables,
      ),
      populatedWaterV9Rows,
    );
    for (const table of additiveV10Tables) {
      assert.equal(await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        table,
      ), 0n);
    }

    await callLoopbackReducer(
      server,
      populatedWaterStoneMigrationDatabase,
      'fixture_seed_stone_sentinel_v10',
      owner.token,
      '[]',
      200,
    );
    await callLoopbackReducer(
      server,
      populatedWaterStoneMigrationDatabase,
      'fixture_seed_stone_sentinel_v10',
      owner.token,
      '[]',
      530,
    );
    for (const table of additiveV10Tables) {
      assert.equal(await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        table,
      ), 1n);
    }
    const populatedWaterStoneV10Rows = await tableRowDigests(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
      [...additiveV9Tables, ...additiveV10Tables],
    );

    // Freeze v11 independently before the real candidate. The only new table
    // is the public policy singleton at ref 46; every v10 row must survive.
    await publish(server, owner.token, additiveV11SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV11SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV11SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV11SchemaFixture, resourceLifecycleDatabase);
    await publish(
      server,
      owner.token,
      additiveV11SchemaFixture,
      populatedWaterStoneMigrationDatabase,
    );
    const emptyV11 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV11 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV11 = await describe(server, owner.token, actualModuleDatabase);
    const populatedWaterStoneV11 = await describe(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
    );
    assertAdditiveV11Schema(emptyV10, emptyV11);
    assertAdditiveV11Schema(nonemptyV10, nonemptyV11);
    assertAdditiveV11Schema(actualModuleV10, actualModuleV11);
    assertAdditiveV11Schema(
      populatedWaterStoneV10,
      populatedWaterStoneV11,
    );
    const provenV11TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      emptyV11,
      deployedV11Tables,
    );
    for (const description of [
      nonemptyV11,
      actualModuleV11,
      populatedWaterStoneV11,
    ]) {
      assert.equal(
        canonicalTableSchemaBoundaryDigest(description, deployedV11Tables),
        provenV11TableSchemaDigest,
      );
    }
    for (const name of deployedV11Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV11, name),
        tableSignature(emptyV11, name),
      );
    }
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        [...additiveV9Tables, ...additiveV10Tables],
      ),
      populatedWaterStoneV10Rows,
    );
    assert.equal(await count(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
      'realm_water_revision_v1',
    ), 0n);
    await callLoopbackReducer(
      server,
      populatedWaterStoneMigrationDatabase,
      'fixture_seed_water_revision_sentinel_v11',
      owner.token,
      '[]',
      200,
    );
    const populatedWaterStoneV11Rows = await tableRowDigests(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
      deployedV11Tables,
    );
    const populatedWaterStoneV11SchemaDigest = schemaDigest(
      await describe(server, owner.token, populatedWaterStoneMigrationDatabase),
    );
    await publish(
      server,
      owner.token,
      additiveV10SchemaFixture,
      populatedWaterStoneMigrationDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, populatedWaterStoneMigrationDatabase)),
      populatedWaterStoneV11SchemaDigest,
    );
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        deployedV11Tables,
      ),
      populatedWaterStoneV11Rows,
    );

    // Freeze v12 independently, then prove a populated canonical v11 -> v12
    // migration before exercising the real candidate artifact.
    await publish(server, owner.token, additiveV12SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV12SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV12SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV12SchemaFixture, resourceLifecycleDatabase);
    await publish(
      server,
      owner.token,
      additiveV12SchemaFixture,
      populatedWaterStoneMigrationDatabase,
    );
    const emptyV12 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV12 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV12 = await describe(server, owner.token, actualModuleDatabase);
    const populatedWaterStoneV12 = await describe(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
    );
    assertAdditiveV12Schema(emptyV11, emptyV12);
    assertAdditiveV12Schema(nonemptyV11, nonemptyV12);
    assertAdditiveV12Schema(actualModuleV11, actualModuleV12);
    assertAdditiveV12Schema(populatedWaterStoneV11, populatedWaterStoneV12);
    const fixtureV12TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      emptyV12,
      deployedV12Tables,
    );
    for (const description of [
      nonemptyV12,
      actualModuleV12,
      populatedWaterStoneV12,
    ]) {
      assert.equal(
        canonicalTableSchemaBoundaryDigest(description, deployedV12Tables),
        fixtureV12TableSchemaDigest,
      );
    }
    for (const name of deployedV12Tables) {
      assert.deepEqual(
        tableSignature(actualModuleV12, name),
        tableSignature(emptyV12, name),
      );
    }
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        deployedV11Tables,
      ),
      populatedWaterStoneV11Rows,
    );
    for (const table of additiveV12Tables) {
      assert.equal(await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        table,
      ), 0n);
    }
    await callLoopbackReducer(
      server,
      populatedWaterStoneMigrationDatabase,
      'fixture_seed_generic_worker_sentinel_v12',
      owner.token,
      '[]',
      200,
    );
    const expectedPopulatedV12Counts = new Map([
      ['realm_worker_system_v1', 1n],
      ['castle_worker_v1', 4n],
      ['worker_assignment_v1', 1n],
      ['worker_node_occupation_v1', 1n],
      ['worker_command_idempotency_v1', 1n],
      ['worker_assignment_schedule_v_1', 1n],
    ]);
    for (const [table, expectedCount] of expectedPopulatedV12Counts) {
      assert.equal(await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        table,
      ), expectedCount);
    }
    const populatedWaterStoneV12Rows = await tableRowDigests(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
      deployedV12Tables,
    );
    const populatedWaterStoneV12SchemaDigest = schemaDigest(
      await describe(server, owner.token, populatedWaterStoneMigrationDatabase),
    );
    await publish(
      server,
      owner.token,
      additiveV11SchemaFixture,
      populatedWaterStoneMigrationDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, populatedWaterStoneMigrationDatabase)),
      populatedWaterStoneV12SchemaDigest,
    );
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        deployedV12Tables,
      ),
      populatedWaterStoneV12Rows,
    );

    // Freeze v13 independently before the real candidate. Every populated v12
    // row and table signature must survive, while the one private request
    // table starts empty.
    await publish(server, owner.token, additiveV13SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV13SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV13SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV13SchemaFixture, resourceLifecycleDatabase);
    await publish(
      server,
      owner.token,
      additiveV13SchemaFixture,
      populatedWaterStoneMigrationDatabase,
    );
    const emptyV13 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV13 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV13 = await describe(server, owner.token, actualModuleDatabase);
    const populatedWaterStoneV13 = await describe(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
    );
    assertAdditiveV13Schema(emptyV12, emptyV13);
    assertAdditiveV13Schema(nonemptyV12, nonemptyV13);
    assertAdditiveV13Schema(actualModuleV12, actualModuleV13);
    assertAdditiveV13Schema(populatedWaterStoneV12, populatedWaterStoneV13);
    const fixtureV13TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      emptyV13,
      deployedV13Tables,
    );
    for (const description of [
      nonemptyV13,
      actualModuleV13,
      populatedWaterStoneV13,
    ]) {
      assert.equal(
        canonicalTableSchemaBoundaryDigest(description, deployedV13Tables),
        fixtureV13TableSchemaDigest,
      );
    }
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        deployedV12Tables,
      ),
      populatedWaterStoneV12Rows,
    );
    assert.equal(
      await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        'access_request_v1',
      ),
      0n,
    );
    const populatedWaterStoneV13SchemaDigest = schemaDigest(
      await describe(server, owner.token, populatedWaterStoneMigrationDatabase),
    );
    await publish(
      server,
      owner.token,
      additiveV12SchemaFixture,
      populatedWaterStoneMigrationDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, populatedWaterStoneMigrationDatabase)),
      populatedWaterStoneV13SchemaDigest,
    );
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        deployedV12Tables,
      ),
      populatedWaterStoneV12Rows,
    );
    assert.equal(
      await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        'access_request_v1',
      ),
      0n,
    );

    // Prove the complete v13 suffix survives the v14 append while populated.
    // The sentinel is written before either daily-Mark table exists.
    await publish(
      server,
      owner.token,
      additiveV13SchemaFixture,
      dailyMarksMigrationDatabase,
    );
    await callLoopbackReducer(
      server,
      dailyMarksMigrationDatabase,
      'fixture_seed_access_request_sentinel_v13',
      owner.token,
      '[]',
      200,
    );
    const dailyMarksV13 = await describe(
      server,
      owner.token,
      dailyMarksMigrationDatabase,
    );
    const dailyMarksV13Rows = await tableRowDigests(
      server,
      owner.token,
      dailyMarksMigrationDatabase,
      deployedV13Tables,
    );
    assert.equal(
      await count(server, owner.token, dailyMarksMigrationDatabase, 'access_request_v1'),
      1n,
    );
    await publish(
      server,
      owner.token,
      additiveV14SchemaFixture,
      dailyMarksMigrationDatabase,
    );
    const dailyMarksV14 = await describe(
      server,
      owner.token,
      dailyMarksMigrationDatabase,
    );
    assertAdditiveV14Schema(dailyMarksV13, dailyMarksV14);
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        dailyMarksMigrationDatabase,
        deployedV13Tables,
      ),
      dailyMarksV13Rows,
    );
    for (const table of additiveV14Tables) {
      assert.equal(await count(server, owner.token, dailyMarksMigrationDatabase, table), 0n);
    }
    const populatedDailyMarksV14SchemaDigest = schemaDigest(dailyMarksV14);
    await publish(
      server,
      owner.token,
      additiveV14SchemaFixture,
      dailyMarksMigrationDatabase,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, dailyMarksMigrationDatabase)),
      populatedDailyMarksV14SchemaDigest,
    );
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        dailyMarksMigrationDatabase,
        deployedV13Tables,
      ),
      dailyMarksV13Rows,
    );
    await publish(
      server,
      owner.token,
      additiveV13SchemaFixture,
      dailyMarksMigrationDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, dailyMarksMigrationDatabase)),
      populatedDailyMarksV14SchemaDigest,
    );
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        dailyMarksMigrationDatabase,
        deployedV13Tables,
      ),
      dailyMarksV13Rows,
    );
    for (const table of additiveV14Tables) {
      assert.equal(await count(server, owner.token, dailyMarksMigrationDatabase, table), 0n);
    }

    // Freeze v14 independently before the real candidate. Every v13 table
    // remains byte-identical and both private daily-Mark tables start empty.
    await publish(server, owner.token, additiveV14SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV14SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV14SchemaFixture, actualModuleDatabase);
    await publish(server, owner.token, additiveV14SchemaFixture, resourceLifecycleDatabase);
    await publish(
      server,
      owner.token,
      additiveV14SchemaFixture,
      populatedWaterStoneMigrationDatabase,
    );
    const emptyV14 = await describe(server, owner.token, emptyDatabase);
    const nonemptyV14 = await describe(server, owner.token, nonemptyDatabase);
    const actualModuleV14 = await describe(server, owner.token, actualModuleDatabase);
    const populatedWaterStoneV14 = await describe(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
    );
    assertAdditiveV14Schema(emptyV13, emptyV14);
    assertAdditiveV14Schema(nonemptyV13, nonemptyV14);
    assertAdditiveV14Schema(actualModuleV13, actualModuleV14);
    assertAdditiveV14Schema(populatedWaterStoneV13, populatedWaterStoneV14);
    const fixtureV14TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      emptyV14,
      deployedV14Tables,
    );
    for (const description of [
      nonemptyV14,
      actualModuleV14,
      populatedWaterStoneV14,
    ]) {
      assert.equal(
        canonicalTableSchemaBoundaryDigest(description, deployedV14Tables),
        fixtureV14TableSchemaDigest,
      );
    }
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        deployedV12Tables,
      ),
      populatedWaterStoneV12Rows,
    );
    for (const table of additiveV14Tables) {
      assert.equal(
        await count(server, owner.token, populatedWaterStoneMigrationDatabase, table),
        0n,
      );
    }

    // Advance every database to the real v14 candidate so the implementation
    // is exercised against the exact v14 table contract without production.
    await publish(server, owner.token, additiveModule, emptyDatabase);
    await publish(server, owner.token, additiveModule, nonemptyDatabase);
    await publish(server, owner.token, additiveModule, actualModuleDatabase);
    await publish(server, owner.token, additiveModule, resourceLifecycleDatabase);
    await publish(server, owner.token, additiveModule, populatedWaterStoneMigrationDatabase);
    const populatedWaterStoneCandidateV14 = await describe(
      server,
      owner.token,
      populatedWaterStoneMigrationDatabase,
    );
    for (const name of deployedV14Tables) {
      assert.deepEqual(
        tableSignature(populatedWaterStoneCandidateV14, name),
        tableSignature(emptyV14, name),
      );
    }
    await verifyAccessRequestHttpLifecycle(
      server,
      populatedWaterStoneMigrationDatabase,
      privateKey,
    );
    // Return to the exact auth-neutral v14 schema only for private owner SQL.
    // The append-only request row remains while every v12 row digest must stay
    // byte-for-byte identical to its pre-request baseline.
    await publish(
      server,
      owner.token,
      additiveV14SchemaFixture,
      populatedWaterStoneMigrationDatabase,
    );
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        deployedV12Tables,
      ),
      populatedWaterStoneV12Rows,
    );
    assert.equal(
      await count(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        'access_request_v1',
      ),
      2n,
    );
    assert.equal(
      countFromSql(await sql(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        `SELECT COUNT(*) AS warpkeep_count FROM access_request_v1 WHERE fid = ${syntheticMissingAccessRequestFid}`,
      )),
      1n,
    );
    assert.equal(
      countFromSql(await sql(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        `SELECT COUNT(*) AS warpkeep_count FROM access_request_v1 WHERE fid = ${syntheticSecondAccessRequestFid}`,
      )),
      1n,
    );
    assert.equal(
      countFromSql(await sql(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        `SELECT COUNT(*) AS warpkeep_count FROM allowed_fid WHERE fid = ${syntheticMissingAccessRequestFid}`,
      )),
      0n,
    );
    assert.equal(
      countFromSql(await sql(
        server,
        owner.token,
        populatedWaterStoneMigrationDatabase,
        `SELECT COUNT(*) AS warpkeep_count FROM allowed_fid WHERE fid = ${syntheticSecondAccessRequestFid}`,
      )),
      0n,
    );
    await verifyResolverHttpLifecycle(server, actualModuleDatabase, privateKey);
    const worldExpansionDurationMilliseconds = await verifyGenesisWorldExpansionLifecycle(
      server,
      worldExpansionDatabase,
      privateKey,
      owner.token,
    );
    const waterLifecycleProof = await verifyActualModuleWaterLifecycle(
      server,
      waterLifecycleDatabase,
      privateKey,
      owner.token,
    );
    const resourceTimestampFixture = await verifyActualModuleResourceLifecycle(
      server,
      resourceLifecycleDatabase,
      privateKey,
      owner.token,
    );
    const builtArtifactPath = join(additiveModule, 'dist', 'bundle.js');
    // Seed a coherent all-resource lifecycle on the exact v11 predecessor,
    // prove the dedicated v11 -> v12 Worker append, then publish the real v13
    // candidate with deletion disabled and execute the complete Worker cutover.
    await publish(
      server,
      owner.token,
      additiveV11SchemaFixture,
      workerRolloutV11Database,
    );
    await callLoopbackReducer(
      server,
      workerRolloutV11Database,
      'fixture_seed_worker_cutover_v11',
      createEphemeralJwt(
        privateKey,
        playerClaims(730_003, 'farcaster:730003', 1, 540),
      ),
      JSON.stringify([730_003]),
      200,
      120_000,
    );
    const workerRolloutV11Description = await describe(
      server,
      owner.token,
      workerRolloutV11Database,
    );
    const workerRolloutV11Rows = await tableRowDigests(
      server,
      owner.token,
      workerRolloutV11Database,
      deployedV11Tables,
    );
    await publish(
      server,
      owner.token,
      additiveV12SchemaFixture,
      workerRolloutV11Database,
    );
    const workerRolloutCandidateV12 = await describe(
      server,
      owner.token,
      workerRolloutV11Database,
    );
    assertAdditiveV12Schema(workerRolloutV11Description, workerRolloutCandidateV12);
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        workerRolloutV11Database,
        deployedV11Tables,
      ),
      workerRolloutV11Rows,
    );
    for (const table of additiveV12Tables) {
      assert.equal(
        await count(server, owner.token, workerRolloutV11Database, table),
        0n,
      );
    }
    await publish(
      server,
      owner.token,
      additiveV13SchemaFixture,
      workerRolloutV11Database,
    );
    const workerRolloutCandidateV13 = await describe(
      server,
      owner.token,
      workerRolloutV11Database,
    );
    assertAdditiveV13Schema(workerRolloutCandidateV12, workerRolloutCandidateV13);
    await publishBuiltArtifact(
      server,
      owner.token,
      builtArtifactPath,
      workerRolloutV11Database,
    );
    const workerRolloutCandidateV14 = await describe(
      server,
      owner.token,
      workerRolloutV11Database,
    );
    assertAdditiveV14Schema(workerRolloutCandidateV13, workerRolloutCandidateV14);
    // The real module rejects the disposable owner identity by design. Swap
    // only this database to the schema-identical auth-neutral v14 fixture
    // before private SQL proves that every v11 row survived and all additive
    // suffixes remain empty.
    await publish(
      server,
      owner.token,
      additiveV14SchemaFixture,
      workerRolloutV11Database,
    );
    assert.deepEqual(
      await tableRowDigests(
        server,
        owner.token,
        workerRolloutV11Database,
        deployedV11Tables,
      ),
      workerRolloutV11Rows,
    );
    for (const table of additiveV12Tables) {
      assert.equal(
        await count(server, owner.token, workerRolloutV11Database, table),
        0n,
      );
    }
    assert.equal(
      await count(
        server,
        owner.token,
        workerRolloutV11Database,
        'access_request_v1',
      ),
      0n,
    );
    for (const table of additiveV14Tables) {
      assert.equal(
        await count(server, owner.token, workerRolloutV11Database, table),
        0n,
      );
    }
    await publishBuiltArtifact(
      server,
      owner.token,
      builtArtifactPath,
      workerRolloutV11Database,
    );
    const workerRolloutV11Proof = await verifyActualModuleWorkerRolloutFromV11(
      server,
      workerRolloutV11Database,
      privateKey,
    );
    await publishBuiltArtifact(
      server,
      owner.token,
      builtArtifactPath,
      expeditionLifecycleDatabase,
    );
    const expeditionLifecycleProof = await verifyActualModuleExpeditionLifecycles(
      server,
      expeditionLifecycleDatabase,
      privateKey,
      owner.token,
    );
    const builtArtifactDigest = createHash('sha256')
      .update(await readFile(builtArtifactPath))
      .digest('hex');
    const emptyCandidateV14 = await describe(server, owner.token, emptyDatabase);
    const nonemptyCandidateV14 = await describe(server, owner.token, nonemptyDatabase);
    const actualCandidateV14 = await describe(server, owner.token, actualModuleDatabase);
    const provenV12TableSchemaDigest = projectedTableSchemaBoundaryDigest(
      emptyCandidateV14,
      deployedV12Tables,
    );
    assert.equal(provenV12TableSchemaDigest, fixtureV12TableSchemaDigest);
    const provenV13TableSchemaDigest = projectedTableSchemaBoundaryDigest(
      emptyCandidateV14,
      deployedV13Tables,
    );
    assert.equal(provenV13TableSchemaDigest, fixtureV13TableSchemaDigest);
    const provenV14TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      emptyCandidateV14,
      deployedV14Tables,
    );
    assert.equal(provenV14TableSchemaDigest, fixtureV14TableSchemaDigest);
    for (const description of [nonemptyCandidateV14, actualCandidateV14]) {
      assert.equal(
        projectedTableSchemaBoundaryDigest(description, deployedV12Tables),
        provenV12TableSchemaDigest,
      );
      assert.equal(
        projectedTableSchemaBoundaryDigest(description, deployedV13Tables),
        provenV13TableSchemaDigest,
      );
      assert.equal(
        canonicalTableSchemaBoundaryDigest(description, deployedV14Tables),
        provenV14TableSchemaDigest,
      );
    }
    for (const name of deployedV12Tables) {
      assert.deepEqual(
        tableSignature(actualCandidateV14, name),
        tableSignature(emptyV12, name),
      );
      assert.deepEqual(
        tableSignature(nonemptyCandidateV14, name),
        tableSignature(nonemptyV12, name),
      );
      assert.deepEqual(
        tableSignature(actualCandidateV14, name),
        tableSignature(actualModuleV12, name),
      );
    }
    for (const description of [
      emptyCandidateV14,
      nonemptyCandidateV14,
      actualCandidateV14,
    ]) {
      assert.equal(access(description, 'access_request_v1'), 'Private');
      assert.deepEqual(fieldNames(description, 'access_request_v1'), [
        'fid',
        'request_cycle',
        'requested_at',
      ]);
      assert.equal(access(description, 'daily_mark_grant_v1'), 'Private');
      assert.deepEqual(fieldNames(description, 'daily_mark_grant_v1'), [
        'grant_key',
        'fid',
        'utc_day',
        'amount_micros',
        'policy_version',
        'granted_at',
      ]);
      assert.equal(access(description, 'daily_mark_schedule_v_1'), 'Private');
      assert.deepEqual(fieldNames(description, 'daily_mark_schedule_v_1'), [
        'schedule_id',
        'scheduled_at',
        'policy_version',
      ]);
    }
    // The candidate's on-connect policy intentionally rejects the disposable
    // owner identity. Reuse the table-identical, auth-neutral v14 fixture before
    // owner SQL reads and never downgrade the schema suffix.
    await publish(server, owner.token, additiveV14SchemaFixture, emptyDatabase);
    await publish(server, owner.token, additiveV14SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV14SchemaFixture, actualModuleDatabase);
    // SQL preservation reads remain on the complete v14 candidate. No reducer
    // is invoked by these owner-only queries.
    for (const [database, beforeRows] of [
      [emptyDatabase, emptyV7Rows],
      [nonemptyDatabase, nonemptyV7Rows],
      [actualModuleDatabase, actualModuleV7Rows],
    ]) {
      assert.deepEqual(
        await tableRowDigests(server, owner.token, database, deployedV7Tables),
        beforeRows,
      );
    }

    const idempotentSchemaBefore = schemaDigest(nonemptyCandidateV14);
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
    await publish(server, owner.token, additiveV14SchemaFixture, nonemptyDatabase);

    // The actual module correctly rejects the disposable local identity at its
    // on-connect boundary; owner SQL still reads the unchanged v14 rows.
    assert.equal(await count(server, owner.token, emptyDatabase, 'player'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    await assertFixtureOwnershipCount(server, owner.token, emptyDatabase, 999999, 0);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player'), 1n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player_v2'), 0n);
    await assertFixtureOwnershipCount(server, owner.token, nonemptyDatabase, 999999, 0);
    for (const [database, beforeRows] of [
      [emptyDatabase, emptyV3Rows],
      [nonemptyDatabase, nonemptyV3Rows],
      [actualModuleDatabase, actualModuleV3Rows],
    ]) {
      assert.deepEqual(
        await tableRowDigests(server, owner.token, database, deployedV3Tables),
        beforeRows,
      );
      for (const table of [
        ...additiveV4Tables,
        ...additiveV5Tables,
        ...additiveV6Tables,
        ...additiveV7Tables,
        ...additiveV8Tables,
        ...additiveV9Tables,
        ...additiveV10Tables,
        ...additiveV11Tables,
        ...additiveV12Tables,
        ...additiveV13Tables,
        ...additiveV14Tables,
      ]) {
        assert.equal(await count(server, owner.token, database, table), 0n);
      }
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

    // Identity columns reject arbitrary SQL literals after the candidate's
    // issuer boundary is active. The auth-neutral v14 fixture inserts the
    // caller's verified sender identity through a disposable reducer instead.
    await callLoopbackReducer(
      server,
      emptyDatabase,
      'fixture_insert_player_ownership_v9',
      owner.token,
      '[999999]',
      200,
    );
    await assertFixtureOwnershipCount(server, owner.token, emptyDatabase, 999999, 1);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
      ...additiveV9Tables,
      ...additiveV10Tables,
      ...additiveV11Tables,
      ...additiveV12Tables,
      ...additiveV13Tables,
      ...additiveV14Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }
    const populatedV14SchemaDigest = schemaDigest(await describe(server, owner.token, emptyDatabase));

    await callLoopbackReducer(
      server,
      emptyDatabase,
      'fixture_insert_player_ownership_v9',
      owner.token,
      '[999999]',
      530,
    );
    await assertFixtureOwnershipCount(server, owner.token, emptyDatabase, 999999, 1);

    await publish(
      server,
      owner.token,
      additiveV3SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    await assertFixtureOwnershipCount(server, owner.token, emptyDatabase, 999999, 1);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
      ...additiveV9Tables,
      ...additiveV10Tables,
      ...additiveV11Tables,
      ...additiveV12Tables,
      ...additiveV13Tables,
      ...additiveV14Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }
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
      populatedV14SchemaDigest,
    );
    await assertFixtureOwnershipCount(server, owner.token, emptyDatabase, 999999, 1);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
      ...additiveV9Tables,
      ...additiveV10Tables,
      ...additiveV11Tables,
      ...additiveV12Tables,
      ...additiveV13Tables,
      ...additiveV14Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }
    await publish(
      server,
      owner.token,
      additiveV4SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    await publish(
      server,
      owner.token,
      additiveV5SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    await publish(
      server,
      owner.token,
      additiveV6SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    // The v14 boundary must refuse its immediate predecessor before either
    // private daily-Mark table can be removed.
    await publish(
      server,
      owner.token,
      additiveV13SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    // The v13 boundary also remains protected from its own predecessor.
    await publish(
      server,
      owner.token,
      additiveV12SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    // Older predecessors must also remain unable to remove Worker or Water
    // state.
    await publish(
      server,
      owner.token,
      additiveV10SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    await publish(
      server,
      owner.token,
      additiveV9SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    await publish(
      server,
      owner.token,
      additiveV8SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    // Older fixture rollbacks remain refused as well.
    await publish(
      server,
      owner.token,
      additiveV7SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV14SchemaDigest,
    );
    await publish(server, owner.token, additiveModule, emptyDatabase);
    assertAdditiveV14Schema(
      emptyV13,
      await describe(server, owner.token, emptyDatabase),
    );
    // Reuse the table-identical auth-neutral fixture for the final bounded
    // identity assertion; the candidate itself deliberately rejects the
    // disposable owner issuer before any private identity SQL can run.
    await publish(server, owner.token, additiveV14SchemaFixture, emptyDatabase);
    await assertFixtureOwnershipCount(server, owner.token, emptyDatabase, 999999, 1);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
      ...additiveV9Tables,
      ...additiveV10Tables,
      ...additiveV11Tables,
      ...additiveV12Tables,
      ...additiveV13Tables,
      ...additiveV14Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }
    assert.equal(
      createHash('sha256').update(await readFile(builtArtifactPath)).digest('hex'),
      builtArtifactDigest,
    );

    console.log(formatAdditiveMigrationProofReceipt({
      summary: 'the exact refs 0-18 deployed v3 prefix and every v3 row remained unchanged, '
      + 'private resource_account_v1 appended at exact product type ref 19, '
      + 'public Gold sites, occupancy, and safe lifecycle schedule projection plus private expedition and idempotency '
      + 'tables appended at exact refs 20-24, '
      + 'public canonical shared-forest layout metadata and fixed-point instances appended at exact refs 25-26, '
      + 'public Tier-I Food sites, identity-minimized occupations, and public-safe lifecycle schedule projection plus private Food expedition and idempotency '
      + 'tables appended at exact refs 27-31, '
      + 'public Tier-I Wood sites, identity-minimized occupations, and public-safe lifecycle schedule projection plus private Wood expedition and idempotency '
      + 'tables appended at exact refs 32-36, '
      + 'canonical water layout, body, cell, and shared environment tables appended at exact refs 37-40, '
      + 'public Tier-I Stone sites, identity-minimized occupations, and public-safe lifecycle schedule projection plus private Stone expedition and idempotency '
      + 'tables appended at exact refs 41-45, '
      + 'public ocean-and-river Water revision policy appended at exact ref 46, '
      + 'identity-safe generic worker readiness, roster, assignment, occupation, bounded receipt, and private schedule tables appended at exact refs 47-52, '
      + 'private access-request intent and authoritative request timestamp appended at exact ref 53, '
      + 'private exactly-once daily Mark receipts and identity-free cadence appended at exact refs 54-55, '
      + '61-tile empty, synthetic nonempty, and populated Water/Stone/Water-revision fixtures remained preserved through v14, '
      + 'every v12 table was populated and retained through the real candidate, the v13 request suffix survived populated, '
      + 'both v14 tables started empty, fixture republish remained idempotent, '
      + 'and the complete state was protected from v14-to-v13 and older downgrades, '
      + 'exact resolver HTTP lifecycle enforced without mutation, '
      + `atomic 1,261-to-10,000 world expansion proved in ${worldExpansionDurationMilliseconds}ms with an idempotent retry, `
      + `actual Water administration exercised with ${waterLifecycleProof}, `
      + `actual resource authority reducers exercised with ${resourceTimestampFixture} collection, `
      + `the populated v11-to-v12 Worker rollout exercised ${workerRolloutV11Proof}, `
      + `actual expedition reducers exercised through ${expeditionLifecycleProof}; `
      + 'the pinned local CLI exposes no deterministic 30-day clock advance, so full-duration expiry remains pure-authority coverage rather than an actual-module claim, '
      + 'caller bootstrap/terms/identity gates, Marks isolation, atomic profiled founding, '
      + 'repeat-admission rejection plus trusted profile clear/repair preserving structural gameplay authority, '
      + 'presentation-independent founder monitoring and bootstrap, '
      + 'legacy first-time admission rejection and complete-graph re-enable preservation, '
      + 'and guarded backfill rejection/idempotence held, '
      + 'prebuilt-artifact republish idempotent, populated v3-prefix state retained through v14, '
      + 'and guarded v13/v12/v11/v10/v9/v8/v7/v6/v5/v4/v3/v2 rollbacks refused before schema change.',
      v11TableSchemaDigest: provenV11TableSchemaDigest,
      v12TableSchemaDigest: provenV12TableSchemaDigest,
      v13TableSchemaDigest: provenV13TableSchemaDigest,
      v14TableSchemaDigest: provenV14TableSchemaDigest,
      artifactDigest: builtArtifactDigest,
    }));
  } finally {
    disposableCliCredential = null;
    try {
      await cleanupMigrationProofResources(serverProcess, dataDirectory);
    } finally {
      removeSignalCleanup();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof MigrationProofError
      ? error.message
      : `Additive protocol-v${ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION} migration proof failed closed.`);
    process.exitCode = 1;
  });
}
