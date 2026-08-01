import { describe, expect, it } from 'vitest';

import {
  arbitrateRealmPick,
  REALM_PICK_OVERLAP_DEPTH_TOLERANCE,
  selectRealmResourceLayerHit,
  type RealmResourcePickKind
} from '../src/components/realm/realmPickArbitration';

const RESOURCE_KINDS = [
  'gold-site',
  'food-site',
  'wood-site',
  'stone-site'
] as const satisfies readonly RealmResourcePickKind[];

describe('realm scene pick arbitration', () => {
  it('gives a worker identity lane priority over resource and castle colliders', () => {
    expect(arbitrateRealmPick({
      workerHits: [
        { workerId: 'worker-far', workerOrdinal: 2, originCastleId: 77, coord: { q: 2, r: 0 }, distance: 20 },
        { workerId: 'worker-invalid', workerOrdinal: 3, originCastleId: 77, coord: { q: 3, r: 0 }, distance: -1 },
        { workerId: 'worker-1', workerOrdinal: 1, originCastleId: 77, coord: { q: 1, r: 0 }, distance: 2 }
      ],
      resourceHits: [],
      castleHit: { castleId: 77, coord: { q: 0, r: 0 }, distance: 2.3 },
      terrainHit: { coord: { q: 2, r: 0 }, distance: 2.5 }
    })).toEqual({ kind: 'worker', workerId: 'worker-1', workerOrdinal: 1, originCastleId: 77, coord: { q: 1, r: 0 } });
  });

  it.each(RESOURCE_KINDS)(
    'lets the nearest moving %s wagon win over castle, static site, and terrain',
    (kind) => {
      expect(arbitrateRealmPick({
        resourceHits: [
          {
            kind,
            siteId: `${kind}:static`,
            coord: { q: 3, r: -1 },
            source: 'site',
            distance: 2.4
          },
          {
            kind: kind === 'gold-site' ? 'food-site' : 'gold-site',
            siteId: 'other-moving-wagon',
            coord: { q: 5, r: -2 },
            source: 'wagon',
            distance: 8
          },
          {
            kind,
            siteId: `${kind}:wagon`,
            coord: { q: 4, r: -2 },
            source: 'wagon',
            distance: 3
          }
        ],
        castleHit: { castleId: 77, coord: { q: 0, r: 0 }, distance: 3.1 },
        terrainHit: { coord: { q: 1, r: 0 }, distance: 3.2 }
      })).toEqual({
        kind,
        siteId: `${kind}:wagon`,
        coord: { q: 4, r: -2 },
        source: 'wagon'
      });
    }
  );

  it.each(RESOURCE_KINDS)(
    'never lets a static %s collider steal a castle pick',
    (kind) => {
      expect(arbitrateRealmPick({
        resourceHits: [{
          kind,
          siteId: `${kind}:static`,
          coord: { q: 0, r: 0 },
          source: 'site',
          distance: 0.01
        }],
        castleHit: { castleId: 91, coord: { q: 0, r: 0 }, distance: 0.5 },
        terrainHit: { coord: { q: 0, r: 0 }, distance: 0.6 }
      })).toEqual({ kind: 'castle', castleId: 91, coord: { q: 0, r: 0 } });
    }
  );

  it('chooses the nearest static site only after wagon and castle lanes are empty', () => {
    expect(arbitrateRealmPick({
      resourceHits: RESOURCE_KINDS.map((kind, index) => ({
        kind,
        siteId: `${kind}:${index}`,
        coord: { q: index + 1, r: -index },
        source: 'site' as const,
        distance: 9 - index
      })),
      terrainHit: { coord: { q: 0, r: 0 }, distance: 6.4 }
    })).toEqual({
      kind: 'stone-site',
      siteId: 'stone-site:3',
      coord: { q: 4, r: -3 },
      source: 'site'
    });
  });

  it('falls through to terrain only when no foreground target exists', () => {
    expect(arbitrateRealmPick({
      resourceHits: [],
      terrainHit: { coord: { q: -2, r: 1 }, distance: 1 }
    })).toEqual({ kind: 'terrain', coord: { q: -2, r: 1 } });
  });

  it('places a visible water cell after static sites and before terrain', () => {
    expect(arbitrateRealmPick({
      resourceHits: [],
      waterHit: {
        cellKey: 'genesis-001:river:01:0001',
        bodyId: 'genesis-001:river:01',
        regime: 'river',
        coord: { q: 2, r: -1 },
        distance: 8
      },
      terrainHit: { coord: { q: 2, r: -1 }, distance: 8.2 }
    })).toEqual({
      kind: 'water-cell',
      cellKey: 'genesis-001:river:01:0001',
      bodyId: 'genesis-001:river:01',
      regime: 'river',
      coord: { q: 2, r: -1 }
    });
    expect(arbitrateRealmPick({
      resourceHits: [{
        kind: 'gold-site',
        siteId: 'gold-1',
        coord: { q: 2, r: -1 },
        source: 'site',
        distance: 12
      }],
      waterHit: {
        cellKey: 'ocean:1',
        bodyId: 'genesis-001:ocean',
        regime: 'ocean',
        coord: { q: 2, r: -1 },
        distance: 1
      }
    })).toEqual({
      kind: 'water-cell',
      cellKey: 'ocean:1',
      bodyId: 'genesis-001:ocean',
      regime: 'ocean',
      coord: { q: 2, r: -1 }
    });
  });

  it('does not let distant gameplay-priority colliders win through nearer features', () => {
    expect(arbitrateRealmPick({
      workerHits: [{
        workerId: 'worker-behind',
        workerOrdinal: 1,
        originCastleId: 77,
        coord: { q: 4, r: 0 },
        distance: 7
      }],
      resourceHits: [{
        kind: 'wood-site',
        siteId: 'wood-front',
        coord: { q: 1, r: 0 },
        source: 'site',
        distance: 2
      }],
      castleHit: { castleId: 77, coord: { q: 0, r: 0 }, distance: 6 },
      terrainHit: { coord: { q: 1, r: 0 }, distance: 2.2 }
    })).toEqual({
      kind: 'wood-site',
      siteId: 'wood-front',
      coord: { q: 1, r: 0 },
      source: 'site'
    });

    expect(arbitrateRealmPick({
      resourceHits: [{
        kind: 'stone-site',
        siteId: 'stone-behind-ridge',
        coord: { q: 3, r: -1 },
        source: 'wagon',
        distance: 4
      }],
      terrainHit: { coord: { q: 1, r: 0 }, distance: 1 }
    })).toEqual({ kind: 'terrain', coord: { q: 1, r: 0 } });
  });

  it('retains gameplay priority at the overlap boundary only', () => {
    const site = {
      kind: 'gold-site' as const,
      siteId: 'site',
      coord: { q: 1, r: 0 },
      source: 'site' as const,
      distance: 3
    };
    const overlappingWagon = {
      ...site,
      source: 'wagon' as const,
      distance: 3 + REALM_PICK_OVERLAP_DEPTH_TOLERANCE
    };
    expect(selectRealmResourceLayerHit(site, overlappingWagon)?.source).toBe('wagon');
    expect(selectRealmResourceLayerHit(site, {
      ...overlappingWagon,
      distance: overlappingWagon.distance + 0.000_001
    })?.source).toBe('site');
  });
});
