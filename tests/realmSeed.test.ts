import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_GENESIS_001,
  deriveChannelSeed,
  hashSeedString,
  seededUnitFloat
} from '../src/game/map/realmSeed';

describe('realm seeds', () => {
  it('hashes named seeds deterministically into unsigned 32-bit integers', () => {
    const first = hashSeedString(HEGEMONY_GENESIS_001);
    const second = hashSeedString(HEGEMONY_GENESIS_001);
    const different = hashSeedString('HEGEMONY_GENESIS_002');

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0xffff_ffff);
    expect(different).not.toBe(first);
  });

  it('derives stable independent channels and unit floats without Math.random', () => {
    const seed = hashSeedString(HEGEMONY_GENESIS_001);
    const terrain = deriveChannelSeed(seed, 1, -2, 'terrain', 0);
    const soil = deriveChannelSeed(seed, 1, -2, 'soil', 0);

    expect(terrain).toBe(deriveChannelSeed(seed, 1, -2, 'terrain', 0));
    expect(terrain).not.toBe(soil);
    expect(seededUnitFloat(terrain)).toBeGreaterThanOrEqual(0);
    expect(seededUnitFloat(terrain)).toBeLessThan(1);
  });
});
