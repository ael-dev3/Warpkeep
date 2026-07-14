import {
  CANONICAL_CASTLE_SLOTS,
  matchesCanonicalCastleSlot,
  type CanonicalCastleSlot,
} from './world';

export class FoundingPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FoundingPolicyError';
  }
}

export type ExistingCastleSlot = Readonly<{
  slotId: number;
  realmId: string;
  tileKey: string;
  q: number;
  r: number;
  generationVersion: number;
}>;

/**
 * The slot table is permanent generation state, so allocation refuses partial
 * or changed tables instead of silently assigning around drift.
 */
export function selectNextPermanentCastleSlot(
  existingSlots: Iterable<ExistingCastleSlot>,
  claimedSlotIds: ReadonlySet<number>,
): CanonicalCastleSlot {
  const slots = [...existingSlots];
  if (slots.length !== CANONICAL_CASTLE_SLOTS.length) {
    throw new FoundingPolicyError('GENESIS_CASTLE_SLOTS_INCOMPLETE');
  }
  const byId = new Map<number, ExistingCastleSlot>();
  for (const slot of slots) {
    if (byId.has(slot.slotId) || !matchesCanonicalCastleSlot(slot)) {
      throw new FoundingPolicyError('GENESIS_CASTLE_SLOT_DRIFT');
    }
    byId.set(slot.slotId, slot);
  }
  for (const canonical of CANONICAL_CASTLE_SLOTS) {
    if (!claimedSlotIds.has(canonical.slotId)) return canonical;
  }
  throw new FoundingPolicyError('GENESIS_CASTLE_CAPACITY_REACHED');
}

export type ExistingFounderAssignment = Readonly<{
  fid: bigint;
  castleId: bigint;
  castleOwnerFid: bigint;
  castleTileKey: string;
  castleQ: number;
  castleR: number;
  castleLevel: number;
  claimOwnerFid: bigint;
  claimCastleId: bigint;
  claimSlotId: number;
  claimGenerationVersion: number;
  slot?: ExistingCastleSlot;
  tileOccupantCastleId?: bigint;
}>;

export function existingFounderAssignmentIsConsistent(
  assignment: ExistingFounderAssignment,
): boolean {
  const slot = assignment.slot;
  return slot !== undefined
    && matchesCanonicalCastleSlot(slot)
    && assignment.castleOwnerFid === assignment.fid
    && assignment.claimOwnerFid === assignment.fid
    && assignment.claimCastleId === assignment.castleId
    && assignment.claimSlotId === slot.slotId
    && assignment.claimGenerationVersion === slot.generationVersion
    && assignment.castleTileKey === slot.tileKey
    && assignment.castleQ === slot.q
    && assignment.castleR === slot.r
    && assignment.castleLevel >= 1
    && assignment.tileOccupantCastleId === assignment.castleId;
}
