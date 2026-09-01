import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSealedRealmsPublicationPossiblySubmittedMarker,
  executePtrProductionPublish,
  preparePtrSourceBuiltArtifact,
  ptrProductionPublishArguments,
  ptrProductionPublishConfirmationDigest,
  ptrProductionPublishReceiptDigest,
  PtrProductionPublisherError,
  type SealedRealmsPublicationPossiblySubmittedMarker,
} from './ptr-production-publisher.mjs';
import {
  writePrivatePtrProductionReceipt,
  PtrProductionReceiptFileError,
} from './ptr-production-receipt-file';
import {
  attestGreaterRealmProductionProtectedMain,
} from './greater-realm-production-provenance';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const SHA256 = /^[0-9a-f]{64}$/u;
const PUBLICATION_MARKER_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'lane', 'sourceCommit', 'databaseUri', 'alias',
  'moduleIdentity', 'release', 'artifactDigest', 'toolchainDigest',
  'publishPlanDigest', 'confirmationDigest', 'attemptNonce', 'markedAt',
  'submissionState',
] as const);

export class PtrProductionPublisherCliError extends Error {
  constructor(
    readonly code: string,
    readonly publishAttempted = false,
    readonly possiblySubmittedMarker?: SealedRealmsPublicationPossiblySubmittedMarker,
  ) {
    super(code);
    this.name = 'PtrProductionPublisherCliError';
  }
}

function fail(
  code: string,
  publishAttempted = false,
  marker?: SealedRealmsPublicationPossiblySubmittedMarker,
): never {
  throw new PtrProductionPublisherCliError(code, publishAttempted, marker);
}

function canonicalizeSuppliedPublicationMarker(
  value: unknown,
): SealedRealmsPublicationPossiblySubmittedMarker {
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    if (error instanceof PtrProductionPublisherCliError) throw error;
    return fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
  }
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (
    descriptorKeys.length !== PUBLICATION_MARKER_KEYS.length
    || descriptorKeys.some((key, index) => (
      typeof key !== 'string' || key !== PUBLICATION_MARKER_KEYS[index]
    ))
  ) fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
  const snapshot: Record<string, unknown> = {};
  for (const key of PUBLICATION_MARKER_KEYS) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !Object.hasOwn(descriptor, 'value')
      || descriptor.enumerable !== true
    ) fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  Object.freeze(snapshot);
  try {
    const marker = createSealedRealmsPublicationPossiblySubmittedMarker({
      lane: snapshot.lane as 'ptr',
      sourceCommit: snapshot.sourceCommit as string,
      databaseUri: snapshot.databaseUri as 'https://maincloud.spacetimedb.com',
      alias: snapshot.alias as 'warpkeep-ptr',
      moduleIdentity: snapshot.moduleIdentity as 'warpkeep-ptr-owner-view-v1',
      release: snapshot.release as '0.4.0-ptr.1',
      artifactDigest: snapshot.artifactDigest as string,
      toolchainDigest: snapshot.toolchainDigest as string,
      publishPlanDigest: snapshot.publishPlanDigest as string,
      confirmationDigest: snapshot.confirmationDigest as string,
      attemptNonce: snapshot.attemptNonce as string,
      markedAt: snapshot.markedAt as string,
    });
    if (PUBLICATION_MARKER_KEYS.some(key => marker[key] !== snapshot[key])) {
      fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
    }
    return marker;
  } catch (error) {
    if (error instanceof PtrProductionPublisherCliError) throw error;
    return fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
  }
}

function canonicalDigest(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(`${domain}\n`)
    .update(`${JSON.stringify(value)}\n`)
    .digest('hex');
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
  attemptNonce?: string;
  markedAt?: string;
  possiblySubmittedMarker?: SealedRealmsPublicationPossiblySubmittedMarker;
  onPossiblySubmittedMarker?: (
    marker: SealedRealmsPublicationPossiblySubmittedMarker,
  ) => Promise<void>;
  attestProtectedMain?: () => string;
  dependencies?: Readonly<{
    prepareArtifact?: typeof preparePtrSourceBuiltArtifact;
    executePublish?: typeof executePtrProductionPublish;
    writeReceipt?: typeof writePrivatePtrProductionReceipt;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  let publishVerified = false;
  let failurePending = false;
  let interrupted = false;
  let signalHandlersInstalled = false;
  let submissionReleased = false;
  let possiblySubmittedMarker:
    SealedRealmsPublicationPossiblySubmittedMarker | undefined;
  let artifact: ReturnType<typeof preparePtrSourceBuiltArtifact> | undefined;
  const interrupt = () => { interrupted = true; };
  const assertNotInterrupted = (publishAttempted: boolean): void => {
    if (!interrupted) return;
    fail(
      publishAttempted
        ? 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
        : 'PTR_PRODUCTION_PUBLISH_INTERRUPTED',
      publishAttempted,
      publishAttempted ? possiblySubmittedMarker : undefined,
    );
  };
  try {
    for (const key of Object.keys(input.environment)) {
      if (/(?:TOKEN|SECRET|PASSWORD|COOKIE|AUTH)/iu.test(key)) {
        delete input.environment[key];
      }
    }
    const arguments_ = parsePtrProductionPublisherArguments(input.arguments);
    if (arguments_.command === 'publish') {
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
    const toolchainDigest = canonicalDigest(
      'warpkeep.sealed-realms.publication-toolchain.v1',
      {
        dependencyClosureDigest: identity.dependencyClosureDigest,
        spacetimeExecutableSha256: identity.spacetimeExecutableSha256,
        spacetimeCliConfigSha256: identity.spacetimeCliConfigSha256,
      },
    );
    const publishPlanDigest = canonicalDigest(
      'warpkeep.sealed-realms.publication-plan.v1',
      {
        lane: 'ptr',
        sourceCommit,
        databaseUri: 'https://maincloud.spacetimedb.com',
        alias: 'warpkeep-ptr',
        moduleIdentity: 'warpkeep-ptr-owner-view-v1',
        release: '0.4.0-ptr.1',
        artifactDigest: artifact.moduleSha256,
        toolchainDigest,
        publishArgv: ptrProductionPublishArguments(
          artifact.publishArtifactPath,
          artifact.spacetimeCliRootDirectory,
          artifact.spacetimeCliConfigPath,
        ),
        postflight: 'authenticated-spacetime-cli-list-identity-v1',
      },
    );
    const expectedMarkerInput = {
      lane: 'ptr' as const,
      sourceCommit,
      databaseUri: 'https://maincloud.spacetimedb.com' as const,
      alias: 'warpkeep-ptr' as const,
      moduleIdentity: 'warpkeep-ptr-owner-view-v1' as const,
      release: '0.4.0-ptr.1' as const,
      artifactDigest: artifact.moduleSha256,
      toolchainDigest,
      publishPlanDigest,
      confirmationDigest,
    };
    const suppliedMarker = input.possiblySubmittedMarker;
    const suppliedNonceAndTime = input.attemptNonce !== undefined
      || input.markedAt !== undefined;
    if (
      typeof input.onPossiblySubmittedMarker !== 'function'
      || (suppliedMarker !== undefined) === suppliedNonceAndTime
      || (suppliedMarker === undefined && (
        input.attemptNonce === undefined || input.markedAt === undefined
      ))
    ) fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
    possiblySubmittedMarker = suppliedMarker === undefined
      ? createSealedRealmsPublicationPossiblySubmittedMarker({
        ...expectedMarkerInput,
        attemptNonce: input.attemptNonce!,
        markedAt: input.markedAt!,
      })
      : canonicalizeSuppliedPublicationMarker(suppliedMarker);
    for (const [key, value] of Object.entries(expectedMarkerInput)) {
      if (possiblySubmittedMarker[key as keyof typeof possiblySubmittedMarker] !== value) {
        fail('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
      }
    }
    try {
      await input.onPossiblySubmittedMarker(possiblySubmittedMarker);
    } catch {
      fail('PTR_PRODUCTION_PUBLISH_MARKER_CALLBACK_FAILED');
    }
    let receipt;
    try {
      submissionReleased = true;
      receipt = await executePublish({
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
      });
    } catch (error) {
      if (error instanceof PtrProductionPublisherError && error.publishAttempted) {
        fail(error.code, true, possiblySubmittedMarker);
      }
      fail(
        'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        true,
        possiblySubmittedMarker,
      );
    }
    assertNotInterrupted(true);
    publishVerified = true;
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
      ptrPublishReceiptEvidence: Object.freeze({
        receiptFileSha256: ptrPublishReceiptFile.receiptFileSha256,
        result: ptrPublishReceiptFile.result,
      }),
    });
  } catch (error) {
    failurePending = true;
    if (publishVerified && error instanceof PtrProductionReceiptFileError) {
      fail(
        'PTR_PRODUCTION_PUBLISH_EVIDENCE_WRITE_FAILED_MANUAL_RECONCILIATION_REQUIRED',
        true,
        possiblySubmittedMarker,
      );
    }
    if (error instanceof PtrProductionPublisherCliError) {
      if (error.publishAttempted && error.possiblySubmittedMarker === undefined) {
        fail(error.code, true, possiblySubmittedMarker);
      }
      throw error;
    }
    if (error instanceof PtrProductionPublisherError) {
      if (submissionReleased || error.publishAttempted) {
        fail(error.code, true, possiblySubmittedMarker);
      }
      throw error;
    }
    if (error instanceof PtrProductionReceiptFileError) throw error;
    fail(
      submissionReleased
        ? 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
        : 'PTR_PRODUCTION_PUBLISHER_FAILED',
      submissionReleased,
      submissionReleased ? possiblySubmittedMarker : undefined,
    );
  } finally {
    let cleanupFailed = false;
    try { artifact?.cleanup(); } catch { cleanupFailed = true; }
    if (signalHandlersInstalled) {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
    if (interrupted && !failurePending) {
      assertNotInterrupted(submissionReleased);
    }
    if (cleanupFailed && !failurePending) {
      fail(
        submissionReleased
          ? 'PTR_PRODUCTION_PUBLISH_CLEANUP_FAILED_MANUAL_RECONCILIATION_REQUIRED'
          : 'PTR_PRODUCTION_PUBLISH_CLEANUP_FAILED',
        submissionReleased,
        submissionReleased ? possiblySubmittedMarker : undefined,
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
