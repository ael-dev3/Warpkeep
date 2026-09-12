import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSealedRealmsPublicationPossiblySubmittedMarker,
  executeGenesis002Publish,
  genesis002PublishArguments,
  genesis002PublishConfirmationDigest,
  prepareGenesis002SourceBuiltArtifact,
  Genesis002ProductionPublisherError,
  type SealedRealmsPublicationPossiblySubmittedMarker,
} from './genesis002-production-publisher.mjs';
import { attestGreaterRealmProductionProtectedMain } from './greater-realm-production-provenance';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const PUBLICATION_MARKER_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'lane', 'sourceCommit', 'databaseUri', 'alias',
  'moduleIdentity', 'release', 'artifactDigest', 'toolchainDigest',
  'publishPlanDigest', 'confirmationDigest', 'attemptNonce', 'markedAt',
  'submissionState',
] as const);

export class Genesis002ProductionPublisherCliError extends Error {
  constructor(
    readonly code: string,
    readonly publishAttempted = false,
    readonly possiblySubmittedMarker?: SealedRealmsPublicationPossiblySubmittedMarker,
  ) {
    super(code);
    this.name = 'Genesis002ProductionPublisherCliError';
  }
}

function fail(
  code: string,
  publishAttempted = false,
  marker?: SealedRealmsPublicationPossiblySubmittedMarker,
): never {
  throw new Genesis002ProductionPublisherCliError(
    code,
    publishAttempted,
    marker,
  );
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
    ) fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    if (error instanceof Genesis002ProductionPublisherCliError) throw error;
    return fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
  }
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (
    descriptorKeys.length !== PUBLICATION_MARKER_KEYS.length
    || descriptorKeys.some((key, index) => (
      typeof key !== 'string' || key !== PUBLICATION_MARKER_KEYS[index]
    ))
  ) fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
  const snapshot: Record<string, unknown> = {};
  for (const key of PUBLICATION_MARKER_KEYS) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !Object.hasOwn(descriptor, 'value')
      || descriptor.enumerable !== true
    ) fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
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
      lane: snapshot.lane as 'g002',
      sourceCommit: snapshot.sourceCommit as string,
      databaseUri: snapshot.databaseUri as 'https://maincloud.spacetimedb.com',
      alias: snapshot.alias as 'warpkeep-genesis-002',
      moduleIdentity: snapshot.moduleIdentity as 'warpkeep-genesis-002-sealed-v1',
      release: snapshot.release as '0.4.0',
      artifactDigest: snapshot.artifactDigest as string,
      toolchainDigest: snapshot.toolchainDigest as string,
      publishPlanDigest: snapshot.publishPlanDigest as string,
      confirmationDigest: snapshot.confirmationDigest as string,
      attemptNonce: snapshot.attemptNonce as string,
      markedAt: snapshot.markedAt as string,
    });
    if (PUBLICATION_MARKER_KEYS.some(key => marker[key] !== snapshot[key])) {
      fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
    }
    return marker;
  } catch (error) {
    if (error instanceof Genesis002ProductionPublisherCliError) throw error;
    return fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
  }
}

function canonicalDigest(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(`${domain}\n`)
    .update(`${JSON.stringify(value)}\n`)
    .digest('hex');
}

export function parseGenesis002ProductionPublisherArguments(
  values: readonly string[],
): Readonly<{ command: 'inspect' | 'publish'; confirmationDigest?: string }> {
  if (values.length === 1 && values[0] === 'inspect') {
    return Object.freeze({ command: 'inspect' });
  }
  const confirmation = values.length === 2
    ? /^--confirm=([0-9a-f]{64})$/u.exec(values[1]!)
    : null;
  if (values[0] !== 'publish' || confirmation === null) {
    fail('GENESIS_002_PUBLISH_USAGE_INVALID');
  }
  return Object.freeze({
    command: 'publish',
    confirmationDigest: confirmation[1]!,
  });
}

function requireEnvironment(environment: NodeJS.ProcessEnv): Readonly<{
  dependencyCacheRoot: string;
  cliConfigSourcePath: string;
  materializationParent?: string;
  executable: string;
}> {
  const dependencyCacheRoot = environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  const cliConfigSourcePath = environment.WARPKEEP_SPACETIME_CLI_CONFIG_PATH;
  const materializationParent = environment.WK_G002_MATERIALIZATION_PARENT;
  const executable = environment.WARPKEEP_SPACETIME_EXECUTABLE
    ?? environment.SPACETIME_BIN
    ?? 'spacetime';
  delete environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  delete environment.WARPKEEP_SPACETIME_CLI_CONFIG_PATH;
  delete environment.WK_G002_MATERIALIZATION_PARENT;
  delete environment.WARPKEEP_SPACETIME_EXECUTABLE;
  delete environment.SPACETIME_BIN;
  if (
    environment.WARPKEEP_SPACETIMEDB_URI !== undefined
    || environment.WARPKEEP_SPACETIMEDB_DATABASE !== undefined
    || typeof dependencyCacheRoot !== 'string'
    || !isAbsolute(dependencyCacheRoot)
    || typeof cliConfigSourcePath !== 'string'
    || !isAbsolute(cliConfigSourcePath)
    || (materializationParent !== undefined && !isAbsolute(materializationParent))
  ) fail('GENESIS_002_PUBLISH_ENVIRONMENT_INVALID');
  return Object.freeze({
    dependencyCacheRoot,
    cliConfigSourcePath,
    ...(materializationParent === undefined ? {} : { materializationParent }),
    executable,
  });
}

export async function executeGenesis002ProductionPublisherCli(input: Readonly<{
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
    prepareArtifact?: typeof prepareGenesis002SourceBuiltArtifact;
    executePublish?: typeof executeGenesis002Publish;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  let marker: SealedRealmsPublicationPossiblySubmittedMarker | undefined;
  let submissionReleased = false;
  let failurePending = false;
  for (const key of Object.keys(input.environment)) {
    if (/(?:TOKEN|SECRET|PASSWORD|COOKIE|AUTH)/iu.test(key)) {
      delete input.environment[key];
    }
  }
  const arguments_ = parseGenesis002ProductionPublisherArguments(input.arguments);
  const local = requireEnvironment(input.environment);
  const dependencies = input.dependencies ?? {};
  const prepareArtifact = dependencies.prepareArtifact
    ?? prepareGenesis002SourceBuiltArtifact;
  const executePublish = dependencies.executePublish ?? executeGenesis002Publish;
  const attest = input.attestProtectedMain
    ?? (() => attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT));
  const sourceCommit = attest();
  const artifact = prepareArtifact({
    sourceCommit,
    reattestSource: attest,
    dependencyCacheRoot: local.dependencyCacheRoot,
    cliConfigSourcePath: local.cliConfigSourcePath,
    materializationParent: local.materializationParent,
    executable: local.executable,
    environment: input.environment,
  });
  try {
    if (
      typeof artifact.spacetimeCliConfigSha256 !== 'string'
      || !/^[0-9a-f]{64}$/u.test(artifact.spacetimeCliConfigSha256)
      || typeof artifact.spacetimeCliRootDirectory !== 'string'
      || !isAbsolute(artifact.spacetimeCliRootDirectory)
      || typeof artifact.spacetimeCliConfigPath !== 'string'
      || !isAbsolute(artifact.spacetimeCliConfigPath)
    ) fail('GENESIS_002_PUBLISH_CLI_AUTHORITY_INVALID');
    const identity = Object.freeze({
      sourceCommit,
      moduleSha256: artifact.moduleSha256,
      moduleTreeId: artifact.moduleTreeId,
      dependencyClosureDigest: artifact.dependencyClosureDigest,
      spacetimeExecutableSha256: artifact.spacetimeExecutableSha256,
      spacetimeCliConfigSha256: artifact.spacetimeCliConfigSha256,
    });
    const confirmationDigest = genesis002PublishConfirmationDigest(identity);
    if (arguments_.command === 'inspect') {
      return Object.freeze({
        schemaVersion: 1,
        profile: 'warpkeep-genesis-002-production-publish-v1',
        ...identity,
        moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
        databaseAlias: 'warpkeep-genesis-002',
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
      fail('GENESIS_002_PUBLISH_CONFIRMATION_INVALID');
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
        lane: 'g002',
        sourceCommit,
        databaseUri: 'https://maincloud.spacetimedb.com',
        alias: 'warpkeep-genesis-002',
        moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
        release: '0.4.0',
        artifactDigest: artifact.moduleSha256,
        toolchainDigest,
        publishArgv: genesis002PublishArguments(
          artifact.publishArtifactPath,
          artifact.spacetimeCliRootDirectory,
          artifact.spacetimeCliConfigPath,
        ),
        postflight: 'authenticated-spacetime-cli-list-identity-v1',
      },
    );
    const expectedMarkerInput = {
      lane: 'g002' as const,
      sourceCommit,
      databaseUri: 'https://maincloud.spacetimedb.com' as const,
      alias: 'warpkeep-genesis-002' as const,
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1' as const,
      release: '0.4.0' as const,
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
    ) fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
    marker = suppliedMarker === undefined
      ? createSealedRealmsPublicationPossiblySubmittedMarker({
        ...expectedMarkerInput,
        attemptNonce: input.attemptNonce!,
        markedAt: input.markedAt!,
      })
      : canonicalizeSuppliedPublicationMarker(suppliedMarker);
    for (const [key, value] of Object.entries(expectedMarkerInput)) {
      if (marker[key as keyof typeof marker] !== value) {
        fail('GENESIS_002_PUBLISH_MARKER_INPUT_INVALID');
      }
    }
    try {
      await input.onPossiblySubmittedMarker(marker);
    } catch {
      fail('GENESIS_002_PUBLISH_MARKER_CALLBACK_FAILED');
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
        assertSourceAndArtifact: artifact.assertSourceAndArtifact,
      });
    } catch (error) {
      if (
        error instanceof Genesis002ProductionPublisherError
        && error.publishAttempted
      ) fail(error.code, true, marker);
      fail(
        'GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        true,
        marker,
      );
    }
    return Object.freeze({
      ...receipt,
      publishReceipt: receipt,
      publishReceiptDigest: receipt.publishReceiptDigest,
      abi: artifact.abi,
      sourceMaterializedFromCommit: true,
      lockedDependencyClosure: true,
      privateImmutableArtifact: true,
      authenticatedCliPostflight: true,
    });
  } catch (error) {
    failurePending = true;
    if (error instanceof Genesis002ProductionPublisherCliError) throw error;
    if (submissionReleased) {
      if (
        error instanceof Genesis002ProductionPublisherError
        && error.publishAttempted
      ) fail(error.code, true, marker);
      fail(
        'GENESIS_002_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        true,
        marker,
      );
    }
    throw error;
  } finally {
    let cleanupFailed = false;
    try { artifact.cleanup(); } catch { cleanupFailed = true; }
    if (cleanupFailed && !failurePending) {
      fail(
        submissionReleased
          ? 'GENESIS_002_PUBLISH_CLEANUP_FAILED_MANUAL_RECONCILIATION_REQUIRED'
          : 'GENESIS_002_PUBLISH_CLEANUP_FAILED',
        submissionReleased,
        marker,
      );
    }
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await executeGenesis002ProductionPublisherCli({
      arguments: process.argv.slice(2),
      environment: process.env,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof Genesis002ProductionPublisherCliError
      || error instanceof Genesis002ProductionPublisherError
      ? error.code
      : 'GENESIS_002_PRODUCTION_PUBLISHER_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
