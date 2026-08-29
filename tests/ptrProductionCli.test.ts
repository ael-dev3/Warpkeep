// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  executePtrProductionPublisherCli,
  parsePtrProductionPublisherArguments,
} from '../scripts/ptr-production-publisher-cli';
import {
  ptrProductionPublishConfirmationDigest,
  ptrProductionPublishReceiptDigest,
  PtrProductionPublisherError,
} from '../scripts/ptr-production-publisher.mjs';

const DATABASE_IDENTITY = '1'.repeat(64);
const G002_IDENTITY = '2'.repeat(64);
const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_DIGEST = 'd'.repeat(64);
const SPACETIME_DIGEST = 'e'.repeat(64);
const CLI_CONFIG_DIGEST = 'f'.repeat(64);
const ADMIN_SECRET = 's'.repeat(48);

function artifact() {
  return {
    sourceCommit: SOURCE_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    spacetimeCliRootDirectory: '/private/spacetime-root',
    spacetimeCliConfigPath: '/private/spacetime-cli.toml',
    spacetimeExecutable: '/private/spacetime',
    publishArtifactPath: '/dev/fd/3',
    artifactPath: '/private/artifact.js',
    artifactDescriptor: 3,
    childEnvironment: { PATH: '/usr/bin:/bin' },
    abi: { reducerCount: 9, procedureCount: 7 },
    assertSourceAndArtifact: vi.fn(),
    assertArtifact: vi.fn(),
    cleanup: vi.fn(),
  } as const;
}

function publishReceipt() {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-ptr-production-publish-v1',
    databaseIdentity: DATABASE_IDENTITY,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    sourceCommit: SOURCE_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    deleteData: 'never',
    outcome: 'verified',
    freshDatabase: true,
    freshStatusDigest: '0'.repeat(64),
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
  } as const;
  return {
    ...receipt,
    publishReceiptDigest: ptrProductionPublishReceiptDigest(receipt),
  };
}

function environment(): NodeJS.ProcessEnv {
  return {
    WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: '/private/cache',
    WARPKEEP_SPACETIME_CLI_CONFIG_PATH: '/private/source-cli.toml',
    WARPKEEP_PTR_RECEIPT_DIRECTORY: '/private/ptr-receipts',
    WARPKEEP_GENESIS_002_SPACETIMEDB_DATABASE: G002_IDENTITY,
    WARPKEEP_ADMIN_TOKEN_SECRET: ADMIN_SECRET,
    HOME: '/untrusted/home',
  };
}

describe('PTR production publisher CLI', () => {
  it('parses only inspect or a digest-confirmed publish', () => {
    expect(parsePtrProductionPublisherArguments(['inspect']))
      .toEqual({ command: 'inspect' });
    expect(parsePtrProductionPublisherArguments([
      'publish', `--confirm=${'0'.repeat(64)}`,
    ])).toEqual({ command: 'publish', confirmationDigest: '0'.repeat(64) });
    for (const invalid of [[], ['publish'], ['inspect', '--confirm=x'], ['apply']]) {
      expect(() => parsePtrProductionPublisherArguments(invalid))
        .toThrow('PTR_PRODUCTION_PUBLISH_USAGE_INVALID');
    }
  });

  it('inspects a committed source-built artifact without requesting a token or writing', async () => {
    const built = artifact();
    const env = environment();
    delete env.WARPKEEP_ADMIN_TOKEN_SECRET;
    const executePublish = vi.fn();
    const createTransport = vi.fn();
    const writeReceipt = vi.fn();
    const result = await executePtrProductionPublisherCli({
      arguments: ['inspect'],
      environment: env,
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(() => built),
        executePublish,
        createTransport,
        writeReceipt,
      },
    });
    expect(result).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep-ptr-production-publish-inspection-v1',
      databaseAlias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      confirmationDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      networkMode: 'protected-main-attestation-only',
    });
    expect(executePublish).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(writeReceipt).not.toHaveBeenCalled();
    expect(built.cleanup).toHaveBeenCalledOnce();
    expect(env).not.toHaveProperty('WARPKEEP_GENESIS_002_SPACETIMEDB_DATABASE');
    expect(env).not.toHaveProperty('WARPKEEP_PTR_RECEIPT_DIRECTORY');
  });

  it('publishes with scrubbed environment, exact fresh status, private receipt, and cleanup', async () => {
    const built = artifact();
    const env = environment();
    const receipt = publishReceipt();
    const close = vi.fn(async () => undefined);
    const inspect = vi.fn(async () => ({ protected: 'fresh' }));
    const createTransport = vi.fn(() => ({ inspect, close }));
    const verifyFreshStatus = vi.fn(() => ({
      freshDatabase: true as const,
      admissionSurfacePresent: false as const,
      accessRequestSurfacePresent: false as const,
      zeroPopulationBoundary: true as const,
      atlasImportMutationsCompiled: true as const,
      atlasActivationMutationsCompiled: false as const,
      ownerProvisioned: false as const,
    }));
    const executePublish = vi.fn(async input => {
      expect(input.disallowedDatabaseIdentities).toEqual([G002_IDENTITY]);
      await input.postflight(DATABASE_IDENTITY);
      return receipt;
    });
    const writeReceipt = vi.fn(() => ({
      path: '/private/ptr-receipts/ptr-publish-test.json',
      receiptFileSha256: '4'.repeat(64),
      result: 'installed' as const,
    }));
    const confirmationDigest = ptrProductionPublishConfirmationDigest({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    });
    const result = await executePtrProductionPublisherCli({
      arguments: ['publish', `--confirm=${confirmationDigest}`],
      environment: env,
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(input => {
          expect(input.environment).not.toHaveProperty(
            'WARPKEEP_ADMIN_TOKEN_SECRET',
          );
          expect(input.environment).not.toHaveProperty(
            'WARPKEEP_GENESIS_002_SPACETIMEDB_DATABASE',
          );
          expect(input.environment).not.toHaveProperty(
            'WARPKEEP_PTR_RECEIPT_DIRECTORY',
          );
          return built;
        }),
        executePublish,
        createTransport: createTransport as never,
        verifyFreshStatus,
        writeReceipt,
      },
    });
    expect(result).toEqual({
      ptrPublishReceipt: receipt,
      ptrPublishReceiptFile: {
        path: '/private/ptr-receipts/ptr-publish-test.json',
        receiptFileSha256: '4'.repeat(64),
        result: 'installed',
      },
    });
    expect(createTransport).toHaveBeenCalledWith({
      databaseIdentity: DATABASE_IDENTITY,
      adminSecret: ADMIN_SECRET,
      disallowedDatabaseIdentities: [G002_IDENTITY],
    });
    expect(verifyFreshStatus).toHaveBeenCalledWith({ protected: 'fresh' });
    expect(writeReceipt).toHaveBeenCalledWith({
      directory: '/private/ptr-receipts',
      repositoryRoot: expect.stringContaining('Warpkeep-prepared-keep-bindings-fix'),
      kind: 'publish',
      receipt,
    });
    expect(close).toHaveBeenCalledOnce();
    expect(built.cleanup).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(ADMIN_SECRET);
  });

  it('scrubs the admin secret and redacts an unexpected build failure', async () => {
    const env = environment();
    await expect(executePtrProductionPublisherCli({
      arguments: ['publish', `--confirm=${'0'.repeat(64)}`],
      environment: env,
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(() => {
          throw new Error(`private:${ADMIN_SECRET}`);
        }),
      },
    })).rejects.toThrow('PTR_PRODUCTION_PUBLISHER_FAILED');
    expect(env).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
  });

  it('preserves manual reconciliation when cleanup also fails after publish starts', async () => {
    const built = artifact();
    built.cleanup.mockImplementation(() => {
      throw new Error('cleanup failed');
    });
    const confirmationDigest = ptrProductionPublishConfirmationDigest({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    });
    await expect(executePtrProductionPublisherCli({
      arguments: ['publish', `--confirm=${confirmationDigest}`],
      environment: environment(),
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(() => built),
        executePublish: vi.fn(async () => {
          throw new PtrProductionPublisherError(
            'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
            true,
          );
        }),
      },
    })).rejects.toMatchObject({
      code: 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
    });
  });

  it('never writes activatable evidence after SIGTERM during publish', async () => {
    const built = artifact();
    const receipt = publishReceipt();
    const confirmationDigest = ptrProductionPublishConfirmationDigest({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    });
    const writeReceipt = vi.fn();
    const sigintListeners = process.listenerCount('SIGINT');
    const sigtermListeners = process.listenerCount('SIGTERM');
    await expect(executePtrProductionPublisherCli({
      arguments: ['publish', `--confirm=${confirmationDigest}`],
      environment: environment(),
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(() => built),
        executePublish: vi.fn(async () => {
          process.emit('SIGTERM');
          return receipt;
        }),
        writeReceipt,
      },
    })).rejects.toMatchObject({ publishAttempted: true });
    expect(writeReceipt).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners);
  });
});
