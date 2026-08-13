import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  planGreaterRealmActivationTransitionV1,
  planGreaterRealmExistingPopulationV1,
  selectGreaterRealmCastleAllocationV1,
  type GreaterRealmActivationCheckpointV1,
  type GreaterRealmActivationPhase,
} from './greaterRealmActivationPolicy';
import {
  currentGreaterRealmActivationRowV1,
  greaterRealmActivationCheckpointFromRowV1,
} from './greaterRealmActivationState';
import {
  GREATER_REALM_EXACT_PUBLIC_ROOT_COUNTS_V1,
  assertGreaterRealmCanonicalIdleWorkersV1,
  assertGreaterRealmLegacyFounderTopologyV1,
  assertGreaterRealmStoredCutoverSnapshotV1,
  captureGreaterRealmDrainedSnapshotV1,
  captureGreaterRealmFrozenTopologyV1,
  captureGreaterRealmJourneyRowsDigestV1,
  captureGreaterRealmPreparedSnapshotV1,
  greaterRealmRelocationPlanDigestV1,
  planGreaterRealmExistingPopulationFromCurrentV1,
  requireGreaterRealmQuietWindowV1,
  type GreaterRealmFrozenTopologyV1,
  type GreaterRealmRelocationDigestRowV1,
} from './greaterRealmRelocationSnapshot';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
} from './castleWorkerPolicy';
import { assertCastleWorkerActiveGraphHealthyV1 } from './castleWorkerAuthority';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_MAX_CELLS,
  GREATER_REALM_MAX_CHUNKS,
  GREATER_REALM_MAX_COMPONENTS,
  GREATER_REALM_PROTOCOL_VERSION,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RESOURCE_KINDS,
  GREATER_REALM_RESOURCE_MARGIN_PER_SLOT,
  GREATER_REALM_VISIBLE_TIER_MAX,
} from './greaterRealmV17Policy';
import type warpkeep from './schema';
import { sha256Hex } from './sha256';
import {
  HEGEMONY_REALM_ID,
  matchesCanonicalRealm,
  matchesGenerationV2Realm,
} from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type ActivationRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmActivationV1']['activationId']['find']>
>;
type ReleaseRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmReleaseV1']['atlasId']['find']>
>;
type ClaimRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCastleClaimV1']['slotId']['find']>
>;

const EMPTY_RELOCATION_PLAN_DIGEST = sha256Hex(
  'warpkeep.greater-realm.relocation-plan.empty.v1\n',
);
const INITIAL_ATLAS_REVISION = 1n;
const RESOURCE_NODE_CAPACITY = GREATER_REALM_CASTLE_CAPACITY
  * GREATER_REALM_RESOURCE_MARGIN_PER_SLOT
  * GREATER_REALM_RESOURCE_KINDS.length;

export class GreaterRealmRelocationAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmRelocationAuthorityError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmRelocationAuthorityError(code);
}

function onlyRelease(ctx: Pick<WarpkeepReducerContext, 'db'>): ReleaseRow {
  if (ctx.db.greaterRealmReleaseV1.count() !== 1n) {
    fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
  }
  let selected: ReleaseRow | undefined;
  for (const row of ctx.db.greaterRealmReleaseV1.iter()) {
    if (selected !== undefined) fail('GREATER_REALM_RELEASE_CARDINALITY_INVALID');
    selected = row;
  }
  if (selected === undefined) fail('GREATER_REALM_RELEASE_MISSING');
  return selected;
}

function activation(ctx: Pick<WarpkeepReducerContext, 'db'>): ActivationRow {
  const row = currentGreaterRealmActivationRowV1(ctx);
  if (row === undefined) fail('GREATER_REALM_ACTIVATION_MISSING');
  return row;
}

function sortedCastles(ctx: Pick<WarpkeepReducerContext, 'db'>) {
  if (ctx.db.castle.count() > BigInt(GREATER_REALM_CASTLE_CAPACITY)) {
    fail('GREATER_REALM_CASTLE_COUNT_INVALID');
  }
  return [...ctx.db.castle.iter()].sort((left, right) => (
    left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0
  ));
}

function sortedClaims(ctx: Pick<WarpkeepReducerContext, 'db'>): readonly ClaimRow[] {
  if (ctx.db.greaterRealmCastleClaimV1.count() > BigInt(GREATER_REALM_CASTLE_CAPACITY)) {
    fail('GREATER_REALM_CLAIM_COUNT_INVALID');
  }
  return Object.freeze([...ctx.db.greaterRealmCastleClaimV1.iter()].sort((left, right) => (
    left.allocationSequence < right.allocationSequence ? -1
      : left.allocationSequence > right.allocationSequence ? 1
        : 0
  )));
}

function requireActorSubject(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  if (
    normalized !== value
    || normalized.length < 1
    || normalized.length > 256
    || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(normalized)
  ) fail('GREATER_REALM_ACTOR_SUBJECT_INVALID');
  return normalized;
}

function sameTimestamp(
  left: { microsSinceUnixEpoch: bigint } | undefined,
  right: { microsSinceUnixEpoch: bigint } | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.microsSinceUnixEpoch === right.microsSinceUnixEpoch;
}

function snapshotRowFields(
  snapshot: ReturnType<typeof captureGreaterRealmDrainedSnapshotV1>,
) {
  return Object.freeze({
    quietEpoch: snapshot.quietEpoch,
    snapshotCastleCount: snapshot.castleCount,
    snapshotWorkerCount: snapshot.workerCount,
    snapshotResourceAccountCount: snapshot.resourceAccountCount,
    snapshotMarkAccountCount: snapshot.markAccountCount,
    snapshotInnerKeepBuildingCount: snapshot.innerKeepBuildingCount,
    snapshotClaimCount: snapshot.claimCount,
    snapshotOccupancyCount: snapshot.occupancyCount,
    snapshotCastleDigest: snapshot.castleDigest,
    snapshotWorkerDigest: snapshot.workerDigest,
    snapshotResourceDigest: snapshot.resourceDigest,
    snapshotMarksDigest: snapshot.marksDigest,
    snapshotInnerKeepDigest: snapshot.innerKeepDigest,
    snapshotScheduleDigest: snapshot.scheduleDigest,
    topologySnapshotDigest: snapshot.topologyDigest,
  });
}

function checkpoint(
  row: ActivationRow,
  phase: GreaterRealmActivationPhase,
): GreaterRealmActivationCheckpointV1 {
  const current = greaterRealmActivationCheckpointFromRowV1(row);
  return Object.freeze({
    phase,
    everActive: phase === 'rolled-back'
      ? false
      : current.everActive || phase === 'active',
    postCanaryFoundingCount: phase === 'rolled-back'
      ? 0
      : current.postCanaryFoundingCount,
    postCanaryDispatchCount: phase === 'rolled-back'
      ? 0
      : current.postCanaryDispatchCount,
  });
}

function requireTransition(row: ActivationRow, phase: GreaterRealmActivationPhase): void {
  planGreaterRealmActivationTransitionV1(
    greaterRealmActivationCheckpointFromRowV1(row),
    checkpoint(row, phase),
  );
}

function timestampedPhase(
  row: ActivationRow,
  phase: GreaterRealmActivationPhase,
  timestamp: WarpkeepReducerContext['timestamp'],
): ActivationRow {
  requireTransition(row, phase);
  if (phase === 'draining') return { ...row, mode: phase, drainingAt: timestamp };
  if (phase === 'frozen') return { ...row, mode: phase, frozenAt: timestamp };
  if (phase === 'planned') return { ...row, mode: phase, plannedAt: timestamp };
  if (phase === 'canary') return { ...row, mode: phase, canaryAt: timestamp };
  if (phase === 'active') {
    return { ...row, mode: phase, activatedAt: row.activatedAt ?? timestamp };
  }
  if (phase === 'halted') return { ...row, mode: phase, haltedAt: timestamp };
  if (phase === 'rolled-back') return { ...row, mode: phase, rolledBackAt: timestamp };
  fail('GREATER_REALM_ACTIVATION_TRANSITION_INVALID');
}

function assertRootCounts(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  expected: 0 | 1,
): void {
  if (
    ctx.db.realmAtlasV1.count() !== BigInt(expected * GREATER_REALM_EXACT_PUBLIC_ROOT_COUNTS_V1.atlas)
    || ctx.db.realmAtlasVisibleRegionV1.count()
      !== BigInt(expected * GREATER_REALM_EXACT_PUBLIC_ROOT_COUNTS_V1.visibleRegions)
    || ctx.db.realmWorkerSystemV2.count()
      !== BigInt(expected * GREATER_REALM_EXACT_PUBLIC_ROOT_COUNTS_V1.workerSystem)
  ) fail('GREATER_REALM_PUBLIC_ROOT_COUNT_INVALID');
}

function requireLegacyRootActiveState(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  active: boolean,
): void {
  const realm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
  const activeShape = realm === null ? null : { ...realm, active: true };
  if (
    ctx.db.realmV1.count() !== 1n
    || realm === null
    || realm.active !== active
    || activeShape === null
    || (!matchesCanonicalRealm(activeShape) && !matchesGenerationV2Realm(activeShape))
  ) {
    fail('GREATER_REALM_LEGACY_ROOT_STATE_INVALID');
  }
}

function requireStaticActivationState(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  expectedActive: boolean,
): void {
  requireStaticTableCounts(ctx);
  const release = onlyRelease(ctx);
  let components = 0;
  for (const row of ctx.db.greaterRealmNavigationComponentV1.iter()) {
    components += 1;
    // Component `active` is the immutable importer/finalizer verification bit,
    // not a presentation switch. A ready release has every component true and
    // relocation must preserve those finalized rows byte-for-byte.
    if (components > release.expectedComponentCount || !row.active) {
      fail('GREATER_REALM_COMPONENT_ACTIVATION_INVALID');
    }
  }
  let slots = 0;
  for (const row of ctx.db.greaterRealmCastleSlotV1.iter()) {
    slots += 1;
    if (slots > GREATER_REALM_CASTLE_CAPACITY || row.active !== expectedActive) {
      fail('GREATER_REALM_SLOT_ACTIVATION_INVALID');
    }
  }
  let resources = 0;
  for (const row of ctx.db.greaterRealmResourceNodeV1.iter()) {
    resources += 1;
    if (resources > RESOURCE_NODE_CAPACITY || row.active !== expectedActive) {
      fail('GREATER_REALM_RESOURCE_ACTIVATION_INVALID');
    }
  }
  if (
    components !== release.expectedComponentCount
    || slots !== GREATER_REALM_CASTLE_CAPACITY
    || resources !== RESOURCE_NODE_CAPACITY
  ) fail('GREATER_REALM_STATIC_ACTIVATION_COUNT_INVALID');
}

function requireStaticTableCounts(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
): void {
  const release = onlyRelease(ctx);
  if (
    release.expectedComponentCount > GREATER_REALM_MAX_COMPONENTS
    || release.expectedChunkCount > GREATER_REALM_MAX_CHUNKS
    || release.expectedCellCount > GREATER_REALM_MAX_CELLS
    || release.expectedSlotCount !== GREATER_REALM_CASTLE_CAPACITY
    || release.expectedResourceNodeCount !== RESOURCE_NODE_CAPACITY
    || ctx.db.greaterRealmNavigationComponentV1.count()
      !== BigInt(release.expectedComponentCount)
    || ctx.db.greaterRealmChunkV1.count() !== BigInt(release.expectedChunkCount)
    || ctx.db.greaterRealmCellV1.count() !== BigInt(release.expectedCellCount)
    || ctx.db.greaterRealmCastleSlotV1.count() !== BigInt(release.expectedSlotCount)
    || ctx.db.greaterRealmResourceNodeV1.count()
      !== BigInt(release.expectedResourceNodeCount)
  ) fail('GREATER_REALM_STATIC_ACTIVATION_COUNT_INVALID');
}

function requirePrivatePreCanaryState(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  releaseState: 'ready' | 'halted' = 'ready',
): void {
  assertRootCounts(ctx, 0);
  requireStaticTableCounts(ctx);
  if (onlyRelease(ctx).state !== releaseState) {
    fail('GREATER_REALM_RELEASE_STATE_INVALID');
  }
}

function setStaticActivationState(
  ctx: WarpkeepReducerContext,
  active: boolean,
): void {
  requireStaticActivationState(ctx, !active);
  const slots = [...ctx.db.greaterRealmCastleSlotV1.iter()];
  const resources = [...ctx.db.greaterRealmResourceNodeV1.iter()];
  for (const row of slots) {
    ctx.db.greaterRealmCastleSlotV1.slotId.update({ ...row, active });
  }
  for (const row of resources) {
    ctx.db.greaterRealmResourceNodeV1.nodeId.update({ ...row, active });
  }
  requireStaticActivationState(ctx, active);
}

type PublicRegionManifest = Readonly<{
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

function publicRegionManifest(release: ReleaseRow): readonly PublicRegionManifest[] {
  if (release.regionManifestJson === undefined || !release.regionManifestJson.endsWith('\n')) {
    fail('GREATER_REALM_REGION_MANIFEST_INVALID');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(release.regionManifestJson);
  } catch {
    fail('GREATER_REALM_REGION_MANIFEST_INVALID');
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== GREATER_REALM_PUBLIC_REGIONS.length
    || `${JSON.stringify(parsed)}\n` !== release.regionManifestJson
  ) fail('GREATER_REALM_REGION_MANIFEST_INVALID');
  const rows: PublicRegionManifest[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const value = parsed[index];
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      fail('GREATER_REALM_REGION_MANIFEST_INVALID');
    }
    const row = value as Record<string, unknown>;
    const expectedKeys = [
      'regionId', 'publicName', 'ordinal', 'tier', 'cellCount', 'passableCellCount',
      'chunkCount', 'castleCapacity', 'resourceLocationCount', 'resourceNodeCount',
      'foodNodeCount', 'woodNodeCount', 'stoneNodeCount', 'goldNodeCount', 'active',
    ];
    if (
      Object.keys(row).length !== expectedKeys.length
      || expectedKeys.some(key => !Object.prototype.hasOwnProperty.call(row, key))
    ) fail('GREATER_REALM_REGION_MANIFEST_INVALID');
    const expected = GREATER_REALM_PUBLIC_REGIONS[index]!;
    const numeric = expectedKeys.slice(2, -1);
    if (
      row.regionId !== expected.id
      || row.publicName !== expected.name
      || row.ordinal !== expected.ordinal
      || row.tier !== GREATER_REALM_VISIBLE_TIER_MAX
      || row.castleCapacity !== 100
      || row.active !== false
      || numeric.some(key => typeof row[key] !== 'number' || !Number.isSafeInteger(row[key]))
    ) fail('GREATER_REALM_REGION_MANIFEST_INVALID');
    rows.push(row as unknown as PublicRegionManifest);
  }
  return Object.freeze(rows);
}

function claimDigestRows(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  row: ActivationRow,
  claims: readonly ClaimRow[],
  topology: GreaterRealmFrozenTopologyV1,
): readonly GreaterRealmRelocationDigestRowV1[] {
  if (topology.topologyDigest !== row.topologySnapshotDigest) {
    fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
  }
  const allocations = planGreaterRealmExistingPopulationV1(
    topology.slots,
    claims.map(claim => claim.castleId),
  );
  if (allocations.length !== claims.length) fail('GREATER_REALM_CLAIM_COUNT_INVALID');
  return Object.freeze(claims.map((claim, index) => {
    const allocation = allocations[index]!;
    const castle = ctx.db.castle.castleId.find(claim.castleId);
    const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId);
    const cell = slot === null ? null : ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
    if (
      castle === null
      || slot === null
      || cell === null
      || claim.claimKind !== 'relocated'
      || claim.activationId !== row.activationId
      || claim.atlasId !== row.atlasId
      || claim.castleId !== allocation.castleId
      || claim.slotId !== allocation.slotId
      || claim.allocationSequence !== allocation.allocationSequence
      || claim.ownerFid !== castle.ownerFid
      || claim.legacySlotId === undefined
      || claim.legacyClaimedAt === undefined
      || claim.legacyGenerationVersion === undefined
      || claim.legacyTileKey === undefined
      || claim.legacyQ === undefined
      || claim.legacyR === undefined
      || row.plannedAt === undefined
      || !sameTimestamp(claim.plannedAt, row.plannedAt)
      || cell.atlasId !== row.atlasId
    ) fail('GREATER_REALM_ROLLBACK_PREIMAGE_INCOMPLETE');
    return Object.freeze({
      castleId: claim.castleId,
      ownerFid: claim.ownerFid,
      allocationSequence: claim.allocationSequence,
      targetSlotId: claim.slotId,
      targetCellKey: cell.cellKey,
      targetQ: cell.atlasQ,
      targetR: cell.atlasR,
      targetRegionId: cell.regionId,
      legacySlotId: claim.legacySlotId,
      legacyClaimedAt: claim.legacyClaimedAt,
      legacyGenerationVersion: claim.legacyGenerationVersion,
      legacyTileKey: claim.legacyTileKey,
      legacyQ: claim.legacyQ,
      legacyR: claim.legacyR,
      topologyDigest: row.topologySnapshotDigest,
    });
  }));
}

function requirePlannedClaims(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  row: ActivationRow,
  state: 'planned' | 'active',
  topology = captureGreaterRealmFrozenTopologyV1(ctx),
): readonly ClaimRow[] {
  const claims = sortedClaims(ctx);
  const foundedCount = state === 'active' ? row.postCanaryFoundingCount : 0;
  const expectedCount = row.snapshotCastleCount + foundedCount;
  if (
    expectedCount > GREATER_REALM_CASTLE_CAPACITY
    || claims.length !== expectedCount
    || ctx.db.castle.count() !== BigInt(expectedCount)
    || row.snapshotClaimCount !== row.snapshotCastleCount
    || row.nextAllocationSequence !== BigInt(expectedCount)
  ) fail('GREATER_REALM_CLAIM_COUNT_INVALID');
  const relocated = claims.slice(0, row.snapshotCastleCount);
  const founded = claims.slice(row.snapshotCastleCount);
  if (claims.length > 0) {
    const selection = selectGreaterRealmCastleAllocationV1(
      topology.slots,
      claims.map(claim => Object.freeze({
        castleId: claim.castleId,
        slotId: claim.slotId,
        allocationSequence: claim.allocationSequence,
        topologyDigest: row.topologySnapshotDigest,
      })),
      claims[0]!.castleId,
    );
    if (selection.result !== 'unchanged') fail('GREATER_REALM_ALLOCATION_ORDER_INVALID');
  }
  for (let index = 0; index < relocated.length; index += 1) {
    const claim = relocated[index]!;
    if (
      claim.claimKind !== 'relocated'
      || claim.allocationSequence !== BigInt(index)
      || claim.state !== state
      || (state === 'planned' ? claim.activatedAt !== undefined : claim.activatedAt === undefined)
      || (state === 'active' && !sameTimestamp(claim.activatedAt, row.canaryAt))
    ) fail('GREATER_REALM_CLAIM_STATE_INVALID');
  }
  for (let offset = 0; offset < founded.length; offset += 1) {
    const claim = founded[offset]!;
    if (
      claim.claimKind !== 'founded'
      || claim.state !== 'active'
      || claim.activationId !== row.activationId
      || claim.atlasId !== row.atlasId
      || claim.allocationSequence !== BigInt(row.snapshotCastleCount + offset)
      || claim.activatedAt === undefined
      || row.activatedAt === undefined
      || !sameTimestamp(claim.plannedAt, claim.activatedAt)
      || claim.activatedAt.microsSinceUnixEpoch
        < row.activatedAt.microsSinceUnixEpoch
      || claim.legacySlotId !== undefined
      || claim.legacyClaimedAt !== undefined
      || claim.legacyGenerationVersion !== undefined
      || claim.legacyTileKey !== undefined
      || claim.legacyQ !== undefined
      || claim.legacyR !== undefined
      || ctx.db.castle.castleId.find(claim.castleId)?.ownerFid !== claim.ownerFid
    ) fail('GREATER_REALM_FOUNDED_CLAIM_INVALID');
  }
  const digestRows = claimDigestRows(ctx, row, relocated, topology);
  if (greaterRealmRelocationPlanDigestV1(digestRows) !== row.relocationPlanDigest) {
    fail('GREATER_REALM_RELOCATION_PLAN_CHANGED');
  }
  return claims;
}

function requireLegacyPreimageCurrent(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  claim: ClaimRow,
): void {
  const castle = ctx.db.castle.castleId.find(claim.castleId);
  const legacyClaim = claim.legacySlotId === undefined
    ? null
    : ctx.db.castleSlotClaimV1.slotId.find(claim.legacySlotId);
  const tile = claim.legacyTileKey === undefined
    ? null
    : ctx.db.worldTile.key.find(claim.legacyTileKey);
  if (
    castle === null
    || legacyClaim === null
    || tile === null
    || claim.legacyQ === undefined
    || claim.legacyR === undefined
    || claim.legacyClaimedAt === undefined
    || claim.legacyGenerationVersion === undefined
    || castle.ownerFid !== claim.ownerFid
    || castle.tileKey !== claim.legacyTileKey
    || castle.q !== claim.legacyQ
    || castle.r !== claim.legacyR
    || legacyClaim.ownerFid !== claim.ownerFid
    || legacyClaim.castleId !== claim.castleId
    || legacyClaim.claimedAt.microsSinceUnixEpoch
      !== claim.legacyClaimedAt.microsSinceUnixEpoch
    || legacyClaim.generationVersion !== claim.legacyGenerationVersion
    || tile.occupantCastleId !== claim.castleId
  ) fail('GREATER_REALM_RELOCATION_PREIMAGE_CHANGED');
}

function requireRelocatedCurrent(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  row: ActivationRow,
  claims: readonly ClaimRow[],
): void {
  if (
    ctx.db.castleSlotClaimV1.count() !== 0n
    || ctx.db.greaterRealmCellOccupancyV1.count() !== BigInt(claims.length)
    || row.snapshotOccupancyCount !== row.snapshotCastleCount
  ) fail('GREATER_REALM_RELOCATED_GRAPH_COUNT_INVALID');
  for (const claim of claims) {
    const castle = ctx.db.castle.castleId.find(claim.castleId);
    const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId);
    const cell = slot === null ? null : ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
    const occupancy = ctx.db.greaterRealmCellOccupancyV1.castleId.find(claim.castleId);
    const relocated = claim.claimKind === 'relocated';
    const legacyTile = relocated
      ? ctx.db.worldTile.key.find(claim.legacyTileKey!)
      : null;
    if (
      castle === null
      || slot === null
      || cell === null
      || occupancy === null
      || claim.ownerFid !== castle.ownerFid
      || claim.activationId !== row.activationId
      || claim.atlasId !== row.atlasId
      || slot.atlasId !== row.atlasId
      || !slot.active
      || slot.tier !== 1
      || cell.atlasId !== row.atlasId
      || cell.cellKey !== slot.cellKey
      || cell.regionId !== slot.regionId
      || cell.componentKey !== slot.componentKey
      || cell.tier !== 1
      || !cell.passable
      || castle.tileKey !== cell.cellKey
      || castle.q !== cell.atlasQ
      || castle.r !== cell.atlasR
      || occupancy.cellKey !== cell.cellKey
      || occupancy.castleId !== claim.castleId
      || occupancy.atlasId !== row.atlasId
      || occupancy.regionId !== cell.regionId
      || occupancy.atlasRevision !== INITIAL_ATLAS_REVISION
      || !sameTimestamp(occupancy.occupiedAt, claim.activatedAt)
      || (relocated && (legacyTile === null || legacyTile.occupantCastleId !== undefined))
    ) fail('GREATER_REALM_RELOCATED_GRAPH_INVALID');
  }
}

function requirePublicRoots(
  ctx: WarpkeepReducerContext,
  row: ActivationRow,
  mode: 'canary' | 'active' | 'halted',
): void {
  assertRootCounts(ctx, 1);
  const release = onlyRelease(ctx);
  const atlas = ctx.db.realmAtlasV1.atlasId.find(row.atlasId);
  const worker = ctx.db.realmWorkerSystemV2.atlasId.find(row.atlasId);
  const expectedCastleCount = row.snapshotCastleCount + row.postCanaryFoundingCount;
  const expectedWorkerCount = expectedCastleCount * CASTLE_WORKERS_PER_CASTLE;
  const castles = sortedCastles(ctx);
  assertGreaterRealmCanonicalIdleWorkersV1(ctx, castles, mode === 'canary');
  if (mode !== 'canary') assertCastleWorkerActiveGraphHealthyV1(ctx);
  if (
    atlas === null
    || worker === null
    || atlas.publicReleaseId !== release.publicReleaseId
    || atlas.name !== release.publicName
    || atlas.protocolVersion !== GREATER_REALM_PROTOCOL_VERSION
    || atlas.generatorVersion !== release.generatorVersion
    || atlas.runtimePartitionVersion !== release.runtimePartitionVersion
    || atlas.rendererContractVersion !== release.rendererContractVersion
    || atlas.revision !== INITIAL_ATLAS_REVISION
    || atlas.visibleTierMax !== GREATER_REALM_VISIBLE_TIER_MAX
    || atlas.navigationTierMax !== GREATER_REALM_VISIBLE_TIER_MAX
    || atlas.foundingTierMax !== GREATER_REALM_VISIBLE_TIER_MAX
    || atlas.visibleRegionCount !== GREATER_REALM_PUBLIC_REGIONS.length
    || atlas.visibleCellCount !== release.expectedCellCount
    || atlas.visibleChunkCount !== release.expectedChunkCount
    || atlas.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || atlas.mode !== mode
    || !sameTimestamp(atlas.createdAt, row.canaryAt)
    || !sameTimestamp(atlas.activatedAt, row.activatedAt)
    || worker.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || worker.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || worker.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || worker.currentCastleCount !== expectedCastleCount
    || worker.currentWorkerCount !== expectedWorkerCount
    || ctx.db.castleWorkerV1.count() !== BigInt(expectedWorkerCount)
    || worker.rosterDigest !== rosterDigestForCastleIds(
      castles.map(castle => castle.castleId),
    )
    || worker.mode !== mode
    || !sameTimestamp(worker.createdAt, row.canaryAt)
    || !sameTimestamp(worker.activatedAt, row.activatedAt)
  ) fail('GREATER_REALM_PUBLIC_ROOT_INVALID');
  for (const expected of publicRegionManifest(release)) {
    const region = ctx.db.realmAtlasVisibleRegionV1.regionId.find(expected.regionId);
    if (
      region === null
      || region.atlasId !== row.atlasId
      || region.ordinal !== expected.ordinal
      || region.publicName !== expected.publicName
      || region.tier !== expected.tier
      || region.cellCount !== expected.cellCount
      || region.passableCellCount !== expected.passableCellCount
      || region.chunkCount !== expected.chunkCount
      || region.castleCapacity !== expected.castleCapacity
      || region.resourceLocationCount !== expected.resourceLocationCount
      || region.resourceNodeCount !== expected.resourceNodeCount
      || region.foodNodeCount !== expected.foodNodeCount
      || region.woodNodeCount !== expected.woodNodeCount
      || region.stoneNodeCount !== expected.stoneNodeCount
      || region.goldNodeCount !== expected.goldNodeCount
      || !region.active
    ) fail('GREATER_REALM_PUBLIC_REGION_ROOT_INVALID');
  }
}

function insertPublicRoots(
  ctx: WarpkeepReducerContext,
  row: ActivationRow,
): void {
  assertRootCounts(ctx, 0);
  const release = onlyRelease(ctx);
  if (release.publicName === undefined) fail('GREATER_REALM_RELEASE_NAME_MISSING');
  ctx.db.realmAtlasV1.insert({
    atlasId: row.atlasId,
    publicReleaseId: release.publicReleaseId,
    name: release.publicName,
    protocolVersion: GREATER_REALM_PROTOCOL_VERSION,
    generatorVersion: release.generatorVersion,
    runtimePartitionVersion: release.runtimePartitionVersion,
    rendererContractVersion: release.rendererContractVersion,
    revision: INITIAL_ATLAS_REVISION,
    visibleTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
    navigationTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
    foundingTierMax: GREATER_REALM_VISIBLE_TIER_MAX,
    visibleRegionCount: GREATER_REALM_PUBLIC_REGIONS.length,
    visibleCellCount: release.expectedCellCount,
    visibleChunkCount: release.expectedChunkCount,
    castleCapacity: GREATER_REALM_CASTLE_CAPACITY,
    mode: 'canary',
    createdAt: ctx.timestamp,
    activatedAt: undefined,
  });
  for (const region of publicRegionManifest(release)) {
    ctx.db.realmAtlasVisibleRegionV1.insert({ ...region, atlasId: row.atlasId, active: true });
  }
  const castles = sortedCastles(ctx);
  ctx.db.realmWorkerSystemV2.insert({
    atlasId: row.atlasId,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
    castleCapacity: GREATER_REALM_CASTLE_CAPACITY,
    currentCastleCount: castles.length,
    currentWorkerCount: Number(ctx.db.castleWorkerV1.count()),
    rosterDigest: rosterDigestForCastleIds(castles.map(castle => castle.castleId)),
    mode: 'canary',
    createdAt: ctx.timestamp,
    activatedAt: undefined,
  });
  assertRootCounts(ctx, 1);
}

function deletePublicRoots(ctx: WarpkeepReducerContext, atlasId: string): void {
  assertRootCounts(ctx, 1);
  for (const region of GREATER_REALM_PUBLIC_REGIONS) {
    if (!ctx.db.realmAtlasVisibleRegionV1.regionId.delete(region.id)) {
      fail('GREATER_REALM_PUBLIC_REGION_ROOT_INVALID');
    }
  }
  if (!ctx.db.realmWorkerSystemV2.atlasId.delete(atlasId)) {
    fail('GREATER_REALM_PUBLIC_ROOT_INVALID');
  }
  if (!ctx.db.realmAtlasV1.atlasId.delete(atlasId)) {
    fail('GREATER_REALM_PUBLIC_ROOT_INVALID');
  }
  assertRootCounts(ctx, 0);
}

function validateCanaryGraph(
  ctx: WarpkeepReducerContext,
  row: ActivationRow,
  mode: 'canary' | 'active' | 'halted',
  requireCutoverSnapshot: boolean,
  topology = captureGreaterRealmFrozenTopologyV1(ctx),
): readonly ClaimRow[] {
  if (topology.topologyDigest !== row.topologySnapshotDigest) {
    fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
  }
  const claims = requirePlannedClaims(ctx, row, 'active', topology);
  requireRelocatedCurrent(ctx, row, claims);
  requireLegacyRootActiveState(ctx, false);
  requirePublicRoots(ctx, row, mode);
  const release = onlyRelease(ctx);
  if (release.state !== mode) fail('GREATER_REALM_RELEASE_STATE_INVALID');
  if (
    requireCutoverSnapshot
    && row.postCanaryFoundingCount === 0
    && row.postCanaryDispatchCount === 0
  ) {
    assertGreaterRealmStoredCutoverSnapshotV1(ctx, row, claims);
  }
  return claims;
}

/**
 * Install the server-derived prepared checkpoint. This is transaction-internal
 * authority; the dormant production wrapper below binds the actor and compile
 * gate before entering it.
 */
export function prepareGreaterRealmActivationAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
  actorSubject: string,
): 'prepared' | 'unchanged' {
  requireActorSubject(actorSubject);
  const existing = currentGreaterRealmActivationRowV1(ctx);
  if (existing !== undefined) {
    if (existing.mode !== 'prepared' || existing.actorSubject !== actorSubject) {
      fail('GREATER_REALM_ACTIVATION_ALREADY_EXISTS');
    }
    assertGreaterRealmLegacyFounderTopologyV1(ctx);
    assertGreaterRealmCanonicalIdleWorkersV1(ctx, sortedCastles(ctx), false);
    assertCastleWorkerActiveGraphHealthyV1(ctx);
    requirePrivatePreCanaryState(ctx);
    const topology = captureGreaterRealmFrozenTopologyV1(ctx);
    if (
      ctx.db.greaterRealmCastleClaimV1.count() !== 0n
      || ctx.db.greaterRealmCellOccupancyV1.count() !== 0n
      || topology.atlasId !== existing.atlasId
      || topology.topologyDigest !== existing.topologySnapshotDigest
    ) fail('GREATER_REALM_PREPARED_RETRY_MISMATCH');
    return 'unchanged';
  }
  const snapshot = captureGreaterRealmPreparedSnapshotV1(ctx);
  assertCastleWorkerActiveGraphHealthyV1(ctx);
  const activationId = `${snapshot.atlasId}:activation:${snapshot.quietEpoch.toString()}`;
  ctx.db.greaterRealmActivationV1.insert({
    activationId,
    atlasId: snapshot.atlasId,
    quietEpoch: snapshot.quietEpoch,
    mode: 'prepared',
    snapshotCastleCount: snapshot.castleCount,
    snapshotWorkerCount: snapshot.workerCount,
    snapshotResourceAccountCount: snapshot.resourceAccountCount,
    snapshotMarkAccountCount: snapshot.markAccountCount,
    snapshotInnerKeepBuildingCount: snapshot.innerKeepBuildingCount,
    snapshotClaimCount: snapshot.claimCount,
    snapshotOccupancyCount: snapshot.occupancyCount,
    snapshotCastleDigest: snapshot.castleDigest,
    snapshotWorkerDigest: snapshot.workerDigest,
    snapshotResourceDigest: snapshot.resourceDigest,
    snapshotMarksDigest: snapshot.marksDigest,
    snapshotInnerKeepDigest: snapshot.innerKeepDigest,
    snapshotScheduleDigest: snapshot.scheduleDigest,
    topologySnapshotDigest: snapshot.topologyDigest,
    relocationPlanDigest: EMPTY_RELOCATION_PLAN_DIGEST,
    nextAllocationSequence: 0n,
    postCanaryFoundingCount: 0,
    postCanaryDispatchCount: 0,
    actorSubject,
    preparedAt: ctx.timestamp,
    drainingAt: undefined,
    frozenAt: undefined,
    plannedAt: undefined,
    canaryAt: undefined,
    activatedAt: undefined,
    haltedAt: undefined,
    rolledBackAt: undefined,
  });
  return 'prepared';
}

export function beginGreaterRealmDrainAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'draining' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode !== 'prepared' && row.mode !== 'draining') {
    fail('GREATER_REALM_DRAIN_PHASE_INVALID');
  }
  assertGreaterRealmLegacyFounderTopologyV1(ctx);
  requirePrivatePreCanaryState(ctx);
  if (
    ctx.db.greaterRealmCastleClaimV1.count() !== 0n
    || ctx.db.greaterRealmCellOccupancyV1.count() !== 0n
  ) fail('GREATER_REALM_DRAIN_TARGET_NOT_EMPTY');
  assertGreaterRealmCanonicalIdleWorkersV1(ctx, sortedCastles(ctx), false);
  assertCastleWorkerActiveGraphHealthyV1(ctx);
  const topology = captureGreaterRealmFrozenTopologyV1(ctx);
  if (
    topology.atlasId !== row.atlasId
    || topology.topologyDigest !== row.topologySnapshotDigest
  ) fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
  if (row.mode === 'draining') return 'unchanged';
  ctx.db.greaterRealmActivationV1.activationId.update(
    timestampedPhase(row, 'draining', ctx.timestamp),
  );
  return 'draining';
}

export function freezeGreaterRealmActivationAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'frozen' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode !== 'draining' && row.mode !== 'frozen') {
    fail('GREATER_REALM_FREEZE_PHASE_INVALID');
  }
  requireGreaterRealmQuietWindowV1(ctx);
  const castles = sortedCastles(ctx);
  assertGreaterRealmCanonicalIdleWorkersV1(ctx, castles);
  assertGreaterRealmLegacyFounderTopologyV1(ctx);
  requirePrivatePreCanaryState(ctx);
  if (
    ctx.db.greaterRealmCastleClaimV1.count() !== 0n
    || ctx.db.greaterRealmCellOccupancyV1.count() !== 0n
  ) fail('GREATER_REALM_FREEZE_TARGET_NOT_EMPTY');
  if (row.mode === 'frozen') {
    assertGreaterRealmStoredCutoverSnapshotV1(ctx, row);
    if (captureGreaterRealmFrozenTopologyV1(ctx).topologyDigest !== row.topologySnapshotDigest) {
      fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
    }
    return 'unchanged';
  }
  const snapshot = captureGreaterRealmDrainedSnapshotV1(ctx);
  if (snapshot.atlasId !== row.atlasId) fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
  ctx.db.greaterRealmActivationV1.activationId.update({
    ...timestampedPhase(row, 'frozen', ctx.timestamp),
    ...snapshotRowFields(snapshot),
  });
  return 'frozen';
}

export function planGreaterRealmRelocationAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'planned' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode === 'planned') {
    requirePrivatePreCanaryState(ctx);
    if (ctx.db.greaterRealmCellOccupancyV1.count() !== 0n) {
      fail('GREATER_REALM_OCCUPANCY_TARGET_NOT_EMPTY');
    }
    assertGreaterRealmStoredCutoverSnapshotV1(ctx, row);
    assertGreaterRealmLegacyFounderTopologyV1(ctx);
    requireGreaterRealmQuietWindowV1(ctx);
    requirePlannedClaims(ctx, row, 'planned').forEach(claim => (
      requireLegacyPreimageCurrent(ctx, claim)
    ));
    return 'unchanged';
  }
  if (row.mode !== 'frozen') fail('GREATER_REALM_PLAN_PHASE_INVALID');
  assertGreaterRealmStoredCutoverSnapshotV1(ctx, row);
  assertGreaterRealmLegacyFounderTopologyV1(ctx);
  requireGreaterRealmQuietWindowV1(ctx);
  requirePrivatePreCanaryState(ctx);
  if (
    ctx.db.greaterRealmCastleClaimV1.count() !== 0n
    || ctx.db.greaterRealmCellOccupancyV1.count() !== 0n
  ) fail('GREATER_REALM_PLAN_TARGET_NOT_EMPTY');
  const plan = planGreaterRealmExistingPopulationFromCurrentV1(ctx);
  if (plan.topology.topologyDigest !== row.topologySnapshotDigest) {
    fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
  }
  for (const allocation of plan.allocations) {
    const castle = ctx.db.castle.castleId.find(allocation.castleId);
    const legacyClaim = castle === null
      ? null
      : ctx.db.castleSlotClaimV1.ownerFid.find(castle.ownerFid);
    if (castle === null || legacyClaim === null) {
      fail('GREATER_REALM_RELOCATION_PREIMAGE_INVALID');
    }
    ctx.db.greaterRealmCastleClaimV1.insert({
      slotId: allocation.slotId,
      ownerFid: castle.ownerFid,
      castleId: castle.castleId,
      atlasId: row.atlasId,
      activationId: row.activationId,
      state: 'planned',
      claimKind: 'relocated',
      allocationSequence: allocation.allocationSequence,
      plannedAt: ctx.timestamp,
      activatedAt: undefined,
      legacySlotId: legacyClaim.slotId,
      legacyClaimedAt: legacyClaim.claimedAt,
      legacyGenerationVersion: legacyClaim.generationVersion,
      legacyTileKey: castle.tileKey,
      legacyQ: castle.q,
      legacyR: castle.r,
    });
  }
  const planned = timestampedPhase(row, 'planned', ctx.timestamp);
  ctx.db.greaterRealmActivationV1.activationId.update({
    ...planned,
    snapshotClaimCount: plan.allocations.length,
    relocationPlanDigest: plan.relocationPlanDigest,
    nextAllocationSequence: BigInt(plan.allocations.length),
  });
  requirePlannedClaims(ctx, activation(ctx), 'planned', plan.topology).forEach(claim => (
    requireLegacyPreimageCurrent(ctx, claim)
  ));
  return 'planned';
}

/**
 * Perform the complete cutover in the caller's one database transaction.
 * Every mutable input is looked up from the stored plan; no coordinate, rank,
 * castle, FID, count, or digest argument crosses this boundary.
 */
export function relocateGreaterRealmCanaryAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'canary' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode === 'canary') {
    requireGreaterRealmQuietWindowV1(ctx);
    validateCanaryGraph(ctx, row, 'canary', true);
    return 'unchanged';
  }
  if (row.mode !== 'planned') fail('GREATER_REALM_CANARY_PHASE_INVALID');
  assertGreaterRealmStoredCutoverSnapshotV1(ctx, row);
  requireGreaterRealmQuietWindowV1(ctx);
  const castles = sortedCastles(ctx);
  assertGreaterRealmCanonicalIdleWorkersV1(ctx, castles);
  assertGreaterRealmLegacyFounderTopologyV1(ctx);
  const topology = captureGreaterRealmFrozenTopologyV1(ctx);
  if (topology.topologyDigest !== row.topologySnapshotDigest) {
    fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
  }
  requirePrivatePreCanaryState(ctx);
  if (ctx.db.greaterRealmCellOccupancyV1.count() !== 0n || row.snapshotOccupancyCount !== 0) {
    fail('GREATER_REALM_OCCUPANCY_TARGET_NOT_EMPTY');
  }
  const claims = requirePlannedClaims(ctx, row, 'planned', topology);
  claims.forEach(claim => requireLegacyPreimageCurrent(ctx, claim));

  for (const claim of claims) {
    const castle = ctx.db.castle.castleId.find(claim.castleId)!;
    const oldTile = ctx.db.worldTile.key.find(claim.legacyTileKey!)!;
    const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId)!;
    const cell = ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey)!;
    ctx.db.worldTile.key.update({ ...oldTile, occupantCastleId: undefined });
    if (!ctx.db.castleSlotClaimV1.slotId.delete(claim.legacySlotId!)) {
      fail('GREATER_REALM_LEGACY_CLAIM_DELETE_FAILED');
    }
    ctx.db.castle.castleId.update({
      ...castle,
      tileKey: cell.cellKey,
      q: cell.atlasQ,
      r: cell.atlasR,
    });
    ctx.db.greaterRealmCastleClaimV1.slotId.update({
      ...claim,
      state: 'active',
      activatedAt: ctx.timestamp,
    });
    ctx.db.greaterRealmCellOccupancyV1.insert({
      cellKey: cell.cellKey,
      atlasId: row.atlasId,
      regionId: cell.regionId,
      castleId: claim.castleId,
      atlasRevision: INITIAL_ATLAS_REVISION,
      occupiedAt: ctx.timestamp,
    });
  }
  if (ctx.db.castleSlotClaimV1.count() !== 0n) {
    fail('GREATER_REALM_LEGACY_CLAIM_DELETE_INCOMPLETE');
  }
  const legacyRealm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
  if (legacyRealm === null || !legacyRealm.active) {
    fail('GREATER_REALM_LEGACY_ROOT_STATE_INVALID');
  }
  ctx.db.realmV1.realmId.update({ ...legacyRealm, active: false });
  setStaticActivationState(ctx, true);
  insertPublicRoots(ctx, row);
  const release = onlyRelease(ctx);
  ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release, state: 'canary' });
  const canary = timestampedPhase(row, 'canary', ctx.timestamp);
  ctx.db.greaterRealmActivationV1.activationId.update({
    ...canary,
    snapshotOccupancyCount: claims.length,
  });
  validateCanaryGraph(ctx, activation(ctx), 'canary', true);
  return 'canary';
}

function setPublicMode(
  ctx: WarpkeepReducerContext,
  atlasId: string,
  mode: 'active' | 'halted',
): void {
  const atlas = ctx.db.realmAtlasV1.atlasId.find(atlasId);
  const worker = ctx.db.realmWorkerSystemV2.atlasId.find(atlasId);
  if (atlas === null || worker === null) fail('GREATER_REALM_PUBLIC_ROOT_INVALID');
  ctx.db.realmAtlasV1.atlasId.update({
    ...atlas,
    mode,
    activatedAt: mode === 'active' ? (atlas.activatedAt ?? ctx.timestamp) : atlas.activatedAt,
  });
  ctx.db.realmWorkerSystemV2.atlasId.update({
    ...worker,
    mode,
    activatedAt: mode === 'active' ? (worker.activatedAt ?? ctx.timestamp) : worker.activatedAt,
  });
}

export function commitGreaterRealmActiveAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'active' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode === 'active') {
    validateCanaryGraph(ctx, row, 'active', false);
    return 'unchanged';
  }
  if (row.mode !== 'canary') fail('GREATER_REALM_COMMIT_PHASE_INVALID');
  validateCanaryGraph(ctx, row, 'canary', false);
  const active = timestampedPhase(row, 'active', ctx.timestamp);
  ctx.db.greaterRealmActivationV1.activationId.update(active);
  const release = onlyRelease(ctx);
  ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release, state: 'active' });
  setPublicMode(ctx, row.atlasId, 'active');
  validateCanaryGraph(ctx, activation(ctx), 'active', false);
  return 'active';
}

export function haltGreaterRealmActivationAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'halted' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode === 'halted') {
    if (row.canaryAt !== undefined) {
      validateCanaryGraph(ctx, row, 'halted', false);
    } else {
      assertGreaterRealmLegacyFounderTopologyV1(ctx);
      assertGreaterRealmCanonicalIdleWorkersV1(
        ctx,
        sortedCastles(ctx),
        row.frozenAt !== undefined,
      );
      if (row.frozenAt === undefined) assertCastleWorkerActiveGraphHealthyV1(ctx);
      if (row.frozenAt !== undefined) {
        requireGreaterRealmQuietWindowV1(ctx);
        assertGreaterRealmStoredCutoverSnapshotV1(ctx, row);
      }
      requirePrivatePreCanaryState(ctx, 'halted');
      const topology = captureGreaterRealmFrozenTopologyV1(ctx);
      if (
        onlyRelease(ctx).state !== 'halted'
        || topology.atlasId !== row.atlasId
        || topology.topologyDigest !== row.topologySnapshotDigest
      ) fail('GREATER_REALM_RELEASE_STATE_INVALID');
      if (row.plannedAt !== undefined) {
        requirePlannedClaims(ctx, row, 'planned', topology).forEach(claim => (
          requireLegacyPreimageCurrent(ctx, claim)
        ));
      } else if (ctx.db.greaterRealmCastleClaimV1.count() !== 0n) {
        fail('GREATER_REALM_CLAIM_STATE_INVALID');
      }
    }
    return 'unchanged';
  }
  if (row.mode === 'rolled-back') fail('GREATER_REALM_HALT_PHASE_INVALID');
  const cutover = row.canaryAt !== undefined;
  if (cutover) {
    validateCanaryGraph(
      ctx,
      row,
      row.mode === 'active' ? 'active' : 'canary',
      false,
    );
  } else {
    assertGreaterRealmLegacyFounderTopologyV1(ctx);
    assertGreaterRealmCanonicalIdleWorkersV1(
      ctx,
      sortedCastles(ctx),
      row.frozenAt !== undefined,
    );
    if (row.frozenAt === undefined) assertCastleWorkerActiveGraphHealthyV1(ctx);
    if (row.frozenAt !== undefined) {
      requireGreaterRealmQuietWindowV1(ctx);
      assertGreaterRealmStoredCutoverSnapshotV1(ctx, row);
    }
    requirePrivatePreCanaryState(ctx);
    const topology = captureGreaterRealmFrozenTopologyV1(ctx);
    if (
      onlyRelease(ctx).state !== 'ready'
      || topology.atlasId !== row.atlasId
      || topology.topologyDigest !== row.topologySnapshotDigest
    ) fail('GREATER_REALM_RELEASE_STATE_INVALID');
    if (row.plannedAt !== undefined) {
      requirePlannedClaims(ctx, row, 'planned', topology).forEach(claim => (
        requireLegacyPreimageCurrent(ctx, claim)
      ));
    } else if (ctx.db.greaterRealmCastleClaimV1.count() !== 0n) {
      fail('GREATER_REALM_CLAIM_STATE_INVALID');
    }
  }
  const halted = timestampedPhase(row, 'halted', ctx.timestamp);
  ctx.db.greaterRealmActivationV1.activationId.update(halted);
  const release = onlyRelease(ctx);
  ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release, state: 'halted' });
  if (cutover) {
    setPublicMode(ctx, row.atlasId, 'halted');
    validateCanaryGraph(ctx, activation(ctx), 'halted', false);
  }
  return 'halted';
}

/**
 * Resume only an already-committed release. `activatedAt` and `haltedAt` stay
 * immutable audit history; the public modes and finalized release state are
 * the only resumed fields.
 */
export function resumeGreaterRealmActiveAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'active' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode === 'active') {
    validateCanaryGraph(ctx, row, 'active', false);
    return 'unchanged';
  }
  if (
    row.mode !== 'halted'
    || row.activatedAt === undefined
    || row.canaryAt === undefined
  ) fail('GREATER_REALM_RESUME_PHASE_INVALID');
  validateCanaryGraph(ctx, row, 'halted', false);
  const resumed = timestampedPhase(row, 'active', ctx.timestamp);
  ctx.db.greaterRealmActivationV1.activationId.update(resumed);
  const release = onlyRelease(ctx);
  ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release, state: 'active' });
  setPublicMode(ctx, row.atlasId, 'active');
  validateCanaryGraph(ctx, activation(ctx), 'active', false);
  return 'active';
}

function requireRolledBackState(
  ctx: WarpkeepReducerContext,
  row: ActivationRow,
): void {
  if (
    row.mode !== 'rolled-back'
    || row.activatedAt !== undefined
    || row.postCanaryFoundingCount !== 0
    || row.postCanaryDispatchCount !== 0
    || row.snapshotClaimCount !== 0
    || row.snapshotOccupancyCount !== 0
    || ctx.db.greaterRealmCastleClaimV1.count() !== 0n
    || ctx.db.greaterRealmCellOccupancyV1.count() !== 0n
    || onlyRelease(ctx).state !== 'ready'
  ) fail('GREATER_REALM_ROLLBACK_STATE_INVALID');
  assertRootCounts(ctx, 0);
  assertGreaterRealmLegacyFounderTopologyV1(ctx);
  assertGreaterRealmCanonicalIdleWorkersV1(ctx, sortedCastles(ctx), false);
  assertCastleWorkerActiveGraphHealthyV1(ctx);
  const topology = captureGreaterRealmFrozenTopologyV1(ctx);
  if (
    topology.atlasId !== row.atlasId
    || topology.topologyDigest !== row.topologySnapshotDigest
  ) fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
}

export function rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(
  ctx: WarpkeepReducerContext,
): 'rolled-back' | 'unchanged' {
  const row = activation(ctx);
  if (row.mode === 'rolled-back') {
    requireRolledBackState(ctx, row);
    return 'unchanged';
  }
  const rollbackCheckpoint = checkpoint(row, 'rolled-back');
  planGreaterRealmActivationTransitionV1(
    greaterRealmActivationCheckpointFromRowV1(row),
    rollbackCheckpoint,
  );
  const cutover = row.canaryAt !== undefined;
  const frozen = row.frozenAt !== undefined;
  if (frozen) requireGreaterRealmQuietWindowV1(ctx);
  assertGreaterRealmCanonicalIdleWorkersV1(ctx, sortedCastles(ctx), frozen);
  if (!frozen) assertCastleWorkerActiveGraphHealthyV1(ctx);
  let claims: readonly ClaimRow[] = [];
  if (cutover) {
    claims = validateCanaryGraph(
      ctx,
      row,
      row.mode === 'halted' ? 'halted' : 'canary',
      true,
    );
  } else {
    assertGreaterRealmLegacyFounderTopologyV1(ctx);
    requirePrivatePreCanaryState(
      ctx,
      row.mode === 'halted' ? 'halted' : 'ready',
    );
    const topology = captureGreaterRealmFrozenTopologyV1(ctx);
    if (
      topology.atlasId !== row.atlasId
      || topology.topologyDigest !== row.topologySnapshotDigest
    ) fail('GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED');
    if (row.frozenAt !== undefined) {
      assertGreaterRealmStoredCutoverSnapshotV1(ctx, row);
    }
    if (row.plannedAt !== undefined) {
      claims = requirePlannedClaims(ctx, row, 'planned', topology);
    } else if (ctx.db.greaterRealmCastleClaimV1.count() !== 0n) {
      fail('GREATER_REALM_ROLLBACK_CLAIM_STATE_INVALID');
    }
  }
  const journeyRowsBefore = captureGreaterRealmJourneyRowsDigestV1(ctx);
  if (cutover) {
    for (const claim of claims) {
      const castle = ctx.db.castle.castleId.find(claim.castleId)!;
      const oldTile = ctx.db.worldTile.key.find(claim.legacyTileKey!)!;
      if (
        oldTile.occupantCastleId !== undefined
        || ctx.db.castleSlotClaimV1.slotId.find(claim.legacySlotId!) !== null
      ) fail('GREATER_REALM_ROLLBACK_TARGET_CONFLICT');
      const occupancy = ctx.db.greaterRealmCellOccupancyV1.castleId.find(claim.castleId);
      if (occupancy === null || !ctx.db.greaterRealmCellOccupancyV1.cellKey.delete(occupancy.cellKey)) {
        fail('GREATER_REALM_OCCUPANCY_DELETE_FAILED');
      }
      ctx.db.castle.castleId.update({
        ...castle,
        tileKey: claim.legacyTileKey!,
        q: claim.legacyQ!,
        r: claim.legacyR!,
      });
      ctx.db.castleSlotClaimV1.insert({
        slotId: claim.legacySlotId!,
        ownerFid: claim.ownerFid,
        castleId: claim.castleId,
        claimedAt: claim.legacyClaimedAt!,
        generationVersion: claim.legacyGenerationVersion!,
      });
      ctx.db.worldTile.key.update({ ...oldTile, occupantCastleId: claim.castleId });
      if (!ctx.db.greaterRealmCastleClaimV1.slotId.delete(claim.slotId)) {
        fail('GREATER_REALM_CLAIM_DELETE_FAILED');
      }
    }
    const legacyRealm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
    if (legacyRealm === null || legacyRealm.active) {
      fail('GREATER_REALM_LEGACY_ROOT_STATE_INVALID');
    }
    ctx.db.realmV1.realmId.update({ ...legacyRealm, active: true });
    deletePublicRoots(ctx, row.atlasId);
    setStaticActivationState(ctx, false);
  } else {
    for (const claim of claims) {
      requireLegacyPreimageCurrent(ctx, claim);
      if (!ctx.db.greaterRealmCastleClaimV1.slotId.delete(claim.slotId)) {
        fail('GREATER_REALM_CLAIM_DELETE_FAILED');
      }
    }
  }
  const release = onlyRelease(ctx);
  ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release, state: 'ready' });
  const rolledBack = timestampedPhase(row, 'rolled-back', ctx.timestamp);
  ctx.db.greaterRealmActivationV1.activationId.update({
    ...rolledBack,
    snapshotClaimCount: 0,
    snapshotOccupancyCount: 0,
  });
  if (captureGreaterRealmJourneyRowsDigestV1(ctx) !== journeyRowsBefore) {
    fail('GREATER_REALM_TRANSACTION_JOURNEY_ROWS_CHANGED');
  }
  requireRolledBackState(ctx, activation(ctx));
  return 'rolled-back';
}

export function greaterRealmRelocationAuthorityErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmRelocationAuthorityError ? error.code : undefined;
}
