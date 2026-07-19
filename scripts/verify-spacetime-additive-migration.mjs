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

import {
  ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION,
  ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION,
  formatAdditiveMigrationProofReceipt,
} from './spacetime-additive-migration-proof.mjs';

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
const additiveModule = resolve(repositoryRoot, 'spacetimedb');
const command = process.env.SPACETIME_BIN || 'spacetime';
const expectedCliVersion = ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION;
const expectedCliCommit = '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
const emptyDatabase = 'warpkeep-migration-empty';
const nonemptyDatabase = 'warpkeep-migration-nonempty';
const actualModuleDatabase = 'warpkeep-migration-actual-module';
const resourceLifecycleDatabase = 'warpkeep-migration-resource-lifecycle';
const expeditionLifecycleDatabase = 'warpkeep-migration-expedition-lifecycle';
const worldExpansionDatabase = 'warpkeep-migration-world-expansion';
const maximumOutputBytes = 1_000_000;
const commandTimeoutMilliseconds = 120_000;
const procedureTimeoutMilliseconds = 5_000;
const maximumProcedureResponseBytes = 16_384;
const actualModuleFounderFid = 730_001;
const actualModuleOtherFid = 730_002;
const historicalEntryAgreementVersions = Object.freeze([
  '2026-07-18-hegemony-entry-agreement-v1',
  '2026-07-14',
]);
const alphaTermsVersion = '2026-07-19-hegemony-entry-agreement-v3';
const resourcePolicyVersion = 'genesis-resource-yield-v1';
const marksPolicyVersion = 'snap-current-linked-wallet-1to1-v1';
const profilePolicyVersion = 'trusted-snapchain-profile-v3';
const resourceQuantumMicros = 600_000_000n;
const expeditionScheduleWaitMilliseconds = 12 * 60 * 1_000;
const maximumU64 = (1n << 64n) - 1n;
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

async function tableRowDigests(server, token, database, tables) {
  const digests = {};
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/.test(table)) fail('Unsafe fixture table name.');
    digests[table] = outputDigest(await sql(
      server,
      token,
      database,
      `SELECT * FROM ${table}`,
    ));
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
  // The inspection fixture must retain every append that the real module has
  // already introduced. Publishing an older artifact after the v8 Wood tables
  // would be a destructive downgrade, correctly refused by SpacetimeDB.
  const inspectionArtifactPath = join(additiveV8SchemaFixture, 'dist', 'bundle.js');
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
 * Exercise the real compiled Gold/Food/Wood dispatch boundary and the shortest
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
  const inspectionArtifactPath = join(additiveV8SchemaFixture, 'dist', 'bundle.js');
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
    // Thirty-day expiry, returning occupation, return completion, stale
    // post-return delivery, and site reuse remain covered by pure authority
    // regression tests, not misrepresented as actual-module scheduler proof.
    return 'Gold/Food/Wood dispatch, schedules, replay/reservation, outbound no-op, actual Gold arrival, and positive collection replay';
  } catch (error) {
    if (error instanceof MigrationProofError) {
      throw new MigrationProofError(
        `Actual-module expedition lifecycle failed at ${stage}: ${error.message}`,
      );
    }
    throw new MigrationProofError(`Actual-module expedition lifecycle failed at ${stage}.`);
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
  await publishBuiltArtifact(server, ownerToken, fixtureArtifactPath, database);
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

  await publishBuiltArtifact(server, ownerToken, fixtureArtifactPath, database);
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
  await publishBuiltArtifact(server, ownerToken, fixtureArtifactPath, database);
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

    await publish(server, owner.token, additiveModule, nonemptyDatabase);
    await publish(server, owner.token, additiveModule, actualModuleDatabase);
    await publish(server, owner.token, additiveModule, resourceLifecycleDatabase);
    await verifyResolverHttpLifecycle(server, actualModuleDatabase, privateKey);
    const worldExpansionDurationMilliseconds = await verifyGenesisWorldExpansionLifecycle(
      server,
      worldExpansionDatabase,
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
    const nonemptyCandidateV8 = await describe(server, owner.token, nonemptyDatabase);
    const actualCandidateV8 = await describe(server, owner.token, actualModuleDatabase);
    assertAdditiveV8Schema(nonemptyV7, nonemptyCandidateV8);
    assertAdditiveV8Schema(actualModuleV7, actualCandidateV8);
    for (const name of deployedV8Tables) {
      assert.deepEqual(
        tableSignature(actualCandidateV8, name),
        tableSignature(emptyV8, name),
      );
    }
    // The real module rejects the disposable CLI identity at on-connect. Swap
    // only the two inspected databases to the table-identical v8 fixture
    // before reading the preservation digests; no reducer is invoked here.
    await publish(server, owner.token, additiveV8SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV8SchemaFixture, actualModuleDatabase);
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

    const idempotentSchemaBefore = schemaDigest(nonemptyCandidateV8);
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
    // on-connect boundary. Re-publish the table-identical v8 schema fixture
    // before querying preservation; this changes no table or row.
    await publish(server, owner.token, additiveV8SchemaFixture, nonemptyDatabase);
    await publish(server, owner.token, additiveV8SchemaFixture, actualModuleDatabase);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 0n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player'), 1n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, nonemptyDatabase, 'player_ownership_v2'), 0n);
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

    await sql(
      server,
      owner.token,
      emptyDatabase,
      `INSERT INTO player_ownership_v2 (fid, identity) VALUES (999999, 0x${owner.identity})`,
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_v2'), 0n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
    ]) {
      assert.equal(await count(server, owner.token, emptyDatabase, table), 0n);
    }
    const populatedV8SchemaDigest = schemaDigest(await describe(server, owner.token, emptyDatabase));

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
      additiveV3SchemaFixture,
      emptyDatabase,
      false,
      /break|delete|remove|migration|incompatible|data loss|table/i,
    );
    assert.equal(
      schemaDigest(await describe(server, owner.token, emptyDatabase)),
      populatedV8SchemaDigest,
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
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
      populatedV8SchemaDigest,
    );
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
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
      populatedV8SchemaDigest,
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
      populatedV8SchemaDigest,
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
      populatedV8SchemaDigest,
    );
    // The immediate v8 -> v7 rollback is refused as well. This is the
    // protocol boundary that protects the Wood suffix from a stale deploy.
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
      populatedV8SchemaDigest,
    );
    await publish(server, owner.token, additiveV8SchemaFixture, emptyDatabase);
    assert.equal(await count(server, owner.token, emptyDatabase, 'player_ownership_v2'), 1n);
    assert.equal(await count(server, owner.token, emptyDatabase, 'castle_slot_v1'), 1n);
    for (const table of [
      ...additiveV4Tables,
      ...additiveV5Tables,
      ...additiveV6Tables,
      ...additiveV7Tables,
      ...additiveV8Tables,
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
      + '61-tile empty and synthetic nonempty fixtures remained preserved, '
      + 'exact resolver HTTP lifecycle enforced without mutation, '
      + `atomic 1,261-to-10,000 world expansion proved in ${worldExpansionDurationMilliseconds}ms with an idempotent retry, `
      + `actual resource authority reducers exercised with ${resourceTimestampFixture} collection, `
      + `actual expedition reducers exercised through ${expeditionLifecycleProof}; `
      + 'the pinned local CLI exposes no deterministic clock advance, so the 30-day expiry, return, stale delivery, and reuse stages remain pure-authority coverage rather than an actual-module claim, '
      + 'caller bootstrap/terms/identity gates, Marks isolation, atomic profiled founding, '
      + 'repeat-admission rejection plus trusted profile clear/repair preserving structural gameplay authority, '
      + 'presentation-independent founder monitoring and bootstrap, '
      + 'legacy first-time admission rejection and complete-graph re-enable preservation, '
      + 'and guarded backfill rejection/idempotence held, '
      + 'prebuilt-artifact republish idempotent, populated v3-prefix state retained through v8, '
      + 'and guarded v7/v6/v5/v4/v3/v2 rollbacks refused before schema change.',
      artifactDigest: builtArtifactDigest,
    }));
  } finally {
    disposableCliCredential = null;
    await cleanupMigrationProofResources(serverProcess, dataDirectory);
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
