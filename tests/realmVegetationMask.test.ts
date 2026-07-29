import { describe, expect, it } from 'vitest';

import { axialToWorld, hexDisc, hexKey } from '../src/game/map/hexCoordinates';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import { createRealmVegetationMask } from '../src/game/map/realmVegetationMask';

describe('Realm vegetation clearance mask', () => {
  it('uses exact full-cell Water, adjacent banks, live routes, keeps, and resource circles', () => {
    const playableKeys = new Set(hexDisc({ q: 0, r: 0 }, 10).map(hexKey));
    const occupied = createHegemonyCastlePlacements([
      { id: 'occupied-keep', coord: { q: 2, r: -1 } }
    ]);
    const resourceCenter = axialToWorld({ q: -3, r: 2 }, 1);
    const mask = createRealmVegetationMask({
      playableKeys,
      placements: occupied,
      circles: [{ id: 'resource:stone', world: resourceCenter, radius: 0.45 }],
      routePaths: [{
        id: 'worker:1',
        coords: [
          { q: 0, r: 6 },
          { q: 0, r: 7 },
          { q: 0, r: 8 }
        ]
      }],
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
    const riverInterior = {
      x: riverCenter.x - 0.28,
      z: riverCenter.z + 0.16
    };
    const riverCellEdge = {
      x: riverCenter.x - 0.62,
      z: riverCenter.z + 0.36
    };
    expect(mask.isGrassExcluded(riverInterior)).toBe(true);
    expect(mask.isTreeExcluded(riverInterior)).toBe(true);
    expect(mask.isGrassExcluded(riverCellEdge)).toBe(true);
    expect(mask.isTreeExcluded(riverCellEdge)).toBe(true);
    const adjacentLandCenter = axialToWorld({ q: -3, r: 1 }, 1);
    const sharedEdge = {
      x: (riverCenter.x + adjacentLandCenter.x) * 0.5,
      z: (riverCenter.z + adjacentLandCenter.z) * 0.5
    };
    const bankProbe = {
      x: sharedEdge.x + (adjacentLandCenter.x - sharedEdge.x) * 0.18,
      z: sharedEdge.z + (adjacentLandCenter.z - sharedEdge.z) * 0.18
    };
    expect(mask.isGrassExcluded(bankProbe)).toBe(true);
    expect(mask.isTreeExcluded(bankProbe)).toBe(true);
    expect(mask.isGrassExcluded(adjacentLandCenter)).toBe(false);
    expect(mask.isTreeExcluded(adjacentLandCenter)).toBe(false);
    expect(mask.isGrassExcluded(axialToWorld({ q: 0, r: 7 }, 1))).toBe(true);
    const routeCenter = axialToWorld({ q: 0, r: 7 }, 1);
    expect(mask.isGrassExcluded({ x: routeCenter.x + 0.4, z: routeCenter.z })).toBe(false);
    expect(mask.isTreeExcluded(axialToWorld({ q: 2, r: -1 }, 1))).toBe(true);
    expect(mask.isGrassExcluded(resourceCenter)).toBe(true);
    expect(mask.telemetry).toMatchObject({
      oceanCellCount: 1,
      riverCellCount: 2,
      riverChannelBodyCount: 1,
      riverFallbackBodyCount: 0,
      riverFallbackCellCount: 0,
      riverSegmentCount: 3,
      riverFullCellExclusionCount: 2,
      riverBankEdgeCount: 10,
      routePathCount: 1,
      rejectedRoutePathCount: 0,
      clearanceCircleCount: 2
    });
    expect(mask.telemetry.routeSegmentCount).toBe(2);
  });

  it('is stable under input permutations', () => {
    const keys = hexDisc({ q: 0, r: 0 }, 7).map(hexKey);
    const water = [
      { cellKey: '3,-2', q: 3, r: -2, regime: 'river' as const, bodyId: 'river', riverOrder: 1 },
      { cellKey: '3,-3', q: 3, r: -3, regime: 'river' as const, bodyId: 'river', riverOrder: 0 }
    ];
    const routes = [
      {
        id: 'worker:b',
        coords: [{ q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }]
      },
      {
        id: 'worker:a',
        coords: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]
      }
    ];
    const first = createRealmVegetationMask({
      playableKeys: new Set(keys),
      waterCells: water,
      routePaths: routes
    });
    const reversed = createRealmVegetationMask({
      playableKeys: new Set([...keys].reverse()),
      waterCells: [...water].reverse(),
      routePaths: [...routes].reverse()
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

  it('never invents permanent roads and rejects malformed route paths as one unit', () => {
    const playableKeys = new Set(hexDisc({ q: 0, r: 0 }, 8).map(hexKey));
    const empty = createRealmVegetationMask({ playableKeys });
    const syntheticSpoke = axialToWorld({ q: 0, r: 7 }, 1);

    expect(empty.isGrassExcluded(syntheticSpoke)).toBe(false);
    expect(empty.isTreeExcluded(syntheticSpoke)).toBe(false);
    expect(empty.telemetry).toMatchObject({
      routePathCount: 0,
      routeSegmentCount: 0,
      rejectedRoutePathCount: 0
    });

    const malformed = createRealmVegetationMask({
      playableKeys,
      routePaths: [
        {
          id: 'jumping-worker',
          coords: [{ q: 0, r: 0 }, { q: 0, r: 3 }]
        },
        {
          id: 'outside-worker',
          coords: [{ q: 0, r: 0 }, { q: 9, r: 0 }]
        }
      ]
    });

    expect(malformed.telemetry).toMatchObject({
      routePathCount: 0,
      routeSegmentCount: 0,
      rejectedRoutePathCount: 2
    });
    expect(malformed.isGrassExcluded(axialToWorld({ q: 0, r: 1 }, 1))).toBe(false);
  });

  it('deduplicates shared live segments without changing path acceptance truth', () => {
    const playableKeys = new Set(hexDisc({ q: 0, r: 0 }, 4).map(hexKey));
    const mask = createRealmVegetationMask({
      playableKeys,
      routePaths: [
        {
          id: 'worker:1',
          coords: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]
        },
        {
          id: 'worker:2',
          coords: [{ q: 2, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }]
        }
      ]
    });

    expect(mask.telemetry).toMatchObject({
      routePathCount: 2,
      routeSegmentCount: 3,
      rejectedRoutePathCount: 0
    });
    expect(mask.isGrassExcluded(axialToWorld({ q: 1, r: 0 }, 1))).toBe(true);
  });

  it('uses exact full-cell vegetation exclusion for a malformed river body fallback', () => {
    const playableKeys = new Set(hexDisc({ q: 0, r: 0 }, 8).map(hexKey));
    const mask = createRealmVegetationMask({
      playableKeys,
      waterCells: [
        {
          cellKey: '2,0',
          q: 2,
          r: 0,
          regime: 'river',
          bodyId: 'river:broken',
          riverOrder: 0,
          downstreamWaterCellKey: 'wrong'
        },
        {
          cellKey: '3,0',
          q: 3,
          r: 0,
          regime: 'river',
          bodyId: 'river:broken',
          riverOrder: 1
        }
      ]
    });
    const center = axialToWorld({ q: 2, r: 0 }, 1);
    expect(mask.isGrassExcluded({ x: center.x + 0.7, z: center.z })).toBe(true);
    expect(mask.isTreeExcluded({ x: center.x + 0.7, z: center.z })).toBe(true);
    expect(mask.telemetry).toMatchObject({
      riverCellCount: 2,
      riverChannelBodyCount: 0,
      riverFallbackBodyCount: 1,
      riverFallbackCellCount: 2,
      riverSegmentCount: 0,
      riverFullCellExclusionCount: 2,
      riverBankEdgeCount: 10
    });
  });
});
