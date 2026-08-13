import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  GREATER_REALM_MAX_CHUNK_CORE_CELLS,
  GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
  GREATER_REALM_MAX_WINDOW_RADIUS,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RESOURCE_KINDS,
  GREATER_REALM_UNASSIGNED_RANK,
} from './greaterRealmV17Policy';
import type warpkeep from './schema';

type WarpkeepContext = Pick<ReducerCtx<InferSchema<typeof warpkeep>>, 'db'>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepContext['db']['castle']['castleId']['find']>
>;
type AtlasRow = NonNullable<
  ReturnType<WarpkeepContext['db']['realmAtlasV1']['atlasId']['find']>
>;
type ResourceRow = NonNullable<
  ReturnType<WarpkeepContext['db']['greaterRealmResourceNodeV1']['nodeId']['find']>
>;

export const GREATER_REALM_RESOURCE_LOCATION_MAX_CHUNK_HANDLES = 8;
export const GREATER_REALM_RESOURCE_LOCATION_MAX_CHUNK_NODES = 256;
export const GREATER_REALM_RESOURCE_LOCATION_MAX_CHUNK_LOCATIONS = 128;
export const GREATER_REALM_RESOURCE_LOCATION_MAX_RESPONSE_ROWS = 128;
export const GREATER_REALM_RESOURCE_LOCATION_RESERVED_PER_KIND = 6;
const GREATER_REALM_RESOURCE_LOCATION_MAX_CELL_NODES =
  GREATER_REALM_RESOURCE_KINDS.length * GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION;
const U32_MAX = 0xffff_ffff;
const CHUNK_HANDLE_PATTERN = /^GRK-[A-Z2-7]{26}$/u;
const LOCATION_ID_PATTERN = /^GRL-[A-Z2-7]{26}$/u;

export class GreaterRealmResourceLocationAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmResourceLocationAuthorityError';
  }
}

function fail(code = 'GREATER_REALM_RESOURCE_LOCATION_INTEGRITY'): never {
  throw new GreaterRealmResourceLocationAuthorityError(code);
}

function boundedRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
  code: string,
): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= maximum) fail(code);
    result.push(row);
  }
  return Object.freeze(result);
}

function requireLocationId(value: string): void {
  if (!LOCATION_ID_PATTERN.test(value)) fail('GREATER_REALM_RESOURCE_LOCATION_INVALID');
}

export type ResolvedGreaterRealmResourceLocationV1 = Readonly<{
  locationId: string;
  cellKey: string;
  regionId: string;
  componentKey: string;
  resourceKind: string;
  policyVersion: string;
  nodeCount: number;
  rows: readonly ResourceRow[];
  destination: NonNullable<
    ReturnType<WarpkeepContext['db']['greaterRealmCellV1']['cellKey']['find']>
  >;
  component: NonNullable<
    ReturnType<WarpkeepContext['db']['greaterRealmNavigationComponentV1']['componentKey']['find']>
  >;
}>;

/**
 * Validate one immutable public capacity group. This is the shared boundary
 * used by both the caller projection and dispatch; private topology never
 * leaves the returned server-only value.
 */
export function resolveGreaterRealmResourceLocationV1(
  ctx: WarpkeepContext,
  atlasId: string,
  locationId: string,
): ResolvedGreaterRealmResourceLocationV1 {
  requireLocationId(locationId);
  const rows = [...boundedRows(
    ctx.db.greaterRealmResourceNodeV1.locationId.filter(locationId),
    GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
    'GREATER_REALM_WORKER_LOCATION_OVERSIZED',
  )].sort((left, right) => left.releaseOrdinal - right.releaseOrdinal);
  if (rows.length === 0) fail('GREATER_REALM_WORKER_LOCATION_UNAVAILABLE');
  const first = rows[0]!;
  const lastNodeOrdinal = first.nodeOrdinal + rows.length - 1;
  const lastReleaseOrdinal = first.releaseOrdinal + rows.length - 1;
  if (
    !Number.isSafeInteger(first.nodeOrdinal)
    || first.nodeOrdinal < 0
    || first.nodeOrdinal > U32_MAX
    || !Number.isSafeInteger(first.releaseOrdinal)
    || first.releaseOrdinal < 0
    || first.releaseOrdinal > U32_MAX
    || !Number.isSafeInteger(lastNodeOrdinal)
    || lastNodeOrdinal < 0
    || lastNodeOrdinal > U32_MAX
    || !Number.isSafeInteger(lastReleaseOrdinal)
    || lastReleaseOrdinal < 0
    || lastReleaseOrdinal > U32_MAX
    || !GREATER_REALM_PUBLIC_REGIONS.some(region => region.id === first.regionId)
    || !GREATER_REALM_RESOURCE_KINDS.includes(
      first.resourceKind as typeof GREATER_REALM_RESOURCE_KINDS[number]
    )
  ) fail('GREATER_REALM_WORKER_LOCATION_INTEGRITY');
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (
      !Number.isSafeInteger(row.nodeOrdinal)
      || !Number.isSafeInteger(row.releaseOrdinal)
      || row.atlasId !== atlasId
      || row.locationId !== locationId
      || row.cellKey !== first.cellKey
      || row.regionId !== first.regionId
      || row.componentKey !== first.componentKey
      || row.resourceKind !== first.resourceKind
      || row.policyVersion !== first.policyVersion
      || row.legacyCatalogId !== first.legacyCatalogId
      || row.tier !== 1
      || row.nodeOrdinal !== first.nodeOrdinal + index
      || row.releaseOrdinal !== first.releaseOrdinal + index
      || row.allocationRank !== GREATER_REALM_UNASSIGNED_RANK
      || !row.active
    ) fail('GREATER_REALM_WORKER_LOCATION_INTEGRITY');
  }
  const destination = ctx.db.greaterRealmCellV1.cellKey.find(first.cellKey);
  const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find(
    first.componentKey,
  );
  const region = ctx.db.realmAtlasVisibleRegionV1.regionId.find(first.regionId);
  if (
    destination === null
    || component === null
    || region === null
    || destination.atlasId !== atlasId
    || destination.cellKey !== first.cellKey
    || destination.regionId !== first.regionId
    || destination.componentKey !== first.componentKey
    || destination.tier !== 1
    || !destination.passable
    || component.atlasId !== atlasId
    || !component.active
    || region.atlasId !== atlasId
    || region.tier !== 1
    || !region.active
  ) fail('GREATER_REALM_WORKER_LOCATION_INTEGRITY');
  return Object.freeze({
    locationId,
    cellKey: first.cellKey,
    regionId: first.regionId,
    componentKey: first.componentKey,
    resourceKind: first.resourceKind,
    policyVersion: first.policyVersion,
    nodeCount: rows.length,
    rows: Object.freeze(rows),
    destination,
    component,
  });
}

export type GreaterRealmResourceLocationSummaryV1 = Readonly<{
  chunkHandle: string;
  locationId: string;
  atlasQ: number;
  atlasR: number;
  resourceKind: string;
  nodeCount: number;
}>;

export type GreaterRealmResourceLocationBatchV1 = Readonly<{
  atlasId: string;
  revision: bigint;
  chunkHandles: readonly string[];
  truncated: boolean;
  resourceLocations: readonly GreaterRealmResourceLocationSummaryV1[];
}>;

function axialDistance(
  originQ: number,
  originR: number,
  destinationQ: number,
  destinationR: number,
): number {
  const deltaQ = destinationQ - originQ;
  const deltaR = destinationR - originR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaQ + deltaR));
}

/**
 * Read at most eight current, nearby core chunks through indexed tables. The
 * implementation deliberately never parses the up-to-4MiB stored chunk JSON.
 */
export function projectGreaterRealmResourceLocationBatchV1(
  ctx: WarpkeepContext,
  atlas: AtlasRow,
  castle: CastleRow,
  requestedChunkHandles: readonly string[],
): GreaterRealmResourceLocationBatchV1 {
  for (let index = 0; index < requestedChunkHandles.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(requestedChunkHandles, index)) {
      fail('GREATER_REALM_RESOURCE_LOCATION_BATCH_INVALID');
    }
  }
  if (
    requestedChunkHandles.length < 1
    || requestedChunkHandles.length > GREATER_REALM_RESOURCE_LOCATION_MAX_CHUNK_HANDLES
    || new Set(requestedChunkHandles).size !== requestedChunkHandles.length
    || requestedChunkHandles.some(handle => !CHUNK_HANDLE_PATTERN.test(handle))
  ) fail('GREATER_REALM_RESOURCE_LOCATION_BATCH_INVALID');

  const occupancy = ctx.db.greaterRealmCellOccupancyV1.castleId.find(castle.castleId);
  const origin = ctx.db.greaterRealmCellV1.cellKey.find(castle.tileKey);
  const originChunk = origin === null
    ? null
    : ctx.db.greaterRealmChunkV1.chunkHandle.find(origin.chunkHandle);
  const originComponent = origin?.componentKey === undefined
    ? null
    : ctx.db.greaterRealmNavigationComponentV1.componentKey.find(origin.componentKey);
  const release = ctx.db.greaterRealmReleaseV1.atlasId.find(atlas.atlasId);
  if (
    occupancy === null
    || origin === null
    || originChunk === null
    || originComponent === null
    || release === null
    || occupancy.castleId !== castle.castleId
    || occupancy.cellKey !== castle.tileKey
    || occupancy.atlasId !== atlas.atlasId
    || occupancy.atlasRevision !== atlas.revision
    || origin.atlasId !== atlas.atlasId
    || origin.cellKey !== castle.tileKey
    || origin.atlasQ !== castle.q
    || origin.atlasR !== castle.r
    || origin.tier !== 1
    || !origin.passable
    || originChunk.atlasId !== atlas.atlasId
    || originComponent.atlasId !== atlas.atlasId
    || !originComponent.active
    || release.state !== atlas.mode
    || release.expectedResourceNodeCount <= 0
    || ctx.db.greaterRealmResourceNodeV1.count()
      !== BigInt(release.expectedResourceNodeCount)
  ) fail();

  const chunks = requestedChunkHandles.map((chunkHandle) => {
    const chunk = ctx.db.greaterRealmChunkV1.chunkHandle.find(chunkHandle);
    if (
      chunk === null
      || chunk.atlasId !== atlas.atlasId
      || Math.abs(chunk.binQ - originChunk.binQ) > GREATER_REALM_MAX_WINDOW_RADIUS
      || Math.abs(chunk.binR - originChunk.binR) > GREATER_REALM_MAX_WINDOW_RADIUS
    ) fail('GREATER_REALM_RESOURCE_LOCATION_CHUNK_INVALID');
    return chunk;
  });

  const candidates: Array<Readonly<{
    chunkHandle: string;
    locationId: string;
    cellKey: string;
  }>> = [];
  const seenLocationIds = new Map<string, string>();
  for (const chunk of chunks) {
    const cells = [...boundedRows(
      ctx.db.greaterRealmCellV1.chunkHandle.filter(chunk.chunkHandle),
      GREATER_REALM_MAX_CHUNK_CORE_CELLS,
      'GREATER_REALM_RESOURCE_LOCATION_CHUNK_OVERSIZED',
    )].sort((left, right) => left.releaseOrdinal - right.releaseOrdinal);
    if (cells.length !== chunk.coreCellCount) fail();
    let chunkNodeCount = 0;
    const chunkLocationIds = new Set<string>();
    for (const cell of cells) {
      if (
        cell.atlasId !== atlas.atlasId
        || cell.chunkHandle !== chunk.chunkHandle
        || cell.tier !== 1
      ) fail();
      const rows = boundedRows(
        ctx.db.greaterRealmResourceNodeV1.cellKey.filter(cell.cellKey),
        GREATER_REALM_RESOURCE_LOCATION_MAX_CELL_NODES,
        'GREATER_REALM_RESOURCE_LOCATION_CELL_OVERSIZED',
      );
      chunkNodeCount += rows.length;
      if (chunkNodeCount > GREATER_REALM_RESOURCE_LOCATION_MAX_CHUNK_NODES) {
        fail('GREATER_REALM_RESOURCE_LOCATION_CHUNK_OVERSIZED');
      }
      for (const row of rows) {
        requireLocationId(row.locationId);
        if (row.atlasId !== atlas.atlasId || row.cellKey !== cell.cellKey) fail();
        if (chunkLocationIds.has(row.locationId)) continue;
        chunkLocationIds.add(row.locationId);
        if (
          chunkLocationIds.size
            > GREATER_REALM_RESOURCE_LOCATION_MAX_CHUNK_LOCATIONS
        ) fail('GREATER_REALM_RESOURCE_LOCATION_CHUNK_OVERSIZED');
        const priorCell = seenLocationIds.get(row.locationId);
        if (priorCell !== undefined && priorCell !== cell.cellKey) fail();
        if (priorCell === undefined) {
          seenLocationIds.set(row.locationId, cell.cellKey);
          candidates.push(Object.freeze({
            chunkHandle: chunk.chunkHandle,
            locationId: row.locationId,
            cellKey: cell.cellKey,
          }));
        }
      }
    }
  }

  const accessible = candidates.flatMap((candidate) => {
    const resolved = resolveGreaterRealmResourceLocationV1(
      ctx,
      atlas.atlasId,
      candidate.locationId,
    );
    if (
      resolved.cellKey !== candidate.cellKey
      || resolved.destination.chunkHandle !== candidate.chunkHandle
    ) fail();
    if (
      resolved.componentKey !== origin.componentKey
      || resolved.cellKey === origin.cellKey
    ) return [];
    return [Object.freeze({
      chunkHandle: candidate.chunkHandle,
      locationId: resolved.locationId,
      atlasQ: resolved.destination.atlasQ,
      atlasR: resolved.destination.atlasR,
      resourceKind: resolved.resourceKind,
      nodeCount: resolved.nodeCount,
    })];
  }).sort((left, right) => (
    axialDistance(origin.atlasQ, origin.atlasR, left.atlasQ, left.atlasR)
      - axialDistance(origin.atlasQ, origin.atlasR, right.atlasQ, right.atlasR)
    || left.resourceKind.localeCompare(right.resourceKind)
    || left.locationId.localeCompare(right.locationId)
  ));
  let projected = accessible;
  if (accessible.length > GREATER_REALM_RESOURCE_LOCATION_MAX_RESPONSE_ROWS) {
    const reservedCounts = new Map<string, number>();
    const selectedLocationIds = new Set<string>();
    for (const location of accessible) {
      const count = reservedCounts.get(location.resourceKind) ?? 0;
      if (count >= GREATER_REALM_RESOURCE_LOCATION_RESERVED_PER_KIND) continue;
      reservedCounts.set(location.resourceKind, count + 1);
      selectedLocationIds.add(location.locationId);
    }
    for (const location of accessible) {
      if (selectedLocationIds.size >= GREATER_REALM_RESOURCE_LOCATION_MAX_RESPONSE_ROWS) break;
      selectedLocationIds.add(location.locationId);
    }
    projected = accessible.filter(location => selectedLocationIds.has(location.locationId));
    if (projected.length !== GREATER_REALM_RESOURCE_LOCATION_MAX_RESPONSE_ROWS) fail();
  }
  return Object.freeze({
    atlasId: atlas.atlasId,
    revision: atlas.revision,
    chunkHandles: Object.freeze([...requestedChunkHandles]),
    truncated: accessible.length > GREATER_REALM_RESOURCE_LOCATION_MAX_RESPONSE_ROWS,
    resourceLocations: Object.freeze(projected),
  });
}

export function greaterRealmResourceLocationAuthorityErrorCode(
  error: unknown,
): string | undefined {
  return error instanceof GreaterRealmResourceLocationAuthorityError
    ? error.code
    : undefined;
}
