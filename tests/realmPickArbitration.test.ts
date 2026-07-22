import { describe, expect, it } from 'vitest';

import {
  arbitrateRealmPick,
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
      castleHit: { castleId: 77, coord: { q: 0, r: 0 } },
      terrainHit: { coord: { q: 2, r: 0 } }
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
            distance: 0.1
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
        castleHit: { castleId: 77, coord: { q: 0, r: 0 } },
        terrainHit: { coord: { q: 1, r: 0 } }
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
        castleHit: { castleId: 91, coord: { q: 0, r: 0 } },
        terrainHit: { coord: { q: 0, r: 0 } }
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
      terrainHit: { coord: { q: 0, r: 0 } }
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
      terrainHit: { coord: { q: -2, r: 1 } }
    })).toEqual({ kind: 'terrain', coord: { q: -2, r: 1 } });
  });
});
