import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  planGreaterRealmActivationTransitionV1,
} from './greaterRealmActivationPolicy';
import {
  currentGreaterRealmActivationRowV1,
  greaterRealmActivationCheckpointFromRowV1,
  greaterRealmLegacyFoundingIsOpenV1,
  greaterRealmLegacyJourneyDispatchIsOpenV1,
} from './greaterRealmActivationState';
import {
  assertGreaterRealmCurrentFounderForFidV1,
  assertGreaterRealmCurrentWorldV1,
  profileMatchesMarks,
} from './greaterRealmCurrentAuthority';
import { greaterRealmJourneyCountsV1 } from './greaterRealmRelocationSnapshot';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_LEGACY_LOWLANDS_BRIDGE_V1,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RELEASE_STATES,
  GREATER_REALM_RESOURCE_KINDS,
  GREATER_REALM_RESOURCE_MARGIN_PER_SLOT,
  GREATER_REALM_VERIFY_PHASES,
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
} from './greaterRealmV17Policy';
import { inspectGreaterRealmV17 } from './greaterRealmV17Authority';
import {
  CASTLE_WORKERS_PER_CASTLE,
} from './castleWorkerPolicy';
import { assertCastleWorkerRoster } from './castleWorkerRoster';
import { markAccountIsConsistent } from './marksAuthorityPolicy';
import { resourceAccountStateIsConsistent } from './resourceAuthorityPolicy';
import { assertGenesisResourceForFid } from './resourceAuthority';
import { MAX_AUTH_EPOCH } from './config';
import type warpkeep from './schema';
import { HEGEMONY_REALM_ID } from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ROSTER_DIGEST_PATTERN = /^[0-9a-f]{16}$/u;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const OPAQUE_PUBLIC_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u;
const RESOURCE_NODE_CAPACITY = GREATER_REALM_CASTLE_CAPACITY
  * GREATER_REALM_RESOURCE_MARGIN_PER_SLOT
  * GREATER_REALM_RESOURCE_KINDS.length;
const WORKER_CAPACITY = GREATER_REALM_CASTLE_CAPACITY * CASTLE_WORKERS_PER_CASTLE;
const LEGACY_WORLD_TILE_CAPACITY = GREATER_REALM_LEGACY_LOWLANDS_BRIDGE_V1.mappedCellCount;
const U64_MAXIMUM = (1n << 64n) - 1n;

export class GreaterRealmCutoverStatusError extends Error {
  constructor() {
    super('GREATER_REALM_CUTOVER_STATUS_INVALID');
    this.name = 'GreaterRealmCutoverStatusError';
  }
}

function fail(): never {
  throw new GreaterRealmCutoverStatusError();
}

function safeProjectionString(
  value: unknown,
  maximum: number,
  pattern?: RegExp,
): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maximum
    || value.normalize('NFKC') !== value
    || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
    || (pattern !== undefined && !pattern.test(value))
  ) fail();
  return value;
}

function safeMode<const Mode extends string>(
  value: unknown,
  modes: readonly Mode[],
): Mode {
  if (!modes.includes(value as Mode)) fail();
  return value as Mode;
}

function optionalOnlyRow<Row>(
  count: bigint,
  rows: Iterable<Row>,
): Row | undefined {
  if (count < 0n || count > 1n) fail();
  let selected: Row | undefined;
  let seen = 0n;
  for (const row of rows) {
    seen += 1n;
    if (seen > 1n || selected !== undefined) fail();
    selected = row;
  }
  if (seen !== count) fail();
  return selected;
}

function requireBoundedCount(value: bigint, maximum: number): number {
  if (value < 0n || value > BigInt(maximum)) fail();
  return Number(value);
}

function boundedCountWhere<Row>(
  count: bigint,
  rows: Iterable<Row>,
  maximum: number,
  predicate: (row: Row) => boolean,
): bigint {
  requireBoundedCount(count, maximum);
  let seen = 0n;
  let selected = 0n;
  for (const row of rows) {
    seen += 1n;
    if (seen > BigInt(maximum)) fail();
    if (predicate(row)) selected += 1n;
  }
  if (seen !== count) fail();
  return selected;
}

function rollbackEligible(
  row: NonNullable<ReturnType<typeof currentGreaterRealmActivationRowV1>> | undefined,
): boolean {
  if (row === undefined || row.mode === 'rolled-back') return false;
  const current = greaterRealmActivationCheckpointFromRowV1(row);
  try {
    planGreaterRealmActivationTransitionV1(current, Object.freeze({
      phase: 'rolled-back',
      everActive: false,
      postCanaryFoundingCount: 0,
      postCanaryDispatchCount: 0,
    }));
    return true;
  } catch {
    return false;
  }
}

function exactFounderAggregateGraph(
  ctx: WarpkeepReducerContext,
  expectedFounderCount: number,
): boolean {
  if (
    ctx.db.castle.count() !== BigInt(expectedFounderCount)
    || ctx.db.realmProfileV1.count() !== BigInt(expectedFounderCount)
    || ctx.db.markAccountV1.count() !== BigInt(expectedFounderCount)
    || ctx.db.resourceAccountV1.count() !== BigInt(expectedFounderCount)
    || ctx.db.allowedFid.count() !== BigInt(expectedFounderCount)
    || ctx.db.castleWorkerV1.count()
      !== BigInt(expectedFounderCount * CASTLE_WORKERS_PER_CASTLE)
  ) return false;
  try {
    let seen = 0;
    for (const castle of ctx.db.castle.iter()) {
      seen += 1;
      if (seen > GREATER_REALM_CASTLE_CAPACITY) return false;
      const allowed = ctx.db.allowedFid.fid.find(castle.ownerFid);
      const profile = ctx.db.realmProfileV1.fid.find(castle.ownerFid);
      const marks = ctx.db.markAccountV1.fid.find(castle.ownerFid);
      const resources = ctx.db.resourceAccountV1.fid.find(castle.ownerFid);
      if (
        allowed === null
        || allowed.fid !== castle.ownerFid
        || profile === null
        || profile.fid !== castle.ownerFid
        || marks === null
        || marks.fid !== castle.ownerFid
        || resources === null
        || resources.fid !== castle.ownerFid
        || !markAccountIsConsistent(marks)
        || !profileMatchesMarks(profile, marks)
        || resources.castleId !== castle.castleId
        || resources.realmId !== HEGEMONY_REALM_ID
        || !resourceAccountStateIsConsistent(resources)
      ) return false;
      assertCastleWorkerRoster(ctx, castle.castleId);
    }
    return seen === expectedFounderCount;
  } catch {
    return false;
  }
}

/**
 * Fixed, identity-free administrator projection for cutover and admission
 * reconciliation. Every scan is capped by a protocol constant; no FID,
 * castle/cell/slot/resource identifier, timestamp, actor, or raw row escapes.
 */
export function projectGreaterRealmCutoverStatusV1(ctx: WarpkeepReducerContext) {
  const releaseRows = ctx.db.greaterRealmReleaseV1.count();
  const release = optionalOnlyRow(releaseRows, ctx.db.greaterRealmReleaseV1.iter());
  const importStatus = inspectGreaterRealmV17(ctx);
  const activationRows = ctx.db.greaterRealmActivationV1.count();
  const activation = currentGreaterRealmActivationRowV1(ctx);
  if ((activation === undefined ? 0n : 1n) !== activationRows) fail();

  const releaseState = release === undefined
    ? 'absent'
    : safeMode(release.state, GREATER_REALM_RELEASE_STATES);
  const verificationPhase = release === undefined
    ? 'absent'
    : safeMode(release.verificationPhase, GREATER_REALM_VERIFY_PHASES);
  const activationCheckpoint = activation === undefined
    ? undefined
    : greaterRealmActivationCheckpointFromRowV1(activation);
  const activationMode = activationCheckpoint?.phase ?? 'absent';
  const releaseVerificationExact = release !== undefined
    && release.readyAt !== undefined
    && release.verificationPhase === 'complete'
    && release.verificationCursor === 0n
    && release.verifiedComponentCount === release.expectedComponentCount
    && release.verifiedChunkCount === release.expectedChunkCount
    && release.verifiedCellCount === release.expectedCellCount
    && release.verifiedSlotCount === release.expectedSlotCount
    && release.verifiedResourceNodeCount === release.expectedResourceNodeCount
    && release.componentExpectedCellCount === release.importedPassableCellCount
    && release.componentExpectedSlotCount === release.expectedSlotCount
    && release.componentExpectedResourceNodeCount === release.expectedResourceNodeCount;

  const slotRows = ctx.db.greaterRealmCastleSlotV1.count();
  const activeSlotRows = boundedCountWhere(
    slotRows,
    ctx.db.greaterRealmCastleSlotV1.iter(),
    GREATER_REALM_CASTLE_CAPACITY,
    row => row.active,
  );
  const resourceNodeRows = ctx.db.greaterRealmResourceNodeV1.count();
  const activeResourceNodeRows = boundedCountWhere(
    resourceNodeRows,
    ctx.db.greaterRealmResourceNodeV1.iter(),
    RESOURCE_NODE_CAPACITY,
    row => row.active,
  );

  const castleRows = ctx.db.castle.count();
  const currentFounderCount = requireBoundedCount(
    castleRows,
    GREATER_REALM_CASTLE_CAPACITY,
  );
  const founderCapacityRemaining = GREATER_REALM_CASTLE_CAPACITY - currentFounderCount;

  const claimRows = ctx.db.greaterRealmCastleClaimV1.count();
  requireBoundedCount(claimRows, GREATER_REALM_CASTLE_CAPACITY);
  let seenClaims = 0n;
  let plannedClaimRows = 0n;
  let activeClaimRows = 0n;
  let unknownClaimStateRows = 0n;
  let relocatedClaimRows = 0n;
  let foundedClaimRows = 0n;
  let unknownClaimKindRows = 0n;
  const regionFounderCounts = new Map<string, number>(
    GREATER_REALM_PUBLIC_REGIONS.map(region => [region.id, 0]),
  );
  let unassignedRegionFounderCount = 0;
  for (const claim of ctx.db.greaterRealmCastleClaimV1.iter()) {
    seenClaims += 1n;
    if (seenClaims > BigInt(GREATER_REALM_CASTLE_CAPACITY)) fail();
    if (claim.state === 'planned') plannedClaimRows += 1n;
    else if (claim.state === 'active') activeClaimRows += 1n;
    else unknownClaimStateRows += 1n;
    if (claim.claimKind === 'relocated') relocatedClaimRows += 1n;
    else if (claim.claimKind === 'founded') foundedClaimRows += 1n;
    else unknownClaimKindRows += 1n;
    if (claim.state === 'active') {
      const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId);
      const prior = slot === null ? undefined : regionFounderCounts.get(slot.regionId);
      if (prior === undefined) unassignedRegionFounderCount += 1;
      else regionFounderCounts.set(slot!.regionId, prior + 1);
    }
  }
  if (seenClaims !== claimRows) fail();

  const legacyOccupiedWorldTileRows = boundedCountWhere(
    ctx.db.worldTile.count(),
    ctx.db.worldTile.iter(),
    LEGACY_WORLD_TILE_CAPACITY,
    row => row.occupantCastleId !== undefined,
  );
  const enabledAllowedFidRows = boundedCountWhere(
    ctx.db.allowedFid.count(),
    ctx.db.allowedFid.iter(),
    GREATER_REALM_CASTLE_CAPACITY,
    row => row.enabled,
  );
  const idleCastleWorkerRows = boundedCountWhere(
    ctx.db.castleWorkerV1.count(),
    ctx.db.castleWorkerV1.iter(),
    WORKER_CAPACITY,
    row => row.status === 'idle',
  );
  const nonIdleCastleWorkerRows = ctx.db.castleWorkerV1.count() - idleCastleWorkerRows;

  const legacyRealmRows = ctx.db.realmV1.count();
  const legacyRealm = optionalOnlyRow(legacyRealmRows, ctx.db.realmV1.iter());
  const atlasRows = ctx.db.realmAtlasV1.count();
  const atlas = optionalOnlyRow(atlasRows, ctx.db.realmAtlasV1.iter());
  const visibleRegionRows = ctx.db.realmAtlasVisibleRegionV1.count();
  const activeVisibleRegionRows = boundedCountWhere(
    visibleRegionRows,
    ctx.db.realmAtlasVisibleRegionV1.iter(),
    GREATER_REALM_PUBLIC_REGIONS.length,
    row => row.active,
  );
  const workerSystemV2Rows = ctx.db.realmWorkerSystemV2.count();
  const workerSystemV2 = optionalOnlyRow(
    workerSystemV2Rows,
    ctx.db.realmWorkerSystemV2.iter(),
  );
  const workerSystemV1Rows = ctx.db.realmWorkerSystemV1.count();
  const workerSystemV1 = optionalOnlyRow(
    workerSystemV1Rows,
    ctx.db.realmWorkerSystemV1.iter(),
  );

  const atlasMode = atlas === undefined
    ? 'absent'
    : safeMode(atlas.mode, ['canary', 'active', 'halted'] as const);
  const workerSystemV2Mode = workerSystemV2 === undefined
    ? 'absent'
    : safeMode(workerSystemV2.mode, ['canary', 'active', 'halted'] as const);
  const workerSystemV1Mode = workerSystemV1 === undefined
    ? 'absent'
    : safeMode(workerSystemV1.mode, ['staged', 'active'] as const);

  const journey = greaterRealmJourneyCountsV1(ctx);
  const currentWorldGraphApplicable = activation !== undefined
    && activation.canaryAt !== undefined
    && activation.rolledBackAt === undefined;
  let currentWorldAuthorityExact = false;
  if (currentWorldGraphApplicable) {
    try {
      const world = assertGreaterRealmCurrentWorldV1(ctx);
      currentWorldAuthorityExact = world.activation.activationId === activation!.activationId;
    } catch {
      currentWorldAuthorityExact = false;
    }
  }
  const expectedCurrentFounderCount = activation === undefined
    ? 0
    : activation.snapshotCastleCount + activation.postCanaryFoundingCount;
  const regionFounderTotal = [...regionFounderCounts.values()]
    .reduce((total, count) => total + count, 0) + unassignedRegionFounderCount;
  const currentWorldGraphExact = currentWorldGraphApplicable
    && currentWorldAuthorityExact
    && expectedCurrentFounderCount === currentFounderCount
    && exactFounderAggregateGraph(ctx, expectedCurrentFounderCount)
    && importStatus.importsExact
    && releaseVerificationExact
    && release?.expectedSlotCount === GREATER_REALM_CASTLE_CAPACITY
    && slotRows === BigInt(GREATER_REALM_CASTLE_CAPACITY)
    && activeSlotRows === slotRows
    && release?.expectedResourceNodeCount === RESOURCE_NODE_CAPACITY
    && resourceNodeRows === BigInt(RESOURCE_NODE_CAPACITY)
    && activeResourceNodeRows === resourceNodeRows
    && claimRows === castleRows
    && activeClaimRows === castleRows
    && plannedClaimRows === 0n
    && unknownClaimStateRows === 0n
    && relocatedClaimRows === BigInt(activation?.snapshotCastleCount ?? 0)
    && foundedClaimRows === BigInt(activation?.postCanaryFoundingCount ?? 0)
    && unknownClaimKindRows === 0n
    && regionFounderTotal === currentFounderCount
    && unassignedRegionFounderCount === 0
    && ctx.db.greaterRealmCellOccupancyV1.count() === castleRows
    && ctx.db.castleSlotClaimV1.count() === 0n
    && legacyOccupiedWorldTileRows === 0n;
  const activeAdmissionEligible = currentWorldGraphExact
    && activationMode === 'active'
    && releaseState === 'active'
    && atlasMode === 'active'
    && workerSystemV2Mode === 'active'
    && founderCapacityRemaining > 0;

  return Object.freeze({
    importMutationsCompiled: GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
    activationMutationsCompiled: GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,

    releaseRows,
    releasePresent: release !== undefined,
    atlasId: release === undefined
      ? undefined
      : safeProjectionString(release.atlasId, 128, OPAQUE_PUBLIC_ID_PATTERN),
    publicReleaseId: release === undefined
      ? undefined
      : safeProjectionString(release.publicReleaseId, 128, OPAQUE_PUBLIC_ID_PATTERN),
    sourceCommit: release === undefined
      ? undefined
      : safeProjectionString(release.sourceCommit, 40, SOURCE_COMMIT_PATTERN),
    importEpoch: release?.importEpoch,
    releaseState,
    verificationPhase,
    verificationCursor: release?.verificationCursor ?? 0n,
    expectedReleaseSha256: release === undefined
      ? undefined
      : safeProjectionString(release.expectedReleaseSha256, 64, SHA256_PATTERN),
    releaseHeaderSha256: release === undefined
      ? undefined
      : safeProjectionString(release.releaseHeaderSha256, 64, SHA256_PATTERN),
    verificationDigest: release === undefined
      ? undefined
      : safeProjectionString(release.verificationDigest, 256),
    expectedRegionCount: release?.expectedRegionCount ?? 0,
    expectedComponentCount: release?.expectedComponentCount ?? 0,
    expectedChunkCount: release?.expectedChunkCount ?? 0,
    expectedCellCount: release?.expectedCellCount ?? 0,
    expectedSlotCount: release?.expectedSlotCount ?? 0,
    expectedResourceNodeCount: release?.expectedResourceNodeCount ?? 0,
    componentExpectedCellCount: release?.componentExpectedCellCount ?? 0,
    componentExpectedSlotCount: release?.componentExpectedSlotCount ?? 0,
    componentExpectedResourceNodeCount: release?.componentExpectedResourceNodeCount ?? 0,
    importedPassableCellCount: release?.importedPassableCellCount ?? 0,
    verifiedComponentCount: release?.verifiedComponentCount ?? 0,
    verifiedChunkCount: release?.verifiedChunkCount ?? 0,
    verifiedCellCount: release?.verifiedCellCount ?? 0,
    verifiedSlotCount: release?.verifiedSlotCount ?? 0,
    verifiedResourceNodeCount: release?.verifiedResourceNodeCount ?? 0,
    regionManifestRows: importStatus.regionManifestRows,
    componentRows: ctx.db.greaterRealmNavigationComponentV1.count(),
    chunkRows: ctx.db.greaterRealmChunkV1.count(),
    cellRows: ctx.db.greaterRealmCellV1.count(),
    slotRows,
    activeSlotRows,
    resourceNodeRows,
    activeResourceNodeRows,
    releaseImportsExact: importStatus.importsExact,
    releaseVerificationExact,
    releaseReady: releaseState === 'ready',

    activationRows,
    activationPresent: activation !== undefined,
    activationMode,
    everActive: activationCheckpoint?.everActive ?? false,
    topologySnapshotDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.topologySnapshotDigest, 64, SHA256_PATTERN),
    relocationPlanDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.relocationPlanDigest, 64, SHA256_PATTERN),
    snapshotCastleDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.snapshotCastleDigest, 64, SHA256_PATTERN),
    snapshotWorkerDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.snapshotWorkerDigest, 64, SHA256_PATTERN),
    snapshotResourceDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.snapshotResourceDigest, 64, SHA256_PATTERN),
    snapshotMarksDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.snapshotMarksDigest, 64, SHA256_PATTERN),
    snapshotInnerKeepDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.snapshotInnerKeepDigest, 64, SHA256_PATTERN),
    snapshotScheduleDigest: activation === undefined
      ? undefined
      : safeProjectionString(activation.snapshotScheduleDigest, 64, SHA256_PATTERN),
    snapshotCastleCount: activation?.snapshotCastleCount ?? 0,
    snapshotWorkerCount: activation?.snapshotWorkerCount ?? 0,
    snapshotResourceAccountCount: activation?.snapshotResourceAccountCount ?? 0,
    snapshotMarkAccountCount: activation?.snapshotMarkAccountCount ?? 0,
    snapshotInnerKeepBuildingCount: activation?.snapshotInnerKeepBuildingCount ?? 0,
    snapshotClaimCount: activation?.snapshotClaimCount ?? 0,
    snapshotOccupancyCount: activation?.snapshotOccupancyCount ?? 0,
    nextAllocationSequence: activation?.nextAllocationSequence ?? 0n,
    postCanaryFoundingCount: activation?.postCanaryFoundingCount ?? 0,
    postCanaryDispatchCount: activation?.postCanaryDispatchCount ?? 0,
    rollbackEligible: rollbackEligible(activation),
    resumeEligible: activationCheckpoint?.phase === 'halted'
      && activationCheckpoint.everActive,
    legacyFoundingOpen: greaterRealmLegacyFoundingIsOpenV1(ctx),
    legacyJourneyDispatchOpen: greaterRealmLegacyJourneyDispatchIsOpenV1(ctx),

    castleCapacity: GREATER_REALM_CASTLE_CAPACITY,
    currentFounderCount,
    founderCapacityRemaining,
    castleRows,
    greaterRealmClaimRows: claimRows,
    greaterRealmOccupancyRows: ctx.db.greaterRealmCellOccupancyV1.count(),
    plannedClaimRows,
    activeClaimRows,
    unknownClaimStateRows,
    relocatedClaimRows,
    foundedClaimRows,
    unknownClaimKindRows,
    legacyClaimRows: ctx.db.castleSlotClaimV1.count(),
    legacyOccupiedWorldTileRows,
    lowlandsFounderCount: regionFounderCounts.get('T1_LOWLANDS') ?? 0,
    frostmereFounderCount: regionFounderCounts.get('T1_FROSTMERE') ?? 0,
    sunscarFounderCount: regionFounderCounts.get('T1_SUNSCAR') ?? 0,
    mirefenFounderCount: regionFounderCounts.get('T1_MIREFEN') ?? 0,
    stonewakeFounderCount: regionFounderCounts.get('T1_STONEWAKE') ?? 0,
    emberwoodFounderCount: regionFounderCounts.get('T1_EMBERWOOD') ?? 0,
    unassignedRegionFounderCount,
    profileRows: ctx.db.realmProfileV1.count(),
    markAccountRows: ctx.db.markAccountV1.count(),
    resourceAccountRows: ctx.db.resourceAccountV1.count(),
    allowedFidRows: ctx.db.allowedFid.count(),
    enabledAllowedFidRows,
    castleWorkerRows: ctx.db.castleWorkerV1.count(),
    idleCastleWorkerRows,
    nonIdleCastleWorkerRows,
    auditRows: ctx.db.adminAudit.count(),

    legacyRealmRows,
    legacyRealmActive: legacyRealm?.active ?? false,
    atlasRows,
    atlasMode,
    atlasRevision: atlas?.revision,
    atlasCastleCapacity: atlas?.castleCapacity ?? 0,
    atlasVisibleRegionCount: atlas?.visibleRegionCount ?? 0,
    atlasVisibleCellCount: atlas?.visibleCellCount ?? 0,
    atlasVisibleChunkCount: atlas?.visibleChunkCount ?? 0,
    visibleRegionRows,
    activeVisibleRegionRows,
    workerSystemV2Rows,
    workerSystemV2Mode,
    workerSystemV2RosterDigest: workerSystemV2 === undefined
      ? undefined
      : safeProjectionString(workerSystemV2.rosterDigest, 16, ROSTER_DIGEST_PATTERN),
    workerSystemV2CurrentCastleCount: workerSystemV2?.currentCastleCount ?? 0,
    workerSystemV2CurrentWorkerCount: workerSystemV2?.currentWorkerCount ?? 0,
    workerSystemV1Rows,
    workerSystemV1Mode,
    workerSystemV1RosterDigest: workerSystemV1 === undefined
      ? undefined
      : safeProjectionString(workerSystemV1.rosterDigest, 16, ROSTER_DIGEST_PATTERN),
    workerSystemV1ExpectedCastleCount: workerSystemV1?.expectedCastleCount ?? 0,
    workerSystemV1ExpectedWorkerCount: workerSystemV1?.expectedWorkerCount ?? 0,
    workerSystemV1LegacyDrainRequired: workerSystemV1?.legacyDrainRequired ?? false,

    goldNodeOccupationRows: journey.gold_node_occupation_v1,
    goldExpeditionRows: journey.gold_expedition_v1,
    goldExpeditionScheduleRows: journey.gold_expedition_schedule_v_1,
    foodNodeOccupationRows: journey.food_node_occupation_v1,
    foodExpeditionRows: journey.food_expedition_v1,
    foodExpeditionScheduleRows: journey.food_expedition_schedule_v_1,
    woodNodeOccupationRows: journey.wood_node_occupation_v1,
    woodExpeditionRows: journey.wood_expedition_v1,
    woodExpeditionScheduleRows: journey.wood_expedition_schedule_v_1,
    stoneNodeOccupationRows: journey.stone_node_occupation_v1,
    stoneExpeditionRows: journey.stone_expedition_v1,
    stoneExpeditionScheduleRows: journey.stone_expedition_schedule_v_1,
    workerAssignmentRows: journey.worker_assignment_v1,
    workerNodeOccupationRows: journey.worker_node_occupation_v1,
    workerAssignmentScheduleRows: journey.worker_assignment_schedule_v_1,

    currentWorldGraphApplicable,
    currentWorldGraphExact,
    currentWorldIntegrityViolationCount:
      currentWorldGraphApplicable && !currentWorldGraphExact ? 1 : 0,
    activeAdmissionEligible,
  });
}

/**
 * Identity-free proof for one existing v17 founder re-enable decision. The
 * input FID is admin-private and is never echoed; output contains only the
 * exact CAS tuple plus booleans. Target graph health deliberately does not
 * depend on the AllowedFid enabled bit.
 */
export function projectGreaterRealmReenableStatusV1(
  ctx: WarpkeepReducerContext,
  fid: bigint,
) {
  const cutover = projectGreaterRealmCutoverStatusV1(ctx);
  const allowed = ctx.db.allowedFid.fid.find(fid);
  const request = ctx.db.accessRequestV1.fid.find(fid);
  const targetAuthEpoch = allowed?.authEpoch;
  const requestedAtMicros = request?.requestedAt.microsSinceUnixEpoch;
  const targetRequestedAtMicros = requestedAtMicros !== undefined
    && requestedAtMicros >= 0n
    && requestedAtMicros <= U64_MAXIMUM
    ? requestedAtMicros
    : undefined;

  let targetFounderGraphExact = false;
  if (cutover.currentWorldGraphExact) {
    try {
      const founder = assertGreaterRealmCurrentFounderForFidV1(ctx, fid);
      const resources = assertGenesisResourceForFid(ctx, fid);
      if (
        founder.source !== 'v17'
        || resources.founderSource !== 'v17'
        || resources.castle.castleId !== founder.castle.castleId
      ) fail();
      assertCastleWorkerRoster(ctx, founder.castle.castleId);
      targetFounderGraphExact = true;
    } catch {
      targetFounderGraphExact = false;
    }
  }

  const targetAllowedEnabled = allowed?.enabled ?? false;
  const validReenableEpoch = targetAuthEpoch !== undefined
    && Number.isInteger(targetAuthEpoch)
    && targetAuthEpoch >= 1
    && targetAuthEpoch < MAX_AUTH_EPOCH;
  const exactPendingRequest = request !== null
    && validReenableEpoch
    && request.requestCycle === BigInt(targetAuthEpoch) + 1n
    && targetRequestedAtMicros !== undefined
    && targetRequestedAtMicros > 0n;
  const activeCurrentWorld = cutover.currentWorldGraphExact
    && cutover.releaseState === 'active'
    && cutover.activationMode === 'active'
    && cutover.atlasMode === 'active'
    && cutover.workerSystemV2Mode === 'active';

  return Object.freeze({
    currentWorldGraphApplicable: cutover.currentWorldGraphApplicable,
    targetFounderGraphExact,
    targetAllowedEnabled,
    targetAuthEpoch,
    targetRequestCycle: request?.requestCycle,
    targetRequestedAtMicros,
    targetReenableEligible: activeCurrentWorld
      && targetFounderGraphExact
      && allowed !== null
      && allowed.fid === fid
      && !targetAllowedEnabled
      && exactPendingRequest,
  });
}

export function greaterRealmCutoverStatusErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmCutoverStatusError ? error.message : undefined;
}
