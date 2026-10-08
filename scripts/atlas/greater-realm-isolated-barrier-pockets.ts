import { GREATER_REALM_BIOME_ID } from './greater-realm-biomes';
import type { IndexedAxialGrid } from './greater-realm-terrain';

/** Close only isolated geological pockets before authoritative barrier audits.
 * Planned marshes affect the need for repair, never the retained water mask.
 * An isolated cell cannot carry a same-region route or split a component.
 */
export function sealGreaterRealmIsolatedBarrierPockets(input: Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  tierId: Uint8Array;
  waterRegime: Uint8Array;
  plannedBiomeId: Uint8Array;
  barrier: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  legacyProtectedCell: Uint8Array;
  legacyReserveCell: Uint8Array;
  tierTwoSpineOwner: Int8Array;
  repairImmutableCell?: Uint8Array;
  protectedApproachCells: ReadonlySet<number>;
  gates: readonly Readonly<{
    firstCell: number;
    secondCell: number;
    firstApproachPath: readonly number[];
    firstAlternateApproachPath: readonly number[];
    secondApproachPath: readonly number[];
    secondAlternateApproachPath: readonly number[];
  }>[];
}>): number {
  for (const field of [input.regionId, input.tierId, input.waterRegime,
    input.plannedBiomeId, input.barrier, input.geologicalBarrierBand,
    input.legacyProtectedCell, input.legacyReserveCell, input.tierTwoSpineOwner,
    ...(input.repairImmutableCell ? [input.repairImmutableCell] : [])]) {
    if (field.length !== input.grid.cellCount) throw new Error('GREATER_REALM_ISOLATED_POCKET_SHAPE_INVALID');
  }
  const protectedCells = new Set(input.protectedApproachCells);
  const counts = new Uint32Array(10);
  const tendrils = new Uint32Array(10);
  const passable = (cell: number) => input.barrier[cell] === 0
    && (input.waterRegime[cell] === 0 || input.waterRegime[cell] === 3 || input.waterRegime[cell] === 4);
  const projectedPassable = (cell: number) => passable(cell)
    && (protectedCells.has(cell) || (
      input.plannedBiomeId[cell] !== GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
      && input.plannedBiomeId[cell] !== GREATER_REALM_BIOME_ID.SALT_MARSH
    ));
  try {
    for (const gate of input.gates) {
      protectedCells.add(gate.firstCell);
      protectedCells.add(gate.secondCell);
      for (const path of [gate.firstApproachPath, gate.firstAlternateApproachPath,
        gate.secondApproachPath, gate.secondAlternateApproachPath]) {
        for (const cell of path) protectedCells.add(cell);
      }
    }
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (!projectedPassable(cell)) continue;
      const region = input.regionId[cell]!;
      counts[region] = counts[region]! + 1;
      let degree = 0;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = input.grid.neighbors[cell * 6 + direction]!;
        if (neighbor >= 0 && input.regionId[neighbor] === region && projectedPassable(neighbor)) degree += 1;
      }
      if (degree <= 1) tendrils[region] = tendrils[region]! + 1;
    }
    let sealed = 0;
    for (let region = 6; region < 9; region += 1) {
      for (let cell = 0; cell < input.grid.cellCount && sealed < 4; cell += 1) {
        if (counts[region] === 0 || Math.round(tendrils[region]! * 10_000 / counts[region]!) <= 150) break;
        if (input.regionId[cell] !== region || !projectedPassable(cell)
          || input.geologicalBarrierBand[cell] !== 1
          || input.legacyProtectedCell[cell] === 1 || input.legacyReserveCell[cell] === 1
          || input.repairImmutableCell?.[cell] === 1 || protectedCells.has(cell)
          || counts[region]! - 1 <= counts[9]!) continue;
        let isolated = true;
        let crossTierBoundary = false;
        for (let direction = 0; direction < 6; direction += 1) {
          const neighbor = input.grid.neighbors[cell * 6 + direction]!;
          if (neighbor < 0) continue;
          if (input.tierId[neighbor] !== input.tierId[cell]) crossTierBoundary = true;
          if (input.regionId[neighbor] === region && passable(neighbor)) isolated = false;
        }
        if (!isolated || (input.tierTwoSpineOwner[cell]! >= 0 && !crossTierBoundary)) continue;
        input.barrier[cell] = 1;
        counts[region] = counts[region]! - 1;
        tendrils[region] = tendrils[region]! - 1;
        sealed += 1;
      }
    }
    return sealed;
  } finally {
    protectedCells.clear();
    counts.fill(0);
    tendrils.fill(0);
  }
}
