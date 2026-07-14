import { describe, expect, it } from 'vitest';

import {
  resolveCastleLabelOcclusionBounds,
  resolveCastleLabelScreenAnchor
} from '../src/components/realm/createRealmScene';
import {
  CASTLE_LABEL_FAR_DISTANCE,
  CASTLE_LABEL_GAP_PIXELS,
  CASTLE_LABEL_MAX_DESKTOP,
  castleProfileLabel,
  fallbackCastleProjection,
  farcasterProfileUrl,
  formatPublicMarkMicros,
  publicProfileForCastle,
  realmCastleProjectionFrameKey,
  resolveVisibleCastleLabels,
  safeRealmProfileImageUrl,
  sectorForRealmCoord
} from '../src/components/realm/realmCastlePresentation';
import type { WarpkeepRealmProfile } from '../src/spacetime/warpkeepBackendTypes';

describe('realm castle public presentation', () => {
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

  it('caps and collision-culls labels without detaching a lower-priority collision', () => {
    const castles = Array.from({ length: 100 }, (_, index) => ({
      castleId: index + 1,
      q: index,
      r: 0,
      x: 100 + (index % 10) * 110,
      y: 120 + Math.floor(index / 10) * 48,
      distance: index + 1,
      visible: true
    }));
    // Force own and selected into the same initial collision cluster. Selected
    // wins deterministically; own is culled instead of floating elsewhere.
    castles[98] = { ...castles[98], x: 240, y: 160, distance: 99 };
    castles[99] = { ...castles[99], x: 240, y: 160, distance: 100 };

    const resolved = resolveVisibleCastleLabels(
      { width: 1_440, height: 900, castles },
      99,
      100
    );

    expect(resolved.length).toBeLessThanOrEqual(CASTLE_LABEL_MAX_DESKTOP);
    expect(resolved.some((castle) => castle.castleId === 100)).toBe(true);
    expect(resolved.some((castle) => castle.castleId === 99)).toBe(false);
    expect(resolved.every((castle) => castle.compact === false)).toBe(true);
  });

  it('permits only a small selected or own nudge into the safe area', () => {
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
  });
});
