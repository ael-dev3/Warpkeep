import { describe, expect, it } from 'vitest';

import {
  CASTLE_LABEL_MAX_DESKTOP,
  castleProfileLabel,
  fallbackCastleProjection,
  farcasterProfileUrl,
  formatPublicMarkMicros,
  publicProfileForCastle,
  resolveVisibleCastleLabels,
  safeRealmProfileImageUrl,
  sectorForRealmCoord
} from '../src/components/realm/realmCastlePresentation';

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
      fid: 42,
      canonicalUsername: 'alice',
      displayName: 'Alice Keeper',
      communityStatsVisible: false
    });
    expect(castleProfileLabel(profile)).toBe('@alice');
    expect(safeRealmProfileImageUrl(profile.pfpUrl)).toBeUndefined();
    expect(farcasterProfileUrl(profile.canonicalUsername))
      .toBe('https://farcaster.xyz/alice');
  });

  it('accepts credential-free HTTPS portraits and rejects unsafe profile links', () => {
    expect(safeRealmProfileImageUrl('https://images.example/a.png#tracking'))
      .toBe('https://images.example/a.png#tracking');
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

  it('caps and collision-culls labels while retaining selected and own priorities', () => {
    const castles = Array.from({ length: 100 }, (_, index) => ({
      castleId: index + 1,
      q: index,
      r: 0,
      x: 100 + (index % 10) * 110,
      y: 120 + Math.floor(index / 10) * 48,
      distance: index + 1,
      visible: true
    }));
    // Force own and selected into the same initial collision cluster. Priority
    // labels are shifted before ordinary records are culled.
    castles[98] = { ...castles[98], x: 240, y: 160, distance: 99 };
    castles[99] = { ...castles[99], x: 240, y: 160, distance: 100 };

    const resolved = resolveVisibleCastleLabels(
      { width: 1_440, height: 900, castles },
      99,
      100
    );

    expect(resolved.length).toBeLessThanOrEqual(CASTLE_LABEL_MAX_DESKTOP);
    expect(resolved.some((castle) => castle.castleId === 99)).toBe(true);
    expect(resolved.some((castle) => castle.castleId === 100)).toBe(true);
    expect(resolved.find((castle) => castle.castleId === 99)?.y)
      .not.toBe(resolved.find((castle) => castle.castleId === 100)?.y);
  });

  it('clamps selected and own labels into the horizontal safe area', () => {
    const resolved = resolveVisibleCastleLabels({
      width: 320,
      height: 300,
      castles: [
        { castleId: 1, q: 0, r: 0, x: 2, y: 120, distance: 0, visible: true },
        { castleId: 2, q: 1, r: 0, x: 318, y: 220, distance: 1, visible: true }
      ]
    }, 1, 2);

    expect(resolved.map((castle) => castle.castleId)).toEqual([2, 1]);
    expect(resolved.find((castle) => castle.castleId === 1)?.x).toBe(70);
    expect(resolved.find((castle) => castle.castleId === 2)?.x).toBe(250);
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
    expect(projection.y).toBe(250);
  });
});
