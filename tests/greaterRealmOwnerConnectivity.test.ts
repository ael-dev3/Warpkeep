import { describe, expect, it } from 'vitest';

import {
  findGreaterRealmConnectedDonorLobeTransfer,
  greaterRealmOwnerRemainsConnectedAfterCellRemoval,
} from '../scripts/atlas/greater-realm-owner-connectivity';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';

function hexDisk(radius: number) {
  const coordinates = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  return indexGreaterRealmAxialGrid(coordinates);
}

describe('Greater Realm owner connectivity after fringe removal', () => {
  it('allows separated local neighbour runs when the donor remains globally connected', () => {
    const grid = hexDisk(3);
    const member = new Uint8Array(grid.cellCount).fill(1);
    const owner = new Int8Array(grid.cellCount).fill(0);
    const removedCell = grid.indexOf({ q: 0, r: 0 });
    const neighborOwners = Array.from({ length: 6 }, (_, direction) => (
      grid.neighbors[removedCell * 6 + direction]!
    ));
    for (const direction of [1, 2, 4, 5]) owner[neighborOwners[direction]!] = 1;

    const localRuns = neighborOwners.reduce((runs, cell, direction) => (
      owner[cell] === 0
      && (direction === 0 || owner[neighborOwners[direction - 1]!] !== 0)
        ? runs + 1
        : runs
    ), 0);
    expect(localRuns).toBe(2);

    const donorCount = owner.reduce((count, value) => count + Number(value === 0), 0);
    const visitMarks = new Uint32Array(grid.cellCount);
    const pending = new Int32Array(grid.cellCount);
    expect(greaterRealmOwnerRemainsConnectedAfterCellRemoval({
      grid,
      member,
      owner,
      ownerId: 0,
      removedCell,
      expectedRemainingCellCount: donorCount - 1,
      visitMarks,
      visitMark: 1,
      pending,
    })).toBe(true);
    expect(pending.every(value => value === 0)).toBe(true);
  });

  it('rejects removal of a bridge between donor cells', () => {
    const grid = indexGreaterRealmAxialGrid(
      Array.from({ length: 5 }, (_, q) => ({ q, r: 0 })),
    );
    const member = new Uint8Array(grid.cellCount).fill(1);
    const owner = new Int8Array(grid.cellCount).fill(0);
    const removedCell = grid.indexOf({ q: 2, r: 0 });
    const visitMarks = new Uint32Array(grid.cellCount);
    const pending = new Int32Array(grid.cellCount);

    expect(greaterRealmOwnerRemainsConnectedAfterCellRemoval({
      grid,
      member,
      owner,
      ownerId: 0,
      removedCell,
      expectedRemainingCellCount: 4,
      visitMarks,
      visitMark: 1,
      pending,
    })).toBe(false);
    expect(pending.every(value => value === 0)).toBe(true);
  });

  it('moves an articulation fringe cell with an unprotected connected lobe', () => {
    const grid = indexGreaterRealmAxialGrid([
      { q: 1, r: 0 },
      { q: 2, r: -1 },
      { q: 0, r: 0 },
      { q: -1, r: 0 },
      { q: 1, r: 1 },
      { q: 1, r: 2 },
    ]);
    const member = new Uint8Array(grid.cellCount).fill(1);
    const owner = new Int8Array(grid.cellCount).fill(1);
    const target = grid.indexOf({ q: 2, r: -1 });
    const candidate = grid.indexOf({ q: 1, r: 0 });
    const innerBoundaryMask = new Uint8Array(grid.cellCount);
    const outerBoundaryMask = new Uint8Array(grid.cellCount);
    const coreBoundary = grid.indexOf({ q: 0, r: 0 });
    owner[target] = 0;
    innerBoundaryMask[coreBoundary] = 1;
    outerBoundaryMask[coreBoundary] = 1;
    const emptyMask = () => new Uint8Array(grid.cellCount);

    const transfer = findGreaterRealmConnectedDonorLobeTransfer({
      grid,
      member,
      owner,
      targetOwnerId: 0,
      donorOwnerId: 1,
      candidateCell: candidate,
      componentCellCount: grid.cellCount,
      targetCellCount: 1,
      targetCellMaximum: 4,
      donorCellCount: 5,
      donorCellMinimum: 2,
      strategicSpineMask: emptyMask(),
      strategicApronMask: emptyMask(),
      protectedCell: emptyMask(),
      reserveCell: emptyMask(),
      innerBoundaryMask,
      outerBoundaryMask,
      donorInnerContactCount: 1,
      donorOuterContactCount: 1,
    });

    expect(new Set(transfer)).toEqual(new Set([
      candidate,
      grid.indexOf({ q: 1, r: 1 }),
      grid.indexOf({ q: 1, r: 2 }),
    ]));
    for (const cell of transfer ?? []) owner[cell] = 0;
    const connectedOwnerCellCount = (ownerId: number) => {
      const start = owner.findIndex(value => value === ownerId);
      if (start < 0) return 0;
      const visited = new Set([start]);
      const pending = [start];
      while (pending.length > 0) {
        const cell = pending.pop()!;
        for (let direction = 0; direction < 6; direction += 1) {
          const neighbor = grid.neighbors[cell * 6 + direction]!;
          if (
            neighbor < 0
            || member[neighbor] !== 1
            || owner[neighbor] !== ownerId
            || visited.has(neighbor)
          ) continue;
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
      return visited.size;
    };
    expect(connectedOwnerCellCount(0)).toBe(4);
    expect(connectedOwnerCellCount(1)).toBe(2);
  });

  it('does not move a lobe when every connected donor remainder would move fixed authority', () => {
    const grid = indexGreaterRealmAxialGrid([
      { q: 1, r: 0 },
      { q: 2, r: -1 },
      { q: 0, r: 0 },
      { q: -1, r: 0 },
      { q: 1, r: 1 },
      { q: 1, r: 2 },
    ]);
    const member = new Uint8Array(grid.cellCount).fill(1);
    const owner = new Int8Array(grid.cellCount).fill(1);
    const target = grid.indexOf({ q: 2, r: -1 });
    const candidate = grid.indexOf({ q: 1, r: 0 });
    const spine = new Uint8Array(grid.cellCount);
    const apron = new Uint8Array(grid.cellCount);
    owner[target] = 0;
    spine[grid.indexOf({ q: 0, r: 0 })] = 1;
    apron[grid.indexOf({ q: 1, r: 1 })] = 1;
    const emptyMask = () => new Uint8Array(grid.cellCount);

    expect(findGreaterRealmConnectedDonorLobeTransfer({
      grid,
      member,
      owner,
      targetOwnerId: 0,
      donorOwnerId: 1,
      candidateCell: candidate,
      componentCellCount: grid.cellCount,
      targetCellCount: 1,
      targetCellMaximum: 6,
      donorCellCount: 5,
      donorCellMinimum: 2,
      strategicSpineMask: spine,
      strategicApronMask: apron,
      protectedCell: emptyMask(),
      reserveCell: emptyMask(),
      innerBoundaryMask: emptyMask(),
      outerBoundaryMask: emptyMask(),
      donorInnerContactCount: 0,
      donorOuterContactCount: 0,
    })).toBeUndefined();
  });
});
