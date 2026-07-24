import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DbConnection } from '../src/spacetime/module_bindings';
import {
  connect,
  requestAdminToken,
  withOperationTimeout,
} from './hermes-admin';
import {
  attestPinnedSpacetimeCli,
  runCurrentAdditiveMigrationProof,
} from './publish-spacetime-dev.mjs';
import {
  attestCanonicalClientArtifactDirectory,
  canonicalWorkerRolloutTarget,
  defaultWorkerRolloutReceiptDirectory,
  digestCanonicalArtifactDirectory,
  digestExactArtifactFile,
  executeWorkerRolloutCommand,
  parseWorkerRolloutArguments,
  readPackageRelease,
  withWorkerRolloutOperatorLock,
  WorkerRolloutOperatorError,
  writePrivateWorkerRolloutActivationBuildProof,
  writePrivateWorkerRolloutMigrationProof,
  writePrivateWorkerRolloutReceipt,
  type WorkerRolloutCommand,
  type WorkerRolloutExecutionRecord,
  type WorkerRolloutLocalAttestation,
  type WorkerRolloutMutationCommand,
  type WorkerRolloutReducer,
  type WorkerRolloutReducerEnvelope,
} from './worker-rollout-operator-core';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ADMIN_SECRET_BYTES = 512;
const MAX_ADMIN_STDIN_BYTES = MAX_ADMIN_SECRET_BYTES + 2;
const MIN_ADMIN_SECRET_BYTES = 32;
const GIT_COMMIT_HEX = /^[0-9a-f]{40}$/;
const WORKER_ROLLOUT_CANONICAL_ORIGIN_URL =
  'https://github.com/ael-dev3/Warpkeep.git';
const WORKER_ROLLOUT_GIT_READ_TIMEOUT_MILLISECONDS = 15_000;
const WORKER_ROLLOUT_BUILD_TIMEOUT_MILLISECONDS = 10 * 60 * 1_000;
const WORKER_ROLLOUT_NPM_VERSION = '10.9.8';
const WORKER_ROLLOUT_PAGES_ENV_FILES = Object.freeze([
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.npmrc',
]);
const WORKER_ROLLOUT_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CACHE_HOME',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'LANG',
  'LC_ALL',
]);

type WorkerRolloutGitReader = (args: readonly string[]) => string;
type WorkerRolloutPagesBuildPhase = 'validate' | 'build';
type WorkerRolloutPagesBuildRunner = (
  phase: WorkerRolloutPagesBuildPhase,
  environment: Readonly<Record<string, string>>,
) => void;

type WorkerRolloutRuntimeConnection = DbConnection & Readonly<{
  procedures: Readonly<{
    adminGetWorkerRolloutStatusV2: (args: Readonly<Record<never, never>>) => Promise<unknown>;
  }>;
  reducers: Readonly<Record<string, (args: unknown) => Promise<void>>>;
}>;

function fail(code: string): never {
  throw new WorkerRolloutOperatorError(code);
}

export function readWorkerRolloutAdminSecret(
  env: Readonly<Record<string, string | undefined>>,
  descriptor = 0,
): string {
  if (env.WARPKEEP_ADMIN_TOKEN_SECRET !== undefined) {
    fail('WORKER_ROLLOUT_ADMIN_SECRET_ENV_REJECTED');
  }
  if (env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN !== '1') {
    fail('WORKER_ROLLOUT_ADMIN_SECRET_STDIN_REQUIRED');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  while (total <= MAX_ADMIN_STDIN_BYTES) {
    const chunk = Buffer.alloc(Math.min(128, MAX_ADMIN_STDIN_BYTES + 1 - total));
    let read: number;
    try {
      read = readSync(descriptor, chunk, 0, chunk.byteLength, null);
    } catch {
      fail('WORKER_ROLLOUT_ADMIN_SECRET_STDIN_UNAVAILABLE');
    }
    if (read === 0) break;
    chunks.push(chunk.subarray(0, read));
    total += read;
  }
  if (total > MAX_ADMIN_STDIN_BYTES) {
    fail('WORKER_ROLLOUT_ADMIN_SECRET_LENGTH_INVALID');
  }
  const framed = Buffer.concat(chunks, total);
  const trailingBytes = framed.subarray(Math.max(0, framed.byteLength - 2));
  const newlineBytes = trailingBytes.equals(Buffer.from('\r\n', 'ascii'))
    ? 2
    : framed.at(-1) === 0x0a ? 1 : 0;
  const bytes = framed.subarray(0, framed.byteLength - newlineBytes);
  if (
    bytes.byteLength < MIN_ADMIN_SECRET_BYTES
    || bytes.byteLength > MAX_ADMIN_SECRET_BYTES
  ) {
    framed.fill(0);
    for (const chunk of chunks) chunk.fill(0);
    fail('WORKER_ROLLOUT_ADMIN_SECRET_LENGTH_INVALID');
  }
  let secret: string;
  try {
    secret = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    framed.fill(0);
    for (const chunk of chunks) chunk.fill(0);
    fail('WORKER_ROLLOUT_ADMIN_SECRET_ENCODING_INVALID');
  }
  framed.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  if (/[\u0000-\u0020\u007f]/u.test(secret)) {
    fail('WORKER_ROLLOUT_ADMIN_SECRET_CONTROL_CHARACTER_REJECTED');
  }
  return secret;
}

function exactSingleLine(output: string): string | undefined {
  const withoutFinalNewline = output.endsWith('\n')
    ? output.slice(0, -1)
    : output;
  return withoutFinalNewline.length > 0
    && !withoutFinalNewline.includes('\n')
    && !withoutFinalNewline.includes('\r')
    ? withoutFinalNewline
    : undefined;
}

export function attestExactProtectedWorkerRolloutMain(
  repositoryRoot = REPOSITORY_ROOT,
  injectedGitReader?: WorkerRolloutGitReader,
): string {
  const readGit: WorkerRolloutGitReader = injectedGitReader ?? (args => (
    execFileSync(
      'git',
      [...args],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 1024 * 1024,
        timeout: WORKER_ROLLOUT_GIT_READ_TIMEOUT_MILLISECONDS,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          GCM_INTERACTIVE: 'Never',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
        },
      },
    )
  ));
  let branchOutput: string;
  let sourceCommitOutput: string;
  let configuredOriginOutput: string;
  let resolvedOriginOutput: string;
  let protectedMainOutput: string;
  let status: string;
  try {
    branchOutput = readGit(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    sourceCommitOutput = readGit(['rev-parse', '--verify', 'HEAD^{commit}']);
    configuredOriginOutput = readGit([
      'config',
      '--local',
      '--get-all',
      'remote.origin.url',
    ]);
    resolvedOriginOutput = readGit(['remote', 'get-url', '--all', 'origin']);
    protectedMainOutput = readGit([
      'ls-remote',
      '--exit-code',
      'origin',
      'refs/heads/main',
    ]);
    status = readGit(['status', '--porcelain=v1', '--untracked-files=all']);
  } catch {
    fail('WORKER_ROLLOUT_GIT_ATTESTATION_UNAVAILABLE');
  }
  const branch = exactSingleLine(branchOutput);
  const sourceCommit = exactSingleLine(sourceCommitOutput);
  const configuredOrigin = exactSingleLine(configuredOriginOutput);
  const resolvedOrigin = exactSingleLine(resolvedOriginOutput);
  const protectedMainMatch = protectedMainOutput.match(
    /^([0-9a-f]{40})\trefs\/heads\/main\n?$/,
  );
  if (
    branch !== 'main'
    || sourceCommit === undefined
    || !GIT_COMMIT_HEX.test(sourceCommit)
    || configuredOrigin !== WORKER_ROLLOUT_CANONICAL_ORIGIN_URL
    || resolvedOrigin !== WORKER_ROLLOUT_CANONICAL_ORIGIN_URL
    || protectedMainMatch === null
    || protectedMainMatch[1] !== sourceCommit
    || status !== ''
  ) fail('WORKER_ROLLOUT_GIT_ATTESTATION_MISMATCH');
  return sourceCommit;
}

type WorkerRolloutMigrationProofReceipt = Readonly<{
  artifactDigest: string;
  v11TableSchemaDigest: string;
  v12TableSchemaDigest: string;
}>;

export function bindFreshCompleteDrainMigrationProof(input: Readonly<{
  sourceCommit: string;
  receiptDirectory: string;
  repositoryRoot?: string;
  artifactPath?: string;
  runMigrationProof: () => WorkerRolloutMigrationProofReceipt;
  attestSourceAfterProof?: () => string;
}>): Readonly<{ moduleArtifactDigest: string }> {
  const repositoryRoot = input.repositoryRoot ?? REPOSITORY_ROOT;
  let migrationProof: WorkerRolloutMigrationProofReceipt;
  try {
    migrationProof = input.runMigrationProof();
  } catch {
    fail('WORKER_ROLLOUT_FRESH_MIGRATION_PROOF_FAILED');
  }
  const sourceCommitAfterProof = input.attestSourceAfterProof?.()
    ?? attestExactProtectedWorkerRolloutMain(repositoryRoot);
  const moduleArtifactDigest = digestExactArtifactFile(
    input.artifactPath
      ?? resolve(repositoryRoot, 'spacetimedb', 'dist', 'bundle.js'),
  );
  if (
    !GIT_COMMIT_HEX.test(input.sourceCommit)
    || sourceCommitAfterProof !== input.sourceCommit
    || migrationProof.artifactDigest !== moduleArtifactDigest
  ) fail('WORKER_ROLLOUT_FRESH_MIGRATION_PROOF_MISMATCH');
  writePrivateWorkerRolloutMigrationProof({
    directory: input.receiptDirectory,
    repositoryRoot,
    sourceCommit: input.sourceCommit,
    moduleArtifactDigest,
    v11TableSchemaDigest: migrationProof.v11TableSchemaDigest,
    v12TableSchemaDigest: migrationProof.v12TableSchemaDigest,
  });
  return Object.freeze({ moduleArtifactDigest });
}

function canonicalPagesBuildConfiguration(sourceCommit: string) {
  if (!GIT_COMMIT_HEX.test(sourceCommit)) {
    fail('WORKER_ROLLOUT_ACTIVATION_BUILD_SOURCE_INVALID');
  }
  return Object.freeze({
    CI: 'true',
    DEPLOY_BASE: '/',
    GITHUB_PAGES: 'true',
    VITE_WARPKEEP_RELEASE_CHANNEL: 'alpha',
    VITE_WARPKEEP_BUILD_SHA: sourceCommit,
    VITE_WARPKEEP_REPOSITORY_URL:
      'https://github.com/ael-dev3/Warpkeep',
    VITE_WARPKEEP_CANONICAL_ORIGIN: 'https://warpkeep.com',
    VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
    VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
    VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
    VITE_WARPKEEP_OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    VITE_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    VITE_SPACETIMEDB_DATABASE:
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  });
}

function canonicalPagesBuildEnvironment(
  sourceCommit: string,
  source: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string>> {
  const environment = Object.fromEntries(
    WORKER_ROLLOUT_CHILD_ENVIRONMENT_KEYS
      .filter(key => typeof source[key] === 'string' && source[key]!.length > 0)
      .map(key => [key, source[key]!] as const),
  );
  if (environment.PATH === undefined) {
    fail('WORKER_ROLLOUT_ACTIVATION_BUILD_ENVIRONMENT_INVALID');
  }
  return Object.freeze({
    ...environment,
    ...canonicalPagesBuildConfiguration(sourceCommit),
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NPM_CONFIG_USERCONFIG: '/dev/null',
  });
}

function pagesConfigurationDigest(sourceCommit: string): string {
  const entries = Object.entries(canonicalPagesBuildConfiguration(sourceCommit))
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256')
    .update(JSON.stringify(entries), 'utf8')
    .digest('hex');
}

function exactNpmCliPath(
  environment: Readonly<Record<string, string>>,
): string {
  const configured = process.env.npm_execpath;
  let executable: string;
  try {
    if (
      typeof configured !== 'string'
      || !isAbsolute(configured)
      || basename(configured) !== 'npm-cli.js'
    ) fail('WORKER_ROLLOUT_ACTIVATION_BUILD_TOOL_UNAVAILABLE');
    executable = realpathSync(configured);
    const status = lstatSync(executable);
    if (!status.isFile() || basename(executable) !== 'npm-cli.js') {
      fail('WORKER_ROLLOUT_ACTIVATION_BUILD_TOOL_UNAVAILABLE');
    }
    const version = execFileSync(
      process.execPath,
      [executable, '--version'],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: environment,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10_000,
        killSignal: 'SIGKILL',
        maxBuffer: 4_096,
      },
    );
    if (version !== `${WORKER_ROLLOUT_NPM_VERSION}\n`) {
      fail('WORKER_ROLLOUT_ACTIVATION_BUILD_TOOL_MISMATCH');
    }
  } catch (error) {
    if (error instanceof WorkerRolloutOperatorError) throw error;
    fail('WORKER_ROLLOUT_ACTIVATION_BUILD_TOOL_UNAVAILABLE');
  }
  return executable;
}

function canonicalPagesBuildRunner(): WorkerRolloutPagesBuildRunner {
  return (phase, environment) => {
    const npmCli = phase === 'build'
      ? exactNpmCliPath(environment)
      : undefined;
    try {
      execFileSync(
        process.execPath,
        phase === 'validate'
          ? ['scripts/validate-pages-deploy-config.mjs']
          : [npmCli!, 'run', 'build', '--silent'],
        {
          cwd: REPOSITORY_ROOT,
          env: environment,
          stdio: ['ignore', 'ignore', 'ignore'],
          timeout: phase === 'validate'
            ? 30_000
            : WORKER_ROLLOUT_BUILD_TIMEOUT_MILLISECONDS,
          killSignal: 'SIGKILL',
          maxBuffer: 16 * 1024 * 1024,
        },
      );
    } catch (error) {
      if (error instanceof WorkerRolloutOperatorError) throw error;
      fail(`WORKER_ROLLOUT_ACTIVATION_${phase.toUpperCase()}_FAILED`);
    }
  };
}

export function bindFreshActivationPagesBuildProof(input: Readonly<{
  sourceCommit: string;
  receiptDirectory: string;
  repositoryRoot?: string;
  artifactDirectory?: string;
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  runPagesBuild?: WorkerRolloutPagesBuildRunner;
  attestSourceAfterBuild?: () => string;
}>): Readonly<{
  clientRelease: string;
  clientArtifactDigest: string;
}> {
  const requestedRepositoryRoot = resolve(
    input.repositoryRoot ?? REPOSITORY_ROOT,
  );
  let repositoryRoot: string;
  try {
    const repositoryStatus = lstatSync(requestedRepositoryRoot);
    repositoryRoot = realpathSync(requestedRepositoryRoot);
    if (
      !repositoryStatus.isDirectory()
      || repositoryStatus.isSymbolicLink()
      || repositoryRoot !== requestedRepositoryRoot
    ) fail('WORKER_ROLLOUT_ACTIVATION_ARTIFACT_DIRECTORY_INVALID');
  } catch (error) {
    if (error instanceof WorkerRolloutOperatorError) throw error;
    fail('WORKER_ROLLOUT_ACTIVATION_ARTIFACT_DIRECTORY_INVALID');
  }
  const exactArtifactDirectory = resolve(repositoryRoot, 'dist');
  const artifactDirectory = resolve(
    input.artifactDirectory ?? exactArtifactDirectory,
  );
  if (
    artifactDirectory !== exactArtifactDirectory
    || artifactDirectory === repositoryRoot
    || !artifactDirectory.startsWith(`${repositoryRoot}${sep}`)
  ) fail('WORKER_ROLLOUT_ACTIVATION_ARTIFACT_DIRECTORY_INVALID');
  try {
    const artifactStatus = lstatSync(artifactDirectory);
    if (!artifactStatus.isDirectory() || artifactStatus.isSymbolicLink()) {
      fail('WORKER_ROLLOUT_ACTIVATION_ARTIFACT_DIRECTORY_INVALID');
    }
  } catch (error) {
    if (error instanceof WorkerRolloutOperatorError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      fail('WORKER_ROLLOUT_ACTIVATION_ARTIFACT_DIRECTORY_INVALID');
    }
  }
  if (!GIT_COMMIT_HEX.test(input.sourceCommit)) {
    fail('WORKER_ROLLOUT_ACTIVATION_BUILD_SOURCE_INVALID');
  }
  if (WORKER_ROLLOUT_PAGES_ENV_FILES.some(name => (
    existsSync(resolve(repositoryRoot, name))
  ))) fail('WORKER_ROLLOUT_ACTIVATION_BUILD_LOCAL_CONFIG_REJECTED');
  const environment = canonicalPagesBuildEnvironment(
    input.sourceCommit,
    input.sourceEnvironment,
  );
  try {
    rmSync(artifactDirectory, { recursive: true, force: true });
    const runPagesBuild = input.runPagesBuild ?? canonicalPagesBuildRunner();
    runPagesBuild('validate', environment);
    runPagesBuild('build', environment);
  } catch (error) {
    if (error instanceof WorkerRolloutOperatorError) throw error;
    fail('WORKER_ROLLOUT_ACTIVATION_BUILD_FAILED');
  }
  const artifact = attestCanonicalClientArtifactDirectory(
    artifactDirectory,
    input.sourceCommit,
  );
  const sourceCommitAfterBuild = input.attestSourceAfterBuild?.()
    ?? attestExactProtectedWorkerRolloutMain(repositoryRoot);
  const artifactAfterSourceAttestation =
    digestCanonicalArtifactDirectory(artifactDirectory);
  if (
    sourceCommitAfterBuild !== input.sourceCommit
    || artifactAfterSourceAttestation.digest !== artifact.digest
  ) fail('WORKER_ROLLOUT_ACTIVATION_BUILD_PROOF_MISMATCH');
  const clientRelease = readPackageRelease(
    resolve(repositoryRoot, 'package.json'),
  );
  writePrivateWorkerRolloutActivationBuildProof({
    directory: input.receiptDirectory,
    repositoryRoot,
    sourceCommit: input.sourceCommit,
    clientRelease,
    clientArtifactDigest: artifact.digest,
    pagesConfigurationDigest: pagesConfigurationDigest(input.sourceCommit),
  });
  return Object.freeze({
    clientRelease,
    clientArtifactDigest: artifact.digest,
  });
}

async function prepareLocalAttestation(
  command: WorkerRolloutMutationCommand,
  receiptDirectory: string,
): Promise<WorkerRolloutLocalAttestation | undefined> {
  const sourceCommit = attestExactProtectedWorkerRolloutMain();
  if (command !== 'complete-drain' && command !== 'activate') {
    return Object.freeze({ sourceCommit });
  }
  if (command === 'complete-drain') {
    const executableSnapshot = attestPinnedSpacetimeCli(
      process.env.SPACETIME_BIN ?? 'spacetime',
    );
    let moduleArtifactDigest: string;
    try {
      ({ moduleArtifactDigest } = bindFreshCompleteDrainMigrationProof({
        sourceCommit,
        receiptDirectory,
        runMigrationProof: () => runCurrentAdditiveMigrationProof(
          executableSnapshot.path,
        ),
      }));
    } finally {
      executableSnapshot.cleanup();
    }
    return Object.freeze({
      sourceCommit,
      moduleArtifactDigest,
    });
  }
  const artifact = bindFreshActivationPagesBuildProof({
    sourceCommit,
    receiptDirectory,
  });
  return Object.freeze({
    sourceCommit,
    clientRelease: artifact.clientRelease,
    clientArtifactDigest: artifact.clientArtifactDigest,
  });
}

export async function executeWorkerRolloutWithSingleAdminToken(
  input: Readonly<{
    command: WorkerRolloutCommand;
    confirmed: boolean;
    prepareLocalAttestation: (
      command: WorkerRolloutMutationCommand,
    ) => Promise<WorkerRolloutLocalAttestation | undefined>;
    requestToken: () => Promise<string>;
    inspect: (token: string) => Promise<unknown>;
    submit: (
      token: string,
      reducer: WorkerRolloutReducer,
      envelope: WorkerRolloutReducerEnvelope,
    ) => Promise<void>;
  }>,
): Promise<WorkerRolloutExecutionRecord> {
  let localAttestation: WorkerRolloutLocalAttestation | undefined;
  if (input.command !== 'inspect') {
    try {
      localAttestation = await input.prepareLocalAttestation(input.command);
    } catch {
      const reasonCode = 'WORKER_ROLLOUT_LOCAL_PROOF_UNAVAILABLE';
      throw new WorkerRolloutOperatorError(reasonCode, Object.freeze({
        command: input.command,
        outcome: 'blocked',
        submitted: false,
        reasonCode,
      }));
    }
  }
  let token: string;
  try {
    token = await input.requestToken();
  } catch {
    const reasonCode = 'WORKER_ROLLOUT_ADMIN_AUTHORITY_UNAVAILABLE';
    throw new WorkerRolloutOperatorError(reasonCode, Object.freeze({
      command: input.command,
      outcome: 'blocked',
      submitted: false,
      reasonCode,
    }));
  }
  try {
    return await executeWorkerRolloutCommand({
      command: input.command,
      confirmed: input.confirmed,
      localAttestation,
      inspect: () => input.inspect(token),
      submit: (reducer, envelope) => input.submit(
        token,
        reducer,
        envelope,
      ),
    });
  } finally {
    token = '';
  }
}

async function withFreshConnection<T>(
  uri: string,
  database: string,
  token: string,
  operation: (connection: WorkerRolloutRuntimeConnection) => Promise<T>,
): Promise<T> {
  let connection: DbConnection | undefined;
  try {
    connection = await connect(uri, database, token);
    return await operation(connection as WorkerRolloutRuntimeConnection);
  } finally {
    try { connection?.disconnect(); } catch { /* Keep the operator boundary closed. */ }
  }
}

async function main() {
  const parsed = parseWorkerRolloutArguments(process.argv.slice(2));
  const target = canonicalWorkerRolloutTarget(process.env);
  const receiptDirectory = process.env.WARPKEEP_WORKER_ROLLOUT_RECEIPT_DIR
    ?? defaultWorkerRolloutReceiptDirectory();
  const operatorLockDirectory = defaultWorkerRolloutReceiptDirectory();
  let secret = readWorkerRolloutAdminSecret(process.env);
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN;
  try {
    await withWorkerRolloutOperatorLock(
      operatorLockDirectory,
      REPOSITORY_ROOT,
      async () => {
        const inspect = (token: string) => withFreshConnection(
          target.uri,
          target.database,
          token,
          connection => withOperationTimeout(
            connection.procedures.adminGetWorkerRolloutStatusV2({}),
          ),
        );
        const submit = (
          token: string,
          reducer: WorkerRolloutReducer,
          envelope: WorkerRolloutReducerEnvelope,
        ) => withFreshConnection(
          target.uri,
          target.database,
          token,
          connection => {
            const methodName = Object.freeze({
              admin_stage_worker_system_v1: 'adminStageWorkerSystemV1',
              admin_backfill_worker_roster_v1: 'adminBackfillWorkerRosterV1',
              admin_begin_worker_legacy_drain_v1: 'adminBeginWorkerLegacyDrainV1',
              admin_complete_worker_legacy_drain_v1:
                'adminCompleteWorkerLegacyDrainV1',
              admin_activate_worker_system_v1: 'adminActivateWorkerSystemV1',
            })[reducer];
            const method = (
              connection.reducers as unknown as Readonly<
                Record<
                  string,
                  (args: WorkerRolloutReducerEnvelope) => Promise<void>
                >
              >
            )[methodName];
            if (typeof method !== 'function') {
              fail('WORKER_ROLLOUT_REDUCER_BINDING_UNAVAILABLE');
            }
            return withOperationTimeout(method(envelope));
          },
        );

        try {
          const record = await executeWorkerRolloutWithSingleAdminToken({
            command: parsed.command,
            confirmed: parsed.confirmed,
            inspect,
            submit,
            prepareLocalAttestation: command => prepareLocalAttestation(
              command,
              receiptDirectory,
            ),
            requestToken: () => requestAdminToken(target.bridge, secret),
          });
          const receipt = writePrivateWorkerRolloutReceipt({
            directory: receiptDirectory,
            repositoryRoot: REPOSITORY_ROOT,
            record,
          });
          console.log(JSON.stringify({
            command: record.command,
            outcome: record.outcome,
            submitted: record.submitted,
            phase: record.after?.phase ?? record.before?.phase,
            receiptDigest: receipt.digest,
          }));
        } catch (error) {
          if (error instanceof WorkerRolloutOperatorError && error.record) {
            writePrivateWorkerRolloutReceipt({
              directory: receiptDirectory,
              repositoryRoot: REPOSITORY_ROOT,
              record: error.record,
            });
          }
          throw error;
        }
      },
    );
  } finally {
    secret = '';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof WorkerRolloutOperatorError
      ? error.code
      : 'WORKER_ROLLOUT_COMMAND_FAILED');
    process.exitCode = 1;
  });
}
