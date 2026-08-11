import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  GREATER_REALM_JOURNEY_TABLES,
  GREATER_REALM_TIER_ONE_REGION_IDS,
  planGreaterRealmExistingPopulationV1,
  requireGreaterRealmJourneyTablesEmptyV1,
  validateGreaterRealmAllocationSlotsV1,
  type GreaterRealmAllocationSlotV1,
  type GreaterRealmCastleAllocationV1,
  type GreaterRealmJourneyTable,
} from './greaterRealmActivationPolicy';
import { assertCastleWorkerRoster } from './castleWorkerRoster';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
} from './castleWorkerPolicy';
import { existingFounderAssignmentIsConsistent } from './foundingPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_MAX_CELLS,
  GREATER_REALM_MAX_CHUNKS,
  GREATER_REALM_MAX_COMPONENTS,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RESOURCE_KINDS,
  GREATER_REALM_RESOURCE_MARGIN_PER_SLOT,
} from './greaterRealmV17Policy';
import type warpkeep from './schema';
import { Sha256, sha256Hex, updateLengthFramedSha256 } from './sha256';
import {
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  markAccountIsConsistent,
} from './marksAuthorityPolicy';
import { resourceAccountStateIsConsistent } from './resourceAuthorityPolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  HEGEMONY_REALM_ID,
  CANONICAL_WORLD_TILES,
  canonicalMetaForKey,
  matchesCanonicalWorldMeta,
} from './world';
import { worldCastleGraphIsConsistent } from './worldCastleIntegrity';
import { classifyGenesisStaticSnapshot } from './worldSeedPolicy';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type ActivationRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmActivationV1']['activationId']['find']>
>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>
>;
type ClaimRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCastleClaimV1']['slotId']['find']>
>;
type ProfileRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmProfileV1']['fid']['find']>
>;
type MarkAccountRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['markAccountV1']['fid']['find']>
>;

const LEGACY_CASTLE_CAPACITY = 100;
const GREATER_REALM_WORKER_CAPACITY = GREATER_REALM_CASTLE_CAPACITY * CASTLE_WORKERS_PER_CASTLE;
const GREATER_REALM_RESOURCE_NODE_CAPACITY = GREATER_REALM_CASTLE_CAPACITY
  * GREATER_REALM_RESOURCE_MARGIN_PER_SLOT
  * GREATER_REALM_RESOURCE_KINDS.length;
const LEGACY_SNAPSHOT_ROW_CAPACITY = 65_536;
const JOURNEY_SNAPSHOT_ROW_CAPACITY = GREATER_REALM_WORKER_CAPACITY;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const LIVE_DIGEST_SENTINELS = Object.freeze({
  resourceDigest: sha256Hex('warpkeep.greater-realm.live-resource-not-frozen.v1\n'),
  marksDigest: sha256Hex('warpkeep.greater-realm.live-marks-not-frozen.v1\n'),
  innerKeepDigest: sha256Hex('warpkeep.greater-realm.live-inner-keep-not-frozen.v1\n'),
  scheduleDigest: sha256Hex('warpkeep.greater-realm.live-schedule-not-frozen.v1\n'),
});

export class GreaterRealmRelocationSnapshotError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmRelocationSnapshotError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmRelocationSnapshotError(code);
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

function ordinalRows<Row>(
  rows: Iterable<Row>,
  expected: number,
  maximum: number,
  ordinalFor: (row: Row) => number,
  code: string,
): readonly Row[] {
  if (expected < 0 || expected > maximum) fail(code);
  const ordered = [...boundedRows(rows, maximum, code)].sort((left, right) => (
    ordinalFor(left) - ordinalFor(right)
  ));
  if (
    ordered.length !== expected
    || ordered.some((row, index) => ordinalFor(row) !== index)
  ) fail(code);
  return Object.freeze(ordered);
}

function requireCount(count: bigint, maximum: number, code: string): number {
  if (count < 0n || count > BigInt(maximum)) fail(code);
  return Number(count);
}

function canonicalValue(value: unknown, ancestors = new Set<object>()): string {
  if (value === undefined) return 'u';
  if (value === null) return 'n';
  if (typeof value === 'boolean') return value ? 'b1' : 'b0';
  if (typeof value === 'bigint') return `i${value.toString()}`;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('GREATER_REALM_SNAPSHOT_VALUE_INVALID');
    return `d${value.toString()}`;
  }
  if (typeof value === 'string') return `s${JSON.stringify(value)}`;
  if (typeof value !== 'object') fail('GREATER_REALM_SNAPSHOT_VALUE_INVALID');
  if ('microsSinceUnixEpoch' in value) {
    const timestamp = (value as { microsSinceUnixEpoch: unknown }).microsSinceUnixEpoch;
    if (typeof timestamp !== 'bigint' || timestamp < 0n || timestamp > U64_MAX) {
      fail('GREATER_REALM_SNAPSHOT_VALUE_INVALID');
    }
    return `t${timestamp.toString()}`;
  }
  const identity = value as {
    toHexString?: () => string;
    toString?: () => string;
  };
  if (typeof identity.toHexString === 'function') {
    const encoded = identity.toHexString();
    if (typeof encoded !== 'string') fail('GREATER_REALM_SNAPSHOT_VALUE_INVALID');
    return `x${JSON.stringify(encoded)}`;
  }
  if (ancestors.has(value)) fail('GREATER_REALM_SNAPSHOT_VALUE_INVALID');
  ancestors.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `a[${value.map(item => canonicalValue(item, ancestors)).join(',')}]`;
  } else {
    const keys = Object.keys(value).sort();
    if (keys.length === 0 && typeof identity.toString === 'function') {
      const encoded = identity.toString();
      if (encoded === '[object Object]') fail('GREATER_REALM_SNAPSHOT_VALUE_INVALID');
      result = `o${JSON.stringify(encoded)}`;
    } else {
      result = `o{${keys.map(key => (
        `${JSON.stringify(key)}:${canonicalValue((value as Record<string, unknown>)[key], ancestors)}`
      )).join(',')}}`;
    }
  }
  ancestors.delete(value);
  return result;
}

type DigestSection = readonly [name: string, rows: readonly unknown[]];

function digestSections(domain: string, sections: readonly DigestSection[]): string {
  const lines = [`warpkeep.greater-realm.${domain}.v1`];
  for (const [name, rows] of sections) {
    const canonicalRows = rows.map(row => canonicalValue(row)).sort();
    lines.push(`${name}:${canonicalRows.length}`);
    lines.push(...canonicalRows);
  }
  return sha256Hex(`${lines.join('\n')}\n`);
}

function updateTopologyDigestFrame(hash: Sha256, value: unknown): void {
  updateLengthFramedSha256(hash, new TextEncoder().encode(canonicalValue(value)));
}

function protectedRows<Row>(
  count: bigint,
  rows: Iterable<Row>,
  code: string,
  maximum = LEGACY_SNAPSHOT_ROW_CAPACITY,
): readonly Row[] {
  const expected = requireCount(count, maximum, code);
  const result = boundedRows(rows, maximum, code);
  if (result.length !== expected) fail(code);
  return result;
}

export type GreaterRealmJourneyCountsV1 = Readonly<Record<GreaterRealmJourneyTable, bigint>>;

/** Read the exact audited 15 live-journey tables; no receipt table is included. */
export function greaterRealmJourneyCountsV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): GreaterRealmJourneyCountsV1 {
  const counts = Object.freeze({
    gold_node_occupation_v1: ctx.db.goldNodeOccupationV1.count(),
    gold_expedition_v1: ctx.db.goldExpeditionV1.count(),
    gold_expedition_schedule_v_1: ctx.db.goldExpeditionScheduleV1.count(),
    food_node_occupation_v1: ctx.db.foodNodeOccupationV1.count(),
    food_expedition_v1: ctx.db.foodExpeditionV1.count(),
    food_expedition_schedule_v_1: ctx.db.foodExpeditionScheduleV1.count(),
    wood_node_occupation_v1: ctx.db.woodNodeOccupationV1.count(),
    wood_expedition_v1: ctx.db.woodExpeditionV1.count(),
    wood_expedition_schedule_v_1: ctx.db.woodExpeditionScheduleV1.count(),
    stone_node_occupation_v1: ctx.db.stoneNodeOccupationV1.count(),
    stone_expedition_v1: ctx.db.stoneExpeditionV1.count(),
    stone_expedition_schedule_v_1: ctx.db.stoneExpeditionScheduleV1.count(),
    worker_assignment_v1: ctx.db.workerAssignmentV1.count(),
    worker_node_occupation_v1: ctx.db.workerNodeOccupationV1.count(),
    worker_assignment_schedule_v_1: ctx.db.workerAssignmentScheduleV1.count(),
  });
  if (
    Object.keys(counts).length !== GREATER_REALM_JOURNEY_TABLES.length
    || GREATER_REALM_JOURNEY_TABLES.some(table => (
      !Object.prototype.hasOwnProperty.call(counts, table)
    ))
  ) fail('GREATER_REALM_JOURNEY_GATE_INVALID');
  return counts;
}

export function requireGreaterRealmQuietWindowV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): GreaterRealmJourneyCountsV1 {
  const counts = greaterRealmJourneyCountsV1(ctx);
  requireGreaterRealmJourneyTablesEmptyV1(counts);
  return counts;
}

export type GreaterRealmFrozenTopologyV1 = Readonly<{
  atlasId: string;
  topologyDigest: string;
  slots: readonly GreaterRealmAllocationSlotV1[];
}>;

function onlyRelease(ctx: Pick<WarpkeepReducerContext, 'db'>) {
  if (ctx.db.greaterRealmReleaseV1.count() !== 1n) {
    fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
  }
  let release: NonNullable<
    ReturnType<WarpkeepReducerContext['db']['greaterRealmReleaseV1']['atlasId']['find']>
  > | undefined;
  for (const row of ctx.db.greaterRealmReleaseV1.iter()) {
    if (release !== undefined) fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
    release = row;
  }
  if (release === undefined) fail('GREATER_REALM_RELEASE_MISSING');
  return release;
}

/**
 * Bind every allocation rank to the finalized release receipt and its exact
 * target cell coordinates. The importer/finalizer receipt already attests the
 * full chunk/cell/resource payload, so cutover never rescans those potentially
 * 150k-row tables. The digest deliberately excludes mutable `active` flags.
 */
export function captureGreaterRealmFrozenTopologyV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): GreaterRealmFrozenTopologyV1 {
  const release = onlyRelease(ctx);
  if (
    release.state !== 'ready'
    && release.state !== 'canary'
    && release.state !== 'active'
    && release.state !== 'halted'
  ) fail('GREATER_REALM_RELEASE_NOT_FINALIZED');
  if (
    release.publicName === undefined
    || release.readyAt === undefined
    || release.expectedSlotCount !== GREATER_REALM_CASTLE_CAPACITY
    || release.expectedResourceNodeCount !== GREATER_REALM_RESOURCE_NODE_CAPACITY
    || release.expectedRegionCount !== GREATER_REALM_PUBLIC_REGIONS.length
    || release.expectedComponentCount < 1
    || release.expectedComponentCount > GREATER_REALM_MAX_COMPONENTS
    || release.expectedChunkCount < 1
    || release.expectedChunkCount > GREATER_REALM_MAX_CHUNKS
    || release.expectedCellCount < 1
    || release.expectedCellCount > GREATER_REALM_MAX_CELLS
    || ctx.db.greaterRealmNavigationComponentV1.count()
      !== BigInt(release.expectedComponentCount)
    || ctx.db.greaterRealmChunkV1.count() !== BigInt(release.expectedChunkCount)
    || ctx.db.greaterRealmCellV1.count() !== BigInt(release.expectedCellCount)
    || ctx.db.greaterRealmCastleSlotV1.count() !== BigInt(GREATER_REALM_CASTLE_CAPACITY)
    || ctx.db.greaterRealmResourceNodeV1.count()
      !== BigInt(GREATER_REALM_RESOURCE_NODE_CAPACITY)
  ) fail('GREATER_REALM_TOPOLOGY_COUNTS_INVALID');

  const slots = ordinalRows(
    ctx.db.greaterRealmCastleSlotV1.iter(),
    GREATER_REALM_CASTLE_CAPACITY,
    GREATER_REALM_CASTLE_CAPACITY,
    row => row.releaseOrdinal,
    'GREATER_REALM_SLOT_TOPOLOGY_COUNT_INVALID',
  );
  const topologyRows = slots.map((slot) => {
    const cell = ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
    if (
      cell === null
      || slot.atlasId !== release.atlasId
      || cell.atlasId !== release.atlasId
      || cell.cellKey !== slot.cellKey
      || cell.regionId !== slot.regionId
      || cell.componentKey !== slot.componentKey
      || !cell.passable
      || slot.tier !== 1
      || cell.tier !== 1
    ) fail('GREATER_REALM_SLOT_TARGET_INVALID');
    return Object.freeze({
      slotId: slot.slotId,
      releaseOrdinal: slot.releaseOrdinal,
      atlasId: slot.atlasId,
      cellKey: slot.cellKey,
      regionId: slot.regionId,
      componentKey: slot.componentKey,
      legacySlotId: slot.legacySlotId,
      tier: slot.tier,
      regionOrderRank: slot.regionOrderRank,
      allocationRank: slot.allocationRank,
      cellAtlasQ: cell.atlasQ,
      cellAtlasR: cell.atlasR,
      cellReleaseOrdinal: cell.releaseOrdinal,
    });
  });
  const topologyHash = new Sha256();
  updateTopologyDigestFrame(topologyHash, 'warpkeep.greater-realm.topology-snapshot.v1');
  updateTopologyDigestFrame(topologyHash, Object.freeze({ ...release, state: undefined }));
  updateTopologyDigestFrame(topologyHash, Object.freeze({
    section: 'relocation-targets', count: topologyRows.length,
  }));
  for (const target of topologyRows) updateTopologyDigestFrame(topologyHash, target);
  updateTopologyDigestFrame(topologyHash, Object.freeze({
    section: 'slots', count: GREATER_REALM_CASTLE_CAPACITY,
  }));
  for (const slot of slots) {
    if (
      slot.atlasId !== release.atlasId
      || (release.state === 'ready' && slot.active)
    ) fail('GREATER_REALM_SLOT_TOPOLOGY_INVALID');
    updateTopologyDigestFrame(topologyHash, { ...slot, active: undefined });
  }
  const topologyDigest = topologyHash.digestHex();
  const allocationSlots = topologyRows.map(row => Object.freeze({
    slotId: row.slotId,
    regionId: row.regionId,
    tier: row.tier,
    regionOrderRank: row.regionOrderRank,
    allocationRank: row.allocationRank,
    topologyDigest,
  }));
  validateGreaterRealmAllocationSlotsV1(allocationSlots);
  return Object.freeze({
    atlasId: release.atlasId,
    topologyDigest,
    slots: Object.freeze(allocationSlots),
  });
}

/** Require exactly four canonical, currently idle workers for every v16 castle. */
export function assertGreaterRealmCanonicalIdleWorkersV1(
  ctx: WarpkeepReducerContext,
  castles: readonly CastleRow[],
  requireIdle = true,
): string {
  if (castles.length > GREATER_REALM_CASTLE_CAPACITY) fail('GREATER_REALM_CASTLE_COUNT_INVALID');
  const workerCount = requireCount(
    ctx.db.castleWorkerV1.count(),
    GREATER_REALM_WORKER_CAPACITY,
    'GREATER_REALM_WORKER_COUNT_INVALID',
  );
  if (workerCount !== castles.length * CASTLE_WORKERS_PER_CASTLE) {
    fail('GREATER_REALM_WORKER_COUNT_INVALID');
  }
  const system = ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001');
  const castleIds = castles.map(castle => castle.castleId);
  const rosterDigest = rosterDigestForCastleIds(castleIds);
  if (
    ctx.db.realmWorkerSystemV1.count() !== 1n
    || system === null
    || system.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || system.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || system.expectedCastleCount !== castles.length
    || system.expectedWorkerCount !== workerCount
    || system.rosterDigest !== rosterDigest
    || system.mode !== 'active'
    || system.legacyDrainRequired
    || system.activatedAt === undefined
  ) fail('GREATER_REALM_WORKER_SYSTEM_INVALID');
  const seen = new Set<string>();
  for (const castle of castles) {
    let rows;
    try {
      rows = assertCastleWorkerRoster(ctx, castle.castleId);
    } catch {
      fail('GREATER_REALM_WORKER_ROSTER_INVALID');
    }
    for (const row of rows) {
      if ((requireIdle && row.status !== 'idle') || seen.has(row.workerId)) {
        fail('GREATER_REALM_WORKER_NOT_CANONICAL_IDLE');
      }
      seen.add(row.workerId);
    }
  }
  if (seen.size !== workerCount) fail('GREATER_REALM_WORKER_ROSTER_INVALID');
  return rosterDigest;
}

export type GreaterRealmProtectedDigestsV1 = Readonly<{
  castleDigest: string;
  workerDigest: string;
  resourceDigest: string;
  marksDigest: string;
  innerKeepDigest: string;
  scheduleDigest: string;
}>;

export type GreaterRealmCutoverDigestsV1 = Readonly<{
  castleDigest: string;
  workerDigest: string;
}>;

function legacyTopologySections(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  claims?: readonly ClaimRow[],
): readonly DigestSection[] {
  const realms = protectedRows(
    ctx.db.realmV1.count(),
    ctx.db.realmV1.iter(),
    'GREATER_REALM_LEGACY_STATIC_SNAPSHOT_OVERSIZED',
  );
  const worldMeta = protectedRows(
    ctx.db.worldTileMetaV1.count(),
    ctx.db.worldTileMetaV1.iter(),
    'GREATER_REALM_LEGACY_STATIC_SNAPSHOT_OVERSIZED',
  );
  const castleSlots = protectedRows(
    ctx.db.castleSlotV1.count(),
    ctx.db.castleSlotV1.iter(),
    'GREATER_REALM_LEGACY_STATIC_SNAPSHOT_OVERSIZED',
  );
  const allWorldTiles = protectedRows(
    ctx.db.worldTile.count(),
    ctx.db.worldTile.iter(),
    'GREATER_REALM_LEGACY_STATIC_SNAPSHOT_OVERSIZED',
  );
  if (claims === undefined) {
    const castles = protectedRows(ctx.db.castle.count(), ctx.db.castle.iter(), 'GREATER_REALM_CASTLE_COUNT_INVALID');
    const legacyClaims = protectedRows(
      ctx.db.castleSlotClaimV1.count(),
      ctx.db.castleSlotClaimV1.iter(),
      'GREATER_REALM_LEGACY_CLAIM_COUNT_INVALID',
    );
    return Object.freeze([
      ['realms', realms],
      ['world-tiles', allWorldTiles],
      ['world-meta', worldMeta],
      ['castle-slots', castleSlots],
      ['castles', castles],
      ['legacy-claims', legacyClaims],
    ] as const);
  }
  const reconstructedCastles: unknown[] = [];
  const reconstructedClaims: unknown[] = [];
  const relocatedByLegacyTile = new Map<string, ClaimRow>();
  for (const claim of claims) {
    const castle = ctx.db.castle.castleId.find(claim.castleId);
    if (
      castle === null
      || claim.claimKind !== 'relocated'
      || claim.legacySlotId === undefined
      || claim.legacyClaimedAt === undefined
      || claim.legacyGenerationVersion === undefined
      || claim.legacyTileKey === undefined
      || claim.legacyQ === undefined
      || claim.legacyR === undefined
    ) fail('GREATER_REALM_ROLLBACK_PREIMAGE_INCOMPLETE');
    const tile = ctx.db.worldTile.key.find(claim.legacyTileKey);
    if (tile === null || relocatedByLegacyTile.has(claim.legacyTileKey)) {
      fail('GREATER_REALM_ROLLBACK_PREIMAGE_INCOMPLETE');
    }
    relocatedByLegacyTile.set(claim.legacyTileKey, claim);
    reconstructedCastles.push({
      ...castle,
      tileKey: claim.legacyTileKey,
      q: claim.legacyQ,
      r: claim.legacyR,
    });
    reconstructedClaims.push({
      slotId: claim.legacySlotId,
      ownerFid: claim.ownerFid,
      castleId: claim.castleId,
      claimedAt: claim.legacyClaimedAt,
      generationVersion: claim.legacyGenerationVersion,
    });
  }
  const reconstructedTiles = allWorldTiles.map((tile) => {
    const claim = relocatedByLegacyTile.get(tile.key);
    return claim === undefined ? tile : { ...tile, occupantCastleId: claim.castleId };
  });
  const reconstructedRealms = realms.map(realm => (
    realm.realmId === HEGEMONY_REALM_ID ? { ...realm, active: true } : realm
  ));
  return Object.freeze([
    ['realms', reconstructedRealms],
    ['world-tiles', reconstructedTiles],
    ['world-meta', worldMeta],
    ['castle-slots', castleSlots],
    ['castles', reconstructedCastles],
    ['legacy-claims', reconstructedClaims],
  ] as const);
}

export function captureGreaterRealmCutoverDigestsV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  relocatedClaims?: readonly ClaimRow[],
): GreaterRealmCutoverDigestsV1 {
  const rows = <Row>(count: bigint, iterable: Iterable<Row>, code: string) => (
    protectedRows(count, iterable, code)
  );
  const castleDigest = digestSections(
    'legacy-topology-snapshot',
    legacyTopologySections(ctx, relocatedClaims),
  );
  const workerDigest = digestSections('worker-snapshot', [
    ['system', rows(ctx.db.realmWorkerSystemV1.count(), ctx.db.realmWorkerSystemV1.iter(), 'GREATER_REALM_WORKER_SNAPSHOT_OVERSIZED')],
    ['workers', rows(ctx.db.castleWorkerV1.count(), ctx.db.castleWorkerV1.iter(), 'GREATER_REALM_WORKER_SNAPSHOT_OVERSIZED')],
  ]);
  return Object.freeze({ castleDigest, workerDigest });
}

/**
 * Bind every live journey row that may survive a pre-freeze abort. This is
 * deliberately limited to the audited 15-table gate and its 2,400-row hard
 * ceiling; unrelated append-only archives such as Realm Chat are never read
 * by relocation transactions.
 */
export function captureGreaterRealmJourneyRowsDigestV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): string {
  const rows = <Row>(count: bigint, iterable: Iterable<Row>, code: string) => (
    protectedRows(count, iterable, code, JOURNEY_SNAPSHOT_ROW_CAPACITY)
  );
  const journeyCounts = greaterRealmJourneyCountsV1(ctx);
  return digestSections('journey-transaction-snapshot', [
    ['journey-counts', [journeyCounts]],
    ['gold-occupations', rows(ctx.db.goldNodeOccupationV1.count(), ctx.db.goldNodeOccupationV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['gold-expeditions', rows(ctx.db.goldExpeditionV1.count(), ctx.db.goldExpeditionV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['gold-schedules', rows(ctx.db.goldExpeditionScheduleV1.count(), ctx.db.goldExpeditionScheduleV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['food-occupations', rows(ctx.db.foodNodeOccupationV1.count(), ctx.db.foodNodeOccupationV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['food-expeditions', rows(ctx.db.foodExpeditionV1.count(), ctx.db.foodExpeditionV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['food-schedules', rows(ctx.db.foodExpeditionScheduleV1.count(), ctx.db.foodExpeditionScheduleV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['wood-occupations', rows(ctx.db.woodNodeOccupationV1.count(), ctx.db.woodNodeOccupationV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['wood-expeditions', rows(ctx.db.woodExpeditionV1.count(), ctx.db.woodExpeditionV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['wood-schedules', rows(ctx.db.woodExpeditionScheduleV1.count(), ctx.db.woodExpeditionScheduleV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['stone-occupations', rows(ctx.db.stoneNodeOccupationV1.count(), ctx.db.stoneNodeOccupationV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['stone-expeditions', rows(ctx.db.stoneExpeditionV1.count(), ctx.db.stoneExpeditionV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['stone-schedules', rows(ctx.db.stoneExpeditionScheduleV1.count(), ctx.db.stoneExpeditionScheduleV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['worker-assignments', rows(ctx.db.workerAssignmentV1.count(), ctx.db.workerAssignmentV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['worker-occupations', rows(ctx.db.workerNodeOccupationV1.count(), ctx.db.workerNodeOccupationV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
    ['worker-schedules', rows(ctx.db.workerAssignmentScheduleV1.count(), ctx.db.workerAssignmentScheduleV1.iter(), 'GREATER_REALM_SCHEDULE_SNAPSHOT_OVERSIZED')],
  ]);
}

export type GreaterRealmPreparedSnapshotV1 = GreaterRealmProtectedDigestsV1 & Readonly<{
  atlasId: string;
  quietEpoch: bigint;
  castleCount: number;
  workerCount: number;
  resourceAccountCount: number;
  markAccountCount: number;
  innerKeepBuildingCount: number;
  claimCount: number;
  occupancyCount: number;
  topologyDigest: string;
  rosterDigest: string;
  journeyCounts: GreaterRealmJourneyCountsV1;
}>;

function profileProjectionIsConsistent(
  profile: ProfileRow,
  account: MarkAccountRow,
): boolean {
  if (!profile.communityStatsVisible) {
    return profile.totalSnapBurnedMicros === undefined
      && profile.marksEarnedMicros === undefined
      && profile.marksSpentMicros === undefined
      && profile.marksBalanceMicros === undefined
      && profile.marksPolicyVersion === undefined;
  }
  const legacyProjectionMatches = account.policyVersion !== ADMITTED_DAILY_MARK_POLICY_VERSION
    && profile.totalSnapBurnedMicros === account.totalSnapBurnedMicros;
  const dailyProjectionMatches = account.policyVersion === ADMITTED_DAILY_MARK_POLICY_VERSION
    && profile.totalSnapBurnedMicros === undefined;
  return profile.firstAuthenticatedAt !== undefined
    && (legacyProjectionMatches || dailyProjectionMatches)
    && profile.marksEarnedMicros === account.earnedMicros
    && profile.marksSpentMicros === account.spentMicros
    && profile.marksBalanceMicros === account.balanceMicros
    && profile.marksPolicyVersion === account.policyVersion;
}

/** Exact v16 founder/economy topology used until the canary transaction commits. */
export function assertGreaterRealmLegacyFounderTopologyV1(
  ctx: Pick<WarpkeepReducerContext, 'db' | 'timestamp'>,
): void {
  const castleCount = ctx.db.castle.count();
  const worldTileCount = requireCount(
    ctx.db.worldTile.count(),
    CANONICAL_WORLD_TILES.length,
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
  const worldTiles = boundedRows(
    ctx.db.worldTile.iter(),
    CANONICAL_WORLD_TILES.length,
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
  const castles = boundedRows(
    ctx.db.castle.iter(),
    LEGACY_CASTLE_CAPACITY,
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
  const realms = boundedRows(
    ctx.db.realmV1.iter(),
    1,
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
  const worldMeta = boundedRows(
    ctx.db.worldTileMetaV1.iter(),
    CANONICAL_WORLD_TILES.length,
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
  const castleSlots = boundedRows(
    ctx.db.castleSlotV1.iter(),
    CANONICAL_CASTLE_SLOTS.length,
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
  if (
    castleCount > BigInt(LEGACY_CASTLE_CAPACITY)
    || worldTiles.length !== worldTileCount
    || castles.length !== Number(castleCount)
    || realms.length !== Number(ctx.db.realmV1.count())
    || worldMeta.length !== Number(ctx.db.worldTileMetaV1.count())
    || castleSlots.length !== Number(ctx.db.castleSlotV1.count())
    || ctx.db.castleSlotClaimV1.count() !== castleCount
    || ctx.db.allowedFid.count() !== castleCount
    || ctx.db.realmProfileV1.count() !== castleCount
    || ctx.db.markAccountV1.count() !== castleCount
    || ctx.db.resourceAccountV1.count() !== castleCount
    || classifyGenesisStaticSnapshot({
      worldTiles,
      realms,
      worldMeta,
      castleSlots,
    }) === 'invalid'
    || !worldCastleGraphIsConsistent(worldTiles, castles)
  ) fail('GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID');
  for (const castle of castles) {
    const claim = ctx.db.castleSlotClaimV1.ownerFid.find(castle.ownerFid);
    const slot = claim === null ? null : ctx.db.castleSlotV1.slotId.find(claim.slotId);
    const tile = slot === null ? null : ctx.db.worldTile.key.find(slot.tileKey);
    const profile = ctx.db.realmProfileV1.fid.find(castle.ownerFid);
    const marks = ctx.db.markAccountV1.fid.find(castle.ownerFid);
    const account = ctx.db.resourceAccountV1.fid.find(castle.ownerFid);
    const meta = ctx.db.worldTileMetaV1.tileKey.find(castle.tileKey);
    const canonicalMeta = canonicalMetaForKey(castle.tileKey);
    if (
      claim === null
      || slot === null
      || tile === null
      || profile === null
      || marks === null
      || account === null
      || meta === null
      || canonicalMeta === undefined
      || ctx.db.allowedFid.fid.find(castle.ownerFid) === null
      || !markAccountIsConsistent(marks)
      || !profileProjectionIsConsistent(profile, marks)
      || !resourceAccountStateIsConsistent(account)
      || account.castleId !== castle.castleId
      || account.realmId !== HEGEMONY_REALM_ID
      || account.createdAt.microsSinceUnixEpoch < 0n
      || account.createdAt.microsSinceUnixEpoch > account.settledThroughMicros
      || account.settledThroughMicros > account.updatedAt.microsSinceUnixEpoch
      || account.updatedAt.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch
      || !matchesCanonicalWorldMeta(meta)
      || meta.staticContentKind !== 'castle-slot'
      || canonicalMeta.terrainKind !== meta.terrainKind
      || !existingFounderAssignmentIsConsistent({
        fid: castle.ownerFid,
        castleId: castle.castleId,
        castleOwnerFid: castle.ownerFid,
        castleTileKey: castle.tileKey,
        castleQ: castle.q,
        castleR: castle.r,
        castleLevel: castle.level,
        claimOwnerFid: claim.ownerFid,
        claimCastleId: claim.castleId,
        claimSlotId: claim.slotId,
        claimGenerationVersion: claim.generationVersion,
        slot,
        tileOccupantCastleId: tile.occupantCastleId,
      })
    ) fail('GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID');
  }
}

function captureGreaterRealmSnapshotV1(
  ctx: WarpkeepReducerContext,
  requireQuietAndIdle: boolean,
): GreaterRealmPreparedSnapshotV1 {
  if (
    ctx.db.greaterRealmCastleClaimV1.count() !== 0n
    || ctx.db.greaterRealmCellOccupancyV1.count() !== 0n
    || ctx.db.realmAtlasV1.count() !== 0n
    || ctx.db.realmAtlasVisibleRegionV1.count() !== 0n
    || ctx.db.realmWorkerSystemV2.count() !== 0n
  ) fail('GREATER_REALM_PREPARED_STATE_NOT_EMPTY');
  const release = onlyRelease(ctx);
  if (release.state !== 'ready') fail('GREATER_REALM_RELEASE_NOT_READY');
  assertGreaterRealmLegacyFounderTopologyV1(ctx);
  const castleCount = requireCount(
    ctx.db.castle.count(),
    LEGACY_CASTLE_CAPACITY,
    'GREATER_REALM_CASTLE_COUNT_INVALID',
  );
  const castles = [...boundedRows(
    ctx.db.castle.iter(),
    LEGACY_CASTLE_CAPACITY,
    'GREATER_REALM_CASTLE_COUNT_INVALID',
  )].sort((left, right) => (
    left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0
  ));
  if (castles.length !== castleCount) fail('GREATER_REALM_CASTLE_COUNT_INVALID');
  const rosterDigest = assertGreaterRealmCanonicalIdleWorkersV1(
    ctx,
    castles,
    requireQuietAndIdle,
  );
  const workerCount = requireCount(ctx.db.castleWorkerV1.count(), GREATER_REALM_WORKER_CAPACITY, 'GREATER_REALM_WORKER_COUNT_INVALID');
  const resourceAccountCount = requireCount(ctx.db.resourceAccountV1.count(), LEGACY_CASTLE_CAPACITY, 'GREATER_REALM_RESOURCE_ACCOUNT_COUNT_INVALID');
  const markAccountCount = requireCount(ctx.db.markAccountV1.count(), LEGACY_CASTLE_CAPACITY, 'GREATER_REALM_MARK_ACCOUNT_COUNT_INVALID');
  const innerKeepBuildingCount = requireCount(ctx.db.castleInnerKeepBuildingV1.count(), LEGACY_CASTLE_CAPACITY * 6, 'GREATER_REALM_INNER_KEEP_BUILDING_COUNT_INVALID');
  if (resourceAccountCount !== castleCount || markAccountCount !== castleCount) {
    fail('GREATER_REALM_FOUNDER_GRAPH_COUNT_INVALID');
  }
  const journeyCounts = requireQuietAndIdle
    ? requireGreaterRealmQuietWindowV1(ctx)
    : greaterRealmJourneyCountsV1(ctx);
  const topology = captureGreaterRealmFrozenTopologyV1(ctx);
  const cutoverDigests = captureGreaterRealmCutoverDigestsV1(ctx);
  return Object.freeze({
    atlasId: topology.atlasId,
    quietEpoch: ctx.timestamp.microsSinceUnixEpoch,
    castleCount,
    workerCount,
    resourceAccountCount,
    markAccountCount,
    innerKeepBuildingCount,
    claimCount: 0,
    occupancyCount: 0,
    topologyDigest: topology.topologyDigest,
    rosterDigest,
    journeyCounts,
    castleDigest: cutoverDigests.castleDigest,
    workerDigest: cutoverDigests.workerDigest,
    ...LIVE_DIGEST_SENTINELS,
  });
}

/** Capture the preliminary bounded checkpoint before ingress closes. */
export function captureGreaterRealmPreparedSnapshotV1(
  ctx: WarpkeepReducerContext,
): GreaterRealmPreparedSnapshotV1 {
  if (ctx.db.greaterRealmActivationV1.count() !== 0n) {
    fail('GREATER_REALM_PREPARED_STATE_NOT_EMPTY');
  }
  return captureGreaterRealmSnapshotV1(ctx, false);
}

/** Rebind the authoritative quiet/idle snapshot after draining completes. */
export function captureGreaterRealmDrainedSnapshotV1(
  ctx: WarpkeepReducerContext,
): GreaterRealmPreparedSnapshotV1 {
  if (ctx.db.greaterRealmActivationV1.count() !== 1n) {
    fail('GREATER_REALM_ACTIVATION_CARDINALITY_INVALID');
  }
  return captureGreaterRealmSnapshotV1(ctx, true);
}

export type GreaterRealmExistingPopulationPlanV1 = Readonly<{
  topology: GreaterRealmFrozenTopologyV1;
  allocations: readonly GreaterRealmCastleAllocationV1[];
  relocationPlanDigest: string;
}>;

export type GreaterRealmRelocationDigestRowV1 = Readonly<{
  castleId: bigint;
  ownerFid: bigint;
  allocationSequence: bigint;
  targetSlotId: string;
  targetCellKey: string;
  targetQ: number;
  targetR: number;
  targetRegionId: string;
  legacySlotId: number;
  legacyClaimedAt: unknown;
  legacyGenerationVersion: number;
  legacyTileKey: string;
  legacyQ: number;
  legacyR: number;
  topologyDigest: string;
}>;

export function greaterRealmRelocationPlanDigestV1(
  rows: readonly GreaterRealmRelocationDigestRowV1[],
): string {
  return digestSections('relocation-plan', [['claims', rows]]);
}

export function planGreaterRealmExistingPopulationFromCurrentV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  topology = captureGreaterRealmFrozenTopologyV1(ctx),
): GreaterRealmExistingPopulationPlanV1 {
  const castleCount = requireCount(ctx.db.castle.count(), LEGACY_CASTLE_CAPACITY, 'GREATER_REALM_CASTLE_COUNT_INVALID');
  const castles = boundedRows(ctx.db.castle.iter(), LEGACY_CASTLE_CAPACITY, 'GREATER_REALM_CASTLE_COUNT_INVALID');
  if (castles.length !== castleCount) fail('GREATER_REALM_CASTLE_COUNT_INVALID');
  const allocations = planGreaterRealmExistingPopulationV1(
    topology.slots,
    castles.map(castle => castle.castleId),
  );
  const planRows = allocations.map((allocation) => {
    const castle = ctx.db.castle.castleId.find(allocation.castleId);
    const legacyClaim = castle === null
      ? null
      : ctx.db.castleSlotClaimV1.ownerFid.find(castle.ownerFid);
    const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(allocation.slotId);
    const cell = slot === null ? null : ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
    const tile = castle === null ? null : ctx.db.worldTile.key.find(castle.tileKey);
    if (
      castle === null
      || legacyClaim === null
      || slot === null
      || cell === null
      || tile === null
      || legacyClaim.castleId !== castle.castleId
      || tile.occupantCastleId !== castle.castleId
      || slot.atlasId !== topology.atlasId
      || cell.atlasId !== topology.atlasId
      || cell.cellKey !== slot.cellKey
    ) fail('GREATER_REALM_RELOCATION_PREIMAGE_INVALID');
    return Object.freeze({
      castleId: castle.castleId,
      ownerFid: castle.ownerFid,
      allocationSequence: allocation.allocationSequence,
      targetSlotId: slot.slotId,
      targetCellKey: cell.cellKey,
      targetQ: cell.atlasQ,
      targetR: cell.atlasR,
      targetRegionId: cell.regionId,
      legacySlotId: legacyClaim.slotId,
      legacyClaimedAt: legacyClaim.claimedAt,
      legacyGenerationVersion: legacyClaim.generationVersion,
      legacyTileKey: castle.tileKey,
      legacyQ: castle.q,
      legacyR: castle.r,
      topologyDigest: topology.topologyDigest,
    });
  });
  const relocationPlanDigest = greaterRealmRelocationPlanDigestV1(planRows);
  return Object.freeze({ topology, allocations, relocationPlanDigest });
}

/**
 * Only founder/static topology and canonical worker identity stay frozen after
 * drain. Economy, profile, daily, Inner Keep, chat, and access rows remain
 * live; relocation transactions never enumerate or mutate those tables.
 */
export function assertGreaterRealmStoredCutoverSnapshotV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  activation: ActivationRow,
  relocatedClaims?: readonly ClaimRow[],
): void {
  const digests = captureGreaterRealmCutoverDigestsV1(ctx, relocatedClaims);
  if (
    ctx.db.castle.count() !== BigInt(activation.snapshotCastleCount)
    || ctx.db.castleWorkerV1.count() !== BigInt(activation.snapshotWorkerCount)
    || digests.castleDigest !== activation.snapshotCastleDigest
    || digests.workerDigest !== activation.snapshotWorkerDigest
  ) fail('GREATER_REALM_CUTOVER_SNAPSHOT_STALE');
}

export function greaterRealmRelocationSnapshotErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmRelocationSnapshotError ? error.code : undefined;
}

export const GREATER_REALM_EXACT_PUBLIC_ROOT_COUNTS_V1 = Object.freeze({
  atlas: 1,
  visibleRegions: GREATER_REALM_TIER_ONE_REGION_IDS.length,
  workerSystem: 1,
});
