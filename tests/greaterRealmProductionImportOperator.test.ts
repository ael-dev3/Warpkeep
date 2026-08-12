// @vitest-environment node

import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  executeGreaterRealmProductionImport,
  GREATER_REALM_PRODUCTION_IMPORT_REDUCERS,
  projectGreaterRealmProductionImportStatus,
  type GreaterRealmProductionImportStatus,
} from '../scripts/greater-realm-production-import-core';
import type {
  GreaterRealmRuntimeReleaseArtifacts,
} from '../scripts/atlas/greater-realm-runtime-release';
import type { GreaterRealmProductionCutoverStatus } from '../scripts/greater-realm-production-relocation-core';
import {
  greaterRealmProductionImportOperatorTestSeams,
  parseGreaterRealmProductionImportArguments,
} from '../scripts/greater-realm-production-import-operator';
import { withGreaterRealmCutoverOperatorLock } from '../scripts/greater-realm-cutover-receipts';

const DIGEST = 'a'.repeat(64);
const VERIFY_DIGEST = 'b'.repeat(64);
const IMPORT_EPOCH = 7n;
const ATLAS_SOURCE_COMMIT = 'c'.repeat(40);
const MODULE_SOURCE_COMMIT = 'e'.repeat(40);

function artifacts(): GreaterRealmRuntimeReleaseArtifacts {
  const manifest = {
    schema: 'warpkeep.greater-realm.runtime-import-manifest.v1',
    classification: 'declassified-tier-i-runtime-import',
    atlasId: 'GREATER_REALM_V1',
    publicReleaseId: 'GRR-AAAAAAAAAAAAAAAAAAAAAAAAAA',
    publicApprovalReceiptId: 'GRA-BBBBBBBBBBBBBBBBBBBBBBBBBB',
    sourceCommit: ATLAS_SOURCE_COMMIT,
    generatorVersion: 'test-generator-v1',
    sourceFormatVersion: 'wkgr-runtime-source-v1',
    livingWorldVersion: 'test-living-world-v1',
    runtimePartitionVersion: 'axial-bin-15-tier-one-filter-v1',
    rendererContractVersion: 'greater-realm-renderer-v1',
    visibleTierMax: 1,
    totals: {
      regionCount: 1,
      componentCount: 1,
      chunkCount: 2,
      cellCount: 600,
      castleSlotCount: 600,
      resourceNodeCount: 2,
    },
    legacyLowlandsBridge: { exact: true },
    regions: [{
      regionId: 'T1_LOWLANDS', publicName: 'Lowlands', ordinal: 0, tier: 1,
      cellCount: 600, passableCellCount: 600, chunkCount: 2, castleCapacity: 600,
      resourceLocationCount: 2, resourceNodeCount: 2, foodNodeCount: 1,
      woodNodeCount: 1, stoneNodeCount: 0, goldNodeCount: 0, active: false,
    }],
    components: [{
      componentKey: 'GRC-AAAAAAAAAAAAAAAAAAAAAAAAAA', componentOrdinal: 0,
      regionMask: 1, rootCellKey: 'CELL-A', expectedCellCount: 600,
      maxRouteDepth: 1, expectedSlotCount: 600, expectedFoodNodeCount: 1,
      expectedWoodNodeCount: 1, expectedStoneNodeCount: 0,
      expectedGoldNodeCount: 0, componentSha256: DIGEST,
    }],
    chunks: [{ importOrdinal: 0 }, { importOrdinal: 1 }],
    releaseSha256: DIGEST,
  };
  const chunks = [0, 1].map(index => {
    const bytes = Buffer.from(`{"chunk":${index}}\n`, 'utf8');
    return Object.freeze({
      path: `chunks/${index}.json`,
      bytes,
      payload: Object.freeze({
        importOrdinal: index,
        cells: Object.freeze(Array.from({ length: 300 }, () => Object.freeze({ passable: true }))),
        castleSlots: Object.freeze(Array.from({ length: 300 }, () => Object.freeze({}))),
        resourceNodes: Object.freeze([Object.freeze({})]),
      }) as never,
    });
  });
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestBytes: Buffer.from(`${JSON.stringify(manifest)}\n`),
    status: Object.freeze({}),
    statusBytes: Buffer.from('{}\n'),
    chunks: Object.freeze(chunks),
  });
}

function absentStatus(): GreaterRealmProductionImportStatus {
  return Object.freeze({
    present: false,
    atlasId: undefined,
    publicReleaseId: undefined,
    state: 'absent',
    importEpoch: undefined,
    verificationPhase: 'components',
    verificationCursor: 0n,
    verificationDigest: 'sha256-v1:' + '0'.repeat(64) + ':0:',
    expectedComponentCount: 0,
    expectedChunkCount: 0,
    expectedCellCount: 0,
    expectedSlotCount: 0,
    expectedResourceNodeCount: 0,
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
  });
}

function projectedAuthorityStatus(value: unknown): GreaterRealmProductionCutoverStatus {
  const status = value as GreaterRealmProductionImportStatus & Readonly<Record<string, unknown>>;
  const manifest = artifacts().manifest;
  const headerKeys = [
    'schema', 'classification', 'atlasId', 'publicReleaseId',
    'publicApprovalReceiptId', 'sourceCommit', 'generatorVersion',
    'sourceFormatVersion', 'livingWorldVersion', 'runtimePartitionVersion',
    'rendererContractVersion', 'visibleTierMax', 'totals', 'legacyLowlandsBridge',
  ];
  const header = `${JSON.stringify(Object.fromEntries(
    headerKeys.map(key => [key, manifest[key]]),
  ))}\n`;
  return {
    importMutationsCompiled: status.importMutationsCompiled,
    activationMutationsCompiled: status.activationMutationsCompiled,
    releaseRows: status.present ? 1n : 0n,
    releasePresent: status.present,
    releaseState: status.state,
    atlasId: status.atlasId,
    publicReleaseId: status.publicReleaseId,
    importEpoch: status.importEpoch,
    componentRows: status.componentRows,
    chunkRows: status.chunkRows,
    cellRows: status.cellRows,
    slotRows: status.slotRows,
    resourceNodeRows: status.resourceRows,
    regionManifestRows: status.regionManifestRows,
    greaterRealmClaimRows: status.claimRows,
    greaterRealmOccupancyRows: status.occupancyRows,
    activationRows: status.activationRows,
    atlasRows: status.publicAtlasRows,
    visibleRegionRows: status.publicRegionRows,
    workerSystemV2Rows: status.workerSystemRows,
    releaseImportsExact: status.importsExact,
    releaseReady: status.ready,
    sourceCommit: status.present ? manifest.sourceCommit as string : undefined,
    expectedReleaseSha256: status.present ? manifest.releaseSha256 as string : undefined,
    releaseHeaderSha256: status.present
      ? createHash('sha256').update(header).digest('hex')
      : undefined,
    expectedRegionCount: status.present ? 1 : 0,
    expectedComponentCount: status.expectedComponentCount,
    expectedChunkCount: status.expectedChunkCount,
    expectedCellCount: status.expectedCellCount,
    expectedSlotCount: status.expectedSlotCount,
    expectedResourceNodeCount: status.expectedResourceNodeCount,
    verificationPhase: status.present ? status.verificationPhase : 'absent',
    verificationCursor: status.verificationCursor,
    verificationDigest: status.verificationDigest,
    componentExpectedCellCount: status.componentExpectedCellCount ?? 0,
    componentExpectedSlotCount: status.componentExpectedSlotCount ?? 0,
    componentExpectedResourceNodeCount: status.componentExpectedResourceNodeCount ?? 0,
    importedPassableCellCount: status.importedPassableCellCount ?? 0,
    verifiedComponentCount: status.verifiedComponentCount ?? 0,
    verifiedChunkCount: status.verifiedChunkCount ?? 0,
    verifiedCellCount: status.verifiedCellCount ?? 0,
    verifiedSlotCount: status.verifiedSlotCount ?? 0,
    verifiedResourceNodeCount: status.verifiedResourceNodeCount ?? 0,
  } as GreaterRealmProductionCutoverStatus;
}

function testDependencies() {
  return Object.freeze({
    verifyArtifacts: vi.fn(),
    projectAuthorityStatus: vi.fn(projectedAuthorityStatus),
  });
}

function importingStatus(): GreaterRealmProductionImportStatus {
  const manifest = artifacts().manifest as Readonly<{
    atlasId: string;
    publicReleaseId: string;
    totals: Readonly<{
      componentCount: number;
      chunkCount: number;
      cellCount: number;
      castleSlotCount: number;
      resourceNodeCount: number;
    }>;
  }>;
  return Object.freeze({
    ...absentStatus(),
    present: true,
    atlasId: manifest.atlasId,
    publicReleaseId: manifest.publicReleaseId,
    state: 'importing',
    importEpoch: IMPORT_EPOCH,
    expectedComponentCount: manifest.totals.componentCount,
    expectedChunkCount: manifest.totals.chunkCount,
    expectedCellCount: manifest.totals.cellCount,
    expectedSlotCount: manifest.totals.castleSlotCount,
    expectedResourceNodeCount: manifest.totals.resourceNodeCount,
  });
}

function fakeTransport(options: Readonly<{
  throwAfterReducer?: string;
  throwBeforeReducer?: string;
  initialStatus?: GreaterRealmProductionImportStatus;
  afterReducer?: (reducer: string, submissionCount: number) => void;
}> = {}) {
  let status = { ...(options.initialStatus ?? absentStatus()) };
  let digestSequence = 0;
  const authorityProgress: Record<string, number> = {
    componentExpectedCellCount: 0,
    componentExpectedSlotCount: 0,
    componentExpectedResourceNodeCount: 0,
    importedPassableCellCount: 0,
    verifiedComponentCount: 0,
    verifiedChunkCount: 0,
    verifiedCellCount: 0,
    verifiedSlotCount: 0,
    verifiedResourceNodeCount: 0,
  };
  const submissions: string[] = [];
  const inspect = vi.fn(async () => ({ ...status }));
  const inspectAuthority = vi.fn(async () => ({ ...status, ...authorityProgress }));
  const nextDigest = (complete = false): string => {
    digestSequence += 1;
    return complete
      ? digestSequence.toString(16).padStart(64, '0')
      : `sha256-v1:${digestSequence.toString(16).padStart(64, '0')}:${digestSequence}:`;
  };
  const apply = (reducer: string) => {
    const authority = artifacts().manifest as Readonly<{
      atlasId: string;
      publicReleaseId: string;
      totals: Readonly<{
        componentCount: number;
        chunkCount: number;
        cellCount: number;
        castleSlotCount: number;
        resourceNodeCount: number;
      }>;
    }>;
    const totals = authority.totals;
    switch (reducer) {
      case GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.stage:
        status = {
          ...status,
          present: true,
          atlasId: authority.atlasId,
          publicReleaseId: authority.publicReleaseId,
          state: 'importing',
          importEpoch: IMPORT_EPOCH,
          expectedComponentCount: totals.componentCount,
          expectedChunkCount: totals.chunkCount,
          expectedCellCount: totals.cellCount,
          expectedSlotCount: totals.castleSlotCount,
          expectedResourceNodeCount: totals.resourceNodeCount,
          verificationDigest: nextDigest(),
        };
        break;
      case GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.components:
        status = { ...status, componentRows: 1n };
        authorityProgress.componentExpectedCellCount = totals.cellCount;
        authorityProgress.componentExpectedSlotCount = totals.castleSlotCount;
        authorityProgress.componentExpectedResourceNodeCount = totals.resourceNodeCount;
        break;
      case GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.regions:
        status = { ...status, regionManifestRows: 1 };
        break;
      case GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.chunk: {
        const chunk = artifacts().chunks[Number(status.chunkRows)]!;
        const next = status.chunkRows + 1n;
        status = {
          ...status,
          chunkRows: next,
          cellRows: status.cellRows + BigInt(chunk.payload.cells.length),
          slotRows: status.slotRows + BigInt(chunk.payload.castleSlots.length),
          resourceRows: status.resourceRows + BigInt(chunk.payload.resourceNodes.length),
          importsExact: next === 2n,
        };
        authorityProgress.importedPassableCellCount += chunk.payload.cells
          .filter(cell => cell.passable).length;
        break;
      }
      case GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.beginVerification:
        status = {
          ...status,
          state: 'verifying',
          verificationPhase: 'components',
          verificationCursor: 0n,
          verificationDigest: nextDigest(),
        };
        break;
      case GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.verifyBatch: {
        const order = [
          'components', 'chunks', 'cells', 'component-slots', 'slots',
          'component-resources', 'resources', 'component-finalize', 'complete',
        ] as const;
        const phase = status.verificationPhase;
        const total = phase === 'components' || phase === 'component-slots'
          || phase === 'component-resources' || phase === 'component-finalize'
          ? status.expectedComponentCount
          : phase === 'chunks' ? status.expectedChunkCount
            : phase === 'cells' ? status.expectedCellCount
              : phase === 'slots' ? status.expectedSlotCount
                : status.expectedResourceNodeCount;
        const start = Number(status.verificationCursor);
        const end = Math.min(total, start + 256);
        const reachedEnd = end === total;
        const nextPhase = reachedEnd ? order[order.indexOf(phase) + 1]! : phase;
        const verifiedField = phase === 'components' ? 'verifiedComponentCount'
          : phase === 'chunks' ? 'verifiedChunkCount'
            : phase === 'cells' ? 'verifiedCellCount'
              : phase === 'slots' ? 'verifiedSlotCount'
                : phase === 'resources' ? 'verifiedResourceNodeCount'
                  : undefined;
        if (verifiedField !== undefined) authorityProgress[verifiedField] = end;
        status = {
          ...status,
          verificationPhase: nextPhase,
          verificationCursor: BigInt(reachedEnd ? 0 : end),
          verificationDigest: nextDigest(nextPhase === 'complete'),
        };
        break;
      }
      case GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.finalize:
        status = {
          ...status,
          state: 'ready',
          verificationCursor: 0n,
          ready: true,
        };
        break;
      default:
        throw new Error('unexpected reducer');
    }
  };
  const submit = vi.fn(async (
    reducer: string,
    _arguments: Readonly<Record<string, unknown>>,
  ) => {
    submissions.push(reducer);
    if (options.throwBeforeReducer === reducer) throw new Error('transport rejected');
    apply(reducer);
    options.afterReducer?.(reducer, submissions.length);
    if (options.throwAfterReducer === reducer) throw new Error('response lost');
  });
  return {
    inspect,
    inspectAuthority,
    submit,
    submissions,
    readStatus: () => status,
  };
}

async function execute(transport = fakeTransport()) {
  const receipt = await executeGreaterRealmProductionImport({
    artifacts: artifacts(),
    moduleSourceCommit: MODULE_SOURCE_COMMIT,
    importEpoch: IMPORT_EPOCH,
    publicName: 'The Greater Realm',
    transport,
    assertCanStartWrite: () => undefined,
    testOnlyDependencies: testDependencies(),
  });
  return { receipt, transport };
}

describe('Greater Realm production runtime-release importer', () => {
  it('accepts only read-only inspect or explicitly confirmed apply', () => {
    expect(parseGreaterRealmProductionImportArguments(['inspect']))
      .toEqual({ command: 'inspect', confirmed: false });
    expect(parseGreaterRealmProductionImportArguments(['apply', '--confirm']))
      .toEqual({ command: 'apply', confirmed: true });
    for (const arguments_ of [
      [] as string[], ['apply'], ['inspect', '--confirm'], ['apply', '--confirm', '--confirm'],
    ]) expect(() => parseGreaterRealmProductionImportArguments(arguments_)).toThrow(/USAGE/);
  });

  it('derives bounded manifest batches and reaches exact import-only ready state', async () => {
    const { receipt, transport } = await execute();
    expect(receipt).toMatchObject({
      outcome: 'ready',
      atlasSourceCommit: ATLAS_SOURCE_COMMIT,
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      operationsSubmitted: 19,
      postcondition: 'ready-import-only',
      verificationDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(transport.submissions).toEqual([
      GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.stage,
      GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.components,
      GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.regions,
      GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.chunk,
      GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.chunk,
      GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.beginVerification,
      ...Array.from(
        { length: 12 },
        () => GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.verifyBatch,
      ),
      GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.finalize,
    ]);
    expect(transport.inspect).toHaveBeenCalledTimes(39);
    expect(transport.inspectAuthority).toHaveBeenCalledTimes(39);
    expect(transport.submit.mock.calls[1]![1]).toMatchObject({
      rows: [expect.objectContaining({ componentKey: expect.any(String) })],
    });
    expect(transport.submit.mock.calls[2]![1]).toMatchObject({
      rows: [expect.objectContaining({ regionId: 'T1_LOWLANDS' })],
    });
    for (const call of transport.submit.mock.calls.filter(
      ([reducer]) => reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.chunk,
    )) {
      expect(call[1]).toMatchObject({
        payloadSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        payloadJson: expect.stringMatching(/\n$/),
      });
    }
  });

  it('reconciles a committed mutation whose transport response was lost', async () => {
    const transport = fakeTransport({
      throwAfterReducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.chunk,
    });
    const result = await execute(transport);
    expect(result.receipt.outcome).toBe('verified-after-submission-error');
    expect(result.receipt.operationsSubmitted).toBe(19);
  });

  it('reconciles an in-flight write after SIGTERM but refuses to start the next write', async () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), 'warpkeep-gr-import-signal-'),
    );
    chmodSync(directory, 0o700);
    const transport = fakeTransport({
      afterReducer: (_reducer, submissionCount) => {
        if (submissionCount === 1) process.emit('SIGTERM');
      },
    });
    try {
      await expect(withGreaterRealmCutoverOperatorLock({
        directory,
        repositoryRoot: process.cwd(),
        operation: control => executeGreaterRealmProductionImport({
          artifacts: artifacts(),
          moduleSourceCommit: MODULE_SOURCE_COMMIT,
          importEpoch: IMPORT_EPOCH,
          publicName: 'The Greater Realm',
          transport,
          assertCanStartWrite: control.assertCanStartWrite,
          testOnlyDependencies: testDependencies(),
        }),
      })).rejects.toThrow(/GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGTERM/);
      expect(transport.submit).toHaveBeenCalledTimes(1);
      expect(transport.submissions).toEqual([
        GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.stage,
      ]);
      // Initial + first prewrite + first postflight + second prewrite. The
      // reconciled first mutation is observed before the second permit fails.
      expect(transport.inspect).toHaveBeenCalledTimes(4);
      expect(transport.inspectAuthority).toHaveBeenCalledTimes(4);
      expect(transport.readStatus()).toMatchObject({
        present: true,
        state: 'importing',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('accepts repeated same-command verification progress and reconciles lost responses', async () => {
    const transport = fakeTransport({
      throwAfterReducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.verifyBatch,
    });
    const result = await execute(transport);
    const verifyCalls = transport.submit.mock.calls.filter(
      ([reducer]) => reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.verifyBatch,
    );
    expect(verifyCalls).toHaveLength(12);
    expect(new Set(verifyCalls.map(([, arguments_]) => JSON.stringify(
      arguments_,
      (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    ))).size).toBe(1);
    expect(result.receipt).toMatchObject({
      outcome: 'verified-after-submission-error',
      operationsSubmitted: 19,
      verificationDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('never retries blind when a failed submission did not advance authority', async () => {
    const transport = fakeTransport({
      throwBeforeReducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.components,
    });
    await expect(execute(transport)).rejects.toMatchObject({
      code: 'GREATER_REALM_PRODUCTION_IMPORT_MUTATION_REJECTED_OR_UNCOMMITTED',
      submitted: true,
    });
    expect(transport.submissions.filter(
      reducer => reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.components,
    )).toHaveLength(1);
  });

  it('fails before writes on activation-capable, drifted, or widened status', async () => {
    for (const changed of [
      { activationMutationsCompiled: true },
      { publicAtlasRows: 1n },
      { unexpectedPrivateField: 'must-fail' },
    ]) {
      const inspect = vi.fn(async () => ({ ...absentStatus(), ...changed }));
      const inspectAuthority = vi.fn(async () => ({ ...absentStatus(), ...changed }));
      const submit = vi.fn();
      await expect(executeGreaterRealmProductionImport({
        artifacts: artifacts(),
        moduleSourceCommit: MODULE_SOURCE_COMMIT,
        importEpoch: IMPORT_EPOCH,
        publicName: 'The Greater Realm',
        transport: { inspect, inspectAuthority, submit },
        assertCanStartWrite: () => undefined,
        testOnlyDependencies: testDependencies(),
      })).rejects.toBeInstanceOf(Error);
      expect(submit).not.toHaveBeenCalled();
    }
  });

  it('binds every resumable checkpoint to the manifest source and release hashes', async () => {
    const transport = fakeTransport({ initialStatus: importingStatus() });
    await expect(executeGreaterRealmProductionImport({
      artifacts: artifacts(),
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      importEpoch: IMPORT_EPOCH,
      publicName: 'The Greater Realm',
      transport,
      assertCanStartWrite: () => undefined,
      testOnlyDependencies: {
        verifyArtifacts: vi.fn(),
        projectAuthorityStatus: value => ({
          ...projectedAuthorityStatus(value),
          sourceCommit: 'e'.repeat(40),
        }),
      },
    })).rejects.toMatchObject({
      code: 'GREATER_REALM_PRODUCTION_IMPORT_AUTHORITY_STATUS_MISMATCH',
      submitted: false,
    });
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('rejects an unverified module commit without equating it to atlas provenance', async () => {
    const transport = fakeTransport();
    await expect(executeGreaterRealmProductionImport({
      artifacts: artifacts(),
      moduleSourceCommit: 'not-a-commit',
      importEpoch: IMPORT_EPOCH,
      publicName: 'The Greater Realm',
      transport,
      assertCanStartWrite: () => undefined,
      testOnlyDependencies: testDependencies(),
    })).rejects.toMatchObject({ code: 'GREATER_REALM_PRODUCTION_IMPORT_INPUT_INVALID' });
    expect(transport.inspect).not.toHaveBeenCalled();
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('strictly rejects noncanonical u64s, extra keys, and inconsistent absence', () => {
    expect(() => projectGreaterRealmProductionImportStatus({
      ...absentStatus(),
      componentRows: -1n,
    })).toThrow(/STATUS_INVALID/);
    expect(() => projectGreaterRealmProductionImportStatus({
      ...absentStatus(),
      extra: createHash('sha256').update('private').digest('hex'),
    })).toThrow(/SHAPE_CHANGED/);
    expect(() => projectGreaterRealmProductionImportStatus({
      ...absentStatus(),
      componentRows: 1n,
    })).toThrow(/STATUS_INCONSISTENT/);
  });

  it('reconstructs a truthful recovery receipt from the terminal snapshot and full operation chain without executing a driver', () => {
    const reconstruct = greaterRealmProductionImportOperatorTestSeams
      .reconstructRecoveredImportReceipt;
    const sourceRelease = Object.freeze({
      atlasSourceCommit: ATLAS_SOURCE_COMMIT,
      moduleSourceCommit: MODULE_SOURCE_COMMIT,
      atlasId: 'GREATER_REALM_V1',
      publicReleaseId: 'GRR-AAAAAAAAAAAAAAAAAAAAAAAAAA',
      expectedReleaseSha256: DIGEST,
    });
    const terminal = Object.freeze({
      state: 'ready', verificationPhase: 'complete', verificationCursor: '0',
      verificationDigest: VERIFY_DIGEST, importsExact: true, ready: true,
    });
    const audit = Object.freeze({
      releaseState: 'ready', verificationPhase: 'complete', verificationCursor: '0',
      verificationDigest: VERIFY_DIGEST, releaseImportsExact: true, releaseReady: true,
      auditRows: '9',
    });
    const result = reconstruct({
      command: Object.freeze({ kind: 'import', name: 'apply' }),
      sourceRelease,
      beforeStatus: Object.freeze({ ...terminal, state: 'verifying', ready: false }),
      beforeAudit: Object.freeze({ ...audit, releaseState: 'verifying', releaseReady: false }),
      afterStatus: terminal,
      afterAudit: audit,
      operations: Object.freeze([Object.freeze({
        operationOrdinal: 1,
        planDigest: '1'.repeat(64),
        operation: Object.freeze({
          kind: 'reducer', name: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.finalize,
          argumentsDigest: '2'.repeat(64), argumentsByteLength: 2, argumentsRedacted: true,
          identity: Object.freeze({
            reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.finalize,
            importEpoch: '1',
          }),
        }),
        beforeStatus: Object.freeze({}), beforeAudit: Object.freeze({}),
        afterStatus: Object.freeze({}), afterAudit: Object.freeze({}),
        outcome: 'recovered-after-owner-death',
        completionReceiptDigest: '3'.repeat(64),
      })]),
      operationReceiptChainDigest: '3'.repeat(64),
      operationReceiptCount: 1,
      outcome: 'recovered-after-owner-death',
    });
    expect(result.record).toMatchObject({
      outcome: 'verified-after-submission-error',
      verificationDigest: VERIFY_DIGEST,
      operationsSubmitted: 1,
      operationReceiptCount: 1,
    });
  });
});
