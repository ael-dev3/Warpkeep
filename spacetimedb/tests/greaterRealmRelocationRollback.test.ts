import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGreaterRealmCurrentFounderForFidV1 } from '../src/greaterRealmCurrentAuthority';
import { greaterRealmLegacyJourneyDispatchIsOpenV1 } from '../src/greaterRealmActivationState';
import { Fixture, advanceToPlanned, clone, commitGreaterRealmActiveAuthorizedTransactionV1, errorCode, haltGreaterRealmActivationAuthorizedTransactionV1, makeFirstWorkerOutbound, prepareGreaterRealmActivationAuthorizedTransactionV1, relocateGreaterRealmCanaryAuthorizedTransactionV1, resumeGreaterRealmActiveAuthorizedTransactionV1, rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1, stateOutsideRelocationWrites, stateText } from './greaterRealmRelocationTestSupport';



test('fault injection demonstrates transaction rollback at early, middle, and late writes', () => {
  const fixture = new Fixture();
  advanceToPlanned(fixture);
  const planned = stateText(fixture);
  for (const faultAt of [1, 250, 7_000, 13_100]) {
    assert.equal(
      errorCode(() => fixture.transaction(
        () => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx),
        faultAt,
      )),
      'INJECTED_TRANSACTION_FAULT',
      `fault ${faultAt}`,
    );
    assert.equal(stateText(fixture), planned, `fault ${faultAt} escaped atomic rollback`);
  }
  assert.equal(fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx)), 'canary');
});

test('zero-counter precommit rollback restores the byte-exact v16 topology and exact retry', () => {
  const fixture = new Fixture();
  const legacyRealmPreimage = clone(fixture.tables.realmV1.rows[0]!);
  advanceToPlanned(fixture);
  fixture.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(fixture.ctx));
  const canaryState = stateText(fixture);
  for (const faultAt of [1, 250, 7_000, 13_100]) {
    assert.equal(
      errorCode(() => fixture.transaction(
        () => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx),
        faultAt,
      )),
      'INJECTED_TRANSACTION_FAULT',
      `rollback fault ${faultAt}`,
    );
    assert.equal(
      stateText(fixture),
      canaryState,
      `rollback fault ${faultAt} escaped atomic rollback`,
    );
  }
  fixture.tables.resourceAccountV1.rows[0]!.food += 1n;
  fixture.tables.resourceAccountV1.rows[0]!.revision += 1n;
  fixture.tables.realmChatMessageV1.rows[0]!.body = 'legitimate post-canary activity';
  const beforeRollback = fixture.snapshot();
  assert.equal(fixture.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx)), 'rolled-back');
  assert.equal(fixture.tables.greaterRealmCastleClaimV1.count(), 0n);
  assert.equal(fixture.tables.greaterRealmCellOccupancyV1.count(), 0n);
  assert.equal(fixture.tables.castleSlotClaimV1.count(), 100n);
  assert.equal(fixture.tables.realmAtlasV1.count(), 0n);
  assert.equal(fixture.tables.realmAtlasVisibleRegionV1.count(), 0n);
  assert.equal(fixture.tables.realmWorkerSystemV2.count(), 0n);
  assert.deepEqual(fixture.tables.realmV1.rows, [legacyRealmPreimage]);
  assert.deepEqual(
    stateOutsideRelocationWrites(fixture.snapshot(), 'rollback'),
    stateOutsideRelocationWrites(beforeRollback, 'rollback'),
  );
  assert.equal(assertGreaterRealmCurrentFounderForFidV1(fixture.ctx, 1_001n).source, 'v16');
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(fixture.ctx), true);
  makeFirstWorkerOutbound(fixture);
  const retryBefore = stateText(fixture);
  assert.equal(rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(fixture.ctx), 'unchanged');
  assert.equal(stateText(fixture), retryBefore);
});

test('post-canary counters and active commit irreversibly close rollback; halt preserves current v17 authority', () => {
  const counter = new Fixture();
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(counter.ctx), true);
  advanceToPlanned(counter);
  counter.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(counter.ctx));
  assert.equal(greaterRealmLegacyJourneyDispatchIsOpenV1(counter.ctx), false);
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(counter.ctx), 'active');
  counter.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount = 1;
  const beforeCounterRollback = stateText(counter);
  assert.equal(
    errorCode(() => counter.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(counter.ctx))),
    'GREATER_REALM_ROLLBACK_WINDOW_CLOSED',
  );
  assert.equal(stateText(counter), beforeCounterRollback);

  const committed = new Fixture();
  advanceToPlanned(committed);
  committed.transaction(() => relocateGreaterRealmCanaryAuthorizedTransactionV1(committed.ctx));
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'active');
  assert.equal(commitGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'unchanged');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(committed.ctx), 'halted');
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(committed.ctx), 'unchanged');
  const activationHistory = clone(committed.tables.greaterRealmActivationV1.rows[0]!);
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'active');
  assert.equal(resumeGreaterRealmActiveAuthorizedTransactionV1(committed.ctx), 'unchanged');
  assert.equal(committed.tables.greaterRealmActivationV1.rows[0]!.mode, 'active');
  assert.deepEqual(
    committed.tables.greaterRealmActivationV1.rows[0]!.activatedAt,
    activationHistory.activatedAt,
  );
  assert.deepEqual(
    committed.tables.greaterRealmActivationV1.rows[0]!.haltedAt,
    activationHistory.haltedAt,
  );
  assert.equal(committed.tables.greaterRealmReleaseV1.rows[0]!.state, 'active');
  assert.equal(committed.tables.realmAtlasV1.rows[0]!.mode, 'active');
  assert.equal(committed.tables.realmWorkerSystemV2.rows[0]!.mode, 'active');
  assert.equal(assertGreaterRealmCurrentFounderForFidV1(committed.ctx, 1_001n).source, 'v17');
  assert.equal(
    errorCode(() => committed.transaction(() => rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1(committed.ctx))),
    'GREATER_REALM_ROLLBACK_WINDOW_CLOSED',
  );
  assert.equal(committed.tables.greaterRealmActivationV1.rows[0]!.mode, 'active');
  assert.notEqual(committed.tables.greaterRealmActivationV1.rows[0]!.activatedAt, undefined);

  const preactive = new Fixture();
  assert.equal(
    prepareGreaterRealmActivationAuthorizedTransactionV1(preactive.ctx, 'admin:fixture'),
    'prepared',
  );
  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(preactive.ctx), 'halted');
  assert.equal(
    errorCode(() => resumeGreaterRealmActiveAuthorizedTransactionV1(preactive.ctx)),
    'GREATER_REALM_RESUME_PHASE_INVALID',
  );
});
