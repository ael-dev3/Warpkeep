import { spawn } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setGlobalLogLevel } from 'spacetimedb';

import { DbConnection } from '../src/spacetime/module_bindings';
import {
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_PLANNED_RUNTIME_PATHS,
  INNER_KEEP_SELECTED_MODELS,
  INNER_KEEP_SELECTED_PREVIEWS,
  assertInnerKeepRuntimeUseAuthorized,
  sha256,
} from './inner-keep-runtime-asset-contract.mjs';
import {
  INNER_KEEP_POPULATION_MODELS,
  INNER_KEEP_POPULATION_RUNTIME_PATHS,
  INNER_KEEP_POPULATION_SELECTION,
  assertInnerKeepPopulationRuntimeUseAuthorized,
} from './inner-keep-population-runtime-contract.mjs';
import {
  INNER_KEEP_RABBIT_MODELS,
  INNER_KEEP_RABBIT_RUNTIME_PATHS,
  INNER_KEEP_RABBIT_SELECTION,
  assertInnerKeepRabbitRuntimeUseAuthorized,
} from './inner-keep-rabbit-runtime-contract.mjs';
import {
  connect,
  privacySafeHermesErrorMessage,
  readAdminSecret,
  requestAdminToken,
  withOperationTimeout,
} from './hermes-admin';
import {
  INNER_KEEP_CANONICAL_TARGET,
  INNER_KEEP_PROTECTED_STATE_QUERIES,
  InnerKeepOperatorError,
  assertBuilderPlanMatchesArguments,
  assertCanonicalInnerKeepTarget,
  assertCatalogPlanMatchesArguments,
  assertStatusMatchesMutationArguments,
  captureInnerKeepProtectedState,
  createInnerKeepDryRunRecord,
  innerKeepDeactivationReducerArguments,
  innerKeepStaticAttestation,
  parseInnerKeepOperatorArguments,
  printableInnerKeepRecord,
  projectInnerKeepBuilderPlan,
  projectInnerKeepCatalogPlan,
  projectInnerKeepStatus,
  verifyInnerKeepMutationPostcondition,
  verifyInnerKeepProtectedStatePreserved,
  type InnerKeepOperatorArguments,
  type InnerKeepProtectedStateProof,
  type InnerKeepProtectedStateQuery,
  type InnerKeepProtectedStateSnapshot,
  type InnerKeepStatus,
} from './inner-keep-operator-core';
import { attestPinnedSpacetimeCli } from './publish-spacetime-dev.mjs';
import {
  attestCanonicalClientArtifactDirectory,
  digestExactArtifactFile,
  readPackageRelease,
} from './worker-rollout-operator-core';
import { attestExactProtectedWorkerRolloutMain } from './worker-rollout-operator';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const INNER_KEEP_RUNTIME_ROOTS = Object.freeze([
  'public/models/hegemony/inner-keep',
  'public/images/inner-keep/catalog',
]);
const INNER_KEEP_AUTHORIZED_RUNTIME_PATHS = Object.freeze([
  ...INNER_KEEP_PLANNED_RUNTIME_PATHS,
  ...INNER_KEEP_POPULATION_RUNTIME_PATHS,
  ...INNER_KEEP_RABBIT_RUNTIME_PATHS,
].sort());
const INNER_KEEP_AUTHORIZED_RUNTIME_FILES = Object.freeze([
  ...INNER_KEEP_SELECTED_MODELS,
  ...INNER_KEEP_SELECTED_PREVIEWS,
  ...INNER_KEEP_POPULATION_MODELS,
  ...INNER_KEEP_RABBIT_MODELS,
]);
const PRIVATE_SQL_TIMEOUT_MILLISECONDS = 20_000;
const PRIVATE_SQL_MAXIMUM_STDOUT_BYTES = 1_100_000;
const PRIVATE_SQL_MAXIMUM_STDERR_BYTES = 64_000;
const PRIVATE_CREDENTIAL_DIRECTORY_MODE = 0o700;
const PRIVATE_CREDENTIAL_FILE_MODE = 0o600;
const PRIVATE_SQL_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
] as const);

type MutationCommand = Extract<InnerKeepOperatorArguments['command'],
  | 'seed-inner-keep-catalog'
  | 'backfill-inner-keep-builders'
  | 'activate-inner-keep'
  | 'deactivate-inner-keep'>;

function isMutationCommand(command: unknown): command is MutationCommand {
  return command === 'seed-inner-keep-catalog'
    || command === 'backfill-inner-keep-builders'
    || command === 'activate-inner-keep'
    || command === 'deactivate-inner-keep';
}

function fail(message: string): never {
  throw new InnerKeepOperatorError(message);
}

type PrivateSqlCredential = Readonly<{
  configPath: string;
  cleanup: () => void;
}>;

type InnerKeepRuntimeStatus = Readonly<{
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}>;

type InnerKeepRuntimeDirectoryEntry = Readonly<{
  name: string;
}>;

type InnerKeepRuntimeFilesystem = Readonly<{
  close: (descriptor: number) => void;
  fstat: (descriptor: number) => InnerKeepRuntimeStatus;
  lstat: (path: string) => InnerKeepRuntimeStatus;
  open: (path: string, flags: number) => number;
  readFile: (descriptor: number) => Buffer;
  readdir: (path: string) => readonly InnerKeepRuntimeDirectoryEntry[];
  realpath: (path: string) => string;
}>;

const INNER_KEEP_RUNTIME_FILESYSTEM: InnerKeepRuntimeFilesystem = Object.freeze({
  close: (descriptor) => closeSync(descriptor),
  fstat: (descriptor) => fstatSync(descriptor),
  lstat: (path) => lstatSync(path),
  open: (path, flags) => openSync(path, flags),
  readFile: (descriptor) => readFileSync(descriptor),
  readdir: (path) => readdirSync(path, { withFileTypes: true }),
  realpath: realpathSync,
});

function privateSqlChildEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(
    PRIVATE_SQL_CHILD_ENVIRONMENT_KEYS
      .filter((key) => typeof source[key] === 'string' && source[key]!.length > 0)
      .map((key) => [key, source[key]!] as const),
  ));
}

function createPrivateSqlCredential(token: string): PrivateSqlCredential {
  if (
    typeof token !== 'string'
    || token.length < 32
    || token.length > 16_384
    || token.includes('\0')
  ) fail('Inner Keep protected-state credential is invalid.');
  let directory: string | undefined;
  let descriptor: number | undefined;
  let credentialBytes: Buffer | undefined;
  try {
    directory = mkdtempSync(join(tmpdir(), 'warpkeep-inner-keep-evidence-'));
    chmodSync(directory, PRIVATE_CREDENTIAL_DIRECTORY_MODE);
    const directoryStatus = statSync(directory);
    if (
      !directoryStatus.isDirectory()
      || (directoryStatus.mode & 0o777) !== PRIVATE_CREDENTIAL_DIRECTORY_MODE
    ) fail('Inner Keep protected-state credential directory is unsafe.');
    const configPath = join(directory, 'spacetime-cli.toml');
    descriptor = openSync(
      configPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      PRIVATE_CREDENTIAL_FILE_MODE,
    );
    credentialBytes = Buffer.from(
      `spacetimedb_token = ${JSON.stringify(token)}\n`,
      'utf8',
    );
    writeFileSync(descriptor, credentialBytes);
    fchmodSync(descriptor, PRIVATE_CREDENTIAL_FILE_MODE);
    fsyncSync(descriptor);
    const status = fstatSync(descriptor);
    if (
      !status.isFile()
      || status.size !== credentialBytes.byteLength
      || (status.mode & 0o777) !== PRIVATE_CREDENTIAL_FILE_MODE
    ) fail('Inner Keep protected-state credential file is unsafe.');
    closeSync(descriptor);
    descriptor = undefined;
    credentialBytes.fill(0);
    credentialBytes = undefined;
    let cleaned = false;
    return Object.freeze({
      configPath,
      cleanup: () => {
        if (cleaned) return;
        try {
          rmSync(directory!, { recursive: true, force: true });
          cleaned = true;
        } catch {
          fail('Inner Keep protected-state credential cleanup failed.');
        }
      },
    });
  } catch (error) {
    credentialBytes?.fill(0);
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Continue to private cleanup. */ }
    }
    if (directory !== undefined) {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* Fail generically below. */ }
    }
    if (error instanceof InnerKeepOperatorError) throw error;
    fail('Inner Keep protected-state credential could not be created safely.');
  }
}

function collectBoundedPrivateSqlOutput(
  stream: NodeJS.ReadableStream,
  maximumBytes: number,
  onOverflow: () => void,
): () => Buffer {
  const chunks: Buffer[] = [];
  let bytes = 0;
  stream.on('data', (chunk: string | Buffer) => {
    const byteChunk = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    bytes += byteChunk.byteLength;
    if (bytes > maximumBytes) {
      onOverflow();
      return;
    }
    chunks.push(Buffer.from(byteChunk));
  });
  return () => Buffer.concat(chunks);
}

async function readPrivateProtectedTable(
  executable: string,
  credential: PrivateSqlCredential,
  token: string,
  target: typeof INNER_KEEP_CANONICAL_TARGET,
  query: InnerKeepProtectedStateQuery,
): Promise<Uint8Array> {
  if (
    !INNER_KEEP_PROTECTED_STATE_QUERIES.includes(query)
    || query.sql !== `SELECT * FROM ${query.table}`
  ) fail('Inner Keep protected-state SQL contract is invalid.');
  return new Promise<Uint8Array>((resolvePromise, rejectPromise) => {
    let settled = false;
    let overflow = false;
    let timedOut = false;
    let forcedSettlement: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(executable, [
      `--config-path=${credential.configPath}`,
      'sql',
      '--server', target.uri,
      '--confirmed', 'true',
      '--no-config',
      target.database,
      query.sql,
    ], {
      cwd: REPOSITORY_ROOT,
      env: privateSqlChildEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      if (forcedSettlement !== undefined) clearTimeout(forcedSettlement);
      callback();
    };
    const stopForOverflow = () => {
      overflow = true;
      try { child.kill('SIGKILL'); } catch { /* The bounded failure remains generic. */ }
    };
    const readStdout = collectBoundedPrivateSqlOutput(
      child.stdout,
      PRIVATE_SQL_MAXIMUM_STDOUT_BYTES,
      stopForOverflow,
    );
    const readStderr = collectBoundedPrivateSqlOutput(
      child.stderr,
      PRIVATE_SQL_MAXIMUM_STDERR_BYTES,
      stopForOverflow,
    );
    child.once('error', () => finish(() => rejectPromise(
      new InnerKeepOperatorError('Inner Keep protected state could not be read safely.'),
    )));
    child.once('close', (code) => finish(() => {
      const stdout = readStdout();
      const stderr = readStderr();
      if (
        timedOut
        || overflow
        || code !== 0
        || stdout.includes(token, 'utf8')
        || stderr.includes(token, 'utf8')
        || stdout.includes(credential.configPath, 'utf8')
        || stderr.includes(credential.configPath, 'utf8')
      ) {
        stdout.fill(0);
        stderr.fill(0);
        rejectPromise(new InnerKeepOperatorError(
          'Inner Keep protected state could not be read safely.',
        ));
        return;
      }
      stderr.fill(0);
      resolvePromise(stdout);
    }));
    deadline = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* The deadline remains authoritative. */ }
      forcedSettlement = setTimeout(() => finish(() => rejectPromise(
        new InnerKeepOperatorError('Inner Keep protected-state read exceeded its deadline.'),
      )), 2_000);
    }, PRIVATE_SQL_TIMEOUT_MILLISECONDS);
  });
}

function protectedStateReader(
  executable: string,
  credential: PrivateSqlCredential,
  token: string,
  target: typeof INNER_KEEP_CANONICAL_TARGET,
): () => Promise<InnerKeepProtectedStateSnapshot> {
  return () => captureInnerKeepProtectedState((query) => (
    readPrivateProtectedTable(executable, credential, token, target, query)
  ));
}

function sameRuntimeNode(
  left: InnerKeepRuntimeStatus,
  right: InnerKeepRuntimeStatus,
): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

export function collectInnerKeepRuntimeFiles(
  relativeRoot: string,
  filesystem: InnerKeepRuntimeFilesystem = INNER_KEEP_RUNTIME_FILESYSTEM,
): readonly string[] {
  const absoluteRoot = resolve(REPOSITORY_ROOT, relativeRoot);
  if (!absoluteRoot.startsWith(`${REPOSITORY_ROOT}${sep}`)) {
    fail('Inner Keep runtime registry path escaped the repository.');
  }
  let status;
  try {
    status = filesystem.lstat(absoluteRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze([]);
    fail('Inner Keep runtime registry cannot be inspected safely.');
  }
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail('Inner Keep runtime registry root is invalid.');
  }
  const files: string[] = [];
  const visit = (
    absoluteDirectory: string,
    relativeDirectory: string,
    expectedStatus?: InnerKeepRuntimeStatus,
  ): void => {
    let descriptor: number | undefined;
    try {
      descriptor = filesystem.open(
        absoluteDirectory,
        constants.O_RDONLY
          | (constants.O_DIRECTORY ?? 0)
          | (constants.O_NOFOLLOW ?? 0),
      );
      const openedBefore = filesystem.fstat(descriptor);
      const pathBefore = filesystem.lstat(absoluteDirectory);
      const canonicalBefore = filesystem.realpath(absoluteDirectory);
      if (
        !openedBefore.isDirectory()
        || openedBefore.isSymbolicLink()
        || !pathBefore.isDirectory()
        || pathBefore.isSymbolicLink()
        || canonicalBefore !== absoluteDirectory
        || !sameRuntimeNode(openedBefore, pathBefore)
        || (expectedStatus !== undefined && !sameRuntimeNode(expectedStatus, pathBefore))
      ) fail('Inner Keep runtime registry directory changed while it was inspected.');
      for (const entry of filesystem.readdir(absoluteDirectory)) {
        if (
          entry.name === '.'
          || entry.name === '..'
          || entry.name.includes('\0')
          || entry.name.normalize('NFC') !== entry.name
        ) fail('Inner Keep runtime registry contains an unsafe path.');
        const childAbsolute = resolve(absoluteDirectory, entry.name);
        if (!childAbsolute.startsWith(`${absoluteDirectory}${sep}`)) {
          fail('Inner Keep runtime registry contains an unsafe path.');
        }
        const childRelative = `${relativeDirectory}/${entry.name}`;
        const childStatus = filesystem.lstat(childAbsolute);
        if (childStatus.isSymbolicLink()) {
          fail('Inner Keep runtime registry contains a symbolic link.');
        }
        if (childStatus.isDirectory()) {
          visit(childAbsolute, childRelative, childStatus);
        } else if (childStatus.isFile()) {
          files.push(childRelative);
        } else {
          fail('Inner Keep runtime registry contains an unsupported entry.');
        }
      }
      const openedAfter = filesystem.fstat(descriptor);
      const pathAfter = filesystem.lstat(absoluteDirectory);
      const canonicalAfter = filesystem.realpath(absoluteDirectory);
      if (
        !openedAfter.isDirectory()
        || openedAfter.isSymbolicLink()
        || !pathAfter.isDirectory()
        || pathAfter.isSymbolicLink()
        || canonicalAfter !== absoluteDirectory
        || !sameRuntimeNode(openedBefore, openedAfter)
        || !sameRuntimeNode(openedAfter, pathAfter)
      ) fail('Inner Keep runtime registry directory changed while it was inspected.');
    } catch (error) {
      if (error instanceof InnerKeepOperatorError) throw error;
      fail('Inner Keep runtime registry cannot be inspected safely.');
    } finally {
      if (descriptor !== undefined) filesystem.close(descriptor);
    }
  };
  visit(absoluteRoot, relativeRoot, status);
  return Object.freeze(files.sort());
}

type InnerKeepRuntimeFileObservation = Readonly<{
  bytes: number;
  sha256: string;
}>;

type InnerKeepRuntimeRegistryPreflight = Readonly<{
  staticSelection: unknown;
  populationSelection: unknown;
  rabbitSelection: unknown;
  observedPaths: readonly string[];
  inspectRuntimeFile: (relativePath: string) => InnerKeepRuntimeFileObservation;
}>;

export function inspectExactInnerKeepRuntimeFile(
  relativePath: string,
  filesystem: InnerKeepRuntimeFilesystem = INNER_KEEP_RUNTIME_FILESYSTEM,
): InnerKeepRuntimeFileObservation {
  const absolutePath = resolve(REPOSITORY_ROOT, relativePath);
  if (!absolutePath.startsWith(`${REPOSITORY_ROOT}${sep}`)) {
    fail('Inner Keep runtime registry path escaped the repository.');
  }
  let descriptor: number | undefined;
  try {
    descriptor = filesystem.open(
      absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = filesystem.fstat(descriptor);
    const pathBefore = filesystem.lstat(absolutePath);
    const canonicalBefore = filesystem.realpath(absolutePath);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || !pathBefore.isFile()
      || pathBefore.isSymbolicLink()
      || canonicalBefore !== absolutePath
      || !sameRuntimeNode(before, pathBefore)
    ) fail('Inner Keep runtime registry does not match the authorized selection.');
    const bytes = filesystem.readFile(descriptor);
    const after = filesystem.fstat(descriptor);
    const pathAfter = filesystem.lstat(absolutePath);
    const canonicalAfter = filesystem.realpath(absolutePath);
    if (
      !after.isFile()
      || after.isSymbolicLink()
      || !pathAfter.isFile()
      || pathAfter.isSymbolicLink()
      || canonicalAfter !== absolutePath
      || !sameRuntimeNode(before, after)
      || !sameRuntimeNode(after, pathAfter)
      || bytes.byteLength !== before.size
    ) fail('Inner Keep runtime registry does not match the authorized selection.');
    return Object.freeze({
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  } catch (error) {
    if (error instanceof InnerKeepOperatorError) throw error;
    return fail('Inner Keep runtime registry is incomplete.');
  } finally {
    if (descriptor !== undefined) filesystem.close(descriptor);
  }
}

export function verifyInnerKeepRuntimeRegistryPreflight(
  preflight: InnerKeepRuntimeRegistryPreflight,
): void {
  try {
    assertInnerKeepRuntimeUseAuthorized(preflight.staticSelection);
  } catch {
    fail(
      'Inner Keep activation is blocked: owner runtime-use authorization for the selected '
      + 'static asset registry is not recorded.',
    );
  }
  try {
    assertInnerKeepPopulationRuntimeUseAuthorized(preflight.populationSelection);
  } catch {
    fail(
      'Inner Keep activation is blocked: owner runtime-use authorization for the selected '
      + 'population asset registry is not recorded.',
    );
  }
  try {
    assertInnerKeepRabbitRuntimeUseAuthorized(preflight.rabbitSelection);
  } catch {
    fail(
      'Inner Keep activation is blocked: owner runtime-use authorization for the selected '
      + 'rabbit asset registry is not recorded.',
    );
  }
  const observedPaths = [...preflight.observedPaths].sort();
  if (
    observedPaths.length !== INNER_KEEP_AUTHORIZED_RUNTIME_PATHS.length
    || observedPaths.some((path, index) => path !== INNER_KEEP_AUTHORIZED_RUNTIME_PATHS[index])
  ) fail('Inner Keep runtime registry paths do not match all authorized selections.');
  for (const expected of INNER_KEEP_AUTHORIZED_RUNTIME_FILES) {
    const observed = preflight.inspectRuntimeFile(expected.destinationPath);
    if (
      observed.bytes !== expected.bytes
      || observed.sha256 !== expected.sha256
    ) fail('Inner Keep runtime registry does not match the authorized selection.');
  }
}

export function verifyAuthorizedInnerKeepRuntimeRegistry(): void {
  verifyInnerKeepRuntimeRegistryPreflight(Object.freeze({
    staticSelection: INNER_KEEP_ASSET_SELECTION,
    populationSelection: INNER_KEEP_POPULATION_SELECTION,
    rabbitSelection: INNER_KEEP_RABBIT_SELECTION,
    observedPaths: INNER_KEEP_RUNTIME_ROOTS.flatMap((root) => (
      collectInnerKeepRuntimeFiles(root)
    )),
    inspectRuntimeFile: inspectExactInnerKeepRuntimeFile,
  }));
}

function innerKeepRuntimeRegistryReady(): boolean {
  try {
    verifyAuthorizedInnerKeepRuntimeRegistry();
    return true;
  } catch {
    return false;
  }
}

export function attestInnerKeepActivationArtifacts(args: InnerKeepOperatorArguments): void {
  if (args.command !== 'activate-inner-keep') fail('Inner Keep activation attestation is unavailable.');
  let sourceCommit: string;
  let moduleDigest: string;
  let clientDigest: string;
  let clientRelease: string;
  try {
    sourceCommit = attestExactProtectedWorkerRolloutMain(REPOSITORY_ROOT);
    moduleDigest = digestExactArtifactFile(resolve(REPOSITORY_ROOT, 'spacetimedb/dist/bundle.js'));
    clientDigest = attestCanonicalClientArtifactDirectory(
      resolve(REPOSITORY_ROOT, 'dist'),
      sourceCommit,
    ).digest;
    clientRelease = readPackageRelease(resolve(REPOSITORY_ROOT, 'package.json'));
  } catch {
    fail('Inner Keep activation requires a clean exact protected main and fresh exact artifacts.');
  }
  if (
    sourceCommit !== args.sourceCommit
    || moduleDigest !== args.moduleArtifactDigest
    || clientDigest !== args.clientArtifactDigest
    || clientRelease !== args.clientRelease
  ) fail('Inner Keep activation artifact attestation changed before mutation.');
}

async function inspect(connection: DbConnection): Promise<InnerKeepStatus> {
  return projectInnerKeepStatus(await withOperationTimeout(
    connection.procedures.adminGetInnerKeepStatusV1({}),
  ));
}

function output(value: Readonly<Record<string, unknown>>): void {
  console.log(JSON.stringify(printableInnerKeepRecord(value)));
}

function mutationResult(
  command: MutationCommand,
  status: InnerKeepStatus,
  protectedStateProof: InnerKeepProtectedStateProof,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    command,
    mode: 'confirmed',
    ...innerKeepStaticAttestation(),
    ...status,
    protectedStateProof,
    dataDeletion: false,
    identifiersIncluded: false,
  });
}

export async function executeConnectedCommand(
  connection: DbConnection,
  args: InnerKeepOperatorArguments,
  readProtectedState?: () => Promise<InnerKeepProtectedStateSnapshot>,
): Promise<Readonly<Record<string, unknown>>> {
  if (args.command === 'inspect-inner-keep') return inspect(connection);
  if (args.command === 'plan-inner-keep-catalog') {
    return projectInnerKeepCatalogPlan(await withOperationTimeout(
      connection.procedures.adminPlanInnerKeepCatalogV1({}),
    ));
  }
  if (args.command === 'plan-inner-keep-builders') {
    return projectInnerKeepBuilderPlan(await withOperationTimeout(
      connection.procedures.adminPlanInnerKeepBuildersV1({}),
    ));
  }
  if (!isMutationCommand(args.command)) {
    fail('Inner Keep operator command is invalid.');
  }
  if (!args.confirmed) fail('Inner Keep mutations require explicit confirmation.');

  const command = args.command;
  const before = await inspect(connection);
  let submitMutation: () => Promise<void>;
  if (command === 'seed-inner-keep-catalog') {
    const plan = projectInnerKeepCatalogPlan(await withOperationTimeout(
      connection.procedures.adminPlanInnerKeepCatalogV1({}),
    ));
    assertCatalogPlanMatchesArguments(plan, args);
    submitMutation = async () => {
      if (plan.ready) return;
      await withOperationTimeout(connection.reducers.adminSeedInnerKeepCatalogV1({
        capability: innerKeepStaticAttestation().capability,
        policyDigest: innerKeepStaticAttestation().policyDigest,
        layoutDigest: innerKeepStaticAttestation().layoutDigest,
        assetCatalogDigest: innerKeepStaticAttestation().assetCatalogDigest,
        expectedMissingLayout: args.expectedMissingLayout!,
        expectedMissingSlots: args.expectedMissingSlots!,
        expectedMissingBuildings: args.expectedMissingBuildings!,
        expectedMissingLevels: args.expectedMissingLevels!,
      }));
    };
  } else if (command === 'backfill-inner-keep-builders') {
    const plan = projectInnerKeepBuilderPlan(await withOperationTimeout(
      connection.procedures.adminPlanInnerKeepBuildersV1({}),
    ));
    assertBuilderPlanMatchesArguments(plan, args);
    submitMutation = async () => {
      if (plan.ready) return;
      await withOperationTimeout(connection.reducers.adminBackfillInnerKeepBuildersV1({
        capability: innerKeepStaticAttestation().capability,
        policyDigest: innerKeepStaticAttestation().policyDigest,
        layoutDigest: innerKeepStaticAttestation().layoutDigest,
        assetCatalogDigest: innerKeepStaticAttestation().assetCatalogDigest,
        expectedCastles: args.expectedCastles!,
        expectedExistingBuilders: args.expectedExistingBuilders!,
        expectedMissingBuilders: args.expectedMissingBuilders!,
      }));
    };
  } else if (command === 'activate-inner-keep') {
    assertStatusMatchesMutationArguments(before, args);
    if (!before.readyForActivation || before.active) {
      fail('Inner Keep activation preflight is not ready.');
    }
    submitMutation = async () => {
      await withOperationTimeout(connection.reducers.adminActivateInnerKeepV1({
        capability: innerKeepStaticAttestation().capability,
        policyDigest: innerKeepStaticAttestation().policyDigest,
        layoutDigest: innerKeepStaticAttestation().layoutDigest,
        assetCatalogDigest: innerKeepStaticAttestation().assetCatalogDigest,
        clientRelease: args.clientRelease!,
        clientArtifactDigest: args.clientArtifactDigest!,
        moduleArtifactDigest: args.moduleArtifactDigest!,
        sourceCommit: args.sourceCommit!,
        expectedCastleCount: args.expectedCastles!,
      }));
    };
  } else {
    assertStatusMatchesMutationArguments(before, args);
    if (!before.active) fail('Inner Keep is already inactive; no deactivation was submitted.');
    submitMutation = async () => {
      await withOperationTimeout(connection.reducers.adminDeactivateInnerKeepV1(
        innerKeepDeactivationReducerArguments(args),
      ));
    };
  }

  if (readProtectedState === undefined) {
    fail('Inner Keep protected-state evidence is required before mutation.');
  }
  // Keep the private byte snapshots immediately around the reviewed
  // reducer/no-op boundary. Neither snapshot is ever included in output.
  const protectedBefore = await readProtectedState();
  await submitMutation();
  const protectedAfter = await readProtectedState();
  const protectedStateProof = verifyInnerKeepProtectedStatePreserved(
    protectedBefore,
    protectedAfter,
  );
  const after = await inspect(connection);
  verifyInnerKeepMutationPostcondition(command, before, after);
  return mutationResult(command, after, protectedStateProof);
}

async function main(): Promise<void> {
  // Stdout is a closed counts-only JSON contract. SDK notices must not mix
  // with it; all failures pass through the privacy-safe stderr boundary.
  setGlobalLogLevel('error');
  const args = parseInnerKeepOperatorArguments();
  const target = assertCanonicalInnerKeepTarget();

  if (!args.confirmed && (
    args.command === 'seed-inner-keep-catalog'
    || args.command === 'backfill-inner-keep-builders'
    || args.command === 'activate-inner-keep'
    || args.command === 'deactivate-inner-keep'
  )) {
    output(Object.freeze({
      ...createInnerKeepDryRunRecord(args),
      ...(args.command === 'activate-inner-keep' ? {
        runtimeAssetAuthorization: INNER_KEEP_ASSET_SELECTION.authorization.status,
        populationRuntimeAssetAuthorization:
          INNER_KEEP_POPULATION_SELECTION.authorization.status,
        rabbitRuntimeAssetAuthorization:
          INNER_KEEP_RABBIT_SELECTION.authorization.status,
        readyToConfirm: innerKeepRuntimeRegistryReady(),
      } : {}),
    }));
    return;
  }

  // This gate intentionally precedes all credential reads and network access.
  if (args.command === 'activate-inner-keep') {
    verifyAuthorizedInnerKeepRuntimeRegistry();
    attestInnerKeepActivationArtifacts(args);
  }

  const confirmedMutation = args.confirmed && (
    args.command === 'seed-inner-keep-catalog'
    || args.command === 'backfill-inner-keep-builders'
    || args.command === 'activate-inner-keep'
    || args.command === 'deactivate-inner-keep'
  );
  let protectedCli: ReturnType<typeof attestPinnedSpacetimeCli> | undefined;
  let privateSqlCredential: PrivateSqlCredential | undefined;
  let connection: DbConnection | undefined;
  try {
    if (confirmedMutation) {
      try {
        protectedCli = attestPinnedSpacetimeCli(
          process.env.SPACETIME_BIN ?? 'spacetime',
        );
      } catch {
        fail('Inner Keep protected-state evidence requires the exact reviewed SpacetimeDB CLI.');
      }
    }
    const secret = readAdminSecret(
      process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
      process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN,
    );
    const token = await requestAdminToken(target.bridge, secret);
    if (confirmedMutation) privateSqlCredential = createPrivateSqlCredential(token);
    connection = await connect(target.uri, target.database, token);
    const readProtectedState = protectedCli === undefined || privateSqlCredential === undefined
      ? undefined
      : protectedStateReader(
          protectedCli.path,
          privateSqlCredential,
          token,
          target,
        );
    output(await executeConnectedCommand(connection, args, readProtectedState));
  } finally {
    try {
      try { connection?.disconnect(); } catch { /* Keep the bounded operator boundary. */ }
    } finally {
      try {
        privateSqlCredential?.cleanup();
      } finally {
        protectedCli?.cleanup();
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof InnerKeepOperatorError
      ? error.message
      : privacySafeHermesErrorMessage(error));
    process.exitCode = 1;
  });
}
