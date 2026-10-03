import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertGreaterRealmCurrentFounderForFidV1,
  greaterRealmCurrentPassiveTerrainV1,
} from '../src/greaterRealmCurrentAuthority';
import {
  GREATER_REALM_FOUNDED_PASSIVE_YIELD_POLICY_VERSION,
} from '../src/greaterRealmFoundingPolicy';
import { workerResourcePolicy } from '../src/castleWorkerPolicy';
import { INNER_KEEP_POLICY_VERSION } from '../src/innerKeepPolicy';
import { Fixture, addOnePostCommitFounder, admissionProfileFor, advanceToActive, advanceToPlanned, assertGenesisFounderForProfileRepair, commitGreaterRealmActiveAuthorizedTransactionV1, dispatchGreaterRealmCastleWorkerV2, enableCanonicalInnerKeep, ensureGenesisFounder, errorCode, greaterRealmDispatchInput, haltGreaterRealmActivationAuthorizedTransactionV1, insertIntendedAdmission, inspectCastleWorkerGraph, inspectCastleWorkerGraphForCurrentGameplayV1, prepareGreaterRealmWorkerLocation, projectMyGreaterRealmWorkerStateV2, projectMyWorkerStateForCurrentGameplayV1, recallCastleWorker, relocateGreaterRealmCanaryAuthorizedTransactionV1, runCastleWorkerSchedule, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('post-commit founded suffix stays balanced, exact, and live across retry and halt', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  const founded = addOnePostCommitFounder(fixture);
  assert.equal(
    assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, founded.fid).source,
    'v17',
  );
  const valid = fixture.snapshot();
  const hostile: readonly [string, () => void][] = [
    ['forged owner', () => {
      fixture.tables.greaterRealmCastleClaimV1.ownerFid.find(founded.fid)!.ownerFid = 9_999n;
    }],
    ['skipped balanced rank', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      claim.slotId = fixture.tables.greaterRealmCastleSlotV1.rows.find(slot => (
        !fixture.tables.greaterRealmCastleClaimV1.rows.some(row => row.slotId === slot.slotId)
      ))!.slotId;
    }],
    ['inactive founded slot', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      fixture.tables.greaterRealmCastleSlotV1.slotId.find(claim.slotId)!.active = false;
    }],
    ['duplicate occupancy owner', () => {
      fixture.tables.greaterRealmCellOccupancyV1.castleId.find(founded.castleId)!.castleId = 1n;
    }],
    ['precommit founded timestamp', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      claim.plannedAt = timestamp(9_999n);
      claim.activatedAt = timestamp(9_999n);
    }],
    ['split founding transaction timestamp', () => {
      const claim = fixture.tables.greaterRealmCastleClaimV1.castleId.find(founded.castleId)!;
      claim.plannedAt = timestamp(19_999n);
    }],
    ['missing fourth worker', () => {
      fixture.tables.castleWorkerV1.rows = fixture.tables.castleWorkerV1.rows.filter(row => (
        !(row.originCastleId === founded.castleId && row.ordinal === 4)
      ));
    }],
    ['foreign worker origin', () => {
      fixture.tables.castleWorkerV1.rows.find(row => (
        row.originCastleId === founded.castleId
      ))!.originCastleId = 1n;
    }],
    ['duplicate worker ordinal', () => {
      fixture.tables.castleWorkerV1.rows.find(row => (
        row.originCastleId === founded.castleId && row.ordinal === 2
      ))!.ordinal = 1;
    }],
  ];
  for (const [name, mutate] of hostile) {
    fixture.restore(valid);
    mutate();
    assert.equal(
      errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
      'STATE_INTEGRITY',
      name,
    );
  }
  fixture.restore(valid);
  fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryFoundingCount += 1;
  assert.match(
    errorCode(() => commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx)) ?? '',
    /GREATER_REALM_(?:CLAIM|PUBLIC_ROOT)/,
  );
  fixture.restore(valid);
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  assert.equal(
    assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, founded.fid).source,
    'v17',
  );
});

test('active v17 founding commits one graph and keeps the exact 101-castle Worker lifecycle live', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(30_000n);
  const fid = 8_001n;
  const admission = admissionProfileFor(fid);
  assert.equal(fixture.transaction(() => {
    insertIntendedAdmission(fixture, fid);
    return ensureGenesisFounder(fixture.ctx, fid, admission);
  }), 'created');

  const founder = assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid);
  assert.equal(founder.source, 'v17');
  assert.equal(founder.greaterRealmClaim?.claimKind, 'founded');
  assert.equal(founder.greaterRealmClaim?.allocationSequence, 100n);
  const cell = fixture.tables.greaterRealmCellV1.cellKey.find(founder.castle.tileKey)!;
  assert.equal(
    greaterRealmCurrentPassiveTerrainV1(fixture.ctx, founder),
    cell.yieldClass === 2 ? 'meadow' : 'lowland',
  );
  assert.equal(GREATER_REALM_FOUNDED_PASSIVE_YIELD_POLICY_VERSION, 'greater-realm-founded-passive-yield-v1');
  assert.equal(fixture.tables.castleWorkerV1.byOriginCastle.filter(founder.castle.castleId).length, 4);
  assert.equal(
    fixture.tables.castleInnerBuilderV1.fid.find(fid)?.policyVersion,
    INNER_KEEP_POLICY_VERSION,
  );
  const activation = fixture.tables.greaterRealmActivationV1.rows[0]!;
  assert.equal(activation.mode, 'active');
  assert.equal(activation.postCanaryFoundingCount, 1);
  assert.equal(activation.nextAllocationSequence, 101n);
  const workerV1 = fixture.tables.realmWorkerSystemV1.rows[0]!;
  const workerV2 = fixture.tables.realmWorkerSystemV2.rows[0]!;
  assert.equal(workerV1.expectedCastleCount, 101);
  assert.equal(workerV1.expectedWorkerCount, 404);
  assert.equal(workerV2.currentCastleCount, 101);
  assert.equal(workerV2.currentWorkerCount, 404);
  assert.equal(workerV2.rosterDigest, workerV1.rosterDigest);
  assert.equal(
    inspectCastleWorkerGraph(fixture.ctx).systemConfigValid,
    false,
    'the frozen rollout classifier remains capped at 100',
  );
  const currentWorkerHealth = inspectCastleWorkerGraphForCurrentGameplayV1(fixture.ctx);
  assert.equal(currentWorkerHealth.systemConfigValid, true);
  assert.equal(currentWorkerHealth.expectedCastleCount, 101n);
  assert.equal(currentWorkerHealth.expectedWorkerCount, 404n);
  assert.equal(currentWorkerHealth.rosterDigestMatches, true);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.food, 0n);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.wood, 0n);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.stone, 0n);
  assert.equal(fixture.tables.resourceAccountV1.fid.find(fid)?.gold, 0n);

  const workerControl = projectMyGreaterRealmWorkerStateV2(fixture.ctx, fid);
  assert.equal(workerControl.workers.length, 4);
  assert.ok(workerControl.workers.every(worker => worker.status === 'idle'));
  const sharedGameplayControl = projectMyWorkerStateForCurrentGameplayV1(
    fixture.ctx,
    fid,
  );
  assert.deepEqual(sharedGameplayControl.balances, workerControl.balances);
  assert.equal(sharedGameplayControl.workers.length, 4);
  const workerTarget = prepareGreaterRealmWorkerLocation(fixture, 'food', 1, fid);
  const naturalInput = greaterRealmDispatchInput(
    fixture,
    1,
    'food',
    workerTarget.locationId,
    'greater-worker-101-natural',
    fid,
  );
  fixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(fixture.ctx, naturalInput));
  const arrival = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    naturalInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(arrival.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, arrival));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(naturalInput.workerId)!.status, 'gathering');
  const expiry = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    naturalInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(expiry.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, expiry));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(naturalInput.workerId)!.status, 'returning');
  assert.equal(
    fixture.tables.workerAssignmentV1.workerId.find(naturalInput.workerId)!.materializedAmount,
    workerResourcePolicy('food').gatheringTotal,
  );
  const naturalReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    naturalInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(naturalReturn.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, naturalReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(naturalInput.workerId)!.status, 'idle');

  const recalledInput = greaterRealmDispatchInput(
    fixture,
    2,
    'food',
    workerTarget.locationId,
    'greater-worker-101-recalled',
    fid,
  );
  fixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(fixture.ctx, recalledInput));
  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid,
    castle: recalledInput.castle,
    workerId: recalledInput.workerId,
    idempotencyKey: 'greater-worker-101-recall',
  }));
  const recalledReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    recalledInput.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(recalledReturn.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, recalledReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(recalledInput.workerId)!.status, 'idle');
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 2);

  const replayBefore = stateText(fixture);
  assert.equal(ensureGenesisFounder(fixture.ctx, fid, admission), 'preserved');
  assert.equal(stateText(fixture), replayBefore);
  const staleProfile = fixture.tables.realmProfileV1.fid.find(fid)!;
  staleProfile.marksBalanceMicros = 1n;
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid)),
    'STATE_INTEGRITY',
  );
  assert.doesNotThrow(() => assertGenesisFounderForProfileRepair(fixture.ctx, fid));
});

test('serialized active founders consume distinct contiguous balanced allocations', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(31_000n);
  for (const fid of [8_101n, 8_102n]) {
    assert.equal(fixture.transaction(() => {
      insertIntendedAdmission(fixture, fid);
      return ensureGenesisFounder(fixture.ctx, fid, admissionProfileFor(fid));
    }), 'created');
  }
  const first = fixture.tables.greaterRealmCastleClaimV1.ownerFid.find(8_101n)!;
  const second = fixture.tables.greaterRealmCastleClaimV1.ownerFid.find(8_102n)!;
  assert.equal(first.allocationSequence, 100n);
  assert.equal(second.allocationSequence, 101n);
  assert.notEqual(first.slotId, second.slotId);
  const regionCounts = new Map<string, number>();
  for (const claim of fixture.tables.greaterRealmCastleClaimV1.rows) {
    const slot = fixture.tables.greaterRealmCastleSlotV1.slotId.find(claim.slotId)!;
    regionCounts.set(slot.regionId, (regionCounts.get(slot.regionId) ?? 0) + 1);
  }
  const counts = [...regionCounts.values()];
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('fresh v17 founding rejects partial profile or Marks state and rolls it back exactly', () => {
  for (const preexisting of ['profile', 'marks'] as const) {
    const fixture = new Fixture();
    advanceToActive(fixture);
    enableCanonicalInnerKeep(fixture);
    fixture.ctx.timestamp = timestamp(32_000n);
    const fid = preexisting === 'profile' ? 8_201n : 8_202n;
    if (preexisting === 'profile') {
      fixture.tables.realmProfileV1.insert({
        ...fixture.tables.realmProfileV1.rows[0]!,
        fid,
        canonicalUsername: `partial${fid.toString()}`,
      });
    } else {
      fixture.tables.markAccountV1.insert({
        ...fixture.tables.markAccountV1.rows[0]!,
        fid,
      });
    }
    const before = stateText(fixture);
    assert.equal(errorCode(() => fixture.transaction(() => {
      insertIntendedAdmission(fixture, fid);
      ensureGenesisFounder(fixture.ctx, fid, admissionProfileFor(fid));
    })), 'GREATER_REALM_FOUNDER_NAMESPACE_CONFLICT', preexisting);
    assert.equal(stateText(fixture), before, preexisting);
  }
});

test('active v17 founding rolls every early, middle, and late write back atomically', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(33_000n);
  const fid = 8_301n;
  const before = stateText(fixture);
  for (const faultAt of [2, 5, 9, 13, 15]) {
    assert.equal(
      errorCode(() => fixture.transaction(() => {
        insertIntendedAdmission(fixture, fid);
        ensureGenesisFounder(fixture.ctx, fid, admissionProfileFor(fid));
      }, faultAt)),
      'INJECTED_TRANSACTION_FAULT',
      `fault ${faultAt}`,
    );
    assert.equal(stateText(fixture), before, `fault ${faultAt}`);
  }
});
