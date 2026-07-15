import { describe, expect, it } from 'vitest';

import {
  resolveCastleLabelOcclusionBounds,
  resolveCastleLabelScreenAnchor
} from '../src/components/realm/createRealmScene';
import {
  CASTLE_LABEL_FAR_DISTANCE,
  CASTLE_LABEL_GAP_PIXELS,
  CASTLE_LABEL_LAYOUT_MAX_CASTLES,
  castleProfileIdentityReady,
  castleProfileLabel,
  fallbackCastleProjection,
  farcasterProfileUrl,
  formatPublicMarkMicros,
  publicProfileForCastle,
  realmCastleLabelLeaderGeometry,
  realmEligibleCastleProjectionCount,
  realmCastleProjectionFrameKey,
  resolveVisibleCastleLabels,
  safeRealmProfileImageUrl,
  sectorForRealmCoord
} from '../src/components/realm/realmCastlePresentation';
import type { WarpkeepRealmProfile } from '../src/spacetime/warpkeepBackendTypes';

describe('realm castle public presentation', () => {
  it('counts only finite, in-viewport, projection-visible castle identities', () => {
    expect(realmEligibleCastleProjectionCount({
      width: 400,
      height: 300,
      castles: [
        { castleId: 1, q: 0, r: 0, x: 0, y: 0, distance: 1, visible: true },
        { castleId: 2, q: 1, r: 0, x: 400, y: 300, distance: 2, visible: true },
        { castleId: 3, q: 2, r: 0, x: -1, y: 100, distance: 3, visible: true },
        { castleId: 4, q: 3, r: 0, x: 100, y: 100, distance: 4, visible: false },
        { castleId: 5, q: 4, r: 0, x: Number.NaN, y: 100, distance: 5, visible: true }
      ]
    })).toBe(2);
  });

  it('uses safe fallbacks and strips directional/control characters from legacy player data', () => {
    const profile = publicProfileForCastle(42, [], [{
      fid: 42,
      username: '\u202ealice\u200b',
      displayName: 'Alice\u0000 Keeper',
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

    expect(publicProfileForCastle(42, [{
      ...authoritative,
      canonicalUsername: '',
      displayName: '',
      pfpUrl: ''
    }], [{
      fid: 42,
      username: 'player-fallback',
      displayName: 'Player Fallback',
      pfpUrl: 'https://images.example/player.png',
      status: 'active'
    }])).toMatchObject({
      canonicalUsername: 'player-fallback',
      displayName: 'Player Fallback',
      pfpUrl: 'https://images.example/player.png'
    });
    expect(castleProfileIdentityReady({
      canonicalUsername: 'player-fallback',
      communityStatsVisible: false
    })).toBe(true);
    expect(castleProfileIdentityReady({
      displayName: 'Display Name Only',
      communityStatsVisible: false
    })).toBe(false);
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

  it('attempts every castle in the bounded 100-castle presentation budget', () => {
    const castles = Array.from({ length: CASTLE_LABEL_LAYOUT_MAX_CASTLES }, (_, index) => ({
      castleId: index + 1,
      q: index,
      r: 0,
      x: 100 + (index % 25) * 150,
      y: 70 + Math.floor(index / 25) * 70,
      distance: index + 1,
      visible: true
    }));

    const resolved = resolveVisibleCastleLabels({ width: 3_850, height: 360, castles }, 1, 100);

    expect(resolved).toHaveLength(CASTLE_LABEL_LAYOUT_MAX_CASTLES);
    expect(resolved.every((castle) => (
      castle.projectedAnchor.x === castles[castle.castleId - 1]?.x
      && castle.projectedAnchor.y === castles[castle.castleId - 1]?.y
    ))).toBe(true);
  });

  it('retains selected/own identity with a compact roof-attached fallback', () => {
    const castles = Array.from({ length: 100 }, (_, index) => ({
      castleId: index + 1,
      q: index,
      r: 0,
      x: 100 + (index % 10) * 110,
      y: 120 + Math.floor(index / 10) * 48,
      distance: index + 1,
      visible: true
    }));
    // Force own and selected into the same collision cluster. Selected stays
    // full; own retains readable identity in the compact berth above its roof.
    castles[98] = { ...castles[98], x: 240, y: 160, distance: 99 };
    castles[99] = { ...castles[99], x: 240, y: 160, distance: 100 };

    const resolved = resolveVisibleCastleLabels(
      { width: 1_440, height: 900, castles },
      99,
      100
    );

    expect(resolved.some((castle) => castle.castleId === 100)).toBe(true);
    expect(resolved.find((castle) => castle.castleId === 100)?.compact).toBe(false);
    expect(resolved.find((castle) => castle.castleId === 99)).toMatchObject({
      compact: true,
      x: 240,
      y: 110,
      projectedAnchor: { x: 240, y: 160 }
    });
  });

  it('marks only meaningful label displacement for a decorative roof connector', () => {
    expect(realmCastleLabelLeaderGeometry({
      x: 180,
      y: 140,
      projectedAnchor: { x: 180, y: 140 }
    })).toEqual({ displaced: false, length: 0, angleRadians: 0 });
    expect(realmCastleLabelLeaderGeometry({
      x: 180,
      y: 90,
      projectedAnchor: { x: 180, y: 140 }
    })).toMatchObject({
      displaced: true,
      length: 50,
      angleRadians: -Math.PI / 2
    });
  });

  it('permits only small roof-associated nudges into the safe area', () => {
    const resolved = resolveVisibleCastleLabels({
      width: 320,
      height: 300,
      castles: [
        { castleId: 1, q: 0, r: 0, x: 62, y: 120, distance: 0, visible: true },
        { castleId: 2, q: 1, r: 0, x: 258, y: 220, distance: 1, visible: true }
      ]
    }, 1, 2);

    expect(resolved.map((castle) => castle.castleId)).toEqual([2, 1]);
    expect(resolved.find((castle) => castle.castleId === 1)?.x).toBe(70);
    expect(resolved.find((castle) => castle.castleId === 2)?.x).toBe(250);
  });

  it('keeps accepted distant projections as full identity labels', () => {
    const resolved = resolveVisibleCastleLabels({
      width: 800,
      height: 600,
      castles: [{
        castleId: 1,
        q: 0,
        r: 0,
        x: 400,
        y: 230,
        distance: CASTLE_LABEL_FAR_DISTANCE * 10,
        visible: true,
        castleBounds: { left: 390, top: 236, right: 410, bottom: 256 }
      }]
    }, undefined, undefined, 1);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ castleId: 1, compact: false, x: 400, y: 230 });
  });

  it('maps fallback labels through the rendered SVG viewport and its aspect-fit letterbox', () => {
    const projection = fallbackCastleProjection(
      { castleId: 1, q: 0, r: 0 },
      { x: -20, y: -10, width: 40, height: 20 },
      { width: 1_000, height: 600 },
      { left: 200, top: 50, width: 400, height: 400 }
    );

    // A 2:1 viewBox meets inside the 400px square with 100px vertical bars.
    expect(projection.x).toBe(400);
    expect(projection.y).toBe(234);
    expect(projection.castleBounds).toEqual({
      left: 390,
      top: 240,
      right: 410,
      bottom: 260
    });
    expect(projection.conservativeCastleBounds).toEqual(projection.castleBounds);
  });

  it('anchors labels to a calibrated roof while retaining conservative bounds separately', () => {
    const conservative = { left: 360, top: 180, right: 440, bottom: 300 };
    const bounds = resolveCastleLabelOcclusionBounds(conservative, 240);
    expect(bounds).toEqual({ left: 360, top: 240, right: 440, bottom: 300 });
    expect(conservative).toEqual({ left: 360, top: 180, right: 440, bottom: 300 });
    expect(resolveCastleLabelScreenAnchor(bounds, { x: 999, y: 999 })).toEqual({
      x: 400,
      y: 240 - CASTLE_LABEL_GAP_PIXELS
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
    expect(fallback.y).toBe(fallback.castleBounds!.top - CASTLE_LABEL_GAP_PIXELS);
    expect(fallback.conservativeCastleBounds).toEqual(fallback.castleBounds);
  });

  it('invalidates projection coalescing when a stationary castle changes distance band', () => {
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

    expect(realmCastleProjectionFrameKey(frame(CASTLE_LABEL_FAR_DISTANCE - 0.01)))
      .not.toBe(realmCastleProjectionFrameKey(frame(CASTLE_LABEL_FAR_DISTANCE + 0.01)));
    expect(realmCastleProjectionFrameKey(frame(10)))
      .not.toBe(realmCastleProjectionFrameKey(frame(10.3)));
    expect(realmCastleProjectionFrameKey({
      ...frame(10),
      castles: frame(10).castles.map((castle) => ({ ...castle, presented: true }))
    })).not.toBe(realmCastleProjectionFrameKey({
      ...frame(10),
      castles: frame(10).castles.map((castle) => ({ ...castle, presented: false }))
    }));
  });
});
