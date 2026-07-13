import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlayerV2MigrationIntegrityError,
  classifyAdditiveV2PublicationState,
  planPlayerV2Reconciliation,
  type LegacyPlayerFixture,
  type PlayerOwnershipV2Fixture,
  type PlayerV2Fixture,
} from '../src/playerV2MigrationPolicy';

const emptyProductionCounts = Object.freeze({
  worldTiles: 61n,
  legacyPlayers: 0n,
  playersV2: 0n,
  playerOwnershipsV2: 0n,
  orphanedPlayerRowsV2: 0n,
  orphanedOwnershipRowsV2: 0n,
  castles: 0n,
  allowedFids: 0n,
  enabledAllowedFids: 0n,
});

const identityKey = (identity: string) => identity;

test('the empty 61-tile production-equivalent state is the sole publication baseline', () => {
  assert.equal(classifyAdditiveV2PublicationState(emptyProductionCounts), 'ready');
  assert.deepEqual(planPlayerV2Reconciliation([], [], [], identityKey), {
    classification: 'empty',
    legacyRows: 0,
    retainedV2Rows: 0,
    insertPlayersV2: [],
    insertOwnershipsV2: [],
  });
});

test('a synthetic nonempty legacy fixture plans a lossless pair copy and is idempotent', () => {
  const legacy: readonly LegacyPlayerFixture<string, bigint>[] = Object.freeze([
    Object.freeze({
      fid: 10n,
      identity: 'identity-a',
      username: 'keeper-a',
      displayName: 'Keeper A',
      pfpUrl: 'https://example.test/a.png',
      joinedAt: 100n,
      status: 'active',
    }),
    Object.freeze({
      fid: 20n,
      identity: 'identity-b',
      joinedAt: 200n,
      status: 'disabled',
    }),
  ]);

  const first = planPlayerV2Reconciliation(legacy, [], [], identityKey);
  assert.equal(first.classification, 'requires_reconciliation');
  assert.equal(first.legacyRows, 2);
  assert.deepEqual(first.insertPlayersV2.map(row => row.fid), [10n, 20n]);
  assert.deepEqual(first.insertOwnershipsV2.map(row => row.identity), [
    'identity-a',
    'identity-b',
  ]);
  assert.equal(first.insertPlayersV2[0]?.username, legacy[0]?.username);
  assert.equal(first.insertPlayersV2[0]?.joinedAt, legacy[0]?.joinedAt);
  assert.equal(first.insertPlayersV2[1]?.status, legacy[1]?.status);

  const second = planPlayerV2Reconciliation(
    legacy,
    first.insertPlayersV2,
    first.insertOwnershipsV2,
    identityKey,
  );
  assert.equal(second.classification, 'already_reconciled');
  assert.deepEqual(second.insertPlayersV2, []);
  assert.deepEqual(second.insertOwnershipsV2, []);
});

test('partial, projection-mismatched, identity-mismatched, and duplicate state fails closed', () => {
  const legacy: LegacyPlayerFixture<string, bigint> = {
    fid: 10n,
    identity: 'identity-a',
    username: 'keeper',
    joinedAt: 100n,
    status: 'active',
  };
  const projection: PlayerV2Fixture<bigint> = {
    fid: 10n,
    username: 'keeper',
    joinedAt: 100n,
    status: 'active',
  };
  const ownership: PlayerOwnershipV2Fixture<string> = {
    fid: 10n,
    identity: 'identity-a',
  };

  assert.throws(
    () => planPlayerV2Reconciliation([legacy], [projection], [], identityKey),
    (error: unknown) => error instanceof PlayerV2MigrationIntegrityError
      && error.message === 'PARTIAL_PLAYER_V2_PAIR',
  );
  assert.throws(
    () => planPlayerV2Reconciliation(
      [legacy],
      [{ ...projection, status: 'tampered' }],
      [ownership],
      identityKey,
    ),
    /PLAYER_V2_PROJECTION_MISMATCH/,
  );
  assert.throws(
    () => planPlayerV2Reconciliation(
      [legacy],
      [projection],
      [{ ...ownership, identity: 'identity-other' }],
      identityKey,
    ),
    /PLAYER_V2_IDENTITY_MISMATCH/,
  );
  assert.throws(
    () => planPlayerV2Reconciliation(
      [legacy, { ...legacy, fid: 20n }],
      [],
      [],
      identityKey,
    ),
    /DUPLICATE_LEGACY_IDENTITY/,
  );
});

test('nonzero legacy or unexpected v2/alpha state is an explicit production hard stop', () => {
  assert.equal(classifyAdditiveV2PublicationState({
    ...emptyProductionCounts,
    legacyPlayers: 1n,
  }), 'legacy_reconciliation_required');
  assert.equal(classifyAdditiveV2PublicationState({
    ...emptyProductionCounts,
    playersV2: 1n,
  }), 'unexpected_v2_state');
  assert.equal(classifyAdditiveV2PublicationState({
    ...emptyProductionCounts,
    castles: 1n,
  }), 'unexpected_alpha_state');
});

test('rollback leaves empty additive tables inert and requires no destructive reversal', () => {
  const inertAfterForwardFix = { ...emptyProductionCounts };
  assert.equal(classifyAdditiveV2PublicationState(inertAfterForwardFix), 'ready');
  assert.deepEqual(planPlayerV2Reconciliation([], [], [], identityKey).insertPlayersV2, []);
});
