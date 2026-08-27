// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { GreaterRealmRuntimeReleaseArtifacts } from '../scripts/atlas/greater-realm-runtime-release';
import {
  executeGenesis002ProductionImport,
  genesis002ProductionImportConfirmationDigest,
  GENESIS_002_PRODUCTION_IMPORT_REDUCERS,
} from '../scripts/genesis002-production-import-core';
import {
  executeGenesis002ProductionImportOperator,
} from '../scripts/genesis002-production-import-operator';
import {
  genesis002PublishConfirmationDigest,
} from '../scripts/genesis002-production-publisher.mjs';
import {
  executeGenesis002ProductionPublisherCli,
} from '../scripts/genesis002-production-publisher-cli';

const repositoryRoot = resolve(import.meta.dirname, '..');
const DATABASE_IDENTITY = '1'.repeat(64);
const MODULE_COMMIT = '2'.repeat(40);
const MODULE_SHA256 = '3'.repeat(64);
const MODULE_TREE_ID = '4'.repeat(40);
const DEPENDENCY_DIGEST = '5'.repeat(64);
const SPACETIME_DIGEST = '6'.repeat(64);
const CLI_CONFIG_DIGEST = '0'.repeat(64);
const ATLAS_COMMIT = '7'.repeat(40);
const RELEASE_SHA256 = '8'.repeat(64);
const PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const PUBLIC_APPROVAL_ID = `GRA-${'B'.repeat(26)}`;
const ADMIN_SECRET = 's'.repeat(48);

function sourceArtifact() {
  return {
    sourceCommit: MODULE_COMMIT,
    moduleSha256: MODULE_SHA256,
    artifactPath: '/private/source-built-bundle.js',
    publishArtifactPath: '/dev/fd/3' as const,
    artifactDescriptor: 3,
    spacetimeExecutable: '/private/spacetime',
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    spacetimeCliRootDirectory: '/private/spacetime-root',
    spacetimeCliConfigPath: '/private/spacetime-cli.toml',
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    moduleTreeId: MODULE_TREE_ID,
    childEnvironment: { PATH: '/usr/bin:/bin' },
    abi: {
      reducerCount: 18,
      procedureCount: 7,
      tableCount: 23,
      activationReducerCount: 0,
    },
    assertSourceAndArtifact: vi.fn(),
    assertArtifact: vi.fn(),
    cleanup: vi.fn(),
  };
}

function runtimeArtifacts(): GreaterRealmRuntimeReleaseArtifacts {
  const manifest = {
    schema: 'warpkeep.greater-realm.runtime-import-manifest.v1',
    classification: 'declassified-tier-i-runtime-import',
    atlasId: 'GENESIS_002_GREATER_REALM',
    publicReleaseId: PUBLIC_RELEASE_ID,
    publicApprovalReceiptId: PUBLIC_APPROVAL_ID,
    sourceCommit: ATLAS_COMMIT,
    generatorVersion: 'operator-test-generator-v1',
    sourceFormatVersion: 'wkgr-runtime-source-v1',
    livingWorldVersion: 'operator-test-living-world-v1',
    runtimePartitionVersion: 'axial-bin-15-tier-one-filter-v1',
    rendererContractVersion: 'greater-realm-renderer-v1',
    visibleTierMax: 1,
    totals: {
      regionCount: 1,
      componentCount: 1,
      chunkCount: 1,
      cellCount: 1,
      castleSlotCount: 600,
      resourceNodeCount: 1,
    },
    legacyLowlandsBridge: { exact: true },
    regions: [{
      regionId: 'T1_LOWLANDS',
      publicName: 'Lowlands',
      ordinal: 0,
      tier: 1,
      cellCount: 1,
      passableCellCount: 1,
      chunkCount: 1,
      castleCapacity: 600,
      resourceLocationCount: 1,
      resourceNodeCount: 1,
      foodNodeCount: 1,
      woodNodeCount: 0,
      stoneNodeCount: 0,
      goldNodeCount: 0,
      active: false,
    }],
    components: [{
      componentKey: 'GRC-AAAAAAAAAAAAAAAAAAAAAAAAAA',
      componentOrdinal: 0,
      regionMask: 1,
      rootCellKey: 'CELL-A',
      expectedCellCount: 1,
      maxRouteDepth: 1,
      expectedSlotCount: 600,
      expectedFoodNodeCount: 1,
      expectedWoodNodeCount: 0,
      expectedStoneNodeCount: 0,
      expectedGoldNodeCount: 0,
      componentSha256: RELEASE_SHA256,
    }],
    chunks: [{ importOrdinal: 0 }],
    releaseSha256: RELEASE_SHA256,
  };
  const bytes = Buffer.from('{"operator-test":true}\n');
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestBytes: Buffer.from(`${JSON.stringify(manifest)}\n`),
    status: Object.freeze({}),
    statusBytes: Buffer.from('{}\n'),
    chunks: Object.freeze([Object.freeze({
      path: 'chunks/operator-test.json',
      bytes,
      payload: Object.freeze({
        cells: Object.freeze([Object.freeze({ passable: true })]),
        castleSlots: Object.freeze(
          Array.from({ length: 600 }, () => Object.freeze({})),
        ),
        resourceNodes: Object.freeze([Object.freeze({})]),
      }),
    })]),
  }) as unknown as GreaterRealmRuntimeReleaseArtifacts;
}

function absentAtlasStatus() {
  return {
    present: false,
    atlasId: undefined,
    publicReleaseId: undefined,
    publicApprovalReceiptId: undefined,
    sourceCommit: undefined,
    expectedReleaseSha256: undefined,
    releaseHeaderSha256: undefined,
    state: 'absent',
    importEpoch: undefined,
    verificationPhase: 'components',
    verificationCursor: 0n,
    verificationDigest: `sha256-v1:${'0'.repeat(64)}:0:`,
    expectedRegionCount: 0,
    expectedComponentCount: 0,
    expectedChunkCount: 0,
    expectedCellCount: 0,
    expectedSlotCount: 0,
    expectedResourceNodeCount: 0,
    verifiedComponentCount: 0,
    verifiedChunkCount: 0,
    verifiedCellCount: 0,
    verifiedSlotCount: 0,
    verifiedResourceNodeCount: 0,
    componentExpectedCellCount: 0,
    componentExpectedSlotCount: 0,
    componentExpectedResourceNodeCount: 0,
    importedPassableCellCount: 0,
    regionManifestRows: 0,
    componentRows: 0n,
    chunkRows: 0n,
    cellRows: 0n,
    slotRows: 0n,
    resourceRows: 0n,
    claimRows: 0n,
    occupancyRows: 0n,
    activationRows: 0n,
    publicAtlasRows: 0n,
    publicRegionRows: 0n,
    workerSystemRows: 0n,
    importsExact: false,
    ready: false,
    importMutationsCompiled: true,
    activationMutationsCompiled: false,
  } as const;
}

function sealedRealmStatus() {
  return {
    realmId: 'GENESIS_002',
    databaseName: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    releaseVersion: '0.4.0',
    launchState: 'sealed',
    admissionsOpen: false,
    accessRequestsOpen: false,
    admittedPlayers: 0n,
    founders: 0n,
    allowedFids: 0n,
    accessRequests: 0n,
    playersV1: 0n,
    playersV2: 0n,
    ownershipBindings: 0n,
    castles: 0n,
    realmProfiles: 0n,
    termsAcceptances: 0n,
    markAccounts: 0n,
    resourceAccounts: 0n,
    castleClaims: 0n,
    cellOccupancies: 0n,
    activationRows: 0n,
    workerSystemRows: 0n,
    atlasImportMutationsEnabled: true,
    atlasActivationMutationsEnabled: false,
    playerPresentationEnabled: false,
    atlasPresent: false,
    atlasId: undefined,
    publicReleaseId: undefined,
    atlasState: 'absent',
    atlasReady: false,
    atlasCellRows: 0n,
    atlasSlotRows: 0n,
    atlasResourceRows: 0n,
  } as const;
}

function transitionTransport(ambiguousAfterFirstWrite = false) {
  let status: Record<string, unknown> = { ...absentAtlasStatus() };
  let sequence = 0;
  const reducers: string[] = [];
  const nextDigest = (complete = false) => {
    sequence += 1;
    return complete
      ? sequence.toString(16).padStart(64, '0')
      : `sha256-v1:${sequence.toString(16).padStart(64, '0')}:${sequence}:`;
  };
  return {
    reducers,
    inspect: vi.fn(async () => {
      if (ambiguousAfterFirstWrite && reducers.length === 1) throw new Error('link lost');
      return { ...status };
    }),
    inspectRealm: vi.fn(async () => ({ ...sealedRealmStatus() })),
    prepareSubmission: vi.fn(async () => undefined),
    submit: vi.fn(async (reducer: string, arguments_: Readonly<Record<string, unknown>>) => {
      reducers.push(reducer);
      if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.stage) {
        status = {
          ...status,
          present: true,
          atlasId: arguments_.atlasId,
          publicReleaseId: arguments_.publicReleaseId,
          publicApprovalReceiptId: arguments_.publicApprovalReceiptId,
          sourceCommit: arguments_.sourceCommit,
          expectedReleaseSha256: arguments_.expectedReleaseSha256,
          releaseHeaderSha256: createHash('sha256')
            .update(String(arguments_.releaseHeaderJson)).digest('hex'),
          state: 'importing',
          importEpoch: arguments_.importEpoch,
          verificationDigest: nextDigest(),
          expectedRegionCount: arguments_.expectedRegionCount,
          expectedComponentCount: arguments_.expectedComponentCount,
          expectedChunkCount: arguments_.expectedChunkCount,
          expectedCellCount: arguments_.expectedCellCount,
          expectedSlotCount: arguments_.expectedSlotCount,
          expectedResourceNodeCount: arguments_.expectedResourceNodeCount,
        };
      } else if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.components) {
        status = {
          ...status,
          componentRows: 1n,
          componentExpectedCellCount: 1,
          componentExpectedSlotCount: 600,
          componentExpectedResourceNodeCount: 1,
        };
      } else if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.regions) {
        status = { ...status, regionManifestRows: 1 };
      } else if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.chunk) {
        status = {
          ...status,
          chunkRows: 1n,
          cellRows: 1n,
          slotRows: 600n,
          resourceRows: 1n,
          importedPassableCellCount: 1,
          importsExact: true,
          verificationDigest: nextDigest(),
        };
      } else if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.beginVerification) {
        status = {
          ...status,
          state: 'verifying',
          verificationPhase: 'components',
          verificationCursor: 0n,
          verificationDigest: nextDigest(),
        };
      } else if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.verifyBatch) {
        const order = [
          'components', 'chunks', 'cells', 'component-slots', 'slots',
          'component-resources', 'resources', 'component-finalize', 'complete',
        ];
        const phase = String(status.verificationPhase);
        const total = phase === 'slots' ? 600 : 1;
        const start = Number(status.verificationCursor);
        const end = Math.min(total, start + 256);
        const complete = end === total;
        const nextPhase = complete ? order[order.indexOf(phase) + 1]! : phase;
        const verified = phase === 'components' ? { verifiedComponentCount: end }
          : phase === 'chunks' ? { verifiedChunkCount: end }
            : phase === 'cells' ? { verifiedCellCount: end }
              : phase === 'slots' ? { verifiedSlotCount: end }
                : phase === 'resources' ? { verifiedResourceNodeCount: end }
                  : {};
        status = {
          ...status,
          ...verified,
          verificationPhase: nextPhase,
          verificationCursor: BigInt(complete ? 0 : end),
          verificationDigest: nextDigest(nextPhase === 'complete'),
        };
      } else if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.finalize) {
        status = { ...status, state: 'ready', ready: true };
      } else throw new Error(`unexpected reducer: ${reducer}`);
    }),
    close: vi.fn(async () => undefined),
  };
}

function importArguments(command: 'inspect' | 'apply', confirmationDigest?: string) {
  return [
    command,
    `--database-identity=${DATABASE_IDENTITY}`,
    `--module-source-commit=${MODULE_COMMIT}`,
    `--module-sha256=${MODULE_SHA256}`,
    `--module-tree-id=${MODULE_TREE_ID}`,
    `--dependency-closure-digest=${DEPENDENCY_DIGEST}`,
    `--spacetime-executable-sha256=${SPACETIME_DIGEST}`,
    `--atlas-source-commit=${ATLAS_COMMIT}`,
    `--release-sha256=${RELEASE_SHA256}`,
    ...(confirmationDigest === undefined ? [] : [`--confirm=${confirmationDigest}`]),
  ];
}

function importDependencies(transport: ReturnType<typeof transitionTransport>) {
  const built = sourceArtifact();
  const verifyLiveStatus = vi.fn(input => {
    expect(input.atlasStatusValue).toMatchObject({ state: 'ready', ready: true });
    return Object.freeze({
      receipt: Object.freeze({
        profile: 'warpkeep-genesis-002-sealed-live-v1',
        databaseIdentity: DATABASE_IDENTITY,
        activationMutationsEnabled: false,
        playerPresentationEnabled: false,
      }),
      receiptDigest: '9'.repeat(64),
    });
  });
  return {
    built,
    verifyLiveStatus,
    dependencies: {
      prepareArtifact: vi.fn(() => built),
      openWorkspace: vi.fn(() => ({}) as never),
      readRuntimeRelease: vi.fn(() => runtimeArtifacts()),
      verifyRuntimeRelease: vi.fn(() => undefined),
      attestSourceAncestry: vi.fn(() => undefined),
      createTransport: vi.fn(() => transport),
      executeImport: (input: Parameters<typeof executeGenesis002ProductionImport>[0]) => (
        executeGenesis002ProductionImport({
          ...input,
          testOnlyVerifyArtifacts: () => undefined,
        })
      ),
      verifyLiveStatus,
    },
  };
}

describe('Genesis 002 top-level production operators', () => {
  it('runs the publish CLI through private source-build and exact fresh-status seams', async () => {
    const built = sourceArtifact();
    const environment: NodeJS.ProcessEnv = {
      WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: '/private/cache',
      WARPKEEP_SPACETIME_CLI_CONFIG_PATH: '/private/source-spacetime-cli.toml',
      WARPKEEP_ADMIN_TOKEN_SECRET: ADMIN_SECRET,
      HOME: '/private/home',
    };
    const createTransport = vi.fn(input => {
      expect(input).toEqual({
        databaseIdentity: DATABASE_IDENTITY,
        adminSecret: ADMIN_SECRET,
      });
      return {
        inspect: vi.fn(async () => ({ atlas: 'absent' })),
        inspectRealm: vi.fn(async () => ({ realm: 'sealed-empty' })),
        submit: vi.fn(),
        close: vi.fn(async () => undefined),
      };
    });
    const verifyFreshStatus = vi.fn(() => ({
      profile: 'warpkeep-genesis-002-fresh-publish-v1',
      zeroPopulationBoundary: true,
    }));
    const publishReceipt = Object.freeze({
      schemaVersion: 1 as const,
      profile: 'warpkeep-genesis-002-production-publish-v1' as const,
      databaseIdentity: DATABASE_IDENTITY,
      database: 'warpkeep-genesis-002' as const,
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1' as const,
      sourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
      deleteData: 'never' as const,
      outcome: 'verified' as const,
      freshStatusDigest: 'a'.repeat(64),
      playerAccessEnabled: false as const,
      admissionMutationsEnabled: false as const,
      atlasImportMutationsEnabled: true as const,
      atlasActivationMutationsEnabled: false as const,
      playerPresentationEnabled: false as const,
      publishReceiptDigest: 'b'.repeat(64),
    });
    const executePublish = vi.fn(async input => {
      expect(input.artifactPath).toBe('/dev/fd/3');
      expect(input.artifactDescriptor).toBe(3);
      expect(input.childEnvironment).toEqual({ PATH: '/usr/bin:/bin' });
      const fresh = await input.postflight(DATABASE_IDENTITY);
      expect(fresh).toMatchObject({ zeroPopulationBoundary: true });
      return publishReceipt;
    });
    const confirmationDigest = genesis002PublishConfirmationDigest({
      sourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    });
    const result = await executeGenesis002ProductionPublisherCli({
      arguments: ['publish', `--confirm=${confirmationDigest}`],
      environment,
      attestProtectedMain: () => MODULE_COMMIT,
      dependencies: {
        prepareArtifact: vi.fn(input => {
          expect(input.environment).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
          expect(input.environment).not.toHaveProperty(
            'WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT',
          );
          expect(input.environment).not.toHaveProperty(
            'WARPKEEP_SPACETIME_CLI_CONFIG_PATH',
          );
          expect(input.cliConfigSourcePath)
            .toBe('/private/source-spacetime-cli.toml');
          return built;
        }),
        executePublish,
        createTransport: createTransport as never,
        verifyFreshStatus,
      },
    });
    expect(result).toMatchObject({
      profile: 'warpkeep-genesis-002-production-publish-v1',
      publishReceiptDigest: 'b'.repeat(64),
      zeroPopulationPostflight: true,
    });
    expect(Object.keys(
      result.publishReceipt as Readonly<Record<string, unknown>>,
    )).toEqual([
      'schemaVersion',
      'profile',
      'databaseIdentity',
      'database',
      'moduleIdentity',
      'sourceCommit',
      'moduleSha256',
      'moduleTreeId',
      'dependencyClosureDigest',
      'spacetimeExecutableSha256',
      'spacetimeCliConfigSha256',
      'deleteData',
      'outcome',
      'freshStatusDigest',
      'playerAccessEnabled',
      'admissionMutationsEnabled',
      'atlasImportMutationsEnabled',
      'atlasActivationMutationsEnabled',
      'playerPresentationEnabled',
      'publishReceiptDigest',
    ]);
    expect(result.publishReceipt).toEqual(publishReceipt);
    expect(result.publishReceiptDigest).toBe(
      (result.publishReceipt as { publishReceiptDigest: string })
        .publishReceiptDigest,
    );
    expect(environment).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(executePublish).toHaveBeenCalledTimes(1);
    expect(verifyFreshStatus).toHaveBeenCalledTimes(1);
    expect(built.cleanup).toHaveBeenCalledTimes(1);
  });

  it('runs the top-level import through all seven atlas writers and emits the final sealed receipt', async () => {
    const transport = transitionTransport();
    const seam = importDependencies(transport);
    const confirmationDigest = genesis002ProductionImportConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      atlasSourceCommit: ATLAS_COMMIT,
      releaseSha256: RELEASE_SHA256,
      publicReleaseId: PUBLIC_RELEASE_ID,
      importEpoch: 1n,
    });
    const environment: NodeJS.ProcessEnv = {
      WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: '/private/cache',
      WARPKEEP_ADMIN_TOKEN_SECRET: ADMIN_SECRET,
    };
    const operation = executeGenesis002ProductionImportOperator({
      arguments: importArguments('apply', confirmationDigest),
      environment,
      attestProtectedMain: () => MODULE_COMMIT,
      dependencies: seam.dependencies as never,
    });
    const result = await operation;
    expect(result).toMatchObject({
      importReceipt: {
        outcome: 'ready',
        atlasId: 'GENESIS_002_GREATER_REALM',
        zeroPopulationBoundary: true,
        activationMutationsEnabled: false,
        atlasWritesClosedByFinalization: true,
        importReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      importReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      sealedLiveReceiptDigest: '9'.repeat(64),
      privacySafe: true,
      activationWrites: 'none',
      publicRootWrites: 'none',
    });
    expect(result.importReceiptDigest).toBe(
      (result.importReceipt as { importReceiptDigest: string })
        .importReceiptDigest,
    );
    expect(new Set(transport.reducers)).toEqual(new Set(
      Object.values(GENESIS_002_PRODUCTION_IMPORT_REDUCERS),
    ));
    expect(seam.verifyLiveStatus).toHaveBeenCalledTimes(1);
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(seam.built.cleanup).toHaveBeenCalledTimes(1);
  });

  it('makes a post-write import ambiguity terminal and never submits a second writer', async () => {
    const transport = transitionTransport(true);
    const seam = importDependencies(transport);
    const confirmationDigest = genesis002ProductionImportConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY,
      moduleSourceCommit: MODULE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      atlasSourceCommit: ATLAS_COMMIT,
      releaseSha256: RELEASE_SHA256,
      publicReleaseId: PUBLIC_RELEASE_ID,
      importEpoch: 1n,
    });
    await expect(executeGenesis002ProductionImportOperator({
      arguments: importArguments('apply', confirmationDigest),
      environment: {
        WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: '/private/cache',
        WARPKEEP_ADMIN_TOKEN_SECRET: ADMIN_SECRET,
      },
      attestProtectedMain: () => MODULE_COMMIT,
      dependencies: seam.dependencies as never,
    })).rejects.toMatchObject({
      code: 'GENESIS_002_PRODUCTION_IMPORT_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      submitted: true,
    });
    expect(transport.reducers).toEqual([
      GENESIS_002_PRODUCTION_IMPORT_REDUCERS.stage,
    ]);
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(seam.built.cleanup).toHaveBeenCalledTimes(1);
  });

  it('routes the checked-in CLI commands to the hardened operators and fails closed on invalid syntax', () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts['stdb:genesis002:publish:apply'])
      .toBe('tsx scripts/genesis002-production-publisher-cli.ts publish');
    expect(packageJson.scripts['stdb:genesis002:import'])
      .toBe('tsx scripts/genesis002-production-import-operator.ts');
    expect(packageJson.scripts['stdb:genesis002:verify-live'])
      .toBe('tsx scripts/genesis002-production-import-operator.ts inspect');

    const tsx = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
    for (const [script, expected] of [
      ['scripts/genesis002-production-publisher-cli.ts', 'GENESIS_002_PUBLISH_USAGE_INVALID'],
      ['scripts/genesis002-production-import-operator.ts',
        'GENESIS_002_PRODUCTION_IMPORT_ARGUMENT_INVALID'],
    ] as const) {
      const result = spawnSync(process.execPath, [tsx, resolve(repositoryRoot, script), 'invalid'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe(expected);
    }
  });
});
