import type { IndexedAxialGrid } from './greater-realm-terrain';

function fail(code: string): never {
  throw new Error(code);
}

export type GreaterRealmOwnerRemovalConnectivityInput = Readonly<{
  grid: IndexedAxialGrid;
  member: Uint8Array;
  owner: Int8Array;
  ownerId: number;
  removedCell: number;
  expectedRemainingCellCount: number;
  visitMarks: Uint32Array;
  visitMark: number;
  pending: Int32Array;
}>;

/**
 * Check global owner connectivity after a single cell is removed. Local hex
 * neighbour runs are a conservative articulation heuristic: they can reject
 * a cell whose owner's territory remains connected around a larger cycle.
 * Scratch arrays are supplied by the caller and the queue is cleared here.
 */
export function greaterRealmOwnerRemainsConnectedAfterCellRemoval(
  input: GreaterRealmOwnerRemovalConnectivityInput,
): boolean {
  const {
    grid,
    member,
    owner,
    ownerId,
    removedCell,
    expectedRemainingCellCount,
    visitMarks,
    visitMark,
    pending,
  } = input;
  if (
    member.length !== grid.cellCount
    || owner.length !== grid.cellCount
    || visitMarks.length !== grid.cellCount
    || pending.length < grid.cellCount
    || !Number.isSafeInteger(ownerId)
    || !Number.isSafeInteger(removedCell)
    || removedCell < 0
    || removedCell >= grid.cellCount
    || !Number.isSafeInteger(expectedRemainingCellCount)
    || expectedRemainingCellCount < 0
    || expectedRemainingCellCount >= grid.cellCount
    || !Number.isSafeInteger(visitMark)
    || visitMark < 1
    || visitMark > 0xffff_ffff
  ) fail('GREATER_REALM_OWNER_CONNECTIVITY_INPUT_INVALID');
  if (member[removedCell] !== 1 || owner[removedCell] !== ownerId) {
    fail('GREATER_REALM_OWNER_CONNECTIVITY_REMOVAL_INVALID');
  }
  if (expectedRemainingCellCount === 0) return true;

  let start = -1;
  for (let direction = 0; direction < 6; direction += 1) {
    const neighbor = grid.neighbors[removedCell * 6 + direction]!;
    if (
      neighbor >= 0
      && member[neighbor] === 1
      && owner[neighbor] === ownerId
    ) {
      start = neighbor;
      break;
    }
  }
  if (start < 0) return false;

  let tail = 0;
  pending[tail++] = start;
  visitMarks[start] = visitMark;
  try {
    for (let head = 0; head < tail; head += 1) {
      const current = pending[head]!;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = grid.neighbors[current * 6 + direction]!;
        if (
          neighbor < 0
          || neighbor === removedCell
          || member[neighbor] !== 1
          || owner[neighbor] !== ownerId
          || visitMarks[neighbor] === visitMark
        ) continue;
        if (tail >= pending.length) return false;
        visitMarks[neighbor] = visitMark;
        pending[tail++] = neighbor;
      }
    }
  } finally {
    pending.fill(0, 0, tail);
  }
  return tail === expectedRemainingCellCount;
}

export type GreaterRealmConnectedDonorLobeInput = Readonly<{
  grid: IndexedAxialGrid;
  member: Uint8Array;
  owner: Int8Array;
  targetOwnerId: number;
  donorOwnerId: number;
  candidateCell: number;
  componentCellCount: number;
  targetCellCount: number;
  targetCellMaximum: number;
  donorCellCount: number;
  donorCellMinimum: number;
  strategicSpineMask: Uint8Array;
  strategicApronMask: Uint8Array;
  protectedCell: Uint8Array;
  reserveCell: Uint8Array;
  innerBoundaryMask: Uint8Array;
  outerBoundaryMask: Uint8Array;
  donorInnerContactCount: number;
  donorOuterContactCount: number;
}>;

/**
 * Find the smallest connected donor lobe that can move with an articulation
 * fringe cell while leaving one connected donor component behind. The fringe
 * cell must touch the target owner; moved cells cannot contain fixed strategic
 * or protected authority, and donor contact and cell-count floors stay intact.
 */
export function findGreaterRealmConnectedDonorLobeTransfer(
  input: GreaterRealmConnectedDonorLobeInput,
): number[] | undefined {
  const {
    grid,
    member,
    owner,
    targetOwnerId,
    donorOwnerId,
    candidateCell,
    componentCellCount,
    targetCellCount,
    targetCellMaximum,
    donorCellCount,
    donorCellMinimum,
    strategicSpineMask,
    strategicApronMask,
    protectedCell,
    reserveCell,
    innerBoundaryMask,
    outerBoundaryMask,
    donorInnerContactCount,
    donorOuterContactCount,
  } = input;
  if (
    member.length !== grid.cellCount
    || owner.length !== grid.cellCount
    || strategicSpineMask.length !== grid.cellCount
    || strategicApronMask.length !== grid.cellCount
    || protectedCell.length !== grid.cellCount
    || reserveCell.length !== grid.cellCount
    || innerBoundaryMask.length !== grid.cellCount
    || outerBoundaryMask.length !== grid.cellCount
    || !Number.isSafeInteger(targetOwnerId)
    || !Number.isSafeInteger(donorOwnerId)
    || targetOwnerId === donorOwnerId
    || !Number.isSafeInteger(candidateCell)
    || candidateCell < 0
    || candidateCell >= grid.cellCount
    || !Number.isSafeInteger(componentCellCount)
    || componentCellCount < 1
    || componentCellCount > grid.cellCount
    || !Number.isSafeInteger(targetCellCount)
    || targetCellCount < 0
    || !Number.isSafeInteger(targetCellMaximum)
    || targetCellMaximum < targetCellCount
    || !Number.isSafeInteger(donorCellCount)
    || donorCellCount < 1
    || !Number.isSafeInteger(targetCellCount + donorCellCount)
    || targetCellCount + donorCellCount > componentCellCount
    || !Number.isSafeInteger(donorCellMinimum)
    || donorCellMinimum < 0
    || donorCellMinimum > donorCellCount
    || !Number.isSafeInteger(donorInnerContactCount)
    || donorInnerContactCount < 0
    || !Number.isSafeInteger(donorOuterContactCount)
    || donorOuterContactCount < 0
  ) fail('GREATER_REALM_DONOR_LOBE_INPUT_INVALID');
  if (
    member[candidateCell] !== 1
    || owner[candidateCell] !== donorOwnerId
    || strategicSpineMask[candidateCell] === 1
    || strategicApronMask[candidateCell] === 1
    || protectedCell[candidateCell] === 1
    || reserveCell[candidateCell] === 1
  ) return undefined;
  let touchesTarget = false;
  for (let direction = 0; direction < 6; direction += 1) {
    const neighbor = grid.neighbors[candidateCell * 6 + direction]!;
    if (
      neighbor >= 0
      && member[neighbor] === 1
      && owner[neighbor] === targetOwnerId
    ) {
      touchesTarget = true;
      break;
    }
  }
  if (!touchesTarget) return undefined;

  const donorCells: number[] = [];
  const visited = new Set<number>();
  const pending: number[] = [];
  const pieces: Array<{
    cells: number[];
    touchesCandidate: boolean;
    containsFixedAuthority: boolean;
    innerContactCount: number;
    outerContactCount: number;
  }> = [];
  let transferCells: number[] | undefined;
  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (cell !== candidateCell && member[cell] === 1 && owner[cell] === donorOwnerId) {
        donorCells.push(cell);
      }
    }
    if (donorCells.length + 1 !== donorCellCount) return undefined;

    for (const start of donorCells) {
      if (visited.has(start)) continue;
      const piece = {
        cells: [] as number[],
        touchesCandidate: false,
        containsFixedAuthority: false,
        innerContactCount: 0,
        outerContactCount: 0,
      };
      pending.push(start);
      visited.add(start);
      while (pending.length > 0) {
        const cell = pending.pop()!;
        piece.cells.push(cell);
        if (
          strategicSpineMask[cell] === 1
          || strategicApronMask[cell] === 1
          || protectedCell[cell] === 1
          || reserveCell[cell] === 1
        ) piece.containsFixedAuthority = true;
        if (innerBoundaryMask[cell] === 1) piece.innerContactCount += 1;
        if (outerBoundaryMask[cell] === 1) piece.outerContactCount += 1;
        for (let direction = 0; direction < 6; direction += 1) {
          const neighbor = grid.neighbors[cell * 6 + direction]!;
          if (neighbor === candidateCell) piece.touchesCandidate = true;
          if (
            neighbor < 0
            || neighbor === candidateCell
            || member[neighbor] !== 1
            || owner[neighbor] !== donorOwnerId
            || visited.has(neighbor)
          ) continue;
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
      pieces.push(piece);
    }
    if (pieces.length < 2) return undefined;

    const candidateInnerContact = innerBoundaryMask[candidateCell] === 1 ? 1 : 0;
    const candidateOuterContact = outerBoundaryMask[candidateCell] === 1 ? 1 : 0;
    let selectedTransferSize = Number.POSITIVE_INFINITY;
    let selectedRetainedPiece = -1;
    for (let retainedPiece = 0; retainedPiece < pieces.length; retainedPiece += 1) {
      const movedPieces = pieces.filter((_piece, index) => index !== retainedPiece);
      if (movedPieces.some(piece => (
        !piece.touchesCandidate || piece.containsFixedAuthority
      ))) continue;
      const transferSize = 1 + movedPieces.reduce(
        (sum, piece) => sum + piece.cells.length,
        0,
      );
      if (
        targetCellCount + transferSize > targetCellMaximum
        || donorCellCount - transferSize < donorCellMinimum
      ) continue;
      const movedInnerContacts = candidateInnerContact + movedPieces.reduce(
        (sum, piece) => sum + piece.innerContactCount,
        0,
      );
      const movedOuterContacts = candidateOuterContact + movedPieces.reduce(
        (sum, piece) => sum + piece.outerContactCount,
        0,
      );
      if (
        (donorInnerContactCount > 0
          && donorInnerContactCount - movedInnerContacts <= 0)
        || (donorOuterContactCount > 0
          && donorOuterContactCount - movedOuterContacts <= 0)
      ) continue;
      if (transferSize < selectedTransferSize) {
        selectedTransferSize = transferSize;
        selectedRetainedPiece = retainedPiece;
      }
    }
    if (selectedRetainedPiece < 0) return undefined;
    transferCells = [candidateCell];
    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
      if (pieceIndex === selectedRetainedPiece) continue;
      transferCells.push(...pieces[pieceIndex]!.cells);
    }
    return transferCells;
  } finally {
    donorCells.fill(0);
    donorCells.length = 0;
    pending.fill(0);
    pending.length = 0;
    visited.clear();
    for (const piece of pieces) {
      if (piece.cells !== transferCells) {
        piece.cells.fill(0);
        piece.cells.length = 0;
      }
    }
  }
}
