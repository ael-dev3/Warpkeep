import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FoundingPolicyError,
  existingFounderAssignmentIsConsistent,
  selectNextPermanentCastleSlot,
} from '../src/foundingPolicy';
import { CANONICAL_CASTLE_SLOTS } from '../src/world';

test('permanent founding selects the first canonical unclaimed slot deterministically', () => {
  assert.equal(
    selectNextPermanentCastleSlot(CANONICAL_CASTLE_SLOTS, new Set()).slotId,
    1,
  );
  assert.equal(
    selectNextPermanentCastleSlot(CANONICAL_CASTLE_SLOTS, new Set([1, 2])).slotId,
    3,
  );
  assert.deepEqual(
    selectNextPermanentCastleSlot(CANONICAL_CASTLE_SLOTS, new Set([1])),
    CANONICAL_CASTLE_SLOTS[1],
  );
});

test('founding refuses incomplete, changed, duplicate, and exhausted slot state', () => {
  assert.throws(
    () => selectNextPermanentCastleSlot(CANONICAL_CASTLE_SLOTS.slice(1), new Set()),
    (error: unknown) => error instanceof FoundingPolicyError
      && error.code === 'GENESIS_CASTLE_SLOTS_INCOMPLETE',
  );
  assert.throws(
    () => selectNextPermanentCastleSlot(
      CANONICAL_CASTLE_SLOTS.map((slot, index) => index === 0 ? { ...slot, q: 99 } : slot),
      new Set(),
    ),
    /GENESIS_CASTLE_SLOT_DRIFT/,
  );
  assert.throws(
    () => selectNextPermanentCastleSlot(
      CANONICAL_CASTLE_SLOTS.map((slot, index) => index === 1 ? CANONICAL_CASTLE_SLOTS[0]! : slot),
      new Set(),
    ),
    /GENESIS_CASTLE_SLOT_DRIFT/,
  );
  assert.throws(
    () => selectNextPermanentCastleSlot(
      CANONICAL_CASTLE_SLOTS,
      new Set(CANONICAL_CASTLE_SLOTS.map(slot => slot.slotId)),
    ),
    /GENESIS_CASTLE_CAPACITY_REACHED/,
  );
});

test('a pre-founded assignment must preserve owner, slot, castle, coordinate, and occupancy links', () => {
  const slot = CANONICAL_CASTLE_SLOTS[0]!;
  const assignment = {
    fid: 42n,
    castleId: 7n,
    castleOwnerFid: 42n,
    castleTileKey: slot.tileKey,
    castleQ: slot.q,
    castleR: slot.r,
    castleLevel: 1,
    claimOwnerFid: 42n,
    claimCastleId: 7n,
    claimSlotId: slot.slotId,
    claimGenerationVersion: slot.generationVersion,
    slot,
    tileOccupantCastleId: 7n,
  };
  assert.equal(existingFounderAssignmentIsConsistent(assignment), true);
  assert.equal(existingFounderAssignmentIsConsistent({
    ...assignment,
    castleTileKey: CANONICAL_CASTLE_SLOTS[1]!.tileKey,
  }), false);
  assert.equal(existingFounderAssignmentIsConsistent({
    ...assignment,
    tileOccupantCastleId: undefined,
  }), false);
  assert.equal(existingFounderAssignmentIsConsistent({
    ...assignment,
    claimOwnerFid: 99n,
  }), false);
  assert.equal(existingFounderAssignmentIsConsistent({
    ...assignment,
    claimGenerationVersion: slot.generationVersion + 1,
  }), false);
});
