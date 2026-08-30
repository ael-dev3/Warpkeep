// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  executePtrProductionPublisherCli,
  parsePtrProductionPublisherArguments,
} from '../scripts/ptr-production-publisher-cli';
import {
  createSealedRealmsPublicationPossiblySubmittedMarker,
  digestSealedRealmsPublicationPossiblySubmittedMarker,
  ptrProductionPublishConfirmationDigest,
  ptrProductionPublishReceiptDigest,
  PtrProductionPublisherError,
} from '../scripts/ptr-production-publisher.mjs';
import { PtrProductionReceiptFileError } from '../scripts/ptr-production-receipt-file';

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
  it('awaits a pure marker before publish and returns that marker on ambiguity', async () => {
    const built = artifact();
    const env = environment();
    delete env.WARPKEEP_ADMIN_TOKEN_SECRET;
    const events: string[] = [];
    let marker: unknown;
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
      environment: env,
      attemptNonce: '8'.repeat(64),
      markedAt: '2026-08-30T12:34:56.789Z',
      onPossiblySubmittedMarker: async value => {
        events.push('marker');
        marker = value;
      },
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(() => built),
        executePublish: vi.fn(async () => {
          events.push('publish');
          throw new PtrProductionPublisherError(
            'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
            true,
          );
        }),
      },
    })).rejects.toMatchObject({
      code: 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
      possiblySubmittedMarker: marker,
    });
    expect(events).toEqual(['marker', 'publish']);
    expect(marker).toMatchObject({ lane: 'ptr', submissionState: 'possibly-submitted' });
    expect(digestSealedRealmsPublicationPossiblySubmittedMarker(marker))
      .toMatch(/^[0-9a-f]{64}$/u);
  });

  it('blocks PTR publication when marker delivery rejects and has no bridge imports', async () => {
    const built = artifact();
    const env = environment();
    delete env.WARPKEEP_ADMIN_TOKEN_SECRET;
    const confirmationDigest = ptrProductionPublishConfirmationDigest({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    });
    const executePublish = vi.fn();
    await expect(executePtrProductionPublisherCli({
      arguments: ['publish', `--confirm=${confirmationDigest}`],
      environment: env,
      attemptNonce: '8'.repeat(64),
      markedAt: '2026-08-30T12:34:56.789Z',
      onPossiblySubmittedMarker: vi.fn(async () => {
        throw new Error('private callback failure');
      }),
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: { prepareArtifact: vi.fn(() => built), executePublish },
    })).rejects.toThrow('PTR_PRODUCTION_PUBLISH_MARKER_CALLBACK_FAILED');
    expect(executePublish).not.toHaveBeenCalled();

    const source = readFileSync(
      resolve(import.meta.dirname, '../scripts/ptr-production-publisher-cli.ts'),
      'utf8',
    );
    expect(source).not.toContain('ptr-production-admin-token');
    expect(source).not.toContain('ptr-production-transport');
    expect(source).not.toContain('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(source).not.toContain('AUTH_BRIDGE');
  });

  it('canonicalizes a supplied PTR marker once before callback and ambiguity', async () => {
    const built = artifact();
    const confirmationDigest = ptrProductionPublishConfirmationDigest({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    });
    const canonicalMarker = createSealedRealmsPublicationPossiblySubmittedMarker({
      lane: 'ptr',
      sourceCommit: SOURCE_COMMIT,
      databaseUri: 'https://maincloud.spacetimedb.com',
      alias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      release: '0.4.0-ptr.1',
      artifactDigest: MODULE_SHA256,
      toolchainDigest:
        'fe719e82be69a991c0b250c8791cfe4d526890d187f383f50d011afaa4246c09',
      publishPlanDigest:
        '7534fcff25ab8767ce4ccfdadca50197ffd6ee4493308b6d5b79144ce8dba276',
      confirmationDigest,
      attemptNonce: '8'.repeat(64),
      markedAt: '2026-08-30T12:34:56.789Z',
    });
    let laneReads = 0;
    const suppliedMarker = new Proxy({ ...canonicalMarker }, {
      get(target, key, receiver) {
        if (key === 'lane') {
          laneReads += 1;
          return laneReads === 1 ? 'ptr' : 'g002';
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const events: string[] = [];
    let delivered: unknown;
    let failure: unknown;
    try {
      await executePtrProductionPublisherCli({
        arguments: ['publish', `--confirm=${confirmationDigest}`],
        environment: environment(),
        possiblySubmittedMarker: suppliedMarker as never,
        onPossiblySubmittedMarker: async marker => {
          events.push('callback');
          delivered = marker;
        },
        attestProtectedMain: () => SOURCE_COMMIT,
        dependencies: {
          prepareArtifact: vi.fn(() => built),
          executePublish: vi.fn(async () => {
            events.push('publish');
            throw new Error('post-submission failure');
          }),
          writeReceipt: vi.fn(),
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(events).toEqual(['callback', 'publish']);
    expect(laneReads).toBe(0);
    expect(delivered).not.toBe(suppliedMarker);
    expect(Object.isFrozen(delivered as object)).toBe(true);
    expect(delivered).toEqual(canonicalMarker);
    expect(failure).toMatchObject({
      code: 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      publishAttempted: true,
    });
    expect((failure as { possiblySubmittedMarker?: unknown }).possiblySubmittedMarker)
      .toBe(delivered);
  });

  it('rejects a mutable supplied PTR nonce before callback or publish', async () => {
    const built = artifact();
    const confirmationDigest = ptrProductionPublishConfirmationDigest({
      sourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    });
    const canonicalMarker = createSealedRealmsPublicationPossiblySubmittedMarker({
      lane: 'ptr',
      sourceCommit: SOURCE_COMMIT,
      databaseUri: 'https://maincloud.spacetimedb.com',
      alias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      release: '0.4.0-ptr.1',
      artifactDigest: MODULE_SHA256,
      toolchainDigest:
        'fe719e82be69a991c0b250c8791cfe4d526890d187f383f50d011afaa4246c09',
      publishPlanDigest:
        '7534fcff25ab8767ce4ccfdadca50197ffd6ee4493308b6d5b79144ce8dba276',
      confirmationDigest,
      attemptNonce: '8'.repeat(64),
      markedAt: '2026-08-30T12:34:56.789Z',
    });
    const callerNonce = ['8'.repeat(64)];
    const onPossiblySubmittedMarker = vi.fn(async marker => {
      (marker.attemptNonce as unknown as string[])[0] = '0'.repeat(64);
    });
    const executePublish = vi.fn(async () => {
      throw new Error('publish must not be reached');
    });

    await expect(executePtrProductionPublisherCli({
      arguments: ['publish', `--confirm=${confirmationDigest}`],
      environment: environment(),
      possiblySubmittedMarker: {
        ...canonicalMarker,
        attemptNonce: callerNonce,
      } as never,
      onPossiblySubmittedMarker,
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(() => built),
        executePublish,
        writeReceipt: vi.fn(),
      },
    })).rejects.toThrow('PTR_PRODUCTION_PUBLISH_MARKER_INPUT_INVALID');
    expect(onPossiblySubmittedMarker).not.toHaveBeenCalled();
    expect(executePublish).not.toHaveBeenCalled();
    expect(callerNonce).toEqual(['8'.repeat(64)]);
  });

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
    const writeReceipt = vi.fn();
    const result = await executePtrProductionPublisherCli({
      arguments: ['inspect'],
      environment: env,
      attestProtectedMain: () => SOURCE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(() => built),
        executePublish,
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
    expect(writeReceipt).not.toHaveBeenCalled();
    expect(built.cleanup).toHaveBeenCalledOnce();
    expect(env).not.toHaveProperty('WARPKEEP_GENESIS_002_SPACETIMEDB_DATABASE');
    expect(env).not.toHaveProperty('WARPKEEP_PTR_RECEIPT_DIRECTORY');
  });

  it('publishes with scrubbed environment, CLI-only postflight, private receipt, and cleanup', async () => {
    const built = artifact();
    const env = environment();
    const receipt = publishReceipt();
    const executePublish = vi.fn(async input => {
      expect(input.disallowedDatabaseIdentities).toEqual([G002_IDENTITY]);
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
      attemptNonce: '8'.repeat(64),
      markedAt: '2026-08-30T12:34:56.789Z',
      onPossiblySubmittedMarker: vi.fn(async () => undefined),
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
        writeReceipt,
      },
    });
    expect(result).toEqual({
      ptrPublishReceipt: receipt,
      ptrPublishReceiptEvidence: {
        receiptFileSha256: '4'.repeat(64),
        result: 'installed',
      },
    });
    expect(writeReceipt).toHaveBeenCalledWith({
      directory: '/private/ptr-receipts',
      repositoryRoot: resolve(import.meta.dirname, '..'),
      kind: 'publish',
      receipt,
    });
    expect(built.cleanup).toHaveBeenCalledOnce();
    const stdout = `${JSON.stringify(result, null, 2)}\n`;
    expect(stdout).not.toContain(ADMIN_SECRET);
    expect(stdout).not.toContain('/private/ptr-receipts');
    expect(stdout).not.toMatch(/"path"\s*:/u);
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
    let marker: unknown;
    await expect(executePtrProductionPublisherCli({
      arguments: ['publish', `--confirm=${confirmationDigest}`],
      environment: environment(),
      attemptNonce: '8'.repeat(64),
      markedAt: '2026-08-30T12:34:56.789Z',
      onPossiblySubmittedMarker: vi.fn(async value => { marker = value; }),
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
      possiblySubmittedMarker: marker,
    });
  });

  it.each(['generic', 'evidence', 'interrupt'] as const)(
    'retains the exact PTR marker across a post-submission %s failure',
    async failureMode => {
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
      let marker: unknown;
      const operation = executePtrProductionPublisherCli({
        arguments: ['publish', `--confirm=${confirmationDigest}`],
        environment: environment(),
        attemptNonce: '8'.repeat(64),
        markedAt: '2026-08-30T12:34:56.789Z',
        onPossiblySubmittedMarker: vi.fn(async value => { marker = value; }),
        attestProtectedMain: () => SOURCE_COMMIT,
        dependencies: {
          prepareArtifact: vi.fn(() => built),
          executePublish: vi.fn(async () => {
            if (failureMode === 'generic') throw new Error('generic');
            if (failureMode === 'interrupt') process.emit('SIGTERM');
            return receipt;
          }),
          writeReceipt: vi.fn(() => {
            if (failureMode === 'evidence') {
              throw new PtrProductionReceiptFileError('PTR_PRODUCTION_RECEIPT_WRITE_FAILED');
            }
            return '/private/receipt' as never;
          }),
        },
      });
      await expect(operation).rejects.toMatchObject({
        code: failureMode === 'evidence'
          ? 'PTR_PRODUCTION_PUBLISH_EVIDENCE_WRITE_FAILED_MANUAL_RECONCILIATION_REQUIRED'
          : 'PTR_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
        publishAttempted: true,
        possiblySubmittedMarker: marker,
      });
      expect(marker).toBeDefined();
    },
  );

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
      attemptNonce: '8'.repeat(64),
      markedAt: '2026-08-30T12:34:56.789Z',
      onPossiblySubmittedMarker: vi.fn(async () => undefined),
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
