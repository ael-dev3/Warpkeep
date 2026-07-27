import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  defaultSpacetimePublishReceiptDirectory,
  readPrivateSpacetimePublishSuccessReceipt,
} from './spacetime-publish-receipt.mjs';
import {
  canonicalWorkerReturnRepairTarget,
  defaultWorkerReturnRepairReceiptDirectory,
  executeWorkerReturnRepairCommand,
  parseWorkerReturnRepairArguments,
  withWorkerReturnRepairOperatorLock,
  WorkerReturnRepairOperatorError,
  WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
  writePrivateWorkerReturnRepairReceipt,
  type WorkerReturnRepairCommand,
  type WorkerReturnRepairEnvelope,
  type WorkerReturnRepairExecutionRecord,
  type WorkerReturnRepairLocalAttestation,
} from './worker-return-repair-operator-core';
import { digestExactArtifactFile } from './worker-rollout-operator-core';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_ORIGIN = 'https://github.com/ael-dev3/Warpkeep.git';
const GIT_COMMIT_HEX = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const MIN_ADMIN_SECRET_BYTES = 32;
const MAX_ADMIN_SECRET_BYTES = 512;
const MAX_ADMIN_STDIN_BYTES = MAX_ADMIN_SECRET_BYTES + 2;
const GIT_READ_TIMEOUT_MILLISECONDS = 15_000;

type GitReader = (args: readonly string[]) => string;

type WorkerReturnRepairRuntimeConnection = DbConnection;

function fail(code: string): never {
  throw new WorkerReturnRepairOperatorError(code);
}

export function readWorkerReturnRepairAdminSecret(
  env: Readonly<Record<string, string | undefined>>,
  descriptor = 0,
): string {
  if (env.WARPKEEP_ADMIN_TOKEN_SECRET !== undefined) {
    fail('WORKER_RETURN_REPAIR_ADMIN_SECRET_ENV_REJECTED');
  }
  if (env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN !== '1') {
    fail('WORKER_RETURN_REPAIR_ADMIN_SECRET_STDIN_REQUIRED');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  while (total <= MAX_ADMIN_STDIN_BYTES) {
    const chunk = Buffer.alloc(
      Math.min(128, MAX_ADMIN_STDIN_BYTES + 1 - total),
    );
    let bytesRead: number;
    try {
      bytesRead = readSync(
        descriptor,
        chunk,
        0,
        chunk.byteLength,
        null,
      );
    } catch {
      for (const buffered of chunks) buffered.fill(0);
      chunk.fill(0);
      fail('WORKER_RETURN_REPAIR_ADMIN_SECRET_STDIN_UNAVAILABLE');
    }
    if (bytesRead === 0) {
      chunk.fill(0);
      break;
    }
    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
  }

  if (total > MAX_ADMIN_STDIN_BYTES) {
    for (const chunk of chunks) chunk.fill(0);
    fail('WORKER_RETURN_REPAIR_ADMIN_SECRET_LENGTH_INVALID');
  }
  const framed = Buffer.concat(chunks, total);
  const trailing = framed.subarray(Math.max(0, framed.byteLength - 2));
  const newlineBytes = trailing.equals(Buffer.from('\r\n', 'ascii'))
    ? 2
    : framed.at(-1) === 0x0a ? 1 : 0;
  const bytes = framed.subarray(0, framed.byteLength - newlineBytes);
  if (
    bytes.byteLength < MIN_ADMIN_SECRET_BYTES
    || bytes.byteLength > MAX_ADMIN_SECRET_BYTES
  ) {
    framed.fill(0);
    for (const chunk of chunks) chunk.fill(0);
    fail('WORKER_RETURN_REPAIR_ADMIN_SECRET_LENGTH_INVALID');
  }

  let secret: string;
  try {
    secret = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    framed.fill(0);
    for (const chunk of chunks) chunk.fill(0);
    fail('WORKER_RETURN_REPAIR_ADMIN_SECRET_ENCODING_INVALID');
  }
  framed.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  if (/[\u0000-\u0020\u007f]/u.test(secret)) {
    secret = '';
    fail('WORKER_RETURN_REPAIR_ADMIN_SECRET_CONTROL_CHARACTER_REJECTED');
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

export function attestExactProtectedWorkerReturnRepairMain(
  repositoryRoot = REPOSITORY_ROOT,
  injectedGitReader?: GitReader,
): string {
  const readGit: GitReader = injectedGitReader ?? (args => (
    execFileSync(
      'git',
      [...args],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 1024 * 1024,
        timeout: GIT_READ_TIMEOUT_MILLISECONDS,
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
  let statusOutput: string;
  try {
    branchOutput = readGit([
      'symbolic-ref',
      '--quiet',
      '--short',
      'HEAD',
    ]);
    sourceCommitOutput = readGit([
      'rev-parse',
      '--verify',
      'HEAD^{commit}',
    ]);
    configuredOriginOutput = readGit([
      'config',
      '--local',
      '--get-all',
      'remote.origin.url',
    ]);
    resolvedOriginOutput = readGit([
      'remote',
      'get-url',
      '--all',
      'origin',
    ]);
    protectedMainOutput = readGit([
      'ls-remote',
      '--exit-code',
      'origin',
      'refs/heads/main',
    ]);
    statusOutput = readGit([
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ]);
  } catch {
    fail('WORKER_RETURN_REPAIR_GIT_ATTESTATION_UNAVAILABLE');
  }

  const branch = exactSingleLine(branchOutput);
  const sourceCommit = exactSingleLine(sourceCommitOutput);
  const configuredOrigin = exactSingleLine(configuredOriginOutput);
  const resolvedOrigin = exactSingleLine(resolvedOriginOutput);
  const protectedMain = protectedMainOutput.match(
    /^([0-9a-f]{40})\trefs\/heads\/main\n?$/,
  );
  if (
    branch !== 'main'
    || sourceCommit === undefined
    || !GIT_COMMIT_HEX.test(sourceCommit)
    || configuredOrigin !== CANONICAL_ORIGIN
    || resolvedOrigin !== CANONICAL_ORIGIN
    || protectedMain === null
    || protectedMain[1] !== sourceCommit
    || statusOutput !== ''
  ) fail('WORKER_RETURN_REPAIR_GIT_ATTESTATION_MISMATCH');
  return sourceCommit;
}

type MigrationProof = Readonly<{
  artifactDigest: string;
  v11TableSchemaDigest: string;
  v12TableSchemaDigest: string;
}>;

export function bindFreshWorkerReturnRepairMigrationProof(input: Readonly<{
  sourceCommit: string;
  runMigrationProof: () => MigrationProof;
  digestArtifact: () => string;
  attestSourceAfterProof: () => string;
  readPublicationReceipt: (
    artifactDigest: string,
  ) => Readonly<{
    artifactDigest: string;
    receiptDigest: string;
  }>;
}>): WorkerReturnRepairLocalAttestation {
  let proof: MigrationProof;
  try {
    proof = input.runMigrationProof();
  } catch {
    fail('WORKER_RETURN_REPAIR_FRESH_MIGRATION_PROOF_FAILED');
  }
  let moduleArtifactDigest: string;
  let sourceCommitAfterProof: string;
  let publicationReceipt: Readonly<{
    artifactDigest: string;
    receiptDigest: string;
  }>;
  try {
    moduleArtifactDigest = input.digestArtifact();
    sourceCommitAfterProof = input.attestSourceAfterProof();
    publicationReceipt = input.readPublicationReceipt(moduleArtifactDigest);
  } catch {
    fail('WORKER_RETURN_REPAIR_FRESH_MIGRATION_PROOF_UNAVAILABLE');
  }
  if (
    !GIT_COMMIT_HEX.test(input.sourceCommit)
    || !SHA256_HEX.test(moduleArtifactDigest)
    || proof.artifactDigest !== moduleArtifactDigest
    || sourceCommitAfterProof !== input.sourceCommit
    || publicationReceipt.artifactDigest !== moduleArtifactDigest
    || !SHA256_HEX.test(publicationReceipt.receiptDigest)
    || !SHA256_HEX.test(proof.v11TableSchemaDigest)
    || !SHA256_HEX.test(proof.v12TableSchemaDigest)
  ) fail('WORKER_RETURN_REPAIR_FRESH_MIGRATION_PROOF_MISMATCH');
  return Object.freeze({
    sourceCommit: input.sourceCommit,
    moduleArtifactDigest,
    publicationReceiptDigest: publicationReceipt.receiptDigest,
  });
}

export function prepareWorkerReturnRepairLocalAttestation(
  repositoryRoot = REPOSITORY_ROOT,
): WorkerReturnRepairLocalAttestation {
  const sourceCommit = attestExactProtectedWorkerReturnRepairMain(
    repositoryRoot,
  );
  const executable = attestPinnedSpacetimeCli(
    process.env.SPACETIME_BIN ?? 'spacetime',
  );
  try {
    return bindFreshWorkerReturnRepairMigrationProof({
      sourceCommit,
      runMigrationProof: () => runCurrentAdditiveMigrationProof(
        executable.path,
      ),
      digestArtifact: () => digestExactArtifactFile(resolve(
        repositoryRoot,
        'spacetimedb',
        'dist',
        'bundle.js',
      )),
      attestSourceAfterProof: () => (
        attestExactProtectedWorkerReturnRepairMain(repositoryRoot)
      ),
      readPublicationReceipt: artifactDigest => (
        readPrivateSpacetimePublishSuccessReceipt({
          directory:
            process.env.WARPKEEP_SPACETIME_PUBLISH_RECEIPT_DIR
            ?? defaultSpacetimePublishReceiptDirectory(),
          repositoryRoot,
          artifactDigest,
        })
      ),
    });
  } finally {
    executable.cleanup();
  }
}

export async function executeWorkerReturnRepairWithSingleAdminToken(
  input: Readonly<{
    command: WorkerReturnRepairCommand;
    confirmed: boolean;
    prepareLocalAttestation: (
      command: 'apply',
    ) => Promise<WorkerReturnRepairLocalAttestation>;
    requestToken: () => Promise<string>;
    inspect: (token: string) => Promise<unknown>;
    submit: (
      token: string,
      envelope: WorkerReturnRepairEnvelope,
    ) => Promise<void>;
  }>,
): Promise<WorkerReturnRepairExecutionRecord> {
  let localAttestation: WorkerReturnRepairLocalAttestation | undefined;
  if (input.command === 'apply') {
    try {
      localAttestation = await input.prepareLocalAttestation(input.command);
    } catch {
      const reasonCode = 'WORKER_RETURN_REPAIR_LOCAL_PROOF_UNAVAILABLE';
      throw new WorkerReturnRepairOperatorError(reasonCode, Object.freeze({
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
    const reasonCode = 'WORKER_RETURN_REPAIR_ADMIN_AUTHORITY_UNAVAILABLE';
    throw new WorkerReturnRepairOperatorError(reasonCode, Object.freeze({
      command: input.command,
      outcome: 'blocked',
      submitted: false,
      reasonCode,
    }));
  }

  try {
    return await executeWorkerReturnRepairCommand({
      command: input.command,
      confirmed: input.confirmed,
      localAttestation,
      inspect: () => input.inspect(token),
      submit: envelope => input.submit(token, envelope),
    });
  } finally {
    token = '';
  }
}

async function withFreshConnection<T>(
  uri: string,
  database: string,
  token: string,
  operation: (
    connection: WorkerReturnRepairRuntimeConnection,
  ) => Promise<T>,
): Promise<T> {
  let connection: DbConnection | undefined;
  try {
    connection = await connect(uri, database, token);
    return await operation(
      connection as WorkerReturnRepairRuntimeConnection,
    );
  } finally {
    try {
      connection?.disconnect();
    } catch {
      // Keep the short-lived connection boundary closed.
    }
  }
}

function publicSummary(record: WorkerReturnRepairExecutionRecord) {
  const status = record.after ?? record.before;
  return Object.freeze({
    command: record.command,
    outcome: record.outcome,
    submitted: record.submitted,
    ...(status === undefined
      ? {}
      : {
          mode: status.mode,
          workers: Object.freeze({
            idle: status.idleWorkers.toString(),
            outbound: status.outboundWorkers.toString(),
            gathering: status.gatheringWorkers.toString(),
            returning: status.returningWorkers.toString(),
          }),
          lifecycle: Object.freeze({
            assignments: status.assignments.toString(),
            occupations: status.occupations.toString(),
            schedules: status.schedules.toString(),
            missingSchedules:
              status.assignmentsWithoutSingleSchedule.toString(),
          }),
        }),
  });
}

export function workerReturnRepairIntentRecord(
  envelope: WorkerReturnRepairEnvelope,
): WorkerReturnRepairExecutionRecord {
  return Object.freeze({
    command: 'apply',
    outcome: 'intent-recorded',
    submitted: false,
    reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
    envelope,
  });
}

export async function submitWorkerReturnRepairWithIntent(input: Readonly<{
  envelope: WorkerReturnRepairEnvelope;
  writeIntent: (record: WorkerReturnRepairExecutionRecord) => void;
  submit: () => Promise<void>;
}>): Promise<void> {
  input.writeIntent(workerReturnRepairIntentRecord(input.envelope));
  await input.submit();
}

async function main() {
  const parsed = parseWorkerReturnRepairArguments(process.argv.slice(2));
  const target = canonicalWorkerReturnRepairTarget(process.env);
  const receiptDirectory =
    process.env.WARPKEEP_WORKER_RETURN_REPAIR_RECEIPT_DIR
    ?? defaultWorkerReturnRepairReceiptDirectory();
  let secret = readWorkerReturnRepairAdminSecret(process.env);
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN;

  try {
    await withWorkerReturnRepairOperatorLock(
      receiptDirectory,
      REPOSITORY_ROOT,
      async () => {
        const inspect = (token: string) => withFreshConnection(
          target.uri,
          target.database,
          token,
          connection => withOperationTimeout(
            connection.procedures.adminGetWorkerSystemStatusV1({}),
          ),
        );
        const submit = (
          token: string,
          envelope: WorkerReturnRepairEnvelope,
        ) => submitWorkerReturnRepairWithIntent({
          envelope,
          writeIntent: record => {
            writePrivateWorkerReturnRepairReceipt({
              directory: receiptDirectory,
              repositoryRoot: REPOSITORY_ROOT,
              record,
            });
          },
          submit: () => withFreshConnection(
            target.uri,
            target.database,
            token,
            connection => withOperationTimeout(
              connection.reducers
                .adminRepairMissingWorkerReturnScheduleV1(envelope),
            ),
          ),
        });

        try {
          const record =
            await executeWorkerReturnRepairWithSingleAdminToken({
              command: parsed.command,
              confirmed: parsed.confirmed,
              prepareLocalAttestation: async () => (
                prepareWorkerReturnRepairLocalAttestation()
              ),
              requestToken: () => requestAdminToken(target.bridge, secret),
              inspect,
              submit,
            });
          const receipt = writePrivateWorkerReturnRepairReceipt({
            directory: receiptDirectory,
            repositoryRoot: REPOSITORY_ROOT,
            record,
          });
          console.log(JSON.stringify({
            ...publicSummary(record),
            receiptDigest: receipt.digest,
          }));
        } catch (error) {
          if (
            error instanceof WorkerReturnRepairOperatorError
            && error.record !== undefined
          ) {
            writePrivateWorkerReturnRepairReceipt({
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

if (
  process.argv[1]
  && existsSync(process.argv[1])
  && import.meta.url
    === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(
      error instanceof WorkerReturnRepairOperatorError
        ? error.code
        : 'WORKER_RETURN_REPAIR_COMMAND_FAILED',
    );
    process.exitCode = 1;
  });
}
