import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGreaterRealmCurrentFounderForFidV1 } from '../src/greaterRealmCurrentAuthority';
import {
  greaterRealmLegacyFoundingIsOpenV1,
  greaterRealmLegacyJourneyDispatchIsOpenV1,
} from '../src/greaterRealmActivationState';
import { captureGreaterRealmJourneyRowsDigestV1, captureGreaterRealmPreparedSnapshotV1, greaterRealmJourneyCountsV1, requireGreaterRealmQuietWindowV1 } from '../src/greaterRealmRelocationSnapshot';
import { rosterDigestForCastleIds } from '../src/castleWorkerPolicy';
import { GREATER_REALM_JOURNEY_TABLES, GREATER_REALM_TIER_ONE_REGION_IDS } from '../src/greaterRealmActivationPolicy';
import { CREATED, Fixture, NOW, type Row, SHA_A, advanceToPlanned, assertGenesisFounderForProfileRepair, beginGreaterRealmDrainAuthorizedTransactionV1, clearFirstWorkerJourney, clone, ensureGenesisFounder, errorCode, freezeGreaterRealmActivationAuthorizedTransactionV1, insertIntendedAdmission, makeFirstWorkerOutbound, planGreaterRealmRelocationAuthorizedTransactionV1, prepareGreaterRealmActivationAuthorizedTransactionV1, relocateGreaterRealmCanaryAuthorizedTransactionV1, rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('prepare is bounded and preliminary; begin-drain closes ingress and freeze rebinds quiet authority', () => {
  const fixture = new Fixture();
  makeFirstWorkerOutbound(fixture);
  const snapshot = captureGreaterRealmPreparedSnapshotV1(fixture.ctx);
  assert.equal(snapshot.castleCount, 100);
  assert.equal(snapshot.workerCount, 400);
  assert.equal(snapshot.resourceAccountCount, 100);
  assert.equal(snapshot.markAccountCount, 100);
  assert.equal(snapshot.claimCount, 0);
  assert.equal(snapshot.occupancyCount, 0);
  assert.equal(snapshot.journeyCounts.worker_assignment_v1, 1n);
  assert.equal(snapshot.journeyCounts.worker_node_occupation_v1, 1n);
  assert.equal(snapshot.journeyCounts.worker_assignment_schedule_v_1, 1n);
  assert.equal(new Set([
    snapshot.castleDigest,
    snapshot.workerDigest,
    snapshot.resourceDigest,
    snapshot.marksDigest,
    snapshot.innerKeepDigest,
    snapshot.scheduleDigest,
    snapshot.topologyDigest,
  ]).size, 7);
  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'prepared');
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), true);
  assert.equal(greaterRealmLegacyFoundingIsOpenV1(fixture.ctx), true);
  fixture.tables.resourceAccountV1.rows[0]!.food += 1n;
  fixture.tables.resourceAccountV1.rows[0]!.revision += 1n;
  fixture.tables.realmChatMessageV1.rows[0]!.body = 'legitimate-pre-drain-chat';
  const beforeRetry = stateText(fixture);
  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'unchanged');
  assert.equal(stateText(fixture), beforeRetry);
  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), false);
  assert.equal(greaterRealmLegacyFoundingIsOpenV1(fixture.ctx), false);
  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(
    errorCode(() => freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)),
    'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY',
  );
  clearFirstWorkerJourney(fixture);
  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'frozen');
  fixture.tables.workerCommandIdempotencyV1.rows.push({
    requestKey: '1001:recall-after-freeze',
    fid: 1_001n,
    commandKind: 'recall',
    workerId: 'castle-1:worker-1',
    resultRevision: 0n,
    createdAt: NOW,
  });
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx), 'planned');

  const unusedStaticDrift = new Fixture();
  unusedStaticDrift.tables.worldTileMetaV1.rows.at(-1)!.terrainKind = 'drifted';
  assert.equal(
    errorCode(() => captureGreaterRealmPreparedSnapshotV1(unusedStaticDrift.ctx)),
    'GREATER_REALM_LEGACY_FOUNDER_TOPOLOGY_INVALID',
  );
});

test('founding and dispatch may land after prepare; freeze binds the post-drain founder graph', () => {
  const fixture = new Fixture();
  const fid = 1_100n;
  const castleId = 100n;
  const removed = new Map<string, Row[]>();
  for (const [tableName, field, value] of [
    ['allowedFid', 'fid', fid],
    ['castle', 'castleId', castleId],
    ['castleSlotClaimV1', 'castleId', castleId],
    ['realmProfileV1', 'fid', fid],
    ['markAccountV1', 'fid', fid],
    ['resourceAccountV1', 'fid', fid],
    ['castleWorkerV1', 'originCastleId', castleId],
  ] as const) {
    const table = fixture.tables[tableName]!;
    const rows = table.rows.filter(row => row[field] === value);
    removed.set(tableName, clone(rows));
    table.rows = table.rows.filter(row => row[field] !== value);
  }
  const oldTile = fixture.tables.worldTile.rows.find(row => row.occupantCastleId === castleId)!;
  oldTile.occupantCastleId = undefined;
  const system = fixture.tables.realmWorkerSystemV1.rows[0]!;
  system.expectedCastleCount = 99;
  system.expectedWorkerCount = 396;
  system.rosterDigest = rosterDigestForCastleIds(
    fixture.tables.castle.rows.map(row => row.castleId),
  );

  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'prepared');
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.snapshotCastleCount, 99);

  for (const [tableName, rows] of removed) fixture.tables[tableName]!.rows.push(...clone(rows));
  oldTile.occupantCastleId = castleId;
  system.expectedCastleCount = 100;
  system.expectedWorkerCount = 400;
  system.rosterDigest = rosterDigestForCastleIds(
    fixture.tables.castle.rows.map(row => row.castleId),
  );
  makeFirstWorkerOutbound(fixture);

  assert.equal(prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'), 'unchanged');
  assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
  assert.equal(
    errorCode(() => freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)),
    'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY',
  );
  clearFirstWorkerJourney(fixture);
  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'frozen');
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.snapshotCastleCount, 100);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.snapshotWorkerCount, 400);
});

test('the server reads exactly the audited 15-table zero gate and rejects each nonzero table', () => {
  const fixture = new Fixture();
  assert.deepEqual(Object.keys(greaterRealmJourneyCountsV1(fixture.ctx)), GREATER_REALM_JOURNEY_TABLES);
  const physical: Record<string, string> = {
    gold_node_occupation_v1: 'goldNodeOccupationV1',
    gold_expedition_v1: 'goldExpeditionV1',
    gold_expedition_schedule_v_1: 'goldExpeditionScheduleV1',
    food_node_occupation_v1: 'foodNodeOccupationV1',
    food_expedition_v1: 'foodExpeditionV1',
    food_expedition_schedule_v_1: 'foodExpeditionScheduleV1',
    wood_node_occupation_v1: 'woodNodeOccupationV1',
    wood_expedition_v1: 'woodExpeditionV1',
    wood_expedition_schedule_v_1: 'woodExpeditionScheduleV1',
    stone_node_occupation_v1: 'stoneNodeOccupationV1',
    stone_expedition_v1: 'stoneExpeditionV1',
    stone_expedition_schedule_v_1: 'stoneExpeditionScheduleV1',
    worker_assignment_v1: 'workerAssignmentV1',
    worker_node_occupation_v1: 'workerNodeOccupationV1',
    worker_assignment_schedule_v_1: 'workerAssignmentScheduleV1',
  };
  for (const name of GREATER_REALM_JOURNEY_TABLES) {
    const table = fixture.tables[physical[name]!]!;
    table.rows.push({ [table.primary]: `busy-${name}` });
    assert.equal(errorCode(() => requireGreaterRealmQuietWindowV1(fixture.ctx)), 'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY', name);
    table.rows.length = 0;
  }
});

test('missing, extra, or malformed nonidle workers close the snapshot boundary', () => {
  for (const change of ['missing', 'extra', 'nonidle'] as const) {
    const fixture = new Fixture();
    if (change === 'missing') fixture.tables.castleWorkerV1.rows.pop();
    if (change === 'extra') fixture.tables.castleWorkerV1.rows.push({
      ...fixture.tables.castleWorkerV1.rows[0], workerId: 'castle-1:worker-5', ordinal: 5,
    });
    if (change === 'nonidle') fixture.tables.castleWorkerV1.rows[0]!.status = 'outbound';
    assert.match(
      errorCode(() => captureGreaterRealmPreparedSnapshotV1(fixture.ctx)) ?? '',
      /GREATER_REALM_WORKER_/,
      change,
    );
  }
});

test('prepared and draining rollback preserve live v16 journeys, accept nonidle workers, and reopen ingress', () => {
  for (const phase of ['prepared', 'draining'] as const) {
    const fixture = new Fixture();
    const active = makeFirstWorkerOutbound(fixture);
    if (phase === 'prepared') {
      const beforeRows = captureGreaterRealmJourneyRowsDigestV1(fixture.ctx);
      fixture.tables.workerAssignmentV1.rows[0]!.updatedAt = NOW;
      const afterRows = captureGreaterRealmJourneyRowsDigestV1(fixture.ctx);
      assert.notEqual(afterRows, beforeRows);
      fixture.tables.workerAssignmentV1.rows[0]!.updatedAt = CREATED;
    }
    assert.equal(
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
      'prepared',
    );
    if (phase === 'draining') {
      assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
      assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), false);
    }
    assert.equal(
      fixture.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx)),
      'rolled-back',
    );
    assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), true);
    assert.equal(greaterRealmLegacyFoundingIsOpenV1(fixture.ctx), true);
    assert.deepEqual(fixture.tables.castleWorkerV1.rows[0], active.worker);
    assert.deepEqual(fixture.tables.workerAssignmentV1.rows, [active.assignment]);
    assert.deepEqual(fixture.tables.workerNodeOccupationV1.rows, [active.occupation]);
    assert.deepEqual(fixture.tables.workerAssignmentScheduleV1.rows, [active.schedule]);
    const beforeRetry = stateText(fixture);
    assert.equal(rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx), 'unchanged');
    assert.equal(stateText(fixture), beforeRetry);
  }
});

test('closed-phase founding replay is byte-identical while repair and fresh founding stay rejected', () => {
  const readyFixture = (): Fixture => {
    const fixture = new Fixture();
    fixture.tables.innerKeepLayoutV1.rows = [];
    fixture.tables.castleInnerBuilderV1.rows = [];
    fixture.tables.realmProfileV1.rows[0]!.pfpUrl = 'https://example.com/founder.png';
    assert.equal(
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
      'prepared',
    );
    assert.equal(beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx), 'draining');
    return fixture;
  };
  const admission = {
    canonicalUsername: 'founder1',
    displayName: 'Founder 1',
    pfpUrl: 'https://example.com/founder.png',
    publicBio: undefined,
  };

  const replay = readyFixture();
  const replayBefore = stateText(replay);
  assert.equal(ensureGenesisFounder(replay.ctx, 1_001n, admission), 'preserved');
  assert.equal(stateText(replay), replayBefore);

  const repair = readyFixture();
  repair.tables.castleWorkerV1.rows.shift();
  const repairBefore = stateText(repair);
  assert.match(errorCode(() => ensureGenesisFounder(repair.ctx, 1_001n, admission)) ?? '', /WORKER_/);
  assert.equal(stateText(repair), repairBefore);

  const fresh = readyFixture();
  const freshBefore = stateText(fresh);
  assert.equal(
    errorCode(() => ensureGenesisFounder(fresh.ctx, 9_999n, {
      ...admission,
      canonicalUsername: 'new-founder',
    })),
    'GREATER_REALM_FOUNDING_REQUIRES_V17_AUTHORITY',
  );
  assert.equal(stateText(fresh), freshBefore);

  const postCanary = readyFixture();
  assert.equal(freezeGreaterRealmActivationAuthorizedTransactionV1(postCanary.ctx), 'frozen');
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(postCanary.ctx), 'planned');
  assert.equal(
    postCanary.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(postCanary.ctx)),
    'canary',
  );
  const postCanaryBefore = stateText(postCanary);
  assert.equal(ensureGenesisFounder(postCanary.ctx, 1_001n, admission), 'preserved');
  assert.equal(stateText(postCanary), postCanaryBefore);
  assert.equal(errorCode(() => postCanary.transaction(() => {
    insertIntendedAdmission(postCanary, 9_998n);
    ensureGenesisFounder(postCanary.ctx, 9_998n, {
      ...admission,
      canonicalUsername: 'canary-founder',
    });
  })), 'GREATER_REALM_CURRENT_WORLD_UNAVAILABLE');
  assert.equal(stateText(postCanary), postCanaryBefore);

  const staleProfile = postCanary.tables.realmProfileV1.fid.find(1_001n)!;
  staleProfile.marksBalanceMicros = 5n;
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(postCanary.ctx, 1_001n)),
    'STATE_INTEGRITY',
  );
  assert.doesNotThrow(() => assertGenesisFounderForProfileRepair(postCanary.ctx, 1_001n));
  staleProfile.marksBalanceMicros = undefined;
  assert.equal(
    assertGreaterRealmCurrentFounderForFidV1(postCanary.ctx, 1_001n).source,
    'v17',
  );
});

test('100 existing castles receive a frozen balanced 17/16 Tier-I multiset with complete preimages', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const activation = fixture.tables.greaterRealmActivationV1.rows[0]!;
  const claims = [...fixture.tables.greaterRealmCastleClaimV1.rows]
    .sort((a, b) => Number(a.allocationSequence - b.allocationSequence));
  assert.equal(claims.length, 100);
  assert.equal(activation.snapshotClaimCount, 100);
  assert.equal(activation.nextAllocationSequence, 100n);
  assert.match(activation.topologySnapshotDigest, /^[0-9a-f]{64}$/);
  assert.match(activation.relocationPlanDigest, /^[0-9a-f]{64}$/);
  const counts = Object.fromEntries(GREATER_REALM_TIER_ONE_REGION_IDS.map(id => [id, 0]));
  for (const claim of claims) {
    const slot = fixture.tables.greaterRealmCastleSlotV1.slotId.find(claim.slotId)!;
    counts[slot.regionId] += 1;
    for (const field of [
      'legacySlotId', 'legacyClaimedAt', 'legacyGenerationVersion',
      'legacyTileKey', 'legacyQ', 'legacyR',
    ]) assert.notEqual(claim[field], undefined, `${claim.slotId}:${field}`);
  }
  assert.deepEqual(Object.values(counts).sort((a, b) => a - b), [16, 16, 17, 17, 17, 17]);
  const beforeRetry = stateText(fixture);
  assert.equal(planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(stateText(fixture), beforeRetry);
});

test('v17 topology and frozen founder/worker identity drift reject canary before writes', () => {
  const topology = new Fixture();
  advanceToPlanned(topology);
  topology.tables.greaterRealmCellV1.rows[0]!.atlasQ += 1;
  const topologyBefore = stateText(topology);
  assert.match(
    errorCode(() => topology.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(topology.ctx))) ?? '',
    /GREATER_REALM_(?:TOPOLOGY|ALLOCATION|SLOT)/,
  );
  assert.equal(stateText(topology), topologyBefore);

  const finalizedReceipt = new Fixture();
  advanceToPlanned(finalizedReceipt);
  finalizedReceipt.tables.greaterRealmReleaseV1.rows[0]!.verificationDigest = SHA_A;
  const finalizedReceiptBefore = stateText(finalizedReceipt);
  assert.equal(
    errorCode(() => finalizedReceipt.transaction(
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(finalizedReceipt.ctx),
    )),
    'GREATER_REALM_TOPOLOGY_SNAPSHOT_CHANGED',
  );
  assert.equal(stateText(finalizedReceipt), finalizedReceiptBefore);

  const unverifiedComponent = new Fixture();
  advanceToPlanned(unverifiedComponent);
  unverifiedComponent.tables.greaterRealmNavigationComponentV1.rows[0]!.active = false;
  const unverifiedComponentBefore = stateText(unverifiedComponent);
  assert.equal(
    errorCode(() => unverifiedComponent.transaction(
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(unverifiedComponent.ctx),
    )),
    'GREATER_REALM_COMPONENT_ACTIVATION_INVALID',
  );
  assert.equal(stateText(unverifiedComponent), unverifiedComponentBefore);

  const planDrift = new Fixture();
  advanceToPlanned(planDrift);
  planDrift.tables.greaterRealmCastleClaimV1.rows[0]!.plannedAt = timestamp(10_001n);
  const planDriftBefore = stateText(planDrift);
  assert.equal(
    errorCode(() => planDrift.transaction(
      () => relocateGreaterRealmCanaryAuthorizedTransactionV1(planDrift.ctx),
    )),
    'GREATER_REALM_ROLLBACK_PREIMAGE_INCOMPLETE',
  );
  assert.equal(stateText(planDrift), planDriftBefore);

  for (const [table, mutate] of [
    ['castleWorkerV1', (row: Row) => { row.revision += 1n; }],
    ['realmV1', (row: Row) => { row.publicName = 'Drifted'; }],
    ['worldTileMetaV1', (row: Row) => { row.terrainKind = 'drifted'; }],
  ] as const) {
    const fixture = new Fixture();
    advanceToPlanned(fixture);
    mutate(fixture.tables[table]!.rows[0]!);
    const before = stateText(fixture);
    assert.equal(
      errorCode(() => fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx))),
      'GREATER_REALM_CUTOVER_SNAPSHOT_STALE',
      table,
    );
    assert.equal(stateText(fixture), before);
  }
});

test('every pre-canary exact retry rejects hostile roots, release state, and active targets', () => {
  for (const phase of ['prepared', 'draining', 'frozen', 'planned'] as const) {
    const fixture = new Fixture();
    assert.equal(
      prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture'),
      'prepared',
    );
    if (phase !== 'prepared') beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx);
    if (phase === 'frozen' || phase === 'planned') {
      freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx);
    }
    if (phase === 'planned') planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx);
    const retry = () => phase === 'prepared'
      ? prepareGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx, 'admin:fixture')
      : phase === 'draining'
        ? beginGreaterRealmDrainAuthorizedTransactionV1(fixture.ctx)
        : phase === 'frozen'
          ? freezeGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx)
          : planGreaterRealmRelocationAuthorizedTransactionV1(fixture.ctx);
    const valid = fixture.snapshot();
    for (const [name, mutate] of [
      ['unexpected root', () => fixture.tables.realmAtlasV1.rows.push({ atlasId: 'forged' })],
      ['release state', () => { fixture.tables.greaterRealmReleaseV1.rows[0]!.state = 'canary'; }],
      ['active target slot', () => { fixture.tables.greaterRealmCastleSlotV1.rows[0]!.active = true; }],
    ] as const) {
      fixture.restore(valid);
      mutate();
      assert.notEqual(errorCode(retry), undefined, `${phase}:${name}`);
    }
    fixture.restore(valid);
    if (phase === 'planned') {
      fixture.tables.greaterRealmCellOccupancyV1.rows.push({ cellKey: 'forged' });
      assert.equal(
        errorCode(retry),
        'GREATER_REALM_OCCUPANCY_TARGET_NOT_EMPTY',
      );
    }
  }
});
