// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_002_PRODUCTION_IMPORT_REDUCERS,
  GENESIS_002_PRODUCTION_IMPORT_TARGET,
  executeGenesis002ProductionImport,
  genesis002ProductionImportReceiptDigest,
  parseGenesis002ProductionImportArguments,
  projectGenesis002ProductionImportStatus,
} from '../scripts/genesis002-production-import-core';
import type { GreaterRealmRuntimeReleaseArtifacts } from '../scripts/atlas/greater-realm-runtime-release';

const SHA = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);
const RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const APPROVAL_ID = `GRA-${'B'.repeat(26)}`;

function importReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep.genesis-002.production-import.v1',
    outcome: 'ready',
    databaseIdentity: SHA,
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    moduleSourceCommit: COMMIT,
    moduleSha256: SHA,
    moduleTreeId: COMMIT,
    dependencyClosureDigest: SHA,
    spacetimeExecutableSha256: SHA,
    atlasId: 'GENESIS_002_GREATER_REALM',
    atlasSourceCommit: COMMIT,
    publicReleaseId: RELEASE_ID,
    expectedReleaseSha256: SHA,
    verificationDigest: 'c'.repeat(64),
    importEpoch: '1',
    operationsSubmitted: 16,
    operationChainDigest: 'd'.repeat(64),
    zeroPopulationBoundary: true,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    atlasWritesClosedByFinalization: true,
  } as const;
}

function artifacts(): GreaterRealmRuntimeReleaseArtifacts {
  const manifest = {
    schema: 'warpkeep.greater-realm.runtime-import-manifest.v1',
    classification: 'declassified-tier-i-runtime-import',
    atlasId: 'GENESIS_002_GREATER_REALM',
    publicReleaseId: RELEASE_ID,
    publicApprovalReceiptId: APPROVAL_ID,
    sourceCommit: COMMIT,
    generatorVersion: 'test-generator-v1',
    sourceFormatVersion: 'wkgr-runtime-source-v1',
    livingWorldVersion: 'test-living-world-v1',
    runtimePartitionVersion: 'axial-bin-15-tier-one-filter-v1',
    rendererContractVersion: 'greater-realm-renderer-v1',
    visibleTierMax: 1,
    totals: {
      regionCount: 1, componentCount: 1, chunkCount: 1, cellCount: 1,
      castleSlotCount: 600, resourceNodeCount: 1,
    },
    legacyLowlandsBridge: { exact: true },
    regions: [{
      regionId: 'T1_LOWLANDS', publicName: 'Lowlands', ordinal: 0, tier: 1,
      cellCount: 1, passableCellCount: 1, chunkCount: 1, castleCapacity: 600,
      resourceLocationCount: 1, resourceNodeCount: 1, foodNodeCount: 1,
      woodNodeCount: 0, stoneNodeCount: 0, goldNodeCount: 0, active: false,
    }],
    components: [{
      componentKey: 'GRC-AAAAAAAAAAAAAAAAAAAAAAAAAA', componentOrdinal: 0,
      regionMask: 1, rootCellKey: 'CELL-A', expectedCellCount: 1,
      maxRouteDepth: 1, expectedSlotCount: 600, expectedFoodNodeCount: 1,
      expectedWoodNodeCount: 0, expectedStoneNodeCount: 0,
      expectedGoldNodeCount: 0, componentSha256: SHA,
    }],
    chunks: [{ importOrdinal: 0 }],
    releaseSha256: SHA,
  };
  const payload = Object.freeze({
    cells: Object.freeze([Object.freeze({ passable: true })]),
    castleSlots: Object.freeze(Array.from({ length: 600 }, () => Object.freeze({}))),
    resourceNodes: Object.freeze([Object.freeze({})]),
  });
  const bytes = Buffer.from('{"test":true}\n');
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestBytes: Buffer.from(`${JSON.stringify(manifest)}\n`),
    status: Object.freeze({}),
    statusBytes: Buffer.from('{}\n'),
    chunks: Object.freeze([Object.freeze({ path: 'chunks/test.json', bytes, payload })]),
  }) as unknown as GreaterRealmRuntimeReleaseArtifacts;
}

function absentStatus() {
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

function fakeTransport(ambiguousAfterFirstWrite = false) {
  let status: Record<string, unknown> = { ...absentStatus() };
  let inspections = 0;
  let sequence = 0;
  const reducers: string[] = [];
  const nextDigest = (complete = false) => {
    sequence += 1;
    return complete
      ? sequence.toString(16).padStart(64, '0')
      : `sha256-v1:${sequence.toString(16).padStart(64, '0')}:${sequence.toString(16)}:`;
  };
  return {
    reducers,
    inspect: vi.fn(async () => {
      inspections += 1;
      if (ambiguousAfterFirstWrite && inspections === 3) throw new Error('link lost');
      return { ...status };
    }),
    prepareSubmission: vi.fn(async () => undefined),
    submit: vi.fn(async (reducer: string, args: Readonly<Record<string, unknown>>) => {
      reducers.push(reducer);
      if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.stage) {
        status = {
          ...status,
          present: true,
          atlasId: args.atlasId,
          publicReleaseId: args.publicReleaseId,
          publicApprovalReceiptId: args.publicApprovalReceiptId,
          sourceCommit: args.sourceCommit,
          expectedReleaseSha256: args.expectedReleaseSha256,
          releaseHeaderSha256: createHash('sha256')
            .update(String(args.releaseHeaderJson)).digest('hex'),
          state: 'importing',
          importEpoch: args.importEpoch,
          verificationDigest: nextDigest(),
          expectedRegionCount: args.expectedRegionCount,
          expectedComponentCount: args.expectedComponentCount,
          expectedChunkCount: args.expectedChunkCount,
          expectedCellCount: args.expectedCellCount,
          expectedSlotCount: args.expectedSlotCount,
          expectedResourceNodeCount: args.expectedResourceNodeCount,
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
          chunkRows: 1n, cellRows: 1n, slotRows: 600n, resourceRows: 1n,
          importedPassableCellCount: 1,
          importsExact: true,
          verificationDigest: nextDigest(),
        };
      } else if (reducer === GENESIS_002_PRODUCTION_IMPORT_REDUCERS.beginVerification) {
        status = {
          ...status,
          state: 'verifying', verificationPhase: 'components',
          verificationCursor: 0n, verificationDigest: nextDigest(),
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
      } else throw new Error('forbidden reducer');
    }),
  };
}

describe('Genesis 002 production atlas import boundary', () => {
  it('pins the exact domain-separated import receipt digest', () => {
    expect(genesis002ProductionImportReceiptDigest(importReceipt())).toBe(
      '36c643635e88e873f4073feb582f857ff59036bcd8b77f460d41596bb4de7ceb',
    );
    expect(genesis002ProductionImportReceiptDigest({
      ...importReceipt(),
      operationChainDigest: 'e'.repeat(64),
    })).not.toBe(
      '36c643635e88e873f4073feb582f857ff59036bcd8b77f460d41596bb4de7ceb',
    );
  });

  it('rejects reordered, missing, extra, or noncanonical import receipts', () => {
    const receipt = importReceipt();
    expect(() => genesis002ProductionImportReceiptDigest(
      Object.fromEntries(Object.entries(receipt).reverse()),
    )).toThrow('GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID');
    const { atlasSourceCommit: _atlasSourceCommit, ...missing } = receipt;
    expect(() => genesis002ProductionImportReceiptDigest(missing))
      .toThrow('GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID');
    expect(() => genesis002ProductionImportReceiptDigest({
      ...receipt,
      unexpected: true,
    })).toThrow('GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID');
    expect(() => genesis002ProductionImportReceiptDigest({
      ...receipt,
      importEpoch: '01',
    })).toThrow('GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID');
  });

  it('binds each import outcome to a canonical non-negative operation count', () => {
    for (const candidate of [
      { ...importReceipt(), operationsSubmitted: -0 },
      { ...importReceipt(), outcome: 'already-ready', operationsSubmitted: 1 },
      { ...importReceipt(), outcome: 'ready', operationsSubmitted: 0 },
      {
        ...importReceipt(),
        outcome: 'verified-after-submission-error',
        operationsSubmitted: 0,
      },
    ]) {
      expect(() => genesis002ProductionImportReceiptDigest(candidate))
        .toThrow('GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID');
    }
    expect(() => genesis002ProductionImportReceiptDigest({
      ...importReceipt(),
      outcome: 'already-ready',
      operationsSubmitted: 0,
    })).not.toThrow();
  });

  it('is permanently target-locked away from Genesis 001 and exposes only seven atlas writers', () => {
    expect(GENESIS_002_PRODUCTION_IMPORT_TARGET).toEqual({
      uri: 'https://maincloud.spacetimedb.com',
      bridge: 'https://auth.warpkeep.com',
      databaseAlias: 'warpkeep-genesis-002',
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
      genesis001DatabaseIdentity:
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      atlasId: 'GENESIS_002_GREATER_REALM',
      deleteData: 'never',
    });
    expect(Object.values(GENESIS_002_PRODUCTION_IMPORT_REDUCERS)).toEqual([
      'admin_stage_greater_realm_release_v1',
      'admin_import_greater_realm_components_v1',
      'admin_import_greater_realm_regions_v1',
      'admin_import_greater_realm_chunk_v1',
      'admin_begin_greater_realm_verification_v1',
      'admin_verify_greater_realm_batch_v1',
      'admin_finalize_greater_realm_release_v1',
    ]);
    expect(JSON.stringify(GENESIS_002_PRODUCTION_IMPORT_REDUCERS))
      .not.toMatch(/activat|public|admit|allow|found|player/iu);
  });

  it('requires an exact identity/digest-bound apply confirmation', () => {
    const values = [
      'apply',
      `--database-identity=${SHA}`,
      `--module-source-commit=${COMMIT}`,
      `--module-sha256=${SHA}`,
      `--module-tree-id=${COMMIT}`,
      `--dependency-closure-digest=${SHA}`,
      `--spacetime-executable-sha256=${SHA}`,
      `--atlas-source-commit=${COMMIT}`,
      `--release-sha256=${SHA}`,
      `--confirm=${SHA}`,
    ];
    expect(parseGenesis002ProductionImportArguments(values)).toMatchObject({
      command: 'apply',
      databaseIdentity: SHA,
      moduleSourceCommit: COMMIT,
      moduleSha256: SHA,
      moduleTreeId: COMMIT,
      dependencyClosureDigest: SHA,
      spacetimeExecutableSha256: SHA,
      atlasSourceCommit: COMMIT,
      releaseSha256: SHA,
      confirmationDigest: SHA,
    });
    expect(() => parseGenesis002ProductionImportArguments(values.slice(0, -1)))
      .toThrow('GENESIS_002_PRODUCTION_IMPORT_ARGUMENT_INVALID');
    expect(() => parseGenesis002ProductionImportArguments([
      ...values.slice(0, 1),
      `--database-identity=${GENESIS_002_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity}`,
      ...values.slice(2),
    ])).toThrow('GENESIS_002_PRODUCTION_IMPORT_TARGET_COLLIDES_WITH_GENESIS_001');
  });

  it('strictly projects the server boundary and rejects any population, activation, or shape drift', () => {
    expect(projectGenesis002ProductionImportStatus(absentStatus())).toMatchObject({
      present: false,
      atlasId: undefined,
      claimRows: 0n,
      occupancyRows: 0n,
      activationRows: 0n,
      workerSystemRows: 0n,
      importMutationsCompiled: true,
      activationMutationsCompiled: false,
    });
    for (const field of [
      'claimRows', 'occupancyRows', 'activationRows', 'publicAtlasRows',
      'publicRegionRows', 'workerSystemRows',
    ] as const) {
      expect(() => projectGenesis002ProductionImportStatus({
        ...absentStatus(),
        [field]: 1n,
      })).toThrow('GENESIS_002_PRODUCTION_IMPORT_ZERO_BOUNDARY_VIOLATED');
    }
    expect(() => projectGenesis002ProductionImportStatus({
      ...absentStatus(),
      unexpected: true,
    })).toThrow('GENESIS_002_PRODUCTION_IMPORT_STATUS_SHAPE_CHANGED');
    expect(() => projectGenesis002ProductionImportStatus({
      ...absentStatus(),
      activationMutationsCompiled: true,
    })).toThrow('GENESIS_002_PRODUCTION_IMPORT_POLICY_INVALID');
  });

  it('drives only the bounded seven-step atlas surface to finalized ready state', async () => {
    const transport = fakeTransport();
    const receipt = await executeGenesis002ProductionImport({
      artifacts: artifacts(),
      databaseIdentity: SHA,
      moduleSourceCommit: COMMIT,
      moduleSha256: SHA,
      moduleTreeId: COMMIT,
      dependencyClosureDigest: SHA,
      spacetimeExecutableSha256: SHA,
      importEpoch: 1n,
      publicName: 'The Greater Realm',
      transport,
      assertCanStartWrite: () => undefined,
      testOnlyVerifyArtifacts: () => undefined,
    });
    expect(receipt).toMatchObject({
      profile: 'warpkeep.genesis-002.production-import.v1',
      outcome: 'ready',
      atlasId: 'GENESIS_002_GREATER_REALM',
      atlasSourceCommit: COMMIT,
      expectedReleaseSha256: SHA,
      zeroPopulationBoundary: true,
      activationMutationsEnabled: false,
      playerPresentationEnabled: false,
      atlasWritesClosedByFinalization: true,
      importReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(new Set(transport.reducers)).toEqual(new Set(
      Object.values(GENESIS_002_PRODUCTION_IMPORT_REDUCERS),
    ));
    expect(transport.reducers).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/activat|admit|allow|player|found/iu),
    ]));
  });

  it('marks a lost post-write inspection as ambiguous and never submits again', async () => {
    const transport = fakeTransport(true);
    await expect(executeGenesis002ProductionImport({
      artifacts: artifacts(),
      databaseIdentity: SHA,
      moduleSourceCommit: COMMIT,
      moduleSha256: SHA,
      moduleTreeId: COMMIT,
      dependencyClosureDigest: SHA,
      spacetimeExecutableSha256: SHA,
      importEpoch: 1n,
      publicName: 'The Greater Realm',
      transport,
      assertCanStartWrite: () => undefined,
      testOnlyVerifyArtifacts: () => undefined,
    })).rejects.toMatchObject({
      code: 'GENESIS_002_PRODUCTION_IMPORT_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      submitted: true,
    });
    expect(transport.reducers).toEqual([
      GENESIS_002_PRODUCTION_IMPORT_REDUCERS.stage,
    ]);
  });
});
