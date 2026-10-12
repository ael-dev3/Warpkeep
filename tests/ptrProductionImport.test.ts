// @vitest-environment node

import { createHash } from 'node:crypto';
import { Sha256, updateLengthFramedSha256 } from '../spacetimedb/ptr/src/sha256';
import { greaterRealmProductionImportEngine } from '../scripts/greater-realm-production-import-core';

import { describe, expect, it, vi } from 'vitest';

import { ptrInitialAtlasTargets } from '../scripts/ptr-initial-owner-atlas-operator';

import type { GreaterRealmRuntimeReleaseArtifacts } from '../scripts/atlas/greater-realm-runtime-release';
import {
  PTR_PRODUCTION_IMPORT_REDUCERS,
  PTR_PRODUCTION_IMPORT_TARGET,
  executePtrProductionImport,
  assertPtrProductionInitialStagedStatus,
  assertPtrProductionInitialTerrainPrefixStatus,
  parsePtrProductionImportArguments,
  projectPtrProductionStatus,
  ptrProductionImportConfirmationDigest,
} from '../scripts/ptr-production-import-core';

const DATABASE_IDENTITY = '1'.repeat(64);
const G002_IDENTITY = '2'.repeat(64);
const SOURCE_COMMIT = 'a'.repeat(40);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_DIGEST = 'd'.repeat(64);
const SPACETIME_DIGEST = 'e'.repeat(64);
const SPACETIME_CLI_CONFIG_DIGEST = '0'.repeat(64);
const PUBLISH_RECEIPT_DIGEST = '1'.repeat(64);
const RELEASE_SHA256 = 'f'.repeat(64);
const PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const APPROVAL_ID = `GRA-${'B'.repeat(26)}`;

function artifacts(): GreaterRealmRuntimeReleaseArtifacts {
  const manifest = {
    schema: 'warpkeep.greater-realm.runtime-import-manifest.v1',
    classification: 'declassified-tier-i-runtime-import',
    atlasId: 'PTR_GREATER_REALM',
    publicReleaseId: PUBLIC_RELEASE_ID,
    publicApprovalReceiptId: APPROVAL_ID,
    sourceCommit: SOURCE_COMMIT,
    generatorVersion: 'test-generator-v1',
    sourceFormatVersion: 'wkgr-runtime-source-v1',
    livingWorldVersion: 'test-living-world-v1',
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
  const bytes = Buffer.from('{"ptr-test":true}\n');
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestBytes: Buffer.from(`${JSON.stringify(manifest)}\n`),
    status: Object.freeze({}),
    statusBytes: Buffer.from('{}\n'),
    chunks: Object.freeze([Object.freeze({
      path: 'chunks/ptr-test.json',
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
    ownerProvisioned: false,
    ownerEnabled: false,
  } as const;
}

function transitionTransport(initial: Record<string, unknown> = absentStatus()) {
  let status: Record<string, unknown> = { ...initial };
  let sequence = 0;
  const submissions: Array<Readonly<{
    reducer: string;
    arguments: Readonly<Record<string, unknown>>;
  }>> = [];
  const nextDigest = (complete = false) => {
    sequence += 1;
    return complete
      ? sequence.toString(16).padStart(64, '0')
      : `sha256-v1:${sequence.toString(16).padStart(64, '0')}:${sequence}:`;
  };
  return {
    submissions,
    inspect: vi.fn(async () => ({ ...status })),
    prepareSubmission: vi.fn(async () => undefined),
    submit: vi.fn(async (
      reducer: string,
      arguments_: Readonly<Record<string, unknown>>,
    ) => {
      submissions.push({ reducer, arguments: arguments_ });
      expect(arguments_).toMatchObject({
        ptrReleaseVersion: '0.4.0-ptr.1',
        ptrModuleIdentity: 'warpkeep-ptr-owner-view-v1',
      });
      if (reducer === PTR_PRODUCTION_IMPORT_REDUCERS.stage) {
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
      } else if (reducer === PTR_PRODUCTION_IMPORT_REDUCERS.components) {
        status = {
          ...status,
          componentRows: 1n,
          componentExpectedCellCount: 1,
          componentExpectedSlotCount: 600,
          componentExpectedResourceNodeCount: 1,
        };
      } else if (reducer === PTR_PRODUCTION_IMPORT_REDUCERS.regions) {
        status = { ...status, regionManifestRows: 1 };
      } else if (reducer === PTR_PRODUCTION_IMPORT_REDUCERS.chunk) {
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
      } else if (reducer === PTR_PRODUCTION_IMPORT_REDUCERS.beginVerification) {
        status = {
          ...status,
          state: 'verifying',
          verificationPhase: 'components',
          verificationCursor: 0n,
          verificationDigest: nextDigest(),
        };
      } else if (reducer === PTR_PRODUCTION_IMPORT_REDUCERS.verifyBatch) {
        const phases = [
          'components', 'chunks', 'cells', 'component-slots', 'slots',
          'component-resources', 'resources', 'component-finalize', 'complete',
        ];
        const phase = String(status.verificationPhase);
        const total = phase === 'slots' ? 600 : 1;
        const start = Number(status.verificationCursor);
        const end = Math.min(total, start + 256);
        const complete = end === total;
        const nextPhase = complete ? phases[phases.indexOf(phase) + 1]! : phase;
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
      } else if (reducer === PTR_PRODUCTION_IMPORT_REDUCERS.finalize) {
        status = { ...status, state: 'ready', ready: true };
      } else {
        throw new Error(`unexpected reducer ${reducer}`);
      }
    }),
  };
}

describe('PTR production atlas import core', () => {
  it('pins the exact target and seven-reducer import allowlist', () => {
    expect(PTR_PRODUCTION_IMPORT_TARGET).toEqual({
      uri: 'https://maincloud.spacetimedb.com',
      bridge: 'https://auth.warpkeep.com',
      databaseAlias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      releaseVersion: '0.4.0-ptr.1',
      atlasId: 'PTR_GREATER_REALM',
      genesis001DatabaseIdentity:
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      deleteData: 'never',
    });
    expect(Object.values(PTR_PRODUCTION_IMPORT_REDUCERS)).toEqual([
      'admin_stage_greater_realm_release_v1',
      'admin_import_greater_realm_components_v1',
      'admin_import_greater_realm_regions_v1',
      'admin_import_greater_realm_chunk_v1',
      'admin_begin_greater_realm_verification_v1',
      'admin_verify_greater_realm_batch_v1',
      'admin_finalize_greater_realm_release_v1',
    ]);
  });

  it('parses exact inspection/apply arguments and rejects G001/G002 collisions', () => {
    const base = [
      `--database-identity=${DATABASE_IDENTITY}`,
      `--genesis-002-database-identity=${G002_IDENTITY}`,
      `--module-source-commit=${SOURCE_COMMIT}`,
      `--module-sha256=${MODULE_SHA256}`,
      `--module-tree-id=${MODULE_TREE_ID}`,
      `--dependency-closure-digest=${DEPENDENCY_DIGEST}`,
      `--spacetime-executable-sha256=${SPACETIME_DIGEST}`,
      `--spacetime-cli-config-sha256=${SPACETIME_CLI_CONFIG_DIGEST}`,
      `--publish-receipt-digest=${PUBLISH_RECEIPT_DIGEST}`,
      `--atlas-source-commit=${SOURCE_COMMIT}`,
      `--release-sha256=${RELEASE_SHA256}`,
    ];
    expect(parsePtrProductionImportArguments(['inspect', ...base]))
      .toMatchObject({
        command: 'inspect',
        databaseIdentity: DATABASE_IDENTITY,
        genesis002DatabaseIdentity: G002_IDENTITY,
      });
    const confirm = '0'.repeat(64);
    expect(parsePtrProductionImportArguments([
      'apply', ...base, `--confirm=${confirm}`,
    ])).toMatchObject({ command: 'apply', confirmationDigest: confirm });
    for (const collision of [
      PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity,
      G002_IDENTITY,
    ]) {
      const values = base.map(value => value.startsWith('--database-identity=')
        ? `--database-identity=${collision}`
        : value);
      expect(() => parsePtrProductionImportArguments(['inspect', ...values]))
        .toThrow('PTR_PRODUCTION_IMPORT_TARGET_IDENTITY_FORBIDDEN');
    }
  });

  it('accepts only the exact protected status shape and rejects owner/population drift', () => {
    expect(projectPtrProductionStatus(absentStatus())).toMatchObject({
      present: false,
      ownerProvisioned: false,
      ownerEnabled: false,
    });
    expect(() => projectPtrProductionStatus({
      ...absentStatus(),
      ownerProvisioned: true,
    })).toThrow('PTR_PRODUCTION_STATUS_INCONSISTENT');
    expect(() => projectPtrProductionStatus({
      ...absentStatus(),
      ownerFid: 123n,
    })).toThrow('PTR_PRODUCTION_STATUS_SHAPE_CHANGED');
    expect(() => projectPtrProductionStatus({
      ...absentStatus(),
      claimRows: 1n,
    })).toThrow('PTR_PRODUCTION_ZERO_BOUNDARY_VIOLATED');
    expect(() => projectPtrProductionStatus({
      ...absentStatus(),
      unexpected: true,
    })).toThrow('PTR_PRODUCTION_STATUS_SHAPE_CHANGED');
  });

  it('imports in exact order and adds immutable PTR target args to every atlas reducer', async () => {
    const transport = transitionTransport();
    const targets = ptrInitialAtlasTargets(G002_IDENTITY);
    const result = await executePtrProductionImport({
      artifacts: artifacts(),
      ...targets,
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      importEpoch: 1n,
      publicName: 'The Greater Realm',
      transport,
      assertCanStartWrite: vi.fn(),
      testOnlyVerifyArtifacts: vi.fn(),
    });
    expect(result).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep.ptr.production-import.v1',
      outcome: 'ready',
      databaseIdentity: targets.databaseIdentity,
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      atlasId: 'PTR_GREATER_REALM',
      releaseManifestSha256: createHash('sha256')
        .update(artifacts().manifestBytes).digest('hex'),
      expectedReleaseSha256: RELEASE_SHA256,
      zeroPopulationBoundary: true,
      importsExact: true,
      ready: true,
      atlasFinalized: true,
      atlasWritesClosedByFinalization: true,
      importMutationsCompiled: true,
      activationMutationsCompiled: false,
      importReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    const reducers = transport.submissions.map(({ reducer }) => reducer);
    expect(reducers[0]).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.stage);
    expect(reducers[1]).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.components);
    expect(reducers[2]).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.regions);
    expect(reducers[3]).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.chunk);
    expect(reducers[4]).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.beginVerification);
    expect(reducers.at(-1)).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.finalize);
    expect(new Set(reducers)).toEqual(new Set(
      Object.values(PTR_PRODUCTION_IMPORT_REDUCERS),
    ));
    for (const submission of transport.submissions) {
      expect(submission.arguments.ptrReleaseVersion).toBe('0.4.0-ptr.1');
      expect(submission.arguments.ptrModuleIdentity)
        .toBe('warpkeep-ptr-owner-view-v1');
    }
  });

  it('marks any post-submit status projection failure as manual reconciliation', async () => {
    const transport = transitionTransport();
    const inspect = transport.inspect;
    transport.inspect = vi.fn(async () => {
      const status = await inspect();
      return transport.submissions.length === 0
        ? status
        : { ...status, unexpectedPrivateField: true };
    });
    await expect(executePtrProductionImport({
      artifacts: artifacts(),
      databaseIdentity: DATABASE_IDENTITY,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      importEpoch: 1n,
      publicName: 'The Greater Realm',
      transport,
      assertCanStartWrite: vi.fn(),
      testOnlyVerifyArtifacts: vi.fn(),
    })).rejects.toMatchObject({
      code: 'PTR_PRODUCTION_IMPORT_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      submitted: true,
    });
  });

  it('binds confirmation to PTR release and every module/atlas identity', () => {
    const digest = ptrProductionImportConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: MODULE_SHA256,
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: SPACETIME_CLI_CONFIG_DIGEST,
      publishReceiptDigest: PUBLISH_RECEIPT_DIGEST,
      atlasSourceCommit: SOURCE_COMMIT,
      releaseSha256: RELEASE_SHA256,
      publicReleaseId: PUBLIC_RELEASE_ID,
      importEpoch: 1n,
    });
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(ptrProductionImportConfirmationDigest({
      databaseIdentity: DATABASE_IDENTITY,
      disallowedDatabaseIdentities: [G002_IDENTITY],
      moduleSourceCommit: SOURCE_COMMIT,
      moduleSha256: '0'.repeat(64),
      moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST,
      spacetimeExecutableSha256: SPACETIME_DIGEST,
      spacetimeCliConfigSha256: SPACETIME_CLI_CONFIG_DIGEST,
      publishReceiptDigest: PUBLISH_RECEIPT_DIGEST,
      atlasSourceCommit: SOURCE_COMMIT,
      releaseSha256: RELEASE_SHA256,
      publicReleaseId: PUBLIC_RELEASE_ID,
      importEpoch: 1n,
    })).not.toBe(digest);
  });
});

function stagedFixture() {
  const authority = greaterRealmProductionImportEngine.importAuthority(artifacts(), () => {});
  const hash = new Sha256().update('warpkeep.greater-realm.release.v1\n');
  updateLengthFramedSha256(hash, new TextEncoder().encode(authority.headerJson));
  const status = { ...absentStatus(), present: true, atlasId: authority.atlasId,
    publicReleaseId: authority.publicReleaseId, publicApprovalReceiptId: authority.publicApprovalReceiptId,
    sourceCommit: authority.sourceCommit, expectedReleaseSha256: authority.releaseSha256,
    releaseHeaderSha256: createHash('sha256').update(authority.headerJson).digest('hex'),
    importEpoch: 1n, state: 'importing', verificationDigest: hash.serialize(),
    expectedRegionCount: authority.totals.regionCount, expectedComponentCount: authority.totals.componentCount,
    expectedChunkCount: authority.totals.chunkCount, expectedCellCount: authority.totals.cellCount,
    expectedSlotCount: authority.totals.castleSlotCount, expectedResourceNodeCount: authority.totals.resourceNodeCount };
  return { authority, status };
}
describe('exact initial staged recovery boundary', () => {
  it('binds a verified component prefix to exact aggregate counts and still rejects terrain progress', () => {
    const { authority, status } = stagedFixture();
    const component = authority.components[0]!;
    const prefix = { ...status, componentRows: 1n,
      componentExpectedCellCount: Number(component.expectedCellCount),
      componentExpectedSlotCount: Number(component.expectedSlotCount),
      componentExpectedResourceNodeCount: ['expectedFoodNodeCount', 'expectedWoodNodeCount', 'expectedStoneNodeCount', 'expectedGoldNodeCount']
        .reduce((sum, key) => sum + Number(component[key]), 0) };
    expect(() => assertPtrProductionInitialStagedStatus(projectPtrProductionStatus(prefix), authority, 1)).not.toThrow();
    expect(() => assertPtrProductionInitialStagedStatus(projectPtrProductionStatus(prefix), authority)).toThrow();
    for (const changes of [{ componentExpectedCellCount: prefix.componentExpectedCellCount + 1 },
      { componentExpectedSlotCount: prefix.componentExpectedSlotCount + 1 },
      { componentExpectedResourceNodeCount: prefix.componentExpectedResourceNodeCount + 1 },
      { chunkRows: 1n }, { cellRows: 1n }, { regionManifestRows: 1 }, { verificationCursor: 1n }]) {
      expect(() => assertPtrProductionInitialStagedStatus(projectPtrProductionStatus({ ...prefix, ...changes }), authority, 1)).toThrow();
    }
    for (const count of [-1, 0.5, 2, Number.NaN]) {
      expect(() => assertPtrProductionInitialStagedStatus(projectPtrProductionStatus(prefix), authority, count)).toThrow();
    }
  });
  it('accepts only the real initialized digest and empty bound import', () => {
    const { authority, status } = stagedFixture();
    expect(() => assertPtrProductionInitialStagedStatus(projectPtrProductionStatus(status), authority)).not.toThrow();
  });
  it.each(['atlasId', 'publicReleaseId', 'publicApprovalReceiptId', 'sourceCommit', 'expectedReleaseSha256',
    'releaseHeaderSha256', 'importEpoch', 'state', 'verificationPhase', 'verificationDigest', 'verificationCursor',
    'expectedRegionCount', 'expectedComponentCount', 'expectedChunkCount', 'expectedCellCount', 'expectedSlotCount',
    'expectedResourceNodeCount', 'verifiedComponentCount', 'verifiedChunkCount', 'verifiedCellCount', 'verifiedSlotCount',
    'verifiedResourceNodeCount', 'componentExpectedCellCount', 'componentExpectedSlotCount', 'componentExpectedResourceNodeCount',
    'importedPassableCellCount', 'regionManifestRows', 'componentRows', 'chunkRows', 'cellRows', 'slotRows', 'resourceRows',
    'claimRows', 'occupancyRows', 'activationRows', 'publicAtlasRows', 'publicRegionRows', 'workerSystemRows',
    'importsExact', 'ready', 'importMutationsCompiled', 'activationMutationsCompiled', 'ownerProvisioned', 'ownerEnabled', 'present'])
    ('rejects changed %s', key => {
      const { authority, status } = stagedFixture(), changed: any = { ...status }, value = changed[key];
      changed[key] = typeof value === 'bigint' ? value + 1n : typeof value === 'number' ? value + 1
        : typeof value === 'boolean' ? !value : 'changed';
      expect(() => assertPtrProductionInitialStagedStatus(projectPtrProductionStatus(changed), authority)).toThrow();
    });
});

it('continues an initialized stage through a genuine ready receipt without sending stage again', async () => {
  const { status } = stagedFixture(), transport = transitionTransport(status);
  const result = await executePtrProductionImport({ artifacts: artifacts(), ...ptrInitialAtlasTargets(G002_IDENTITY),
    moduleSourceCommit: SOURCE_COMMIT, moduleSha256: MODULE_SHA256, moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST, spacetimeExecutableSha256: SPACETIME_DIGEST,
    importEpoch: 1n, publicName: 'Warpkeep PTR', transport, assertCanStartWrite: () => {}, testOnlyVerifyArtifacts: () => {} });
  expect(result.outcome).toBe('ready');
  expect(result.operationsSubmitted).toBe(transport.submissions.length);
  expect(transport.submissions[0]?.reducer).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.components);
  expect(transport.submissions.some(row => row.reducer === PTR_PRODUCTION_IMPORT_REDUCERS.stage)).toBe(false);
});


it('admits a complete committed region prefix only before terrain and verification', () => {
  const { authority, status } = stagedFixture();
  const total = (key: string) => authority.components.reduce((sum, row) => sum + Number(row[key]), 0);
  const complete = { ...status, componentRows: BigInt(authority.components.length),
    componentExpectedCellCount: total('expectedCellCount'), componentExpectedSlotCount: total('expectedSlotCount'),
    componentExpectedResourceNodeCount: ['expectedFoodNodeCount', 'expectedWoodNodeCount', 'expectedStoneNodeCount', 'expectedGoldNodeCount']
      .reduce((sum, key) => sum + total(key), 0), regionManifestRows: authority.totals.regionCount };
  const check = (value: Record<string, unknown>, count = authority.components.length) =>
    assertPtrProductionInitialStagedStatus(projectPtrProductionStatus(value), authority, count, true);
  expect(() => check(complete)).not.toThrow();
  expect(() => assertPtrProductionInitialStagedStatus(projectPtrProductionStatus(complete), authority, authority.components.length)).toThrow();
  expect(() => check(complete, 0)).toThrow();
  for (const changes of [{ regionManifestRows: 0 }, { chunkRows: 1n }, { cellRows: 1n },
    { importedPassableCellCount: 1 }, { verifiedComponentCount: 1 }, { verificationCursor: 1n }]) {
    expect(() => check({ ...complete, ...changes })).toThrow();
  }
});


it('starts a committed component/region prefix at chunk zero and retains a genuine completion receipt', async () => {
  const { authority, status } = stagedFixture();
  const total = (key: string) => authority.components.reduce((sum, row) => sum + Number(row[key]), 0);
  const transport = transitionTransport({ ...status, componentRows: BigInt(authority.components.length),
    componentExpectedCellCount: total('expectedCellCount'), componentExpectedSlotCount: total('expectedSlotCount'),
    componentExpectedResourceNodeCount: ['expectedFoodNodeCount', 'expectedWoodNodeCount', 'expectedStoneNodeCount', 'expectedGoldNodeCount']
      .reduce((sum, key) => sum + total(key), 0), regionManifestRows: authority.totals.regionCount });
  const result = await executePtrProductionImport({ artifacts: artifacts(), ...ptrInitialAtlasTargets(G002_IDENTITY),
    moduleSourceCommit: SOURCE_COMMIT, moduleSha256: MODULE_SHA256, moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST, spacetimeExecutableSha256: SPACETIME_DIGEST,
    importEpoch: 1n, publicName: 'Warpkeep PTR', transport, assertCanStartWrite: () => {}, testOnlyVerifyArtifacts: () => {} });
  expect(result.outcome).toBe('ready');
  expect(result.operationsSubmitted).toBe(transport.submissions.length);
  expect(transport.submissions[0]?.reducer).toBe(PTR_PRODUCTION_IMPORT_REDUCERS.chunk);
  expect(transport.submissions.some(row => [PTR_PRODUCTION_IMPORT_REDUCERS.stage,
    PTR_PRODUCTION_IMPORT_REDUCERS.components, PTR_PRODUCTION_IMPORT_REDUCERS.regions].includes(row.reducer as any))).toBe(false);
});


it.each(['PTR_PRODUCTION_TOKEN_EXPIRED_BEFORE_SEND', 'synthetic-private-body'])
  ('retains only sanitized submit failure when reconciliation shows no progress: %s', code => {
    const transport = transitionTransport();
    transport.submit = vi.fn(async () => { throw { code, message: 'synthetic-private-body' }; });
    return expect(executePtrProductionImport({ artifacts: artifacts(), ...ptrInitialAtlasTargets(G002_IDENTITY),
      moduleSourceCommit: SOURCE_COMMIT, moduleSha256: MODULE_SHA256, moduleTreeId: MODULE_TREE_ID,
      dependencyClosureDigest: DEPENDENCY_DIGEST, spacetimeExecutableSha256: SPACETIME_DIGEST,
      importEpoch: 1n, publicName: 'Warpkeep PTR', transport, assertCanStartWrite: () => {}, testOnlyVerifyArtifacts: () => {} }))
      .rejects.toMatchObject({ code: 'PTR_PRODUCTION_IMPORT_REJECTED_OR_UNCOMMITTED', submitted: true,
        diagnosticCode: code.startsWith('PTR_') ? code : null });
  });


it('admits only the exact independently verified water terrain prefix with all other boundaries sealed', () => {
  const { authority, status } = stagedFixture();
  const total = (key: string) => authority.components.reduce((sum, row) => sum + Number(row[key]), 0);
  const prefix = { chunkCount: 1, cellCount: 1, digest: 'a'.repeat(64),
    verificationDigest: 'retained-prefix-state', initialVerificationDigest: String(status.verificationDigest) };
  const complete = { ...status, chunkRows: 1n, cellRows: 1n, verificationDigest: prefix.verificationDigest,
    componentRows: BigInt(authority.components.length), componentExpectedCellCount: total('expectedCellCount'),
    componentExpectedSlotCount: total('expectedSlotCount'),
    componentExpectedResourceNodeCount: ['expectedFoodNodeCount', 'expectedWoodNodeCount', 'expectedStoneNodeCount', 'expectedGoldNodeCount']
      .reduce((sum, key) => sum + total(key), 0), regionManifestRows: authority.totals.regionCount };
  const check = (value: Record<string, unknown>, proof = prefix) =>
    assertPtrProductionInitialTerrainPrefixStatus(projectPtrProductionStatus(value), authority, authority.components.length, proof);
  expect(() => check(complete)).not.toThrow();
  for (const changes of [{ chunkRows: 0n }, { cellRows: 2n }, { verificationDigest: 'different' },
    { slotRows: 1n }, { resourceRows: 1n }, { importedPassableCellCount: 1 },
    { verifiedComponentCount: 1 }, { verificationCursor: 1n }, { regionManifestRows: 0 }, { ready: true }])
    expect(() => check({ ...complete, ...changes })).toThrow();
  for (const changes of [{ chunkCount: 0 }, { chunkCount: 0.5 }, { cellCount: 0 },
    { digest: 'invalid' }, { initialVerificationDigest: 'different' }])
    expect(() => check(complete, { ...prefix, ...changes })).toThrow();
});
