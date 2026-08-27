import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { attestPinnedSpacetimeCli } from './spacetime-cli-attestation.mjs';
import { withGreaterRealmLockedSourceBuild } from './greater-realm-production-immutable-artifact.ts';
import { assertProductionAdminTrustedAncestors } from './production-admin-token-budget.mjs';

export const GENESIS_002_PRODUCTION_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'warpkeep-genesis-002',
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
  modulePath: 'spacetimedb/genesis002',
  genesis001DatabaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});

export const GENESIS_002_PUBLISH_PROFILE =
  'warpkeep-genesis-002-production-publish-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
]);
const MAXIMUM_CLI_CONFIG_BYTES = 64 * 1_024;
const REPOSITORY_ROOT = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));

export class Genesis002ProductionPublisherError extends Error {
  constructor(code, publishAttempted = false) {
    super(code);
    this.name = 'Genesis002ProductionPublisherError';
    this.code = code;
    this.publishAttempted = publishAttempted;
  }
}

function fail(code, publishAttempted = false) {
  throw new Genesis002ProductionPublisherError(code, publishAttempted);
}

function genesis002ChildEnvironment(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    fail('GENESIS_002_PUBLISH_ENVIRONMENT_INVALID');
  }
  return Object.freeze(Object.fromEntries(
    CHILD_ENVIRONMENT_KEYS
      .filter(key => typeof source[key] === 'string' && source[key].length > 0)
      .map(key => [key, source[key]]),
  ));
}

export function genesis002PublishArguments(
  artifactPath,
  spacetimeCliRootDirectory,
  spacetimeCliConfigPath,
) {
  if (
    typeof artifactPath !== 'string'
    || !isAbsolute(artifactPath)
    || typeof spacetimeCliRootDirectory !== 'string'
    || !isAbsolute(spacetimeCliRootDirectory)
    || typeof spacetimeCliConfigPath !== 'string'
    || !isAbsolute(spacetimeCliConfigPath)
  ) {
    fail('GENESIS_002_ARTIFACT_PATH_INVALID');
  }
  return Object.freeze([
    '--root-dir', spacetimeCliRootDirectory,
    '--config-path', spacetimeCliConfigPath,
    'publish',
    '--server', GENESIS_002_PRODUCTION_TARGET.uri,
    '--js-path', artifactPath,
    '--delete-data=never',
    '--no-config',
    '--yes=remote,skip-login',
    GENESIS_002_PRODUCTION_TARGET.database,
  ]);
}

function canonicalPublishPlan({
  sourceCommit,
  moduleSha256,
  moduleTreeId,
  dependencyClosureDigest,
  spacetimeExecutableSha256,
  spacetimeCliConfigSha256,
}) {
  if (
    !COMMIT.test(sourceCommit ?? '')
    || !SHA256.test(moduleSha256 ?? '')
    || !COMMIT.test(moduleTreeId ?? '')
    || !SHA256.test(dependencyClosureDigest ?? '')
    || !SHA256.test(spacetimeExecutableSha256 ?? '')
    || !SHA256.test(spacetimeCliConfigSha256 ?? '')
  ) {
    fail('GENESIS_002_PUBLISH_PLAN_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    profile: GENESIS_002_PUBLISH_PROFILE,
    uri: GENESIS_002_PRODUCTION_TARGET.uri,
    database: GENESIS_002_PRODUCTION_TARGET.database,
    moduleIdentity: GENESIS_002_PRODUCTION_TARGET.moduleIdentity,
    modulePath: GENESIS_002_PRODUCTION_TARGET.modulePath,
    sourceCommit,
    moduleSha256,
    moduleTreeId,
    dependencyClosureDigest,
    spacetimeExecutableSha256,
    spacetimeCliConfigSha256,
    deleteData: GENESIS_002_PRODUCTION_TARGET.deleteData,
    genesis001DatabaseIdentity:
      GENESIS_002_PRODUCTION_TARGET.genesis001DatabaseIdentity,
  });
}

export function genesis002PublishConfirmationDigest(input) {
  const plan = canonicalPublishPlan(input);
  return createHash('sha256')
    .update('warpkeep.genesis-002.production-publish.v1\n')
    .update(`${JSON.stringify(plan)}\n`)
    .digest('hex');
}

export function parseGenesis002DatabaseList(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > 256 * 1_024) {
    fail('GENESIS_002_DATABASE_LIST_INVALID');
  }
  const normalized = output.replace(/\u001b\[[0-9;]*m/gu, '');
  const matches = normalized.split(/\r?\n/u).map(line => line.trim())
    .map(line => /^warpkeep-genesis-002\s+\|\s+([0-9a-f]{64})$/u.exec(line))
    .filter(match => match !== null);
  if (matches.length === 0) return null;
  if (matches.length !== 1) fail('GENESIS_002_DATABASE_LIST_INVALID');
  const identity = matches[0][1];
  if (identity === GENESIS_002_PRODUCTION_TARGET.genesis001DatabaseIdentity) {
    fail('GENESIS_002_TARGET_COLLIDES_WITH_GENESIS_001');
  }
  return identity;
}

function run(spawn, executable, arguments_, childEnvironment, artifactDescriptor) {
  const result = spawn(executable, arguments_, {
    encoding: 'utf8',
    env: childEnvironment,
    stdio: artifactDescriptor === undefined
      ? ['ignore', 'pipe', 'pipe']
      : ['ignore', 'pipe', 'pipe', artifactDescriptor],
    timeout: 120_000,
    maxBuffer: 4 * 1_024 * 1_024,
  });
  if (typeof result?.stdout !== 'string' || typeof result.stderr !== 'string') {
    fail('GENESIS_002_SPACETIME_COMMAND_FAILED');
  }
  return result;
}

function listArguments(spacetimeCliRootDirectory, spacetimeCliConfigPath) {
  return Object.freeze([
    '--root-dir', spacetimeCliRootDirectory,
    '--config-path', spacetimeCliConfigPath,
    'list',
    '--server', GENESIS_002_PRODUCTION_TARGET.uri,
    '--yes',
  ]);
}

function exactChildEnvironment(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GENESIS_002_PUBLISH_ENVIRONMENT_INVALID');
  }
  const forbidden = /(?:TOKEN|SECRET|PASSWORD|COOKIE|AUTH|PROXY|NODE_OPTIONS|DYLD|LD_PRELOAD)/iu;
  if (Object.entries(value).some(([key, child]) => (
    !CHILD_ENVIRONMENT_KEYS.includes(key)
    || forbidden.test(key)
    || typeof child !== 'string'
    || child.includes('\0')
  ))) fail('GENESIS_002_PUBLISH_ENVIRONMENT_INVALID');
  return Object.freeze({ ...value });
}

export async function executeGenesis002Publish({
  sourceCommit,
  moduleSha256,
  moduleTreeId,
  dependencyClosureDigest,
  spacetimeExecutableSha256,
  spacetimeCliConfigSha256,
  confirmationDigest,
  artifactPath,
  spacetimeCliRootDirectory,
  spacetimeCliConfigPath,
  spacetimeExecutable,
  spawn = spawnSync,
  postflight,
  assertSourceAndArtifact,
  childEnvironment,
  artifactDescriptor,
}) {
  const plan = canonicalPublishPlan({
    sourceCommit,
    moduleSha256,
    moduleTreeId,
    dependencyClosureDigest,
    spacetimeExecutableSha256,
    spacetimeCliConfigSha256,
  });
  if (
    confirmationDigest !== genesis002PublishConfirmationDigest(plan)
    || typeof spacetimeExecutable !== 'string'
    || !isAbsolute(spacetimeExecutable)
    || typeof spawn !== 'function'
    || typeof postflight !== 'function'
    || typeof assertSourceAndArtifact !== 'function'
    || typeof spacetimeCliRootDirectory !== 'string'
    || !isAbsolute(spacetimeCliRootDirectory)
    || typeof spacetimeCliConfigPath !== 'string'
    || !isAbsolute(spacetimeCliConfigPath)
  ) fail('GENESIS_002_PUBLISH_CONFIRMATION_INVALID');
  const environment = exactChildEnvironment(childEnvironment);
  const before = parseGenesis002DatabaseList(
    (() => {
      const result = run(
        spawn,
        spacetimeExecutable,
        listArguments(spacetimeCliRootDirectory, spacetimeCliConfigPath),
        environment,
      );
      if (result.status !== 0) fail('GENESIS_002_SPACETIME_COMMAND_FAILED');
      return result.stdout;
    })(),
  );
  if (before !== null) fail('GENESIS_002_DATABASE_ALREADY_EXISTS');
  assertSourceAndArtifact();
  const publishResult = run(
    spawn,
    spacetimeExecutable,
    genesis002PublishArguments(
      artifactPath,
      spacetimeCliRootDirectory,
      spacetimeCliConfigPath,
    ),
    environment,
    artifactDescriptor,
  );
  let databaseIdentity;
  let freshStatus;
  try {
    const after = run(
      spawn,
      spacetimeExecutable,
      listArguments(spacetimeCliRootDirectory, spacetimeCliConfigPath),
      environment,
    );
    if (after.status !== 0) {
      fail('GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED', true);
    }
    databaseIdentity = parseGenesis002DatabaseList(after.stdout);
    if (databaseIdentity === null) {
      fail('GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED', true);
    }
    freshStatus = await postflight(databaseIdentity);
    assertSourceAndArtifact();
  } catch (error) {
    if (
      error instanceof Genesis002ProductionPublisherError
      && error.code === 'GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
    ) throw error;
    fail('GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED', true);
  }
  return Object.freeze({
    schemaVersion: 1,
    profile: GENESIS_002_PUBLISH_PROFILE,
    databaseIdentity,
    database: plan.database,
    moduleIdentity: plan.moduleIdentity,
    sourceCommit: plan.sourceCommit,
    moduleSha256: plan.moduleSha256,
    moduleTreeId: plan.moduleTreeId,
    dependencyClosureDigest: plan.dependencyClosureDigest,
    spacetimeExecutableSha256: plan.spacetimeExecutableSha256,
    spacetimeCliConfigSha256: plan.spacetimeCliConfigSha256,
    deleteData: plan.deleteData,
    outcome: publishResult.status === 0
      ? 'verified'
      : 'verified-after-submission-error',
    freshStatusDigest: createHash('sha256')
      .update('warpkeep.genesis-002.fresh-publish-status.v1\n')
      .update(`${JSON.stringify(freshStatus)}\n`)
      .digest('hex'),
    playerAccessEnabled: false,
    admissionMutationsEnabled: false,
    atlasImportMutationsEnabled: true,
    atlasActivationMutationsEnabled: false,
    playerPresentationEnabled: false,
  });
}

const EXPECTED_REDUCERS = Object.freeze([
  'accept_alpha_terms_v1',
  'admin_admit_founder_for_access_request_v2',
  'admin_admit_founder_v1',
  'admin_allow_fid',
  'admin_allow_fid_for_access_request_v1',
  'admin_begin_greater_realm_verification_v1',
  'admin_bump_auth_epoch',
  'admin_disable_fid',
  'admin_finalize_greater_realm_release_v1',
  'admin_import_greater_realm_chunk_v1',
  'admin_import_greater_realm_components_v1',
  'admin_import_greater_realm_regions_v1',
  'admin_reset_access_request_v1',
  'admin_stage_greater_realm_release_v1',
  'admin_upsert_realm_profile_v1',
  'admin_verify_greater_realm_batch_v1',
  'bootstrap_player',
  'bootstrap_player_v2',
]);
const EXPECTED_PROCEDURES = Object.freeze([
  'access_request_get_status_v_1',
  'access_request_submit_v_1',
  'admin_get_greater_realm_import_plan_v_1',
  'admin_get_greater_realm_status_v_1',
  'auth_resolver_get_fid_admission_v_2',
  'get_my_admission_status_v_2',
  'get_realm_status_v1',
]);
const EXPECTED_TABLES = Object.freeze([
  'access_request_v1', 'admin_audit', 'allowed_fid', 'alpha_terms_acceptance_v1',
  'castle', 'greater_realm_activation_v1', 'greater_realm_castle_claim_v1',
  'greater_realm_castle_slot_v1', 'greater_realm_cell_occupancy_v1',
  'greater_realm_cell_v1', 'greater_realm_chunk_v1',
  'greater_realm_navigation_component_v1', 'greater_realm_release_v1',
  'greater_realm_resource_node_v1', 'mark_account_v1', 'player',
  'player_ownership_v2', 'player_v2', 'realm_atlas_v1',
  'realm_atlas_visible_region_v1', 'realm_profile_v1', 'realm_worker_system_v2',
  'resource_account_v1',
]);

function exactNames(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

/** Exact generated ABI gate; no activation reducer is permitted in G002. */
export function verifyGenesis002GeneratedAbi(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',')
      !== 'procedures,publicTables,reducers,tables'
    || !exactNames(value.reducers, EXPECTED_REDUCERS)
    || !exactNames(value.procedures, EXPECTED_PROCEDURES)
    || !exactNames(value.tables, EXPECTED_TABLES)
    || !exactNames(value.publicTables, [])
  ) fail('GENESIS_002_MODULE_ABI_INVALID');
  return Object.freeze({
    reducerCount: EXPECTED_REDUCERS.length,
    procedureCount: EXPECTED_PROCEDURES.length,
    tableCount: EXPECTED_TABLES.length,
    publicTableCount: 0,
    activationReducerCount: 0,
  });
}

function generatedAbi(indexSource, publicIndexSource) {
  if (
    typeof indexSource !== 'string'
    || typeof publicIndexSource !== 'string'
    || Buffer.byteLength(indexSource) > 16 * 1_024 * 1_024
    || Buffer.byteLength(publicIndexSource) > 16 * 1_024 * 1_024
  ) {
    fail('GENESIS_002_MODULE_ABI_INVALID');
  }
  const collect = pattern => {
    const values = [];
    for (const match of indexSource.matchAll(pattern)) values.push(match[1]);
    return values;
  };
  return Object.freeze({
    reducers: collect(/__reducerSchema\("([^"]+)"/gu),
    procedures: collect(/__procedureSchema\("([^"]+)"/gu),
    tables: collect(/__table\(\{\s+name: '([^']+)'/gu),
    publicTables: (() => {
      const values = [];
      for (const match of publicIndexSource.matchAll(
        /__table\(\{\s+name: '([^']+)'/gu,
      )) values.push(match[1]);
      return values;
    })(),
  });
}

function exactArtifactIdentity(path, descriptor, expected) {
  let current;
  let pathStatus;
  try {
    current = fstatSync(descriptor, { bigint: true });
    pathStatus = lstatSync(path, { bigint: true });
  } catch {
    fail('GENESIS_002_IMMUTABLE_ARTIFACT_CHANGED');
  }
  if (
    !current.isFile()
    || current.isSymbolicLink()
    || current.nlink !== 1n
    || (current.mode & 0o7777n) !== 0o400n
    || (process.getuid !== undefined && current.uid !== BigInt(process.getuid()))
    || realpathSync(path) !== path
    || pathStatus.dev !== current.dev
    || pathStatus.ino !== current.ino
    || pathStatus.mode !== current.mode
    || pathStatus.uid !== current.uid
    || pathStatus.nlink !== current.nlink
    || pathStatus.size !== current.size
    || pathStatus.mtimeNs !== current.mtimeNs
    || pathStatus.ctimeNs !== current.ctimeNs
    || (expected !== undefined && (
      expected.dev !== current.dev
      || expected.ino !== current.ino
      || expected.mode !== current.mode
      || expected.uid !== current.uid
      || expected.nlink !== current.nlink
      || expected.size !== current.size
      || expected.mtimeNs !== current.mtimeNs
      || expected.ctimeNs !== current.ctimeNs
    ))
  ) fail('GENESIS_002_IMMUTABLE_ARTIFACT_CHANGED');
  return Object.freeze({
    dev: current.dev,
    ino: current.ino,
    mode: current.mode,
    uid: current.uid,
    nlink: current.nlink,
    size: current.size,
    mtimeNs: current.mtimeNs,
    ctimeNs: current.ctimeNs,
  });
}

function exactCliConfig(path, expectedDigest) {
  if (
    typeof path !== 'string'
    || !isAbsolute(path)
    || resolve(path) !== path
  ) fail('GENESIS_002_CLI_CONFIG_INVALID');
  assertProductionAdminTrustedAncestors(resolve(path, '..'));
  let descriptor;
  let bytes;
  try {
    const pathStatus = lstatSync(path, { bigint: true });
    if (
      realpathSync(path) !== path
      || !pathStatus.isFile()
      || pathStatus.isSymbolicLink()
      || pathStatus.nlink !== 1n
      || (pathStatus.mode & 0o7777n) !== 0o600n
      || pathStatus.size < 1n
      || pathStatus.size > BigInt(MAXIMUM_CLI_CONFIG_BYTES)
      || (process.getuid !== undefined && pathStatus.uid !== BigInt(process.getuid()))
    ) fail('GENESIS_002_CLI_CONFIG_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== pathStatus.dev
      || before.ino !== pathStatus.ino
      || before.mode !== pathStatus.mode
      || before.uid !== pathStatus.uid
      || before.nlink !== pathStatus.nlink
      || before.size !== pathStatus.size
      || before.mtimeNs !== pathStatus.mtimeNs
      || before.ctimeNs !== pathStatus.ctimeNs
    ) fail('GENESIS_002_CLI_CONFIG_CHANGED');
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      bytes.byteLength !== Number(before.size)
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.mode !== before.mode
      || after.uid !== before.uid
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
      || afterPath.dev !== before.dev
      || afterPath.ino !== before.ino
      || afterPath.mode !== before.mode
      || afterPath.uid !== before.uid
      || afterPath.nlink !== before.nlink
      || afterPath.size !== before.size
      || afterPath.mtimeNs !== before.mtimeNs
      || afterPath.ctimeNs !== before.ctimeNs
    ) fail('GENESIS_002_CLI_CONFIG_CHANGED');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded.includes('\0')) fail('GENESIS_002_CLI_CONFIG_INVALID');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (expectedDigest !== undefined && digest !== expectedDigest) {
      fail('GENESIS_002_CLI_CONFIG_CHANGED');
    }
    return Object.freeze({ bytes, digest });
  } catch (error) {
    bytes?.fill(0);
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function stageCliConfig(sourcePath, directory) {
  const source = exactCliConfig(sourcePath);
  const rootDirectory = join(directory, 'spacetime-root');
  const configPath = join(directory, 'spacetime-cli.toml');
  let descriptor;
  try {
    mkdirSync(rootDirectory, { mode: 0o700 });
    const rootStatus = lstatSync(rootDirectory);
    if (
      !rootStatus.isDirectory()
      || rootStatus.isSymbolicLink()
      || (rootStatus.mode & 0o7777) !== 0o700
      || (process.getuid !== undefined && rootStatus.uid !== process.getuid())
    ) fail('GENESIS_002_CLI_ROOT_INVALID');
    descriptor = openSync(
      configPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < source.bytes.byteLength) {
      const written = writeSync(
        descriptor,
        source.bytes,
        offset,
        source.bytes.byteLength - offset,
        offset,
      );
      if (written < 1) fail('GENESIS_002_CLI_CONFIG_COPY_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    source.bytes.fill(0);
  }
  exactCliConfig(configPath, source.digest).bytes.fill(0);
  return Object.freeze({
    spacetimeCliRootDirectory: rootDirectory,
    spacetimeCliConfigPath: configPath,
    spacetimeCliConfigSha256: source.digest,
    assertCliConfig: () => exactCliConfig(configPath, source.digest).bytes.fill(0),
  });
}

/**
 * Builds after and before exact protected-main attestations, then publishes
 * only an owner-private, read-only inode held open across the child process.
 */
export function prepareGenesis002SourceBuiltArtifact(input) {
  if (
    input === null
    || typeof input !== 'object'
    || !COMMIT.test(input.sourceCommit ?? '')
    || typeof input.reattestSource !== 'function'
    || typeof input.dependencyCacheRoot !== 'string'
    || !isAbsolute(input.dependencyCacheRoot)
    || (input.cliConfigSourcePath !== undefined && (
      typeof input.cliConfigSourcePath !== 'string'
      || !isAbsolute(input.cliConfigSourcePath)
    ))
  ) fail('GENESIS_002_SOURCE_BUILD_INPUT_INVALID');
  const childEnvironment = genesis002ChildEnvironment(
    input.environment ?? process.env,
  );
  const cli = attestPinnedSpacetimeCli(
    input.executable ?? process.env.SPACETIME_BIN ?? 'spacetime',
    input.spawn ?? spawnSync,
    childEnvironment,
  );
  let directory;
  let descriptor;
  let sourceDescriptor;
  let artifactPath;
  let identity;
  let cleaned = false;
  try {
    if (input.reattestSource() !== input.sourceCommit) {
      fail('GENESIS_002_PROTECTED_MAIN_ADVANCED');
    }
    directory = mkdtempSync(join(tmpdir(), 'warpkeep-genesis002-module-'));
    chmodSync(directory, 0o700);
    artifactPath = join(directory, 'bundle.js');
    descriptor = openSync(
      artifactPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const sourceBuild = withGreaterRealmLockedSourceBuild({
      repositoryRoot: REPOSITORY_ROOT,
      moduleSourceCommit: input.sourceCommit,
      dependencyCacheRoot: input.dependencyCacheRoot,
      materializationParent: input.materializationParent,
      generatedFiles: ['spacetimedb/genesis002/dist/bundle.js'],
      operation: ({ materializedRoot }) => {
        const build = (input.spawn ?? spawnSync)(cli.path, [
          'build', '--module-path', GENESIS_002_PRODUCTION_TARGET.modulePath,
        ], {
          cwd: materializedRoot,
          encoding: 'utf8',
          env: Object.freeze({
            PATH: childEnvironment.PATH ?? '/usr/bin:/bin',
            ...(childEnvironment.TMPDIR === undefined
              ? {} : { TMPDIR: childEnvironment.TMPDIR }),
          }),
          input: '',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 10 * 60_000,
          maxBuffer: 4 * 1_024 * 1_024,
        });
        if (
          build?.status !== 0
          || typeof build.stdout !== 'string'
          || typeof build.stderr !== 'string'
        ) fail('GENESIS_002_SOURCE_BUILD_FAILED');
        const sourcePath = resolve(
          materializedRoot,
          GENESIS_002_PRODUCTION_TARGET.modulePath,
          'dist/bundle.js',
        );
        const sourceBefore = lstatSync(sourcePath, { bigint: true });
        if (
          !sourceBefore.isFile()
          || sourceBefore.isSymbolicLink()
          || sourceBefore.nlink !== 1n
          || sourceBefore.size < 1n
          || sourceBefore.size > 256n * 1_024n * 1_024n
          || realpathSync(sourcePath) !== sourcePath
        ) fail('GENESIS_002_SOURCE_BUILD_ARTIFACT_INVALID');
        sourceDescriptor = openSync(
          sourcePath,
          constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        const openedSource = fstatSync(sourceDescriptor, { bigint: true });
        if (
          openedSource.dev !== sourceBefore.dev
          || openedSource.ino !== sourceBefore.ino
          || openedSource.size !== sourceBefore.size
          || openedSource.mtimeNs !== sourceBefore.mtimeNs
          || openedSource.ctimeNs !== sourceBefore.ctimeNs
        ) fail('GENESIS_002_SOURCE_BUILD_ARTIFACT_INVALID');
        const digest = createHash('sha256');
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let sourceOffset = 0;
        try {
          while (sourceOffset < Number(openedSource.size)) {
            const count = readSync(
              sourceDescriptor,
              buffer,
              0,
              Math.min(buffer.byteLength, Number(openedSource.size) - sourceOffset),
              sourceOffset,
            );
            if (count < 1) fail('GENESIS_002_SOURCE_BUILD_ARTIFACT_INVALID');
            digest.update(buffer.subarray(0, count));
            let written = 0;
            while (written < count) {
              const amount = writeSync(
                descriptor,
                buffer,
                written,
                count - written,
                sourceOffset + written,
              );
              if (amount < 1) fail('GENESIS_002_SOURCE_BUILD_ARTIFACT_INVALID');
              written += amount;
            }
            sourceOffset += count;
          }
        } finally {
          buffer.fill(0);
          closeSync(sourceDescriptor);
          sourceDescriptor = undefined;
        }
        return digest.digest('hex');
      },
    });
    if (input.reattestSource() !== input.sourceCommit) {
      fail('GENESIS_002_PROTECTED_MAIN_ADVANCED');
    }
    fsyncSync(descriptor);
    fchmodSync(descriptor, 0o400);
    identity = exactArtifactIdentity(artifactPath, descriptor);
    const moduleSha256 = sourceBuild.result;

    const generated = join(directory, 'generated-private');
    const generatedPublic = join(directory, 'generated-public');
    mkdirSync(generated, { mode: 0o700 });
    mkdirSync(generatedPublic, { mode: 0o700 });
    const generationEnvironment = Object.freeze({
      PATH: childEnvironment.PATH ?? '/usr/bin:/bin',
      ...(childEnvironment.TMPDIR === undefined
        ? {} : { TMPDIR: childEnvironment.TMPDIR }),
    });
    const generation = (input.spawn ?? spawnSync)(cli.path, [
      'generate', '--lang', 'typescript', '--include-private', '--yes', '--no-config',
      '--js-path', artifactPath, '--out-dir', generated,
    ], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: generationEnvironment,
      input: '',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60_000,
      maxBuffer: 4 * 1_024 * 1_024,
    });
    if (generation?.status !== 0) fail('GENESIS_002_MODULE_ABI_GENERATION_FAILED');
    const publicGeneration = (input.spawn ?? spawnSync)(cli.path, [
      'generate', '--lang', 'typescript', '--yes', '--no-config',
      '--js-path', artifactPath, '--out-dir', generatedPublic,
    ], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: generationEnvironment,
      input: '',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60_000,
      maxBuffer: 4 * 1_024 * 1_024,
    });
    if (publicGeneration?.status !== 0) {
      fail('GENESIS_002_MODULE_ABI_GENERATION_FAILED');
    }
    const abi = verifyGenesis002GeneratedAbi(generatedAbi(
      readFileSync(join(generated, 'index.ts'), 'utf8'),
      readFileSync(join(generatedPublic, 'index.ts'), 'utf8'),
    ));
    const cliConfig = input.cliConfigSourcePath === undefined
      ? undefined
      : stageCliConfig(input.cliConfigSourcePath, directory);
    if (input.reattestSource() !== input.sourceCommit) {
      fail('GENESIS_002_PROTECTED_MAIN_ADVANCED');
    }
    const assertSourceAndArtifact = () => {
      if (input.reattestSource() !== input.sourceCommit) {
        fail('GENESIS_002_PROTECTED_MAIN_ADVANCED');
      }
      exactArtifactIdentity(artifactPath, descriptor, identity);
      cliConfig?.assertCliConfig();
    };
    const assertArtifact = () => {
      exactArtifactIdentity(artifactPath, descriptor, identity);
      cliConfig?.assertCliConfig();
    };
    return Object.freeze({
      sourceCommit: input.sourceCommit,
      moduleSha256,
      artifactPath,
      publishArtifactPath: '/dev/fd/3',
      artifactDescriptor: descriptor,
      spacetimeExecutable: cli.path,
      spacetimeExecutableSha256: cli.digest,
      ...(cliConfig === undefined ? {} : cliConfig),
      dependencyClosureDigest: sourceBuild.dependencyClosureDigest,
      moduleTreeId: sourceBuild.moduleTreeId,
      childEnvironment,
      abi,
      assertSourceAndArtifact,
      assertArtifact,
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        closeSync(descriptor);
        descriptor = undefined;
        rmSync(directory, { recursive: true, force: false });
        directory = undefined;
        cli.cleanup();
      },
    });
  } catch (error) {
    if (sourceDescriptor !== undefined) closeSync(sourceDescriptor);
    if (descriptor !== undefined) closeSync(descriptor);
    if (directory !== undefined) {
      try { rmSync(directory, { recursive: true, force: false }); } catch { /* Preserve cause. */ }
    }
    cli.cleanup();
    throw error;
  }
}
