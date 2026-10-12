import { describe, expect, it } from 'vitest';
import { GREATER_REALM_BIOME_ID } from '../scripts/atlas/greater-realm-biomes';
import { sealGreaterRealmIsolatedBarrierPockets } from '../scripts/atlas/greater-realm-isolated-barrier-pockets';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';

function fixture(radius = 4, pockets = 1) {
  const cells: { q: number; r: number }[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius) cells.push({ q, r });
    }
  }
  for (let i = 0; i < pockets; i += 1) cells.push({ q: 20 + i * 3, r: 0 });
  const grid = indexGreaterRealmAxialGrid(cells);
  const regionId = new Uint8Array(grid.cellCount).fill(6);
  const tierId = new Uint8Array(grid.cellCount).fill(2);
  const tierTwoSpineOwner = new Int8Array(grid.cellCount).fill(-1);
  const geologicalBarrierBand = new Uint8Array(grid.cellCount);
  const pocketCells = Array.from(grid.q, (q, cell) => q >= 20 ? cell : -1).filter(cell => cell >= 0);
  for (const cell of pocketCells) geologicalBarrierBand[cell] = 1;
  return {
    pocketCells,
    input: {
      grid, regionId, tierId, tierTwoSpineOwner, geologicalBarrierBand,
      waterRegime: new Uint8Array(grid.cellCount),
      plannedBiomeId: new Uint8Array(grid.cellCount),
      barrier: new Uint8Array(grid.cellCount),
      legacyProtectedCell: new Uint8Array(grid.cellCount),
      legacyReserveCell: new Uint8Array(grid.cellCount),
      repairImmutableCell: new Uint8Array(grid.cellCount),
      protectedApproachCells: new Set<number>(),
      gates: [],
    },
  };
}

describe('isolated geological barrier pockets', () => {
  it('closes an isolated pocket without changing water, ownership or connected land', () => {
    const { input, pocketCells } = fixture();
    const water = input.waterRegime.slice();
    const regions = input.regionId.slice();
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(1);
    expect(Array.from(input.barrier.entries()).filter(([, value]) => value === 1).map(([cell]) => cell)).toEqual(pocketCells);
    expect(input.waterRegime).toEqual(water);
    expect(input.regionId).toEqual(regions);
  });

  it('uses planned marsh conversion while leaving an already passing region unchanged', () => {
    const { input, pocketCells } = fixture(5);
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(0);
    const interior = Array.from(input.grid.q, (_, cell) => cell).filter(cell => !pocketCells.includes(cell));
    for (const cell of interior.slice(0, 40)) input.plannedBiomeId[cell] = GREATER_REALM_BIOME_ID.FRESHWATER_MARSH;
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(1);
    expect(input.waterRegime.every(value => value === 0)).toBe(true);
  });

  it.each(['legacyProtectedCell', 'legacyReserveCell', 'repairImmutableCell'] as const)('preserves %s', field => {
    const { input, pocketCells } = fixture();
    input[field][pocketCells[0]!] = 1;
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(0);
    expect(input.barrier.every(value => value === 0)).toBe(true);
  });

  it('preserves reviewed paths and interior capacity spines', () => {
    const { input, pocketCells } = fixture();
    input.protectedApproachCells.add(pocketCells[0]!);
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(0);
    input.protectedApproachCells.clear();
    input.tierTwoSpineOwner[pocketCells[0]!] = 6;
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(0);
  });

  it('never seals a connected cell or a pocket outside the geological band', () => {
    const { input, pocketCells } = fixture();
    input.geologicalBarrierBand.fill(1);
    input.geologicalBarrierBand[pocketCells[0]!] = 0;
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(0);
  });

  it('keeps the existing throne land ordering and bounds work', () => {
    const { input, pocketCells } = fixture(4, 5);
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(4);
    expect(pocketCells.filter(cell => input.barrier[cell] === 1)).toHaveLength(4);
    input.barrier.fill(0);
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (!pocketCells.includes(cell)) input.regionId[cell] = 9;
    }
    expect(sealGreaterRealmIsolatedBarrierPockets(input)).toBe(0);
  });
});
