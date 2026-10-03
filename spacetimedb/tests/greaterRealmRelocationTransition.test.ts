import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertGreaterRealmCurrentFounderForFidV1,
  greaterRealmCurrentPassiveTerrainV1,
} from '../src/greaterRealmCurrentAuthority';
import { Fixture, NOW, type Row, advanceToPlanned, clone, commitGreaterRealmActiveAuthorizedTransactionV1, errorCode, haltGreaterRealmActivationAuthorizedTransactionV1, relocateGreaterRealmCanaryAuthorizedTransactionV1, resumeGreaterRealmActiveAuthorizedTransactionV1, rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1, stateOutsideRelocationWrites, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('legitimate economy, Marks, profile, daily, Inner Keep, chat, access, and receipt activity may cross phases', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const resource = fixture.tables.resourceAccountV1.rows[0]!;
  resource.food += 1n;
  resource.revision += 1n;
  const marks = fixture.tables.markAccountV1.rows[0]!;
  marks.earnedMicros += 1n;
  marks.balanceMicros += 1n;
  marks.updatedAt = NOW;
  fixture.tables.realmProfileV1.rows[0]!.displayName = 'Legitimate Profile Update';
  fixture.tables.accessRequestV1.rows[0]!.requestCycle += 1n;
  fixture.tables.realmChatMessageV1.rows[0]!.body = 'legitimate chat during planning';
  fixture.tables.dailyMarkScheduleV1.rows[0]!.scheduledAt = {
    tag: 'Time', value: timestamp(3n),
  };
  fixture.tables.castleInnerBuilderV1.rows[0]!.revision += 1n;
  fixture.tables.workerCommandIdempotencyV1.rows.push({
    requestKey: '1001:harmless-recall',
    fid: 1_001n,
    commandKind: 'recall',
    workerId: fixture.tables.castleWorkerV1.rows[0]!.workerId,
    resultRevision: fixture.tables.castleWorkerV1.rows[0]!.revision,
    createdAt: NOW,
  });
  const before = fixture.snapshot();
  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  assert.deepEqual(
    stateOutsideRelocationWrites(fixture.snapshot(), 'canary'),
    stateOutsideRelocationWrites(before, 'canary'),
  );
});

test('append-only unrelated archives are never enumerated by canary or rollback', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const chat = fixture.tables.realmChatMessageV1;
  let archiveIterations = 0;
  chat.count = () => 65_537n;
  chat.iter = () => {
    archiveIterations += 1;
    throw new Error('UNBOUNDED_ARCHIVE_ENUMERATED');
  };
  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  assert.equal(
    fixture.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx)),
    'rolled-back',
  );
  assert.equal(archiveIterations, 0);
});

test('full static row scans occur only at actual activation flips, never phase retries', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  let componentIterations = 0;
  let resourceIterations = 0;
  const componentIter = fixture.tables.greaterRealmNavigationComponentV1.iter.bind(
    fixture.tables.greaterRealmNavigationComponentV1,
  );
  const resourceIter = fixture.tables.greaterRealmResourceNodeV1.iter.bind(
    fixture.tables.greaterRealmResourceNodeV1,
  );
  fixture.tables.greaterRealmNavigationComponentV1.iter = () => {
    componentIterations += 1;
    return componentIter();
  };
  fixture.tables.greaterRealmResourceNodeV1.iter = () => {
    resourceIterations += 1;
    return resourceIter();
  };
  assert.equal(
    fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)),
    'canary',
  );
  assert.equal(componentIterations, 2);
  assert.equal(resourceIterations, 3);
  assert.equal(relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'active');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(componentIterations, 2);
  assert.equal(resourceIterations, 3);

  const rollback = new Fixture();
  advanceToPlanned(rollback);
  rollback.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(rollback.ctx));
  let rollbackComponentIterations = 0;
  let rollbackResourceIterations = 0;
  const rollbackComponentIter = rollback.tables.greaterRealmNavigationComponentV1.iter.bind(
    rollback.tables.greaterRealmNavigationComponentV1,
  );
  const rollbackResourceIter = rollback.tables.greaterRealmResourceNodeV1.iter.bind(
    rollback.tables.greaterRealmResourceNodeV1,
  );
  rollback.tables.greaterRealmNavigationComponentV1.iter = () => {
    rollbackComponentIterations += 1;
    return rollbackComponentIter();
  };
  rollback.tables.greaterRealmResourceNodeV1.iter = () => {
    rollbackResourceIterations += 1;
    return rollbackResourceIter();
  };
  assert.equal(
    rollback.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx)),
    'rolled-back',
  );
  assert.equal(rollbackComponentIterations, 2);
  assert.equal(rollbackResourceIterations, 3);
  assert.equal(rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(rollback.ctx), 'unchanged');
  assert.equal(rollbackComponentIterations, 2);
  assert.equal(rollbackResourceIterations, 3);
});

test('canary relocates atomically, writes exactly eight public roots (1+6+1), and preserves unrelated bytes', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const beforeCastles = new Map(fixture.tables.castle.rows.map(row => [row.castleId, clone(row)]));
  const legacyRealmPreimage = clone(fixture.tables.realmV1.rows[0]!);
  const before = fixture.snapshot();
  assert.equal(fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)), 'canary');
  assert.equal(fixture.tables.realmAtlasV1.count(), 1n);
  assert.equal(fixture.tables.realmAtlasVisibleRegionV1.count(), 6n);
  assert.equal(fixture.tables.realmWorkerSystemV2.count(), 1n);
  assert.equal(fixture.tables.greaterRealmCellOccupancyV1.count(), 100n);
  assert.equal(fixture.tables.greaterRealmCastleClaimV1.count(), 100n);
  assert.equal(fixture.tables.castleSlotClaimV1.count(), 0n);
  assert.deepEqual(
    fixture.tables.realmV1.rows,
    [{ ...legacyRealmPreimage, active: false }],
  );
  for (const claim of fixture.tables.greaterRealmCastleClaimV1.rows) {
    assert.equal(claim.state, 'active');
    assert.notEqual(claim.activatedAt, undefined);
    const old = beforeCastles.get(claim.castleId)!;
    const current = fixture.tables.castle.castleId.find(claim.castleId)!;
    assert.deepEqual(
      Object.fromEntries(Object.entries(current).filter(([key]) => !['tileKey', 'q', 'r'].includes(key))),
      Object.fromEntries(Object.entries(old).filter(([key]) => !['tileKey', 'q', 'r'].includes(key))),
    );
    assert.equal(fixture.tables.worldTile.key.find(claim.legacyTileKey)!.occupantCastleId, undefined);
  }
  assert.deepEqual(
    stateOutsideRelocationWrites(fixture.snapshot(), 'canary'),
    stateOutsideRelocationWrites(before, 'canary'),
  );
  const retryBefore = stateText(fixture);
  assert.equal(relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(stateText(fixture), retryBefore);
});

test('current founder/resource authority changes only at canary and freezes migrated terrain to legacyTileKey', () => {
  const fixture = new Fixture();
  const fid = 1_001n;
  const legacyFounder = assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid);
  const legacyTerrain = greaterRealmCurrentPassiveTerrainV1(fixture.ctx, legacyFounder);
  assert.equal(legacyFounder.source, 'v16');
  advanceToPlanned(fixture);
  assert.equal(assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid).source, 'v16');
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  const current = assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, fid);
  assert.equal(current.source, 'v17');
  assert.equal(current.castle.tileKey, current.greaterRealmOccupancy!.cellKey);
  assert.equal(greaterRealmCurrentPassiveTerrainV1(fixture.ctx, current), legacyTerrain);
  assert.equal(
    fixture.tables.worldTileMetaV1.tileKey.find(current.castle.tileKey),
    null,
    'the new cell is deliberately not a v16 passive-terrain key',
  );
});

test('steady-state v17 founder authority rejects claim, occupancy, atlas, worker, and region-root drift', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  const cases: readonly [string, Row, () => void][] = [
    ['claim planned timestamp', fixture.tables.greaterRealmCastleClaimV1.rows[0]!, () => {
      fixture.tables.greaterRealmCastleClaimV1.rows[0]!.plannedAt = timestamp(9_999n);
    }],
    ['claim active timestamp', fixture.tables.greaterRealmCastleClaimV1.rows[0]!, () => {
      fixture.tables.greaterRealmCastleClaimV1.rows[0]!.activatedAt = timestamp(9_999n);
    }],
    ['occupancy timestamp', fixture.tables.greaterRealmCellOccupancyV1.rows[0]!, () => {
      fixture.tables.greaterRealmCellOccupancyV1.rows[0]!.occupiedAt = timestamp(9_999n);
    }],
    ['atlas protocol', fixture.tables.realmAtlasV1.rows[0]!, () => {
      fixture.tables.realmAtlasV1.rows[0]!.protocolVersion = 'drifted';
    }],
    ['worker policy', fixture.tables.realmWorkerSystemV2.rows[0]!, () => {
      fixture.tables.realmWorkerSystemV2.rows[0]!.policyVersion = 'drifted';
    }],
    ['region manifest', fixture.tables.realmAtlasVisibleRegionV1.rows[0]!, () => {
      fixture.tables.realmAtlasVisibleRegionV1.rows[0]!.cellCount += 1;
    }],
    ['legacy realm preimage', fixture.tables.realmV1.rows[0]!, () => {
      fixture.tables.realmV1.rows[0]!.publicName = 'drifted';
    }],
  ];
  for (const [name, row, mutate] of cases) {
    const original = clone(row);
    mutate();
    assert.equal(
      errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
      'STATE_INTEGRITY',
      name,
    );
    Object.assign(row, original);
  }
  fixture.tables.realmV1.rows.push({
    ...fixture.tables.realmV1.rows[0]!,
    realmId: 'EXTRA_REALM',
  });
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
    'STATE_INTEGRITY',
  );
  fixture.tables.realmV1.rows.pop();
  fixture.tables.greaterRealmReleaseV1.rows.push({
    ...fixture.tables.greaterRealmReleaseV1.rows[0]!,
    atlasId: 'extra-release',
  });
  assert.equal(
    errorCode(() => assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n)),
    'STATE_INTEGRITY',
  );
  fixture.tables.greaterRealmReleaseV1.rows.pop();
});
