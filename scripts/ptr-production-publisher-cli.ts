import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  executePtrProductionPublish,
  preparePtrSourceBuiltArtifact,
  ptrProductionPublishConfirmationDigest,
  ptrProductionPublishReceiptDigest,
  PtrProductionPublisherError,
} from './ptr-production-publisher.mjs';
import {
  PtrProductionAdminTokenError,
  takePtrProductionAdminSecret,
} from './ptr-production-admin-token';
import {
  verifyPtrFreshPublishStatus,
  PtrProductionReleaseReceiptError,
} from './ptr-production-release-receipts';
import {
  writePrivatePtrProductionReceipt,
  PtrProductionReceiptFileError,
} from './ptr-production-receipt-file';
import {
  createPtrProductionTransport,
  PtrProductionTransportError,
} from './ptr-production-transport';
import {
  attestGreaterRealmProductionProtectedMain,
} from './greater-realm-production-provenance';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const SHA256 = /^[0-9a-f]{64}$/u;

export class PtrProductionPublisherCliError extends Error {
  constructor(readonly code: string, readonly publishAttempted = false) {
    super(code);
    this.name = 'PtrProductionPublisherCliError';
  }
}

function fail(code: string, publishAttempted = false): never {
  throw new PtrProductionPublisherCliError(code, publishAttempted);
}

export function parsePtrProductionPublisherArguments(
  values: readonly string[],
): Readonly<{
  command: 'inspect' | 'publish';
  confirmationDigest?: string;
}> {
  if (values.length === 1 && values[0] === 'inspect') {
    return Object.freeze({ command: 'inspect' });
  }
  const confirmation = values.length === 2
    ? /^--confirm=([0-9a-f]{64})$/u.exec(values[1]!)
    : null;
  if (values[0] !== 'publish' || confirmation === null) {
    fail('PTR_PRODUCTION_PUBLISH_USAGE_INVALID');
  }
  return Object.freeze({
    command: 'publish',
    confirmationDigest: confirmation[1]!,
  });
}

function localEnvironment(
  environment: NodeJS.ProcessEnv,
): Readonly<{
  dependencyCacheRoot: string;
  cliConfigSourcePath: string;
  receiptDirectory: string;
  genesis002DatabaseIdentity: string;
  materializationParent?: string;
  executable: string;
}> {
  const dependencyCacheRoot = environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  const cliConfigSourcePath = environment.WARPKEEP_SPACETIME_CLI_CONFIG_PATH;
  const receiptDirectory = environment.WARPKEEP_PTR_RECEIPT_DIRECTORY;
  const genesis002DatabaseIdentity =
    environment.WARPKEEP_GENESIS_002_SPACETIMEDB_DATABASE;
  const materializationParent = environment.WK_PTR_MATERIALIZATION_PARENT;
  const executable = environment.WARPKEEP_SPACETIME_EXECUTABLE
    ?? environment.SPACETIME_BIN
    ?? 'spacetime';
  delete environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  delete environment.WARPKEEP_SPACETIME_CLI_CONFIG_PATH;
  delete environment.WARPKEEP_PTR_RECEIPT_DIRECTORY;
  delete environment.WARPKEEP_GENESIS_002_SPACETIMEDB_DATABASE;
  delete environment.WK_PTR_MATERIALIZATION_PARENT;
  delete environment.WARPKEEP_SPACETIME_EXECUTABLE;
  delete environment.SPACETIME_BIN;
  if (
    environment.WARPKEEP_SPACETIMEDB_URI !== undefined
    || environment.WARPKEEP_SPACETIMEDB_DATABASE !== undefined
    || environment.WARPKEEP_AUTH_BRIDGE_URL !== undefined
    || typeof dependencyCacheRoot !== 'string'
    || !isAbsolute(dependencyCacheRoot)
    || typeof cliConfigSourcePath !== 'string'
    || !isAbsolute(cliConfigSourcePath)
    || typeof receiptDirectory !== 'string'
    || !isAbsolute(receiptDirectory)
    || typeof genesis002DatabaseIdentity !== 'string'
    || !SHA256.test(genesis002DatabaseIdentity)
    || genesis002DatabaseIdentity
      === 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
    || (materializationParent !== undefined
      && !isAbsolute(materializationParent))
  ) fail('PTR_PRODUCTION_PUBLISH_ENVIRONMENT_INVALID');
  return Object.freeze({
    dependencyCacheRoot,
    cliConfigSourcePath,
    receiptDirectory,
    genesis002DatabaseIdentity,
    ...(materializationParent === undefined ? {} : { materializationParent }),
    executable,
  });
}

export async function executePtrProductionPublisherCli(input: Readonly<{
  arguments: readonly string[];
  environment: NodeJS.ProcessEnv;
  attestProtectedMain?: () => string;
  dependencies?: Readonly<{
    prepareArtifact?: typeof preparePtrSourceBuiltArtifact;
    executePublish?: typeof executePtrProductionPublish;
    createTransport?: typeof createPtrProductionTransport;
    verifyFreshStatus?: typeof verifyPtrFreshPublishStatus;
    writeReceipt?: typeof writePrivatePtrProductionReceipt;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  let rawAdminSecret = input.environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete input.environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  let adminSecret = '';
  let publishVerified = false;
  let failurePending = false;
  let interrupted = false;
  let signalHandlersInstalled = false;
  let artifact: ReturnType<typeof preparePtrSourceBuiltArtifact> | undefined;
  const interrupt = () => { interrupted = true; };
  const assertNotInterrupted = (publishAttempted: boolean): void => {
    if (!interrupted) return;
    fail(
      publishAttempted
        ? 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
        : 'PTR_PRODUCTION_PUBLISH_INTERRUPTED',
      publishAttempted,
    );
  };
  try {
    const arguments_ = parsePtrProductionPublisherArguments(input.arguments);
    if (arguments_.command === 'inspect') {
      const hadAdminSecret = rawAdminSecret !== undefined;
      rawAdminSecret = undefined;
      if (hadAdminSecret) fail('PTR_PRODUCTION_PUBLISH_ENVIRONMENT_INVALID');
    } else {
      const holder: NodeJS.ProcessEnv = {
        WARPKEEP_ADMIN_TOKEN_SECRET: rawAdminSecret,
      };
      rawAdminSecret = undefined;
      adminSecret = takePtrProductionAdminSecret(holder);
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      signalHandlersInstalled = true;
    }
    const local = localEnvironment(input.environment);
    const dependencies = input.dependencies ?? {};
    const prepareArtifact = dependencies.prepareArtifact
      ?? preparePtrSourceBuiltArtifact;
    const executePublish = dependencies.executePublish
      ?? executePtrProductionPublish;
    const createTransport = dependencies.createTransport
      ?? createPtrProductionTransport;
    const verifyFreshStatus = dependencies.verifyFreshStatus
      ?? verifyPtrFreshPublishStatus;
    const writeReceipt = dependencies.writeReceipt
      ?? writePrivatePtrProductionReceipt;
    const attest = input.attestProtectedMain
      ?? (() => attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT));
    const sourceCommit = attest();
    artifact = prepareArtifact({
      sourceCommit,
      reattestSource: attest,
      dependencyCacheRoot: local.dependencyCacheRoot,
      cliConfigSourcePath: local.cliConfigSourcePath,
      materializationParent: local.materializationParent,
      executable: local.executable,
      environment: input.environment,
    });
    if (
      typeof artifact.spacetimeCliConfigSha256 !== 'string'
      || !SHA256.test(artifact.spacetimeCliConfigSha256)
      || typeof artifact.spacetimeCliRootDirectory !== 'string'
      || !isAbsolute(artifact.spacetimeCliRootDirectory)
      || typeof artifact.spacetimeCliConfigPath !== 'string'
      || !isAbsolute(artifact.spacetimeCliConfigPath)
    ) fail('PTR_PRODUCTION_PUBLISH_CLI_AUTHORITY_INVALID');
    const identity = Object.freeze({
      sourceCommit,
      moduleSha256: artifact.moduleSha256,
      moduleTreeId: artifact.moduleTreeId,
      dependencyClosureDigest: artifact.dependencyClosureDigest,
      spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
      spacetimeCliConfigSha256: artifact.spacetimeCliConfigSha256,
    });
    const confirmationDigest = ptrProductionPublishConfirmationDigest(identity);
    if (arguments_.command === 'inspect') {
      return Object.freeze({
        schemaVersion: 1,
        profile: 'warpkeep-ptr-production-publish-inspection-v1',
        ...identity,
        databaseAlias: 'warpkeep-ptr',
        moduleIdentity: 'warpkeep-ptr-owner-view-v1',
        abi: artifact.abi,
        confirmationDigest,
        protectedMainExact: true,
        sourceMaterializedFromCommit: true,
        lockedDependencyClosure: true,
        privateImmutableArtifact: true,
        networkMode: 'protected-main-attestation-only',
      });
    }
    if (arguments_.confirmationDigest !== confirmationDigest) {
      fail('PTR_PRODUCTION_PUBLISH_CONFIRMATION_INVALID');
    }
    const receipt = await executePublish({
      ...identity,
      confirmationDigest,
      artifactPath: artifact.publishArtifactPath,
      artifactDescriptor: artifact.artifactDescriptor,
      spacetimeCliRootDirectory: artifact.spacetimeCliRootDirectory,
      spacetimeCliConfigPath: artifact.spacetimeCliConfigPath,
      spacetimeExecutable: artifact.spacetimeExecutable,
      childEnvironment: artifact.childEnvironment,
      assertSourceAndArtifact: () => {
        assertNotInterrupted(false);
        artifact?.assertSourceAndArtifact();
      },
      disallowedDatabaseIdentities: [local.genesis002DatabaseIdentity],
      postflight: async (databaseIdentity: string) => {
        const session = createTransport({
          databaseIdentity,
          adminSecret,
          disallowedDatabaseIdentities: [local.genesis002DatabaseIdentity],
        });
        try {
          return verifyFreshStatus(await session.inspect());
        } finally {
          await session.close();
        }
      },
    });
    assertNotInterrupted(true);
    publishVerified = true;
    adminSecret = '';
    const { publishReceiptDigest, ...withoutDigest } = receipt;
    if (
      ptrProductionPublishReceiptDigest(withoutDigest)
        !== publishReceiptDigest
    ) fail('PTR_PRODUCTION_PUBLISH_RECEIPT_INVALID');
    const ptrPublishReceiptFile = writeReceipt({
      directory: local.receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      kind: 'publish',
      receipt,
    });
    assertNotInterrupted(true);
    return Object.freeze({
      ptrPublishReceipt: receipt,
      ptrPublishReceiptFile,
    });
  } catch (error) {
    failurePending = true;
    if (publishVerified && error instanceof PtrProductionReceiptFileError) {
      fail(
        'PTR_PRODUCTION_PUBLISH_EVIDENCE_WRITE_FAILED_MANUAL_RECONCILIATION_REQUIRED',
        true,
      );
    }
    if (
      error instanceof PtrProductionPublisherCliError
      || error instanceof PtrProductionPublisherError
      || error instanceof PtrProductionAdminTokenError
      || error instanceof PtrProductionTransportError
      || error instanceof PtrProductionReleaseReceiptError
      || error instanceof PtrProductionReceiptFileError
    ) throw error;
    fail(
      publishVerified
        ? 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
        : 'PTR_PRODUCTION_PUBLISHER_FAILED',
      publishVerified,
    );
  } finally {
    rawAdminSecret = undefined;
    adminSecret = '';
    let cleanupFailed = false;
    try { artifact?.cleanup(); } catch { cleanupFailed = true; }
    if (signalHandlersInstalled) {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
    if (interrupted && !failurePending) {
      assertNotInterrupted(publishVerified);
    }
    if (cleanupFailed && !failurePending) {
      fail(
        publishVerified
          ? 'PTR_PRODUCTION_PUBLISH_CLEANUP_FAILED_MANUAL_RECONCILIATION_REQUIRED'
          : 'PTR_PRODUCTION_PUBLISH_CLEANUP_FAILED',
        publishVerified,
      );
    }
  }
  return fail('PTR_PRODUCTION_PUBLISHER_FAILED');
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await executePtrProductionPublisherCli({
      arguments: process.argv.slice(2),
      environment: process.env,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof PtrProductionPublisherCliError
      || error instanceof PtrProductionPublisherError
      || error instanceof PtrProductionAdminTokenError
      || error instanceof PtrProductionTransportError
      || error instanceof PtrProductionReleaseReceiptError
      || error instanceof PtrProductionReceiptFileError
      ? error.code
      : 'PTR_PRODUCTION_PUBLISHER_FAILED';
    const publishAttempted = error instanceof PtrProductionPublisherCliError
      || error instanceof PtrProductionPublisherError
      ? error.publishAttempted
      : false;
    process.stderr.write(`${code}${
      publishAttempted ? ':MANUAL_RECONCILIATION_REQUIRED' : ''
    }\n`);
    process.exitCode = 1;
  }
}
