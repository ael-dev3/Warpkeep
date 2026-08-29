import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
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

import { withGreaterRealmLockedSourceBuild } from './greater-realm-production-immutable-artifact.ts';
import { assertProductionAdminTrustedAncestors } from './production-admin-token-budget.mjs';
import { attestPinnedSpacetimeCli } from './spacetime-cli-attestation.mjs';

export const PTR_PRODUCTION_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  databaseAlias: 'warpkeep-ptr',
  moduleIdentity: 'warpkeep-ptr-owner-view-v1',
  modulePath: 'spacetimedb/ptr',
  genesis001DatabaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});

export const PTR_PRODUCTION_PUBLISH_PROFILE =
  'warpkeep-ptr-production-publish-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const MAXIMUM_DATABASE_LIST_BYTES = 256 * 1_024;
const MAXIMUM_CLI_CONFIG_BYTES = 64 * 1_024;
const REPOSITORY_ROOT = realpathSync(resolve(
  fileURLToPath(new URL('..', import.meta.url)),
));
const CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
]);
const PUBLISH_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'databaseIdentity',
  'databaseAlias',
  'moduleIdentity',
  'sourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'spacetimeCliConfigSha256',
  'deleteData',
  'outcome',
  'freshDatabase',
  'freshStatusDigest',
  'admissionSurfacePresent',
  'accessRequestSurfacePresent',
]);

const EXPECTED_REDUCERS = Object.freeze([
  'admin_begin_greater_realm_verification_v1',
  'admin_finalize_greater_realm_release_v1',
  'admin_import_greater_realm_chunk_v1',
  'admin_import_greater_realm_components_v1',
  'admin_import_greater_realm_regions_v1',
  'admin_provision_ptr_owner_v1',
  'admin_stage_greater_realm_release_v1',
  'admin_suspend_ptr_owner_v1',
  'admin_verify_greater_realm_batch_v1',
]);
const EXPECTED_PROCEDURES = Object.freeze([
  'admin_get_greater_realm_status_v1',
  'get_ptr_owner_status_v1',
  'get_realm_atlas_bootstrap_v1',
  'get_realm_atlas_chunk_v1',
  'get_realm_atlas_resource_locations_v1',
  'get_realm_atlas_window_v1',
  'plan_realm_route_v1',
]);

export class PtrProductionPublisherError extends Error {
  constructor(code, publishAttempted = false) {
    super(code);
    this.name = 'PtrProductionPublisherError';
    this.code = code;
    this.publishAttempted = publishAttempted;
  }
}

function fail(code, publishAttempted = false) {
  throw new PtrProductionPublisherError(code, publishAttempted);
}

function exactRecord(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some((key, index) => key !== keys[index])
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
  ) fail(code);
  return Object.freeze(Object.fromEntries(keys.map(key => [key, value[key]])));
}

function canonicalPublishReceipt(value) {
  const receipt = exactRecord(
    value,
    PUBLISH_RECEIPT_KEYS,
    'PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID',
  );
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== PTR_PRODUCTION_PUBLISH_PROFILE
    || typeof receipt.databaseIdentity !== 'string'
    || !SHA256.test(receipt.databaseIdentity)
    || receipt.databaseIdentity === PTR_PRODUCTION_TARGET.genesis001DatabaseIdentity
    || receipt.databaseAlias !== PTR_PRODUCTION_TARGET.databaseAlias
    || receipt.moduleIdentity !== PTR_PRODUCTION_TARGET.moduleIdentity
    || typeof receipt.sourceCommit !== 'string'
    || !COMMIT.test(receipt.sourceCommit)
    || typeof receipt.moduleSha256 !== 'string'
    || !SHA256.test(receipt.moduleSha256)
    || typeof receipt.moduleTreeId !== 'string'
    || !COMMIT.test(receipt.moduleTreeId)
    || typeof receipt.dependencyClosureDigest !== 'string'
    || !SHA256.test(receipt.dependencyClosureDigest)
    || typeof receipt.spacetimeExecutableSha256 !== 'string'
    || !SHA256.test(receipt.spacetimeExecutableSha256)
    || typeof receipt.spacetimeCliConfigSha256 !== 'string'
    || !SHA256.test(receipt.spacetimeCliConfigSha256)
    || receipt.deleteData !== 'never'
    || receipt.outcome !== 'verified'
    || receipt.freshDatabase !== true
    || typeof receipt.freshStatusDigest !== 'string'
    || !SHA256.test(receipt.freshStatusDigest)
    || receipt.admissionSurfacePresent !== false
    || receipt.accessRequestSurfacePresent !== false
  ) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID');
  return receipt;
}

export function ptrProductionPublishReceiptDigest(receipt) {
  const canonical = canonicalPublishReceipt(receipt);
  return createHash('sha256')
    .update('warpkeep.ptr.production-publish-receipt.v1\n')
    .update(`${JSON.stringify(canonical)}\n`)
    .digest('hex');
}

function canonicalPublishPlan(input) {
  if (
    input === null
    || typeof input !== 'object'
    || typeof input.sourceCommit !== 'string'
    || !COMMIT.test(input.sourceCommit)
    || typeof input.moduleSha256 !== 'string'
    || !SHA256.test(input.moduleSha256)
    || typeof input.moduleTreeId !== 'string'
    || !COMMIT.test(input.moduleTreeId)
    || typeof input.dependencyClosureDigest !== 'string'
    || !SHA256.test(input.dependencyClosureDigest)
    || typeof input.spacetimeExecutableSha256 !== 'string'
    || !SHA256.test(input.spacetimeExecutableSha256)
    || typeof input.spacetimeCliConfigSha256 !== 'string'
    || !SHA256.test(input.spacetimeCliConfigSha256)
  ) fail('PTR_PRODUCTION_PUBLISH_PLAN_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: PTR_PRODUCTION_PUBLISH_PROFILE,
    uri: PTR_PRODUCTION_TARGET.uri,
    databaseAlias: PTR_PRODUCTION_TARGET.databaseAlias,
    moduleIdentity: PTR_PRODUCTION_TARGET.moduleIdentity,
    modulePath: PTR_PRODUCTION_TARGET.modulePath,
    sourceCommit: input.sourceCommit,
    moduleSha256: input.moduleSha256,
    moduleTreeId: input.moduleTreeId,
    dependencyClosureDigest: input.dependencyClosureDigest,
    spacetimeExecutableSha256: input.spacetimeExecutableSha256,
    spacetimeCliConfigSha256: input.spacetimeCliConfigSha256,
    deleteData: PTR_PRODUCTION_TARGET.deleteData,
    genesis001DatabaseIdentity:
      PTR_PRODUCTION_TARGET.genesis001DatabaseIdentity,
  });
}

export function ptrProductionPublishConfirmationDigest(input) {
  return createHash('sha256')
    .update('warpkeep.ptr.production-publish-confirmation.v1\n')
    .update(`${JSON.stringify(canonicalPublishPlan(input))}\n`)
    .digest('hex');
}

function disallowedIdentities(values) {
  if (!Array.isArray(values) || values.some(value => (
    typeof value !== 'string' || !SHA256.test(value)
  ))) fail('PTR_PRODUCTION_DISALLOWED_IDENTITIES_INVALID');
  return new Set([
    PTR_PRODUCTION_TARGET.genesis001DatabaseIdentity,
    ...values,
  ]);
}

export function parsePtrDatabaseList(output, options = {}) {
  if (
    typeof output !== 'string'
    || Buffer.byteLength(output) > MAXIMUM_DATABASE_LIST_BYTES
    || options === null
    || typeof options !== 'object'
    || Array.isArray(options)
    || Reflect.ownKeys(options).some(key => key !== 'disallowedDatabaseIdentities')
  ) fail('PTR_PRODUCTION_DATABASE_LIST_INVALID');
  const disallowed = disallowedIdentities(
    options.disallowedDatabaseIdentities ?? [],
  );
  const normalized = output.replace(/\u001b\[[0-9;]*m/gu, '');
  const matches = [];
  for (const line of normalized.split(/\r?\n/u).map(value => value.trim())) {
    if (line === '') continue;
    const cells = line.split('|');
    const targetTokenPresent = /(?:^|[\s,|])warpkeep-ptr(?:$|[\s,|])/u
      .test(line);
    if (cells.length !== 2) {
      if (targetTokenPresent) fail('PTR_PRODUCTION_DATABASE_LIST_INVALID');
      continue;
    }
    const aliases = cells[0].split(',').map(value => value.trim());
    const containsTarget = aliases.includes(PTR_PRODUCTION_TARGET.databaseAlias);
    if (!containsTarget) {
      if (targetTokenPresent) fail('PTR_PRODUCTION_DATABASE_LIST_INVALID');
      continue;
    }
    if (
      aliases.some(alias => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(alias))
      || !SHA256.test(cells[1].trim())
    ) fail('PTR_PRODUCTION_DATABASE_LIST_INVALID');
    matches.push(cells[1].trim());
  }
  if (matches.length === 0) return null;
  if (matches.length !== 1) fail('PTR_PRODUCTION_DATABASE_LIST_INVALID');
  const identity = matches[0];
  if (disallowed.has(identity)) {
    fail('PTR_PRODUCTION_TARGET_IDENTITY_FORBIDDEN');
  }
  return identity;
}

export function ptrProductionPublishArguments(
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
  ) fail('PTR_PRODUCTION_ARTIFACT_PATH_INVALID');
  return Object.freeze([
    '--root-dir', spacetimeCliRootDirectory,
    '--config-path', spacetimeCliConfigPath,
    'publish',
    '--server', PTR_PRODUCTION_TARGET.uri,
    '--js-path', artifactPath,
    '--delete-data=never',
    '--no-config',
    '--yes=remote,skip-login',
    PTR_PRODUCTION_TARGET.databaseAlias,
  ]);
}

function listArguments(spacetimeCliRootDirectory, spacetimeCliConfigPath) {
  return Object.freeze([
    '--root-dir', spacetimeCliRootDirectory,
    '--config-path', spacetimeCliConfigPath,
    'list',
    '--server', PTR_PRODUCTION_TARGET.uri,
    '--yes',
  ]);
}

function childEnvironment(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('PTR_PRODUCTION_PUBLISH_ENVIRONMENT_INVALID');
  }
  const forbidden = /(?:TOKEN|SECRET|PASSWORD|COOKIE|AUTH|PROXY|NODE_OPTIONS|DYLD|LD_PRELOAD)/iu;
  if (Object.entries(value).some(([key, child]) => (
    !CHILD_ENVIRONMENT_KEYS.includes(key)
    || forbidden.test(key)
    || typeof child !== 'string'
    || child.includes('\0')
  ))) fail('PTR_PRODUCTION_PUBLISH_ENVIRONMENT_INVALID');
  return Object.freeze({ ...value });
}

function run(spawn, executable, arguments_, environment, artifactDescriptor) {
  const result = spawn(executable, arguments_, {
    encoding: 'utf8',
    env: environment,
    stdio: artifactDescriptor === undefined
      ? ['ignore', 'pipe', 'pipe']
      : ['ignore', 'pipe', 'pipe', artifactDescriptor],
    timeout: 120_000,
    maxBuffer: 4 * 1_024 * 1_024,
  });
  if (typeof result?.stdout !== 'string' || typeof result.stderr !== 'string') {
    fail('PTR_PRODUCTION_SPACETIME_COMMAND_FAILED');
  }
  return result;
}

function exactNames(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function verifyPtrGeneratedAbi(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',')
      !== 'procedures,publicTables,reducers,tables'
    || !exactNames(value.reducers, EXPECTED_REDUCERS)
    || !exactNames(value.procedures, EXPECTED_PROCEDURES)
    || !exactNames(value.tables, [])
    || !exactNames(value.publicTables, [])
  ) fail('PTR_PRODUCTION_MODULE_ABI_INVALID');
  return Object.freeze({
    reducerCount: 9,
    procedureCount: 7,
    tableCount: 0,
    publicTableCount: 0,
    ownerProvisionReducerCount: 1,
    ownerSuspendReducerCount: 1,
    atlasActivationReducerCount: 0,
  });
}

function ptrChildEnvironment(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    fail('PTR_PRODUCTION_PUBLISH_ENVIRONMENT_INVALID');
  }
  return Object.freeze(Object.fromEntries(
    CHILD_ENVIRONMENT_KEYS
      .filter(key => typeof source[key] === 'string' && source[key].length > 0)
      .map(key => [key, source[key]]),
  ));
}

function generatedAbi(indexSource) {
  if (
    typeof indexSource !== 'string'
    || Buffer.byteLength(indexSource) > 16 * 1_024 * 1_024
  ) fail('PTR_PRODUCTION_MODULE_ABI_INVALID');
  const collect = pattern => {
    const values = [];
    for (const match of indexSource.matchAll(pattern)) values.push(match[1]);
    return values;
  };
  return Object.freeze({
    reducers: collect(/__reducerSchema\("([^"]+)"/gu),
    procedures: collect(/__procedureSchema\("([^"]+)"/gu),
    tables: collect(/__table\(\{\s+name: '([^']+)'/gu),
    publicTables: collect(/__table\(\{\s+name: '([^']+)'/gu),
  });
}

function exactArtifactIdentity(path, descriptor, expected) {
  let current;
  let pathStatus;
  try {
    current = fstatSync(descriptor, { bigint: true });
    pathStatus = lstatSync(path, { bigint: true });
  } catch {
    fail('PTR_PRODUCTION_IMMUTABLE_ARTIFACT_CHANGED');
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
  ) fail('PTR_PRODUCTION_IMMUTABLE_ARTIFACT_CHANGED');
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

function hardenPrivateArtifactDirectory(path) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    fchmodSync(descriptor, 0o700);
    const opened = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    const canonical = realpathSync(path);
    if (
      !opened.isDirectory()
      || current.isSymbolicLink()
      || opened.dev !== current.dev
      || opened.ino !== current.ino
      || opened.mode !== current.mode
      || opened.uid !== current.uid
      || opened.nlink !== current.nlink
      || opened.nlink < 1n
      || (opened.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined
        && opened.uid !== BigInt(process.getuid()))
      || canonical !== path
    ) fail('PTR_PRODUCTION_PRIVATE_ARTIFACT_DIRECTORY_INVALID');
    return canonical;
  } catch (error) {
    if (error instanceof PtrProductionPublisherError) throw error;
    return fail('PTR_PRODUCTION_PRIVATE_ARTIFACT_DIRECTORY_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exactCliConfig(path, expectedDigest) {
  if (
    typeof path !== 'string'
    || !isAbsolute(path)
    || resolve(path) !== path
  ) fail('PTR_PRODUCTION_CLI_CONFIG_INVALID');
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
      || (process.getuid !== undefined
        && pathStatus.uid !== BigInt(process.getuid()))
    ) fail('PTR_PRODUCTION_CLI_CONFIG_INVALID');
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
    ) fail('PTR_PRODUCTION_CLI_CONFIG_CHANGED');
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
    ) fail('PTR_PRODUCTION_CLI_CONFIG_CHANGED');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded.includes('\0')) fail('PTR_PRODUCTION_CLI_CONFIG_INVALID');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (expectedDigest !== undefined && digest !== expectedDigest) {
      fail('PTR_PRODUCTION_CLI_CONFIG_CHANGED');
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
    ) fail('PTR_PRODUCTION_CLI_ROOT_INVALID');
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
      if (written < 1) fail('PTR_PRODUCTION_CLI_CONFIG_COPY_FAILED');
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

/** Builds only the committed PTR module and regenerates its exact public ABI. */
export function preparePtrSourceBuiltArtifact(input) {
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
  ) fail('PTR_PRODUCTION_SOURCE_BUILD_INPUT_INVALID');
  const childEnvironment_ = ptrChildEnvironment(input.environment ?? process.env);
  const cli = attestPinnedSpacetimeCli(
    input.executable ?? process.env.SPACETIME_BIN ?? 'spacetime',
    input.spawn ?? spawnSync,
    childEnvironment_,
  );
  let directory;
  let descriptor;
  let sourceDescriptor;
  let artifactPath;
  let identity;
  let cleaned = false;
  try {
    if (input.reattestSource() !== input.sourceCommit) {
      fail('PTR_PRODUCTION_PROTECTED_MAIN_ADVANCED');
    }
    directory = hardenPrivateArtifactDirectory(
      mkdtempSync(join(tmpdir(), 'warpkeep-ptr-module-')),
    );
    artifactPath = join(directory, 'bundle.js');
    descriptor = openSync(
      artifactPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR
        | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const sourceBuild = withGreaterRealmLockedSourceBuild({
      repositoryRoot: REPOSITORY_ROOT,
      moduleSourceCommit: input.sourceCommit,
      dependencyCacheRoot: input.dependencyCacheRoot,
      materializationParent: input.materializationParent,
      generatedFiles: ['spacetimedb/ptr/dist/bundle.js'],
      operation: ({ materializedRoot }) => {
        const build = (input.spawn ?? spawnSync)(cli.path, [
          'build', '--module-path', PTR_PRODUCTION_TARGET.modulePath,
        ], {
          cwd: materializedRoot,
          encoding: 'utf8',
          env: Object.freeze({
            PATH: childEnvironment_.PATH ?? '/usr/bin:/bin',
            ...(childEnvironment_.TMPDIR === undefined
              ? {} : { TMPDIR: childEnvironment_.TMPDIR }),
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
        ) fail('PTR_PRODUCTION_SOURCE_BUILD_FAILED');
        const sourcePath = resolve(
          materializedRoot,
          PTR_PRODUCTION_TARGET.modulePath,
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
        ) fail('PTR_PRODUCTION_SOURCE_BUILD_ARTIFACT_INVALID');
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
        ) fail('PTR_PRODUCTION_SOURCE_BUILD_ARTIFACT_INVALID');
        const digest = createHash('sha256');
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let sourceOffset = 0;
        try {
          while (sourceOffset < Number(openedSource.size)) {
            const count = readSync(
              sourceDescriptor,
              buffer,
              0,
              Math.min(
                buffer.byteLength,
                Number(openedSource.size) - sourceOffset,
              ),
              sourceOffset,
            );
            if (count < 1) fail('PTR_PRODUCTION_SOURCE_BUILD_ARTIFACT_INVALID');
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
              if (amount < 1) {
                fail('PTR_PRODUCTION_SOURCE_BUILD_ARTIFACT_INVALID');
              }
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
      fail('PTR_PRODUCTION_PROTECTED_MAIN_ADVANCED');
    }
    fsyncSync(descriptor);
    fchmodSync(descriptor, 0o400);
    identity = exactArtifactIdentity(artifactPath, descriptor);
    const generated = join(directory, 'generated-public');
    mkdirSync(generated, { mode: 0o700 });
    const generation = (input.spawn ?? spawnSync)(cli.path, [
      'generate', '--lang', 'typescript', '--yes', '--no-config',
      '--js-path', artifactPath, '--out-dir', generated,
    ], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: Object.freeze({
        PATH: childEnvironment_.PATH ?? '/usr/bin:/bin',
        ...(childEnvironment_.TMPDIR === undefined
          ? {} : { TMPDIR: childEnvironment_.TMPDIR }),
      }),
      input: '',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60_000,
      maxBuffer: 4 * 1_024 * 1_024,
    });
    if (generation?.status !== 0) {
      fail('PTR_PRODUCTION_MODULE_ABI_GENERATION_FAILED');
    }
    const abi = verifyPtrGeneratedAbi(generatedAbi(
      readFileSync(join(generated, 'index.ts'), 'utf8'),
    ));
    const cliConfig = input.cliConfigSourcePath === undefined
      ? undefined
      : stageCliConfig(input.cliConfigSourcePath, directory);
    if (input.reattestSource() !== input.sourceCommit) {
      fail('PTR_PRODUCTION_PROTECTED_MAIN_ADVANCED');
    }
    const assertSourceAndArtifact = () => {
      if (input.reattestSource() !== input.sourceCommit) {
        fail('PTR_PRODUCTION_PROTECTED_MAIN_ADVANCED');
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
      moduleSha256: sourceBuild.result,
      artifactPath,
      publishArtifactPath: '/dev/fd/3',
      artifactDescriptor: descriptor,
      spacetimeExecutable: cli.path,
      spacetimeExecutableSha256: cli.digest,
      ...(cliConfig === undefined ? {} : cliConfig),
      dependencyClosureDigest: sourceBuild.dependencyClosureDigest,
      moduleTreeId: sourceBuild.moduleTreeId,
      childEnvironment: childEnvironment_,
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
      try { rmSync(directory, { recursive: true, force: false }); } catch {
        /* Preserve the original fixed error. */
      }
    }
    cli.cleanup();
    throw error;
  }
}

export async function executePtrProductionPublish(input) {
  const plan = canonicalPublishPlan(input);
  if (
    input.confirmationDigest !== ptrProductionPublishConfirmationDigest(plan)
    || typeof input.spacetimeExecutable !== 'string'
    || !isAbsolute(input.spacetimeExecutable)
    || (input.spawn !== undefined && typeof input.spawn !== 'function')
    || typeof input.postflight !== 'function'
    || typeof input.assertSourceAndArtifact !== 'function'
    || typeof input.spacetimeCliRootDirectory !== 'string'
    || !isAbsolute(input.spacetimeCliRootDirectory)
    || typeof input.spacetimeCliConfigPath !== 'string'
    || !isAbsolute(input.spacetimeCliConfigPath)
  ) fail('PTR_PRODUCTION_PUBLISH_CONFIRMATION_INVALID');
  const spawn = input.spawn ?? spawnSync;
  const environment = childEnvironment(input.childEnvironment);
  const parse = output => parsePtrDatabaseList(output, {
    disallowedDatabaseIdentities: input.disallowedDatabaseIdentities ?? [],
  });
  const beforeResult = run(
    spawn,
    input.spacetimeExecutable,
    listArguments(input.spacetimeCliRootDirectory, input.spacetimeCliConfigPath),
    environment,
  );
  if (beforeResult.status !== 0) fail('PTR_PRODUCTION_SPACETIME_COMMAND_FAILED');
  if (parse(beforeResult.stdout) !== null) {
    fail('PTR_PRODUCTION_DATABASE_ALREADY_EXISTS');
  }
  input.assertSourceAndArtifact();
  const publishResult = run(
    spawn,
    input.spacetimeExecutable,
    ptrProductionPublishArguments(
      input.artifactPath,
      input.spacetimeCliRootDirectory,
      input.spacetimeCliConfigPath,
    ),
    environment,
    input.artifactDescriptor,
  );
  let databaseIdentity;
  let freshStatus;
  try {
    const after = run(
      spawn,
      input.spacetimeExecutable,
      listArguments(input.spacetimeCliRootDirectory, input.spacetimeCliConfigPath),
      environment,
    );
    if (after.status !== 0) {
      fail(
        'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        true,
      );
    }
    databaseIdentity = parse(after.stdout);
    if (databaseIdentity === null) {
      fail(
        'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        true,
      );
    }
    freshStatus = await input.postflight(databaseIdentity);
    if (
      freshStatus === null
      || typeof freshStatus !== 'object'
      || Array.isArray(freshStatus)
      || freshStatus.freshDatabase !== true
      || freshStatus.admissionSurfacePresent !== false
      || freshStatus.accessRequestSurfacePresent !== false
    ) fail('PTR_PRODUCTION_FRESH_STATUS_INVALID');
    input.assertSourceAndArtifact();
    if (publishResult.status !== 0) {
      fail(
        'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        true,
      );
    }
  } catch (error) {
    if (
      error instanceof PtrProductionPublisherError
      && error.publishAttempted
    ) throw error;
    fail(
      'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      true,
    );
  }
  const receipt = Object.freeze({
    schemaVersion: 1,
    profile: PTR_PRODUCTION_PUBLISH_PROFILE,
    databaseIdentity,
    databaseAlias: plan.databaseAlias,
    moduleIdentity: plan.moduleIdentity,
    sourceCommit: plan.sourceCommit,
    moduleSha256: plan.moduleSha256,
    moduleTreeId: plan.moduleTreeId,
    dependencyClosureDigest: plan.dependencyClosureDigest,
    spacetimeExecutableSha256: plan.spacetimeExecutableSha256,
    spacetimeCliConfigSha256: plan.spacetimeCliConfigSha256,
    deleteData: plan.deleteData,
    outcome: 'verified',
    freshDatabase: true,
    freshStatusDigest: createHash('sha256')
      .update('warpkeep.ptr.fresh-publish-status.v1\n')
      .update(`${JSON.stringify(freshStatus)}\n`)
      .digest('hex'),
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
  });
  return Object.freeze({
    ...receipt,
    publishReceiptDigest: ptrProductionPublishReceiptDigest(receipt),
  });
}
