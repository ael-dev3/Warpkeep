import { SenderError, t } from 'spacetimedb/server';

import {
  beginGreaterRealmVerificationV1,
  finalizeGreaterRealmReleaseV1,
  greaterRealmAuthorityErrorCode,
  importGreaterRealmChunkPayloadV1,
  importGreaterRealmComponentsV1,
  importGreaterRealmRegionsV1,
  inspectGreaterRealmV17,
  stageGreaterRealmReleaseV1,
  verifyGreaterRealmBatchV1,
} from '../../src/greaterRealmV17Authority';
import {
  GREATER_REALM_PUBLIC_REGIONS,
} from '../../src/greaterRealmV17Policy';
import {
  GENESIS_002_ATLAS_ID,
  GENESIS_002_ATLAS_POLICY,
} from './contract';
import { requireGenesis002Admin } from './auth';
import {
  genesis002PopulationSnapshot,
  type Genesis002Context,
  requireGenesis002PopulationEmpty,
} from './population';
import { withGenesis002AtlasImportBoundary } from './policy';
import { assertGenesis002AtlasNotFinalized } from './policy';
import genesis002 from './schema';

type SharedGreaterRealmContext = Parameters<typeof inspectGreaterRealmV17>[0];

/**
 * The shared authority is structurally limited to the atlas tables at runtime,
 * but its legacy type alias names the complete Genesis 001 schema. Keep the
 * one deliberate type boundary local and reviewable.
 */
function sharedGreaterRealmContext(
  ctx: Genesis002Context,
): SharedGreaterRealmContext {
  return ctx as unknown as SharedGreaterRealmContext;
}

const greaterRealmComponentImportV1 = t.object('Genesis002GreaterRealmComponentImportV1', {
  componentKey: t.string(),
  componentOrdinal: t.u32(),
  regionMask: t.u32(),
  rootCellKey: t.string(),
  expectedCellCount: t.u32(),
  maxRouteDepth: t.u32(),
  expectedSlotCount: t.u32(),
  expectedFoodNodeCount: t.u32(),
  expectedWoodNodeCount: t.u32(),
  expectedStoneNodeCount: t.u32(),
  expectedGoldNodeCount: t.u32(),
  componentSha256: t.string(),
});

const greaterRealmRegionImportV1 = t.object('Genesis002GreaterRealmRegionImportV1', {
  regionId: t.string(),
  publicName: t.string(),
  ordinal: t.u32(),
  tier: t.u32(),
  cellCount: t.u32(),
  passableCellCount: t.u32(),
  chunkCount: t.u32(),
  castleCapacity: t.u32(),
  resourceLocationCount: t.u32(),
  resourceNodeCount: t.u32(),
  foodNodeCount: t.u32(),
  woodNodeCount: t.u32(),
  stoneNodeCount: t.u32(),
  goldNodeCount: t.u32(),
  active: t.bool(),
});

const adminGreaterRealmStatusV1 = t.object('Genesis002AdminGreaterRealmStatusV1', {
  present: t.bool(),
  atlasId: t.option(t.string()),
  publicReleaseId: t.option(t.string()),
  publicApprovalReceiptId: t.option(t.string()),
  sourceCommit: t.option(t.string()),
  expectedReleaseSha256: t.option(t.string()),
  releaseHeaderSha256: t.option(t.string()),
  state: t.string(),
  importEpoch: t.option(t.u64()),
  verificationPhase: t.string(),
  verificationCursor: t.u64(),
  verificationDigest: t.string(),
  expectedRegionCount: t.u32(),
  expectedComponentCount: t.u32(),
  expectedChunkCount: t.u32(),
  expectedCellCount: t.u32(),
  expectedSlotCount: t.u32(),
  expectedResourceNodeCount: t.u32(),
  verifiedComponentCount: t.u32(),
  verifiedChunkCount: t.u32(),
  verifiedCellCount: t.u32(),
  verifiedSlotCount: t.u32(),
  verifiedResourceNodeCount: t.u32(),
  componentExpectedCellCount: t.u32(),
  componentExpectedSlotCount: t.u32(),
  componentExpectedResourceNodeCount: t.u32(),
  importedPassableCellCount: t.u32(),
  regionManifestRows: t.u32(),
  componentRows: t.u64(),
  chunkRows: t.u64(),
  cellRows: t.u64(),
  slotRows: t.u64(),
  resourceRows: t.u64(),
  claimRows: t.u64(),
  occupancyRows: t.u64(),
  activationRows: t.u64(),
  publicAtlasRows: t.u64(),
  publicRegionRows: t.u64(),
  workerSystemRows: t.u64(),
  importsExact: t.bool(),
  ready: t.bool(),
  importMutationsCompiled: t.bool(),
  activationMutationsCompiled: t.bool(),
});

const adminGreaterRealmImportPlanV1 = t.object('Genesis002AdminGreaterRealmImportPlanV1', {
  state: t.string(),
  verificationPhase: t.string(),
  verificationCursor: t.u64(),
  remainingComponents: t.u64(),
  remainingRegions: t.u64(),
  remainingChunks: t.u64(),
  remainingCells: t.u64(),
  remainingSlots: t.u64(),
  remainingResources: t.u64(),
  canBeginVerification: t.bool(),
  canFinalize: t.bool(),
  importMutationsCompiled: t.bool(),
});

function fail(code: string): never {
  throw new SenderError(code);
}

function senderGenesis002AtlasError(error: unknown): never {
  const code = greaterRealmAuthorityErrorCode(error);
  if (code !== undefined) return fail(code);
  if (error instanceof SenderError) throw error;
  if (error instanceof Error && error.message === 'GENESIS_002_POPULATION_NOT_EMPTY') {
    return fail(error.message);
  }
  if (error instanceof Error && error.message === 'GENESIS_002_ATLAS_FINALIZED') {
    return fail(error.message);
  }
  return fail('GENESIS_002_ATLAS_IMPORT_FAILED');
}

function requireGenesis002AtlasImportEnabled(): void {
  if (!GENESIS_002_ATLAS_POLICY.importMutationsEnabled) {
    fail('GENESIS_002_ATLAS_IMPORT_SEALED');
  }
}

function requireGenesis002AtlasId(atlasId: string): void {
  if (atlasId !== GENESIS_002_ATLAS_ID) fail('GENESIS_002_ATLAS_ID_INVALID');
}

function audit(
  ctx: Genesis002Context,
  actorSubject: string,
  action: string,
  note: string,
): void {
  ctx.db.adminAudit.insert({
    id: 0n,
    action,
    targetFid: undefined,
    actorSubject,
    createdAt: ctx.timestamp,
    note,
  });
}

function importBoundary<T>(ctx: Genesis002Context, effect: () => T): T {
  requireGenesis002AtlasImportEnabled();
  assertGenesis002AtlasNotFinalized(
    inspectGreaterRealmV17(sharedGreaterRealmContext(ctx)).ready,
  );
  return withGenesis002AtlasImportBoundary(
    () => genesis002PopulationSnapshot(ctx),
    effect,
  );
}

/** Exact operator status; the G002 wrapper is the reviewed import gate. */
export const adminGetGreaterRealmStatusV1 = genesis002.procedure(
  { name: 'admin_get_greater_realm_status_v1' },
  adminGreaterRealmStatusV1,
  ctx => ctx.withTx(tx => {
    try {
      requireGenesis002Admin(tx);
      requireGenesis002PopulationEmpty(tx);
      const releases = [...tx.db.greaterRealmReleaseV1.iter()];
      if (releases.length > 1) fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
      const release = releases[0];
      return {
        ...inspectGreaterRealmV17(sharedGreaterRealmContext(tx)),
        publicApprovalReceiptId: release?.publicApprovalReceiptId,
        sourceCommit: release?.sourceCommit,
        expectedReleaseSha256: release?.expectedReleaseSha256,
        releaseHeaderSha256: release?.releaseHeaderSha256,
        expectedRegionCount: release?.expectedRegionCount ?? 0,
        verifiedComponentCount: release?.verifiedComponentCount ?? 0,
        verifiedChunkCount: release?.verifiedChunkCount ?? 0,
        verifiedCellCount: release?.verifiedCellCount ?? 0,
        verifiedSlotCount: release?.verifiedSlotCount ?? 0,
        verifiedResourceNodeCount: release?.verifiedResourceNodeCount ?? 0,
        componentExpectedCellCount: release?.componentExpectedCellCount ?? 0,
        componentExpectedSlotCount: release?.componentExpectedSlotCount ?? 0,
        componentExpectedResourceNodeCount:
          release?.componentExpectedResourceNodeCount ?? 0,
        importedPassableCellCount: release?.importedPassableCellCount ?? 0,
        importMutationsCompiled: GENESIS_002_ATLAS_POLICY.importMutationsEnabled,
        activationMutationsCompiled: GENESIS_002_ATLAS_POLICY.activationMutationsEnabled,
      };
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  }),
);

export const adminGetGreaterRealmImportPlanV1 = genesis002.procedure(
  { name: 'admin_get_greater_realm_import_plan_v1' },
  adminGreaterRealmImportPlanV1,
  ctx => ctx.withTx(tx => {
    try {
      requireGenesis002Admin(tx);
      requireGenesis002PopulationEmpty(tx);
      const status = inspectGreaterRealmV17(sharedGreaterRealmContext(tx));
      const remaining = (expected: number, actual: bigint): bigint => (
        BigInt(expected) > actual ? BigInt(expected) - actual : 0n
      );
      return {
        state: status.state,
        verificationPhase: status.verificationPhase,
        verificationCursor: status.verificationCursor,
        remainingComponents: remaining(status.expectedComponentCount, status.componentRows),
        remainingRegions: remaining(
          GREATER_REALM_PUBLIC_REGIONS.length,
          BigInt(status.regionManifestRows),
        ),
        remainingChunks: remaining(status.expectedChunkCount, status.chunkRows),
        remainingCells: remaining(status.expectedCellCount, status.cellRows),
        remainingSlots: remaining(status.expectedSlotCount, status.slotRows),
        remainingResources: remaining(status.expectedResourceNodeCount, status.resourceRows),
        canBeginVerification: status.state === 'importing' && status.importsExact,
        canFinalize: status.state === 'verifying' && status.verificationPhase === 'complete',
        importMutationsCompiled: GENESIS_002_ATLAS_POLICY.importMutationsEnabled,
      };
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  }),
);

export const adminStageGreaterRealmReleaseV1 = genesis002.reducer(
  { name: 'admin_stage_greater_realm_release_v1' },
  {
    atlasId: t.string(),
    publicReleaseId: t.string(),
    publicApprovalReceiptId: t.string(),
    sourceCommit: t.string(),
    generatorVersion: t.string(),
    sourceFormatVersion: t.string(),
    livingWorldVersion: t.string(),
    runtimePartitionVersion: t.string(),
    rendererContractVersion: t.string(),
    expectedRegionCount: t.u32(),
    expectedComponentCount: t.u32(),
    expectedChunkCount: t.u32(),
    expectedCellCount: t.u32(),
    expectedSlotCount: t.u32(),
    expectedResourceNodeCount: t.u32(),
    expectedReleaseSha256: t.string(),
    importEpoch: t.u64(),
    releaseHeaderJson: t.string(),
  },
  (ctx, { releaseHeaderJson, ...input }) => {
    try {
      requireGenesis002AtlasId(input.atlasId);
      const admin = requireGenesis002Admin(ctx);
      importBoundary(ctx, () => {
        const result = stageGreaterRealmReleaseV1(
          sharedGreaterRealmContext(ctx),
          input,
          releaseHeaderJson,
        );
        audit(ctx, admin.subject, 'g002_stage_greater_realm_release_v1',
          `atlas=${input.atlasId};result=${result};activation=false`);
      });
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  },
);

export const adminImportGreaterRealmComponentsV1 = genesis002.reducer(
  { name: 'admin_import_greater_realm_components_v1' },
  { atlasId: t.string(), importEpoch: t.u64(), rows: t.array(greaterRealmComponentImportV1) },
  (ctx, { atlasId, importEpoch, rows }) => {
    try {
      requireGenesis002AtlasId(atlasId);
      const admin = requireGenesis002Admin(ctx);
      importBoundary(ctx, () => {
        const inserted = importGreaterRealmComponentsV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          rows.map(row => ({ ...row, atlasId })),
        );
        audit(ctx, admin.subject, 'g002_import_greater_realm_components_v1',
          `atlas=${atlasId};inserted=${inserted}`);
      });
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  },
);

export const adminImportGreaterRealmRegionsV1 = genesis002.reducer(
  { name: 'admin_import_greater_realm_regions_v1' },
  { atlasId: t.string(), importEpoch: t.u64(), rows: t.array(greaterRealmRegionImportV1) },
  (ctx, { atlasId, importEpoch, rows }) => {
    try {
      requireGenesis002AtlasId(atlasId);
      const admin = requireGenesis002Admin(ctx);
      importBoundary(ctx, () => {
        const inserted = importGreaterRealmRegionsV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          rows,
        );
        audit(ctx, admin.subject, 'g002_import_greater_realm_regions_v1',
          `atlas=${atlasId};inserted=${inserted}`);
      });
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  },
);

export const adminImportGreaterRealmChunkV1 = genesis002.reducer(
  { name: 'admin_import_greater_realm_chunk_v1' },
  {
    atlasId: t.string(),
    importEpoch: t.u64(),
    payloadSha256: t.string(),
    payloadJson: t.string(),
  },
  (ctx, { atlasId, importEpoch, payloadSha256, payloadJson }) => {
    try {
      requireGenesis002AtlasId(atlasId);
      const admin = requireGenesis002Admin(ctx);
      importBoundary(ctx, () => {
        const result = importGreaterRealmChunkPayloadV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          payloadSha256,
          payloadJson,
        );
        audit(ctx, admin.subject, 'g002_import_greater_realm_chunk_v1',
          `atlas=${atlasId};result=${result}`);
      });
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  },
);

export const adminBeginGreaterRealmVerificationV1 = genesis002.reducer(
  { name: 'admin_begin_greater_realm_verification_v1' },
  { atlasId: t.string(), importEpoch: t.u64() },
  (ctx, { atlasId, importEpoch }) => {
    try {
      requireGenesis002AtlasId(atlasId);
      const admin = requireGenesis002Admin(ctx);
      importBoundary(ctx, () => {
        beginGreaterRealmVerificationV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
        );
        audit(ctx, admin.subject, 'g002_begin_greater_realm_verification_v1',
          `atlas=${atlasId}`);
      });
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  },
);

export const adminVerifyGreaterRealmBatchV1 = genesis002.reducer(
  { name: 'admin_verify_greater_realm_batch_v1' },
  { atlasId: t.string(), importEpoch: t.u64(), requestedRows: t.u32() },
  (ctx, { atlasId, importEpoch, requestedRows }) => {
    try {
      requireGenesis002AtlasId(atlasId);
      const admin = requireGenesis002Admin(ctx);
      importBoundary(ctx, () => {
        const result = verifyGreaterRealmBatchV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          requestedRows,
        );
        audit(ctx, admin.subject, 'g002_verify_greater_realm_batch_v1',
          `atlas=${atlasId};phase=${result.phase};processed=${result.processed}`);
      });
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  },
);

export const adminFinalizeGreaterRealmReleaseV1 = genesis002.reducer(
  { name: 'admin_finalize_greater_realm_release_v1' },
  {
    atlasId: t.string(),
    importEpoch: t.u64(),
    publicApprovalReceiptId: t.string(),
    expectedReleaseSha256: t.string(),
    expectedVerificationDigest: t.string(),
    publicName: t.string(),
  },
  (ctx, input) => {
    try {
      requireGenesis002AtlasId(input.atlasId);
      const admin = requireGenesis002Admin(ctx);
      importBoundary(ctx, () => {
        finalizeGreaterRealmReleaseV1(
          sharedGreaterRealmContext(ctx),
          input,
          ctx.random,
        );
        audit(ctx, admin.subject, 'g002_finalize_greater_realm_release_v1',
          `atlas=${input.atlasId};state=ready;activation=false`);
      });
    } catch (error) {
      return senderGenesis002AtlasError(error);
    }
  },
);
