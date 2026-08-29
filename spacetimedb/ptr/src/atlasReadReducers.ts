import { SenderError, t } from 'spacetimedb/server';

import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_CHUNK_BIN_SIZE,
  GREATER_REALM_MAX_CHUNK_CORE_CELLS,
  GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
  GREATER_REALM_PROTOCOL_VERSION,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RESOURCE_KINDS,
  GREATER_REALM_UNASSIGNED_RANK,
  GREATER_REALM_VISIBLE_TIER_MAX,
  requireGreaterRealmOpaqueId,
} from './atlasPolicy';
import { inspectGreaterRealmV17 } from './atlasAuthority';
import { sha256Hex } from './sha256';
import { requirePtrOwner } from './auth';
import {
  planPtrTreeRoutePage,
  requirePtrChunkRequest,
  requirePtrResourceChunkHandles,
  requirePtrRoutePageRequest,
  requirePtrWindowRequest,
} from './atlasReadPolicy';
import { PTR_ATLAS_ID } from './contract';
import { requirePtrPopulationEmpty, type PtrContext } from './context';
import ptr from './schema';

const PTR_ATLAS_REVISION_MODE = 'canary';
const PTR_RESOURCE_MAX_CELL_NODES =
  GREATER_REALM_RESOURCE_KINDS.length * GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION;
const PTR_RESOURCE_MAX_CHUNK_NODES = 256;
const PTR_RESOURCE_MAX_CHUNK_LOCATIONS = 128;
const PTR_RESOURCE_MAX_RESPONSE_ROWS = 128;

type SharedGreaterRealmContext = Parameters<typeof inspectGreaterRealmV17>[0];
type PtrCellRow = NonNullable<
  ReturnType<PtrContext['db']['greaterRealmCellV1']['cellKey']['find']>
>;
type PtrReleaseRow = NonNullable<
  ReturnType<PtrContext['db']['greaterRealmReleaseV1']['atlasId']['find']>
>;
type PtrChunkRow = NonNullable<
  ReturnType<PtrContext['db']['greaterRealmChunkV1']['chunkHandle']['find']>
>;

function sharedGreaterRealmContext(ctx: PtrContext): SharedGreaterRealmContext {
  return ctx as unknown as SharedGreaterRealmContext;
}

function unavailable(): never {
  throw new SenderError('PTR_ATLAS_UNAVAILABLE');
}

function boundedRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= maximum) unavailable();
    result.push(row);
  }
  return Object.freeze(result);
}

type PtrRegionManifestRow = Readonly<{
  regionId: string;
  publicName: string;
  ordinal: number;
  tier: number;
  cellCount: number;
  passableCellCount: number;
  chunkCount: number;
  castleCapacity: number;
  resourceLocationCount: number;
  resourceNodeCount: number;
  foodNodeCount: number;
  woodNodeCount: number;
  stoneNodeCount: number;
  goldNodeCount: number;
  active: boolean;
}>;

function safeU32(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= 0xffff_ffff;
}

function ptrRegionManifest(release: PtrReleaseRow): readonly PtrRegionManifestRow[] {
  const source = release.regionManifestJson;
  if (source === undefined || !source.endsWith('\n')) unavailable();
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return unavailable();
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== GREATER_REALM_PUBLIC_REGIONS.length
    || `${JSON.stringify(parsed)}\n` !== source
  ) unavailable();
  const keys = [
    'regionId', 'publicName', 'ordinal', 'tier', 'cellCount', 'passableCellCount',
    'chunkCount', 'castleCapacity', 'resourceLocationCount', 'resourceNodeCount',
    'foodNodeCount', 'woodNodeCount', 'stoneNodeCount', 'goldNodeCount', 'active',
  ];
  const rows = parsed.map((value, index) => {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      return unavailable();
    }
    const row = value as Record<string, unknown>;
    const expected = GREATER_REALM_PUBLIC_REGIONS[index]!;
    if (
      Object.keys(row).length !== keys.length
      || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))
      || row.regionId !== expected.id
      || row.publicName !== expected.name
      || row.ordinal !== expected.ordinal
      || row.tier !== GREATER_REALM_VISIBLE_TIER_MAX
      || row.castleCapacity !== GREATER_REALM_CASTLES_PER_REGION
      || row.active !== false
      || keys.slice(2, -1).some(key => !safeU32(row[key]))
    ) return unavailable();
    return Object.freeze(row as unknown as PtrRegionManifestRow);
  });
  return Object.freeze(rows);
}

type PtrReadyAtlas = Readonly<{
  release: PtrReleaseRow;
  revision: bigint;
  regions: readonly PtrRegionManifestRow[];
  anchorCell: PtrCellRow;
  anchorChunk: PtrChunkRow;
}>;

function requirePtrReadyAtlas(ctx: PtrContext): PtrReadyAtlas {
  requirePtrPopulationEmpty(ctx);
  const status = inspectGreaterRealmV17(sharedGreaterRealmContext(ctx));
  const release = ctx.db.greaterRealmReleaseV1.atlasId.find(PTR_ATLAS_ID);
  if (
    release === null
    || ctx.db.greaterRealmReleaseV1.count() !== 1n
    || status.atlasId !== PTR_ATLAS_ID
    || status.state !== 'ready'
    || !status.ready
    || !status.importsExact
    || release.state !== 'ready'
    || release.publicName === undefined
    || release.readyAt === undefined
    || release.importEpoch <= 0n
    || release.verificationPhase !== 'complete'
    || release.verifiedComponentCount !== release.expectedComponentCount
    || release.verifiedChunkCount !== release.expectedChunkCount
    || release.verifiedCellCount !== release.expectedCellCount
    || release.verifiedSlotCount !== release.expectedSlotCount
    || release.verifiedResourceNodeCount !== release.expectedResourceNodeCount
    || release.expectedRegionCount !== GREATER_REALM_PUBLIC_REGIONS.length
    || release.expectedSlotCount !== GREATER_REALM_CASTLE_CAPACITY
    || status.componentRows !== BigInt(release.expectedComponentCount)
    || status.chunkRows !== BigInt(release.expectedChunkCount)
    || status.cellRows !== BigInt(release.expectedCellCount)
    || status.slotRows !== BigInt(release.expectedSlotCount)
    || status.resourceRows !== BigInt(release.expectedResourceNodeCount)
    || status.claimRows !== 0n
    || status.occupancyRows !== 0n
    || status.activationRows !== 0n
    || status.publicAtlasRows !== 0n
    || status.publicRegionRows !== 0n
    || status.workerSystemRows !== 0n
  ) unavailable();
  const regions = ptrRegionManifest(release);
  if (
    regions.reduce((sum, row) => sum + row.cellCount, 0)
      !== release.expectedCellCount
    || regions.reduce((sum, row) => sum + row.castleCapacity, 0)
      !== release.expectedSlotCount
    || regions.reduce((sum, row) => sum + row.resourceNodeCount, 0)
      !== release.expectedResourceNodeCount
  ) unavailable();
  const component = ctx.db.greaterRealmNavigationComponentV1.componentOrdinal.find(0);
  const anchorCell = component === null
    ? null
    : ctx.db.greaterRealmCellV1.cellKey.find(component.rootCellKey);
  const anchorChunk = anchorCell === null
    ? null
    : ctx.db.greaterRealmChunkV1.chunkHandle.find(anchorCell.chunkHandle);
  if (
    component === null
    || anchorCell === null
    || anchorChunk === null
    || component.atlasId !== PTR_ATLAS_ID
    || !component.active
    || component.verificationPhase !== 'complete'
    || anchorCell.atlasId !== PTR_ATLAS_ID
    || anchorCell.componentKey !== component.componentKey
    || !anchorCell.passable
    || anchorCell.routeDepth !== 0
    || anchorCell.routeParentDirection !== undefined
    || anchorChunk.atlasId !== PTR_ATLAS_ID
  ) unavailable();
  return Object.freeze({
    release,
    revision: release.importEpoch,
    regions,
    anchorCell,
    anchorChunk,
  });
}

function projectRegion(row: PtrRegionManifestRow) {
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

function projectCell(row: PtrCellRow) {
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

function chunkDescriptor(row: PtrChunkRow) {
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

function parseStoredChunk(row: PtrChunkRow) {
  if (
    sha256Hex(new TextEncoder().encode(row.payloadJson)) !== row.payloadSha256
    || !row.payloadJson.endsWith('\n')
  ) unavailable();
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

function ownerAtlas<T>(ctx: PtrContext, effect: (
  authority: ReturnType<typeof requirePtrOwner>,
  atlas: PtrReadyAtlas,
) => T): T {
  const authority = requirePtrOwner(ctx);
  const atlas = requirePtrReadyAtlas(ctx);
  const result = effect(authority, atlas);
  requirePtrPopulationEmpty(ctx);
  return result;
}

const regionProjectionV1 = t.object('PtrGreaterRealmRegionProjectionV1', {
  regionId: t.string(), ordinal: t.u32(), publicName: t.string(), tier: t.u32(),
  cellCount: t.u32(), passableCellCount: t.u32(), chunkCount: t.u32(),
  castleCapacity: t.u32(), resourceLocationCount: t.u32(), resourceNodeCount: t.u32(),
  foodNodeCount: t.u32(), woodNodeCount: t.u32(), stoneNodeCount: t.u32(),
  goldNodeCount: t.u32(),
});

const atlasBootstrapV1 = t.object('PtrGreaterRealmAtlasBootstrapV1', {
  atlasId: t.string(), publicReleaseId: t.string(), name: t.string(),
  protocolVersion: t.u32(), generatorVersion: t.string(),
  runtimePartitionVersion: t.string(), rendererContractVersion: t.string(),
  revision: t.u64(), visibleTierMax: t.u32(), navigationTierMax: t.u32(),
  foundingTierMax: t.u32(), visibleRegionCount: t.u32(), visibleCellCount: t.u32(),
  visibleChunkCount: t.u32(), castleCapacity: t.u32(), mode: t.string(),
  regions: t.array(regionProjectionV1), myCastleId: t.u64(), myCellKey: t.string(),
  myAtlasQ: t.i32(), myAtlasR: t.i32(), myElevation: t.i32(),
});

const chunkDescriptorV1 = t.object('PtrGreaterRealmChunkDescriptorV1', {
  chunkHandle: t.string(), binQ: t.i32(), binR: t.i32(), coreCellCount: t.u32(),
  apronCellCount: t.u32(), lod0CellCount: t.u32(), lod1CellCount: t.u32(),
  lod2CellCount: t.u32(), lod3CellCount: t.u32(),
});

const castleProjectionV1 = t.object('PtrGreaterRealmCastleProjectionV1', {
  castleId: t.u64(), chunkHandle: t.string(), atlasQ: t.i32(), atlasR: t.i32(),
  level: t.i32(), elevation: t.i32(),
});

const windowV1 = t.object('PtrGreaterRealmWindowV1', {
  atlasId: t.string(), revision: t.u64(), centerQ: t.i32(), centerR: t.i32(),
  radius: t.u32(), chunks: t.array(chunkDescriptorV1),
  castles: t.array(castleProjectionV1),
});

const cellProjectionV1 = t.object('PtrGreaterRealmCellProjectionV1', {
  cellKey: t.string(), chunkHandle: t.string(), regionId: t.string(),
  atlasQ: t.i32(), atlasR: t.i32(), tier: t.u32(), passable: t.bool(),
  elevation: t.i32(), slope: t.u32(), aspect: t.u32(), profileCurvature: t.i32(),
  planCurvature: t.i32(), geologicalBarrierBand: t.u32(), biomeClass: t.u32(),
  landformClass: t.u32(), yieldClass: t.u32(), movementCost: t.u32(),
  sealedBoundaryMask: t.u32(), hydroRegime: t.u32(), hydroBodyId: t.option(t.string()),
  hydroDepthClass: t.u32(), hydroSurfaceMilli: t.i32(),
  hydroFlowDirection: t.option(t.u32()), flowAccumulation: t.u64(),
  bankVariant: t.u32(), hydrologyRevision: t.u32(), travelClass: t.u32(),
  wetness: t.u32(), exposure: t.i32(), coastDistance: t.u32(),
  freshwaterDistance: t.u32(), temperature: t.i32(), moisture: t.i32(),
  habitatClass: t.u32(), canopyBasisPoints: t.u32(), groundcoverBasisPoints: t.u32(),
  wildflowerBasisPoints: t.u32(), featureClass: t.u32(), ambienceClass: t.u32(),
  presentationVariant: t.u32(),
});

const resourceLocationProjectionV1 = t.object('PtrGreaterRealmResourceLocationProjectionV1', {
  locationId: t.string(), cellKey: t.string(), regionId: t.string(),
  atlasQ: t.i32(), atlasR: t.i32(), resourceKind: t.string(), nodeCount: t.u32(),
  policyVersion: t.string(),
});

const chunkProjectionV1 = t.object('PtrGreaterRealmChunkProjectionV1', {
  atlasId: t.string(), revision: t.u64(), chunkHandle: t.string(), lod: t.u32(),
  sourceCellCount: t.u32(), coreCells: t.array(cellProjectionV1),
  apronCells: t.array(cellProjectionV1),
  resourceLocations: t.array(resourceLocationProjectionV1),
});

const resourceLocationSummaryV1 = t.object('PtrGreaterRealmResourceLocationSummaryV1', {
  chunkHandle: t.string(), locationId: t.string(), atlasQ: t.i32(), atlasR: t.i32(),
  resourceKind: t.string(), nodeCount: t.u32(),
});

const resourceLocationBatchV1 = t.object('PtrGreaterRealmResourceLocationBatchV1', {
  atlasId: t.string(), revision: t.u64(), chunkHandles: t.array(t.string()),
  truncated: t.bool(), resourceLocations: t.array(resourceLocationSummaryV1),
});

const routePageV1 = t.object('PtrGreaterRealmRoutePageV1', {
  atlasId: t.string(), revision: t.u64(), cells: t.array(cellProjectionV1),
  totalLength: t.u32(), nextOffset: t.option(t.u32()), complete: t.bool(),
});

export const getRealmAtlasBootstrapV1 = ptr.procedure(
  { name: 'get_realm_atlas_bootstrap_v1' },
  atlasBootstrapV1,
  ctx => ctx.withTx(tx => {
    try {
      return ownerAtlas(tx, ({ claims }, atlas) => ({
        atlasId: PTR_ATLAS_ID,
        publicReleaseId: atlas.release.publicReleaseId,
        name: atlas.release.publicName!,
        protocolVersion: GREATER_REALM_PROTOCOL_VERSION,
        generatorVersion: atlas.release.generatorVersion,
        runtimePartitionVersion: atlas.release.runtimePartitionVersion,
        rendererContractVersion: atlas.release.rendererContractVersion,
        revision: atlas.revision,
        visibleTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
        navigationTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
        foundingTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
        visibleRegionCount: atlas.regions.length,
        visibleCellCount: atlas.release.expectedCellCount,
        visibleChunkCount: atlas.release.expectedChunkCount,
        castleCapacity: atlas.release.expectedSlotCount,
        mode: PTR_ATLAS_REVISION_MODE,
        regions: atlas.regions.map(projectRegion),
        myCastleId: claims.fid,
        myCellKey: atlas.anchorCell.cellKey,
        myAtlasQ: atlas.anchorCell.atlasQ,
        myAtlasR: atlas.anchorCell.atlasR,
        myElevation: atlas.anchorCell.elevation,
      }));
    } catch {
      return unavailable();
    }
  }),
);

export const getRealmAtlasWindowV1 = ptr.procedure(
  { name: 'get_realm_atlas_window_v1' },
  { centerQ: t.i32(), centerR: t.i32(), radius: t.u32(), expectedRevision: t.u64() },
  windowV1,
  (ctx, { centerQ, centerR, radius, expectedRevision }) => ctx.withTx(tx => {
    try {
      return ownerAtlas(tx, ({ claims }, atlas) => {
        requirePtrWindowRequest(radius);
        if (expectedRevision !== atlas.revision) unavailable();
        const handles = new Set<string>();
        for (let dq = -radius; dq <= radius; dq += 1) {
          for (let dr = -radius; dr <= radius; dr += 1) {
            const chunk = tx.db.greaterRealmChunkV1.chunkCoordKey.find(
              `B:${centerQ + dq}:${centerR + dr}`,
            );
            if (chunk !== null && chunk.atlasId === PTR_ATLAS_ID) {
              handles.add(chunk.chunkHandle);
            }
          }
        }
        if (handles.size > 81) unavailable();
        const chunks = [...handles].map(handle => {
          const row = tx.db.greaterRealmChunkV1.chunkHandle.find(handle);
          if (row === null || row.atlasId !== PTR_ATLAS_ID) return unavailable();
          return chunkDescriptor(row);
        }).sort((left, right) => left.binQ - right.binQ || left.binR - right.binR);
        const anchorVisible = handles.has(atlas.anchorChunk.chunkHandle)
          && Math.abs(atlas.anchorChunk.binQ - centerQ) <= radius
          && Math.abs(atlas.anchorChunk.binR - centerR) <= radius;
        return {
          atlasId: PTR_ATLAS_ID,
          revision: atlas.revision,
          centerQ,
          centerR,
          radius,
          chunks,
          castles: anchorVisible ? [{
            castleId: claims.fid,
            chunkHandle: atlas.anchorChunk.chunkHandle,
            atlasQ: atlas.anchorCell.atlasQ,
            atlasR: atlas.anchorCell.atlasR,
            level: 1,
            elevation: atlas.anchorCell.elevation,
          }] : [],
        };
      });
    } catch {
      return unavailable();
    }
  }),
);

export const getRealmAtlasChunkV1 = ptr.procedure(
  { name: 'get_realm_atlas_chunk_v1' },
  { chunkHandle: t.string(), lod: t.u32(), expectedRevision: t.u64() },
  chunkProjectionV1,
  (ctx, { chunkHandle, lod, expectedRevision }) => ctx.withTx(tx => {
    try {
      return ownerAtlas(tx, (_owner, atlas) => {
        requirePtrChunkRequest(chunkHandle, lod);
        if (expectedRevision !== atlas.revision) unavailable();
        const chunk = tx.db.greaterRealmChunkV1.chunkHandle.find(chunkHandle);
        if (chunk === null || chunk.atlasId !== PTR_ATLAS_ID) unavailable();
        const payload = parseStoredChunk(chunk);
        const coreKeys = payload.cells.map(cell => cell.cellKey);
        if (
          coreKeys.some(key => typeof key !== 'string')
          || new Set(coreKeys).size !== coreKeys.length
          || new Set(payload.apronCellKeys).size !== payload.apronCellKeys.length
        ) unavailable();
        const selectedKeys = lod === 0
          ? [...coreKeys as string[], ...payload.apronCellKeys]
          : lod === 1
            ? payload.lod1CellKeys
            : lod === 2
              ? payload.lod2CellKeys
              : payload.lod3CellKeys;
        if (selectedKeys.length > 384 || payload.apronCellKeys.length > 384) {
          unavailable();
        }
        const coreSet = new Set(coreKeys as string[]);
        const apronSet = new Set(payload.apronCellKeys);
        const seen = new Set<string>();
        const coreCells = [];
        const apronCells = [];
        for (const key of selectedKeys) {
          if (typeof key !== 'string' || seen.has(key)) unavailable();
          seen.add(key);
          const cell = tx.db.greaterRealmCellV1.cellKey.find(key);
          if (cell === null || cell.atlasId !== PTR_ATLAS_ID) unavailable();
          if (coreSet.has(key)) coreCells.push(projectCell(cell));
          else if (apronSet.has(key)) apronCells.push(projectCell(cell));
          else unavailable();
        }
        return {
          atlasId: PTR_ATLAS_ID,
          revision: atlas.revision,
          chunkHandle,
          lod,
          sourceCellCount: coreKeys.length,
          coreCells,
          apronCells,
          resourceLocations: [],
        };
      });
    } catch {
      return unavailable();
    }
  }),
);

export const getRealmAtlasResourceLocationsV1 = ptr.procedure(
  { name: 'get_realm_atlas_resource_locations_v1' },
  { expectedRevision: t.u64(), chunkHandles: t.array(t.string()) },
  resourceLocationBatchV1,
  (ctx, { expectedRevision, chunkHandles }) => ctx.withTx(tx => {
    try {
      return ownerAtlas(tx, (_owner, atlas) => {
        const requested = requirePtrResourceChunkHandles(chunkHandles);
        if (expectedRevision !== atlas.revision) unavailable();
        const locations: Array<{
          chunkHandle: string;
          locationId: string;
          atlasQ: number;
          atlasR: number;
          resourceKind: string;
          nodeCount: number;
        }> = [];
        const seenLocations = new Map<string, string>();
        for (const chunkHandle of requested) {
          const chunk = tx.db.greaterRealmChunkV1.chunkHandle.find(chunkHandle);
          if (chunk === null || chunk.atlasId !== PTR_ATLAS_ID) unavailable();
          const cells = [...boundedRows(
            tx.db.greaterRealmCellV1.chunkHandle.filter(chunkHandle),
            GREATER_REALM_MAX_CHUNK_CORE_CELLS,
          )].sort((left, right) => left.releaseOrdinal - right.releaseOrdinal);
          if (cells.length !== chunk.coreCellCount) unavailable();
          let chunkNodeCount = 0;
          const chunkLocations = new Set<string>();
          for (const cell of cells) {
            if (
              cell.atlasId !== PTR_ATLAS_ID
              || cell.chunkHandle !== chunkHandle
              || cell.tier !== GREATER_REALM_VISIBLE_TIER_MAX
            ) unavailable();
            const rows = boundedRows(
              tx.db.greaterRealmResourceNodeV1.cellKey.filter(cell.cellKey),
              PTR_RESOURCE_MAX_CELL_NODES,
            );
            chunkNodeCount += rows.length;
            if (chunkNodeCount > PTR_RESOURCE_MAX_CHUNK_NODES) unavailable();
            for (const row of rows) {
              if (
                row.atlasId !== PTR_ATLAS_ID
                || row.cellKey !== cell.cellKey
                || row.regionId !== cell.regionId
                || row.componentKey !== cell.componentKey
                || row.tier !== GREATER_REALM_VISIBLE_TIER_MAX
                || row.active
                || row.allocationRank !== GREATER_REALM_UNASSIGNED_RANK
                || !GREATER_REALM_RESOURCE_KINDS.includes(
                  row.resourceKind as typeof GREATER_REALM_RESOURCE_KINDS[number],
                )
              ) unavailable();
              if (chunkLocations.has(row.locationId)) continue;
              chunkLocations.add(row.locationId);
              if (chunkLocations.size > PTR_RESOURCE_MAX_CHUNK_LOCATIONS) unavailable();
              const priorCell = seenLocations.get(row.locationId);
              if (priorCell !== undefined && priorCell !== row.cellKey) unavailable();
              if (priorCell !== undefined) continue;
              seenLocations.set(row.locationId, row.cellKey);
              const locationRows = [...boundedRows(
                tx.db.greaterRealmResourceNodeV1.locationId.filter(row.locationId),
                GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
              )].sort((left, right) => left.releaseOrdinal - right.releaseOrdinal);
              if (locationRows.length === 0) unavailable();
              for (let index = 0; index < locationRows.length; index += 1) {
                const candidate = locationRows[index]!;
                if (
                  candidate.atlasId !== PTR_ATLAS_ID
                  || candidate.locationId !== row.locationId
                  || candidate.cellKey !== row.cellKey
                  || candidate.regionId !== row.regionId
                  || candidate.componentKey !== row.componentKey
                  || candidate.resourceKind !== row.resourceKind
                  || candidate.policyVersion !== row.policyVersion
                  || candidate.nodeOrdinal !== locationRows[0]!.nodeOrdinal + index
                  || candidate.releaseOrdinal !== locationRows[0]!.releaseOrdinal + index
                ) unavailable();
              }
              locations.push({
                chunkHandle,
                locationId: row.locationId,
                atlasQ: cell.atlasQ,
                atlasR: cell.atlasR,
                resourceKind: row.resourceKind,
                nodeCount: locationRows.length,
              });
            }
          }
        }
        locations.sort((left, right) => (
          requested.indexOf(left.chunkHandle) - requested.indexOf(right.chunkHandle)
          || left.resourceKind.localeCompare(right.resourceKind)
          || left.locationId.localeCompare(right.locationId)
        ));
        return {
          atlasId: PTR_ATLAS_ID,
          revision: atlas.revision,
          chunkHandles: [...requested],
          truncated: locations.length > PTR_RESOURCE_MAX_RESPONSE_ROWS,
          resourceLocations: locations.slice(0, PTR_RESOURCE_MAX_RESPONSE_ROWS),
        };
      });
    } catch {
      return unavailable();
    }
  }),
);

export const planRealmRouteV1 = ptr.procedure(
  { name: 'plan_realm_route_v1' },
  {
    originCellKey: t.string(), destinationCellKey: t.string(), offset: t.u32(),
    limit: t.u32(), expectedRevision: t.u64(),
  },
  routePageV1,
  (ctx, {
    originCellKey,
    destinationCellKey,
    offset,
    limit,
    expectedRevision,
  }) => ctx.withTx(tx => {
    try {
      return ownerAtlas(tx, (_owner, atlas) => {
        requireGreaterRealmOpaqueId(originCellKey, 'PTR_ATLAS_CELL_KEY_INVALID');
        requireGreaterRealmOpaqueId(destinationCellKey, 'PTR_ATLAS_CELL_KEY_INVALID');
        requirePtrRoutePageRequest(offset, limit);
        if (expectedRevision !== atlas.revision) unavailable();
        const origin = tx.db.greaterRealmCellV1.cellKey.find(originCellKey);
        const destination = tx.db.greaterRealmCellV1.cellKey.find(destinationCellKey);
        if (origin === null || destination === null) unavailable();
        const result = planPtrTreeRoutePage(
          origin,
          destination,
          offset,
          limit,
          (q, r) => tx.db.greaterRealmCellV1.atlasCoordKey.find(`A:${q}:${r}`),
        );
        return {
          atlasId: PTR_ATLAS_ID,
          revision: atlas.revision,
          cells: result.cells.map(projectCell),
          totalLength: result.totalLength,
          nextOffset: result.nextOffset,
          complete: result.complete,
        };
      });
    } catch {
      return unavailable();
    }
  }),
);
