import { describe, expect, it } from 'vitest';

import { axialToWorld, hexDisc, hexKey } from '../src/game/map/hexCoordinates';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import { createRealmVegetationMask } from '../src/game/map/realmVegetationMask';

describe('Realm vegetation clearance mask', () => {
  it('uses exact ocean cells, narrow river/route ribbons, occupied keeps, and resource circles', () => {
    const playableKeys = new Set(hexDisc({ q: 0, r: 0 }, 10).map(hexKey));
    const occupied = createHegemonyCastlePlacements([
      { id: 'occupied-keep', coord: { q: 2, r: -1 } }
    ]);
    const resourceCenter = axialToWorld({ q: -3, r: 2 }, 1);
    const mask = createRealmVegetationMask({
      playableKeys,
      placements: occupied,
      circles: [{ id: 'resource:stone', world: resourceCenter, radius: 0.45 }],
      waterCells: [
        { cellKey: '8,0', q: 8, r: 0, regime: 'ocean' },
        { cellKey: '4,-2', q: 4, r: -2, regime: 'lake' },
        { cellKey: '-4,1', q: -4, r: 1, regime: 'river', bodyId: 'river:a', riverOrder: 0 },
        { cellKey: '-4,2', q: -4, r: 2, regime: 'river', bodyId: 'river:a', riverOrder: 1 }
      ]
    });

    expect(mask.isGrassExcluded(axialToWorld({ q: 8, r: 0 }, 1))).toBe(true);
    expect(mask.isGrassExcluded(axialToWorld({ q: 4, r: -2 }, 1))).toBe(true);
    expect(mask.isGrassExcluded(axialToWorld({ q: -4, r: 1 }, 1))).toBe(true);
    const riverCenter = axialToWorld({ q: -4, r: 1 }, 1);
    const riverEdge = {
      x: riverCenter.x - Math.sqrt(3) * 0.35,
      z: riverCenter.z + 0.35
    };
    expect(mask.isGrassExcluded(riverEdge)).toBe(true);
    expect(mask.isTreeExcluded(riverEdge)).toBe(true);
    expect(mask.isGrassExcluded(axialToWorld({ q: 0, r: 7 }, 1))).toBe(true);
    const routeCenter = axialToWorld({ q: 0, r: 7 }, 1);
    expect(mask.isGrassExcluded({ x: routeCenter.x + 0.4, z: routeCenter.z })).toBe(false);
    expect(mask.isTreeExcluded(axialToWorld({ q: 2, r: -1 }, 1))).toBe(true);
    expect(mask.isGrassExcluded(resourceCenter)).toBe(true);
    expect(mask.telemetry).toMatchObject({
      oceanCellCount: 1,
      riverCellCount: 2,
      riverSegmentCount: 1,
      clearanceCircleCount: 2
    });
    expect(mask.telemetry.routeSegmentCount).toBeGreaterThan(0);
  });

  it('is stable under input permutations', () => {
    const keys = hexDisc({ q: 0, r: 0 }, 7).map(hexKey);
    const water = [
      { cellKey: '3,-2', q: 3, r: -2, regime: 'river' as const, bodyId: 'river', riverOrder: 1 },
      { cellKey: '3,-3', q: 3, r: -3, regime: 'river' as const, bodyId: 'river', riverOrder: 0 }
    ];
    const first = createRealmVegetationMask({ playableKeys: new Set(keys), waterCells: water });
    const reversed = createRealmVegetationMask({
      playableKeys: new Set([...keys].reverse()),
      waterCells: [...water].reverse()
    });
    const probes = [
      axialToWorld({ q: 0, r: 5 }, 1),
      axialToWorld({ q: 3, r: -2 }, 1),
      axialToWorld({ q: 2, r: 2 }, 1)
    ];

    expect(reversed.telemetry).toEqual(first.telemetry);
    expect(probes.map(first.isGrassExcluded)).toEqual(probes.map(reversed.isGrassExcluded));
    expect(probes.map(first.isTreeExcluded)).toEqual(probes.map(reversed.isTreeExcluded));
  });
});
