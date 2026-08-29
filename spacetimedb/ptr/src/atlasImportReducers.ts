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
} from './atlasAuthority';
import { requirePtrAdmin } from './auth';
import {
  PTR_ATLAS_ID,
  PTR_ATLAS_POLICY,
  PTR_OWNER_SINGLETON_KEY,
} from './contract';
import {
  ptrPopulationSnapshot,
  requirePtrPopulationEmpty,
  type PtrContext,
} from './context';
import {
  assertPtrAtlasNotFinalized,
  requirePtrAtlasTarget,
  withPtrAtlasImportBoundary,
} from './policy';
import ptr from './schema';

type SharedGreaterRealmContext = Parameters<typeof inspectGreaterRealmV17>[0];

function sharedGreaterRealmContext(ctx: PtrContext): SharedGreaterRealmContext {
  return ctx as unknown as SharedGreaterRealmContext;
}

const greaterRealmComponentImportV1 = t.object('PtrGreaterRealmComponentImportV1', {
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

const greaterRealmRegionImportV1 = t.object('PtrGreaterRealmRegionImportV1', {
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

const adminGreaterRealmStatusV1 = t.object('PtrAdminGreaterRealmStatusV1', {
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
  ownerProvisioned: t.bool(),
  ownerEnabled: t.bool(),
  ownerFid: t.option(t.u64()),
  ownerAuthEpoch: t.option(t.u32()),
});

function fail(code: string): never {
  throw new SenderError(code);
}

function senderPtrAtlasError(error: unknown): never {
  const code = greaterRealmAuthorityErrorCode(error);
  if (code !== undefined) return fail(code);
  if (error instanceof SenderError) throw error;
  if (
    error instanceof Error
    && [
      'PTR_POPULATION_NOT_EMPTY',
      'PTR_ATLAS_FINALIZED',
      'PTR_OWNER_CARDINALITY_INVALID',
    ].includes(error.message)
  ) return fail(error.message);
  return fail('PTR_ATLAS_IMPORT_FAILED');
}

const ptrTargetArgs = {
  ptrReleaseVersion: t.string(),
  ptrModuleIdentity: t.string(),
};

function requireTarget(
  atlasId: string,
  ptrReleaseVersion: string,
  ptrModuleIdentity: string,
): void {
  try {
    requirePtrAtlasTarget({ atlasId, ptrReleaseVersion, ptrModuleIdentity });
  } catch {
    fail('PTR_ATLAS_TARGET_INVALID');
  }
}

function audit(
  ctx: PtrContext,
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

function importBoundary<T>(ctx: PtrContext, effect: () => T): T {
  if (!PTR_ATLAS_POLICY.importMutationsEnabled) {
    fail('PTR_ATLAS_IMPORT_SEALED');
  }
  assertPtrAtlasNotFinalized(
    inspectGreaterRealmV17(sharedGreaterRealmContext(ctx)).ready,
  );
  return withPtrAtlasImportBoundary(
    () => ptrPopulationSnapshot(ctx),
    effect,
  );
}

/** Exact administrator status for atlas import and the singleton owner anchor. */
export const adminGetGreaterRealmStatusV1 = ptr.procedure(
  { name: 'admin_get_greater_realm_status_v1' },
  adminGreaterRealmStatusV1,
  ctx => ctx.withTx(tx => {
    try {
      requirePtrAdmin(tx);
      requirePtrPopulationEmpty(tx);
      const releases = [...tx.db.greaterRealmReleaseV1.iter()];
      if (releases.length > 1) fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
      if (tx.db.ptrOwnerAnchorV1.count() > 1n) {
        fail('PTR_OWNER_CARDINALITY_INVALID');
      }
      const release = releases[0];
      const owner = tx.db.ptrOwnerAnchorV1.singletonKey.find(
        PTR_OWNER_SINGLETON_KEY,
      );
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
        importMutationsCompiled: PTR_ATLAS_POLICY.importMutationsEnabled,
        activationMutationsCompiled: PTR_ATLAS_POLICY.activationMutationsEnabled,
        ownerProvisioned: owner !== null,
        ownerEnabled: owner?.enabled ?? false,
        ownerFid: owner?.ownerFid,
        ownerAuthEpoch: owner?.authEpoch,
      };
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  }),
);

export const adminStageGreaterRealmReleaseV1 = ptr.reducer(
  { name: 'admin_stage_greater_realm_release_v1' },
  {
    ...ptrTargetArgs,
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
  (ctx, {
    releaseHeaderJson,
    ptrReleaseVersion,
    ptrModuleIdentity,
    ...input
  }) => {
    try {
      requireTarget(input.atlasId, ptrReleaseVersion, ptrModuleIdentity);
      const admin = requirePtrAdmin(ctx);
      importBoundary(ctx, () => {
        const result = stageGreaterRealmReleaseV1(
          sharedGreaterRealmContext(ctx),
          input,
          releaseHeaderJson,
        );
        audit(ctx, admin.subject, 'ptr_stage_greater_realm_release_v1',
          `atlas=${input.atlasId};result=${result};activation=false`);
      });
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  },
);

export const adminImportGreaterRealmComponentsV1 = ptr.reducer(
  { name: 'admin_import_greater_realm_components_v1' },
  {
    ...ptrTargetArgs,
    atlasId: t.string(),
    importEpoch: t.u64(),
    rows: t.array(greaterRealmComponentImportV1),
  },
  (ctx, { atlasId, ptrReleaseVersion, ptrModuleIdentity, importEpoch, rows }) => {
    try {
      requireTarget(atlasId, ptrReleaseVersion, ptrModuleIdentity);
      const admin = requirePtrAdmin(ctx);
      importBoundary(ctx, () => {
        const inserted = importGreaterRealmComponentsV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          rows.map(row => ({ ...row, atlasId })),
        );
        audit(ctx, admin.subject, 'ptr_import_greater_realm_components_v1',
          `atlas=${atlasId};inserted=${inserted}`);
      });
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  },
);

export const adminImportGreaterRealmRegionsV1 = ptr.reducer(
  { name: 'admin_import_greater_realm_regions_v1' },
  {
    ...ptrTargetArgs,
    atlasId: t.string(),
    importEpoch: t.u64(),
    rows: t.array(greaterRealmRegionImportV1),
  },
  (ctx, { atlasId, ptrReleaseVersion, ptrModuleIdentity, importEpoch, rows }) => {
    try {
      requireTarget(atlasId, ptrReleaseVersion, ptrModuleIdentity);
      const admin = requirePtrAdmin(ctx);
      importBoundary(ctx, () => {
        const inserted = importGreaterRealmRegionsV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          rows,
        );
        audit(ctx, admin.subject, 'ptr_import_greater_realm_regions_v1',
          `atlas=${atlasId};inserted=${inserted}`);
      });
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  },
);

export const adminImportGreaterRealmChunkV1 = ptr.reducer(
  { name: 'admin_import_greater_realm_chunk_v1' },
  {
    ...ptrTargetArgs,
    atlasId: t.string(),
    importEpoch: t.u64(),
    payloadSha256: t.string(),
    payloadJson: t.string(),
  },
  (ctx, {
    atlasId,
    ptrReleaseVersion,
    ptrModuleIdentity,
    importEpoch,
    payloadSha256,
    payloadJson,
  }) => {
    try {
      requireTarget(atlasId, ptrReleaseVersion, ptrModuleIdentity);
      const admin = requirePtrAdmin(ctx);
      importBoundary(ctx, () => {
        const result = importGreaterRealmChunkPayloadV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          payloadSha256,
          payloadJson,
        );
        audit(ctx, admin.subject, 'ptr_import_greater_realm_chunk_v1',
          `atlas=${atlasId};result=${result}`);
      });
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  },
);

export const adminBeginGreaterRealmVerificationV1 = ptr.reducer(
  { name: 'admin_begin_greater_realm_verification_v1' },
  { ...ptrTargetArgs, atlasId: t.string(), importEpoch: t.u64() },
  (ctx, { atlasId, ptrReleaseVersion, ptrModuleIdentity, importEpoch }) => {
    try {
      requireTarget(atlasId, ptrReleaseVersion, ptrModuleIdentity);
      const admin = requirePtrAdmin(ctx);
      importBoundary(ctx, () => {
        beginGreaterRealmVerificationV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
        );
        audit(ctx, admin.subject, 'ptr_begin_greater_realm_verification_v1',
          `atlas=${atlasId}`);
      });
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  },
);

export const adminVerifyGreaterRealmBatchV1 = ptr.reducer(
  { name: 'admin_verify_greater_realm_batch_v1' },
  {
    ...ptrTargetArgs,
    atlasId: t.string(),
    importEpoch: t.u64(),
    requestedRows: t.u32(),
  },
  (ctx, {
    atlasId,
    ptrReleaseVersion,
    ptrModuleIdentity,
    importEpoch,
    requestedRows,
  }) => {
    try {
      requireTarget(atlasId, ptrReleaseVersion, ptrModuleIdentity);
      const admin = requirePtrAdmin(ctx);
      importBoundary(ctx, () => {
        const result = verifyGreaterRealmBatchV1(
          sharedGreaterRealmContext(ctx),
          atlasId,
          importEpoch,
          requestedRows,
        );
        audit(ctx, admin.subject, 'ptr_verify_greater_realm_batch_v1',
          `atlas=${atlasId};phase=${result.phase};processed=${result.processed}`);
      });
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  },
);

export const adminFinalizeGreaterRealmReleaseV1 = ptr.reducer(
  { name: 'admin_finalize_greater_realm_release_v1' },
  {
    ...ptrTargetArgs,
    atlasId: t.string(),
    importEpoch: t.u64(),
    publicApprovalReceiptId: t.string(),
    expectedReleaseSha256: t.string(),
    expectedVerificationDigest: t.string(),
    publicName: t.string(),
  },
  (ctx, input) => {
    try {
      requireTarget(
        input.atlasId,
        input.ptrReleaseVersion,
        input.ptrModuleIdentity,
      );
      const admin = requirePtrAdmin(ctx);
      importBoundary(ctx, () => {
        finalizeGreaterRealmReleaseV1(
          sharedGreaterRealmContext(ctx),
          {
            atlasId: input.atlasId,
            importEpoch: input.importEpoch,
            publicApprovalReceiptId: input.publicApprovalReceiptId,
            expectedReleaseSha256: input.expectedReleaseSha256,
            expectedVerificationDigest: input.expectedVerificationDigest,
            publicName: input.publicName,
          },
        );
        audit(ctx, admin.subject, 'ptr_finalize_greater_realm_release_v1',
          `atlas=${input.atlasId};state=ready;activation=false`);
      });
    } catch (error) {
      return senderPtrAtlasError(error);
    }
  },
);
