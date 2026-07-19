import { describe, expect, it } from 'vitest';

import {
  resolveCastleLabelOcclusionBounds,
  resolveCastleLabelScreenAnchor,
  resolveStableCastleLabelEnvelope
} from '../src/components/realm/createRealmScene';
import type { CastleLod } from '../src/components/realm/castleInstancePlanning';
import {
  createCastleBoundsProjectionEnvelope
} from '../src/components/realm/realmCastleProjectionGeometry';
import {
  CASTLE_LABEL_COMPACT_VIEWPORT_MAX_WIDTH,
  CASTLE_LABEL_GAP_PIXELS,
  CASTLE_LABEL_LAYOUT_MAX_CASTLES,
  castleProfileIdentityReady,
  castleProfileLabel,
  castleProfileMonogram,
  fallbackCastleProjection,
  farcasterProfileUrl,
  formatPublicMarkMicros,
  publicProfileForCastle,
  realmCastleProjectionFrameKey,
  resolvePersistentCastleLabels,
  safeRealmProfileImageUrl,
  sectorForRealmCoord
} from '../src/components/realm/realmCastlePresentation';
import type { WarpkeepRealmProfile } from '../src/spacetime/warpkeepBackendTypes';

describe('realm castle public presentation', () => {
  it('uses safe fallbacks and strips directional/control characters from legacy player data', () => {
    const profile = publicProfileForCastle(42, [], [{
      fid: 42,
      username: '\u202ealice\u200b\u206a',
      displayName: 'Alice\u0000\u00ad Keeper',
      pfpUrl: 'javascript:alert(1)',
      status: 'active'
    }]);

    expect(profile).toMatchObject({
      canonicalUsername: 'alice',
      displayName: 'Alice Keeper',
      communityStatsVisible: false
    });
    expect(profile).not.toHaveProperty('fid');
    expect(castleProfileLabel(profile)).toBe('@alice');
    expect(safeRealmProfileImageUrl(profile.pfpUrl)).toBeUndefined();
    expect(farcasterProfileUrl(profile.canonicalUsername))
      .toBe('https://farcaster.xyz/alice');
  });

  it('whitelists only Realm presentation fields from a fuller subscription profile', () => {
    const authoritative = {
      fid: 42,
      canonicalUsername: 'keeper',
      displayName: 'Fixture Keeper',
      pfpUrl: 'https://images.example/keeper.png',
      publicBio: 'Fixture public bio.',
      admittedAt: Date.UTC(2026, 6, 1),
      firstAuthenticatedAt: Date.UTC(2026, 6, 2),
      publicStatus: 'active',
      communityStatsVisible: true,
      totalSnapBurnedMicros: 200_000_000n,
      marksEarnedMicros: 200_000_000n,
      marksSpentMicros: 50_000_000n,
      marksBalanceMicros: 150_000_000n,
      marksPolicyVersion: 'fixture-policy-v1',
      updatedAt: Date.UTC(2026, 6, 3),
      operatorNote: 'fixture-only'
    } satisfies WarpkeepRealmProfile & Readonly<{
      updatedAt: number;
      operatorNote: string;
    }>;

    expect(publicProfileForCastle(42, [authoritative], [])).toStrictEqual({
      canonicalUsername: 'keeper',
      displayName: 'Fixture Keeper',
      pfpUrl: 'https://images.example/keeper.png',
      publicBio: 'Fixture public bio.',
      communityStatsVisible: true,
      totalSnapBurnedMicros: 200_000_000n,
      marksBalanceMicros: 150_000_000n
    });

    expect(publicProfileForCastle(42, [{
      ...authoritative,
      communityStatsVisible: false
    }], [])).toStrictEqual({
      canonicalUsername: 'keeper',
      displayName: 'Fixture Keeper',
      pfpUrl: 'https://images.example/keeper.png',
      publicBio: 'Fixture public bio.',
      communityStatsVisible: false
    });

    const cleared = publicProfileForCastle(42, [{
      ...authoritative,
      canonicalUsername: '',
      displayName: '',
      pfpUrl: '',
      publicBio: ''
    }], [{
      fid: 42,
      username: 'player-fallback',
      displayName: 'Player Fallback',
      pfpUrl: 'https://images.example/player.png',
      status: 'active'
    }], {
      fid: 42,
      username: 'tab-local-fallback',
      displayName: 'Tab Local Fallback',
      pfpUrl: 'https://images.example/tab-local.png'
    });
    expect(cleared).toStrictEqual({
      canonicalUsername: undefined,
      displayName: undefined,
      pfpUrl: undefined,
      publicBio: undefined,
      communityStatsVisible: true,
      totalSnapBurnedMicros: 200_000_000n,
      marksBalanceMicros: 150_000_000n
    });
    expect(castleProfileIdentityReady(cleared)).toBe(false);
    expect(castleProfileLabel(cleared)).toBe('Hegemony Keep');
    expect(castleProfileMonogram(cleared)).toBe('W');
    expect(castleProfileIdentityReady({
      canonicalUsername: 'player-fallback',
      communityStatsVisible: false
    })).toBe(true);
    expect(castleProfileIdentityReady({
      displayName: 'Display Name Only',
      communityStatsVisible: false
    })).toBe(true);
    expect(castleProfileLabel({
      displayName: 'Display Name Only',
      communityStatsVisible: false
    })).toBe('Display Name Only');
    expect(castleProfileLabel({
      communityStatsVisible: false
    })).toBe('Hegemony Keep');
  });

  it('accepts credential-free HTTPS portraits and rejects unsafe profile links', () => {
    expect(safeRealmProfileImageUrl('https://images.example/a.png#tracking'))
      .toBe('https://images.example/a.png');
    expect(safeRealmProfileImageUrl('https://name:secret@images.example/a.png'))
      .toBeUndefined();
    expect(safeRealmProfileImageUrl('data:image/png;base64,AA==')).toBeUndefined();
    expect(safeRealmProfileImageUrl(`https://images.example/${'a'.repeat(2_100)}`))
      .toBeUndefined();
    expect(farcasterProfileUrl('../unsafe')).toBeUndefined();
  });

  it('formats u128-scale Mark micros exactly without floating point', () => {
    expect(formatPublicMarkMicros(123_456_789n)).toBe('123.456789');
    expect(formatPublicMarkMicros(12_345_000_000n)).toBe('12,345');
    expect(formatPublicMarkMicros(-1n)).toBeUndefined();
  });

  it('matches the deterministic six-sector world convention', () => {
    expect(sectorForRealmCoord({ q: 0, r: 0 })).toBe(0);
    expect(sectorForRealmCoord({ q: 1, r: 0 })).toBe(1);
    expect(sectorForRealmCoord({ q: 0, r: 1 })).toBe(2);
    expect(sectorForRealmCoord({ q: -1, r: 1 })).toBe(3);
    expect(sectorForRealmCoord({ q: -1, r: 0 })).toBe(4);
    expect(sectorForRealmCoord({ q: 0, r: -1 })).toBe(5);
    expect(sectorForRealmCoord({ q: 1, r: -1 })).toBe(6);
  });

  it('keeps all 100 founded identities direct even when every foundation overlaps', () => {
    const castles = Array.from({ length: CASTLE_LABEL_LAYOUT_MAX_CASTLES }, (_, index) => ({
      castleId: index + 1,
      q: index,
      r: 0,
      x: 400,
      y: 280,
      distance: index + 1,
      visible: true
    }));

    const resolved = resolvePersistentCastleLabels({
      width: 1_440,
      height: 900,
      castles
    });

    expect(resolved).toHaveLength(CASTLE_LABEL_LAYOUT_MAX_CASTLES);
    expect(resolved.map((label) => label.castleId))
      .toEqual(castles.map((castle) => castle.castleId));
    expect(resolved.every((label) => (
      label.x === 400
      && label.y === 280
      && label.x === label.projectedAnchor.x
      && label.y === label.projectedAnchor.y
      && label.compact === false
    ))).toBe(true);
  });

  it('keeps identity membership and presentation stable across zoom and LOD envelopes', () => {
    const frame = (
      distance: number,
      castleBounds = { left: 360, top: 180, right: 440, bottom: 300 }
    ) => ({
      width: 1_440,
      height: 900,
      castles: [
        {
          castleId: 1,
          q: 0,
          r: 0,
          x: 400,
          y: 306,
          distance,
          visible: true,
          castleBounds
        },
        {
          castleId: 2,
          q: 1,
          r: 0,
          x: 400,
          y: 306,
          distance: distance + 1,
          visible: true,
          castleBounds
        }
      ]
    });
    const close = resolvePersistentCastleLabels(frame(8));
    const far = resolvePersistentCastleLabels(frame(800));
    const lodSwap = resolvePersistentCastleLabels(frame(800, {
      left: 358,
      top: 182,
      right: 442,
      bottom: 300
    }));

    for (const labels of [close, far, lodSwap]) {
      expect(labels.map(({ castleId }) => castleId)).toEqual([1, 2]);
      expect(labels.every(({ compact }) => compact === false)).toBe(true);
      expect(labels.every((label) => (
        label.x === label.projectedAnchor.x
        && label.y === label.projectedAnchor.y
      ))).toBe(true);
    }
    expect(realmCastleProjectionFrameKey(frame(8)))
      .toBe(realmCastleProjectionFrameKey(frame(800)));
    expect(realmCastleProjectionFrameKey(frame(800)))
      .not.toBe(realmCastleProjectionFrameKey(frame(800, {
        left: 358,
        top: 182,
        right: 442,
        bottom: 300
      })));
  });

  it('uses only the stable viewport breakpoint for compact presentation', () => {
    const castle = {
      castleId: 1,
      q: 0,
      r: 0,
      x: 200,
      y: 160,
      distance: 10_000,
      visible: true
    };
    const wide = resolvePersistentCastleLabels({
      width: CASTLE_LABEL_COMPACT_VIEWPORT_MAX_WIDTH + 1,
      height: 700,
      castles: [castle]
    });
    const compact = resolvePersistentCastleLabels({
      width: CASTLE_LABEL_COMPACT_VIEWPORT_MAX_WIDTH,
      height: 700,
      castles: [{ ...castle, distance: 1 }]
    });

    expect(wide[0]?.compact).toBe(false);
    expect(compact[0]?.compact).toBe(true);
  });

  it('removes invalid, duplicate, projection-invisible, or clipped castle controls', () => {
    const resolved = resolvePersistentCastleLabels({
      width: 320,
      height: 300,
      castles: [
        { castleId: 1, q: 0, r: 0, x: -20, y: 120, distance: 0, visible: true },
        { castleId: 1, q: 0, r: 0, x: 200, y: 120, distance: 0, visible: true },
        { castleId: 2, q: 1, r: 0, x: 200, y: 120, distance: 1, visible: false },
        { castleId: 3, q: 2, r: 0, x: Number.NaN, y: 120, distance: 2, visible: true },
        { castleId: 0, q: 3, r: 0, x: 200, y: 120, distance: 3, visible: true }
      ]
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      castleId: 1,
      compact: true,
      x: 200,
      y: 120,
      projectedAnchor: { x: 200, y: 120 }
    });
  });

  it('keeps the full conservative label rail inside the viewport', () => {
    const compact = resolvePersistentCastleLabels({
      width: 320,
      height: 300,
      castles: [
        { castleId: 1, q: 0, r: 0, x: 57, y: 120, distance: 0, visible: true },
        { castleId: 2, q: 1, r: 0, x: 58, y: 120, distance: 1, visible: true },
        { castleId: 3, q: 2, r: 0, x: 262, y: 120, distance: 2, visible: true },
        { castleId: 4, q: 3, r: 0, x: 263, y: 120, distance: 3, visible: true }
      ]
    });
    const wide = resolvePersistentCastleLabels({
      width: 1_000,
      height: 600,
      castles: [
        { castleId: 5, q: 0, r: 0, x: 83, y: 120, distance: 0, visible: true },
        { castleId: 6, q: 1, r: 0, x: 84, y: 120, distance: 1, visible: true },
        { castleId: 7, q: 2, r: 0, x: 916, y: 120, distance: 2, visible: true },
        { castleId: 8, q: 3, r: 0, x: 917, y: 120, distance: 3, visible: true }
      ]
    });

    expect(compact.map((label) => label.castleId)).toEqual([2, 3]);
    expect(wide.map((label) => label.castleId)).toEqual([6, 7]);
  });

  it('omits foundation rails conservatively obstructed by visible Realm UI', () => {
    const castles = [
      { castleId: 1, q: 0, r: 0, x: 220, y: 120, distance: 1, visible: true },
      { castleId: 2, q: 1, r: 0, x: 520, y: 320, distance: 2, visible: true }
    ];
    const resolved = resolvePersistentCastleLabels({
      width: 1_000,
      height: 600,
      castles
    }, {
      reservedRects: [{ left: 0, top: 0, right: 280, bottom: 220 }]
    });

    expect(resolved.map((label) => label.castleId)).toEqual([2]);
    expect(resolved[0]).toMatchObject({
      x: 520,
      y: 320,
      projectedAnchor: { x: 520, y: 320 }
    });
  });

  it('maps fallback base labels through the rendered SVG viewport and its aspect-fit letterbox', () => {
    const projection = fallbackCastleProjection(
      { castleId: 1, q: 0, r: 0 },
      { x: -20, y: -10, width: 40, height: 20 },
      { width: 1_000, height: 600 },
      { left: 200, top: 50, width: 400, height: 400 }
    );

    // A 2:1 viewBox meets inside the 400px square with 100px vertical bars.
    expect(projection.x).toBe(400);
    expect(projection.y).toBe(266);
    expect(projection.castleBounds).toEqual({
      left: 390,
      top: 240,
      right: 410,
      bottom: 260
    });
    expect(projection.conservativeCastleBounds).toEqual(projection.castleBounds);
  });

  it('anchors labels below the calibrated foundation while retaining conservative bounds separately', () => {
    const conservative = { left: 360, top: 180, right: 440, bottom: 300 };
    const bounds = resolveCastleLabelOcclusionBounds(conservative, 240);
    expect(bounds).toEqual({ left: 360, top: 240, right: 440, bottom: 300 });
    expect(conservative).toEqual({ left: 360, top: 180, right: 440, bottom: 300 });
    expect(resolveCastleLabelScreenAnchor(bounds, { x: 999, y: 999 })).toEqual({
      x: 400,
      y: 300 + CASTLE_LABEL_GAP_PIXELS
    });
    expect(resolveCastleLabelScreenAnchor(undefined, { x: 12, y: 34 })).toEqual({
      x: 12,
      y: 34
    });

    const fallback = fallbackCastleProjection(
      { castleId: 1, q: 0, r: 0 },
      { x: -20, y: -10, width: 40, height: 20 },
      { width: 1_000, height: 600 },
      { left: 200, top: 50, width: 400, height: 400 }
    );
    expect(fallback.x).toBe((fallback.castleBounds!.left + fallback.castleBounds!.right) / 2);
    expect(fallback.y).toBe(fallback.castleBounds!.bottom + CASTLE_LABEL_GAP_PIXELS);
    expect(fallback.conservativeCastleBounds).toEqual(fallback.castleBounds);
  });

  it('keeps the label envelope fixed while active model LOD changes', () => {
    const high = createCastleBoundsProjectionEnvelope({
      minX: -2,
      minY: 0,
      minZ: -2,
      maxX: 2,
      maxY: 4,
      maxZ: 2
    })!;
    const balanced = createCastleBoundsProjectionEnvelope({
      minX: -1.5,
      minY: 0,
      minZ: -1.5,
      maxX: 1.5,
      maxY: 3.5,
      maxZ: 1.5
    })!;
    const compact = createCastleBoundsProjectionEnvelope({
      minX: -1,
      minY: 0,
      minZ: -1,
      maxX: 1,
      maxY: 3,
      maxZ: 1
    })!;
    const envelopes = new Map<CastleLod, typeof high>([
      ['high', high],
      ['balanced', balanced],
      ['compact', compact]
    ]);

    const selectionsAcrossActiveLods = (['high', 'balanced', 'compact'] as const)
      .map((_activeLod) => resolveStableCastleLabelEnvelope(
        envelopes,
        { maximumLod: 'high' },
        compact
      ));

    expect(selectionsAcrossActiveLods).toEqual([high, high, high]);
    expect(resolveStableCastleLabelEnvelope(
      new Map(),
      { maximumLod: 'high' },
      compact
    )).toBe(compact);
  });

  it('does not invalidate projection coalescing for a pure camera-distance change', () => {
    const frame = (distance: number) => ({
      width: 1_440,
      height: 900,
      castles: [{
        castleId: 1,
        q: 0,
        r: 0,
        x: 720,
        y: 450,
        distance,
        visible: true,
        castleBounds: { left: 680, top: 390, right: 760, bottom: 500 }
      }]
    });

    expect(realmCastleProjectionFrameKey(frame(10)))
      .toBe(realmCastleProjectionFrameKey(frame(10_000)));
    expect(realmCastleProjectionFrameKey({
      ...frame(10),
      castles: frame(10).castles.map((castle) => ({ ...castle, presented: true }))
    })).not.toBe(realmCastleProjectionFrameKey({
      ...frame(10),
      castles: frame(10).castles.map((castle) => ({ ...castle, presented: false }))
    }));
  });

  it('retains tenth-pixel camera motion while coalescing imperceptible jitter', () => {
    const frame = (x: number) => ({
      width: 1_440,
      height: 900,
      castles: [{
        castleId: 1,
        q: 0,
        r: 0,
        x,
        y: 450,
        distance: 10,
        visible: true,
        presented: true
      }]
    });

    expect(realmCastleProjectionFrameKey(frame(720)))
      .toBe(realmCastleProjectionFrameKey(frame(720.04)));
    expect(realmCastleProjectionFrameKey(frame(720)))
      .not.toBe(realmCastleProjectionFrameKey(frame(720.06)));
  });
});
