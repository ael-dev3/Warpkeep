import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  executeGenesis002Publish,
  genesis002PublishConfirmationDigest,
  prepareGenesis002SourceBuiltArtifact,
  Genesis002ProductionPublisherError,
} from './genesis002-production-publisher.mjs';
import { verifyGenesis002FreshPublishStatus } from './genesis002-sealed-live-receipt.mjs';
import {
  createGenesis002ProductionTransport,
  Genesis002ProductionTransportError,
  takeGenesis002ProductionAdminSecret,
} from './genesis002-production-transport';
import { attestGreaterRealmProductionProtectedMain } from './greater-realm-production-provenance';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

export class Genesis002ProductionPublisherCliError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'Genesis002ProductionPublisherCliError';
  }
}

function fail(code: string): never {
  throw new Genesis002ProductionPublisherCliError(code);
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
    || environment.WARPKEEP_AUTH_BRIDGE_URL !== undefined
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
  attestProtectedMain?: () => string;
  dependencies?: Readonly<{
    prepareArtifact?: typeof prepareGenesis002SourceBuiltArtifact;
    executePublish?: typeof executeGenesis002Publish;
    createTransport?: typeof createGenesis002ProductionTransport;
    verifyFreshStatus?: typeof verifyGenesis002FreshPublishStatus;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  const arguments_ = parseGenesis002ProductionPublisherArguments(input.arguments);
  const local = requireEnvironment(input.environment);
  const dependencies = input.dependencies ?? {};
  const prepareArtifact = dependencies.prepareArtifact
    ?? prepareGenesis002SourceBuiltArtifact;
  const executePublish = dependencies.executePublish ?? executeGenesis002Publish;
  const createTransport = dependencies.createTransport
    ?? createGenesis002ProductionTransport;
  const verifyFreshStatus = dependencies.verifyFreshStatus
    ?? verifyGenesis002FreshPublishStatus;
  // The run-admin wrapper injects the secret. Remove it before any source,
  // dependency, Git, build, ABI-generation, or Spacetime CLI child runs.
  let adminSecret = takeGenesis002ProductionAdminSecret(input.environment);
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
      adminSecret = '';
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
    const receipt = await executePublish({
      ...identity,
      confirmationDigest,
      artifactPath: artifact.publishArtifactPath,
      artifactDescriptor: artifact.artifactDescriptor,
      spacetimeCliRootDirectory: artifact.spacetimeCliRootDirectory,
      spacetimeCliConfigPath: artifact.spacetimeCliConfigPath,
      spacetimeExecutable: artifact.spacetimeExecutable,
      childEnvironment: artifact.childEnvironment,
      assertSourceAndArtifact: artifact.assertSourceAndArtifact,
      postflight: async databaseIdentity => {
        const session = createTransport({
          databaseIdentity,
          adminSecret,
        });
        try {
          const [realmStatusValue, atlasStatusValue] = await Promise.all([
            session.inspectRealm(),
            session.inspect(),
          ]);
          return verifyFreshStatus({
            databaseIdentity,
            moduleSourceCommit: sourceCommit,
            moduleSha256: artifact.moduleSha256,
            realmStatusValue,
            atlasStatusValue,
          });
        } finally {
          await session.close();
        }
      },
    });
    adminSecret = '';
    return Object.freeze({
      ...receipt,
      abi: artifact.abi,
      sourceMaterializedFromCommit: true,
      lockedDependencyClosure: true,
      privateImmutableArtifact: true,
      zeroPopulationPostflight: true,
    });
  } finally {
    adminSecret = '';
    artifact.cleanup();
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
      || error instanceof Genesis002ProductionTransportError
      ? error.code
      : 'GENESIS_002_PRODUCTION_PUBLISHER_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
