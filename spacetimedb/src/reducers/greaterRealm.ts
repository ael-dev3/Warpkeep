import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import {
  beginGreaterRealmVerificationV1,
  finalizeGreaterRealmReleaseV1,
  greaterRealmAuthorityErrorCode,
  importGreaterRealmChunkPayloadV1,
  importGreaterRealmComponentsV1,
  importGreaterRealmRegionsV1,
  inspectGreaterRealmV17,
  requireGreaterRealmV17ImportGate,
  stageGreaterRealmReleaseV1,
  verifyGreaterRealmBatchV1,
} from '../greaterRealmV17Authority';
import {
  GREATER_REALM_MAX_ROUTE_DEPTH,
  GREATER_REALM_MAX_ROUTE_PAGE,
  GREATER_REALM_MAX_WINDOW_RADIUS,
  GREATER_REALM_PUBLIC_REGIONS,
  requireGreaterRealmOpaqueId,
  requireGreaterRealmSafeInteger,
} from '../greaterRealmV17Policy';
import warpkeep from '../schema';
import { sha256Hex } from '../sha256';

const greaterRealmComponentImportV1 = t.object('GreaterRealmComponentImportV1', {
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

const greaterRealmRegionImportV1 = t.object('GreaterRealmRegionImportV1', {
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

const adminGreaterRealmStatusV1 = t.object('AdminGreaterRealmStatusV1', {
  present: t.bool(),
  atlasId: t.option(t.string()),
  publicReleaseId: t.option(t.string()),
  state: t.string(),
  importEpoch: t.option(t.u64()),
  verificationPhase: t.string(),
  verificationCursor: t.u64(),
  verificationDigest: t.string(),
  expectedComponentCount: t.u32(),
  expectedChunkCount: t.u32(),
  expectedCellCount: t.u32(),
  expectedSlotCount: t.u32(),
  expectedResourceNodeCount: t.u32(),
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

const adminGreaterRealmImportPlanV1 = t.object('AdminGreaterRealmImportPlanV1', {
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

const greaterRealmRegionProjectionV1 = t.object('GreaterRealmRegionProjectionV1', {
  regionId: t.string(),
  ordinal: t.u32(),
  publicName: t.string(),
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
});

const greaterRealmAtlasBootstrapV1 = t.object('GreaterRealmAtlasBootstrapV1', {
  atlasId: t.string(),
  publicReleaseId: t.string(),
  name: t.string(),
  protocolVersion: t.u32(),
  generatorVersion: t.string(),
  runtimePartitionVersion: t.string(),
  rendererContractVersion: t.string(),
  revision: t.u64(),
  visibleTierMax: t.u32(),
  navigationTierMax: t.u32(),
  foundingTierMax: t.u32(),
  visibleRegionCount: t.u32(),
  visibleCellCount: t.u32(),
  visibleChunkCount: t.u32(),
  castleCapacity: t.u32(),
  mode: t.string(),
  regions: t.array(greaterRealmRegionProjectionV1),
  myCastleId: t.u64(),
  myCellKey: t.option(t.string()),
});

const greaterRealmChunkDescriptorV1 = t.object('GreaterRealmChunkDescriptorV1', {
  chunkHandle: t.string(),
  binQ: t.i32(),
  binR: t.i32(),
  coreCellCount: t.u32(),
  apronCellCount: t.u32(),
  lod0CellCount: t.u32(),
  lod1CellCount: t.u32(),
  lod2CellCount: t.u32(),
  lod3CellCount: t.u32(),
});

const greaterRealmWindowV1 = t.object('GreaterRealmWindowV1', {
  atlasId: t.string(),
  revision: t.u64(),
  centerQ: t.i32(),
  centerR: t.i32(),
  radius: t.u32(),
  chunks: t.array(greaterRealmChunkDescriptorV1),
});

const greaterRealmCellProjectionV1 = t.object('GreaterRealmCellProjectionV1', {
  cellKey: t.string(),
  chunkHandle: t.string(),
  regionId: t.string(),
  atlasQ: t.i32(),
  atlasR: t.i32(),
  tier: t.u32(),
  passable: t.bool(),
  elevation: t.i32(),
  slope: t.u32(),
  aspect: t.u32(),
  profileCurvature: t.i32(),
  planCurvature: t.i32(),
  geologicalBarrierBand: t.u32(),
  biomeClass: t.u32(),
  landformClass: t.u32(),
  yieldClass: t.u32(),
  movementCost: t.u32(),
  sealedBoundaryMask: t.u32(),
  hydroRegime: t.u32(),
  hydroBodyId: t.option(t.string()),
  hydroDepthClass: t.u32(),
  hydroSurfaceMilli: t.i32(),
  hydroFlowDirection: t.option(t.u32()),
  flowAccumulation: t.u64(),
  bankVariant: t.u32(),
  hydrologyRevision: t.u32(),
  travelClass: t.u32(),
  wetness: t.u32(),
  exposure: t.i32(),
  coastDistance: t.u32(),
  freshwaterDistance: t.u32(),
  temperature: t.i32(),
  moisture: t.i32(),
  habitatClass: t.u32(),
  canopyBasisPoints: t.u32(),
  groundcoverBasisPoints: t.u32(),
  wildflowerBasisPoints: t.u32(),
  featureClass: t.u32(),
  ambienceClass: t.u32(),
  presentationVariant: t.u32(),
});

const greaterRealmResourceLocationProjectionV1 = t.object(
  'GreaterRealmResourceLocationProjectionV1',
  {
    locationId: t.string(),
    cellKey: t.string(),
    regionId: t.string(),
    atlasQ: t.i32(),
    atlasR: t.i32(),
    resourceKind: t.string(),
    nodeCount: t.u32(),
    policyVersion: t.string(),
  },
);

const greaterRealmChunkProjectionV1 = t.object('GreaterRealmChunkProjectionV1', {
  atlasId: t.string(),
  revision: t.u64(),
  chunkHandle: t.string(),
  lod: t.u32(),
  sourceCellCount: t.u32(),
  coreCells: t.array(greaterRealmCellProjectionV1),
  apronCells: t.array(greaterRealmCellProjectionV1),
  resourceLocations: t.array(greaterRealmResourceLocationProjectionV1),
});

const greaterRealmRoutePageV1 = t.object('GreaterRealmRoutePageV1', {
  atlasId: t.string(),
  revision: t.u64(),
  cells: t.array(greaterRealmCellProjectionV1),
  totalLength: t.u32(),
  nextOffset: t.option(t.u32()),
  complete: t.bool(),
});

type GreaterRealmReadContext = Parameters<typeof requireGameplayPlayerV1>[0];

function senderGreaterRealmError(error: unknown): never {
  const code = greaterRealmAuthorityErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('GREATER_REALM_REQUEST_FAILED');
}

function unavailable(): never {
  throw new SenderError('GREATER_REALM_UNAVAILABLE');
}

function audit(
  ctx: Parameters<typeof requireAdmin>[0],
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

function requireReadableAtlas(ctx: GreaterRealmReadContext, expectedRevision?: bigint) {
  let selected: NonNullable<ReturnType<typeof ctx.db.realmAtlasV1.atlasId.find>> | undefined;
  for (const row of ctx.db.realmAtlasV1.iter()) {
    if (row.mode !== 'canary' && row.mode !== 'active') continue;
    if (selected !== undefined) unavailable();
    selected = row;
  }
  if (selected === undefined || (expectedRevision !== undefined && selected.revision !== expectedRevision)) {
    unavailable();
  }
  return selected;
}

function projectRegion(row: NonNullable<ReturnType<GreaterRealmReadContext['db']['realmAtlasVisibleRegionV1']['regionId']['find']>>) {
  return {
    regionId: row.regionId,
    ordinal: row.ordinal,
    publicName: row.publicName,
    tier: row.tier,
    cellCount: row.cellCount,
    passableCellCount: row.passableCellCount,
    chunkCount: row.chunkCount,
    castleCapacity: row.castleCapacity,
    resourceLocationCount: row.resourceLocationCount,
    resourceNodeCount: row.resourceNodeCount,
    foodNodeCount: row.foodNodeCount,
    woodNodeCount: row.woodNodeCount,
    stoneNodeCount: row.stoneNodeCount,
    goldNodeCount: row.goldNodeCount,
  };
}

function projectCell(row: NonNullable<ReturnType<GreaterRealmReadContext['db']['greaterRealmCellV1']['cellKey']['find']>>) {
  return {
    cellKey: row.cellKey,
    chunkHandle: row.chunkHandle,
    regionId: row.regionId,
    atlasQ: row.atlasQ,
    atlasR: row.atlasR,
    tier: row.tier,
    passable: row.passable,
    elevation: row.elevation,
    slope: row.slope,
    aspect: row.aspect,
    profileCurvature: row.profileCurvature,
    planCurvature: row.planCurvature,
    geologicalBarrierBand: row.geologicalBarrierBand,
    biomeClass: row.biomeClass,
    landformClass: row.landformClass,
    yieldClass: row.yieldClass,
    movementCost: row.movementCost,
    sealedBoundaryMask: row.sealedBoundaryMask,
    hydroRegime: row.hydroRegime,
    hydroBodyId: row.hydroBodyId,
    hydroDepthClass: row.hydroDepthClass,
    hydroSurfaceMilli: row.hydroSurfaceMilli,
    hydroFlowDirection: row.hydroFlowDirection,
    flowAccumulation: row.flowAccumulation,
    bankVariant: row.bankVariant,
    hydrologyRevision: row.hydrologyRevision,
    travelClass: row.travelClass,
    wetness: row.wetness,
    exposure: row.exposure,
    coastDistance: row.coastDistance,
    freshwaterDistance: row.freshwaterDistance,
    temperature: row.temperature,
    moisture: row.moisture,
    habitatClass: row.habitatClass,
    canopyBasisPoints: row.canopyBasisPoints,
    groundcoverBasisPoints: row.groundcoverBasisPoints,
    wildflowerBasisPoints: row.wildflowerBasisPoints,
    featureClass: row.featureClass,
    ambienceClass: row.ambienceClass,
    presentationVariant: row.presentationVariant,
  };
}

function chunkDescriptor(row: NonNullable<ReturnType<GreaterRealmReadContext['db']['greaterRealmChunkV1']['chunkHandle']['find']>>) {
  return {
    chunkHandle: row.chunkHandle,
    binQ: row.binQ,
    binR: row.binR,
    coreCellCount: row.coreCellCount,
    apronCellCount: row.apronCellCount,
    lod0CellCount: row.lod0CellCount,
    lod1CellCount: row.lod1CellCount,
    lod2CellCount: row.lod2CellCount,
    lod3CellCount: row.lod3CellCount,
  };
}

const AXIAL_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([1, -1]), Object.freeze([0, -1]),
  Object.freeze([-1, 0]), Object.freeze([-1, 1]), Object.freeze([0, 1]),
] as const);

type GreaterRealmCellRow = NonNullable<
  ReturnType<GreaterRealmReadContext['db']['greaterRealmCellV1']['cellKey']['find']>
>;

function parentCell(ctx: GreaterRealmReadContext, row: GreaterRealmCellRow) {
  if (row.routeDepth === undefined || row.routeDepth === 0 || row.routeParentDirection === undefined) {
    return null;
  }
  const direction = AXIAL_DIRECTIONS[row.routeParentDirection];
  if (direction === undefined) unavailable();
  return ctx.db.greaterRealmCellV1.atlasCoordKey.find(
    `A:${row.atlasQ + direction[0]}:${row.atlasR + direction[1]}`,
  );
}

function parseStoredChunk(row: NonNullable<ReturnType<GreaterRealmReadContext['db']['greaterRealmChunkV1']['chunkHandle']['find']>>) {
  if (sha256Hex(new TextEncoder().encode(row.payloadJson)) !== row.payloadSha256 || !row.payloadJson.endsWith('\n')) {
    unavailable();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payloadJson);
  } catch {
    return unavailable();
  }
  if (
    parsed === null
    || Array.isArray(parsed)
    || typeof parsed !== 'object'
    || `${JSON.stringify(parsed)}\n` !== row.payloadJson
  ) unavailable();
  const payload = parsed as Record<string, unknown>;
  if (
    payload.chunkHandle !== row.chunkHandle
    || !Array.isArray(payload.cells)
    || !Array.isArray(payload.apronCellKeys)
    || !Array.isArray(payload.lod1CellKeys)
    || !Array.isArray(payload.lod2CellKeys)
    || !Array.isArray(payload.lod3CellKeys)
    || !Array.isArray(payload.resourceNodes)
  ) unavailable();
  return payload as Record<string, unknown> & {
    cells: Readonly<Record<string, unknown>>[];
    apronCellKeys: string[];
    lod1CellKeys: string[];
    lod2CellKeys: string[];
    lod3CellKeys: string[];
    resourceNodes: Readonly<Record<string, unknown>>[];
  };
}

export const adminGetGreaterRealmStatusV1 = warpkeep.procedure(
  { name: 'admin_get_greater_realm_status_v1' },
  adminGreaterRealmStatusV1,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      return inspectGreaterRealmV17(tx);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  }),
);

export const adminGetGreaterRealmImportPlanV1 = warpkeep.procedure(
  { name: 'admin_get_greater_realm_import_plan_v1' },
  adminGreaterRealmImportPlanV1,
  ctx => ctx.withTx(tx => {
    try {
      requireAdmin(tx);
      const status = inspectGreaterRealmV17(tx);
      const remaining = (expected: number, actual: bigint): bigint => (
        BigInt(expected) > actual ? BigInt(expected) - actual : 0n
      );
      return {
        state: status.state,
        verificationPhase: status.verificationPhase,
        verificationCursor: status.verificationCursor,
        remainingComponents: remaining(status.expectedComponentCount, status.componentRows),
        remainingRegions: remaining(GREATER_REALM_PUBLIC_REGIONS.length, BigInt(status.regionManifestRows)),
        remainingChunks: remaining(status.expectedChunkCount, status.chunkRows),
        remainingCells: remaining(status.expectedCellCount, status.cellRows),
        remainingSlots: remaining(status.expectedSlotCount, status.slotRows),
        remainingResources: remaining(status.expectedResourceNodeCount, status.resourceRows),
        canBeginVerification: status.state === 'importing' && status.importsExact,
        canFinalize: status.state === 'verifying' && status.verificationPhase === 'complete',
        importMutationsCompiled: status.importMutationsCompiled,
      };
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  }),
);

export const adminStageGreaterRealmReleaseV1 = warpkeep.reducer(
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
      const admin = requireAdmin(ctx);
      requireGreaterRealmV17ImportGate();
      const result = stageGreaterRealmReleaseV1(ctx, input, releaseHeaderJson);
      audit(ctx, admin.subject, 'stage_greater_realm_release_v1', `atlas=${input.atlasId};result=${result};active=false`);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  },
);

export const adminImportGreaterRealmComponentsV1 = warpkeep.reducer(
  { name: 'admin_import_greater_realm_components_v1' },
  { atlasId: t.string(), importEpoch: t.u64(), rows: t.array(greaterRealmComponentImportV1) },
  (ctx, { atlasId, importEpoch, rows }) => {
    try {
      const admin = requireAdmin(ctx);
      requireGreaterRealmV17ImportGate();
      const inserted = importGreaterRealmComponentsV1(
        ctx,
        atlasId,
        importEpoch,
        rows.map(row => ({ ...row, atlasId })),
      );
      audit(ctx, admin.subject, 'import_greater_realm_components_v1', `atlas=${atlasId};inserted=${inserted}`);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  },
);

export const adminImportGreaterRealmRegionsV1 = warpkeep.reducer(
  { name: 'admin_import_greater_realm_regions_v1' },
  { atlasId: t.string(), importEpoch: t.u64(), rows: t.array(greaterRealmRegionImportV1) },
  (ctx, { atlasId, importEpoch, rows }) => {
    try {
      const admin = requireAdmin(ctx);
      requireGreaterRealmV17ImportGate();
      const inserted = importGreaterRealmRegionsV1(ctx, atlasId, importEpoch, rows);
      audit(ctx, admin.subject, 'import_greater_realm_regions_v1', `atlas=${atlasId};inserted=${inserted}`);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  },
);

export const adminImportGreaterRealmChunkV1 = warpkeep.reducer(
  { name: 'admin_import_greater_realm_chunk_v1' },
  {
    atlasId: t.string(),
    importEpoch: t.u64(),
    payloadSha256: t.string(),
    payloadJson: t.string(),
  },
  (ctx, { atlasId, importEpoch, payloadSha256, payloadJson }) => {
    try {
      const admin = requireAdmin(ctx);
      requireGreaterRealmV17ImportGate();
      const result = importGreaterRealmChunkPayloadV1(ctx, atlasId, importEpoch, payloadSha256, payloadJson);
      audit(ctx, admin.subject, 'import_greater_realm_chunk_v1', `atlas=${atlasId};result=${result}`);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  },
);

export const adminBeginGreaterRealmVerificationV1 = warpkeep.reducer(
  { name: 'admin_begin_greater_realm_verification_v1' },
  { atlasId: t.string(), importEpoch: t.u64() },
  (ctx, { atlasId, importEpoch }) => {
    try {
      const admin = requireAdmin(ctx);
      requireGreaterRealmV17ImportGate();
      beginGreaterRealmVerificationV1(ctx, atlasId, importEpoch);
      audit(ctx, admin.subject, 'begin_greater_realm_verification_v1', `atlas=${atlasId}`);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  },
);

export const adminVerifyGreaterRealmBatchV1 = warpkeep.reducer(
  { name: 'admin_verify_greater_realm_batch_v1' },
  { atlasId: t.string(), importEpoch: t.u64(), requestedRows: t.u32() },
  (ctx, { atlasId, importEpoch, requestedRows }) => {
    try {
      const admin = requireAdmin(ctx);
      requireGreaterRealmV17ImportGate();
      const result = verifyGreaterRealmBatchV1(ctx, atlasId, importEpoch, requestedRows);
      audit(ctx, admin.subject, 'verify_greater_realm_batch_v1', `atlas=${atlasId};phase=${result.phase};processed=${result.processed}`);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  },
);

export const adminFinalizeGreaterRealmReleaseV1 = warpkeep.reducer(
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
      const admin = requireAdmin(ctx);
      requireGreaterRealmV17ImportGate();
      finalizeGreaterRealmReleaseV1(ctx, input, ctx.random);
      audit(ctx, admin.subject, 'finalize_greater_realm_release_v1', `atlas=${input.atlasId};state=ready;activation=false`);
    } catch (error) {
      return senderGreaterRealmError(error);
    }
  },
);

export const getRealmAtlasBootstrapV1 = warpkeep.procedure(
  { name: 'get_realm_atlas_bootstrap_v1' },
  greaterRealmAtlasBootstrapV1,
  ctx => ctx.withTx(tx => {
    try {
      const { castle } = requireGameplayPlayerV1(tx);
      const atlas = requireReadableAtlas(tx);
      const regions = GREATER_REALM_PUBLIC_REGIONS.map(expected => {
        const row = tx.db.realmAtlasVisibleRegionV1.regionId.find(expected.id);
        if (row === null || !row.active || row.atlasId !== atlas.atlasId) unavailable();
        return projectRegion(row);
      });
      const occupancy = tx.db.greaterRealmCellOccupancyV1.castleId.find(castle.castleId);
      return {
        atlasId: atlas.atlasId,
        publicReleaseId: atlas.publicReleaseId,
        name: atlas.name,
        protocolVersion: atlas.protocolVersion,
        generatorVersion: atlas.generatorVersion,
        runtimePartitionVersion: atlas.runtimePartitionVersion,
        rendererContractVersion: atlas.rendererContractVersion,
        revision: atlas.revision,
        visibleTierMax: atlas.visibleTierMax,
        navigationTierMax: atlas.navigationTierMax,
        foundingTierMax: atlas.foundingTierMax,
        visibleRegionCount: atlas.visibleRegionCount,
        visibleCellCount: atlas.visibleCellCount,
        visibleChunkCount: atlas.visibleChunkCount,
        castleCapacity: atlas.castleCapacity,
        mode: atlas.mode,
        regions,
        myCastleId: castle.castleId,
        myCellKey: occupancy?.cellKey,
      };
    } catch {
      return unavailable();
    }
  }),
);

export const getRealmAtlasWindowV1 = warpkeep.procedure(
  { name: 'get_realm_atlas_window_v1' },
  { centerQ: t.i32(), centerR: t.i32(), radius: t.u32(), expectedRevision: t.u64() },
  greaterRealmWindowV1,
  (ctx, { centerQ, centerR, radius, expectedRevision }) => ctx.withTx(tx => {
    try {
      requireGameplayPlayerV1(tx);
      requireGreaterRealmSafeInteger(radius, 0, GREATER_REALM_MAX_WINDOW_RADIUS, 'GREATER_REALM_WINDOW_INVALID');
      const atlas = requireReadableAtlas(tx, expectedRevision);
      const handles = new Set<string>();
      for (let dq = -radius; dq <= radius; dq += 1) {
        for (let dr = -radius; dr <= radius; dr += 1) {
          const chunk = tx.db.greaterRealmChunkV1.chunkCoordKey.find(
            `B:${centerQ + dq}:${centerR + dr}`,
          );
          if (chunk !== null && chunk.atlasId === atlas.atlasId) handles.add(chunk.chunkHandle);
        }
      }
      if (handles.size > 81) unavailable();
      const chunks = [...handles].map(handle => {
        const chunk = tx.db.greaterRealmChunkV1.chunkHandle.find(handle);
        if (chunk === null || chunk.atlasId !== atlas.atlasId) return unavailable();
        return chunkDescriptor(chunk);
      }).sort((left, right) => left.binQ - right.binQ || left.binR - right.binR);
      return { atlasId: atlas.atlasId, revision: atlas.revision, centerQ, centerR, radius, chunks };
    } catch {
      return unavailable();
    }
  }),
);

export const getRealmAtlasChunkV1 = warpkeep.procedure(
  { name: 'get_realm_atlas_chunk_v1' },
  { chunkHandle: t.string(), lod: t.u32(), expectedRevision: t.u64() },
  greaterRealmChunkProjectionV1,
  (ctx, { chunkHandle, lod, expectedRevision }) => ctx.withTx(tx => {
    try {
      requireGameplayPlayerV1(tx);
      requireGreaterRealmOpaqueId(chunkHandle, 'GREATER_REALM_CHUNK_HANDLE_INVALID');
      requireGreaterRealmSafeInteger(lod, 0, 3, 'GREATER_REALM_LOD_INVALID');
      const atlas = requireReadableAtlas(tx, expectedRevision);
      const chunk = tx.db.greaterRealmChunkV1.chunkHandle.find(chunkHandle);
      if (chunk === null || chunk.atlasId !== atlas.atlasId) unavailable();
      const payload = parseStoredChunk(chunk);
      const coreKeys = payload.cells.map(cell => cell.cellKey);
      if (coreKeys.some(key => typeof key !== 'string')) unavailable();
      const selectedKeys = lod === 0 ? [...coreKeys as string[], ...payload.apronCellKeys]
        : lod === 1 ? payload.lod1CellKeys
          : lod === 2 ? payload.lod2CellKeys
            : payload.lod3CellKeys;
      const coreSet = new Set(coreKeys as string[]);
      const apronSet = new Set(payload.apronCellKeys);
      if (selectedKeys.length > 384 || payload.apronCellKeys.length > 384) unavailable();
      const coreCells = [];
      const apronCells = [];
      for (const key of selectedKeys) {
        if (typeof key !== 'string') unavailable();
        const cell = tx.db.greaterRealmCellV1.cellKey.find(key);
        if (cell === null || cell.atlasId !== atlas.atlasId) unavailable();
        if (coreSet.has(key)) coreCells.push(projectCell(cell));
        else if (apronSet.has(key)) apronCells.push(projectCell(cell));
        else unavailable();
      }
      if (coreCells.length + apronCells.length > 384) unavailable();
      const locationMap = new Map<string, {
        locationId: string;
        cellKey: string;
        regionId: string;
        atlasQ: number;
        atlasR: number;
        resourceKind: string;
        nodeCount: number;
        policyVersion: string;
      }>();
      for (const value of payload.resourceNodes) {
        const locationId = value.locationId;
        const cellKey = value.cellKey;
        const regionId = value.regionId;
        const resourceKind = value.resourceKind;
        const policyVersion = value.policyVersion;
        if (
          typeof locationId !== 'string'
          || typeof cellKey !== 'string'
          || typeof regionId !== 'string'
          || typeof resourceKind !== 'string'
          || typeof policyVersion !== 'string'
        ) unavailable();
        const locationCell = tx.db.greaterRealmCellV1.cellKey.find(cellKey);
        if (locationCell === null || locationCell.atlasId !== atlas.atlasId) unavailable();
        const current = locationMap.get(locationId);
        if (current === undefined) {
          locationMap.set(locationId, {
            locationId,
            cellKey,
            regionId,
            atlasQ: locationCell.atlasQ,
            atlasR: locationCell.atlasR,
            resourceKind,
            nodeCount: 1,
            policyVersion,
          });
        } else if (
          current.cellKey !== cellKey
          || current.regionId !== regionId
          || current.atlasQ !== locationCell.atlasQ
          || current.atlasR !== locationCell.atlasR
          || current.resourceKind !== resourceKind
          || current.policyVersion !== policyVersion
        ) unavailable();
        else current.nodeCount += 1;
        if (locationMap.size > 128) unavailable();
      }
      return {
        atlasId: atlas.atlasId,
        revision: atlas.revision,
        chunkHandle,
        lod,
        sourceCellCount: coreKeys.length,
        coreCells,
        apronCells,
        resourceLocations: [...locationMap.values()],
      };
    } catch {
      return unavailable();
    }
  }),
);

export const planRealmRouteV1 = warpkeep.procedure(
  { name: 'plan_realm_route_v1' },
  {
    originCellKey: t.string(),
    destinationCellKey: t.string(),
    offset: t.u32(),
    limit: t.u32(),
    expectedRevision: t.u64(),
  },
  greaterRealmRoutePageV1,
  (ctx, { originCellKey, destinationCellKey, offset, limit, expectedRevision }) => ctx.withTx(tx => {
    try {
      requireGameplayPlayerV1(tx);
      requireGreaterRealmOpaqueId(originCellKey, 'GREATER_REALM_CELL_KEY_INVALID');
      requireGreaterRealmOpaqueId(destinationCellKey, 'GREATER_REALM_CELL_KEY_INVALID');
      requireGreaterRealmSafeInteger(offset, 0, 0xffff_ffff, 'GREATER_REALM_ROUTE_OFFSET_INVALID');
      requireGreaterRealmSafeInteger(limit, 1, GREATER_REALM_MAX_ROUTE_PAGE, 'GREATER_REALM_ROUTE_PAGE_INVALID');
      const atlas = requireReadableAtlas(tx, expectedRevision);
      const origin = tx.db.greaterRealmCellV1.cellKey.find(originCellKey);
      const destination = tx.db.greaterRealmCellV1.cellKey.find(destinationCellKey);
      if (
        origin === null
        || destination === null
        || origin.atlasId !== atlas.atlasId
        || destination.atlasId !== atlas.atlasId
        || !origin.passable
        || !destination.passable
        || origin.componentKey === undefined
        || destination.componentKey !== origin.componentKey
        || origin.routeDepth === undefined
        || destination.routeDepth === undefined
        || origin.routeDepth > GREATER_REALM_MAX_ROUTE_DEPTH
        || destination.routeDepth > GREATER_REALM_MAX_ROUTE_DEPTH
      ) unavailable();
      const componentKey = origin.componentKey;
      const chainToRoot = (start: GreaterRealmCellRow): GreaterRealmCellRow[] => {
        const chain: GreaterRealmCellRow[] = [];
        let current: GreaterRealmCellRow | null = start;
        while (current !== null) {
          if (
            chain.length > GREATER_REALM_MAX_ROUTE_DEPTH
            || current.componentKey !== componentKey
            || current.routeDepth === undefined
            || current.routeDepth !== start.routeDepth! - chain.length
          ) unavailable();
          chain.push(current);
          if (current.routeDepth === 0) break;
          const parent = parentCell(tx, current);
          if (parent === null || parent.routeDepth !== current.routeDepth - 1) unavailable();
          current = parent;
        }
        if (chain[chain.length - 1]?.routeDepth !== 0) unavailable();
        return chain;
      };
      const originChain = chainToRoot(origin);
      const destinationChain = chainToRoot(destination);
      const originIndexes = new Map(originChain.map((cell, index) => [cell.cellKey, index] as const));
      let destinationLcaIndex = -1;
      let originLcaIndex = -1;
      for (let index = 0; index < destinationChain.length; index += 1) {
        const candidate = originIndexes.get(destinationChain[index]!.cellKey);
        if (candidate !== undefined) {
          destinationLcaIndex = index;
          originLcaIndex = candidate;
          break;
        }
      }
      if (originLcaIndex < 0 || destinationLcaIndex < 0) unavailable();
      const path = [
        ...originChain.slice(0, originLcaIndex + 1),
        ...destinationChain.slice(0, destinationLcaIndex).reverse(),
      ];
      if (path.length > GREATER_REALM_MAX_ROUTE_DEPTH * 2 + 1 || offset > path.length) unavailable();
      const page = path.slice(offset, offset + limit);
      const nextOffset = offset + page.length < path.length ? offset + page.length : undefined;
      return {
        atlasId: atlas.atlasId,
        revision: atlas.revision,
        cells: page.map(projectCell),
        totalLength: path.length,
        nextOffset,
        complete: nextOffset === undefined,
      };
    } catch {
      return unavailable();
    }
  }),
);
