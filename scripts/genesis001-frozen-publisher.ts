import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  G001_FREEZE_NONCE,
} from './genesis001-frozen-materializer.mjs';
import {
  Genesis001PublishManualStopError,
  publishGenesis001Frozen,
} from './genesis001-frozen-publisher-core';
import {
  attestGenesis001PinnedCli,
  createGenesis001FrozenPublisherDependencies,
  createGenesis001SignalLatch,
  genesis001RuntimeConfiguration,
} from './genesis001-frozen-publisher-runtime';
import {
  requireGreaterRealmProductionTransportTarget,
} from './greater-realm-production-transport';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

export type Genesis001FrozenPublisherCliArguments = Readonly<{
  command: 'publish';
  confirmation: typeof G001_FREEZE_NONCE;
}>;

export function parseGenesis001FrozenPublisherCliArguments(
  arguments_: readonly string[],
): Genesis001FrozenPublisherCliArguments {
  if (
    arguments_.length !== 2
    || arguments_[0] !== 'publish'
    || arguments_[1] !== `--confirm-freeze-nonce=${G001_FREEZE_NONCE}`
  ) {
    throw new Error(
      'Usage: genesis001-frozen-publisher.ts publish '
        + `--confirm-freeze-nonce=${G001_FREEZE_NONCE}`,
    );
  }
  return Object.freeze({ command: 'publish', confirmation: G001_FREEZE_NONCE });
}

function requiredExactPath(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
  key: string,
): string {
  const value = environment[key];
  if (
    typeof value !== 'string'
    || !isAbsolute(value)
    || resolve(value) !== value
    || value.includes('\0')
    || value.includes('\n')
  ) throw new Error(`${key} must be an exact absolute path`);
  return value;
}

export async function executeGenesis001FrozenPublisherCli(input: Readonly<{
  arguments_: readonly string[];
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}>): Promise<Readonly<Record<string, unknown>>> {
  parseGenesis001FrozenPublisherCliArguments(input.arguments_);
  requireGreaterRealmProductionTransportTarget(input.environment);
  const executable = requiredExactPath(input.environment, 'SPACETIME_BIN');
  const configuration = genesis001RuntimeConfiguration({
    repositoryRoot: REPOSITORY_ROOT,
    workspaceRoot: input.environment.WKG001_PRIVATE_WORKSPACE_ROOT,
    nodeExecutablePath: requiredExactPath(
      input.environment,
      'WKG001_NODE_EXECUTABLE_PATH',
    ),
    dependencyCacheRoot: requiredExactPath(
      input.environment,
      'WKG001_PRODUCTION_DEPENDENCY_CACHE_ROOT',
    ),
    cliConfigPath: requiredExactPath(
      input.environment,
      'WKG001_PRODUCTION_SPACETIME_CLI_CONFIG_PATH',
    ),
    adminSecretPath: requiredExactPath(
      input.environment,
      'WKG001_PRODUCTION_ADMIN_SECRET_PATH',
    ),
    environment: input.environment,
  });
  const signalLatch = createGenesis001SignalLatch();
  let cli: ReturnType<typeof attestGenesis001PinnedCli> | undefined;
  try {
    cli = attestGenesis001PinnedCli(executable, configuration.childEnvironment);
    return await publishGenesis001Frozen(createGenesis001FrozenPublisherDependencies({
      configuration,
      cli,
      signalLatch,
    }));
  } finally {
    signalLatch.close();
    cli?.cleanup();
  }
}

async function main(): Promise<void> {
  try {
    const result = await executeGenesis001FrozenPublisherCli({
      arguments_: process.argv.slice(2),
      environment: process.env,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof Genesis001PublishManualStopError) {
      process.stderr.write(`${JSON.stringify({
        code: error.code,
        artifactPath: error.artifactPath,
        retry: 'forbidden-until-manual-reconciliation',
      })}\n`);
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : 'Genesis 001 publisher failed'}\n`);
    }
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) void main();
