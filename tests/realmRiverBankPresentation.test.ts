import { describe, expect, it } from 'vitest';

import {
  createRealmRiverBankPresentation,
  type RealmRiverBankWaterCell
} from '../src/game/map/realmRiverBankPresentation';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { pointyHexCorners } from '../src/components/realm/createTerrainGeometry';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1
} from '../spacetimedb/src/waterRevision';

const CELLS: readonly RealmRiverBankWaterCell[] = Object.freeze([
  Object.freeze({ cellKey: '0,0', q: 0, r: 0, regime: 'river' }),
  Object.freeze({ cellKey: '1,0', q: 1, r: 0, regime: 'river' }),
  Object.freeze({ cellKey: '2,0', q: 2, r: 0, regime: 'river' }),
  Object.freeze({ cellKey: '3,0', q: 3, r: 0, regime: 'ocean' })
]);

describe('full-cell river bank presentation', () => {
  it('covers every canonical river center, corner, and edge midpoint', () => {
    const presentation = createRealmRiverBankPresentation(CELLS, 1);
    CELLS.filter((cell) => cell.regime === 'river').forEach((cell) => {
      const center = axialToWorld(cell, 1);
      const corners = pointyHexCorners(cell, 1);
      const probes = [
        center,
        ...corners.map((corner) => ({
          x: center.x + (corner.x - center.x) * 0.999,
          z: center.z + (corner.z - center.z) * 0.999
        })),
        ...corners.map((corner, index) => {
          const next = corners[(index + 1) % corners.length]!;
          return {
            x: center.x + ((corner.x + next.x) * 0.5 - center.x) * 0.999,
            z: center.z + ((corner.z + next.z) * 0.5 - center.z) * 0.999
          };
        })
      ];
      expect(
        probes.every((probe) => presentation.isFullCellWater(probe)),
        cell.cellKey
      ).toBe(true);
    });
    expect(presentation.telemetry).toMatchObject({
      riverCellCount: 3,
      fullCellWaterCount: 4,
      riverSharedEdgeCount: 2,
      riverMouthEdgeCount: 1,
      invalidWaterCellCount: 0
    });
  });

  it('places bounded wet-bank influence only on adjacent land', () => {
    const presentation = createRealmRiverBankPresentation(CELLS, 1);
    const riverCenter = axialToWorld({ q: 1, r: 0 }, 1);
    const landCenter = axialToWorld({ q: 1, r: -1 }, 1);
    const sharedEdge = {
      x: (riverCenter.x + landCenter.x) * 0.5,
      z: (riverCenter.z + landCenter.z) * 0.5
    };
    const nearBank = {
      x: sharedEdge.x + (landCenter.x - sharedEdge.x) * 0.16,
      z: sharedEdge.z + (landCenter.z - sharedEdge.z) * 0.16
    };

    expect(presentation.bankInfluenceAtWorld(riverCenter)).toBe(0);
    expect(presentation.bankInfluenceAtWorld(sharedEdge, 0.36)).toBe(1);
    expect(presentation.bankInfluenceAtWorld(nearBank, 0.36)).toBeGreaterThan(0);
    expect(presentation.bankInfluenceAtWorld(nearBank, 0.36)).toBeLessThanOrEqual(1);
    expect(presentation.bankInfluenceAtWorld(landCenter, 0.36)).toBe(0);
  });

  it('is permutation-stable and reports invalid rows without inventing edges', () => {
    const invalid = Object.freeze({
      cellKey: 'wrong',
      q: 8,
      r: 8,
      regime: 'river' as const
    });
    const first = createRealmRiverBankPresentation([...CELLS, invalid], 1);
    const reversed = createRealmRiverBankPresentation(
      [invalid, ...[...CELLS].reverse()],
      1
    );

    expect(reversed.telemetry).toEqual(first.telemetry);
    expect(first.telemetry.invalidWaterCellCount).toBe(1);
    expect(first.edgesForRiverCell('wrong')).toHaveLength(6);
    expect(first.isFullCellWater(axialToWorld({ q: 8, r: 8 }, 1))).toBe(true);
    CELLS.forEach((cell) => {
      expect(reversed.edgesForRiverCell(cell.cellKey))
        .toEqual(first.edgesForRiverCell(cell.cellKey));
    });
  });

  it('accounts every edge in the complete canonical river catalog', () => {
    const presentation = createRealmRiverBankPresentation(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      1
    );
    const riverCells = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.filter(
      (cell) => cell.regime === 'river'
    );

    expect(riverCells).toHaveLength(400);
    expect(presentation.telemetry.riverCellCount).toBe(riverCells.length);
    expect(presentation.telemetry.invalidWaterCellCount).toBe(0);
    expect(presentation.telemetry.riverMouthEdgeCount).toBe(23);
    expect(riverCells.every((cell) => (
      presentation.edgesForRiverCell(cell.cellKey).length === 6
    ))).toBe(true);
    expect(
      presentation.telemetry.riverBoundaryEdgeCount
        + presentation.telemetry.riverSharedEdgeCount * 2
        + presentation.telemetry.riverMouthEdgeCount
    ).toBe(riverCells.length * 6);
  });
});
